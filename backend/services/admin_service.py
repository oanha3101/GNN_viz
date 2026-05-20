from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, or_
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
from services import auth_service
from services.dataset_service import build_unique_dataset_slug, get_dataset_by_id
from services.project_service import get_project_by_id, serialize_project
from services.experiment_service import serialize_experiment_summary
from services.hybrid_store import (
    blob_store,
    cleanup_orphan_blob_keys,
    find_orphan_blob_keys,
    mongo_runs,
    record_audit_log,
    retention_service,
)
from services.list_response import build_list_response


def iso_or_none(value) -> Optional[str]:
    if not value:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def _date_start(value: Optional[date]) -> Optional[datetime]:
    if value is None:
        return None
    return datetime.combine(value, time.min)


def _date_end(value: Optional[date]) -> Optional[datetime]:
    if value is None:
        return None
    return datetime.combine(value, time.max)


def _apply_date_range(query, column, *, date_from: Optional[date], date_to: Optional[date]):
    start = _date_start(date_from)
    end = _date_end(date_to)
    if start is not None:
        query = query.filter(column >= start)
    if end is not None:
        query = query.filter(column <= end)
    return query


def _paginate(query, *, page: int, page_size: int):
    total = query.count()
    rows = (
        query
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return total, rows


def serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "full_name": user.full_name,
        "bio": user.bio,
        "github_url": user.github_url,
        "organization": user.organization,
        "job_title": user.job_title,
        "location": user.location,
        "profile_image": user.profile_image,
        "role": user.role,
        "is_active": user.is_active,
        "created_at": iso_or_none(user.created_at),
        "updated_at": iso_or_none(user.updated_at),
    }


def _normalize_optional_text(value: Optional[str]) -> Optional[str]:
    return (value or "").strip() or None


def _validate_user_profile_updates(db: Session, *, user: User, updates: dict) -> dict:
    normalized = {}

    if "email" in updates:
        normalized["email"] = (updates.get("email") or "").strip().lower()
        if not normalized["email"]:
            raise HTTPException(status_code=400, detail="Email is required")
    if "username" in updates:
        normalized["username"] = (updates.get("username") or "").strip()
        if not normalized["username"]:
            raise HTTPException(status_code=400, detail="Username is required")

    for field_name in ("full_name", "bio", "organization", "job_title", "location", "profile_image"):
        if field_name in updates:
            normalized[field_name] = _normalize_optional_text(updates.get(field_name))

    if "github_url" in updates:
        github_url = _normalize_optional_text(updates.get("github_url"))
        if github_url and not (
            github_url.startswith("https://github.com/")
            or github_url.startswith("http://github.com/")
        ):
            raise HTTPException(status_code=400, detail="GitHub URL must point to github.com")
        normalized["github_url"] = github_url

    next_email = normalized.get("email", user.email)
    next_username = normalized.get("username", user.username)
    duplicate = (
        db.query(User)
        .filter(
            User.id != user.id,
            ((User.email == next_email) | (User.username == next_username)),
        )
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="Email or username already exists")

    return normalized


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
    blob_keys = blob_store.list_keys()
    orphan_blob_keys = find_orphan_blob_keys(db)
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
        "blob_object_count": len(blob_keys),
        "blob_orphan_count": len(orphan_blob_keys),
        "mongo_available": mongo_available,
        "redis_available": redis_online,
        "admin_user": serialize_user(admin) if admin else None,
    }


def list_users(
    db: Session,
    *,
    page: int,
    page_size: int,
    q: Optional[str],
    date_from: Optional[date],
    date_to: Optional[date],
) -> dict:
    query = db.query(User)
    if q:
        search = f"%{q.strip()}%"
        query = query.filter(
            or_(
                User.username.ilike(search),
                User.email.ilike(search),
                User.full_name.ilike(search),
                User.role.ilike(search),
            )
        )
    query = _apply_date_range(query, User.created_at, date_from=date_from, date_to=date_to)
    query = query.order_by(User.created_at.desc(), User.id.desc())
    total, rows = _paginate(query, page=page, page_size=page_size)
    return build_list_response([serialize_user(row) for row in rows], total=total, page=page, page_size=page_size)


