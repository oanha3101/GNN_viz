import pytest
import asyncio
import warnings
import torch
from torch_geometric.data import Data
from schemas.ws import validate_snapshot, SNAPSHOT_MODELS
import tasks.community_detection as community_detection_module
from tasks.node_classification import run_node_classification
from tasks.graph_classification import run_graph_classification
from tasks.link_prediction import run_link_prediction
from tasks.community_detection import (
    CommunityGNN,
    align_labels,
    resolve_num_communities,
    run_community_detection,
)
from tasks.graph_embedding import run_graph_embedding
from tasks.graph_generation import run_graph_generation
from models.gcn import GCNModel

# ─── Mocking ──────────────────────────────────────────────────────────────────

class MockWebSocket:
    def __init__(self):
        self.sent_messages = []

    async def send_bytes(self, data):
        # We don't actually need to decompress here for the contract test
        # as we'll capture the return value of the task functions
        pass

    async def send_json(self, data):
        self.sent_messages.append(data)

def mock_stop_flag():
    return False

# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_node_data():
    x = torch.randn(20, 16)
    edge_index = torch.randint(0, 20, (2, 50))
    y = torch.randint(0, 3, (20,))
    train_mask = torch.ones(20, dtype=torch.bool)
    val_mask = torch.ones(20, dtype=torch.bool)
    return Data(x=x, edge_index=edge_index, y=y, train_mask=train_mask, val_mask=val_mask)

# ─── Contract Tests ───────────────────────────────────────────────────────────

def test_node_classification_contract(mock_node_data):
    config = {'epochs': 2, 'lr': 0.01, 'hidden': 16}
    model = GCNModel(in_channels=16, hidden_channels=16, out_channels=3)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
    ws = MockWebSocket()
    
    snapshots = asyncio.run(run_node_classification(config, mock_node_data, model, optimizer, ws, mock_stop_flag))
    
    assert len(snapshots) > 0
    # Validate against Pydantic model
    validate_snapshot(1, snapshots[0])

def test_graph_classification_contract():
    config = {'epochs': 2, 'lr': 0.01, 'hidden': 16, 'model_type': 'GCN'}
    ws = MockWebSocket()
    
    # Task 2 generates its own data if custom_graphs is None
    snapshots = asyncio.run(run_graph_classification(config, ws, mock_stop_flag))
    
    assert len(snapshots) > 0
    validate_snapshot(2, snapshots[0])

def test_link_prediction_contract(mock_node_data):
    config = {'epochs': 2, 'lr': 0.01, 'hidden': 16, 'edge_split_ratio': 0.2}
    ws = MockWebSocket()
    
    snapshots = asyncio.run(run_link_prediction(config, mock_node_data, 'GCN', ws, mock_stop_flag))
    
    assert len(snapshots) > 0
    validate_snapshot(3, snapshots[0])
    assert isinstance(snapshots[0]['edge_structure_features'], list)
    assert snapshots[0]['edge_structure_features']
    assert 'shortest_path' in snapshots[0]['edge_structure_features'][0]
    assert snapshots[0]['epochs_target'] == 2
    assert snapshots[0]['epochs_completed'] == 1
    assert snapshots[0]['model_type'] == 'GCN'
    assert snapshots[0]['edge_score_delta']


def test_link_prediction_runs_strict_epochs_by_default(mock_node_data):
    config = {'epochs': '12', 'lr': '0.01', 'hidden': '12', 'edge_split_ratio': '0.2', 'seed': '19'}
    ws = MockWebSocket()

    snapshots = asyncio.run(run_link_prediction(config, mock_node_data, 'GCN', ws, mock_stop_flag))

    assert [snap['epoch'] for snap in snapshots] == list(range(12))
    assert snapshots[-1]['epochs_target'] == 12
    assert snapshots[-1]['epochs_completed'] == 12
    assert snapshots[-1]['early_stopped'] is False
    assert snapshots[-1]['stop_reason'] is None


def test_link_prediction_snapshot_stride_keeps_epoch_metadata(mock_node_data):
    config = {'epochs': 12, 'hidden': 12, 'edge_split_ratio': 0.2, 'seed': 23, 'task3_snapshot_stride': 3}
    ws = MockWebSocket()

    snapshots = asyncio.run(run_link_prediction(config, mock_node_data, 'GCN', ws, mock_stop_flag))

    assert [snap['epoch'] for snap in snapshots] == [0, 3, 6, 9, 11]
    assert all(snap['epochs_target'] == 12 for snap in snapshots)
    assert snapshots[-1]['epochs_completed'] == 12


