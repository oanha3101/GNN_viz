"""
TDD: Tests for session persistence (Phase B).
Tests session CRUD, snapshot save/load, and DB persistence.
"""
import pytest
import json
import gzip
import os
import sys
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.session_manager import session_manager, SNAPSHOT_DIR
from models.sql_models import SessionStatus
from database import init_db
from main import app

init_db()
client = TestClient(app)


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


class TestSessionApiContracts:
    def test_create_session_returns_train_ws_route(self):
        response = client.post("/api/sessions", json={
            "project_id": 321,
            "dataset_version_id": 654,
            "task": 5,
            "model": "SAGE",
            "dataset": "custom_graph",
            "epochs": 12,
            "lr": 0.02,
            "hidden": 48,
            "config": {"dropout": 0.3},
        })

        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "pending"
        assert payload["session_id"]
        assert payload["ws_url"] == "/ws/train"

        session = session_manager.get_session(payload["session_id"])
        assert session["project_id"] == 321
        assert session["dataset_version_id"] == 654
        assert session["task_type"] == 5
        assert session["model_type"] == "SAGE"
        assert session["dataset_name"] == "custom_graph"

        session_manager.cleanup_session(payload["session_id"])

    def test_resume_endpoint_returns_snapshots_and_context_metadata(self):
        session_id = session_manager.create_session(
            config={"epochs": 9, "lr": 0.03, "hidden": 24, "dropout": 0.4},
            task_type=3,
            model_type="GAT",
            dataset_name="resume_graph",
            project_id=77,
            dataset_version_id=88,
        )
        session_manager.update_status(session_id, SessionStatus.RUNNING.value)
        session_manager.update_epoch(session_id, epoch=2, seq=11)
        session_manager.save_snapshot(session_id, 0, {"epoch": 0, "auc": 0.55})
        session_manager.save_snapshot(session_id, 1, {"epoch": 1, "auc": 0.66})
        session_manager.save_snapshot(session_id, 2, {"epoch": 2, "auc": 0.71})

        response = client.get(f"/api/sessions/{session_id}/resume")
        assert response.status_code == 200
        payload = response.json()

        assert payload["session_id"] == session_id
        assert payload["status"] == SessionStatus.RUNNING.value
        assert payload["last_epoch"] == 2
        assert payload["last_seq"] == 11
        assert payload["snapshot_count"] == 3
        assert payload["task_type"] == 3
        assert payload["model_type"] == "GAT"
        assert payload["dataset_name"] == "resume_graph"
        assert payload["project_id"] == 77
        assert payload["dataset_version_id"] == 88
        assert payload["config"]["epochs"] == 9
        assert payload["config"]["dropout"] == 0.4
        assert [item["epoch"] for item in payload["snapshots"]] == [0, 1, 2]

        for f in os.listdir(SNAPSHOT_DIR):
            if f.startswith(session_id):
                os.remove(os.path.join(SNAPSHOT_DIR, f))
        session_manager.cleanup_session(session_id)

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

    def test_get_session_and_patch_status_contract(self):
        response = client.post("/api/sessions", json={
            "task": 2,
            "model": "GAT",
            "dataset": "status_contract_graph",
            "epochs": 7,
        })
        assert response.status_code == 200, response.text
        session_id = response.json()["session_id"]

        detail_response = client.get(f"/api/sessions/{session_id}")
        assert detail_response.status_code == 200, detail_response.text
        detail = detail_response.json()
        assert detail["id"] == session_id
        assert detail["task_type"] == 2
        assert detail["model_type"] == "GAT"
        assert detail["dataset_name"] == "status_contract_graph"

        patch_response = client.patch(
            f"/api/sessions/{session_id}",
            json={"status": SessionStatus.RUNNING.value},
        )
        assert patch_response.status_code == 200, patch_response.text
        patch_payload = patch_response.json()
        assert patch_payload["session_id"] == session_id
        assert patch_payload["status"] == SessionStatus.RUNNING.value

        refreshed = session_manager.get_session(session_id)
        assert refreshed["status"] == SessionStatus.RUNNING.value
        session_manager.cleanup_session(session_id)

    def test_stop_session_route_requires_concrete_session_and_updates_status(self):
        import uuid

        suffix = uuid.uuid4().hex[:8]
        register_response = client.post(
            "/api/auth/register",
            json={
                "email": f"stop_route_{suffix}@example.com",
                "username": f"stop_route_{suffix}",
                "password": "password123",
                "full_name": "Stop Route User",
                "role": "researcher",
            },
        )
        assert register_response.status_code == 200, register_response.text
        headers = {"Authorization": f"Bearer {register_response.json()['access_token']}"}

        response = client.post("/api/sessions", json={
            "task": 1,
            "model": "GCN",
            "dataset": "stop_contract_graph",
            "epochs": 4,
        }, headers=headers)
        assert response.status_code == 200, response.text
        session_id = response.json()["session_id"]

        stop_response = client.post(f"/api/sessions/{session_id}/stop", headers=headers)
        assert stop_response.status_code == 200, stop_response.text
        payload = stop_response.json()
        assert payload["session_id"] == session_id
        assert payload["status"] == SessionStatus.STOPPED.value

        refreshed = session_manager.get_session(session_id)
        assert refreshed["status"] == SessionStatus.STOPPED.value
        session_manager.cleanup_session(session_id)

    def test_legacy_stop_route_is_gone_for_safety(self):
        response = client.post("/api/stop", json={})
        assert response.status_code == 410
        assert "Deprecated" in response.json()["detail"]
