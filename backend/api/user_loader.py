from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler, LabelEncoder
import networkx as nx
import torch
from torch_geometric.data import Data
import tempfile
import os

router = APIRouter()

class MappingConfig(BaseModel):
    task: int
    node_id: str
    node_label: Optional[str] = None
    node_features: List[str] = []
    edge_source: str
    edge_target: str
    edge_weight: Optional[str] = None
    edge_label: Optional[str] = None
    graph_id: Optional[str] = None
    graph_label: Optional[str] = None

class ConfigurePayload(BaseModel):
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    graphs: Optional[List[Dict[str, Any]]] = None
    mapping: MappingConfig

@router.post("/configure")
async def configure_dataset(payload: ConfigurePayload):
    try:
        # Convert JSON dicts to Pandas DataFrames
        df_nodes = pd.DataFrame(payload.nodes)
        df_edges = pd.DataFrame(payload.edges)
        m = payload.mapping

        # 1. Map Node IDs to 0-based indices
        # We ensure no NaN IDs are considered by dropping them early
        all_node_ids = pd.concat([df_nodes[m.node_id], df_edges[m.edge_source], df_edges[m.edge_target]]).dropna().unique()
        node_mapper = {orig_id: i for i, orig_id in enumerate(all_node_ids)}
        num_nodes = len(node_mapper)
        
        # Build an aligned dataframe so row index i ALWAYS corresponds to _internal_id = i
        aligned_df = pd.DataFrame({m.node_id: list(all_node_ids)})
        aligned_df['_internal_id'] = range(num_nodes)
        
        # Merge user features/labels into aligned_df to guarantee exact ordering
        df_nodes_unique = df_nodes.drop_duplicates(subset=[m.node_id])
        df_nodes = pd.merge(aligned_df, df_nodes_unique, on=m.node_id, how='left')

        df_edges['_internal_source'] = df_edges[m.edge_source].map(node_mapper)
        df_edges['_internal_target'] = df_edges[m.edge_target].map(node_mapper)

        # Drop edges that reference non-existent nodes
        df_edges.dropna(subset=['_internal_source', '_internal_target'], inplace=True)
        df_edges['_internal_source'] = df_edges['_internal_source'].astype(int)
        df_edges['_internal_target'] = df_edges['_internal_target'].astype(int)

        num_edges = len(df_edges)

        # 2. Extract Features
        # Force conversion to numeric (turn invalid strings to NaN), then fill with 0
        if m.node_features:
            features_df = df_nodes[m.node_features].apply(pd.to_numeric, errors='coerce')
            features = features_df.fillna(0).values
            scaler = StandardScaler()
            features = scaler.fit_transform(features).tolist()
        else:
            # Create a dummy feature of 1.0 (shape N x 1)
            features = [[1.0]] * num_nodes
            
        # 3. Process Labels
        labels = [0] * num_nodes
        num_classes = 1
        if m.node_label and m.node_label in df_nodes.columns:
            encoder = LabelEncoder()
            labels = encoder.fit_transform(df_nodes[m.node_label].fillna('Unknown')).astype(int).tolist()
            num_classes = len(encoder.classes_)

        # 4. Extract Graphs for Output JSON 
        # (For Demo purpose, Frontend uses 'graph_json' to display the layout)
        # We generate a generic NetworkX graph to calculate basic properties if needed
        # In actual PyG build, we'll save this config on disk. Here we just return the JSON for the frontend to render.
        
        edges_json = []
        for _, row in df_edges.iterrows():
            edges_json.append({"source": row['_internal_source'], "target": row['_internal_target']})

        nodes_json = []
        # Need degrees for layout logic 
        G = nx.Graph()
        G.add_nodes_from(range(num_nodes))
        G.add_edges_from([(e['source'], e['target']) for e in edges_json])
        deg_map = dict(G.degree())

        sorted_nodes = df_nodes.sort_values('_internal_id').reset_index(drop=True)
        for i in range(num_nodes):
            nodes_json.append({
                "id": i,
                "degree": deg_map.get(i, 0),
                "groundTruth": labels[i] if len(labels) > i else 0,
                "inTrainSet": True,  # Simplification for demo
            })

        graph_json = {
            "graphData": {
                "nodes": nodes_json,
                "links": edges_json
            },
            "groundTruth": labels
        }
        
        # Build PyG Data and save to a temporary file for training
        src_arr = df_edges['_internal_source'].values
        tgt_arr = df_edges['_internal_target'].values
        # Make edges undirected for robust GNN message passing
        all_src = np.concatenate([src_arr, tgt_arr])
        all_tgt = np.concatenate([tgt_arr, src_arr])
        edge_index = torch.tensor([all_src, all_tgt], dtype=torch.long)
        
        x_tensor = torch.tensor(features, dtype=torch.float) if features else None
        y_tensor = torch.tensor(labels, dtype=torch.long)
        
        perm = np.random.permutation(num_nodes)
        train_mask = torch.zeros(num_nodes, dtype=torch.bool)
        val_mask = torch.zeros(num_nodes, dtype=torch.bool)
        test_mask = torch.zeros(num_nodes, dtype=torch.bool)
        
        train_mask[perm[:int(0.6 * num_nodes)]] = True
        val_mask[perm[int(0.6 * num_nodes):int(0.8 * num_nodes)]] = True
        test_mask[perm[int(0.8 * num_nodes):]] = True
        
        pyg_data = Data(x=x_tensor, edge_index=edge_index, y=y_tensor, 
                        train_mask=train_mask, val_mask=val_mask, test_mask=test_mask)
        
        # Save to temp file
        f = tempfile.NamedTemporaryFile(delete=False, suffix=".pt", dir=os.path.join(os.path.dirname(__file__), '..', 'datasets'))
        tmp_path = f.name
        f.close()
        torch.save(pyg_data, tmp_path)
        
        # If it's a Graph Level task, structure changes slightly (multiple isolated graphs)
        if m.task in [2, 6] and m.graph_id:
            df_nodes[m.graph_id] = df_nodes[m.graph_id].fillna(0).astype(int)
            graph_json["graphs"] = []
            for gid, group in df_nodes.groupby(m.graph_id):
                n_list = [{"id": int(row['_internal_id'])} for _, row in group.iterrows()]
                sub_nodes = set([n['id'] for n in n_list])
                e_list = [e for e in edges_json if e['source'] in sub_nodes and e['target'] in sub_nodes]
                graph_json["graphs"].append({
                    "id": int(gid),
                    "nodes": n_list,
                    "links": e_list,
                    "groundTruth": 0, # Should be extracted from graphs.xlsx
                    "numNodes": len(n_list),
                    "numEdges": len(e_list)
                })

        return {
            "status": "success",
            "metadata": {
                "task": m.task,
                "num_nodes": num_nodes,
                "num_edges": num_edges,
                "num_features": len(features[0]) if features else 1,
                "num_classes": num_classes
            },
            "graph_json": graph_json,
            "uploaded_file_path": tmp_path,
            "dataset_name": "custom"
        }
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))
