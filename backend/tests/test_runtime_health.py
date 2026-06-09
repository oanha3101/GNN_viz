"""
Runtime baseline tests for Docker-first health and strict stack validation.
"""
import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import database
from main import app
from services import hybrid_store


def test_health_endpoint_reports_runtime_status():
    with TestClient(app) as client:
        response = client.get("/api/health")
        assert response.status_code in (200, 503), response.text
        payload = response.json()

        assert payload["status"] in {"ok", "degraded"}
        assert "runtime" in payload
        assert "degraded_services" in payload

        runtime = payload["runtime"]
        assert runtime["mysql"]["available"] is True
        assert "configured_url" in runtime["mysql"]
        assert "driver" in runtime["mysql"]
        assert "available" in runtime["mongo"]
        assert "available" in runtime["redis"]
        assert runtime["blob"]["provider"] in {"local", "minio"}
        assert "available" in runtime["blob"]
        assert "strict_ready" in runtime["blob"]


def test_validate_runtime_requirements_allows_degraded_stack_when_not_strict(monkeypatch):
    monkeypatch.setattr(database, "mysql_fallback_active", True)
    monkeypatch.setattr(database, "mongo_available", False)
    monkeypatch.setattr(database, "redis_available", False)

    status = database.validate_runtime_requirements(require_runtime_stack=False)
    assert status["mysql"]["fallback_active"] is True
    assert status["mongo"]["fallback_active"] is True
    assert status["redis"]["fallback_active"] is True


def test_validate_runtime_requirements_fails_in_strict_mode(monkeypatch):
    monkeypatch.setattr(database, "mysql_fallback_active", False)
    monkeypatch.setattr(database, "mongo_available", False)
    monkeypatch.setattr(database, "redis_available", False)

    with pytest.raises(RuntimeError) as exc_info:
        database.validate_runtime_requirements(require_runtime_stack=True)

    message = str(exc_info.value)
    assert "mongo" in message
    assert "redis" in message


def test_validate_blob_runtime_requirements_allows_local_mode_when_not_strict(monkeypatch):
    monkeypatch.setattr(hybrid_store.blob_store, "provider", "local")
    monkeypatch.setattr(hybrid_store.blob_store, "root_dir", "./tmp/blob-store")

    status = hybrid_store.validate_blob_runtime_requirements(require_runtime_stack=False)
    assert status["provider"] == "local"
    assert status["available"] is True
    assert status["strict_ready"] is False


def test_validate_blob_runtime_requirements_fails_in_strict_mode_for_local_provider(monkeypatch):
    monkeypatch.setattr(hybrid_store.blob_store, "provider", "local")
    monkeypatch.setattr(hybrid_store.blob_store, "root_dir", "./tmp/blob-store")

    with pytest.raises(RuntimeError) as exc_info:
        hybrid_store.validate_blob_runtime_requirements(require_runtime_stack=True)

    assert "Strict runtime mode requires MinIO" in str(exc_info.value)


def test_validate_blob_runtime_requirements_fails_in_strict_mode_when_minio_unavailable(monkeypatch):
    monkeypatch.setattr(hybrid_store.blob_store, "provider", "minio")
    monkeypatch.setattr(hybrid_store.blob_store, "_available", False)
    monkeypatch.setattr(hybrid_store.blob_store, "_last_error", "connection refused")

    with pytest.raises(RuntimeError) as exc_info:
        hybrid_store.validate_blob_runtime_requirements(require_runtime_stack=True)

    assert "unavailable in strict mode" in str(exc_info.value)


def test_strict_mode_save_experiment_rejects_local_mongo_fallback(monkeypatch):
    from main import app

    monkeypatch.setattr(hybrid_store, "STRICT_RUNTIME_STACK", True)
    monkeypatch.setattr(database, "mongo_available", False)
    monkeypatch.setattr(hybrid_store, "mongo_available", False)
    monkeypatch.setattr(hybrid_store.blob_store, "provider", "minio")
    monkeypatch.setattr(hybrid_store.blob_store, "_available", True)
    monkeypatch.setattr(hybrid_store.blob_store, "_last_error", None)

    payload = {
        "title": "Strict Persistence Run",
        "task_type": 1,
        "model_type": "GCN",
        "dataset_name": "strict_persistence_data",
        "epoch_count": 1,
        "is_mock": True,
        "snapshots_json": [{"epoch": 0, "accuracy": 0.5}],
        "graph_data_json": {"nodes": [], "links": []},
        "ground_truth_json": [],
        "task_data_json": {},
    }

    with TestClient(app) as client:
        response = client.post("/api/experiments", json=payload)

    assert response.status_code == 503, response.text
    assert "Strict runtime mode does not allow local replay fallbacks" in response.json()["detail"]
