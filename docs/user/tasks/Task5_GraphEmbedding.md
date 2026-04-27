# Task 5: Graph Embedding — Biểu diễn Đồ thị 🟣

## 1. Mục tiêu Kỹ thuật & Bài toán
- **Bài toán:** Học cách nén thông tin nút từ không gian nghìn chiều (như 1,433 của Cora) xuống một vector số thực thấp chiều (ví dụ 64D/128D) mà không làm mất đi quan hệ topo lân cận.
- **Dataset (Custom):** Người dùng có thể upload dữ liệu Excel (`nodes.xlsx`, `edges.xlsx`). Nếu file upload không có nhãn, hệ thống sẽ thực hiện học không giám sát (Unsupervised) qua phương pháp **Link Reconstruction Loss**.

## 2. Cơ chế Khả thị hóa (Visualization)

### A. Khu vực trung tâm (Structure Preservation)
- Mục tiêu chính ở khu vực này là quan sát sự tương tác cục bộ. Hệ thống sẽ highlight các hàng xóm gần nhất trong đồ thị gốc để người dùng so sánh với hàng xóm trong không gian vector.

### B. Latent Space (Trọng tâm)
- Đây là trung tâm của Task 5. 
- **PCA/t-SNE Projection:** Hiển thị toàn bộ bản đồ dữ liệu. 
- **Neighborhood Mapping:** Khi click chọn 1 nút, hệ thống sẽ nối các đường kẻ tới 5 nút gần nhất trong không gian vector (kNN). Người dùng có thể kiểm tra xem "Ai là bạn trên vector?" có phải là "Ai là bạn trên đồ thị?" hay không.

## 3. Giải thích các chỉ số Panel phải (Metrics)

### 📊 Tab Overview
- **k-NN Preservation:** Tỷ lệ % các hàng xóm gần nhất trên đồ thị thực tế vẫn nằm trong nhóm hàng xóm gần nhất trên không gian embedding. Con số này đo mức độ "trung thực" của quá trình nén.
- **Isotropy Score:** Độ đồng đều của không gian nhúng. Tránh việc toàn bộ vector bị nén về một góc (Collapse).
- **Link Recon AUC:** Khả năng dùng vector embedding để xây dựng lại chính xác các cạnh gốc.

### 🔦 Tab Outliers
- **Outlier Scores:** Xếp hạng các đỉnh có hành vi vector dị biệt. 
- **Tương tác:** Click vào một đỉnh Outlier để xem nó nằm ở đâu trên đồ thị. Thường đây là các đỉnh có thuộc tính trái ngược hoàn toàn với vị trí topo của nó.

### 📍 Tab KNN
- **Degree × k-NN Scatter:** Biểu đồ so sánh Bậc của đỉnh và độ bảo toàn lân cận. Giải thích xem mô hình đang ưu tiên nén các "ông trùm" (High degree) hay các "dân thường" tốt hơn.

### 🔬 Tab Diagnostics
- **Embedding Norm Histogram:** Phân phối độ dài của các vector. Đảm bảo mô hình không gặp lỗi biến mất gradient hoặc bùng nổ gradient.
