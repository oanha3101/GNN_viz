"""
Coverage for Phase 1-2 governance routes:
- projects CRUD guardrails
- datasets/version lifecycle
- retention dry-run admin access
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


def _register_and_token(client: TestClient, role: str, prefix: str) -> str:
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
    return response.json()["access_token"]


def test_researcher_can_manage_project_and_dataset_lifecycle():
    with TestClient(app) as client:
        token = _register_and_token(client, "researcher", "researcher")
        headers = {"Authorization": f"Bearer {token}"}

        project_response = client.post(
            "/api/projects",
            json={
                "title": "Hybrid Project",
                "description": "Phase 2 governance coverage",
                "task_type": 1,
                "model_type": "GCN",
            },
            headers=headers,
        )
        assert project_response.status_code == 200, project_response.text
        project = project_response.json()
        assert project["title"] == "Hybrid Project"

        project_list_response = client.get("/api/projects", headers=headers)
        assert project_list_response.status_code == 200, project_list_response.text
        project_list = project_list_response.json()
        assert "items" in project_list
        assert "total" in project_list
        assert "page" in project_list
        assert "page_size" in project_list
        assert any(item["id"] == project["id"] for item in project_list["items"])

        dataset_response = client.post(
            "/api/datasets",
            json={
                "name": f"Dataset {uuid.uuid4().hex[:6]}",
                "description": "Governance dataset",
                "summary_json": {"rows": 42},
                "validation_json": {"valid": True},
            },
            headers=headers,
        )
        assert dataset_response.status_code == 200, dataset_response.text
        dataset_payload = dataset_response.json()
        dataset = dataset_payload["dataset"]
        version = dataset_payload["version"]
        assert version["lifecycle"] == "draft"

        dataset_list_response = client.get("/api/datasets", headers=headers)
        assert dataset_list_response.status_code == 200, dataset_list_response.text
        dataset_list = dataset_list_response.json()
        assert "items" in dataset_list
        assert "total" in dataset_list
        assert "page" in dataset_list
        assert "page_size" in dataset_list
        assert any(item["id"] == dataset["id"] for item in dataset_list["items"])

        new_version_response = client.post(
            f"/api/datasets/{dataset['id']}/versions",
            json={"summary_json": {"rows": 84}},
            headers=headers,
        )
        assert new_version_response.status_code == 200, new_version_response.text
        new_version = new_version_response.json()
        assert new_version["version"] == 2
        assert new_version["lifecycle"] == "draft"

        publish_response = client.post(
            f"/api/datasets/{dataset['id']}/publish",
            params={"version_id": new_version["id"]},
            headers=headers,
        )
        assert publish_response.status_code == 200, publish_response.text
        assert publish_response.json()["lifecycle"] == "published"

        detail_response = client.get(f"/api/datasets/{dataset['id']}", headers=headers)
        assert detail_response.status_code == 200, detail_response.text
        detail = detail_response.json()
        assert detail["dataset"]["current_version_id"] == new_version["id"]
        assert len(detail["versions"]) >= 2


def test_viewer_cannot_create_project_or_dataset():
    with TestClient(app) as client:
        token = _register_and_token(client, "viewer", "viewer")
        headers = {"Authorization": f"Bearer {token}"}

        project_response = client.post(
            "/api/projects",
            json={"title": "Forbidden Project"},
            headers=headers,
        )
        assert project_response.status_code == 403

        dataset_response = client.post(
            "/api/datasets",
            json={"name": f"Viewer Dataset {uuid.uuid4().hex[:6]}"},
            headers=headers,
        )
        assert dataset_response.status_code == 403

        session_response = client.post(
            "/api/sessions",
            json={
                "task": 1,
                "model": "GCN",
                "dataset": "viewer_dataset",
                "epochs": 3,
            },
            headers=headers,
        )
        assert session_response.status_code == 403

        experiment_response = client.post(
            "/api/experiments",
            json={
                "title": "Viewer Experiment",
                "task_type": 1,
                "model_type": "GCN",
                "dataset_name": "viewer_dataset",
                "epoch_count": 1,
                "snapshots_json": [{"epoch": 0}],
                "graph_data_json": {"nodes": [], "links": []},
                "ground_truth_json": [],
                "task_data_json": {},
            },
            headers=headers,
        )
        assert experiment_response.status_code == 403


def test_private_dataset_is_hidden_from_other_researchers():
    with TestClient(app) as client:
        owner_token = _register_and_token(client, "researcher", "dataset_owner")
        other_token = _register_and_token(client, "researcher", "dataset_other")
        owner_headers = {"Authorization": f"Bearer {owner_token}"}
        other_headers = {"Authorization": f"Bearer {other_token}"}

        dataset_response = client.post(
            "/api/datasets",
            json={
                "name": f"Private Dataset {uuid.uuid4().hex[:6]}",
                "description": "Owner only dataset",
                "is_public": False,
            },
            headers=owner_headers,
        )
        assert dataset_response.status_code == 200, dataset_response.text
        dataset = dataset_response.json()["dataset"]

        other_list_response = client.get("/api/datasets", headers=other_headers)
        assert other_list_response.status_code == 200, other_list_response.text
        other_items = other_list_response.json()["items"]
        assert all(item["id"] != dataset["id"] for item in other_items)

        detail_response = client.get(f"/api/datasets/{dataset['id']}", headers=other_headers)
        assert detail_response.status_code == 403


def test_admin_can_run_retention_dry_run():
    with TestClient(app) as client:
        admin_token = _register_and_token(client, "admin", "admin")
        headers = {"Authorization": f"Bearer {admin_token}"}

        save_response = client.post(
            "/api/experiments",
            json={
                "title": "Retention Seed",
                "task_type": 1,
                "model_type": "GCN",
                "dataset_name": "retention_seed",
                "epoch_count": 3,
                "snapshots_json": [{"epoch": 0}, {"epoch": 1}, {"epoch": 2}],
                "graph_data_json": {"nodes": [], "links": []},
                "ground_truth_json": [],
                "task_data_json": {},
            },
        )
        assert save_response.status_code == 200, save_response.text

        retention_response = client.post(
            "/api/experiments/retention",
            params={"dry_run": "true"},
            headers=headers,
        )
        assert retention_response.status_code == 200, retention_response.text
        payload = retention_response.json()
        assert payload["dry_run"] is True
        assert isinstance(payload["results"], list)


def test_session_routes_are_scoped_to_owner_or_admin():
    with TestClient(app) as client:
        owner_token = _register_and_token(client, "researcher", "session_owner_scope")
        other_token = _register_and_token(client, "researcher", "session_other_scope")
        admin_token = _register_and_token(client, "admin", "session_admin_scope")

        owner_headers = {"Authorization": f"Bearer {owner_token}"}
        other_headers = {"Authorization": f"Bearer {other_token}"}
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        session_response = client.post(
            "/api/sessions",
            json={
                "task": 3,
                "model": "GAT",
                "dataset": "owner-only-session",
                "epochs": 4,
            },
            headers=owner_headers,
        )
        assert session_response.status_code == 200, session_response.text
        session_id = session_response.json()["session_id"]

        owner_detail = client.get(f"/api/sessions/{session_id}", headers=owner_headers)
        assert owner_detail.status_code == 200, owner_detail.text

        other_detail = client.get(f"/api/sessions/{session_id}", headers=other_headers)
        assert other_detail.status_code == 403, other_detail.text

        other_resume = client.get(f"/api/sessions/{session_id}/resume", headers=other_headers)
        assert other_resume.status_code == 403, other_resume.text

        other_patch = client.patch(
            f"/api/sessions/{session_id}",
            json={"status": "running"},
            headers=other_headers,
        )
        assert other_patch.status_code == 403, other_patch.text

        admin_detail = client.get(f"/api/sessions/{session_id}", headers=admin_headers)
        assert admin_detail.status_code == 200, admin_detail.text
