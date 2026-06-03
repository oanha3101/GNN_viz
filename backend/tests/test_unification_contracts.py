import pytest
import asyncio
import torch
from torch_geometric.data import Data
from schemas.ws import validate_snapshot, SNAPSHOT_MODELS
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


@pytest.mark.parametrize("model_type", ["GCN", "GAT", "GraphSAGE"])
def test_community_detection_contract_for_all_models(mock_node_data, model_type):
    config = {'epochs': 2, 'num_communities': 3, 'hidden': 12, 'heads': 2, 'seed': 7}
    ws = MockWebSocket()

    snapshots = asyncio.run(run_community_detection(config, mock_node_data, model_type, ws, mock_stop_flag))

    assert len(snapshots) > 0
    validate_snapshot(4, snapshots[0])
    assert snapshots[0]['model_stability_status']


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
