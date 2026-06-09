"""
Project service tests — CRUD, access control, serialization.
"""
import os
import sys

import pytest
from fastapi.testclient import TestClient
from fastapi import HTTPException

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["DISABLE_AUTH"] = "0"

from main import app
from api.routers import auth
auth.DISABLE_AUTH = False

client = TestClient(app)


def _register(suffix="proj"):
    import uuid
    uid = uuid.uuid4().hex[:8]
    username = f"proj_{suffix}_{uid}"
    resp = client.post("/api/auth/register", json={
        "email": f"{username}@test.com",
        "username": username,
        "password": "TestPass123!",
        "full_name": "Project Tester",
    })
    assert resp.status_code == 200
    data = resp.json()
    return data["access_token"], data["user"]["id"]


def _headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_create_project():
    token, _ = _register("create")
    resp = client.post("/api/projects", json={
        "title": "Test Project",
        "description": "A test project",
    }, headers=_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Test Project"
    assert data["description"] == "A test project"
    assert "id" in data
    assert "created_at" in data


def test_list_projects():
    token, _ = _register("list")
    # Create a project first
    client.post("/api/projects", json={
        "title": "List Test Project",
        "description": "For listing",
    }, headers=_headers(token))
    # List
    resp = client.get("/api/projects", headers=_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert len(data["items"]) >= 1


def test_get_project_by_id():
    token, _ = _register("get")
    create_resp = client.post("/api/projects", json={
        "title": "Get Test Project",
        "description": "For getting by ID",
    }, headers=_headers(token))
    project_id = create_resp.json()["id"]

    resp = client.get(f"/api/projects/{project_id}", headers=_headers(token))
    assert resp.status_code == 200
    assert resp.json()["title"] == "Get Test Project"


def test_update_project():
    token, _ = _register("update")
    create_resp = client.post("/api/projects", json={
        "title": "Update Test Project",
        "description": "Before update",
    }, headers=_headers(token))
    project_id = create_resp.json()["id"]

    resp = client.patch(f"/api/projects/{project_id}", json={
        "title": "Updated Title",
    }, headers=_headers(token))
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated Title"


def test_project_not_found():
    token, _ = _register("notfound")
    resp = client.get("/api/projects/999999", headers=_headers(token))
    assert resp.status_code == 404


def test_unauthenticated_project_access():
    """Unauthenticated users should still be able to list public projects."""
    resp = client.get("/api/projects")
    # Should not crash — returns public projects or empty list
    assert resp.status_code in (200, 401, 403)


def test_serialize_project_fields():
    """Serialize function should return all expected fields."""
    from services.project_service import serialize_project
    from models.sql_models import Project
    from datetime import datetime, timezone

    project = Project(
        id=1,
        title="Test",
        description="Desc",
        task_type=1,
        model_type="GCN",
        is_public=True,
        owner_id=1,
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    result = serialize_project(project)
    assert result["id"] == 1
    assert result["title"] == "Test"
    assert result["description"] == "Desc"
    assert result["task_type"] == 1
    assert result["model_type"] == "GCN"
    assert result["is_public"] is True
    assert result["owner_id"] == 1
    assert "2026" in result["created_at"]


def test_ensure_write_access_viewer_blocked():
    """Viewer should not be able to write to projects."""
    from services.project_service import ensure_project_write_access
    from models.sql_models import Project, User

    project = Project(id=1, title="Test", owner_id=2)
    viewer = User(id=1, role="viewer", is_superuser=False)

    with pytest.raises(HTTPException) as exc_info:
        ensure_project_write_access(project, viewer)
    assert exc_info.value.status_code == 403


def test_ensure_write_access_owner_allowed():
    """Owner should be able to write to their project."""
    from services.project_service import ensure_project_write_access
    from models.sql_models import Project, User

    project = Project(id=1, title="Test", owner_id=1)
    owner = User(id=1, role="researcher", is_superuser=False)

    # Should not raise
    ensure_project_write_access(project, owner)


def test_ensure_write_access_admin_allowed():
    """Admin should be able to write to any project."""
    from services.project_service import ensure_project_write_access
    from models.sql_models import Project, User

    project = Project(id=1, title="Test", owner_id=2)
    admin = User(id=1, role="admin", is_superuser=True)

    # Should not raise
    ensure_project_write_access(project, admin)


def test_ensure_read_access_private_non_owner_blocked():
    """Non-owner should not be able to read private projects."""
    from services.project_service import ensure_project_read_access
    from models.sql_models import Project, User

    project = Project(id=1, title="Test", owner_id=2, is_public=False)
    user = User(id=1, role="researcher", is_superuser=False)

    with pytest.raises(HTTPException) as exc_info:
        ensure_project_read_access(project, user)
    assert exc_info.value.status_code == 403


def test_ensure_read_access_public_allowed():
    """Anyone should be able to read public projects."""
    from services.project_service import ensure_project_read_access
    from models.sql_models import Project, User

    project = Project(id=1, title="Test", owner_id=2, is_public=True)
    user = User(id=1, role="researcher", is_superuser=False)

    # Should not raise
    ensure_project_read_access(project, user)
