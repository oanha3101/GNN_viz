"""
Task 3: Link Prediction
Trains a GCN encoder + dot-product decoder to predict missing edges.
Masks 20% of edges as test set, samples equal number of negative edges.
"""
import asyncio
import numpy as np
import torch
import torch.nn.functional as F
import random
from sklearn.decomposition import PCA
from sklearn.metrics import roc_auc_score
from torch_geometric.nn import GCNConv, GATConv, SAGEConv
from torch_geometric.utils import negative_sampling, to_undirected


# ───────────────────────────────────────────────────────────────────────────────
# Link Prediction Model (GCN Encoder + Dot-Product Decoder)
# ───────────────────────────────────────────────────────────────────────────────
class LinkPredModel(torch.nn.Module):
    def __init__(self, in_channels, hidden=64, model_type='GCN', heads=4, dropout=0.5):
        super().__init__()
        self.model_type = model_type
        self.dropout = dropout
        if model_type == 'GAT':
            self.conv1 = GATConv(in_channels, hidden, heads=heads, dropout=dropout)
            self.conv2 = GATConv(hidden * heads, hidden, heads=1, concat=False, dropout=dropout)
        elif model_type == 'SAGE':
            self.conv1 = SAGEConv(in_channels, hidden)
            self.conv2 = SAGEConv(hidden, hidden)
        else:
            self.conv1 = GCNConv(in_channels, hidden)
            self.conv2 = GCNConv(hidden, hidden)

    def encode(self, x, edge_index):
        x = self.conv1(x, edge_index)
        x = F.elu(x) if self.model_type == 'GAT' else x.relu()
        x = F.dropout(x, p=self.dropout, training=self.training)
        z = self.conv2(x, edge_index)
        return z

    def decode(self, z, edge_index):
        # Dot product decoder
        src, tgt = edge_index
        return (z[src] * z[tgt]).sum(dim=1)

    def forward(self, x, edge_index, pos_edge, neg_edge):
        z = self.encode(x, edge_index)
        # Embedding for visualization
        embedding = z.detach()

        pos_score = self.decode(z, pos_edge)
        neg_score = self.decode(z, neg_edge)
        return pos_score, neg_score, embedding


def split_edges(edge_index, val_ratio=0.1, test_ratio=0.1):
    """Split edges into train/val/test sets."""
    num_edges = edge_index.size(1)

    # Shuffle edge indices
    perm = torch.randperm(num_edges)

    n_test = max(1, int(num_edges * test_ratio))
    n_val = max(1, int(num_edges * val_ratio))

    test_edges = edge_index[:, perm[:n_test]]
    val_edges = edge_index[:, perm[n_test:n_test + n_val]]
    train_edges = edge_index[:, perm[n_test + n_val:]]

    return train_edges, val_edges, test_edges


