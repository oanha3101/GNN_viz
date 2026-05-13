"""
Extended admin tests — experiments, retention, audit filtering, bulk delete.
"""
import os
import sys
import uuid

from fastapi.testclient import TestClient

os.environ["DISABLE_AUTH"] = "0"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.routers import auth
from main import app

auth.DISABLE_AUTH = False


def _register(client: TestClient, role: str, prefix: str):
    suffix = uuid.uuid4().hex[:8]
    response = client.post(
        "/api/auth/register",
        json={
            "email": f"{prefix}_{suffix}@example.com",
            "username": f"{prefix}_{suffix}",
            "password": "password123",
            "full_name": prefix.title(),
            "role": role,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def _headers(token):
    return {"Authorization": f"Bearer {token}"}


def _create_experiment(client, headers, title="Test Exp", task_type=1):
    resp = client.post("/api/experiments", json={
        "title": title,
        "task_type": task_type,
        "model_type": "GCN",
        "dataset_name": "cora",
        "epoch_count": 3,
        "accuracy": 0.8,
        "loss": 0.3,
        "snapshots_json": [{"epoch": i, "accuracy": 0.5 + i * 0.1} for i in range(3)],
        "graph_data_json": {"nodes": [], "links": []},
        "ground_truth_json": [],
        "task_data_json": {},
    }, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def test_admin_experiments_listing():
    """Admin should see all experiments."""
    with TestClient(app) as client:
        admin = _register(client, "admin", "admin_exp_list")
        researcher = _register(client, "researcher", "researcher_exp_list")
        admin_h = _headers(admin["access_token"])
        researcher_h = _headers(researcher["access_token"])

        _create_experiment(client, researcher_h, "Exp A")
        _create_experiment(client, researcher_h, "Exp B")

        resp = client.get("/api/admin/experiments", headers=admin_h)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 2


def test_admin_experiments_filter_by_status():
    """Admin can filter experiments by status."""
    with TestClient(app) as client:
        admin = _register(client, "admin", "admin_exp_filter")
        admin_h = _headers(admin["access_token"])

        resp = client.get("/api/admin/experiments", params={"status": "completed"}, headers=admin_h)
        assert resp.status_code == 200


def test_admin_sessions_filter_by_status():
    """Admin can filter sessions by status."""
    with TestClient(app) as client:
        admin = _register(client, "admin", "admin_sess_filter")
        admin_h = _headers(admin["access_token"])

        resp = client.get("/api/admin/sessions", params={"status": "running"}, headers=admin_h)
        assert resp.status_code == 200


def test_admin_audit_logs_filter_by_action():
    """Admin can filter audit logs by action type."""
    with TestClient(app) as client:
        admin = _register(client, "admin", "admin_audit_filter")
        admin_h = _headers(admin["access_token"])

        resp = client.get("/api/admin/audit-logs", params={"action": "user_registered"}, headers=admin_h)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data


def test_admin_audit_logs_filter_by_target_type():
    """Admin can filter audit logs by target type."""
    with TestClient(app) as client:
        admin = _register(client, "admin", "admin_audit_target")
        admin_h = _headers(admin["access_token"])

        resp = client.get("/api/admin/audit-logs", params={"target_type": "user"}, headers=admin_h)
        assert resp.status_code == 200


def test_admin_retention_dry_run():
    """Admin can run retention in dry-run mode."""
    with TestClient(app) as client:
        admin = _register(client, "admin", "admin_retention")
        admin_h = _headers(admin["access_token"])

        resp = client.post("/api/admin/retention", params={"dry_run": "true"}, headers=admin_h)
        assert resp.status_code == 200
        data = resp.json()
        assert data["dry_run"] is True
        assert "results" in data


def test_non_admin_cannot_run_retention():
    """Non-admin users should not be able to run retention."""
    with TestClient(app) as client:
        researcher = _register(client, "researcher", "no_retention")
        headers = _headers(researcher["access_token"])

        resp = client.post("/api/admin/retention", params={"dry_run": "true"}, headers=headers)
        assert resp.status_code == 403


def test_non_admin_cannot_bulk_delete():
    """Non-admin users should not be able to bulk delete experiments."""
    with TestClient(app) as client:
        researcher = _register(client, "researcher", "no_bulk_del")
        headers = _headers(researcher["access_token"])

        resp = client.post("/api/experiments/bulk-delete", json={
            "experiment_ids": [1, 2, 3],
        }, headers=headers)
        assert resp.status_code == 403


def test_unauthenticated_user_cannot_bulk_delete():
    """Bulk delete should require an authenticated user when auth is enabled."""
    with TestClient(app) as client:
        resp = client.post("/api/experiments/bulk-delete", json={
            "experiment_ids": [1, 2, 3],
        })
        assert resp.status_code == 401


def test_admin_bulk_delete_experiments():
    """Admin can bulk delete specific experiments."""
    with TestClient(app) as client:
        admin = _register(client, "admin", "admin_bulk_del")
        researcher = _register(client, "researcher", "bulk_del_owner")
        admin_h = _headers(admin["access_token"])
        researcher_h = _headers(researcher["access_token"])

        exp1 = _create_experiment(client, researcher_h, "Bulk A")
        exp2 = _create_experiment(client, researcher_h, "Bulk B")
        exp3 = _create_experiment(client, researcher_h, "Bulk C")

        resp = client.post("/api/experiments/bulk-delete", json={
            "experiment_ids": [exp1, exp2, 999999],
        }, headers=admin_h)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "bulk_deleted"
        assert exp1 in data["deleted"]
        assert exp2 in data["deleted"]
        assert 999999 in data["not_found"]

        # exp3 should still exist
        get_resp = client.get(f"/api/experiments/{exp3}", headers=researcher_h)
        assert get_resp.status_code == 200


def test_admin_user_list_limit():
    """Admin can limit the number of users returned."""
    with TestClient(app) as client:
        admin = _register(client, "admin", "admin_limit")
        admin_h = _headers(admin["access_token"])

        resp = client.get("/api/admin/users", params={"limit": 1}, headers=admin_h)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) <= 1


def test_unauthenticated_admin_access():
    """Unauthenticated requests to admin endpoints should be rejected."""
    with TestClient(app) as client:
        resp = client.get("/api/admin/summary")
        assert resp.status_code in (401, 403)