def create_user(
    db: Session,
    *,
    payload: dict,
    password_hash: str,
    admin: Optional[User],
) -> dict:
    password = (payload.get("password") or "").strip()
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    user = auth_service.create_user_record(
        db,
        email=payload.get("email"),
        username=payload.get("username"),
        full_name=payload.get("full_name"),
        role=payload.get("role"),
        password_hash=password_hash,
        is_active=payload.get("is_active", True),
    )
    profile_updates = _validate_user_profile_updates(db, user=user, updates=payload)
    for field_name, field_value in profile_updates.items():
        setattr(user, field_name, field_value)
    record_audit_log(
        db,
        "user_created_by_admin",
        "user",
        str(user.id),
        actor_user_id=admin.id if admin else None,
        details={
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "is_active": user.is_active,
            "organization": user.organization,
            "job_title": user.job_title,
        },
    )
    db.commit()
    db.refresh(user)
    return serialize_user(user)


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


def update_user(
    db: Session,
    *,
    user_id: int,
    updates: dict,
    admin: Optional[User],
) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    details = {}
    profile_updates = _validate_user_profile_updates(db, user=user, updates=updates)
    if "email" in profile_updates and profile_updates["email"] != user.email:
        details["from_email"] = user.email
        details["to_email"] = profile_updates["email"]
        user.email = profile_updates["email"]
    if "username" in profile_updates and profile_updates["username"] != user.username:
        details["from_username"] = user.username
        details["to_username"] = profile_updates["username"]
        user.username = profile_updates["username"]
    for field_name in ("full_name", "bio", "github_url", "organization", "job_title", "location", "profile_image"):
        if field_name in profile_updates and getattr(user, field_name) != profile_updates[field_name]:
            details[f"from_{field_name}"] = getattr(user, field_name)
            details[f"to_{field_name}"] = profile_updates[field_name]
            setattr(user, field_name, profile_updates[field_name])
    if "role" in updates:
        role = updates["role"]
        if role not in {item.value for item in UserRole}:
            raise HTTPException(status_code=400, detail="Invalid role")
        if role != user.role:
            details["from_role"] = user.role
            details["to_role"] = role
            user.role = role
    if "is_active" in updates:
        is_active = bool(updates["is_active"])
        if is_active != user.is_active:
            details["from_is_active"] = user.is_active
            details["to_is_active"] = is_active
            user.is_active = is_active

    if not details:
        return serialize_user(user)

    user.updated_at = datetime.utcnow()

    record_audit_log(
        db,
        "user_updated",
        "user",
        str(user.id),
        actor_user_id=admin.id if admin else None,
        details=details,
    )
    db.commit()
    db.refresh(user)
    return serialize_user(user)


def delete_user(
    db: Session,
    *,
    user_id: int,
    admin: Optional[User],
) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if admin and user.id == admin.id:
        raise HTTPException(status_code=400, detail="Admin cannot delete the current account")

    project_count = db.query(func.count(Project.id)).filter(Project.owner_id == user.id).scalar() or 0
    dataset_count = db.query(func.count(Dataset.id)).filter(Dataset.owner_id == user.id).scalar() or 0
    experiment_count = db.query(func.count(Experiment.id)).filter(Experiment.owner_id == user.id).scalar() or 0
    session_count = db.query(func.count(TrainingSession.id)).filter(TrainingSession.user_id == user.id).scalar() or 0
    created_version_count = db.query(func.count(DatasetVersion.id)).filter(DatasetVersion.created_by == user.id).scalar() or 0
    published_version_count = db.query(func.count(DatasetVersion.id)).filter(DatasetVersion.published_by == user.id).scalar() or 0

    if project_count or dataset_count or experiment_count or session_count:
        blockers = []
        if project_count:
            blockers.append(f"{project_count} project(s)")
        if dataset_count:
            blockers.append(f"{dataset_count} dataset(s)")
        if experiment_count:
            blockers.append(f"{experiment_count} experiment(s)")
        if session_count:
            blockers.append(f"{session_count} session(s)")
        raise HTTPException(
            status_code=409,
            detail=(
                "User cannot be deleted because it still owns or references workspace data: "
                + ", ".join(blockers)
                + ". Disable the account instead if you only want to block access."
            ),
        )

    if created_version_count:
        (
            db.query(DatasetVersion)
            .filter(DatasetVersion.created_by == user.id)
            .update({"created_by": None}, synchronize_session=False)
        )
    if published_version_count:
        (
            db.query(DatasetVersion)
            .filter(DatasetVersion.published_by == user.id)
            .update({"published_by": None}, synchronize_session=False)
        )
    (
        db.query(AuditLog)
        .filter(AuditLog.actor_user_id == user.id)
        .update({"actor_user_id": None}, synchronize_session=False)
    )

    record_audit_log(
        db,
        "user_deleted",
        "user",
        str(user.id),
        actor_user_id=admin.id if admin else None,
        details={"username": user.username, "email": user.email},
    )
    db.flush()
    db.delete(user)
    db.commit()
    return {"status": "deleted", "id": user_id}