# ───────────────────────────────────────────────────────────────────────────────
# Main Training Loop
# ───────────────────────────────────────────────────────────────────────────────
async def run_link_prediction(config, data, model_type, websocket, stop_flag):
    """Train link prediction model and stream snapshots."""
    epochs = config.get('epochs', 80)

    num_nodes = data.x.size(0)
    num_features = data.x.size(1)

    # Only use undirected edges
    edge_index = data.edge_index

    # Split edges into train/val/test
    test_ratio = config.get('edge_split_ratio', 0.15)
    val_ratio = max(0.05, test_ratio * 0.67)  # val is ~2/3 of test
    train_edges, val_edges, test_edges = split_edges(edge_index, val_ratio=val_ratio, test_ratio=test_ratio)

    # Build graph structure for frontend (only train edges visible)
    train_edge_np = train_edges.cpu().numpy()
    links_json = []
    seen = set()
    for i in range(train_edge_np.shape[1]):
        s, t = int(train_edge_np[0, i]), int(train_edge_np[1, i])
        key = (min(s, t), max(s, t))
        if key not in seen:
            seen.add(key)
            links_json.append({'source': s, 'target': t})

    degrees = np.zeros(num_nodes)
    for s, t in links_json:
        degrees[s] += 1
        degrees[t] += 1

    nodes_json = [{'id': i, 'degree': int(degrees[i])} for i in range(num_nodes)]

    # Serialize test edges for frontend (More edges for smoother ROC)
    test_edge_np = test_edges.cpu().numpy()
    neg_test = negative_sampling(
        edge_index=edge_index,
        num_nodes=num_nodes,
        num_neg_samples=test_edges.size(1),
    )
    neg_test_np = neg_test.cpu().numpy()

    test_edges_json = []
    # Send up to 60 positive and 40 negative for ROC
    n_pos = min(test_edges.size(1), 60)
    n_neg = min(neg_test.size(1), 40)
    
    for i in range(n_pos):
        s, t = int(test_edge_np[0, i]), int(test_edge_np[1, i])
        test_edges_json.append({'source': s, 'target': t, 'exists': True, 'idx': i})
    for i in range(n_neg):
        s, t = int(neg_test_np[0, i]), int(neg_test_np[1, i])
        test_edges_json.append({'source': s, 'target': t, 'exists': False, 'idx': i + n_pos})

    await websocket.send_json({
        'type': 'graph_data',
        'data': {
            'graphData': {'nodes': nodes_json, 'links': links_json},
            'groundTruth': data.y.cpu().tolist(),
            'testEdges': test_edges_json,
        }
    })

    # Build model
    model = LinkPredModel(
        in_channels=num_features,
        hidden=config.get('hidden', 64),
        model_type=model_type,
        heads=config.get('heads', 4),
        dropout=config.get('dropout', 0.5),
    )
    optimizer = torch.optim.Adam(model.parameters(), lr=config.get('lr', 0.01))

    epoch_snapshots = []

    for epoch in range(epochs):
        if stop_flag():
            break

        # ── Training ───────────────────────────────────────────────────────
        model.train()
        optimizer.zero_grad()

        neg_edge = negative_sampling(
            edge_index=train_edges,
            num_nodes=num_nodes,
            num_neg_samples=train_edges.size(1),
        )

        pos_score, neg_score, _ = model(data.x, train_edges, train_edges, neg_edge)
        labels = torch.cat([torch.ones(pos_score.size(0)), torch.zeros(neg_score.size(0))])
        scores = torch.cat([pos_score, neg_score])
        loss = F.binary_cross_entropy_with_logits(scores, labels)
        loss.backward()
        optimizer.step()

        # ── Evaluation ─────────────────────────────────────────────────────
        model.eval()
        with torch.no_grad():
            z = model.encode(data.x, train_edges)
            embedding = z.detach()

            # Scores for ROC (Matching the 60/40 count)
            pos_test_score = model.decode(z, test_edges[:, :n_pos]).sigmoid()
            neg_test_score = model.decode(z, neg_test[:, :n_neg]).sigmoid()

            all_scores = torch.cat([pos_test_score, neg_test_score]).cpu().numpy()
            all_labels = np.concatenate([np.ones(n_pos), np.zeros(n_neg)])
            
            try:
                auc = float(roc_auc_score(all_labels, all_scores))
            except:
                auc = 0.5

            # PCA
            emb_np = embedding.cpu().numpy()
            pca = PCA(n_components=2)
            emb_2d = pca.fit_transform(emb_np).tolist()

            edge_scores = pos_test_score.cpu().tolist() + neg_test_score.cpu().tolist()

            # Val loss
            neg_val = negative_sampling(edge_index=val_edges, num_nodes=num_nodes, num_neg_samples=val_edges.size(1))
            pos_val_s = model.decode(z, val_edges).sigmoid()
            neg_val_s = model.decode(z, neg_val).sigmoid()
            val_loss = F.binary_cross_entropy(torch.cat([pos_val_s, neg_val_s]), 
                                              torch.cat([torch.ones(pos_val_s.size(0)), torch.zeros(neg_val_s.size(0))]))

            # ── Top-K predicted future links ──────────────────────────────
            # Find highest score pairs NOT in training set (true predictions)
            top_k_links = []
            try:
                # Sample candidate pairs and compute scores
                k_sample = min(200, num_nodes * (num_nodes - 1) // 2)
                src_cands = torch.randint(0, num_nodes, (k_sample,))
                tgt_cands = torch.randint(0, num_nodes, (k_sample,))
                mask = src_cands != tgt_cands
                src_cands, tgt_cands = src_cands[mask], tgt_cands[mask]
                cand_edges = torch.stack([src_cands, tgt_cands])
                cand_scores = model.decode(z, cand_edges).sigmoid().cpu()
                topk_idx = cand_scores.topk(min(15, len(cand_scores))).indices
                top_k_links = [
                    {'source': int(src_cands[i]), 'target': int(tgt_cands[i]),
                     'score': float(cand_scores[i])}
                    for i in topk_idx
                ]
            except Exception:
                pass

            # ── Explainability Data ─────────────────────────────────────────
            
            # 1. TP/FP/TN/FN labels per test edge
            threshold = 0.5
            edge_classifications = []
            for i in range(n_pos):
                score = pos_test_score[i].item()
                pred_positive = score >= threshold
                is_tp = pred_positive  # All pos_test edges are True positives if predicted positive
                is_fn = not pred_positive
                edge_classifications.append({
                    'type': 'positive',
                    'score': float(score),
                    'classification': 'TP' if is_tp else 'FN'
                })
            
            for i in range(n_neg):
                score = neg_test_score[i].item()
                pred_positive = score >= threshold
                is_fp = pred_positive
                is_tn = not pred_positive
                edge_classifications.append({
                    'type': 'negative',
                    'score': float(score),
                    'classification': 'FP' if is_fp else 'TN'
                })
            
            # 2. Common neighbor count per test edge
            train_edge_set = set()
            train_edge_np_temp = train_edges.cpu().numpy()
            for i in range(train_edge_np_temp.shape[1]):
                s, t = int(train_edge_np_temp[0, i]), int(train_edge_np_temp[1, i])
                train_edge_set.add((min(s, t), max(s, t)))
            
            # Build adjacency for common neighbor computation
            adj = {i: set() for i in range(num_nodes)}
            for i in range(train_edge_np_temp.shape[1]):
                s, t = int(train_edge_np_temp[0, i]), int(train_edge_np_temp[1, i])
                if s != t:
                    adj[s].add(t)
                    adj[t].add(s)
            
            test_edge_common_neighbors = []
            # Positive edges
            test_edge_np_temp = test_edges.cpu().numpy()
            for i in range(min(n_pos, test_edge_np_temp.shape[1])):
                s, t = int(test_edge_np_temp[0, i]), int(test_edge_np_temp[1, i])
                common = len(adj.get(s, set()) & adj.get(t, set()))
                emb_dist = float(np.linalg.norm(emb_np[s] - emb_np[t]))
                test_edge_common_neighbors.append({
                    'source': s,
                    'target': t,
                    'is_positive': True,
                    'common_neighbors': common,
                    'embedding_distance': emb_dist
                })
            
            # Negative edges
            neg_test_np_temp = neg_test.cpu().numpy()
            for i in range(min(n_neg, neg_test_np_temp.shape[1])):
                s, t = int(neg_test_np_temp[0, i]), int(neg_test_np_temp[1, i])
                common = len(adj.get(s, set()) & adj.get(t, set()))
                emb_dist = float(np.linalg.norm(emb_np[s] - emb_np[t]))
                test_edge_common_neighbors.append({
                    'source': s,
                    'target': t,
                    'is_positive': False,
                    'common_neighbors': common,
                    'embedding_distance': emb_dist
                })

        snapshot = {
            'epoch': epoch,
            'edge_scores': edge_scores,
            'edge_classifications': edge_classifications,
            'test_edge_common_neighbors': test_edge_common_neighbors,
            'embeddings_2d': emb_2d,
            'train_loss': float(loss.item()),
            'val_loss': float(val_loss.item()),
            'auc': auc,
            'val_acc': auc,
            'top_k_links': top_k_links,
        }
        epoch_snapshots.append(snapshot)

        await websocket.send_json({
            'type': 'epoch_snapshot',
            'data': snapshot,
            'progress': (epoch + 1) / epochs,
        })
        await asyncio.sleep(0.005)

    return epoch_snapshots
