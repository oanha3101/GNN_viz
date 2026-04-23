---
name: fe-ux-heuristics
description: Áp 10 heuristic Nielsen + quy tắc UX nội bộ cho mỗi component/feature mới trong GNN-Insight. Dùng khi PR chạm tới `frontend/src/components/**` hoặc thay đổi layout chính.
---

# FE UX Heuristics Skill

## Purpose
Đảm bảo mọi thay đổi UI tôn trọng nguyên tắc UX cơ bản và quy ước nội bộ (tokens, loading / empty / error states, keyboard nav) trước khi ship.

## Input
- Diff của 1 PR có sửa / thêm component FE.
- Screenshot / recording của flow người dùng (nếu thay đổi visual).

## Output
Một checklist markdown gắn vào PR description:
- [ ] Visibility of system status (loading, progress, WS connection)
- [ ] Match between system and real world (nhãn tiếng Anh + tiếng Việt phải thống nhất trong 1 màn)
- [ ] User control & freedom (ESC đóng modal, undo upload)
- [ ] Consistency — dùng `<Panel>` primitive, không tạo chrome mới
- [ ] Error prevention — disable nút khi input invalid
- [ ] Recognition over recall — hiện label cùng icon
- [ ] Flexibility & efficiency — keyboard shortcut không đè TEXTAREA / contenteditable
- [ ] Aesthetic — không dùng arbitrary Tailwind values, tôn trọng design tokens
- [ ] Help users recognize, diagnose, recover — `ErrorState` có retry + chi tiết
- [ ] Help & documentation — tooltip cho mọi toggle / chế độ chuyên biệt

Mỗi mục fail phải ghi giải thích + plan khắc phục.

## When to trigger
- Pre-merge: PR có file `.jsx` / `.tsx` trong `frontend/src/components/**` hoặc `frontend/src/App.jsx` / `frontend/src/store/**`.
- Pre-release: trước khi demo cho stakeholder.

## Example
Thêm "Upload Wizard" 4 step:
1. Checklist ghi đủ Loading (upload progress), Empty (chưa chọn file), Error (file invalid + retry).
2. Nút Back / Next disable khi step không hợp lệ.
3. ESC đóng wizard → confirm dialog nếu đã upload.
→ 10/10 pass, ship.
