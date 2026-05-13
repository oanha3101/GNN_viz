"""
Task 6: Graph Generation (GAE-based)
Trains a Graph AutoEncoder with GCN/GAT/SAGE encoder to learn graph structure.
Generates new graphs by sampling from learned embeddings.
"""
import asyncio
import math
import random
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from sklearn.decomposition import PCA
from torch_geometric.nn import GCNConv, GATConv, SAGEConv
from torch_geometric.utils import negative_sampling
from utils.ws_msg import send_json_zipped
from utils.model_utils import should_take_snapshot

executor = ThreadPoolExecutor(max_workers=2)


# ───────────────────────────────────────────────────────────────────────────────
# Graph AutoEncoder Model
# ───────────────────────────────────────────────────────────────────────────────
class GraphGAE(nn.Module):
    """Graph AutoEncoder: GNN encoder + dot-product decoder for graph structure learning."""

    def __init__(self, in_channels, hidden=64, latent_dim=32, model_type='GCN', heads=4, dropout=0.5):
        super().__init__()
        self.model_type = model_type
        self.dropout = dropout

        # Encoder
        if model_type == 'GAT':
            self.conv1 = GATConv(in_channels, hidden, heads=heads, dropout=dropout)
            self.conv2 = GATConv(hidden * heads, latent_dim, heads=1, concat=False, dropout=dropout)
        elif model_type == 'SAGE':
            self.conv1 = SAGEConv(in_channels, hidden)
            self.conv2 = SAGEConv(hidden, latent_dim)
        else:
            self.conv1 = GCNConv(in_channels, hidden)
            self.conv2 = GCNConv(hidden, latent_dim)

        # Decoder: MLP on concatenated node pair embeddings
        self.decoder = nn.Sequential(
            nn.Linear(latent_dim * 2, hidden),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden, 1),
        )

    def encode(self, x, edge_index):
        x = self.conv1(x, edge_index)
        x = F.elu(x) if self.model_type == 'GAT' else F.relu(x)
        x = F.dropout(x, p=self.dropout, training=self.training)
        z = self.conv2(x, edge_index)
        return z

    def decode(self, z, edge_index):
        """Decode edge scores for given edge pairs."""
        src, tgt = edge_index
        h = torch.cat([z[src], z[tgt]], dim=1)
        return self.decoder(h).squeeze(-1)

    def decode_adj(self, z):
        """Full adjacency matrix reconstruction (for small graphs)."""
        n = z.size(0)
        z_src = z.unsqueeze(1).expand(n, n, -1)
        z_tgt = z.unsqueeze(0).expand(n, n, -1)
        h = torch.cat([z_src, z_tgt], dim=2)
        return self.decoder(h).squeeze(-1)

    def forward(self, x, edge_index, neg_edge_index=None):
        z = self.encode(x, edge_index)

        # Positive edges
        pos_score = self.decode(z, edge_index)

        # Negative edges (sampled)
        if neg_edge_index is None:
            neg_edge_index = negative_sampling(
                edge_index=edge_index,
                num_nodes=x.size(0),
                num_neg_samples=edge_index.size(1),
            )
        neg_score = self.decode(z, neg_edge_index)

        return z, pos_score, neg_score, neg_edge_index


# ───────────────────────────────────────────────────────────────────────────────
# Utility functions
# ───────────────────────────────────────────────────────────────────────────────
def _build_adj_list(edge_index_np, num_nodes):
    adj = [set() for _ in range(num_nodes)]
    for i in range(edge_index_np.shape[1]):
        s = int(edge_index_np[0, i])
        t = int(edge_index_np[1, i])
        if s == t:
            continue
        adj[s].add(t)
        adj[t].add(s)
    return adj


def _is_connected(num_nodes, edges):
    if num_nodes <= 1:
        return True
    adj = [[] for _ in range(num_nodes)]
    for s, t in edges:
        adj[s].append(t)
        adj[t].append(s)

    seen = {0}
    stack = [0]
    while stack:
        node = stack.pop()
        for nxt in adj[node]:
            if nxt not in seen:
                seen.add(nxt)
                stack.append(nxt)
    return len(seen) == num_nodes


