import asyncio
import json
import traceback
import logging
import numpy as np
import torch
import torch.nn.functional as F
import pickle
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from core.session_manager import session_manager
from utils.model_utils import build_model
from utils.data_utils import get_data_from_config
from utils.ws_msg import send_json_zipped, SequenceCounter
from database import redis_client, mongo_available
from data.loaders import auto_detect_graph
from schemas.constants import ErrorCode

logger = logging.getLogger(__name__)

# Import training tasks
from tasks.node_classification import run_node_classification
from tasks.graph_classification import run_graph_classification
from tasks.link_prediction import run_link_prediction
from tasks.community_detection import run_community_detection
from tasks.graph_embedding import run_graph_embedding
from tasks.graph_generation import run_graph_generation

router = APIRouter()

# Kiểm tra xem có PyTorch không
HAS_TORCH = True
try:
    import torch
except ImportError:
    HAS_TORCH = False

def build_graph_json_flexible(data):
    """Chuyển đổi PyG data sang JSON, xử lý các trường hợp thiếu labels/masks."""
    edge_index = data.edge_index.cpu().numpy()
    num_nodes = data.num_nodes or (data.x.size(0) if hasattr(data, 'x') and data.x is not None else edge_index.max() + 1)
    degrees = np.zeros(num_nodes)
    links = []

    for i in range(edge_index.shape[1]):
        src, tgt = int(edge_index[0, i]), int(edge_index[1, i])
        if src < tgt:
            links.append({'source': src, 'target': tgt})
        degrees[src] += 1

    has_labels = hasattr(data, 'y') and data.y is not None and data.y.max().item() > 0
    has_mask = hasattr(data, 'train_mask') and data.train_mask is not None

    nodes = [{
        'id': i,
        'degree': int(degrees[i]),
        'groundTruth': int(data.y[i].item()) if has_labels else 0,
        'inTrainSet': bool(data.train_mask[i].item()) if has_mask else True,
    } for i in range(num_nodes)]

    return {'nodes': nodes, 'links': links}

