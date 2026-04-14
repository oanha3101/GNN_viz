# ╔════════════════════════════════════════════════════════════════════════╗
# ║  GNN-INSIGHT — PROMPT ANIMATION LIỀN MẠCH                           ║
# ║  6 Nhiệm vụ × 3 Mô hình · Epoch frames mượt như video               ║
# ║  Nguồn: GNN_Insight_6Tasks_3Models.docx                              ║
# ╚════════════════════════════════════════════════════════════════════════╝
#
#  CÁCH DÙNG: Copy toàn bộ nội dung từ ===BEGIN=== đến ===END===
#  rồi paste vào Cursor / Claude / Copilot Chat
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

===BEGIN===

Bạn đang build GNN-Insight — web app trực quan hóa training GNN theo từng epoch.
Nhiệm vụ CỐT LÕI của prompt này: làm cho animation giữa các epoch LIỀN MẠCH
như một đoạn video, không giật cục, không nhảy đột ngột.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## NGUYÊN TẮC ANIMATION SỐ 1 — INTERPOLATION GIỮA EPOCH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

KHÔNG BAO GIỜ nhảy trực tiếp từ snapshot[i] sang snapshot[i+1].
LUÔN LUÔN tính giá trị tại thời điểm t ∈ [0,1] bằng interpolation.

State player lưu `currentEpochFloat` (số thực, ví dụ: 47.35)
  → i = floor(47.35) = 47        (snapshot hiện tại)
  → t = 47.35 - 47 = 0.35       (tiến độ đến snapshot kế tiếp)
  → mọi giá trị hiển thị = lerp(snapshot[47], snapshot[48], easeInOutCubic(0.35))

```js
// src/engine/interpolate.js — ĐÂY LÀ FILE QUAN TRỌNG NHẤT

const easeInOutCubic = t =>
  t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2

const lerp = (a, b, t) => a + (b-a)*t

// Lerp màu hex: #E53935 → #1E88E5
const lerpColor = (hexA, hexB, t) => {
  const p = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]
  const [rA,gA,bA] = p(hexA), [rB,gB,bB] = p(hexB)
  const hex = n => Math.round(n).toString(16).padStart(2,'0')
  return `#${hex(lerp(rA,rB,t))}${hex(lerp(gA,gB,t))}${hex(lerp(bA,bB,t))}`
}

// Interpolate toàn bộ snapshot tại thời điểm t
export function interpolateSnapshots(snapA, snapB, rawT) {
  if (!snapA || !snapB) return snapA ?? snapB
  const t = easeInOutCubic(rawT)

  return {
    // ── Metrics (lerp thẳng) ──────────────────────────────────────
    epoch:      lerp(snapA.epoch,      snapB.epoch,      rawT), // float cho hiển thị
    train_loss: lerp(snapA.train_loss, snapB.train_loss, t),
    val_loss:   lerp(snapA.val_loss,   snapB.val_loss,   t),
    train_acc:  lerp(snapA.train_acc,  snapB.train_acc,  t),
    val_acc:    lerp(snapA.val_acc,    snapB.val_acc,    t),
    modularity: snapA.modularity != null
      ? lerp(snapA.modularity, snapB.modularity ?? snapA.modularity, t) : null,
    auc:        snapA.auc != null
      ? lerp(snapA.auc,        snapB.auc        ?? snapA.auc,        t) : null,
    valid_pct:  snapA.valid_pct != null
      ? lerp(snapA.valid_pct,  snapB.valid_pct  ?? snapA.valid_pct,  t) : null,
    kl_div:     snapA.kl_div != null
      ? lerp(snapA.kl_div,     snapB.kl_div     ?? snapA.kl_div,     t) : null,
    struct_pres: snapA.struct_pres != null
      ? lerp(snapA.struct_pres, snapB.struct_pres ?? snapA.struct_pres, t) : null,

    // ── Embeddings (lerp từng tọa độ) ────────────────────────────
    embeddings_2d: snapA.embeddings_2d.map((pA, i) => {
      const pB = snapB.embeddings_2d?.[i] ?? pA
      return [lerp(pA[0], pB[0], t), lerp(pA[1], pB[1], t)]
    }),

    // ── Predictions (discrete — giữ của snapB, không lerp class) ─
    node_predictions: snapB.node_predictions,

    // ── Confidence (lerp → điều tiết độ đậm màu) ─────────────────
    node_confidence: snapA.node_confidence?.map((cA, i) =>
      lerp(cA, snapB.node_confidence?.[i] ?? cA, t)
    ) ?? null,

    // ── Attention weights (GAT — lerp từng cạnh) ─────────────────
    attention_weights: snapA.attention_weights?.map((wA, i) =>
      lerp(wA, snapB.attention_weights?.[i] ?? wA, t)
    ) ?? null,

    // ── Link scores (Task 3 — lerp) ───────────────────────────────
    link_scores: snapA.link_scores?.map((sA, i) =>
      lerp(sA, snapB.link_scores?.[i] ?? sA, t)
    ) ?? null,

    // ── Community (Task 4) ────────────────────────────────────────
    community_ids:  snapB.community_ids,        // discrete
    bridge_nodes:   snapB.bridge_nodes ?? [],
    conductance:    snapA.conductance != null
      ? lerp(snapA.conductance, snapB.conductance ?? snapA.conductance, t) : null,

    // ── Edge proximity (Task 5) ───────────────────────────────────
    edge_proximity: snapA.edge_proximity?.map((pA, i) =>
      lerp(pA, snapB.edge_proximity?.[i] ?? pA, t)
    ) ?? null,

    // ── Generation (Task 6) ───────────────────────────────────────
    unique_pct: snapA.unique_pct != null
      ? lerp(snapA.unique_pct, snapB.unique_pct ?? snapA.unique_pct, t) : null,
    novel_pct:  snapA.novel_pct != null
      ? lerp(snapA.novel_pct,  snapB.novel_pct  ?? snapA.novel_pct,  t) : null,
    generated_graphs: snapB.generated_graphs,   // hiện graphs của epoch tiếp theo
    latent_samples: snapA.latent_samples?.map((zA, i) => {
      const zB = snapB.latent_samples?.[i] ?? zA
      return [lerp(zA[0], zB[0], t), lerp(zA[1], zB[1], t)]
    }) ?? null,

    _t: t, _rawT: rawT,   // debug
  }
}

