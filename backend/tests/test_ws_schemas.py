"""
TDD RED: Tests for WS message schemas.
Tests must FAIL initially until schemas are correctly wired.

Validates:
1. WSMessageEnvelope structure (v, type, ts, seq)
2. Per-task snapshot schema validation (Task 1-6)
3. Round-trip JSON serialization
4. Invalid data rejection
5. ErrorPayload structure (no traceback leak)
6. build_ws_message helper
"""
import pytest
import json
import time
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from schemas.constants import (
    SCHEMA_VERSION, TaskId, MessageTypeOut, MessageTypeIn, ErrorCode
)
from schemas.ws import (
    WSMessageEnvelope,
    SnapshotTask1, SnapshotTask2, SnapshotTask3,
    SnapshotTask4, SnapshotTask5, SnapshotTask6,
    GraphDataPayload, GraphMetadataPayload,
    ErrorPayload, TrainingCompletePayload,
    validate_snapshot, build_ws_message,
    SNAPSHOT_MODELS,
)
from pydantic import ValidationError


# ─── Fixtures: sample data mimicking real BE output ──────────────────────────

@pytest.fixture
def task1_snapshot_data():
    """Minimal valid Task 1 snapshot matching node_classification.py output."""
    return {
        "epoch": 5,
        "node_predictions": [0, 1, 2, 0, 1],
        "node_probabilities": [[0.8, 0.1, 0.1], [0.1, 0.85, 0.05], [0.05, 0.1, 0.85],
                               [0.7, 0.2, 0.1], [0.15, 0.8, 0.05]],
        "node_confidence": [0.8, 0.85, 0.85, 0.7, 0.8],
        "node_correctness": [1, 1, 0, 1, 1],
        "neighbor_majority": [
            {"majority_class": 0, "majority_ratio": 0.75, "total_neighbors": 4},
            {"majority_class": 1, "majority_ratio": 0.6, "total_neighbors": 5},
            {"majority_class": 2, "majority_ratio": 0.5, "total_neighbors": 2},
            {"majority_class": 0, "majority_ratio": 1.0, "total_neighbors": 1},
            {"majority_class": 1, "majority_ratio": 0.67, "total_neighbors": 3},
        ],
        "embeddings_2d": [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6], [0.7, 0.8], [0.9, 1.0]],
        "attention_weights": None,
        "train_loss": 0.45,
        "val_loss": 0.52,
        "train_acc": 0.82,
        "val_acc": 0.78,
        "dirichlet_energy": 1.23,
    }


@pytest.fixture
def task2_snapshot_data():
    """Minimal valid Task 2 snapshot matching graph_classification.py output."""
    return {
        "epoch": 3,
        "graph_predictions": [0, 1, 0, 1, 0],
        "graph_probabilities": [[0.7, 0.3], [0.2, 0.8], [0.6, 0.4], [0.1, 0.9], [0.8, 0.2]],
        "graph_confidences": [0.7, 0.8, 0.6, 0.9, 0.8],
        "confidence_margins": [0.4, 0.6, 0.2, 0.8, 0.6],
        "attention_entropy": [0.5, 0.3, 0.7, 0.2, 0.6],
        "graph_structural_metrics": [
            {"density": 0.3, "avg_clustering": 0.4, "avg_degree": 2.5},
            {"density": 0.5, "avg_clustering": 0.6, "avg_degree": 3.2},
            {"density": 0.2, "avg_clustering": 0.3, "avg_degree": 1.8},
            {"density": 0.4, "avg_clustering": 0.5, "avg_degree": 2.9},
            {"density": 0.6, "avg_clustering": 0.7, "avg_degree": 4.1},
        ],
        "graph_correct": [1, 1, 0, 1, 1],
        "graph_embeddings_2d": [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6], [0.7, 0.8], [0.9, 1.0]],
        "node_contributions": [[0.3, 0.5, 0.7], [0.4, 0.6], [0.2, 0.8, 0.3, 0.5],
                                [0.1, 0.9], [0.5, 0.5, 0.5]],
        "train_loss": 0.35,
        "val_loss": 0.42,
        "train_acc": 0.88,
        "val_acc": 0.85,
    }


