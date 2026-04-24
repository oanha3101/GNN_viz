# Plan — Redesign Left Sidebar + Universal Node-Hover Info

> Đọc kỹ hiện trạng repo (`AppSidebar`, `BaseForceGraph`, `TaskSelector`, `InfoRouter`, 6 × `TaskTopology*`) trước khi soạn.
> Mục tiêu bám đúng 2 yêu cầu:
> 1. Redesign sidebar trái theo hướng UX-first, dễ tương tác hơn.
> 2. Task 1–6: hover vào node phải thấy thông tin + features ngay, không phải đoán panel nào đang hiển thị.

---

## 1. Đánh giá hiện trạng

### 1a. Sidebar trái
- `AppSidebar` (<ref_snippet file="/home/ubuntu/repos/TEST_GNN/frontend/src/App.jsx" lines="101-137" />) chỉ 56–200 px, chỉ chứa **3 nút View** (Topology / Latent / Performance) + **4 nút Tool** (Library / Upload / Settings / Help). Không đảm nhiệm chuyển task, chọn model, hay chạy training — những thứ này đang bị nhồi vào header (`<TaskSelector/>`, `<ModelSelector/>`, `<InductiveDemo/>`, <ref_snippet file="/home/ubuntu/repos/TEST_GNN/frontend/src/App.jsx" lines="336-340" />) và rải rác.
- Header ở 1440 px trở xuống bị dồn — task picker bị ép, model picker hoặc mất hoặc wrap.
- `TrainingControlsV2` (Run / Stop / progress) hiện nằm trong right rail, không gần TaskSelector → user phải nhảy ánh nhìn giữa header → right rail khi chuyển task rồi Run.
- Sidebar không hiển thị shortcut `[` `]` `Space` (hard discovery).
- `sidebarCollapsed` default `true` (<ref_snippet file="/home/ubuntu/repos/TEST_GNN/frontend/src/App.jsx" lines="259-259" />) → user mới vào chỉ thấy icon-rail, mất label ngữ cảnh.

### 1b. Node hover
- `BaseForceGraph` (<ref_snippet file="/home/ubuntu/repos/TEST_GNN/frontend/src/components/TopologyView/BaseForceGraph.jsx" lines="9-95" />) expose `onNodeClick`, `onNodeRightClick` nhưng **không wire `onNodeHover`** (ForceGraph2D hỗ trợ sẵn, mình đang bỏ).
- Hậu quả: hover node không có phản hồi → user buộc phải **click** để panel bottom-right `InfoRouter` (<ref_snippet file="/home/ubuntu/repos/TEST_GNN/frontend/src/App.jsx" lines="71-81" />) hiển thị. Panel này ở góc dưới-phải, hẹp, dễ bị bỏ qua.
- `useGNNStore` đã có `hoveredGraphId` (cho Task 2 grid) nhưng **không có `hoveredNodeId`** dùng chung.
- Các task có dữ liệu node rất khác nhau (Task 1 `node_predictions/node_confidence/node_probabilities`, Task 3 `edge_scores`, Task 4 `community_labels/bridge_strength`, Task 5 embedding KNN, Task 6 graph roles) → cần 1 helper trộn dữ liệu trả về "những gì nên show khi hover".

---

## 2. Thiết kế đề xuất

### 2a. Left sidebar mới — `Shell/LeftSidebar.jsx`

Cấu trúc dọc, gom workflow theo đúng chuỗi hành động của user:

```
┌ Workspace ─────────┐  ← brand + toggle collapse
│  [GNN-Insight]     │
├ Task ──────────────┤  ← 6 pill có status (active / has-data / training)
│  ◉ Node Class (1)  │
│  ○ Graph Class (2) │
│  ○ Link Pred  (3)  │
│  ○ Community (4)   │
│  ○ Embedding (5)   │
│  ○ GraphGen  (6)   │
├ Model ─────────────┤  ← GCN / GAT / GraphSAGE chips
│  [GCN] [GAT] ...   │
├ Run ───────────────┤  ← compact facade cho TrainingControlsV2
│  ▶ Run · 100 ep    │
│  ▓▓▓░░░ 42%        │
├ Views ─────────────┤  ← giữ 3 nút cũ
│  ● Topology        │
│  ● Latent          │
│  ● Performance     │
├ Tools ─────────────┤  ← giữ Library / Upload / Settings / Help
├ Shortcuts ─────────┤  ← [ ] Space ← →  (luôn visible, discovery)
└────────────────────┘
```

