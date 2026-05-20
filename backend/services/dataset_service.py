from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func
from sqlalchemy.orm import Session

from models.sql_models import AuditAction, Dataset, DatasetLifecycle, DatasetVersion, Experiment, TrainingSession, User
from services.hybrid_store import record_audit_log, slugify
from services.list_response import build_list_response


def _current_version_summary(dataset: Dataset) -> Dict[str, Any]:
    if getattr(dataset, "current_version", None) and isinstance(dataset.current_version.summary_json, dict):
        return dataset.current_version.summary_json
    return {}


def _sample_catalog(dataset: Dataset) -> Optional[Dict[str, Any]]:
    summary = _current_version_summary(dataset)
    catalog = summary.get("sample_catalog")
    return catalog if isinstance(catalog, dict) else None


def _dataset_is_sample(dataset: Dataset) -> bool:
    return _sample_catalog(dataset) is not None


def iso_or_none(value: Optional[datetime]) -> Optional[str]:
    if not value:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def serialize_dataset(dataset: Dataset) -> dict:
    current_version = getattr(dataset, "current_version", None)
    summary = _current_version_summary(dataset)
    sample_catalog = _sample_catalog(dataset)
    recommended_task_ids = summary.get("recommended_task_ids") or sample_catalog.get("recommended_task_ids") if sample_catalog else None
    if not recommended_task_ids and summary.get("task_profile_id"):
        recommended_task_ids = [summary["task_profile_id"]]

    return {
        "id": dataset.id,
        "name": dataset.name,
        "slug": dataset.slug,
        "description": dataset.description,
        "owner_id": dataset.owner_id,
        "is_public": dataset.is_public,
        "current_version_id": dataset.current_version_id,
        "created_at": iso_or_none(dataset.created_at),
        "current_version_lifecycle": current_version.lifecycle if current_version else None,
        "current_version_summary": summary or None,
        "is_sample": bool(sample_catalog),
        "sample_catalog": sample_catalog,
        "recommended_task_ids": recommended_task_ids or [],
        "recommended_task_label": (
            sample_catalog.get("recommended_task_label")
            if sample_catalog
            else summary.get("task_profile_name")
        ),
    }


def serialize_dataset_version(version: DatasetVersion) -> dict:
    return {
        "id": version.id,
        "dataset_id": version.dataset_id,
        "version": version.version,
        "lifecycle": version.lifecycle,
        "schema_version": version.schema_version,
        "summary_json": version.summary_json,
        "validation_json": version.validation_json,
        "source_files_json": version.source_files_json,
        "raw_blob_key": version.raw_blob_key,
        "processed_blob_key": version.processed_blob_key,
        "created_by": version.created_by,
        "published_by": version.published_by,
        "created_at": iso_or_none(version.created_at),
        "published_at": iso_or_none(version.published_at),
    }


def get_dataset_by_id(db: Session, dataset_id: int) -> Dataset:
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


def ensure_dataset_write_access(dataset: Dataset, user: Optional[User]) -> None:
    if user is None:
        return
    if user.is_superuser or user.role == "admin":
        return
    if user.role == "viewer" or dataset.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Not allowed to modify this dataset")


def ensure_dataset_read_access(dataset: Dataset, user: Optional[User]) -> None:
    if user is None:
        return
    if user.is_superuser or user.role == "admin" or dataset.is_public:
        return
    if dataset.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Not allowed to access this dataset")


def build_unique_dataset_slug(db: Session, name: str) -> str:
    base_slug = slugify(name)
    slug = base_slug
    suffix = 2
    while db.query(Dataset.id).filter(Dataset.slug == slug).first():
        slug = f"{base_slug}-{suffix}"
        suffix += 1
    return slug


