---
name: gnn-continuous-learning
description: "Kỹ năng tự học và ghi nhớ dài hạn cho dự án GNN-Insight. Dùng sau khi hoàn tất một bug fix hoặc tính năng mới để lưu lại bài học kinh nghiệm thông qua lệnh save_memory, giúp AI không lặp lại lỗi cũ và hiểu sâu hơn về kiến trúc dự án."
---

# GNN-Insight: Continuous Learning & Persistence Workflow

Kỹ năng này biến mỗi lần sửa lỗi thành một bước tiến hóa của Trí tuệ nhân tạo đối với dự án.

## Quy trình Tự Học (Post-Task Post-mortem)

Sau khi bạn (Gemini CLI) hoàn thành một Task hoặc sửa xong một Bug, hãy thực hiện các bước sau:

### 1. Phân tích Bài học (Analyze)
Tự trả lời các câu hỏi sau:
- "Nguyên nhân thực sự của vấn đề là gì? (Root Cause)"
- "File nào hoặc cấu trúc nào trong GNN-Insight thường gây ra lỗi này nhất?"
- "Có mẫu thiết kế (Design Pattern) nào mới tôi vừa áp dụng không? (VD: BaseForceGraph)"

### 2. Ghi nhớ Dài hạn (Save Memory)
Sử dụng công cụ `save_memory` với `scope: project` để lưu lại những thông tin cốt lõi.
- **Cú pháp:** `save_memory(fact: "...", scope: "project")`
- **Ví dụ:** 
  - `save_memory(fact: "Dữ liệu snapshot WebSocket của GNN-Insight phải nén gzip để tránh lỗi 16MB MongoDB.", scope: "project")`
  - `save_memory(fact: "Luôn dùng BaseForceGraph thay vì ForceGraph2D trực tiếp để giữ tính ổn định cho layout.", scope: "project")`

### 3. Tái sử dụng Kiến thức (Apply)
Ở mỗi đầu phiên chat mới, hãy tự động tra cứu lại các `facts` đã lưu để:
- Tránh đặt câu hỏi trùng lặp.
- Áp dụng ngay các giải pháp đã được chứng minh là thành công trước đó.

## Nguyên tắc Vàng
- **Ghi nhớ sự thật, không ghi nhớ tóm tắt**: Hãy lưu lại những sự thật kỹ thuật (Technical facts) giúp ích cho việc code, thay vì lưu những câu chào hỏi hay tóm tắt chung chung.
- **Tiến hóa liên tục**: Nếu phát hiện một `fact` cũ không còn đúng, hãy cập nhật nó bằng một `fact` mới chính xác hơn.
