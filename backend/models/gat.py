import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import GATConv


class GATModel(nn.Module):
    def __init__(self, in_channels, hidden_channels, out_channels, heads=4, num_layers=3, dropout=0.6):
        super().__init__()
        self.num_layers = num_layers
        self.dropout = dropout

        self.convs = nn.ModuleList()
        self.norms = nn.ModuleList()

        # Input layer
        self.convs.append(GATConv(in_channels, hidden_channels, heads=heads, dropout=dropout))
        self.norms.append(nn.LayerNorm(hidden_channels * heads))

        # Hidden layers
        for _ in range(num_layers - 2):
            self.convs.append(GATConv(hidden_channels * heads, hidden_channels, heads=heads, dropout=dropout))
            self.norms.append(nn.LayerNorm(hidden_channels * heads))

        # Output layer
        self.convs.append(GATConv(hidden_channels * heads, out_channels, heads=1, concat=False, dropout=dropout))

        # Projection to match GCN/GraphSAGE embedding dimension (hidden_channels)
        self.embedding_proj = nn.Linear(hidden_channels * heads, hidden_channels)

    def forward(self, x, edge_index):
        # We'll capture attention weights from the first layer for visualization
        attention_weights = None

        for i in range(self.num_layers - 1):
            x_res = x if i > 0 else 0

            if i == 0:
                # Capture attention from first layer
                x, (edge_index_att, alpha) = self.convs[i](x, edge_index, return_attention_weights=True)
                attention_weights = alpha.mean(dim=1).detach()
            else:
                x = self.convs[i](x, edge_index)

            x = self.norms[i](x)
            x = F.elu(x)
            x = x + x_res
            x = F.dropout(x, p=self.dropout, training=self.training)

        embedding = self.embedding_proj(x).detach()  # (N, hidden_channels) — consistent with GCN/SAGE
        x = self.convs[-1](x, edge_index)

        return x, embedding, attention_weights
