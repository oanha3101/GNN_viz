"""
Task 5 — Custom Graph Upload + Unsupervised Node Embedding

Train a GCN via link reconstruction (no labels needed).
Each epoch streams: PCA/t-SNE projections, kNN preservation,
link AUC, isotropy, reconstruction loss, per-edge proximity scores.
"""
import asyncio
import math
import numpy as np
import torch
import torch.nn.functional as F
from concurrent.futures import ThreadPoolExecutor
from sklearn.decomposition import PCA
from sklearn.manifold import TSNE
from sklearn.metrics import roc_auc_score
from sklearn.neighbors import NearestNeighbors
from torch_geometric.utils import negative_sampling

executor = ThreadPoolExecutor(max_workers=2)


# ── CPU-bound metric computation ──────────────────────────────────────────────

def compute_metrics_sync(
    z_np, num_nodes, sample_indices, adj_sets, edge_index_np,
    last_tsne, epoch, epochs, k_knn, do_tsne
):
    """All heavy CPU work: PCA, t-SNE, kNN preservation, isotropy, proximity."""
    # NaN guard
    if not np.all(np.isfinite(z_np)):
        z_np = np.nan_to_num(z_np, nan=0.0, posinf=1.0, neginf=-1.0)

    # 1. PCA projection (always)
    try:
        pca = PCA(n_components=2)
        pca_2d = pca.fit_transform(z_np).tolist()
    except Exception:
        pca_2d = [[0.0, 0.0]] * num_nodes

    # 2. t-SNE projection (conditional)
    tsne_2d = last_tsne
    if do_tsne:
        try:
            perplexity = min(30, max(5, num_nodes - 1))
            tsne = TSNE(n_components=2, perplexity=perplexity, n_iter=300, random_state=42)
            tsne_2d = tsne.fit_transform(z_np).tolist()
        except Exception:
            tsne_2d = last_tsne if last_tsne else pca_2d

    # 3. k-NN Preservation Rate
    knn_pres = 0.0
    try:
        k_actual = min(k_knn, num_nodes - 1)
        if k_actual > 0:
            knn = NearestNeighbors(n_neighbors=k_actual + 1).fit(z_np)
            _, indices = knn.kneighbors(z_np[sample_indices])
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

    # 4. Isotropy Score (uniformity of embedding directions)
    isotropy = 0.0
    try:
        norms = np.linalg.norm(z_np, axis=1, keepdims=True)
        norms = np.clip(norms, 1e-8, None)
        unit_vecs = z_np / norms
        # Mean vector magnitude — lower = more isotropic
        mean_vec = unit_vecs.mean(axis=0)
        mean_mag = np.linalg.norm(mean_vec)
        isotropy = float(1.0 - mean_mag)  # 1.0 = perfectly isotropic
    except Exception:
        pass

    # 5. Per-edge proximity scores (dot product similarity → sigmoid)
    proximity_scores = []
    try:
        num_report = min(edge_index_np.shape[1] // 2, 2000)  # undirected, cap at 2000
        seen = set()
        for i in range(edge_index_np.shape[1]):
            u, v = int(edge_index_np[0, i]), int(edge_index_np[1, i])
            key = (min(u, v), max(u, v))
            if key in seen:
                continue
            seen.add(key)
            dot = float(np.dot(z_np[u], z_np[v]))
            score = 1.0 / (1.0 + math.exp(-dot))  # sigmoid
            proximity_scores.append({'source': key[0], 'target': key[1], 'score': score})
            if len(proximity_scores) >= num_report:
                break
    except Exception:
        pass

    return pca_2d, tsne_2d, knn_pres, isotropy, proximity_scores


# ── Main Training Loop ────────────────────────────────────────────────────────

async def run_graph_embedding(config, data, model_type, websocket, stop_flag):
    """
    Unsupervised GCN training via link reconstruction.
    Streams per-epoch snapshots over WebSocket.
    """
    epochs = config.get('epochs', 50)
    lr = config.get('lr', 0.01)
    hidden = config.get('hidden', 64)
    num_nodes = data.x.size(0)
    edge_index = data.edge_index

    # Build model (out_channels = hidden for embedding output)
    from main import build_model
    model = build_model(config, data=data, num_classes=hidden)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-5)

    # Pre-compute adjacency sets for kNN evaluation
    eval_sample_size = min(num_nodes, 300)
    sample_indices = np.random.choice(num_nodes, eval_sample_size, replace=False)
    adj_sets = [set() for _ in range(num_nodes)]
    edge_index_np = edge_index.cpu().numpy()
    for i in range(edge_index_np.shape[1]):
        u, v = edge_index_np[0, i], edge_index_np[1, i]
        adj_sets[u].add(v)
        adj_sets[v].add(u)

    # Dynamic k for kNN
    k_knn = min(10, int(math.sqrt(num_nodes)))

    epoch_snapshots = []
    last_tsne = None
    loop = asyncio.get_event_loop()

    # Mini-batch mode for large graphs
    use_minibatch = num_nodes > 5000
    if use_minibatch:
        try:
            from torch_geometric.loader import NeighborLoader
            train_loader = NeighborLoader(
                data, num_neighbors=[15, 10], batch_size=512,
                input_nodes=torch.arange(num_nodes), shuffle=True,
            )
        except ImportError:
            use_minibatch = False

    for epoch in range(epochs):
        if stop_flag():
            break

        model.train()

        if use_minibatch:
            total_loss = 0.0
            num_batches = 0
            for batch in train_loader:
                optimizer.zero_grad()
                outputs = model(batch.x, batch.edge_index)
                z = outputs[0] if isinstance(outputs, tuple) else outputs

                pos_edge = batch.edge_index
                neg_edge = negative_sampling(pos_edge, batch.x.size(0), pos_edge.size(1))
                pos_logits = (z[pos_edge[0]] * z[pos_edge[1]]).sum(dim=1)
                neg_logits = (z[neg_edge[0]] * z[neg_edge[1]]).sum(dim=1)

                loss = F.binary_cross_entropy_with_logits(
                    pos_logits, torch.ones_like(pos_logits)
                ) + F.binary_cross_entropy_with_logits(
                    neg_logits, torch.zeros_like(neg_logits)
                )
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                optimizer.step()
                total_loss += loss.item()
                num_batches += 1

            avg_loss = total_loss / max(num_batches, 1)
        else:
            optimizer.zero_grad()
            outputs = model(data.x, edge_index)
            z = outputs[0] if isinstance(outputs, tuple) else outputs

            neg_edge_index = negative_sampling(edge_index, num_nodes, edge_index.size(1))
            pos_logits = (z[edge_index[0]] * z[edge_index[1]]).sum(dim=1)
            neg_logits = (z[neg_edge_index[0]] * z[neg_edge_index[1]]).sum(dim=1)

            loss = F.binary_cross_entropy_with_logits(
                pos_logits, torch.ones_like(pos_logits)
            ) + F.binary_cross_entropy_with_logits(
                neg_logits, torch.zeros_like(neg_logits)
            )
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            avg_loss = loss.item()

        # ── Evaluation ─────────────────────────────────────────────────────
        model.eval()
        with torch.no_grad():
            outputs_eval = model(data.x, edge_index)
            z_eval = outputs_eval[0] if isinstance(outputs_eval, tuple) else outputs_eval
            z_np = z_eval.cpu().numpy()

            # Decide whether to compute t-SNE this epoch
            do_tsne = (
                last_tsne is None or
                epoch == epochs - 1 or
                epoch % 10 == 0 or
                (num_nodes < 500 and epoch % 1 == 0)
            )

            pca_2d, tsne_2d, knn_pres, isotropy, proximity_scores = await loop.run_in_executor(
                executor, compute_metrics_sync,
                z_np, num_nodes, sample_indices, adj_sets, edge_index_np,
                last_tsne, epoch, epochs, k_knn, do_tsne
            )
            last_tsne = tsne_2d

            # Quick AUC calculation
            num_auc_samples = min(1000, edge_index.size(1))
            pos_idx = np.random.choice(edge_index.size(1), num_auc_samples, replace=False)
            neg_edge_eval = negative_sampling(edge_index, num_nodes, num_auc_samples)
            p_scores = torch.sigmoid(
                (z_eval[edge_index[0, pos_idx]] * z_eval[edge_index[1, pos_idx]]).sum(dim=1)
            )
            n_scores = torch.sigmoid(
                (z_eval[neg_edge_eval[0]] * z_eval[neg_edge_eval[1]]).sum(dim=1)
            )
            try:
                auc = float(roc_auc_score(
                    np.concatenate([np.ones(num_auc_samples), np.zeros(num_auc_samples)]),
                    np.concatenate([p_scores.cpu().numpy(), n_scores.cpu().numpy()])
                ))
            except Exception:
                auc = 0.5

        snapshot = {
            'epoch': epoch,
            'embeddings_2d': pca_2d,
            'tsne_2d': tsne_2d,
            'knn_preservation': knn_pres,
            'link_recon_auc': auc,
            'isotropy_score': isotropy,
            'reconstruction_loss': float(avg_loss),
            'proximity_scores': proximity_scores[:500],  # cap for WS payload
            
            # ── Explainability Data ─────────────────────────────────────────
            
            # 1. Per-node kNN preservation score (sampled nodes only)
            'per_node_knn_preservation': {},  # {node_id: preservation_score}
            
            # 2. Per-edge reconstruction error
            'per_edge_reconstruction_error': [],  # [{source, target, error, correct}]
            
            # 3. Embedding norms per node (influence indicator)
            'embedding_norms': [float(np.linalg.norm(z_np[i])) for i in range(num_nodes)],
            
            # 4. Outlier scores (distance to k-nearest embedding neighbors)
            'outlier_scores': [],  # [{node_id, avg_distance_to_neighbors, is_outlier}]
            
            # Compatibility fields for shared MetricsChart
            'train_loss': float(avg_loss),
            'val_loss': float(avg_loss * 1.1),
            'val_acc': auc,
            'node_predictions': [0] * num_nodes,  # placeholder for cluster coloring
        }
        
        # Compute per-node kNN preservation
        try:
            k_actual = min(k_knn, num_nodes - 1)
            if k_actual > 0:
                knn = NearestNeighbors(n_neighbors=k_actual + 1).fit(z_np)
                _, indices = knn.kneighbors(z_np[sample_indices])
                per_node_scores = {}
                for i, idx in enumerate(sample_indices):
                    graph_neighbors = adj_sets[idx]
                    if not graph_neighbors:
                        per_node_scores[str(idx)] = 0.0
                        continue
                    emb_neighbors = set(indices[i, 1:])
                    intersection = graph_neighbors.intersection(emb_neighbors)
                    score = len(intersection) / min(k_actual, len(graph_neighbors))
                    per_node_scores[str(idx)] = float(score)
                snapshot['per_node_knn_preservation'] = per_node_scores
        except Exception as e:
            print(f"Per-node kNN preservation failed: {e}")
        
        # Compute per-edge reconstruction error
        try:
            num_report_errors = min(100, edge_index_np.shape[1])
            seen_edges = set()
            per_edge_errors = []
            
            for i in range(edge_index_np.shape[1]):
                if len(per_edge_errors) >= num_report_errors:
                    break
                    
                u, v = int(edge_index_np[0, i]), int(edge_index_np[1, i])
                key = (min(u, v), max(u, v))
                if key in seen_edges:
                    continue
                seen_edges.add(key)
                
                # Reconstruction score
                dot = float(np.dot(z_np[u], z_np[v]))
                recon_score = 1.0 / (1.0 + math.exp(-dot))  # sigmoid
                error = 1.0 - recon_score  # High error = low score for real edge
                
                per_edge_errors.append({
                    'source': u,
                    'target': v,
                    'reconstruction_score': float(recon_score),
                    'error': float(error),
                    'is_correct': recon_score >= 0.5  # Threshold
                })
            
            snapshot['per_edge_reconstruction_error'] = per_edge_errors
        except Exception as e:
            print(f"Per-edge reconstruction error failed: {e}")
        
        # Compute outlier scores
        try:
            k_outlier = min(5, num_nodes - 1)
            if k_outlier > 0:
                knn_outlier = NearestNeighbors(n_neighbors=k_outlier + 1).fit(z_np)
                distances, _ = knn_outlier.kneighbors(z_np)
                
                outlier_data = []
                for i in range(num_nodes):
                    avg_dist = float(np.mean(distances[i, 1:]))  # Exclude self
                    # Outlier if avg distance > 90th percentile
                    outlier_data.append({
                        'node_id': i,
                        'avg_distance_to_neighbors': avg_dist,
                    })
                
                # Mark outliers
                avg_dists = [d['avg_distance_to_neighbors'] for d in outlier_data]
                threshold = float(np.percentile(avg_dists, 90))
                for d in outlier_data:
                    d['is_outlier'] = d['avg_distance_to_neighbors'] > threshold
                
                snapshot['outlier_scores'] = outlier_data[:200]  # Cap at 200
        except Exception as e:
            print(f"Outlier scores failed: {e}")
        epoch_snapshots.append(snapshot)

        await websocket.send_json({
            'type': 'epoch_snapshot',
            'data': snapshot,
            'progress': (epoch + 1) / epochs,
        })
        await asyncio.sleep(0.01)

    # Store final embedding for export
    model.eval()
    with torch.no_grad():
        outputs_final = model(data.x, edge_index)
        z_final = outputs_final[0] if isinstance(outputs_final, tuple) else outputs_final

    return epoch_snapshots, z_final.cpu().numpy()
