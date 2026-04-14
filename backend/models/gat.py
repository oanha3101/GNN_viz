import torch
import torch.nn.functional as F
from torch_geometric.nn import GATConv


class GATModel(torch.nn.Module):
    def __init__(self, in_channels, hidden_channels, out_channels, heads=4, dropout=0.6):
        super().__init__()
        self.conv1 = GATConv(
            in_channels, hidden_channels, heads=heads,
            dropout=dropout, add_self_loops=True
        )
        self.conv2 = GATConv(
            hidden_channels * heads, out_channels, heads=1,
            concat=False, dropout=dropout
        )
        self.dropout = dropout

    def forward(self, x, edge_index):
        x, (edge_index_att, alpha) = self.conv1(
            x, edge_index, return_attention_weights=True
        )
        x = F.elu(x)
        x = F.dropout(x, p=self.dropout, training=self.training)
        embedding = x.detach()

        # Average attention over heads
        attention_weights = alpha.mean(dim=1).detach()

        x = self.conv2(x, edge_index)
        return x, embedding, attention_weights