@pytest.fixture
def task3_snapshot_data():
    """Minimal valid Task 3 snapshot matching link_prediction.py output."""
    return {
        "epoch": 10,
        "edge_scores": [0.9, 0.8, 0.3, 0.1, 0.7],
        "edge_classifications": [
            {"type": "positive", "score": 0.9, "classification": "TP"},
            {"type": "positive", "score": 0.8, "classification": "TP"},
            {"type": "positive", "score": 0.3, "classification": "FN"},
            {"type": "negative", "score": 0.1, "classification": "TN"},
            {"type": "negative", "score": 0.7, "classification": "FP"},
        ],
        "test_edge_common_neighbors": [
            {"source": 0, "target": 1, "is_positive": True, "common_neighbors": 3, "embedding_distance": 0.5},
        ],
        "embeddings_2d": [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]],
        "knn_preservation": 0.65,
        "train_loss": 0.28,
        "val_loss": 0.35,
        "auc": 0.92,
        "val_acc": 0.92,
        "top_k_links": [
            {"source": 0, "target": 5, "score": 0.95},
        ],
    }


@pytest.fixture
def task4_snapshot_data():
    """Minimal valid Task 4 snapshot matching community_detection.py output."""
    return {
        "epoch": 20,
        "node_predictions": [0, 0, 1, 1, 2, 2],
        "bridge_nodes": [False, True, True, False, False, True],
        "bridge_strength": [0.0, 0.4, 0.3, 0.0, 0.0, 0.5],
        "silhouette_scores": [0.6, 0.2, 0.3, 0.7, 0.5, 0.1],
        "cluster_confidence": [0.8, 0.3, 0.4, 0.9, 0.7, 0.2],
        "cluster_centers": [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6], [0.7, 0.8, 0.9]],
        "per_community_metrics": [
            {"community_id": 0, "size": 2, "density": 0.5, "conductance": 0.3,
             "internal_edges": 1, "external_edges": 2},
            {"community_id": 1, "size": 2, "density": 0.6, "conductance": 0.4,
             "internal_edges": 1, "external_edges": 1},
            {"community_id": 2, "size": 2, "density": 0.4, "conductance": 0.5,
             "internal_edges": 1, "external_edges": 3},
        ],
        "community_stability": 0.85,
        "modularity_q": 0.42,
        "conductance": 0.4,
        "community_sizes": [2, 2, 2],
        "linkage_matrix": None,
        "nmi_score": 0.75,
        "community_transitions": {"0->1": 2},
        "train_loss": 0.55,
        "val_acc": 0.42,
    }


@pytest.fixture
def task5_snapshot_data():
    """Minimal valid Task 5 snapshot matching graph_embedding.py output."""
    return {
        "epoch": 15,
        "embeddings_2d": [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]],
        "tsne_2d": [[0.2, 0.3], [0.4, 0.5], [0.6, 0.7]],
        "knn_preservation": 0.72,
        "link_recon_auc": 0.88,
        "isotropy_score": 0.65,
        "reconstruction_loss": 0.32,
        "proximity_scores": [
            {"source": 0, "target": 1, "score": 0.85},
        ],
        "per_node_knn_preservation": {"0": 0.8, "1": 0.6},
        "per_edge_reconstruction_error": [
            {"source": 0, "target": 1, "reconstruction_score": 0.9, "error": 0.1, "is_correct": True},
        ],
        "embedding_norms": [1.2, 0.8, 1.5],
        "outlier_scores": [
            {"node_id": 2, "avg_distance_to_neighbors": 3.5, "is_outlier": True},
        ],
        "train_loss": 0.32,
        "val_loss": 0.35,
        "val_acc": 0.88,
        "node_predictions": [0, 0, 0],
    }


