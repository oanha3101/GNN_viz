import asyncio
import math
import random
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from sklearn.decomposition import PCA
from utils.ws_msg import send_json_zipped


executor = ThreadPoolExecutor(max_workers=2)


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


def _graph_density(num_nodes, num_edges):
    denom = max(1, num_nodes * (num_nodes - 1) / 2)
    return num_edges / denom


def _generate_graph(seed, source_degrees, target_density, quality, source_density=None):
    rng = random.Random(seed)
    num_nodes = rng.randint(5, 11)
    nodes = [{'id': i} for i in range(num_nodes)]
    edges = []
    edge_set = set()

    def add_edge(s, t):
        if s == t:
            return
        key = (min(s, t), max(s, t))
        if key in edge_set:
            return
        edge_set.add(key)
        edges.append(key)

    # Start with a connected backbone, but let low-quality epochs still fail sometimes.
    for node in range(1, num_nodes):
        if source_degrees:
            bias = source_degrees[(seed + node) % len(source_degrees)]
            parent = min(node - 1, int((bias / max(1, max(source_degrees))) * max(0, node - 1)))
        else:
            parent = rng.randint(0, node - 1)
        add_edge(node, parent)

    desired_edges = max(
        num_nodes - 1,
        min(
            int(round(target_density * num_nodes * (num_nodes - 1) / 2)),
            num_nodes * (num_nodes - 1) // 2,
        ),
    )

    tries = 0
    while len(edges) < desired_edges and tries < num_nodes * num_nodes * 4:
        tries += 1
        s = rng.randint(0, num_nodes - 1)
        t = rng.randint(0, num_nodes - 1)
        add_edge(s, t)

    # Early epochs intentionally inject a few invalid/weak samples.
    if quality < 0.45 and rng.random() > quality:
        if edges:
            edges.pop()
        if quality < 0.25 and edges:
            edges.pop()

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
            + 0.3 * (1.0 - min(1.0, abs(density - target_density) * 3.0))
            + 0.25 * (1.0 - isolated / max(1, num_nodes)),
        ),
    )

    # ── Explainability: Invalidity Reason ────────────────────────────────────
    invalidity_reason = None
    if not connected and isolated > 0:
        invalidity_reason = f'Disconnected + {isolated} isolated nodes'
    elif not connected:
        invalidity_reason = 'Disconnected (multiple components)'
    elif isolated > 0:
        invalidity_reason = f'{isolated} isolated node(s)'
    elif source_density is not None and abs(density - source_density) > source_density * 0.5:
        invalidity_reason = f'Density mismatch (gen: {density:.2f}, source: {source_density:.2f})'
    
    # ── Source vs Generated Comparison ───────────────────────────────────────
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
            'matches_source': matches_source
        }

    return {
        'nodes': nodes,
        'links': [{'source': s, 'target': t} for s, t in edges],
        'valid': connected and isolated == 0,
        'score': score,
        'density': density,
        'avg_degree': avg_degree,
        'isolated_ratio': isolated / max(1, num_nodes),
        'signature': _graph_signature(edges),
        'invalidity_reason': invalidity_reason,
        'comparison_metrics': comparison_metrics,
        'matches_source': matches_source,
    }


def _compute_latent_points(feature_matrix, max_points, progress):
    sample = feature_matrix[:max_points]
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


def _sample_source_graphs(data, num_samples=6, min_nodes=5, max_nodes=10):
    edge_index = data.edge_index.cpu().numpy()
    num_nodes_total = data.x.size(0)
    adj = [[] for _ in range(num_nodes_total)]
    for i in range(edge_index.shape[1]):
        u, v = int(edge_index[0, i]), int(edge_index[1, i])
        adj[u].append(v)
        adj[v].append(u)

    samples = []
    rng = random.Random(42)  # Fixed seed for consistency
    
    # Try to find connected subgraphs
    nodes_pool = list(range(num_nodes_total))
    rng.shuffle(nodes_pool)
    
    for start_node in nodes_pool:
        if len(samples) >= num_samples:
            break
            
        # BFS to get a small neighborhood
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


def _epoch_payload(epoch, epochs, data, source_graphs_cache=None):
    progress = epoch / max(1, epochs - 1)
    edge_index_np = data.edge_index.cpu().numpy()
    num_nodes = int(data.x.size(0))
    adj = _build_adj_list(edge_index_np, num_nodes)
    source_degrees = sorted((len(neigh) for neigh in adj), reverse=True)
    source_density = _graph_density(num_nodes, edge_index_np.shape[1] // 2)

    generated_graphs = []
    for g_idx in range(6):
        # Use a stable seed per slot (g_idx) so the base structure stays similar across epochs,
        # but let the quality and density evolve smoothly.
        graph = _generate_graph(
            seed=g_idx * 1337 + 42, 
            source_degrees=source_degrees,
            target_density=max(0.12, min(0.72, source_density * (0.8 + progress * 0.6))),
            quality=0.18 + 0.72 * math.pow(progress, 0.85),
            source_density=source_density,
        )
        graph['id'] = g_idx
        generated_graphs.append(graph)

    unique_signatures = {g['signature'] for g in generated_graphs}
    validity_rate = sum(1 for g in generated_graphs if g['valid']) / len(generated_graphs)
    uniqueness_rate = len(unique_signatures) / len(generated_graphs)
    novelty_rate = min(
        1.0,
        max(
            0.0,
            0.25 + 0.55 * progress + 0.2 * sum(1 for g in generated_graphs if g['density'] < source_density) / len(generated_graphs),
        ),
    )

    latent_points, latent_scores, latent_validity = _compute_latent_points(
        data.x.cpu().numpy(),
        max_points=min(36, num_nodes),
        progress=progress,
    )

    recon_loss = max(0.05, 1.8 * math.exp(-epoch / max(8, epochs / 4)) + (1.0 - validity_rate) * 0.3)
    kl_loss = max(0.01, 0.5 * math.exp(-epoch / max(10, epochs / 3)) + (1.0 - uniqueness_rate) * 0.15)
    quality = np.mean([g['score'] for g in generated_graphs]) if generated_graphs else 0.0

    for graph in generated_graphs:
        graph.pop('signature', None)

    return {
        'epoch': epoch,
        'generated_graphs': generated_graphs,
        'source_graphs': source_graphs_cache or [],
        'latent_points': latent_points,
        'latent_point_scores': latent_scores,
        'latent_point_validity': latent_validity,
        'validity_rate': float(validity_rate),
        'uniqueness_rate': float(uniqueness_rate),
        'novelty_rate': float(novelty_rate),
        'recon_loss': float(recon_loss),
        'kl_loss': float(kl_loss),
        'train_loss': float(recon_loss + kl_loss),
        'val_loss': float((recon_loss + kl_loss) * 1.08),
        'train_acc': float(quality),
        'val_acc': float(max(0.0, min(1.0, quality * 0.96))),
    }


async def run_graph_generation(config, data, websocket, stop_flag):
    epochs = config.get('epochs', 50)
    loop = asyncio.get_event_loop()
    snapshots = []
    
    # Pre-sample source graphs once
    source_graphs = _sample_source_graphs(data)

    for epoch in range(epochs):
        if stop_flag():
            break

        snapshot = await loop.run_in_executor(executor, _epoch_payload, epoch, epochs, data, source_graphs)
        snapshots.append(snapshot)
        await send_json_zipped(websocket, {
            'type': 'epoch_snapshot',
            'data': snapshot,
            'progress': (epoch + 1) / epochs,
        })
        await asyncio.sleep(0.01)

    return snapshots