def test_link_prediction_gat_attention_has_top_level_per_head_without_grad_warning(mock_node_data):
    config = {'epochs': 2, 'hidden': 8, 'heads': 2, 'edge_split_ratio': 0.2, 'seed': 29}
    ws = MockWebSocket()

    with warnings.catch_warnings(record=True) as recorded:
        warnings.simplefilter('always')
        snapshots = asyncio.run(run_link_prediction(config, mock_node_data, 'GAT', ws, mock_stop_flag))

    warning_text = '\n'.join(str(item.message) for item in recorded)
    assert 'Converting a tensor with requires_grad=True to a scalar' not in warning_text
    gat_snap = snapshots[0]
    assert gat_snap['attention_edges']
    assert gat_snap['attention_per_head']
    assert isinstance(gat_snap['attention_focus_score'], float)


def test_link_prediction_sage_emits_stability_without_sampling_edges(mock_node_data):
    config = {'epochs': 2, 'hidden': 8, 'edge_split_ratio': 0.2, 'seed': 31}
    ws = MockWebSocket()

    snapshots = asyncio.run(run_link_prediction(config, mock_node_data, 'GraphSAGE', ws, mock_stop_flag))

    sage_snap = snapshots[0]
    assert sage_snap['model_type'] == 'SAGE'
    assert isinstance(sage_snap['score_variance_by_edge'], list)
    assert isinstance(sage_snap['unstable_edge_indices'], list)
    assert isinstance(sage_snap['score_stability'], float)
    assert 'sampling_edges' not in sage_snap


def test_link_prediction_gcn_emits_smoothing_diagnostics(mock_node_data):
    config = {'epochs': 2, 'hidden': 8, 'edge_split_ratio': 0.2, 'seed': 37}
    ws = MockWebSocket()

    snapshots = asyncio.run(run_link_prediction(config, mock_node_data, 'GCN', ws, mock_stop_flag))

    gcn_snap = snapshots[0]
    assert isinstance(gcn_snap['dirichlet_energy'], float)
    assert isinstance(gcn_snap['edge_similarity'], list)
    assert isinstance(gcn_snap['smoothness_separation'], float)
    assert gcn_snap['smoothness_status'] in {'oversmoothing_risk', 'separated', 'watch'}

def test_community_detection_contract(mock_node_data):
    config = {'epochs': 2, 'num_communities': 3}
    ws = MockWebSocket()
    
    snapshots = asyncio.run(run_community_detection(config, mock_node_data, 'GCN', ws, mock_stop_flag))
    
    assert len(snapshots) > 0
    validate_snapshot(4, snapshots[0])
    snap = snapshots[0]
    assert snap['empty_community_count'] >= 0
    assert 0 <= snap['bridge_ratio'] <= 1
    assert 0 <= snap['largest_community_ratio'] <= 1
    assert isinstance(snap['mean_silhouette'], float)
    assert isinstance(snap['mean_cluster_confidence'], float)
    assert snap['primary_metric_name'] == 'modularity_q'
    assert snap['primary_metric_value'] == pytest.approx(snap['modularity_q'])
    assert snap['quality_metric'] == 'modularity_q'
    assert snap['quality_score'] == pytest.approx(snap['modularity_q'])
    assert isinstance(snap['best_epoch'], int)
    assert isinstance(snap['best_quality_score'], float)
    assert isinstance(snap['is_best_epoch'], bool)
    assert 0 <= snap['stability_drop'] <= 1
    assert isinstance(snap['model_stability_status'], str)
    assert snap['epochs_target'] == 2
    assert snap['epochs_completed'] == 1
    assert snap['model_type'] == 'GCN'
    assert snap['num_communities'] == 3
    assert isinstance(snap['seed'], int)
    assert snap['training_phase'] == 'baseline'
    assert isinstance(snap['baseline_similarity'], float)
    assert isinstance(snap['visualization_confidence'], float)
    assert isinstance(snap['initial_visual_noise'], float)
    assert isinstance(snap['loss_components'], dict)
    assert isinstance(snap['normalized_loss'], float)
    assert isinstance(snap['val_reconstruction_loss'], float)
    assert isinstance(snap['val_reconstruction_auc'], float)
    assert isinstance(snap['generalization_gap'], float)
    assert isinstance(snap['community_balance'], float)
    assert isinstance(snap['collapse_risk'], bool)


