"""
Task 2: Graph Classification
Trains a GNN with global pooling to classify entire graphs.
Generates 50 synthetic graphs (Erdős–Rényi class 0, Scale-free class 1).
"""
import asyncio
import numpy as np
import torch
import torch.nn.functional as F
import networkx as nx
from sklearn.decomposition import PCA
from torch_geometric.data import Data, Batch
from torch_geometric.nn import GCNConv, global_add_pool


# ───────────────────────────────────────────────────────────────────────────────
# Attention-based Graph Classification Model (Explainable)
# ───────────────────────────────────────────────────────────────────────────────
class GraphClassifier(torch.nn.Module):
    def __init__(self, in_channels=1, hidden=32, num_classes=2):
        super().__init__()
        self.conv1 = GCNConv(in_channels, hidden)
        self.conv2 = GCNConv(hidden, hidden)
        
        # Attention layer for Readout
        self.att_gate = torch.nn.Linear(hidden, 1)
        
        self.lin = torch.nn.Linear(hidden, num_classes)

    def forward(self, x, edge_index, batch):
        x = self.conv1(x, edge_index).relu()
        x = self.conv2(x, edge_index).relu()
        node_embeddings = x
        
        # Compute attention weights alpha
        alpha = torch.sigmoid(self.att_gate(x)) # Weight per node [num_nodes, 1]
        
        # Apply attention to nodes and pool
        x_g = alpha * x
        graph_embeddings = global_add_pool(x_g, batch)
        
        out = self.lin(graph_embeddings)
        return out, graph_embeddings, alpha.squeeze()


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
async def run_graph_classification(config, websocket, stop_flag, custom_graphs=None):
    """Train graph classification model and stream snapshots.
    
    Args:
        custom_graphs: Optional list of PyG Data objects from user upload.
                      Each Data should have .x, .edge_index, .y (graph label).
                      If None, synthetic graphs are generated.
    """
    epochs = config.get('epochs', 80)

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
    await websocket.send_json({
        'type': 'graph_data',
        'data': {
            'graphs': graphs_json,
            'groundTruth': ground_truth,
        }
    })

    # Build model + optimizer
    model = GraphClassifier(in_channels=in_channels, hidden=32, num_classes=num_classes)
    optimizer = torch.optim.Adam(model.parameters(), lr=config.get('lr', 0.01))

    # Prepare batched data (train: 80%, test: 20%)
    n_train = int(len(pyg_graphs) * 0.8)
    train_graphs = pyg_graphs[:n_train]
    test_graphs = pyg_graphs[n_train:]
    train_batch = Batch.from_data_list(train_graphs)
    test_batch = Batch.from_data_list(test_graphs)

    train_y = torch.tensor([g.y.item() for g in train_graphs])
    test_y = torch.tensor([g.y.item() for g in test_graphs])

    epoch_snapshots = []

    for epoch in range(epochs):
        if stop_flag():
            break

        # ── Training ───────────────────────────────────────────────────────
        model.train()
        optimizer.zero_grad()
        out, _, _ = model(train_batch.x, train_batch.edge_index, train_batch.batch)
        loss = F.cross_entropy(out, train_y)
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

            val_loss = F.cross_entropy(test_out, test_y)
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

        snapshot = {
            'epoch': epoch,
            'graph_predictions': all_pred,
            'graph_probabilities': graph_probabilities,
            'graph_confidences': confidences,
            'confidence_margins': confidence_margins,
            'attention_entropy': attention_entropy,
            'graph_structural_metrics': graph_structural_metrics,
            'graph_correct': graph_correct,
            'graph_embeddings_2d': emb_2d,
            'node_contributions': node_contributions,
            'train_loss': float(loss.item()),
            'val_loss': float(val_loss.item()),
            'train_acc': float(train_acc.item()),
            'val_acc': float(val_acc.item()),
        }
        epoch_snapshots.append(snapshot)

        await websocket.send_json({
            'type': 'epoch_snapshot',
            'data': snapshot,
            'progress': (epoch + 1) / epochs,
        })
        await asyncio.sleep(0.005)

    return epoch_snapshots
