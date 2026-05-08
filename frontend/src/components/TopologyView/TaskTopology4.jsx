import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import NodeHoverCard from './NodeHoverCard'
import { polygonHull } from 'd3-polygon'
import { normalizeCommunityCenters } from '../../utils/task4Metrics'
import { interpolateSnapshots } from '../../engine/interpolate'

const COMMUNITY_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#06b6d4', '#ec4899']
// Reference anchors on a 600-unit world. They are re-scaled to the live
// container every time dimensions change so the force-graph never over-zooms
// on small viewports or near-square containers.
const ANCHOR_REFERENCE = [
  { x: -220, y: -150 }, { x: 220, y: -150 },
  { x: -220, y: 150 }, { x: 220, y: 150 },
  { x: 0, y: -250 }, { x: 0, y: 250 },
  { x: 0, y: 0 },
]
const MIN_ZOOM = 0.3
const MAX_ZOOM = 1.4
// Keep nodes readable without letting hubs overwhelm the canvas. Bridge pulse
// is small (+2px) so it doesn't overflow into neighbouring clusters.
const NODE_SIZE_CAP = 11
const NODE_SIZE_MIN = 5

export default function TaskTopology4() {
  const rawGraphData = useGNNStore(s => s.graphData)
  const selectedCommunityId = useGNNStore(s => s.selectedCommunityId)
  const setSelectedCommunity = useGNNStore(s => s.setSelectedCommunity)
  const setHoveredNode = useGNNStore(s => s.setHoveredNode)
  const { snapshots, currentEpochFloat } = usePlayerStore()

  const containerRef = useRef()
  const fgRef = useRef()
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 })

  // Stable graph data shape — nodes & links are re-created in a new reference
  // only when `rawGraphData` identity changes, not on every render.
  const graphData = useMemo(() => {
    if (!rawGraphData) return null
    return {
      nodes: rawGraphData.nodes.map(n => ({ ...n })),
      links: rawGraphData.links.map((l, i) => ({ ...l, _idx: i })),
    }
  }, [rawGraphData])

  // Normalised community anchor centres — rescale whenever the container is
  // resized so we never depend on a fixed ±220 world that stops fitting.
  const centers = useMemo(
    () => normalizeCommunityCenters(ANCHOR_REFERENCE, dimensions.width, dimensions.height, 600),
    [dimensions.width, dimensions.height]
  )

  // Interpolated snapshot for smooth scrubbing
  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const frac = currentEpochFloat - epochInt
  const snapA = snapshots[epochInt] || snapshots[0]
  const snapB = snapshots[Math.min(epochInt + 1, snapshots.length - 1)]
  const snap = frac > 0 && snapB ? interpolateSnapshots(snapA, snapB, frac) : snapA
  // Discrete predictions for force layout and hulls (community labels must be integers)
  const discretePreds = snapA?.node_predictions || []

  // Island force — pull each node toward its predicted community center.
  useEffect(() => {
    if (!(fgRef.current && snapshots.length > 0 && graphData)) return
    const fg = fgRef.current

    fg.d3Force('community', (alpha) => {
      graphData.nodes.forEach((node) => {
        const cid = discretePreds[node.id] ?? 0
        const center = centers[cid % centers.length]
        node.vx += (center.x - node.x) * alpha * 0.08
        node.vy += (center.y - node.y) * alpha * 0.08
      })
    })
    const charge = fg.d3Force('charge')
    if (charge) charge.strength(-120)
    fg.d3ReheatSimulation()
  }, [currentEpochFloat, snapshots, graphData, centers, discretePreds])

  // Resize handler — re-attach whenever the container remounts.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      if (width > 0 && height > 0) setDimensions({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [graphData])

  // Re-fit with generous padding + bound zoom so the view never crushes the
  // nodes up against the viewport edges (the over-zoom complaint).
  useEffect(() => {
    if (!fgRef.current) return
    const id = requestAnimationFrame(() => {
      try {
        fgRef.current && fgRef.current.zoomToFit(600, 80)
      } catch {
        /* settle */
      }
    })
    return () => cancelAnimationFrame(id)
  }, [dimensions.width, dimensions.height])

  // Clamp zoom so manual wheel / pinch cannot explode the canvas.
  const onZoom = useCallback((t) => {
    if (!fgRef.current || !t) return
    if (t.k < MIN_ZOOM) fgRef.current.zoom(MIN_ZOOM, 0)
    else if (t.k > MAX_ZOOM) fgRef.current.zoom(MAX_ZOOM, 0)
  }, [])

  // Fit shortcut — matches the per-task "F" accelerator in the upgrade plan.
  useEffect(() => {
    const handler = (ev) => {
      const t = ev.target
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return
      if (ev.key === 'f' || ev.key === 'F') {
        try { fgRef.current && fgRef.current.zoomToFit(400, 80) } catch { /* ignore */ }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const communityHulls = useMemo(() => {
    if (snapshots.length === 0 || !graphData) return []

    const communities = {}
    graphData.nodes.forEach((node) => {
      const cid = discretePreds[node.id] ?? 0
      if (!communities[cid]) communities[cid] = []
      communities[cid].push([node.x, node.y])
    })
    return Object.entries(communities).map(([cid, points]) => {
      if (points.length < 3) return null
      const hull = polygonHull(points)
      return hull ? { cid: parseInt(cid, 10), path: hull } : null
    }).filter(Boolean)
  }, [currentEpochFloat, snapshots, graphData])

  const nodeCanvasObject = useCallback((node, ctx, globalScale) => {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return

    const communityId = snap?.node_predictions?.[node.id] ?? 0
    const isBridge = snap?.bridge_nodes?.[node.id] || false
    const isSelectedComm = selectedCommunityId != null && communityId === selectedCommunityId
    const isDimmed = selectedCommunityId != null && !isSelectedComm

    const color = COMMUNITY_COLORS[communityId % COMMUNITY_COLORS.length]
    const size = Math.max(NODE_SIZE_MIN, Math.min(NODE_SIZE_CAP, Math.sqrt(node.degree || 1) * 1.6 + 4))

    ctx.globalAlpha = isDimmed ? 0.18 : 1

    if (isBridge) {
      const pulse = (Math.sin(Date.now() / 300) + 1) * 1
      ctx.beginPath()
      ctx.arc(node.x, node.y, size + 2 + pulse, 0, 2 * Math.PI)
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 + pulse / 10})`
      ctx.lineWidth = 1 / globalScale
      ctx.stroke()
    }

    const grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, size)
    grad.addColorStop(0, '#fff')
    grad.addColorStop(0.25, color)
    grad.addColorStop(1, 'rgba(0,0,0,0.2)')
    ctx.beginPath()
    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI)
    ctx.fillStyle = grad
    ctx.fill()

    // ALWAYS show node ID if zoomed in enough to read
    if (globalScale > 0.6) {
      ctx.font = `bold ${10 / globalScale}px Inter, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillStyle = 'white'
      ctx.fillText(`${node.id}`, node.x, node.y + size + 7 / globalScale)
    }

    ctx.globalAlpha = 1
  }, [snap, selectedCommunityId])

  const drawBefore = useCallback((ctx) => {
    communityHulls.forEach((hull) => {
      const color = COMMUNITY_COLORS[hull.cid % COMMUNITY_COLORS.length]
      const dim = selectedCommunityId != null && hull.cid !== selectedCommunityId
      ctx.beginPath()
      ctx.moveTo(hull.path[0][0], hull.path[0][1])
      for (let i = 1; i < hull.path.length; i++) ctx.lineTo(hull.path[i][0], hull.path[i][1])
      ctx.closePath()
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.strokeStyle = dim ? `${color}18` : `${color}44`
      ctx.lineWidth = 28
      ctx.stroke()
      ctx.fillStyle = dim ? `${color}08` : `${color}11`
      ctx.fill()
    })
  }, [communityHulls, selectedCommunityId])

  if (!graphData) return null

  const modularityQ = snap?.modularity_q || 0
  
  // Dynamic active communities from snapshot
  const activeCommunityIds = Array.from(new Set(snap?.node_predictions || [])).sort((a, b) => a - b)

  return (
    <div ref={containerRef} className="w-full h-full relative bg-slate-950 overflow-hidden">
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode={() => 'replace'}
        onRenderFramePre={drawBefore}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        onZoom={onZoom}
        linkColor={(link) => {
          if (!snap) return 'rgba(148,163,184,0.05)'
          const srcComm = snap.node_predictions?.[link.source.id]
          const tgtComm = snap.node_predictions?.[link.target.id]
          if (srcComm == null || tgtComm == null) return 'rgba(148,163,184,0.05)'
          return srcComm === tgtComm
            ? `${COMMUNITY_COLORS[srcComm % COMMUNITY_COLORS.length]}33`
            : 'rgba(148, 163, 184, 0.05)'
        }}
        linkWidth={(link) => {
          if (!snap) return 0.5
          const srcComm = snap.node_predictions?.[link.source.id]
          const tgtComm = snap.node_predictions?.[link.target.id]
          if (srcComm == null || tgtComm == null) return 0.5
          return srcComm === tgtComm ? 1.4 : 0.5
        }}
        cooldownTicks={100}
        backgroundColor="transparent"
        onNodeClick={(node) => {
          const cid = snap?.node_predictions?.[node.id]
          if (cid !== undefined) setSelectedCommunity(cid)
        }}
        onNodeHover={(node) => setHoveredNode(node?.id ?? null)}
        onBackgroundClick={() => setSelectedCommunity(null)}
      />

      <NodeHoverCard />

      {/* Q HUD + Legend — top-right to avoid the dark lower-left band */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2 items-end">
        <div className="bg-panel-soft/80 backdrop-blur-md rounded-lg px-3 py-2 border border-white/5 flex items-center gap-2">
          <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra">Q</span>
          <span className={`text-sm font-black font-mono leading-none ${modularityQ > 0.4 ? 'text-green-400' : 'text-amber-400'}`}>
            {modularityQ.toFixed(3)}
          </span>
          <div className="w-14 bg-slate-800/50 h-1.5 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400"
              style={{ width: `${Math.max(0, Math.min(1, modularityQ)) * 100}%` }}
            />
          </div>
        </div>
        <div className="bg-panel-soft/80 backdrop-blur-md rounded-lg px-3 py-1.5 border border-white/5 flex items-center gap-2 flex-wrap max-w-[220px] justify-end">
          {activeCommunityIds.map((i) => (
            <button
              key={i}
              onClick={() => setSelectedCommunity(selectedCommunityId === i ? null : i)}
              className={`flex items-center gap-1 text-nano font-mono transition-opacity ${
                selectedCommunityId != null && selectedCommunityId !== i ? 'opacity-40 hover:opacity-100' : 'opacity-100'
              }`}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COMMUNITY_COLORS[i % COMMUNITY_COLORS.length] }} />
              <span className="text-slate-400">C{i}</span>
            </button>
          ))}
          <div className="flex items-center gap-1 pl-2 border-l border-slate-700/50">
            <div className="w-2.5 h-2.5 rounded-full border border-white/60 bg-white/10" />
            <span className="text-nano text-slate-400 font-bold">Bridge</span>
          </div>
        </div>
      </div>

      {/* Fit to view — bottom-right, always reachable */}
      <button
        onClick={() => { try { fgRef.current && fgRef.current.zoomToFit(400, 80) } catch { /* ignore */ } }}
        className="absolute bottom-3 right-3 z-10 bg-panel-soft/80 backdrop-blur-md rounded-lg px-3 py-1.5 border border-white/5 text-nano font-bold text-slate-300 hover:text-white hover:border-cyan-500/40 transition-colors uppercase tracking-ultra"
        title="Fit to view (F)"
      >
        Fit · F
      </button>
    </div>
  )
}
