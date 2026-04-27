# Task 6: Graph Generation — Sinh Đồ thị 🔴

## 1. Mục tiêu Kỹ thuật & Bài toán
- **Bài toán:** Học phân phối xác suất của các cấu trúc đồ thị thực tế để tạo ra các đồ thị mới hoàn toàn nhưng mang đặc tính tương tự. 
- **Dữ liệu:** Các bộ đồ thị tham chiếu với chỉ số thống kê mục tiêu (ví dụ: mật độ cạnh 30%, tính co cụm cao).

## 2. Cơ chế Khả thị hóa (Visualization)

### A. Khu vực trung tâm (Generation Monitor)
- **Real-time Building:** Hiển thị quá trình các đỉnh và cạnh được "vẽ" ra từ hư không qua từng epoch. Người dùng có thể quan sát xem mô hình có học được các luật hình học cơ bản (như tính liên thông) hay không.

### B. Latent Space (Nội suy cấu trúc)
- **Interpolation Mode:** Đây là tính năng độc đáo. Người dùng click chọn 2 điểm (A và B) trong không gian tiềm ẩn. AI sẽ sinh ra một chuỗi các đồ thị nằm giữa 2 điểm đó.
- **Ý nghĩa:** Quan sát sự biến đổi cấu trúc mượt mà (ví dụ: đồ thị biến đổi từ dạng đường thẳng sang dạng vòng tròn).

## 3. Giải thích các chỉ số Panel phải (Metrics)

### 📊 Tab Overview
- **Validity Rate:** Tỷ lệ đồ thị sinh ra đáp ứng các tiêu chuẩn tối thiểu (ví dụ: không có đỉnh cô lập, không bị rời rạc).
- **Uniqueness:** Đo độ đa dạng. Nếu uniqueness thấp, mô hình đang bị lỗi **Mode Collapse** (chỉ sinh ra 1 kiểu đồ thị duy nhất).
- **Novelty:** Tỷ lệ đồ thị mới so với tập dữ liệu mẫu. Novelty cao chứng tỏ AI không "copy-paste" dữ liệu cũ.

### ⚖️ Tab Comparison
- **Histogram So sánh:** So sánh phân phối của các đặc trưng topo (Density, Clustering) giữa tập Nguồn và tập Sinh ra. Nếu 2 biểu đồ khớp nhau, mô hình đã học được "phong cách" đồ thị cực tốt.

### 🔑 Tab Signatures
- **Graph Signatures:** Mỗi đồ thị có một mã định danh cấu trúc (Signature). Bảng này liệt kê các cấu trúc phổ biến nhất được AI sáng tác.
- **Memorized Flag:** Cảnh báo nếu mô hình đang "học vẹt" nguyên xi một đồ thị trong tập huấn luyện.

### 🔬 Tab Diagnostics
- **Invalidity Breakdown:** Phân tích nguyên nhân tại sao đồ thị sinh ra bị hỏng (Disconnected, Too Sparse...).
- **Latent Quality:** Đánh giá độ "mịn" của không gian tiềm ẩn qua chỉ số KL Loss.
