import json
import logging
import os
from typing import Any, Dict, Optional, Tuple

import numpy as np
from fastapi import WebSocket, WebSocketDisconnect

from api.routers.auth import DISABLE_AUTH, decode_token
from core.session_manager import session_manager
from data.loaders import auto_detect_graph
from database import SessionLocal, redis_client
from models.sql_models import User
from schemas.constants import ErrorCode
from services.hybrid_store import blob_store
from tasks.community_detection import run_community_detection
from tasks.graph_classification import run_graph_classification
from tasks.graph_embedding import run_graph_embedding
from tasks.graph_generation import run_graph_generation
from tasks.link_prediction import run_link_prediction
from tasks.node_classification import run_node_classification
from utils.data_utils import get_data_from_config
from utils.model_utils import build_model
from utils.ws_msg import SequenceCounter, send_json_zipped

logger = logging.getLogger(__name__)

import pickle

HAS_TORCH = True
try:
    import torch
except ImportError:
    HAS_TORCH = False
    torch = None


def build_graph_json_flexible(data):
    edge_index = data.edge_index.cpu().numpy()
    num_nodes = data.num_nodes or (
        data.x.size(0) if hasattr(data, "x") and data.x is not None else edge_index.max() + 1
    )
    degrees = np.zeros(num_nodes)
    links = []

    for i in range(edge_index.shape[1]):
        src, tgt = int(edge_index[0, i]), int(edge_index[1, i])
        if src < tgt:
            links.append({"source": src, "target": tgt})
        degrees[src] += 1

    has_labels = hasattr(data, "y") and data.y is not None and data.y.max().item() > 0
    has_mask = hasattr(data, "train_mask") and data.train_mask is not None

    nodes = [
        {
            "id": i,
            "degree": int(degrees[i]),
            "groundTruth": int(data.y[i].item()) if has_labels else 0,
            "inTrainSet": bool(data.train_mask[i].item()) if has_mask else True,
        }
        for i in range(num_nodes)
    ]

    return {"nodes": nodes, "links": links}


def _strip_auth_fields(config: Dict[str, Any]) -> Dict[str, Any]:
    sanitized = dict(config)
    sanitized.pop("auth_token", None)
    sanitized.pop("access_token", None)
    sanitized.pop("token", None)
    return sanitized


def resolve_ws_user(config: Dict[str, Any]) -> Optional[User]:
    if DISABLE_AUTH:
        return None

    token = config.get("auth_token") or config.get("access_token") or config.get("token")
    if not token:
        raise PermissionError("Not authenticated for live training")

    payload = decode_token(token)
    user_id = payload.get("sub") if payload else None
    if not user_id:
        raise PermissionError("Invalid auth token for live training")

    db = SessionLocal()
    try:
        user = db.query(User).filter_by(id=int(user_id), is_active=True).first()
    finally:
        db.close()

    if not user:
        raise PermissionError("User not found or inactive for live training")
    if user.role == "viewer":
        raise PermissionError("Viewer accounts cannot start live training")
    return user


def resolve_session_id(config: Dict[str, Any], *, user: Optional[User]) -> str:
    existing_session_id = config.get("session_id")
    session = session_manager.get_session(existing_session_id) if existing_session_id else None
    if session:
        if user and session.get("user_id") not in (None, user.id):
            raise PermissionError("Not allowed to resume this training session")
        return existing_session_id
    return session_manager.create_session(
        config=config,
        task_type=config.get("task", 1),
        model_type=config.get("model", "GCN"),
        dataset_name=config.get("dataset", "cora"),
        user_id=user.id if user else None,
        project_id=config.get("project_id"),
        dataset_version_id=config.get("dataset_version_id"),
    )


async def accept_and_prepare(websocket: WebSocket) -> Tuple[Dict[str, Any], SequenceCounter, str]:
    await websocket.accept()
    seq = SequenceCounter()
    config = await websocket.receive_json()
    user = resolve_ws_user(config)
    config = _strip_auth_fields(config)
    session_id = resolve_session_id(config, user=user)
    config["session_id"] = session_id
    session_manager.sync_runtime_context(session_id, config)
    session_manager.update_status(session_id, "running")
    return config, seq, session_id


