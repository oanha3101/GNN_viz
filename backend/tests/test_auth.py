"""
TDD: Tests for Auth (Phase D).
"""
import pytest
import sys
import os
os.environ["DISABLE_AUTH"] = "0"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from main import app
from api.routers import auth
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
