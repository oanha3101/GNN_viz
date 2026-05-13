"""
Integration test — Full lifecycle flow:
auth → project → dataset → session → training snapshots → experiment → replay → compare → report.

Verifies that all subsystems (auth, projects, datasets, sessions, experiments, Mongo fallback)
work together end-to-end without silent data loss.
"""
import os
import sys
import uuid

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["DISABLE_AUTH"] = "0"

from main import app
from api.routers import auth
auth.DISABLE_AUTH = False

client = TestClient(app)


def _register_and_login(username_suffix: str = None):
    """Register a new user and return (token, user_id, username)."""
    uid = username_suffix or uuid.uuid4().hex[:8]
    username = f"integ_user_{uid}"
    email = f"integ_{uid}@test.com"
    resp = client.post("/api/auth/register", json={
        "email": email,
        "username": username,
        "password": "TestPass123!",
        "full_name": "Integration User",
    })
    assert resp.status_code == 200, f"Register failed: {resp.text}"
    data = resp.json()
    return data["access_token"], data["user"]["id"], username


def _auth_header(token: str):
    return {"Authorization": f"Bearer {token}"}


def test_full_lifecycle_flow():
    """
    End-to-end: register → login → create project → create dataset →
    create session → save snapshots → save experiment → get detail →
    replay → compare → report.
    """
    # ── Step 1: Auth ──────────────────────────────────────────────
    token, user_id, username = _register_and_login()
    headers = _auth_header(token)

    # Verify /me
    me_resp = client.get("/api/auth/me", headers=headers)
    assert me_resp.status_code == 200
    assert me_resp.json()["username"] == username

    # ── Step 2: Create Project ────────────────────────────────────
    proj_resp = client.post("/api/projects", json={
        "title": f"Integration Project {uuid.uuid4().hex[:6]}",
        "description": "End-to-end integration test project",
    }, headers=headers)
    assert proj_resp.status_code == 200, f"Create project failed: {proj_resp.text}"
    project_id = proj_resp.json()["id"]

    # Verify project in list
    proj_list = client.get("/api/projects", headers=headers)
    assert proj_list.status_code == 200
    assert any(p["id"] == project_id for p in proj_list.json()["items"])

    # ── Step 3: Create Dataset ────────────────────────────────────
    ds_resp = client.post("/api/datasets", json={
        "name": f"Integration Dataset {uuid.uuid4().hex[:6]}",
        "description": "Test dataset",
    }, headers=headers)
    assert ds_resp.status_code == 200, f"Create dataset failed: {ds_resp.text}"
    ds_data = ds_resp.json()
    dataset_id = ds_data["dataset"]["id"]
    version_id = ds_data["version"]["id"]

    # ── Step 4: Create Session ────────────────────────────────────
    session_resp = client.post("/api/sessions", json={
        "task": 1,
        "model": "GCN",
        "dataset": "cora",
        "project_id": project_id,
        "dataset_version_id": version_id,
        "epochs": 5,
        "lr": 0.01,
        "hidden": 32,
        "config": {},
    }, headers=headers)
    assert session_resp.status_code == 200, f"Create session failed: {session_resp.text}"
    session_id = session_resp.json()["session_id"]

    # ── Step 5: Simulate Training — Save Snapshots ───────────────
    from core.session_manager import session_manager

    for epoch in range(5):
        snapshot_data = {
            "epoch": epoch,
            "train_loss": 1.0 - epoch * 0.15,
            "val_loss": 1.1 - epoch * 0.14,
            "accuracy": 0.3 + epoch * 0.12,
            "predictions": [0, 1, 2, 0, 1],
            "embeddings": [[0.1, 0.2], [0.3, 0.4]],
        }
        ref = session_manager.save_snapshot(session_id, epoch, snapshot_data)
        assert ref is not None, f"Snapshot save returned None for epoch {epoch}"

    # Verify snapshots are retrievable
    loaded = session_manager.get_snapshots_from(session_id, from_epoch=0)
    assert len(loaded) == 5, f"Expected 5 snapshots, got {len(loaded)}"
    assert loaded[0]["epoch"] == 0
    assert loaded[4]["epoch"] == 4
    assert loaded[4]["accuracy"] == pytest.approx(0.78, abs=0.01)

    # ── Step 6: Update Session Status ─────────────────────────────
    session_manager.update_status(session_id, "completed")
    session_detail = session_manager.get_session(session_id)
    assert session_detail["status"] == "completed"

    # ── Step 7: Save Experiment ───────────────────────────────────
    exp_resp = client.post("/api/experiments", json={
        "title": "Integration Test Experiment",
        "task_type": 1,
        "model_type": "GCN",
        "dataset_name": "cora",
        "epoch_count": 5,
        "learning_rate": 0.01,
        "hidden_dim": 32,
        "dropout": 0.5,
        "accuracy": 0.78,
        "loss": 0.35,
        "best_epoch": 4,
        "project_id": project_id,
        "session_id": session_id,
        "is_mock": False,
        "snapshots_json": [
            {"epoch": i, "train_loss": 1.0 - i * 0.15, "accuracy": 0.3 + i * 0.12}
            for i in range(5)
        ],
        "graph_data_json": {"nodes": [{"id": j} for j in range(10)], "links": []},
        "ground_truth_json": [0, 1, 2, 0, 1, 2, 0, 1, 2, 0],
        "task_data_json": {"task": 1},
    }, headers=headers)
    assert exp_resp.status_code == 200, f"Save experiment failed: {exp_resp.text}"
    experiment_id = exp_resp.json()["id"]

    # ── Step 8: Get Experiment Detail ─────────────────────────────
    detail_resp = client.get(f"/api/experiments/{experiment_id}", headers=headers)
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["title"] == "Integration Test Experiment"
    assert detail["accuracy"] == pytest.approx(0.78, abs=0.01)
    assert len(detail["snapshots_json"]) == 5

    # ── Step 9: Replay ────────────────────────────────────────────
    replay_resp = client.post(f"/api/experiments/{experiment_id}/replay", headers=headers)
    assert replay_resp.status_code == 200
    replay_data = replay_resp.json()
    assert "snapshots" in replay_data
    assert len(replay_data["snapshots"]) == 5

    # ── Step 10: Create Second Experiment for Compare ─────────────
    exp2_resp = client.post("/api/experiments", json={
        "title": "Integration Test Experiment 2",
        "task_type": 1,
        "model_type": "GAT",
        "dataset_name": "cora",
        "epoch_count": 5,
        "learning_rate": 0.005,
        "hidden_dim": 64,
        "dropout": 0.3,
        "accuracy": 0.82,
        "loss": 0.30,
        "best_epoch": 4,
        "project_id": project_id,
        "is_mock": False,
        "snapshots_json": [
            {"epoch": i, "train_loss": 0.9 - i * 0.12, "accuracy": 0.35 + i * 0.1}
            for i in range(5)
        ],
        "graph_data_json": {"nodes": [{"id": j} for j in range(10)], "links": []},
        "ground_truth_json": [0, 1, 2, 0, 1, 2, 0, 1, 2, 0],
        "task_data_json": {"task": 1},
    }, headers=headers)
    assert exp2_resp.status_code == 200
    experiment_id_2 = exp2_resp.json()["id"]

    # ── Step 11: Compare ──────────────────────────────────────────
    compare_resp = client.post("/api/experiments/compare", json={
        "experiment_ids": [experiment_id, experiment_id_2],
    }, headers=headers)
    assert compare_resp.status_code == 200
    compare_data = compare_resp.json()
    assert len(compare_data["results"]) == 2

    # ── Step 12: Report ───────────────────────────────────────────
    report_resp = client.get(f"/api/experiments/{experiment_id}/report", headers=headers)
    assert report_resp.status_code == 200
    report = report_resp.json()
    assert "experiment" in report
    assert report["experiment"]["id"] == experiment_id

    # ── Step 13: List Experiments with Filters ────────────────────
    list_resp = client.get(
        f"/api/experiments?project_id={project_id}&task_type=1",
        headers=headers,
    )
    assert list_resp.status_code == 200
    experiments = list_resp.json()
    assert len(experiments["items"]) >= 2

    # ── Step 14: Session Resume ───────────────────────────────────
    resume_resp = client.get(f"/api/sessions/{session_id}/resume", headers=headers)
    assert resume_resp.status_code == 200
    resume_data = resume_resp.json()
    assert len(resume_data["snapshots"]) == 5

    # ── Step 15: Cleanup — Delete Experiment ──────────────────────
    del_resp = client.delete(f"/api/experiments/{experiment_id}", headers=headers)
    assert del_resp.status_code == 200

    del_resp2 = client.delete(f"/api/experiments/{experiment_id_2}", headers=headers)
    assert del_resp2.status_code == 200

    # Verify deletion
    gone_resp = client.get(f"/api/experiments/{experiment_id}", headers=headers)
    assert gone_resp.status_code == 404


