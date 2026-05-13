from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from models.sql_models import AuditAction, Experiment, Project, SessionStatus, TrainingSession, User
from services.hybrid_store import (
    ensure_default_dataset_version,
    ensure_default_project,
    mongo_runs,
    PersistenceUnavailableError,
    record_audit_log,
    retention_service,
)
from services.list_response import build_list_response


def iso_or_blank(value) -> str:
    if not value:
        return ""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def serialize_experiment_summary(row: Experiment) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "project_id": row.project_id,
        "owner_id": row.owner_id,
        "dataset_id": row.dataset_id,
        "dataset_version_id": row.dataset_version_id,
        "task_type": row.task_type or 1,
        "model_type": row.model_type or "GCN",
        "dataset_name": row.dataset_name or "cora",
        "epoch_count": row.epoch_count or 0,
        "accuracy": row.accuracy or 0.0,
        "loss": row.loss or 0.0,
        "best_epoch": row.best_epoch or 0,
        "status": row.status or SessionStatus.COMPLETED.value,
        "is_best": bool(row.is_best),
        "is_mock": bool(row.is_mock),
        "retention_state": row.retention_state or "full",
        "created_at": iso_or_blank(row.created_at),
        "notes": row.notes,
    }


def serialize_experiment_detail(exp: Experiment) -> dict:
    try:
        graph_payload = mongo_runs.get_graph_payload(exp)
        snapshots_json = mongo_runs.list_snapshots(exp)
        metrics_json = mongo_runs.get_metrics(exp)
    except PersistenceUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {
        **serialize_experiment_summary(exp),
        "learning_rate": exp.learning_rate or 0.01,
        "hidden_dim": exp.hidden_dim or 64,
        "dropout": exp.dropout or 0.5,
        "config_json": exp.config_json,
        "graph_payload": graph_payload,
        "snapshots_json": snapshots_json,
        "metrics_json": metrics_json,
        "notes": exp.notes,
    }


def ensure_experiment_access(experiment: Experiment, user: Optional[User]) -> None:
    if user is None:
        return
    if user.is_superuser or user.role == "admin":
        return
    if experiment.owner_id and experiment.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Not allowed to access this experiment")


def ensure_experiment_write_access(experiment: Experiment, user: Optional[User]) -> None:
    if user and user.role == "viewer":
        raise HTTPException(status_code=403, detail="Viewer accounts cannot modify experiments")
    ensure_experiment_access(experiment, user)