@pytest.mark.parametrize("model_type", ["GCN", "GAT", "GraphSAGE"])
def test_community_detection_contract_for_all_models(mock_node_data, model_type):
    config = {'epochs': 2, 'num_communities': 3, 'hidden': 12, 'heads': 2, 'seed': 7}
    ws = MockWebSocket()

    snapshots = asyncio.run(run_community_detection(config, mock_node_data, model_type, ws, mock_stop_flag))

    assert len(snapshots) > 0
    validate_snapshot(4, snapshots[0])
    assert snapshots[0]['model_stability_status']
    assert snapshots[0]['model_type'] in {'GCN', 'GAT', 'SAGE'}
    assert snapshots[0]['training_phase'] == 'baseline'
    assert 'baseline_similarity' in snapshots[0]
    assert 'visualization_confidence' in snapshots[0]
    assert 'loss_components' in snapshots[0]
    assert 'val_reconstruction_auc' in snapshots[0]


def test_community_detection_gt_does_not_affect_training_loss_path(mock_node_data):
    config = {'epochs': 3, 'num_communities': 3, 'hidden': 12, 'seed': 41}
    gt = mock_node_data.y.cpu().tolist()
    shuffled_gt = list(reversed(gt))
    ws = MockWebSocket()

    snapshots_a = asyncio.run(run_community_detection(config, mock_node_data.clone(), 'GCN', ws, mock_stop_flag, community_gt=gt))
    snapshots_b = asyncio.run(run_community_detection(config, mock_node_data.clone(), 'GCN', ws, mock_stop_flag, community_gt=shuffled_gt))

    loss_a = [round(s['train_loss'], 6) for s in snapshots_a]
    loss_b = [round(s['train_loss'], 6) for s in snapshots_b]
    assert loss_a == loss_b
    assert [s['nmi_score'] for s in snapshots_a] != [s['nmi_score'] for s in snapshots_b]


def test_community_detection_model_specific_regularization_diagnostics(mock_node_data):
    config = {'epochs': 2, 'num_communities': 3, 'hidden': 12, 'heads': 2, 'seed': 43}
    ws = MockWebSocket()

    gcn = asyncio.run(run_community_detection(config, mock_node_data.clone(), 'GCN', ws, mock_stop_flag))[0]
    gat = asyncio.run(run_community_detection(config, mock_node_data.clone(), 'GAT', ws, mock_stop_flag))[0]
    sage = asyncio.run(run_community_detection(config, mock_node_data.clone(), 'GraphSAGE', ws, mock_stop_flag))[0]

    assert isinstance(gcn['oversmoothing_score'], float)
    assert gcn['smoothness_status'] in {'oversmoothing_risk', 'mixed', 'separated'}
    assert isinstance(gat['attention_entropy'], float)
    assert isinstance(gat['attention_focus_score'], float)
    assert isinstance(sage['sage_stability_score'], float)
    assert isinstance(sage['sage_migration_rate'], float)
    assert 'sampling_edges' not in sage


def test_community_detection_runs_strict_epochs_by_default(mock_node_data):
    config = {'epochs': '12', 'num_communities': 3, 'hidden': 12, 'seed': 11}
    ws = MockWebSocket()

    snapshots = asyncio.run(run_community_detection(config, mock_node_data, 'GCN', ws, mock_stop_flag))

    assert [snap['epoch'] for snap in snapshots] == list(range(12))
    assert snapshots[0]['training_phase'] == 'baseline'
    assert snapshots[1]['training_phase'] == 'forming'
    assert snapshots[-1]['epochs_target'] == 12
    assert snapshots[-1]['epochs_completed'] == 12
    assert snapshots[-1]['early_stopped'] is False
    assert snapshots[-1]['stop_reason'] is None


def test_community_detection_snapshot_stride_keeps_epoch_metadata(mock_node_data):
    config = {'epochs': 12, 'num_communities': 3, 'hidden': 12, 'seed': 13, 'task4_snapshot_stride': 3}
    ws = MockWebSocket()

    snapshots = asyncio.run(run_community_detection(config, mock_node_data, 'GCN', ws, mock_stop_flag))

    assert [snap['epoch'] for snap in snapshots] == [0, 3, 6, 9, 11]
    assert all(snap['epochs_target'] == 12 for snap in snapshots)
    assert snapshots[-1]['epochs_completed'] == 12


