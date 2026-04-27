# Task 1: Node Classification — Phân loại Đỉnh 🟢

## 1. Mục tiêu Kỹ thuật & Bài toán
- **Bài toán:** Thực hiện phân loại đa lớp (Multi-class Classification) trên dữ liệu dạng đồ thị. Mục tiêu là gán mỗi nút (node) vào một lớp (class) chính xác dựa trên thuộc tính bản thân và cấu trúc lân cận.
- **Dataset (Cora):** Đây là tập dữ liệu chuẩn về mạng lưới trích dẫn khoa học.
    - **Nút:** 2,708 bài báo.
    - **Đặc trưng (Features):** Mỗi bài báo có 1,433 chiều dữ liệu nhị phân (0 và 1). Mỗi chiều đại diện cho một từ vựng trong từ điển chuyên ngành. Giá trị 1 nghĩa là bài báo có chứa từ đó.
    - **Cạnh:** Các đường trích dẫn giữa các bài báo.
    - **Nhãn:** 7 chủ đề khoa học (như AI, Genetic Algorithms, Theory...).

## 2. Cơ chế Khả thị hóa (Visualization)

### A. Khu vực trung tâm (Network Topology)
- **Node Coloring:** Màu sắc của mỗi nút hiển thị kết quả dự đoán (Prediction) hoặc nhãn gốc (Ground Truth) tùy theo View Mode.
- **Error Highlighting:** Các nút bị dự đoán sai sẽ được bao quanh bởi một vòng nhẫn màu đỏ (Misclassified Ring). Tần suất nhấp nháy của vòng nhẫn tỷ lệ thuận với độ sai lệch xác suất.
- **Attention Glow (GAT):** Nếu sử dụng mô hình Graph Attention Network, các cạnh sẽ phát sáng với độ đậm nhạt khác nhau dựa trên **Attention Weights**. Cạnh càng sáng nghĩa là mô hình đang tập trung lấy thông tin từ láng giềng đó nhiều hơn.
- **K-Hop Neighborhood:** Khi click chọn 1 nút, hệ thống hiển thị phạm vi lan truyền thông tin qua 1-hop (xanh), 2-hop (tím), và 3-hop (vàng).

### B. Latent Space (Không gian ẩn)
- **Cơ chế:** Hệ thống trích xuất vector embedding 64D/128D từ lớp ẩn cuối cùng của GNN, sau đó dùng thuật toán **PCA** hoặc **t-SNE** để nén xuống 2D.
- **Ý nghĩa:** Quan sát quá trình các nút cùng loại "di cư" và co cụm lại thành các vùng lãnh thổ riêng biệt. Sự tách biệt giữa các cụm ảnh phản ánh khả năng phân loại của mô hình.

## 3. Giải thích các chỉ số Panel phải (Metrics)

### 📊 Tab Overview
- **Val Acc (Accuracy):** Tỷ lệ phần trăm dự đoán đúng trên tập dữ liệu kiểm tra (Validation set). Đây là chỉ số quan trọng nhất đo lường hiệu năng.
- **Macro F1:** Trung bình cộng chỉ số F1 của 7 lớp. Chỉ số này giúp đánh giá xem mô hình có bị học lệch (chỉ đoán đúng lớp nhiều dữ liệu) hay không.
- **Loss Curves:** Theo dõi sự hội tụ. Nếu Val Loss tăng trong khi Train Loss giảm, mô hình đang bị quá khớp (Overfitting).

### 🧩 Tab Confusion (Ma trận nhầm lẫn)
- Hiển thị bảng $7 \times 7$. Hàng là nhãn thực tế, Cột là nhãn dự đoán.
- Các con số nằm ngoài đường chéo chính chỉ ra chính xác mô hình đang nhầm lẫn giữa các chủ đề nào (ví dụ: hay nhầm bài báo AI thành bài báo ML).

### 🔬 Tab Diagnostics
- **Dirichlet Energy:** Chỉ số đo độ mịn của embedding trên đồ thị. 
    - *Energy cao:* Các nút láng giềng có embedding rất khác nhau (tốt cho phân loại giai đoạn đầu).
    - *Energy thấp (gần 0):* Xảy ra hiện tượng **Oversmoothing**. Mọi nút đều có embedding giống hệt nhau, khiến mô hình không thể phân biệt các lớp.
- **Class Distribution:** So sánh biểu đồ cột giữa phân phối nhãn thực tế và nhãn dự đoán của AI.
