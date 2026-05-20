from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from api.routers.auth import require_admin_user
from database import get_db
from models.sql_models import User
from services import admin_service

router = APIRouter(prefix="/admin", tags=["admin"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _bcrypt_safe(password: str) -> str:
    """Truncate to bcrypt's 72-byte cap so newer bcrypt builds don't raise."""
    if password is None:
        return ""
    encoded = password.encode("utf-8")
    if len(encoded) <= 72:
        return password
    return encoded[:72].decode("utf-8", errors="ignore")


class RoleUpdateRequest(BaseModel):
    role: str


class UserUpdateRequest(BaseModel):
    email: Optional[str] = None
    username: Optional[str] = None
    full_name: Optional[str] = None
    bio: Optional[str] = None
    github_url: Optional[str] = None
    organization: Optional[str] = None
    job_title: Optional[str] = None
    location: Optional[str] = None
    profile_image: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class UserCreateRequest(BaseModel):
    email: str
    username: str
    password: str
    full_name: Optional[str] = None
    bio: Optional[str] = None
    github_url: Optional[str] = None
    organization: Optional[str] = None
    job_title: Optional[str] = None
    location: Optional[str] = None
    profile_image: Optional[str] = None
    role: Optional[str] = None
    is_active: bool = True


class DatasetUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_public: Optional[bool] = None


class ProjectUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    task_type: Optional[int] = None
    model_type: Optional[str] = None
    is_public: Optional[bool] = None


@router.get("/summary")
def get_admin_summary(
    db: Session = Depends(get_db),
    admin: Optional[User] = Depends(require_admin_user),
):
    return admin_service.get_admin_summary(db, admin)


@router.get("/users")
def list_users(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=100),
    q: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    admin: Optional[User] = Depends(require_admin_user),
):
    return admin_service.list_users(
        db,
        page=page,
        page_size=page_size,
        q=q,
        date_from=date_from,
        date_to=date_to,
    )


@router.patch("/users/{user_id}/role")
def update_user_role(
    user_id: int,
    payload: RoleUpdateRequest,
    db: Session = Depends(get_db),
    admin: Optional[User] = Depends(require_admin_user),
):
    return admin_service.update_user_role(
        db,
        user_id=user_id,
        role=payload.role,
        admin=admin,
    )


@router.post("/users")
def create_user(
    payload: UserCreateRequest,
    db: Session = Depends(get_db),
    admin: Optional[User] = Depends(require_admin_user),
):
    return admin_service.create_user(
        db,
        payload=payload.model_dump(),
        password_hash=pwd_context.hash(_bcrypt_safe(payload.password)),
        admin=admin,
    )


@router.patch("/users/{user_id}")
def update_user(
    user_id: int,
    payload: UserUpdateRequest,
    db: Session = Depends(get_db),
    admin: Optional[User] = Depends(require_admin_user),
):
    return admin_service.update_user(
        db,
        user_id=user_id,
        updates=payload.model_dump(exclude_unset=True),
        admin=admin,
    )


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: Optional[User] = Depends(require_admin_user),
):
    return admin_service.delete_user(
        db,
        user_id=user_id,
        admin=admin,
    )


@router.get("/datasets")
def list_admin_datasets(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=100),
    q: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    admin: Optional[User] = Depends(require_admin_user),
):
    return admin_service.list_admin_datasets(
        db,
        page=page,
        page_size=page_size,
        q=q,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/projects")
def list_admin_projects(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=100),
    q: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    admin: Optional[User] = Depends(require_admin_user),
):
    return admin_service.list_admin_projects(
        db,
        page=page,
        page_size=page_size,
        q=q,
        date_from=date_from,
        date_to=date_to,
    )


@router.patch("/projects/{project_id}")
def update_admin_project(
    project_id: int,
    payload: ProjectUpdateRequest,
    db: Session = Depends(get_db),
    admin: Optional[User] = Depends(require_admin_user),
):
    return admin_service.update_admin_project(
        db,
        project_id=project_id,
        updates=payload.model_dump(exclude_unset=True),
        admin=admin,
    )


@router.delete("/projects/{project_id}")
def delete_admin_project(
    project_id: int,
    db: Session = Depends(get_db),
    admin: Optional[User] = Depends(require_admin_user),
):
    return admin_service.delete_admin_project(
        db,
        project_id=project_id,
        admin=admin,
    )


@router.patch("/datasets/{dataset_id}")
def update_admin_dataset(
    dataset_id: int,
    payload: DatasetUpdateRequest,
    db: Session = Depends(get_db),
    admin: Optional[User] = Depends(require_admin_user),
):
    return admin_service.update_admin_dataset(
        db,
        dataset_id=dataset_id,
        updates=payload.model_dump(exclude_unset=True),
        admin=admin,
    )


@router.delete("/datasets/{dataset_id}")
def delete_admin_dataset(
    dataset_id: int,
    db: Session = Depends(get_db),
    admin: Optional[User] = Depends(require_admin_user),
):
    return admin_service.delete_admin_dataset(
        db,
        dataset_id=dataset_id,
        admin=admin,
    )


@router.get("/experiments")
def list_admin_experiments(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=100),
    status: Optional[str] = None,
    q: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    admin: Optional[User] = Depends(require_admin_user),
):
    return admin_service.list_admin_experiments(
        db,
        page=page,
        page_size=page_size,
        status=status,
        q=q,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/sessions")
def list_admin_sessions(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=100),
    status: Optional[str] = None,
    q: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    admin: Optional[User] = Depends(require_admin_user),
):
    return admin_service.list_admin_sessions(
        db,
        page=page,
        page_size=page_size,
        status=status,
        q=q,
        date_from=date_from,
        date_to=date_to,
    )


@router.post("/sessions/{session_id}/stop")
def stop_admin_session(
    session_id: str,
    db: Session = Depends(get_db),
    admin: Optional[User] = Depends(require_admin_user),
):
    return admin_service.stop_session(db, session_id=session_id, admin=admin)


@router.post("/sessions/{session_id}/retry")
def retry_admin_session(
    session_id: str,
    db: Session = Depends(get_db),
    admin: Optional[User] = Depends(require_admin_user),
):
    return admin_service.retry_session(db, session_id=session_id, admin=admin)


@router.delete("/sessions/{session_id}")
def delete_admin_session(
    session_id: str,
    db: Session = Depends(get_db),
    admin: Optional[User] = Depends(require_admin_user),
):
    return admin_service.delete_session(db, session_id=session_id, admin=admin)


@router.get("/audit-logs")
def list_audit_logs(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=100),
    action: Optional[str] = None,
    target_type: Optional[str] = None,
    q: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    admin: Optional[User] = Depends(require_admin_user),
):
    return admin_service.list_audit_logs(
        db,
        page=page,
        page_size=page_size,
        action=action,
        target_type=target_type,
        q=q,
        date_from=date_from,
        date_to=date_to,
    )


@router.post("/retention")
def run_admin_retention(
    dry_run: bool = Query(default=True),
    db: Session = Depends(get_db),
    admin: Optional[User] = Depends(require_admin_user),
):
    return admin_service.run_retention(db, dry_run=dry_run)


@router.post("/blob-cleanup")
def run_admin_blob_cleanup(
    dry_run: bool = Query(default=True),
    db: Session = Depends(get_db),
    admin: Optional[User] = Depends(require_admin_user),
):
    return admin_service.run_blob_cleanup(db, dry_run=dry_run, admin=admin)
