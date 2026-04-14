import asyncio
import json
import os
import traceback
import numpy as np
import sys
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from api.user_loader import router as user_loader_router
from api.experiments import router as experiments_router
from database import init_db

try:
    import torch
    import torch.nn.functional as F
    from sklearn.decomposition import PCA
    from models.gcn import GCNModel
    from models.gat import GATModel
    from models.graphsage import GraphSAGEModel
    from data.loaders import load_cora, load_citeseer, load_csv, load_custom_graph, auto_detect_graph, get_available_datasets
    from tasks.node_classification import run_node_classification
    from tasks.graph_classification import run_graph_classification
    from tasks.link_prediction import run_link_prediction
    from tasks.community_detection import run_community_detection
    from tasks.graph_embedding import run_graph_embedding
    from tasks.graph_generation import run_graph_generation

    HAS_TORCH = True
except ImportError as e:
    HAS_TORCH = False
    print(f"Warning: ML modules not found ({e}). Running in API-only mode (No training/PyTorch).", file=sys.stderr)

app = FastAPI(title="GNN-Insight Backend")

@app.get("/")
def read_root():
    return {"message": "Welcome to the GNN-Insight Backend API! The server is running successfully."}

@app.on_event("startup")
def on_startup():
    init_db()

app.include_router(user_loader_router, prefix="/api")
app.include_router(experiments_router, prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from database import redis_client
import pickle

# Global stop flag
_stop_training = False


def stop_flag():
    return _stop_training


def build_model(config, data=None, num_features=None, num_classes=None):
    model_type = config.get('model', 'GCN')
    hidden = config.get('hidden', 64)
    dropout = config.get('dropout', 0.5)
    
    if data is not None:
        num_features = data.x.size(1)
        num_classes = max(2, int(data.y.max().item()) + 1)
    elif num_features is None or num_classes is None:
        # Default fallback for Cora
        num_features = 1433
        num_classes = 7

    if model_type == 'GCN':
        return GCNModel(num_features, hidden, num_classes, dropout)
    elif model_type == 'GAT':
        heads = config.get('heads', 4)
        return GATModel(num_features, hidden, num_classes, heads, dropout)
    elif model_type == 'SAGE':
        return GraphSAGEModel(num_features, hidden, num_classes, dropout)
    else:
        return GCNModel(num_features, hidden, num_classes, dropout)


def load_dataset(name):
    if name == 'cora':
        return load_cora()
    elif name == 'citeseer':
        return load_citeseer()
    else:
        return load_cora()


def get_data_from_config(config):
    uploaded_path = config.get('uploaded_file_path')
    if uploaded_path and os.path.exists(uploaded_path):
        return load_custom_graph(uploaded_path)
    dataset_name = config.get('dataset', 'cora')
    return load_dataset(dataset_name)


def build_graph_json(data):
    """Convert PyG data to JSON-serializable graph structure."""
    edge_index = data.edge_index.cpu().numpy()
    num_nodes = data.x.size(0)
    degrees = np.zeros(num_nodes)
    links = []

    for i in range(edge_index.shape[1]):
        src, tgt = int(edge_index[0, i]), int(edge_index[1, i])
        if src < tgt:
            links.append({'source': src, 'target': tgt})
        degrees[src] += 1

    nodes = [{
        'id': i,
        'degree': int(degrees[i]),
        'groundTruth': int(data.y[i].item()),
        'inTrainSet': bool(data.train_mask[i].item()),
    } for i in range(num_nodes)]

    return {'nodes': nodes, 'links': links}


@app.websocket("/ws/train")
async def train_websocket(websocket: WebSocket):
    global _stop_training
    await websocket.accept()

    try:
        config = await websocket.receive_json()
        _stop_training = False

        if not HAS_TORCH:
            await websocket.send_json({
                'type': 'error',
                'message': 'Backend is running in lightweight API mode (PyTorch not installed). Real training disabled.'
            })
            return

        task_id = config.get('task', 1)

        # ── Task 2: Graph Classification ───────────────────────────────────
        if task_id == 2:
            epoch_snapshots = await run_graph_classification(config, websocket, stop_flag)
            await websocket.send_json({
                'type': 'training_complete',
                'all_snapshots': epoch_snapshots,
            })
            return

        # ── Task 3: Link Prediction ────────────────────────────────────────
        if task_id == 3:
            data = get_data_from_config(config)
            model_type = config.get('model', 'GCN')
            epoch_snapshots = await run_link_prediction(
                config, data, model_type, websocket, stop_flag
            )
            await websocket.send_json({
                'type': 'training_complete',
                'all_snapshots': epoch_snapshots,
            })
            return

        # ── Task 4: Community Detection ────────────────────────────────────
        if task_id == 4:
            data = get_data_from_config(config)
            model_type = config.get('model', 'GCN')
            epoch_snapshots = await run_community_detection(
                config, data, model_type, websocket, stop_flag
            )
            await websocket.send_json({
                'type': 'training_complete',
                'all_snapshots': epoch_snapshots,
            })
            return

        # ── Task 5: Graph Embedding (Unsupervised) ──────────────────────────
        if task_id == 5:
            data = get_data_from_config(config)

            # Auto-detect graph properties
            data, graph_meta = auto_detect_graph(data)
            model_type = config.get('model', 'GCN')

            # Send graph metadata to frontend
            await websocket.send_json({
                'type': 'graph_metadata',
                'data': graph_meta,
            })

            # Send graph structure
            graph_json = build_graph_json_flexible(data)
            await websocket.send_json({
                'type': 'graph_data',
                'data': {
                    'graphData': graph_json,
                    'groundTruth': data.y.cpu().tolist() if hasattr(data, 'y') and data.y is not None else [],
                },
            })

            epoch_snapshots, final_embeddings = await run_graph_embedding(
                config, data, model_type, websocket, stop_flag
            )

            # Save for export
            try:
                redis_client.set('last_embeddings_task5', pickle.dumps(final_embeddings))
            except: pass

            await websocket.send_json({
                'type': 'training_complete',
                'all_snapshots': epoch_snapshots,
            })
            return

        if task_id == 6:
            data = get_data_from_config(config)
            epoch_snapshots = await run_graph_generation(
                config, data, websocket, stop_flag
            )
            await websocket.send_json({
                'type': 'training_complete',
                'all_snapshots': epoch_snapshots,
            })
            return

        # ── Task 1 (default): Node Classification ─────────────────────────
        data = get_data_from_config(config)
        model = build_model(config, data)
        optimizer = torch.optim.Adam(
            model.parameters(),
            lr=config.get('lr', 0.01),
            weight_decay=5e-4,
        )

        # Send graph structure to frontend
        graph_json = build_graph_json(data)
        await websocket.send_json({
            'type': 'graph_data',
            'data': {
                'graphData': graph_json,
                'groundTruth': data.y.cpu().tolist(),
            },
        })

        epoch_snapshots = await run_node_classification(
            config, data, model, optimizer, websocket, stop_flag
        )

        # ── Save model for inductive prediction ───────────────────────────
        model_info = {
            'state_dict': model.state_dict(),
            'config': config,
            'num_features': data.x.size(1),
            'num_classes': int(data.y.max().item()) + 1
        }
        try:
            redis_client.set('model_node_classification', pickle.dumps(model_info))
        except Exception as e:
            print(f"Redis cache model info failed: {e}")

        await websocket.send_json({
            'type': 'training_complete',
            'all_snapshots': epoch_snapshots,
        })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({
                'type': 'error',
                'message': str(e),
                'traceback': traceback.format_exc(),
            })
        except Exception:
            pass


@app.get("/api/datasets")
def list_datasets():
    if not HAS_TORCH: return ["Mock Data"]
    return get_available_datasets()


@app.post("/api/stop")
def stop_current_training():
    global _stop_training
    _stop_training = True
    return {"status": "stopping"}


def build_graph_json_flexible(data):
    """Convert PyG data to JSON, handling missing labels/masks gracefully."""
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


@app.post("/api/upload-graph")
async def upload_graph(file: UploadFile = File(...)):
    """Upload a single graph file (.csv, .json, .pt). Returns auto-detected metadata."""
    import tempfile
    import os

    if not HAS_TORCH:
        return {"error": "PyTorch is not installed"}

    # Save to temp file
    suffix = os.path.splitext(file.filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=os.path.join(os.path.dirname(__file__), 'datasets')) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        data = load_custom_graph(tmp_path)
        data, metadata = auto_detect_graph(data)
        # Keep the temp file path for training metadata
        metadata['file_path'] = tmp_path
        metadata['filename'] = file.filename
        return metadata
    except Exception as e:
        os.unlink(tmp_path)
        return {"error": str(e)}


@app.get("/api/export-embedding/{fmt}")
async def export_embedding(fmt: str):
    """Export last trained embedding as .npy, .csv, or .json"""
    import io
    embeddings = None
    try:
        raw = redis_client.get('last_embeddings_task5')
        if raw: embeddings = pickle.loads(raw)
    except: pass
    
    if embeddings is None:
        return {"error": "No embeddings available. Train Task 5 first."}

    if fmt == 'npy':
        buffer = io.BytesIO()
        np.save(buffer, embeddings)
        buffer.seek(0)
        return StreamingResponse(
            buffer,
            media_type='application/octet-stream',
            headers={'Content-Disposition': 'attachment; filename=embedding.npy'}
        )
    elif fmt == 'csv':
        import pandas as pd
        df = pd.DataFrame(embeddings, columns=[f'dim_{i}' for i in range(embeddings.shape[1])])
        buffer = io.StringIO()
        df.to_csv(buffer, index=True, index_label='node_id')
        buffer.seek(0)
        return StreamingResponse(
            io.BytesIO(buffer.getvalue().encode()),
            media_type='text/csv',
            headers={'Content-Disposition': 'attachment; filename=embedding.csv'}
        )
    elif fmt == 'json':
        result = {
            'num_nodes': embeddings.shape[0],
            'embedding_dim': embeddings.shape[1],
            'embeddings': embeddings.tolist(),
        }
        return result
    else:
        return {"error": f"Unsupported format: {fmt}. Use npy, csv, or json."}



@app.post("/api/upload")
async def upload_csv(nodes: UploadFile = File(...), edges: UploadFile = File(...)):
    import tempfile
    import os

    with tempfile.TemporaryDirectory() as tmpdir:
        nodes_path = os.path.join(tmpdir, 'nodes.csv')
        edges_path = os.path.join(tmpdir, 'edges.csv')

        with open(nodes_path, 'wb') as f:
            f.write(await nodes.read())
        with open(edges_path, 'wb') as f:
            f.write(await edges.read())

        if not HAS_TORCH:
            return {"error": "PyTorch is not installed in the backend"}

        data = load_csv(nodes_path, edges_path)
        return {
            'num_nodes': data.x.size(0),
            'num_edges': data.edge_index.size(1),
            'num_features': data.x.size(1),
            'num_classes': int(data.y.max().item()) + 1,
        }


@app.post("/api/inductive-predict")
async def inductive_predict(payload: dict):
    """
    Real inductive prediction for a new node.
    Uses weights from the last trained model in the current session via Redis.
    """
    features = payload.get('features', [])
    model_info = None
    try:
        raw = redis_client.get('model_node_classification')
        if raw:
            model_info = pickle.loads(raw)
    except Exception:
        pass

    if not model_info or not HAS_TORCH:
        # Fallback to random if no model trained yet
        import random
        num_classes = model_info.get('num_classes', 7) if model_info else 7
        probs = [random.random() for _ in range(num_classes)]
        total = sum(probs)
        probs = [p / total for p in probs]
        return {
            'predicted_class': probs.index(max(probs)),
            'probabilities': probs,
            'is_mock': True
        }

    # Prepare features
    x = torch.tensor([features], dtype=torch.float)
    
    # Reconstruct model
    config = model_info['config']
    model = build_model(
        config, 
        num_features=model_info['num_features'], 
        num_classes=model_info['num_classes']
    )
    model.load_state_dict(model_info['state_dict'])
    model.eval()

    with torch.no_grad():
        # For inductive prediction of a single isolated node:
        # We simulate the edge_index as a self-loop since we don't have neighbor info
        # in this simple CSV upload demo for single node prediction.
        edge_index = torch.tensor([[0], [0]], dtype=torch.long)
        logits, _ = model(x, edge_index)
        probs = F.softmax(logits, dim=1).squeeze().tolist()
        pred = int(logits.argmax(dim=1).item())

    return {
        'predicted_class': pred,
        'probabilities': probs,
        'is_mock': False
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

