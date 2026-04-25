# Task 1: Node Classification — Phân loại Nút 🟢 (Hướng dẫn chi tiết)

## 1. Bài toán: "AI làm nghề quản lý cư dân"
Hãy tưởng tượng bạn có một mạng xã hội khổng lồ. Bạn muốn biết ai là "Lập trình viên", ai là "Nghệ sĩ" nhưng không phải ai cũng khai báo hồ sơ. AI sẽ nhìn vào:
- **Bạn bè của họ là ai?** (Nếu bạn chơi với 10 ông code, khả năng cao bạn cũng là dân code).
- **Họ viết gì?** (Thuộc tính/Features của nút).
- **Kết quả:** AI tự động gán nhãn cho hàng triệu người chỉ trong vài giây.

## 2. Mockdata: "Bản mô phỏng xã hội Barabási-Albert"
Dự án dùng mô hình toán học **Barabási-Albert** để tạo dữ liệu giả. 
- **Đặc điểm:** Đây là mô hình "người giàu càng giàu": một vài nút cực kỳ nổi tiếng (Hubs) sẽ có rất nhiều bạn, giống hệt cấu trúc mạng xã hội thực tế.
- **Mục đích:** Giúp bạn thấy cách AI lần theo các "ông trùm" này để phân loại cả một vùng lân cận.

## 3. Quá trình "Lột xác" qua từng Epoch
- **Giai đoạn Mò mẫm (Epoch 0-20):** Đồ thị trông như một mớ dây điện rối rắm. AI đoán mò nên màu sắc nhảy liên tục. Biểu đồ **Train Loss** cao chót vót.
- **Giai đoạn Học tập (Epoch 20-60):** Các nút cùng màu bắt đầu di chuyển lại gần nhau trong không gian **Embedding (2D)**. AI bắt đầu nhận ra các "vùng lãnh thổ" màu sắc rõ rệt.
- **Giai đoạn Hội tụ (Epoch 80+):** Đồ thị bên trái hiện lên các cụm màu ổn định. Những nút bị dự đoán sai (có viền đỏ bao quanh) biến mất dần.

## 4. Giải mã Panel bên phải (Các chỉ số "vàng")

### 📊 Tab Overview (Cái nhìn tổng thể)
- **Val Acc (Độ chính xác):** Con số này càng cao, AI càng giỏi. Mục tiêu là > 85%.
- **Loss Curve:** Đường cong sai số. Nếu đường này cắm đầu đi xuống là tin vui, AI đang học rất tốt.

### 🧩 Tab Confusion (Điểm mù của AI)
- Đây là bảng soi lỗi. Ví dụ: Nếu ô giao giữa nhãn "Khoa học" và "Công nghệ" có số lớn, nghĩa là AI của bạn đang bị "ngây thơ" không phân biệt được hai lĩnh vực này.
- **Mẹo:** Bấm vào một con số trong ô màu đỏ, màn hình sẽ Zoom thẳng vào các nút bị nhầm lẫn đó để bạn kiểm tra xem tại sao AI lại sai.

### 📍 Tab Homophily (Sức mạnh láng giềng)
- Biểu đồ này giải thích: "Tôi dự đoán đúng vì tôi ở cạnh những người giống tôi". 
- Các chấm ở góc trên bên phải là những nút "ngoan", ở cùng hội cùng thuyền với hàng xóm nên AI rất dễ đoán đúng.

### 🔬 Tab Diagnostics (Chẩn đoán bệnh của AI)
- **Dirichlet Energy:** Nếu con số này tụt về gần 0, AI đang bị "mù màu" — nó thấy mọi nút đều giống hệt nhau (**Oversmoothing**). Đây là căn bệnh kinh niên của GNN khi model quá sâu.
