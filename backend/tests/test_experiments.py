import os
import sys
import uuid

import pytest
from fastapi.testclient import TestClient

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.session_manager import session_manager
from database import Base, engine
from main import app


client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine)
    yield


def test_save_large_experiment():
    huge_data = "data_chunk_" * 500000

    heavy_payload = {
        "title": "TDD Massive Graph Run",
        "task_type": 1,
        "model_type": "GCN",
        "dataset_name": "tdd_mock_data",
        "epoch_count": 5,
        "learning_rate": 0.01,
        "hidden_dim": 64,
        "dropout": 0.5,
        "accuracy": 0.95,
        "loss": 0.15,
        "is_mock": True,
        "snapshots_json": [{"epoch": i, "data": huge_data} for i in range(5)],
        "graph_data_json": {"nodes": [], "links": []},
        "ground_truth_json": [],
        "task_data_json": {},
    }

    response = client.post("/api/experiments", json=heavy_payload)
    assert response.status_code == 200

    exp_id = response.json()["id"]
    detail_response = client.get(f"/api/experiments/{exp_id}")
    assert detail_response.status_code == 200
    detail = detail_response.json()

    assert len(detail["snapshots_json"]) == 5
    assert detail["snapshots_json"][0]["data"] == huge_data

    delete_response = client.delete(f"/api/experiments/{exp_id}")
    assert delete_response.status_code == 200


def test_update_experiment_notes_and_pin_best():
    payload = {
        "title": "Reportable Run",
        "task_type": 3,
        "model_type": "GAT",
        "dataset_name": "report_data",
        "epoch_count": 3,
        "learning_rate": 0.005,
        "hidden_dim": 32,
        "dropout": 0.2,
        "accuracy": 0.81,
        "loss": 0.19,
        "best_epoch": 2,
        "is_mock": True,
        "snapshots_json": [
            {"epoch": 0, "auc": 0.62, "train_loss": 0.8, "val_loss": 0.75},
            {"epoch": 1, "auc": 0.74, "train_loss": 0.4, "val_loss": 0.38},
            {"epoch": 2, "auc": 0.83, "train_loss": 0.2, "val_loss": 0.19},
        ],
        "graph_data_json": {"nodes": [], "links": []},
        "ground_truth_json": [],
        "task_data_json": {},
    }

    create_response = client.post("/api/experiments", json=payload)
    assert create_response.status_code == 200
    exp_id = create_response.json()["id"]

    patch_response = client.patch(
        f"/api/experiments/{exp_id}",
        json={"notes": "Strong ROC lift after epoch 1", "is_best": True},
    )
    assert patch_response.status_code == 200
    detail = patch_response.json()
    assert detail["notes"] == "Strong ROC lift after epoch 1"
    assert detail["is_best"] is True

    get_response = client.get(f"/api/experiments/{exp_id}")
    assert get_response.status_code == 200
    persisted = get_response.json()
    assert persisted["notes"] == "Strong ROC lift after epoch 1"
    assert persisted["is_best"] is True

    delete_response = client.delete(f"/api/experiments/{exp_id}")
    assert delete_response.status_code == 200


def test_update_experiment_title_and_project_best_uniqueness():
    suffix = uuid.uuid4().hex[:8]
    project_response = client.post(
        "/api/projects",
        json={
            "title": f"Best Uniqueness {suffix}",
            "description": "Project for best-run uniqueness",
            "task_type": 1,
            "model_type": "GCN",
        },
    )
    assert project_response.status_code == 200, project_response.text
    project = project_response.json()

    base_payload = {
        "project_id": project["id"],
        "task_type": 1,
        "dataset_name": f"best_uniqueness_data_{suffix}",
        "epoch_count": 2,
        "accuracy": 0.8,
        "loss": 0.2,
        "is_mock": True,
        "snapshots_json": [{"epoch": 0}, {"epoch": 1}],
        "graph_data_json": {"nodes": [], "links": []},
        "ground_truth_json": [],
        "task_data_json": {},
    }

    first_response = client.post(
        "/api/experiments",
        json={
            **base_payload,
            "title": "First Candidate",
            "model_type": "GCN",
            "is_best": True,
        },
    )
    second_response = client.post(
        "/api/experiments",
        json={
            **base_payload,
            "title": "Second Candidate",
            "model_type": "GAT",
            "is_best": False,
        },
    )
    assert first_response.status_code == 200, first_response.text
    assert second_response.status_code == 200, second_response.text
    first_id = first_response.json()["id"]
    second_id = second_response.json()["id"]

    patch_response = client.patch(
        f"/api/experiments/{second_id}",
        json={"title": "Production Candidate", "is_best": True},
    )
    assert patch_response.status_code == 200, patch_response.text
    patched = patch_response.json()
    assert patched["title"] == "Production Candidate"
    assert patched["is_best"] is True

    first_detail = client.get(f"/api/experiments/{first_id}").json()
    second_detail = client.get(f"/api/experiments/{second_id}").json()
    assert first_detail["is_best"] is False
    assert second_detail["is_best"] is True

    assert client.delete(f"/api/experiments/{first_id}").status_code == 200
    assert client.delete(f"/api/experiments/{second_id}").status_code == 200


