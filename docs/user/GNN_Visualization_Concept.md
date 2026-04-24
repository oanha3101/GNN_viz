# 🧠 Hướng Dẫn Khả Thị Hóa Chuyên Sâu & Tính Năng GNN-Insight

Tài liệu này cung cấp cái nhìn toàn diện về tất cả các chức năng khả thị hóa (visualizations), khung hình phân tích (analysis frames) và tính năng tương tác có trong GNN-Insight.

---

## 1. Phân Tích Khung Hình Khả Thị (View Frames) - Task 1, 2, 3

Dưới đây là chi tiết những gì bạn thấy trên màn hình cho 3 tác vụ cốt lõi. Mỗi Task được thiết kế với các "khung hình" chuyên biệt để soi sáng cơ chế học của AI.

### 🖼️ Task 1: Node Classification (Nhãn của từng nút)
**Khung hình chính:** Bản đồ đồ thị động (Force-Directed Graph).
-   **Nút (Node):** Được vẽ với "Glow halo" (quầng sáng) xung quanh. Khi AI không chắc chắn, nút sẽ có hiệu ứng **"Pulse" (nhịp đập)**.
-   **Màu sắc:** Tự động chuyển đổi mượt mà giữa các Epoch. Màu sắc đại diện cho Prediction (Dự đoán) hoặc Ground Truth (Thực tế).
-   **Bảng thông tin trượt (Inspector):** Khi click vào nút, một bảng điều khiển từ bên phải sẽ hiện ra:
    -   **Xác suất (Softmax):** Biểu đồ thể hiện AI đang phân vân giữa những nhãn nào.
    -   **Hàng xóm:** Danh sách các nút kề kèm độ ảnh hưởng (Attention Weight nếu dùng GAT).

### 🖼️ Task 2: Graph Classification (Phân loại toàn bộ đồ thị)
**Sử dụng hai khung hình song song:**
1.  **Grid Universe (Vũ trụ lưới):** Hiển thị hàng chục đồ thị mini cùng lúc. Mỗi đồ thị có một huy hiệu **Check (v)** hoặc **X (x)** để báo hiệu AI đoán đúng hay sai.
2.  **Microscope View (Soi kính hiển vi):** Khi click vào 1 đồ thị, nó sẽ phóng to chiếm toàn bộ khung hình:
    -   **Heatmap đóng góp:** Các nút quan trọng nhất "sáng rực" lên màu trắng/vàng, các nút ít quan trọng hơn màu xanh.
    -   **Structural Metrics:** Bảng thống kê mật độ (Density), độ cụm (Clustering) của đồ thị đó.
    -   **Global Confidence:** Thanh ngang hiển thị độ tự tin của AI đối với toàn bộ đồ thị này.

### 🖼️ Task 3: Link Prediction (Dự đoán liên kết mới)
**Khung hình tập trung vào các mối quan hệ "ẩn":**
-   **Cấu trúc cạnh đan xen:**
    -   **Cạnh hiện hữu:** Các đường nét liền, mảnh.
    -   **Cạnh tương lai (Predicted):** Các đường **nét đứt (dashed)** chuyển động liên tục.
-   **Thang đo nhiệt màu:** Cạnh màu **Xanh** (Xác suất thấp) -> **Vàng** (Trung bình) -> **Đỏ** (Cực cao).
-   **Khung hình Giải Thích (Triangle Closure):** Đặc biệt cho GAT, bạn sẽ thấy các **hình tam giác màu vàng** hiện lên mờ mờ trên đồ thị. Đây là cách AI giải thích: "Vì Nút A và Nút B cùng chơi với Nút C, nên tôi đoán A và B sẽ kết nối với nhau".
-   **Bảng Top-K:** Một danh sách nhỏ phía góc trên hiển thị các cặp nút có khả năng "kết hôn" cao nhất trong toàn bộ hệ thống.

---

## 2. Bản Đồ Tương Tác 4 Bảng (Core Layout)
Giao diện chính được chia thành 4 khu vực thông minh, cho phép theo dõi mô hình từ nhiều góc độ:
-   **Topology View (Bên trái):** Thể hiện cấu trúc đồ thị thực tế.
-   **Embedding Space (Phía trên bên phải):** Thể hiện cách AI "nén" dữ liệu vào không gian 2D/3D.
-   **Metrics & Charts (Phía dưới bên phải):** Theo dõi hiệu năng (Loss/Accuracy) real-time.
-   **Player & Training Bar (Phía dưới cùng):** Điều khiển quá trình huấn luyện và xem lại (playback).

---

## 2. Các Chức Năng Khả Thị Hóa Đồ Thị (Topology Features)

### 🔴 Chế độ hiển thị (View Modes)
Bạn có thể chuyển đổi giữa các chế độ xem để chẩn đoán mô hình:
-   **Prediction Mode:** Nút được tô màu theo nhãn mà AI dự đoán ở epoch hiện tại.
-   **Error Mode:** Nhấn mạnh các nút bị dự đoán sai. Các nút sai sẽ rực lên hoặc hiển thị màu cảnh báo.
-   **Ground Truth:** Xem nhãn thực tế của dữ liệu để so sánh.

### 🕸️ Khả thị hóa thuật toán chuyên sâu
Tùy vào mô hình bạn chọn, cách đồ thị hiển thị sẽ thay đổi để giải thích cơ chế bên trong:
-   **GAT (Attention):**
    -   **Attention Edges:** Các đường nối sẽ có độ đậm nhạt khác nhau tùy vào trọng số chú ý (Attention weight).
    -   **Flow Particles:** Các hạt sáng chạy dọc theo cạnh. Cạnh nào quan trọng hơn sẽ có nhiều hạt chạy nhanh và dày hơn.
    -   **Multi-head Selector:** Bạn có thể chọn xem Attention của từng Head (H0, H1, H2, H3) hoặc trung bình (AVG).
