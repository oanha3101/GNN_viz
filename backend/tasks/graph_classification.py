"""
Task 2: Graph Classification
Trains a GNN with global pooling to classify entire graphs.
Generates 50 synthetic graphs (Erdős–Rényi class 0, Scale-free class 1).
"""
import asyncio
import math
import numpy as np
import torch
import torch.nn.functional as F
import networkx as nx
from sklearn.decomposition import PCA
from torch_geometric.data import Data, Batch
from torch_geometric.nn import GCNConv, GATConv, SAGEConv, global_add_pool, global_mean_pool
from utils.ws_msg import send_json_zipped


# ───────────────────────────────────────────────────────────────────────────────
# Attention-based Graph Classification Model (Explainable)
# ───────────────────────────────────────────────────────────────────────────────
class GraphClassifier(torch.nn.Module):
    def __init__(self, in_channels=1, hidden=32, num_classes=2, model_type='GCN', heads=4, dropout=0.5, pool_type='mean'):
        super().__init__()
        self.model_type = model_type
        self.dropout = dropout
        self.pool_type = pool_type

        if model_type == 'GAT':
            self.conv1 = GATConv(in_channels, hidden, heads=heads, dropout=dropout)
            self.conv2 = GATConv(hidden * heads, hidden, heads=1, concat=False, dropout=dropout)
        elif model_type == 'SAGE':
            self.conv1 = SAGEConv(in_channels, hidden)
            self.conv2 = SAGEConv(hidden, hidden)
        else:
            self.conv1 = GCNConv(in_channels, hidden)
            self.conv2 = GCNConv(hidden, hidden)

        # Attention layer for Readout
        self.att_gate = torch.nn.Linear(hidden, 1)

        self.lin = torch.nn.Linear(hidden, num_classes)

    def forward(self, x, edge_index, batch):
        x = self.conv1(x, edge_index)
        x = F.elu(x) if self.model_type == 'GAT' else F.relu(x)
        x = F.dropout(x, p=self.dropout, training=self.training)
        x = self.conv2(x, edge_index)
        x = F.elu(x) if self.model_type == 'GAT' else F.relu(x)
        node_embeddings = x

        # Compute attention weights alpha
        raw_alpha = self.att_gate(x).squeeze(-1)
        alpha = torch.zeros_like(raw_alpha)
        for graph_id in batch.unique(sorted=True):
            mask = batch == graph_id
            alpha[mask] = torch.softmax(raw_alpha[mask], dim=0)

        # Apply attention to nodes and pool
        x_g = alpha.unsqueeze(-1) * x
        if self.pool_type == 'add':
            graph_embeddings = global_add_pool(x_g, batch)
        else:
            graph_embeddings = global_mean_pool(x_g, batch)

        out = self.lin(graph_embeddings)
        return out, graph_embeddings, alpha


def split_graph_dataset(graphs, train_ratio=0.8, seed=42):
    labels_to_indices = {}
    for index, graph in enumerate(graphs):
        label = int(graph.y.view(-1)[0].item())
        labels_to_indices.setdefault(label, []).append(index)

    rng = np.random.default_rng(seed)
    train_indices = []
    test_indices = []

    for indices in labels_to_indices.values():
        shuffled = list(indices)
        rng.shuffle(shuffled)
        train_count = int(round(len(shuffled) * train_ratio))
        train_count = max(1, min(len(shuffled) - 1, train_count)) if len(shuffled) > 1 else len(shuffled)
        train_indices.extend(shuffled[:train_count])
        test_indices.extend(shuffled[train_count:])

    rng.shuffle(train_indices)
    rng.shuffle(test_indices)

    train_graphs = [graphs[index] for index in train_indices]
    test_graphs = [graphs[index] for index in test_indices]
    return train_graphs, test_graphs, train_indices, test_indices


def build_class_weight_tensor(labels, num_classes):
    counts = torch.bincount(torch.tensor(labels, dtype=torch.long), minlength=num_classes).float()
    counts = torch.clamp(counts, min=1.0)
    total = counts.sum()
    weights = total / (counts * max(1, num_classes))
    return weights


