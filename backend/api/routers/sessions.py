"""
Sessions REST API — CRUD for training sessions.
Supports session creation, status lookup, and resume data retrieval.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from database import get_db
from sqlalchemy.orm import Session
from core.session_manager import session_manager

router = APIRouter(prefix="/sessions", tags=["sessions"])


class CreateSessionRequest(BaseModel):
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
async def create_session(req: CreateSessionRequest):
    """Create a new training session. Returns session_id + ws_url."""
    config = {**req.config, "task": req.task, "model": req.model,
              "dataset": req.dataset, "epochs": req.epochs,
              "lr": req.lr, "hidden": req.hidden}
    session_id = session_manager.create_session(
        config=config, task_type=req.task,
        model_type=req.model, dataset_name=req.dataset,
    )
    return {
        "session_id": session_id,
        "ws_url": f"/ws/sessions/{session_id}",
        "status": "pending",
    }


@router.get("/{session_id}")
async def get_session(session_id: str):
    """Get session details."""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.get("/{session_id}/resume")
async def get_resume_data(session_id: str):
    """Get resume data: last epoch + snapshots for replay."""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    snapshots = session_manager.get_snapshots_from(session_id, 0)
    return {
        "session_id": session_id,
        "last_epoch": session['last_epoch'],
        "last_seq": session['last_seq'],
        "status": session['status'],
        "snapshot_count": len(snapshots),
        "snapshots": snapshots,
    }


@router.patch("/{session_id}")
async def update_session_status(session_id: str, req: UpdateStatusRequest):
    """Update session status."""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session_manager.update_status(session_id, req.status)
    return {"session_id": session_id, "status": req.status}
