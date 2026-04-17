import { useMemo, useRef, useEffect, useCallback, useState } from 'react'
import Plot from 'react-plotly.js'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { CLASS_COLORS, getClassColor } from '../../utils/colors'
import { easeInOutCubic, interpolateSnapshots } from '../../engine/interpolate'

function computeAxisRange(values, paddingRatio = 0.18, minSpan = 6) {
  if (!values?.length) return [-minSpan / 2, minSpan / 2]

  let min = Infinity
  let max = -Infinity
  values.forEach((value) => {
    if (Number.isFinite(value)) {
      min = Math.min(min, value)
      max = Math.max(max, value)
    }
  })

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [-minSpan / 2, minSpan / 2]
  }

  const rawSpan = Math.max(max - min, 0)
  const span = Math.max(rawSpan, minSpan)
  const center = (min + max) / 2
  const half = (span * (1 + paddingRatio)) / 2
  return [center - half, center + half]
}

function getSpreadStats(points = []) {
  if (!points.length) {
    return { xRange: [-3, 3], yRange: [-3, 3], compactness: 1 }
  }

  const xValues = points.map((point) => point[0])
  const yValues = points.map((point) => point[1])
  const xRange = computeAxisRange(xValues)
  const yRange = computeAxisRange(yValues)
  const xSpan = Math.abs(xRange[1] - xRange[0])
  const ySpan = Math.abs(yRange[1] - yRange[0])
  const compactness = Math.max(0.55, Math.min(1.7, 8 / Math.max(xSpan, ySpan, 0.001)))

  return { xRange, yRange, compactness }
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
    if (selectedTask === 2 || selectedTask === 3) return null // only for Task 1

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
        size: x.map((_, i) => 3 + (i / x.length) * 6),
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
      const emb = currSnap.graph_embeddings_2d
      const preds = currSnap.graph_predictions || []
      const { compactness } = getSpreadStats(emb)
      const x = emb.map(p => p[0])
      const y = emb.map(p => p[1])
      const colors = preds.map(c => getClassColor(c))
      const sizes = emb.map((_, i) => (i === hoveredGraphId) ? 16 * compactness : 9 * compactness)
      const opacities = emb.map((_, i) => (i === hoveredGraphId) ? 1.0 : 0.75)
      
      return [{
        type: 'scatter',
        mode: 'markers',
        x, y,
        marker: {
          color: colors,
          size: sizes,
          opacity: opacities,
          line: {
            color: emb.map((_, i) => (i === hoveredGraphId) ? 'white' : 'rgba(255,255,255,0.08)'),
            width: emb.map((_, i) => (i === hoveredGraphId) ? 2 : 0.5),
          },
        },
        text: preds.map((c, i) => `Graph ${i} | Class ${c === 0 ? 'Dense' : 'Sparse'}`),
        hoverinfo: 'none', 
      }]
    }

    // Task 3: Pair Proximity Midpoints
    const testEdges = taskData?.testEdges
    
    if (selectedTask === 3 && currSnap.embeddings_2d && testEdges) {
      const emb = currSnap.embeddings_2d
      const scores = currSnap.edge_scores || []
      const { compactness } = getSpreadStats(emb)
      
      const x = [], y = [], colors = [], texts = [], sizes = [], opacities = []

      testEdges.forEach((e, i) => {
         const p1 = emb[e.source]
         const p2 = emb[e.target]
         if (p1 && p2) {
             const score = scores[i] ?? 0.5
             x.push((p1[0] + p2[0]) / 2)
             y.push((p1[1] + p2[1]) / 2)
             colors.push(e.exists ? '#3b82f6' : '#ef4444')
             sizes.push((8 + score * 8) * Math.min(compactness, 1.45))
             opacities.push(0.6 + score * 0.4)
             texts.push(`Pair: ${e.source}-${e.target}<br>GT: ${e.exists ? 'Link' : 'No Link'}<br>Confidence: ${(score*100).toFixed(1)}%`)
         }
      })

      // Collapse warning: check variance
      let collapseWarning = false
      if (x.length > 2) {
        const meanX = x.reduce((a, b) => a + b, 0) / x.length
        const meanY = y.reduce((a, b) => a + b, 0) / y.length
        const variance = x.reduce((acc, xi, i) => acc + (xi - meanX) ** 2 + (y[i] - meanY) ** 2, 0) / x.length
        collapseWarning = variance < 0.5
      }

      const traces = [{
        type: 'scatter',
        mode: 'markers',
        x, y,
        marker: {
          color: colors,
          size: sizes,
          opacity: opacities,
          line: { color: 'rgba(255,255,255,0.2)', width: 1 }
        },
        text: texts,
        hoverinfo: 'text'
      }]

      // Store collapse warning for rendering
      traces._collapseWarning = collapseWarning
      return traces
    }

    // Task 1: Node-level embedding
    if (!currSnap?.embeddings_2d) return null
    const emb = currSnap.embeddings_2d
    const preds = currSnap.node_predictions || []
    const { compactness } = getSpreadStats(emb)
    const x = emb.map((p) => p[0])
    const y = emb.map((p) => p[1])
    const colors = preds.map(c => getClassColor(c))
    const sizes = emb.map((_, i) => i === selectedNodeId ? 13 * compactness : 7 * compactness)
    const opacities = emb.map((_, i) => i === selectedNodeId ? 1.0 : 0.82)

    const traces = [{
      type: 'scatter',
      mode: 'markers',
      x, y,
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
      text: preds.map((c, i) => `Node ${i} | Class ${c}`),
      hoverinfo: 'text',
    }]

    // Add trajectory trace if active
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
      if (selectedTask === 1) {
        setSelectedNode(idx)
        setShowTrajectory(true) // auto-enable trajectory on click
      } else {
        setSelectedNode(idx)
      }
    }
  }, [setSelectedNode, selectedTask])

  const handleHover = useCallback((event) => {
    if (event.points && event.points.length > 0) {
      const pt = event.points[0]
      if (selectedTask === 2) {
        setHoveredGraph(pt.pointIndex)
        // Get cursor position for popup
        const rect = plotContainerRef.current?.getBoundingClientRect()
        if (rect) {
          setPopupPos({
            x: (event.event?.clientX || 0),
            y: (event.event?.clientY || 0),
          })
        }
      }
    }
  }, [selectedTask, setHoveredGraph])

  const handleUnhover = useCallback(() => {
    if (selectedTask === 2) {
      setHoveredGraph(null)
      setPopupPos(null)
    }
  }, [selectedTask, setHoveredGraph])

  // Get hovered graph data for popup
  const hoveredGraph = useMemo(() => {
    if (selectedTask !== 2 || hoveredGraphId === null || !taskData?.graphs) return null
    return taskData.graphs[hoveredGraphId]
  }, [selectedTask, hoveredGraphId, taskData])

  const axisConfig = useMemo(() => {
    if (selectedTask === 2) {
      return getSpreadStats(currSnap?.graph_embeddings_2d || [])
    }
    return getSpreadStats(currSnap?.embeddings_2d || [])
  }, [currSnap, selectedTask])

  if (!plotData) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-500">
        <div className="text-center">
          <div className="text-3xl mb-2 opacity-60">🌐</div>
          <p className="text-sm">No embedding data yet</p>
        </div>
      </div>
    )
  }

  const scoreColor =
    silhouetteScore > 0.45 ? 'text-green-400' :
    silhouetteScore > 0.2  ? 'text-yellow-400' :
                              'text-red-400'

  const collapseWarning = plotData._collapseWarning

  return (
    <div ref={plotContainerRef} className="w-full h-full relative">
      <Plot
        data={plotData}
        layout={{
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'rgba(15,23,42,0.25)',
          font: { color: '#94a3b8', size: 10 },
          xaxis: {
            showgrid: false, zeroline: false, showticklabels: false,
            range: axisConfig.xRange,
            fixedrange: false,
          },
          yaxis: {
            showgrid: false, zeroline: false, showticklabels: false,
            range: axisConfig.yRange,
            fixedrange: false,
            scaleanchor: 'x',
            scaleratio: 1,
          },
          margin: { l: 12, r: 12, t: 54, b: 28 },
          transition: { duration: 60, easing: 'linear', ordering: 'traces first' },
          uirevision: `gnn-embed-${selectedTask}`,
          showlegend: false,
          dragmode: 'pan',
        }}
        style={{ width: '100%', height: '100%' }}
        useResizeHandler
        config={{ displayModeBar: false, responsive: true, scrollZoom: true }}
        onClick={handlePointClick}
        onHover={handleHover}
        onUnhover={handleUnhover}
      />

      {/* Silhouette Score Badge */}
      <div className="absolute top-2 right-2 bg-slate-900/80 backdrop-blur-sm
                      rounded-lg px-2.5 py-1.5 border border-slate-700/40 text-right">
        <span className="text-[9px] text-slate-500 block uppercase tracking-wider">Silhouette</span>
        <span className={`text-sm font-bold font-mono ${scoreColor}`}>
          {silhouetteScore.toFixed(3)}
        </span>
      </div>

      {/* Trajectory Toggle (Task 1 only) */}
      {selectedTask === 1 && (
        <div className="absolute top-2 left-2 z-10">
          <button
            onClick={() => setShowTrajectory(!showTrajectory)}
            className={`px-2 py-1 rounded-lg text-[9px] font-bold transition-all border
              ${showTrajectory
                ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                : 'bg-slate-800/90 text-slate-500 border-slate-700/50'}`}
          >
            Trajectory {showTrajectory ? 'ON' : 'OFF'}
          </button>
        </div>
      )}

      <div className="absolute bottom-2 left-2 bg-slate-950/75 border border-slate-700/50 rounded-lg px-2 py-1 pointer-events-none">
        <span className="text-[9px] text-slate-500">Độ mở cụm </span>
        <span className="text-[9px] font-semibold text-cyan-300">
          {(axisConfig.compactness * 100).toFixed(0)}%
        </span>
      </div>

      {/* Collapse Warning (Task 3) */}
      {collapseWarning && (
        <div className="absolute inset-0 border-2 border-red-500/60 rounded-lg pointer-events-none animate-pulse z-20">
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-red-900/90 text-red-300 
                          text-[10px] font-bold px-3 py-1 rounded-full border border-red-500/50">
            Embedding Collapse Detected — Variance &lt; 0.5
          </div>
        </div>
      )}

      {/* Epoch Badge */}
      <div className="absolute bottom-2 right-2 bg-slate-900/70 rounded px-2 py-0.5">
        <span className="text-[9px] text-slate-500">Epoch </span>
        <span className="text-[9px] text-slate-300 font-semibold">{currentEpoch}</span>
      </div>

      {/* Mini-graph popup (Task 2 hover) */}
      {hoveredGraph && popupPos && (
        <MiniGraphPopup graph={hoveredGraph} hoveredGraphId={hoveredGraphId} currSnap={currSnap} position={popupPos} />
      )}
    </div>
  )
}
    </div>
  )
}
