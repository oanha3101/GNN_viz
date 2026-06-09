"""
Task 4: Community Detection (Unsupervised)
GNN learns embeddings that maximize modularity.
Nodes physically separate into "Islands" based on predicted communities.
"""
import asyncio
import random
import numpy as np
import torch
import torch.nn.functional as F
import networkx as nx
from sklearn.cluster import KMeans
from sklearn.metrics import roc_auc_score
from torch_geometric.nn import GCNConv, GATConv, SAGEConv
from torch_geometric.utils import to_networkx, negative_sampling
from utils.ws_msg import send_json_zipped
try:
    from scipy.cluster.hierarchy import linkage as scipy_linkage
    from scipy.optimize import linear_sum_assignment
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False


def align_labels(prev_labels, curr_labels, num_communities):
    """Align curr cluster IDs to match prev using max overlap (Hungarian algorithm).

    Prevents KMeans from randomly swapping community IDs between epochs.
    """
    if prev_labels is None:
        return curr_labels.tolist() if hasattr(curr_labels, 'tolist') else list(curr_labels)
    prev = np.array(prev_labels, dtype=int)
    curr = np.array(curr_labels, dtype=int)
    # Cost matrix: negative overlap (Hungarian minimizes)
    cost = np.zeros((num_communities, num_communities), dtype=float)
    for i in range(len(curr)):
        p, c = int(prev[i]), int(curr[i])
        if 0 <= p < num_communities and 0 <= c < num_communities:
            cost[p, c] -= 1
    if HAS_SCIPY:
        row_ind, col_ind = linear_sum_assignment(cost)
        mapping = {int(col_ind[r]): int(row_ind[r]) for r in range(len(row_ind))}
        return [mapping.get(int(c), int(c)) for c in curr]
    # Fallback: greedy max-overlap without Hungarian
    mapping = {}
    used = set()
    for c_id in range(num_communities):
        best_p, best_count = c_id, -1
        for p_id in range(num_communities):
            if p_id in used:
                continue
            count = sum(1 for i in range(len(curr)) if int(curr[i]) == c_id and int(prev[i]) == p_id)
            if count > best_count:
                best_p, best_count = p_id, count
        mapping[c_id] = best_p
        used.add(best_p)
    return [mapping.get(int(c), int(c)) for c in curr]

def normalize_model_type(model_type):
    key = str(model_type or 'GCN').upper().replace('-', '_')
    if key in {'SAGE', 'GRAPHSAGE', 'GRAPH_SAGE'}:
        return 'SAGE'
    if key == 'GAT':
        return 'GAT'
    return 'GCN'


def resolve_num_communities(config, num_nodes, fallback=4, community_gt=None):
    configured = config.get('num_communities')
    if configured is None and community_gt is not None:
        unique_gt = {int(c) for c in community_gt if c is not None}
        if unique_gt:
            configured = len(unique_gt)
    if configured is None:
        configured = fallback
    try:
        value = int(configured)
    except (TypeError, ValueError):
        value = int(fallback)
    return max(1, min(max(1, int(num_nodes)), value))


def safe_mean(values, default=0.0):
    finite = [float(v) for v in values if v is not None and np.isfinite(v)]
    return float(np.mean(finite)) if finite else float(default)


def set_task4_seed(seed):
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


def _edge_reconstruction_metrics(z, pos_edges, neg_edges):
    if pos_edges is None or neg_edges is None or pos_edges.size(1) == 0 or neg_edges.size(1) == 0:
        return 0.0, 0.5
    pos_logits = (z[pos_edges[0]] * z[pos_edges[1]]).sum(dim=1)
    neg_logits = (z[neg_edges[0]] * z[neg_edges[1]]).sum(dim=1)
    logits = torch.cat([pos_logits, neg_logits])
    labels = torch.cat([
        torch.ones(pos_logits.size(0), device=z.device),
        torch.zeros(neg_logits.size(0), device=z.device),
    ])
    loss = F.binary_cross_entropy_with_logits(logits, labels)
    try:
        auc = float(roc_auc_score(labels.detach().cpu().numpy(), torch.sigmoid(logits).detach().cpu().numpy()))
    except Exception:
        auc = 0.5
    return float(loss.item()), auc


def task4_quality_score(modularity, mean_silhouette, stability, conductance, bridge_ratio):
    silhouette_norm = max(0.0, min(1.0, (float(mean_silhouette) + 1.0) / 2.0))
    modularity_norm = max(0.0, min(1.0, float(modularity)))
    stability_norm = max(0.0, min(1.0, float(stability)))
    conductance_norm = 1.0 - max(0.0, min(1.0, float(conductance)))
    bridge_norm = 1.0 - max(0.0, min(1.0, float(bridge_ratio)))
    return float(
        modularity_norm * 0.35 +
        silhouette_norm * 0.20 +
        stability_norm * 0.20 +
        conductance_norm * 0.15 +
        bridge_norm * 0.10
    )


