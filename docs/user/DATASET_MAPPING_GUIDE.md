# Hướng dẫn Mapping Dataset chuẩn cho GNN-Insight 🧠

Tài liệu này hướng dẫn cách lựa chọn và ánh xạ (mapping) các cột dữ liệu cho 6 tác vụ (Task) cốt lõi trong hệ thống GNN-Insight.

---

## 📂 1. Danh sách Dataset khuyên dùng

| Dataset | Loại đồ thị | Đặc điểm | Phù hợp cho Task |
|:---|:---|:---|:---|
| **Cora** | Citation Network | Node có features & labels | Node Classification, Link Prediction |
| **Karate Club** | Social Network | Nhỏ, dễ visualize | Community Detection, Node Embedding |
| **PubMed** | Citation Network | Dataset lớn, nhiều features | Stress Test performance |
| **MUTAG** | Molecules | Nhiều đồ thị nhỏ | Graph Classification |

---

## 📂 1.5. Danh sách Dataset chuẩn (Tách rời)
Hệ thống đã chuẩn hóa dữ liệu tại thư mục `backend/datasets/`. Mỗi Dataset được đặt trong một thư mục riêng với các file Excel thành phần:

### 📗 Cora (Thư mục `datasets/Cora/`)
*   **`nodes.xlsx`**: Chứa `paper_id`, `topic` và 100 features đầu tiên.
*   **`edges.xlsx`**: Chứa `citing` và `cited`.
*   *Phù hợp cho:* Task 1 (Classification), Task 3 (Link Prediction), Task 5 (Embedding).

### 📘 Karate Club (Thư mục `datasets/Karate/`)
*   **`nodes.xlsx`**: Chứa `node_id` và `club` (nhãn cộng đồng).
*   **`edges.xlsx`**: Chứa `source` và `target`.
*   *Phù hợp cho:* Task 4 (Community Detection).

### 📙 MUTAG (Thư mục `datasets/MUTAG/`)
*   **`nodes.xlsx`**: Chứa `node_id`, `graph_id` và thuộc tính nguyên tử.
*   **`edges.xlsx`**: Chứa `source`, `target` và `graph_id`.
*   **`graphs.xlsx`**: Chứa `graph_id` và nhãn `mutagenic`.
*   *Phù hợp cho:* Task 2 (Graph Classification), Task 6 (Graph Generation).

---

## 🛠 2. Hướng dẫn Mapping theo Task

### ⚡ Quy trình Upload Mới
Hiện tại, thay vì upload 1 file đa-sheet, bạn nên upload từng file thành phần tương ứng vào các ô **Nodes**, **Edges**, **Graphs** trên giao diện:
1. **Nodes File**: Chọn file `nodes.xlsx` trong thư mục dataset.
2. **Edges File**: Chọn file `edges.xlsx`.
3. **Graphs File**: Chọn file `graphs.xlsx` (Nếu Task yêu cầu).

Hệ thống sẽ tự động bóc tách và ánh xạ các cột nhờ vào tính năng **Auto-detect**.

### 🟠 Task 2: Graph Classification (Dùng MUTAG)
*   **Mục tiêu:** Phân loại toàn bộ đồ thị (ví dụ: Phân tử đồ thị).
*   **Dataset khuyên dùng:** Thư mục `datasets/MUTAG/`
*   **Mapping:**
    *   `Nodes File` → `nodes.xlsx`
    *   `Edges File` → `edges.xlsx`
    *   `Graphs File` → `graphs.xlsx`
    *   `Node ID` → `node_id`
    *   `Graph ID` → `graph_id` (Trong cả sheet Nodes và Edges)
    *   `Graph Label` → `mutagenic` (Trong sheet Graphs)
    *   `Features (X)` → `atom_feat_0` đến `atom_feat_6`

### 🔴 Task 6: Graph Generation (Dùng MUTAG)
*   **Mục tiêu:** Học cách sinh ra các cấu trúc đồ thị tương tự.
*   **Mapping:** Tương tự Task 2, nhưng hệ thống sẽ dùng các đồ thị trong file làm mẫu tham chiếu (Reference).

---

## 🗄 3. Cơ chế Database NoSQL (MongoDB & Redis)

Dự án sử dụng mô hình kết hợp (Hybrid):
1.  **MySQL:** Lưu trữ Metadata (Tên dự án, cấu hình, lịch sử).
2.  **MongoDB:** Lưu trữ dữ liệu đồ thị khổng lồ (Snapshots).
    *   *Cơ chế:* **Tự động sinh Schema**. Khi bạn nhấn "Save" trên UI, Backend sẽ đẩy toàn bộ cục JSON vào MongoDB. MongoDB sẽ tự tạo Database/Collection nếu chưa có.
3.  **Redis:** Lưu trữ Cache tạm thời (ví dụ: Embeddings mới nhất).
    *   *Cơ chế:* Lưu dạng Key-Value để truy xuất cực nhanh.

---

## 💡 Mẹo nhỏ (Tricks)
*   **Auto-detect:** Nếu bạn đặt tên cột là `paper_id`, `topic`, `citing`, hệ thống sẽ tự động map cho bạn.
*   **Large Datasets:** Với file trên 5000 nodes, hệ thống sẽ tự chuyển sang chế độ **Server Upload** để tránh treo trình duyệt.
