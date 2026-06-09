"""
Sessions REST API — CRUD for training sessions.
Supports session creation, status lookup, and resume data retrieval.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from api.routers.auth import get_current_user, get_optional_user
from database import get_db
from models.sql_models import User
from services import session_service

router = APIRouter(prefix="/sessions", tags=["sessions"])


class CreateSessionRequest(BaseModel):
    project_id: Optional[int] = None
    dataset_version_id: Optional[int] = None
    task: int = 1
    model: str = "GCN"
    dataset: str = "cora"
    epochs: int = 100
    lr: float = 0.01
    hidden: int = 64
    config: dict = {}


class UpdateStatusRequest(BaseModel):
    status: str


@router.post("")
async def create_session(req: CreateSessionRequest, user: Optional[User] = Depends(get_optional_user)):
    """Create a new training session. Returns session_id + ws_url."""
    return session_service.create_session(payload=req.model_dump(), user=user)


@router.get("/{session_id}")
async def get_session(
    session_id: str,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    """Get session details."""
    return session_service.get_session_payload(db, session_id, user)


@router.get("/{session_id}/resume")
async def get_resume_data(
    session_id: str,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    """Get resume data: last epoch + snapshots for replay."""
    return session_service.get_resume_data(db, session_id, user)


@router.patch("/{session_id}")
async def update_session_status(
    session_id: str,
    req: UpdateStatusRequest,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    """Update session status."""
    return session_service.update_session_status(db=db, session_id=session_id, status=req.status, user=user)


@router.post("/{session_id}/stop")
async def stop_session(
    session_id: str,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user),
):
    """Stop a concrete training session by id."""
    return session_service.stop_session(db=db, session_id=session_id, user=user)
