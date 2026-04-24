"""
Pydantic v2 models for WebSocket message contracts.

Every WS message (in/out) is wrapped in a WSMessage envelope with:
  - v: schema version
  - type: message type (from MessageTypeOut/MessageTypeIn)
  - ts: timestamp in ms since epoch
  - seq: monotonic sequence number per session

Per-task snapshot payloads are typed separately to catch contract drift
between backend and frontend.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field

from .constants import SCHEMA_VERSION, MessageTypeOut, ErrorCode


# ─── Envelope ────────────────────────────────────────────────────────────────

class WSMessageEnvelope(BaseModel):
    """Wire envelope for ALL outgoing WS messages."""
    v: int = Field(default=SCHEMA_VERSION, description="Schema version")
    type: str = Field(..., description="Message type from MessageTypeOut")
    ts: int = Field(default_factory=lambda: int(time.time() * 1000), description="Timestamp ms")
    seq: int = Field(default=0, description="Monotonic sequence number")
    payload: Any = Field(default=None, description="Type-specific payload")
    # Legacy compat: progress is sent at top-level for epoch_snapshot
    progress: Optional[float] = Field(default=None, description="Training progress 0..1")


# ─── Graph Data Payloads ─────────────────────────────────────────────────────

class NodeJSON(BaseModel):
    id: int
    degree: Optional[int] = None
    groundTruth: Optional[int] = None
    inTrainSet: Optional[bool] = None
    communityGT: Optional[int] = None

class LinkJSON(BaseModel):
    source: int
    target: int

class GraphDataJSON(BaseModel):
    nodes: List[NodeJSON]
    links: List[LinkJSON]

class TestEdgeJSON(BaseModel):
    source: int
    target: int
    exists: bool
    idx: int

class GraphDataPayload(BaseModel):
    """Payload for type='graph_data'."""
    graphData: Optional[GraphDataJSON] = None
    groundTruth: Optional[List[int]] = None
    testEdges: Optional[List[TestEdgeJSON]] = None
    graphs: Optional[List[Dict[str, Any]]] = None  # Task 2: list of mini-graphs
    communityGroundTruth: Optional[List[int]] = None  # Task 4
    numCommunities: Optional[int] = None  # Task 4
    referenceGraph: Optional[Dict[str, Any]] = None  # Task 6


class GraphMetadataPayload(BaseModel):
    """Payload for type='graph_metadata' (Task 5)."""
    num_nodes: int
    num_edges: int
    has_features: bool = False
    feature_dim: Optional[int] = None
    has_labels: bool = False
    num_classes: Optional[int] = None
    is_directed: Optional[bool] = None
    avg_degree: Optional[float] = None


# ─── Per-Task Snapshot Payloads ──────────────────────────────────────────────

class NeighborMajority(BaseModel):
    majority_class: int
    majority_ratio: float
    total_neighbors: int


class SnapshotTask1(BaseModel):
    """Task 1: Node Classification epoch snapshot."""
    epoch: int
    node_predictions: List[int]
    node_probabilities: List[List[float]]
    node_confidence: List[float]
    node_correctness: List[int]
    neighbor_majority: List[NeighborMajority]
    embeddings_2d: List[List[float]]
    attention_weights: Optional[List[Any]] = None
    train_loss: float
    val_loss: float
    train_acc: float
    val_acc: float
    dirichlet_energy: float


class SnapshotTask2(BaseModel):
    """Task 2: Graph Classification epoch snapshot."""
    epoch: int
    graph_predictions: List[int]
    graph_probabilities: List[List[float]]
    graph_confidences: List[float]
    confidence_margins: List[float]
    attention_entropy: List[float]
    graph_structural_metrics: List[Dict[str, float]]
    graph_correct: List[int]
    graph_embeddings_2d: List[List[float]]
    node_contributions: List[List[float]]
    train_loss: float
    val_loss: float
    train_acc: float
    val_acc: float


class EdgeClassification(BaseModel):
    type: str  # 'positive' | 'negative'
    score: float
    classification: str  # 'TP' | 'FP' | 'TN' | 'FN'


class TestEdgeCommonNeighbor(BaseModel):
    source: int
    target: int
    is_positive: bool
    common_neighbors: int
    embedding_distance: float


class TopKLink(BaseModel):
    source: int
    target: int
    score: float


class SnapshotTask3(BaseModel):
    """Task 3: Link Prediction epoch snapshot."""
    epoch: int
    edge_scores: List[float]
    edge_classifications: List[EdgeClassification]
    test_edge_common_neighbors: List[TestEdgeCommonNeighbor]
    embeddings_2d: List[List[float]]
    knn_preservation: float
    train_loss: float
    val_loss: float
    auc: float
    val_acc: float
    top_k_links: List[TopKLink] = Field(default_factory=list)


class PerCommunityMetric(BaseModel):
    community_id: int
    size: int
    density: float
    conductance: float
    internal_edges: int
    external_edges: int


class SnapshotTask4(BaseModel):
    """Task 4: Community Detection epoch snapshot."""
    epoch: int
    node_predictions: List[int]
    bridge_nodes: List[bool]
    bridge_strength: List[float]
    silhouette_scores: List[float]
    cluster_confidence: List[float]
    cluster_centers: List[List[float]]
    per_community_metrics: List[PerCommunityMetric]
    community_stability: float
    modularity_q: float
    conductance: float
    community_sizes: List[int]
    linkage_matrix: Optional[List[List[float]]] = None
    nmi_score: Optional[float] = None
    community_transitions: Dict[str, int] = Field(default_factory=dict)
    train_loss: float
    val_acc: float


class ProximityScore(BaseModel):
    source: int
    target: int
    score: float


class OutlierScore(BaseModel):
    node_id: int
    avg_distance_to_neighbors: float
    is_outlier: Optional[bool] = None


class PerEdgeReconError(BaseModel):
    source: int
    target: int
    reconstruction_score: float
    error: float
    is_correct: bool


class SnapshotTask5(BaseModel):
    """Task 5: Graph Embedding epoch snapshot."""
    epoch: int
    embeddings_2d: List[List[float]]
    tsne_2d: Optional[List[List[float]]] = None
    knn_preservation: float
    link_recon_auc: float
    isotropy_score: float
    reconstruction_loss: float
    proximity_scores: List[ProximityScore] = Field(default_factory=list)
    per_node_knn_preservation: Dict[str, float] = Field(default_factory=dict)
    per_edge_reconstruction_error: List[PerEdgeReconError] = Field(default_factory=list)
    embedding_norms: List[float] = Field(default_factory=list)
    outlier_scores: List[OutlierScore] = Field(default_factory=list)
    # Compatibility fields
    train_loss: float
    val_loss: float
    val_acc: float
    node_predictions: List[int] = Field(default_factory=list)


class GeneratedGraph(BaseModel):
    id: int
    nodes: List[Dict[str, Any]]
    links: List[LinkJSON]
    valid: bool
    score: float
    density: float
    avg_degree: float
    isolated_ratio: float
    invalidity_reason: Optional[str] = None
    comparison_metrics: Dict[str, Any] = Field(default_factory=dict)
    matches_source: bool = False


class SnapshotTask6(BaseModel):
    """Task 6: Graph Generation epoch snapshot."""
    epoch: int
    generated_graphs: List[GeneratedGraph]
    source_graphs: List[Dict[str, Any]] = Field(default_factory=list)
    latent_points: List[List[float]] = Field(default_factory=list)
    latent_point_scores: List[float] = Field(default_factory=list)
    latent_point_validity: List[float] = Field(default_factory=list)
    validity_rate: float
    uniqueness_rate: float
    novelty_rate: float
    recon_loss: float
    kl_loss: float
    train_loss: float
    val_loss: float
    train_acc: float
    val_acc: float


# ─── Union type for all snapshots ────────────────────────────────────────────

SnapshotPayload = Union[
    SnapshotTask1, SnapshotTask2, SnapshotTask3,
    SnapshotTask4, SnapshotTask5, SnapshotTask6,
]

SNAPSHOT_MODELS = {
    1: SnapshotTask1,
    2: SnapshotTask2,
    3: SnapshotTask3,
    4: SnapshotTask4,
    5: SnapshotTask5,
    6: SnapshotTask6,
}


# ─── Error Payload ───────────────────────────────────────────────────────────

class ErrorPayload(BaseModel):
    """Structured error — never leak Python tracebacks to FE."""
    code: str = ErrorCode.ERR_INTERNAL
    message: str = "An internal error occurred"
    retriable: bool = False
    field: Optional[str] = None


# ─── Training Complete Payload ───────────────────────────────────────────────

class TrainingCompletePayload(BaseModel):
    all_snapshots: List[Dict[str, Any]] = Field(default_factory=list)
    session_id: Optional[str] = None


# ─── Helpers ─────────────────────────────────────────────────────────────────

def validate_snapshot(task_id: int, data: dict) -> dict:
    """Validate a snapshot dict against the task-specific model.
    Returns the validated data (with defaults applied).
    Raises pydantic.ValidationError on schema violation.
    """
    model_cls = SNAPSHOT_MODELS.get(task_id)
    if model_cls is None:
        raise ValueError(f"Unknown task_id: {task_id}")
    instance = model_cls.model_validate(data)
    return instance.model_dump()


def build_ws_message(
    msg_type: str,
    payload: Any = None,
    seq: int = 0,
    progress: Optional[float] = None,
) -> dict:
    """Build a WSMessageEnvelope as dict ready for JSON serialization."""
    msg = WSMessageEnvelope(
        type=msg_type,
        seq=seq,
        payload=payload,
        progress=progress,
    )
    return msg.model_dump(exclude_none=True)