@pytest.fixture
def task6_snapshot_data():
    """Minimal valid Task 6 snapshot matching graph_generation.py output."""
    return {
        "epoch": 8,
        "generated_graphs": [
            {
                "id": 0,
                "nodes": [{"id": 0}, {"id": 1}, {"id": 2}],
                "links": [{"source": 0, "target": 1}, {"source": 1, "target": 2}],
                "valid": True,
                "score": 0.82,
                "density": 0.67,
                "avg_degree": 1.33,
                "isolated_ratio": 0.0,
                "invalidity_reason": None,
                "comparison_metrics": {"source_density": 0.5, "generated_density": 0.67},
                "matches_source": True,
            },
        ],
        "source_graphs": [],
        "latent_points": [[0.1, 0.2], [0.3, 0.4]],
        "latent_point_scores": [0.7, 0.8],
        "latent_point_validity": [1.0, 1.0],
        "validity_rate": 0.83,
        "uniqueness_rate": 1.0,
        "novelty_rate": 0.67,
        "recon_loss": 0.45,
        "kl_loss": 0.12,
        "train_loss": 0.57,
        "val_loss": 0.62,
        "train_acc": 0.82,
        "val_acc": 0.79,
    }


# ─── Test: Schema Version ───────────────────────────────────────────────────

class TestSchemaVersion:
    def test_schema_version_is_3(self):
        assert SCHEMA_VERSION == 3

    def test_schema_version_in_envelope(self):
        msg = WSMessageEnvelope(type="epoch_snapshot", seq=0)
        assert msg.v == SCHEMA_VERSION


# ─── Test: Constants Enums ───────────────────────────────────────────────────

class TestConstants:
    def test_task_ids_complete(self):
        assert len(TaskId) == 6
        assert TaskId.NODE_CLASSIFICATION == 1
        assert TaskId.GRAPH_GENERATION == 6

    def test_message_types_out(self):
        assert MessageTypeOut.EPOCH_SNAPSHOT == "epoch_snapshot"
        assert MessageTypeOut.GRAPH_DATA == "graph_data"
        assert MessageTypeOut.ERROR == "error"
        assert MessageTypeOut.TRAINING_COMPLETE == "training_complete"

    def test_message_types_in(self):
        assert MessageTypeIn.START == "start"
        assert MessageTypeIn.STOP == "stop"
        assert MessageTypeIn.PING == "ping"

    def test_error_codes(self):
        assert ErrorCode.ERR_INVALID_CONFIG == "ERR_INVALID_CONFIG"
        assert ErrorCode.ERR_INTERNAL == "ERR_INTERNAL"


# ─── Test: WSMessageEnvelope ─────────────────────────────────────────────────

class TestWSMessageEnvelope:
    def test_envelope_required_fields(self):
        msg = WSMessageEnvelope(type="epoch_snapshot", seq=1)
        assert msg.v == SCHEMA_VERSION
        assert msg.type == "epoch_snapshot"
        assert msg.seq == 1
        assert msg.ts > 0  # Auto-generated timestamp

    def test_envelope_json_roundtrip(self):
        msg = WSMessageEnvelope(type="graph_data", seq=0, payload={"key": "value"})
        json_str = msg.model_dump_json()
        parsed = json.loads(json_str)
        assert parsed["v"] == SCHEMA_VERSION
        assert parsed["type"] == "graph_data"
        assert parsed["payload"]["key"] == "value"

    def test_envelope_with_progress(self):
        msg = WSMessageEnvelope(type="epoch_snapshot", seq=5, progress=0.5)
        data = msg.model_dump(exclude_none=True)
        assert data["progress"] == 0.5

    def test_envelope_missing_type_raises(self):
        with pytest.raises(ValidationError):
            WSMessageEnvelope(seq=0)  # type is required


# ─── Test: Per-Task Snapshots ────────────────────────────────────────────────

