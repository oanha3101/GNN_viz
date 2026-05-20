"""
Task Adapters — task-specific data validation, processing, and FE graph JSON generation.

Each adapter class implements:
  - required_fields()  → list of (field_name, source) pairs
  - validate(mapping, node_cols, edge_cols, graph_cols) → errors, warnings
  - process(df_nodes, df_edges, df_graphs, mapping, node_mapper, num_nodes) → dict
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, Tuple
import pandas as pd
import numpy as np
import networkx as nx
import torch
from torch_geometric.data import Data
from sklearn.preprocessing import StandardScaler, LabelEncoder


# ══════════════════════════════════════════════════════════════════════════════
# Base Adapter
# ══════════════════════════════════════════════════════════════════════════════

class BaseTaskAdapter(ABC):
    """Base class for all task adapters."""

    task_id: int = 0
    task_name: str = ""

    @abstractmethod
    def required_fields(self) -> List[Dict[str, str]]:
        """Return list of {'field': ..., 'source': 'nodes'|'edges'|'graphs', 'required': bool, 'description': ...}"""
        pass

    def validate(self, mapping, node_cols: List[str], edge_cols: List[str],
                 graph_cols: List[str]) -> Tuple[List[str], List[str]]:
        """Validate mapping against available columns.

        Returns: (errors: List[str], warnings: List[str])
        """
        errors = []
        warnings = []

        # Common validations
        if not mapping.node_id or mapping.node_id not in node_cols:
            errors.append(f"Node ID column '{mapping.node_id}' not found in nodes data")
        if not mapping.edge_source or mapping.edge_source not in edge_cols:
            errors.append(f"Edge Source column '{mapping.edge_source}' not found in edges data")
        if not mapping.edge_target or mapping.edge_target not in edge_cols:
            errors.append(f"Edge Target column '{mapping.edge_target}' not found in edges data")

        # Feature validation
        for feat in mapping.node_features:
            if feat not in node_cols:
                warnings.append(f"Node feature column '{feat}' not found (will be ignored)")

        if mapping.edge_weight and mapping.edge_weight not in edge_cols:
            warnings.append(f"Edge weight column '{mapping.edge_weight}' not found (will use uniform weights)")

        return errors, warnings

    def _common_processing(self, df_nodes, df_edges, mapping, node_mapper, num_nodes):
        """Common processing shared across all tasks: features, labels, edge_index."""
        m = mapping

        # ── Extract Features (Smart Processing) ──
        if m.node_features:
            valid_features = [f for f in m.node_features if f in df_nodes.columns]
            if valid_features:
                processed_parts = []
                for col in valid_features:
                    series = df_nodes[col]
                    
                    # 1. Nếu là kiểu số (Numeric)
                    if pd.api.types.is_numeric_dtype(series):
                        val = pd.to_numeric(series, errors='coerce').fillna(0).values.reshape(-1, 1)
                        scaler = StandardScaler()
                        processed_parts.append(scaler.fit_transform(val))
                    
                    # 2. Nếu là kiểu thời gian (Datetime)
                    elif pd.api.types.is_datetime64_any_dtype(series) or 'date' in col.lower() or 'time' in col.lower():
                        try:
                            dt = pd.to_datetime(series, errors='coerce').fillna(pd.Timestamp('2020-01-01'))
                            dt_features = np.column_stack([
                                dt.dt.year.values,
                                dt.dt.month.values,
                                dt.dt.day.values,
                                dt.dt.hour.values
                            ]).astype(float)
                            scaler = StandardScaler()
                            processed_parts.append(scaler.fit_transform(dt_features))
                        except Exception:
                            # Nếu fail thì coi như categorical ở bước sau
                            pass

                    # 3. Nếu là kiểu phân loại (Categorical)
                    else:
                        nunique = series.nunique()
                        # Nếu số lượng nhóm ít (Low cardinality) -> One-Hot Encoding
                        if nunique <= 25:
                            dummies = pd.get_dummies(series, prefix=col, dummy_na=True).values
                            processed_parts.append(dummies.astype(float))
                        # Nếu số lượng nhóm quá lớn -> Label Encoding chuẩn hóa về [0, 1]
                        else:
                            le = LabelEncoder()
                            encoded = le.fit_transform(series.astype(str).fillna('Unknown')).reshape(-1, 1)
                            processed_parts.append(encoded.astype(float) / max(1, nunique - 1))
                
                if processed_parts:
                    features = np.hstack(processed_parts).tolist()
                else:
                    # Fallback if all processing failed
                    features = [[1.0]] * num_nodes
            else:
                features = [[1.0]] * num_nodes
        else:
            features = [[1.0]] * num_nodes

        # ── Extract Labels ──
        labels = [0] * num_nodes
        num_classes = 1
        class_names = []
        if m.node_label and m.node_label in df_nodes.columns:
            encoder = LabelEncoder()
            labels = encoder.fit_transform(
                df_nodes[m.node_label].fillna('Unknown')
            ).astype(int).tolist()
            num_classes = len(encoder.classes_)
            class_names = encoder.classes_.tolist()

        # ── Edge Index ──
        src_arr = df_edges['_internal_source'].values
        tgt_arr = df_edges['_internal_target'].values

        # Make edges undirected (unless directed)
        if not getattr(m, 'is_directed', False):
            all_src = np.concatenate([src_arr, tgt_arr])
            all_tgt = np.concatenate([tgt_arr, src_arr])
        else:
            all_src = src_arr
            all_tgt = tgt_arr

        edge_index = torch.tensor([all_src, all_tgt], dtype=torch.long)

        # ── Edge Weights ──
        edge_weights = None
        if m.edge_weight and m.edge_weight in df_edges.columns:
            weights_raw = pd.to_numeric(df_edges[m.edge_weight], errors='coerce').fillna(1.0).values
            if not getattr(m, 'is_directed', False):
                edge_weights = np.concatenate([weights_raw, weights_raw])
            else:
                edge_weights = weights_raw

        # ── Build NetworkX Graph for degree calculation ──
        edges_json = []
        for _, row in df_edges.iterrows():
            edge_entry = {
                "source": int(row['_internal_source']),
                "target": int(row['_internal_target'])
            }
            if edge_weights is not None:
                edge_entry["weight"] = float(
                    pd.to_numeric(row.get(m.edge_weight, 1.0), errors='coerce') or 1.0
                ) if m.edge_weight else 1.0
            edges_json.append(edge_entry)

        G = nx.Graph() if not getattr(m, 'is_directed', False) else nx.DiGraph()
        G.add_nodes_from(range(num_nodes))
        G.add_edges_from([(e['source'], e['target']) for e in edges_json])
        deg_map = dict(G.degree())

        # ── Extract Raw Node Info for UI (Rich Metadata) ──
        base_nodes = []
        # Sort values to iterate in _internal_id order (0 to num_nodes - 1)
        df_nodes_sorted = df_nodes.sort_values('_internal_id').reset_index(drop=True)
        for _, row in df_nodes_sorted.iterrows():
            nid = int(row['_internal_id'])
            # 1. Base ID & Degree
            node_entry = {
                "id": nid,
                "degree": deg_map.get(nid, 0),
                "original_id": str(row[m.node_id]) if m.node_id in row else str(nid)
            }
            # 2. String Label
            if m.node_label and m.node_label in row and pd.notna(row[m.node_label]):
                node_entry["label_name"] = str(row[m.node_label])
            # 3. Features Dictionary
            feat_dict = {}
            if m.node_features:
                for f in m.node_features:
                    if f in row:
                        val = row[f]
                        if pd.isna(val): continue
                        if isinstance(val, (int, float, np.number)):
                            feat_dict[f] = float(val)
                        else:
                            feat_dict[f] = str(val)
            node_entry["features"] = feat_dict
            
            base_nodes.append(node_entry)

        return {
            'features': features,
            'labels': labels,
            'num_classes': num_classes,
            'edge_index': edge_index,
            'edge_weights': edge_weights,
            'edges_json': edges_json,
            'deg_map': deg_map,
            'G': G,
            'base_nodes': base_nodes,
            'class_names': class_names,
        }

    @abstractmethod
    def process(self, df_nodes, df_edges, df_graphs, mapping,
                node_mapper, num_nodes) -> Dict[str, Any]:
        """Process data and return result dict with PyG Data + graph JSON."""
        pass


# ══════════════════════════════════════════════════════════════════════════════
# Task 1: Node Classification Adapter
# ══════════════════════════════════════════════════════════════════════════════

class NodeClassificationAdapter(BaseTaskAdapter):
    task_id = 1
    task_name = "Node Classification"

    def required_fields(self):
        return [
            {'field': 'node_id', 'source': 'nodes', 'required': True,
             'description': 'Unique node identifier'},
            {'field': 'node_label', 'source': 'nodes', 'required': True,
             'description': 'Class label for each node (Y)'},
            {'field': 'node_features', 'source': 'nodes', 'required': False,
             'description': 'Feature columns (X). Auto-generated from degree if missing.'},
            {'field': 'edge_source', 'source': 'edges', 'required': True,
             'description': 'Source node of each edge'},
            {'field': 'edge_target', 'source': 'edges', 'required': True,
             'description': 'Target node of each edge'},
        ]

    def validate(self, mapping, node_cols, edge_cols, graph_cols):
        errors, warnings = super().validate(mapping, node_cols, edge_cols, graph_cols)

        if not mapping.node_label:
            warnings.append("No node_label specified — model will train with dummy labels (unsupervised fallback)")
        elif mapping.node_label not in node_cols:
            errors.append(f"Node label column '{mapping.node_label}' not found in nodes data")

        if not mapping.node_features:
            warnings.append("No features specified — will auto-generate from node degree")

        return errors, warnings

    def process(self, df_nodes, df_edges, df_graphs, mapping, node_mapper, num_nodes):
        common = self._common_processing(df_nodes, df_edges, mapping, node_mapper, num_nodes)

        # Build node JSON for frontend
        nodes_json = []
        for i, base_node in enumerate(common['base_nodes']):
            node_entry = base_node.copy()
            node_entry["groundTruth"] = common['labels'][i] if i < len(common['labels']) else 0
            node_entry["inTrainSet"] = True
            nodes_json.append(node_entry)

        train_mask = torch.zeros(num_nodes, dtype=torch.bool)
        val_mask = torch.zeros(num_nodes, dtype=torch.bool)
        test_mask = torch.zeros(num_nodes, dtype=torch.bool)
        perm = np.random.permutation(num_nodes)
        train_mask[perm[:int(0.6 * num_nodes)]] = True
        val_mask[perm[int(0.6 * num_nodes):int(0.8 * num_nodes)]] = True
        test_mask[perm[int(0.8 * num_nodes):]] = True
        for i, node_entry in enumerate(nodes_json):
            node_entry["inTrainSet"] = bool(train_mask[i].item())

        graph_json = {
            "graphData": {"nodes": nodes_json, "links": common['edges_json']},
            "groundTruth": common['labels'],
            "classNames": common['class_names'],
            "trainMask": train_mask.cpu().tolist(),
            "valMask": val_mask.cpu().tolist(),
            "testMask": test_mask.cpu().tolist(),
        }

        # Build PyG Data
        x_tensor = torch.tensor(common['features'], dtype=torch.float)
        y_tensor = torch.tensor(common['labels'], dtype=torch.long)

        pyg_data = Data(
            x=x_tensor, edge_index=common['edge_index'], y=y_tensor,
            train_mask=train_mask, val_mask=val_mask, test_mask=test_mask,
        )

        if common['edge_weights'] is not None:
            pyg_data.edge_attr = torch.tensor(common['edge_weights'], dtype=torch.float).unsqueeze(1)

        return {
            'pyg_data': pyg_data,
            'graph_json': graph_json,
            'num_classes': common['num_classes'],
            'num_features': len(common['features'][0]) if common['features'] else 1,
        }


# ══════════════════════════════════════════════════════════════════════════════
# Task 2: Graph Classification Adapter
# ══════════════════════════════════════════════════════════════════════════════

class GraphClassificationAdapter(BaseTaskAdapter):
    task_id = 2
    task_name = "Graph Classification"

    def required_fields(self):
        return [
            {'field': 'node_id', 'source': 'nodes', 'required': True,
             'description': 'Unique node identifier'},
            {'field': 'graph_id', 'source': 'nodes', 'required': True,
             'description': 'Graph membership for each node'},
            {'field': 'graph_label', 'source': 'graphs', 'required': True,
             'description': 'Class label for each graph'},
            {'field': 'node_features', 'source': 'nodes', 'required': False,
             'description': 'Node feature columns (auto-generated from degree if missing)'},
            {'field': 'edge_source', 'source': 'edges', 'required': True,
             'description': 'Source node of each edge'},
            {'field': 'edge_target', 'source': 'edges', 'required': True,
             'description': 'Target node of each edge'},
        ]

    def validate(self, mapping, node_cols, edge_cols, graph_cols):
        errors, warnings = super().validate(mapping, node_cols, edge_cols, graph_cols)

        if not mapping.graph_id:
            # Check if graph_id is in node columns (can be there instead of graphs file)
            graph_id_found = any(c.lower() in ['graph_id', 'graphid', 'g_id']
                                for c in node_cols)
            if not graph_id_found:
                errors.append("Graph ID is required for Graph Classification. "
                              "Add 'graph_id' column to nodes file or upload a graphs file.")
        elif mapping.graph_id not in node_cols and mapping.graph_id not in graph_cols:
            errors.append(f"Graph ID column '{mapping.graph_id}' not found")

        if not mapping.graph_label:
            warnings.append("No graph_label specified — cannot compute classification accuracy")
        elif graph_cols and mapping.graph_label not in graph_cols:
            errors.append(f"Graph label column '{mapping.graph_label}' not found in graphs data")

        return errors, warnings

    def process(self, df_nodes, df_edges, df_graphs, mapping, node_mapper, num_nodes):
        m = mapping
        common = self._common_processing(df_nodes, df_edges, mapping, node_mapper, num_nodes)

        # Ensure graph_id column is present
        graph_id_col = m.graph_id
        if graph_id_col not in df_nodes.columns:
            raise ValueError(f"Graph ID column '{graph_id_col}' not found in nodes data")

        df_nodes[graph_id_col] = df_nodes[graph_id_col].fillna(0)

        # Build graph-level labels from graphs file
        graph_labels = {}
        if df_graphs is not None and len(df_graphs) > 0 and m.graph_label:
            label_encoder = LabelEncoder()
            df_graphs['_encoded_label'] = label_encoder.fit_transform(
                df_graphs[m.graph_label].fillna('Unknown')
            )
            # Map graph_id → label
            gid_col_in_graphs = m.graph_id if m.graph_id in df_graphs.columns else df_graphs.columns[0]
            for _, row in df_graphs.iterrows():
                graph_labels[row[gid_col_in_graphs]] = int(row['_encoded_label'])
            num_graph_classes = len(label_encoder.classes_)
        else:
            num_graph_classes = 0

        # Group nodes by graph_id and build per-graph PyG Data
        from torch_geometric.data import Data as PyGData

        pyg_graphs = []
        graphs_json = []

        for gid, group in df_nodes.groupby(graph_id_col):
            node_ids = group['_internal_id'].tolist()
            n_list = [common['base_nodes'][nid].copy() for nid in node_ids]
            sub_nodes_set = set(node_ids)

            # Get edges for this subgraph
            e_list = [e for e in common['edges_json']
                      if e['source'] in sub_nodes_set and e['target'] in sub_nodes_set]

            # Build local node mapping (global → local 0-based for this subgraph)
            local_map = {global_id: local_id for local_id, global_id in enumerate(node_ids)}
            n_sub = len(node_ids)

            # Local features
            sub_features = [common['features'][nid] for nid in node_ids]
            x = torch.tensor(sub_features, dtype=torch.float)

            # Local edge_index
            local_edges = []
            for e in e_list:
                if e['source'] in local_map and e['target'] in local_map:
                    local_edges.append([local_map[e['source']], local_map[e['target']]])
                    local_edges.append([local_map[e['target']], local_map[e['source']]])

            if local_edges:
                edge_index = torch.tensor(local_edges, dtype=torch.long).t().contiguous()
            else:
                edge_index = torch.zeros((2, 0), dtype=torch.long)

            # Graph label
            gt_label = graph_labels.get(gid, 0)
            y = torch.tensor([gt_label], dtype=torch.long)

            pyg_data = PyGData(x=x, edge_index=edge_index, y=y)
            pyg_graphs.append(pyg_data)

            graphs_json.append({
                "id": int(len(graphs_json)),
                "groundTruth": gt_label,
                "nodes": n_list,
                "links": [{'source': e['source'], 'target': e['target']} for e in e_list],
                "numNodes": n_sub,
                "numEdges": len(e_list),
            })

        graph_json = {
            "graphs": graphs_json,
            "groundTruth": [g['groundTruth'] for g in graphs_json],
        }

        return {
            'pyg_data_list': pyg_graphs,
            'graph_json': graph_json,
            'num_classes': num_graph_classes,
            'num_features': len(common['features'][0]) if common['features'] else 1,
            'num_graphs': len(pyg_graphs),
        }


# ══════════════════════════════════════════════════════════════════════════════
# Task 3: Link Prediction Adapter
# ══════════════════════════════════════════════════════════════════════════════

class LinkPredictionAdapter(BaseTaskAdapter):
    task_id = 3
    task_name = "Link Prediction"

    def required_fields(self):
        return [
            {'field': 'node_id', 'source': 'nodes', 'required': True,
             'description': 'Unique node identifier'},
            {'field': 'edge_source', 'source': 'edges', 'required': True,
             'description': 'Source node of each edge'},
            {'field': 'edge_target', 'source': 'edges', 'required': True,
             'description': 'Target node of each edge'},
            {'field': 'edge_weight', 'source': 'edges', 'required': False,
             'description': 'Edge weight (used in loss function)'},
            {'field': 'node_features', 'source': 'nodes', 'required': False,
             'description': 'Node features (auto-generated from degree if missing)'},
            {'field': 'edge_split_ratio', 'source': 'config', 'required': False,
             'description': 'Test edge ratio (default: 0.15)'},
        ]

    def validate(self, mapping, node_cols, edge_cols, graph_cols):
        errors, warnings = super().validate(mapping, node_cols, edge_cols, graph_cols)

        if not mapping.node_features:
            warnings.append("No node features — will use degree-based features for link prediction")

        split_ratio = getattr(mapping, 'edge_split_ratio', 0.15)
        if split_ratio <= 0 or split_ratio >= 0.5:
            warnings.append(f"edge_split_ratio={split_ratio} is unusual. Recommended: 0.1 - 0.2")

        return errors, warnings

    def process(self, df_nodes, df_edges, df_graphs, mapping, node_mapper, num_nodes):
        common = self._common_processing(df_nodes, df_edges, mapping, node_mapper, num_nodes)

        # Build nodes JSON (no labels needed for link prediction)
        nodes_json = [n.copy() for n in common['base_nodes']]

        graph_json = {
            "graphData": {"nodes": nodes_json, "links": common['edges_json']},
            "groundTruth": common['labels'],
        }

        # Build PyG Data
        x_tensor = torch.tensor(common['features'], dtype=torch.float)
        y_tensor = torch.tensor(common['labels'], dtype=torch.long)

        pyg_data = Data(x=x_tensor, edge_index=common['edge_index'], y=y_tensor)

        if common['edge_weights'] is not None:
            pyg_data.edge_attr = torch.tensor(common['edge_weights'], dtype=torch.float).unsqueeze(1)

        # Store edge_split_ratio in config (will be used by task runner)
        split_ratio = getattr(mapping, 'edge_split_ratio', 0.15)

        # Generate masks
        perm = np.random.permutation(num_nodes)
        train_mask = torch.zeros(num_nodes, dtype=torch.bool)
        train_mask[perm[:int(0.8 * num_nodes)]] = True
        pyg_data.train_mask = train_mask

        return {
            'pyg_data': pyg_data,
            'graph_json': graph_json,
            'num_features': len(common['features'][0]) if common['features'] else 1,
            'num_classes': common['num_classes'],
            'edge_split_ratio': split_ratio,
            'has_edge_weights': common['edge_weights'] is not None,
        }


# ══════════════════════════════════════════════════════════════════════════════
# Task 4: Community Detection Adapter
# ══════════════════════════════════════════════════════════════════════════════

class CommunityDetectionAdapter(BaseTaskAdapter):
    task_id = 4
    task_name = "Community Detection"

    def required_fields(self):
        return [
            {'field': 'node_id', 'source': 'nodes', 'required': True,
             'description': 'Unique node identifier'},
            {'field': 'edge_source', 'source': 'edges', 'required': True,
             'description': 'Source node of each edge'},
            {'field': 'edge_target', 'source': 'edges', 'required': True,
             'description': 'Target node of each edge'},
            {'field': 'community_label', 'source': 'nodes', 'required': False,
             'description': 'Ground truth community assignment (for evaluation)'},
            {'field': 'num_communities', 'source': 'config', 'required': False,
             'description': 'Target number of communities (default: auto-detect or 4)'},
            {'field': 'node_features', 'source': 'nodes', 'required': False,
             'description': 'Node features (auto-generated from degree if missing)'},
        ]

    def validate(self, mapping, node_cols, edge_cols, graph_cols):
        errors, warnings = super().validate(mapping, node_cols, edge_cols, graph_cols)

        if mapping.community_label and mapping.community_label not in node_cols:
            warnings.append(f"Community label column '{mapping.community_label}' not found. "
                           "Will run fully unsupervised.")

        if not mapping.community_label:
            warnings.append("No community ground truth — will run fully unsupervised (no NMI evaluation)")

        return errors, warnings

    def process(self, df_nodes, df_edges, df_graphs, mapping, node_mapper, num_nodes):
        m = mapping
        common = self._common_processing(df_nodes, df_edges, mapping, node_mapper, num_nodes)

        # Extract community ground truth if available
        community_gt = None
        num_communities = getattr(m, 'num_communities', None) or 4

        if m.community_label and m.community_label in df_nodes.columns:
            encoder = LabelEncoder()
            community_gt = encoder.fit_transform(
                df_nodes[m.community_label].fillna('Unknown')
            ).astype(int).tolist()
            num_communities = len(encoder.classes_)

        # Build nodes JSON
        nodes_json = []
        for i, base_node in enumerate(common['base_nodes']):
            node_entry = base_node.copy()
            if community_gt:
                node_entry["community"] = community_gt[i] if i < len(community_gt) else 0
            nodes_json.append(node_entry)

        graph_json = {
            "graphData": {"nodes": nodes_json, "links": common['edges_json']},
            "communityGroundTruth": community_gt,
            "numCommunities": num_communities,
        }

        # Build PyG Data
        x_tensor = torch.tensor(common['features'], dtype=torch.float)
        y_tensor = torch.tensor(
            community_gt if community_gt else [0] * num_nodes, dtype=torch.long
        )

        pyg_data = Data(x=x_tensor, edge_index=common['edge_index'], y=y_tensor)

        # Generate train mask
        perm = np.random.permutation(num_nodes)
        train_mask = torch.zeros(num_nodes, dtype=torch.bool)
        train_mask[perm[:int(0.8 * num_nodes)]] = True
        pyg_data.train_mask = train_mask

        return {
            'pyg_data': pyg_data,
            'graph_json': graph_json,
            'num_features': len(common['features'][0]) if common['features'] else 1,
            'num_classes': num_communities,
            'num_communities': num_communities,
            'has_community_gt': community_gt is not None,
        }


# ══════════════════════════════════════════════════════════════════════════════
# Task 5: Graph Embedding Adapter
# ══════════════════════════════════════════════════════════════════════════════

class GraphEmbeddingAdapter(BaseTaskAdapter):
    task_id = 5
    task_name = "Graph Embedding"

    def required_fields(self):
        return [
            {'field': 'node_id', 'source': 'nodes', 'required': True,
             'description': 'Unique node identifier'},
            {'field': 'edge_source', 'source': 'edges', 'required': True,
             'description': 'Source node of each edge'},
            {'field': 'edge_target', 'source': 'edges', 'required': True,
             'description': 'Target node of each edge'},
            {'field': 'node_features', 'source': 'nodes', 'required': False,
             'description': 'Node features (auto-generated from degree if missing)'},
        ]

    def process(self, df_nodes, df_edges, df_graphs, mapping, node_mapper, num_nodes):
        common = self._common_processing(df_nodes, df_edges, mapping, node_mapper, num_nodes)

        nodes_json = [n.copy() for n in common['base_nodes']]

        graph_json = {
            "graphData": {"nodes": nodes_json, "links": common['edges_json']},
            "groundTruth": common['labels'],
        }

        # Build PyG Data — labels optional for embedding task
        x_tensor = torch.tensor(common['features'], dtype=torch.float)
        y_tensor = torch.tensor(common['labels'], dtype=torch.long)

        pyg_data = Data(x=x_tensor, edge_index=common['edge_index'], y=y_tensor)

        # Masks
        perm = np.random.permutation(num_nodes)
        train_mask = torch.zeros(num_nodes, dtype=torch.bool)
        train_mask[perm[:int(0.6 * num_nodes)]] = True
        pyg_data.train_mask = train_mask

        return {
            'pyg_data': pyg_data,
            'graph_json': graph_json,
            'num_features': len(common['features'][0]) if common['features'] else 1,
            'num_classes': common['num_classes'],
        }


# ══════════════════════════════════════════════════════════════════════════════
# Task 6: Graph Generation Adapter
# ══════════════════════════════════════════════════════════════════════════════

class GraphGenerationAdapter(BaseTaskAdapter):
    task_id = 6
    task_name = "Graph Generation"

    def required_fields(self):
        return [
            {'field': 'node_id', 'source': 'nodes', 'required': True,
             'description': 'Unique node identifier'},
            {'field': 'edge_source', 'source': 'edges', 'required': True,
             'description': 'Source node of each edge'},
            {'field': 'edge_target', 'source': 'edges', 'required': True,
             'description': 'Target node of each edge'},
            {'field': 'graph_id', 'source': 'nodes', 'required': False,
             'description': 'Graph ID for multiple reference graphs (optional)'},
        ]

    def validate(self, mapping, node_cols, edge_cols, graph_cols):
        errors, warnings = super().validate(mapping, node_cols, edge_cols, graph_cols)

        warnings.append("Graph Generation uses your uploaded graph as a reference "
                         "to learn structural patterns.")
        return errors, warnings

    def process(self, df_nodes, df_edges, df_graphs, mapping, node_mapper, num_nodes):
        common = self._common_processing(df_nodes, df_edges, mapping, node_mapper, num_nodes)

        G = common['G']
        num_edges = G.number_of_edges()
        density = nx.density(G)
        avg_degree = sum(d for _, d in G.degree()) / max(1, num_nodes)

        nodes_json = [n.copy() for n in common['base_nodes']]

        graph_json = {
            "referenceGraph": {
                "numNodes": num_nodes,
                "numEdges": num_edges,
                "density": float(density),
                "avgDegree": float(avg_degree),
                "nodes": nodes_json,
                "links": common['edges_json'],
            },
            "graphData": {"nodes": nodes_json, "links": common['edges_json']},
        }

        # Build PyG Data (used as reference for generation)
        x_tensor = torch.tensor(common['features'], dtype=torch.float)
        y_tensor = torch.tensor(common['labels'], dtype=torch.long)

        pyg_data = Data(x=x_tensor, edge_index=common['edge_index'], y=y_tensor)
        pyg_data.train_mask = torch.ones(num_nodes, dtype=torch.bool)

        return {
            'pyg_data': pyg_data,
            'graph_json': graph_json,
            'num_features': len(common['features'][0]) if common['features'] else 1,
            'num_classes': 1,
            'reference_density': float(density),
            'reference_avg_degree': float(avg_degree),
        }


# ══════════════════════════════════════════════════════════════════════════════
# Registry
# ══════════════════════════════════════════════════════════════════════════════

TASK_ADAPTERS = {
    1: NodeClassificationAdapter(),
    2: GraphClassificationAdapter(),
    3: LinkPredictionAdapter(),
    4: CommunityDetectionAdapter(),
    5: GraphEmbeddingAdapter(),
    6: GraphGenerationAdapter(),
}


def get_adapter(task_id: int) -> BaseTaskAdapter:
    """Get the adapter for a given task ID."""
    adapter = TASK_ADAPTERS.get(task_id)
    if not adapter:
        raise ValueError(f"Unknown task ID: {task_id}. Valid tasks: 1-6")
    return adapter
