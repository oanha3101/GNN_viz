# Task 6: Graph Generation — Sinh Đồ thị 🔴 (Hướng dẫn chi tiết)

## 1. Bài toán: "AI làm họa sĩ thiết kế"
AI học "gu" thiết kế của tập mẫu để tự tạo ra cái mới.
- **Ví dụ thực tế:** Học cấu trúc của 100 phân tử thuốc chữa bệnh để tự thiết kế ra bản vẽ phân tử thứ 101 có tác dụng tương tự nhưng mới lạ hơn.

## 2. Mockdata: "Bản vẽ phân phối mục tiêu"
AI học một bộ quy luật cấu trúc (ví dụ: đồ thị phải có 10 nút và mật độ cạnh là 30%). Sau đó nó bắt đầu tập vẽ từ những nét nguệch ngoạc đầu tiên.

## 3. Quá trình Khả thị hóa
- **Trên đồ thị:** Các đồ thị hiện ra liên tục. Epoch đầu tiên, chúng trông rất "dị dạng" ( Validity < 10%). 
- **Theo thời gian:** Đồ thị bắt đầu đẹp dần, các nút kết nối liền mạch và có cấu trúc hình học (dạng lưới, dạng vòng).

## 4. Giải mã Panel bên phải (Các chỉ số "vàng")

### 📊 Tab Overview (Chất lượng "vẽ")
- **Validity (Tính hợp lệ):** AI vẽ ra có "đúng luật" không? Ví dụ vẽ nhà thì phải có mái. Nếu Validity thấp, AI đang vẽ ra những đồ thị bị hỏng (rời rạc, lẻ loi).
- **Novelty (Tính mới lạ):** AI có đang "copy-paste" bài cũ không? Novelty cao nghĩa là AI đã thực sự sáng tạo ra một mẫu thiết kế chưa từng có trong lịch sử nhưng vẫn rất "đẹp".
- **Uniqueness (Tính độc bản):** Trong 100 bản vẽ sinh ra, có bao nhiêu bản bị trùng nhau? Nếu AI chỉ vẽ đi vẽ lại 1 kiểu, nó đang bị bí ý tưởng (**Mode Collapse**).

### ⚖️ Tab Comparison (So sánh phong cách)
- Biểu đồ này so sánh "Phong cách đồ thị nguồn" (Màu xám) và "Phong cách đồ thị AI vẽ" (Màu xanh). 
- **Lý tưởng:** Hai biểu đồ này phải khớp khít với nhau, nghĩa là AI đã lĩnh hội được hoàn toàn phong cách của tập dữ liệu mẫu.

### 🚫 Tab Invalidity (Bảng soi lỗi)
- Liệt kê tại sao AI vẽ sai: `Disconnected` (bị đứt đoạn), `Too Sparse` (quá nghèo nàn). 
- **Mẹo:** Bấm vào một dòng lỗi để xem tận mắt những "tác phẩm hỏng" đó trên màn hình.