-   **GraphSAGE (Sampling):**
    -   Hiệu ứng **Dynamic Sampling**: Các hạt sáng sẽ xuất hiện ngẫu nhiên trên các cạnh đang được lấy mẫu (sample) để huấn luyện, mô phỏng cơ chế inductive learning.

### 🏘️ Khái niệm K-Hop Neighborhood (Vùng lân cận)
Đây là tính năng mạnh mẽ nhất để hiểu "tầm nhìn" của nút:
-   **Visual Glow:** Khi bạn chọn một nút, vùng lân cận của nó sẽ phát sáng:
    -   **Màu Cyan (Xanh lục):** 1-Hop (Hàng xóm trực tiếp).
    -   **Màu Purple (Tím):** 2-Hop (Hàng xóm của hàng xóm).
    -   **Màu Amber (Vàng):** 3-Hop (Ranh giới xa nhất ảnh hưởng đến kết quả).
-   **Edge Dimming:** Các cạnh nằm ngoài vùng K-hop sẽ bị mờ đi để bạn tập trung hoàn toàn vào luồng thông tin của nút đang chọn.
-   **K-Hop Toggle:** Có thể bật/tắt hoặc thay đổi độ sâu (1H, 2H, 3H) ngay trên thanh công cụ.

---

## 3. Hệ Thống Giải Thích Nút (Node Inspector & Explanation)

Khi bạn click vào một nút, **Node Info Panel V2** sẽ xuất hiện với các thông tin cực kỳ chi tiết:

### 📊 Giải thích dự đoán (Prediction Explanation)
-   **Probability Distribution:** Biểu đồ cột hiển thị xác suất cho TẤT CẢ các lớp. Bạn sẽ thấy AI đang phân vân giữa lớp nào.
-   **Confidence Score:** Điệu độ tự tin của mô hình (0% - 100%).
-   **Neighbor Influence Analysis:**
    -   Hệ thống tự động tính toán xem hàng xóm của nút này thuộc lớp nào nhiều nhất.
    -   **Logic Engine:** Đưa ra nhận xét tự động như: *"Dự đoán sai vì nút này bị bao quanh bởi nhiều hàng xóm thuộc lớp khác (Node Bridge)"* hoặc *"Dự đoán đúng nhờ cấu trúc hàng xóm đồng nhất"*.

### 🔍 Danh sách hàng xóm quan trọng (Top Neighbors)
-   Hiển thị danh sách các nút có ảnh hưởng lớn nhất đến nút hiện tại.
-   Trong GAT, danh sách này được sắp xếp theo **Attention Weight** (Nút nào "kéo" thông tin về nhiều nhất).
-   Bạn có thể click trực tiếp vào một hàng xóm trong danh sách để "nhảy" đến nút đó trên đồ thị.

---

## 4. Chức Năng Playback & Training (Thanh Điều Khiển)

-   **Timeline Scrubber:** Kéo thanh trượt để xem lại trạng thái của đồ thị ở bất kỳ epoch nào trong lịch sử.
-   **Speed Control:** Chỉnh tốc độ xem lại (0.5x, 1x, 2x, 4x) để quan sát sự thay đổi màu sắc của các cụm nút theo thời gian.
-   **Smooth Interpolation:** Sử dụng thuật toán nội suy màu sắc khiến quá trình chuyển đổi giữa các epoch trông mượt mà như một đoạn phim, giúp bạn thấy rõ lúc nào mô hình bắt đầu "nhận ra" các cụm dữ liệu.

---

## 5. Các Tính Năng Cao Cấp Cho Từng Task

### Task 2: Graph Classification
-   **Global Readout View:** Khả thị hóa cách nén toàn bộ đồ thị thành một điểm trong không gian embedding.

### Task 3: Link Prediction
-   **Pair Proximity:** Khả thị hóa độ tương đồng của hai nút bất kỳ để giải thích tại sao AI dự đoán chúng sẽ kết nối với nhau.
-   **Edge Confidence:** Các cạnh dự đoán có điểm số (score) đi kèm.

### Task 4: Community Detection
-   **Community Evolution:** Xem cách các "hòn đảo" nút tách ra hoặc nhập lại khi mô hình học được cấu trúc cộng đồng.
-   **Modularity Tracking:** Biểu đồ real-time đo lường độ phân tách của các cộng đồng.

### Task 5: Graph Embedding (kNN Preservation)
-   **kNN Stability Chart:** Đo lường xem mô hình có giữ được các người bạn thân (k-nearest neighbors) của nút khi chuyển sang không gian 2D hay không. Đây là chỉ số quan trọng để đánh giá chất lượng embedding.

---

## 6. Thao Tác Nhanh (Shortcut & Control)
-   **Right Click (Chuột phải):** Mở Menu nhanh để:
    -   `Focus & Center`: Tự động phóng to và căn giữa nút đang chọn.
    -   `Enable K-Hop`: Bật nhanh chế độ soi vùng lân cận.
-   **Drag & Drop:** Bạn có thể kéo các nút trên đồ thị để kiểm tra tính đàn hồi của layout vật lý (D3-force).
-   **Export:** Nút xuất dữ liệu (CSV/JSON) nằm ở thanh Toolbar để lưu lại kết quả embedding hoặc training.

---
*Tài liệu này luôn được cập nhật đồng bộ với các phiên bản code mới nhất của GNN-Insight.*
