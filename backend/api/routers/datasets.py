from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.routers.auth import get_current_user, get_optional_user
from database import get_db
from models.sql_models import User
from services import dataset_service

router = APIRouter(prefix="/datasets", tags=["datasets"])


class DatasetCreate(BaseModel):
    name: str
    description: Optional[str] = None
    is_public: bool = False
    summary_json: Optional[Dict[str, Any]] = None
    validation_json: Optional[Dict[str, Any]] = None
    source_files_json: Optional[Dict[str, Any]] = None
    raw_blob_key: Optional[str] = None
    processed_blob_key: Optional[str] = None


class DatasetVersionCreate(BaseModel):
    summary_json: Optional[Dict[str, Any]] = None
    validation_json: Optional[Dict[str, Any]] = None
    source_files_json: Optional[Dict[str, Any]] = None
    raw_blob_key: Optional[str] = None
    processed_blob_key: Optional[str] = None


class DatasetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_public: Optional[bool] = None


@router.post("")
def create_dataset(
    payload: DatasetCreate,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    return dataset_service.create_dataset(
        db,
        payload=payload.model_dump(),
        user=user,
    )


@router.get("")
def list_datasets(
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    return dataset_service.list_datasets(db, user)


@router.get("/{dataset_id}")
def get_dataset(
    dataset_id: int,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    return dataset_service.get_dataset_payload(db, dataset_id, user)


@router.post("/{dataset_id}/versions")
def create_dataset_version(
    dataset_id: int,
    payload: DatasetVersionCreate,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    return dataset_service.create_dataset_version(
        db,
        dataset_id=dataset_id,
        payload=payload.model_dump(),
        user=user,
    )


@router.post("/{dataset_id}/publish")
def publish_dataset_version(
    dataset_id: int,
    version_id: int,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    return dataset_service.publish_dataset_version(
        db,
        dataset_id=dataset_id,
        version_id=version_id,
        user=user,
    )


@router.post("/{dataset_id}/deprecate")
def deprecate_dataset_version(
    dataset_id: int,
    version_id: int,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    return dataset_service.deprecate_dataset_version(
        db,
        dataset_id=dataset_id,
        version_id=version_id,
        user=user,
    )


@router.patch("/{dataset_id}")
def update_dataset(
    dataset_id: int,
    payload: DatasetUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return dataset_service.update_dataset(
        db,
        dataset_id=dataset_id,
        updates=payload.model_dump(exclude_unset=True),
        user=user,
    )


@router.delete("/{dataset_id}")
def delete_dataset(
    dataset_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return dataset_service.delete_dataset(
        db,
        dataset_id=dataset_id,
        user=user,
    )
