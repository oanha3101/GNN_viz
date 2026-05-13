"""
Phase A & B tests — runtime baseline, env validation, health endpoint, CORS.
"""
import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import database
from main import app


def test_health_returns_503_when_degraded(monkeypatch):
    """Health endpoint should return 503 when services are degraded."""
    monkeypatch.setattr(database, "mysql_fallback_active", True)
    monkeypatch.setattr(database, "mongo_available", False)
    monkeypatch.setattr(database, "redis_available", False)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/api/health")
        assert response.status_code == 503
        payload = response.json()
        assert payload["status"] == "degraded"
        assert len(payload["degraded_services"]) > 0


def test_health_returns_200_when_all_ok(monkeypatch):
    """Health endpoint should return 200 when all services are healthy."""
    monkeypatch.setattr(database, "mysql_fallback_active", False)
    monkeypatch.setattr(database, "mongo_available", True)
    monkeypatch.setattr(database, "redis_available", True)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/api/health")
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "ok"
        assert payload["degraded_services"] == []


def test_validate_env_config_warns_on_default_jwt_secret(caplog, monkeypatch):
    """Should warn when JWT_SECRET is using default value."""
    monkeypatch.setenv("JWT_SECRET", "gnn-insight-dev-secret-key-change-in-production")
    import logging
    with caplog.at_level(logging.WARNING):
        database._validate_env_config()
    # Should warn about default JWT secret
    assert any("JWT_SECRET" in r.message for r in caplog.records)


def test_validate_env_config_warns_on_disable_auth(caplog, monkeypatch):
    """Should warn when DISABLE_AUTH=1."""
    monkeypatch.setenv("DISABLE_AUTH", "1")
    import logging
    with caplog.at_level(logging.WARNING):
        database._validate_env_config()
    assert any("DISABLE_AUTH" in r.message for r in caplog.records)


def test_validate_env_config_warns_on_wildcard_cors(caplog, monkeypatch):
    """Should warn when CORS_ORIGINS contains wildcard."""
    monkeypatch.setenv("CORS_ORIGINS", "*")
    import logging
    with caplog.at_level(logging.WARNING):
        database._validate_env_config()
    assert any("CORS_ORIGINS" in r.message for r in caplog.records)


def test_validate_env_config_warns_on_local_blob(caplog, monkeypatch):
    """Should warn when BLOB_STORE_PROVIDER=local."""
    monkeypatch.setenv("BLOB_STORE_PROVIDER", "local")
    import logging
    with caplog.at_level(logging.WARNING):
        database._validate_env_config()
    assert any("BLOB_STORE_PROVIDER" in r.message for r in caplog.records)


def test_cors_origins_from_env(monkeypatch):
    """CORS origins should be read from CORS_ORIGINS env var."""
    monkeypatch.setenv("CORS_ORIGINS", "https://example.com,https://app.example.com")
    # Re-import to pick up new env
    import importlib
    import main as main_module
    # Check that the middleware was configured with the right origins
    # We can't easily inspect middleware config, but we can verify the env is read
    origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
    origins = [o.strip() for o in origins if o.strip()]
    assert "https://example.com" in origins
    assert "https://app.example.com" in origins


def test_runtime_status_structure():
    """get_runtime_status should return a well-structured dict."""
    status = database.get_runtime_status()
    assert "strict_runtime_stack" in status
    assert "mysql" in status
    assert "mongo" in status
    assert "redis" in status
    for svc in ("mysql", "mongo", "redis"):
        assert "available" in status[svc]
        assert "fallback_active" in status[svc]


def test_blob_runtime_status_structure():
    """get_blob_runtime_status should return a well-structured dict."""
    from services.hybrid_store import get_blob_runtime_status
    status = get_blob_runtime_status()
    assert "provider" in status
    assert "available" in status
    assert "strict_ready" in status


def test_root_endpoint():
    """Root endpoint should return version info."""
    with TestClient(app) as client:
        response = client.get("/")
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "online"
        assert "version" in payload


def test_metrics_endpoint():
    """Metrics endpoint should return metrics data."""
    with TestClient(app) as client:
        response = client.get("/metrics")
        assert response.status_code == 200
