# 📊 GNN-Insight — Theo Dõi Tiến Độ

> **Quy tắc**: File này PHẢI được cập nhật mỗi khi:
> - ✅ Hoàn thành một tính năng
> - 🔧 Phát hiện hoặc sửa xong bug
> - ⏸️ Làm dở dang chưa xong
> - ❌ Phát hiện lỗi mới chưa sửa
>
> **Cập nhật lần cuối**: 2026-04-11 02:55 (GMT+7)

---

## 🏗️ SPRINT 1 — Hệ thống cơ sở

| # | Hạng mục | Trạng thái | Ghi chú |
|:--|:---------|:-----------|:--------|
| 1.1 | TopologyRouter — 6 topology components | ✅ Xong | `TopologyView`, `TaskTopology2–6` |
| 1.2 | EmbeddingRouter — view riêng mỗi task | ✅ Xong | `EmbeddingView`, `PairProximityView`, `EmbeddingSpaceB`, `LatentSpaceView` |
| 1.3 | MetricsChart — Loss/Acc cơ bản | ✅ Xong | Dùng chung cho task chưa có panel riêng |
| 1.4 | Player V2 — timeline epoch | ✅ Xong | Play/Pause/Seek/Speed |
| 1.5 | ForceGraph2D canvas rendering | ✅ Xong | Tất cả topology views |
| 1.6 | WebSocket streaming snapshots | ✅ Xong | Backend → Frontend real-time |
| 1.7 | ConfigPanel — chọn dataset/model/epochs | ✅ Xong | |
| 1.8 | ProjectLibrary — lưu/xem lịch sử | ✅ Xong | MySQL persistence |

---

## 🏗️ SPRINT 2 — FloatPanel + Dendrogram + Dọn UX

| # | Hạng mục | Trạng thái | File | Ghi chú |
|:--|:---------|:-----------|:-----|:--------|
| 2.1 | FloatPanel — mở rộng panel overlay | ✅ Xong | `FloatPanel.jsx` | 84vw×84vh, backdrop blur |
| 2.2 | Dendrogram thực từ scipy linkage | ✅ Xong | `DendrogramView.jsx` + `community_detection.py` | Canvas rendering linkage matrix |
| 2.3 | Bỏ subtitle thừa ở PanelHeading | ✅ Xong | `App.jsx` | Xóa `currentPanelMeta.metrics` |
| 2.4 | Sửa InfoRouter duplicate (Task 3, 4) | ✅ Xong | `App.jsx` | ROC/Modularity không còn bị nhân đôi |
| 2.5 | Sửa ModularityMonitor bar chart bug | ✅ Xong | `ModularityMonitor.jsx` | `<Bar>` lồng `<Bar>` → dùng `<Cell>` |
| 2.6 | Wrap 3 panel bằng FloatPanel | ✅ Xong | `App.jsx` | Topology, Embedding, Metrics |

---

## 🏗️ SPRINT 3 — Oversmoothing (Task 1) + Top-K Links (Task 3)

| # | Hạng mục | Trạng thái | File | Ghi chú |
|:--|:---------|:-----------|:-----|:--------|
| 3.1 | BE: Dirichlet Energy per epoch | ✅ Xong | `node_classification.py` | `dirichlet_energy = mean ‖h_i − h_j‖²` |
| 3.2 | FE: Task1MetricsPanel tab Oversmoothing | ✅ Xong | `Task1MetricsPanel.jsx` | 3 tabs: Loss/Acc · CM · 🌊 Oversmoothing |
| 3.3 | BE: Top-K predicted links | ✅ Xong | `link_prediction.py` | Sample 200 cặp → top 15 by score |
| 3.4 | FE: Top-K badge trên TaskTopology3 | ✅ Xong | `TaskTopology3.jsx` | Badge tím floating, hiển thị source↔target + score% |
| 3.5 | BE: K-Hop influence per node | ❌ Chưa làm | `node_classification.py` | Cần tính neighbor count ở 1/2/3-hop |
| 3.6 | FE: KHopInspector component | ❌ Chưa làm | `KHopInspector.jsx` (chưa tạo) | Click node → vòng sáng K-hop mở rộng dần |
| 3.7 | FE: Wire K-hop vào TopologyView | ❌ Chưa làm | `TopologyView.jsx` | onNodeClick → ring expansion animation |

---

## 🏗️ SPRINT 4 — BatchHeatmap (Task 2) + CommunityEvolution (Task 4)

| # | Hạng mục | Trạng thái | File | Ghi chú |
|:--|:---------|:-----------|:-----|:--------|
| 4.1 | BE: graph_correct per graph | ✅ Xong | `graph_classification.py` | Array boolean đúng/sai mỗi graph |
| 4.2 | FE: Task2MetricsPanel + BatchHeatmap | ✅ Xong | `Task2MetricsPanel.jsx` | 2 tabs: 📈 Loss/Acc + 🗂 Batch Heatmap |
| 4.3 | BE: community_transitions | ✅ Xong | `community_detection.py` | Dict `"X→Y": count` mỗi epoch |
| 4.4 | FE: CommunityEvolution — Area + Sankey | ✅ Xong | `CommunityEvolution.jsx` | Stacked area full-height, Sankey chỉ khi có data |
| 4.5 | App.jsx routing cập nhật | ✅ Xong | `App.jsx` | Task 2 → Task2MetricsPanel, Task 4 Embedding → CommunityEvolution |
| 4.6 | Fix title dynamic ở EmbeddingRouter | ✅ Xong | `App.jsx` | Task 4 hiện "Community Evolution" thay vì "Không gian embedding" |

---

## 🐛 LỖI ĐÃ BIẾT — CHƯA SỬA

