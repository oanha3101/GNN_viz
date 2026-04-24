from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Any
from datetime import datetime, timezone
import os
import json
import gzip
import uuid
from bson.objectid import ObjectId

from database import get_db, mongo_experiments, mongo_available
from models.sql_models import Experiment, Project

router = APIRouter()

# Thư mục lưu trữ dữ liệu nén
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "saved_experiments")
os.makedirs(DATA_DIR, exist_ok=True)


# ── Pydantic Schemas ─────────────────────────────────────────────────────────

class ExperimentCreate(BaseModel):
    title: str = "Untitled Run"
    task_type: int = 1
    model_type: str = "GCN"
    dataset_name: str = "cora"
    epoch_count: int = 0
    learning_rate: float = 0.01
    hidden_dim: int = 64
    dropout: float = 0.5
    accuracy: float = 0.0
    loss: float = 0.0
    config_json: Optional[Any] = None
    snapshots_json: Optional[Any] = None
    graph_data_json: Optional[Any] = None
    ground_truth_json: Optional[Any] = None
    task_data_json: Optional[Any] = None
    is_mock: bool = False


class ExperimentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    task_type: int
    model_type: str
    dataset_name: str
    epoch_count: int
    accuracy: float
    loss: float
    is_mock: bool
    created_at: str


class ExperimentDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    task_type: int
    model_type: str
    dataset_name: str
    epoch_count: int
    learning_rate: float
    hidden_dim: int
    dropout: float
    accuracy: float
    loss: float
    config_json: Optional[Any] = None
    snapshots_json: Optional[Any] = None
    graph_data_json: Optional[Any] = None
    ground_truth_json: Optional[Any] = None
    task_data_json: Optional[Any] = None
    is_mock: bool
    created_at: str


# ── Helpers ──────────────────────────────────────────────────────────────────

def save_heavy_data(data: dict) -> str:
    """Nén và lưu dữ liệu nặng xuống ổ cứng, trả về đường dẫn file."""
    file_id = uuid.uuid4().hex
    file_path = os.path.join(DATA_DIR, f"exp_{file_id}.json.gz")
    with gzip.open(file_path, "wt", encoding="utf-8") as f:
        json.dump(data, f)
    return file_path

