import sys
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
import pickle
import tempfile

# Thêm đường dẫn gốc vào python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import init_db, redis_client
from api.user_loader import router as user_loader_router
from api.experiments import router as experiments_router
from api.routers.training_router import router as training_router
from api.routers.sessions import router as sessions_router
from api.routers.auth import router as auth_router
from core.session_manager import session_manager
from core.logging_config import setup_logging
from core.metrics import metrics
from utils.data_utils import load_csv, load_custom_graph
from data.loaders import auto_detect_graph, get_available_datasets

# Kiểm tra PyTorch
try:
    import torch
    import torch.nn.functional as F
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: structured logging + database
    setup_logging()
    init_db()
    yield
    # Shutdown

app = FastAPI(title="GNN-Insight API v3", lifespan=lifespan)

# Middlewares
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Mở rộng để deploy dễ dàng hơn, có thể siết lại sau
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gắn các Routers
app.include_router(user_loader_router, prefix="/api")
app.include_router(experiments_router, prefix="/api")
app.include_router(sessions_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(training_router) # WebSocket router

# ── REST API Endpoints (Gọn nhẹ) ─────────────────────────────────────────────

@app.get("/")
def read_root():
    return {
        "status": "online",
        "version": "3.0.0",
        "message": "GNN-Insight Backend Unified Architecture is running."
    }

@app.get("/api/datasets")
def list_datasets():
    if not HAS_TORCH: return ["Mock Data"]
    return get_available_datasets()

@app.post("/api/stop")
def stop_training(payload: dict = None):
    """Dừng một phiên training cụ thể hoặc toàn bộ (fallback)."""
    if payload is None:
        payload = {}
    session_id = payload.get("session_id")
    if session_id:
        session_manager.stop_session(session_id)
        return {"status": "stopping", "session_id": session_id}
    else:
        # Fallback: stop all active sessions in RAM
        for sid in list(session_manager._active_sessions.keys()):
            session_manager.stop_session(sid)
        return {"status": "stopping_all"}

@app.post("/api/upload-graph")
async def upload_graph(file: UploadFile = File(...)):
    if not HAS_TORCH: return {"error": "PyTorch not installed"}
    suffix = os.path.splitext(file.filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=os.path.join(os.path.dirname(__file__), 'datasets')) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    try:
        data = load_custom_graph(tmp_path)
        data, metadata = auto_detect_graph(data)
        metadata['file_path'] = tmp_path
        metadata['filename'] = file.filename
        return metadata
    except Exception as e:
        if os.path.exists(tmp_path): os.unlink(tmp_path)
        return {"error": str(e)}

@app.post("/api/upload")
async def upload_csv(nodes: UploadFile = File(...), edges: UploadFile = File(...)):
    with tempfile.TemporaryDirectory() as tmpdir:
        n_path, e_path = os.path.join(tmpdir, 'n.csv'), os.path.join(tmpdir, 'e.csv')
        with open(n_path, 'wb') as f: f.write(await nodes.read())
        with open(e_path, 'wb') as f: f.write(await edges.read())
        if not HAS_TORCH: return {"error": "PyTorch not installed"}
        data = load_csv(n_path, e_path)
        return {
            'num_nodes': data.x.size(0),
            'num_edges': data.edge_index.size(1),
            'num_features': data.x.size(1),
            'num_classes': int(data.y.max().item()) + 1,
        }

@app.get("/metrics")
def get_metrics():
    """Application metrics endpoint for observability."""
    return metrics.get_all()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
