"""
TDD: Tests for Auth (Phase D).
"""
import pytest
import sys
import os
os.environ["DISABLE_AUTH"] = "0"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from database import SessionLocal
from main import app
from api.routers import auth
from models.sql_models import AuditLog
auth.DISABLE_AUTH = False

def test_register_login_me():
    with TestClient(app) as client:
        import uuid
        uid = str(uuid.uuid4())[:8]
        email = f"test_{uid}@example.com"
        username = f"testuser_{uid}"

        # Register
        resp = client.post("/api/auth/register", json={
            "email": email,
            "username": username,
            "password": "password123",
            "full_name": "Test User"
        })
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "access_token" in data
        token = data["access_token"]

        # Login
        resp = client.post("/api/auth/login", json={
            "username": username,
            "password": "password123"
        })
        assert resp.status_code == 200
        assert "access_token" in resp.json()

        # Me
        resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json()["username"] == username

        update = client.patch("/api/auth/me", headers={"Authorization": f"Bearer {token}"}, json={
            "email": email,
            "username": username,
            "full_name": "Updated User",
            "bio": "Working on graph representation learning.",
            "github_url": "https://github.com/test-user",
            "organization": "GNN Lab",
            "job_title": "Research Engineer",
            "location": "Ho Chi Minh City",
            "profile_image": "https://example.com/avatar.png",
        })
        assert update.status_code == 200, update.text
        updated_payload = update.json()
        assert updated_payload["bio"] == "Working on graph representation learning."
        assert updated_payload["github_url"] == "https://github.com/test-user"
        assert updated_payload["organization"] == "GNN Lab"
        assert updated_payload["job_title"] == "Research Engineer"
        assert updated_payload["location"] == "Ho Chi Minh City"

def test_login_invalid():
    with TestClient(app) as client:
        resp = client.post("/api/auth/login", json={
            "username": "nonexistent",
            "password": "wrong"
        })
        assert resp.status_code == 401


def test_register_rejects_duplicate_email_or_username():
    with TestClient(app) as client:
        import uuid
        uid = str(uuid.uuid4())[:8]
        email = f"duplicate_{uid}@example.com"
        username = f"duplicate_user_{uid}"

        first = client.post("/api/auth/register", json={
            "email": email,
            "username": username,
            "password": "password123",
            "full_name": "Duplicate Test",
        })
        assert first.status_code == 200, first.text

        duplicate = client.post("/api/auth/register", json={
            "email": email,
            "username": username,
            "password": "password123",
            "full_name": "Duplicate Test",
        })
        assert duplicate.status_code == 400
        assert duplicate.json()["detail"] == "Email or username already exists"


def test_register_and_login_create_audit_entries():
    with TestClient(app) as client:
        import uuid

        uid = str(uuid.uuid4())[:8]
        email = f"audit_{uid}@example.com"
        username = f"audit_user_{uid}"

        register = client.post("/api/auth/register", json={
            "email": email,
            "username": username,
            "password": "password123",
            "full_name": "Audit User"
        })
        assert register.status_code == 200, register.text

        login = client.post("/api/auth/login", json={
            "username": username,
            "password": "password123"
        })
        assert login.status_code == 200, login.text

        db = SessionLocal()
        try:
            audit_rows = (
                db.query(AuditLog)
                .filter(AuditLog.action == "login", AuditLog.target_id == str(register.json()["user"]["id"]))
                .order_by(AuditLog.id.asc())
                .all()
            )
            events = [row.details_json.get("event") for row in audit_rows]
            assert "register" in events
            assert "login" in events
        finally:
            db.close()
