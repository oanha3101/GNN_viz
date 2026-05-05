from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from core.session_manager import session_manager
from database import mongo_available, redis_client
from models.sql_models import (
    AuditAction,
    AuditLog,
    Dataset,
    DatasetVersion,
    Experiment,
    Project,
    SessionStatus,
    TrainingSession,
    User,
    UserRole,
)
from services.experiment_service import serialize_experiment_summary
from services.hybrid_store import blob_store, record_audit_log, retention_service
from services.list_response import build_list_response


def iso_or_none(value) -> Optional[str]:
    if not value:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "full_name": user.full_name,
        "role": user.role,
        "is_active": user.is_active,
        "created_at": iso_or_none(user.created_at),
    }


def serialize_session(session: TrainingSession) -> dict:
    return {
        "id": session.id,
        "user_id": session.user_id,
        "project_id": session.project_id,
        "experiment_id": session.experiment_id,
        "dataset_version_id": session.dataset_version_id,
        "task_type": session.task_type,
        "model_type": session.model_type,
        "dataset_name": session.dataset_name,
        "status": session.status,
        "last_epoch": session.last_epoch,
        "total_epochs": session.total_epochs,
        "last_seq": session.last_seq,
        "started_at": iso_or_none(session.started_at),
        "ended_at": iso_or_none(session.ended_at),
        "error_message": session.error_message,
        "mongo_run_id": session.mongo_run_id,
    }


def get_admin_summary(db: Session, admin: Optional[User]) -> dict:
    now = datetime.utcnow()
    seven_days_ago = now - timedelta(days=7)
    try:
        redis_online = bool(redis_client.ping())
    except Exception:
        redis_online = False
    return {
        "users": db.query(func.count(User.id)).scalar() or 0,
        "projects": db.query(func.count(Project.id)).scalar() or 0,
        "datasets": db.query(func.count(Dataset.id)).scalar() or 0,
        "dataset_versions": db.query(func.count(DatasetVersion.id)).scalar() or 0,
        "experiments": db.query(func.count(Experiment.id)).scalar() or 0,
        "training_sessions": db.query(func.count(TrainingSession.id)).scalar() or 0,
        "active_sessions": db.query(func.count(TrainingSession.id))
        .filter(TrainingSession.status.in_([SessionStatus.PENDING.value, SessionStatus.RUNNING.value]))
        .scalar()
        or 0,
        "failed_sessions_recent": db.query(func.count(TrainingSession.id))
        .filter(
            TrainingSession.status == SessionStatus.FAILED.value,
            TrainingSession.started_at >= seven_days_ago,
        )
        .scalar()
        or 0,
        "retention_compacted_runs": db.query(func.count(Experiment.id))
        .filter(Experiment.retention_state == "compacted")
        .scalar()
        or 0,
        "recent_audit_events": db.query(func.count(AuditLog.id))
        .filter(AuditLog.created_at >= seven_days_ago)
        .scalar()
        or 0,
        "blob_provider": blob_store.provider,
        "mongo_available": mongo_available,
        "redis_available": redis_online,
        "admin_user": serialize_user(admin) if admin else None,
    }


def list_users(db: Session, *, limit: int) -> dict:
    query = db.query(User)
    total = query.count()
    rows = query.order_by(User.created_at.desc()).limit(limit).all()
    return build_list_response([serialize_user(row) for row in rows], total=total, page=1, page_size=len(rows))


def update_user_role(
    db: Session,
    *,
    user_id: int,
    role: str,
    admin: Optional[User],
) -> dict:
    if role not in {item.value for item in UserRole}:
        raise HTTPException(status_code=400, detail="Invalid role")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    previous_role = user.role
    user.role = role
    record_audit_log(
        db,
        AuditAction.ROLE_CHANGED.value,
        "user",
        str(user.id),
        actor_user_id=admin.id if admin else None,
        details={"from_role": previous_role, "to_role": role},
    )
    db.commit()
    db.refresh(user)
    return serialize_user(user)