def get_experiment_or_404(db: Session, exp_id: int) -> Experiment:
    exp = db.query(Experiment).filter(Experiment.id == exp_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return exp


def _resolve_project_and_dataset(db: Session, payload: Dict[str, Any], user: Optional[User]):
    project_id = payload.get("project_id")
    if project_id:
        project = db.query(Project).filter(Project.id == project_id).first()
    else:
        project = None
    if project is None:
        project = ensure_default_project(db, user, payload["task_type"], payload["model_type"])

    if payload.get("dataset_version_id"):
        return project, payload.get("dataset_id"), payload["dataset_version_id"]

    dataset, version = ensure_default_dataset_version(
        db,
        user,
        payload["dataset_name"],
        uploaded_file_path=payload.get("uploaded_file_path"),
        metadata=payload.get("upload_metadata"),
    )
    return project, dataset.id, version.id


def save_experiment(db: Session, *, payload: Dict[str, Any], user: Optional[User]) -> dict:
    if user and user.role == "viewer":
        raise HTTPException(status_code=403, detail="Viewer accounts cannot create experiments")

    project, dataset_id, dataset_version_id = _resolve_project_and_dataset(db, payload, user)
    session = None
    final_status = SessionStatus.COMPLETED.value
    session_id = payload.get("session_id")
    if session_id:
        session = db.query(TrainingSession).filter(TrainingSession.id == session_id).first()
        if session and session.status in {SessionStatus.FAILED.value, SessionStatus.STOPPED.value}:
            final_status = session.status

    # Compute accuracy/loss from snapshots if frontend sent defaults (0.0)
    snapshots_for_compute = payload.get("snapshots_json") or []
    if snapshots_for_compute and (not payload.get("accuracy") or payload["accuracy"] == 0.0):
        last_snap = snapshots_for_compute[-1]
        payload["accuracy"] = float(last_snap.get("val_acc") or last_snap.get("train_acc") or 0.0)
    if snapshots_for_compute and (not payload.get("loss") or payload["loss"] == 0.0):
        last_snap = snapshots_for_compute[-1]
        payload["loss"] = float(last_snap.get("val_loss") or last_snap.get("train_loss") or 0.0)

    exp = Experiment(
        title=payload.get("title") or f"Task {payload['task_type']} - {payload['model_type']}",
        project_id=project.id if project else None,
        owner_id=user.id if user else None,
        dataset_id=dataset_id,
        dataset_version_id=dataset_version_id,
        task_type=payload["task_type"],
        model_type=payload["model_type"],
        dataset_name=payload["dataset_name"],
        epoch_count=payload.get("epoch_count", 0),
        learning_rate=payload.get("learning_rate", 0.01),
        hidden_dim=payload.get("hidden_dim", 64),
        dropout=payload.get("dropout", 0.5),
        accuracy=payload.get("accuracy", 0.0),
        loss=payload.get("loss", 0.0),
        best_epoch=payload.get("best_epoch", 0),
        status=final_status,
        config_json=payload.get("config_json"),
        notes=payload.get("notes"),
        is_best=bool(payload.get("is_best", False)),
        is_mock=bool(payload.get("is_mock", False)),
    )
    db.add(exp)
    db.flush()

    try:
        graph_payload_id = mongo_runs.save_graph_payload(
            exp,
            payload.get("config_json"),
            payload.get("graph_data_json"),
            payload.get("ground_truth_json"),
            payload.get("task_data_json"),
        )
        snapshots = payload.get("snapshots_json") or []
        snapshot_ids = mongo_runs.save_snapshots(exp, snapshots)
        metrics_id = mongo_runs.save_metrics(exp, snapshots, payload.get("config_json"))
        metrics_doc = mongo_runs.get_metrics(exp) or {}
    except PersistenceUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    exp.mongo_run_id = str(exp.id)
    exp.mongo_graph_payload_id = graph_payload_id
    exp.mongo_metrics_id = metrics_id
    exp.best_epoch = int(metrics_doc.get("best_epoch") or payload.get("best_epoch") or 0)

    if session:
        session.experiment_id = exp.id
        session.mongo_run_id = exp.mongo_run_id
        if exp.epoch_count:
            session.last_epoch = max(session.last_epoch, exp.epoch_count - 1)
        if final_status == SessionStatus.COMPLETED.value:
            session.status = SessionStatus.COMPLETED.value
            session.ended_at = session.ended_at or datetime.utcnow()
        exp.status = session.status or final_status

    db.commit()
    db.refresh(exp)
    replay_epoch = exp.best_epoch or 0
    return {
        "id": exp.id,
        "status": "saved",
        "experiment_status": exp.status,
        "session_id": session_id,
        "mongo_run_id": exp.mongo_run_id,
        "graph_payload_id": graph_payload_id,
        "snapshot_count": len(snapshot_ids),
        "report_path": f"/api/experiments/{exp.id}/report",
        "replay_path": f"/api/experiments/{exp.id}/replay?epoch={replay_epoch}",
    }


def list_experiment_summaries(
    db: Session,
    *,
    user: Optional[User],
    task_type: Optional[int] = None,
    project_id: Optional[int] = None,
    dataset_version_id: Optional[int] = None,
    owner_id: Optional[int] = None,
    model_type: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 50,
) -> dict:
    query = db.query(Experiment)
    if task_type is not None:
        query = query.filter(Experiment.task_type == task_type)
    if project_id is not None:
        query = query.filter(Experiment.project_id == project_id)
    if dataset_version_id is not None:
        query = query.filter(Experiment.dataset_version_id == dataset_version_id)
    if owner_id is not None:
        query = query.filter(Experiment.owner_id == owner_id)
    if model_type is not None:
        query = query.filter(Experiment.model_type == model_type)
    if status is not None:
        query = query.filter(Experiment.status == status)
    if q:
        search = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Experiment.title.ilike(search),
                Experiment.dataset_name.ilike(search),
                Experiment.model_type.ilike(search),
            )
        )
    if user and not (user.is_superuser or user.role == "admin"):
        query = query.filter((Experiment.owner_id == user.id) | (Experiment.owner_id.is_(None)))

    total = query.count()
    rows = query.order_by(Experiment.created_at.desc()).limit(limit).all()
    return build_list_response(
        [serialize_experiment_summary(row) for row in rows],
        total=total,
        page=1,
        page_size=len(rows),
    )


def get_experiment_detail(db: Session, *, exp_id: int, user: Optional[User]) -> dict:
    exp = get_experiment_or_404(db, exp_id)
    ensure_experiment_access(exp, user)
    return serialize_experiment_detail(exp)


