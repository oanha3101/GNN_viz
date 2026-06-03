import asyncio

import torch
from torch_geometric.data import Data

from models.graphsage import GraphSAGEModel
from tasks.node_classification import (
    compute_boundary_selection_metrics,
    drop_edge_index,
    run_node_classification,
)


class DummyWebSocket:
    def __init__(self):
        self.messages = []

    async def send_bytes(self, data):
        self.messages.append(data)


def _make_node_data():
    x = torch.randn(8, 4)
    edge_index = torch.tensor(
        [
            [0, 1, 1, 2, 2, 3, 4, 5, 5, 6, 6, 7],
            [1, 0, 2, 1, 3, 2, 5, 4, 6, 5, 7, 6],
        ],
        dtype=torch.long,
    )
    y = torch.tensor([0, 0, 1, 1, 0, 1, 1, 0], dtype=torch.long)
    train_mask = torch.tensor([True, True, False, False, True, False, False, False])
    val_mask = torch.tensor([False, False, True, True, False, True, True, False])
    test_mask = torch.tensor([False, False, False, False, False, False, False, True])
    return Data(x=x, edge_index=edge_index, y=y, train_mask=train_mask, val_mask=val_mask, test_mask=test_mask)


def test_drop_edge_index_preserves_shape_and_keeps_edges():
    edge_index = torch.tensor([[0, 1, 1, 2], [1, 0, 2, 1]], dtype=torch.long)

    assert torch.equal(drop_edge_index(edge_index, 0.0, training=True), edge_index)
    dropped = drop_edge_index(edge_index, 0.5, training=True, seed=7)

    assert dropped.shape[0] == 2
    assert dropped.shape[1] >= 1


def test_boundary_selection_metrics_prioritize_boundary_resilience():
    edge_index = torch.tensor(
        [
            [0, 1, 1, 2, 2, 3, 3, 4],
            [1, 0, 2, 1, 3, 2, 4, 3],
        ],
        dtype=torch.long,
    )
    y = torch.tensor([0, 0, 1, 1, 0], dtype=torch.long)
    mask = torch.tensor([False, True, True, True, True])
    weak_boundary = compute_boundary_selection_metrics(
        predictions=torch.tensor([0, 0, 1, 0, 0]),
        ground_truth=y,
        edge_index=edge_index,
        mask=mask,
    )
    stronger_boundary = compute_boundary_selection_metrics(
        predictions=torch.tensor([0, 0, 1, 1, 0]),
        ground_truth=y,
        edge_index=edge_index,
        mask=mask,
    )

    assert weak_boundary["selection_metric"] == "0.4*val_acc+0.6*boundary_accuracy"
    assert stronger_boundary["selection_score"] > weak_boundary["selection_score"]


def test_sage_task1_runtime_uses_boundary_rescue_defaults():
    data = _make_node_data()
    model = GraphSAGEModel(in_channels=4, hidden_channels=8, out_channels=2, num_layers=3, dropout=0.5)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
    websocket = DummyWebSocket()

    snapshots = asyncio.run(run_node_classification(
        {
            "task": 1,
            "model": "SAGE",
            "epochs": 2,
            "task1_edge_dropout": 0.15,
            "task1_boundary_patience": 2,
        },
        data,
        model,
        optimizer,
        websocket,
        stop_flag=lambda: False,
    ))

    assert snapshots
    assert snapshots[0]["model_type"] == "SAGE"
    assert snapshots[0]["task1_edge_dropout"] == 0.15
    assert snapshots[0]["best_selection_metric"] == "0.4*val_acc+0.6*boundary_accuracy"
    assert "boundary_accuracy" in snapshots[0]
    assert websocket.messages
