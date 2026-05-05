from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from api.routers.auth import get_optional_user
from database import get_db
from models.sql_models import User
from services import experiment_service

router = APIRouter()


class ExperimentCreate(BaseModel):
    title: str = "Untitled Run"
    project_id: Optional[int] = None
    dataset_id: Optional[int] = None
    dataset_version_id: Optional[int] = None
    session_id: Optional[str] = None
    task_type: int = 1
    model_type: str = "GCN"
    dataset_name: str = "cora"
    epoch_count: int = 0
    learning_rate: float = 0.01
    hidden_dim: int = 64
    dropout: float = 0.5
    accuracy: float = 0.0
    loss: float = 0.0
    best_epoch: int = 0
    config_json: Optional[Any] = None
    snapshots_json: Optional[List[Dict[str, Any]]] = None
    graph_data_json: Optional[Any] = None
    ground_truth_json: Optional[Any] = None
    task_data_json: Optional[Any] = None
    upload_metadata: Optional[Any] = None
    uploaded_file_path: Optional[str] = None
    notes: Optional[str] = None
    is_best: bool = False
    is_mock: bool = False


class CompareRunsRequest(BaseModel):
    experiment_ids: List[int]


class ExperimentUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    is_best: Optional[bool] = None


class ExperimentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    project_id: Optional[int]
    owner_id: Optional[int]
    dataset_id: Optional[int]
    dataset_version_id: Optional[int]
    task_type: int
    model_type: str
    dataset_name: str
    epoch_count: int
    accuracy: float
    loss: float
    best_epoch: int
    status: str
    is_best: bool
    is_mock: bool
    retention_state: str
    created_at: str
    notes: Optional[str] = None


class ExperimentDetail(ExperimentSummary):
    learning_rate: float
    hidden_dim: int
    dropout: float
    config_json: Optional[Any] = None
    graph_payload: Optional[Any] = None
    snapshots_json: Optional[Any] = None
    metrics_json: Optional[Any] = None
    notes: Optional[str] = None


@router.post("/experiments", response_model=dict)
def save_experiment(
    payload: ExperimentCreate,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    return experiment_service.save_experiment(
        db,
        payload=payload.model_dump(),
        user=user,
    )


@router.get("/experiments")
def list_experiments(
    task_type: Optional[int] = None,
    project_id: Optional[int] = None,
    dataset_version_id: Optional[int] = None,
    owner_id: Optional[int] = None,
    model_type: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    return experiment_service.list_experiment_summaries(
        db,
        user=user,
        task_type=task_type,
        project_id=project_id,
        dataset_version_id=dataset_version_id,
        owner_id=owner_id,
        model_type=model_type,
        status=status,
        q=q,
        limit=limit,
    )


@router.get("/experiments/{exp_id}", response_model=ExperimentDetail)
def get_experiment(
    exp_id: int,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    return experiment_service.get_experiment_detail(db, exp_id=exp_id, user=user)


@router.post("/experiments/{exp_id}/replay")
def replay_experiment(
    exp_id: int,
    epoch: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    return experiment_service.replay_experiment(
        db,
        exp_id=exp_id,
        epoch=epoch,
        user=user,
    )


@router.post("/experiments/compare")
def compare_runs(
    payload: CompareRunsRequest,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    return experiment_service.compare_runs(
        db,
        experiment_ids=payload.experiment_ids,
        user=user,
    )


@router.patch("/experiments/{exp_id}", response_model=ExperimentDetail)
def update_experiment(
    exp_id: int,
    payload: ExperimentUpdate,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    return experiment_service.update_experiment(
        db,
        exp_id=exp_id,
        updates=payload.model_dump(exclude_unset=True),
        user=user,
    )


@router.get("/experiments/{exp_id}/report")
def get_experiment_report(
    exp_id: int,
    track_export: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    return experiment_service.get_experiment_report(
        db,
        exp_id=exp_id,
        track_export=track_export,
        user=user,
    )


@router.post("/experiments/retention")
def run_retention(
    dry_run: bool = Query(default=True),
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    return experiment_service.run_retention(db=db, user=user, dry_run=dry_run)


@router.delete("/experiments/{exp_id}")
def delete_experiment(
    exp_id: int,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    return experiment_service.delete_experiment(db, exp_id=exp_id, user=user)


@router.delete("/experiments")
def delete_all_experiments(
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    return experiment_service.delete_all_experiments(db, user=user)
