---
name: gnn-be-tdd
description: "Kỹ năng phát triển Backend cho GNN-Insight theo quy trình TDD. Dùng khi viết API FastAPI, training loops GNN (PyTorch Geometric), hoặc logic Database (SQLAlchemy/MongoDB)."
---

# GNN-Insight: Backend TDD Workflow

Kỹ năng này đảm bảo tính tin cậy của các thuật toán GNN và độ ổn định của hệ thống API.

## Quy trình TDD (pytest)

1. **Xác định Interface**: Trước khi viết code, hãy xác định input/output của hàm hoặc API route.
2. **Viết Test Case**: Sử dụng `pytest`. Viết các test case cho cả trường hợp dữ liệu đúng và dữ liệu lỗi (VD: đồ thị không có cạnh).
3. **Triển khai Logic**: Viết code để pass test.
4. **Xác minh Hiệu năng**: Đối với các tác vụ training, hãy đảm bảo không có tình trạng tràn bộ nhớ (memory leak) trên GPU/CPU.

## Quy tắc Backend

### 1. Mô hình GNN (PyTorch Geometric)
- Tất cả các model (`GCN`, `GAT`, `GraphSAGE`) phải trả về bộ tuple: `(logits, embedding)`. Nếu là GAT, có thể trả thêm `attention_weights`.
- Luôn sử dụng `edge_index` theo định dạng của PyG.

### 2. Quản lý Database
- Metadata (User, Project, Experiment) -> MySQL (hoặc SQLite fallback).
- Dữ liệu nặng (Snapshots, Graph JSON) -> MongoDB.
- Cache/State -> Redis.
- Luôn sử dụng `database.py` để lấy connection.

### 3. WebSocket Training
- Các tin nhắn gửi về client phải theo đúng schema: `graph_data` -> `epoch_snapshot` -> `training_complete`.
- Xử lý lỗi trong try-except và gửi tin nhắn `type: 'error'` về cho frontend.

## Kiểm tra sau khi thực hiện
- Chạy `pytest backend/` để đảm bảo không có regression.
- Kiểm tra tính đúng đắn của logic PCA/t-SNE trong các task embedding.
