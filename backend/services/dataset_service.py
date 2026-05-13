from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models.sql_models import AuditAction, Dataset, DatasetLifecycle, DatasetVersion, User
from services.hybrid_store import record_audit_log, slugify
from services.list_response import build_list_response


def iso_or_none(value: Optional[datetime]) -> Optional[str]:
    if not value:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def serialize_dataset(dataset: Dataset) -> dict:
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
    rows = query.order_by(Dataset.created_at.desc()).all()
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
