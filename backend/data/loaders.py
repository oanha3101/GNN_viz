import torch
import os
import json
import pandas as pd
import numpy as np
from torch_geometric.data import Data
from torch_geometric.datasets import Planetoid

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'datasets')


def load_cora():
    """Load Cora citation dataset."""
    dataset = Planetoid(root=DATA_DIR, name='Cora')
    return dataset[0]


def load_citeseer():
    """Load Citeseer citation dataset."""
    dataset = Planetoid(root=DATA_DIR, name='CiteSeer')
    return dataset[0]


def load_karate():
    """Load Karate Club dataset."""
    from torch_geometric.datasets import KarateClub
    dataset = KarateClub()
    return dataset[0]


def load_csv(nodes_path: str, edges_path: str):
    """Load custom dataset from CSV files (legacy 2-file format).

    nodes.csv: columns = [node_id, feature_0, feature_1, ..., label]
    edges.csv: columns = [source, target]
    """
    nodes_df = pd.read_csv(nodes_path)
    edges_df = pd.read_csv(edges_path)

    feature_cols = [c for c in nodes_df.columns if c not in ('node_id', 'label')]
    x = torch.tensor(nodes_df[feature_cols].values, dtype=torch.float)
    y = torch.tensor(nodes_df['label'].values, dtype=torch.long)

    edge_index = torch.tensor(
        [edges_df['source'].values, edges_df['target'].values],
        dtype=torch.long
    )

    n = len(nodes_df)
    perm = np.random.permutation(n)
    train_mask = torch.zeros(n, dtype=torch.bool)
    val_mask = torch.zeros(n, dtype=torch.bool)
    test_mask = torch.zeros(n, dtype=torch.bool)
    train_mask[perm[:int(0.6 * n)]] = True
    val_mask[perm[int(0.6 * n):int(0.8 * n)]] = True
    test_mask[perm[int(0.8 * n):]] = True

    data = Data(x=x, edge_index=edge_index, y=y,
                train_mask=train_mask, val_mask=val_mask, test_mask=test_mask)
    return data


# ── Custom Graph Loader (single file) ──────────────────────────────────────────

def load_custom_graph(file_path: str):
    """
    Load a graph from a single file. Supported formats:
      - .csv  : edge list (columns auto-detected: source/target or col 0/1)
      - .json : {"edges": [[s,t], ...]} or {"nodes": [...], "links": [...]}
      - .pt   : PyTorch Geometric Data object
    
    Returns a PyG Data object. Features/labels may be None and will be
    auto-generated downstream by auto_detect_graph().
    """
    ext = os.path.splitext(file_path)[1].lower()

    if ext == '.pt':
        data = torch.load(file_path, weights_only=False)
        if isinstance(data, Data):
            return data
        raise ValueError(f"PT file does not contain a PyG Data object")

    if ext == '.json':
        with open(file_path, 'r') as f:
            raw = json.load(f)
        return _parse_json_graph(raw)

    if ext == '.csv':
        return _parse_csv_edgelist(file_path)

    raise ValueError(f"Unsupported file format: {ext}. Use .csv, .json, or .pt")


def _parse_csv_edgelist(file_path: str):
    """Parse CSV edge list into PyG Data."""
    df = pd.read_csv(file_path)
    cols = df.columns.tolist()

    # Auto-detect source/target columns
    src_col, tgt_col = None, None
    for kw_src in ['source', 'src', 'from', 'u', 'node_1']:
        for c in cols:
            if c.lower().strip() == kw_src:
                src_col = c
                break
        if src_col:
            break
    for kw_tgt in ['target', 'tgt', 'to', 'v', 'node_2']:
        for c in cols:
            if c.lower().strip() == kw_tgt:
                tgt_col = c
                break
        if tgt_col:
            break

    # Fallback: first two columns
    if not src_col:
        src_col = cols[0]
    if not tgt_col:
        tgt_col = cols[1]

    sources = df[src_col].values.astype(int)
    targets = df[tgt_col].values.astype(int)

    # Remap node IDs to 0..N-1
    unique_nodes = sorted(set(sources) | set(targets))
    node_map = {old: new for new, old in enumerate(unique_nodes)}
    sources = np.array([node_map[s] for s in sources])
    targets = np.array([node_map[t] for t in targets])

    # Make undirected
    all_src = np.concatenate([sources, targets])
    all_tgt = np.concatenate([targets, sources])
    edge_index = torch.tensor([all_src, all_tgt], dtype=torch.long)

    num_nodes = len(unique_nodes)
    data = Data(edge_index=edge_index, num_nodes=num_nodes)
    return data