def list_admin_datasets(db: Session, *, limit: int) -> dict:
    query = db.query(Dataset)
    total = query.count()
    rows = query.order_by(Dataset.created_at.desc()).limit(limit).all()
    items = []
    for dataset in rows:
        version_count = db.query(func.count(DatasetVersion.id)).filter(DatasetVersion.dataset_id == dataset.id).scalar() or 0
        current_version = (
            db.query(DatasetVersion).filter(DatasetVersion.id == dataset.current_version_id).first()
            if dataset.current_version_id
            else None
        )
        usage_count = db.query(func.count(Experiment.id)).filter(Experiment.dataset_id == dataset.id).scalar() or 0
        items.append(
            {
                "id": dataset.id,
                "name": dataset.name,
                "slug": dataset.slug,
                "owner_id": dataset.owner_id,
                "is_public": dataset.is_public,
                "version_count": version_count,
                "usage_count": usage_count,
                "current_version": {
                    "id": current_version.id,
                    "version": current_version.version,
                    "lifecycle": current_version.lifecycle,
                }
                if current_version
                else None,
                "created_at": iso_or_none(dataset.created_at),
            }
        )
    return build_list_response(items, total=total, page=1, page_size=len(items))


def list_admin_experiments(
    db: Session,
    *,
    limit: int,
    status: Optional[str],
) -> dict:
    query = db.query(Experiment)
    if status:
        query = query.filter(Experiment.status == status)
    total = query.count()
    rows = query.order_by(Experiment.created_at.desc()).limit(limit).all()
    return build_list_response(
        [serialize_experiment_summary(row) for row in rows],
        total=total,
        page=1,
        page_size=len(rows),
    )


def list_admin_sessions(
    db: Session,
    *,
    limit: int,
    status: Optional[str],
) -> dict:
    query = db.query(TrainingSession)
    if status:
        query = query.filter(TrainingSession.status == status)
    total = query.count()
    rows = query.order_by(TrainingSession.started_at.desc()).limit(limit).all()
    return build_list_response([serialize_session(row) for row in rows], total=total, page=1, page_size=len(rows))


def get_session_or_404(db: Session, session_id: str) -> TrainingSession:
    session = db.query(TrainingSession).filter(TrainingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


def stop_session(db: Session, *, session_id: str, admin: Optional[User]) -> dict:
    session = get_session_or_404(db, session_id)
    session_manager.stop_session(session_id)
    record_audit_log(
        db,
        AuditAction.SESSION_STOPPED.value,
        "training_session",
        session_id,
        actor_user_id=admin.id if admin else None,
        details={"status_before": session.status},
    )
    db.commit()
    db.refresh(session)
    return serialize_session(session)


def retry_session(db: Session, *, session_id: str, admin: Optional[User]) -> dict:
    session = get_session_or_404(db, session_id)
    payload = session_manager.retry_session(session_id)
    if not payload:
        raise HTTPException(status_code=500, detail="Could not retry session")

    record_audit_log(
        db,
        AuditAction.SESSION_RETRIED.value,
        "training_session",
        session_id,
        actor_user_id=admin.id if admin else None,
        details={"config_json": session.config_json},
    )
    db.commit()
    return payload


def list_audit_logs(
    db: Session,
    *,
    limit: int,
    action: Optional[str],
    target_type: Optional[str],
) -> dict:
    query = db.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action == action)
    if target_type:
        query = query.filter(AuditLog.target_type == target_type)
    total = query.count()
    rows = query.order_by(AuditLog.created_at.desc()).limit(limit).all()
    return build_list_response(
        [
            {
                "id": row.id,
                "actor_user_id": row.actor_user_id,
                "action": row.action,
                "target_type": row.target_type,
                "target_id": row.target_id,
                "details_json": row.details_json,
                "created_at": iso_or_none(row.created_at),
            }
            for row in rows
        ],
        total=total,
        page=1,
        page_size=len(rows),
    )


def run_retention(db: Session, *, dry_run: bool) -> dict:
    return {"results": retention_service.run(db, dry_run=dry_run), "dry_run": dry_run}
