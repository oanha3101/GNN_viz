import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { easeInOutCubic, lerp } from '../../engine/interpolate'
import { CLASS_COLORS } from '../../utils/colors'

// Smooth color interpolation for edges
function getLinkColor(score) {
  if (score > 0.8) return `rgba(16, 185, 129, ${0.7 + (score - 0.8) * 1.5})`; 
  if (score > 0.4) return `rgba(245, 158, 11, ${0.5 + (score - 0.4) * 1.0})`;
  return `rgba(239, 68, 68, ${0.15 + score * 0.5})`;
}

export default function TaskTopology3() {
  const rawGraphData = useGNNStore(s => s.graphData)
  const groundTruth = useGNNStore(s => s.groundTruth)
  const taskData = useGNNStore(s => s.taskData)
  const selectedModel = useGNNStore(s => s.selectedModel)
  const { snapshots, currentEpochFloat } = usePlayerStore()

  const selectedNodeId = useGNNStore(s => s.selectedNodeId)
  const setSelectedNode = useGNNStore(s => s.setSelectedNode)
  const focusedEdgeIdx = useGNNStore(s => s.focusedEdgeIdx)
  const setFocusedEdge = useGNNStore(s => s.setFocusedEdge)

  const [showNodes, setShowNodes] = useState(true)
  const [showTriangles, setShowTriangles] = useState(true)
  const [showErrorsOnly, setShowErrorsOnly] = useState(false)
  const [hoveredLink, setHoveredLink] = useState(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 })
  const [stableGraphData, setStableGraphData] = useState(null)
  
  const containerRef = useRef()
  const fgRef = useRef()
  const fitPendingRef = useRef(false)

  // 1. Cố định cấu trúc đồ thị (Logic cũ an toàn của bạn)
  const graphData = useMemo(() => {
    if (!rawGraphData) return null
    return {
      nodes: rawGraphData.nodes.map(n => ({ ...n })),
      links: rawGraphData.links.map((l, i) => ({ ...l, _idx: i }))
    }
  }, [rawGraphData])

  useEffect(() => {
    if (graphData?.nodes?.length) {
      setStableGraphData(graphData)
      fitPendingRef.current = true
    }
  }, [graphData])

  const activeGraphData = stableGraphData || graphData

  // Resize Handler — reattach when content switches from loading → data.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      if (e.contentRect.width > 0) setDimensions({ width: e.contentRect.width, height: e.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [activeGraphData])

  // Re-fit on resize so the graph always fills the workspace (no dark dead space).
  // Generous 60px padding prevents over-crush at narrow workspace widths.
  const fitView = useCallback((duration = 500, padding = 60) => {
    if (!fgRef.current) return
    try { fgRef.current.zoomToFit(duration, padding) } catch { /* settle */ }
  }, [])

  // On initial mount / new graph, wait for the force simulation to settle
  // before fitting — otherwise `zoomToFit` runs while nodes are still at the
  // origin and the camera locks onto a corner.
  const fitDoneRef = useRef(false)
  useEffect(() => { fitDoneRef.current = false }, [activeGraphData])

  // Subsequent user-driven resize events still refit instantly, but the very
  // first dim transition (0→N on mount) is absorbed by the engineStop path.
  const prevDimsRef = useRef({ width: 0, height: 0 })
  useEffect(() => {
    const prev = prevDimsRef.current
    prevDimsRef.current = { width: dimensions.width, height: dimensions.height }
    if (prev.width === 0 || prev.height === 0) return
    const id = requestAnimationFrame(() => fitView(400, 60))
    return () => cancelAnimationFrame(id)
  }, [dimensions.width, dimensions.height, fitView])

  // Press F to re-centre the graph at any time.
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return
      if (e.key === 'f' || e.key === 'F') fitView(600, 60)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fitView])

  // When a Hard Edges row asks us to focus a specific test edge, pan-zoom the
  // force graph to its midpoint and auto-clear the focus after the flash so
  // the user can click another row immediately.
  useEffect(() => {
    if (focusedEdgeIdx == null || !fgRef.current) return
    const te = taskData?.testEdges?.[focusedEdgeIdx]
    if (!te) return
    const nodes = activeGraphData?.nodes || []
    const s = nodes.find((n) => n.id === te.source)
    const t = nodes.find((n) => n.id === te.target)
    if (!s || !t || !Number.isFinite(s.x) || !Number.isFinite(t.x)) return
    try {
      fgRef.current.centerAt((s.x + t.x) / 2, (s.y + t.y) / 2, 600)
      fgRef.current.zoom(2.2, 600)
    } catch { /* settle */ }
    const clr = setTimeout(() => setFocusedEdge(null), 1800)
    return () => clearTimeout(clr)
  }, [focusedEdgeIdx, taskData, activeGraphData, setFocusedEdge])

  // Setup Lực D3 (không tự fit ở đây — dimension effect sẽ lo refit sau khi
  // simulation settle, tránh race với zoomToFit gây double-animation).
  useEffect(() => {
    if (!fgRef.current || !activeGraphData) return
    const fg = fgRef.current
    fg.d3Force('charge')?.strength(-180).distanceMax(500)
    fg.d3Force('link')?.distance(50)
    fg.d3Force('center')?.strength(0.15)
    fg.d3ReheatSimulation()
  }, [activeGraphData])

  // 2. Tính Common Neighbors
  const commonNeighbors = useMemo(() => {
    if (!hoveredLink || !rawGraphData) return new Set()
    const sId = typeof hoveredLink.source === 'object' ? hoveredLink.source.id : hoveredLink.source
    const tId = typeof hoveredLink.target === 'object' ? hoveredLink.target.id : hoveredLink.target
    const sNeighbors = new Set(), tNeighbors = new Set()
    rawGraphData.links.forEach(l => {
        const u = typeof l.source === 'object' ? l.source.id : l.source
        const v = typeof l.target === 'object' ? l.target.id : l.target
        if (u === sId) sNeighbors.add(v); if (v === sId) sNeighbors.add(u)
        if (u === tId) tNeighbors.add(v); if (v === tId) tNeighbors.add(u)
    })
    return new Set([...sNeighbors].filter(x => tNeighbors.has(x)))
  }, [hoveredLink, rawGraphData])

  // 3. Hàm vẽ cạnh (Laser & Pulse)
  const linkCanvasObject = useCallback((link, ctx, globalScale) => {
    if (!snapshots?.length) return
    const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
    const t = easeInOutCubic(Math.max(0, Math.min(1, currentEpochFloat - epochInt)))
    const snapA = snapshots[epochInt], snapB = snapshots[epochInt + 1] || snapA
    const testEdges = taskData?.testEdges || []

    const sId = link.source.id, tId = link.target.id
    const testIdx = testEdges.findIndex(te => (te.source === sId && te.target === tId) || (te.source === tId && te.target === sId))

    let color = 'rgba(148, 163, 184, 0.12)', width = 1.0, score = 0, isFuture = false
    const hasSelection = selectedNodeId !== null
    const isConnectedToSelected = sId === selectedNodeId || tId === selectedNodeId
    let finalAlpha = hasSelection ? (isConnectedToSelected ? 1.0 : 0.04) : 1.0

    const isHovered = hoveredLink && ((hoveredLink.source.id === sId && hoveredLink.target.id === tId) || (hoveredLink.source.id === tId && hoveredLink.target.id === sId))
    if (hoveredLink && !isHovered) finalAlpha *= 0.2

    if (testIdx !== -1) {
      const scoreA = snapA?.edge_scores?.[testIdx] || 0, scoreB = snapB?.edge_scores?.[testIdx] || scoreA
      score = lerp(scoreA, scoreB, t)
      color = getLinkColor(score)
      // Cap edge width at 4 — previous `2 + score * 4` let confident edges hit 6
      // which over-dominates the canvas at narrow workspace widths.
      width = Math.min(4, 1.5 + score * 3)
      isFuture = !testEdges[testIdx].exists && score > 0.5
    }

    ctx.save(); ctx.globalAlpha = finalAlpha; ctx.beginPath()
    if (isFuture && score > 0.85) {
      ctx.setLineDash([6, 8]); ctx.lineDashOffset = -(performance.now() / 25) % 14
      ctx.shadowColor = color; ctx.shadowBlur = 12 / globalScale; width *= 1.4
    } else if (isFuture) ctx.setLineDash([3, 5])
    else ctx.setLineDash([])

    if (isHovered) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 20 / globalScale; width = 6; color = '#fff' }
    ctx.moveTo(link.source.x, link.source.y); ctx.lineTo(link.target.x, link.target.y)
    ctx.strokeStyle = color; ctx.lineWidth = width / globalScale; ctx.stroke(); ctx.restore()
  }, [snapshots, currentEpochFloat, taskData, selectedNodeId, hoveredLink])

  // 4. Hàm vẽ node (Radar Glow)
  const nodeCanvasObject = useCallback((node, ctx, globalScale) => {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return
    const isSelected = selectedNodeId === node.id, isCommonNeighbor = commonNeighbors.has(node.id)
    const hasContext = selectedNodeId !== null || hoveredLink !== null
    let globalAlpha = hasContext ? (isSelected || isCommonNeighbor ? 1 : 0.15) : 1
    
    if (!showNodes && !isSelected && !isCommonNeighbor) {
      ctx.beginPath(); ctx.arc(node.x, node.y, 1, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(255,255,255,${globalAlpha * 0.1})`; ctx.fill(); return
    }

    const r = isCommonNeighbor ? 11 : Math.max(6, Math.sqrt(node.degree || 1) * 2.5 + 4)
    const color = isCommonNeighbor ? '#fbbf24' : (CLASS_COLORS[groundTruth?.[node.id]] || '#6366f1')

    ctx.save(); ctx.globalAlpha = globalAlpha; ctx.shadowColor = color
    ctx.shadowBlur = (isSelected || isCommonNeighbor) ? 25 / globalScale : 0
    ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, 2 * Math.PI); ctx.fillStyle = color; ctx.fill()
    ctx.strokeStyle = (isSelected || isCommonNeighbor) ? '#fff' : 'rgba(255,255,255,0.3)'
    ctx.lineWidth = (isSelected || isCommonNeighbor ? 3 : 1) / globalScale; ctx.stroke()

    // ID Label (Luôn luôn hiện)
    const fontSize = Math.max(5, (isSelected || isCommonNeighbor ? 13 : 9) / Math.sqrt(globalScale))
    ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    
    // Vẽ nền cho chữ ID để đảm bảo luôn đọc được
    const text = String(node.id)
    const tw = ctx.measureText(text).width
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(node.x - tw/2 - 1, node.y - fontSize/2 - 1, tw + 2, fontSize + 2)

    ctx.fillStyle = '#fff'
    ctx.fillText(text, node.x, node.y)
    
    ctx.restore()
  }, [groundTruth, selectedNodeId, commonNeighbors, showNodes])

  if (!activeGraphData) return <div className="w-full h-full bg-slate-950 flex items-center justify-center text-slate-500 text-[10px] uppercase font-black">Loading...</div>

  const auc = snapshots[Math.floor(currentEpochFloat)]?.auc || 0.5

  return (
    <div ref={containerRef} className="w-full h-full relative bg-slate-950 overflow-hidden">
      <ForceGraph2D
        ref={fgRef}
        graphData={activeGraphData}
        width={dimensions.width}
        height={dimensions.height}
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode={() => 'replace'}
        linkCanvasObject={linkCanvasObject}
        linkCanvasObjectMode={() => 'replace'}
        onNodeClick={(node) => setSelectedNode(selectedNodeId === node.id ? null : node.id)}
        onLinkHover={(link) => setHoveredLink(link)}
        minZoom={0.3}
        maxZoom={3}
        backgroundColor="transparent"
        cooldownTicks={200}
        warmupTicks={30}
        onEngineStop={() => {
          if (fitDoneRef.current) return
          fitDoneRef.current = true
          fitView(400, 60)
        }}
      />

      {/* DYNAMIC GAUGE */}
      <div className="absolute bottom-6 right-6 pointer-events-none flex flex-col items-center">
        <div className="relative w-28 h-14 overflow-hidden mb-2">
            <svg viewBox="0 0 100 50" className="w-full h-full drop-shadow-[0_0_15px_rgba(6,182,212,0.4)]">
                <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" strokeLinecap="round" />
                <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="url(#aucGrad)" strokeWidth="10" strokeLinecap="round" strokeDasharray="125.6" strokeDashoffset={125.6 - (auc * 125.6)} className="transition-all duration-500" />
                <g transform={`translate(50, 50) rotate(${auc * 180 - 90})`} className="transition-all duration-500">
                    <path d="M -2,0 L 0,-38 L 2,0 Z" fill="#fff" /><circle cx="0" cy="0" r="4" fill="#0ea5e9" stroke="#fff" strokeWidth="1" />
                </g>
                <defs><linearGradient id="aucGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#ef4444" /><stop offset="50%" stopColor="#f59e0b" /><stop offset="100%" stopColor="#10b981" /></linearGradient></defs>
            </svg>
        </div>
        <div className="bg-slate-900/90 backdrop-blur-xl rounded-2xl px-4 py-2 border border-white/5 shadow-2xl flex flex-col items-center min-w-[100px]">
          <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest mb-1">Model AUC</span>
          <span className={`text-2xl font-black font-mono leading-none ${auc > 0.85 ? 'text-emerald-400' : auc > 0.7 ? 'text-amber-400' : 'text-red-400'}`}>{auc.toFixed(3)}</span>
        </div>
      </div>

      <div className="absolute top-4 right-4 z-20 flex gap-2">
        <button onClick={() => setShowNodes(!showNodes)} className={`px-3 py-1.5 rounded-xl text-nano font-black tracking-wider uppercase border transition-all ${showNodes ? 'bg-slate-900/90 border-slate-700 text-slate-400 hover:text-white' : 'bg-indigo-600/30 border-indigo-500 text-indigo-300'}`}>Nodes</button>
        <button onClick={() => setShowErrorsOnly(!showErrorsOnly)} className={`px-3 py-1.5 rounded-xl text-nano font-black tracking-wider uppercase border transition-all ${showErrorsOnly ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-slate-900/80 border-slate-700 text-slate-500'}`}>Errors</button>
        <button
          onClick={() => fitView(600, 60)}
          title="Fit to view (F)"
          className="px-3 py-1.5 rounded-xl text-nano font-black tracking-wider uppercase border bg-slate-900/80 border-slate-700 text-slate-400 hover:text-white hover:border-cyan-500/40 transition-all"
        >
          Fit
        </button>
      </div>
    </div>
  )
}