def build_snapshot_hook(session_id: str, seq: SequenceCounter):
    async def snapshot_hook(epoch: int, snapshot: dict):
        session_manager.save_snapshot(session_id, epoch, snapshot)
        session_manager.update_epoch(session_id, epoch, seq.current)

    return snapshot_hook


def build_stop_check(session_id: str):
    def stop_check():
        return session_manager.is_stopped(session_id)

    return stop_check


async def send_training_complete(websocket: WebSocket, *, seq: SequenceCounter, session_id: str, epoch_snapshots: list):
    await send_json_zipped(
        websocket,
        {
            "type": "training_complete",
            "data": {"all_snapshots": epoch_snapshots, "session_id": session_id},
        },
        seq_counter=seq,
    )


async def finalize_task_run(
    websocket: WebSocket,
    *,
    seq: SequenceCounter,
    session_id: str,
    stop_check,
    epoch_snapshots: list,
):
    status = "stopped" if stop_check() else "completed"
    session_manager.update_status(session_id, status)
    await send_training_complete(websocket, seq=seq, session_id=session_id, epoch_snapshots=epoch_snapshots)


async def send_graph_payload(websocket: WebSocket, *, seq: SequenceCounter, graph_json: dict, ground_truth=None, class_names=None):
    payload = {
        "graphData": graph_json,
        "groundTruth": ground_truth or [],
    }
    if class_names is not None:
        payload["classNames"] = class_names
    await send_json_zipped(websocket, {"type": "graph_data", "data": payload}, seq_counter=seq)


async def run_graph_classification_task(websocket, *, config, seq, session_id, stop_check, snapshot_hook):
    data = get_data_from_config(config)
    custom_graphs = data if isinstance(data, list) else None
    epoch_snapshots = await run_graph_classification(
        config, websocket, stop_check, custom_graphs=custom_graphs, snapshot_hook=snapshot_hook
    )
    await finalize_task_run(websocket, seq=seq, session_id=session_id, stop_check=stop_check, epoch_snapshots=epoch_snapshots)


async def run_link_prediction_task(websocket, *, config, seq, session_id, stop_check, snapshot_hook):
    data = get_data_from_config(config)
    if isinstance(data, list):
        data = data[0]
    if config.get("uploaded_file_path"):
        data, _ = auto_detect_graph(data)

    config["edge_split_ratio"] = config.get("edge_split_ratio", 0.15)
    epoch_snapshots = await run_link_prediction(
        config,
        data,
        config.get("model", "GCN"),
        websocket,
        stop_check,
        snapshot_hook=snapshot_hook,
    )
    await finalize_task_run(websocket, seq=seq, session_id=session_id, stop_check=stop_check, epoch_snapshots=epoch_snapshots)


async def run_community_detection_task(websocket, *, config, seq, session_id, stop_check, snapshot_hook):
    data = get_data_from_config(config)
    if isinstance(data, list):
        data = data[0]
    if config.get("uploaded_file_path"):
        data, _ = auto_detect_graph(data)

    has_community_gt = config.get("has_community_gt", False)
    # Auto-detect: built-in datasets (Karate, Cora, CitSeer) have meaningful labels in data.y
    if not has_community_gt and hasattr(data, "y") and data.y is not None:
        unique_labels = data.y.unique()
        if len(unique_labels) > 1:
            has_community_gt = True
    epoch_snapshots = await run_community_detection(
        config,
        data,
        config.get("model", "GCN"),
        websocket,
        stop_check,
        num_communities=config.get("num_communities", 4),
        community_gt=data.y.cpu().tolist()
        if has_community_gt and hasattr(data, "y") and data.y is not None
        else None,
        snapshot_hook=snapshot_hook,
    )
    await finalize_task_run(websocket, seq=seq, session_id=session_id, stop_check=stop_check, epoch_snapshots=epoch_snapshots)


