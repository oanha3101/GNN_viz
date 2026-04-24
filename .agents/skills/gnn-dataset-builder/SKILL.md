# GNN-Insight: Dataset Builder Skill 🏗️

Kỹ năng này chuyên biệt cho việc thiết kế, trích xuất và ánh xạ (mapping) các bộ dữ liệu GNN từ các nguồn học thuật (PyG) sang các định dạng thương mại/người dùng (Excel, CSV) để phục vụ visualization và training.

## Quy trình Chuẩn bị Dữ liệu Excel

### 1. Kiến trúc Thành phần (Component-based Architecture)
Khuyến khích tách dữ liệu thành **từng file Excel riêng biệt** cho mỗi thành phần và gom vào một thư mục Dataset:
- **File `nodes.xlsx`**: Chứa thông tin về các đỉnh.
  - Cột bắt buộc: `node_id`.
  - Cột phân loại (cho Task 2, 6): `graph_id`.
  - Cột nhãn (Y): `topic`, `label`, `class`.
- **File `edges.xlsx`**: Chứa thông tin về các cạnh.
  - Cột bắt buộc: `source`, `target`.
  - Cột quan hệ (cho Task 2, 6): `graph_id`.
- **File `graphs.xlsx`** (Chỉ cho Task 2):
  - Cột bắt buộc: `graph_id`.
  - Cột nhãn đồ thị (Y): `label`.

Việc tách rời giúp người dùng dễ dàng kiểm tra dữ liệu bằng Excel mà không bị rối mắt bởi quá nhiều sheet.

### 2. Chiến lược Dataset theo Task

| Task | Dataset Đề xuất | Đặc điểm Mapping |
|:---|:---|:---|
| **Node Classification (1)** | `Cora` | Cần `paper_id` & `topic`. |
| **Graph Classification (2)** | `MUTAG` / `PROTEINS` | Bắt buộc có sheet `Graphs` và cột `graph_id`. |
| **Link Prediction (3)** | `Cora` / `Facebook` | Không cần label, cần split edges. |
| **Community Detection (4)** | `Karate Club` | Nhỏ, cần cột `club` làm ground truth. |
| **Graph Embedding (5)** | `Cora` | Unsupervised, tập trung vào features (X). |
| **Graph Generation (6)** | `MUTAG` | Dùng làm đồ thị tham chiếu (reference). |

## Scripting Guidelines (Python)

Khi viết script xuất dữ liệu, hãy tuân thủ:
- Sử dụng `pandas.ExcelWriter` để ghi nhiều sheet.
- Giới hạn số lượng features hiển thị trong Excel (ví dụ: 50 cột đầu tiên) để tránh file quá nặng, nhưng vẫn đảm bảo model có đủ data.
- Đặt tên cột mang tính gợi ý (`citing`, `cited`, `atom_type`) để hệ thống **Auto-detect** của GNN-Insight hoạt động tốt nhất.

## Mapping Automation
- Tên file nên chứa ID task để người dùng dễ chọn (VD: `Cora_Task1.xlsx`).
- Luôn cung cấp file `DATASET_MAPPING_GUIDE.md` kèm theo dataset.
