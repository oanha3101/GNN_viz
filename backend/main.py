import sys
import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
import pickle
import tempfile
import uuid

logger = logging.getLogger(__name__)

# Thêm đường dẫn gốc vào python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import get_runtime_status, init_db, redis_client, validate_runtime_requirements
from api.user_loader import router as user_loader_router
from api.experiments import router as experiments_router
from api.routers.training_router import router as training_router
from api.routers.sessions import router as sessions_router
from api.routers.auth import router as auth_router
from api.routers.admin import router as admin_router
from api.routers.projects import router as projects_router
from api.routers.datasets import router as managed_datasets_router
from core.logging_config import setup_logging
from core.metrics import metrics
from services.hybrid_store import blob_store, get_blob_runtime_status, slugify, validate_blob_runtime_requirements
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
    validate_runtime_requirements()
    validate_blob_runtime_requirements()
    yield
    # Shutdown

app = FastAPI(title="GNN-Insight API v3", lifespan=lifespan)

# Middlewares
_cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
_cors_origins = [o.strip() for o in _cors_origins if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gắn các Routers
app.include_router(user_loader_router, prefix="/api")
app.include_router(experiments_router, prefix="/api")
app.include_router(sessions_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(projects_router, prefix="/api")
app.include_router(managed_datasets_router, prefix="/api")
app.include_router(training_router) # WebSocket router

# ── REST API Endpoints (Gọn nhẹ) ─────────────────────────────────────────────

@app.get("/")
def read_root():
    return {
        "status": "online",
        "version": "3.0.0",
        "message": "GNN-Insight Backend Unified Architecture is running."
    }


@app.get("/api/health")
def get_health():
    runtime = get_runtime_status()
    runtime["blob"] = get_blob_runtime_status()
    degraded = [
        name
        for name in ("mysql", "mongo", "redis", "blob")
        if runtime[name]["fallback_active"] or not runtime[name]["available"]
    ]
    body = {
        "status": "degraded" if degraded else "ok",
        "runtime": runtime,
        "degraded_services": degraded,
    }
    if degraded:
        return JSONResponse(status_code=503, content=body)
    return body

@app.get("/api/datasets/catalog")
def list_builtin_datasets():
    if not HAS_TORCH: return ["Mock Data"]
    return get_available_datasets()

@app.post("/api/upload-graph")
async def upload_graph(file: UploadFile = File(...)):
    if not HAS_TORCH: return {"error": "PyTorch not installed"}
    suffix = os.path.splitext(file.filename)[1] or ".bin"
    upload_bytes = await file.read()
    runtime_key = f"datasets/runtime/{slugify(os.path.splitext(file.filename)[0])}/{uuid.uuid4().hex}{suffix}"
    blob_store.put_bytes(runtime_key, upload_bytes)
    datasets_dir = os.path.join(os.path.dirname(__file__), 'datasets')
    fd, tmp_path = tempfile.mkstemp(suffix=suffix, dir=datasets_dir)
    os.close(fd)
    with open(tmp_path, "wb") as tmp:
        tmp.write(upload_bytes)
    try:
        data = load_custom_graph(tmp_path)
        data, metadata = auto_detect_graph(data)
        metadata['uploaded_file_path'] = runtime_key
        metadata['blob_key'] = runtime_key
        metadata['filename'] = file.filename
        return metadata
    except Exception as e:
        blob_store.delete(runtime_key)
        return {"error": str(e)}
    finally:
        if os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except PermissionError:
                logger.warning("Temporary upload artifact cleanup skipped for %s", tmp_path)

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