def compute_graph_classification_loss(logits, target, class_weights=None, focal_gamma=0.0, label_smoothing=0.0):
    ce = F.cross_entropy(
        logits,
        target,
        weight=class_weights,
        reduction='none',
        label_smoothing=label_smoothing,
    )
    if focal_gamma and focal_gamma > 0:
        probs = torch.softmax(logits, dim=1)
        pt = probs.gather(1, target.unsqueeze(1)).squeeze(1).clamp(min=1e-6, max=1.0)
        focal_factor = torch.pow(1.0 - pt, focal_gamma)
        ce = focal_factor * ce
    return ce.mean()


def _safe_corr(values_a, values_b):
    if len(values_a) != len(values_b) or len(values_a) < 3:
        return 0.0
    a = np.asarray(values_a, dtype=float)
    b = np.asarray(values_b, dtype=float)
    if np.std(a) < 1e-8 or np.std(b) < 1e-8:
        return 0.0
    return float(np.corrcoef(a, b)[0, 1])


def build_per_class_metrics(predictions, ground_truth, confidences, num_classes):
    rows = []
    for class_id in range(num_classes):
        support = sum(1 for gt in ground_truth if gt == class_id)
        predicted_count = sum(1 for pred in predictions if pred == class_id)
        tp = sum(1 for pred, gt in zip(predictions, ground_truth) if pred == class_id and gt == class_id)
        precision = tp / predicted_count if predicted_count > 0 else 0.0
        recall = tp / support if support > 0 else 0.0
        denom = precision + recall
        f1 = (2 * precision * recall / denom) if denom > 0 else 0.0
        class_conf = [confidences[index] for index, gt in enumerate(ground_truth) if gt == class_id]
        rows.append({
            'class_id': class_id,
            'support': int(support),
            'predicted_count': int(predicted_count),
            'true_positive': int(tp),
            'precision': float(precision),
            'recall': float(recall),
            'f1': float(f1),
            'mean_confidence': float(np.mean(class_conf)) if class_conf else 0.0,
        })
    return rows


def build_graph_calibration(confidences, correctness, bins=10):
    rows = []
    ece = 0.0
    n = max(1, len(confidences))
    for bucket in range(bins):
        lower = bucket / bins
        upper = (bucket + 1) / bins
        idxs = [i for i, confidence in enumerate(confidences) if lower <= confidence < upper or (bucket == bins - 1 and confidence == 1.0)]
        if not idxs:
            rows.append({
                'bin': bucket,
                'range': [lower, upper],
                'count': 0,
                'mean_confidence': 0.0,
                'accuracy': 0.0,
                'gap': 0.0,
            })
            continue
        mean_conf = float(np.mean([confidences[i] for i in idxs]))
        acc = float(np.mean([correctness[i] for i in idxs]))
        gap = abs(mean_conf - acc)
        ece += (len(idxs) / n) * gap
        rows.append({
            'bin': bucket,
            'range': [lower, upper],
            'count': int(len(idxs)),
            'mean_confidence': mean_conf,
            'accuracy': acc,
            'gap': float(gap),
        })
    return {
        'ece': float(ece),
        'bins': rows,
        'mean_confidence': float(np.mean(confidences)) if confidences else 0.0,
        'mean_accuracy': float(np.mean(correctness)) if correctness else 0.0,
    }


