import os
import sys
import uuid

from fastapi.testclient import TestClient

os.environ["DISABLE_AUTH"] = "0"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.routers import auth
from main import app
from services.hybrid_store import blob_store

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
        assert "blob_object_count" in summary
        assert "blob_orphan_count" in summary

        users_response = client.get("/api/admin/users", headers=admin_headers)
        assert users_response.status_code == 200, users_response.text
        users_payload = users_response.json()
        assert users_payload["total"] >= 2
        assert users_payload["page"] == 1
        assert users_payload["page_size"] >= 1
        items = users_payload["items"]
        assert any(item["username"] == researcher_data["user"]["username"] for item in items)

        filtered_users_response = client.get(
            "/api/admin/users",
            params={"q": researcher_data["user"]["username"], "page": 1, "page_size": 1},
            headers=admin_headers,
        )
        assert filtered_users_response.status_code == 200, filtered_users_response.text
        filtered_payload = filtered_users_response.json()
        assert filtered_payload["page"] == 1
        assert filtered_payload["page_size"] == 1
        assert filtered_payload["total"] >= 1
        assert filtered_payload["items"][0]["username"] == researcher_data["user"]["username"]

        role_response = client.patch(
            f"/api/admin/users/{researcher_data['user']['id']}/role",
            json={"role": "viewer"},
            headers=admin_headers,
        )
        assert role_response.status_code == 200, role_response.text
        assert role_response.json()["role"] == "viewer"

        update_response = client.patch(
            f"/api/admin/users/{researcher_data['user']['id']}",
            json={"role": "researcher", "is_active": False},
            headers=admin_headers,
        )
        assert update_response.status_code == 200, update_response.text
        assert update_response.json()["role"] == "researcher"
        assert update_response.json()["is_active"] is False


def test_non_admin_cannot_access_admin_routes():
    with TestClient(app) as client:
        researcher_data = _register(client, "researcher", "non_admin_guard")
        headers = {"Authorization": f"Bearer {researcher_data['access_token']}"}

        response = client.get("/api/admin/summary", headers=headers)
        assert response.status_code == 403


def test_admin_can_delete_unreferenced_user():
    with TestClient(app) as client:
        admin_data = _register(client, "admin", "admin_user_delete")
        victim_data = _register(client, "researcher", "user_delete_target")
        admin_headers = {"Authorization": f"Bearer {admin_data['access_token']}"}

        delete_response = client.delete(
            f"/api/admin/users/{victim_data['user']['id']}",
            headers=admin_headers,
        )
        assert delete_response.status_code == 200, delete_response.text
        assert delete_response.json()["status"] == "deleted"


def test_admin_can_create_user():
    with TestClient(app) as client:
        admin_data = _register(client, "admin", "admin_user_create")
        admin_headers = {"Authorization": f"Bearer {admin_data['access_token']}"}
        suffix = uuid.uuid4().hex[:8]

        create_response = client.post(
            "/api/admin/users",
            json={
                "email": f"created_{suffix}@example.com",
                "username": f"created_{suffix}",
                "password": "password123",
                "full_name": "Created From Admin",
                "bio": "Admin-created profile",
                "github_url": "https://github.com/created-user",
                "organization": "GNN Ops",
                "job_title": "Viewer",
                "location": "Da Nang",
                "profile_image": "https://example.com/avatar.png",
                "role": "viewer",
                "is_active": False,
            },
            headers=admin_headers,
        )
        assert create_response.status_code == 200, create_response.text
        payload = create_response.json()
        assert payload["username"] == f"created_{suffix}"
        assert payload["role"] == "viewer"
        assert payload["is_active"] is False
        assert payload["organization"] == "GNN Ops"
        assert payload["profile_image"] == "https://example.com/avatar.png"