async def run_graph_embedding_task(websocket, *, config, seq, session_id, stop_check, snapshot_hook):
    data = get_data_from_config(config)
    if isinstance(data, list):
        data = data[0]
    data, graph_meta = auto_detect_graph(data)

    await send_json_zipped(websocket, {"type": "graph_metadata", "data": graph_meta}, seq_counter=seq)
    graph_json = resolve_node_graph_json(config, data)
    await send_node_graph_data(websocket, seq=seq, graph_json=graph_json, data=data)

    epoch_snapshots, final_embeddings = await run_graph_embedding(
        config,
        data,
        config.get("model", "GCN"),
        websocket,
        stop_check,
        snapshot_hook=snapshot_hook,
    )
    try:
        redis_client.set(f"last_embeddings_{session_id}", pickle.dumps(final_embeddings), ex=3600)
    except Exception:
        pass

    await finalize_task_run(websocket, seq=seq, session_id=session_id, stop_check=stop_check, epoch_snapshots=epoch_snapshots)


async def run_graph_generation_task(websocket, *, config, seq, session_id, stop_check, snapshot_hook):
    data = get_data_from_config(config)
    if isinstance(data, list):
        data = data[0]
    # Send reference graph data so frontend has it (especially on reconnect)
    graph_json = resolve_node_graph_json(config, data)
    # Extract rich nodes/links (handle both wrapped and flat formats)
    ref_nodes = graph_json.get('graphData', {}).get('nodes', graph_json.get('nodes', []))
    ref_links = graph_json.get('graphData', {}).get('links', graph_json.get('links', []))
    ref_density = float(config.get('reference_density', 0))
    ref_avg_degree = float(config.get('reference_avg_degree', 0))
    await send_json_zipped(websocket, {
        'type': 'graph_data',
        'data': {
            'graphData': graph_json if 'graphData' not in graph_json else graph_json['graphData'],
            'groundTruth': data.y.cpu().tolist() if hasattr(data, 'y') and data.y is not None else [],
            'referenceGraph': {
                'numNodes': int(data.x.size(0)),
                'numEdges': int(data.edge_index.size(1) // 2),
                'density': ref_density,
                'avgDegree': ref_avg_degree,
                'nodes': ref_nodes,
                'links': ref_links,
            },
        },
    }, seq_counter=seq)
    epoch_snapshots = await run_graph_generation(
        config, data, websocket, stop_check, snapshot_hook=snapshot_hook
    )
    await finalize_task_run(websocket, seq=seq, session_id=session_id, stop_check=stop_check, epoch_snapshots=epoch_snapshots)


def prepare_node_classification_data(config: Dict[str, Any]):
    data = get_data_from_config(config)
    if isinstance(data, list):
        data = data[0]
    if config.get("uploaded_file_path"):
        data, _ = auto_detect_graph(data)

    model = build_model(config, data)
    optimizer = torch.optim.Adam(model.parameters(), lr=config.get("lr", 0.01), weight_decay=5e-4)

    if hasattr(data, "y") and data.y is not None:
        num_classes = int(data.y.max().item()) + 1
        if num_classes > 1 and num_classes != 7:
            model = build_model(config, data, num_classes=num_classes)
            optimizer = torch.optim.Adam(model.parameters(), lr=config.get("lr", 0.01))

    return data, model, optimizer


def resolve_node_graph_json(config: Dict[str, Any], data) -> dict:
    graph_json = None
    if config.get("uploaded_file_path"):
        json_path = config.get("uploaded_file_path") + ".json"
        if os.path.exists(json_path):
            try:
                with open(json_path, "r", encoding="utf-8") as handle:
                    graph_json = json.load(handle)
            except Exception:
                graph_json = None
        elif blob_store.exists(json_path):
            try:
                graph_json = blob_store.get_json(json_path)
            except Exception:
                graph_json = None
    if not graph_json:
        graph_json = build_graph_json_flexible(data)
    return graph_json


async def send_node_graph_data(websocket: WebSocket, *, seq: SequenceCounter, graph_json: dict, data):
    if graph_json and isinstance(graph_json, dict) and "graphData" in graph_json:
        await send_json_zipped(
            websocket,
            {
                "type": "graph_data",
                "data": {
                    "graphData": graph_json["graphData"],
                    "groundTruth": graph_json.get("groundTruth", []),
                    "classNames": graph_json.get("classNames", []),
                },
            },
            seq_counter=seq,
        )
        return
    await send_graph_payload(
        websocket,
        seq=seq,
        graph_json=graph_json,
        ground_truth=data.y.cpu().tolist() if hasattr(data, "y") and data.y is not None else [],
    )


async def run_node_classification_task(websocket, *, config, seq, session_id, stop_check, snapshot_hook):
    data, model, optimizer = prepare_node_classification_data(config)
    graph_json = resolve_node_graph_json(config, data)
    await send_node_graph_data(websocket, seq=seq, graph_json=graph_json, data=data)

    epoch_snapshots = await run_node_classification(
        config,
        data,
        model,
        optimizer,
        websocket,
        stop_check,
        snapshot_hook=snapshot_hook,
    )
    await finalize_task_run(websocket, seq=seq, session_id=session_id, stop_check=stop_check, epoch_snapshots=epoch_snapshots)


async def run_task(websocket: WebSocket, *, config: Dict[str, Any], seq: SequenceCounter, session_id: str, stop_check, snapshot_hook):
    if not HAS_TORCH:
        await send_json_zipped(
            websocket,
            {
                "type": "error",
                "data": {
                    "code": ErrorCode.ERR_INTERNAL,
                    "message": "Backend running in API-only mode (No training).",
                    "retriable": False,
                },
            },
            seq_counter=seq,
        )
        session_manager.update_status(session_id, "failed", "PyTorch unavailable")
        return

    task_id = config.get("task", 1)
    if task_id not in [1, 2, 3, 4, 5, 6]:
        raise ValueError(f"Unknown task ID: {task_id}")

    if task_id == 2:
        await run_graph_classification_task(
            websocket, config=config, seq=seq, session_id=session_id, stop_check=stop_check, snapshot_hook=snapshot_hook
        )
        return
    if task_id == 3:
        await run_link_prediction_task(
            websocket, config=config, seq=seq, session_id=session_id, stop_check=stop_check, snapshot_hook=snapshot_hook
        )
        return
    if task_id == 4:
        await run_community_detection_task(
            websocket, config=config, seq=seq, session_id=session_id, stop_check=stop_check, snapshot_hook=snapshot_hook
        )
        return
    if task_id == 5:
        await run_graph_embedding_task(
            websocket, config=config, seq=seq, session_id=session_id, stop_check=stop_check, snapshot_hook=snapshot_hook
        )
        return
    if task_id == 6:
        await run_graph_generation_task(
            websocket, config=config, seq=seq, session_id=session_id, stop_check=stop_check, snapshot_hook=snapshot_hook
        )
        return
    await run_node_classification_task(
        websocket, config=config, seq=seq, session_id=session_id, stop_check=stop_check, snapshot_hook=snapshot_hook
    )


async def handle_training_websocket(websocket: WebSocket):
    seq = None
    session_id = None
    try:
        config, seq, session_id = await accept_and_prepare(websocket)
        snapshot_hook = build_snapshot_hook(session_id, seq)
        stop_check = build_stop_check(session_id)
        await run_task(
            websocket,
            config=config,
            seq=seq,
            session_id=session_id,
            stop_check=stop_check,
            snapshot_hook=snapshot_hook,
        )
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: Session %s", session_id)
    except Exception as exc:
        logger.error("Training error session=%s: %s", session_id, exc, exc_info=True)
        if session_id:
            session_manager.update_status(session_id, "failed", str(exc))
        try:
            await send_json_zipped(
                websocket,
                {
                    "type": "error",
                    "data": {
                        "code": ErrorCode.ERR_TRAINING_FAILED,
                        "message": str(exc),
                        "retriable": True,
                    },
                },
                seq_counter=seq,
            )
        except Exception:
            pass
    finally:
        if session_id:
            session_manager.cleanup_session(session_id)
