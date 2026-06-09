import os
import sys

import torch
from torch_geometric.data import Data

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from data.loaders import auto_detect_graph


def test_auto_detect_graph_adds_missing_val_and_test_masks():
    data = Data(
        x=torch.randn(10, 4),
        edge_index=torch.tensor(
            [[0, 1, 2, 3, 4, 5, 6, 7], [1, 2, 3, 4, 5, 6, 7, 8]],
            dtype=torch.long,
        ),
        y=torch.tensor([0, 1, 0, 1, 0, 1, 0, 1, 0, 1], dtype=torch.long),
    )

    prepared, meta = auto_detect_graph(data)

    assert prepared.train_mask is not None
    assert prepared.val_mask is not None
    assert prepared.test_mask is not None
    assert int(prepared.train_mask.sum()) > 0
    assert int(prepared.val_mask.sum()) > 0
    assert int(prepared.test_mask.sum()) > 0
    assert meta["num_classes"] == 2


def test_auto_detect_graph_preserves_existing_train_mask():
    train_mask = torch.tensor([1, 1, 1, 0, 0, 0], dtype=torch.bool)
    data = Data(
        x=torch.randn(6, 3),
        edge_index=torch.tensor([[0, 1, 2, 3], [1, 2, 3, 4]], dtype=torch.long),
        y=torch.tensor([0, 0, 1, 1, 0, 1], dtype=torch.long),
        train_mask=train_mask,
    )

    prepared, _ = auto_detect_graph(data)

    assert torch.equal(prepared.train_mask, train_mask)
    assert prepared.val_mask is not None
    assert prepared.test_mask is not None
