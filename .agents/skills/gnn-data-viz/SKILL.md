---
name: gnn-data-viz
description: "Kỹ năng chuyên biệt về xử lý dữ liệu đồ thị và trực quan hóa (XAI). Dùng khi làm việc với D3.js, Plotly, PyTorch Geometric data loaders, hoặc các metrics trực quan (ROC, Modularity, PCA)."
---

# GNN-Insight: Data & Visualization Workflow

Kỹ năng này cung cấp các hướng dẫn để biến dữ liệu GNN phức tạp thành những hình ảnh trực quan, dễ hiểu và có giá trị giải thích cao (XAI).

## Xử lý Dữ liệu (Data Pipeline)

### 1. Data Loading (Backend)
- Sử dụng các loader trong `backend/data/loaders.py`.
- Khi làm việc với Custom Dataset (CSV/Excel), hãy đảm bảo mapping đúng các cột: `node_id`, `features`, `edge_index`.
- Luôn thực hiện chuẩn hóa (Normalization) dữ liệu đầu vào.

### 2. Data Mapping (Frontend)
- Chuyển đổi format từ backend JSON sang cấu trúc D3: `{ nodes: [], links: [] }`.
- Lưu ý: Node ID trong D3 force layout phải nhất quán với Node ID trong model training.

## Trực quan hóa (Visualization)

### 1. Đồ thị (Topology View)
- Sử dụng D3-force để hiển thị cấu trúc.
- Cập nhật màu sắc node dựa trên dự đoán của model (`node_predictions`) theo thời gian thực.
- Sử dụng `interpolate.js` để tạo chuyển động mượt mà giữa các epoch.

### 2. Không gian Embedding (Embedding View)
- Sử dụng Scatter plot (Plotly/Recharts) cho tọa độ 2D từ PCA/t-SNE.
- Hỗ trợ toggle giữa các chế độ xem: dự đoán vs thực tế.

### 3. Biểu đồ Metrics
- Luôn hiển thị Loss và Accuracy theo epoch.
- Đối với từng Task cụ thể, hãy hiển thị thêm các metrics đặc thù:
  - Task 3: ROC Curve.
  - Task 4: Modularity Score.
  - Task 5: kNN Preservation.
  - Task 6: Validity/Uniqueness/Novelty.

## Nguyên tắc XAI (Explainable AI)
- Hiển thị Attention Weights (nếu dùng GAT) dưới dạng độ đậm nhạt của cạnh.
- Cung cấp Node Inspector để xem chi tiết các đặc trưng ảnh hưởng đến quyết định của model.
