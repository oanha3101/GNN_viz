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
from sklearn.neighbors import NearestNeighbors
from torch_geometric.nn import GCNConv, GATConv, SAGEConv
from torch_geometric.utils import negative_sampling, to_undirected
from utils.ws_msg import send_json_zipped


# ───────────────────────────────────────────────────────────────────────────────
# Link Prediction Model (GCN Encoder + Dot-Product Decoder)
# ───────────────────────────────────────────────────────────────────────────────
class LinkPredModel(torch.nn.Module):
    def __init__(self, in_channels, hidden=64, model_type='GCN', heads=4, dropout=0.5):
        super().__init__()
        self.model_type = normalize_model_type(model_type)
        self.dropout = dropout
        if self.model_type == 'GAT':
            self.conv1 = GATConv(in_channels, hidden, heads=heads, dropout=dropout)
            self.conv2 = GATConv(hidden * heads, hidden, heads=1, concat=False, dropout=dropout)
        elif self.model_type == 'SAGE':
            self.conv1 = SAGEConv(in_channels, hidden)
            self.conv2 = SAGEConv(hidden, hidden)
        else:
            self.conv1 = GCNConv(in_channels, hidden)
            self.conv2 = GCNConv(hidden, hidden)

    def encode(self, x, edge_index):
        self._attention_edges = None
        self._attention_per_head = None
        if self.model_type == 'GAT':
            x, (edge_index_att, alpha) = self.conv1(x, edge_index, return_attention_weights=True)
            # Filter self-loops, aggregate undirected
            ei = edge_index_att.detach()
            mask = ei[0] != ei[1]
            ei_f = ei[:, mask]
            alpha_f = alpha[mask].detach()
            attn_mean = alpha_f.mean(dim=1).detach()
            attn_map = {}
            per_head_map = {}
            num_heads = alpha.shape[1]
            for idx in range(ei_f.shape[1]):
                u, v = int(ei_f[0, idx]), int(ei_f[1, idx])
                key = (min(u, v), max(u, v))
                attn_map.setdefault(key, []).append(float(attn_mean[idx]))
                per_head_map.setdefault(key, [[] for _ in range(num_heads)])
                for h in range(num_heads):
                    per_head_map[key][h].append(float(alpha_f[idx, h]))
            self._attention_per_head = {
                f'{u}-{v}': [
                    float(sum(per_head_map[(u, v)][h]) / len(per_head_map[(u, v)][h]))
                    for h in range(num_heads)
                ]
                for (u, v) in attn_map
            }
            self._attention_edges = [
                {
                    'source': u,
                    'target': v,
                    'weight': sum(ws) / len(ws),
                    'attention_per_head': self._attention_per_head[f'{u}-{v}'],
                }
                for (u, v), ws in attn_map.items()
            ]
            x = F.elu(x)
        elif self.model_type == 'SAGE':
            x = F.relu(self.conv1(x, edge_index))
        else:
            x = self.conv1(x, edge_index).relu()
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


def normalize_model_type(model_type):
    key = str(model_type or 'GCN').upper().replace('-', '_')
    if key in {'SAGE', 'GRAPHSAGE', 'GRAPH_SAGE'}:
        return 'SAGE'
    if key == 'GAT':
        return 'GAT'
    return 'GCN'


def set_task3_seed(seed):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def _safe_float(config, key, default):
    try:
        return float(config.get(key, default))
    except (TypeError, ValueError):
        return float(default)


def _safe_int(config, key, default):
    try:
        return int(config.get(key, default))
    except (TypeError, ValueError):
        return int(default)


def _count_neighbor_links(neighbors, adjacency):
    arr = list(neighbors)
    links = 0
    for i in range(len(arr)):
        for j in range(i + 1, len(arr)):
            if arr[j] in adjacency.get(arr[i], set()):
                links += 1
    return links


def _shortest_path_with_limit(adjacency, source, target, max_depth=4):
    if source == target:
        return 0
    visited = {source}
    queue = [(source, 0)]
    while queue:
        node, depth = queue.pop(0)
        if depth >= max_depth:
            continue
        for neighbor in adjacency.get(node, set()):
            if neighbor == target:
                return depth + 1
            if neighbor in visited:
                continue
            visited.add(neighbor)
            queue.append((neighbor, depth + 1))
    return None


