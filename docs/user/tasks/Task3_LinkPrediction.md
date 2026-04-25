# Task 3: Link Prediction — Dự đoán Cạnh 🔵 (Hướng dẫn chi tiết)

## 1. Bài toán: "AI làm nghề mai mối"
"Bạn có thể biết người này". AI dự đoán các liên kết **ẩn** chưa xuất hiện.
- **Ví dụ thực tế:** Gợi ý kết bạn trên Facebook, gợi ý mua kèm sản phẩm, hoặc dự đoán tội phạm sắp liên lạc với nhau.

## 2. Mockdata: "Bài kiểm tra giấu cạnh"
AI lấy một đồ thị thật, bí mật xóa đi 20% số cạnh (như cắt đứt liên lạc giữa một vài cặp đôi). Sau đó nó bắt Model phải đi tìm xem 20% đó là những cặp nào.
- **Thử thách:** AI phải phân biệt được đâu là "người lạ có tiềm năng thành bạn" và đâu là "người lạ sẽ mãi là người lạ".

## 3. Quá trình Khả thị hóa
- Bạn sẽ thấy các đường **Nét đứt (Dự đoán)** nhấp nháy trên màn hình. 
- Qua thời gian, các đường này sẽ bớt nhảy loạn xạ và chỉ tập trung vào các cặp nút có nhiều "bạn chung" hoặc cùng sở thích.

## 4. Giải mã Panel bên phải (Các chỉ số "vàng")

### 📈 Tab Curves (Đường cong tiên tri)
- **ROC Curve:** Nếu đường cong này phồng to lên góc trên bên trái, AI của bạn là một "nhà ngoại cảm" thực thụ. Nếu nó là một đường chéo phẳng, AI đang chỉ "đoán mò".
- **AUC:** Diện tích dưới đường cong. AUC = 1.0 là thần thánh, AUC = 0.5 là vứt đi.

### 🔦 Tab Hard Edges (Những ca khó)
- **False Positives:** Danh sách các cặp nút mà AI "thề sống thề chết" là có bạn chung nhưng thực tế lại không. 
- **False Negatives:** Những cạnh thật sự tồn tại mà AI lại "mù tịt" không thấy.
- **Mẹo:** Bấm vào một hàng để Zoom vào vị trí lỗi trên đồ thị. Bạn sẽ thường thấy AI sai ở những nút cực kỳ cô đơn, không có thông tin gì để bám víu.

### 🔬 Tab Diagnostics (Xác suất yêu)
- **Score Distribution:** AI xếp những cặp có xác suất cao sang bên phải (màu xanh) và xác suất thấp sang bên trái (màu đỏ). Một model tốt là khi hai đống màu này tách rời nhau, không bị trộn lẫn ở giữa.
