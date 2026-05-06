from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.routers.auth import require_admin_user
from database import get_db
from models.sql_models import User
from services import admin_service

router = APIRouter(prefix="/admin", tags=["admin"])


class RoleUpdateRequest(BaseModel):
    role: str

@router.get("/summary")
def get_admin_summary(
    db: Session = Depends(get_db),
    admin: Optional[User] = Depends(require_admin_user),
):
    return admin_service.get_admin_summary(db, admin)


@router.get("/users")
def list_users(
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    admin: Optional[User] = Depends(require_admin_user),
):
    return admin_service.list_users(db, limit=limit)


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


@router.get("/datasets")
def list_admin_datasets(
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    admin: Optional[User] = Depends(require_admin_user),
):
    return admin_service.list_admin_datasets(db, limit=limit)


@router.get("/experiments")
def list_admin_experiments(
    limit: int = Query(default=100, ge=1, le=500),
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: Optional[User] = Depends(require_admin_user),
):
    return admin_service.list_admin_experiments(db, limit=limit, status=status)


@router.get("/sessions")
def list_admin_sessions(
    limit: int = Query(default=100, ge=1, le=500),
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: Optional[User] = Depends(require_admin_user),
):
    return admin_service.list_admin_sessions(db, limit=limit, status=status)


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


@router.get("/audit-logs")
def list_audit_logs(
    limit: int = Query(default=200, ge=1, le=1000),
    action: Optional[str] = None,
    target_type: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: Optional[User] = Depends(require_admin_user),
):
    return admin_service.list_audit_logs(
        db,
        limit=limit,
        action=action,
        target_type=target_type,
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