def test_admin_can_update_user_profile_fields():
    with TestClient(app) as client:
        admin_data = _register(client, "admin", "admin_user_profile")
        target_data = _register(client, "researcher", "user_profile_target")
        admin_headers = {"Authorization": f"Bearer {admin_data['access_token']}"}

        update_response = client.patch(
            f"/api/admin/users/{target_data['user']['id']}",
            json={
                "email": f"updated_{uuid.uuid4().hex[:6]}@example.com",
                "username": f"updated_{uuid.uuid4().hex[:6]}",
                "full_name": "Updated Profile User",
                "bio": "Works on graph explainability.",
                "github_url": "https://github.com/profile-target",
                "organization": "BKDN",
                "job_title": "Research Assistant",
                "location": "Da Nang",
                "profile_image": "https://example.com/updated-avatar.png",
                "role": "viewer",
                "is_active": False,
            },
            headers=admin_headers,
        )
        assert update_response.status_code == 200, update_response.text
        payload = update_response.json()
        assert payload["full_name"] == "Updated Profile User"
        assert payload["bio"] == "Works on graph explainability."
        assert payload["github_url"] == "https://github.com/profile-target"
        assert payload["organization"] == "BKDN"
        assert payload["job_title"] == "Research Assistant"
        assert payload["location"] == "Da Nang"
        assert payload["profile_image"] == "https://example.com/updated-avatar.png"
        assert payload["role"] == "viewer"
        assert payload["is_active"] is False


def test_admin_cannot_delete_user_with_owned_records():
    with TestClient(app) as client:
        admin_data = _register(client, "admin", "admin_user_block")
        researcher_data = _register(client, "researcher", "user_block_target")
        admin_headers = {"Authorization": f"Bearer {admin_data['access_token']}"}
        researcher_headers = {"Authorization": f"Bearer {researcher_data['access_token']}"}

        project_response = client.post(
            "/api/projects",
            json={"title": "Owned Project", "description": "blocks delete"},
            headers=researcher_headers,
        )
        assert project_response.status_code == 200, project_response.text

        delete_response = client.delete(
            f"/api/admin/users/{researcher_data['user']['id']}",
            headers=admin_headers,
        )
        assert delete_response.status_code == 409, delete_response.text


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


def test_admin_can_delete_stopped_session():
    with TestClient(app) as client:
        admin_data = _register(client, "admin", "admin_session_delete")
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

        stop_response = client.post(f"/api/admin/sessions/{session_id}/stop", headers=admin_headers)
        assert stop_response.status_code == 200, stop_response.text

        delete_response = client.delete(f"/api/admin/sessions/{session_id}", headers=admin_headers)
        assert delete_response.status_code == 200, delete_response.text
        assert delete_response.json()["status"] == "deleted"

        sessions_response = client.get("/api/admin/sessions", headers=admin_headers)
        assert sessions_response.status_code == 200, sessions_response.text
        assert not any(item["id"] == session_id for item in sessions_response.json()["items"])


def test_admin_cannot_delete_active_session():
    with TestClient(app) as client:
        admin_data = _register(client, "admin", "admin_session_delete_block")
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

        delete_response = client.delete(f"/api/admin/sessions/{session_id}", headers=admin_headers)
        assert delete_response.status_code == 409, delete_response.text
        assert "Stop it before deleting" in delete_response.json()["detail"]


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


def test_admin_can_update_and_delete_unreferenced_dataset():
    with TestClient(app) as client:
        admin_data = _register(client, "admin", "admin_dataset_crud")
        researcher_data = _register(client, "researcher", "dataset_owner_crud")
        admin_headers = {"Authorization": f"Bearer {admin_data['access_token']}"}
        researcher_headers = {"Authorization": f"Bearer {researcher_data['access_token']}"}

        dataset_response = client.post(
            "/api/datasets",
            json={
                "name": f"Mutable Dataset {uuid.uuid4().hex[:6]}",
                "description": "before update",
                "summary_json": {"rows": 12},
            },
            headers=researcher_headers,
        )
        assert dataset_response.status_code == 200, dataset_response.text
        dataset = dataset_response.json()["dataset"]

        update_response = client.patch(
            f"/api/admin/datasets/{dataset['id']}",
            json={
                "name": f"Updated Dataset {uuid.uuid4().hex[:4]}",
                "description": "after update",
                "is_public": True,
            },
            headers=admin_headers,
        )
        assert update_response.status_code == 200, update_response.text
        updated = update_response.json()
        assert updated["description"] == "after update"
        assert updated["is_public"] is True

        delete_response = client.delete(
            f"/api/admin/datasets/{dataset['id']}",
            headers=admin_headers,
        )
        assert delete_response.status_code == 200, delete_response.text
        assert delete_response.json()["status"] == "deleted"


