"""
Task 4: Community Detection (Unsupervised)
GNN learns embeddings that maximize modularity.
Nodes physically separate into "Islands" based on predicted communities.
"""
import asyncio
import numpy as np
import torch
import torch.nn.functional as F
import networkx as nx
from sklearn.cluster import KMeans
from torch_geometric.nn import GCNConv, GATConv, SAGEConv
from torch_geometric.utils import to_networkx
from utils.ws_msg import send_json_zipped
from utils.model_utils import should_take_snapshot
try:
    from scipy.cluster.hierarchy import linkage as scipy_linkage
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False

class CommunityGNN(torch.nn.Module):
    def __init__(self, in_channels, hidden=64, out_channels=32, model_type='GCN'):
        super().__init__()
        self.model_type = model_type
        if model_type == 'GAT':
            self.conv1 = GATConv(in_channels, hidden, heads=4, concat=True)
            self.conv2 = GATConv(hidden * 4, out_channels, heads=1, concat=False)
        elif model_type == 'SAGE':
            self.conv1 = SAGEConv(in_channels, hidden)
            self.conv2 = SAGEConv(hidden, out_channels)
        else:
            self.conv1 = GCNConv(in_channels, hidden)
            self.conv2 = GCNConv(hidden, out_channels)

    def forward(self, x, edge_index):
        x = self.conv1(x, edge_index).relu()
        x = F.dropout(x, p=0.2, training=self.training)
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
    except:
        return 0.0

async def run_community_detection(config, data, model_type, websocket, stop_flag,
                                   num_communities=4, community_gt=None):
    """Train community detection model.
    
    Args:
        num_communities: Target number of clusters (default: 4).
        community_gt: Optional list of ground truth community labels for NMI evaluation.
    """
    epochs = config.get('epochs', 100)
    num_nodes = data.x.size(0)
    num_communities = config.get('num_communities', num_communities)
    
    # Generate a graph with community structure (Stochastic Block Model)
    # We'll use the existing data but treat it as unsupervised
    G = to_networkx(data, to_undirected=True)
    
    model = CommunityGNN(data.x.size(1), model_type=model_type)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
    
    # Send initial graph structure (include community GT if available)
    nodes_data = [{'id': i} for i in range(num_nodes)]
    if community_gt:
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
    # num_communities is now passed via parameter (default 4)

    for epoch in range(epochs):
        if stop_flag(): break
        
        model.train()
        optimizer.zero_grad()
        z = model(data.x, data.edge_index)
        
        # Deep Cluster Loss (Simple implementation: attract connected nodes)
        row, col = data.edge_index
        pos_loss = -torch.log(torch.sigmoid((z[row] * z[col]).sum(dim=1)) + 1e-15).mean()
        loss = pos_loss
        loss.backward()
        optimizer.step()
        
        if should_take_snapshot(epoch, epochs):
            # Inference
            model.eval()
            with torch.no_grad():
                z = model(data.x, data.edge_index)
                z_np = z.cpu().numpy()
                
                # Use KMeans to find community islands in embedding space
                kmeans = KMeans(n_clusters=num_communities, n_init=10)
                clusters = kmeans.fit_predict(z_np)
                
                community_map = {i: int(clusters[i]) for i in range(num_nodes)}
                q_score = calculate_modularity(G, community_map)
                
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
                        except:
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

                avg_conductance = sum(conductances) / len(conductances) if conductances else 0.0

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
                    assigned_center = kmeans.cluster_centers_[community_map[i]]
                    dist_to_assigned = np.linalg.norm(node_embedding - assigned_center)
                    
                    # Distance to nearest other center
                    dists_to_others = [np.linalg.norm(node_embedding - kmeans.cluster_centers_[c]) 
                                      for c in range(num_communities) if c != community_map[i]]
                    dist_to_nearest_other = min(dists_to_others) if dists_to_others else dist_to_assigned
                    
                    # Confidence: how much closer to assigned vs nearest other
                    if dist_to_assigned + dist_to_nearest_other > 0:
                        confidence = (dist_to_nearest_other - dist_to_assigned) / (dist_to_assigned + dist_to_nearest_other)
                    else:
                        confidence = 0.0
                    cluster_confidence.append(float(confidence))
                
                # 3. KMeans centers for visualization
                cluster_centers = kmeans.cluster_centers_.tolist()
                
                # 4. Community stability (how many nodes changed from previous epoch)
                if epoch_snapshots:
                    prev_preds = epoch_snapshots[-1]['node_predictions']
                    curr_preds = clusters.tolist()
                    nodes_changed = sum(1 for p, c in zip(prev_preds, curr_preds) if p != c)
                    stability_score = 1.0 - (nodes_changed / num_nodes)
                else:
                    stability_score = 1.0

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
            if community_gt and len(community_gt) == num_nodes:
                try:
                    from sklearn.metrics import normalized_mutual_info_score
                    nmi_score = float(normalized_mutual_info_score(
                        community_gt, clusters.tolist()
                    ))
                except Exception:
                    nmi_score = None

            snapshot = {
                'epoch': epoch,
                'node_predictions': clusters.tolist(),
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
                'linkage_matrix': linkage_matrix,
                'nmi_score': nmi_score,
                'train_loss': float(loss.item()),
                'val_acc': q_score
            }
            
            # Community transitions (node migrations between consecutive epochs)
            if epoch_snapshots:
                prev_preds = epoch_snapshots[-1]['node_predictions']
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
            
            await send_json_zipped(websocket, {
                'type': 'epoch_snapshot',
                'data': snapshot,
                'progress': (epoch + 1) / epochs
            })
        await asyncio.sleep(0.005)
        
    return epoch_snapshots
