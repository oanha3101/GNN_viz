from typing import Any, Dict, Optional

from fastapi import HTTPException

from core.session_manager import session_manager
from models.sql_models import AuditAction, DatasetVersion, Project, SessionStatus, TrainingSession, User
from services.hybrid_store import PersistenceUnavailableError, record_audit_log


def build_session_config(payload: Dict[str, Any]) -> dict:
    return {
        **(payload.get("config") or {}),
        "task": payload["task"],
        "model": payload["model"],
        "dataset": payload["dataset"],
        "epochs": payload["epochs"],
        "lr": payload["lr"],
        "hidden": payload["hidden"],
    }


def create_session(*, payload: Dict[str, Any], user: Optional[User]) -> dict:
    if user and user.role == "viewer":
        raise HTTPException(status_code=403, detail="Viewer accounts cannot create training sessions")

    config = build_session_config(payload)
    session_id = session_manager.create_session(
        config=config,
        task_type=payload["task"],
        model_type=payload["model"],
        dataset_name=payload["dataset"],
        user_id=user.id if user else None,
        project_id=payload.get("project_id"),
        dataset_version_id=payload.get("dataset_version_id"),
    )
    return {
        "session_id": session_id,
        "ws_url": "/ws/train",
        "status": "pending",
    }


def get_session_or_404(session_id: str) -> dict:
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


def _get_session_row_or_404(db, session_id: str) -> TrainingSession:
    session_row = db.query(TrainingSession).filter(TrainingSession.id == session_id).first()
    if not session_row:
        raise HTTPException(status_code=404, detail="Session not found")
    return session_row


def ensure_session_access(session_row: TrainingSession, user: Optional[User], *, write: bool = False) -> None:
    if user is None:
        return
    if user.is_superuser or user.role == "admin":
        return
    if write and user.role == "viewer":
        raise HTTPException(status_code=403, detail="Viewer accounts cannot modify training sessions")
    if session_row.user_id not in (None, user.id):
        raise HTTPException(status_code=403, detail="Not allowed to access this session")


RESUME_CONFIG_KEYS = {
    "task",
    "model",
    "dataset",
    "epochs",
    "lr",
    "hidden",
    "project_id",
    "dataset_version_id",
    "session_id",
    "uploaded_file_path",
    "upload_metadata",
}


def _build_dataset_version_name(version: Optional[DatasetVersion]) -> Optional[str]:
    if not version:
        return None
    dataset_name = version.dataset.name if version.dataset else None
    if dataset_name:
        return f"{dataset_name} v{version.version}"
    return f"Version #{version.id}"


def get_session_payload(db, session_id: str, user: Optional[User]) -> dict:
    session = get_session_or_404(session_id)
    session_row = _get_session_row_or_404(db, session_id)
    ensure_session_access(session_row, user)
    return session


def get_resume_data(db, session_id: str, user: Optional[User]) -> dict:
    session = get_session_or_404(session_id)
    session_row = _get_session_row_or_404(db, session_id)
    ensure_session_access(session_row, user)

    project = db.query(Project).filter(Project.id == session_row.project_id).first() if session_row.project_id else None
    dataset_version = (
        db.query(DatasetVersion).filter(DatasetVersion.id == session_row.dataset_version_id).first()
        if session_row.dataset_version_id
        else None
    )
    config = session["config"] or {}
    try:
        snapshots = session_manager.get_snapshots_from(session_id, 0)
    except PersistenceUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    best_epoch = session_row.experiment.best_epoch if session_row.experiment else session["last_epoch"]
    task_config = {
        key: value
        for key, value in config.items()
        if key not in RESUME_CONFIG_KEYS
    }
    return {
        "session_id": session_id,
        "task_type": session["task_type"],
        "model_type": session["model_type"],
        "dataset_name": session["dataset_name"],
        "project_id": session["project_id"],
        "project_title": project.title if project else None,
        "dataset_id": dataset_version.dataset_id if dataset_version else None,
        "dataset_version_id": session["dataset_version_id"],
        "dataset_version_name": _build_dataset_version_name(dataset_version),
        "config": config,
        "task_config": task_config,
        "uploaded_file_path": config.get("uploaded_file_path"),
        "upload_metadata": config.get("upload_metadata"),
        "ws_url": "/ws/train",
        "last_epoch": session["last_epoch"],
        "last_seq": session["last_seq"],
        "status": session["status"],
        "experiment_id": session["experiment_id"],
        "report_path": f"/api/experiments/{session['experiment_id']}/report" if session["experiment_id"] else None,
        "replay_path": (
            f"/api/experiments/{session['experiment_id']}/replay?epoch={best_epoch or 0}"
            if session["experiment_id"]
            else None
        ),
        "snapshot_count": len(snapshots),
        "snapshots": snapshots,
    }


def update_session_status(*, db, session_id: str, status: str, user: Optional[User]) -> dict:
    session_row = _get_session_row_or_404(db, session_id)
    ensure_session_access(session_row, user, write=True)
    get_session_or_404(session_id)
    session_manager.update_status(session_id, status)
    return {"session_id": session_id, "status": status}


def stop_session(*, db, session_id: str, user: Optional[User]) -> dict:
    session = get_session_or_404(session_id)
    session_row = _get_session_row_or_404(db, session_id)
    ensure_session_access(session_row, user, write=True)

    if session["status"] in {
        SessionStatus.COMPLETED.value,
        SessionStatus.FAILED.value,
        SessionStatus.STOPPED.value,
    }:
        return {"session_id": session_id, "status": session["status"]}

    session_manager.stop_session(session_id)
    record_audit_log(
        db,
        AuditAction.SESSION_STOPPED.value,
        "training_session",
        session_id,
        actor_user_id=user.id if user else None,
        details={"status_before": session["status"]},
    )
    db.commit()
    return {"session_id": session_id, "status": SessionStatus.STOPPED.value}
