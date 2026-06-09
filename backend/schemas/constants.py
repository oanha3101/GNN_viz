"""
Shared constants for GNN-Insight WebSocket protocol.
Single source-of-truth for TaskId, MessageType, ErrorCode.
Must be mirrored in frontend/src/contracts/wsMessages.js.
"""
from enum import IntEnum, StrEnum


SCHEMA_VERSION = 3


class TaskId(IntEnum):
    """6 GNN tasks supported by GNN-Insight."""
    NODE_CLASSIFICATION = 1
    GRAPH_CLASSIFICATION = 2
    LINK_PREDICTION = 3
    COMMUNITY_DETECTION = 4
    GRAPH_EMBEDDING = 5
    GRAPH_GENERATION = 6


class MessageTypeIn(StrEnum):
    """Messages FROM client TO server (WS_IN)."""
    START = "start"
    PAUSE = "pause"
    RESUME = "resume"
    SEEK = "seek"
    STOP = "stop"
    PING = "ping"
    ACK = "ack"


class MessageTypeOut(StrEnum):
    """Messages FROM server TO client (WS_OUT)."""
    SESSION_CREATED = "session_created"
    GRAPH_DATA = "graph_data"
    GRAPH_METADATA = "graph_metadata"
    EPOCH_SNAPSHOT = "epoch_snapshot"
    TRAINING_COMPLETE = "training_complete"
    ERROR = "error"
    PONG = "pong"


class ErrorCode(StrEnum):
    """Structured error codes — never leak Python tracebacks to FE."""
    ERR_INVALID_CONFIG = "ERR_INVALID_CONFIG"
    ERR_TRAINING_FAILED = "ERR_TRAINING_FAILED"
    ERR_SESSION_NOT_FOUND = "ERR_SESSION_NOT_FOUND"
    ERR_DATA_LOAD_FAILED = "ERR_DATA_LOAD_FAILED"
    ERR_MODEL_BUILD_FAILED = "ERR_MODEL_BUILD_FAILED"
    ERR_INTERNAL = "ERR_INTERNAL"
    ERR_AUTH_REQUIRED = "ERR_AUTH_REQUIRED"
    ERR_AUTH_INVALID = "ERR_AUTH_INVALID"
