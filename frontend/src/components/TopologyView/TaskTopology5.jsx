import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { CLASS_COLORS } from '../../utils/colors'

const EDGE_COLOR_COLD = [6, 182, 212]
const EDGE_COLOR_MID = [234, 179, 8]
const EDGE_COLOR_HOT = [239, 68, 68]
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
  const outlierPulseIdx = useGNNStore(s => s.outlierPulseIdx)
  const setOutlierPulse = useGNNStore(s => s.setOutlierPulse)

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

  // Subscribe to player store for animated proximity data
  useEffect(() => {
    const unsub = usePlayerStore.subscribe((state) => {
      const { snapshots, currentEpochFloat } = state
      if (!snapshots.length) return
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
  })

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

  // Re-fit on resize so the graph always fills the workspace (no dark dead space).
  useEffect(() => {
    if (!fgRef.current) return
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
    let color = 'rgba(100,116,139,0.12)'
    let width = 1
    let alpha = 0.15
    if (score !== undefined) {
      color = proximityToColor(score)
      width = 0.8 + score * 3
      alpha = 0.4 + score * 0.5
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
  }, [selectedNodeId])

  const nodeCanvasObject = useCallback((node, ctx, globalScale) => {
    if (!node || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return
    const degree = node.degree || 1
    // Cap node radius so large-degree nodes don't dominate the canvas.
    const r = Math.max(NODE_R_MIN, Math.min(NODE_R_MAX, Math.sqrt(degree) * 1.8 + 3))
    let color = '#6366f1'
    if (showAnomalies) {
      const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
      const snap = snapshots[epochInt]
      const knnScore = snap?.per_node_knn_preservation?.[node.id]
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
    ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255,255,255,0.3)'
    ctx.lineWidth = Math.max(isSelected ? 1.5 : 0.2, 0.8 / globalScale)
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
  }, [hasLabels, selectedNodeId, showAnomalies, snapshots, currentEpochFloat, outlierPulseIdx, pulseTick])

  return (
    <div ref={containerRef} className="w-full h-full relative bg-slate-950 overflow-hidden">
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
            onBackgroundClick={() => setSelectedNode(null)}
            cooldownTicks={150}
            warmupTicks={30}
            d3VelocityDecay={0.4}
            backgroundColor="transparent"
            minZoom={0.3}
            maxZoom={4}
          />

          {/* Proximity Legend */}
          <div className="absolute bottom-2 left-2 bg-slate-900/90 backdrop-blur-md rounded-lg px-2 py-1 border border-slate-700/40 z-10 pointer-events-none">
            <div className="text-nano text-slate-500 uppercase tracking-ultra font-bold mb-1">Embedding Proximity</div>
            <div className="flex items-center gap-1">
              <span className="text-nano text-cyan-400 font-bold">Gần</span>
              <div className="w-12 h-1 rounded-full bg-gradient-to-r from-cyan-500 via-yellow-500 to-red-500" />
              <span className="text-nano text-red-400 font-bold">Xa</span>
            </div>
          </div>

          {/* Anomaly Legend */}
          {showAnomalies && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-md rounded-lg px-3 py-1 border border-slate-700/40 z-10 pointer-events-none">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500" /><span className="text-nano text-green-400">Good</span></div>
                <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /><span className="text-nano text-red-400">Anomaly</span></div>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
            <button
              onClick={() => setShowAnomalies(v => !v)}
              className={`px-2 py-1 rounded-md text-nano font-bold transition-all border ${showAnomalies ? 'bg-amber-600/30 border-amber-500/60 text-amber-300' : 'bg-slate-800/90 border-slate-700/50 text-slate-300 hover:bg-slate-700'}`}
            >
              ANOMALIES
            </button>
            {sizeMode === 'subsample' && (
              <button
                onClick={() => setResampleKey(k => k + 1)}
                className="px-2 py-1 rounded-md text-nano font-bold bg-slate-800/90 border border-slate-700/50 text-slate-300 hover:bg-slate-700"
              >
                RESAMPLE
              </button>
            )}
            <div className="bg-slate-900/85 border border-slate-700/40 rounded-lg px-2 py-1 text-right min-w-14">
              <div className="text-nano text-slate-500 uppercase font-bold tracking-tight">Nodes</div>
              <div className="text-xs font-bold font-mono text-cyan-300 leading-none">{numNodes.toLocaleString()}</div>
            </div>
          </div>

          {/* Fit button (bottom-right) */}
          <button
            onClick={fitView}
            className="absolute bottom-2 right-2 z-10 px-2.5 py-1 rounded-md text-nano font-bold bg-slate-900/90 border border-slate-700/50 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
            title="Fit to view (F)"
          >
            FIT
          </button>
        </>
      )}
    </div>
  )
}
