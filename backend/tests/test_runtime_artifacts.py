import os
import sys

import torch
from fastapi.testclient import TestClient
from torch_geometric.data import Data

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.user_loader import _save_pyg_data
from database import SessionLocal
from main import app
from services.hybrid_store import blob_store, ensure_default_dataset_version
from services.training_service import resolve_node_graph_json
from utils.data_utils import get_data_from_config

client = TestClient(app)


def _build_small_graph():
    edge_index = torch.tensor([[0, 1], [1, 0]], dtype=torch.long)
    features = torch.tensor([[1.0, 0.0], [0.0, 1.0]], dtype=torch.float)
    labels = torch.tensor([0, 1], dtype=torch.long)
    return Data(edge_index=edge_index, x=features, y=labels, num_nodes=2)


def test_blob_backed_runtime_artifact_round_trips_without_local_file():
    graph = _build_small_graph()
    graph_json = {
        "graphData": {
            "nodes": [{"id": 0}, {"id": 1}],
            "links": [{"source": 0, "target": 1}],
        },
        "groundTruth": [0, 1],
    }

    uploaded_key = _save_pyg_data({"pyg_data": graph, "graph_json": graph_json}, "Blob Runtime Dataset")

    assert uploaded_key.startswith("datasets/runtime/blob-runtime-dataset/")
    assert blob_store.exists(uploaded_key) is True
    assert blob_store.exists(f"{uploaded_key}.json") is True

    loaded = get_data_from_config({"uploaded_file_path": uploaded_key})
    assert hasattr(loaded, "edge_index")
    assert loaded.num_nodes == 2

    resolved_graph_json = resolve_node_graph_json({"uploaded_file_path": uploaded_key}, loaded)
    assert resolved_graph_json["graphData"]["nodes"][0]["id"] == 0
    assert resolved_graph_json["groundTruth"] == [0, 1]


def test_default_dataset_version_reuses_blob_backed_processed_artifact():
    graph = _build_small_graph()
    uploaded_key = _save_pyg_data({"pyg_data": graph}, "Compatibility Dataset")

    db = SessionLocal()
    try:
        dataset, version = ensure_default_dataset_version(
            db,
            None,
            "Compatibility Dataset",
            uploaded_file_path=uploaded_key,
            metadata={"num_nodes": 2},
        )
        db.commit()

        assert dataset.slug == "compatibility-dataset"
        assert version.processed_blob_key == uploaded_key
        assert version.summary_json["num_nodes"] == 2
    finally:
        db.close()


def test_configure_route_returns_blob_backed_runtime_artifact_key():
    response = client.post(
        "/api/configure",
        json={
            "nodes": [
                {"id": 1, "label": 0},
                {"id": 2, "label": 1},
            ],
            "edges": [
                {"source": 1, "target": 2},
            ],
            "graphs": None,
            "mapping": {
                "task": 1,
                "node_id": "id",
                "node_label": "label",
                "node_features": [],
                "edge_source": "source",
                "edge_target": "target",
                "edge_weight": None,
                "edge_label": None,
                "edge_features": [],
                "graph_id": None,
                "graph_label": None,
                "graph_features": [],
                "community_label": None,
                "is_directed": False,
                "num_communities": None,
                "edge_split_ratio": 0.15,
                "dataset_name": "Contract Runtime",
            },
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    uploaded_key = payload["uploaded_file_path"]
    assert uploaded_key.startswith("datasets/runtime/contract-runtime/")
    assert blob_store.exists(uploaded_key) is True
    assert blob_store.exists(f"{uploaded_key}.json") is True


def test_upload_graph_route_returns_blob_backed_runtime_key():
    response = client.post(
        "/api/upload-graph",
        files={"file": ("runtime-graph.json", b'{"edges": [[0, 1], [1, 2]]}', "application/json")},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["filename"] == "runtime-graph.json"
    assert payload["uploaded_file_path"].startswith("datasets/runtime/runtime-graph/")
    assert payload["blob_key"] == payload["uploaded_file_path"]
    assert blob_store.exists(payload["uploaded_file_path"]) is True
    assert "file_path" not in payload