def list_admin_datasets(
    db: Session,
    *,
    page: int,
    page_size: int,
    q: Optional[str],
    date_from: Optional[date],
    date_to: Optional[date],
) -> dict:
    query = db.query(Dataset)
    if q:
        search = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Dataset.name.ilike(search),
                Dataset.slug.ilike(search),
                Dataset.description.ilike(search),
            )
        )
    query = _apply_date_range(query, Dataset.created_at, date_from=date_from, date_to=date_to)
    query = query.order_by(Dataset.created_at.desc(), Dataset.id.desc())
    total, rows = _paginate(query, page=page, page_size=page_size)
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
                "description": dataset.description,
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
    return build_list_response(items, total=total, page=page, page_size=page_size)


def list_admin_projects(
    db: Session,
    *,
    page: int,
    page_size: int,
    q: Optional[str],
    date_from: Optional[date],
    date_to: Optional[date],
) -> dict:
    query = db.query(Project)
    if q:
        search = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Project.title.ilike(search),
                Project.description.ilike(search),
                Project.model_type.ilike(search),
            )
        )
    query = _apply_date_range(query, Project.created_at, date_from=date_from, date_to=date_to)
    query = query.order_by(Project.created_at.desc(), Project.id.desc())
    total, rows = _paginate(query, page=page, page_size=page_size)
    items = []
    for project in rows:
        experiment_count = db.query(func.count(Experiment.id)).filter(Experiment.project_id == project.id).scalar() or 0
        session_count = db.query(func.count(TrainingSession.id)).filter(TrainingSession.project_id == project.id).scalar() or 0
        items.append(
            {
                **serialize_project(project),
                "experiment_count": experiment_count,
                "session_count": session_count,
            }
        )
    return build_list_response(items, total=total, page=page, page_size=page_size)


def update_admin_project(
    db: Session,
    *,
    project_id: int,
    updates: dict,
    admin: Optional[User],
) -> dict:
    project = get_project_by_id(db, project_id)
    details = {}

    for field in ("title", "description", "task_type", "model_type", "is_public"):
        if field not in updates:
            continue
        value = updates[field]
        if field == "title" and value is not None:
            value = value.strip()
            if not value:
                raise HTTPException(status_code=400, detail="Project title cannot be empty")
        if field == "description":
            value = (value or "").strip() or None
        if getattr(project, field) != value:
            details[field] = {"from": getattr(project, field), "to": value}
            setattr(project, field, value)

    if not details:
        return serialize_project(project)

    record_audit_log(
        db,
        "project_updated",
        "project",
        str(project.id),
        actor_user_id=admin.id if admin else None,
        details=details,
    )
    db.commit()
    db.refresh(project)
    return serialize_project(project)


def delete_admin_project(
    db: Session,
    *,
    project_id: int,
    admin: Optional[User],
) -> dict:
    project = get_project_by_id(db, project_id)
    experiment_count = db.query(func.count(Experiment.id)).filter(Experiment.project_id == project.id).scalar() or 0
    session_count = db.query(func.count(TrainingSession.id)).filter(TrainingSession.project_id == project.id).scalar() or 0

    if experiment_count or session_count:
        blockers = []
        if experiment_count:
            blockers.append(f"{experiment_count} experiment(s)")
        if session_count:
            blockers.append(f"{session_count} session(s)")
        raise HTTPException(
            status_code=409,
            detail=(
                "Project cannot be deleted because it is still referenced by "
                + ", ".join(blockers)
                + ". Clear those records first."
            ),
        )

    record_audit_log(
        db,
        "project_deleted",
        "project",
        str(project.id),
        actor_user_id=admin.id if admin else None,
        details={"title": project.title},
    )
    db.delete(project)
    db.commit()
    return {"status": "deleted", "id": project_id}


