"""
Session Manager — RAM cache + DB persistence.
Manages training sessions that survive WebSocket disconnects.
"""
import uuid
import gzip
import json
import os
import logging
from datetime import datetime
from typing import Dict, Optional, List

from database import SessionLocal
from models.sql_models import TrainingSession, SessionSnapshot, SessionStatus

logger = logging.getLogger(__name__)

SNAPSHOT_DIR = os.path.join(os.path.dirname(__file__), '..', 'datasets', 'snapshots')
os.makedirs(SNAPSHOT_DIR, exist_ok=True)


class SessionManager:
    """
    Hybrid session manager: RAM cache for active sessions + DB for persistence.
    """
    def __init__(self):
        self._active_sessions: Dict[str, bool] = {}

    def create_session(self, config: dict = None, task_type: int = 1,
                       model_type: str = "GCN", dataset_name: str = "cora",
                       user_id: int = None) -> str:
        """Create a new training session, persist to DB."""
        session_id = str(uuid.uuid4())
        self._active_sessions[session_id] = False

        # Persist to DB
        try:
            db = SessionLocal()
            try:
                ts = TrainingSession(
                    id=session_id,
                    user_id=user_id,
                    task_type=task_type,
                    model_type=model_type,
                    dataset_name=dataset_name,
                    config_json=config or {},
                    status=SessionStatus.PENDING.value,
                    total_epochs=config.get('epochs', 100) if config else 100,
                )
                db.add(ts)
                db.commit()
            finally:
                db.close()
        except Exception as e:
            logger.warning(f"DB persist failed for session {session_id}: {e}")

        return session_id

    def update_status(self, session_id: str, status: str, error_message: str = None):
        """Update session status in DB."""
        try:
            db = SessionLocal()
            try:
                ts = db.query(TrainingSession).filter_by(id=session_id).first()
                if ts:
                    ts.status = status
                    if error_message:
                        ts.error_message = error_message
                    if status in (SessionStatus.COMPLETED.value, SessionStatus.FAILED.value,
                                  SessionStatus.STOPPED.value):
                        ts.ended_at = datetime.utcnow()
                    db.commit()
            finally:
                db.close()
        except Exception as e:
            logger.warning(f"DB status update failed: {e}")

    def update_epoch(self, session_id: str, epoch: int, seq: int = 0):
        """Update last completed epoch in DB."""
        try:
            db = SessionLocal()
            try:
                ts = db.query(TrainingSession).filter_by(id=session_id).first()
                if ts:
                    ts.last_epoch = epoch
                    ts.last_seq = seq
                    db.commit()
            finally:
                db.close()
        except Exception as e:
            logger.warning(f"DB epoch update failed: {e}")

    def save_snapshot(self, session_id: str, epoch: int, data: dict) -> Optional[str]:
        """Save epoch snapshot as .json.gz and record in DB."""
        try:
            filename = f"{session_id}_epoch_{epoch}.json.gz"
            filepath = os.path.join(SNAPSHOT_DIR, filename)
            json_bytes = json.dumps(data).encode('utf-8')
            with gzip.open(filepath, 'wb') as f:
                f.write(json_bytes)

            db = SessionLocal()
            try:
                existing = db.query(SessionSnapshot).filter_by(
                    session_id=session_id, epoch=epoch).first()
                if existing:
                    existing.blob_ref = filepath
                else:
                    snap = SessionSnapshot(
                        session_id=session_id, epoch=epoch, blob_ref=filepath)
                    db.add(snap)
                db.commit()
            finally:
                db.close()

            return filepath
        except Exception as e:
            logger.warning(f"Snapshot save failed: {e}")
            return None

    def get_session(self, session_id: str) -> Optional[dict]:
        """Get session details from DB."""
        try:
            db = SessionLocal()
            try:
                ts = db.query(TrainingSession).filter_by(id=session_id).first()
                if not ts:
                    return None
                return {
                    'id': ts.id,
                    'task_type': ts.task_type,
                    'model_type': ts.model_type,
                    'dataset_name': ts.dataset_name,
                    'config': ts.config_json,
                    'status': ts.status,
                    'last_epoch': ts.last_epoch,
                    'total_epochs': ts.total_epochs,
                    'last_seq': ts.last_seq,
                    'started_at': ts.started_at.isoformat() if ts.started_at else None,
                    'ended_at': ts.ended_at.isoformat() if ts.ended_at else None,
                    'error_message': ts.error_message,
                }
            finally:
                db.close()
        except Exception:
            return None

    def get_snapshots_from(self, session_id: str, from_epoch: int = 0) -> List[dict]:
        """Get snapshots from a given epoch, loading from .json.gz files."""
        snapshots = []
        try:
            db = SessionLocal()
            try:
                records = db.query(SessionSnapshot).filter(
                    SessionSnapshot.session_id == session_id,
                    SessionSnapshot.epoch >= from_epoch
                ).order_by(SessionSnapshot.epoch).all()
                for rec in records:
                    if os.path.exists(rec.blob_ref):
                        with gzip.open(rec.blob_ref, 'rb') as f:
                            data = json.loads(f.read())
                        snapshots.append(data)
            finally:
                db.close()
        except Exception as e:
            logger.warning(f"Snapshot load failed: {e}")
        return snapshots

    def stop_session(self, session_id: str):
        """Mark session as stopped."""
        if session_id in self._active_sessions:
            self._active_sessions[session_id] = True
        self.update_status(session_id, SessionStatus.STOPPED.value)

    def is_stopped(self, session_id: str) -> bool:
        """Check if session is marked for stopping."""
        return self._active_sessions.get(session_id, False)

    def cleanup_session(self, session_id: str):
        """Remove from RAM cache (DB record stays for history)."""
        if session_id in self._active_sessions:
            del self._active_sessions[session_id]


# Singleton instance
session_manager = SessionManager()