def test_admin_can_update_and_delete_unreferenced_project():
    with TestClient(app) as client:
        admin_data = _register(client, "admin", "admin_project_crud")
        researcher_data = _register(client, "researcher", "project_owner_crud")
        admin_headers = {"Authorization": f"Bearer {admin_data['access_token']}"}
        researcher_headers = {"Authorization": f"Bearer {researcher_data['access_token']}"}

        project_response = client.post(
            "/api/projects",
            json={
                "title": f"Mutable Project {uuid.uuid4().hex[:6]}",
                "description": "before update",
            },
            headers=researcher_headers,
        )
        assert project_response.status_code == 200, project_response.text
        project = project_response.json()

        update_response = client.patch(
            f"/api/admin/projects/{project['id']}",
            json={
                "title": f"Updated Project {uuid.uuid4().hex[:4]}",
                "description": "after update",
                "is_public": True,
            },
            headers=admin_headers,
        )
        assert update_response.status_code == 200, update_response.text
        updated = update_response.json()
        assert updated["description"] == "after update"
        assert updated["is_public"] is True

        delete_response = client.delete(
            f"/api/admin/projects/{project['id']}",
            headers=admin_headers,
        )
        assert delete_response.status_code == 200, delete_response.text
        assert delete_response.json()["status"] == "deleted"


def test_admin_cannot_delete_project_with_experiments():
    with TestClient(app) as client:
        admin_data = _register(client, "admin", "admin_project_block")
        researcher_data = _register(client, "researcher", "project_block_owner")
        admin_headers = {"Authorization": f"Bearer {admin_data['access_token']}"}
        researcher_headers = {"Authorization": f"Bearer {researcher_data['access_token']}"}

        project_response = client.post(
            "/api/projects",
            json={
                "title": f"Protected Project {uuid.uuid4().hex[:6]}",
                "description": "will get an experiment",
            },
            headers=researcher_headers,
        )
        assert project_response.status_code == 200, project_response.text
        project = project_response.json()

        experiment_response = client.post(
            "/api/experiments",
            json={
                "title": "Project-bound run",
                "project_id": project["id"],
                "task_type": 1,
                "model_type": "GCN",
                "dataset_name": "cora",
                "epoch_count": 2,
                "snapshots_json": [{"epoch": 0}, {"epoch": 1}],
                "graph_data_json": {"nodes": [], "links": []},
                "ground_truth_json": [],
                "task_data_json": {},
            },
            headers=researcher_headers,
        )
        assert experiment_response.status_code == 200, experiment_response.text

        delete_response = client.delete(
            f"/api/admin/projects/{project['id']}",
            headers=admin_headers,
        )
        assert delete_response.status_code == 409, delete_response.text


def test_admin_can_run_blob_cleanup_dry_run_and_real_run():
    orphan_key = f"datasets/raw/orphan-{uuid.uuid4().hex[:8]}.bin"

    with TestClient(app) as client:
        admin_data = _register(client, "admin", "admin_blob_cleanup")
        admin_headers = {"Authorization": f"Bearer {admin_data['access_token']}"}
        blob_store.put_bytes(orphan_key, b"orphan-payload")
        assert blob_store.exists(orphan_key) is True

        dry_run_response = client.post("/api/admin/blob-cleanup", params={"dry_run": "true"}, headers=admin_headers)
        assert dry_run_response.status_code == 200, dry_run_response.text
        dry_run_payload = dry_run_response.json()
        assert dry_run_payload["dry_run"] is True
        assert orphan_key in dry_run_payload["orphan_keys"]
        assert blob_store.exists(orphan_key) is True

        dry_run_audit_response = client.get(
            "/api/admin/audit-logs",
            params={"action": "retention_purged"},
            headers=admin_headers,
        )
        assert dry_run_audit_response.status_code == 200, dry_run_audit_response.text
        assert dry_run_audit_response.json()["total"] == 0

        run_response = client.post("/api/admin/blob-cleanup", params={"dry_run": "false"}, headers=admin_headers)
        assert run_response.status_code == 200, run_response.text
        run_payload = run_response.json()
        assert run_payload["dry_run"] is False
        assert orphan_key in run_payload["deleted_keys"]
        assert blob_store.exists(orphan_key) is False

        audit_response = client.get(
            "/api/admin/audit-logs",
            params={"action": "retention_purged"},
            headers=admin_headers,
        )
        assert audit_response.status_code == 200, audit_response.text
        audit_payload = audit_response.json()
        assert audit_payload["total"] == 1
        assert audit_payload["items"][0]["target_type"] == "blob_store"
        assert audit_payload["items"][0]["target_id"] == blob_store.provider
        assert orphan_key in audit_payload["items"][0]["details_json"]["deleted_keys"]
