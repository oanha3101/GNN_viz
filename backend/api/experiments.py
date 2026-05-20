from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from api.routers.auth import get_current_user, get_optional_user
from database import get_db
from models.sql_models import Experiment, User
from services import experiment_service
from services import analytics_service
import logging

logger = logging.getLogger(__name__)

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


class BulkDeleteRequest(BaseModel):
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
    user: Optional[User] = Depends(get_current_user),
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
    user: Optional[User] = Depends(get_current_user),
):
    return experiment_service.delete_all_experiments(db, user=user)


@router.post("/experiments/bulk-delete")
def bulk_delete_experiments(
    payload: BulkDeleteRequest,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user),
):
    return experiment_service.bulk_delete_experiments(
        db, experiment_ids=payload.experiment_ids, user=user,
    )


# ---------------------------------------------------------------------------
# AI Research Analyst Endpoints
# ---------------------------------------------------------------------------

class CompareInsightsRequest(BaseModel):
    experiment_ids: List[int]


class ResearchNotesRequest(BaseModel):
    pass


@router.post("/experiments/analyze")
def analyze_experiment(
    exp_id: int = Query(...),
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    """Full structural diagnostics for a single experiment."""
    detail = experiment_service.get_experiment_detail(db, exp_id=exp_id, user=user)
    snapshots = detail.get("snapshots_json") or []
    graph_payload = detail.get("graph_payload") or {}
    model_type = detail.get("model_type", "GCN")
    config = detail.get("config_json") or {}

    diagnostics = analytics_service.compute_structural_diagnostics(snapshots, graph_payload, model_type)
    failures = analytics_service.analyze_failure_patterns(snapshots, graph_payload, model_type)
    dataset = analytics_service.analyze_dataset_topology(graph_payload, snapshots)
    profile = analytics_service.get_model_profile(model_type)

    return {
        "experiment_id": exp_id,
        "model_type": model_type,
        "diagnostics": diagnostics,
        "failure_analysis": failures,
        "dataset_topology": dataset,
        "model_profile": profile,
    }


@router.post("/experiments/compare-insights")
def compare_insights(
    payload: CompareInsightsRequest,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    """AI-generated comparison insights for multiple runs."""
    if len(payload.experiment_ids) < 2 or len(payload.experiment_ids) > 4:
        raise HTTPException(status_code=400, detail="Compare requires 2 to 4 experiment ids")

    from services.hybrid_store import mongo_runs, PersistenceUnavailableError

    experiments = db.query(Experiment).filter(
        Experiment.id.in_(payload.experiment_ids)
    ).all()

    if len(experiments) != len(set(payload.experiment_ids)):
        raise HTTPException(status_code=404, detail="One or more experiments were not found")

    results = []
    graph_payload = None
    for exp in experiments:
        experiment_service.ensure_experiment_access(exp, user)
        try:
            metrics = mongo_runs.get_metrics(exp)
            snapshots = mongo_runs.list_snapshots(exp)
            if graph_payload is None:
                graph_payload = mongo_runs.get_graph_payload(exp)
        except PersistenceUnavailableError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

        results.append({
            "experiment": {
                "id": exp.id,
                "title": exp.title,
                "model_type": exp.model_type or "GCN",
                "accuracy": exp.accuracy or 0.0,
                "loss": exp.loss or 0.0,
                "best_epoch": exp.best_epoch or 0,
                "task_type": exp.task_type or 1,
                "dataset_name": exp.dataset_name or "cora",
            },
            "metrics": metrics,
            "snapshots": snapshots or [],
        })

    insights = analytics_service.generate_comparison_insights(results, graph_payload)

    # Add per-model diagnostics
    model_diagnostics = {}
    for r in results:
        model_type = r["experiment"]["model_type"]
        snapshots = r["snapshots"]
        model_diagnostics[model_type] = {
            "diagnostics": analytics_service.compute_structural_diagnostics(snapshots, graph_payload, model_type),
            "profile": analytics_service.get_model_profile(model_type),
        }

    return {
        "insights": insights,
        "model_diagnostics": model_diagnostics,
        "dataset_topology": analytics_service.analyze_dataset_topology(graph_payload),
    }


@router.post("/experiments/{exp_id}/research-notes")
def generate_research_notes(
    exp_id: int,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    """Auto-generate research notes for a completed run."""
    detail = experiment_service.get_experiment_detail(db, exp_id=exp_id, user=user)
    snapshots = detail.get("snapshots_json") or []
    graph_payload = detail.get("graph_payload") or {}
    model_type = detail.get("model_type", "GCN")
    config = detail.get("config_json") or {}

    try:
        return analytics_service.generate_research_notes(snapshots, model_type, config, graph_payload)
    except Exception as exc:
        logger.exception("Research notes generation failed for experiment %s", exp_id)
        raise HTTPException(status_code=500, detail=f"Research notes failed: {exc}") from exc


@router.post("/experiments/{exp_id}/recommendations")
def get_recommendations(
    exp_id: int,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    """Get actionable recommendations for improving the experiment."""
    detail = experiment_service.get_experiment_detail(db, exp_id=exp_id, user=user)
    snapshots = detail.get("snapshots_json") or []
    graph_payload = detail.get("graph_payload") or {}
    model_type = detail.get("model_type", "GCN")
    config = detail.get("config_json") or {}

    try:
        return analytics_service.generate_recommendations(snapshots, model_type, config, graph_payload)
    except Exception as exc:
        logger.exception("Recommendations generation failed for experiment %s", exp_id)
        raise HTTPException(status_code=500, detail=f"Recommendations failed: {exc}") from exc


@router.get("/experiments/{exp_id}/node-story/{node_id}")
def get_node_story(
    exp_id: int,
    node_id: int,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    """Get prediction timeline for a specific node across all epochs."""
    detail = experiment_service.get_experiment_detail(db, exp_id=exp_id, user=user)
    snapshots = detail.get("snapshots_json") or []
    graph_payload = detail.get("graph_payload") or {}
    graph_data = (graph_payload or {}).get("graph_data_json", {})
    nodes = graph_data.get("nodes", [])

    node_info = None
    for n in nodes:
        nid = n.get("id", n.get("index", -1))
        if nid == node_id:
            node_info = n
            break

    timeline = []
    for i, snap in enumerate(snapshots):
        preds = snap.get("node_predictions", [])
        probs = snap.get("node_probabilities", [])
        confidence = snap.get("node_confidence", [])
        correctness = snap.get("node_correctness", [])
        attention = snap.get("attention_edges", [])

        entry = {"epoch": i}
        if node_id < len(preds):
            entry["prediction"] = preds[node_id]
        if node_id < len(probs):
            entry["probabilities"] = probs[node_id]
            entry["confidence"] = max(probs[node_id]) if probs[node_id] else 0
        elif node_id < len(confidence):
            entry["confidence"] = confidence[node_id]
        if node_id < len(correctness):
            entry["correct"] = bool(correctness[node_id])

        # Attention relevant to this node
        node_attention = []
        for edge in attention:
            if isinstance(edge, dict):
                src = edge.get("source", -1)
                tgt = edge.get("target", -1)
                if src == node_id or tgt == node_id:
                    node_attention.append(edge)
        if node_attention:
            entry["attention"] = node_attention[:10]  # top 10

        timeline.append(entry)

    # Detect significant shifts
    shifts = []
    for i in range(1, len(timeline)):
        prev = timeline[i-1]
        curr = timeline[i]
        if "prediction" in prev and "prediction" in curr and prev["prediction"] != curr["prediction"]:
            shifts.append({
                "epoch": i,
                "type": "prediction_shift",
                "from": prev["prediction"],
                "to": curr["prediction"],
                "confidence": curr.get("confidence", 0),
            })

    return {
        "node_id": node_id,
        "node_info": node_info,
        "timeline": timeline,
        "shifts": shifts,
        "total_epochs": len(timeline),
        "final_prediction": timeline[-1].get("prediction") if timeline else None,
        "final_confidence": timeline[-1].get("confidence", 0) if timeline else 0,
    }
