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


async def run_node_classification(config, data, model, optimizer, websocket, stop_flag, snapshot_hook=None):
    """
    Main training loop for node classification.
    Streams one snapshot per epoch via WebSocket.
    """
    epochs = config.get('epochs', 100)
    epoch_snapshots = []

    for epoch in range(epochs):
        if stop_flag():
            break

        # ── Training Step ──────────────────────────────────────────────────
        model.train()
        optimizer.zero_grad()
        outputs = model(data.x, data.edge_index)
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

        if should_take_snapshot(epoch, epochs):
            # ── PCA Reduction ───────────────────────────────────────────────────
            emb_np = embedding_eval.cpu().numpy()
            pca = PCA(n_components=2)
            emb_2d = pca.fit_transform(emb_np).tolist()

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

            # ── Explainability Data ─────────────────────────────────────────────
            
            # 1. Softmax probabilities per node (real confidence, not hardcoded)
            probs = F.softmax(out_eval, dim=1)
            node_probabilities = probs.cpu().tolist()
            
            # 2. Confidence score (max probability per node)
            node_confidence = probs.max(dim=1).values.cpu().tolist()
            
            # 3. Correctness flag (prediction == ground truth)
            node_correctness = (pred == data.y).cpu().tolist()
            
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
                'model_type': config.get('model', 'GCN'),
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
                'dirichlet_energy': dirichlet_energy,
            }
            epoch_snapshots.append(snapshot)
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

    return epoch_snapshots
