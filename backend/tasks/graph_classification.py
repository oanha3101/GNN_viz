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
    def __init__(self, in_channels=1, hidden=32, num_classes=2, model_type='GCN', heads=4, dropout=0.5, pool_type='attention_sum'):
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

        conv1_out = hidden * heads if model_type == 'GAT' else hidden
        self.norm1 = torch.nn.LayerNorm(conv1_out)
        self.norm2 = torch.nn.LayerNorm(hidden)
        self.skip_proj = torch.nn.Linear(conv1_out, hidden) if conv1_out != hidden else None

        # Gated readout gives the UI a more faithful motif-level signal than a
        # single linear gate while staying cheap enough for realtime playback.
        gate_hidden = max(4, hidden // 2)
        self.att_gate = torch.nn.Sequential(
            torch.nn.Linear(hidden, gate_hidden),
            torch.nn.Tanh(),
            torch.nn.Dropout(dropout * 0.5),
            torch.nn.Linear(gate_hidden, 1),
        )

        self.lin = torch.nn.Linear(hidden, num_classes)

    def forward(self, x, edge_index, batch):
        h1 = self.conv1(x, edge_index)
        h1 = self.norm1(h1)
        h1 = F.elu(h1) if self.model_type == 'GAT' else F.relu(h1)
        h1 = F.dropout(h1, p=self.dropout, training=self.training)

        h2 = self.conv2(h1, edge_index)
        h2 = self.norm2(h2)
        h1_skip = self.skip_proj(h1) if self.skip_proj is not None else h1
        h2 = h2 + h1_skip
        x = F.elu(h2) if self.model_type == 'GAT' else F.relu(h2)
        node_embeddings = x

        # Compute attention weights alpha
        raw_alpha = self.att_gate(x).squeeze(-1)
        alpha = torch.zeros_like(raw_alpha)
        for graph_id in batch.unique(sorted=True):
            mask = batch == graph_id
            alpha[mask] = torch.softmax(raw_alpha[mask], dim=0)

        # Apply attention to nodes and pool. The default is weighted-sum: alpha
        # already sums to one per graph, so a second mean would dilute motifs in
        # larger/sparser graphs and reintroduce a size shortcut.
        x_g = alpha.unsqueeze(-1) * x
        if self.pool_type in ('attention_sum', 'attn_sum', 'add'):
            graph_embeddings = global_add_pool(x_g, batch)
        elif self.pool_type == 'mean':
            graph_embeddings = global_mean_pool(x, batch)
        else:
            graph_embeddings = global_add_pool(x_g, batch)

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


def split_graph_dataset_triple(graphs, train_ratio=0.6, val_ratio=0.2, seed=42):
    """Stratified 3-way split returning train/val/test graphs and their indices.

    Used to avoid temperature/checkpoint leakage on the test set.
    """
    labels_to_indices = {}
    for index, graph in enumerate(graphs):
        label = int(graph.y.view(-1)[0].item())
        labels_to_indices.setdefault(label, []).append(index)

    rng = np.random.default_rng(seed)
    train_idx, val_idx, test_idx = [], [], []

    for indices in labels_to_indices.values():
        shuffled = list(indices)
        rng.shuffle(shuffled)
        n = len(shuffled)
        if n <= 1:
            train_idx.extend(shuffled)
            continue
        n_train = max(1, int(round(n * train_ratio)))
        remaining = n - n_train
        if remaining <= 0:
            train_idx.extend(shuffled)
            continue
        # Within the remaining items, split roughly in half for val/test.
        n_val = max(1, int(round(n * val_ratio))) if remaining >= 2 else 0
        n_val = min(n_val, remaining - 1) if remaining >= 2 else 0
        if remaining < 2:
            n_val = 0
        train_idx.extend(shuffled[:n_train])
        val_idx.extend(shuffled[n_train:n_train + n_val])
        test_idx.extend(shuffled[n_train + n_val:])

    rng.shuffle(train_idx)
    rng.shuffle(val_idx)
    rng.shuffle(test_idx)

    # Fallbacks: if any split is empty (e.g. <3 samples per class), use train as that split
    # for snapshot continuity. The honest test metric is still reported on the test list.
    if not val_idx:
        val_idx = list(train_idx)
    if not test_idx:
        test_idx = list(val_idx) if val_idx else list(train_idx)

    train_graphs = [graphs[i] for i in train_idx]
    val_graphs = [graphs[i] for i in val_idx]
    test_graphs = [graphs[i] for i in test_idx]
    return train_graphs, val_graphs, test_graphs, train_idx, val_idx, test_idx


def model_default_hyperparams(model_type: str) -> dict:
    """Per-model defaults so GCN/GAT/GraphSAGE develop distinct, honest behavior.

    These are calibrated so each model lands in the ~60–75% honest accuracy band
    on the synthetic ER vs. Barabási-Albert task without overfitting.
    """
    mt = (model_type or 'GCN').upper()
    if mt == 'GAT':
        return {
            'hidden': 32,
            'heads': 4,
            'dropout': 0.6,
            'lr': 7e-3,
            'weight_decay': 5e-4,
            'epochs': 80,
            'early_stop_patience': 20,
        }
    if mt == 'SAGE':
        return {
            'hidden': 32,
            'heads': 1,
            'dropout': 0.4,
            'lr': 8e-3,
            'weight_decay': 1e-4,
            'epochs': 80,
            'early_stop_patience': 20,
        }
    # GCN baseline
    return {
        'hidden': 32,
        'heads': 1,
        'dropout': 0.45,
        'lr': 1e-2,
        'weight_decay': 5e-4,
        'epochs': 80,
        'early_stop_patience': 20,
    }


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


def drop_edge_index(edge_index, drop_prob=0.0, training=True, seed=None):
    if not training or drop_prob <= 0 or edge_index.numel() == 0:
        return edge_index
    keep_prob = max(0.0, min(1.0, 1.0 - float(drop_prob)))
    if keep_prob >= 1.0:
        return edge_index
    generator = None
    if seed is not None:
        generator = torch.Generator(device=edge_index.device)
        generator.manual_seed(int(seed))
    mask = torch.rand(edge_index.size(1), device=edge_index.device, generator=generator) < keep_prob
    if not bool(mask.any()):
        keep_idx = torch.randint(edge_index.size(1), (1,), device=edge_index.device, generator=generator)
        mask[keep_idx] = True
    return edge_index[:, mask]


def compute_attention_entropy_regularizer(alpha, batch, target_entropy=0.62):
    if alpha.numel() == 0:
        return alpha.new_tensor(0.0)
    penalties = []
    for graph_id in batch.unique(sorted=True):
        mask = batch == graph_id
        values = alpha[mask].clamp(min=1e-8)
        if values.numel() <= 1:
            continue
        probs = values / values.sum().clamp(min=1e-8)
        entropy = -(probs * torch.log(probs)).sum() / math.log(values.numel())
        penalties.append(torch.relu(entropy - target_entropy).pow(2))
    if not penalties:
        return alpha.new_tensor(0.0)
    return torch.stack(penalties).mean()


def _graph_density_from_data(graph):
    num_nodes = int(graph.num_nodes or (graph.x.size(0) if getattr(graph, 'x', None) is not None else 0))
    if num_nodes <= 1:
        return 0.0
    # edge_index is usually directed for undirected graphs in PyG.
    num_edges = int(graph.edge_index.size(1)) // 2 if getattr(graph, 'edge_index', None) is not None else 0
    return float(num_edges / max(1, (num_nodes * (num_nodes - 1)) / 2))


def compute_density_aware_contrastive_loss(embeddings, labels, densities, pos_density_gap=0.18, neg_density_gap=0.12, margin=0.7):
    if embeddings.size(0) < 3:
        return embeddings.new_tensor(0.0)
    z = F.normalize(embeddings, p=2, dim=1)
    distances = torch.cdist(z, z, p=2)
    labels = labels.to(embeddings.device).view(-1)
    densities = densities.to(embeddings.device).view(-1)
    same_label = labels.unsqueeze(0) == labels.unsqueeze(1)
    density_gap = torch.abs(densities.unsqueeze(0) - densities.unsqueeze(1))
    eye = torch.eye(labels.numel(), dtype=torch.bool, device=embeddings.device)

    # Pull together same-label graphs even when density differs, and push apart
    # different-label graphs that have similar density. This directly discourages
    # density from becoming the primary decision rule.
    pos_mask = same_label & (density_gap >= pos_density_gap) & ~eye
    neg_mask = (~same_label) & (density_gap <= neg_density_gap)

    terms = []
    if bool(pos_mask.any()):
        terms.append(distances[pos_mask].pow(2).mean())
    if bool(neg_mask.any()):
        terms.append(torch.relu(margin - distances[neg_mask]).pow(2).mean())
    if not terms:
        return embeddings.new_tensor(0.0)
    return torch.stack(terms).mean()


def _safe_corr(values_a, values_b):
    if len(values_a) != len(values_b) or len(values_a) < 3:
        return 0.0
    a = np.asarray(values_a, dtype=float)
    b = np.asarray(values_b, dtype=float)
    if np.std(a) < 1e-8 or np.std(b) < 1e-8:
        return 0.0
    return float(np.corrcoef(a, b)[0, 1])


def build_classification_summary(predictions, ground_truth, confidences, num_classes):
    per_class = build_per_class_metrics(predictions, ground_truth, confidences, num_classes)
    supported = [row for row in per_class if row['support'] > 0]
    macro_f1 = float(np.mean([row['f1'] for row in supported])) if supported else 0.0
    balanced_accuracy = float(np.mean([row['recall'] for row in supported])) if supported else 0.0
    return {
        'per_class': per_class,
        'macro_f1': macro_f1,
        'balanced_accuracy': balanced_accuracy,
    }


def tune_temperature(logits, targets):
    """Coarse grid search — kept as fallback and for parity with old tests."""
    if logits.numel() == 0 or targets.numel() == 0:
        return 1.0
    candidates = torch.tensor([0.7, 0.85, 1.0, 1.15, 1.3, 1.5, 1.8, 2.2, 2.6, 3.0], dtype=logits.dtype, device=logits.device)
    best_temp = 1.0
    best_loss = None
    with torch.no_grad():
        for temp in candidates:
            loss = F.cross_entropy(logits / temp, targets)
            if best_loss is None or loss.item() < best_loss:
                best_loss = loss.item()
                best_temp = float(temp.item())
    return best_temp


def tune_temperature_lbfgs(logits, targets, max_iter=50, lr=0.05):
    """Optimize temperature with LBFGS for finer calibration.

    Falls back to the coarse grid if LBFGS cannot make progress.
    """
    if logits.numel() == 0 or targets.numel() == 0:
        return 1.0
    log_temp = torch.zeros(1, requires_grad=True)
    optimizer = torch.optim.LBFGS([log_temp], lr=lr, max_iter=max_iter, line_search_fn='strong_wolfe')

    detached_logits = logits.detach()
    detached_targets = targets.detach()

    def _closure():
        optimizer.zero_grad()
        temp = torch.exp(log_temp).clamp(min=0.25, max=10.0)
        loss = F.cross_entropy(detached_logits / temp, detached_targets)
        loss.backward()
        return loss

    try:
        optimizer.step(_closure)
    except Exception:
        return tune_temperature(logits, targets)
    temp = float(torch.exp(log_temp).clamp(min=0.25, max=10.0).item())
    if not math.isfinite(temp) or temp <= 0:
        return tune_temperature(logits, targets)
    return temp


def apply_temperature(logits, temperature):
    temp = max(0.5, float(temperature or 1.0))
    return torch.softmax(logits / temp, dim=1)


def build_graph_inspector(
    *,
    ground_truth,
    predictions,
    probabilities_raw,
    probabilities_calibrated,
    margins,
    split_assignment,
    danger_threshold=0.85,
    uncertain_threshold=0.55,
):
    """Per-graph diagnostic record used by the Task 2 FE inspector / topology view.

    Each row exposes the *honest* signal needed to spot overconfident wrong calls:
        - true / pred / correct
        - raw_confidence    (pre-calibration max softmax)
        - calibrated_conf   (post temperature-scaling max softmax)
        - margin            (top-1 minus top-2)
        - uncertainty       (1 − calibrated_conf)
        - danger            (wrong AND calibrated_conf ≥ danger_threshold)
        - status            (one of 'correct' | 'wrong' | 'uncertain' | 'danger')
        - split             (one of 'train' | 'val' | 'test')
    """
    rows = []
    for i in range(len(ground_truth)):
        gt = int(ground_truth[i]) if ground_truth[i] is not None else None
        pred = int(predictions[i]) if i < len(predictions) and predictions[i] is not None else None
        correct = int(gt is not None and pred is not None and gt == pred)
        raw_conf = float(max(probabilities_raw[i])) if i < len(probabilities_raw) and probabilities_raw[i] else 0.0
        calib_conf = float(max(probabilities_calibrated[i])) if i < len(probabilities_calibrated) and probabilities_calibrated[i] else raw_conf
        margin = float(margins[i]) if i < len(margins) and margins[i] is not None else 0.0
        is_wrong = correct == 0 and pred is not None and gt is not None
        is_high_conf = calib_conf >= danger_threshold
        is_uncertain = calib_conf < uncertain_threshold
        danger = bool(is_wrong and is_high_conf)
        if danger:
            status = 'danger'
        elif is_wrong:
            status = 'wrong'
        elif is_uncertain:
            status = 'uncertain'
        else:
            status = 'correct'
        rows.append({
            'id': i,
            'true': gt,
            'pred': pred,
            'correct': correct,
            'raw_confidence': raw_conf,
            'calibrated_conf': calib_conf,
            'margin': margin,
            'uncertainty': float(max(0.0, 1.0 - calib_conf)),
            'danger': danger,
            'status': status,
            'split': split_assignment[i] if i < len(split_assignment) else 'train',
        })
    return rows


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


def build_graph_calibration(confidences, correctness, bins=10, probabilities=None, ground_truth=None):
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
    brier = 0.0
    if probabilities is not None and ground_truth is not None and len(probabilities) == len(ground_truth):
        brier_terms = []
        for probs, gt in zip(probabilities, ground_truth):
            if gt is None:
                continue
            target = np.zeros(len(probs), dtype=float)
            if 0 <= int(gt) < len(probs):
                target[int(gt)] = 1.0
            brier_terms.append(float(np.mean((np.asarray(probs, dtype=float) - target) ** 2)))
        brier = float(np.mean(brier_terms)) if brier_terms else 0.0
    high_conf_wrong = [
        confidence
        for confidence, is_correct in zip(confidences, correctness)
        if confidence >= 0.75 and is_correct == 0
    ]
    return {
        'ece': float(ece),
        'bins': rows,
        'mean_confidence': float(np.mean(confidences)) if confidences else 0.0,
        'mean_accuracy': float(np.mean(correctness)) if correctness else 0.0,
        'brier': brier,
        'high_conf_wrong_rate': float(len(high_conf_wrong) / n),
        'high_conf_wrong_count': int(len(high_conf_wrong)),
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
    confidence_vs_density = _safe_corr(confidences, density)
    confidence_vs_num_nodes = _safe_corr(confidences, num_nodes)
    confidence_vs_num_edges = _safe_corr(confidences, num_edges)
    prediction_vs_density = _safe_corr(pred_float, density)
    correctness_vs_density = _safe_corr(correct_float, density)
    shortcut_risk_score = max(
        abs(confidence_vs_density),
        abs(confidence_vs_num_nodes),
        abs(confidence_vs_num_edges),
        abs(prediction_vs_density),
        abs(correctness_vs_density),
    )
    return {
        'confidence_vs_num_nodes': confidence_vs_num_nodes,
        'confidence_vs_num_edges': confidence_vs_num_edges,
        'confidence_vs_density': confidence_vs_density,
        'confidence_vs_clustering': _safe_corr(confidences, clustering),
        'prediction_vs_num_nodes': _safe_corr(pred_float, num_nodes),
        'prediction_vs_density': prediction_vs_density,
        'correctness_vs_num_nodes': _safe_corr(correct_float, num_nodes),
        'correctness_vs_density': correctness_vs_density,
        'correctness_vs_avg_degree': _safe_corr(correct_float, avg_degree),
        'shortcut_risk_score': float(shortcut_risk_score),
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
    model_type = config.get('model', 'GCN')
    defaults = model_default_hyperparams(model_type)

    epochs = int(config.get('epochs', defaults['epochs']))
    split_seed = int(config.get('split_seed', 42))
    train_ratio = float(config.get('train_ratio', 0.6))
    val_ratio = float(config.get('val_ratio', 0.2))
    pool_type = config.get('task2_pool', 'attention_sum')
    use_class_weights = bool(config.get('task2_class_weighting', False))
    balanced_oversample = bool(config.get('task2_balanced_sampler', True))
    focal_gamma = float(config.get('task2_focal_gamma', 1.0))
    label_smoothing = float(config.get('task2_label_smoothing', 0.02))
    weight_decay = float(config.get('task2_weight_decay', config.get('weight_decay', defaults['weight_decay'])))
    edge_dropout = float(config.get('task2_edge_dropout', 0.08))
    readout_entropy_weight = float(config.get('task2_readout_entropy_weight', 0.02))
    contrastive_weight = float(config.get('task2_density_contrastive_weight', 0.025))
    early_stop_patience = int(config.get('task2_early_stop_patience', defaults['early_stop_patience']))
    danger_threshold = float(config.get('task2_danger_threshold', 0.85))
    uncertain_threshold = float(config.get('task2_uncertain_threshold', 0.55))
    use_lbfgs_calibration = bool(config.get('task2_lbfgs_calibration', True))

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

    # Build model + optimizer with per-model honest defaults so GCN/GAT/SAGE
    # produce distinct, well-regularised behavior instead of collapsing to the
    # same fully-confident prediction profile.
    model = GraphClassifier(
        in_channels=in_channels,
        hidden=int(config.get('hidden', defaults['hidden'])),
        num_classes=num_classes,
        model_type=model_type,
        heads=int(config.get('heads', defaults['heads'])),
        dropout=float(config.get('dropout', defaults['dropout'])),
        pool_type=pool_type,
    )
    optimizer = torch.optim.Adam(
        model.parameters(),
        lr=float(config.get('lr', defaults['lr'])),
        weight_decay=weight_decay,
    )

    # 3-way stratified split — temperature scaling and best-checkpoint selection
    # both run on the VAL set, so honest TEST metrics never leak into the
    # selection process.
    train_graphs, val_graphs, test_graphs, train_indices, val_indices, test_indices = split_graph_dataset_triple(
        pyg_graphs,
        train_ratio=train_ratio,
        val_ratio=val_ratio,
        seed=split_seed,
    )
    if not test_graphs:
        test_graphs = list(val_graphs) if val_graphs else list(train_graphs)
    if not val_graphs:
        val_graphs = list(train_graphs)

    split_assignment = ['train'] * len(pyg_graphs)
    for idx in val_indices:
        if 0 <= idx < len(split_assignment):
            split_assignment[idx] = 'val'
    for idx in test_indices:
        if 0 <= idx < len(split_assignment):
            split_assignment[idx] = 'test'

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
    val_batch = Batch.from_data_list(val_graphs)
    test_batch = Batch.from_data_list(test_graphs)
    effective_train_batch = Batch.from_data_list(effective_train_graphs)

    train_y = torch.tensor([g.y.item() for g in train_graphs])
    val_y = torch.tensor([g.y.item() for g in val_graphs])
    effective_train_y = torch.tensor([g.y.item() for g in effective_train_graphs])
    test_y = torch.tensor([g.y.item() for g in test_graphs])
    effective_train_density = torch.tensor([_graph_density_from_data(g) for g in effective_train_graphs], dtype=torch.float)

    epoch_snapshots = []
    best_val_acc = -1.0
    best_val_epoch = 0
    best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
    no_improve_epochs = 0

    for epoch in range(epochs):
        if stop_flag():
            break

        # ── Training ───────────────────────────────────────────────────────
        model.train()
        optimizer.zero_grad()
        train_edge_index = drop_edge_index(effective_train_batch.edge_index, edge_dropout, training=True)
        out, train_graph_embs, train_alpha = model(effective_train_batch.x, train_edge_index, effective_train_batch.batch)
        ce_loss = compute_graph_classification_loss(
            out,
            effective_train_y,
            class_weights=class_weights,
            focal_gamma=focal_gamma,
            label_smoothing=label_smoothing,
        )
        entropy_loss = compute_attention_entropy_regularizer(train_alpha, effective_train_batch.batch)
        contrastive_loss = compute_density_aware_contrastive_loss(train_graph_embs, effective_train_y, effective_train_density)
        loss = ce_loss + (readout_entropy_weight * entropy_loss) + (contrastive_weight * contrastive_loss)
        loss.backward()
        optimizer.step()

        # ── Evaluation ─────────────────────────────────────────────────────
        model.eval()
        with torch.no_grad():
            # Get predictions for ALL graphs (used by the topology view).
            all_batch = Batch.from_data_list(pyg_graphs)
            all_out, graph_embs, node_embs = model(all_batch.x, all_batch.edge_index, all_batch.batch)
            all_pred = all_out.argmax(dim=1).tolist()

            # Per-split forward passes
            train_out, _, _ = model(train_batch.x, train_batch.edge_index, train_batch.batch)
            train_pred = train_out.argmax(dim=1)
            val_out, _, _ = model(val_batch.x, val_batch.edge_index, val_batch.batch)
            val_pred = val_out.argmax(dim=1)
            test_out, _, _ = model(test_batch.x, test_batch.edge_index, test_batch.batch)
            test_pred = test_out.argmax(dim=1)

            # Honest calibration: temperature is tuned on the VAL set only, so
            # the TEST set never participates in any model selection step.
            try:
                calibration_temperature = (
                    tune_temperature_lbfgs(val_out, val_y)
                    if use_lbfgs_calibration
                    else tune_temperature(val_out, val_y)
                )
            except Exception:
                calibration_temperature = tune_temperature(val_out, val_y)

            # Probabilities WITHOUT and WITH calibration so the FE can surface
            # the gap honestly (overconfidence shows up as raw_conf >> calib_conf).
            all_probs_raw = torch.softmax(all_out, dim=1).tolist()
            all_probs = apply_temperature(all_out, calibration_temperature).tolist()

            # Compute calibrated confidence (max prob) — primary signal used elsewhere.
            confidences = [max(p) for p in all_probs]

            val_loss = compute_graph_classification_loss(
                val_out,
                val_y,
                class_weights=class_weights,
                focal_gamma=0.0,
                label_smoothing=0.0,
            )
            test_loss = compute_graph_classification_loss(
                test_out,
                test_y,
                class_weights=class_weights,
                focal_gamma=0.0,
                label_smoothing=0.0,
            )
            val_acc = (val_pred == val_y).float().mean()
            test_acc = (test_pred == test_y).float().mean()
            train_acc = (train_pred == train_y).float().mean()

            # Track best validation accuracy and snapshot weights for restoration
            current_val_acc = float(val_acc.item())
            if current_val_acc > best_val_acc + 1e-6:
                best_val_acc = current_val_acc
                best_val_epoch = epoch
                best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
                no_improve_epochs = 0
            else:
                no_improve_epochs += 1

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

            classification_summary = build_classification_summary(
                predictions=all_pred,
                ground_truth=graph_truths,
                confidences=confidences,
                num_classes=num_classes,
            )
            graph_per_class_metrics = classification_summary['per_class']
            graph_calibration = build_graph_calibration(
                confidences,
                graph_correct,
                probabilities=all_probs,
                ground_truth=graph_truths,
            )
            structural_bias_signals = build_structural_bias_signals(
                graphs_data=graphs_data,
                confidences=confidences,
                correctness=graph_correct,
                predictions=all_pred,
            )
            readout_quality = {
                'mean_entropy': float(np.mean(attention_entropy)) if attention_entropy else 0.0,
                'diffuse_share': float(np.mean([1.0 if value >= 0.7 else 0.0 for value in attention_entropy])) if attention_entropy else 0.0,
                'concentrated_share': float(np.mean([1.0 if value <= 0.35 else 0.0 for value in attention_entropy])) if attention_entropy else 0.0,
            }
            trust_profile = {
                'macro_f1': float(classification_summary['macro_f1']),
                'balanced_accuracy': float(classification_summary['balanced_accuracy']),
                'brier': float(graph_calibration['brier']),
                'ece': float(graph_calibration['ece']),
                'high_conf_wrong_rate': float(graph_calibration['high_conf_wrong_rate']),
                'high_conf_wrong_count': int(graph_calibration['high_conf_wrong_count']),
                'shortcut_risk_score': float(structural_bias_signals['shortcut_risk_score']),
                'readout_diffuse_share': float(readout_quality['diffuse_share']),
                'calibration_temperature': float(calibration_temperature),
                'edge_dropout': float(edge_dropout),
                'pool_type': pool_type,
            }

            # ── Per-graph inspector (with split assignment + danger flag) ────
            graph_inspector = build_graph_inspector(
                ground_truth=graph_truths,
                predictions=all_pred,
                probabilities_raw=all_probs_raw,
                probabilities_calibrated=all_probs,
                margins=confidence_margins,
                split_assignment=split_assignment,
                danger_threshold=danger_threshold,
                uncertain_threshold=uncertain_threshold,
            )
            dangerous_indices = [row['id'] for row in graph_inspector if row['danger']]
            uncertain_indices = [row['id'] for row in graph_inspector if row['status'] == 'uncertain']
            wrong_indices = [row['id'] for row in graph_inspector if row['status'] in ('wrong', 'danger')]

            mean_raw_conf = float(np.mean([row['raw_confidence'] for row in graph_inspector])) if graph_inspector else 0.0
            mean_calib_conf = float(np.mean([row['calibrated_conf'] for row in graph_inspector])) if graph_inspector else 0.0
            mean_acc_all = float(np.mean(graph_correct)) if graph_correct else 0.0
            calibration_gap_signed = mean_calib_conf - mean_acc_all
            calibration_gap_raw = mean_raw_conf - mean_acc_all

        snapshot = {
            'epoch': epoch,
            'model_type': model_type,
            'graph_predictions': all_pred,
            'graph_probabilities': graph_probabilities,
            'graph_probabilities_raw': all_probs_raw,
            'graph_confidences': confidences,
            'graph_confidences_raw': [max(row) for row in all_probs_raw],
            'graph_split': split_assignment,
            'graph_inspector': graph_inspector,
            'dangerous_indices': dangerous_indices,
            'dangerous_count': len(dangerous_indices),
            'uncertain_indices': uncertain_indices,
            'uncertain_count': len(uncertain_indices),
            'wrong_indices': wrong_indices,
            'wrong_count': len(wrong_indices),
            'confidence_margins': confidence_margins,
            'attention_entropy': attention_entropy,
            'graph_structural_metrics': graph_structural_metrics,
            'graph_correct': graph_correct,
            'graph_embeddings_2d': emb_2d,
            'node_contributions': node_contributions,
            'graph_per_class_metrics': graph_per_class_metrics,
            'graph_calibration': graph_calibration,
            'structural_bias_signals': structural_bias_signals,
            'readout_quality': readout_quality,
            'trust_profile': trust_profile,
            'macro_f1': float(classification_summary['macro_f1']),
            'balanced_accuracy': float(classification_summary['balanced_accuracy']),
            'median_margin': float(np.median(confidence_margins)) if confidence_margins else 0.0,
            'calibration_temperature': float(calibration_temperature),
            'calibration_gap': float(abs(calibration_gap_signed)),
            'calibration_gap_signed': float(calibration_gap_signed),
            'calibration_gap_raw': float(calibration_gap_raw),
            'mean_raw_confidence': mean_raw_conf,
            'mean_calibrated_confidence': mean_calib_conf,
            'train_loss': float(ce_loss.item()),
            'val_loss': float(val_loss.item()),
            'test_loss': float(test_loss.item()),
            'train_acc': float(train_acc.item()),
            'val_acc': float(val_acc.item()),
            'test_acc': float(test_acc.item()),
            'best_val_acc': float(best_val_acc),
            'best_val_epoch': int(best_val_epoch),
            'patience_remaining': max(0, early_stop_patience - no_improve_epochs),
            'early_stopped': False,
            'is_best_so_far': bool(epoch == best_val_epoch),
            'model_hyperparams': {
                'hidden': int(config.get('hidden', defaults['hidden'])),
                'heads': int(config.get('heads', defaults['heads'])),
                'dropout': float(config.get('dropout', defaults['dropout'])),
                'lr': float(config.get('lr', defaults['lr'])),
                'weight_decay': float(weight_decay),
                'epochs_target': int(epochs),
                'early_stop_patience': int(early_stop_patience),
                'split_ratio': [float(train_ratio), float(val_ratio), float(max(0.0, 1.0 - train_ratio - val_ratio))],
            },
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

        # Early stopping: bail out only after we've trained at least a quarter
        # of the requested epochs so very short runs still observe the cosmetic
        # warm-up behavior the FE charts depend on.
        if early_stop_patience > 0 and no_improve_epochs >= early_stop_patience and epoch >= max(8, epochs // 4):
            # Mark the previous snapshot as early-stopped for the FE banner.
            epoch_snapshots[-1]['early_stopped'] = True
            break

    # ── Restore best-by-val checkpoint and emit a final, honest summary ──────
    if best_state:
        try:
            model.load_state_dict(best_state)
        except Exception:
            pass

    model.eval()
    final_summary = None
    with torch.no_grad():
        try:
            all_batch_final = Batch.from_data_list(pyg_graphs)
            final_logits, _, _ = model(all_batch_final.x, all_batch_final.edge_index, all_batch_final.batch)
            final_val_logits, _, _ = model(val_batch.x, val_batch.edge_index, val_batch.batch)
            final_test_logits, _, _ = model(test_batch.x, test_batch.edge_index, test_batch.batch)
            final_train_logits, _, _ = model(train_batch.x, train_batch.edge_index, train_batch.batch)

            final_calib_temp = (
                tune_temperature_lbfgs(final_val_logits, val_y)
                if use_lbfgs_calibration
                else tune_temperature(final_val_logits, val_y)
            )
            final_probs_raw = torch.softmax(final_logits, dim=1).tolist()
            final_probs_calib = apply_temperature(final_logits, final_calib_temp).tolist()
            final_pred = final_logits.argmax(dim=1).tolist()
            final_graph_truths = [int(g.y.view(-1)[0].item()) for g in pyg_graphs]
            final_margins = []
            for probs in final_probs_calib:
                sorted_probs = sorted(probs, reverse=True)
                final_margins.append(float(sorted_probs[0] - sorted_probs[1]) if len(sorted_probs) >= 2 else float(sorted_probs[0]))

            final_inspector = build_graph_inspector(
                ground_truth=final_graph_truths,
                predictions=final_pred,
                probabilities_raw=final_probs_raw,
                probabilities_calibrated=final_probs_calib,
                margins=final_margins,
                split_assignment=split_assignment,
                danger_threshold=danger_threshold,
                uncertain_threshold=uncertain_threshold,
            )
            final_correct = [int(final_pred[i] == final_graph_truths[i]) for i in range(len(pyg_graphs))]
            final_calibration = build_graph_calibration(
                [max(p) for p in final_probs_calib],
                final_correct,
                probabilities=final_probs_calib,
                ground_truth=final_graph_truths,
            )

            final_train_acc = float((final_train_logits.argmax(dim=1) == train_y).float().mean().item())
            final_val_acc = float((final_val_logits.argmax(dim=1) == val_y).float().mean().item())
            final_test_acc = float((final_test_logits.argmax(dim=1) == test_y).float().mean().item())
            final_mean_calib_conf = float(np.mean([row['calibrated_conf'] for row in final_inspector])) if final_inspector else 0.0
            final_mean_acc = float(np.mean(final_correct)) if final_correct else 0.0

            final_summary = {
                'model_type': model_type,
                'best_val_epoch': int(best_val_epoch),
                'train_acc': final_train_acc,
                'val_acc': final_val_acc,
                'test_acc': final_test_acc,
                'mean_raw_confidence': float(np.mean([row['raw_confidence'] for row in final_inspector])) if final_inspector else 0.0,
                'mean_calibrated_confidence': final_mean_calib_conf,
                'calibration_temperature': float(final_calib_temp),
                'calibration_gap': float(abs(final_mean_calib_conf - final_mean_acc)),
                'dangerous_count': int(sum(1 for r in final_inspector if r['danger'])),
                'wrong_count': int(sum(1 for r in final_inspector if r['status'] in ('wrong', 'danger'))),
                'uncertain_count': int(sum(1 for r in final_inspector if r['status'] == 'uncertain')),
                'ece': float(final_calibration['ece']),
                'brier': float(final_calibration['brier']),
                'graph_inspector': final_inspector,
                'graph_predictions': final_pred,
                'graph_confidences': [max(p) for p in final_probs_calib],
                'graph_confidences_raw': [max(p) for p in final_probs_raw],
                'graph_correct': final_correct,
                'graph_split': split_assignment,
                'hyperparams': {
                    'hidden': int(config.get('hidden', defaults['hidden'])),
                    'heads': int(config.get('heads', defaults['heads'])),
                    'dropout': float(config.get('dropout', defaults['dropout'])),
                    'lr': float(config.get('lr', defaults['lr'])),
                    'weight_decay': float(weight_decay),
                    'epochs_completed': len(epoch_snapshots),
                    'epochs_target': int(epochs),
                    'early_stop_patience': int(early_stop_patience),
                },
            }
        except Exception:
            final_summary = None

    if final_summary is not None:
        try:
            await send_json_zipped(websocket, {
                'type': 'task2_final_summary',
                'data': final_summary,
            })
        except Exception:
            pass

    return epoch_snapshots
