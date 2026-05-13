import sys
from pathlib import Path

import torch
from torch_geometric.data import Data
from torch_geometric.nn import SAGEConv

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tasks.graph_classification import GraphClassifier
from tasks.graph_generation import _epoch_payload


def test_graph_classifier_uses_sage_conv_when_requested():
    model = GraphClassifier(in_channels=1, hidden=8, num_classes=2, model_type="SAGE")

    assert isinstance(model.conv1, SAGEConv)
    assert isinstance(model.conv2, SAGEConv)


def test_graph_generation_payload_keeps_string_signatures_for_frontend():
    data = Data(
        x=torch.eye(4),
        edge_index=torch.tensor(
            [
                [0, 1, 1, 2, 2, 3],
                [1, 0, 2, 1, 3, 2],
            ],
            dtype=torch.long,
        ),
    )

    payload = _epoch_payload(epoch=0, epochs=2, data=data, source_graphs_cache=[])

    assert payload["generated_graphs"]
    assert all(isinstance(g.get("signature"), str) for g in payload["generated_graphs"])
