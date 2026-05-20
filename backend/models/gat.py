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



    def forward(self, x, edge_index):
        # We'll capture attention weights from the first layer for visualization
        attention_weights = None
        self._attention_edges = None
        self._per_head_attn = None

        for i in range(self.num_layers - 1):
            x_res = x if i > 0 else 0

            if i == 0:
                # Capture attention from first layer
                x, (edge_index_att, alpha) = self.convs[i](x, edge_index, return_attention_weights=True)
                # alpha shape: [num_att_edges, num_heads]
                # Aggregate across heads for backward compat
                attention_weights = alpha.mean(dim=1).detach()

                # Build attention_edges: filter self-loops, aggregate undirected
                ei = edge_index_att.detach()
                attn_mean = alpha.mean(dim=1).detach()
                mask = ei[0] != ei[1]  # remove self-loops
                ei_filtered = ei[:, mask]
                attn_filtered = attn_mean[mask]

                # Aggregate (u,v) and (v,u) into undirected
                # Also build per-head attention in the same pass
                attn_map = {}
                per_head_map = {}
                num_heads = alpha.shape[1]
                alpha_filtered = alpha[mask].detach()  # [num_filtered_edges, num_heads]
                for idx in range(ei_filtered.shape[1]):
                    u, v = int(ei_filtered[0, idx]), int(ei_filtered[1, idx])
                    key = (min(u, v), max(u, v))
                    if key not in attn_map:
                        attn_map[key] = []
                        per_head_map[key] = [[] for _ in range(num_heads)]
                    attn_map[key].append(float(attn_filtered[idx]))
                    for h in range(num_heads):
                        per_head_map[key][h].append(float(alpha_filtered[idx, h]))
                self._attention_edges = [(u, v, sum(ws) / len(ws)) for (u, v), ws in attn_map.items()]
                self._per_head_attn = {
                    (u, v): [sum(h) / len(h) if h else 0.0 for h in heads]
                    for (u, v), heads in per_head_map.items()
                }
            else:
                x = self.convs[i](x, edge_index)

            x = self.norms[i](x)
            x = F.elu(x)
            x = x + x_res
            x = F.dropout(x, p=self.dropout, training=self.training)

        embedding = x
        x = self.convs[-1](x, edge_index)

        return x, embedding, attention_weights
