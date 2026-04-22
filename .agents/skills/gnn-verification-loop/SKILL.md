---
name: gnn-verification-loop
description: "Quy trình xác minh liên tục sau khi chỉnh sửa code. Dùng để đảm bảo các thay đổi không phá vỡ 6 Tasks của GNN, logic training real-time hoặc tính nhất quán của Database."
---

# GNN-Insight: Verification Loop

Kỹ năng này giúp AI tự kiểm tra và xác nhận chất lượng công việc trước khi bàn giao cho người dùng.

## Các Bước Xác Minh

### 1. Kiểm tra Tính Nhất quán (Cross-Task Check)
- Nếu thay đổi model trong `backend/models/`, hãy kiểm tra xem nó có ảnh hưởng đến các file Task tương ứng trong `backend/tasks/` (từ Task 1 đến Task 6) không.
- Đặc biệt lưu ý: Task 5 và 6 có logic xử lý embedding khác biệt so với Task 1-4.

### 2. Kiểm tra Luồng Dữ liệu (End-to-End Logic)
- Xác minh rằng cấu trúc JSON trả về từ backend vẫn khớp với logic nhận tin nhắn trong `frontend/src/hooks/useWebSocket.js`.
- Kiểm tra xem các state trong `useGNNStore` có được cập nhật đúng không.

### 3. Chạy Thử nghiệm (Empirical Validation)
- Nếu có file test liên quan (pytest hoặc vitest), hãy chạy chúng.
- Nếu không có test, hãy yêu cầu người dùng hoặc tự mình thực hiện một bước "dry run" bằng cách mô phỏng dữ liệu đầu vào.

### 4. Kiểm tra Tiêu chuẩn Code
- Đảm bảo tuân thủ rules về `colors.js` cho frontend.
- Đảm bảo backend luôn trả về bộ tuple `(logits, embedding)` cho các model GNN.

## Câu hỏi Tự vấn (Self-Check)
- "Việc sửa đổi này có làm vỡ logic Playback trong `playerStore.js` không?"
- "Các tham số mới có được hỗ trợ trong `ConfigPanel.jsx` chưa?"
- "Dữ liệu mới có được lưu đúng vào MongoDB/MySQL không?"