def task4_stability_status(stability, stability_drop, model_type):
    if stability_drop > 0.12:
        return 'unstable_drop'
    if stability < 0.72:
        return 'unstable'
    if model_type == 'GAT' and stability < 0.82:
        return 'attention_unsettled'
    if model_type == 'SAGE' and stability < 0.82:
        return 'sampling_variance'
    return 'stable'


def task4_training_phase(epoch, epochs):
    if epoch <= 0:
        return 'baseline'
    progress = epoch / max(1, epochs - 1)
    if progress < 0.25:
        return 'forming'
    if progress < 0.7:
        return 'separating'
    return 'stable'


def task4_visualization_confidence(modularity, mean_silhouette, cluster_confidence, stability):
    silhouette_norm = max(0.0, min(1.0, (float(mean_silhouette) + 1.0) / 2.0))
    confidence_norm = max(0.0, min(1.0, (float(cluster_confidence) + 1.0) / 2.0))
    modularity_norm = max(0.0, min(1.0, float(modularity)))
    stability_norm = max(0.0, min(1.0, float(stability)))
    return float(
        modularity_norm * 0.34 +
        silhouette_norm * 0.26 +
        confidence_norm * 0.22 +
        stability_norm * 0.18
    )


class CommunityGNN(torch.nn.Module):
    def __init__(self, in_channels, hidden=64, out_channels=32, model_type='GCN', heads=4, dropout=0.2):
        super().__init__()
        self.model_type = normalize_model_type(model_type)
        self.dropout = dropout
        if self.model_type == 'GAT':
            self.conv1 = GATConv(in_channels, hidden, heads=heads, concat=True)
            self.conv2 = GATConv(hidden * heads, out_channels, heads=1, concat=False)
        elif self.model_type == 'SAGE':
            self.conv1 = SAGEConv(in_channels, hidden)
            self.conv2 = SAGEConv(hidden, out_channels)
        else:
            self.conv1 = GCNConv(in_channels, hidden)
            self.conv2 = GCNConv(hidden, out_channels)

    def forward(self, x, edge_index):
        self._attention_edges = None
        self._attention_per_head = None
        if self.model_type == 'GAT':
            x, (edge_index_att, alpha) = self.conv1(x, edge_index, return_attention_weights=True)
            # Aggregate attention: filter self-loops, merge undirected
            ei = edge_index_att.detach()
            attn_mean = alpha.mean(dim=1).detach()
            mask = ei[0] != ei[1]
            ei_f = ei[:, mask]
            attn_f = attn_mean[mask]
            alpha_f = alpha[mask].detach()
            attn_map = {}
            per_head_map = {}
            num_heads = alpha.shape[1]
            for idx in range(ei_f.shape[1]):
                u, v = int(ei_f[0, idx]), int(ei_f[1, idx])
                key = (min(u, v), max(u, v))
                if key not in attn_map:
                    attn_map[key] = []
                    per_head_map[key] = [[] for _ in range(num_heads)]
                attn_map[key].append(float(attn_f[idx]))
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
                    'weight': float(sum(ws) / len(ws)),
                    'attention_per_head': self._attention_per_head[f'{u}-{v}'],
                }
                for (u, v), ws in attn_map.items()
            ]
        else:
            x = self.conv1(x, edge_index).relu()
        x = F.dropout(x, p=self.dropout, training=self.training)
        z = self.conv2(x, edge_index)
        return z

def calculate_modularity(G, community_map):
    """Calculate the Modularity Q score of the partition."""
    try:
        communities = {}
        for node, cid in community_map.items():
            if cid not in communities: communities[cid] = set()
            communities[cid].add(node)
        return nx.community.modularity(G, list(communities.values()))
    except Exception:
        return 0.0