class TestSnapshotTask1:
    def test_valid_snapshot(self, task1_snapshot_data):
        snap = SnapshotTask1(**task1_snapshot_data)
        assert snap.epoch == 5
        assert len(snap.node_predictions) == 5
        assert snap.dirichlet_energy == 1.23

    def test_json_roundtrip(self, task1_snapshot_data):
        snap = SnapshotTask1(**task1_snapshot_data)
        json_str = snap.model_dump_json()
        restored = SnapshotTask1.model_validate_json(json_str)
        assert restored.epoch == snap.epoch
        assert restored.node_predictions == snap.node_predictions

    def test_missing_required_field_raises(self, task1_snapshot_data):
        del task1_snapshot_data["dirichlet_energy"]
        with pytest.raises(ValidationError):
            SnapshotTask1(**task1_snapshot_data)


class TestSnapshotTask2:
    def test_valid_snapshot(self, task2_snapshot_data):
        snap = SnapshotTask2(**task2_snapshot_data)
        assert snap.epoch == 3
        assert len(snap.graph_predictions) == 5
        assert len(snap.node_contributions) == 5

    def test_json_roundtrip(self, task2_snapshot_data):
        snap = SnapshotTask2(**task2_snapshot_data)
        json_str = snap.model_dump_json()
        restored = SnapshotTask2.model_validate_json(json_str)
        assert restored.graph_predictions == snap.graph_predictions


class TestSnapshotTask3:
    def test_valid_snapshot(self, task3_snapshot_data):
        snap = SnapshotTask3(**task3_snapshot_data)
        assert snap.epoch == 10
        assert snap.auc == 0.92
        assert len(snap.edge_classifications) == 5

    def test_edge_classification_types(self, task3_snapshot_data):
        snap = SnapshotTask3(**task3_snapshot_data)
        for ec in snap.edge_classifications:
            assert ec.type in ("positive", "negative")
            assert ec.classification in ("TP", "FP", "TN", "FN")


class TestSnapshotTask4:
    def test_valid_snapshot(self, task4_snapshot_data):
        snap = SnapshotTask4(**task4_snapshot_data)
        assert snap.epoch == 20
        assert snap.modularity_q == 0.42
        assert len(snap.per_community_metrics) == 3

    def test_community_transitions(self, task4_snapshot_data):
        snap = SnapshotTask4(**task4_snapshot_data)
        assert snap.community_transitions == {"0->1": 2}


class TestSnapshotTask5:
    def test_valid_snapshot(self, task5_snapshot_data):
        snap = SnapshotTask5(**task5_snapshot_data)
        assert snap.epoch == 15
        assert snap.link_recon_auc == 0.88
        assert snap.isotropy_score == 0.65

    def test_outlier_scores(self, task5_snapshot_data):
        snap = SnapshotTask5(**task5_snapshot_data)
        assert len(snap.outlier_scores) == 1
        assert snap.outlier_scores[0].is_outlier is True


class TestSnapshotTask6:
    def test_valid_snapshot(self, task6_snapshot_data):
        snap = SnapshotTask6(**task6_snapshot_data)
        assert snap.epoch == 8
        assert snap.validity_rate == 0.83
        assert len(snap.generated_graphs) == 1

    def test_generated_graph_structure(self, task6_snapshot_data):
        snap = SnapshotTask6(**task6_snapshot_data)
        g = snap.generated_graphs[0]
        assert g.valid is True
        assert g.score == 0.82


# ─── Test: validate_snapshot helper ──────────────────────────────────────────

class TestValidateSnapshot:
    def test_task1_valid(self, task1_snapshot_data):
        result = validate_snapshot(1, task1_snapshot_data)
        assert result["epoch"] == 5
        assert "node_predictions" in result

    def test_task2_valid(self, task2_snapshot_data):
        result = validate_snapshot(2, task2_snapshot_data)
        assert result["epoch"] == 3

    def test_task3_valid(self, task3_snapshot_data):
        result = validate_snapshot(3, task3_snapshot_data)
        assert result["auc"] == 0.92

    def test_task4_valid(self, task4_snapshot_data):
        result = validate_snapshot(4, task4_snapshot_data)
        assert result["modularity_q"] == 0.42

    def test_task5_valid(self, task5_snapshot_data):
        result = validate_snapshot(5, task5_snapshot_data)
        assert result["link_recon_auc"] == 0.88

    def test_task6_valid(self, task6_snapshot_data):
        result = validate_snapshot(6, task6_snapshot_data)
        assert result["validity_rate"] == 0.83

    def test_unknown_task_raises(self):
        with pytest.raises(ValueError, match="Unknown task_id"):
            validate_snapshot(99, {"epoch": 0})

    def test_invalid_data_raises(self):
        with pytest.raises(ValidationError):
            validate_snapshot(1, {"epoch": 0})  # Missing required fields

    def test_all_tasks_have_models(self):
        """Ensure all 6 tasks have corresponding snapshot models."""
        for task_id in range(1, 7):
            assert task_id in SNAPSHOT_MODELS


