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

def test_ws_error_handling():
    with TestClient(app) as client:
        with client.websocket_connect("/ws/train") as websocket:
            # Send an invalid config to trigger error
            websocket.send_json({"task": 999})
            import gzip
            import json
            raw_bytes = websocket.receive_bytes()
            response = json.loads(gzip.decompress(raw_bytes).decode('utf-8'))
            assert response.get("v") == 3
            assert response.get("type") == "error"
            assert response.get("payload", {}).get("code") == ErrorCode.ERR_TRAINING_FAILED