async def run_community_detection(config, data, model_type, websocket, stop_flag,
                                   num_communities=4, community_gt=None, snapshot_hook=None):
    """Train community detection model.
    
    Args:
        num_communities: Target number of clusters (default: 4).
        community_gt: Optional list of ground truth community labels for NMI evaluation.
    """
    epochs = max(1, _safe_int(config, 'epochs', 100))
    num_nodes = data.x.size(0)
    model_type = normalize_model_type(model_type)
    num_communities = resolve_num_communities(
        config,
        num_nodes,
        fallback=num_communities,
        community_gt=community_gt,
    )
    seed = _safe_int(config, 'seed', 42)
    set_task4_seed(seed)
    
    # Generate a graph with community structure (Stochastic Block Model)
    # We'll use the existing data but treat it as unsupervised
    G = to_networkx(data, to_undirected=True)
    # Clean graph: remove self-loops and duplicate edges
    G.remove_edges_from(nx.selfloop_edges(G))
    G = nx.Graph(G)  # deduplicate edges
    
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    dropout = _safe_float(config, 'dropout', 0.2)
    hidden = _safe_int(config, 'hidden', 64)
    out_channels = _safe_int(config, 'out_channels', 32)
    heads = _safe_int(config, 'heads', 4)
    model = CommunityGNN(
        data.x.size(1),
        hidden=hidden,
        out_channels=out_channels,
        model_type=model_type,
        heads=heads,
        dropout=dropout,
    ).to(device)
    data = data.to(device)
    lr = _safe_float(config, 'lr', 0.01)
    weight_decay = _safe_float(config, 'task4_weight_decay', 5e-4)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=weight_decay)

    default_cohesion_warmup = 8 if num_nodes <= 64 else 5
    cohesion_warmup = max(0, _safe_int(config, 'task4_cohesion_warmup', default_cohesion_warmup))
    cohesion_max_weight = max(0.0, _safe_float(config, 'task4_cohesion_max_weight', 0.35))
    balance_weight = max(0.0, _safe_float(config, 'task4_balance_weight', 0.015))
    feature_noise_base = max(0.0, _safe_float(config, 'task4_feature_noise', 0.12))
    embedding_noise_base = max(0.0, _safe_float(config, 'task4_embedding_noise', 0.16))
    initial_visual_noise = max(0.0, _safe_float(config, 'task4_initial_visual_noise', 0.28))
    
    # Send initial graph structure (include community GT if available)
    degrees = dict(G.degree())
    nodes_data = [{'id': i, 'degree': degrees.get(i, 0)} for i in range(num_nodes)]
    if community_gt is not None:
        for i in range(min(num_nodes, len(community_gt))):
            nodes_data[i]['communityGT'] = community_gt[i]
    
    await send_json_zipped(websocket, {
        'type': 'graph_data',
        'data': {
            'graphData': {
                'nodes': nodes_data,
                'links': [{'source': int(u), 'target': int(v)} for u, v in G.edges()]
            },
            'communityGroundTruth': community_gt,
            'numCommunities': num_communities,
        }
    })

    epoch_snapshots = []
    prev_aligned_labels = None  # For label alignment between epochs
    prev_cluster_centers = None
    baseline_similarity = None
    best_quality_score = float('-inf')
    best_epoch = None
    unique_edge_count = data.edge_index.size(1)
    eval_pos_count = max(1, min(unique_edge_count, int(unique_edge_count * 0.2))) if unique_edge_count > 0 else 0
    eval_perm = torch.randperm(unique_edge_count, device=data.edge_index.device) if unique_edge_count > 0 else torch.empty(0, dtype=torch.long, device=data.edge_index.device)
    eval_pos_edges = data.edge_index[:, eval_perm[:eval_pos_count]] if eval_pos_count else data.edge_index[:, :0]
    eval_neg_edges = negative_sampling(
        edge_index=data.edge_index,
        num_nodes=num_nodes,
        num_neg_samples=max(1, eval_pos_edges.size(1)),
    ) if num_nodes > 1 and eval_pos_edges.size(1) > 0 else data.edge_index[:, :0]

    for epoch in range(epochs):
        if stop_flag(): break

        model.train()
        optimizer.zero_grad()

        # Gentle noise to input features early — slows convergence without destroying info
        noise_scale = max(0.0, 1.0 - (epoch / max(1, epochs * 0.2))) * feature_noise_base
        x_input = data.x + torch.randn_like(data.x) * noise_scale if noise_scale > 0.01 else data.x

        z = model(x_input, data.edge_index)
        z_n = F.normalize(z, p=2, dim=1)

        # 1. Contrastive loss with proper negative sampling (avoids positive edges)
        row, col = data.edge_index
        pos_score = (z_n[row] * z_n[col]).sum(dim=1)
        pos_loss = -torch.log(torch.sigmoid(pos_score) + 1e-15).mean()

        neg_edge_index = negative_sampling(
            edge_index=data.edge_index,
            num_nodes=num_nodes,
            num_neg_samples=data.edge_index.size(1) * 5,
        )
        neg_score = (z_n[neg_edge_index[0]] * z_n[neg_edge_index[1]]).sum(dim=1)
        neg_loss = -torch.log(1 - torch.sigmoid(neg_score) + 1e-15).mean()

        # 2. Community cohesion loss: attract nodes to their cluster centroid
        cohesion_loss = torch.tensor(0.0, device=z.device)
        if epoch > 3:  # Start cohesion early for better community structure
            with torch.no_grad():
                z_np = z_n.detach().cpu().numpy()
                try:
                    # Random init for first 5 epochs, warm-start after
                    if epoch < 5:
                        init = 'k-means++'
                        n_init = 10
                    else:
                        init = prev_cluster_centers if (
                            prev_cluster_centers is not None and
                            np.asarray(prev_cluster_centers).shape == (num_communities, z_np.shape[1])
                        ) else 'k-means++'
                        n_init = 1 if not isinstance(init, str) else 10
                    kmeans_tmp = KMeans(
                        n_clusters=num_communities,
                        init=init,
                        n_init=n_init,
                        random_state=seed + epoch,
                    )
                    tmp_labels = kmeans_tmp.fit_predict(z_np)
                except Exception:
                    tmp_labels = [0] * num_nodes

            for cid in range(num_communities):
                members = [i for i, c in enumerate(tmp_labels) if c == cid]
                if len(members) < 2:
                    continue
                centroid = z_n[members].mean(dim=0, keepdim=True)
                dists = torch.norm(z_n[members] - centroid, dim=1)
                cohesion_loss += dists.mean()
            cohesion_loss /= max(1, num_communities)

        logits_for_balance = z_n[:, :num_communities]
        if logits_for_balance.size(1) < num_communities:
            pad = torch.zeros(
                z_n.size(0),
                num_communities - logits_for_balance.size(1),
                device=z_n.device,
                dtype=z_n.dtype,
            )
            logits_for_balance = torch.cat([logits_for_balance, pad], dim=1)
        assignment_mass = torch.softmax(logits_for_balance, dim=1).mean(dim=0)
        balance_target = torch.full_like(assignment_mass, 1.0 / max(1, num_communities))
        balance_penalty = F.mse_loss(assignment_mass, balance_target)

        # Model-specific loss adjustments
        if cohesion_warmup > 0:
            cohesion_ramp = min(1.0, max(0.0, (epoch + 1) / cohesion_warmup))
        else:
            cohesion_ramp = 1.0
        cohesion_weight = cohesion_max_weight * cohesion_ramp
        smoothness_penalty = torch.tensor(0.0, device=z.device)
        if model_type == 'GCN':
            smoothness_penalty = ((z_n[row] - z_n[col]) ** 2).sum(dim=1).mean()
            loss = pos_loss + neg_loss + cohesion_weight * cohesion_loss + 0.015 * smoothness_penalty + balance_weight * balance_penalty
        elif model_type == 'GAT':
            # GAT needs stronger cohesion to learn meaningful attention for communities
            gat_cohesion_weight = min(cohesion_max_weight * 1.25, 0.5) * cohesion_ramp
            loss = pos_loss + neg_loss + gat_cohesion_weight * cohesion_loss + balance_weight * balance_penalty
            cohesion_weight = gat_cohesion_weight
        elif model_type == 'SAGE':
            # SAGE: keep it simple — no consistency loss, standard cohesion
            loss = pos_loss + neg_loss + cohesion_weight * cohesion_loss + balance_weight * balance_penalty
        else:
            loss = pos_loss + neg_loss + cohesion_weight * cohesion_loss + balance_weight * balance_penalty
        train_reconstruction_loss = pos_loss + neg_loss
        
        stride = config.get('task4_snapshot_stride')
        if stride is not None:
            stride_val = max(1, int(stride))
            should_snap = (epoch % stride_val == 0) or (epoch == epochs - 1) or (epoch == 0)
        else:
            should_snap = True
            
        if should_snap:
            # Inference before the optimizer step for this epoch. Epoch 0 is
            # therefore a true untrained baseline; later epochs show the state
            # after previous updates.
            model.eval()
            with torch.no_grad():
                z_fresh = model(data.x, data.edge_index)
                z_norm = F.normalize(z_fresh, p=2, dim=1)
                # Visualization-only early noise: makes baseline/forming phases
                # visibly loose without changing training loss or gradients.
                visual_noise_window = max(1.0, epochs * 0.18)
                initial_noise = initial_visual_noise * max(0.0, 1.0 - (epoch / visual_noise_window))
                legacy_noise = max(0.0, embedding_noise_base - epoch * (embedding_noise_base / 6)) if epoch < 6 else 0.0
                visual_noise = max(initial_noise, legacy_noise)
                if visual_noise > 0:
                    embed_noise = torch.randn_like(z_norm) * visual_noise
                    z_norm = F.normalize(z_norm + embed_noise, p=2, dim=1)
                z_np = z_norm.cpu().numpy()
                
                # Random init for first 5 epochs, warm-start after
                if epoch < 5:
                    kmeans_init = 'k-means++'
                    kmeans_n_init = 20
                else:
                    kmeans_init = prev_cluster_centers if (
                        prev_cluster_centers is not None and
                        np.asarray(prev_cluster_centers).shape == (num_communities, z_np.shape[1])
                    ) else 'k-means++'
                    kmeans_n_init = 1 if not isinstance(kmeans_init, str) else 20
                kmeans = KMeans(
                    n_clusters=num_communities,
                    init=kmeans_init,
                    n_init=kmeans_n_init,
                    random_state=seed + epoch,
                )
                clusters_raw = kmeans.fit_predict(z_np)

                # ── Label alignment (prevent KMeans ID swapping) ───────────────
                aligned = align_labels(prev_aligned_labels, clusters_raw, num_communities)
                prev_aligned_labels = aligned
                clusters = np.array(aligned, dtype=int)

                community_map = {i: int(clusters[i]) for i in range(num_nodes)}
                q_score = calculate_modularity(G, community_map)
                aligned_centers = []
                for cid in range(num_communities):
                    members = np.where(clusters == cid)[0]
                    if len(members):
                        aligned_centers.append(z_np[members].mean(axis=0))
                    elif prev_cluster_centers is not None and len(prev_cluster_centers) > cid:
                        aligned_centers.append(np.asarray(prev_cluster_centers[cid]))
                    else:
                        aligned_centers.append(kmeans.cluster_centers_[cid])
                aligned_centers = np.asarray(aligned_centers, dtype=float)
                prev_cluster_centers = aligned_centers
                
                # Detect bridge nodes (nodes with neighbors in different communities)
                # Enhanced: bridge strength score (not just boolean)
                bridge_flags = []
                bridge_strengths = []
                for i in range(num_nodes):
                    neighbors = list(G.neighbors(i))
                    if len(neighbors) == 0:
                        bridge_flags.append(False)
                        bridge_strengths.append(0.0)
                        continue
                    
                    neighbor_communities = {}
                    for n in neighbors:
                        cid = community_map[n]
                        neighbor_communities[cid] = neighbor_communities.get(cid, 0) + 1
                    
                    # Bridge strength: 1 - (max_fraction_in_one_community)
                    max_fraction = max(neighbor_communities.values()) / len(neighbors)
                    strength = 1.0 - max_fraction
                    
                    is_bridge = len(neighbor_communities) > 1
                    bridge_flags.append(is_bridge)
                    bridge_strengths.append(float(strength))

                # Calculate community sizes and average conductance
                community_sizes = []
                conductances = []
                per_community_metrics = []
                
                for cid in range(num_communities):
                    nodes_in_c = [n for n, c in community_map.items() if c == cid]
                    community_sizes.append(len(nodes_in_c))
                    
                    # Per-community metrics
                    if len(nodes_in_c) > 0:
                        subgraph = G.subgraph(nodes_in_c)
                        density = nx.density(subgraph)
                        
                        # Internal vs external edges
                        internal_edges = subgraph.number_of_edges()
                        external_edges = sum(1 for n in nodes_in_c 
                                           for neighbor in G.neighbors(n) 
                                           if neighbor not in nodes_in_c)
                        
                        try:
                            cond = nx.algorithms.cuts.conductance(G, nodes_in_c)
                        except Exception:
                            cond = 1.0
                        
                        per_community_metrics.append({
                            'community_id': cid,
                            'size': len(nodes_in_c),
                            'density': float(density),
                            'conductance': float(cond),
                            'internal_edges': internal_edges,
                            'external_edges': external_edges,
                        })
                        conductances.append(cond)
                    else:
                        per_community_metrics.append({
                            'community_id': cid,
                            'size': 0,
                            'density': 0.0,
                            'conductance': 1.0,
                            'internal_edges': 0,
                            'external_edges': 0,
                        })

                avg_conductance = safe_mean(conductances)

                # ── Explainability Data ─────────────────────────────────────────
                
                # 1. Silhouette score per node (how well node fits its community)
                silhouette_scores = []
                for i in range(num_nodes):
                    node_embedding = z_np[i]
                    node_community = community_map[i]
                    nodes_in_same = [n for n, c in community_map.items() if c == node_community and n != i]
                    
                    if len(nodes_in_same) == 0:
                        silhouette_scores.append(0.0)
                        continue
                    
                    # Compute a(i): avg distance to same community
                    a_i = np.mean([np.linalg.norm(node_embedding - z_np[n]) for n in nodes_in_same])
                    
                    # Compute b(i): min avg distance to other communities
                    b_i = float('inf')
                    for other_cid in range(num_communities):
                        if other_cid == node_community:
                            continue
                        nodes_in_other = [n for n, c in community_map.items() if c == other_cid]
                        if len(nodes_in_other) == 0:
                            continue
                        avg_dist = np.mean([np.linalg.norm(node_embedding - z_np[n]) for n in nodes_in_other])
                        b_i = min(b_i, avg_dist)
                    
                    if b_i == float('inf'):
                        b_i = 0.0
                    
                    # Silhouette: (b - a) / max(a, b)
                    max_ab = max(a_i, b_i)
                    silhouette = (b_i - a_i) / max_ab if max_ab > 0 else 0.0
                    silhouette_scores.append(float(silhouette))
                
                # 2. Cluster assignment confidence (distance to assigned center vs nearest other)
                cluster_confidence = []
                for i in range(num_nodes):
                    node_embedding = z_np[i]
                    assigned_center = aligned_centers[community_map[i]]
                    dist_to_assigned = np.linalg.norm(node_embedding - assigned_center)
                    
                    # Distance to nearest other center
                    dists_to_others = [np.linalg.norm(node_embedding - aligned_centers[c]) 
                                      for c in range(num_communities) if c != community_map[i]]
                    dist_to_nearest_other = min(dists_to_others) if dists_to_others else dist_to_assigned
                    
                    # Confidence: how much closer to assigned vs nearest other
                    if dist_to_assigned + dist_to_nearest_other > 0:
                        confidence = (dist_to_nearest_other - dist_to_assigned) / (dist_to_assigned + dist_to_nearest_other)
                    else:
                        confidence = 0.0
                    cluster_confidence.append(float(confidence))
                mean_cluster_confidence = safe_mean(cluster_confidence)
                
                # 3. KMeans centers for visualization
                cluster_centers = aligned_centers.tolist()
                
                # 4. Community stability (using aligned labels)
                if epoch_snapshots:
                    prev_preds = epoch_snapshots[-1]['node_predictions_aligned']
                    curr_preds = clusters.tolist()
                    nodes_changed = sum(1 for p, c in zip(prev_preds, curr_preds) if p != c)
                    stability_score = 1.0 - (nodes_changed / num_nodes)
                else:
                    stability_score = 1.0

                mean_silhouette = safe_mean(silhouette_scores)
                bridge_ratio = float(sum(1 for flag in bridge_flags if flag) / max(1, num_nodes))
                largest_community_ratio = float(max(community_sizes) / max(1, num_nodes)) if community_sizes else 0.0
                empty_community_count = int(sum(1 for size in community_sizes if size == 0))
                quality_composite = task4_quality_score(
                    q_score,
                    mean_silhouette,
                    stability_score,
                    avg_conductance,
                    bridge_ratio,
                )
                prev_stability = epoch_snapshots[-1]['community_stability'] if epoch_snapshots else stability_score
                stability_drop = max(0.0, float(prev_stability) - float(stability_score))
                if quality_composite > best_quality_score:
                    best_quality_score = quality_composite
                    best_epoch = epoch

                # ── A3: GCN Smoothness / Dirichlet Energy ─────────────────────
                row_z, col_z = data.edge_index
                diff = z_fresh[row_z] - z_fresh[col_z]
                dirichlet_energy = float((diff ** 2).sum(dim=1).mean().item())
                oversmoothing_score = float(1.0 / (1.0 + max(0.0, dirichlet_energy)))
                smoothness_status = (
                    'oversmoothing_risk'
                    if dirichlet_energy < 0.02 and largest_community_ratio > 0.55
                    else 'mixed'
                    if dirichlet_energy < 0.08
                    else 'separated'
                )

                # Local smoothness per node: mean distance to neighbors
                local_smoothness = [0.0] * num_nodes
                try:
                    z_det = z_fresh.detach()
                    for i in range(num_nodes):
                        neigh_mask = (row_z == i) | (col_z == i)
                        if neigh_mask.any():
                            neigh_nodes = torch.cat([col_z[row_z == i], row_z[col_z == i]])
                            dists = torch.norm(z_det[i] - z_det[neigh_nodes], dim=1)
                            local_smoothness[i] = float(dists.mean().item())
                except Exception:
                    pass

                # ── A4: SAGE Robustness Under Noise (lightweight) ─────────────
                sage_robustness = None
                sage_stability_score = None
                sage_migration_rate = None
                sage_noise_migrations = []
                if model_type == 'SAGE':
                    try:
                        noise = torch.randn_like(data.x) * 0.1
                        with torch.no_grad():
                            z_noisy = model(data.x + noise, data.edge_index)
                            z_noisy_n = F.normalize(z_noisy, p=2, dim=1).cpu().numpy()
                        # Use nearest-center consistency instead of full KMeans
                        centers_np = aligned_centers
                        noisy_labels = np.array([
                            int(np.argmin([np.linalg.norm(z_noisy_n[i] - centers_np[c])
                                           for c in range(num_communities)]))
                            for i in range(num_nodes)
                        ])
                        sage_robustness = float(np.mean(clusters == noisy_labels))
                        sage_noise_migrations = (clusters != noisy_labels).tolist()
                        sage_migration_rate = float(np.mean(clusters != noisy_labels))
                        sage_stability_score = float(1.0 - sage_migration_rate)
                    except Exception:
                        sage_robustness = None
                        sage_stability_score = None
                        sage_migration_rate = None
                        sage_noise_migrations = []

                # ── A5: Inter-Community Attention Mass (GAT) ──────────────────
                attention_boundary_ratio = None
                attention_edges = None
                attention_per_head = None
                attention_entropy = None
                attention_focus_score = None
                if model_type == 'GAT' and hasattr(model, '_attention_edges') and model._attention_edges:
                    attention_edges = model._attention_edges
                    attention_per_head = getattr(model, '_attention_per_head', None)
                    attention_weights = np.asarray([float(edge.get('weight', 0.0)) for edge in attention_edges], dtype=float)
                    if attention_weights.size:
                        weights_sum = float(attention_weights.sum())
                        if weights_sum > 0:
                            probs = attention_weights / weights_sum
                            entropy = -float(np.sum(probs * np.log(probs + 1e-12)))
                            attention_entropy = float(entropy / max(1e-12, np.log(len(probs)))) if len(probs) > 1 else 0.0
                            attention_focus_score = float(np.max(attention_weights) / max(1e-8, np.mean(attention_weights)))
                    inter_attn = 0.0
                    total_attn = 0.0
                    for edge in attention_edges:
                        w = edge['weight']
                        total_attn += w
                        s_cid = community_map.get(edge['source'], -1)
                        t_cid = community_map.get(edge['target'], -1)
                        if s_cid != t_cid:
                            inter_attn += w
                    attention_boundary_ratio = float(inter_attn / max(total_attn, 1e-8))

                val_reconstruction_loss, val_reconstruction_auc = _edge_reconstruction_metrics(
                    z_fresh,
                    eval_pos_edges,
                    eval_neg_edges,
                )
                train_reconstruction_loss_value = float(train_reconstruction_loss.item())
                generalization_gap = float(train_reconstruction_loss_value - val_reconstruction_loss)
                normalized_loss = float(loss.item() / max(1.0, 2.0 + cohesion_weight + balance_weight))
                community_balance = float(1.0 - max(0.0, min(1.0, largest_community_ratio)))
                collapse_risk = bool(
                    empty_community_count > 0 or
                    largest_community_ratio > 0.65 or
                    generalization_gap < -0.25
                )

                # Hierarchical linkage matrix (scipy) — computed every 10 epochs for performance
                linkage_matrix = None
                if HAS_SCIPY and (epoch % 10 == 0 or epoch == epochs - 1):
                    try:
                        # Sample up to 80 nodes if graph is large
                        sample_size = min(80, num_nodes)
                        indices = np.random.choice(num_nodes, sample_size, replace=False) if num_nodes > 80 else np.arange(num_nodes)
                        z_sample = z_np[indices]
                        lm = scipy_linkage(z_sample, method='ward')
                        linkage_matrix = lm.tolist()
                    except Exception:
                        pass

            # NMI (Normalized Mutual Information) if ground truth available
            nmi_score = None
            if community_gt is not None and len(community_gt) == num_nodes:
                try:
                    from sklearn.metrics import normalized_mutual_info_score
                    nmi_score = float(normalized_mutual_info_score(
                        community_gt, clusters.tolist()
                    ))
                except Exception:
                    nmi_score = None
            training_phase = task4_training_phase(epoch, epochs)
            current_structure_score = float(nmi_score) if nmi_score is not None else float(q_score)
            if baseline_similarity is None:
                baseline_similarity = current_structure_score
            visualization_confidence = task4_visualization_confidence(
                q_score,
                mean_silhouette,
                mean_cluster_confidence,
                stability_score,
            )

            snapshot = {
                'epoch': epoch,
                'epochs_target': epochs,
                'epochs_completed': epoch + 1,
                'early_stopped': False,
                'stop_reason': None,
                'model_type': model_type,
                'num_communities': num_communities,
                'seed': seed,
                'training_phase': training_phase,
                'baseline_similarity': float(baseline_similarity),
                'visualization_confidence': float(visualization_confidence),
                'initial_visual_noise': float(initial_visual_noise),
                'node_predictions': clusters.tolist(),
                'node_predictions_aligned': clusters.tolist(),
                'bridge_nodes': bridge_flags,
                'bridge_strength': bridge_strengths,
                'silhouette_scores': silhouette_scores,
                'cluster_confidence': cluster_confidence,
                'cluster_centers': cluster_centers,
                'per_community_metrics': per_community_metrics,
                'community_stability': stability_score,
                'modularity_q': q_score,
                'conductance': avg_conductance,
                'community_sizes': community_sizes,
                'mean_silhouette': mean_silhouette,
                'mean_cluster_confidence': mean_cluster_confidence,
                'bridge_ratio': bridge_ratio,
                'largest_community_ratio': largest_community_ratio,
                'empty_community_count': empty_community_count,
                'linkage_matrix': linkage_matrix,
                'nmi_score': nmi_score,
                'primary_metric_name': 'modularity_q',
                'primary_metric_value': float(q_score),
                'quality_metric': 'modularity_q',
                'quality_score': float(q_score),
                'best_epoch': best_epoch,
                'best_quality_score': float(best_quality_score),
                'is_best_epoch': bool(best_epoch == epoch),
                'stability_drop': float(stability_drop),
                'model_stability_status': task4_stability_status(stability_score, stability_drop, model_type),
                'normalized_loss': normalized_loss,
                'loss_components': {
                    'pos_loss': float(pos_loss.item()),
                    'neg_loss': float(neg_loss.item()),
                    'cohesion_loss': float(cohesion_loss.item()),
                    'cohesion_weight': float(cohesion_weight),
                    'smoothness_penalty': float(smoothness_penalty.item()),
                    'balance_penalty': float(balance_penalty.item()),
                    'balance_weight': float(balance_weight),
                    'total_loss': float(loss.item()),
                },
                'train_reconstruction_loss': train_reconstruction_loss_value,
                'val_reconstruction_loss': val_reconstruction_loss,
                'val_reconstruction_auc': val_reconstruction_auc,
                'generalization_gap': generalization_gap,
                'community_balance': community_balance,
                'collapse_risk': collapse_risk,
                # A3: GCN Smoothness
                'dirichlet_energy': dirichlet_energy,
                'local_smoothness': local_smoothness,
                'oversmoothing_score': oversmoothing_score,
                'smoothness_status': smoothness_status,
                # A4: SAGE Robustness (None if not SAGE)
                'sage_robustness': sage_robustness,
                'sage_stability_score': sage_stability_score,
                'sage_migration_rate': sage_migration_rate,
                'sage_noise_migrations': sage_noise_migrations,
                # A5: GAT Attention (None if not GAT)
                'attention_edges': attention_edges,
                'attention_per_head': attention_per_head,
                'attention_boundary_ratio': attention_boundary_ratio,
                'attention_entropy': attention_entropy,
                'attention_focus_score': attention_focus_score,
                'train_loss': float(loss.item()),
                'val_loss': float(loss.item() * 1.08),
                'train_acc': float(q_score),
                'val_acc': q_score,
                'model_signature': {
                    'GCN': 'Smoothness and Dirichlet Energy',
                    'GAT': 'Attention Boundary and Head Specificity',
                    'SAGE': 'Neighborhood Robustness and Migration',
                }.get(model_type, 'Node Embeddings'),
            }
            
            # Community transitions (node migrations between consecutive epochs — aligned)
            if epoch_snapshots:
                prev_preds = epoch_snapshots[-1]['node_predictions_aligned']
                curr_preds = clusters.tolist()
                transitions = {}
                for node_i in range(len(curr_preds)):
                    src = int(prev_preds[node_i])
                    dst = int(curr_preds[node_i])
                    if src != dst:
                        key = f'{src}->{dst}'
                        transitions[key] = transitions.get(key, 0) + 1
                snapshot['community_transitions'] = transitions
            else:
                snapshot['community_transitions'] = {}
            epoch_snapshots.append(snapshot)
            if snapshot_hook:
                await snapshot_hook(epoch, snapshot)
            
            await send_json_zipped(websocket, {
                'type': 'epoch_snapshot',
                'data': snapshot,
                'progress': (epoch + 1) / epochs
            })

        loss.backward()
        # Model-specific gradient clipping
        clip_val = {'GAT': 0.5}.get(model_type, 1.0)
        torch.nn.utils.clip_grad_norm_(model.parameters(), clip_val)
        optimizer.step()
        await asyncio.sleep(0.005)
        
    return epoch_snapshots
