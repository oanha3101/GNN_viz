---
name: gnn-search-first
description: "Workflow bắt buộc phải tìm kiếm và hiểu context trước khi code. Dùng trước khi thực hiện bất kỳ thay đổi logic nào trong dự án GNN-Insight để tránh phá vỡ các thành phần phức tạp như WebSocket, DB, và State."
---

# GNN-Insight: Search-First Workflow

Kỹ năng này bắt buộc AI phải thực hiện nghiên cứu kỹ lưỡng trước khi đề xuất hoặc triển khai mã nguồn.

## Quy trình Thực hiện

### 1. Phân tích Yêu cầu
- Xác định xem yêu cầu ảnh hưởng đến Frontend (React), Backend (FastAPI), hay luồng dữ liệu (WebSocket/Database).

### 2. Nghiên cứu Context (Bắt buộc)
- Luôn đọc `PROJECT_OVERVIEW.md` để nắm bắt kiến trúc tổng thể.
- Sử dụng `grep_search` để tìm các từ khóa liên quan đến module đang sửa đổi.
- Nếu sửa đổi API, phải kiểm tra file `backend/main.py` và các router trong `backend/api/`.
- Nếu sửa đổi UI, phải kiểm tra `frontend/src/store/useGNNStore.js` để hiểu state management.

### 3. Xác minh Giả định
- Trước khi code, hãy liệt kê các file sẽ bị ảnh hưởng.
- Kiểm tra xem có file `.md` nào khác (như `BUG_REPORT.md` hoặc `IMPLEMENTATION_PLAN.md`) chứa thông tin liên quan không.

## Nguyên tắc Vàng
- **Không bao giờ đoán**: Nếu không chắc chắn về cấu trúc của một object (VD: snapshot gửi qua WebSocket), hãy đọc code định nghĩa nó trước.
- **Context là trên hết**: Luôn ưu tiên tính nhất quán của hệ thống hơn là tốc độ hoàn thành task.
