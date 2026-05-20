import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import NodeHoverCard from './NodeHoverCard'
import { polygonHull } from 'd3-polygon'
import { normalizeCommunityCenters } from '../../utils/task4Metrics'
import { interpolateSnapshots, lerp } from '../../engine/interpolate'
import { COMMUNITY_COLORS, getCommunityColor } from '../../utils/colors'
const ANCHOR_REFERENCE = [
  { x: -220, y: -150 }, { x: 220, y: -150 },
  { x: -220, y: 150 }, { x: 220, y: 150 },
  { x: 0, y: -250 }, { x: 0, y: 250 },
  { x: 0, y: 0 },
]
const MIN_ZOOM = 0.3
const MAX_ZOOM = 1.4
const NODE_SIZE_CAP = 11
const NODE_SIZE_MIN = 5

export default function TaskTopology4() {
  const rawGraphData = useGNNStore(s => s.graphData)
  const selectedCommunityId = useGNNStore(s => s.selectedCommunityId)
  const setSelectedCommunity = useGNNStore(s => s.setSelectedCommunity)
  const setHoveredNode = useGNNStore(s => s.setHoveredNode)
  const selectedModel = useGNNStore(s => s.selectedModel)
  const { snapshots, currentEpochFloat } = usePlayerStore()

  const containerRef = useRef()
  const fgRef = useRef()
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 })
  // Auto-derive overlay from selectedModel (selected in LeftSidebar)
  const overlayMode = selectedModel === 'GAT' ? 'attention' : selectedModel === 'GCN' ? 'smoothness' : selectedModel === 'SAGE' ? 'migration' : 'none'

  const graphData = useMemo(() => {
    if (!rawGraphData) return null
    return {
      nodes: rawGraphData.nodes.map(n => ({ ...n })),
      links: rawGraphData.links.map((l, i) => ({ ...l, _idx: i })),
    }
  }, [rawGraphData])

  const centers = useMemo(
    () => normalizeCommunityCenters(ANCHOR_REFERENCE, dimensions.width, dimensions.height, 600),
    [dimensions.width, dimensions.height]
  )

  const epochInt = useMemo(() => Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat))), [currentEpochFloat, snapshots.length])
  const frac = currentEpochFloat - epochInt
  const snapA = snapshots[epochInt] || snapshots[0]
  const snapB = snapshots[Math.min(epochInt + 1, snapshots.length - 1)]
  const snap = frac > 0 && snapB ? interpolateSnapshots(snapA, snapB, frac) : snapA

  // Use aligned predictions as primary source (prevents KMeans label swapping)
  const discretePreds = snapA?.node_predictions_aligned ?? snapA?.node_predictions ?? []
  const discretePredsB = snapB ? (snapB.node_predictions_aligned ?? snapB.node_predictions ?? []) : discretePreds

  // Pre-compute attention map for GAT overlay (read from snapA directly, no interpolation)
  const attentionMap = useMemo(() => {
    if (overlayMode !== 'attention' || !snapA?.attention_edges) return null
    const map = new Map()
    for (const e of snapA.attention_edges) {
      map.set(`${Math.min(e.source, e.target)}-${Math.max(e.source, e.target)}`, e.weight)
    }
    return map
  }, [selectedModel, snapA?.attention_edges])

  // Migration info: which nodes are changing community
  const migratingNodes = useMemo(() => {
    if (!snapA || !snapB) return new Set()
    const s = new Set()
    const predsA = discretePreds
    const predsB = discretePredsB
    for (let i = 0; i < predsA.length; i++) {
      if (predsA[i] !== predsB[i]) s.add(i)
    }
    return s
  }, [discretePreds, discretePredsB, snapA, snapB])

  const migrationRate = migratingNodes.size / Math.max(1, discretePreds.length)
  const maxLocalSmoothness = useMemo(() => {
    if (!Array.isArray(snap?.local_smoothness)) return 1
    const positive = snap.local_smoothness.filter((value) => value > 0)
    return positive.length ? Math.max(...positive, 1) : 1
  }, [snap?.local_smoothness])

  // ── Force layout: pull nodes toward community centers with migration lerp ──
  useEffect(() => {
    if (!(fgRef.current && snapshots.length > 0 && graphData)) return
    const fg = fgRef.current

    fg.d3Force('community', (alpha) => {
      graphData.nodes.forEach((node) => {
        const cidA = discretePreds[node.id] ?? 0
        const cidB = discretePredsB[node.id] ?? cidA

        let targetX, targetY
        if (cidA !== cidB && frac > 0) {
          // Node is migrating — lerp between old and new community centers
          const centerA = centers[cidA % centers.length]
          const centerB = centers[cidB % centers.length]
          targetX = centerA.x + (centerB.x - centerA.x) * frac
          targetY = centerA.y + (centerB.y - centerA.y) * frac
        } else {
          const center = centers[cidA % centers.length]
          targetX = center.x
          targetY = center.y
        }

        node.vx += (targetX - node.x) * alpha * 0.08
        node.vy += (targetY - node.y) * alpha * 0.08
      })
    })
    const charge = fg.d3Force('charge')
    if (charge) charge.strength(-120)
    fg.d3ReheatSimulation()
  }, [epochInt, snapshots, graphData, centers, discretePreds, discretePredsB, frac])

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

  useEffect(() => {
    if (!fgRef.current) return
    const id = requestAnimationFrame(() => {
      try { fgRef.current && fgRef.current.zoomToFit(600, 80) } catch { /* settle */ }
    })
    return () => cancelAnimationFrame(id)
  }, [dimensions.width, dimensions.height])

  const onZoom = useCallback((t) => {
    if (!fgRef.current || !t) return
    if (t.k < MIN_ZOOM) fgRef.current.zoom(MIN_ZOOM, 0)
    else if (t.k > MAX_ZOOM) fgRef.current.zoom(MAX_ZOOM, 0)
  }, [])

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

  // ── Community hulls ────────────────────────────────────────────────────────
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
  }, [currentEpochFloat, snapshots, graphData, discretePreds])

  // ── Node canvas object ─────────────────────────────────────────────────────
  const nodeCanvasObject = useCallback((node, ctx, globalScale) => {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return

    const communityId = discretePreds[node.id] ?? 0
    const isBridge = snap?.bridge_nodes?.[node.id] || false
    const isMigrating = migratingNodes.has(node.id)
    const isSelectedComm = selectedCommunityId != null && communityId === selectedCommunityId
    const isDimmed = selectedCommunityId != null && !isSelectedComm

    // Base color: community or smoothness-tinted
    let color = getCommunityColor(communityId)
    if (overlayMode === 'smoothness' && snap?.local_smoothness) {
      const sm = snap.local_smoothness[node.id] ?? 0
      // Normalize: lower smoothness = more oversmoothed = grayish
      const norm = Math.min(1, sm / maxLocalSmoothness)
      // Blend from gray (#94a3b8) to community color based on smoothness
      const r = Math.round(lerp(0x94, parseInt(color.slice(1, 3), 16), norm))
      const g = Math.round(lerp(0xa3, parseInt(color.slice(3, 5), 16), norm))
      const b = Math.round(lerp(0xb8, parseInt(color.slice(5, 7), 16), norm))
      color = `rgb(${r},${g},${b})`
    }

    const size = Math.max(NODE_SIZE_MIN, Math.min(NODE_SIZE_CAP, Math.sqrt(node.degree || 1) * 1.6 + 4))

    ctx.globalAlpha = isDimmed ? 0.18 : 1

    // Bridge pulse (only in default mode)
    if (isBridge && overlayMode === 'none') {
      const pulse = (Math.sin(Date.now() / 300) + 1) * 1
      ctx.beginPath()
      ctx.arc(node.x, node.y, size + 2 + pulse, 0, 2 * Math.PI)
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 + pulse / 10})`
      ctx.lineWidth = 1 / globalScale
      ctx.stroke()
    }

    // Migration yellow border
    if (isMigrating && overlayMode === 'migration') {
      ctx.beginPath()
      ctx.arc(node.x, node.y, size + 3, 0, 2 * Math.PI)
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.8)'
      ctx.lineWidth = 2 / globalScale
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

    // Node ID: only show when zoomed deep OR node is migrating/bridge/hovered
    const showId = globalScale > 0.9 || (isMigrating && overlayMode === 'migration') || (isBridge && overlayMode === 'none')
    if (showId) {
      ctx.font = `bold ${10 / globalScale}px Inter, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillStyle = 'white'
      ctx.fillText(`${node.id}`, node.x, node.y + size + 7 / globalScale)
    }

    ctx.globalAlpha = 1
  }, [snap, selectedCommunityId, discretePreds, migratingNodes, overlayMode, maxLocalSmoothness])

  // ── Draw before (hulls + migration trails) ─────────────────────────────────
  const drawBefore = useCallback((ctx) => {
    // Hulls — thin stroke (6px, not 28px)
    communityHulls.forEach((hull) => {
      const color = getCommunityColor(hull.cid)
      const dim = selectedCommunityId != null && hull.cid !== selectedCommunityId
      ctx.beginPath()
      ctx.moveTo(hull.path[0][0], hull.path[0][1])
      for (let i = 1; i < hull.path.length; i++) ctx.lineTo(hull.path[i][0], hull.path[i][1])
      ctx.closePath()
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.strokeStyle = dim ? `${color}20` : `${color}44`
      ctx.lineWidth = dim ? 4 : 8
      ctx.stroke()
      ctx.fillStyle = dim ? `${color}08` : `${color}18`
      ctx.fill()
    })

    // Migration trails (only in migration overlay mode)
    if (overlayMode === 'migration' && snapB && graphData) {
      for (const nodeId of migratingNodes) {
        const node = graphData.nodes[nodeId]
        if (!node) continue
        const cidA = discretePreds[nodeId] ?? 0
        const cidB = discretePredsB[nodeId] ?? cidA
        const fromCenter = centers[cidA % centers.length]
        const toCenter = centers[cidB % centers.length]

        ctx.beginPath()
        ctx.moveTo(node.x, node.y)
        const trailX = fromCenter.x + (toCenter.x - fromCenter.x) * frac
        const trailY = fromCenter.y + (toCenter.y - fromCenter.y) * frac
        ctx.lineTo(trailX, trailY)
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)'
        ctx.lineWidth = 2
        ctx.setLineDash([3, 3])
        ctx.stroke()
        ctx.setLineDash([])
      }
    }
  }, [communityHulls, selectedCommunityId, overlayMode, snapB, graphData, migratingNodes, discretePreds, discretePredsB, centers, frac])

  if (!graphData) return null

  const modularityQ = snap?.modularity_q ?? 0
  const activeCommunityIds = Array.from(new Set(discretePreds)).sort((a, b) => a - b)

  // Overlay-specific metric
  const overlayMetric = overlayMode === 'attention'
    ? snap?.attention_boundary_ratio
    : overlayMode === 'smoothness'
      ? snap?.dirichlet_energy
      : overlayMode === 'migration'
        ? migrationRate
        : null

  const overlayMetricLabel = overlayMode === 'attention'
    ? 'Boundary'
    : overlayMode === 'smoothness'
      ? 'Dirichlet'
      : overlayMode === 'migration'
        ? 'Migration'
        : ''

  return (
    <div ref={containerRef} className="w-full h-full relative bg-white dark:bg-slate-950 overflow-hidden">
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
          const srcId = link.source.id ?? link.source
          const tgtId = link.target.id ?? link.target
          const srcComm = discretePreds[srcId]
          const tgtComm = discretePreds[tgtId]
          if (srcComm == null || tgtComm == null) return 'rgba(148,163,184,0.05)'

          // Attention overlay: highlight cross-community edges with high attention
          if (overlayMode === 'attention' && attentionMap && srcComm !== tgtComm) {
            const key = `${Math.min(srcId, tgtId)}-${Math.max(srcId, tgtId)}`
            const w = attentionMap.get(key) ?? 0
            if (w > 0.1) {
              const alpha = 0.3 + w * 0.7
              return `rgba(251, 191, 36, ${alpha})`
            }
          }

          return srcComm === tgtComm
            ? `${getCommunityColor(srcComm)}44`
            : 'rgba(148, 163, 184, 0.08)'
        }}
        linkWidth={(link) => {
          if (!snap) return 0.5
          const srcId = link.source.id ?? link.source
          const tgtId = link.target.id ?? link.target
          const srcComm = discretePreds[srcId]
          const tgtComm = discretePreds[tgtId]
          if (srcComm == null || tgtComm == null) return 0.5

          if (overlayMode === 'attention' && attentionMap && srcComm !== tgtComm) {
            const key = `${Math.min(srcId, tgtId)}-${Math.max(srcId, tgtId)}`
            const w = attentionMap.get(key) ?? 0
            if (w > 0.1) return 0.5 + w * 3
          }

          return srcComm === tgtComm ? 1.4 : 0.5
        }}
        cooldownTicks={100}
        backgroundColor="transparent"
        onNodeClick={(node) => {
          const cid = discretePreds[node.id]
          if (cid !== undefined) setSelectedCommunity(cid)
        }}
        onNodeHover={(node) => setHoveredNode(node?.id ?? null)}
        onBackgroundClick={() => setSelectedCommunity(null)}
      />

      <NodeHoverCard />

      {/* ── HUD — top-right ──────────────────────────────────────────────────── */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2 items-end">
        {/* Q score */}
        <div className="bg-white/85 dark:bg-slate-900/80 backdrop-blur-md rounded-lg px-3 py-2 border border-slate-300/60 dark:border-slate-700/40 flex items-center gap-2 shadow-sm">
          <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra">Q</span>
          <span className={`text-sm font-black font-mono leading-none ${modularityQ > 0.4 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
            {modularityQ.toFixed(3)}
          </span>
          <div className="w-14 bg-slate-200 dark:bg-slate-800/50 h-1.5 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 dark:bg-amber-400"
              style={{ width: `${Math.max(0, Math.min(1, modularityQ)) * 100}%` }}
            />
          </div>
        </div>

        {/* Overlay metric (auto-shown when model has data) */}
        {overlayMode !== 'none' && overlayMetric != null && (
          <div className="bg-white/85 dark:bg-slate-900/80 backdrop-blur-md rounded-lg px-3 py-1.5 border border-slate-300/60 dark:border-slate-700/40 flex items-center gap-2 shadow-sm">
            <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra">{overlayMetricLabel}</span>
            <span className="text-sm font-black font-mono leading-none text-cyan-600 dark:text-cyan-400">
              {overlayMode === 'migration'
                ? `${(overlayMetric * 100).toFixed(1)}%`
                : overlayMetric.toFixed(4)}
            </span>
          </div>
        )}

        {/* Community legend */}
        <div className="bg-white/85 dark:bg-slate-900/80 backdrop-blur-md rounded-lg px-3 py-1.5 border border-slate-300/60 dark:border-slate-700/40 flex items-center gap-2 flex-wrap max-w-[220px] justify-end shadow-sm">
          {activeCommunityIds.map((i) => (
            <button
              key={i}
              onClick={() => setSelectedCommunity(selectedCommunityId === i ? null : i)}
              className={`flex items-center gap-1 text-nano font-mono transition-opacity ${
                selectedCommunityId != null && selectedCommunityId !== i ? 'opacity-40 hover:opacity-100' : 'opacity-100'
              }`}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getCommunityColor(i) }} />
              <span className="text-slate-400">C{i}</span>
            </button>
          ))}
          {overlayMode === 'none' && (
            <div className="flex items-center gap-1 pl-2 border-l border-slate-700/50">
              <div className="w-2.5 h-2.5 rounded-full border border-white/60 bg-white/10" />
              <span className="text-nano text-slate-400 font-bold">Bridge</span>
            </div>
          )}
          {overlayMode === 'migration' && migratingNodes.size > 0 && (
            <div className="flex items-center gap-1 pl-2 border-l border-slate-700/50">
              <div className="w-2.5 h-2.5 rounded-full border-2 border-amber-400 bg-amber-400/20" />
              <span className="text-nano text-slate-400 font-bold">Migrating</span>
            </div>
          )}
        </div>
      </div>

      {/* Fit to view */}
      <button
        onClick={() => { try { fgRef.current && fgRef.current.zoomToFit(400, 80) } catch { /* ignore */ } }}
        className="absolute bottom-3 right-3 z-10 bg-white/85 dark:bg-slate-900/80 backdrop-blur-md rounded-lg px-3 py-1.5 border border-slate-300/60 dark:border-slate-700/40 text-nano font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-cyan-500/40 transition-colors uppercase tracking-ultra shadow-sm"
        title="Fit to view (F)"
      >
        Fit · F
      </button>
    </div>
  )
}