@router.websocket("/ws/train")
async def train_websocket(websocket: WebSocket):
    await websocket.accept()
    session_id = session_manager.create_session()
    seq = SequenceCounter()  # v3 envelope sequence counter

    try:
        config = await websocket.receive_json()
        
        # Stop flag callback dành riêng cho session này
        def stop_check():
            return session_manager.is_stopped(session_id)

        if not HAS_TORCH:
            await send_json_zipped(websocket, {
                'type': 'error',
                'data': {
                    'code': ErrorCode.ERR_INTERNAL,
                    'message': 'Backend running in API-only mode (No training).',
                    'retriable': False,
                },
            }, seq_counter=seq)
            return

        task_id = config.get('task', 1)
        if task_id not in [1, 2, 3, 4, 5, 6]:
            raise ValueError(f"Unknown task ID: {task_id}")

        # ── Task 2: Graph Classification ───────────────────────────────────
        if task_id == 2:
            data = get_data_from_config(config)
            custom_graphs = data if isinstance(data, list) else None
            epoch_snapshots = await run_graph_classification(
                config, websocket, stop_check, custom_graphs=custom_graphs
            )
            await send_json_zipped(websocket, {
                'type': 'training_complete',
                'data': {'all_snapshots': epoch_snapshots, 'session_id': session_id},
            }, seq_counter=seq)
            return

        # ── Task 3: Link Prediction ────────────────────────────────────────
        if task_id == 3:
            data = get_data_from_config(config)
            if isinstance(data, list): data = data[0]
            if config.get('uploaded_file_path'): data, _ = auto_detect_graph(data)

            graph_json = build_graph_json_flexible(data)
            await send_json_zipped(websocket, {
                'type': 'graph_data',
                'data': {
                    'graphData': graph_json,
                    'groundTruth': data.y.cpu().tolist() if hasattr(data, 'y') and data.y is not None else [],
                },
            }, seq_counter=seq)

            model_type = config.get('model', 'GCN')
            config['edge_split_ratio'] = config.get('edge_split_ratio', 0.15)
            epoch_snapshots = await run_link_prediction(
                config, data, model_type, websocket, stop_check
            )
            await send_json_zipped(websocket, {
                'type': 'training_complete',
                'data': {'all_snapshots': epoch_snapshots, 'session_id': session_id},
            }, seq_counter=seq)
            return

        # ── Task 4: Community Detection ────────────────────────────────────
        if task_id == 4:
            data = get_data_from_config(config)
            if isinstance(data, list): data = data[0]
            if config.get('uploaded_file_path'): data, _ = auto_detect_graph(data)

            graph_json = build_graph_json_flexible(data)
            await send_json_zipped(websocket, {
                'type': 'graph_data',
                'data': {
                    'graphData': graph_json,
                    'groundTruth': data.y.cpu().tolist() if hasattr(data, 'y') and data.y is not None else [],
                },
            }, seq_counter=seq)

            model_type = config.get('model', 'GCN')
            num_communities = config.get('num_communities', 4)
            has_community_gt = config.get('has_community_gt', False)
            epoch_snapshots = await run_community_detection(
                config, data, model_type, websocket, stop_check,
                num_communities=num_communities,
                community_gt=data.y.cpu().tolist() if has_community_gt and hasattr(data, 'y') and data.y is not None else None,
            )
            await send_json_zipped(websocket, {
                'type': 'training_complete',
                'data': {'all_snapshots': epoch_snapshots, 'session_id': session_id},
            }, seq_counter=seq)
            return

        # ── Task 5: Graph Embedding ────────────────────────────────────────
        if task_id == 5:
            data = get_data_from_config(config)
            if isinstance(data, list): data = data[0]
            data, graph_meta = auto_detect_graph(data)
            model_type = config.get('model', 'GCN')

            await send_json_zipped(websocket, {'type': 'graph_metadata', 'data': graph_meta}, seq_counter=seq)
            graph_json = build_graph_json_flexible(data)
            await send_json_zipped(websocket, {
                'type': 'graph_data',
                'data': {
                    'graphData': graph_json,
                    'groundTruth': data.y.cpu().tolist() if hasattr(data, 'y') and data.y is not None else [],
                },
            }, seq_counter=seq)

            epoch_snapshots, final_embeddings = await run_graph_embedding(
                config, data, model_type, websocket, stop_check
            )
            try:
                redis_client.set(f'last_embeddings_{session_id}', pickle.dumps(final_embeddings))
            except: pass

            await send_json_zipped(websocket, {
                'type': 'training_complete',
                'data': {'all_snapshots': epoch_snapshots, 'session_id': session_id},
            }, seq_counter=seq)
            return

        # ── Task 6: Graph Generation ───────────────────────────────────────
        if task_id == 6:
            data = get_data_from_config(config)
            if isinstance(data, list): data = data[0]
            epoch_snapshots = await run_graph_generation(
                config, data, websocket, stop_check
            )
            await send_json_zipped(websocket, {
                'type': 'training_complete',
                'data': {'all_snapshots': epoch_snapshots, 'session_id': session_id},
            }, seq_counter=seq)
            return

        # ── Task 1: Node Classification ────────────────────────────────────
        data = get_data_from_config(config)
        if isinstance(data, list): data = data[0]
        if config.get('uploaded_file_path'): data, _ = auto_detect_graph(data)

        model = build_model(config, data)
        optimizer = torch.optim.Adam(model.parameters(), lr=config.get('lr', 0.01), weight_decay=5e-4)

        if hasattr(data, 'y') and data.y is not None:
            num_classes = int(data.y.max().item()) + 1
            if num_classes > 1 and num_classes != 7:
                model = build_model(config, data, num_classes=num_classes)
                optimizer = torch.optim.Adam(model.parameters(), lr=config.get('lr', 0.01))

        import os, json
        graph_json = None
        if config.get('uploaded_file_path'):
            json_path = config.get('uploaded_file_path') + ".json"
            if os.path.exists(json_path):
                try:
                    with open(json_path, 'r') as f:
                        graph_json = json.load(f)
                except:
                    pass
        
        if not graph_json:
            graph_json = build_graph_json_flexible(data)

        if graph_json and isinstance(graph_json, dict) and 'graphData' in graph_json:
            # Rich format from TaskAdapters
            await send_json_zipped(websocket, {
                'type': 'graph_data',
                'data': {
                    'graphData': graph_json['graphData'],
                    'groundTruth': graph_json.get('groundTruth', []),
                    'classNames': graph_json.get('classNames', [])
                },
            }, seq_counter=seq)
        else:
            # Standard format from build_graph_json_flexible
            await send_json_zipped(websocket, {
                'type': 'graph_data',
                'data': {
                    'graphData': graph_json,
                    'groundTruth': data.y.cpu().tolist() if hasattr(data, 'y') and data.y is not None else [],
                },
            }, seq_counter=seq)

        epoch_snapshots = await run_node_classification(
            config, data, model, optimizer, websocket, stop_check
        )

        await send_json_zipped(websocket, {
            'type': 'training_complete',
            'data': {'all_snapshots': epoch_snapshots, 'session_id': session_id},
        }, seq_counter=seq)

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: Session {session_id}")
    except Exception as e:
        # Log full traceback internally, send structured error to FE (no traceback leak)
        logger.error(f"Training error session={session_id}: {e}", exc_info=True)
        try:
            await send_json_zipped(websocket, {
                'type': 'error',
                'data': {
                    'code': ErrorCode.ERR_TRAINING_FAILED,
                    'message': str(e),
                    'retriable': True,
                },
            }, seq_counter=seq)
        except Exception:
            pass  # WS may already be closed
    finally:
        session_manager.cleanup_session(session_id)
