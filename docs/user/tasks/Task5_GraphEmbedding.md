# Task 5: Graph Embedding — Biểu diễn Đồ thị 🟣 (Hướng dẫn chi tiết)

## 1. Bài toán: "AI vẽ bản đồ tóm tắt"
Đồ thị thực tế có hàng nghìn "đặc trưng" (chiều), rất khó để máy tính xử lý. AI sẽ "nén" mỗi nút thành một tọa độ (X, Y) sao cho bản tóm tắt này vẫn giữ đúng tinh thần của bản gốc.
- **Vấn đề giải quyết:** Tìm kiếm những người "giống mình" trong một biển dữ liệu khổng lồ.

## 2. Mockdata: "Bản đồ tự do (Custom Upload)"
Dữ liệu là bất kỳ đồ thị nào bạn upload lên. AI không cần biết nhãn (Label), nó tự học cấu trúc hình học của đồ thị.

## 3. Giải mã Panel bên phải (Các chỉ số "vàng")

### 📊 Tab Overview (Chất lượng bản nén)
- **k-NN Preservation (Giữ chân hàng xóm):** Con số quan trọng nhất. Nó đo xem sau khi nén, 10 thằng bạn thân nhất của bạn trên đồ thị có còn ở gần bạn trong tọa độ 2D không. Nếu tỷ lệ là 90%, bản nén này cực kỳ uy tín.
- **Isotropy Score (Độ tròn):** Nếu isotropy thấp (gần 0), AI đang bị lỗi tập trung tất cả mọi người vào một "ngõ cụt" (Cone effect). Chỉ số này cao nghĩa là AI đang sử dụng không gian bản đồ một cách công bằng.

### 📍 Tab KNN (Soi lỗi theo Bậc)
- Biểu đồ chấm này giải thích: "Những ông nhiều bạn (Degree cao) thường được tôi vẽ bản đồ chính xác hơn những ông cô đơn". 
- Nếu bạn thấy những chấm nằm dưới đường gạch ngang (Cyan line), đó là những nút mà AI đang gặp khó khăn khi nén.

### 🔬 Tab Diagnostics (Hình dáng dữ liệu)
- **Isotropy Gauge:** Một chiếc đồng hồ đo. Màu **Xanh** (>60%) là không gian nhúng chất lượng cao, sẵn sàng để mang đi dùng cho các mô hình AI khác.
- **Embedding Norm:** Biểu đồ này kiểm tra xem các vector có bị biến dạng quá dài hay quá ngắn không.