def create_dataset(
    db: Session,
    *,
    payload: Dict[str, Any],
    user: Optional[User],
) -> dict:
    if user and user.role == "viewer":
        raise HTTPException(status_code=403, detail="Viewer accounts cannot create datasets")

    dataset = Dataset(
        name=payload["name"],
        slug=build_unique_dataset_slug(db, payload["name"]),
        description=payload.get("description"),
        owner_id=user.id if user else None,
        is_public=bool(payload.get("is_public", False)),
    )
    db.add(dataset)
    db.flush()

    version = DatasetVersion(
        dataset_id=dataset.id,
        version=1,
        lifecycle=DatasetLifecycle.DRAFT.value,
        summary_json=payload.get("summary_json"),
        validation_json=payload.get("validation_json"),
        source_files_json=payload.get("source_files_json"),
        raw_blob_key=payload.get("raw_blob_key"),
        processed_blob_key=payload.get("processed_blob_key"),
        created_by=user.id if user else None,
    )
    db.add(version)
    db.flush()
    dataset.current_version_id = version.id

    record_audit_log(
        db,
        AuditAction.DATASET_UPLOADED.value,
        "dataset",
        str(dataset.id),
        actor_user_id=user.id if user else None,
        details={"version_id": version.id},
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Dataset creation conflicted with an existing record") from exc
    return {"dataset": serialize_dataset(dataset), "version": serialize_dataset_version(version)}


def list_datasets(db: Session, user: Optional[User]) -> dict:
    query = db.query(Dataset)
    if user and not (user.is_superuser or user.role == "admin"):
        query = query.filter(
            (Dataset.owner_id == user.id)
            | (Dataset.is_public.is_(True))
            | (Dataset.owner_id.is_(None))
        )
    rows = query.all()
    rows = sorted(
        rows,
        key=lambda row: (
            0 if _dataset_is_sample(row) else 1,
            -(row.created_at.timestamp() if row.created_at else 0),
        ),
    )
    return build_list_response([serialize_dataset(row) for row in rows])


def get_dataset_payload(db: Session, dataset_id: int, user: Optional[User]) -> dict:
    dataset = get_dataset_by_id(db, dataset_id)
    ensure_dataset_read_access(dataset, user)
    versions = (
        db.query(DatasetVersion)
        .filter(DatasetVersion.dataset_id == dataset.id)
        .order_by(DatasetVersion.version.desc())
        .all()
    )
    return {
        "dataset": serialize_dataset(dataset),
        "versions": [serialize_dataset_version(version) for version in versions],
    }


def create_dataset_version(
    db: Session,
    *,
    dataset_id: int,
    payload: Dict[str, Any],
    user: Optional[User],
) -> dict:
    dataset = get_dataset_by_id(db, dataset_id)
    ensure_dataset_write_access(dataset, user)
    latest = (
        db.query(DatasetVersion)
        .filter(DatasetVersion.dataset_id == dataset.id)
        .order_by(DatasetVersion.version.desc())
        .first()
    )
    next_version = (latest.version + 1) if latest else 1
    version = DatasetVersion(
        dataset_id=dataset.id,
        version=next_version,
        lifecycle=DatasetLifecycle.DRAFT.value,
        summary_json=payload.get("summary_json"),
        validation_json=payload.get("validation_json"),
        source_files_json=payload.get("source_files_json"),
        raw_blob_key=payload.get("raw_blob_key"),
        processed_blob_key=payload.get("processed_blob_key"),
        created_by=user.id if user else None,
    )
    db.add(version)
    db.commit()
    db.refresh(version)
    return serialize_dataset_version(version)


def publish_dataset_version(
    db: Session,
    *,
    dataset_id: int,
    version_id: int,
    user: Optional[User],
) -> dict:
    dataset = get_dataset_by_id(db, dataset_id)
    ensure_dataset_write_access(dataset, user)
    version = (
        db.query(DatasetVersion)
        .filter(DatasetVersion.id == version_id, DatasetVersion.dataset_id == dataset.id)
        .first()
    )
    if not version:
        raise HTTPException(status_code=404, detail="Dataset version not found")

    version.lifecycle = DatasetLifecycle.PUBLISHED.value
    version.published_by = user.id if user else None
    version.published_at = datetime.utcnow()
    dataset.current_version_id = version.id

    record_audit_log(
        db,
        AuditAction.DATASET_PUBLISHED.value,
        "dataset_version",
        str(version.id),
        actor_user_id=user.id if user else None,
        details={"dataset_id": dataset.id},
    )
    db.commit()
    db.refresh(version)
    return serialize_dataset_version(version)


def deprecate_dataset_version(
    db: Session,
    *,
    dataset_id: int,
    version_id: int,
    user: Optional[User],
) -> dict:
    dataset = get_dataset_by_id(db, dataset_id)
    ensure_dataset_write_access(dataset, user)
    version = (
        db.query(DatasetVersion)
        .filter(DatasetVersion.id == version_id, DatasetVersion.dataset_id == dataset.id)
        .first()
    )
    if not version:
        raise HTTPException(status_code=404, detail="Dataset version not found")

    version.lifecycle = DatasetLifecycle.DEPRECATED.value
    record_audit_log(
        db,
        AuditAction.DATASET_DEPRECATED.value,
        "dataset_version",
        str(version.id),
        actor_user_id=user.id if user else None,
        details={"dataset_id": dataset.id},
    )
    db.commit()
    db.refresh(version)
    return serialize_dataset_version(version)


def update_dataset(
    db: Session,
    *,
    dataset_id: int,
    updates: Dict[str, Any],
    user: User,
) -> dict:
    dataset = get_dataset_by_id(db, dataset_id)
    ensure_dataset_write_access(dataset, user)
    details = {}

    if "name" in updates and updates["name"] is not None:
        name = updates["name"].strip()
        if not name:
            raise HTTPException(status_code=400, detail="Dataset name cannot be empty")
        if name != dataset.name:
            previous_name = dataset.name
            details["from_name"] = previous_name
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

    if details:
        record_audit_log(
            db,
            "dataset_updated",
            "dataset",
            str(dataset.id),
            actor_user_id=user.id if user else None,
            details=details,
        )
        db.commit()
        db.refresh(dataset)

    return serialize_dataset(dataset)


def delete_dataset(
    db: Session,
    *,
    dataset_id: int,
    user: User,
) -> dict:
    dataset = get_dataset_by_id(db, dataset_id)
    ensure_dataset_write_access(dataset, user)

    experiment_count = db.query(func.count(Experiment.id)).filter(Experiment.dataset_id == dataset.id).scalar() or 0
    version_ids = [row.id for row in dataset.versions]
    version_experiment_count = 0
    session_count = 0

    if version_ids:
        version_experiment_count = (
            db.query(func.count(Experiment.id))
            .filter(Experiment.dataset_version_id.in_(version_ids))
            .scalar()
            or 0
        )
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
        actor_user_id=user.id if user else None,
        details={"name": dataset.name, "slug": dataset.slug},
    )
    dataset.current_version_id = None
    db.flush()
    db.delete(dataset)
    db.commit()
    return {"status": "deleted", "id": dataset_id}
