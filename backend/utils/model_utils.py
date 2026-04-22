import torch
from models.gcn import GCNModel
from models.gat import GATModel
from models.graphsage import GraphSAGEModel

def build_model(config, data=None, num_features=None, num_classes=None):
    """Xây dựng mô hình GNN dựa trên cấu hình và dữ liệu đầu vào."""
    model_type = config.get('model', 'GCN')
    hidden = config.get('hidden', 64)
    dropout = config.get('dropout', 0.5)
    
    if data is not None:
        num_features = data.x.size(1)
        num_classes = max(2, int(data.y.max().item()) + 1)
    elif num_features is None or num_classes is None:
        # Mặc định cho Cora
        num_features = 1433
        num_classes = 7

    if model_type == 'GCN':
        return GCNModel(num_features, hidden, num_classes, dropout)
    elif model_type == 'GAT':
        heads = config.get('heads', 4)
        return GATModel(num_features, hidden, num_classes, heads, dropout)
    elif model_type == 'SAGE':
        return GraphSAGEModel(num_features, hidden, num_classes, dropout)
    else:
        return GCNModel(num_features, hidden, num_classes, dropout)

def should_take_snapshot(epoch: int, total_epochs: int) -> bool:
    """
    Quyết định xem có nên thực hiện PCA và gửi snapshot ở epoch này không.
    Giúp tối ưu hóa CPU/GPU bottleneck.
    """
    if epoch == 0 or epoch == total_epochs - 1:
        return True
        
    if total_epochs <= 50:
        return True
    elif total_epochs <= 200:
        return epoch % 2 == 0
    elif total_epochs <= 500:
        return epoch % 5 == 0
    else:
        return epoch % 10 == 0