def load_heavy_data(file_path: str) -> dict:
    """Đọc và giải nén dữ liệu từ ổ cứng."""
    if not file_path or not os.path.exists(file_path):
        return {}
    try:
        with gzip.open(file_path, "rt", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Lỗi đọc file dữ liệu nén: {e}")
        return {}


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/experiments", response_model=dict)
def save_experiment(payload: ExperimentCreate, db: Session = Depends(get_db)):
    """Save a completed training run. Dữ liệu nặng được nén và lưu file để tránh giới hạn MongoDB 16MB."""
    
    # 1. Gói dữ liệu nặng
    heavy_payload = {
        "snapshots_json": payload.snapshots_json,
        "graph_data_json": payload.graph_data_json,
        "ground_truth_json": payload.ground_truth_json,
        "task_data_json": payload.task_data_json,
        "config_json": payload.config_json
    }
    
    # 2. Lưu file vật lý (Gỡ bom 16MB)
    file_path = save_heavy_data(heavy_payload)
    
    # 3. Lưu record vào MongoDB (chỉ lưu đường dẫn + metadata nhẹ)
    mongo_id = None
    if mongo_available:
        try:
            mongo_doc = {
                "file_path": file_path,
                "config_json": payload.config_json, # Giữ config để query nhanh nếu cần
                "created_at": datetime.now(timezone.utc)
            }
            insert_result = mongo_experiments.insert_one(mongo_doc)
            mongo_id = str(insert_result.inserted_id)
        except Exception as e:
            print(f"MongoDB insert failed: {e}")

    # 4. Lưu relational metadata vào SQL (MySQL/SQLite)
    exp = Experiment(
        task_type=payload.task_type,
        model_type=payload.model_type,
        dataset_name=payload.dataset_name,
        epoch_count=payload.epoch_count,
        learning_rate=payload.learning_rate,
        hidden_dim=payload.hidden_dim,
        dropout=payload.dropout,
        accuracy=payload.accuracy,
        loss=payload.loss,
        mongo_doc_id=mongo_id,
        # Nếu MongoDB lỗi, SQL sẽ lưu file_path vào trường snapshots_json (dạng string)
        snapshots_json=file_path if not mongo_id else None,
        is_mock=payload.is_mock,
    )
    db.add(exp)
    db.commit()
    db.refresh(exp)
    
    return {"id": exp.id, "status": "saved", "mongo_id": mongo_id}


@router.get("/experiments", response_model=List[ExperimentSummary])
def list_experiments(task_type: Optional[int] = None, limit: int = 50, db: Session = Depends(get_db)):
    """Lấy danh sách các experiment (chỉ lấy metadata nhẹ)."""
    q = db.query(Experiment)
    if task_type is not None:
        q = q.filter(Experiment.task_type == task_type)
    rows = q.order_by(Experiment.created_at.desc()).limit(limit).all()

    result = []
    for r in rows:
        result.append(ExperimentSummary(
            id=r.id,
            title=f"Task {r.task_type} – {r.model_type}",
            task_type=r.task_type or 1,
            model_type=r.model_type or "GCN",
            dataset_name=r.dataset_name or "cora",
            epoch_count=r.epoch_count or 0,
            accuracy=r.accuracy or 0.0,
            loss=r.loss or 0.0,
            is_mock=r.is_mock if r.is_mock is not None else False,
            created_at=r.created_at.replace(tzinfo=timezone.utc).isoformat() if r.created_at else "",
        ))
    return result


@router.get("/experiments/{exp_id}", response_model=ExperimentDetail)
def get_experiment(exp_id: int, db: Session = Depends(get_db)):
    """Lấy toàn bộ dữ liệu experiment (tự động giải nén file và gộp dữ liệu)."""
    exp = db.query(Experiment).filter(Experiment.id == exp_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
        
    file_path = None
    mongo_doc = {}
    
    # 1. Tìm file_path từ MongoDB
    if exp.mongo_doc_id and mongo_available:
        try:
            mongo_doc = mongo_experiments.find_one({"_id": ObjectId(exp.mongo_doc_id)})
            if mongo_doc:
                file_path = mongo_doc.get("file_path")
        except Exception: pass
            
    # 2. Fallback tìm file_path từ SQL (nếu MongoDB hỏng)
    if not file_path and exp.snapshots_json and isinstance(exp.snapshots_json, str):
        file_path = exp.snapshots_json

    # 3. Đọc dữ liệu nén
    heavy_data = load_heavy_data(file_path) if file_path else {}
            
    return ExperimentDetail(
        id=exp.id,
        title=f"Task {exp.task_type} – {exp.model_type}",
        task_type=exp.task_type or 1,
        model_type=exp.model_type or "GCN",
        dataset_name=exp.dataset_name or "cora",
        epoch_count=exp.epoch_count or 0,
        learning_rate=exp.learning_rate or 0.01,
        hidden_dim=exp.hidden_dim or 64,
        dropout=exp.dropout or 0.5,
        accuracy=exp.accuracy or 0.0,
        loss=exp.loss or 0.0,
        config_json=heavy_data.get("config_json") or exp.config_json,
        snapshots_json=heavy_data.get("snapshots_json") or exp.snapshots_json,
        graph_data_json=heavy_data.get("graph_data_json") or exp.graph_data_json,
        ground_truth_json=heavy_data.get("ground_truth_json") or exp.ground_truth_json,
        task_data_json=heavy_data.get("task_data_json") or exp.task_data_json,
        is_mock=exp.is_mock if exp.is_mock is not None else False,
        created_at=exp.created_at.replace(tzinfo=timezone.utc).isoformat() if exp.created_at else "",
    )


@router.delete("/experiments/{exp_id}")
def delete_experiment(exp_id: int, db: Session = Depends(get_db)):
    """Xóa experiment và file vật lý tương ứng."""
    exp = db.query(Experiment).filter(Experiment.id == exp_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    
    file_path = None
    # Xóa record MongoDB và lấy file_path
    if exp.mongo_doc_id and mongo_available:
        try:
            doc = mongo_experiments.find_one({"_id": ObjectId(exp.mongo_doc_id)})
            if doc:
                file_path = doc.get("file_path")
            mongo_experiments.delete_one({"_id": ObjectId(exp.mongo_doc_id)})
        except Exception: pass
            
    # Xóa file vật lý
    if not file_path and exp.snapshots_json and isinstance(exp.snapshots_json, str):
        file_path = exp.snapshots_json
        
    if file_path and os.path.exists(file_path):
        try: os.remove(file_path)
        except Exception: pass

    db.delete(exp)
    db.commit()
    return {"status": "deleted", "id": exp_id}


@router.delete("/experiments")
def delete_all_experiments(db: Session = Depends(get_db)):
    """Xóa sạch sành sanh mọi thứ (Database + Files)."""
    experiments = db.query(Experiment).all()
    for exp in experiments:
        delete_experiment(exp.id, db)
    return {"status": "all deleted"}
