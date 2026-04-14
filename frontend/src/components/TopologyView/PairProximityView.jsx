import React, { useRef, useEffect, useState, useCallback } from 'react'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { CLASS_COLORS } from '../../utils/colors'

/**
 * PairProximityView — Embedding Space for Task 3 (Link Prediction)
 * 
 * Shows ALL nodes in 2D embedding space with test edge connections.
 * Features: zoom/pan via mouse wheel + drag, hover to highlight connections,
 * large labeled nodes, thick color-coded edge lines with score labels.
 */
export default function PairProximityView() {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [dims, setDims] = useState({ width: 400, height: 300 })
  const [hoveredNode, setHoveredNode] = useState(null)
  const [showNegative, setShowNegative] = useState(true)
  const [showPositive, setShowPositive] = useState(true)

  // Zoom & Pan state
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0 })

  // Data refs
  const graphDataRef = useRef(null)
  const snapshotsRef = useRef([])
  const taskDataRef = useRef(null)
  const epochRef = useRef(0)
  const [dataReady, setDataReady] = useState(false)

  // Capture data from stores
  useEffect(() => {
    const unsub = useGNNStore.subscribe((state) => {
      if (state.graphData?.nodes?.length > 0) {
        graphDataRef.current = state.graphData
        setDataReady(true)
      }
      if (state.taskData?.testEdges) taskDataRef.current = state.taskData
    })
    const state = useGNNStore.getState()
    if (state.graphData?.nodes?.length > 0) {
      graphDataRef.current = state.graphData
      setDataReady(true)
    }
    if (state.taskData?.testEdges) taskDataRef.current = state.taskData
    return unsub
  }, [])

  // Player subscription
  useEffect(() => {
    const unsub = usePlayerStore.subscribe((state) => {
      if (state.snapshots.length > 0) snapshotsRef.current = state.snapshots
      epochRef.current = Math.max(0, Math.min(
        snapshotsRef.current.length - 1,
        Math.floor(state.currentEpochFloat)
      ))
      drawCanvas()
    })
    return unsub
  }, [dims, hoveredNode, zoom, pan, showNegative, showPositive])

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

  // Drawing
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const graphData = graphDataRef.current
    const snapshots = snapshotsRef.current
    const taskData = taskDataRef.current
    const epochInt = epochRef.current

    if (!canvas || !graphData || snapshots.length === 0) return

    const ctx = canvas.getContext('2d')
    const { width, height } = dims
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    const snap = snapshots[epochInt]
    if (!snap?.embeddings_2d) return

    const emb = snap.embeddings_2d
    const testEdges = taskData?.testEdges || []
    const scores = snap.edge_scores || []

    // Compute bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    emb.forEach(([x, y]) => {
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    })
    const rangeX = (maxX - minX) || 1
    const rangeY = (maxY - minY) || 1
    const pad = 35

    // Coordinate transform with zoom & pan
    const sx = (x) => (pad + ((x - minX) / rangeX) * (width - pad * 2)) * zoom + pan.x
    const sy = (y) => (pad + ((y - minY) / rangeY) * (height - pad * 2)) * zoom + pan.y

    // ── Background grid ──
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    const cx0 = sx((minX + maxX) / 2), cy0 = sy((minY + maxY) / 2)
    ctx.moveTo(cx0, 0); ctx.lineTo(cx0, height)
    ctx.moveTo(0, cy0); ctx.lineTo(width, cy0)
    ctx.stroke()

    // ── Draw test edge connections ──
    const posEdges = testEdges.filter(e => e.exists)
    const negEdges = testEdges.filter(e => !e.exists)

    const drawEdge = (e, i) => {
      const p1 = emb[e.source]
      const p2 = emb[e.target]
      if (!p1 || !p2) return

      const score = scores[i] ?? 0.5
      const isHov = hoveredNode === e.source || hoveredNode === e.target
      const dimmed = hoveredNode !== null && !isHov

      ctx.beginPath()
      ctx.moveTo(sx(p1[0]), sy(p1[1]))
      ctx.lineTo(sx(p2[0]), sy(p2[1]))

      if (e.exists) {
        ctx.strokeStyle = dimmed
          ? 'rgba(59, 130, 246, 0.05)'
          : isHov
            ? `rgba(96, 165, 250, 0.9)`
            : `rgba(59, 130, 246, ${0.15 + score * 0.4})`
        ctx.setLineDash([])
        ctx.lineWidth = isHov ? 3 : 1.5 + score * 2
      } else {
        ctx.strokeStyle = dimmed
          ? 'rgba(239, 68, 68, 0.03)'
          : isHov
            ? `rgba(248, 113, 113, 0.8)`
            : `rgba(239, 68, 68, ${0.08 + (1 - score) * 0.2})`
        ctx.setLineDash([6, 4])
        ctx.lineWidth = isHov ? 2.5 : 1
      }
      ctx.stroke()
      ctx.setLineDash([])

      // Score label on hovered edges
      if (isHov) {
        const mx = (sx(p1[0]) + sx(p2[0])) / 2
        const my = (sy(p1[1]) + sy(p2[1])) / 2
        const label = `${(score * 100).toFixed(0)}%`

        // Background pill
        ctx.fillStyle = '#0f172aEE'
        const tw = ctx.measureText(label).width + 8
        ctx.beginPath()
        ctx.roundRect(mx - tw / 2, my - 9, tw, 18, 4)
        ctx.fill()

        ctx.fillStyle = e.exists ? '#60a5fa' : '#f87171'
        ctx.font = 'bold 10px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, mx, my)
      }
    }

    // Draw visible edges
    if (showPositive) posEdges.forEach((e, i) => drawEdge(e, testEdges.indexOf(e)))
    if (showNegative) negEdges.forEach((e, i) => drawEdge(e, testEdges.indexOf(e)))

    // ── Draw all nodes ──
    emb.forEach(([x, y], i) => {
      const cx = sx(x)
      const cy = sy(y)
      const node = graphData.nodes[i]
      const gt = node?.groundTruth ?? (i % 7)
      const color = CLASS_COLORS[gt] || '#64748b'
      const isHov = hoveredNode === i
      const isTestNode = testEdges.some(e => e.source === i || e.target === i)
      const dimmed = hoveredNode !== null && !isHov && !isTestNode
      const r = (isHov ? 10 : isTestNode ? 7 : 5) * Math.sqrt(zoom)

      // Glow for test/hovered nodes
      if ((isTestNode || isHov) && !dimmed) {
        ctx.beginPath()
        ctx.arc(cx, cy, r + 5, 0, 2 * Math.PI)
        ctx.fillStyle = isHov ? 'rgba(255,255,255,0.12)' : color + '18'
        ctx.fill()
      }

      // Main circle
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, 2 * Math.PI)
      ctx.fillStyle = isTestNode ? color : '#475569'
      ctx.globalAlpha = dimmed ? 0.25 : 1
      ctx.fill()
      ctx.globalAlpha = 1

      // Border
      if (isTestNode || isHov) {
        ctx.strokeStyle = isHov ? '#fff' : 'rgba(255,255,255,0.5)'
        ctx.lineWidth = isHov ? 2 : 1.2
        ctx.stroke()
      }

      // Node ID label (always visible for test nodes, zoom-dependent for others)
      if (isTestNode || isHov || zoom > 1.2) {
        const fontSize = isHov ? 10 : 8
        ctx.font = `bold ${fontSize}px monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = '#fff'
        ctx.globalAlpha = dimmed ? 0.3 : 1
        ctx.fillText(`${i}`, cx, cy)
        ctx.globalAlpha = 1
      }
    })

    // (Header removed — handled by PanelHeading in App.jsx)

  }, [dims, hoveredNode, zoom, pan, showNegative, showPositive])

  // Initial draw
  useEffect(() => {
    if (dataReady) drawCanvas()
  }, [dataReady, drawCanvas])

  // ── Mouse interactions ──
  const getNodeAt = useCallback((mx, my) => {
    const emb = snapshotsRef.current[epochRef.current]?.embeddings_2d
    if (!emb) return null

    let minXv = Infinity, maxXv = -Infinity, minYv = Infinity, maxYv = -Infinity
    emb.forEach(([x, y]) => {
      if (x < minXv) minXv = x; if (x > maxXv) maxXv = x
      if (y < minYv) minYv = y; if (y > maxYv) maxYv = y
    })
    const rangeX = (maxXv - minXv) || 1
    const rangeY = (maxYv - minYv) || 1
    const pad = 35
    const { width, height } = dims

    let closestIdx = null, closestDist = 18 / zoom
    emb.forEach(([x, y], i) => {
      const cx = (pad + ((x - minXv) / rangeX) * (width - pad * 2)) * zoom + pan.x
      const cy = (pad + ((y - minYv) / rangeY) * (height - pad * 2)) * zoom + pan.y
      const d = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2)
      if (d < closestDist) { closestDist = d; closestIdx = i }
    })
    return closestIdx
  }, [dims, zoom, pan])

  const handleMouseMove = useCallback((e) => {
    if (dragRef.current.dragging) {
      setPan({
        x: dragRef.current.startPanX + (e.clientX - dragRef.current.startX),
        y: dragRef.current.startPanY + (e.clientY - dragRef.current.startY),
      })
      return
    }
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    setHoveredNode(getNodeAt(e.clientX - rect.left, e.clientY - rect.top))
  }, [getNodeAt])

  const handleMouseDown = useCallback((e) => {
    if (e.button === 0 && e.shiftKey) {
      dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, startPanX: pan.x, startPanY: pan.y }
    }
  }, [pan])

  const handleMouseUp = useCallback(() => {
    dragRef.current.dragging = false
  }, [])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.15 : 0.15
    setZoom(z => Math.max(0.5, Math.min(5, z + delta)))
  }, [])

  const handleMouseLeave = useCallback(() => {
    setHoveredNode(null)
    dragRef.current.dragging = false
  }, [])

  if (!dataReady || snapshotsRef.current.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
        <div className="text-center">
          <div className="text-3xl mb-2 opacity-40">&#8230;</div>
          <p>Link embedding will appear<br/>during training</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="w-full h-full relative bg-slate-950 overflow-hidden">
      <canvas
        ref={canvasRef}
        style={{ width: dims.width, height: dims.height, cursor: dragRef.current.dragging ? 'grabbing' : 'crosshair' }}
        className="absolute inset-0"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
      />

      {/* Controls — top right */}
      <div className="absolute top-1 right-1 z-10 flex gap-1">
        <button
          onClick={() => setShowPositive(!showPositive)}
          className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all border
            ${showPositive
              ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
              : 'bg-slate-800/80 text-slate-600 border-slate-700/50'}`}
        >
          ━ Pos
        </button>
        <button
          onClick={() => setShowNegative(!showNegative)}
          className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all border
            ${showNegative
              ? 'bg-red-500/20 text-red-400 border-red-500/40'
              : 'bg-slate-800/80 text-slate-600 border-slate-700/50'}`}
        >
          ╌ Neg
        </button>
        <button
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}
          className="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-800/80 text-slate-400 border border-slate-700/50 hover:text-white transition-all"
          title="Reset zoom"
        >
          ⟳
        </button>
      </div>

      {/* Legend — bottom left compact */}
      <div className="absolute bottom-1.5 left-1.5 bg-slate-900/90 backdrop-blur-md rounded-lg px-2 py-1.5 border border-slate-700/40 z-10 text-[8px]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-blue-400">
            <div className="w-4 h-0.5 bg-blue-500 rounded-full" /> Pos
          </div>
          <div className="flex items-center gap-1.5 text-red-400">
            <div className="w-4 h-0 border-t border-dashed border-red-500" /> Neg
          </div>
          <div className="flex items-center gap-1.5 text-slate-500">
            <span className="w-2 h-2 rounded-full bg-slate-600" /> Other
          </div>
        </div>
      </div>

      {/* Hovered node tooltip */}
      {hoveredNode !== null && (
        <div className="absolute bottom-2 right-2 bg-slate-900/90 backdrop-blur-md rounded-xl px-3 py-2 border border-slate-700/40 z-10">
          <div className="text-xs text-white font-black mb-0.5">Node {hoveredNode}</div>
          <div className="text-[9px] text-slate-400">
            {(taskDataRef.current?.testEdges || []).filter(e => e.source === hoveredNode || e.target === hoveredNode).map((e, i) => (
              <div key={i} className={`${e.exists ? 'text-blue-400' : 'text-red-400'}`}>
                {e.exists ? '━' : '╌'} → Node {e.source === hoveredNode ? e.target : e.source}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
