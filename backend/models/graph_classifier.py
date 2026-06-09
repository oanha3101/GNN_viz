import torch
import torch.nn as nn
from torch_geometric.nn import global_add_pool

class UniversalGraphClassifier(nn.Module):
    """
    A generic wrapper for Graph Classification tasks.
    It takes any backbone GNN and adds attention-based pooling and a linear head.
    """
    def __init__(self, backbone, hidden_dim, num_classes):
        super().__init__()
        self.backbone = backbone
        
        # Attention gate for readout
        # Note: hidden_dim must match the output embedding dimension of the backbone
        self.att_gate = nn.Linear(hidden_dim, 1)
        self.lin = nn.Linear(hidden_dim, num_classes)

    def forward(self, x, edge_index, batch):
        # Backbone GNN — GCN/SAGE return (logits, embedding), GAT returns (logits, embedding, attention)
        result = self.backbone(x, edge_index)
        if isinstance(result, tuple) and len(result) >= 2:
            embedding = result[1]
        else:
            embedding = result
        
        # Compute attention weights alpha
        alpha = torch.sigmoid(self.att_gate(embedding)) # Weight per node [num_nodes, 1]
        
        # Apply attention to nodes and pool
        x_g = alpha * embedding
        graph_embeddings = global_add_pool(x_g, batch)
        
        out = self.lin(graph_embeddings)
        return out, graph_embeddings, {"attention_weights": alpha.squeeze()}
