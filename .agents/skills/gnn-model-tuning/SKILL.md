# GNN-Insight: Model Architecture & Tuning Skill 🏗️🎯

Kỹ năng này chuyên sâu về việc thiết kế, chẩn đoán và tinh chỉnh (tuning) các kiến trúc Graph Neural Network để đạt hiệu năng tối ưu trên cả dữ liệu thực tế và giả lập.

## Kiến trúc Deep GNN Chuẩn

Để tránh hiện tượng **Oversmoothing** (các nút trở nên quá giống nhau khi mạng quá sâu), luôn áp dụng các kỹ thuật sau:

### 1. Thành phần Cốt lõi
- **nn.ModuleList**: Sử dụng để quản lý danh sách các lớp conv động.
- **LayerNorm / BatchNorm**: Luôn thêm sau mỗi lớp Conv để ổn định quá trình học. `LayerNorm` thường tốt hơn cho đồ thị.
- **Residual Connections**: Công thức `x = x + x_res`. Giúp bảo toàn thông tin từ các lớp nông hơn, cực kỳ quan trọng cho mạng > 2 lớp.

### 2. Cấu trúc Forward chuẩn
```python
for i in range(num_layers - 1):
    x_res = x if i > 0 else 0
    x = self.convs[i](x, edge_index)
    x = self.norms[i](x)
    x = F.relu(x) # hoặc elu
    x = x + x_res
    x = F.dropout(x, p=self.dropout, training=self.training)
```

## Chiến lược Tuning theo Task

| Triệu chứng | Nguyên nhân | Giải pháp |
|:---|:---|:---|
| **Accuracy thấp trên tập Train** | Model quá nông hoặc Hidden Dim quá nhỏ. | Tăng `num_layers` (3-5) hoặc `hidden_dim` (128-256). |
| **Accuracy Train cao, Val thấp** | Overfitting. | Tăng `dropout` (0.6+), thêm weight decay (L2). |
| **Dirichlet Energy tụt về 0** | Oversmoothing. | Giảm `num_layers`, tăng Residual weight hoặc thêm JumpKnowledge. |
| **Embedding View bị dính chùm** | Feature noise hoặc Collapsed space. | Kiểm tra `Isotropy`, thử dùng `GAT` để lọc nhiễu qua Attention. |

## Quy trình Chẩn đoán (XAI)
1. **Kiểm tra Dirichlet Energy**: Nếu đồ thị phẳng, model mất khả năng phân biệt.
2. **Soi Confusion Matrix**: Nếu nhầm lẫn giữa các cụm xa nhau, model chưa học được Topo toàn cục.
3. **Kiểm tra Homophily**: Nếu data có tính heterophilic (nút khác nhãn kết nối nhau), hãy dùng `GraphSAGE` hoặc `GAT` thay vì `GCN`.

## Ghi chú về PyTorch Geometric
- Luôn trả về bộ tuple `(logits, embedding)` cho FE.
- Đối với `GAT`, trả thêm `attention_weights` của layer đầu tiên để visualize.