- Collapsed 68 px (icon-only + tooltip on hover), expanded 260 px.
- `sidebarCollapsed` persist qua `localStorage.gnnSidebarCollapsed`.
- Khi `selectedNodeId != null`, section Views có dot "Inspector active" → hint chỉ tay vào nơi đang show thông tin node đầy đủ (ở bottom-right).

### 2b. Universal node-hover

Mỗi `TaskTopology*` render:
```
<div className="relative">
  <BaseForceGraph ... />
  <NodeHoverCard />   // anchored top-right, đọc từ store, ẩn khi không hover
</div>
```

`NodeHoverCard` đọc `hoveredNodeId` + `selectedTask` + snapshot hiện tại rồi render card task-aware (xem bảng dưới). Click node vẫn pin sang `selectedNodeId` để bottom Inspector show chi tiết đầy đủ.

### 2c. Mỗi task hover card show gì (theo hiện có của snapshot)

| Task | Quick-fields trong HoverCard |
|---|---|
| 1 Node Class | `#id`, degree, GT class, pred class, confidence, correct/wrong chip |
| 2 Graph Class (node trong drill-down) | `#id`, degree, attention α top-5 weight, graph density context |
| 3 Link Pred | `#id`, degree, #pos edges, #neg edges nối node đó, avg edge score |
| 4 Community | `#id`, community label, bridge strength, conductance of its cluster |
| 5 Embedding | `#id`, degree, top-1 KNN distance, class (nếu labeled) |
| 6 Graph Gen (mini graph) | `#id`, role (isolated/hub/bridge/leaf/regular), degree |

Tất cả có dòng cuối: `click = pin → full Inspector` để hint cho user biết chỗ panel mở rộng.

---

## 3. Symbol signatures (theo thứ tự data flow)

### 3.1 Store (layer 0)
`frontend/src/store/useGNNStore.js`
```js
// thêm state + setter
hoveredNodeId: null,                         // NEW
setHoveredNode: (id) => set({ hoveredNodeId: id }),  // NEW
// setTask + setModel: clear thêm hoveredNodeId
```

### 3.2 Helper pure (layer 0.5)
`frontend/src/utils/nodeHoverSummary.js`  **NEW**
```js
/**
 * Build the task-aware summary rendered inside NodeHoverCard.
 * Pure: no DOM, no store — just the snapshot + graph + taskId.
 */
export function buildHoverSummary(
  taskId,            // 1..6
  nodeId,            // number | null
  snapshot,          // current snapshot or null
  graphData,         // { nodes, links } | null
  groundTruth,       // array | null
) { /* returns { title, chips: [{label,value,tone}], rows: [{label,value}] } or null */ }
```
Có unit test (`nodeHoverSummary.test.js`, 6 cases — 1/task).

### 3.3 Canvas base (layer 1)
`frontend/src/components/TopologyView/BaseForceGraph.jsx`
```diff
- const BaseForceGraph = forwardRef(({ ..., onNodeClick, onNodeRightClick, ... }, ref) => {
+ const BaseForceGraph = forwardRef(({ ..., onNodeClick, onNodeRightClick, onNodeHover, ... }, ref) => {
+   const setHoveredNode = useGNNStore((s) => s.setHoveredNode)
+   const handleNodeHover = useCallback((node) => {
+     setHoveredNode(node?.id ?? null)
+     if (onNodeHover) onNodeHover(node)
+   }, [setHoveredNode, onNodeHover])
    ...
    <ForceGraph2D
      ...
+     onNodeHover={handleNodeHover}
    />
```

### 3.4 Card UI (layer 2)
`frontend/src/components/TopologyView/NodeHoverCard.jsx`  **NEW**
```jsx
export default function NodeHoverCard() {
  // Reads hoveredNodeId + selectedNodeId + task from store;
  // snapshot + graphData from playerStore + gnnStore;
  // Uses buildHoverSummary(...); renders fixed top-right when summary != null.
}
```