def test_get_experiment_report_payload():
    payload = {
        "title": "Report Payload Run",
        "task_type": 1,
        "model_type": "GCN",
        "dataset_name": "cora",
        "epoch_count": 4,
        "learning_rate": 0.01,
        "hidden_dim": 64,
        "dropout": 0.5,
        "accuracy": 0.91,
        "loss": 0.11,
        "best_epoch": 3,
        "notes": "Candidate for baseline report",
        "is_best": True,
        "is_mock": True,
        "config_json": {"epochs": 4, "lr": 0.01},
        "snapshots_json": [
            {"epoch": 0, "accuracy": 0.55, "train_loss": 1.0, "val_loss": 0.95},
            {"epoch": 1, "accuracy": 0.72, "train_loss": 0.7, "val_loss": 0.6},
            {"epoch": 2, "accuracy": 0.86, "train_loss": 0.3, "val_loss": 0.22},
            {"epoch": 3, "accuracy": 0.91, "train_loss": 0.15, "val_loss": 0.11},
        ],
        "graph_data_json": {"nodes": [{"id": 1}], "links": []},
        "ground_truth_json": [{"id": 1, "label": 0}],
        "task_data_json": {"source": "test"},
    }

    create_response = client.post("/api/experiments", json=payload)
    assert create_response.status_code == 200
    exp_id = create_response.json()["id"]

    report_response = client.get(f"/api/experiments/{exp_id}/report")
    assert report_response.status_code == 200
    report = report_response.json()

    assert report["experiment"]["id"] == exp_id
    assert report["experiment"]["is_best"] is True
    assert report["summary"]["best_epoch"] == 3
    assert report["summary"]["best_score"] == pytest.approx(0.91)
    assert report["replay"]["api_path"] == f"/api/experiments/{exp_id}/replay?epoch=3"
    assert report["notes"] == "Candidate for baseline report"
    assert report["config"]["epochs"] == 4
    assert report["next_action"]

    delete_response = client.delete(f"/api/experiments/{exp_id}")
    assert delete_response.status_code == 200


def test_list_experiments_uses_paginated_contract():
    payload = {
        "title": "List Contract Run",
        "task_type": 1,
        "model_type": "GCN",
        "dataset_name": "list_contract_data",
        "epoch_count": 2,
        "accuracy": 0.77,
        "loss": 0.23,
        "is_mock": True,
        "snapshots_json": [{"epoch": 0}, {"epoch": 1}],
        "graph_data_json": {"nodes": [], "links": []},
        "ground_truth_json": [],
        "task_data_json": {},
    }

    create_response = client.post("/api/experiments", json=payload)
    assert create_response.status_code == 200
    exp_id = create_response.json()["id"]

    list_response = client.get("/api/experiments")
    assert list_response.status_code == 200
    body = list_response.json()
    assert "items" in body
    assert "total" in body
    assert "page" in body
    assert "page_size" in body
    assert any(item["id"] == exp_id for item in body["items"])

    delete_response = client.delete(f"/api/experiments/{exp_id}")
    assert delete_response.status_code == 200


