import { useMemo, useRef, useEffect, useCallback, useState } from 'react'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import LazyPlot from '../primitives/LazyPlot'
import { CLASS_COLORS, getClassColor } from '../../utils/colors'
import { easeInOutCubic, interpolateSnapshots } from '../../engine/interpolate'

/**
 * Tính toán dải tọa độ và độ nén linh hoạt.
 */
function getSpreadStats(points = []) {
  if (!points.length) {
    return { xRange: [-3, 3], yRange: [-3, 3], compactness: 1 }
  }

  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  
  points.forEach(([x, y]) => {
    if (Number.isFinite(x)) { minX = Math.min(minX, x); maxX = Math.max(maxX, x) }
    if (Number.isFinite(y)) { minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
  })

  if (!Number.isFinite(minX)) return { xRange: [-3, 3], yRange: [-3, 3], compactness: 1 }

  const spanX = Math.max(maxX - minX, 0.5)
  const spanY = Math.max(maxY - minY, 0.5)
  
  // Ép tỉ lệ 1:1 và căn giữa dữ liệu thực tế
  const maxSpan = Math.max(spanX, spanY)
  const padding = maxSpan * 0.25 // Thêm lề xung quanh cho thoáng

  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  const compactness = Math.max(0.4, Math.min(1.3, 4 / maxSpan))

  return { 
    xRange: [centerX - maxSpan/2 - padding, centerX + maxSpan/2 + padding], 
    yRange: [centerY - maxSpan/2 - padding, centerY + maxSpan/2 + padding], 
    compactness 
  }
}

/* ─── Mini-Graph Popup for Task 2 ─────────────────────────────────────────── */
function MiniGraphPopup({ graph, hoveredGraphId, currSnap, position }) {
  if (!graph || !position) return null
  const { nodes, links } = graph
  const size = 100
  const r = 35
  const cx = 50
  const cy = 50

  const nodePos = {}
  nodes.forEach((node, i) => {
    const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2
    nodePos[node.id] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  })

  return (
    <div
      className="fixed z-[9999] pointer-events-none"
      style={{ left: position.x + 16, top: position.y - 60 }}
    >
      <div className="bg-slate-900/95 backdrop-blur-md rounded-xl border border-slate-600/60 shadow-2xl shadow-black/50 p-2 w-[160px]">
        <svg width="100" height="100" viewBox="0 0 100 100" className="mx-auto">
          {links.map((l, i) => {
            const s = typeof l.source === 'object' ? l.source.id : l.source
            const t = typeof l.target === 'object' ? l.target.id : l.target
            return nodePos[s] && nodePos[t] ? (
              <line key={i} x1={nodePos[s].x} y1={nodePos[s].y}
                    x2={nodePos[t].x} y2={nodePos[t].y}
                    stroke="rgba(148,163,184,0.2)" strokeWidth="1" />
            ) : null
          })}
          {nodes.map((n) => nodePos[n.id] ? (
            <circle key={n.id} cx={nodePos[n.id].x} cy={nodePos[n.id].y}
                    r="4" fill="#6366f1" />
          ) : null)}
        </svg>
        <div className="text-[7px] text-center text-slate-400 mt-1 space-y-0.5 leading-tight">
          <div>{nodes.length}n/{links.length}e</div>
          <div>D: {currSnap?.graph_structural_metrics?.[hoveredGraphId]?.density?.toFixed(3) || '?'} | C: {currSnap?.graph_structural_metrics?.[hoveredGraphId]?.avg_clustering?.toFixed(3) || '?'} | D°: {currSnap?.graph_structural_metrics?.[hoveredGraphId]?.avg_degree?.toFixed(1) || '?'}</div>
        </div>
      </div>
    </div>
  )
}

/* ─── Main EmbeddingView ──────────────────────────────────────────────────── */
export default function EmbeddingView() {
  const { snapshots, currentEpochFloat, currentEpoch } = usePlayerStore()
  const selectedTask = useGNNStore((s) => s.selectedTask)
  const selectedNodeId = useGNNStore((s) => s.selectedNodeId)
  const setSelectedNode = useGNNStore((s) => s.setSelectedNode)
  const setHoveredGraph = useGNNStore((s) => s.setHoveredGraph)
  const hoveredGraphId = useGNNStore((s) => s.hoveredGraphId)
  const taskData = useGNNStore((s) => s.taskData)

  const [showTrajectory, setShowTrajectory] = useState(false)
  const [popupPos, setPopupPos] = useState(null)
  const plotContainerRef = useRef(null)
  
  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const tRaw = currentEpochFloat - epochInt
  const t = easeInOutCubic(Math.max(0, Math.min(1, tRaw)))
  
  const snapA = snapshots[epochInt]
  const snapB = snapshots[epochInt + 1] || snapA
  
  const currSnap = useMemo(() => {
    if (!snapA || !snapB) return null
    return interpolateSnapshots(snapA, snapB, t)
  }, [snapA, snapB, t])

  /* ── Trajectory trace (10-epoch trail for selected node) ──────────── */
  const trajectoryTrace = useMemo(() => {
    if (!showTrajectory || selectedNodeId === null || !currSnap?.embeddings_2d) return null
    if (selectedTask === 2 || selectedTask === 3) return null

    const trailLen = Math.min(10, epochInt)
    const x = [], y = []
    for (let offset = trailLen; offset >= 0; offset--) {
      const idx = epochInt - offset
      if (idx < 0) continue
      const emb = snapshots[idx]?.embeddings_2d?.[selectedNodeId]
      if (emb) { x.push(emb[0]); y.push(emb[1]) }
    }

    if (x.length < 2) return null
    return {
      type: 'scatter', mode: 'lines+markers',
      x, y,
      line: { color: 'rgba(251, 146, 60, 0.5)', width: 2, shape: 'spline' },
      marker: {
        color: x.map((_, i) => `rgba(251, 146, 60, ${0.2 + (i / x.length) * 0.8})`),
        size: x.map((_, i) => 3 + (i / x.length) * 4),
      },
      hoverinfo: 'none',
      showlegend: false,
    }
  }, [showTrajectory, selectedNodeId, epochInt, snapshots, currSnap, selectedTask])

  /* ── Main plotData ──────────────────────────────────────────────────── */
  const plotData = useMemo(() => {
    if (!currSnap) return null
    
    // Task 2: Graph-level embedding
    if (selectedTask === 2 && currSnap.graph_embeddings_2d) {
      const activeId = selectedNodeId !== null ? selectedNodeId : hoveredGraphId
      const emb = currSnap.graph_embeddings_2d
      const preds = currSnap.graph_predictions || []
      const { compactness } = getSpreadStats(emb)
      const x = emb.map(p => p[0])
      const y = emb.map(p => p[1])
      const colors = preds.map(c => getClassColor(c))
      const sizes = emb.map((_, i) => (i === activeId) ? 14 * compactness : 8 * compactness)
      const opacities = emb.map((_, i) => (i === activeId) ? 1.0 : 0.75)
      
      return [{
        type: 'scatter',
        mode: 'markers+text',
        x, y,
        text: emb.map((_, i) => `G${i}`),
        textposition: 'top center',
        textfont: { family: 'monospace', size: 9, color: '#94a3b8' },
        marker: {
          color: colors,
          size: sizes,
          opacity: opacities,
          line: {
            color: emb.map((_, i) => (i === activeId) ? 'white' : 'rgba(255,255,255,0.08)'),
            width: emb.map((_, i) => (i === activeId) ? 2 : 0.5),
          },
        },
        hoverinfo: 'none', 
      }]
    }

    // Task 3: Pair Proximity Midpoints
    const testEdges = taskData?.testEdges
    
    if (selectedTask === 3 && currSnap.embeddings_2d && testEdges) {
      const emb = currSnap.embeddings_2d
      const scores = currSnap.edge_scores || []
      const { compactness } = getSpreadStats(emb)
      
      const x = [], y = [], colors = [], texts = [], labels = [], sizes = [], opacities = []

      testEdges.forEach((e, i) => {
         const p1 = emb[e.source]
         const p2 = emb[e.target]
         if (p1 && p2) {
             const score = scores[i] ?? 0.5
             x.push((p1[0] + p2[0]) / 2)
             y.push((p1[1] + p2[1]) / 2)
             colors.push(e.exists ? '#10b981' : '#ef4444')
             sizes.push((7 + score * 7) * compactness)
             opacities.push(0.5 + score * 0.5)
             labels.push(`${e.source}-${e.target}`)
             texts.push(`Pair: ${e.source}-${e.target}<br>GT: ${e.exists ? 'Link' : 'No Link'}<br>Confidence: ${(score*100).toFixed(1)}%`)
         }
      })

      return [{
        type: 'scatter',
        mode: 'markers+text',
        x, y,
        text: labels,
        textposition: 'top center',
        textfont: { family: 'monospace', size: 8, color: '#64748b' },
        marker: {
          color: colors,
          size: sizes,
          opacity: opacities,
          line: { color: 'rgba(255,255,255,0.2)', width: 1 }
        },
        textinfo: 'text',
        hoverinfo: 'text'
      }]
    }

    // Task 1: Node-level embedding
    if (!currSnap?.embeddings_2d) return null
    const emb = currSnap.embeddings_2d
    const preds = currSnap.node_predictions || []
    const { compactness } = getSpreadStats(emb)
    const x = emb.map((p) => p[0])
    const y = emb.map((p) => p[1])
    const colors = preds.map(c => getClassColor(c))
    const sizes = emb.map((_, i) => i === selectedNodeId ? 14 * compactness : 8 * compactness)
    const opacities = emb.map((_, i) => i === selectedNodeId ? 1.0 : 0.82)

    const traces = [{
      type: 'scatter',
      mode: 'markers+text',
      x, y,
      text: emb.map((_, i) => String(i)),
      textposition: 'top center',
      textfont: { family: 'monospace', size: 9, color: '#ffffff' },
      marker: {
        color: colors,
        size: sizes,
        opacity: opacities,
        line: {
          color: emb.map((_, i) =>
            i === selectedNodeId ? 'white' : 'rgba(255,255,255,0.08)'
          ),
          width: emb.map((_, i) => i === selectedNodeId ? 2 : 0.5),
        },
      },
      hoverinfo: 'text',
    }]

    if (trajectoryTrace) traces.push(trajectoryTrace)
    return traces
  }, [currSnap, selectedNodeId, selectedTask, hoveredGraphId, taskData, trajectoryTrace])

  // Silhouette score
  const silhouetteScore = useMemo(() => {
    const snapToUse = selectedTask === 2 
      ? { emb: currSnap?.graph_embeddings_2d, preds: currSnap?.graph_predictions }
      : { emb: currSnap?.embeddings_2d, preds: currSnap?.node_predictions }

    if (!snapToUse.emb || !snapToUse.preds) return 0
    const { emb, preds } = snapToUse
    const classes = [...new Set(preds)]
    if (classes.length <= 1 || emb.length < 4) return 0

    const sampleSize = Math.min(emb.length, 30)
    let totalScore = 0, count = 0

    for (let i = 0; i < sampleSize; i++) {
      const ci = preds[i]
      let intra = 0, intraCount = 0, inter = Infinity

      for (let j = 0; j < emb.length; j++) {
        if (i === j) continue
        const d = Math.hypot(emb[i][0] - emb[j][0], emb[i][1] - emb[j][1])
        if (preds[j] === ci) { intra += d; intraCount++ }
      }
      intra = intraCount > 0 ? intra / intraCount : 0

      for (const c of classes) {
        if (c === ci) continue
        let dist = 0, cnt = 0
        for (let j = 0; j < emb.length; j++) {
          if (preds[j] === c) {
            dist += Math.hypot(emb[i][0] - emb[j][0], emb[i][1] - emb[j][1])
            cnt++
          }
        }
        if (cnt > 0) inter = Math.min(inter, dist / cnt)
      }

      const s = inter > 0 ? (inter - intra) / Math.max(inter, intra) : 0
      totalScore += s; count++
    }
    return count > 0 ? totalScore / count : 0
  }, [currSnap, selectedTask])

  const handlePointClick = useCallback((event) => {
    if (event.points && event.points.length > 0) {
      const idx = event.points[0].pointIndex
      setSelectedNode(idx)
      if (selectedTask === 1) setShowTrajectory(true)
    }
  }, [setSelectedNode, selectedTask])

  const handleHover = useCallback((event) => {
    if (event.points && event.points.length > 0) {
      const pt = event.points[0]
      if (selectedTask === 2) {
        setHoveredGraph(pt.pointIndex)
        setPopupPos({ x: (event.event?.clientX || 0), y: (event.event?.clientY || 0) })
      }
    }
  }, [selectedTask, setHoveredGraph])

  const handleUnhover = useCallback(() => {
    if (selectedTask === 2) { setHoveredGraph(null); setPopupPos(null) }
  }, [selectedTask, setHoveredGraph])

  const hoveredGraph = useMemo(() => {
    if (selectedTask !== 2 || hoveredGraphId === null || !taskData?.graphs) return null
    return taskData.graphs[hoveredGraphId]
  }, [selectedTask, hoveredGraphId, taskData])

  const axisConfig = useMemo(() => {
    if (selectedTask === 2) return getSpreadStats(currSnap?.graph_embeddings_2d || [])
    return getSpreadStats(currSnap?.embeddings_2d || [])
  }, [currSnap, selectedTask])

  if (!plotData) return <div className="w-full h-full flex items-center justify-center text-slate-700 bg-slate-950/20 animate-pulse text-[10px] uppercase font-black tracking-widest">Awaiting Latent...</div>

  return (
    <div ref={plotContainerRef} className="w-full h-full relative bg-[#020617]/40">
      <LazyPlot
        data={plotData}
        layout={{
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          font: { color: '#94a3b8', size: 10 },
          xaxis: {
            showgrid: true, gridcolor: 'rgba(255,255,255,0.02)',
            zeroline: false, showticklabels: false,
            range: axisConfig.xRange, fixedrange: false,
          },
          yaxis: {
            showgrid: true, gridcolor: 'rgba(255,255,255,0.02)',
            zeroline: false, showticklabels: false,
            range: axisConfig.yRange, fixedrange: false,
            scaleanchor: 'x', scaleratio: 1,
          },
          margin: { l: 30, r: 30, t: 40, b: 30 },
          uirevision: `gnn-embed-${selectedTask}`,
          showlegend: false, dragmode: 'pan',
        }}
        style={{ width: '100%', height: '100%' }}
        useResizeHandler
        config={{ displayModeBar: false, responsive: true, scrollZoom: true }}
        onClick={handlePointClick}
        onHover={handleHover}
        onUnhover={handleUnhover}
      />

      <div className="absolute top-2 right-2 bg-slate-900/90 backdrop-blur-md rounded-xl px-3 py-2 border border-white/5 shadow-2xl text-right pointer-events-none">
        <span className="text-[8px] text-slate-500 block uppercase font-black tracking-widest">Silhouette</span>
        <span className={`text-sm font-black font-mono ${silhouetteScore > 0.45 ? 'text-emerald-400' : silhouetteScore > 0.2 ? 'text-amber-400' : 'text-rose-400'}`}>
          {silhouetteScore.toFixed(3)}
        </span>
      </div>

      <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur-md border border-white/5 rounded-lg px-2 py-1 pointer-events-none flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_#06b6d4]" />
        <span className="text-[9px] font-black text-slate-300 uppercase tracking-tighter">Density: {(axisConfig.compactness * 100).toFixed(0)}%</span>
      </div>

      {hoveredGraph && popupPos && (
        <MiniGraphPopup graph={hoveredGraph} hoveredGraphId={hoveredGraphId} currSnap={currSnap} position={popupPos} />
      )}
    </div>
  )
}