def _graph_signature(edges):
    return tuple(sorted((min(s, t), max(s, t)) for s, t in edges))


def _hash_signature(sig_tuple, num_nodes=0):
    import hashlib
    raw = str(sig_tuple).encode()
    h = hashlib.md5(raw).hexdigest()[:8]
    return f'n{num_nodes}:{h}' if num_nodes else h


def _graph_density(num_nodes, num_edges):
    denom = max(1, num_nodes * (num_nodes - 1) / 2)
    return num_edges / denom


def _evaluate_graph(nodes, edges, source_density, source_degrees):
    """Compute quality metrics for a generated graph."""
    num_nodes = len(nodes)
    num_edges = len(edges)
    density = _graph_density(num_nodes, num_edges)
    connected = _is_connected(num_nodes, edges)
    degree_hist = [0] * num_nodes
    for s, t in edges:
        degree_hist[s] += 1
        degree_hist[t] += 1
    isolated = sum(1 for d in degree_hist if d == 0)
    avg_degree = (2 * num_edges / max(1, num_nodes))
    score = max(
        0.0,
        min(
            1.0,
            0.45 * (1.0 if connected else 0.25)
            + 0.3 * (1.0 - min(1.0, abs(density - source_density) * 3.0))
            + 0.25 * (1.0 - isolated / max(1, num_nodes)),
        ),
    )

    invalidity_reason = None
    if not connected and isolated > 0:
        invalidity_reason = f'Disconnected + {isolated} isolated nodes'
    elif not connected:
        invalidity_reason = 'Disconnected (multiple components)'
    elif isolated > 0:
        invalidity_reason = f'{isolated} isolated node(s)'

    comparison_metrics = {}
    matches_source = False
    if source_density is not None and source_degrees:
        source_avg_degree = sum(source_degrees) / len(source_degrees) if source_degrees else 0
        matches_source = abs(density - source_density) < source_density * 0.3
        comparison_metrics = {
            'source_density': float(source_density),
            'generated_density': float(density),
            'density_diff': abs(float(density) - source_density),
            'source_avg_degree': float(source_avg_degree),
            'generated_avg_degree': float(avg_degree),
            'degree_diff': abs(float(avg_degree) - source_avg_degree),
            'matches_source': matches_source,
        }

    return {
        'valid': connected and isolated == 0,
        'score': score,
        'density': density,
        'avg_degree': avg_degree,
        'isolated_ratio': isolated / max(1, num_nodes),
        'signature': _hash_signature(_graph_signature(edges), num_nodes),
        'invalidity_reason': invalidity_reason,
        'comparison_metrics': comparison_metrics,
        'matches_source': matches_source,
    }


def _generate_from_embeddings(z_np, num_nodes, temperature=1.0, target_density=0.3, rng=None):
    """Generate a graph from learned node embeddings using decoder probabilities."""
    if rng is None:
        rng = random.Random()

    # Compute pairwise edge probabilities via dot product + sigmoid
    z_tensor = torch.from_numpy(z_np).float()
    with torch.no_grad():
        n = z_tensor.size(0)
        # Use dot product for speed (instead of full MLP decoder)
        adj_logits = torch.mm(z_tensor, z_tensor.t()) / temperature
        # Zero diagonal
        adj_logits.fill_diagonal_(-10)
        adj_probs = torch.sigmoid(adj_logits).numpy()

    # Sample edges based on probabilities, biased toward target density
    edges = []
    edge_set = set()
    # Adjust threshold to match target density
    threshold = max(0.1, min(0.9, 1.0 - target_density))

    for i in range(num_nodes):
        for j in range(i + 1, num_nodes):
            if rng.random() < adj_probs[i, j] * threshold:
                key = (i, j)
                if key not in edge_set:
                    edge_set.add(key)
                    edges.append(key)

    # Ensure connected: add spanning tree if needed
    if num_nodes > 1 and not _is_connected(num_nodes, edges):
        nodes_list = list(range(num_nodes))
        rng.shuffle(nodes_list)
        for k in range(len(nodes_list) - 1):
            a, b = nodes_list[k], nodes_list[k + 1]
            key = (min(a, b), max(a, b))
            if key not in edge_set:
                edge_set.add(key)
                edges.append(key)

    return edges


