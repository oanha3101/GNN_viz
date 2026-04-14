import torch
import torch.nn.functional as F
from torch_geometric.nn import GCNConv


class GCNModel(torch.nn.Module):
    def __init__(self, in_channels, hidden_channels, out_channels, dropout=0.5):
        super().__init__()
        self.conv1 = GCNConv(in_channels, hidden_channels)
        self.conv2 = GCNConv(hidden_channels, out_channels)
        self.dropout = dropout

    def forward(self, x, edge_index):
        x = self.conv1(x, edge_index).relu()
        x = F.dropout(x, p=self.dropout, training=self.training)
        embedding = x.detach()  # Capture for visualization
        x = self.conv2(x, edge_index)
        return x, embedding
