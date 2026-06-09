"""
TDD: Tests for WebSocket Protocol (Phase C).
"""
import pytest
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from main import app
from schemas.constants import ErrorCode


def _auth_token(client: TestClient) -> str:
    response = client.post("/api/auth/register", json={
        "email": "ws_protocol@test.local",
        "username": "ws_protocol",
        "password": "TestPass123!",
        "full_name": "WS Protocol User",
    })
    if response.status_code == 400:
        response = client.post("/api/auth/login", json={
            "username": "ws_protocol",
            "password": "TestPass123!",
        })
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def test_ws_error_handling():
    with TestClient(app) as client:
        token = _auth_token(client)
        with client.websocket_connect("/ws/train") as websocket:
            # Send an invalid config to trigger error
            websocket.send_json({"task": 999, "auth_token": token})
            import gzip
            import json
            raw_bytes = websocket.receive_bytes()
            response = json.loads(gzip.decompress(raw_bytes).decode('utf-8'))
            assert response.get("v") == 3
            assert response.get("type") == "error"
            assert response.get("payload", {}).get("code") == ErrorCode.ERR_TRAINING_FAILED


def test_ws_error_closes_with_server_error_code():
    with TestClient(app) as client:
        token = _auth_token(client)
        with client.websocket_connect("/ws/train") as websocket:
            websocket.send_json({"task": 999, "auth_token": token})
            import gzip
            import json
            from starlette.websockets import WebSocketDisconnect

            raw_bytes = websocket.receive_bytes()
            response = json.loads(gzip.decompress(raw_bytes).decode('utf-8'))
            assert response.get("type") == "error"

            with pytest.raises(WebSocketDisconnect) as exc_info:
                websocket.receive_bytes()
            assert exc_info.value.code == 1011
