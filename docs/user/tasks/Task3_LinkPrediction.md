# Task 3: Link Prediction — Dự đoán Cạnh 🔵

## 1. Mục tiêu Kỹ thuật & Bài toán
- **Bài toán:** Dự đoán sự tồn tại tiềm ẩn của liên kết giữa 2 đỉnh. Mục tiêu là học cấu trúc hình học của đồ thị để xác định các cặp đỉnh có xác suất kết nối cao nhất.
- **Dữ liệu (Cora/Facebook):**
    - Hệ thống thực hiện phương pháp **Edge Masking**: Xóa ngẫu nhiên 20% cạnh thực tế (Positive edges) và chọn ra một lượng tương đương các cặp đỉnh không có cạnh (Negative edges).
    - Mô hình phải học cách phân biệt giữa hai nhóm này.

## 2. Cơ chế Khả thị hóa (Visualization)

### A. Khu vực trung tâm (Network Topology)
- **Glowing Links (Predicted):** Các cạnh tiềm năng do mô hình dự đoán (với điểm số > 0.5) được vẽ bằng nét đứt phát sáng. Cạnh càng sáng, mô hình càng tự tin.
- **Ground Truth Highlighting:** Nếu cạnh dự đoán trùng khớp với cạnh bị xóa ban đầu, nó sẽ có màu xanh. Nếu sai (False Positive), nó sẽ có màu đỏ mờ.

### B. Latent Space (Khoảng cách Vector)
- Quan sát quá trình các cặp đỉnh có liên kết thực tế di chuyển lại gần nhau trong không gian vector. 
- Link Prediction trong GNN thực chất là bài toán **Similarity Learning** (học độ tương đồng).

## 3. Giải thích các chỉ số Panel phải (Metrics)

### 📊 Tab Overview
- **AUC (Area Under ROC):** Chỉ số vàng cho dự đoán cạnh. AUC = 0.5 là dự đoán ngẫu nhiên. AUC > 0.9 là mô hình rất mạnh.
- **Acc@0.5:** Độ chính xác dự đoán đúng cạnh thật/giả tại ngưỡng 0.5.

### 📉 Tab Curves
- **ROC Curve:** Biểu đồ tỷ lệ dương tính thật (TPR) và dương tính giả (FPR). 
- **Precision-Recall Curve:** Đánh giá độ tin cậy của các đề xuất liên kết được đưa ra.

### 🔦 Tab Hard Edges
- **False Positives (Top FP):** Danh sách các cặp đỉnh mô hình đoán có cạnh nhưng thực tế không có. Thường là các đỉnh có nhiều hàng xóm chung.
- **False Negatives (Top FN):** Các cạnh thực tế bị mô hình bỏ lỡ.
- **Tương tác:** Click vào một dòng để Focus vào vị trí đó trên đồ thị chính để kiểm tra cấu trúc cục bộ.

### 🔬 Tab Diagnostics
- **Score Distribution (Histogram):** Biểu đồ cột chồng so sánh xác suất mà mô hình gán cho cạnh Thật và cạnh Giả. Nếu hai phân phối này tách biệt rõ ràng, mô hình đã hội tụ thành công.
- **Common Neighbors vs Prediction:** Giải thích dự đoán dựa trên cấu trúc (ví dụ: dự đoán có cạnh vì có 5 hàng xóm chung).
