"""
Application Metrics — counters and histograms for observability.
Works standalone without Prometheus client library (pure Python counters).
If prometheus_client is available, uses it for standard exposition.
"""
import time
import threading
import logging
from collections import defaultdict

logger = logging.getLogger(__name__)


class MetricsRegistry:
    """Simple thread-safe metrics registry."""

    def __init__(self):
        self._counters = defaultdict(int)
        self._gauges = defaultdict(float)
        self._histograms = defaultdict(list)
        self._lock = threading.Lock()

    def inc(self, name: str, value: int = 1, labels: dict = None):
        """Increment a counter."""
        key = self._make_key(name, labels)
        with self._lock:
            self._counters[key] += value

    def set_gauge(self, name: str, value: float, labels: dict = None):
        """Set a gauge value."""
        key = self._make_key(name, labels)
        with self._lock:
            self._gauges[key] = value

    def observe(self, name: str, value: float, labels: dict = None):
        """Record a histogram observation."""
        key = self._make_key(name, labels)
        with self._lock:
            self._histograms[key].append(value)
            # Keep only last 1000 observations per key
            if len(self._histograms[key]) > 1000:
                self._histograms[key] = self._histograms[key][-500:]

    def get_all(self) -> dict:
        """Get all metrics as a dict (for /metrics endpoint)."""
        with self._lock:
            return {
                "counters": dict(self._counters),
                "gauges": dict(self._gauges),
                "histograms": {
                    k: {
                        "count": len(v),
                        "sum": sum(v) if v else 0,
                        "avg": sum(v) / len(v) if v else 0,
                        "min": min(v) if v else 0,
                        "max": max(v) if v else 0,
                    }
                    for k, v in self._histograms.items()
                },
            }

    def _make_key(self, name: str, labels: dict = None) -> str:
        if not labels:
            return name
        label_str = ",".join(f"{k}={v}" for k, v in sorted(labels.items()))
        return f"{name}{{{label_str}}}"


# ── Singleton ────────────────────────────────────────────────────────────────
metrics = MetricsRegistry()


# ── Pre-defined Metric Names ────────────────────────────────────────────────
WS_CONNECTIONS_TOTAL = "ws_connections_total"
WS_MESSAGES_SENT = "ws_messages_sent_total"
WS_MESSAGES_RECEIVED = "ws_messages_received_total"
TRAINING_SESSIONS_TOTAL = "training_sessions_total"
TRAINING_SESSIONS_ACTIVE = "training_sessions_active"
TRAINING_EPOCH_DURATION = "training_epoch_duration_seconds"
TRAINING_ERRORS_TOTAL = "training_errors_total"
SNAPSHOT_SAVE_DURATION = "snapshot_save_duration_seconds"
HTTP_REQUESTS_TOTAL = "http_requests_total"


class TimerContext:
    """Context manager for timing operations."""

    def __init__(self, metric_name: str, labels: dict = None):
        self.metric_name = metric_name
        self.labels = labels
        self.start = None

    def __enter__(self):
        self.start = time.time()
        return self

    def __exit__(self, *args):
        duration = time.time() - self.start
        metrics.observe(self.metric_name, duration, self.labels)


def timer(metric_name: str, labels: dict = None):
    """Usage: with timer('training_epoch_duration_seconds', {'task': '1'}): ..."""
    return TimerContext(metric_name, labels)
