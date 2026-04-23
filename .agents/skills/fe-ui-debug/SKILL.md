---
name: fe-ui-debug
description: Pattern debug cho UI bugs khó (stale closure, zombie component, missing key, render twice, memo miss). Dùng khi nhận bug report FE hoặc khi visual regression fail.
---

# FE UI Debug Skill

## Purpose
Chuẩn hoá quy trình debug cho 5 loại lỗi thường gặp trong React + Zustand của GNN-Insight:

1. **Stale closure** — `useEffect` / `useCallback` có deps thiếu, ref không sync.
2. **Zombie component** — file chưa bao giờ import vào tree, dễ gây nhầm khi sửa.
3. **Missing key warning** — `.map` không có `key` ổn định.
4. **Render twice (strict mode)** — side-effect không idempotent.
5. **Memo miss** — `React.memo` wrap nhưng prop ref luôn mới.

## Input
- Bug report hoặc screenshot.
- Stack trace (nếu có).
- Tên component nghi ngờ.

## Output
Một root-cause note theo template:
```
Bug: ...
Root cause category: [stale-closure | zombie | key | render-twice | memo-miss]
Minimum repro (5–10 dòng):
...
Fix pattern:
- Move ref sync vào useEffect cùng deps
- Hoặc refactor sang useSyncExternalStore
- ...
Regression test plan:
- File ...test.js assert ...
```

## When to trigger
- User hoặc QA báo "UI lag / không update / crash ngẫu nhiên".
- Visual regression CI fail.
- Thay đổi lớn trong `TopologyView.jsx` hoặc các file > 400 LOC.

## Example
Bug B01 (Misclassification Explorer): red ring không hiện khi toggle.
→ Root cause: stale closure (B07).
→ `animState.current.showErrorsOnlySafe` luôn là hằng `false`; deps useEffect chứa `showErrorsOnly` nhưng không dùng.
→ Fix: thay `showErrorsOnlySafe = false` bằng reactive state, đồng bộ vào `animState.current.showErrorsOnly`, giữ nguyên deps.
→ Test `misclassification.test.js` + smoke test UI.