// Màu node: fade qua gray khi đổi class (không nhảy ngay)
export function getNodeColor(predA, predB, confidence, t) {
  const COLORS = ['#E53935','#1E88E5','#43A047','#FB8C00','#8E24AA','#E91E63','#F9A825']
  const cA = COLORS[predA] ?? '#888'
  const cB = COLORS[predB] ?? '#888'
  const conf = Math.max(0.3, confidence ?? 1)
  if (predA === predB) {
    // Cùng class: lerp opacity (đậm dần theo confidence)
    return lerpColor('#555555', cB, conf)
  }
  // Khác class: fade through gray
  const GRAY = '#666666'
  if (t < 0.5) return lerpColor(cA, GRAY, t*2)       // A → gray
  else         return lerpColor(GRAY, cB, (t-0.5)*2) // gray → B
}

// Màu + độ dày cạnh GAT attention
export function getEdgeAppearance(wA, wB, t) {
  const w = lerp(wA ?? 0.5, wB ?? 0.5, t)
  return {
    color: lerpColor('#333333', '#1E88E5', w),
    width: 0.5 + w * 4.5,  // 0.5px → 5px
    opacity: 0.2 + w * 0.8,
  }
}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## NGUYÊN TẮC SỐ 2 — requestAnimationFrame @ 60fps (không dùng setInterval)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```js
// src/store/playerStore.js
import { create } from 'zustand'

const EPOCH_DURATION_MS = 800  // ms mỗi epoch ở tốc độ 1x

export const usePlayer = create((set, get) => ({
  currentEpochFloat: 0,   // ← FLOAT, không phải int
  isPlaying: false,
  speed: 1,               // 0.25 | 0.5 | 1 | 2 | 4
  snapshots: [],
  trainingDone: false,
  bestEpoch: null,

  _rafId: null,
  _lastTs: null,

  addSnapshot: s => set(st => ({ snapshots: [...st.snapshots, s] })),
  setDone: best => set({ trainingDone: true, bestEpoch: best }),

  seekTo: (epochFloat) => {
    get()._stop()
    set({ currentEpochFloat: epochFloat, isPlaying: false })
  },

  play: () => {
    const st = get()
    if (st.isPlaying) return
    if (st.currentEpochFloat >= st.snapshots.length - 1)
      set({ currentEpochFloat: 0 })
    set({ isPlaying: true, _lastTs: null })
    const rafId = requestAnimationFrame(get()._tick)
    set({ _rafId: rafId })
  },

  pause: () => {
    get()._stop()
    set({ isPlaying: false })
  },

  _stop: () => {
    const { _rafId } = get()
    if (_rafId) { cancelAnimationFrame(_rafId); set({ _rafId: null }) }
  },

  _tick: (ts) => {
    const st = get()
    if (!st.isPlaying) return

    if (st._lastTs !== null) {
      const delta   = ts - st._lastTs
      const advance = (delta / EPOCH_DURATION_MS) * st.speed
      const next    = st.currentEpochFloat + advance

      if (next >= st.snapshots.length - 1) {
        set({ currentEpochFloat: st.snapshots.length - 1, isPlaying: false })
        return
      }
      set({ currentEpochFloat: next })
    }
    set({ _lastTs: ts })
    const rafId = requestAnimationFrame(get()._tick)
    set({ _rafId: rafId })
  },

  stepForward: () => set(st => ({
    currentEpochFloat: Math.min(Math.floor(st.currentEpochFloat)+1, st.snapshots.length-1)
  })),
  stepBack: () => set(st => ({
    currentEpochFloat: Math.max(Math.floor(st.currentEpochFloat)-1, 0)
  })),
  setSpeed: spd => set({ speed: spd }),
}))
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## NGUYÊN TẮC SỐ 3 — NÚT PLAYER + THANH TUA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```jsx
// src/components/Player.jsx
import { useRef } from 'react'
import { usePlayer } from '../store/playerStore'