### 3.5 6 Task consumers (layer 3) — minimal diff
`TaskTopology1.jsx … TaskTopology6.jsx`
- Không cần truyền thêm prop — BaseForceGraph đã tự push vào store.
- Chỉ thêm `<NodeHoverCard />` bên cạnh ForceGraph container.

### 3.6 Sidebar mới (layer 4)
`frontend/src/components/Shell/LeftSidebar.jsx`  **NEW** (thay thế `AppSidebar` trong App.jsx)
```jsx
export default function LeftSidebar({
  collapsed, onToggle,
  rightPanelOpen, setRightPanelOpen,
  activeRightTab, setActiveRightTab,
  onOpenLibrary, onOpenDataInput, onOpenConfig,
}) {
  // Sections: Brand, TaskStack, ModelStack, RunSection, ViewSwitch, Tools, ShortcutHints
}

function SidebarSection({ title, children, collapsed })
function TaskStack({ collapsed })                   // 6 pills
function ModelStack({ collapsed })                  // GCN/GAT/SAGE chips
function RunSection({ collapsed })                  // wraps TrainingControlsV2 compact
function ViewSwitch({ ... })                        // Topology / Latent / Metrics + inspector-active dot
function ToolsSection({ ... })
function ShortcutHints({ collapsed })               // [ ] Space ← →
```

### 3.7 Integration (layer 5)
`frontend/src/App.jsx`
- Import `LeftSidebar` thay `AppSidebar`.
- `sidebarCollapsed` default `false`, hydrate từ `localStorage` (persistent).
- Xoá `<TaskSelector />` + `<ModelSelector />` khỏi header (chuyển vào sidebar). Giữ `<InductiveDemo />` vì nó là nút modal trigger.
- Khi `selectedNodeId` đổi từ `null` → number, auto-open right panel nếu đang collapsed (UX: user click để xem thì mở panel luôn).

### 3.8 (Tùy) Skill doc
`.agents/skills/fe-ux-heuristics/SKILL.md` — bổ sung heuristic "Hover phải trả lời được 3 câu: Who? What? Why?" để chốt pattern HoverCard.

---

## 4. TDD

1. `nodeHoverSummary.test.js` — **6 cases** (1 case / task), mock snapshot tối thiểu cho mỗi task, assert `chips` có các field expected.
2. (Optional) smoke test LeftSidebar render ở collapsed vs expanded, đảm bảo 6 task pill render đúng.
3. `npm run build` + `npx vitest run` phải xanh (target 124+ tests).

## 5. Ngoài phạm vi (defer)

- Backend field mới (không có node feature vector raw trong snapshot hiện tại → HoverCard chỉ show derived metrics, không render raw `x[i]`).
- Mobile breakpoint (<768 px) — layout 2 panel hiện không responsive hết, defer.
- Keyboard navigation giữa 6 task pill bằng `1`–`6` — đề xuất nhưng sẽ chỉ implement nếu user OK.

## 6. PR plan

- Branch: `feat/left-sidebar-redesign-and-node-hover`
- Base: `feat/xai-ui-and-adaptive-backend`
- Commit 1: store + helper + tests.
- Commit 2: BaseForceGraph hook + NodeHoverCard + integrate 6 TaskTopology.
- Commit 3: LeftSidebar + App.jsx integration.
- Mở PR #10. Sau khi CI xanh, offer test end-to-end (record: hover mỗi task → card hiện, collapse/expand sidebar, click node → right panel auto-open).

---

## 7. Xác nhận trước khi code

Câu hỏi chốt plan:
- **(A)** Có muốn tôi **xoá** `TaskSelector` + `ModelSelector` khỏi header (chuyển 100% về sidebar) hay **giữ song song** cả 2 nơi? Khuyên: xoá để tránh double-source-of-truth, header gọn hơn.
- **(B)** HoverCard anchor: **top-right of canvas** (đơn giản, không che node) hay **follow cursor** (trực quan hơn nhưng dễ che node)? Khuyên: top-right.
- **(C)** Shortcut `1`–`6` để switch task: làm luôn hay defer?

Nếu không có ý kiến khác → tôi mặc định (A)=xoá, (B)=top-right, (C)=defer.
