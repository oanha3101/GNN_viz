"""
Extended experiment tests — update, report, retention, compare edge cases.
"""
import os
import sys
import uuid

import pytest
from fastapi.testclient import TestClient

os.environ["DISABLE_AUTH"] = "0"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.routers import auth
from main import app

auth.DISABLE_AUTH = False

client = TestClient(app)


def _register(prefix="exp_ext"):
    suffix = uuid.uuid4().hex[:8]
    username = f"{prefix}_{suffix}"
    resp = client.post("/api/auth/register", json={
        "email": f"{username}@test.com",
        "username": username,
        "password": "TestPass123!",
        "full_name": "Exp Tester",
    })
    assert resp.status_code == 200
    return resp.json()


def _headers(token):
    return {"Authorization": f"Bearer {token}"}


def _create_experiment(token, title="Test Exp", task_type=1, model_type="GCN"):
    resp = client.post("/api/experiments", json={
        "title": title,
        "task_type": task_type,
        "model_type": model_type,
        "dataset_name": "cora",
        "epoch_count": 5,
        "accuracy": 0.85,
        "loss": 0.25,
        "best_epoch": 4,
        "snapshots_json": [
            {"epoch": i, "train_loss": 1.0 - i * 0.15, "accuracy": 0.5 + i * 0.07}
            for i in range(5)
        ],
        "graph_data_json": {"nodes": [{"id": j} for j in range(10)], "links": []},
        "ground_truth_json": [0, 1, 2, 0, 1, 2, 0, 1, 2, 0],
        "task_data_json": {"task": task_type},
    }, headers=_headers(token))
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def test_update_experiment_title():
    """Can update experiment title."""
    data = _register("exp_update")
    token = data["access_token"]
    exp_id = _create_experiment(token)

    resp = client.patch(f"/api/experiments/{exp_id}", json={
        "title": "Updated Title",
    }, headers=_headers(token))
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated Title"


def test_update_experiment_notes():
    """Can update experiment notes."""
    data = _register("exp_notes")
    token = data["access_token"]
    exp_id = _create_experiment(token)

    resp = client.patch(f"/api/experiments/{exp_id}", json={
        "notes": "These are my notes",
    }, headers=_headers(token))
    assert resp.status_code == 200
    assert resp.json()["notes"] == "These are my notes"


def test_experiment_report():
    """Report should contain experiment details and metrics."""
    data = _register("exp_report")
    token = data["access_token"]
    exp_id = _create_experiment(token)

    resp = client.get(f"/api/experiments/{exp_id}/report", headers=_headers(token))
    assert resp.status_code == 200
    report = resp.json()
    assert "experiment" in report
    assert report["experiment"]["id"] == exp_id


def test_experiment_report_with_track_export():
    """Report with track_export should create audit log."""
    data = _register("exp_track")
    token = data["access_token"]
    exp_id = _create_experiment(token)

    resp = client.get(f"/api/experiments/{exp_id}/report", params={"track_export": True}, headers=_headers(token))
    assert resp.status_code == 200


def test_experiment_not_found():
    """Getting non-existent experiment should return 404."""
    data = _register("exp_404")
    token = data["access_token"]

    resp = client.get("/api/experiments/999999", headers=_headers(token))
    assert resp.status_code == 404


def test_compare_two_experiments():
    """Compare should return metrics for both experiments."""
    data = _register("exp_compare")
    token = data["access_token"]
    exp1 = _create_experiment(token, "Compare A", model_type="GCN")
    exp2 = _create_experiment(token, "Compare B", model_type="GAT")

    resp = client.post("/api/experiments/compare", json={
        "experiment_ids": [exp1, exp2],
    }, headers=_headers(token))
    assert resp.status_code == 200
    result = resp.json()
    assert len(result["results"]) == 2


def test_list_experiments_with_filters():
    """Can filter experiments by task_type and model_type."""
    data = _register("exp_filter")
    token = data["access_token"]
    _create_experiment(token, "Filter A", task_type=1, model_type="GCN")
    _create_experiment(token, "Filter B", task_type=2, model_type="GAT")

    resp = client.get("/api/experiments", params={"task_type": 1}, headers=_headers(token))
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert all(e["task_type"] == 1 for e in items)


def test_list_experiments_with_search():
    """Can search experiments by title."""
    data = _register("exp_search")
    token = data["access_token"]
    _create_experiment(token, "UniqueSearchableTitle123")

    resp = client.get("/api/experiments", params={"q": "UniqueSearchable"}, headers=_headers(token))
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert any("UniqueSearchable" in e["title"] for e in items)


def test_delete_experiment():
    """Can delete an experiment."""
    data = _register("exp_delete")
    token = data["access_token"]
    exp_id = _create_experiment(token)

    resp = client.delete(f"/api/experiments/{exp_id}", headers=_headers(token))
    assert resp.status_code == 200

    # Verify deleted
    resp = client.get(f"/api/experiments/{exp_id}", headers=_headers(token))
    assert resp.status_code == 404


def test_experiment_replay():
    """Replay should return snapshots."""
    data = _register("exp_replay")
    token = data["access_token"]
    exp_id = _create_experiment(token)

    resp = client.post(f"/api/experiments/{exp_id}/replay", headers=_headers(token))
    assert resp.status_code == 200
    result = resp.json()
    assert "snapshots" in result
    assert len(result["snapshots"]) == 5


def test_experiment_replay_specific_epoch():
    """Replay with specific epoch should return that epoch's data."""
    data = _register("exp_replay_ep")
    token = data["access_token"]
    exp_id = _create_experiment(token)

    resp = client.post(f"/api/experiments/{exp_id}/replay", params={"epoch": 2}, headers=_headers(token))
    assert resp.status_code == 200
