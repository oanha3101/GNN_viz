import os
import tempfile
from io import BytesIO

import torch
from data.loaders import load_cora, load_citeseer, load_custom_graph, load_csv
from services.hybrid_store import blob_store

def load_dataset(name):
    """Nạp tập dữ liệu theo tên."""
    if name == 'cora':
        return load_cora()
    elif name == 'citeseer':
        return load_citeseer()
    else:
        return load_cora()


def _load_uploaded_artifact(uploaded_path):
    if not uploaded_path:
        return None

    if os.path.exists(uploaded_path):
        try:
            loaded = torch.load(uploaded_path, weights_only=False)
            if isinstance(loaded, list):
                return loaded
            if hasattr(loaded, 'edge_index'):
                return loaded
        except Exception as e:
            print(f"Direct torch.load failed: {e}. Falling back to load_custom_graph.")
        return load_custom_graph(uploaded_path)

    if not blob_store.exists(uploaded_path):
        return None

    payload = blob_store.get_bytes(uploaded_path)
    try:
        loaded = torch.load(BytesIO(payload), weights_only=False)
        if isinstance(loaded, list):
            return loaded
        if hasattr(loaded, 'edge_index'):
            return loaded
    except Exception as e:
        print(f"Blob torch.load failed: {e}. Falling back to load_custom_graph.")

    suffix = os.path.splitext(uploaded_path)[1] or ".pt"
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as handle:
            handle.write(payload)
            tmp_path = handle.name
        return load_custom_graph(tmp_path)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)

def get_data_from_config(config):
    """Nạp dữ liệu từ cấu hình (hỗ trợ cả file upload và dataset mặc định)."""
    uploaded_path = config.get('uploaded_file_path')
    uploaded_data = _load_uploaded_artifact(uploaded_path)
    if uploaded_data is not None:
        return uploaded_data
    
    dataset_name = config.get('dataset', 'cora').lower()
    return load_dataset(dataset_name)
