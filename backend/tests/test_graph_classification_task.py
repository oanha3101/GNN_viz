import os
import sys

import torch
import torch.nn.functional as F
from torch_geometric.data import Data

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tasks.graph_classification import (
    GraphClassifier,
    build_class_weight_tensor,
    compute_graph_classification_loss,
    split_graph_dataset,
)


def _make_graph(label: int, feature_bias: float = 0.0):
    edge_index = torch.tensor(
        [[0, 1, 1, 2, 2, 3], [1, 0, 2, 1, 3, 2]],
        dtype=torch.long,
    )
    x = torch.tensor(
        [
            [1.0 + feature_bias, 0.0],
            [0.5 + feature_bias, 0.2],
            [0.2 + feature_bias, 0.6],
            [0.1 + feature_bias, 1.0],
        ],
        dtype=torch.float,
    )
    y = torch.tensor([label], dtype=torch.long)
    return Data(x=x, edge_index=edge_index, y=y, num_nodes=4)


def test_split_graph_dataset_is_stratified():
    graphs = [_make_graph(0) for _ in range(10)] + [_make_graph(1) for _ in range(30)]

    train_graphs, test_graphs, train_idx, test_idx = split_graph_dataset(graphs, train_ratio=0.8, seed=7)

    train_labels = [int(graph.y.view(-1)[0].item()) for graph in train_graphs]
    test_labels = [int(graph.y.view(-1)[0].item()) for graph in test_graphs]

    assert len(train_graphs) == 32
    assert len(test_graphs) == 8
    assert set(train_idx).isdisjoint(set(test_idx))
    assert train_labels.count(0) == 8
    assert train_labels.count(1) == 24
    assert test_labels.count(0) == 2
    assert test_labels.count(1) == 6


def test_build_class_weight_tensor_upweights_minor_class():
    labels = [0, 0, 1, 1, 1, 1]
    weights = build_class_weight_tensor(labels, num_classes=2)

    assert weights.shape[0] == 2
    assert weights[0] > weights[1]


def test_compute_graph_classification_loss_supports_weighting_and_smoothing():
    logits = torch.tensor([[2.5, 0.5], [0.4, 1.8], [1.7, 1.4]], dtype=torch.float)
    target = torch.tensor([0, 1, 0], dtype=torch.long)
    class_weights = torch.tensor([1.6, 0.8], dtype=torch.float)

    weighted_loss = compute_graph_classification_loss(
        logits,
        target,
        class_weights=class_weights,
        focal_gamma=0.0,
        label_smoothing=0.05,
    )
    plain_loss = F.cross_entropy(logits, target)

    assert torch.isfinite(weighted_loss)
    assert weighted_loss != plain_loss


def test_graph_classifier_mean_pooling_reduces_size_shortcut():
    model = GraphClassifier(in_channels=2, hidden=8, num_classes=2, pool_type='mean')
    x = torch.randn(6, 2)
    edge_index = torch.tensor([[0, 1, 1, 2, 3, 4, 4, 5], [1, 0, 2, 1, 4, 3, 5, 4]], dtype=torch.long)
    batch = torch.tensor([0, 0, 0, 1, 1, 1], dtype=torch.long)

    out, graph_embeddings, alpha = model(x, edge_index, batch)

    assert out.shape == (2, 2)
    assert graph_embeddings.shape == (2, 8)
    assert alpha.shape[0] == 6
