import torch
import pytest
from models.gcn import GCNModel
from models.gat import GATModel
from models.graphsage import GraphSAGEModel

def test_gcn_deep_architecture():
    in_channels = 16
    hidden_channels = 32
    out_channels = 7
    num_layers = 4
    
    model = GCNModel(in_channels, hidden_channels, out_channels, num_layers=num_layers)
    
    # Kiểm tra số lượng conv layers (num_layers - 1 lớp ẩn + 1 lớp cuối)
    assert len(model.convs) == num_layers
    assert len(model.norms) == num_layers - 1
    
    # Kiểm tra forward pass
    x = torch.randn(10, in_channels)
    edge_index = torch.tensor([[0, 1, 1, 2], [1, 0, 2, 1]], dtype=torch.long)
    
    logits, embedding = model(x, edge_index)
    
    assert logits.shape == (10, out_channels)
    assert embedding.shape == (10, hidden_channels)

def test_gat_deep_architecture():
    in_channels = 16
    hidden_channels = 32
    out_channels = 7
    heads = 4
    num_layers = 3
    
    model = GATModel(in_channels, hidden_channels, out_channels, heads=heads, num_layers=num_layers)
    
    assert len(model.convs) == num_layers
    
    x = torch.randn(10, in_channels)
    edge_index = torch.tensor([[0, 1, 1, 2], [1, 0, 2, 1]], dtype=torch.long)
    
    logits, embedding, att = model(x, edge_index)
    
    assert logits.shape == (10, out_channels)
    assert embedding.shape == (10, hidden_channels * heads) # GAT concat heads in hidden layers
    assert att is not None

def test_graphsage_deep_architecture():
    in_channels = 16
    hidden_channels = 32
    out_channels = 7
    num_layers = 5
    
    model = GraphSAGEModel(in_channels, hidden_channels, out_channels, num_layers=num_layers)
    
    assert len(model.convs) == num_layers
    
    x = torch.randn(10, in_channels)
    edge_index = torch.tensor([[0, 1, 1, 2], [1, 0, 2, 1]], dtype=torch.long)
    
    logits, embedding = model(x, edge_index)
    
    assert logits.shape == (10, out_channels)
    assert embedding.shape == (10, hidden_channels)

def test_residual_connection_logic():
    # Kiểm tra xem Residual connection có gây lỗi dimension mismatch không
    # (Trường hợp hidden_dim != in_dim, lớp đầu tiên không có residual)
    in_channels = 16
    hidden_channels = 32
    model = GCNModel(in_channels, hidden_channels, out_channels=7, num_layers=3)
    
    x = torch.randn(5, in_channels)
    edge_index = torch.tensor([[0, 1], [1, 0]], dtype=torch.long)
    
    # Không crash là pass
    logits, emb = model(x, edge_index)
    assert True
