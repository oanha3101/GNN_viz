import os
import sys

import torch
from torch_geometric.data import Data

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import services.sample_dataset_service as sample_dataset_service


def _make_graph(label: int, num_nodes: int = 4, feature_dim: int = 3):
    edge_index = torch.tensor(
        [[0, 1, 1, 2, 2, 3], [1, 0, 2, 1, 3, 2]],
        dtype=torch.long,
    )
    x = torch.ones((num_nodes, feature_dim), dtype=torch.float)
    y = torch.tensor([label], dtype=torch.long)
    return Data(x=x, edge_index=edge_index, y=y, num_nodes=num_nodes)


def test_sample_specs_include_proteins_graph_classification(monkeypatch):
    tiny_single = _make_graph(label=0)
    tiny_collection = [_make_graph(label=index % 2) for index in range(6)]

    monkeypatch.setattr(sample_dataset_service, "load_cora", lambda: tiny_single)
    monkeypatch.setattr(sample_dataset_service, "load_citeseer", lambda: tiny_single)
    monkeypatch.setattr(sample_dataset_service, "load_karate", lambda: tiny_single)
    monkeypatch.setattr(
        sample_dataset_service,
        "_load_mutag_subset",
        lambda limit=120: (tiny_collection, "MUTAG"),
    )
    monkeypatch.setattr(
        sample_dataset_service,
        "_load_proteins_subset",
        lambda limit=180: (tiny_collection, "PROTEINS"),
    )

    specs = sample_dataset_service._sample_specs()
    slugs = {spec["slug"] for spec in specs}

    assert "sample-mutag-graph-classification" in slugs
    assert "sample-proteins-graph-classification" in slugs

    proteins_spec = next(spec for spec in specs if spec["slug"] == "sample-proteins-graph-classification")
    assert proteins_spec["summary_json"]["task_profile_id"] == 2
    assert proteins_spec["summary_json"]["num_graphs"] == len(tiny_collection)
    assert proteins_spec["summary_json"]["sample_catalog"]["sample_key"] == "sample-proteins-graph-classification"


def test_select_graph_subset_balances_ordered_graph_dataset():
    ordered_graphs = [_make_graph(label=0) for _ in range(8)] + [_make_graph(label=1) for _ in range(8)]

    subset = sample_dataset_service._select_graph_subset(
        ordered_graphs,
        limit=10,
        seed=42,
        balance_classes=True,
    )

    labels = [int(graph.y.view(-1)[0].item()) for graph in subset]
    assert len(subset) == 10
    assert labels.count(0) == 5
    assert labels.count(1) == 5