# ─── Test: ErrorPayload ─────────────────────────────────────────────────────

class TestErrorPayload:
    def test_default_error(self):
        err = ErrorPayload()
        assert err.code == ErrorCode.ERR_INTERNAL
        assert "traceback" not in err.model_dump()

    def test_specific_error(self):
        err = ErrorPayload(
            code=ErrorCode.ERR_INVALID_CONFIG,
            message="heads must be > 0",
            retriable=False,
            field="heads",
        )
        assert err.code == "ERR_INVALID_CONFIG"
        assert err.field == "heads"
        assert err.retriable is False

    def test_no_traceback_field(self):
        """Error payload must NEVER contain traceback (security)."""
        err = ErrorPayload(code="ERR_INTERNAL", message="something broke")
        dump = err.model_dump()
        assert "traceback" not in dump
        assert "stack" not in dump


# ─── Test: build_ws_message helper ───────────────────────────────────────────

class TestBuildWSMessage:
    def test_basic_message(self):
        msg = build_ws_message("epoch_snapshot", payload={"epoch": 0}, seq=1)
        assert msg["v"] == SCHEMA_VERSION
        assert msg["type"] == "epoch_snapshot"
        assert msg["seq"] == 1
        assert msg["payload"]["epoch"] == 0
        assert msg["ts"] > 0

    def test_message_with_progress(self):
        msg = build_ws_message("epoch_snapshot", seq=5, progress=0.5)
        assert msg["progress"] == 0.5

    def test_message_excludes_none(self):
        msg = build_ws_message("graph_data", seq=0)
        assert "progress" not in msg  # None values excluded

    def test_json_serializable(self):
        msg = build_ws_message("training_complete", payload={"session_id": "abc"}, seq=99)
        json_str = json.dumps(msg)
        parsed = json.loads(json_str)
        assert parsed["type"] == "training_complete"


# ─── Test: GraphDataPayload ─────────────────────────────────────────────────

class TestGraphDataPayload:
    def test_task1_graph_data(self):
        payload = GraphDataPayload(
            graphData={
                "nodes": [{"id": 0, "degree": 3}, {"id": 1, "degree": 2}],
                "links": [{"source": 0, "target": 1}],
            },
            groundTruth=[0, 1],
        )
        assert len(payload.graphData.nodes) == 2
        assert payload.groundTruth == [0, 1]

    def test_task2_with_graphs(self):
        payload = GraphDataPayload(
            graphs=[{"id": 0, "nodes": [], "links": []}],
            groundTruth=[0],
        )
        assert len(payload.graphs) == 1

    def test_task3_with_test_edges(self):
        payload = GraphDataPayload(
            graphData={
                "nodes": [{"id": 0}],
                "links": [],
            },
            testEdges=[{"source": 0, "target": 1, "exists": True, "idx": 0}],
        )
        assert payload.testEdges[0].exists is True

    def test_task4_with_community_data(self):
        payload = GraphDataPayload(
            communityGroundTruth=[0, 0, 1, 1],
            numCommunities=2,
        )
        assert payload.numCommunities == 2


class TestGraphMetadataPayload:
    def test_task5_metadata(self):
        meta = GraphMetadataPayload(
            num_nodes=100,
            num_edges=300,
            has_features=True,
            feature_dim=16,
        )
        assert meta.num_nodes == 100
        assert meta.has_features is True