def _parse_json_graph(raw: dict):
    """Parse JSON graph format into PyG Data."""
    edges = []

    # Format 1: {"edges": [[0,1], [1,2], ...]}
    if 'edges' in raw:
        edges = raw['edges']
    # Format 2: {"links": [{"source":0,"target":1}, ...]}
    elif 'links' in raw:
        for l in raw['links']:
            s = l.get('source', l.get('src', l.get('from')))
            t = l.get('target', l.get('tgt', l.get('to')))
            if s is not None and t is not None:
                edges.append([int(s), int(t)])
    # Format 3: adjacency list {"0": [1,2,3], "1": [0,3], ...}
    elif all(isinstance(v, list) for v in raw.values()):
        for node_str, neighbors in raw.items():
            s = int(node_str)
            for t in neighbors:
                if s < int(t):
                    edges.append([s, int(t)])
    else:
        raise ValueError("Unrecognized JSON graph format. Use {edges: [[s,t],...]} or {links: [{source,target},...]} or adjacency list.")

    if not edges:
        raise ValueError("No edges found in JSON file")

    sources = [e[0] for e in edges]
    targets = [e[1] for e in edges]

    # Remap
    unique_nodes = sorted(set(sources) | set(targets))
    node_map = {old: new for new, old in enumerate(unique_nodes)}
    sources = [node_map[s] for s in sources]
    targets = [node_map[t] for t in targets]

    # Make undirected
    all_src = sources + targets
    all_tgt = targets + sources
    edge_index = torch.tensor([all_src, all_tgt], dtype=torch.long)

    num_nodes = len(unique_nodes)

    # Check for node features in JSON
    x = None
    y = None
    if 'nodes' in raw and isinstance(raw['nodes'], list):
        # Create a lookup map for node objects by their ID
        node_lookup = { n.get('id'): n for n in raw['nodes'] if n.get('id') is not None }
        
        first_node = raw['nodes'][0] if raw['nodes'] else {}
        feat_keys = [k for k in first_node.keys() if k not in ('id', 'label', 'class', 'name')]
        
        if feat_keys:
            features = []
            # We must iterate according to unique_nodes (which matches node_map indices)
            for old_id in unique_nodes:
                n = node_lookup.get(old_id, {})
                features.append([float(n.get(k, 0)) for k in feat_keys])
            x = torch.tensor(features, dtype=torch.float)
        
        if 'label' in first_node or 'class' in first_node:
            label_key = 'label' if 'label' in first_node else 'class'
            labels = []
            for old_id in unique_nodes:
                n = node_lookup.get(old_id, {})
                labels.append(int(n.get(label_key, 0)))
            y = torch.tensor(labels, dtype=torch.long)

    data = Data(edge_index=edge_index, num_nodes=num_nodes)
    if x is not None:
        data.x = x
    if y is not None:
        data.y = y
    return data


# ── Auto-Detect Graph Properties ───────────────────────────────────────────────

def auto_detect_graph(data: Data):
    """
    Analyze a PyG Data object and return metadata + ensure it has proper features.
    
    Returns: (data_with_features, metadata_dict)
    """
    num_nodes = data.num_nodes or data.edge_index.max().item() + 1
    num_edges = data.edge_index.size(1)  # includes both directions for undirected

    # Feature detection
    has_features = hasattr(data, 'x') and data.x is not None
    if has_features:
        feature_dim = data.x.size(1)
    else:
        feature_dim = 0

    # Label detection
    has_labels = hasattr(data, 'y') and data.y is not None
    num_classes = 0
    if has_labels:
        num_classes = int(data.y.max().item()) + 1

    # Generate features if missing
    if not has_features:
        if num_nodes < 256:
            # For small graphs like Karate Club, use Identity Matrix (One-hot) 
            # This is much more expressive for learning structural embeddings
            data.x = torch.eye(num_nodes)
            feature_source = 'identity'
        else:
            # For large graphs, use degree-based features to save memory
            degrees = torch.zeros(num_nodes, dtype=torch.float)
            edge_index = data.edge_index
            for i in range(edge_index.size(1)):
                degrees[edge_index[0, i]] += 1
            max_deg = degrees.max().clamp(min=1)
            norm_degrees = degrees / max_deg
            log_deg = torch.log1p(degrees)
            log_deg = log_deg / log_deg.max().clamp(min=1)
            buckets = torch.zeros(num_nodes, 5)
            for i in range(num_nodes):
                d = int(degrees[i].item())
                bucket = min(4, d // max(1, int(max_deg.item()) // 5 + 1))
                buckets[i, bucket] = 1.0
            data.x = torch.cat([norm_degrees.unsqueeze(1), log_deg.unsqueeze(1), buckets], dim=1)
            feature_source = 'degree'
        feature_dim = data.x.size(1)
    else:
        feature_source = 'original'
        feature_dim = data.x.size(1)

    # Generate dummy labels if missing (for visualization only, not loss)
    if not has_labels:
        data.y = torch.zeros(num_nodes, dtype=torch.long)

    # Generate masks if missing
    if not hasattr(data, 'train_mask') or data.train_mask is None:
        perm = np.random.permutation(num_nodes)
        train_mask = torch.zeros(num_nodes, dtype=torch.bool)
        train_mask[perm[:int(0.6 * num_nodes)]] = True
        data.train_mask = train_mask

    metadata = {
        'num_nodes': num_nodes,
        'num_edges': num_edges // 2,  # undirected count
        'has_features': has_features,
        'feature_dim': feature_dim,
        'feature_source': feature_source,
        'has_labels': has_labels and num_classes > 1,
        'num_classes': num_classes if has_labels and num_classes > 1 else 0,
    }
    return data, metadata


def get_available_datasets():
    """Return list of built-in datasets."""
    return ['cora', 'citeseer', 'karate']
