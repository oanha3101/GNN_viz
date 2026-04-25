# Luồng Công Việc (Workflow) & Kiến Trúc Hệ Thống 🛠️🌐

## 1. Tổng quan Luồng Dữ liệu (End-to-End)

Dự án GNN-Insight vận hành theo một vòng khép kín từ giao diện người dùng đến các phép toán tensor chuyên sâu:

1.  **Frontend (Giao diện & Trực quan hóa):**
    *   **Công nghệ:** React + Zustand (Quản lý trạng thái cực nhanh) + D3.js/Canvas (Render hàng vạn nút không lag).
    *   **Vai trò:** Tiếp nhận cấu hình từ người dùng, gửi yêu cầu qua WebSocket, và render luồng dữ liệu snapshot đổ về theo thời gian thực.
2.  **Networking (Lập trình mạng):**
    *   **REST API:** Dùng để xử lý các dữ liệu tĩnh, cấu hình mapping ban đầu và truy vấn lịch sử từ MySQL.
    *   **WebSocket (`/ws/train`):** Đường ống dẫn chính. Stream hàng MB dữ liệu JSON (đã nén gzip) mỗi epoch từ Backend về Frontend để đảm bảo tính real-time (tương tự luồng livestream).
3.  **Backend (Bộ não tính toán):**
    *   **Công nghệ:** FastAPI + PyTorch Geometric (PyG).
    *   **Vai trò:** Thực hiện vòng lặp huấn luyện GNN. Tại mỗi epoch, Backend không chỉ tính Loss/Acc mà còn tính các metrics XAI (Attention, Energy, PCA) để đóng gói vào snapshot.

---

## 2. Hệ sinh thái 3 Database & Mối quan hệ Chặt chẽ

Dự án sử dụng chiến lược **Hybrid Database** để tối ưu hóa giữa tốc độ và dung lượng. Dưới đây là vai trò của từng loại và 3 bảng quan trọng nhất:

### 🗄️ Vai trò từng Database:
1.  **MySQL (Port 3344):** Đóng vai trò là "Tổng kho Metadata". Lưu trữ các quan hệ cứng, có cấu trúc chặt chẽ.
2.  **MongoDB (Port 27017):** Đóng vai trò là "Kho lưu trữ vật lý". Chứa các JSON Snapshots khổng lồ.
3.  **Redis (Port 6379):** Đóng vai trò là "Bộ nhớ RAM đệm". Lưu trạng thái huấn luyện tạm thời để FE có thể truy vấn cực nhanh qua API.

### 📋 Mối quan hệ giữa 3 Bảng chính (trong MySQL):
Để quản lý lịch sử thí nghiệm mượt mà, hệ thống dựa trên 3 bảng cốt lõi:
*   **Bảng `projects`**: Lưu thông tin cấp cao (Tên dự án, loại Task, loại Model). Đây là "cha" của mọi thí nghiệm.
*   **Bảng `experiments`**: Lưu kết quả cuối cùng (Accuracy, Loss, Hyperparams). Bảng này chứa một cột quan trọng là `mongo_doc_id` — sợi dây liên kết sang MongoDB.
*   **Bảng `session_snapshots`**: Lưu danh sách các epoch. Mỗi epoch trong bảng này thực chất chỉ là một con trỏ tới file `.json.gz` hoặc một document trong MongoDB, giúp việc Replay (phát lại) diễn ra siêu tốc mà không làm lag database.

---

## 3. Lập trình Mạng & Truyền tải Dữ liệu (Networking)

Dự án sử dụng các công nghệ mạng tiên tiến để xử lý khối lượng dữ liệu đồ thị khổng lồ:

*   **FastAPI (Python):** Framework hiện đại, bất đồng bộ (Async), giúp Backend xử lý hàng nghìn kết nối WebSocket cùng lúc mà không bị nghẽn.
*   **WebSocket Protocol:** Thay vì HTTP Request (phải hỏi mới trả lời), WebSocket cho phép Backend "tự động đẩy" dữ liệu Snapshot ngay khi Model vừa tính xong một Epoch.
*   **Gzip Compression:** Trước khi gửi qua mạng, toàn bộ dữ liệu Snapshot được **nén Gzip** ngay tại Backend. Điều này giúp giảm 80-90% dung lượng băng thông, đảm bảo UI vẫn mượt mà ngay cả khi mạng yếu.
*   **Binary Fallback:** Hệ thống đã sẵn sàng cấu trúc để chuyển sang **MessagePack** (giao thức nhị phân) trong tương lai.

---

## 4. Đánh giá Thực trạng & Lộ trình Phát triển 🚀

### ✅ Thế mạnh hiện tại:
*   Đầy đủ 6 Tasks GNN chuẩn học thuật.
*   Cơ chế Replay (phát lại) lịch sử cực kỳ mượt mà nhờ sự phối hợp MySQL-MongoDB.
*   Hệ thống Mockdata thông minh, mô phỏng đúng đặc tính hội tụ của thuật toán thật.

### ❌ Thiếu sót & Hạn chế:
1.  **Hiệu năng Data thật:** Khi xử lý đồ thị > 10.000 nodes, việc truyền JSON qua WebSocket gặp hiện tượng nghẽn cổ chai do quá trình stringify/parse JSON tốn CPU.
2.  **Độ sâu Model:** Hiện tại model mặc định chỉ có 2 layers. Điều này dẫn đến kết quả training trên data thực phức tạp (như PubMed) chưa cao.
3.  **Validation FE:** Thiếu bước kiểm tra dữ liệu kỹ lưỡng trước khi upload (ví dụ: check nút cô đơn, check kiểu dữ liệu feature).

### 🚀 Bước phát triển tiếp theo (Next Steps):
1.  **Binary Protocol:** Chuyển đổi WebSocket từ JSON sang **MessagePack** hoặc **Protobuf** để giảm 70% dung lượng truyền tải.
2.  **Advanced XAI:** Tích hợp **GNNExplainer**. Cho phép người dùng click vào một dự án sai và AI sẽ tự động "cắt" ra một vùng đồ thị nhỏ (subgraph) giải thích nguyên nhân gây sai.
3.  **Model Zoo:** Cho phép tùy chỉnh số lượng Layer, kích thước Hidden Dim và cơ chế Pooling ngay trên giao diện.
4.  **Auto-Tuning:** Tích hợp bộ tìm kiếm siêu tham số tự động để cải thiện độ chính xác trên dữ liệu thực.
