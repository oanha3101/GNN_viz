from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime

from database import get_db, mongo_experiments
from models.sql_models import Experiment, Project
import os
from bson.objectid import ObjectId

router = APIRouter()


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

    class Config:
        from_attributes = True


class ExperimentDetail(BaseModel):
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

    class Config:
        from_attributes = True


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/experiments", response_model=dict)
def save_experiment(payload: ExperimentCreate, db: Session = Depends(get_db)):
    """Save a completed training run to the database. Heavy data goes to MongoDB."""
    
    # 1. Insert giant blobs into MongoDB
    mongo_doc = {
        "config_json": payload.config_json,
        "snapshots_json": payload.snapshots_json,
        "graph_data_json": payload.graph_data_json,
        "ground_truth_json": payload.ground_truth_json,
        "task_data_json": payload.task_data_json,
    }
    insert_result = mongo_experiments.insert_one(mongo_doc)
    
    # 2. Save relational metadata to MySQL
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
        mongo_doc_id=str(insert_result.inserted_id),
        is_mock=payload.is_mock,
    )
    db.add(exp)
    db.commit()
    db.refresh(exp)
    return {"id": exp.id, "status": "saved", "mongo_id": str(insert_result.inserted_id)}


@router.get("/experiments", response_model=List[ExperimentSummary])
def list_experiments(
    task_type: Optional[int] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """List saved experiments (summaries only, no heavy data)."""
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
            created_at=r.created_at.isoformat() if r.created_at else "",
        ))
    return result


@router.get("/experiments/{exp_id}", response_model=ExperimentDetail)
def get_experiment(exp_id: int, db: Session = Depends(get_db)):
    """Get full experiment data from MySQL + MongoDB for replay."""
    exp = db.query(Experiment).filter(Experiment.id == exp_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
        
    doc = None
    if exp.mongo_doc_id:
        try:
            doc = mongo_experiments.find_one({"_id": ObjectId(exp.mongo_doc_id)})
        except Exception as e:
            print(f"Error fetching MongoDB document {exp.mongo_doc_id}: {e}")
            doc = {}
            
    doc = doc or {}
            
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
        config_json=doc.get("config_json"),
        snapshots_json=doc.get("snapshots_json"),
        graph_data_json=doc.get("graph_data_json"),
        ground_truth_json=doc.get("ground_truth_json"),
        task_data_json=doc.get("task_data_json"),
        is_mock=exp.is_mock if exp.is_mock is not None else False,
        created_at=exp.created_at.isoformat() if exp.created_at else "",
    )


@router.delete("/experiments/{exp_id}")
def delete_experiment(exp_id: int, db: Session = Depends(get_db)):
    """Delete a saved experiment from both DBs."""
    exp = db.query(Experiment).filter(Experiment.id == exp_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
        
    # Delete from MongoDB and handle config upload cleanups
    if exp.mongo_doc_id:
        doc = mongo_experiments.find_one({"_id": ObjectId(exp.mongo_doc_id)})
        if doc and doc.get("config_json") and isinstance(doc["config_json"], dict):
            uploaded_path = doc["config_json"].get("uploaded_file_path")
            if uploaded_path and os.path.exists(uploaded_path):
                try:
                    os.remove(uploaded_path)
                except Exception:
                    pass
        mongo_experiments.delete_one({"_id": ObjectId(exp.mongo_doc_id)})
                
    db.delete(exp)
    db.commit()
    return {"status": "deleted", "id": exp_id}


@router.delete("/experiments")
def delete_all_experiments(db: Session = Depends(get_db)):
    """Delete all saved experiments and associated files."""
    experiments = db.query(Experiment).all()
    count = 0
    for exp in experiments:
        if exp.mongo_doc_id:
            doc = mongo_experiments.find_one({"_id": ObjectId(exp.mongo_doc_id)})
            if doc and doc.get("config_json") and isinstance(doc["config_json"], dict):
                uploaded_path = doc["config_json"].get("uploaded_file_path")
                if uploaded_path and os.path.exists(uploaded_path):
                    try:
                        os.remove(uploaded_path)
                    except Exception:
                        pass
            mongo_experiments.delete_one({"_id": ObjectId(exp.mongo_doc_id)})
        db.delete(exp)
        count += 1
    db.commit()
    return {"status": "deleted_all", "count": count}