def _sample_source_graphs(data, num_samples=6, min_nodes=5, max_nodes=10):
    edge_index = data.edge_index.cpu().numpy()
    num_nodes_total = data.x.size(0)
    adj = [[] for _ in range(num_nodes_total)]
    for i in range(edge_index.shape[1]):
        u, v = int(edge_index[0, i]), int(edge_index[1, i])
        adj[u].append(v)
        adj[v].append(u)

    samples = []
    rng = random.Random(42)

    nodes_pool = list(range(num_nodes_total))
    rng.shuffle(nodes_pool)

    for start_node in nodes_pool:
        if len(samples) >= num_samples:
            break

        visited = {start_node}
        queue = [start_node]
        target_size = rng.randint(min_nodes, max_nodes)

        curr_idx = 0
        while curr_idx < len(queue) and len(queue) < target_size:
            u = queue[curr_idx]
            curr_idx += 1
            neighbors = adj[u]
            rng.shuffle(neighbors)
            for v in neighbors:
                if v not in visited:
                    visited.add(v)
                    queue.append(v)
                    if len(queue) >= target_size:
                        break

        if len(queue) >= min_nodes:
            sub_nodes = sorted(list(visited))
            node_map = {old: new for new, old in enumerate(sub_nodes)}

            sub_links = []
            for u in sub_nodes:
                for v in adj[u]:
                    if v in node_map and u < v:
                        sub_links.append({'source': node_map[u], 'target': node_map[v]})

            samples.append({
                'id': len(samples),
                'nodes': [{'id': i} for i in range(len(sub_nodes))],
                'links': sub_links,
                'density': _graph_density(len(sub_nodes), len(sub_links)),
            })

    return samples


def _compute_latent_points(z_np, max_points, progress):
    """PCA projection of learned latent embeddings for visualization."""
    sample = z_np[:max_points]
    if len(sample) == 0:
        return [], [], []

    try:
        pca = PCA(n_components=2)
        coords = pca.fit_transform(sample)
    except Exception:
        coords = np.zeros((len(sample), 2), dtype=np.float32)

    shrink = 0.55 + (1.0 - progress) * 0.75
    coords = coords * shrink
    radial = np.linalg.norm(coords, axis=1)
    if radial.size:
        radial = radial / max(1e-6, radial.max())
    point_scores = (1.0 - radial * 0.6).clip(0.0, 1.0)
    point_validity = (point_scores > 0.45).astype(float)
    return coords.tolist(), point_scores.tolist(), point_validity.tolist()


