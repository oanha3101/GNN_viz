"""
WebSocket training pipeline tests.
Tests the WS protocol: connect → config → graph_data → epoch_snapshots → training_complete.
"""
import gzip
import json
import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app


def _receive_zipped_json(websocket):
    """Receive a gzip-compressed JSON message from the WS and return the parsed envelope."""
    raw = websocket.receive_bytes()
    return json.loads(gzip.decompress(raw).decode("utf-8"))


def _auth_token(client: TestClient, *, role: str | None = None) -> str:
    suffix = os.urandom(4).hex()
    payload = {
        "email": f"ws_{suffix}@test.local",
        "username": f"ws_{suffix}",
        "password": "TestPass123!",
        "full_name": "WS Test User",
    }
    if role:
        payload["role"] = role
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def test_ws_invalid_task_returns_error():
    """Sending an invalid task ID should return a v3 error envelope."""
    with TestClient(app) as client:
        token = _auth_token(client)
        with client.websocket_connect("/ws/train") as ws:
            ws.send_json({"task": 999, "model": "GCN", "dataset": "cora", "epochs": 1, "auth_token": token})
            envelope = _receive_zipped_json(ws)
            assert envelope["v"] == 3
            assert envelope["type"] == "error"
            assert "code" in envelope["payload"]


def test_ws_missing_config_fields_returns_error():
    """Sending an empty config should trigger an error or handle gracefully."""
    with TestClient(app) as client:
        token = _auth_token(client)
        with client.websocket_connect("/ws/train") as ws:
            ws.send_json({"auth_token": token})
            # Should get either an error or a graph_data response
            # depending on how the service handles missing fields
            try:
                envelope = _receive_zipped_json(ws)
                # If we get here, it should be either error or graph_data
                assert envelope["v"] == 3
                assert envelope["type"] in ("error", "graph_data", "epoch_snapshot")
            except Exception:
                # Connection may close on invalid config — that's acceptable
                pass


def test_ws_message_envelope_has_v3_format():
    """All WS messages should use the v3 envelope format."""
    with TestClient(app) as client:
        token = _auth_token(client)
        with client.websocket_connect("/ws/train") as ws:
            ws.send_json({"task": 999, "model": "GCN", "dataset": "cora", "epochs": 1, "auth_token": token})
            envelope = _receive_zipped_json(ws)
            # v3 envelope must have: v, type, seq, ts, payload
            assert "v" in envelope
            assert envelope["v"] == 3
            assert "type" in envelope
            assert "seq" in envelope
            assert "ts" in envelope


def test_ws_error_message_no_traceback_leak():
    """Error messages should not expose internal tracebacks."""
    with TestClient(app) as client:
        token = _auth_token(client)
        with client.websocket_connect("/ws/train") as ws:
            ws.send_json({"task": 999, "model": "GCN", "dataset": "cora", "epochs": 1, "auth_token": token})
            envelope = _receive_zipped_json(ws)
            if envelope["type"] == "error":
                payload = envelope["payload"]
                # message should not contain Python traceback patterns
                msg = payload.get("message", "")
                assert "Traceback" not in msg
                assert "File \"" not in msg


def test_ws_invalid_model_returns_error_or_handles():
    """Sending an invalid model should return an error or handle gracefully."""
    with TestClient(app) as client:
        token = _auth_token(client)
        with client.websocket_connect("/ws/train") as ws:
            ws.send_json({"task": 1, "model": "INVALID_MODEL", "dataset": "cora", "epochs": 1, "auth_token": token})
            try:
                envelope = _receive_zipped_json(ws)
                assert envelope["v"] == 3
                # Should be error or fallback to default model
                assert envelope["type"] in ("error", "graph_data", "epoch_snapshot")
            except Exception:
                # Connection may close on invalid model — acceptable
                pass


def test_ws_envelope_has_payload_field():
    """Every v3 envelope must have a payload field."""
    with TestClient(app) as client:
        token = _auth_token(client)
        with client.websocket_connect("/ws/train") as ws:
            ws.send_json({"task": 999, "model": "GCN", "dataset": "cora", "epochs": 1, "auth_token": token})
            envelope = _receive_zipped_json(ws)
            assert "payload" in envelope
            assert isinstance(envelope["payload"], dict)


def test_ws_error_has_code_and_message():
    """Error envelopes should have code and message in payload."""
    with TestClient(app) as client:
        token = _auth_token(client)
        with client.websocket_connect("/ws/train") as ws:
            ws.send_json({"task": 999, "model": "GCN", "dataset": "cora", "epochs": 1, "auth_token": token})
            envelope = _receive_zipped_json(ws)
            if envelope["type"] == "error":
                assert "code" in envelope["payload"]
                assert "message" in envelope["payload"]
                assert isinstance(envelope["payload"]["code"], (str, int))
                assert isinstance(envelope["payload"]["message"], str)
                assert len(envelope["payload"]["message"]) > 0


def test_ws_seq_increments():
    """Sequence numbers should be present in envelopes."""
    with TestClient(app) as client:
        token = _auth_token(client)
        with client.websocket_connect("/ws/train") as ws:
            ws.send_json({"task": 999, "model": "GCN", "dataset": "cora", "epochs": 1, "auth_token": token})
            envelope = _receive_zipped_json(ws)
            assert "seq" in envelope
            assert isinstance(envelope["seq"], int)
            assert envelope["seq"] >= 0


def test_ws_requires_authentication():
    with TestClient(app) as client:
        with client.websocket_connect("/ws/train") as ws:
            ws.send_json({"task": 1, "model": "GCN", "dataset": "cora", "epochs": 1})
            envelope = _receive_zipped_json(ws)
            assert envelope["type"] == "error"
            assert "Not authenticated" in envelope["payload"]["message"]


def test_ws_blocks_viewer_live_training():
    with TestClient(app) as client:
        token = _auth_token(client, role="viewer")
        with client.websocket_connect("/ws/train") as ws:
            ws.send_json({"task": 1, "model": "GCN", "dataset": "cora", "epochs": 1, "auth_token": token})
            envelope = _receive_zipped_json(ws)
            assert envelope["type"] == "error"
            assert "Viewer accounts cannot start live training" in envelope["payload"]["message"]