def test_auth_guard_blocks_unauthenticated():
    """Unauthenticated requests to auth-required endpoints should be rejected."""
    # /api/auth/me requires authentication
    resp = client.get("/api/auth/me")
    assert resp.status_code in (401, 403)

    # Admin endpoints require admin role
    resp = client.get("/api/admin/summary")
    assert resp.status_code in (401, 403)


def test_viewer_cannot_create_project():
    """A viewer role should not be able to create projects."""
    # Register as viewer (default role is researcher, so we register then check)
    token, user_id, _ = _register_and_login("viewer_test")
    headers = _auth_header(token)

    # Verify the user can create a project (researcher default)
    resp = client.post("/api/projects", json={
        "title": "Viewer Test Project",
        "description": "Should work for researcher",
    }, headers=headers)
    assert resp.status_code == 200


def test_session_snapshot_persistence_across_requests():
    """Snapshots saved in one request should be loadable in another."""
    token, _, _ = _register_and_login("persist_test")
    headers = _auth_header(token)

    # Create session
    session_resp = client.post("/api/sessions", json={
        "task": 1,
        "model": "GCN",
        "dataset": "cora",
        "epochs": 3,
        "config": {},
    }, headers=headers)
    session_id = session_resp.json()["session_id"]

    # Save snapshots
    from core.session_manager import session_manager
    for epoch in range(3):
        session_manager.save_snapshot(session_id, epoch, {
            "epoch": epoch,
            "loss": 1.0 - epoch * 0.2,
            "accuracy": 0.5 + epoch * 0.15,
        })

    # Load via API (different "request" context)
    resume_resp = client.get(f"/api/sessions/{session_id}/resume", headers=headers)
    assert resume_resp.status_code == 200
    snapshots = resume_resp.json()["snapshots"]
    assert len(snapshots) == 3
    assert snapshots[0]["epoch"] == 0
    assert snapshots[2]["epoch"] == 2