def update_admin_dataset(
    db: Session,
    *,
    dataset_id: int,
    updates: dict,
    admin: Optional[User],
) -> dict:
    dataset = get_dataset_by_id(db, dataset_id)
    details = {}

    if "name" in updates and updates["name"] is not None:
        name = updates["name"].strip()
        if not name:
            raise HTTPException(status_code=400, detail="Dataset name cannot be empty")
        if name != dataset.name:
            previous_name = dataset.name
            details["from_name"] = dataset.name
            details["to_name"] = name
            dataset.name = name
            dataset.slug = build_unique_dataset_slug(db, name) if name != previous_name else dataset.slug
    if "description" in updates:
        description = (updates["description"] or "").strip() or None
        if description != dataset.description:
            details["description_updated"] = True
            dataset.description = description
    if "is_public" in updates and updates["is_public"] is not None:
        is_public = bool(updates["is_public"])
        if is_public != dataset.is_public:
            details["from_is_public"] = dataset.is_public
            details["to_is_public"] = is_public
            dataset.is_public = is_public

    if not details:
        return {
            "id": dataset.id,
            "name": dataset.name,
            "slug": dataset.slug,
            "description": dataset.description,
            "owner_id": dataset.owner_id,
            "is_public": dataset.is_public,
            "created_at": iso_or_none(dataset.created_at),
        }

    record_audit_log(
        db,
        "dataset_updated",
        "dataset",
        str(dataset.id),
        actor_user_id=admin.id if admin else None,
        details=details,
    )
    db.commit()
    db.refresh(dataset)
    return {
        "id": dataset.id,
        "name": dataset.name,
        "slug": dataset.slug,
        "description": dataset.description,
        "owner_id": dataset.owner_id,
        "is_public": dataset.is_public,
        "current_version_id": dataset.current_version_id,
        "created_at": iso_or_none(dataset.created_at),
    }


def delete_admin_dataset(
    db: Session,
    *,
    dataset_id: int,
    admin: Optional[User],
) -> dict:
    dataset = get_dataset_by_id(db, dataset_id)

    experiment_count = db.query(func.count(Experiment.id)).filter(Experiment.dataset_id == dataset.id).scalar() or 0
    version_ids = [row.id for row in dataset.versions]
    version_experiment_count = 0
    if version_ids:
        version_experiment_count = (
            db.query(func.count(Experiment.id))
            .filter(Experiment.dataset_version_id.in_(version_ids))
            .scalar()
            or 0
        )
    session_count = 0
    if version_ids:
        session_count = (
            db.query(func.count(TrainingSession.id))
            .filter(TrainingSession.dataset_version_id.in_(version_ids))
            .scalar()
            or 0
        )

    if experiment_count or version_experiment_count or session_count:
        blockers = []
        if experiment_count:
            blockers.append(f"{experiment_count} experiment(s) linked to dataset")
        if version_experiment_count:
            blockers.append(f"{version_experiment_count} experiment(s) linked to dataset versions")
        if session_count:
            blockers.append(f"{session_count} session(s) linked to dataset versions")
        raise HTTPException(
            status_code=409,
            detail="Dataset cannot be deleted because it is referenced by " + ", ".join(blockers),
        )

    record_audit_log(
        db,
        "dataset_deleted",
        "dataset",
        str(dataset.id),
        actor_user_id=admin.id if admin else None,
        details={"name": dataset.name, "slug": dataset.slug},
    )
    dataset.current_version_id = None
    db.flush()
    db.delete(dataset)
    db.commit()
    return {"status": "deleted", "id": dataset_id}