def replay_experiment(db: Session, *, exp_id: int, epoch: Optional[int], user: Optional[User]) -> dict:
    exp = get_experiment_or_404(db, exp_id)
    ensure_experiment_access(exp, user)

    try:
        graph_payload = mongo_runs.get_graph_payload(exp)
    except PersistenceUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if epoch is None:
        try:
            snapshots = mongo_runs.list_snapshots(exp)
        except PersistenceUnavailableError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        return {
            "experiment_id": exp.id,
            "graph_payload": graph_payload,
            "snapshots": snapshots,
            "best_epoch": exp.best_epoch or 0,
        }

    try:
        snapshot = mongo_runs.get_snapshot(exp, epoch)
    except PersistenceUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if snapshot is None:
        raise HTTPException(status_code=404, detail=f"Snapshot epoch {epoch} not found")
    return {
        "experiment_id": exp.id,
        "epoch": epoch,
        "graph_payload": graph_payload,
        "snapshot": snapshot,
        "best_epoch": exp.best_epoch or 0,
    }


def compare_runs(db: Session, *, experiment_ids: List[int], user: Optional[User]) -> dict:
    if len(experiment_ids) < 2 or len(experiment_ids) > 4:
        raise HTTPException(status_code=400, detail="Compare requires 2 to 4 experiment ids")

    experiments = db.query(Experiment).filter(Experiment.id.in_(experiment_ids)).all()
    if len(experiments) != len(set(experiment_ids)):
        raise HTTPException(status_code=404, detail="One or more experiments were not found")

    results = []
    for experiment in experiments:
        ensure_experiment_access(experiment, user)
        try:
            metrics = mongo_runs.get_metrics(experiment)
        except PersistenceUnavailableError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        results.append(
            {
                "experiment": {
                    "id": experiment.id,
                    "title": experiment.title,
                    "project_id": experiment.project_id,
                    "dataset_version_id": experiment.dataset_version_id,
                    "task_type": experiment.task_type,
                    "model_type": experiment.model_type,
                    "dataset_name": experiment.dataset_name,
                    "best_epoch": experiment.best_epoch or 0,
                    "accuracy": experiment.accuracy or 0.0,
                    "loss": experiment.loss or 0.0,
                    "created_at": iso_or_blank(experiment.created_at),
                },
                "metrics": metrics,
            }
        )
    return {"results": results}


def update_experiment(db: Session, *, exp_id: int, updates: Dict[str, Any], user: Optional[User]) -> dict:
    exp = get_experiment_or_404(db, exp_id)
    ensure_experiment_write_access(exp, user)

    changed = False
    if "title" in updates and updates["title"] is not None:
        exp.title = updates["title"].strip() or exp.title
        changed = True
    if "notes" in updates and updates["notes"] is not None:
        exp.notes = updates["notes"].strip() or None
        changed = True
    if "is_best" in updates and updates["is_best"] is not None:
        exp.is_best = bool(updates["is_best"])
        if exp.is_best and exp.project_id:
            (
                db.query(Experiment)
                .filter(Experiment.project_id == exp.project_id, Experiment.id != exp.id, Experiment.is_best.is_(True))
                .update({"is_best": False}, synchronize_session=False)
            )
        changed = True

    if changed:
        record_audit_log(
            db,
            AuditAction.EXPERIMENT_UPDATED.value,
            "experiment",
            str(exp.id),
            actor_user_id=user.id if user else None,
            details={
                "title": exp.title,
                "notes_updated": "notes" in updates,
                "is_best": exp.is_best,
            },
        )
        db.commit()
        db.refresh(exp)

    return serialize_experiment_detail(exp)


def _primary_metric_label(task_type: int) -> str:
    labels = {
        1: "accuracy",
        2: "accuracy",
        3: "auc",
        4: "modularity",
        5: "structure_preservation",
        6: "validity_rate",
    }
    return labels.get(task_type, "primary_score")


def _recommend_next_action(experiment: Experiment, metrics: Dict[str, Any]) -> str:
    history = metrics.get("history") or {}
    scores = history.get("primary_score") or []
    if not scores:
        return "Replay the run and inspect retained epochs before deciding the next iteration."

    best_score = float(metrics.get("best_score") or 0.0)
    last_score = float(scores[-1] or 0.0)
    best_epoch = int(metrics.get("best_epoch") or experiment.best_epoch or 0)
    last_epoch = int(history.get("epoch", [best_epoch])[-1] if history.get("epoch") else best_epoch)

    if best_score >= 0.9:
        return "Pin this run as the current reference and compare it against recent challengers."
    if best_epoch + 5 < last_epoch and last_score + 0.02 < best_score:
        return "The best score peaked early; try early stopping or a lower learning rate on the next run."
    if best_score < 0.7:
        return "This run is still weak; try more epochs, a wider hidden dimension, or a different model."
    return "Add notes for what worked here, then compare this run against 1-3 nearby variants."


