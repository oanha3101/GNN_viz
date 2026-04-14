import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { CLASS_COLORS } from '../../utils/colors'

/**
 * TaskTopology5 — View A: Adaptive Topology View
 * 
 * Behavior adapts to graph size:
 *   N < 500      → Full graph, force-directed, layout frozen after settle
 *   500 ≤ N < 5000 → Subsample 500 nodes by degree, "Resample" button
 *   N ≥ 5000     → Hidden, shows info banner
 * 
 * Edges colored by proximity_score (cyan → yellow → red).
 * Nodes colored by label if available, uniform otherwise.
 */

const EDGE_COLOR_COLD = [6, 182, 212]   // cyan-400
const EDGE_COLOR_MID  = [234, 179, 8]   // yellow-500
const EDGE_COLOR_HOT  = [239, 68, 68]   // red-500

function lerpRGB(a, b, t) {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`
}

function proximityToColor(score) {
  // score 0..1 → High proximity (cold/cyan) to Low proximity (hot/red)
  const inverted = 1 - score  // high proximity = low "heat"
  if (inverted < 0.5) {
    return lerpRGB(EDGE_COLOR_COLD, EDGE_COLOR_MID, inverted * 2)
  }
  return lerpRGB(EDGE_COLOR_MID, EDGE_COLOR_HOT, (inverted - 0.5) * 2)
}

export default function TaskTopology5() {
  const containerRef = useRef()
  const fgRef = useRef()
  const animRef = useRef({ proximityMap: {}, predictions: null })
  const graphDataRef = useRef(null)
  const [dims, setDims] = useState({ width: 800, height: 400 })
  const [layoutFrozen, setLayoutFrozen] = useState(false)
  const [graphReady, setGraphReady] = useState(false)
  const [resampleKey, setResampleKey] = useState(0)
  const [showAnomalies, setShowAnomalies] = useState(false)

  // Get graph data from store
  const rawGraphData = useGNNStore(s => s.graphData)
  const graphMeta = useGNNStore(s => s.task5Meta)

  const numNodes = rawGraphData?.nodes?.length || 0
  const sizeMode = numNodes >= 5000 ? 'too_large' : numNodes >= 500 ? 'subsample' : 'full'
  const hasLabels = graphMeta?.has_labels || (rawGraphData?.nodes?.[0]?.groundTruth !== undefined)
  const selectedNodeId = useGNNStore(s => s.selectedNodeId)
  const setSelectedNode = useGNNStore(s => s.setSelectedNode)

  // Build graph data (with subsampling if needed)
  const displayGraphData = useMemo(() => {
    if (!rawGraphData?.nodes?.length) return null

    if (sizeMode === 'too_large') return null

    let nodes, links

    if (sizeMode === 'subsample') {
      // Sample top 500 by degree
      const sorted = [...rawGraphData.nodes].sort((a, b) => (b.degree || 0) - (a.degree || 0))
      const sampled = sorted.slice(0, 500)
      const sampledIds = new Set(sampled.map(n => n.id))
      nodes = sampled.map(n => ({ ...n }))
      links = rawGraphData.links
        .filter(l => {
          const sId = typeof l.source === 'object' ? l.source.id : l.source
          const tId = typeof l.target === 'object' ? l.target.id : l.target
          return sampledIds.has(sId) && sampledIds.has(tId)
        })
        .map(l => ({
          source: typeof l.source === 'object' ? l.source.id : l.source,
          target: typeof l.target === 'object' ? l.target.id : l.target,
        }))
    } else {
      nodes = rawGraphData.nodes.map(n => ({ ...n }))
      links = rawGraphData.links.map(l => ({
        source: typeof l.source === 'object' ? l.source.id : l.source,
        target: typeof l.target === 'object' ? l.target.id : l.target,
      }))
    }

    return { nodes, links }
  }, [rawGraphData, sizeMode, resampleKey])

  // Clone into ref for ForceGraph
  useEffect(() => {
    if (displayGraphData) {
      graphDataRef.current = displayGraphData
      setGraphReady(true)
      setLayoutFrozen(false)
    }
  }, [displayGraphData])

  // Subscribe to player store for proximity data
  useEffect(() => {
    const unsub = usePlayerStore.subscribe((state) => {
      const { snapshots, currentEpochFloat } = state
      const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
      const snap = snapshots[epochInt]

      if (snap?.proximity_scores) {
        const map = {}
        snap.proximity_scores.forEach(p => {
          const key = `${Math.min(p.source, p.target)}-${Math.max(p.source, p.target)}`
          map[key] = p.score
        })
        animRef.current.proximityMap = map
      }
      if (snap?.node_predictions) {
        animRef.current.predictions = snap.node_predictions
      }
      if (fgRef.current && graphDataRef.current) {
        fgRef.current.d3ReheatSimulation()
      }
    })
    return unsub
  }, [])

  // Responsive
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      if (width > 0 && height > 0) setDims({ width, height })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Layout freeze
  useEffect(() => {
    if (!fgRef.current || !graphReady) return
    const fg = fgRef.current
    fg.d3Force('charge')?.strength(-60).distanceMax(180)
    fg.d3Force('link')?.distance(25)
    fg.d3Force('center')?.strength(0.05)
    fg.d3ReheatSimulation()
  }, [graphReady])

  const handleEngineStop = useCallback(() => {
    if (layoutFrozen || !fgRef.current) return
    const nodes = fgRef.current.graphData()?.nodes
    if (nodes?.length > 0) {
      nodes.forEach(n => { n.fx = n.x; n.fy = n.y })
      setLayoutFrozen(true)
    }
  }, [layoutFrozen])

  // Link canvas — colored by proximity score
  const linkCanvasObject = useCallback((link, ctx) => {
    const s = link.source
    const t = link.target
    if (!s || !t || !Number.isFinite(s.x) || !Number.isFinite(t.x)) return

    const sId = typeof s === 'object' ? s.id : s
    const tId = typeof t === 'object' ? t.id : t
    const key = `${Math.min(sId, tId)}-${Math.max(sId, tId)}`
    const score = animRef.current.proximityMap[key]

    let color = 'rgba(100,116,139,0.12)'
    let width = 1

    if (score !== undefined) {
      color = proximityToColor(score)
      width = 0.8 + score * 3
    }
    
    // Dim links if a node is selected, unless it connects to the selected node
    let alpha = score !== undefined ? 0.4 + score * 0.5 : 0.15
    if (selectedNodeId !== null) {
      if (sId !== selectedNodeId && tId !== selectedNodeId) {
        alpha = 0.05
      } else {
        alpha = Math.max(alpha, 0.4) // Boost visibility of selected links
        width *= 1.5
      }
    }

    ctx.beginPath()
    ctx.moveTo(s.x, s.y)
    ctx.lineTo(t.x, t.y)
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.globalAlpha = alpha
    ctx.stroke()
    ctx.globalAlpha = 1
  }, [selectedNodeId])

  // Node canvas — aesthetic
  const nodeCanvasObject = useCallback((node, ctx, globalScale) => {
    if (!node || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return
    const degree = node.degree || 1
    const r = Math.max(4, Math.sqrt(degree) * 1.8 + 3)

    let color = '#6366f1' // default indigo

    // Anomaly mode: color by KNN preservation score
    if (showAnomalies) {
      const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
      const snap = snapshots[epochInt]
      const knnScore = snap?.per_node_knn_preservation?.[node.id]
      if (knnScore !== undefined) {
        if (knnScore > 0.8) color = '#22c55e'       // Green: Good preservation
        else if (knnScore >= 0.5) color = '#eab308'  // Yellow: Moderate
        else color = '#ef4444'                        // Red: Anomaly
      }
    } else {
      const gt = node.groundTruth
      const pred = animRef.current.predictions?.[node.id]
      if (hasLabels && gt !== undefined && gt !== 0) {
        color = CLASS_COLORS[gt % CLASS_COLORS.length] || color
      } else if (pred !== undefined && pred > 0) {
        color = CLASS_COLORS[pred % CLASS_COLORS.length] || color
      }
    }

    const isSelected = selectedNodeId === node.id
    const isDimmed = selectedNodeId !== null && !isSelected
    ctx.globalAlpha = isDimmed ? 0.2 : 1.0

    // Glow
    ctx.beginPath()
    ctx.arc(node.x, node.y, r + (isSelected ? 6 : 3), 0, 2 * Math.PI)
    ctx.fillStyle = color + (isSelected ? '40' : '20')
    ctx.fill()

    // Main
    ctx.beginPath()
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255,255,255,0.3)'
    ctx.lineWidth = Math.max(isSelected ? 1.5 : 0.2, 0.8 / globalScale)
    ctx.stroke()

    // Node ID Text
    const fontSize = Math.max(4, 10 / Math.pow(globalScale, 0.5))
    if (r > fontSize / 1.5 || globalScale > 1.5 || isSelected) {
      ctx.font = `bold ${isSelected ? Math.max(fontSize * 1.5, 10) : fontSize}px Inter, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = isSelected ? '#ffffff' : '#e2e8f0'
      ctx.fillText(`${node.id}`, node.x, node.y)
    }
    ctx.globalAlpha = 1.0
  }, [hasLabels, selectedNodeId, showAnomalies, snapshots, currentEpochFloat])

  // ── Render ──────────────────────────────────────────────────────────
  if (sizeMode === 'too_large') {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-400">
        <div className="text-center max-w-md px-6">
          <div className="text-5xl mb-4 opacity-60">🌐</div>
          <h3 className="text-lg font-bold text-slate-300 mb-2">Đồ thị quá lớn để hiển thị</h3>
          <p className="text-sm text-slate-500 leading-relaxed">
            Đồ thị có <span className="text-cyan-400 font-mono font-bold">{numNodes.toLocaleString()}</span> nút
            — vượt ngưỡng 5.000 cho rendering.
          </p>
          <p className="text-xs text-slate-600 mt-2">
            Xem kết quả tại <span className="text-indigo-400">Không gian Embedding</span> bên phải →
          </p>
        </div>
      </div>
    )
  }

  if (!graphReady && !graphDataRef.current) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-500">
        <div className="text-center">
          <div className="text-4xl mb-3 opacity-40 animate-pulse">📡</div>
          <p className="text-sm font-medium">Tải dữ liệu hoặc chọn dataset</p>
          <p className="text-[10px] text-slate-600 mt-1">Bấm "Huấn luyện" để bắt đầu</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="w-full h-full relative bg-slate-950">
      <ForceGraph2D
        ref={fgRef}
        graphData={graphDataRef.current}
        width={dims.width}
        height={dims.height}
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode={() => 'replace'}
        linkCanvasObject={linkCanvasObject}
        linkCanvasObjectMode={() => 'replace'}
        onNodeClick={node => setSelectedNode(node.id)}
        onBackgroundClick={() => setSelectedNode(null)}
        onEngineStop={handleEngineStop}
        cooldownTicks={layoutFrozen ? 0 : 200}
        warmupTicks={layoutFrozen ? 0 : 50}
        d3VelocityDecay={0.4}
        backgroundColor="transparent"
        minZoom={0.3}
        maxZoom={10}
      />

      {/* Proximity Legend */}
      <div className="absolute bottom-3 left-3 bg-slate-900/90 backdrop-blur-md rounded-xl px-3 py-2 border border-slate-700/40 z-10">
        <div className="text-[8px] text-slate-500 uppercase tracking-wider font-bold mb-1.5">Embedding Proximity</div>
        <div className="flex items-center gap-1 mb-1">
          <span className="text-[8px] text-cyan-400 font-bold">Gần</span>
          <div className="w-16 h-1.5 rounded-full bg-gradient-to-r from-cyan-500 via-yellow-500 to-red-500" />
          <span className="text-[8px] text-red-400 font-bold">Xa</span>
        </div>
        {sizeMode === 'subsample' && (
          <div className="text-[8px] text-amber-400/80 mt-1">
            ⚡ Hiển thị 500 / {numNodes.toLocaleString()} nút (theo degree)
          </div>
        )}
      </div>

      {/* Anomaly Legend — shown when toggle is active */}
      {showAnomalies && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-md rounded-xl px-4 py-2 border border-slate-700/40 z-10">
          <div className="text-[8px] text-slate-500 uppercase tracking-wider font-bold mb-1.5 text-center">KNN Preservation</div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
              <span className="text-[9px] text-green-400 font-bold">&gt;0.8 Good</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
              <span className="text-[9px] text-yellow-400 font-bold">0.5-0.8 Moderate</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span className="text-[9px] text-red-400 font-bold">&lt;0.5 Anomaly</span>
            </div>
          </div>
        </div>
      )}

      {/* Resample button for large graphs */}
      {sizeMode === 'subsample' && (
        <button
          onClick={() => setResampleKey(k => k + 1)}
          className="absolute top-3 left-3 z-10 px-3 py-1.5 rounded-lg text-[10px] font-bold 
                     bg-slate-800/90 border border-slate-700/50 text-slate-300 hover:bg-slate-700 
                     transition-all cursor-pointer"
        >
          🔄 Resample
        </button>
      )}

      {/* Node count badge */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        <button
          onClick={() => setShowAnomalies(v => !v)}
          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer border ${
            showAnomalies
              ? 'bg-amber-600/30 border-amber-500/60 text-amber-300'
              : 'bg-slate-800/90 border-slate-700/50 text-slate-300 hover:bg-slate-700'
          }`}
        >
          🔍 Anomalies
        </button>
        <div className="bg-slate-900/85 border border-slate-700/40 rounded-lg px-2.5 py-1.5 text-right">
          <div className="text-[8px] text-slate-500 uppercase tracking-wider">Nodes</div>
          <div className="text-sm font-bold font-mono text-cyan-300">{numNodes.toLocaleString()}</div>
        </div>
      </div>
    </div>
  )
}
