import os
import sys
import asyncio

import torch
import torch.nn.functional as F
from torch_geometric.data import Data

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tasks.graph_classification import (
    GraphClassifier,
    build_class_weight_tensor,
    build_confusion_slice_counts,
    build_graph_calibration,
    build_task2_best_checkpoint_payload,
    compute_graph_classification_loss,
    compute_task2_selection_metrics,
    drop_edge_index,
    apply_temperature,
    model_default_hyperparams,
    normalize_graph_labels,
    run_graph_classification,
    split_graph_dataset,
    tune_temperature_lbfgs,
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


def test_compute_graph_classification_loss_supports_focal_gamma():
    logits = torch.tensor([[4.0, 0.1], [0.4, 1.0], [1.2, 0.8]], dtype=torch.float)
    target = torch.tensor([0, 1, 1], dtype=torch.long)

    focal_loss = compute_graph_classification_loss(
        logits,
        target,
        class_weights=None,
        focal_gamma=1.5,
        label_smoothing=0.0,
    )
    plain_loss = compute_graph_classification_loss(
        logits,
        target,
        class_weights=None,
        focal_gamma=0.0,
        label_smoothing=0.0,
    )

    assert torch.isfinite(focal_loss)
    assert focal_loss != plain_loss


def test_task2_selection_metrics_prioritize_macro_f1_and_balanced_accuracy():
    collapsed = compute_task2_selection_metrics(
        predictions=[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        ground_truth=[0, 0, 0, 0, 0, 0, 0, 0, 1, 1],
    )
    balanced = compute_task2_selection_metrics(
        predictions=[0, 0, 0, 0, 0, 1, 1, 1, 1, 1],
        ground_truth=[0, 0, 0, 0, 0, 0, 0, 0, 1, 1],
    )

    assert collapsed["accuracy"] > balanced["accuracy"]
    assert collapsed["selection_score"] < balanced["selection_score"]
    assert balanced["selection_metric"] == "0.5*macro_f1+0.5*balanced_accuracy"


def test_confusion_slice_counts_track_weak_class_misses():
    counts = build_confusion_slice_counts(
        predictions=[0, 0, 1, 0],
        ground_truth=[0, 1, 1, 1],
        num_classes=2,
    )

    assert counts["matrix"][1][0] == 2
    assert counts["matrix"][1][1] == 1
    assert counts["per_class"][1]["support"] == 3
    assert counts["per_class"][1]["missed_count"] == 2
    assert counts["weak_class"]["class_id"] == 1
    assert counts["weak_class"]["missed_to"]["0"] == 2


def test_best_checkpoint_payload_contains_snapshot_confusion_readout_and_weight_marker():
    snapshot = {
        "epoch": 5,
        "best_epoch": 5,
        "best_selection_metric": "0.5*macro_f1+0.5*balanced_accuracy",
        "best_selection_score": 0.65,
        "best_macro_f1": 0.64,
        "best_balanced_accuracy": 0.66,
        "graph_predictions": [0, 0, 1, 1],
        "graph_ground_truth": [0, 1, 1, 0],
        "attention_entropy": [0.2, 0.8, 0.5, 0.3],
        "node_contributions": [[0.9, 0.1], [0.5, 0.5], [0.8, 0.2], [0.7, 0.3]],
        "readout_quality": {"mean_entropy": 0.45},
        "model_hyperparams": {"pool_type": "attention_sum"},
    }

    payload = build_task2_best_checkpoint_payload(
        snapshot,
        state_dict={"lin.weight": torch.ones(2, 2)},
    )

    assert payload["type"] == "best_composite_checkpoint"
    assert payload["best_epoch"] == 5
    assert payload["weights_saved"] is True
    assert payload["weight_keys"] == ["lin.weight"]
    assert payload["confusion_slice_counts"]["matrix"][1][0] == 1
    assert payload["readout_attention"]["readout_quality"]["mean_entropy"] == 0.45
    assert payload["snapshot"]["epoch"] == 5


def test_graph_classifier_mean_pooling_reduces_size_shortcut():
    model = GraphClassifier(in_channels=2, hidden=8, num_classes=2, pool_type='mean')
    x = torch.randn(6, 2)
    edge_index = torch.tensor([[0, 1, 1, 2, 3, 4, 4, 5], [1, 0, 2, 1, 4, 3, 5, 4]], dtype=torch.long)
    batch = torch.tensor([0, 0, 0, 1, 1, 1], dtype=torch.long)

    out, graph_embeddings, alpha = model(x, edge_index, batch)

    assert out.shape == (2, 2)
    assert graph_embeddings.shape == (2, 8)
    assert alpha.shape[0] == 6


def test_graph_classifier_attention_sum_readout_preserves_motif_scale():
    model = GraphClassifier(in_channels=2, hidden=8, num_classes=2, pool_type='attention_sum')
    x = torch.randn(6, 2)
    edge_index = torch.tensor([[0, 1, 1, 2, 3, 4, 4, 5], [1, 0, 2, 1, 4, 3, 5, 4]], dtype=torch.long)
    batch = torch.tensor([0, 0, 0, 1, 1, 1], dtype=torch.long)

    out, graph_embeddings, alpha = model(x, edge_index, batch)

    assert out.shape == (2, 2)
    assert graph_embeddings.shape == (2, 8)
    assert torch.allclose(alpha[batch == 0].sum(), torch.tensor(1.0), atol=1e-5)
    assert torch.allclose(alpha[batch == 1].sum(), torch.tensor(1.0), atol=1e-5)


def test_gat_classifier_uses_graph_norm_and_residual_input_projection():
    model = GraphClassifier(
        in_channels=2,
        hidden=8,
        num_classes=2,
        model_type='GAT',
        heads=2,
        dropout=0.35,
        attn_dropout=0.25,
        pool_type='attention_sum',
    )
    x = torch.randn(7, 2)
    edge_index = torch.tensor(
        [[0, 1, 1, 2, 3, 4, 4, 5, 5, 6], [1, 0, 2, 1, 4, 3, 5, 4, 6, 5]],
        dtype=torch.long,
    )
    batch = torch.tensor([0, 0, 0, 1, 1, 1, 1], dtype=torch.long)

    out, graph_embeddings, alpha = model(x, edge_index, batch)

    assert model.norm1.__class__.__name__ == 'GraphNorm'
    assert model.norm2.__class__.__name__ == 'GraphNorm'
    assert model.input_skip_proj is not None
    assert out.shape == (2, 2)
    assert graph_embeddings.shape == (2, 8)
    assert torch.allclose(alpha[batch == 0].sum(), torch.tensor(1.0), atol=1e-5)
    assert torch.allclose(alpha[batch == 1].sum(), torch.tensor(1.0), atol=1e-5)


def test_gat_defaults_are_recall_rescue_recipe():
    defaults = model_default_hyperparams('GAT')

    assert defaults['hidden'] == 48
    assert defaults['dropout'] == 0.35
    assert defaults['attn_dropout'] == 0.25
    assert defaults['weight_decay'] == 1e-3
    assert defaults['early_stop_patience'] == 12


def test_sage_classifier_uses_graph_norm_for_graph_batches():
    model = GraphClassifier(
        in_channels=2,
        hidden=8,
        num_classes=2,
        model_type='SAGE',
        dropout=0.35,
        pool_type='attention_sum',
    )
    x = torch.randn(7, 2)
    edge_index = torch.tensor(
        [[0, 1, 1, 2, 3, 4, 4, 5, 5, 6], [1, 0, 2, 1, 4, 3, 5, 4, 6, 5]],
        dtype=torch.long,
    )
    batch = torch.tensor([0, 0, 0, 1, 1, 1, 1], dtype=torch.long)

    out, graph_embeddings, alpha = model(x, edge_index, batch)

    assert model.norm1.__class__.__name__ == 'GraphNorm'
    assert model.norm2.__class__.__name__ == 'GraphNorm'
    assert out.shape == (2, 2)
    assert graph_embeddings.shape == (2, 8)
    assert torch.allclose(alpha[batch == 0].sum(), torch.tensor(1.0), atol=1e-5)
    assert torch.allclose(alpha[batch == 1].sum(), torch.tensor(1.0), atol=1e-5)


def test_sage_defaults_are_collapse_rescue_recipe():
    defaults = model_default_hyperparams('GraphSAGE')

    assert defaults['hidden'] == 48
    assert defaults['dropout'] == 0.35
    assert defaults['weight_decay'] == 1e-3
    assert defaults['early_stop_patience'] == 8


def test_gat_task2_runtime_defaults_are_shortcut_resistant():
    class DummyWebSocket:
        def __init__(self):
            self.messages = []

        async def send_bytes(self, data):
            self.messages.append(data)

    graphs = [_make_graph(index % 2, feature_bias=index * 0.01) for index in range(12)]
    websocket = DummyWebSocket()

    snapshots = asyncio.run(run_graph_classification(
        {
            'task': 2,
            'model': 'GAT',
            'dataset': 'PROTEINS',
            'epochs': 1,
            'split_seed': 7,
        },
        websocket,
        stop_flag=lambda: False,
        custom_graphs=graphs,
    ))

    assert snapshots[0]['model_hyperparams']['task2_edge_dropout'] == 0.20
    assert snapshots[0]['model_hyperparams']['task2_density_contrastive_weight'] == 0.03
    assert snapshots[0]['best_selection_metric'] == '0.5*macro_f1+0.5*balanced_accuracy'
    assert websocket.messages


def test_sage_task2_runtime_defaults_rescue_class_collapse():
    class DummyWebSocket:
        def __init__(self):
            self.messages = []

        async def send_bytes(self, data):
            self.messages.append(data)

    graphs = [_make_graph(index % 2, feature_bias=index * 0.01) for index in range(12)]
    websocket = DummyWebSocket()

    snapshots = asyncio.run(run_graph_classification(
        {
            'task': 2,
            'model': 'GraphSAGE',
            'dataset': 'PROTEINS',
            'epochs': 1,
            'split_seed': 7,
        },
        websocket,
        stop_flag=lambda: False,
        custom_graphs=graphs,
    ))

    hyperparams = snapshots[0]['model_hyperparams']
    assert snapshots[0]['model_type'] == 'SAGE'
    assert hyperparams['task2_class_weighting'] is True
    assert hyperparams['task2_focal_gamma'] == 2.0
    assert hyperparams['task2_edge_dropout'] == 0.15
    assert hyperparams['task2_temperature_max'] == 1.5
    assert snapshots[0]['calibration_temperature'] <= 1.5
    assert snapshots[0]['best_selection_metric'] == '0.5*macro_f1+0.5*balanced_accuracy'
    assert websocket.messages


def test_task2_strict_epoch_default_runs_all_requested_epochs():
    class DummyWebSocket:
        async def send_bytes(self, data):
            pass

    graphs = [_make_graph(index % 2, feature_bias=index * 0.01) for index in range(12)]

    snapshots = asyncio.run(run_graph_classification(
        {
            'task': 2,
            'model': 'SAGE',
            'dataset': 'MUTAG',
            'epochs': 12,
            'split_seed': 7,
        },
        DummyWebSocket(),
        stop_flag=lambda: False,
        custom_graphs=graphs,
    ))

    assert [snapshot['epoch'] for snapshot in snapshots] == list(range(12))
    assert snapshots[-1]['epochs_target'] == 12
    assert snapshots[-1]['epochs_completed'] == 12
    assert snapshots[-1]['early_stopped'] is False
    assert snapshots[-1]['stop_reason'] is None
    assert snapshots[-1]['model_hyperparams']['early_stop_patience'] == 0


def test_task2_explicit_early_stop_reports_stop_reason():
    class DummyWebSocket:
        async def send_bytes(self, data):
            pass

    graphs = [_make_graph(index % 2, feature_bias=index * 0.01) for index in range(12)]

    snapshots = asyncio.run(run_graph_classification(
        {
            'task': 2,
            'model': 'SAGE',
            'dataset': 'MUTAG',
            'epochs': 12,
            'split_seed': 7,
            'task2_early_stop_patience': 2,
        },
        DummyWebSocket(),
        stop_flag=lambda: False,
        custom_graphs=graphs,
    ))

    assert len(snapshots) < 12
    assert snapshots[-1]['early_stopped'] is True
    assert snapshots[-1]['stop_reason'] == 'early_stop'
    assert snapshots[-1]['epochs_completed'] == len(snapshots)


def test_task2_normalizes_mutag_negative_positive_graph_labels():
    graphs = [
        _make_graph(-1, feature_bias=0.0),
        _make_graph(1, feature_bias=0.1),
        _make_graph(-1, feature_bias=0.2),
    ]

    labels, label_map = normalize_graph_labels(graphs)

    assert labels == [0, 1, 0]
    assert label_map == {'-1': 0, '1': 1}
    assert [int(graph.y.view(-1)[0].item()) for graph in graphs] == [0, 1, 0]


def test_task2_normalizes_any_non_contiguous_graph_labels():
    graphs = [
        _make_graph(42, feature_bias=0.0),
        _make_graph(7, feature_bias=0.1),
        _make_graph(42, feature_bias=0.2),
        _make_graph(99, feature_bias=0.3),
    ]

    labels, label_map = normalize_graph_labels(graphs)

    assert labels == [1, 0, 1, 2]
    assert label_map == {'7': 0, '42': 1, '99': 2}
    assert [int(graph.y.view(-1)[0].item()) for graph in graphs] == [1, 0, 1, 2]


def test_task2_uses_uploaded_class_metadata_for_realdata_labels():
    class DummyWebSocket:
        def __init__(self):
            self.messages = []

        async def send_bytes(self, data):
            self.messages.append(data)

    graphs = [_make_graph(index % 2, feature_bias=index * 0.01) for index in range(12)]
    for graph in graphs:
        graph.class_names = ['benign', 'toxic']
        graph.label_map = {'benign': 0, 'toxic': 1}

    snapshots = asyncio.run(run_graph_classification(
        {
            'task': 2,
            'model': 'GCN',
            'dataset': 'custom-realdata',
            'epochs': 1,
            'split_seed': 7,
        },
        DummyWebSocket(),
        stop_flag=lambda: False,
        custom_graphs=graphs,
    ))

    assert snapshots[0]['label_map'] == {'benign': 0, 'toxic': 1}


def test_task2_snapshot_reports_split_class_counts():
    class DummyWebSocket:
        async def send_bytes(self, data):
            pass

    graphs = [_make_graph(index % 2, feature_bias=index * 0.01) for index in range(20)]

    snapshots = asyncio.run(run_graph_classification(
        {
            'task': 2,
            'model': 'GCN',
            'dataset': 'MUTAG',
            'epochs': 1,
            'split_seed': 7,
        },
        DummyWebSocket(),
        stop_flag=lambda: False,
        custom_graphs=graphs,
    ))

    split_counts = snapshots[0]['split_class_counts']
    assert set(split_counts) == {'train', 'val', 'test'}
    assert all(count > 0 for count in split_counts['train'])
    assert all(count > 0 for count in split_counts['val'])
    assert all(count > 0 for count in split_counts['test'])


def test_temperature_scaling_is_bounded_for_flat_logits():
    logits = torch.zeros((6, 2), dtype=torch.float)
    targets = torch.tensor([0, 1, 0, 1, 0, 1], dtype=torch.long)

    temp = tune_temperature_lbfgs(logits, targets)
    probs = apply_temperature(logits, 10.0)

    assert 0.8 <= temp <= 3.0
    assert probs.shape == logits.shape


def test_temperature_scaling_honors_tighter_sage_bounds():
    logits = torch.zeros((6, 2), dtype=torch.float)
    targets = torch.tensor([0, 1, 0, 1, 0, 1], dtype=torch.long)

    temp = tune_temperature_lbfgs(logits, targets, min_temp=1.0, max_temp=1.5)
    probs = apply_temperature(logits, 3.0, min_temp=1.0, max_temp=1.5)

    assert 1.0 <= temp <= 1.5
    assert probs.shape == logits.shape


def test_graph_calibration_reports_brier_and_high_conf_wrong_rate():
    calibration = build_graph_calibration(
        confidences=[0.95, 0.82, 0.62, 0.51],
        correctness=[0, 1, 0, 1],
        probabilities=[[0.95, 0.05], [0.18, 0.82], [0.38, 0.62], [0.51, 0.49]],
        ground_truth=[1, 1, 0, 0],
    )

    assert calibration["ece"] >= 0
    assert calibration["brier"] > 0
    assert calibration["high_conf_wrong_rate"] == 0.25


def test_drop_edge_index_keeps_shape_and_is_noop_when_disabled():
    edge_index = torch.tensor([[0, 1, 1, 2], [1, 0, 2, 1]], dtype=torch.long)

    assert torch.equal(drop_edge_index(edge_index, 0.0, training=True), edge_index)
    dropped = drop_edge_index(edge_index, 0.5, training=True, seed=7)

    assert dropped.shape[0] == 2
    assert dropped.shape[1] >= 1
