# Task 4: Community Detection — Phát hiện Cộng đồng 🟡

## 1. Mục tiêu Kỹ thuật & Bài toán
- **Bài toán:** Phân cụm các đỉnh không giám sát (Unsupervised Clustering). Mục tiêu là tự động chia đồ thị thành các nhóm (Islands) có liên kết nội bộ dày đặc.
- **Dữ liệu (SBM):** Sử dụng mô hình **Stochastic Block Model**.
    - Đây là mô hình chuẩn để kiểm tra thuật toán phân cụm, nơi xác suất có cạnh nối giữa các đỉnh cùng nhóm cao hơn nhiều so với giữa các đỉnh khác nhóm.

## 2. Cơ chế Khả thị hóa (Visualization)

### A. Khu vực trung tâm (Topology Islands)
- **Islands Effect:** Lực đẩy (charge) giữa các đỉnh thuộc cộng đồng khác nhau được tăng cường. Theo thời gian, bạn sẽ thấy đồ thị tự động "tách mảng" thành các hòn đảo riêng biệt.
- **Node Coloring:** Các đỉnh cùng cụm sẽ được gán cùng một màu sắc duy nhất.
- **Bridge Highlighting:** Các cạnh nối giữa hai cộng đồng (Inter-community edges) được làm mờ đi để làm nổi bật cấu trúc cụm.

### B. Latent Space (Cụm không giám sát)
- Quan sát sự phân cụm tự phát mà không cần nhãn hỗ trợ. Các điểm ảnh co cụm lại phản ánh độ "khít" của thuật toán phân cụm.

## 3. Giải thích các chỉ số Panel phải (Metrics)

### 📊 Tab Overview
- **Modularity Q:** Chỉ số đo độ mạnh của cấu trúc cộng đồng. Q > 0.4 cho thấy đồ thị có cộng đồng cực kỳ rõ rệt.
- **Conductance:** Đo tỷ lệ cạnh rò rỉ ra ngoài cộng đồng. Giá trị thấp đồng nghĩa với việc cộng đồng đó rất khép kín và ổn định.

### 🔄 Tab Stability
- **Stability Heatmap:** Hàng là ID cộng đồng, Cột là Epoch.
- **Màu sắc:** Màu xanh cho biết cộng đồng đó đã ổn định dân số. Màu đỏ cho thấy các nút đang liên tục "nhảy nhóm" giữa các cộng đồng.

### 🌉 Tab Bridges
- **Bridge Strength Ranking:** Liệt kê các đỉnh nằm ở "biên giới" giữa các cộng đồng. Những đỉnh này có chỉ số **Betweenness** cao và đóng vai trò cầu nối thông tin.

### 🔬 Tab Diagnostics
- **NMI (Normalized Mutual Information):** Đo độ chính xác so với Ground Truth (nếu có).
- **Silhouette Score:** Đo độ xa cách giữa các cụm ảnh. Nếu Silhouette âm, các cụm đang bị chồng lấn nghiêm trọng.
