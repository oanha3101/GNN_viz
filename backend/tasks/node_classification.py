"""
Task 1: Node Classification
Trains GCN/GAT/GraphSAGE on a node classification dataset.
Streams epoch snapshots via WebSocket.
"""
import asyncio
import logging
import numpy as np
import torch
import torch.nn.functional as F
from sklearn.decomposition import PCA

logger = logging.getLogger(__name__)
from utils.ws_msg import send_json_zipped
from utils.model_utils import should_take_snapshot


def normalize_node_model_type(model_type):
    mt = str(model_type or 'GCN').upper().replace('-', '_')
    if mt in ('GRAPHSAGE', 'GRAPH_SAGE'):
        return 'SAGE'
    return mt


def drop_edge_index(edge_index, drop_prob=0.0, training=True, seed=None):
    if not training or drop_prob <= 0 or edge_index is None or edge_index.numel() == 0:
        return edge_index
    keep_prob = max(0.0, min(1.0, 1.0 - float(drop_prob)))
    generator = None
    if seed is not None:
        generator = torch.Generator(device=edge_index.device)
        generator.manual_seed(int(seed))
    mask = torch.rand(edge_index.size(1), device=edge_index.device, generator=generator) < keep_prob
    if not bool(mask.any()):
        mask[torch.randint(0, edge_index.size(1), (1,), device=edge_index.device, generator=generator)] = True
    return edge_index[:, mask]


def _node_adjacency(edge_index, num_nodes):
    neighbors = [[] for _ in range(num_nodes)]
    if edge_index is None:
        return neighbors
    edge_index_cpu = edge_index.detach().cpu()
    for i in range(edge_index_cpu.shape[1]):
        src, tgt = int(edge_index_cpu[0, i]), int(edge_index_cpu[1, i])
        if src == tgt:
            continue
        if 0 <= src < num_nodes and 0 <= tgt < num_nodes:
            neighbors[src].append(tgt)
            neighbors[tgt].append(src)
    return neighbors


def compute_boundary_selection_metrics(predictions, ground_truth, edge_index, mask=None, threshold=0.5):
    pred = predictions.detach().cpu() if torch.is_tensor(predictions) else torch.tensor(predictions)
    y = ground_truth.detach().cpu() if torch.is_tensor(ground_truth) else torch.tensor(ground_truth)
    n = int(min(len(pred), len(y)))
    if mask is None:
        mask_values = torch.ones(n, dtype=torch.bool)
    else:
        mask_values = mask.detach().cpu().bool() if torch.is_tensor(mask) else torch.tensor(mask, dtype=torch.bool)
        mask_values = mask_values[:n]

    neighbors = _node_adjacency(edge_index, n)
    selected = [idx for idx in range(n) if bool(mask_values[idx])]
    if not selected:
        return {
            'selection_metric': '0.4*val_acc+0.6*boundary_accuracy',
            'selection_score': 0.0,
            'val_acc': 0.0,
            'boundary_accuracy': 0.0,
            'boundary_count': 0,
            'interior_accuracy': 0.0,
            'interior_count': 0,
            'interior_boundary_gap': 0.0,
        }

    correct = [1.0 if int(pred[idx]) == int(y[idx]) else 0.0 for idx in selected]
    val_acc = float(np.mean(correct)) if correct else 0.0
    boundary_correct = []
    interior_correct = []
    for idx in selected:
        node_neighbors = neighbors[idx]
        if not node_neighbors:
            interior_correct.append(1.0 if int(pred[idx]) == int(y[idx]) else 0.0)
            continue
        same_label = sum(1 for nbr in node_neighbors if int(y[nbr]) == int(y[idx]))
        agreement = same_label / len(node_neighbors)
        bucket = boundary_correct if agreement < threshold else interior_correct
        bucket.append(1.0 if int(pred[idx]) == int(y[idx]) else 0.0)

    boundary_accuracy = float(np.mean(boundary_correct)) if boundary_correct else val_acc
    interior_accuracy = float(np.mean(interior_correct)) if interior_correct else val_acc
    return {
        'selection_metric': '0.4*val_acc+0.6*boundary_accuracy',
        'selection_score': float(0.4 * val_acc + 0.6 * boundary_accuracy),
        'val_acc': val_acc,
        'boundary_accuracy': boundary_accuracy,
        'boundary_count': int(len(boundary_correct)),
        'interior_accuracy': interior_accuracy,
        'interior_count': int(len(interior_correct)),
        'interior_boundary_gap': float(interior_accuracy - boundary_accuracy),
    }


