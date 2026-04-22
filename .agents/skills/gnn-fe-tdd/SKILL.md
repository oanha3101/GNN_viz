---
name: gnn-fe-tdd
description: "Kỹ năng phát triển Frontend cho GNN-Insight theo quy trình TDD. Dùng khi chỉnh sửa React components, Zustand stores, hoặc logic UI (Tailwind, Framer Motion)."
---

# GNN-Insight: Frontend TDD Workflow

Kỹ năng này đảm bảo mọi thay đổi giao diện đều được kiểm thử và tuân thủ kiến trúc dự án.

## Quy trình TDD (Red-Green-Refactor)

1. **Red (Viết Test Thất bại)**: Trước khi code tính năng mới hoặc sửa bug, hãy tạo hoặc cập nhật file test (VD: `Component.test.jsx`). Định nghĩa hành vi mong muốn.
2. **Green (Viết Code Tối thiểu)**: Viết mã nguồn vừa đủ để vượt qua các bài kiểm tra. Không thêm logic dư thừa.
3. **Refactor (Tối ưu hóa)**: Sau khi test pass, tiến hành dọn dẹp code, tối ưu CSS (Tailwind) và đảm bảo tính dễ đọc.

## Quy tắc Frontend

### 1. State Management (Zustand)
- Logic chính nằm trong `useGNNStore.js` và `playerStore.js`.
- Hạn chế dùng local state cho dữ liệu cần đồng bộ giữa các panel.

### 2. Styling (Tailwind + HSL)
- Sử dụng bảng màu tập trung trong `frontend/src/utils/colors.js`.
- Tuân thủ phong cách Glassmorphism và micro-animations nếu có yêu cầu cao về UI.

### 3. Visualization Logic
- Task 1-6 có các component `TaskTopologyX.jsx` riêng biệt. Luôn duy trì tính modular.
- Khi làm việc với D3.js hoặc Plotly, hãy đảm bảo cleanup các event listeners để tránh memory leak.

## Kiểm tra sau khi thực hiện
- Chạy `npm run lint` nếu có.
- Kiểm tra hiển thị trên các màn hình khác nhau (Responsive).
- Xác nhận các sự kiện WebSocket được trigger đúng (Start/Stop training).