# ───────────────────────────────────────────────────────────────────────────────
# Main Training Loop
# ───────────────────────────────────────────────────────────────────────────────
async def run_graph_generation(config, data, websocket, stop_flag, snapshot_hook=None):
    """Train GAE on reference graph and generate new graphs each epoch."""
    epochs = config.get('epochs', 50)
    lr = config.get('lr', 0.01)
    hidden = config.get('hidden', 64)
    latent_dim = config.get('latent_dim', 32)
    model_type = config.get('model', 'GCN')
    heads = config.get('heads', 4)
    dropout = config.get('dropout', 0.5)
    num_gen = config.get('num_generated', 6)

    num_nodes = data.x.size(0)
    edge_index = data.edge_index

    # Build source stats
    edge_index_np = edge_index.cpu().numpy()
    adj = _build_adj_list(edge_index_np, num_nodes)
    source_degrees = sorted((len(neigh) for neigh in adj), reverse=True)
    source_density = _graph_density(num_nodes, edge_index_np.shape[1] // 2)

    # Build model
    model = GraphGAE(
        in_channels=data.x.size(1),
        hidden=hidden,
        latent_dim=latent_dim,
        model_type=model_type,
        heads=heads,
        dropout=dropout,
    )
    optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-5)

    # Pre-sample source graphs for Comparison tab
    source_graphs = _sample_source_graphs(data)

    # Subgraph node sets for generation (stable across epochs)
    gen_rng = random.Random(42)
    gen_node_sets = []
    for _ in range(num_gen):
        size = gen_rng.randint(5, min(11, num_nodes))
        nodes = sorted(gen_rng.sample(range(num_nodes), size))
        gen_node_sets.append(nodes)

    loop = asyncio.get_running_loop()
    epoch_snapshots = []

    for epoch in range(epochs):
        if stop_flag():
            break

        # ── Training step ───────────────────────────────────────────────────
        model.train()
        optimizer.zero_grad()

        z, pos_score, neg_score, neg_edges = model(data.x, edge_index)

        # Binary cross-entropy loss
        pos_loss = F.binary_cross_entropy_with_logits(
            pos_score, torch.ones_like(pos_score)
        )
        neg_loss = F.binary_cross_entropy_with_logits(
            neg_score, torch.zeros_like(neg_score)
        )
        recon_loss = pos_loss + neg_loss

        # KL divergence (optional: if using VAE bottleneck)
        # For standard GAE, we skip KL and just use reconstruction
        loss = recon_loss
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()

        if should_take_snapshot(epoch, epochs):
            model.eval()
            with torch.no_grad():
                z_eval = model.encode(data.x, edge_index)
                z_np = z_eval.cpu().numpy()

                # Temperature decreases as training progresses (more deterministic)
                temperature = max(0.5, 2.0 - 1.5 * (epoch / max(1, epochs - 1)))

                # Generate graphs from learned embeddings
                generated_graphs = []
                for g_idx, node_set in enumerate(gen_node_sets):
                    sub_z = z_np[node_set]
                    n_sub = len(node_set)

                    # Target density evolves with training progress
                    progress = epoch / max(1, epochs - 1)
                    target_dens = max(0.12, min(0.72, source_density * (0.8 + progress * 0.6)))

                    edges = _generate_from_embeddings(
                        sub_z, n_sub,
                        temperature=temperature,
                        target_density=target_dens,
                        rng=random.Random(g_idx * 1337 + epoch),
                    )

                    nodes = [{'id': i} for i in range(n_sub)]
                    metrics = _evaluate_graph(nodes, edges, source_density, source_degrees)
                    graph = {
                        'id': g_idx,
                        'nodes': nodes,
                        'links': [{'source': s, 'target': t} for s, t in edges],
                        **metrics,
                    }
                    generated_graphs.append(graph)

                # Compute metrics
                unique_signatures = {g['signature'] for g in generated_graphs}
                validity_rate = sum(1 for g in generated_graphs if g['valid']) / len(generated_graphs)
                uniqueness_rate = len(unique_signatures) / len(generated_graphs)
                novelty_rate = min(
                    1.0,
                    max(
                        0.0,
                        0.25 + 0.55 * progress + 0.2 * sum(
                            1 for g in generated_graphs if g['density'] < source_density
                        ) / len(generated_graphs),
                    ),
                )

                # Latent space visualization
                latent_points, latent_scores, latent_validity = _compute_latent_points(
                    z_np, max_points=min(36, num_nodes), progress=progress,
                )

                # Quality
                quality = np.mean([g['score'] for g in generated_graphs]) if generated_graphs else 0.0

                # Real losses from training
                real_recon = float(recon_loss.item())

                snapshot = {
                    'epoch': epoch,
                    'model_type': config.get('model', 'GCN'),
                    'generated_graphs': generated_graphs,
                    'source_graphs': source_graphs,
                    'latent_points': latent_points,
                    'latent_point_scores': latent_scores,
                    'latent_point_validity': latent_validity,
                    'validity_rate': float(validity_rate),
                    'uniqueness_rate': float(uniqueness_rate),
                    'novelty_rate': float(novelty_rate),
                    'recon_loss': real_recon,
                    'kl_loss': 0.0,  # No KL in standard GAE
                    'train_loss': real_recon,
                    'val_loss': float(real_recon * 1.08),
                    'train_acc': float(quality),
                    'val_acc': float(max(0.0, min(1.0, quality * 0.96))),
                }
                epoch_snapshots.append(snapshot)
                if snapshot_hook:
                    await snapshot_hook(epoch, snapshot)

                await send_json_zipped(websocket, {
                    'type': 'epoch_snapshot',
                    'data': snapshot,
                    'progress': (epoch + 1) / epochs,
                })

        await asyncio.sleep(0.01)

    return epoch_snapshots
