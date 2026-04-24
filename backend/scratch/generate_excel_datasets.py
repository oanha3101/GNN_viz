import os
import pandas as pd
import numpy as np
from torch_geometric.datasets import Planetoid, KarateClub, TUDataset

# Thư mục đích
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "datasets", "excel")
os.makedirs(OUTPUT_DIR, exist_ok=True)

def generate_cora():
    print("Downloading Cora...")
    dataset = Planetoid(root='/tmp/Cora', name='Cora')
    data = dataset[0]
    
    # 1. Nodes Sheet
    # Cora has 1433 features. We'll export first 50 features for clarity in Excel
    num_nodes = data.num_nodes
    features = data.x.numpy()
    labels = data.y.numpy()
    
    df_nodes = pd.DataFrame({
        'paper_id': [f"P_{i}" for i in range(num_nodes)],
        'topic': labels
    })
    # Add features as columns
    for f_idx in range(50): # Limit to 50 for Excel usability
        df_nodes[f'feat_{f_idx}'] = features[:, f_idx]
    
    # 2. Edges Sheet
    edge_index = data.edge_index.numpy()
    df_edges = pd.DataFrame({
        'citing': [f"P_{i}" for i in edge_index[0]],
        'cited': [f"P_{i}" for i in edge_index[1]]
    })
    
    path = os.path.join(OUTPUT_DIR, "Cora_Task135.xlsx")
    with pd.ExcelWriter(path) as writer:
        df_nodes.to_excel(writer, sheet_name='Nodes', index=False)
        df_edges.to_excel(writer, sheet_name='Edges', index=False)
    print(f"Saved: {path}")

def generate_karate():
    print("Downloading Karate Club...")
    dataset = KarateClub()
    data = dataset[0]
    
    # 1. Nodes Sheet
    num_nodes = data.num_nodes
    labels = data.y.numpy()
    df_nodes = pd.DataFrame({
        'node_id': list(range(num_nodes)),
        'club': labels
    })
    
    # 2. Edges Sheet
    edge_index = data.edge_index.numpy()
    df_edges = pd.DataFrame({
        'source': edge_index[0],
        'target': edge_index[1]
    })
    
    path = os.path.join(OUTPUT_DIR, "Karate_Task4.xlsx")
    with pd.ExcelWriter(path) as writer:
        df_nodes.to_excel(writer, sheet_name='Nodes', index=False)
        df_edges.to_excel(writer, sheet_name='Edges', index=False)
    print(f"Saved: {path}")

def generate_mutag():
    print("Downloading MUTAG (Graph Classification)...")
    dataset = TUDataset(root='/tmp/MUTAG', name='MUTAG')
    
    all_nodes = []
    all_edges = []
    all_graphs = []
    
    # Process all graphs in the dataset
    for g_idx in range(len(dataset)):
        data = dataset[g_idx]
        graph_id = f"G_{g_idx}"
        
        # 1. Collect Graph Info
        all_graphs.append({
            'graph_id': graph_id,
            'mutagenic': int(data.y.item())
        })
        
        # 2. Collect Node Info
        num_nodes = data.num_nodes
        x = data.x.numpy() if data.x is not None else np.zeros((num_nodes, 1))
        for n_idx in range(num_nodes):
            node_row = {
                'node_id': f"{graph_id}_N{n_idx}",
                'graph_id': graph_id
            }
            # Add features
            for f_idx in range(x.shape[1]):
                node_row[f'atom_feat_{f_idx}'] = x[n_idx, f_idx]
            all_nodes.append(node_row)
            
        # 3. Collect Edge Info
        edge_index = data.edge_index.numpy()
        for e_idx in range(edge_index.shape[1]):
            all_edges.append({
                'source': f"{graph_id}_N{edge_index[0, e_idx]}",
                'target': f"{graph_id}_N{edge_index[1, e_idx]}",
                'graph_id': graph_id
            })
            
    df_nodes = pd.DataFrame(all_nodes)
    df_edges = pd.DataFrame(all_edges)
    df_graphs = pd.DataFrame(all_graphs)
    
    path = os.path.join(OUTPUT_DIR, "MUTAG_Task26.xlsx")
    # Due to size, we might limit rows if Excel complains, but MUTAG is small
    with pd.ExcelWriter(path) as writer:
        df_nodes.to_excel(writer, sheet_name='Nodes', index=False)
        df_edges.to_excel(writer, sheet_name='Edges', index=False)
        df_graphs.to_excel(writer, sheet_name='Graphs', index=False)
    print(f"Saved: {path}")

if __name__ == "__main__":
    try:
        generate_cora()
        generate_karate()
        generate_mutag()
        print("\n=== TẤT CẢ DATASET EXCEL ĐÃ ĐƯỢC TẠO THÀNH CÔNG ===")
        print(f"Vị trí: {OUTPUT_DIR}")
    except Exception as e:
        print(f"Lỗi: {e}")
