# Hướng Dẫn Khả Thị Hóa Chuyên Sâu GNN-Insight (V4)

Tài liệu này cung cấp các ví dụ thực tế và chi tiết luồng phân tích "từ ngoài vào trong" cho 3 Task cốt lõi.

---

## Task 1: Phân Loại Nút (Mạng xã hội & Trích dẫn)
**Ví dụ thực tế:** Phân loại sở thích người dùng trên **Twitter/X**.
- **Dữ liệu:** Mỗi nút là một người dùng, cạnh là quan hệ "Follow".
- **Mục tiêu:** Dự đoán xem một người dùng mới tham gia thuộc cộng đồng "Yêu công nghệ", "Chính trị" hay "Thể thao".
- **Khả thị hóa:** Bạn sẽ thấy các nút người dùng ban đầu chưa có nhãn dần dần được tô màu dựa trên việc họ follow ai. Nếu một nút follow toàn các chuyên gia AI, GNN sẽ tô màu "Công nghệ" cho nút đó với độ tự tin (Confidence) cao.

---

## Task 2: Phân Loại Đồ Thị (Phát hiện Thuốc & Độc tính)
**Ví dụ thực tế:** Sàng lọc thuốc trong **Hóa dược** (Drug Discovery).
- **Dữ liệu:** Mỗi đồ thị là một phân tử hóa học (Nút = Nguyên tử, Cạnh = Liên kết hóa học).
- **Mục tiêu:** Xác định xem phân tử này có khả năng gây đột biến (Mutagenic - Độc hại) hay An toàn.

### 🔍 Luồng phân tích "Từ Ngoài vào Trong":

#### 1. Khung hình bên ngoài (External View - Screening)
Tại bảng điều khiển chính, bạn sẽ thấy **Project Library** chứa hàng trăm phân tử khác nhau. 
- **Cái nhìn tổng thể:** Biểu đồ Loss và Accuracy cho bạn biết mô hình đã học được cách phân biệt giữa phân tử "Độc" và "An toàn" tốt đến mức nào trên toàn bộ kho dữ liệu.
- **Phân cụm Latent:** Các phân tử độc hại thường sẽ tụ lại thành một đám mây điểm ở phía bên trái, còn các phân tử an toàn ở phía bên phải.

#### 2. Khung hình bên trong (Internal View - Molecular Inspection)
Khi bạn **Click vào một đồ thị cụ thể**, giao diện sẽ "soi kính hiển vi" vào phân tử đó:
- **Node Contribution (Heatmap):** Đây là phần quan trọng nhất. Bạn sẽ thấy một vài nguyên tử như **Nitơ (N)** hoặc **Oxy (O)** trong các nhóm chức năng nhất định sáng rực lên (màu đỏ).
- **Ý nghĩa:** Điều này cho nhà khoa học biết rằng: "Mô hình coi nhóm Carbon-Nitơ này chính là nguyên nhân khiến phân tử bị coi là độc hại". 
- **Cơ chế Pooling:** GNN lấy thông tin từ các nguyên tử "quan trọng" này, cộng dồn chúng lại để đưa ra kết luận cuối cùng cho toàn bộ phân tử.

---

## Task 3: Dự Đoán Liên Kết (Thương mại điện tử & Gợi ý)
**Ví dụ thực tế:** Hệ thống gợi ý trên **Amazon / Shopee**.
- **Dữ liệu:** Nút có thể là "Người dùng" và "Sản phẩm", hoặc các "Sản phẩm liên quan".
- **Mục tiêu:** Dự đoán xem "Người mua iPhone 15" có khả năng mua thêm "Ốp lưng MagSafe" hay không.
- **Khả thị hóa:** 
    - **Inside Look:** Bạn chọn nút "iPhone 15". Hệ thống sẽ hiển thị các đường kết nối đứt đoạn đến các sản phẩm khác. 
    - **Dự đoán:** Đường nối đến "Ốp lưng" sẽ hiện rõ và có điểm số (Score) cao (ví dụ 0.98), trong khi đường nối đến "Thức ăn mèo" sẽ mờ nhạt (0.05).
- **ROC/PR Curves:** Giúp nhà bán lẻ đánh giá xem hệ thống gợi ý của họ có đang hoạt động hiệu quả (đưa ra các gợi ý mà người dùng thực sự sẽ click) hay không.

---

## Chẩn đoán hiện tượng GNN đặc biệt

### Oversmoothing (Quá mượt)
- **Hiện tượng:** Tất cả các nút co cụm lại một điểm và có cùng 1 màu.
- **Giải thích:** Xảy ra khi mô hình quá sâu (nhiều lớp), khiến đặc trưng của các nút bị "hòa tan" hoàn toàn vào nhau.

### Overfitting (Học vẹt)
- **Dấu hiệu:** **Train Accuracy** đạt 100% cực nhanh nhưng **Validation Accuracy** lại rất thấp hoặc giảm dần.
- **Giải thích:** Mô hình chỉ nhớ mặt dữ liệu cũ mà không thể dự đoán được dữ liệu mới bạn vừa upload lên.

---

> [!IMPORTANT]
> Luôn sử dụng dữ liệu **Mock** để kiểm tra các tính năng giải thích (Heatmap, ROC) trước khi chạy trên dữ liệu **Live** phức tạp hơn.

---

## Lưu ý chung cho tất cả Task
- **Loss (Hao hụt):** Luôn có xu hướng giảm. Nếu bạn thấy đường Loss đi ngang hoặc tăng, có thể do tốc độ học (Learning Rate) quá cao.
- **Accuracy (Độ chính xác):** Tăng dần. Mock Data được thiết kế để bạn thấy sự "hội tụ" rõ rệt nhất ở khoảng Epoch 30-70.
- **Inspect (Kiểm tra):** Luôn sử dụng bảng điều khiển bên phải để xem chi tiết thuộc tính của từng nút/cạnh trong lúc mô hình đang chạy.
