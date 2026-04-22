import os
import torch
from data.loaders import load_cora, load_citeseer, load_custom_graph, load_csv

def load_dataset(name):
    """Nạp tập dữ liệu theo tên."""
    if name == 'cora':
        return load_cora()
    elif name == 'citeseer':
        return load_citeseer()
    else:
        return load_cora()

def get_data_from_config(config):
    """Nạp dữ liệu từ cấu hình (hỗ trợ cả file upload và dataset mặc định)."""
    uploaded_path = config.get('uploaded_file_path')
    if uploaded_path and os.path.exists(uploaded_path):
        try:
            loaded = torch.load(uploaded_path, weights_only=False)
            if isinstance(loaded, list):
                return loaded
            if hasattr(loaded, 'edge_index'):
                return loaded
        except Exception as e:
            print(f"Direct torch.load failed: {e}. Falling back to load_custom_graph.")
        
        return load_custom_graph(uploaded_path)
    
    dataset_name = config.get('dataset', 'cora').lower()
    return load_dataset(dataset_name)
