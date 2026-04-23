---
name: viz-dashboards
description: Chuẩn hoá per-task metric panel (6 tasks GNN-Insight). Dùng `<Panel>` primitive làm skeleton, tabs ≤ 4, cleanup D3/Plotly listener. Dùng khi thay đổi trong `components/MetricsChart/**` hoặc `components/TopologyView/**Monitor*.jsx`.
---

# Viz Dashboards Skill

## Purpose
Bảo đảm mọi metric panel theo task (Task 1–6) có cùng chrome, cùng tabs hợp lý, cùng cleanup logic — người dùng không phải học 6 UI khác nhau.

## Input
- Tên task (1–6) và metric cần hiển thị.
- Schema snapshot từ BE (ex. `outlier_scores`, `comparison_metrics`, `node_correctness`).

## Output
Component file tuân thủ template:
```jsx
import { Panel } from '../primitives/Panel'

export default function TaskNMetricsPanel() {
  const snap = usePlayerStore(s => s.snapshots[...])
  if (!snap) return <EmptyState title="No metrics yet" />
  return (
    <Panel title="Task N — Metrics" subtitle="..." tabs={[
      { id: 'overview', label: 'Overview', content: <Overview snap={snap}/> },
      { id: 'perClass', label: 'Per-class', content: <PerClass snap={snap}/> },
      ...
    ]} />
  )
}
```

Ràng buộc:
- Tab ≤ 4, nhãn ≤ 12 ký tự.
- Cleanup listener D3 / Plotly trong return của `useEffect`.
- Color ramp lấy từ `utils/colors.js` (không tự chế).
- Dữ liệu thiếu → `<EmptyState>`, không render `--`.

## When to trigger
- Tạo mới / refactor component thuộc `components/MetricsChart/**` hoặc bất cứ file kết thúc bằng `Monitor.jsx`.
- Thêm field mới từ BE (ví dụ bật `outlier_scores` cho Task 5).

## Example
Thêm `OutlierPanel` cho Task 5:
- Nhận `snap.outlier_scores` (Array<number>).
- Tabs: `Overview` (histogram) · `Top-K` (bảng 20 node outlier cao nhất) · `Embedding` (scatter đánh dấu outlier).
- Empty khi `outlier_scores` length = 0 → `<EmptyState title="Outlier detection disabled" />`.