def split_edges(edge_index, val_ratio=0.1, test_ratio=0.1, seed=None):
    """Split edges into train/val/test sets."""
    num_edges = edge_index.size(1)
    if num_edges <= 1:
        empty = edge_index[:, :0]
        return edge_index, empty, empty

    # Shuffle edge indices
    generator = torch.Generator(device=edge_index.device)
    if seed is not None:
        generator.manual_seed(int(seed))
    perm = torch.randperm(num_edges, generator=generator, device=edge_index.device)

    n_test = min(max(1, int(num_edges * test_ratio)), num_edges - 1)
    remaining = num_edges - n_test
    n_val = min(max(1, int(num_edges * val_ratio)), max(0, remaining - 1)) if remaining > 1 else 0

    test_edges = edge_index[:, perm[:n_test]]
    val_edges = edge_index[:, perm[n_test:n_test + n_val]]
    train_edges = edge_index[:, perm[n_test + n_val:]]

    return train_edges, val_edges, test_edges


# ───────────────────────────────────────────────────────────────────────────────
# Main Training Loop
# ───────────────────────────────────────────────────────────────────────────────
async def run_link_prediction(config, data, model_type, websocket, stop_flag, snapshot_hook=None):
    """Train link prediction model and stream snapshots."""
    epochs = max(1, _safe_int(config, 'epochs', 80))
    model_type = normalize_model_type(model_type)
    seed = _safe_int(config, 'seed', 42)
    set_task3_seed(seed)

    num_nodes = data.x.size(0)
    num_features = data.x.size(1)

    # Only use undirected edges
    edge_index = data.edge_index

    # Split edges into train/val/test
    test_ratio = max(0.01, min(0.8, _safe_float(config, 'edge_split_ratio', 0.15)))
    val_ratio = max(0.05, test_ratio * 0.67)  # val is ~2/3 of test
    train_edges, val_edges, test_edges = split_edges(edge_index, val_ratio=val_ratio, test_ratio=test_ratio, seed=seed)

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
    for edge in links_json:
        s, t = edge['source'], edge['target']
        degrees[s] += 1
        degrees[t] += 1

    nodes_json = [{'id': i, 'degree': int(degrees[i])} for i in range(num_nodes)]

    # Serialize test edges for frontend (More edges for smoother ROC)
    test_edge_np = test_edges.cpu().numpy()
    neg_test = negative_sampling(
        edge_index=edge_index,
        num_nodes=num_nodes,
        num_neg_samples=max(1, test_edges.size(1)),
    ) if num_nodes > 1 else edge_index[:, :0]
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

    await send_json_zipped(websocket, {
        'type': 'graph_data',
        'data': {
            'graphData': {'nodes': nodes_json, 'links': links_json},
            'groundTruth': data.y.cpu().tolist(),
            'testEdges': test_edges_json,
        }
    })

    # Build adjacency sets for kNN preservation calculation
    adj_sets = [set() for _ in range(num_nodes)]
    for i in range(train_edge_np.shape[1]):
        s, t = int(train_edge_np[0, i]), int(train_edge_np[1, i])
        adj_sets[s].add(t)
        adj_sets[t].add(s)

    # Sample indices for kNN preservation (for performance)
    k_knn = max(1, _safe_int(config, 'k_knn', 10))
    sample_size = min(500, num_nodes)
    sample_indices = np.random.choice(num_nodes, sample_size, replace=False)

    # Build model
    model = LinkPredModel(
        in_channels=num_features,
        hidden=_safe_int(config, 'hidden', 64),
        model_type=model_type,
        heads=_safe_int(config, 'heads', 4),
        dropout=_safe_float(config, 'dropout', 0.5),
    )
    optimizer = torch.optim.Adam(model.parameters(), lr=_safe_float(config, 'lr', 0.01))

    epoch_snapshots = []
    prev_edge_scores = None
    best_auc = float('-inf')
    best_epoch = None

    for epoch in range(epochs):
        if stop_flag():
            break

        # ── Training ───────────────────────────────────────────────────────
        model.train()
        optimizer.zero_grad()

        neg_edge = negative_sampling(
            edge_index=train_edges,
            num_nodes=num_nodes,
            num_neg_samples=max(1, train_edges.size(1)),
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
            except Exception:
                auc = 0.5

            # PCA
            emb_np = embedding.cpu().numpy()
            pca = PCA(n_components=2)
            emb_2d = pca.fit_transform(emb_np).tolist()

            edge_scores = pos_test_score.cpu().tolist() + neg_test_score.cpu().tolist()

            # Val loss
            val_source_edges = val_edges if val_edges.size(1) > 0 else train_edges[:, :min(1, train_edges.size(1))]
            neg_val = negative_sampling(edge_index=val_source_edges, num_nodes=num_nodes, num_neg_samples=max(1, val_source_edges.size(1)))
            pos_val_s = model.decode(z, val_source_edges).sigmoid()
            neg_val_s = model.decode(z, neg_val).sigmoid()
            val_loss = F.binary_cross_entropy(torch.cat([pos_val_s, neg_val_s]), 
                                              torch.cat([torch.ones(pos_val_s.size(0)), torch.zeros(neg_val_s.size(0))]))

        stride = config.get('task3_snapshot_stride')
        if stride is not None:
            stride_val = max(1, int(stride))
            should_snap = (epoch % stride_val == 0) or (epoch == epochs - 1) or (epoch == 0)
        else:
            should_snap = True

        if should_snap:
            # PCA
            emb_np = embedding.cpu().numpy()
            pca = PCA(n_components=2)
            emb_2d = pca.fit_transform(emb_np).tolist()

            edge_scores = pos_test_score.cpu().tolist() + neg_test_score.cpu().tolist()
            edge_score_delta = (
                [float(score - prev_edge_scores[i]) for i, score in enumerate(edge_scores)]
                if prev_edge_scores is not None and len(prev_edge_scores) == len(edge_scores)
                else [0.0 for _ in edge_scores]
            )
            if auc >= best_auc:
                best_auc = auc
                best_epoch = epoch

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
            edge_structure_features = []
            # Positive edges
            test_edge_np_temp = test_edges.cpu().numpy()
            for i in range(min(n_pos, test_edge_np_temp.shape[1])):
                s, t = int(test_edge_np_temp[0, i]), int(test_edge_np_temp[1, i])
                source_neighbors = adj.get(s, set())
                target_neighbors = adj.get(t, set())
                common_set = source_neighbors & target_neighbors
                common = len(common_set)
                union = len(source_neighbors | target_neighbors) or 1
                degree_s = len(source_neighbors)
                degree_t = len(target_neighbors)
                shortest_path = _shortest_path_with_limit(adj, s, t, max_depth=4)
                emb_dist = float(np.linalg.norm(emb_np[s] - emb_np[t]))
                emb_sim = float(1.0 / (1.0 + emb_dist))
                structural_equivalence = float(common / max(1.0, np.sqrt(max(1, degree_s) * max(1, degree_t))))
                clustering_s = (
                    float((2 * _count_neighbor_links(source_neighbors, adj)) / (degree_s * (degree_s - 1)))
                    if degree_s > 1 else 0.0
                )
                clustering_t = (
                    float((2 * _count_neighbor_links(target_neighbors, adj)) / (degree_t * (degree_t - 1)))
                    if degree_t > 1 else 0.0
                )
                test_edge_common_neighbors.append({
                    'source': s,
                    'target': t,
                    'is_positive': True,
                    'common_neighbors': common,
                    'embedding_distance': emb_dist
                })
                edge_structure_features.append({
                    'idx': i,
                    'source': s,
                    'target': t,
                    'is_positive': True,
                    'degree_source': degree_s,
                    'degree_target': degree_t,
                    'common_neighbors': common,
                    'shortest_path': shortest_path,
                    'neighbor_jaccard': float(common / union),
                    'embedding_distance': emb_dist,
                    'embedding_similarity': emb_sim,
                    'structural_equivalence': structural_equivalence,
                    'local_clustering_source': clustering_s,
                    'local_clustering_target': clustering_t,
                    'same_ground_truth_label': bool(int(data.y[s]) == int(data.y[t])) if getattr(data, 'y', None) is not None else None,
                })
            
            # Negative edges
            neg_test_np_temp = neg_test.cpu().numpy()
            for i in range(min(n_neg, neg_test_np_temp.shape[1])):
                s, t = int(neg_test_np_temp[0, i]), int(neg_test_np_temp[1, i])
                source_neighbors = adj.get(s, set())
                target_neighbors = adj.get(t, set())
                common_set = source_neighbors & target_neighbors
                common = len(common_set)
                union = len(source_neighbors | target_neighbors) or 1
                degree_s = len(source_neighbors)
                degree_t = len(target_neighbors)
                shortest_path = _shortest_path_with_limit(adj, s, t, max_depth=4)
                emb_dist = float(np.linalg.norm(emb_np[s] - emb_np[t]))
                emb_sim = float(1.0 / (1.0 + emb_dist))
                structural_equivalence = float(common / max(1.0, np.sqrt(max(1, degree_s) * max(1, degree_t))))
                clustering_s = (
                    float((2 * _count_neighbor_links(source_neighbors, adj)) / (degree_s * (degree_s - 1)))
                    if degree_s > 1 else 0.0
                )
                clustering_t = (
                    float((2 * _count_neighbor_links(target_neighbors, adj)) / (degree_t * (degree_t - 1)))
                    if degree_t > 1 else 0.0
                )
                test_edge_common_neighbors.append({
                    'source': s,
                    'target': t,
                    'is_positive': False,
                    'common_neighbors': common,
                    'embedding_distance': emb_dist
                })
                edge_structure_features.append({
                    'idx': i + n_pos,
                    'source': s,
                    'target': t,
                    'is_positive': False,
                    'degree_source': degree_s,
                    'degree_target': degree_t,
                    'common_neighbors': common,
                    'shortest_path': shortest_path,
                    'neighbor_jaccard': float(common / union),
                    'embedding_distance': emb_dist,
                    'embedding_similarity': emb_sim,
                    'structural_equivalence': structural_equivalence,
                    'local_clustering_source': clustering_s,
                    'local_clustering_target': clustering_t,
                    'same_ground_truth_label': bool(int(data.y[s]) == int(data.y[t])) if getattr(data, 'y', None) is not None else None,
                })

            # Compute kNN preservation
            knn_pres = 0.0
            try:
                k_actual = min(k_knn, num_nodes - 1)
                if k_actual > 0:
                    knn = NearestNeighbors(n_neighbors=k_actual + 1).fit(emb_np)
                    _, indices = knn.kneighbors(emb_np[sample_indices])
                    pres_scores = []
                    for i, idx in enumerate(sample_indices):
                        graph_neighbors = adj_sets[idx]
                        if not graph_neighbors:
                            continue
                        emb_neighbors = set(indices[i, 1:])
                        intersection = graph_neighbors.intersection(emb_neighbors)
                        pres_scores.append(len(intersection) / min(k_actual, len(graph_neighbors)))
                    knn_pres = float(np.mean(pres_scores)) if pres_scores else 0.0
            except Exception:
                pass

            # ── Model-Specific Signatures ───────────────────────────────────

            # GAT: attention edges (already captured in model._attention_edges)
            attention_edges = None
            attention_per_head = None
            attention_focus_score = None
            if model_type == 'GAT' and hasattr(model, '_attention_edges') and model._attention_edges:
                attention_edges = model._attention_edges
                attention_per_head = getattr(model, '_attention_per_head', None)
                weights = [float(edge.get('weight', 0.0)) for edge in attention_edges]
                if weights:
                    attention_focus_score = float(np.max(weights) / max(1e-8, np.mean(weights)))

            # GCN: dirichlet energy + edge_similarity (BE precompute for FE)
            dirichlet_energy = None
            edge_similarity = None
            smoothness_separation = None
            smoothness_status = None
            if model_type == 'GCN':
                row_z, col_z = train_edges
                diff = z[row_z] - z[col_z]
                dirichlet_energy = float((diff ** 2).sum(dim=1).mean().item())
                # Edge similarity on FIXED test sets (same index as edge_scores)
                with torch.no_grad():
                    z_det = z.detach()
                    pos_sim = F.cosine_similarity(z_det[test_edges[0, :n_pos]], z_det[test_edges[1, :n_pos]]).cpu().tolist()
                    neg_sim = F.cosine_similarity(z_det[neg_test[0, :n_neg]], z_det[neg_test[1, :n_neg]]).cpu().tolist()
                edge_similarity = pos_sim + neg_sim
                smoothness_separation = float(np.mean(pos_sim) - np.mean(neg_sim))
                smoothness_status = (
                    'oversmoothing_risk'
                    if dirichlet_energy < 0.02 and smoothness_separation < 0.05
                    else 'separated'
                    if smoothness_separation > 0.12
                    else 'watch'
                )

            # SAGE: score variance under edge dropout (subset for performance)
            score_variance = None
            score_variance_by_edge = None
            unstable_edge_indices = None
            score_stability = None
            edge_dropout_rate_used = None
            if model_type == 'SAGE':
                try:
                    eval_edges = torch.cat([test_edges[:, :n_pos], neg_test[:, :n_neg]], dim=1)
                    edge_dropout_rate_used = max(0.0, min(0.8, _safe_float(config, 'task3_sage_edge_dropout', 0.1)))
                    score_samples = []
                    for _ in range(3):
                        drop_mask = torch.rand(train_edges.size(1)) > edge_dropout_rate_used
                        if not bool(drop_mask.any()):
                            drop_mask[torch.randint(0, train_edges.size(1), (1,))] = True
                        sub_edge = train_edges[:, drop_mask]
                        with torch.no_grad():
                            z_sub = model.encode(data.x, sub_edge)
                            scores = torch.sigmoid(model.decode(z_sub, eval_edges)).cpu().numpy()
                        score_samples.append(scores)
                    variances = np.var(score_samples, axis=0)
                    score_variance_by_edge = [float(v) for v in variances.tolist()]
                    score_variance = float(np.mean(variances))
                    score_stability = float(1.0 - min(1.0, score_variance * 12.0))
                    if len(score_variance_by_edge) > 0:
                        threshold = max(float(np.percentile(variances, 75)), float(np.mean(variances)))
                        unstable_edge_indices = [
                            int(i) for i, v in enumerate(score_variance_by_edge)
                            if v >= threshold and v > 0
                        ][:12]
                    else:
                        unstable_edge_indices = []
                except Exception:
                    score_variance = None
                    score_variance_by_edge = None
                    unstable_edge_indices = []
                    score_stability = None
                    edge_dropout_rate_used = None

            snapshot = {
                'epoch': epoch,
                'epochs_target': epochs,
                'epochs_completed': epoch + 1,
                'early_stopped': False,
                'stop_reason': None,
                'model_type': model_type,
                'seed': seed,
                'edge_split_ratio': test_ratio,
                'edge_scores': edge_scores,
                'edge_score_delta': edge_score_delta,
                'edge_classifications': edge_classifications,
                'test_edge_common_neighbors': test_edge_common_neighbors,
                'edge_structure_features': edge_structure_features,
                'embeddings_2d': emb_2d,
                'knn_preservation': knn_pres,
                'train_loss': float(loss.item()),
                'val_loss': float(val_loss.item()),
                'train_acc': auc,  # Use AUC as train_acc for link prediction
                'auc': auc,
                'val_acc': auc,
                'top_k_links': top_k_links,
                'best_epoch': best_epoch,
                'best_auc': float(best_auc),
                'is_best_so_far': bool(best_epoch == epoch),
                # Model-specific signatures
                'attention_edges': attention_edges,
                'attention_per_head': attention_per_head,
                'attention_focus_score': attention_focus_score,
                'dirichlet_energy': dirichlet_energy,
                'smoothness_separation': smoothness_separation,
                'smoothness_status': smoothness_status,
                'edge_similarity': edge_similarity,
                'score_variance': score_variance,
                'score_variance_by_edge': score_variance_by_edge,
                'unstable_edge_indices': unstable_edge_indices,
                'score_stability': score_stability,
                'edge_dropout_rate_used': edge_dropout_rate_used,
            }
            prev_edge_scores = edge_scores
            epoch_snapshots.append(snapshot)
            if snapshot_hook:
                await snapshot_hook(epoch, snapshot)

            await send_json_zipped(websocket, {
                'type': 'epoch_snapshot',
                'data': snapshot,
                'progress': (epoch + 1) / epochs,
            })
        await asyncio.sleep(0.005)

    return epoch_snapshots
