# Task 4: Community Detection — Phát hiện Cộng đồng 🟡 (Hướng dẫn chi tiết)

## 1. Bài toán: "AI tìm băng đảng"
Tìm các nhóm tự phát mà không cần ai bảo trước. 
- **Ví dụ thực tế:** Tìm ra các nhóm người có chung sở thích trên diễn đàn, hoặc các nhóm tội phạm liên kết ngầm với nhau qua các cuộc điện thoại.

## 2. Mockdata: "Hòn đảo hoang Stochastic Block"
AI tạo ra 3-4 "hòn đảo" (cụm). Trong đảo thì dân cư chơi với nhau rất thân, nhưng rất ít khi nói chuyện với dân đảo khác.
- **Mục tiêu:** AI phải tự vẽ ra ranh giới giữa các hòn đảo này mà không cần nhìn vào "hộ khẩu" (Label) của họ.

## 3. Quá trình Khả thị hóa
- **Ban đầu (Hỗn loạn):** Toàn bộ các nút dính chùm vào nhau ở giữa màn hình.
- **Tách biệt:** Các nút "cùng chí hướng" bắt đầu đẩy nhau ra khỏi khối trung tâm, hình thành các cụm nhỏ màu sắc (Islands).
- **Hội tụ:** Các hòn đảo cộng đồng ổn định vị trí, không còn ai "nhảy đảo" nữa.

## 4. Giải mã Panel bên phải (Các chỉ số "vàng")

### 📊 Tab Overview (Độ đoàn kết)
- **Modularity Q (Độ khít):** Con số này càng cao (>0.4), nghĩa là các "băng đảng" càng đoàn kết và tách biệt. Nếu Q thấp, xã hội đồ thị của bạn đang bị "hòa tan".
- **Bridges (Người giao liên):** Số lượng nút nắm giữ thông tin liên lạc giữa các cộng đồng. Những nút này cực kỳ nguy hiểm vì họ là mắt xích yếu nhất của mạng lưới.

### 🔄 Tab Stability (Độ bền)
- **Stability Heatmap:** Cho biết cộng đồng nào đang bị biến động mạnh qua từng Epoch. Nếu một dòng có nhiều màu **Đỏ**, nghĩa là dân cư ở đó đang liên tục "bỏ nhóm" để sang cụm khác.

### 🔬 Tab Diagnostics (Chẩn đoán)
- **NMI (Độ khớp):** So sánh kết quả AI tự tìm với thực tế (Ground Truth). 1.0 là AI thông minh ngang người thật.
- **Silhouette Score:** Đo độ xa cách. Càng cao nghĩa là các "hòn đảo" càng cách xa nhau, ranh giới càng rõ rệt.
