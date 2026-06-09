"""
TDD: Tests for Observability (Phase F).
"""
import pytest
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from main import app
from core.metrics import metrics

def test_metrics_endpoint():
    with TestClient(app) as client:
        # Increment a metric
        metrics.inc("test_metric", 1)
        
        resp = client.get("/metrics")
        assert resp.status_code == 200
        data = resp.json()
        assert "counters" in data
        assert data["counters"].get("test_metric") >= 1
