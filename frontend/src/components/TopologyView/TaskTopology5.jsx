import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import NodeHoverCard from './NodeHoverCard'
import { CLASS_COLORS } from '../../utils/colors'
import { interpolateSnapshots } from '../../engine/interpolate'

const EDGE_COLOR_COLD = [34, 211, 238] // Cyan-400
const EDGE_COLOR_MID = [234, 179, 8]  // Yellow-500
const EDGE_COLOR_HOT = [239, 68, 68]  // Red-500
const NODE_R_MIN = 3
const NODE_R_MAX = 11

function lerpRGB(a, b, t) {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`
}

function proximityToColor(score) {
  const inverted = 1 - score
  if (inverted < 0.5) return lerpRGB(EDGE_COLOR_COLD, EDGE_COLOR_MID, inverted * 2)
  return lerpRGB(EDGE_COLOR_MID, EDGE_COLOR_HOT, (inverted - 0.5) * 2)
}

export default function TaskTopology5() {
  const containerRef = useRef()
  const fgRef = useRef()
  const animRef = useRef({ proximityMap: {}, predictions: null })
  const [graphData, setGraphData] = useState(null)
  const [dims, setDims] = useState({ width: 800, height: 600 })
  const [resampleKey, setResampleKey] = useState(0)
  const [showAnomalies, setShowAnomalies] = useState(false)
  const [pulseTick, setPulseTick] = useState(0)

  const rawGraphData = useGNNStore(s => s.graphData)
  const graphMeta = useGNNStore(s => s.task5Meta)
  const { snapshots, currentEpochFloat } = usePlayerStore()

  const numNodes = rawGraphData?.nodes?.length || 0
  const sizeMode = numNodes >= 5000 ? 'too_large' : numNodes >= 500 ? 'subsample' : 'full'
  const hasLabels = graphMeta?.has_labels || (rawGraphData?.nodes?.[0]?.groundTruth !== undefined)
  const selectedNodeId = useGNNStore(s => s.selectedNodeId)
  const setSelectedNode = useGNNStore(s => s.setSelectedNode)
  const setHoveredNode = useGNNStore(s => s.setHoveredNode)
  const outlierPulseIdx = useGNNStore(s => s.outlierPulseIdx)
  const setOutlierPulse = useGNNStore(s => s.setOutlierPulse)
  const selectedModel = useGNNStore(s => s.selectedModel)
  // Auto-derive overlay from selectedModel (selected in LeftSidebar)
  const overlayMode = selectedModel === 'GAT' ? 'attention' : selectedModel === 'GCN' ? 'smoothness' : selectedModel === 'SAGE' ? 'robustness' : 'none'

  // Build display graph (subsampled if large)
  const displayGraphData = useMemo(() => {
    if (!rawGraphData?.nodes?.length || sizeMode === 'too_large') return null

    let nodes, links
    if (sizeMode === 'subsample') {
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

  useEffect(() => {
    if (displayGraphData) setGraphData({ ...displayGraphData })
  }, [displayGraphData])

  // Subscribe to player store for animated proximity data (with interpolation)
  useEffect(() => {
    const unsub = usePlayerStore.subscribe((state) => {
      const { snapshots, currentEpochFloat } = state
      if (!snapshots.length) return
      const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
      const frac = currentEpochFloat - epochInt
      const snapA = snapshots[epochInt]
      const snapB = snapshots[Math.min(epochInt + 1, snapshots.length - 1)]
      const snap = frac > 0 && snapB ? interpolateSnapshots(snapA, snapB, frac) : snapA
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
      animRef.current.snap = snap
    })
    return unsub
  }, [])

  // ResizeObserver — reconnect whenever containerRef changes
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      if (width > 10 && height > 10) setDims({ width, height })
    })
    ro.observe(el)
    const rect = el.getBoundingClientRect()
    if (rect.width > 10 && rect.height > 10) setDims({ width: rect.width, height: rect.height })
    return () => ro.disconnect()
  }, [])

  // Apply force params when graph data changes
  useEffect(() => {
    if (!fgRef.current || !graphData) return
    const fg = fgRef.current
    fg.d3Force('charge')?.strength(-80).distanceMax(200)
    fg.d3Force('link')?.distance(30)
    fg.d3Force('center')?.strength(0.05)
    fg.d3ReheatSimulation()
  }, [graphData])

  const fitView = useCallback(() => {
    if (!fgRef.current) return
    try { fgRef.current.zoomToFit(400, 60) } catch { /* settle */ }
  }, [])

  // Wait for the force simulation to settle before the first fit — otherwise
  // zoomToFit runs while nodes are still at the origin and locks the camera
  // onto a single corner of the workspace.
  const fitDoneRef = useRef(false)
  useEffect(() => { fitDoneRef.current = false }, [graphData])

  // Re-fit on user-driven resize, skipping the initial 0→N dim transition so
  // it doesn't race with the engineStop fit on mount.
  const prevDimsRef = useRef({ width: 0, height: 0 })
  useEffect(() => {
    if (!fgRef.current) return
    const prev = prevDimsRef.current
    prevDimsRef.current = { width: dims.width, height: dims.height }
    if (prev.width === 0 || prev.height === 0) return
    const id = requestAnimationFrame(fitView)
    return () => cancelAnimationFrame(id)
  }, [dims.width, dims.height, fitView])

  // Keyboard shortcut: "F" to refit
  useEffect(() => {
    const handler = (e) => {
      const el = e.target
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        fitView()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [fitView])

  // Outlier pulse — center+zoom to the requested node, animate + auto-clear.
  useEffect(() => {
    if (outlierPulseIdx == null || !fgRef.current || !graphData?.nodes) return
    const node = graphData.nodes.find((n) => n.id === outlierPulseIdx)
    if (!node || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return
    try { fgRef.current.centerAt(node.x, node.y, 500) } catch { /* settle */ }
    try { fgRef.current.zoom(2.4, 500) } catch { /* settle */ }
    const start = Date.now()
    let raf = null
    const step = () => {
      setPulseTick((t) => t + 1)
      if (Date.now() - start < 1500) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    const clr = setTimeout(() => setOutlierPulse(null), 1500)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      clearTimeout(clr)
    }
  }, [outlierPulseIdx, graphData, setOutlierPulse])

  const linkCanvasObject = useCallback((link, ctx) => {
    const s = link.source
    const t = link.target
    if (!s || !t || !Number.isFinite(s.x) || !Number.isFinite(t.x)) return
    const sId = typeof s === 'object' ? s.id : s
    const tId = typeof t === 'object' ? t.id : t
    const key = `${Math.min(sId, tId)}-${Math.max(sId, tId)}`
    const score = animRef.current.proximityMap[key]
    let color = 'rgba(255,255,255,0.15)'
    let width = 1.5
    let alpha = 0.2

    // Attention overlay: amber glow by attention weight
    if (overlayMode === 'attention') {
      const snap = animRef.current.snap
      const attnEdges = snap?.attention_edges
      if (attnEdges) {
        const attnMap = new Map()
        for (const e of attnEdges) attnMap.set(`${Math.min(e.source, e.target)}-${Math.max(e.source, e.target)}`, e.weight)
        const w = attnMap.get(key) ?? 0
        if (w > 0.05) {
          color = `rgba(251, 191, 36, ${0.3 + w * 0.7})`
          width = 1 + w * 5
          alpha = 0.4 + w * 0.6
        } else {
          color = 'rgba(91, 86, 137, 0.1)'
          width = 0.8
          alpha = 0.1
        }
      }
    } else {
      if (score !== undefined) {
        color = proximityToColor(score)
        width = 1.5 + score * 4
        alpha = 0.6 + score * 0.4
      }
    }

    if (selectedNodeId !== null) {
      if (sId !== selectedNodeId && tId !== selectedNodeId) alpha = 0.05
      else { alpha = Math.max(alpha, 0.4); width *= 1.5 }
    }
    ctx.beginPath()
    ctx.moveTo(s.x, s.y)
    ctx.lineTo(t.x, t.y)
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.globalAlpha = alpha
    ctx.stroke()
    ctx.globalAlpha = 1
  }, [selectedNodeId, selectedModel])

  const nodeCanvasObject = useCallback((node, ctx, globalScale) => {
    if (!node || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return
    const degree = node.degree || 1
    // Cap node radius so large-degree nodes don't dominate the canvas.
    const r = Math.max(NODE_R_MIN, Math.min(NODE_R_MAX, Math.sqrt(degree) * 1.8 + 3))
    let color = '#6366f1'
    if (overlayMode === 'smoothness') {
      const smooth = animRef.current.snap?.local_smoothness?.[node.id]
      if (smooth !== undefined && smooth > 0) {
        // High smoothness = oversmoothed = gray; low = sharp = colored
        const norm = Math.min(1, smooth / 2.0)
        const r = Math.round(99 + (148 - 99) * norm)
        const g = Math.round(102 + (163 - 102) * norm)
        const b = Math.round(241 + (185 - 241) * norm)
        color = `rgb(${r},${g},${b})`
      }
    } else if (overlayMode === 'robustness') {
      // Base color from predictions, border will be handled below
      const gt = node.groundTruth
      const pred = animRef.current.predictions?.[node.id]
      if (hasLabels && gt !== undefined && gt !== 0) color = CLASS_COLORS[gt % CLASS_COLORS.length] || color
      else if (pred !== undefined && pred > 0) color = CLASS_COLORS[pred % CLASS_COLORS.length] || color
    } else if (showAnomalies) {
      const knnScore = animRef.current.snap?.per_node_knn_preservation?.[node.id]
      if (knnScore !== undefined) {
        if (knnScore > 0.8) color = '#22c55e'
        else if (knnScore >= 0.5) color = '#eab308'
        else color = '#ef4444'
      }
    } else {
      const gt = node.groundTruth
      const pred = animRef.current.predictions?.[node.id]
      if (hasLabels && gt !== undefined && gt !== 0) color = CLASS_COLORS[gt % CLASS_COLORS.length] || color
      else if (pred !== undefined && pred > 0) color = CLASS_COLORS[pred % CLASS_COLORS.length] || color
    }
    const isSelected = selectedNodeId === node.id
    const isPulsing = outlierPulseIdx === node.id
    const isDimmed = selectedNodeId !== null && !isSelected
    ctx.globalAlpha = isDimmed ? 0.2 : 1.0

    // Pulsing ring for focused outlier
    if (isPulsing) {
      const pulse = 1 + Math.sin(Date.now() / 100) * 0.4
      ctx.beginPath()
      ctx.arc(node.x, node.y, (r + 8) * pulse, 0, 2 * Math.PI)
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 2.5
      ctx.globalAlpha = 0.85
      ctx.stroke()
      ctx.globalAlpha = 1.0
    }

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
    // Robustness overlay: border green (robust) / orange (fragile)
    let strokeColor = isSelected ? '#ffffff' : 'rgba(255,255,255,0.3)'
    let strokeWidth = Math.max(isSelected ? 1.5 : 0.2, 0.8 / globalScale)
    if (overlayMode === 'robustness') {
      const robustness = animRef.current.snap?.sage_robustness
      if (robustness != null) {
        strokeColor = robustness > 0.8 ? '#22c55e' : robustness > 0.5 ? '#eab308' : '#ef4444'
        strokeWidth = 2.5
      }
    }
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = strokeWidth
    ctx.stroke()
    // Label
    const fontSize = Math.max(4, 10 / Math.pow(globalScale, 0.5))
    if (r > fontSize / 1.5 || globalScale > 1.5 || isSelected) {
      ctx.font = `bold ${isSelected ? Math.max(fontSize * 1.5, 10) : fontSize}px Inter, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = isSelected ? '#ffffff' : '#e2e8f0'
      ctx.fillText(`${node.id}`, node.x, node.y)
    }
    ctx.globalAlpha = 1.0
  }, [hasLabels, selectedNodeId, showAnomalies, outlierPulseIdx, pulseTick, selectedModel])

  return (
    <div ref={containerRef} className="w-full h-full relative bg-transparent overflow-hidden rounded-2xl">
      {sizeMode === 'too_large' ? (
        <div className="w-full h-full flex items-center justify-center text-slate-400">
          <div className="text-center max-w-md px-6">
            <h3 className="text-lg font-bold text-slate-300 mb-2">Đồ thị quá lớn để hiển thị</h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              Đồ thị có <span className="text-cyan-400 font-mono font-bold">{numNodes.toLocaleString()}</span> nút — vượt ngưỡng 5.000 cho rendering.
            </p>
            <p className="text-xs text-slate-600 mt-2">
              Xem chỉ số embedding tại panel metric bên phải → tab <span className="text-indigo-400">Outliers</span>, <span className="text-indigo-400">KNN</span>, <span className="text-indigo-400">Diagnostics</span>.
            </p>
          </div>
        </div>
      ) : !graphData ? (
        <div className="w-full h-full flex items-center justify-center text-slate-500">
          <div className="text-center">
            <p className="text-sm font-medium">Tải dữ liệu hoặc chọn dataset</p>
            <p className="text-micro text-slate-600 mt-1">Bấm "Huấn luyện" để bắt đầu</p>
          </div>
        </div>
      ) : (
        <>
          <ForceGraph2D
            ref={fgRef}
            graphData={graphData}
            width={dims.width}
            height={dims.height}
            nodeCanvasObject={nodeCanvasObject}
            nodeCanvasObjectMode={() => 'replace'}
            linkCanvasObject={linkCanvasObject}
            linkCanvasObjectMode={() => 'replace'}
            onNodeClick={node => setSelectedNode(node.id)}
            onNodeHover={node => setHoveredNode(node?.id ?? null)}
            onBackgroundClick={() => setSelectedNode(null)}
            cooldownTicks={200}
            warmupTicks={30}
            d3VelocityDecay={0.4}
            backgroundColor="transparent"
            minZoom={0.3}
            maxZoom={4}
            onEngineStop={() => {
              if (fitDoneRef.current) return
              fitDoneRef.current = true
              fitView()
            }}
          />

          <NodeHoverCard />

          {/* Proximity Legend */}
          <div className="absolute bottom-3 left-3 bg-black/40 backdrop-blur-md rounded-xl px-3 py-2 border border-white/10 z-10 pointer-events-none shadow-lg">
            <div className="text-[9px] text-twilight uppercase tracking-widest font-bold mb-1.5">Embedding Proximity</div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-cyan-400 font-bold">Gần</span>
              <div className="w-16 h-1.5 rounded-full bg-gradient-to-r from-cyan-400 via-yellow-500 to-red-500 shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
              <span className="text-[10px] text-red-400 font-bold">Xa</span>
            </div>
          </div>

          {/* Anomaly Legend */}
          {showAnomalies && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/40 backdrop-blur-md rounded-xl px-4 py-2 border border-white/10 z-10 pointer-events-none shadow-lg">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" /><span className="text-[10px] text-green-400 font-bold">Good</span></div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" /><span className="text-[10px] text-red-400 font-bold">Anomaly</span></div>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
            <button
              onClick={() => setShowAnomalies(v => !v)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border shadow-lg ${showAnomalies ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 'bg-black/40 border-white/10 text-starlight hover:bg-white/10 hover:text-white backdrop-blur-md'}`}
            >
              ANOMALIES
            </button>
            {sizeMode === 'subsample' && (
              <button
                onClick={() => setResampleKey(k => k + 1)}
                className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-black/40 border border-white/10 text-starlight hover:bg-white/10 hover:text-white backdrop-blur-md transition-all shadow-lg"
              >
                RESAMPLE
              </button>
            )}
            <div className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-right min-w-16 backdrop-blur-md shadow-lg">
              <div className="text-[8px] text-twilight uppercase font-bold tracking-widest">Nodes</div>
              <div className="text-xs font-bold font-mono text-white-star leading-none mt-0.5">{numNodes.toLocaleString()}</div>
            </div>
          </div>

          {/* Fit button (bottom-right) */}
          <button
            onClick={fitView}
            className="absolute bottom-3 right-3 z-10 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-black/40 border border-white/10 text-starlight hover:text-white hover:bg-white/10 backdrop-blur-md transition-all shadow-lg"
            title="Fit to view (F)"
          >
            FIT
          </button>
        </>
      )}
    </div>
  )
}