def test_community_detection_gat_attention_has_top_level_per_head_without_grad_warning(mock_node_data):
    config = {'epochs': 2, 'num_communities': 3, 'hidden': 8, 'heads': 2, 'seed': 17}
    ws = MockWebSocket()

    with warnings.catch_warnings(record=True) as recorded:
        warnings.simplefilter('always')
        snapshots = asyncio.run(run_community_detection(config, mock_node_data, 'GAT', ws, mock_stop_flag))

    warning_text = '\n'.join(str(item.message) for item in recorded)
    assert 'Converting a tensor with requires_grad=True to a scalar' not in warning_text
    gat_snap = snapshots[0]
    assert gat_snap['attention_edges']
    assert gat_snap['attention_per_head']
    first_edge = gat_snap['attention_edges'][0]
    key = f"{min(first_edge['source'], first_edge['target'])}-{max(first_edge['source'], first_edge['target'])}"
    assert key in gat_snap['attention_per_head']
    assert len(gat_snap['attention_per_head'][key]) == 2


def test_community_detection_gat_does_not_override_user_lr_dropout_heads(mock_node_data, monkeypatch):
    captured = {}
    original_model = community_detection_module.CommunityGNN
    original_adam = torch.optim.Adam

    def spy_model(*args, **kwargs):
        captured['dropout'] = kwargs.get('dropout')
        captured['heads'] = kwargs.get('heads')
        captured['hidden'] = kwargs.get('hidden')
        return original_model(*args, **kwargs)

    def spy_adam(params, *args, **kwargs):
        captured['lr'] = kwargs.get('lr', args[0] if args else None)
        return original_adam(params, *args, **kwargs)

    monkeypatch.setattr(community_detection_module, 'CommunityGNN', spy_model)
    monkeypatch.setattr(torch.optim, 'Adam', spy_adam)

    config = {'epochs': 1, 'num_communities': 3, 'hidden': '10', 'heads': '2', 'lr': '0.02', 'dropout': '0.15'}
    ws = MockWebSocket()

    asyncio.run(community_detection_module.run_community_detection(config, mock_node_data, 'GAT', ws, mock_stop_flag))

    assert captured['hidden'] == 10
    assert captured['heads'] == 2
    assert captured['dropout'] == pytest.approx(0.15)
    assert captured['lr'] == pytest.approx(0.02)


def test_community_label_alignment_preserves_overlap():
    prev = [0, 0, 0, 1, 1, 2]
    swapped = [2, 2, 2, 0, 0, 1]

    aligned = align_labels(prev, swapped, 3)

    assert aligned == prev


def test_community_detection_clamps_community_count(mock_node_data):
    assert resolve_num_communities({'num_communities': 999}, mock_node_data.num_nodes) == mock_node_data.num_nodes
    assert resolve_num_communities({'num_communities': 0}, mock_node_data.num_nodes) == 1
    assert resolve_num_communities({}, mock_node_data.num_nodes, community_gt=[0, 0, 2, 2]) == 2


def test_community_detection_accepts_graphsage_alias():
    model = CommunityGNN(in_channels=4, hidden=8, out_channels=4, model_type='GraphSAGE')

    assert model.model_type == 'SAGE'

def test_graph_embedding_contract(mock_node_data):
    config = {'epochs': 2, 'lr': 0.01, 'hidden': 16, 'model_type': 'GCN'}
    ws = MockWebSocket()
    
    # run_graph_embedding returns (snapshots, final_z)
    snapshots, _ = asyncio.run(run_graph_embedding(config, mock_node_data, 'GCN', ws, mock_stop_flag))
    
    assert len(snapshots) > 0
    validate_snapshot(5, snapshots[0])
    assert isinstance(snapshots[0]['per_node_knn_preservation'], dict)
    assert snapshots[0]['primary_metric_name'] == 'knn_preservation'
    assert snapshots[0]['primary_metric_value'] == pytest.approx(snapshots[0]['knn_preservation'])
    assert snapshots[0]['quality_metric'] == 'knn_preservation'
    assert snapshots[0]['quality_score'] == pytest.approx(snapshots[0]['knn_preservation'])

def test_graph_generation_contract(mock_node_data):
    config = {'epochs': 2, 'lr': 0.01, 'hidden': 16}
    ws = MockWebSocket()
    
    snapshots = asyncio.run(run_graph_generation(config, mock_node_data, ws, mock_stop_flag))
    
    assert len(snapshots) > 0
    validate_snapshot(6, snapshots[0])
    assert all('signature' in graph for graph in snapshots[0]['generated_graphs'])
