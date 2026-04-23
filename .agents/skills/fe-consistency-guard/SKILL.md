---
name: fe-consistency-guard
description: Ngăn drift khỏi design tokens, cấm hardcoded URL, cấm dùng Tailwind arbitrary values ngoài whitelist. Dùng làm pre-commit / CI lint step cho frontend.
---

# FE Consistency Guard Skill

## Purpose
Ngăn các thay đổi vô tình phá vỡ design system:
- Tailwind arbitrary `text-[7px]`, `w-[380px]` nằm ngoài tokens.
- URL cứng `localhost:*`, `http://`, `ws://` ngoài `frontend/src/utils/api.js`.
- Dùng màu gradient ngẫu nhiên thay vì palette chính.
- Import file V1 đã deprecate (V2 là nguồn duy nhất).

## Input
- Diff code FE (paths: `frontend/src/**`).
- File `frontend/src/theme/tokens.js` làm baseline cho phép.

## Output
- File report `consistency.json` liệt kê violation theo format:
  ```json
  {
    "violations": [
      { "file": "components/X.jsx", "line": 12, "rule": "tailwind-arbitrary", "detail": "text-[7px]" },
      { "file": "components/Y.jsx", "line": 5, "rule": "hardcoded-url", "detail": "localhost:8000" }
    ]
  }
  ```
- Exit code 1 nếu có violation mức `error`, 0 nếu chỉ `warn`.

## When to trigger
- `git commit` (pre-commit hook).
- CI workflow `fe-lint`.
- On-demand: dev chạy `npm run lint:consistency`.

## Example
Dev thêm `className="w-[380px] bg-gradient-to-r from-purple-500 to-pink-600"` →
- violation: `tailwind-arbitrary: w-[380px]` → gợi ý `w-sidebar`.
- violation: `gradient-use` → gợi ý dùng `bg-accent` hoặc solid từ tokens.
→ commit bị chặn.