def build_structural_bias_signals(graphs_data, confidences, correctness, predictions):
    num_nodes = [graph['numNodes'] for graph in graphs_data]
    num_edges = [graph['numEdges'] for graph in graphs_data]
    density = []
    clustering = []
    avg_degree = []
    for graph in graphs_data:
        G = nx.Graph()
        G.add_nodes_from(range(graph['numNodes']))
        G.add_edges_from([(link['source'], link['target']) for link in graph['links']])
        if G.number_of_edges() > 0:
            density.append(float(nx.density(G)))
            clustering.append(float(nx.average_clustering(G)))
            avg_degree.append(float(np.mean([d for _, d in G.degree()])))
        else:
            density.append(0.0)
            clustering.append(0.0)
            avg_degree.append(0.0)

    pred_float = [float(value) for value in predictions]
    correct_float = [float(value) for value in correctness]
    return {
        'confidence_vs_num_nodes': _safe_corr(confidences, num_nodes),
        'confidence_vs_num_edges': _safe_corr(confidences, num_edges),
        'confidence_vs_density': _safe_corr(confidences, density),
        'confidence_vs_clustering': _safe_corr(confidences, clustering),
        'prediction_vs_num_nodes': _safe_corr(pred_float, num_nodes),
        'prediction_vs_density': _safe_corr(pred_float, density),
        'correctness_vs_num_nodes': _safe_corr(correct_float, num_nodes),
        'correctness_vs_density': _safe_corr(correct_float, density),
        'correctness_vs_avg_degree': _safe_corr(correct_float, avg_degree),
        'collection_summary': {
            'mean_num_nodes': float(np.mean(num_nodes)) if num_nodes else 0.0,
            'mean_num_edges': float(np.mean(num_edges)) if num_edges else 0.0,
            'mean_density': float(np.mean(density)) if density else 0.0,
            'mean_clustering': float(np.mean(clustering)) if clustering else 0.0,
            'mean_avg_degree': float(np.mean(avg_degree)) if avg_degree else 0.0,
        },
    }


