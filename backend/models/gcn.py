import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import GCNConv


class GCNModel(nn.Module):
    def __init__(self, in_channels, hidden_channels, out_channels, num_layers=3, dropout=0.5):
        super().__init__()
        self.num_layers = num_layers
        self.dropout = dropout

        self.convs = nn.ModuleList()
        self.norms = nn.ModuleList()

        # Input layer
        self.convs.append(GCNConv(in_channels, hidden_channels))
        self.norms.append(nn.LayerNorm(hidden_channels))

        # Hidden layers
        for _ in range(num_layers - 2):
            self.convs.append(GCNConv(hidden_channels, hidden_channels))
            self.norms.append(nn.LayerNorm(hidden_channels))

        # Output layer
        self.convs.append(GCNConv(hidden_channels, out_channels))

    def forward(self, x, edge_index):
        for i in range(self.num_layers - 1):
            x_res = x if i > 0 else 0  # Skip connection from second hidden layer
            x = self.convs[i](x, edge_index)
            x = self.norms[i](x)
            x = F.relu(x)
            x = x + x_res  # Residual connection to prevent oversmoothing
            x = F.dropout(x, p=self.dropout, training=self.training)
            
        embedding = x.detach()  # Capture before final layer
        x = self.convs[-1](x, edge_index)
        return x, embedding