def list_admin_experiments(
    db: Session,
    *,
    page: int,
    page_size: int,
    status: Optional[str],
    q: Optional[str],
    date_from: Optional[date],
    date_to: Optional[date],
) -> dict:
    query = db.query(Experiment)
    if status:
        query = query.filter(Experiment.status == status)
    if q:
        search = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Experiment.title.ilike(search),
                Experiment.dataset_name.ilike(search),
                Experiment.model_type.ilike(search),
                Experiment.notes.ilike(search),
                Experiment.status.ilike(search),
            )
        )
    query = _apply_date_range(query, Experiment.created_at, date_from=date_from, date_to=date_to)
    query = query.order_by(Experiment.created_at.desc(), Experiment.id.desc())
    total, rows = _paginate(query, page=page, page_size=page_size)
    return build_list_response(
        [serialize_experiment_summary(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


def list_admin_sessions(
    db: Session,
    *,
    page: int,
    page_size: int,
    status: Optional[str],
    q: Optional[str],
    date_from: Optional[date],
    date_to: Optional[date],
) -> dict:
    query = db.query(TrainingSession)
    if status:
        query = query.filter(TrainingSession.status == status)
    if q:
        search = f"%{q.strip()}%"
        query = query.filter(
            or_(
                TrainingSession.id.ilike(search),
                TrainingSession.dataset_name.ilike(search),
                TrainingSession.model_type.ilike(search),
                TrainingSession.status.ilike(search),
                TrainingSession.error_message.ilike(search),
            )
        )
    query = _apply_date_range(query, TrainingSession.started_at, date_from=date_from, date_to=date_to)
    query = query.order_by(TrainingSession.started_at.desc(), TrainingSession.id.desc())
    total, rows = _paginate(query, page=page, page_size=page_size)
    return build_list_response([serialize_session(row) for row in rows], total=total, page=page, page_size=page_size)


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


def delete_session(db: Session, *, session_id: str, admin: Optional[User]) -> dict:
    session = get_session_or_404(db, session_id)

    if session.status in (SessionStatus.PENDING.value, SessionStatus.RUNNING.value):
        raise HTTPException(
            status_code=409,
            detail="Session is still active. Stop it before deleting.",
        )

    snapshot_blob_refs = [
        row.blob_ref
        for row in session.snapshots
        if row.blob_ref and not str(row.blob_ref).startswith("session:")
    ]
    deleted_blob_refs = []
    for blob_ref in snapshot_blob_refs:
        try:
            if blob_store.exists(blob_ref) and blob_store.delete(blob_ref):
                deleted_blob_refs.append(blob_ref)
        except Exception:
            continue

    deleted_snapshot_docs = mongo_runs.delete_session_snapshots(session.id)
    session_manager.cleanup_session(session.id)

    details = {
        "status": session.status,
        "experiment_id": session.experiment_id,
        "project_id": session.project_id,
        "deleted_snapshot_docs": deleted_snapshot_docs,
        "deleted_blob_refs": deleted_blob_refs,
    }
    record_audit_log(
        db,
        "session_deleted",
        "training_session",
        session.id,
        actor_user_id=admin.id if admin else None,
        details=details,
    )
    db.delete(session)
    db.commit()
    return {"status": "deleted", "id": session_id}


def list_audit_logs(
    db: Session,
    *,
    page: int,
    page_size: int,
    action: Optional[str],
    target_type: Optional[str],
    q: Optional[str],
    date_from: Optional[date],
    date_to: Optional[date],
) -> dict:
    query = db.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action == action)
    if target_type:
        query = query.filter(AuditLog.target_type == target_type)
    if q:
        search = f"%{q.strip()}%"
        query = query.filter(
            or_(
                AuditLog.action.ilike(search),
                AuditLog.target_type.ilike(search),
                AuditLog.target_id.ilike(search),
            )
        )
    query = _apply_date_range(query, AuditLog.created_at, date_from=date_from, date_to=date_to)
    query = query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
    total, rows = _paginate(query, page=page, page_size=page_size)
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
        page=page,
        page_size=page_size,
    )


def run_retention(db: Session, *, dry_run: bool) -> dict:
    return {"results": retention_service.run(db, dry_run=dry_run), "dry_run": dry_run}


def run_blob_cleanup(db: Session, *, dry_run: bool, admin: Optional[User]) -> dict:
    result = cleanup_orphan_blob_keys(db, dry_run=dry_run)
    if not dry_run:
        record_audit_log(
            db,
            AuditAction.RETENTION_PURGED.value,
            "blob_store",
            blob_store.provider,
            actor_user_id=admin.id if admin else None,
            details={
                "provider": result["provider"],
                "deleted_keys": result["deleted_keys"],
                "deleted_count": result["deleted_count"],
                "orphan_count": result["orphan_count"],
            },
        )
        db.commit()
    return result
