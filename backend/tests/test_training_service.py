import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.session_manager import session_manager
from services import training_service


class DummyTensor:
    def __init__(self, values):
        self._values = np.array(values)

    def cpu(self):
        return self

    def numpy(self):
        return self._values

    def size(self, dim):
        return self._values.shape[dim]

    def max(self):
        return DummyScalar(self._values.max())

    def __getitem__(self, index):
        return DummyScalar(self._values[index])


class DummyScalar:
    def __init__(self, value):
        self._value = value

    def item(self):
        return self._value


class DummyData:
    def __init__(self):
        self.edge_index = DummyTensor([[0, 1, 1, 2], [1, 0, 2, 1]])
        self.x = DummyTensor([[1.0, 0.0], [0.0, 1.0], [1.0, 1.0]])
        self.y = DummyTensor([0, 1, 0])
        self.train_mask = DummyTensor([1, 1, 0])
        self.num_nodes = 3


def test_resolve_session_id_reuses_existing_session():
    session_id = session_manager.create_session(
        config={"task": 1, "epochs": 5},
        task_type=1,
        model_type="GCN",
        dataset_name="cora",
        project_id=12,
        dataset_version_id=34,
    )

    try:
        resolved = training_service.resolve_session_id(
            {
                "session_id": session_id,
                "task": 1,
                "model": "GCN",
                "dataset": "cora",
                "project_id": 12,
                "dataset_version_id": 34,
            }
        )
        assert resolved == session_id
    finally:
        session_manager.cleanup_session(session_id)


def test_build_graph_json_flexible_emits_nodes_and_links():
    payload = training_service.build_graph_json_flexible(DummyData())

    assert [node["id"] for node in payload["nodes"]] == [0, 1, 2]
    assert payload["nodes"][0]["groundTruth"] == 0
    assert payload["nodes"][1]["groundTruth"] == 1
    assert payload["nodes"][2]["inTrainSet"] is False
    assert payload["links"] == [{"source": 0, "target": 1}, {"source": 1, "target": 2}]
