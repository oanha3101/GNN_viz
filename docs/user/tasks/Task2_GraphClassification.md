# Task 2: Graph Classification — Phân loại Đồ thị 🟠

## 1. Mục tiêu Kỹ thuật & Bài toán
- **Bài toán:** Phân loại toàn bộ cấu trúc đồ thị (không phải từng nút). Mục tiêu là xác định đặc tính hệ thống của một tập hợp các liên kết.
- **Dữ liệu (MUTAG/Synthetic):**
    - **MUTAG:** Dataset về phân tử hóa học. Mỗi đồ thị là một phân tử. Các đỉnh là nguyên tử (C, N, O...), các cạnh là liên kết hóa học. Bài toán là dự đoán phân tử có khả năng gây đột biến gen hay không.
    - **Synthetic Mock:** Sử dụng mô hình **Erdős–Rényi** (ngẫu nhiên) và **Scale-free** (có nút lõi). 

## 2. Cơ chế Khả thị hóa (Visualization)

### A. Khu vực trung tâm (Readout Monitor)
- **Graph Sampling:** Hệ thống hiển thị cấu trúc của 1 đồ thị đại diện được chọn từ một batch (50 đồ thị).
- **Attention Readout:** Các nút có kích thước và độ sáng khác nhau dựa trên **Readout Attention Weights**. Đây là trọng số đóng góp của từng nút vào nhãn tổng thể của đồ thị.
    - *Nút Trắng/Sáng:* Đóng vai trò quan trọng (motif đặc trưng).
    - *Nút Đen/Mờ:* Bị mô hình bỏ qua khi ra quyết định.

### B. Latent Space (Không gian đồ thị)
- Mỗi điểm trong không gian 2D đại diện cho **một đồ thị hoàn chỉnh**.
- Sự phân cụm giữa các điểm phản ánh khả năng của mô hình trong việc nhận diện các cấu trúc topo khác nhau (ví dụ: tách biệt giữa đồ thị hình lưới và đồ thị hình sao).

## 3. Giải thích các chỉ số Panel phải (Metrics)

### 🗂 Tab Batch Heatmap
- **Lưới 50 ô màu:** Mỗi ô tương ứng với 1 đồ thị trong tập dữ liệu.
- **Màu sắc:** 
    - *Xanh:* Mô hình dự đoán đúng loại đồ thị.
    - *Đỏ:* Dự đoán sai.
- Cho phép người dùng xác định các mẫu đồ thị "khó" (Hard cases) mà mô hình liên tục gán nhãn sai qua nhiều epoch.

### 🧩 Tab Confusion (Ma trận nhầm lẫn)
- Thống kê tỷ lệ dự đoán nhầm giữa các loại cấu trúc (ví dụ: nhầm MUTAG loại 0 thành loại 1).

### 🔬 Tab Diagnostics
- **Attention Entropy:** Đo lường độ tập trung của cơ chế Attention.
    - *Entropy thấp:* Mô hình chỉ nhìn vào một vài motif cốt lõi (tốt).
    - *Entropy cao:* Mô hình bị rối loạn thông tin, không tìm được đặc trưng chính.
- **Structural Metrics:** Biểu đồ mật độ cạnh (Density) và bậc trung bình (Average Degree) của các đồ thị dự đoán sai.