export default function Player() {
  const { snapshots, currentEpochFloat, isPlaying, speed,
          trainingDone, bestEpoch,
          play, pause, seekTo, stepForward, stepBack, setSpeed } = usePlayer()

  const total   = snapshots.length
  const locked  = !trainingDone || total < 2
  const epochI  = Math.floor(currentEpochFloat)
  const barRef  = useRef(null)

  // Tính vị trí từ mouse event
  const getEpoch = e => {
    const rect  = barRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX-rect.left)/rect.width))
    return ratio * (total-1)
  }

  const onBarDown = e => {
    if (locked) return
    pause()
    seekTo(getEpoch(e))
    const move = ev => seekTo(getEpoch(ev))
    const up   = () => { window.removeEventListener('mousemove',move); window.removeEventListener('mouseup',up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const pct     = total > 1 ? (currentEpochFloat/(total-1))*100 : 0
  const bestPct = bestEpoch != null && total > 1 ? (bestEpoch/(total-1))*100 : null

  return (
    <div className="bg-[#080f1e] border-t border-[#1a2540] px-5 py-3 space-y-2.5">

      {/* ── Thanh tua ── */}
      <div>
        <div ref={barRef} onMouseDown={onBarDown}
          className={`relative h-1.5 rounded-full group
            ${locked ? 'bg-[#0f1a2e] cursor-not-allowed' : 'bg-[#1e2d4a] cursor-pointer'}`}
        >
          {/* Fill xanh */}
          <div className="absolute h-full bg-blue-500 rounded-full pointer-events-none"
               style={{ width:`${pct}%` }} />
          {/* Best epoch marker */}
          {bestPct != null && (
            <div className="absolute top-0 h-full w-px bg-yellow-400 opacity-70 pointer-events-none"
                 style={{ left:`${bestPct}%` }} />
          )}
          {/* Playhead dot */}
          {!locked && (
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5
                         rounded-full bg-white shadow-[0_0_10px_#3b82f6]
                         opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              style={{ left:`${pct}%` }}
            />
          )}
        </div>
        <div className="flex justify-between mt-1 text-[10px] font-mono text-[#2d4060]">
          <span>0</span>
          <span className="text-[#f59e0b]">
            {bestEpoch != null ? `★ best: ${bestEpoch}` : ''}
          </span>
          <span>{total > 0 ? total-1 : '—'}</span>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="flex items-center gap-1.5">
        {/* Nút điều hướng */}
        {[
          ['⏮', () => seekTo(0),           'Về đầu'],
          ['⏪', stepBack,                  'Lui 1'],
          [isPlaying ? '⏸' : '▶', isPlaying ? pause : play, isPlaying ? 'Tạm dừng' : 'Phát'],
          ['⏩', stepForward,               'Tiến 1'],
          ['⏭', () => seekTo(total-1),     'Về cuối'],
        ].map(([icon, handler, title]) => (
          <button key={title} onClick={handler} title={title} disabled={locked}
            className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm
              transition-all active:scale-90 font-mono
              ${locked
                ? 'bg-[#0d1626] text-[#1e2d4a] cursor-not-allowed'
                : 'bg-[#111f36] text-slate-300 hover:bg-[#1a2d4d] hover:text-white'}`}
          >{icon}</button>
        ))}

        <div className="w-px h-5 bg-[#1a2540] mx-1" />

        {/* Tốc độ */}
        {[0.25, 0.5, 1, 2, 4].map(v => (
          <button key={v} onClick={() => setSpeed(v)}
            className={`px-2 py-1 rounded text-xs font-mono transition-colors
              ${speed===v ? 'bg-blue-600 text-white' : 'bg-[#111f36] text-[#4a6080] hover:text-white'}`}
          >{v}×</button>
        ))}

        {/* Epoch counter */}
        <div className="ml-auto font-mono">
          {locked ? (
            <span className="text-[#2d4060] text-sm">— / —</span>
          ) : (
            <span>
              <span className="text-white text-lg font-bold">{epochI}</span>
              <span className="text-[#2d4060] text-sm"> / {total-1}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## TASK 1: NODE CLASSIFICATION — Animation chi tiết
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Dataset: Cora (2708 nodes, 5429 edges, 7 classes)

### Topology View A — Node màu đổi LIỀN MẠCh

```jsx
// Topology node canvas render — dùng cho react-force-graph-2d
// nodeCanvasObject prop

const drawTask1Node = (node, ctx, globalScale, snap, prevSnap, t, model) => {
  const r = Math.max(3, Math.sqrt(node.degree||1) * 2.5)

  // Lấy prediction epoch trước và hiện tại
  const predA  = prevSnap?.node_predictions?.[node.id] ?? snap.node_predictions[node.id]
  const predB  = snap.node_predictions[node.id]
  const conf   = snap.node_confidence?.[node.id] ?? 1

  // Màu interpolated (fade qua gray khi đổi class)
  const color  = getNodeColor(predA, predB, conf, t)
  ctx.fillStyle = color

  // Vẽ node
  ctx.beginPath()
  ctx.arc(node.x, node.y, r, 0, Math.PI*2)
  ctx.fill()

  // ── GCN: "sóng lan tỏa" từ labeled nodes ra boundary ──────────
  // Epoch 0-10: vòng sáng nếu node vừa được "tiếp cận" lần đầu
  if (model === 'GCN' && snap.epoch < 20 && node._hops != null) {
    const waveProgress = Math.max(0, 1 - Math.abs(snap.epoch - node._hops*3)/5)
    if (waveProgress > 0.1) {
      ctx.beginPath()
      ctx.arc(node.x, node.y, r + waveProgress*6, 0, Math.PI*2)
      ctx.strokeStyle = `rgba(255,255,255,${waveProgress*0.4})`
      ctx.lineWidth   = 1.5
      ctx.stroke()
    }
  }

  // ── GAT: glow trên cạnh attention cao (vẽ ở đây qua node center) ──
  if (model === 'GAT' && node._maxAttn > 0.75) {
    ctx.shadowColor = '#3b82f6'
    ctx.shadowBlur  = 8 * node._maxAttn
    ctx.beginPath()
    ctx.arc(node.x, node.y, r, 0, Math.PI*2)
    ctx.fill()
    ctx.shadowBlur = 0
  }

  // ── SAGE: jitter nhẹ giảm dần theo epoch ────────────────────────
  // Jitter đã được apply vào node.x, node.y trước khi gọi hàm này

  // Viền trắng cho train set nodes
  if (node.inTrainSet) {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.lineWidth   = 1.2
    ctx.beginPath()
    ctx.arc(node.x, node.y, r, 0, Math.PI*2)
    ctx.stroke()
  }

  // Highlight selected
  if (node.id === selectedNodeId) {
    ctx.strokeStyle = '#fbbf24'
    ctx.lineWidth   = 2.5
    ctx.beginPath()
    ctx.arc(node.x, node.y, r+3, 0, Math.PI*2)
    ctx.stroke()
  }
}
```

### Cạnh Task 1 — GCN vs GAT vs SAGE

```js
// GCN: tất cả cạnh đồng đều, màu mờ
// linkColor cho GCN:
const gcnEdgeColor = () => 'rgba(148,163,184,0.2)'
const gcnEdgeWidth = () => 0.6

// GAT: cạnh đậm nhạt theo attention weight (lerp mượt)
// linkColor cho GAT:
const gatEdgeColor = (link) => {
  const i  = link._edgeIndex
  const wA = prevSnap?.attention_weights?.[i] ?? 0.5
  const wB = currSnap?.attention_weights?.[i] ?? wA
  const w  = lerp(wA, wB, t)
  return lerpColor('#1a1a2e', '#1E88E5', w) + Math.round((0.15+w*0.85)*255).toString(16)
}
const gatEdgeWidth = (link) => {
  const i  = link._edgeIndex
  const wA = prevSnap?.attention_weights?.[i] ?? 0.5
  const wB = currSnap?.attention_weights?.[i] ?? wA
  return 0.3 + lerp(wA, wB, t) * 4.5
}

// SAGE: đồng đều như GCN nhưng hơi sáng hơn (muted)
const sageEdgeColor = () => 'rgba(180,140,80,0.15)'
const sageEdgeWidth = () => 0.7
```

### Embedding Space B — 2708 điểm di chuyển

```jsx
// Dùng Plotly.react() với transition để di chuyển mượt
// KHÔNG dùng Plotly.newPlot mỗi lần update

useEffect(() => {
  const snap = getCurrentInterpolatedSnapshot()
  if (!snap || !divRef.current) return

  const x = snap.embeddings_2d.map(p=>p[0])
  const y = snap.embeddings_2d.map(p=>p[1])
  const colors = snap.node_predictions.map(c => CLASS_COLORS[c]??'#888')

  if (!plotInited.current) {
    Plotly.newPlot(divRef.current, [{
      type:'scatter', mode:'markers', x, y,
      marker:{ color:colors, size:5, opacity:0.8 }
    }], {
      paper_bgcolor:'transparent', plot_bgcolor:'#050d1a',
      margin:{l:20,r:10,t:10,b:20},
      xaxis:{showgrid:false,zeroline:false,showticklabels:false},
      yaxis:{showgrid:false,zeroline:false,showticklabels:false},
      uirevision:'locked',   // giữ zoom/pan khi data update
    }, {displayModeBar:false, responsive:true})
    plotInited.current = true
  } else {
    // Animate mượt — điểm DI CHUYỂN đến vị trí mới
    Plotly.animate(divRef.current,
      { data:[{ x, y, marker:{color:colors,size:5,opacity:0.8} }] },
      { transition:{ duration:60, easing:'linear' }, frame:{duration:60} }
    )
  }
}, [currentEpochFloat])  // gọi mỗi RAF frame
```

### Metrics Chart C — đường cong "tự mọc ra"

```jsx
// Recharts: slice data đến currentEpoch, thêm điểm interpolated ở cuối
// animationDuration={0} trên tất cả Line để không giật

const chartData = useMemo(() => {
  const i  = Math.floor(currentEpochFloat)
  const t  = currentEpochFloat - i
  const et = easeInOutCubic(t)

  const rows = snapshots.slice(0, i+1).map(s => ({
    ep: s.epoch, tl: s.train_loss, vl: s.val_loss,
    ta: s.train_acc, va: s.val_acc,
  }))
  // Điểm interpolated ở đầu đường
  if (t > 0.01 && snapshots[i+1]) {
    const A = snapshots[i], B = snapshots[i+1]
    rows.push({
      ep: A.epoch + t,
      tl: lerp(A.train_loss, B.train_loss, et),
      vl: lerp(A.val_loss,   B.val_loss,   et),
      ta: lerp(A.train_acc,  B.train_acc,  et),
      va: lerp(A.val_acc,    B.val_acc,    et),
    })
  }
  return rows
}, [snapshots, currentEpochFloat])

// SAGE: thêm moving average overlay (window=5) trên val_acc
// Vẽ bằng Line thứ 5 với dữ liệu pre-smoothed
```

### Toggle Error Mode — Prediction ↔ Error

```jsx
// Khi switch sang Error Mode:
// node đúng → lerp màu hiện tại → #22c55e (trong 300ms bằng useTransition state)
// node sai  → lerp màu hiện tại → #ef4444

const getErrorModeColor = (node, snap, t_transition) => {
  const pred   = snap.node_predictions[node.id]
  const truth  = node.groundTruth
  const isRight = pred === truth
  const targetColor = isRight ? '#22c55e' : '#ef4444'
  const baseColor   = CLASS_COLORS[pred] ?? '#888'
  return lerpColor(baseColor, targetColor, t_transition)
}
// t_transition: 0→1 trong 300ms khi user click toggle
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## TASK 2: GRAPH CLASSIFICATION — Mini-Grid Animation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Dataset: 50 mini graphs (25 class-0 + 25 class-1)

### Topology View A — 5×10 GRID của mini graphs

```jsx
// MỖI Ô là ForceGraph2D nhỏ 120×120px
// Viền ô thay đổi màu mượt mà theo epoch

const CellBorderColor = ({ graphId, snapA, snapB, t }) => {
  const predA   = snapA?.graph_predictions?.[graphId] ?? 0
  const predB   = snapB?.graph_predictions?.[graphId] ?? predA
  const confA   = snapA?.graph_confidence?.[graphId]  ?? 0.5
  const confB   = snapB?.graph_confidence?.[graphId]  ?? confA
  const truth   = graphs[graphId].label
  const conf    = lerp(confA, confB, t)

  // Màu viền
  const isRight = predB === truth
  const baseColor = isRight ? '#22c55e' : '#ef4444'
  const dimColor  = '#334155'

  // Fade từ dim → đúng màu khi model tự tin hơn
  return lerpColor(dimColor, baseColor, Math.max(0, conf*2-0.3))
}

// Độ dày viền = confidence (1px → 5px)
const borderWidth = conf => `${1 + conf*4}px`

// ANIMATION: khi cell đổi từ sai → đúng:
// 1. Scale up 1.0 → 1.05 → 1.0 (bounce nhẹ)
// 2. Màu viền fade từ đỏ → xanh qua 300ms
// Detect: predA !== truth && predB === truth → trigger bounce animation
```

### Embedding Space B — Graph-level (mỗi điểm = 1 đồ thị)

```jsx
// 50 điểm (không phải 2708 như Task 1)
// Hover điểm → mini-thumbnail của đồ thị đó xuất hiện

// Di chuyển điểm mượt như Task 1 — dùng Plotly.animate()
// Màu điểm = predicted class của graph đó tại epoch hiện tại
// Marker size = confidence * 10 + 5 (tự tin → to hơn)
```

### Readout Monitor — heatmap node contribution

```jsx
// Khi click vào 1 ô trong grid → expand modal với full graph
// Node màu trong expanded: opacity ∝ contribution score của node đó
// Theo epoch: contribution score lerp → node "quan trọng" sáng dần
// Với phân tử: vòng benzene sáng lên theo epoch (đặc trưng)

const nodeOpacity = (contribution, t) =>
  lerp(prevContribution, contribution, t)
// contribution từ backend: READOUT output của từng node
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## TASK 3: LINK PREDICTION — Edge Color Animation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Dataset: Cora với 20% cạnh ẩn

### Topology View A — Link Score Overlay

```jsx
// Màu cạnh theo link score (lerp mượt giữa epoch):
const getLinkColor = (edgeIdx, snapA, snapB, t) => {
  const sA = snapA?.link_scores?.[edgeIdx] ?? 0.5
  const sB = snapB?.link_scores?.[edgeIdx] ?? sA
  const s  = lerp(sA, sB, easeInOutCubic(t))

  if (s > 0.65)      return lerpColor('#1a0000', '#ef4444', (s-0.65)/0.35)  // vàng → đỏ
  else if (s > 0.35) return lerpColor('#1a1400', '#f59e0b', (s-0.35)/0.30)  // gray → vàng
  else               return `rgba(100,100,100,${0.05 + s*0.4})`             // mờ dần
}
const getLinkWidth = (edgeIdx, snapA, snapB, t) => {
  const s = lerp(snapA?.link_scores?.[edgeIdx]??0.5, snapB?.link_scores?.[edgeIdx]??0.5, t)
  return 0.3 + s * 3.5
}

// Cạnh đứt nét "tương lai" — animated dash chạy
// Vẽ bằng linkCanvasObject:
const drawFutureLink = (link, ctx) => {
  if (!link._isFuture) return
  ctx.setLineDash([5, 5])
  ctx.lineDashOffset = -(performance.now() / 60) % 10  // chạy mượt
  ctx.strokeStyle    = `rgba(249,115,22,${link._score * 0.8})`
  ctx.lineWidth      = 1.5
  ctx.beginPath()
  ctx.moveTo(link.source.x, link.source.y)
  ctx.lineTo(link.target.x, link.target.y)
  ctx.stroke()
  ctx.setLineDash([])
}

// Triangle closure highlight (GAT):
// Khi A-B-C có attention cao → tam giác A-B-C sáng vàng nhạt
// Vẽ bằng canvas fillTriangle với opacity lerp theo epoch
```

### Embedding Space B — Pair Proximity

```jsx
// Mỗi điểm = điểm giữa của cặp node (u,v)
// x = (embed_u.x + embed_v.x) / 2
// y = (embed_u.y + embed_v.y) / 2
// Màu: xanh = positive, đỏ = negative
// Di chuyển mượt: các cặp positive co lại, negative đẩy xa nhau
// Animation: lerp vị trí trung điểm theo epoch
```

### ROC/AUC Monitor (thay Metrics Chart)

```jsx
// Hiện số AUC lớn góc trái: "AUC: 0.87"
// Số lerp mượt theo epoch
// Đường ROC curve: thêm từng điểm theo epoch
// Animation: đường cong "mọc ra" về phía góc trên-trái
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## TASK 4: COMMUNITY DETECTION — Đồ thị tự phân đảo
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Dataset: Synthetic community graph (4 cộng đồng, 120 nodes)

### Topology View A — Force layout tách đảo ĐỘNG

```jsx
// Custom D3 force: kéo node về centroid của community
// Sức kéo tăng dần theo epoch

const useCommunityForce = (graphRef, communityIds, epochProgress) => {
  useEffect(() => {
    if (!graphRef.current) return
    const sim = graphRef.current.d3Force

    // Strength tăng từ 0 → 0.7 theo epoch (eased)
    const strength = easeInOutCubic(Math.min(1, epochProgress * 1.5)) * 0.7

    // Force kéo về centroid của cộng đồng
    sim('cluster', alpha => {
      const centroids = {}
      nodes.forEach(n => {
        const cid = communityIds[n.id] ?? 0
        if (!centroids[cid]) centroids[cid] = {x:0,y:0,count:0}
        centroids[cid].x += n.x; centroids[cid].y += n.y; centroids[cid].count++
      })
      Object.values(centroids).forEach(c => { c.x/=c.count; c.y/=c.count })

      nodes.forEach(n => {
        const cid = communityIds[n.id] ?? 0
        const cx  = centroids[cid]?.x ?? 0
        const cy  = centroids[cid]?.y ?? 0
        n.vx     += (cx - n.x) * strength * alpha
        n.vy     += (cy - n.y) * strength * alpha
      })
    })

    // Repulsion giữa các node khác community
    sim('interCommunity', alpha => {
      nodes.forEach((n1, i) => {
        nodes.slice(i+1).forEach(n2 => {
          if (communityIds[n1.id] === communityIds[n2.id]) return
          const dx = n2.x - n1.x, dy = n2.y - n1.y
          const dist = Math.sqrt(dx*dx + dy*dy) || 1
          const force = (strength * 100) / (dist * dist)
          n1.vx -= force * dx; n1.vy -= force * dy
          n2.vx += force * dx; n2.vy += force * dy
        })
      })
    })

    // Restart simulation với alpha nhỏ để di chuyển mượt
    graphRef.current.d3ReheatSimulation(0.05)
  }, [communityIds, epochProgress])  // Re-apply khi epoch thay đổi
}

// Màu node: lerp khi đổi community ID
// Node bridge (bridge_nodes từ backend): viền trắng 3px + pulse
const drawBridgeNode = (node, ctx) => {
  if (!snap.bridge_nodes.includes(node.id)) return
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 400)
  ctx.strokeStyle = `rgba(255,255,255,${0.4 + pulse*0.6})`
  ctx.lineWidth   = 3
  ctx.beginPath()
  ctx.arc(node.x, node.y, nodeRadius+4, 0, Math.PI*2)
  ctx.stroke()
}

// Cạnh: intra-community (dày, màu) vs inter-community (mỏng, xám)
const drawCommunityEdge = (link, ctx, snap, t) => {
  const cidA = snap.community_ids[link.source.id]
  const cidB = snap.community_ids[link.target.id]
  if (cidA === cidB) {
    // Intra-community: dày, màu community, lerp từ mỏng → dày theo epoch
    const epochProgress = snap.epoch / totalEpochs
    ctx.strokeStyle = COMMUNITY_COLORS[cidA]
    ctx.lineWidth   = lerp(0.5, 2.5, easeInOutCubic(epochProgress))
    ctx.globalAlpha = lerp(0.2, 0.8, easeInOutCubic(epochProgress))
  } else {
    // Inter-community: mỏng, xám, dần biến mất
    const epochProgress = snap.epoch / totalEpochs
    ctx.strokeStyle = '#334155'
    ctx.lineWidth   = 0.5
    ctx.globalAlpha = lerp(0.4, 0.08, easeInOutCubic(epochProgress))
  }
  ctx.beginPath()
  ctx.moveTo(link.source.x, link.source.y)
  ctx.lineTo(link.target.x, link.target.y)
  ctx.stroke()
  ctx.globalAlpha = 1
}
```

### Modularity Q Badge (thay Accuracy)

```jsx
// Hiện số Q lớn, màu gradient xanh→tím
// Q lerp mượt: "Q = 0.427"
const qColor = q => lerpColor('#1e88e5', '#8e24aa', q)
// Badge pulse nhẹ khi Q đạt đỉnh
```

### Dendrogram + Slider K

```jsx
// Dendrogram: vẽ SVG cây phân cấp
// Khi kéo slider K → recolor ngay (không cần animation, dùng precomputed clusters)
// K cộng đồng precomputed từ backend với K = 2..10
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## TASK 5: GRAPH EMBEDDING — Embedding là View chính
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Embedding Space B (60% diện tích — VIEW CHÍNH)

```jsx
// Trajectory mode: vẽ đường mờ sau mỗi điểm (quỹ đạo qua 5 epoch gần nhất)
// Lưu 5 embedding gần nhất vào trailBuffer

const trailBuffer = useRef([])  // [{embeddings_2d}, ...]

useEffect(() => {
  const current = getCurrentInterpolatedSnapshot()
  if (!current) return
  trailBuffer.current = [
    ...trailBuffer.current.slice(-4),
    current.embeddings_2d
  ]
}, [currentEpochFloat])

// Vẽ trail: mỗi điểm trong lịch sử vẽ với opacity giảm dần
// t=0 (xa nhất): opacity 0.05
// t=4 (gần nhất): opacity 0.4
const drawTrails = (traceData) => {
  traceData.forEach((hist, histIdx) => {
    if (histIdx >= trailBuffer.current.length) return
    const alpha = (histIdx+1) / (trailBuffer.current.length+1) * 0.4
    Plotly.addTraces(div, [{
      type:'scatter', mode:'markers',
      x: trailBuffer.current[histIdx].map(p=>p[0]),
      y: trailBuffer.current[histIdx].map(p=>p[1]),
      marker:{ color: colors, size:3, opacity:alpha },
      hoverinfo:'skip',
    }])
  })
}

// Toggle PCA ↔ t-SNE: fade transition giữa 2 phép chiếu
// Khi switch: animate điểm từ PCA positions → t-SNE positions
```

### Topology View A — Proximity Heat trên cạnh

```jsx
// Cạnh màu theo khoảng cách trong embedding space
// Gần nhau (proximity cao) → XANH đậm
// Xa nhau (proximity thấp) → ĐỎ
// Lerp mượt giữa epoch

const getProximityEdgeColor = (edgeIdx, snapA, snapB, t) => {
  const pA = snapA?.edge_proximity?.[edgeIdx] ?? 0.5
  const pB = snapB?.edge_proximity?.[edgeIdx] ?? pA
  const p  = lerp(pA, pB, easeInOutCubic(t))
  if (p > 0.5) return lerpColor('#1e3a5f', '#3b82f6', (p-0.5)*2)   // mờ xanh → xanh đậm
  else         return lerpColor('#ef4444', '#7f1d1d', (0.5-p)*2)    // đỏ sáng → đỏ mờ
}

// Anistropic warning: khi PC1 > 80% variance → vẽ vector chính
// Direction indicator arrow trên embedding view
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## TASK 6: GRAPH GENERATION — Đồ thị "mọc lên"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Generation Preview (VIEW CHÍNH — 2×3 grid)

```jsx
// 6 ô, mỗi ô là một generated graph
// Khi epoch thay đổi → đồ thị mới xuất hiện với animation "mọc lên"

const GraphCell = ({ graphData, valid, transition_t }) => {
  // transition_t: 0→1 khi ô này nhận graph mới

  return (
    <div className="relative rounded-lg overflow-hidden bg-[#050d1a] border border-[#1a2540]"
         style={{ transform: `scale(${0.85 + transition_t*0.15})`,
                  opacity:   transition_t }}>
      {/* Mini graph */}
      <ForceGraph2D
        graphData={buildStaggeredGraph(graphData, transition_t)}
        // Node và edge xuất hiện theo thứ tự (stagger)
        // node.opacity = transition_t > node._appearAt ? 1 : 0
        // edge.opacity = transition_t > edge._appearAt ? lerp(0,1,(...)) : 0
      />
      {/* Valid badge */}
      <div className={`absolute top-1.5 right-1.5 text-xs px-1.5 py-0.5 rounded font-mono
        ${valid ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
        {valid ? '✓ Valid' : '✗ Invalid'}
      </div>
    </div>
  )
}

// Staggered node/edge appearance:
// Tính _appearAt cho mỗi node và edge:
//   node[i]._appearAt = i / (totalNodes + totalEdges)
//   edge[j]._appearAt = (totalNodes + j) / (totalNodes + totalEdges)
// Khi transition_t > _appearAt → fade in (opacity: lerp(0,1,(t-at)/0.1))
const buildStaggeredGraph = (graph, t) => ({
  nodes: graph.nodes.map((n,i) => ({
    ...n,
    _opacity: Math.min(1, Math.max(0, (t - n._appearAt)/0.08))
  })),
  links: graph.links.map((l,j) => ({
    ...l,
    _opacity: Math.min(1, Math.max(0, (t - l._appearAt)/0.08))
  })),
})
```

### Latent Space View (thay Embedding Space)

```jsx
// Điểm training: xám nhạt cố định
// Điểm sampled mới mỗi epoch: màu, nhấp nháy khi xuất hiện
// Animation: điểm sampled xuất hiện với scale 0 → 1 + pulse
// Di chuyển mượt theo epoch: lerp latent_samples positions

// Posterior collapse warning (đặc trưng VAE):
// Khi kl_div < 0.01: hiện overlay đỏ nhấp nháy
// "⚠ Posterior Collapse — KL = 0.003"
const collapseWarning = kl => kl < 0.01 && (
  <div className="absolute inset-0 bg-red-950/40 flex items-center justify-center
                  animate-pulse border border-red-500 rounded-xl">
    <span className="text-red-400 font-mono text-sm">⚠ Posterior Collapse — KL→0</span>
  </div>
)
```

### Validity Monitor Badges

```jsx
// 3 thanh tiến trình: Valid% | Unique% | Novel%
// Số lerp mượt, thanh fill animate
const ValidityBar = ({ label, value, color }) => (
  <div className="space-y-1">
    <div className="flex justify-between text-xs font-mono">
      <span className="text-slate-400">{label}</span>
      <span style={{color}}>{(value*100).toFixed(1)}%</span>
    </div>
    <div className="h-1.5 bg-[#0d1626] rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-none"
           style={{ width:`${value*100}%`, backgroundColor:color }} />
    </div>
  </div>
)
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## ĐẶC TRƯNG ANIMATION THEO MÔ HÌNH (áp dụng cho TẤT CẢ 6 task)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 🔵 GCN — Lan tỏa đồng đều, mượt mà

```js
// 1. Tất cả cạnh cùng màu/độ dày (không có attention)
// 2. Sóng lan tỏa màu từ train nodes ra ngoài (epoch 0-10):
//    - Backend tính _hops (khoảng cách đến labeled node gần nhất)
//    - Epoch e: node với _hops=k sáng lên khi e ≈ k*3
// 3. Loss curve MỰT NHẤT trong 3 mô hình (không zig-zag)
//    → Thêm smoothing lên recharts lineChart nếu cần (không cần, đã smooth)
// 4. Embedding cụm TRÒN đều (không có đuôi, không irregular)
// 5. Hub node (bậc cao) dao động màu lâu nhất → highlight khi epoch < 40
//    hub_node_uncertainty = 1 / (1 + confidence)
//    → node bậc cao opacity thấp hơn ở epoch đầu
```

### 🟢 GAT — Attention Map, hội tụ nhanh

```js
// 1. Cạnh đậm-nhạt theo attention weight (getEdgeAppearance đã define trên)
// 2. Attention Head Selector UI:
//    [Avg] [H1] [H2] [H3] [H4] → switch → re-render edge ngay lập tức
//    Khi switch: fade cạnh qua gray rồi về màu mới (300ms)
// 3. Pulse glow trên cạnh attention > 0.75:
//    ctx.shadowColor = '#3b82f6'
//    ctx.shadowBlur  = 8 + 4*sin(time/500)  // nhịp thở
// 4. Hội tụ sớm hơn GCN 1-2 epoch → metrics chart thể hiện rõ
//    → GAT accuracy tăng dốc hơn ngay từ epoch 3-5
// 5. Embedding cụm hình dạng ĐA DẠNG (không tròn đều như GCN)
//    → đặc trưng attention tạo embedding rich hơn
// 6. Click node → Node Info Panel hiện top-5 neighbors theo attention weight
//    Thanh bar cho từng neighbor: width ∝ attention weight
```

### 🟠 GraphSAGE — Dao động, inductive learning

```js
// 1. JITTER nhẹ trên vị trí node (giảm dần về 0 khi converge):
//    jitter_scale = jitterMax * (1 - epochProgress)
//    node.displayX = node.fx + sin(time*freq + nodeId*7.3) * jitter_scale
//    node.displayY = node.fy + cos(time*freq*1.1 + nodeId*3.7) * jitter_scale
//    → Nhìn như node "rung lắc" nhẹ ở đầu, ổn định dần cuối
// 2. Loss curve ZIG-ZAG hơn GCN (noise cao do sampling)
//    → Thêm MOVING AVERAGE overlay (window=5) lên chart: đường đậm hơn
//    → Label: "— Val Acc (5-epoch avg)"
// 3. Embedding cụm có ĐUÔI KÉO DÀI (đặc trưng SAGE CONCAT layer)
// 4. Nút "+ Thêm Node Mới" (inductive demo):
//    → Popup nhập features (hoặc "Node ngẫu nhiên")
//    → Node mới xuất hiện với animation spin-in + pulse 3 lần
//    → Predicted class hiện ngay (không cần retrain)
//    → POST /api/inductive-predict {features, task, epoch}
// 5. "⚠ Variance cao — bình thường với SAGE" badge khi rolling_var > 0.01
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## BACKEND: FORMAT SNAPSHOT CHO TỪNG TASK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```python
# Tất cả task đều có base fields:
base = {
    "epoch": int,
    "train_loss": float, "val_loss": float,
    "train_acc": float, "val_acc": float,
    "embeddings_2d": [[float,float], ...],   # PCA 2D của hidden layer
    "node_predictions": [int, ...],           # predicted class, shape [N]
    "node_confidence": [float, ...],          # max(softmax), shape [N]
}

# Task 1 — Node Classification
task1 = {**base,
    # GAT only:
    "attention_weights": [float, ...],        # per-edge mean attention, shape [E]
    # GCN only (precomputed):
    "node_hops": [int, ...],                  # min hops to any labeled node, shape [N]
}

# Task 2 — Graph Classification
task2 = {**base,
    "graph_predictions":  [int,   ...],       # per-graph predicted class, shape [G]
    "graph_confidence":   [float, ...],       # per-graph confidence, shape [G]
    "node_contributions": [[float,...], ...], # per-graph, per-node contribution, shape [G][Ni]
    # embeddings_2d ở đây là graph-level embeddings (không phải node-level)
}

# Task 3 — Link Prediction
task3 = {**base,
    "link_scores": [float, ...],              # predicted link score, shape [E_test]
    "auc": float,                             # AUC-ROC score
    "ap":  float,                             # Average Precision
    "future_links": [[int,int], ...],         # top-K predicted future edges
}

# Task 4 — Community Detection
task4 = {**base,
    "community_ids":   [int, ...],            # community assignment per node, shape [N]
    "modularity":      float,                 # Q score
    "conductance":     float,
    "bridge_nodes":    [int, ...],            # node IDs that bridge communities
    # train_acc, val_acc → bỏ, dùng modularity thay thế
}

# Task 5 — Graph Embedding
task5 = {**base,
    "edge_proximity":     [float, ...],       # per-edge embedding proximity, shape [E]
    "struct_pres":        float,              # structure preservation %
    "pca_variance":       [float, float],     # [PC1_var%, PC2_var%]
    "reconstruction_loss": float,
}

# Task 6 — Graph Generation
task6 = {
    "epoch": int,
    "train_loss": float, "reconstruction_loss": float, "kl_div": float,
    "valid_pct": float, "unique_pct": float, "novel_pct": float,
    "latent_samples": [[float,float], ...],   # 6 sampled z points (PCA 2D), shape [6,2]
    "generated_graphs": [                     # 6 generated graphs
        {"nodes": int, "edges": int, "valid": bool,
         "adjacency": [[int,int], ...]},      # edge list
    ],
    "latent_training": [[float,float], ...],  # training graphs in latent space (PCA 2D)
}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## FIX 7 LỖI ANIMATION THƯỜNG GẶP NHẤT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```
LỖI 1: Node nhảy màu đột ngột
FIX:   Dùng getNodeColor() fade-through-gray — code đã có ở trên

LỖI 2: Node nhảy vị trí mỗi epoch (layout reset)
FIX:   Sau onEngineStop → set n.fx=n.x, n.fy=n.y cho TẤT CẢ node
       Chỉ unpin khi user kéo thủ công

LỖI 3: Plotly zoom/pan reset mỗi lần update
FIX:   uirevision:'lock' trong layout + dùng Plotly.react() không dùng newPlot()

LỖI 4: Recharts giật khi thêm điểm
FIX:   animationDuration={0} trên TOÀN BỘ <Line> components
       Recharts tự giật khi animation bật

LỖI 5: setInterval bị throttle khi tab không active
FIX:   Dùng requestAnimationFrame + delta time như EpochPlayer code trên

LỖI 6: Animation quá chậm với 2708 nodes
FIX:   Precompute colorCache[epoch][nodeId] = color cho 100 epoch trước
       Trong render: O(1) lookup thay vì compute
       const colorCache = useMemo(() =>
         snapshots.map(s => s.node_predictions.map((p,i) =>
           getNodeColor(s.node_predictions[i], s.node_predictions[i], s.node_confidence[i], 1)
         )), [snapshots])

LỖI 7: Community Detection force layout "giật" khi epoch thay đổi
FIX:   Gọi d3ReheatSimulation(0.05) với alpha nhỏ (không phải 1.0)
       Để layout từ từ điều chỉnh, không reset toàn bộ
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## THỨ TỰ BUILD (làm đúng thứ tự để animation đúng ngay từ đầu)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. src/engine/interpolate.js        ← lerp + getNodeColor + getEdgeAppearance
2. src/store/playerStore.js         ← currentEpochFloat (float!) + RAF playback
3. src/components/Player.jsx        ← controls + timeline scrubber
4. src/components/Views/Topology.jsx ← react-force-graph-2d + canvas draw
5. src/components/Views/Embedding.jsx ← Plotly.animate() smooth
6. src/components/Views/Metrics.jsx  ← Recharts animationDuration=0
7. Backend Task 1 snapshot format + GCN/GAT/SAGE models
8. Wire frontend ↔ WebSocket → test animation Task 1 hoàn chỉnh
9. Task 2 (mini-grid + graph-level embedding)
10. Task 3 (link score overlay + dashed future links)
11. Task 4 (community force layout + bridge nodes)
12. Task 5 (embedding as primary view + trajectory trails)
13. Task 6 (staggered node/edge appearance + latent space)
14. Model behaviors: GCN wave, GAT attention pulse, SAGE jitter

===END===
