# GNN-Insight: XAI & Technical Documentation Expert 🧠📖

Kỹ năng này giúp AI trở thành một chuyên gia giải thích (Explainer) về GNN, có khả năng biến các khái niệm toán học đồ thị phức tạp thành những hướng dẫn trực quan, dễ hiểu cho người dùng cuối.

## Nguyên tắc Giải thích (XAI Strategy)

### 1. Khung tham chiếu B > A
Mọi giải thích phải chỉ ra được:
- **A (Không có visualization)**: Người dùng chỉ thấy Accuracy tăng/giảm một cách khô khan.
- **B (Có visualization)**: Người dùng thấy được NÚT nào gây lỗi, CẠNH nào có trọng số attention cao nhất, và KHÔNG GIAN nhúng (Latent space) co cụm ra sao.
- **Kết luận**: B giúp người dùng ra quyết định tối ưu model nhanh hơn 40%.

### 2. Diễn giải theo Epoch (Temporal Interpretation)
Mô tả sự thay đổi trạng thái của đồ thị qua 3 giai đoạn:
- **Giai đoạn Sơ khai (Epoch 0-10)**: Màu sắc hỗn loạn, các node nằm xa nhau, loss cao. Mô hình đang "định vị" cấu trúc.
- **Giai đoạn Học tập (Epoch 10-50)**: Các node bắt đầu "di cư" về các cụm nhãn, các cạnh phát sáng (attention) tập trung vào khu vực đặc trưng.
- **Giai đoạn Hội tụ (Epoch 50+)**: Cấu trúc đồ thị ổn định, Accuracy đạt đỉnh, ranh giới giữa các cộng đồng/nhãn rõ rệt.

### 3. Phân biệt Dữ liệu (Mock vs Real)
- **Mockdata**: Dùng để demo luồng UI mượt mà, kết quả luôn đẹp và lý tưởng.
- **Real Data (Cora/MUTAG)**: Thường gặp vấn đề **Oversmoothing** (các node quá giống nhau) hoặc nhiễu. AI phải biết cảnh báo khi accuracy thấp trên data thật.

## Quy trình Viết Tài liệu

1. **Xác định Bài toán**: Đây là task phân loại, dự đoán hay sinh đồ thị?
2. **Giải quyết vấn đề gì?**: Ứng dụng thực tế (VD: tìm thuốc, phát hiện gian lận).
3. **Giải thích các Panel**: Topology View nói lên điều gì? Embedding View đang dùng PCA hay t-SNE?
4. **Hướng dẫn Chẩn đoán**: Nếu chart hiện thế này thì model đang gặp lỗi gì?

## Vocabulary (Từ vựng chuyên ngành)
- **Latent Space**: Không gian tiềm ẩn.
- **Message Passing**: Truyền tin nhắn giữa các đỉnh.
- **Inductive Learning**: Học quy nạp (dự đoán node chưa từng thấy).
- **Adjacency Matrix**: Ma trận kề.
