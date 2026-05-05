"""
Session Manager — RAM stop flags + DB persistence + Mongo-backed replay support.
"""
import gzip
import json
import logging
import os
import uuid
from datetime import datetime
from typing import Dict, List, Optional

from database import SessionLocal
from models.sql_models import Experiment, SessionSnapshot, SessionStatus, TrainingSession
from services.hybrid_store import mongo_runs

logger = logging.getLogger(__name__)

SNAPSHOT_DIR = os.path.join(os.path.dirname(__file__), "..", "datasets", "snapshots")
os.makedirs(SNAPSHOT_DIR, exist_ok=True)


class SessionManager:
    def __init__(self):
        self._active_sessions: Dict[str, bool] = {}

    def create_session(
        self,
        config: dict = None,
        task_type: int = 1,
        model_type: str = "GCN",
        dataset_name: str = "cora",
        user_id: int = None,
        project_id: int = None,
        dataset_version_id: int = None,
        experiment_id: int = None,
    ) -> str:
        session_id = str(uuid.uuid4())
        self._active_sessions[session_id] = False
        config = config or {}

        try:
            db = SessionLocal()
            try:
                ts = TrainingSession(
                    id=session_id,
                    user_id=user_id,
                    project_id=project_id,
                    dataset_version_id=dataset_version_id,
                    experiment_id=experiment_id,
                    task_type=task_type,
                    model_type=model_type,
                    dataset_name=dataset_name,
                    config_json=config,
                    status=SessionStatus.PENDING.value,
                    total_epochs=config.get("epochs", 100),
                    mongo_run_id=f"session:{session_id}",
                )
                db.add(ts)
                db.commit()
            finally:
                db.close()
        except Exception as exc:
            logger.warning("DB persist failed for session %s: %s", session_id, exc)
        return session_id

    def update_status(self, session_id: str, status: str, error_message: str = None):
        try:
            db = SessionLocal()
            try:
                ts = db.query(TrainingSession).filter_by(id=session_id).first()
                if ts:
                    ts.status = status
                    if error_message:
                        ts.error_message = error_message
                    if status in (
                        SessionStatus.COMPLETED.value,
                        SessionStatus.FAILED.value,
                        SessionStatus.STOPPED.value,
                    ):
                        ts.ended_at = datetime.utcnow()
                    db.commit()
            finally:
                db.close()
        except Exception as exc:
            logger.warning("DB status update failed: %s", exc)

    def update_epoch(self, session_id: str, epoch: int, seq: int = 0):
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
        except Exception as exc:
            logger.warning("DB epoch update failed: %s", exc)

    def sync_runtime_context(self, session_id: str, config: dict):
        try:
            db = SessionLocal()
            try:
                ts = db.query(TrainingSession).filter_by(id=session_id).first()
                if not ts:
                    return
                merged_config = {**(ts.config_json or {}), **(config or {})}
                ts.config_json = merged_config
                ts.task_type = config.get("task", ts.task_type)
                ts.model_type = config.get("model", ts.model_type)
                ts.dataset_name = config.get("dataset", ts.dataset_name)
                ts.total_epochs = config.get("epochs", ts.total_epochs)
                if config.get("project_id") is not None:
                    ts.project_id = config.get("project_id")
                if config.get("dataset_version_id") is not None:
                    ts.dataset_version_id = config.get("dataset_version_id")
                db.commit()
            finally:
                db.close()
        except Exception as exc:
            logger.warning("DB runtime context sync failed: %s", exc)

    def save_snapshot(self, session_id: str, epoch: int, data: dict) -> Optional[str]:
        filepath = None
        try:
            filename = f"{session_id}_epoch_{epoch}.json.gz"
            filepath = os.path.join(SNAPSHOT_DIR, filename)
            json_bytes = json.dumps(data).encode("utf-8")
            with gzip.open(filepath, "wb") as handle:
                handle.write(json_bytes)

            db = SessionLocal()
            try:
                session = db.query(TrainingSession).filter_by(id=session_id).first()
                if session:
                    mongo_runs.save_session_snapshot(
                        session_id=session_id,
                        experiment_id=session.experiment_id,
                        project_id=session.project_id,
                        task_type=session.task_type,
                        model_type=session.model_type,
                        epoch=epoch,
                        snapshot=data,
                    )
                existing = db.query(SessionSnapshot).filter_by(session_id=session_id, epoch=epoch).first()
                if existing:
                    existing.blob_ref = filepath
                    existing.experiment_id = session.experiment_id if session else None
                else:
                    db.add(
                        SessionSnapshot(
                            session_id=session_id,
                            experiment_id=session.experiment_id if session else None,
                            epoch=epoch,
                            blob_ref=filepath,
                        )
                    )
                db.commit()
            finally:
                db.close()
            return filepath
        except Exception as exc:
            logger.warning("Snapshot save failed: %s", exc)
            return filepath

    def get_session(self, session_id: str) -> Optional[dict]:
        try:
            db = SessionLocal()
            try:
                ts = db.query(TrainingSession).filter_by(id=session_id).first()
                if not ts:
                    return None
                return {
                    "id": ts.id,
                    "user_id": ts.user_id,
                    "task_type": ts.task_type,
                    "model_type": ts.model_type,
                    "dataset_name": ts.dataset_name,
                    "project_id": ts.project_id,
                    "dataset_version_id": ts.dataset_version_id,
                    "experiment_id": ts.experiment_id,
                    "config": ts.config_json,
                    "status": ts.status,
                    "last_epoch": ts.last_epoch,
                    "total_epochs": ts.total_epochs,
                    "last_seq": ts.last_seq,
                    "mongo_run_id": ts.mongo_run_id,
                    "started_at": ts.started_at.isoformat() if ts.started_at else None,
                    "ended_at": ts.ended_at.isoformat() if ts.ended_at else None,
                    "error_message": ts.error_message,
                }
            finally:
                db.close()
        except Exception:
            return None

    def get_snapshots_from(self, session_id: str, from_epoch: int = 0) -> List[dict]:
        mongo_snapshots = mongo_runs.get_session_snapshots(session_id, from_epoch)
        if mongo_snapshots:
            return mongo_snapshots

        snapshots = []
        try:
            db = SessionLocal()
            try:
                records = (
                    db.query(SessionSnapshot)
                    .filter(
                        SessionSnapshot.session_id == session_id,
                        SessionSnapshot.epoch >= from_epoch,
                    )
                    .order_by(SessionSnapshot.epoch)
                    .all()
                )
                for rec in records:
                    if rec.blob_ref and os.path.exists(rec.blob_ref):
                        with gzip.open(rec.blob_ref, "rb") as handle:
                            snapshots.append(json.loads(handle.read()))
            finally:
                db.close()
        except Exception as exc:
            logger.warning("Snapshot load failed: %s", exc)
        return snapshots

    def stop_session(self, session_id: str):
        session = self.get_session(session_id)
        if not session:
            return None
        if session["status"] in (
            SessionStatus.COMPLETED.value,
            SessionStatus.FAILED.value,
            SessionStatus.STOPPED.value,
        ):
            return session
        self._active_sessions[session_id] = True
        self.update_status(session_id, SessionStatus.STOPPED.value)
        return self.get_session(session_id)

    def retry_session(self, session_id: str) -> Optional[dict]:
        if session_id not in self._active_sessions:
            self._active_sessions[session_id] = False
        else:
            self._active_sessions[session_id] = False
        try:
            db = SessionLocal()
            try:
                ts = db.query(TrainingSession).filter_by(id=session_id).first()
                if not ts:
                    return None
                ts.status = SessionStatus.PENDING.value
                ts.ended_at = None
                ts.error_message = None
                ts.last_epoch = -1
                ts.last_seq = 0
                db.commit()
            finally:
                db.close()
        except Exception as exc:
            logger.warning("Session retry failed: %s", exc)
            return None
        return self.get_session(session_id)

    def is_stopped(self, session_id: str) -> bool:
        return self._active_sessions.get(session_id, False)

    def cleanup_session(self, session_id: str):
        if session_id in self._active_sessions:
            del self._active_sessions[session_id]


session_manager = SessionManager()