async def run_node_classification(config, data, model, optimizer, websocket, stop_flag, snapshot_hook=None):
    """
    Main training loop for node classification.
    Streams one snapshot per epoch via WebSocket.
    """
    epochs = config.get('epochs', 100)
    model_type = normalize_node_model_type(config.get('model', getattr(model, 'model_type', 'GCN')))
    is_sage = model_type == 'SAGE'
    edge_dropout = float(config.get('task1_edge_dropout', 0.15 if is_sage else 0.0))
    boundary_patience = int(config.get('task1_boundary_patience', 8 if is_sage else 0))
    best_selection_score = -1.0
    best_epoch = 0
    best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
    best_snapshot = None
    no_improve_epochs = 0
    epoch_snapshots = []

    for epoch in range(epochs):
        if stop_flag():
            break

        # ── Training Step ──────────────────────────────────────────────────
        model.train()
        optimizer.zero_grad()
        train_edge_index = drop_edge_index(data.edge_index, edge_dropout, training=True)
        outputs = model(data.x, train_edge_index)
        out, embedding = outputs[0], outputs[1]

        loss = F.cross_entropy(out[data.train_mask], data.y[data.train_mask])
        loss.backward()
        optimizer.step()

        # ── Evaluation ─────────────────────────────────────────────────────
        model.eval()
        with torch.no_grad():
            eval_outputs = model(data.x, data.edge_index)
            out_eval, embedding_eval = eval_outputs[0], eval_outputs[1]

            val_loss = F.cross_entropy(out_eval[data.val_mask], data.y[data.val_mask])
            pred = out_eval.argmax(dim=1)
            val_acc = (pred[data.val_mask] == data.y[data.val_mask]).float().mean()
            train_acc = (pred[data.train_mask] == data.y[data.train_mask]).float().mean()
            selection_metrics = compute_boundary_selection_metrics(
                pred,
                data.y,
                data.edge_index,
                mask=data.val_mask,
            )
            improved_this_epoch = bool(selection_metrics['selection_score'] > best_selection_score + 1e-6)
            if improved_this_epoch:
                best_selection_score = float(selection_metrics['selection_score'])
                best_epoch = epoch
                best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
                no_improve_epochs = 0
            else:
                no_improve_epochs += 1

        if should_take_snapshot(epoch, epochs) or improved_this_epoch:
            # ── PCA Reduction ───────────────────────────────────────────────────
            try:
                emb_np = embedding_eval.cpu().numpy()
                n_components = min(2, emb_np.shape[1], emb_np.shape[0])
                if n_components < 2:
                    # Fallback: use first 2 columns padded with zeros
                    padded = np.zeros((emb_np.shape[0], 2))
                    padded[:, :emb_np.shape[1]] = emb_np[:, :2]
                    emb_2d = padded.tolist()
                else:
                    pca = PCA(n_components=2)
                    emb_2d = pca.fit_transform(emb_np).tolist()
            except Exception as e:
                logger.warning("PCA Reduction Error: %s", e)
                emb_2d = [[0.0, 0.0]] * embedding_eval.shape[0]

            # ── Dirichlet Energy (oversmoothing metric) ───────────────────
            # D = (1/|E|) * sum_{(i,j) in E} ||h_i - h_j||^2
            # Small D → oversmoothed (all nodes same embedding)
            try:
                row, col = data.edge_index
                diff = embedding_eval[row] - embedding_eval[col]
                dirichlet_energy = float((diff ** 2).sum(dim=1).mean().item())
            except Exception as e:
                logger.warning("Dirichlet Energy Error: %s", e)
                dirichlet_energy = 0.0

            # ── Attention Weights (GAT only) ────────────────────────────────────
            attn_data = None
            attention_edges = None
            attention_per_head = None
            try:
                if len(eval_outputs) > 2 and eval_outputs[2] is not None:
                    attn_raw = eval_outputs[2].cpu().numpy()
                    # Normalize to [0, 1] per-edge
                    attn_min, attn_max = attn_raw.min(), attn_raw.max()
                    if attn_max > attn_min:
                        attn_data = ((attn_raw - attn_min) / (attn_max - attn_min)).tolist()
                    else:
                        attn_data = attn_raw.tolist()

                    # Attention edges: aggregated undirected, no self-loops
                    if hasattr(model, '_attention_edges') and model._attention_edges:
                        attention_edges = [{'source': u, 'target': v, 'weight': w} for u, v, w in model._attention_edges]

                    # Per-head attention for head selector
                    if hasattr(model, '_per_head_attn') and model._per_head_attn:
                        attention_per_head = {}
                        for (u, v), heads in model._per_head_attn.items():
                            key = f"{min(u,v)}-{max(u,v)}"
                            attention_per_head[key] = heads
            except Exception as e:
                logger.warning("Attention extraction error: %s", e)

            # ── Explainability Data ─────────────────────────────────────────────
            try:
                # 1. Softmax probabilities per node (real confidence, not hardcoded)
                probs = F.softmax(out_eval, dim=1)
                node_probabilities = probs.cpu().tolist()

                # 2. Confidence score (max probability per node)
                node_confidence = probs.max(dim=1).values.cpu().tolist()

                # 3. Correctness flag (prediction == ground truth)
                node_correctness = (pred == data.y).cpu().tolist()
            except Exception as e:
                logger.warning("Explainability data error: %s", e)
                node_probabilities = []
                node_confidence = []
                node_correctness = []
            
            # 4. Neighbor context (majority neighbor class per node)
            try:
                edge_index_np = data.edge_index.cpu().numpy()
                num_nodes = data.x.size(0)
                pred_list = pred.cpu().tolist()
                
                # Build adjacency list
                neighbors = [[] for _ in range(num_nodes)]
                for i in range(edge_index_np.shape[1]):
                    src, tgt = int(edge_index_np[0, i]), int(edge_index_np[1, i])
                    if src != tgt:  # Skip self-loops
                        neighbors[src].append(tgt)
                        neighbors[tgt].append(src)
                
                # Compute majority neighbor class
                neighbor_majority = []
                for node_id in range(num_nodes):
                    if len(neighbors[node_id]) == 0:
                        neighbor_majority.append({'majority_class': -1, 'majority_ratio': 0.0, 'total_neighbors': 0})
                        continue
                    
                    # Count classes among neighbors
                    neighbor_classes = {}
                    for neighbor_id in neighbors[node_id]:
                        neighbor_class = pred_list[neighbor_id]
                        neighbor_classes[neighbor_class] = neighbor_classes.get(neighbor_class, 0) + 1
                    
                    # Find majority
                    majority_class = max(neighbor_classes.keys(), key=lambda k: neighbor_classes[k])
                    majority_count = neighbor_classes[majority_class]
                    majority_ratio = majority_count / len(neighbors[node_id])
                    
                    neighbor_majority.append({
                        'majority_class': int(majority_class),
                        'majority_ratio': float(majority_ratio),
                        'total_neighbors': len(neighbors[node_id])
                    })
            except Exception as e:
                logger.warning("Neighbor context computation failed: %s", e)
                neighbor_majority = [{'majority_class': -1, 'majority_ratio': 0.0, 'total_neighbors': 0}] * data.x.size(0)

            # ── Build Snapshot ──────────────────────────────────────────────────
            snapshot = {
                'epoch': epoch,
                'model_type': model_type,
                'node_predictions': pred.cpu().tolist(),
                'node_probabilities': node_probabilities,
                'node_confidence': node_confidence,
                'node_correctness': node_correctness,
                'majority_ratio': [m['majority_ratio'] for m in neighbor_majority],
                'neighbor_majority': neighbor_majority,
                'embeddings_2d': emb_2d,
                'attention_weights': attn_data,
                'attention_edges': attention_edges,
                'attention_per_head': attention_per_head,
                'train_loss': float(loss.item()),
                'val_loss': float(val_loss.item()),
                'train_acc': float(train_acc.item()),
                'val_acc': float(val_acc.item()),
                'boundary_accuracy': float(selection_metrics['boundary_accuracy']),
                'boundary_count': int(selection_metrics['boundary_count']),
                'interior_accuracy': float(selection_metrics['interior_accuracy']),
                'interior_count': int(selection_metrics['interior_count']),
                'interior_boundary_gap': float(selection_metrics['interior_boundary_gap']),
                'best_epoch': int(best_epoch),
                'best_selection_metric': selection_metrics['selection_metric'],
                'best_selection_score': float(best_selection_score),
                'is_best_so_far': bool(improved_this_epoch),
                'task1_edge_dropout': float(edge_dropout),
                'task1_boundary_patience': int(boundary_patience),
                'dirichlet_energy': dirichlet_energy,
            }
            epoch_snapshots.append(snapshot)
            if improved_this_epoch:
                best_snapshot = dict(snapshot)
            if snapshot_hook:
                await snapshot_hook(epoch, snapshot)

            # ── Stream to Frontend ──────────────────────────────────────────────
            await send_json_zipped(websocket, {
                'type': 'epoch_snapshot',
                'data': snapshot,
                'progress': (epoch + 1) / epochs,
            })

        # Small yield to keep WebSocket responsive
        await asyncio.sleep(0.005)

        if boundary_patience > 0 and no_improve_epochs >= boundary_patience and epoch >= max(8, epochs // 4):
            if epoch_snapshots:
                epoch_snapshots[-1]['early_stopped'] = True
            break

    if best_state:
        try:
            model.load_state_dict(best_state)
        except Exception as e:
            logger.warning("Failed to restore best Task 1 checkpoint: %s", e)

    if best_snapshot is not None:
        await send_json_zipped(websocket, {
            'type': 'task1_best_checkpoint',
            'data': {
                'type': 'best_boundary_checkpoint',
                'best_epoch': int(best_epoch),
                'best_selection_metric': best_snapshot.get('best_selection_metric'),
                'best_selection_score': float(best_snapshot.get('best_selection_score', 0.0)),
                'boundary_accuracy': float(best_snapshot.get('boundary_accuracy', 0.0)),
                'val_acc': float(best_snapshot.get('val_acc', 0.0)),
                'weights_saved': bool(best_state),
                'weight_keys': list(best_state.keys()),
                'snapshot': best_snapshot,
            },
        })

    return epoch_snapshots
