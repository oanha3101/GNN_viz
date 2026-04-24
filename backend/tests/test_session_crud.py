"""
TDD: Tests for session persistence (Phase B).
Tests session CRUD, snapshot save/load, and DB persistence.
"""
import pytest
import json
import gzip
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.session_manager import session_manager, SNAPSHOT_DIR
from models.sql_models import SessionStatus
from database import init_db

init_db()


class TestSessionCRUD:
    def test_create_session_returns_uuid(self):
        sid = session_manager.create_session(config={"task": 1, "epochs": 50})
        assert sid is not None
        assert len(sid) == 36  # UUID format
        session_manager.cleanup_session(sid)

    def test_create_session_persists_to_db(self):
        sid = session_manager.create_session(
            config={"task": 2, "epochs": 80},
            task_type=2, model_type="GAT", dataset_name="citeseer"
        )
        session = session_manager.get_session(sid)
        assert session is not None
        assert session['task_type'] == 2
        assert session['model_type'] == "GAT"
        assert session['status'] == SessionStatus.PENDING.value
        session_manager.cleanup_session(sid)

    def test_get_nonexistent_session_returns_none(self):
        session = session_manager.get_session("nonexistent-id")
        assert session is None

    def test_update_status_transitions(self):
        sid = session_manager.create_session(config={"task": 1})
        session_manager.update_status(sid, SessionStatus.RUNNING.value)
        s = session_manager.get_session(sid)
        assert s['status'] == 'running'

        session_manager.update_status(sid, SessionStatus.COMPLETED.value)
        s = session_manager.get_session(sid)
        assert s['status'] == 'completed'
        assert s['ended_at'] is not None
        session_manager.cleanup_session(sid)

    def test_update_epoch(self):
        sid = session_manager.create_session(config={"task": 1})
        session_manager.update_epoch(sid, epoch=42, seq=100)
        s = session_manager.get_session(sid)
        assert s['last_epoch'] == 42
        assert s['last_seq'] == 100
        session_manager.cleanup_session(sid)

    def test_stop_session(self):
        sid = session_manager.create_session(config={"task": 1})
        session_manager.stop_session(sid)
        assert session_manager.is_stopped(sid) is True
        s = session_manager.get_session(sid)
        assert s['status'] == SessionStatus.STOPPED.value
        session_manager.cleanup_session(sid)


class TestSnapshotPersistence:
    def test_save_snapshot_creates_file(self):
        sid = session_manager.create_session(config={"task": 1})
        data = {"epoch": 0, "train_loss": 0.5, "node_predictions": [0, 1, 2]}
        filepath = session_manager.save_snapshot(sid, epoch=0, data=data)
        assert filepath is not None
        assert os.path.exists(filepath)
        assert filepath.endswith('.json.gz')
        # Verify content
        with gzip.open(filepath, 'rb') as f:
            loaded = json.loads(f.read())
        assert loaded['epoch'] == 0
        assert loaded['train_loss'] == 0.5
        # Cleanup
        os.remove(filepath)
        session_manager.cleanup_session(sid)

    def test_save_snapshot_upsert(self):
        sid = session_manager.create_session(config={"task": 1})
        session_manager.save_snapshot(sid, epoch=0, data={"epoch": 0, "v": 1})
        session_manager.save_snapshot(sid, epoch=0, data={"epoch": 0, "v": 2})
        snaps = session_manager.get_snapshots_from(sid, 0)
        assert len(snaps) == 1
        assert snaps[0]['v'] == 2
        # Cleanup
        for f in os.listdir(SNAPSHOT_DIR):
            if f.startswith(sid):
                os.remove(os.path.join(SNAPSHOT_DIR, f))
        session_manager.cleanup_session(sid)

    def test_get_snapshots_from_epoch(self):
        sid = session_manager.create_session(config={"task": 1})
        for e in range(5):
            session_manager.save_snapshot(sid, epoch=e, data={"epoch": e, "loss": 1.0 - e * 0.1})
        # Get from epoch 2 onwards
        snaps = session_manager.get_snapshots_from(sid, from_epoch=2)
        assert len(snaps) == 3
        assert snaps[0]['epoch'] == 2
        assert snaps[-1]['epoch'] == 4
        # Cleanup
        for f in os.listdir(SNAPSHOT_DIR):
            if f.startswith(sid):
                os.remove(os.path.join(SNAPSHOT_DIR, f))
        session_manager.cleanup_session(sid)

    def test_get_all_snapshots(self):
        sid = session_manager.create_session(config={"task": 1})
        for e in range(3):
            session_manager.save_snapshot(sid, epoch=e, data={"epoch": e})
        snaps = session_manager.get_snapshots_from(sid, 0)
        assert len(snaps) == 3
        # Cleanup
        for f in os.listdir(SNAPSHOT_DIR):
            if f.startswith(sid):
                os.remove(os.path.join(SNAPSHOT_DIR, f))
        session_manager.cleanup_session(sid)
