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

### Layout in dense panels (container-query, NOT viewport)
Metric tabs render trong right rail (width 260–800px). **Không dùng** Tailwind `sm: / lg: / xl:` — breakpoint theo viewport sẽ sai khi rail hẹp trong 1920×1080. Thay vào đó dùng CSS `auto-fit` grid — container tự thoả 1–3 cột:

```jsx
<div
  className="grid gap-3"
  style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
>
  <MatrixBlock />       {/* mỗi block tự đặt min-w-0 để không overflow */}
  <PerClassTable />
  <HardCasesList />
</div>
```

Rule of thumb: `minmax(180px, 1fr)` cho cards nhỏ (hard-case row), `minmax(240px, 1fr)` cho plot blocks (histogram, scatter). Mỗi con grid item phải có `min-w-0` để tránh overflow-x scroll.

### Pattern: Confusion Matrix block (per-class)
- Grid `C×C`, diagonal = emerald tint, off-diagonal = red tint, intensity ∝ count / max.
- Cell là `<button>` để user click pin hard-case filter qua `onSelectCell(predIdx, gtIdx)`.
- Kèm bảng per-class Precision / Recall / F1 / Support — render ngay cạnh matrix nhờ auto-fit grid.
- Pure helper `buildConfusionMatrix(predictions, groundTruth)` trong `utils/task2Metrics.js` đảm bảo test unit được và tránh recompute khi re-render.

## When to trigger
- Tạo mới / refactor component thuộc `components/MetricsChart/**` hoặc bất cứ file kết thúc bằng `Monitor.jsx`.
- Thêm field mới từ BE (ví dụ bật `outlier_scores` cho Task 5).

## Example
Thêm `OutlierPanel` cho Task 5:
- Nhận `snap.outlier_scores` (Array<number>).
- Tabs: `Overview` (histogram) · `Top-K` (bảng 20 node outlier cao nhất) · `Embedding` (scatter đánh dấu outlier).
- Empty khi `outlier_scores` length = 0 → `<EmptyState title="Outlier detection disabled" />`.

### Pattern: "Embedding quality triad" (Task 5)

Task 5 (Graph Embedding) là dạng panel không có confusion matrix rõ ràng — thay vào đó hội tụ 3 trục chất lượng:

1. **Overview** — kNN preservation + link recon AUC + loss theo epoch. Dual-Y: `[0, 100]` pct trái, loss phải. Cảnh báo khi iso/kNN < threshold.
2. **Outliers** — `topKOutliers(snap.outlier_scores, 10)` → list row. Click row = `setSelectedNode(id)` + `setOutlierPulse(id)` → canvas center & pulse 1.5s.
3. **KNN Preservation** — scatter `degree × per_node_knn_preservation` + reference line = mean. Nodes phía dưới đường = ứng viên outlier có thể bảo tồn kém.
4. **Diagnostics** — histogram `embedding_norms` + isotropy gauge (BE score + client-computed PCA isotropy cho so sánh).

Ràng buộc:
- 4 tab, không hơn.
- Viz tab dùng `repeat(auto-fit, minmax(220px, 1fr))` để fit rail 360→900px.
- `setOutlierPulse` trong `useGNNStore` phải được clear trong `setTask` / `setModel` (pattern giống `selectedCommunityId` + `focusedEdgeIdx`).
- Node radius trên canvas phải cap `[3, 11]` — không cho degree-outlier lấn toàn khung hình.