def build_report_payload(exp: Experiment, db: Session) -> Dict[str, Any]:
    try:
        metrics = mongo_runs.get_metrics(exp) or {}
    except PersistenceUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    project = db.query(Project).filter(Project.id == exp.project_id).first() if exp.project_id else None
    dataset = exp.dataset
    dataset_version = exp.dataset_version
    replay_path = f"/api/experiments/{exp.id}/replay?epoch={exp.best_epoch or 0}"

    return {
        "generated_at": iso_or_blank(datetime.now(timezone.utc)),
        "experiment": {
            "id": exp.id,
            "title": exp.title,
            "status": exp.status or SessionStatus.COMPLETED.value,
            "task_type": exp.task_type or 1,
            "model_type": exp.model_type or "GCN",
            "dataset_name": exp.dataset_name or "cora",
            "project_id": exp.project_id,
            "project_title": project.title if project else None,
            "owner_id": exp.owner_id,
            "dataset_id": exp.dataset_id,
            "dataset_version_id": exp.dataset_version_id,
            "dataset_version_lifecycle": dataset_version.lifecycle if dataset_version else None,
            "dataset_record_name": dataset.name if dataset else None,
            "created_at": iso_or_blank(exp.created_at),
            "is_best": bool(exp.is_best),
            "is_mock": bool(exp.is_mock),
        },
        "summary": {
            "primary_metric": _primary_metric_label(exp.task_type or 1),
            "best_epoch": int(metrics.get("best_epoch") or exp.best_epoch or 0),
            "best_score": float(metrics.get("best_score") or exp.accuracy or 0.0),
            "final_accuracy": float(exp.accuracy or 0.0),
            "final_loss": float(exp.loss or 0.0),
            "epoch_count": int(exp.epoch_count or 0),
            "retention_state": exp.retention_state or "full",
        },
        "config": exp.config_json or {},
        "metrics": metrics,
        "dataset_version": {
            "id": dataset_version.id if dataset_version else None,
            "version": dataset_version.version if dataset_version else None,
            "lifecycle": dataset_version.lifecycle if dataset_version else None,
            "summary_json": dataset_version.summary_json if dataset_version else None,
        },
        "replay": {
            "api_path": replay_path,
            "best_epoch": int(metrics.get("best_epoch") or exp.best_epoch or 0),
            "run_id": exp.mongo_run_id,
        },
        "notes": exp.notes or "",
        "next_action": _recommend_next_action(exp, metrics),
    }


def get_experiment_report(
    db: Session,
    *,
    exp_id: int,
    track_export: bool,
    user: Optional[User],
) -> dict:
    exp = get_experiment_or_404(db, exp_id)
    ensure_experiment_access(exp, user)

    if track_export:
        record_audit_log(
            db,
            AuditAction.REPORT_GENERATED.value,
            "experiment",
            str(exp.id),
            actor_user_id=user.id if user else None,
            details={"project_id": exp.project_id, "dataset_version_id": exp.dataset_version_id},
        )
        db.commit()
    return build_report_payload(exp, db)


def run_retention(*, db: Session, user: Optional[User], dry_run: bool) -> dict:
    if user and not (user.is_superuser or user.role == "admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return {"results": retention_service.run(db, dry_run=dry_run), "dry_run": dry_run}


def delete_experiment(db: Session, *, exp_id: int, user: Optional[User]) -> dict:
    exp = get_experiment_or_404(db, exp_id)
    ensure_experiment_write_access(exp, user)

    mongo_runs.delete_experiment(exp)
    record_audit_log(
        db,
        AuditAction.EXPERIMENT_DELETED.value,
        "experiment",
        str(exp.id),
        actor_user_id=user.id if user else None,
        details={"project_id": exp.project_id, "dataset_version_id": exp.dataset_version_id},
    )
    db.delete(exp)
    db.commit()
    return {"status": "deleted", "id": exp_id}


def delete_all_experiments(db: Session, *, user: Optional[User]) -> dict:
    if user and not (user.is_superuser or user.role == "admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    experiments = db.query(Experiment).all()
    for exp in experiments:
        mongo_runs.delete_experiment(exp)
        db.delete(exp)
    db.commit()
    return {"status": "all deleted"}


def bulk_delete_experiments(db: Session, *, experiment_ids: List[int], user: Optional[User]) -> dict:
    if user and not (user.is_superuser or user.role == "admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    deleted = []
    not_found = []
    for exp_id in experiment_ids:
        exp = db.query(Experiment).filter(Experiment.id == exp_id).first()
        if not exp:
            not_found.append(exp_id)
            continue
        mongo_runs.delete_experiment(exp)
        db.delete(exp)
        deleted.append(exp_id)
    db.commit()
    return {"status": "bulk_deleted", "deleted": deleted, "not_found": not_found}
