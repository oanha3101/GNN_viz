# Task 2: Graph Classification — Phân loại Đồ thị 🟠 (Hướng dẫn chi tiết)

## 1. Bài toán: "AI soi cấu trúc tổ chức"
Thay vì nhìn từng người, AI nhìn vào **cả một khối cấu trúc**. 
- **Ví dụ thực tế:** So sánh 100 phân tử hóa học. AI phải trả lời: "Phân tử này có ích hay có độc?". Nó không nhìn từng nguyên tử, nó nhìn sơ đồ hình học của toàn bộ phân tử đó.

## 2. Mockdata: "Cuộc chiến giữa Ngẫu nhiên và Trật tự"
AI sinh ra 50 đồ thị con thuộc 2 loại:
- **Loại 0 (Ngẫu nhiên):** Các nút nối lung tung như đám đông đi hội chợ.
- **Loại 1 (Trật tự):** Các nút nối tập trung vào các "ông trùm" trung tâm như mạng lưới điện thành phố.
- **Mục tiêu:** AI phải chỉ ra được bản chất của hệ thống ngay khi vừa nhìn vào sơ đồ.

## 3. Quá trình Khả thị hóa
- **Trên đồ thị:** Khi bạn click vào một điểm trong không gian nhúng, hệ thống sẽ hiện ra một đồ thị con tương ứng. Các nút sẽ sáng tối khác nhau thể hiện mức độ quan trọng.
- **Dưới biểu đồ:** Ma trận 50 ô màu sẽ chuyển dần từ Đỏ sang Xanh khi AI bắt đầu "thuộc bài".

## 4. Giải mã Panel bên phải (Các chỉ số "vàng")

### 🗂 Tab Batch Heatmap (Bảng điểm 50 đồ thị)
- Đây là "sổ liên lạc" của cả lớp học. 
- Mỗi ô màu đại diện cho một đồ thị. 
- Nếu một hàng đồ thị luôn có màu **Đỏ** qua tất cả các Epoch, nghĩa là đồ thị đó cực kỳ dị biệt, AI "bó tay" không học nổi cấu trúc của nó.

### 🧩 Tab Confusion (Sự nhầm lẫn)
- Cho biết AI hay nhầm đồ thị "Trật tự" thành "Ngẫu nhiên" hay ngược lại. Giúp bạn chẩn đoán xem model của mình đang bị "quá lạc quan" hay "quá khắt khe".

### 🔬 Tab Diagnostics (Nút quyền lực)
- **Attention Readout:** Chỉ ra trong một đồ thị, **nút nào là "anh cả"** (đóng góp nhiều nhất vào nhãn của cả đồ thị). 
- **Mẹo:** Nếu AI nhìn vào đúng các nút trung tâm (Hubs) để quyết định, nghĩa là nó đã "thông minh" thực sự. Nếu nó nhìn vào các nút lẻ loi ở rìa, nó đang học sai quy luật.