def test_list_experiments_supports_search_and_model_filters():
    suffix = uuid.uuid4().hex[:8]
    alpha_response = client.post(
        "/api/experiments",
        json={
            "title": f"Alpha Search Run {suffix}",
            "task_type": 1,
            "model_type": "GCN",
            "dataset_name": "search_contract_data",
            "epoch_count": 2,
            "accuracy": 0.77,
            "loss": 0.23,
            "is_mock": True,
            "snapshots_json": [{"epoch": 0}, {"epoch": 1}],
            "graph_data_json": {"nodes": [], "links": []},
            "ground_truth_json": [],
            "task_data_json": {},
        },
    )
    beta_response = client.post(
        "/api/experiments",
        json={
            "title": f"Beta Search Run {suffix}",
            "task_type": 1,
            "model_type": "GAT",
            "dataset_name": "search_contract_data",
            "epoch_count": 2,
            "accuracy": 0.71,
            "loss": 0.29,
            "is_mock": True,
            "snapshots_json": [{"epoch": 0}, {"epoch": 1}],
            "graph_data_json": {"nodes": [], "links": []},
            "ground_truth_json": [],
            "task_data_json": {},
        },
    )
    assert alpha_response.status_code == 200, alpha_response.text
    assert beta_response.status_code == 200, beta_response.text
    alpha_id = alpha_response.json()["id"]
    beta_id = beta_response.json()["id"]

    search_response = client.get(f"/api/experiments?q=Alpha%20Search%20Run%20{suffix}")
    assert search_response.status_code == 200, search_response.text
    search_items = search_response.json()["items"]
    assert any(item["id"] == alpha_id for item in search_items)
    assert all(item["id"] != beta_id for item in search_items)

    model_response = client.get("/api/experiments?model_type=GAT")
    assert model_response.status_code == 200, model_response.text
    model_items = model_response.json()["items"]
    assert any(item["id"] == beta_id for item in model_items)
    assert all(item["model_type"] == "GAT" for item in model_items)

    assert client.delete(f"/api/experiments/{alpha_id}").status_code == 200
    assert client.delete(f"/api/experiments/{beta_id}").status_code == 200


def test_replay_specific_epoch_and_compare_contract():
    first_payload = {
        "title": "Replay Compare A",
        "task_type": 1,
        "model_type": "GCN",
        "dataset_name": "replay_compare_data",
        "epoch_count": 3,
        "accuracy": 0.83,
        "loss": 0.17,
        "best_epoch": 2,
        "is_mock": True,
        "snapshots_json": [
            {"epoch": 0, "accuracy": 0.55},
            {"epoch": 1, "accuracy": 0.71},
            {"epoch": 2, "accuracy": 0.83},
        ],
        "graph_data_json": {"nodes": [{"id": 1}], "links": []},
        "ground_truth_json": [],
        "task_data_json": {},
    }
    second_payload = {
        "title": "Replay Compare B",
        "task_type": 1,
        "model_type": "GAT",
        "dataset_name": "replay_compare_data",
        "epoch_count": 3,
        "accuracy": 0.79,
        "loss": 0.21,
        "best_epoch": 1,
        "is_mock": True,
        "snapshots_json": [
            {"epoch": 0, "accuracy": 0.5},
            {"epoch": 1, "accuracy": 0.79},
            {"epoch": 2, "accuracy": 0.76},
        ],
        "graph_data_json": {"nodes": [{"id": 2}], "links": []},
        "ground_truth_json": [],
        "task_data_json": {},
    }

    create_a = client.post("/api/experiments", json=first_payload)
    create_b = client.post("/api/experiments", json=second_payload)
    assert create_a.status_code == 200, create_a.text
    assert create_b.status_code == 200, create_b.text
    exp_a = create_a.json()["id"]
    exp_b = create_b.json()["id"]

    replay_response = client.post(f"/api/experiments/{exp_a}/replay", params={"epoch": 2})
    assert replay_response.status_code == 200, replay_response.text
    replay_payload = replay_response.json()
    assert replay_payload["experiment_id"] == exp_a
    assert replay_payload["epoch"] == 2
    assert replay_payload["snapshot"]["epoch"] == 2
    assert replay_payload["best_epoch"] == 2

    compare_response = client.post(
        "/api/experiments/compare",
        json={"experiment_ids": [exp_a, exp_b]},
    )
    assert compare_response.status_code == 200, compare_response.text
    compare_payload = compare_response.json()
    assert len(compare_payload["results"]) == 2
    assert all("experiment" in item and "metrics" in item for item in compare_payload["results"])

    invalid_compare = client.post("/api/experiments/compare", json={"experiment_ids": [exp_a]})
    assert invalid_compare.status_code == 400

    assert client.delete(f"/api/experiments/{exp_a}").status_code == 200
    assert client.delete(f"/api/experiments/{exp_b}").status_code == 200