# ───────────────────────────────────────────────────────────────────────────────
# Synthetic Graph Generation
# ───────────────────────────────────────────────────────────────────────────────
def generate_synthetic_graphs(num_graphs=50):
    """Generate 50 small graphs: 25 Erdős-Rényi (class 0), 25 Scale-free (class 1)."""
    graphs_data = []

    for i in range(num_graphs):
        n = np.random.randint(6, 14)
        gt_class = i % 2  # 0 = ER, 1 = Scale-free

        if gt_class == 0:
            # Erdős-Rényi — random connections
            g = nx.erdos_renyi_graph(n, p=0.4)
        else:
            # Scale-free (Barabási-Albert)
            m = max(1, n // 4)
            g = nx.barabasi_albert_graph(n, m)

        # Convert to PyG format
        edges = list(g.edges())
        if not edges:
            # Ensure at least one edge
            if n > 1:
                g.add_edge(0, 1)
            edges = list(g.edges())

        # Feature: degree normalized
        degrees = dict(g.degree())
        max_deg = max(degrees.values()) if degrees else 1
        x = torch.tensor([[degrees.get(j, 0) / max_deg] for j in range(n)], dtype=torch.float)

        if edges:
            edge_index_list = [[s, t] for s, t in edges] + [[t, s] for s, t in edges]
            edge_index = torch.tensor(edge_index_list, dtype=torch.long).t().contiguous()
        else:
            edge_index = torch.zeros((2, 0), dtype=torch.long)

        pyg_data = Data(x=x, edge_index=edge_index, y=torch.tensor([gt_class]))

        graphs_data.append({
            'id': i,
            'pyg': pyg_data,
            'groundTruth': gt_class,
            'nodes': [{'id': j} for j in range(n)],
            'links': [{'source': s, 'target': t} for s, t in edges],
            'numNodes': n,
            'numEdges': len(edges),
        })

    return graphs_data


# ───────────────────────────────────────────────────────────────────────────────
# Main Training Loop
# ───────────────────────────────────────────────────────────────────────────────
async def run_graph_classification(config, websocket, stop_flag, custom_graphs=None, snapshot_hook=None):
    """Train graph classification model and stream snapshots.
    
    Args:
        custom_graphs: Optional list of PyG Data objects from user upload.
                      Each Data should have .x, .edge_index, .y (graph label).
                      If None, synthetic graphs are generated.
    """
    epochs = config.get('epochs', 80)
    split_seed = int(config.get('split_seed', 42))
    train_ratio = float(config.get('train_ratio', 0.8))
    pool_type = config.get('task2_pool', 'mean')
    use_class_weights = bool(config.get('task2_class_weighting', False))
    balanced_oversample = bool(config.get('task2_balanced_sampler', True))
    focal_gamma = float(config.get('task2_focal_gamma', 1.5))
    label_smoothing = float(config.get('task2_label_smoothing', 0.03))
    weight_decay = float(config.get('task2_weight_decay', config.get('weight_decay', 5e-4)))

    if custom_graphs and len(custom_graphs) > 0:
        # ── Use user-uploaded graphs ──
        pyg_graphs = custom_graphs
        
        # Ensure all graphs have features
        for i, g in enumerate(pyg_graphs):
            if not hasattr(g, 'x') or g.x is None:
                # Auto-generate degree features
                num_n = g.num_nodes or (g.edge_index.max().item() + 1 if g.edge_index.size(1) > 0 else 1)
                degrees = torch.zeros(num_n)
                if g.edge_index.size(1) > 0:
                    for j in range(g.edge_index.size(1)):
                        degrees[g.edge_index[0, j]] += 1
                max_deg = degrees.max().clamp(min=1)
                g.x = (degrees / max_deg).unsqueeze(1)
            if not hasattr(g, 'y') or g.y is None:
                g.y = torch.tensor([0], dtype=torch.long)
        
        ground_truth = [int(g.y.item()) if g.y.dim() == 0 or g.y.size(0) == 1
                       else int(g.y[0].item()) for g in pyg_graphs]
        
        # Build graphs_json from PyG Data objects
        graphs_json = []
        for i, g in enumerate(pyg_graphs):
            edge_np = g.edge_index.cpu().numpy()
            edges = []
            seen = set()
            for j in range(edge_np.shape[1]):
                s, t = int(edge_np[0, j]), int(edge_np[1, j])
                key = (min(s, t), max(s, t))
                if key not in seen:
                    seen.add(key)
                    edges.append({'source': s, 'target': t})
            num_n = g.num_nodes or g.x.size(0)
            graphs_json.append({
                'id': i,
                'groundTruth': ground_truth[i],
                'nodes': [{'id': j} for j in range(num_n)],
                'links': edges,
                'numNodes': num_n,
                'numEdges': len(edges),
            })
        
        in_channels = pyg_graphs[0].x.size(1)
        num_classes = max(2, max(ground_truth) + 1)
        
        # Build graphs_data for structural metrics computation
        graphs_data = graphs_json
    else:
        # ── Generate synthetic graphs (fallback) ──
        graphs_data_raw = generate_synthetic_graphs(50)
        pyg_graphs = [g['pyg'] for g in graphs_data_raw]
        ground_truth = [g['groundTruth'] for g in graphs_data_raw]

        graphs_json = [{
            'id': g['id'],
            'groundTruth': g['groundTruth'],
            'nodes': g['nodes'],
            'links': g['links'],
            'numNodes': g['numNodes'],
            'numEdges': g['numEdges'],
        } for g in graphs_data_raw]
        
        graphs_data = graphs_json
        in_channels = 1
        num_classes = 2

    # Send graph structure to frontend first
    await send_json_zipped(websocket, {
        'type': 'graph_data',
        'data': {
            'graphs': graphs_json,
            'groundTruth': ground_truth,
        }
    })

    # Build model + optimizer
    model = GraphClassifier(
        in_channels=in_channels,
        hidden=config.get('hidden', 32),
        num_classes=num_classes,
        model_type=config.get('model', 'GCN'),
        heads=config.get('heads', 4),
        dropout=config.get('dropout', 0.5),
        pool_type=pool_type,
    )
    optimizer = torch.optim.Adam(model.parameters(), lr=config.get('lr', 0.01), weight_decay=weight_decay)

    # Prepare batched data with a stratified split to keep class support stable.
    train_graphs, test_graphs, train_indices, _ = split_graph_dataset(
        pyg_graphs,
        train_ratio=train_ratio,
        seed=split_seed,
    )
    if not test_graphs:
        test_graphs = train_graphs

    train_labels = [int(g.y.view(-1)[0].item()) for g in train_graphs]
    train_label_counts = torch.bincount(torch.tensor(train_labels, dtype=torch.long), minlength=num_classes)
    class_weights = build_class_weight_tensor(train_labels, num_classes) if use_class_weights else None

    effective_train_graphs = train_graphs
    if balanced_oversample and train_graphs:
        label_to_graphs = {}
        for graph in train_graphs:
            label = int(graph.y.view(-1)[0].item())
            label_to_graphs.setdefault(label, []).append(graph)
        target_count = max(len(items) for items in label_to_graphs.values())
        rng = np.random.default_rng(split_seed)
        oversampled = []
        for label in sorted(label_to_graphs.keys()):
            graphs_for_label = label_to_graphs[label]
            oversampled.extend(graphs_for_label)
            deficit = target_count - len(graphs_for_label)
            if deficit > 0:
                extra_indices = rng.choice(len(graphs_for_label), size=deficit, replace=True)
                oversampled.extend([graphs_for_label[index] for index in extra_indices])
        rng.shuffle(oversampled)
        effective_train_graphs = oversampled

    train_batch = Batch.from_data_list(train_graphs)
    test_batch = Batch.from_data_list(test_graphs)
    effective_train_batch = Batch.from_data_list(effective_train_graphs)

    train_y = torch.tensor([g.y.item() for g in train_graphs])
    effective_train_y = torch.tensor([g.y.item() for g in effective_train_graphs])
    test_y = torch.tensor([g.y.item() for g in test_graphs])

    epoch_snapshots = []

    for epoch in range(epochs):
        if stop_flag():
            break

        # ── Training ───────────────────────────────────────────────────────
        model.train()
        optimizer.zero_grad()
        out, _, _ = model(effective_train_batch.x, effective_train_batch.edge_index, effective_train_batch.batch)
        loss = compute_graph_classification_loss(
            out,
            effective_train_y,
            class_weights=class_weights,
            focal_gamma=focal_gamma,
            label_smoothing=label_smoothing,
        )
        loss.backward()
        optimizer.step()

        # ── Evaluation ─────────────────────────────────────────────────────
        model.eval()
        with torch.no_grad():
            # Get predictions for ALL graphs
            all_batch = Batch.from_data_list(pyg_graphs)
            all_out, graph_embs, node_embs = model(all_batch.x, all_batch.edge_index, all_batch.batch)
            all_pred = all_out.argmax(dim=1).tolist()
            all_probs = F.softmax(all_out, dim=1).tolist()

            # Compute confidence (max prob)
            confidences = [max(p) for p in all_probs]

            # Test metrics
            test_out, _, _ = model(test_batch.x, test_batch.edge_index, test_batch.batch)
            test_pred = test_out.argmax(dim=1)
            train_out, _, _ = model(train_batch.x, train_batch.edge_index, train_batch.batch)
            train_pred = train_out.argmax(dim=1)

            val_loss = compute_graph_classification_loss(
                test_out,
                test_y,
                class_weights=class_weights,
                focal_gamma=0.0,
                label_smoothing=0.0,
            )
            val_acc = (test_pred == test_y).float().mean()
            train_acc = (train_pred == train_y).float().mean()

            # PCA on graph embeddings
            emb_np = graph_embs.cpu().numpy()
            if emb_np.shape[0] >= 2:
                pca = PCA(n_components=2)
                emb_2d = pca.fit_transform(emb_np).tolist()
            else:
                emb_2d = [[0.0, 0.0]] * len(pyg_graphs)
                
            # Node contributions based on LEARNED ATTENTION (alpha)
            node_alphas_np = node_embs.cpu().numpy() # This is the alpha returned from model
            
            node_contributions = []
            ptr = 0
            for g in pyg_graphs:
                num_n = g.x.size(0)
                alphas = node_alphas_np[ptr : ptr + num_n]
                # Scale alphas to [0, 1] for better visualization contrast
                min_a, max_a = alphas.min(), alphas.max()
                if max_a > min_a:
                    norm_alphas = ((alphas - min_a) / (max_a - min_a + 1e-8)).tolist()
                else:
                    norm_alphas = [0.5] * int(num_n)
                node_contributions.append(norm_alphas)
                ptr += num_n

            # Per-graph correctness (for BatchHeatmap)
            graph_truths = [g.y.item() for g in pyg_graphs]
            graph_correct = [int(all_pred[i] == graph_truths[i]) for i in range(len(pyg_graphs))]

            # ── Explainability Data ─────────────────────────────────────────
            
            # 1. Full class probabilities per graph (not just max)
            graph_probabilities = all_probs  # Already computed
            
            # 2. Confidence margin (top-1 vs top-2)
            confidence_margins = []
            for probs in all_probs:
                sorted_probs = sorted(probs, reverse=True)
                if len(sorted_probs) >= 2:
                    margin = sorted_probs[0] - sorted_probs[1]
                else:
                    margin = sorted_probs[0]
                confidence_margins.append(float(margin))
            
            # 3. Attention entropy per graph (how focused vs diffused)
            attention_entropy = []
            ptr = 0
            for g in pyg_graphs:
                num_n = g.x.size(0)
                alphas = node_alphas_np[ptr : ptr + num_n]
                # Normalize to probability distribution
                alpha_sum = alphas.sum()
                if alpha_sum > 0:
                    alpha_probs = alphas / alpha_sum
                    # Compute entropy: -sum(p * log(p))
                    entropy = -np.sum(alpha_probs * np.log(alpha_probs + 1e-8))
                    # Normalize by max entropy (uniform distribution)
                    max_entropy = np.log(num_n)
                    normalized_entropy = float(entropy / max_entropy) if max_entropy > 0 else 0.0
                else:
                    normalized_entropy = 0.0
                attention_entropy.append(normalized_entropy)
                ptr += num_n
            
            # 4. Structural metrics per graph
            graph_structural_metrics = []
            for g in graphs_data:
                G = nx.Graph()
                G.add_nodes_from(range(g['numNodes']))
                G.add_edges_from([(link['source'], link['target']) for link in g['links']])
                
                if G.number_of_edges() > 0:
                    density = nx.density(G)
                    avg_clustering = nx.average_clustering(G)
                    avg_degree = np.mean([d for n, d in G.degree()])
                else:
                    density = 0.0
                    avg_clustering = 0.0
                    avg_degree = 0.0
                
                graph_structural_metrics.append({
                    'density': float(density),
                    'avg_clustering': float(avg_clustering),
                    'avg_degree': float(avg_degree),
                })

            graph_per_class_metrics = build_per_class_metrics(
                predictions=all_pred,
                ground_truth=graph_truths,
                confidences=confidences,
                num_classes=num_classes,
            )
            graph_calibration = build_graph_calibration(confidences, graph_correct)
            structural_bias_signals = build_structural_bias_signals(
                graphs_data=graphs_data,
                confidences=confidences,
                correctness=graph_correct,
                predictions=all_pred,
            )

        snapshot = {
            'epoch': epoch,
            'model_type': config.get('model', 'GCN'),
            'graph_predictions': all_pred,
            'graph_probabilities': graph_probabilities,
            'graph_confidences': confidences,
            'confidence_margins': confidence_margins,
            'attention_entropy': attention_entropy,
            'graph_structural_metrics': graph_structural_metrics,
            'graph_correct': graph_correct,
            'graph_embeddings_2d': emb_2d,
            'node_contributions': node_contributions,
            'graph_per_class_metrics': graph_per_class_metrics,
            'graph_calibration': graph_calibration,
            'structural_bias_signals': structural_bias_signals,
            'train_loss': float(loss.item()),
            'val_loss': float(val_loss.item()),
            'train_acc': float(train_acc.item()),
            'val_acc': float(val_acc.item()),
        }
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
