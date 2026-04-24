import os
import pandas as pd
import numpy as np
from torch_geometric.datasets import Planetoid, KarateClub, TUDataset

# Thư mục gốc datasets
BASE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "datasets")

def save_to_excel(df, dataset_name, filename):
    folder = os.path.join(BASE_DIR, dataset_name)
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, f"{filename}.xlsx")
    df.to_excel(path, index=False)
    print(f"  - Saved: {path}")

def generate_cora():
    print("Processing Cora...")
    dataset = Planetoid(root='/tmp/Cora', name='Cora')
    data = dataset[0]
    
    # 1. Nodes
    features = data.x.numpy()
    df_nodes = pd.DataFrame({
        'paper_id': [f"P_{i}" for i in range(data.num_nodes)],
        'topic': data.y.numpy()
    })
    # Export first 100 features for practical Excel use
    for f_idx in range(min(100, features.shape[1])):
        df_nodes[f'feat_{f_idx}'] = features[:, f_idx]
    save_to_excel(df_nodes, "Cora", "nodes")
    
    # 2. Edges
    edge_index = data.edge_index.numpy()
    df_edges = pd.DataFrame({
        'citing': [f"P_{i}" for i in edge_index[0]],
        'cited': [f"P_{i}" for i in edge_index[1]]
    })
    save_to_excel(df_edges, "Cora", "edges")

def generate_karate():
    print("Processing Karate Club...")
    dataset = KarateClub()
    data = dataset[0]
    
    # 1. Nodes
    df_nodes = pd.DataFrame({
        'node_id': list(range(data.num_nodes)),
        'club': data.y.numpy()
    })
    save_to_excel(df_nodes, "Karate", "nodes")
    
    # 2. Edges
    edge_index = data.edge_index.numpy()
    df_edges = pd.DataFrame({
        'source': edge_index[0],
        'target': edge_index[1]
    })
    save_to_excel(df_edges, "Karate", "edges")

def generate_mutag():
    print("Processing MUTAG...")
    dataset = TUDataset(root='/tmp/MUTAG', name='MUTAG')
    
    all_nodes = []
    all_edges = []
    all_graphs = []
    
    for g_idx in range(len(dataset)):
        data = dataset[g_idx]
        graph_id = f"G_{g_idx}"
        
        # 1. Graph Level
        all_graphs.append({'graph_id': graph_id, 'mutagenic': int(data.y.item())})
        
        # 2. Node Level
        num_nodes = data.num_nodes
        x = data.x.numpy() if data.x is not None else np.zeros((num_nodes, 1))
        for n_idx in range(num_nodes):
            node_row = {'node_id': f"{graph_id}_N{n_idx}", 'graph_id': graph_id}
            for f_idx in range(x.shape[1]):
                node_row[f'atom_feat_{f_idx}'] = x[n_idx, f_idx]
            all_nodes.append(node_row)
            
        # 3. Edge Level
        edge_index = data.edge_index.numpy()
        for e_idx in range(edge_index.shape[1]):
            all_edges.append({
                'source': f"{graph_id}_N{edge_index[0, e_idx]}",
                'target': f"{graph_id}_N{edge_index[1, e_idx]}",
                'graph_id': graph_id
            })
            
    save_to_excel(pd.DataFrame(all_nodes), "MUTAG", "nodes")
    save_to_excel(pd.DataFrame(all_edges), "MUTAG", "edges")
    save_to_excel(pd.DataFrame(all_graphs), "MUTAG", "graphs")

if __name__ == "__main__":
    try:
        generate_cora()
        generate_karate()
        generate_mutag()
        print("\n=== TÁCH DATASET EXCEL THÀNH CÔNG ===")
    except Exception as e:
        print(f"Lỗi: {e}")