def test_session_finalize_and_resume_contract_stays_consistent():
    suffix = uuid.uuid4().hex[:8]
    project_response = client.post(
        "/api/projects",
        json={
            "title": f"Resume Contract Project {suffix}",
            "description": "Project used for resume/finalize consistency",
            "task_type": 3,
            "model_type": "GAT",
        },
    )
    assert project_response.status_code == 200, project_response.text
    project = project_response.json()

    dataset_response = client.post(
        "/api/datasets",
        json={
            "name": f"Resume Contract Dataset {suffix}",
            "description": "Dataset used for resume/finalize consistency",
            "summary_json": {"rows": 24},
        },
    )
    assert dataset_response.status_code == 200, dataset_response.text
    dataset_payload = dataset_response.json()
    dataset = dataset_payload["dataset"]
    version = dataset_payload["version"]

    session_response = client.post(
        "/api/sessions",
        json={
            "project_id": project["id"],
            "dataset_version_id": version["id"],
            "task": 3,
            "model": "GAT",
            "dataset": dataset["name"],
            "epochs": 6,
            "lr": 0.02,
            "hidden": 48,
            "config": {
                "dropout": 0.3,
                "heads": 2,
                "aggregator": "mean",
            },
        },
    )
    assert session_response.status_code == 200, session_response.text
    session_id = session_response.json()["session_id"]

    session_manager.sync_runtime_context(
        session_id,
        {
            "task": 3,
            "model": "GAT",
            "dataset": dataset["name"],
            "epochs": 6,
            "lr": 0.02,
            "hidden": 48,
            "dropout": 0.3,
            "heads": 2,
            "aggregator": "mean",
            "project_id": project["id"],
            "dataset_version_id": version["id"],
            "uploaded_file_path": "datasets/runtime/resume-contract.pt",
            "upload_metadata": {"num_nodes": 24, "num_edges": 48},
            "edge_split_ratio": 0.15,
        },
    )
    session_manager.update_status(session_id, "running")
    session_manager.update_epoch(session_id, epoch=2, seq=9)
    session_manager.save_snapshot(session_id, 0, {"epoch": 0, "auc": 0.58})
    session_manager.save_snapshot(session_id, 1, {"epoch": 1, "auc": 0.72})
    session_manager.save_snapshot(session_id, 2, {"epoch": 2, "auc": 0.81})

    experiment_response = client.post(
        "/api/experiments",
        json={
            "title": "Resume Contract Finalized Run",
            "project_id": project["id"],
            "dataset_id": dataset["id"],
            "dataset_version_id": version["id"],
            "session_id": session_id,
            "task_type": 3,
            "model_type": "GAT",
            "dataset_name": dataset["name"],
            "epoch_count": 3,
            "learning_rate": 0.02,
            "hidden_dim": 48,
            "dropout": 0.3,
            "accuracy": 0.81,
            "loss": 0.19,
            "best_epoch": 2,
            "config_json": {"epochs": 6, "lr": 0.02, "dropout": 0.3, "heads": 2},
            "snapshots_json": [
                {"epoch": 0, "auc": 0.58, "train_loss": 0.9},
                {"epoch": 1, "auc": 0.72, "train_loss": 0.5},
                {"epoch": 2, "auc": 0.81, "train_loss": 0.19},
            ],
            "graph_data_json": {"nodes": [{"id": 1}], "links": []},
            "ground_truth_json": [],
            "task_data_json": {"testEdges": []},
        },
    )
    assert experiment_response.status_code == 200, experiment_response.text
    experiment_payload = experiment_response.json()
    experiment_id = experiment_payload["id"]
    assert experiment_payload["session_id"] == session_id
    assert experiment_payload["report_path"] == f"/api/experiments/{experiment_id}/report"
    assert experiment_payload["replay_path"] == f"/api/experiments/{experiment_id}/replay?epoch=2"

    resume_response = client.get(f"/api/sessions/{session_id}/resume")
    assert resume_response.status_code == 200, resume_response.text
    resume_payload = resume_response.json()

    assert resume_payload["session_id"] == session_id
    assert resume_payload["status"] == "completed"
    assert resume_payload["experiment_id"] == experiment_id
    assert resume_payload["dataset_id"] == dataset["id"]
    assert resume_payload["project_title"] == project["title"]
    assert resume_payload["dataset_version_name"] == f"{dataset['name']} v{version['version']}"
    assert resume_payload["uploaded_file_path"] == "datasets/runtime/resume-contract.pt"
    assert resume_payload["upload_metadata"]["num_nodes"] == 24
    assert resume_payload["task_config"]["heads"] == 2
    assert resume_payload["task_config"]["edge_split_ratio"] == 0.15
    assert resume_payload["report_path"] == f"/api/experiments/{experiment_id}/report"
    assert resume_payload["replay_path"] == f"/api/experiments/{experiment_id}/replay?epoch=2"

    detail_response = client.get(f"/api/sessions/{session_id}")
    assert detail_response.status_code == 200, detail_response.text
    detail_payload = detail_response.json()
    assert detail_payload["experiment_id"] == experiment_id
    assert detail_payload["status"] == "completed"