| # | Mô tả | Mức độ | Vị trí | Ghi chú |
|:--|:------|:-------|:-------|:--------|
| ~~B1~~ | **~~Top-K Links chỉ là badge text~~** | ✅ Đã sửa | `TaskTopology3.jsx` | Đã vẽ glowing link trực tiếp lên canvas qua `onRenderFramePost`. |
| ~~B2~~ | **~~CommunityEvolution Sankey thường trống~~** | ➖ Bỏ qua | `community_detection.py` | (Tính chất thuật toán) GNN hội tụ nhanh nên KMeans ổn định sớm, Sankey trống là data thực tế. Dùng soft assignment nếu muốn thay đổi. |
| ~~B3~~ | **~~DendrogramView bị mất khỏi UI Task 4~~** | ➖ Bỏ qua | `App.jsx` | (Chủ ý Thiết kế) Nhường chỗ cho CommunityEvolution. Dendrogram vẫn xem được ở InspectorDrawer (icon bên phải). |
| ~~B4~~ | **~~FloatPanel không đóng bằng ESC~~** | ✅ Đã sửa | `FloatPanel.jsx` | Đã thêm `useEffect` lắng nghe sự kiện keydown. |
| ~~B5~~ | **~~Bundle size 6.2MB~~** | ✅ Đã sửa | `vite.config.js` | Đã dùng `manualChunks` tách `plotly` và `vendor` ra khỏi bundle chính (index giảm còn 500KB). |
| ~~B6~~ | **~~PanelHeading chồng chữ~~** | ✅ Đã sửa | `EmbeddingSpaceB.jsx`, `LatentSpaceView.jsx` | Đã dịch chuyển các selector/tiêu đề xuống thấp hơn `pt-8`. |

---

## 💡 CẢI THIỆN CÓ THỂ LÀM

| # | Cải thiện | Impact | Effort | Trạng thái |
|:--|:----------|:-------|:-------|:-----------|
| I1 | Export chart PNG — download biểu đồ cho báo cáo | Cao | Thấp | ❌ Chưa làm |
| I2 | Confusion Matrix per-class recall progress bar | Trung bình | Thấp | ❌ Chưa làm |
| I3 | Task 2 Heatmap tooltip chi tiết hơn | Trung bình | Trung bình | ❌ Chưa làm |
| I4 | Dark/Light mode toggle cho print | Thấp | Cao | ❌ Chưa làm |
| I5 | Keyboard shortcuts (Space=play, ←→=epoch) | Trung bình | Thấp | ❌ Chưa làm |

---

## 🚀 TASK 5 & 6 — CHƯA NÂNG CẤP

### Task 5 — Graph Embedding (Inductive Learning)
- [ ] Stress/Distortion Chart — so sánh khoảng cách gốc vs embedding
- [ ] Node Importance Ranking — top-N node ảnh hưởng lớn nhất
- [ ] Embedding Drift Animation — trail effect khi embedding di chuyển

### Task 6 — Graph Generation (VAE)
- [ ] Latent Space Interpolation — nội suy giữa 2 điểm latent
- [ ] Validity/Novelty/Uniqueness Dashboard chi tiết
- [ ] Generated Graph Gallery — lưới graph sinh vs graph gốc

---

## 📐 BẢN ĐỒ ROUTING HIỆN TẠI

```
App.jsx
├── TopologyRouter (TRÁI — full height)
│   ├── Task 1 → TopologyView.jsx
│   ├── Task 2 → TaskTopology2.jsx
│   ├── Task 3 → TaskTopology3.jsx       ← có Top-K badge
│   ├── Task 4 → TaskTopology4.jsx
│   ├── Task 5 → TaskTopology5.jsx
│   └── Task 6 → TaskTopology6.jsx
│
├── EmbeddingRouter (PHẢI TRÊN) ← FloatPanel
│   ├── Task 1,2 → EmbeddingView.jsx
│   ├── Task 3 → PairProximityView.jsx
│   ├── Task 4 → CommunityEvolution.jsx  ★ MỚI
│   ├── Task 5 → EmbeddingSpaceB.jsx
│   └── Task 6 → LatentSpaceView.jsx
│
├── MetricsPanel (PHẢI DƯỚI) ← FloatPanel
│   ├── Task 1 → Task1MetricsPanel.jsx   ★ 3 tabs
│   ├── Task 2 → Task2MetricsPanel.jsx   ★ MỚI 2 tabs
│   ├── Task 3 → ROCMonitor.jsx
│   ├── Task 4 → ModularityMonitor.jsx
│   ├── Task 5 → StructurePreservation.jsx
│   └── Task 6 → MetricsChart.jsx
│
└── InspectorDrawer (TRƯỢT PHẢI)
    ├── Task 1 → NodeInfoPanel.jsx
    ├── Task 2 → ReadoutMonitor.jsx
    ├── Task 3 → LinkMetricsPanel.jsx
    ├── Task 4 → ModularityMonitor.jsx
    ├── Task 5 → Task5NodeInspector.jsx
    └── Task 6 → ValidityMonitor.jsx
```

---

## 🗂 BACKEND SNAPSHOT FIELDS (Đã thêm)

| Task | File | Trường mới | Kiểu dữ liệu |
|:-----|:-----|:-----------|:-------------|
| 1 | `node_classification.py` | `dirichlet_energy` | `float` |
| 2 | `graph_classification.py` | `graph_correct` | `list[0\|1]` per graph |
| 3 | `link_prediction.py` | `top_k_links` | `list[{source, target, score}]` |
| 4 | `community_detection.py` | `community_transitions` | `dict["X→Y": count]` |
| 4 | `community_detection.py` | `linkage_matrix` | `list[list]` (scipy) |
