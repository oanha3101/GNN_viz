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


def test_admin_summary_and_user_role_update():
    with TestClient(app) as client:
        admin_data = _register(client, "admin", "admin_ops")
        researcher_data = _register(client, "researcher", "researcher_ops")
        admin_headers = {"Authorization": f"Bearer {admin_data['access_token']}"}

        summary_response = client.get("/api/admin/summary", headers=admin_headers)
        assert summary_response.status_code == 200, summary_response.text
        summary = summary_response.json()
        assert summary["users"] >= 2
        assert "active_sessions" in summary

        users_response = client.get("/api/admin/users", headers=admin_headers)
        assert users_response.status_code == 200, users_response.text
        users_payload = users_response.json()
        assert users_payload["total"] >= 2
        assert users_payload["page"] == 1
        assert users_payload["page_size"] >= 2
        items = users_payload["items"]
        assert any(item["username"] == researcher_data["user"]["username"] for item in items)

        role_response = client.patch(
            f"/api/admin/users/{researcher_data['user']['id']}/role",
            json={"role": "viewer"},
            headers=admin_headers,
        )
        assert role_response.status_code == 200, role_response.text
        assert role_response.json()["role"] == "viewer"


def test_non_admin_cannot_access_admin_routes():
    with TestClient(app) as client:
        researcher_data = _register(client, "researcher", "non_admin_guard")
        headers = {"Authorization": f"Bearer {researcher_data['access_token']}"}

        response = client.get("/api/admin/summary", headers=headers)
        assert response.status_code == 403


def test_admin_can_stop_retry_and_view_audit_logs():
    with TestClient(app) as client:
        admin_data = _register(client, "admin", "admin_session")
        admin_headers = {"Authorization": f"Bearer {admin_data['access_token']}"}

        session_response = client.post(
            "/api/sessions",
            json={
                "task": 1,
                "model": "GCN",
                "dataset": "cora",
                "epochs": 5,
            },
            headers=admin_headers,
        )
        assert session_response.status_code == 200, session_response.text
        session_id = session_response.json()["session_id"]

        sessions_response = client.get("/api/admin/sessions", headers=admin_headers)
        assert sessions_response.status_code == 200, sessions_response.text
        sessions_payload = sessions_response.json()
        assert sessions_payload["total"] >= 1
        assert any(item["id"] == session_id for item in sessions_payload["items"])

        stop_response = client.post(f"/api/admin/sessions/{session_id}/stop", headers=admin_headers)
        assert stop_response.status_code == 200, stop_response.text
        assert stop_response.json()["status"] == "stopped"

        retry_response = client.post(f"/api/admin/sessions/{session_id}/retry", headers=admin_headers)
        assert retry_response.status_code == 200, retry_response.text
        assert retry_response.json()["status"] == "pending"

        audit_response = client.get("/api/admin/audit-logs", headers=admin_headers)
        assert audit_response.status_code == 200, audit_response.text
        audit_payload = audit_response.json()
        assert isinstance(audit_payload["items"], list)
        assert "total" in audit_payload


def test_owner_can_stop_own_session_but_other_researcher_cannot():
    with TestClient(app) as client:
        owner_data = _register(client, "researcher", "session_owner")
        other_data = _register(client, "researcher", "session_other")
        owner_headers = {"Authorization": f"Bearer {owner_data['access_token']}"}
        other_headers = {"Authorization": f"Bearer {other_data['access_token']}"}

        session_response = client.post(
            "/api/sessions",
            json={
                "task": 1,
                "model": "GCN",
                "dataset": "owned_session_graph",
                "epochs": 3,
            },
            headers=owner_headers,
        )
        assert session_response.status_code == 200, session_response.text
        session_id = session_response.json()["session_id"]

        forbidden_response = client.post(
            f"/api/sessions/{session_id}/stop",
            headers=other_headers,
        )
        assert forbidden_response.status_code == 403, forbidden_response.text

        stop_response = client.post(
            f"/api/sessions/{session_id}/stop",
            headers=owner_headers,
        )
        assert stop_response.status_code == 200, stop_response.text
        assert stop_response.json()["status"] == "stopped"


def test_admin_dataset_listing_includes_usage_and_current_version():
    with TestClient(app) as client:
        admin_data = _register(client, "admin", "admin_dataset")
        researcher_data = _register(client, "researcher", "researcher_dataset")
        admin_headers = {"Authorization": f"Bearer {admin_data['access_token']}"}
        researcher_headers = {"Authorization": f"Bearer {researcher_data['access_token']}"}

        dataset_response = client.post(
            "/api/datasets",
            json={
                "name": f"Admin Dataset {uuid.uuid4().hex[:6]}",
                "description": "Dataset for admin listing coverage",
                "summary_json": {"rows": 100},
            },
            headers=researcher_headers,
        )
        assert dataset_response.status_code == 200, dataset_response.text
        dataset_payload = dataset_response.json()
        dataset = dataset_payload["dataset"]
        version = dataset_payload["version"]

        experiment_response = client.post(
            "/api/experiments",
            json={
                "title": "Dataset usage run",
                "dataset_id": dataset["id"],
                "dataset_version_id": version["id"],
                "task_type": 1,
                "model_type": "GCN",
                "dataset_name": dataset["name"],
                "epoch_count": 2,
                "snapshots_json": [{"epoch": 0}, {"epoch": 1}],
                "graph_data_json": {"nodes": [], "links": []},
                "ground_truth_json": [],
                "task_data_json": {},
            },
            headers=researcher_headers,
        )
        assert experiment_response.status_code == 200, experiment_response.text

        datasets_response = client.get("/api/admin/datasets", headers=admin_headers)
        assert datasets_response.status_code == 200, datasets_response.text
        payload = datasets_response.json()
        target = next(item for item in payload["items"] if item["id"] == dataset["id"])

        assert target["version_count"] >= 1
        assert target["usage_count"] >= 1
        assert target["current_version"]["id"] == version["id"]
        assert target["current_version"]["version"] == 1
