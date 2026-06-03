import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import NodeHoverCard from './NodeHoverCard'
import { polygonHull } from 'd3-polygon'
import {
  buildCommunityAnchors,
  buildCoreCommunityEnvelopes,
  buildTask4MotionProfile,
  buildTask4ReasoningPack,
  buildTask4ReasoningHighlights,
  getTask4OverlayMode,
} from '../../utils/task4Metrics'
import { easeInOutCubic, interpolateSnapshots, lerp } from '../../engine/interpolate'
import { getCommunityColor } from '../../utils/colors'
import { getTask4Copy } from '../../utils/task4I18n'
const MIN_ZOOM = 0.3
const MAX_ZOOM = 1.4
const NODE_SIZE_CAP = 11
const NODE_SIZE_MIN = 5

function withAlpha(color, alpha) {
  if (!color) return `rgba(148, 163, 184, ${alpha})`
  if (color.startsWith('#') && color.length >= 7) {
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (match) return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`
  return `rgba(148, 163, 184, ${alpha})`
}

export default function TaskTopology4({ viewMode = null, reportMode = false }) {
  const copy = getTask4Copy()
  const rawGraphData = useGNNStore(s => s.graphData)
  const selectedCommunityId = useGNNStore(s => s.selectedCommunityId)
  const selectedNodeId = useGNNStore(s => s.selectedNodeId)
  const setSelectedCommunity = useGNNStore(s => s.setSelectedCommunity)
  const setSelectedNode = useGNNStore(s => s.setSelectedNode)
  const setHoveredNode = useGNNStore(s => s.setHoveredNode)
  const selectedModel = useGNNStore(s => s.selectedModel)
  const { snapshots, currentEpochFloat } = usePlayerStore()

  const containerRef = useRef()
  const fgRef = useRef()
  const layoutStateRef = useRef({
    centers: [],
    discretePreds: [],
    discretePredsB: [],
    frac: 0,
    communityStrength: 0.038,
  })
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 })
  const [visualMode, setVisualMode] = useState(reportMode ? 'bridges' : (viewMode || 'community'))
  const [spotlightCollapsed, setSpotlightCollapsed] = useState(!reportMode)
  const effectiveVisualMode = reportMode ? 'bridges' : visualMode
  // Auto-derive overlay from selectedModel (selected in LeftSidebar)
  const overlayMode = getTask4OverlayMode(selectedModel)

  const graphData = useMemo(() => {
    if (!rawGraphData) return null
    return {
      nodes: rawGraphData.nodes.map(n => ({ ...n })),
      links: rawGraphData.links.map((l, i) => ({ ...l, _idx: i })),
    }
  }, [rawGraphData])

  const epochInt = useMemo(() => Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat))), [currentEpochFloat, snapshots.length])
  const frac = currentEpochFloat - epochInt
  const easedFrac = easeInOutCubic(Math.max(0, Math.min(1, frac)))
  const snapA = snapshots[epochInt] || snapshots[0]
  const snapB = snapshots[Math.min(epochInt + 1, snapshots.length - 1)]
  const snap = frac > 0 && snapB ? interpolateSnapshots(snapA, snapB, easedFrac) : snapA

  // Use aligned predictions as primary source (prevents KMeans label swapping)
  const discretePreds = snapA?.node_predictions_aligned ?? snapA?.node_predictions ?? []
  const discretePredsB = snapB ? (snapB.node_predictions_aligned ?? snapB.node_predictions ?? []) : discretePreds
  const communityCount = useMemo(() => {
    const values = discretePreds.filter(Number.isFinite)
    return values.length ? Math.max(...values) + 1 : 1
  }, [discretePreds])
  const centers = useMemo(
    () => buildCommunityAnchors(communityCount, dimensions.width, dimensions.height),
    [communityCount, dimensions.width, dimensions.height]
  )

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
  const motionProfile = useMemo(() => buildTask4MotionProfile({
    nodeCount: graphData?.nodes?.length || 0,
    linkCount: graphData?.links?.length || 0,
    migrationRate,
    selectedCommunityId,
  }), [graphData?.nodes?.length, graphData?.links?.length, migrationRate, selectedCommunityId])
  const reasoning = useMemo(
    () => ({
      ...buildTask4ReasoningPack(snapA, snapshots, graphData, selectedModel),
      ...buildTask4ReasoningHighlights(snapA, snapshots, selectedModel),
    }),
    [snapA, snapshots, graphData, selectedModel]
  )
  const spotlight = useMemo(() => {
    const map = {
      strong: {
        label: 'Tach cum ro',
        note: copy.descriptions.spotlightStrong,
        tone: 'emerald',
      },
      mixed: {
        label: 'Ranh gioi vua',
        note: copy.descriptions.spotlightMixed,
        tone: 'cyan',
      },
      boundary: {
        label: 'Nut bien cao',
        note: copy.descriptions.spotlightBoundary,
        tone: 'amber',
      },
      leakage: {
        label: 'Dang ro ri',
        note: copy.descriptions.spotlightLeakage,
        tone: 'rose',
      },
      migration: {
        label: 'Dang dao dong',
        note: copy.descriptions.spotlightMigration,
        tone: 'violet',
      },
      confidence: {
        label: 'Tin cay thap',
        note: copy.descriptions.spotlightConfidence,
        tone: 'amber',
      },
    }
    return map[reasoning.dominantIssue] || map.mixed
  }, [reasoning.dominantIssue])

  useEffect(() => {
    layoutStateRef.current = {
      centers,
      discretePreds,
      discretePredsB,
      frac: easedFrac,
      communityStrength: motionProfile.communityStrength,
    }
  }, [centers, discretePreds, discretePredsB, easedFrac, motionProfile.communityStrength])

  const maxLocalSmoothness = useMemo(() => {
    if (!Array.isArray(snap?.local_smoothness)) return 1
    const positive = snap.local_smoothness.filter((value) => value > 0)
    return positive.length ? Math.max(...positive, 1) : 1
  }, [snap?.local_smoothness])

  // Ă¢â€â‚¬Ă¢â€â‚¬ Force layout: pull nodes toward community centers with migration lerp Ă¢â€â‚¬Ă¢â€â‚¬
  useEffect(() => {
    if (!(fgRef.current && snapshots.length > 0 && graphData)) return
    const fg = fgRef.current

    fg.d3Force('community', (alpha) => {
      const activeLayout = layoutStateRef.current
      if (!activeLayout.centers.length) return

      graphData.nodes.forEach((node) => {
        const cidA = activeLayout.discretePreds[node.id] ?? 0
        const cidB = activeLayout.discretePredsB[node.id] ?? cidA

        let targetX, targetY
        if (cidA !== cidB && activeLayout.frac > 0) {
          // Node is migrating Ă¢â‚¬â€ lerp between old and new community centers
          const centerA = activeLayout.centers[cidA % activeLayout.centers.length]
          const centerB = activeLayout.centers[cidB % activeLayout.centers.length]
          targetX = centerA.x + (centerB.x - centerA.x) * activeLayout.frac
          targetY = centerA.y + (centerB.y - centerA.y) * activeLayout.frac
        } else {
          const center = activeLayout.centers[cidA % activeLayout.centers.length]
          targetX = center.x
          targetY = center.y
        }

        node.vx += (targetX - node.x) * alpha * activeLayout.communityStrength
        node.vy += (targetY - node.y) * alpha * activeLayout.communityStrength
      })
    })
    const charge = fg.d3Force('charge')
    if (charge) charge.strength(motionProfile.chargeStrength)
    const link = fg.d3Force('link')
    if (link) link.distance(motionProfile.linkDistance)
    const center = fg.d3Force('center')
    if (center) center.strength(motionProfile.centerStrength)
    fg.d3VelocityDecay?.(motionProfile.velocityDecay)
    fg.d3AlphaDecay?.(motionProfile.alphaDecay)
    fg.d3ReheatSimulation()
  }, [
    graphData,
    motionProfile.alphaDecay,
    motionProfile.centerStrength,
    motionProfile.chargeStrength,
    motionProfile.linkDistance,
    motionProfile.velocityDecay,
    snapshots.length,
  ])

  useEffect(() => {
    if (!fgRef.current || snapshots.length === 0) return undefined
    const id = requestAnimationFrame(() => {
      try {
        fgRef.current?.d3ReheatSimulation?.()
      } catch {
        // Ignore transient simulation errors while snapshots stream in.
      }
    })
    return () => cancelAnimationFrame(id)
  }, [epochInt, snapshots.length])

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

  // Ă¢â€â‚¬Ă¢â€â‚¬ Community hulls Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬
  const communityHulls = useMemo(() => {
    if (snapshots.length === 0 || !graphData) return []
    return buildCoreCommunityEnvelopes(graphData.nodes, discretePreds, snap, { padding: 28 })
      .map((envelope) => {
        if (envelope.type === 'circle') return envelope
        const hull = polygonHull(envelope.points)
        return hull ? { cid: envelope.cid, type: 'hull', path: hull } : null
      })
      .filter(Boolean)
  }, [currentEpochFloat, snapshots, graphData, discretePreds, snap])

  // Ă¢â€â‚¬Ă¢â€â‚¬ Node canvas object Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬
  const nodeCanvasObject = useCallback((node, ctx, globalScale) => {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return

    const communityId = discretePreds[node.id] ?? 0
    const isBridge = snap?.bridge_nodes?.[node.id] || false
    const isMigrating = migratingNodes.has(node.id)
    const isSelectedNode = selectedNodeId === node.id
    const isSelectedComm = selectedCommunityId != null && communityId === selectedCommunityId
    const isDimmed = (selectedCommunityId != null && !isSelectedComm)
      || (effectiveVisualMode === 'bridges' && !isBridge && !isSelectedNode)
      || (effectiveVisualMode === 'stability' && !isMigrating && !isSelectedNode)

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
    const clock = performance.now()

    ctx.globalAlpha = isDimmed ? 0.18 : 1

    if (motionProfile.showNodeGlow && !isDimmed) {
      const glowScale = isSelectedComm ? 1.2 : 1
      const glow = ctx.createRadialGradient(node.x, node.y, size * 0.65, node.x, node.y, size * 3.4)
      glow.addColorStop(0, withAlpha(color, 0.18))
      glow.addColorStop(0.58, withAlpha(color, 0.07))
      glow.addColorStop(1, withAlpha(color, 0))
      ctx.beginPath()
      ctx.arc(node.x, node.y, size * 3.4 * glowScale, 0, 2 * Math.PI)
      ctx.fillStyle = glow
      ctx.fill()
    }

    // Bridge pulse (only in default mode)
    if (isBridge && (overlayMode === 'none' || effectiveVisualMode === 'bridges')) {
      const pulse = (Math.sin(clock / 420) + 1) * 0.85
      ctx.beginPath()
      ctx.arc(node.x, node.y, size + 2 + pulse, 0, 2 * Math.PI)
      ctx.strokeStyle = effectiveVisualMode === 'bridges'
        ? `rgba(251, 191, 36, ${0.36 + pulse / 10})`
        : `rgba(255, 255, 255, ${0.22 + pulse / 12})`
      ctx.lineWidth = 1.15 / globalScale
      ctx.stroke()
    }

    // Migration yellow border
    if (isMigrating && (overlayMode === 'migration' || effectiveVisualMode === 'stability')) {
      const pulse = 1 + Math.sin(clock / 360 + node.id * 0.7) * 0.5
      ctx.beginPath()
      ctx.arc(node.x, node.y, size + 2.6 + pulse, 0, 2 * Math.PI)
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.72)'
      ctx.lineWidth = 1.8 / globalScale
      ctx.stroke()
    }

    const grad = ctx.createRadialGradient(
      node.x - size * 0.35,
      node.y - size * 0.45,
      0,
      node.x,
      node.y,
      size
    )
    grad.addColorStop(0, 'rgba(255,255,255,0.9)')
    grad.addColorStop(0.28, color)
    grad.addColorStop(1, 'rgba(15,23,42,0.72)')
    ctx.beginPath()
    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI)
    ctx.fillStyle = grad
    ctx.fill()

    if (isSelectedNode) {
      ctx.beginPath()
      ctx.arc(node.x, node.y, size + 5, 0, 2 * Math.PI)
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.92)'
      ctx.lineWidth = 2.5 / globalScale
      ctx.shadowColor = 'rgba(34, 211, 238, 0.55)'
      ctx.shadowBlur = 14 / globalScale
      ctx.stroke()
      ctx.shadowBlur = 0
    }

    // Node ID: only show when zoomed deep OR node is migrating/bridge/hovered
    const showId = globalScale > 0.9 || (isMigrating && (overlayMode === 'migration' || effectiveVisualMode === 'stability')) || (isBridge && (overlayMode === 'none' || effectiveVisualMode === 'bridges'))
    if (showId) {
      ctx.font = `bold ${10 / globalScale}px Inter, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillStyle = 'white'
      ctx.fillText(`${node.id}`, node.x, node.y + size + 7 / globalScale)
    }

    ctx.globalAlpha = 1
  }, [snap, selectedNodeId, selectedCommunityId, discretePreds, migratingNodes, overlayMode, effectiveVisualMode, maxLocalSmoothness, motionProfile.showNodeGlow])

  // Ă¢â€â‚¬Ă¢â€â‚¬ Draw before (hulls + migration trails) Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬
  const drawBefore = useCallback((ctx, globalScale = 1) => {
    const shouldRenderEnvelope = reportMode || selectedCommunityId != null

    communityHulls.forEach((hull) => {
      if (!shouldRenderEnvelope) return
      if (selectedCommunityId != null && hull.cid !== selectedCommunityId) return
      const color = getCommunityColor(hull.cid)
      const dim = selectedCommunityId != null && hull.cid !== selectedCommunityId
      ctx.beginPath()
      if (hull.type === 'circle') {
        ctx.arc(hull.center.x, hull.center.y, hull.radius, 0, 2 * Math.PI)
      } else {
        ctx.moveTo(hull.path[0][0], hull.path[0][1])
        for (let i = 1; i < hull.path.length; i++) ctx.lineTo(hull.path[i][0], hull.path[i][1])
        ctx.closePath()
      }
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      const bridgeMode = effectiveVisualMode === 'bridges'
      ctx.save()
      ctx.shadowColor = withAlpha(color, bridgeMode ? 0.08 : 0.12)
      ctx.shadowBlur = 18 / Math.max(globalScale, 0.85)
      ctx.fillStyle = dim ? withAlpha(color, 0.012) : withAlpha(color, bridgeMode ? 0.02 : 0.04)
      ctx.fill()
      ctx.restore()
      ctx.strokeStyle = dim ? withAlpha(color, 0.035) : withAlpha(color, bridgeMode ? 0.06 : 0.1)
      ctx.lineWidth = (dim ? motionProfile.hullStrokeWidth * 0.16 : motionProfile.hullStrokeWidth * 0.24) / Math.max(globalScale, 0.85)
      ctx.stroke()
    })

    // Migration trails (only in migration overlay mode)
    if (overlayMode === 'migration' && motionProfile.showMigrationTrails && snapB && graphData) {
      for (const nodeId of migratingNodes) {
        const node = graphData.nodes[nodeId]
        if (!node) continue
        const cidA = discretePreds[nodeId] ?? 0
        const cidB = discretePredsB[nodeId] ?? cidA
        const fromCenter = centers[cidA % centers.length]
        const toCenter = centers[cidB % centers.length]

        const trailX = fromCenter.x + (toCenter.x - fromCenter.x) * easedFrac
        const trailY = fromCenter.y + (toCenter.y - fromCenter.y) * easedFrac
        const midX = (node.x + trailX) / 2
        const midY = (node.y + trailY) / 2 - 18 / Math.max(globalScale, 0.8)

        ctx.beginPath()
        ctx.moveTo(node.x, node.y)
        ctx.quadraticCurveTo(midX, midY, trailX, trailY)
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.34)'
        ctx.lineWidth = 1.8 / Math.max(globalScale, 0.85)
        ctx.setLineDash([4 / Math.max(globalScale, 0.85), 7 / Math.max(globalScale, 0.85)])
        ctx.lineDashOffset = -(performance.now() / 44) % (11 / Math.max(globalScale, 0.85))
        ctx.stroke()
        ctx.setLineDash([])
      }
    }
  }, [communityHulls, selectedCommunityId, reportMode, motionProfile.hullStrokeWidth, motionProfile.showMigrationTrails, overlayMode, effectiveVisualMode, snapB, graphData, migratingNodes, discretePreds, discretePredsB, centers, easedFrac])

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
    ? copy.labels.attentionBoundary
    : overlayMode === 'smoothness'
      ? copy.labels.dirichlet
      : overlayMode === 'migration'
        ? copy.labels.migration
        : ''

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-[#050816]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.06),transparent_32%),radial-gradient(circle_at_80%_18%,rgba(99,102,241,0.07),transparent_28%),radial-gradient(circle_at_48%_82%,rgba(236,72,153,0.05),transparent_34%)]" />
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

          if (effectiveVisualMode === 'bridges' && srcComm !== tgtComm) {
            return 'rgba(251, 191, 36, 0.42)'
          }
          if (effectiveVisualMode === 'bridges') {
            return withAlpha(getCommunityColor(srcComm), 0.08)
          }

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
            ? withAlpha(getCommunityColor(srcComm), selectedCommunityId != null ? 0.18 : 0.26)
            : 'rgba(148, 163, 184, 0.075)'
        }}
        linkWidth={(link) => {
          if (!snap) return 0.5
          const srcId = link.source.id ?? link.source
          const tgtId = link.target.id ?? link.target
          const srcComm = discretePreds[srcId]
          const tgtComm = discretePreds[tgtId]
          if (srcComm == null || tgtComm == null) return 0.5

          if (effectiveVisualMode === 'bridges') {
            return srcComm === tgtComm ? 0.45 : 1.9
          }

          if (overlayMode === 'attention' && attentionMap && srcComm !== tgtComm) {
            const key = `${Math.min(srcId, tgtId)}-${Math.max(srcId, tgtId)}`
            const w = attentionMap.get(key) ?? 0
            if (w > 0.1) return 0.5 + w * 3
          }

          return srcComm === tgtComm ? 1.4 : 0.5
        }}
        cooldownTicks={motionProfile.cooldownTicks}
        warmupTicks={motionProfile.warmupTicks}
        backgroundColor="transparent"
        nodeLabel={(node) => {
          const cid = discretePreds[node.id]
          const bridge = snap?.bridge_strength?.[node.id]
          const conf = snap?.cluster_confidence?.[node.id]
          return `${copy.labels.node} ${node.id} | C${cid ?? '?'}${Number.isFinite(conf) ? ` | ${copy.labels.confidence.toLowerCase()} ${(conf * 100).toFixed(1)}%` : ''}${Number.isFinite(bridge) && bridge > 0 ? ` | ${copy.labels.bridge.toLowerCase()} ${(bridge * 100).toFixed(1)}%` : ''}`
        }}
        onNodeClick={(node) => {
          const cid = discretePreds[node.id]
          if (cid !== undefined) setSelectedCommunity(cid)
          setSelectedNode(node.id)
        }}
        onNodeHover={(node) => setHoveredNode(node?.id ?? null)}
        onBackgroundClick={() => {
          setSelectedCommunity(null)
          setSelectedNode(null)
        }}
      />

      <NodeHoverCard />

      <div className="absolute top-3 left-3 z-10 flex max-w-[290px] flex-col gap-2">
        <div className="rounded-xl border border-white/10 bg-slate-950/78 px-3 py-2.5 backdrop-blur-md shadow-[0_14px_34px_rgba(2,6,23,0.48)]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.2em] text-cyan-300">
              Task 4
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] ${
                  spotlight.tone === 'emerald' ? 'bg-emerald-400/15 text-emerald-300' :
                  spotlight.tone === 'rose' ? 'bg-rose-400/15 text-rose-300' :
                  spotlight.tone === 'violet' ? 'bg-violet-400/15 text-violet-300' :
                  spotlight.tone === 'amber' ? 'bg-amber-400/15 text-amber-300' :
                  'bg-cyan-400/15 text-cyan-300'
                }`}>
                  {spotlight.label}
                </span>
              </div>
              <div className="mt-2 text-[13px] font-black leading-tight text-white">{copy.labels.communityDetection}</div>
              <div className="mt-1 text-[11px] leading-snug text-slate-300">{spotlight.note}</div>
            </div>
            {!reportMode && (
              <button
                onClick={() => setSpotlightCollapsed((value) => !value)}
                className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300 transition-colors hover:border-cyan-400/30 hover:text-white"
              >
                {spotlightCollapsed ? 'Mo rong' : 'Thu gon'}
              </button>
            )}
          </div>
          {!spotlightCollapsed && (
            <>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-mono">
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-slate-200">
                  Q {modularityQ.toFixed(3)}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-slate-200">
                  {copy.labels.bridgeRatio} {((snap?.bridge_ratio ?? 0) * 100).toFixed(1)}%
                </span>
                {Number.isFinite(snap?.best_epoch) && (
                  <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-cyan-200">
                    {copy.labels.bestEpoch} {snap.best_epoch}
                  </span>
                )}
              </div>
              <div className="mt-2.5 grid gap-1.5">
                {reasoning.worstCommunity && (
                  <SpotlightRailItem
                    tone="rose"
                    title={copy.labels.communityIssue}
                    label={`C${reasoning.worstCommunity.id}`}
                    detail={`${reasoning.worstCommunity.bridgeCount} bridge / ${reasoning.worstCommunity.size} ${copy.labels.nodesInCommunity.toLowerCase()}`}
                  />
                )}
                {reasoning.bestCommunity && (
                  <SpotlightRailItem
                    tone="emerald"
                    title={copy.labels.cleanestCommunity}
                    label={`C${reasoning.bestCommunity.id}`}
                    detail={`${((reasoning.bestCommunity.cleanliness || 0) * 100).toFixed(0)}% sach bien`}
                  />
                )}
                <SpotlightRailItem
                  tone="cyan"
                  title={copy.labels.thisEpoch}
                  label={copy.labels.change}
                  detail={reasoning.epochChangeSummary}
                />
              </div>
            </>
          )}
        </div>

        {!reportMode && (
          <div className="flex gap-1 rounded-xl border border-white/10 bg-slate-950/72 p-1.5 backdrop-blur-md shadow-[0_12px_30px_rgba(2,6,23,0.45)]">
            {[
              ['community', copy.labels.communityMode],
              ['bridges', copy.labels.bridgeMode],
              ['stability', copy.labels.stabilityMode],
            ].map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setVisualMode(mode)}
                className={`rounded-lg px-3 py-1.5 text-nano font-black uppercase tracking-ultra transition-all ${
                  effectiveVisualMode === mode
                    ? 'bg-slate-800 text-white shadow-inner shadow-cyan-500/10'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Ă¢â€â‚¬Ă¢â€â‚¬ HUD Ă¢â‚¬â€ top-right Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬ */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2 items-end">
        {/* Q score */}
        <div className="bg-slate-950/74 backdrop-blur-md rounded-xl px-3 py-2 border border-white/10 flex items-center gap-2 shadow-[0_12px_28px_rgba(2,6,23,0.4)]">
          <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra">Q</span>
          <span className={`text-sm font-black font-mono leading-none ${modularityQ > 0.4 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
            {modularityQ.toFixed(3)}
          </span>
          <div className="w-14 bg-slate-800/70 h-1.5 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 dark:bg-amber-400"
              style={{ width: `${Math.max(0, Math.min(1, modularityQ)) * 100}%` }}
            />
          </div>
        </div>

        {/* Overlay metric (auto-shown when model has data) */}
        {overlayMode !== 'none' && overlayMetric != null && (
          <div className="bg-slate-950/74 backdrop-blur-md rounded-xl px-3 py-1.5 border border-white/10 flex items-center gap-2 shadow-[0_12px_28px_rgba(2,6,23,0.4)]">
            <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra">{overlayMetricLabel}</span>
            <span className="text-sm font-black font-mono leading-none text-cyan-600 dark:text-cyan-400">
              {overlayMode === 'migration'
                ? `${(overlayMetric * 100).toFixed(1)}%`
                : overlayMetric.toFixed(4)}
            </span>
          </div>
        )}

        {/* Community legend */}
        <div className="bg-slate-950/74 backdrop-blur-md rounded-xl px-3 py-1.5 border border-white/10 flex items-center gap-2 flex-wrap max-w-[240px] justify-end shadow-[0_12px_28px_rgba(2,6,23,0.4)]">
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
              <span className="text-nano text-slate-400 font-bold">{copy.labels.bridgeNode}</span>
            </div>
          )}
          {overlayMode === 'migration' && migratingNodes.size > 0 && (
            <div className="flex items-center gap-1 pl-2 border-l border-slate-700/50">
              <div className="w-2.5 h-2.5 rounded-full border-2 border-amber-400 bg-amber-400/20" />
              <span className="text-nano text-slate-400 font-bold">{copy.labels.migratingNode}</span>
            </div>
          )}
        </div>
      </div>

      {/* Fit to view */}
      <button
        onClick={() => { try { fgRef.current && fgRef.current.zoomToFit(400, 80) } catch { /* ignore */ } }}
        className="absolute bottom-3 right-3 z-10 bg-slate-950/74 backdrop-blur-md rounded-xl px-3 py-1.5 border border-white/10 text-nano font-bold text-slate-300 hover:text-white hover:border-cyan-500/40 transition-colors uppercase tracking-ultra shadow-[0_12px_28px_rgba(2,6,23,0.4)]"
        title={`${copy.labels.fit} (F)`}
      >
        {copy.labels.fit} - F
      </button>
    </div>
  )
}

function SpotlightRailItem({ tone = 'cyan', title, label, detail }) {
  const toneMap = {
    rose: 'border-rose-400/15 bg-rose-400/[0.05] text-rose-100',
    emerald: 'border-emerald-400/15 bg-emerald-400/[0.05] text-emerald-100',
    cyan: 'border-cyan-400/15 bg-cyan-400/[0.05] text-cyan-100',
  }

  return (
    <div className={`rounded-lg border px-2.5 py-2 ${toneMap[tone] || toneMap.cyan}`}>
      <div className="text-[9px] uppercase tracking-[0.2em] text-slate-400">{title}</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="text-[11px] font-bold text-white">{label}</div>
      </div>
      <div className="mt-1 text-[10px] leading-snug text-slate-300">{detail}</div>
    </div>
  )
}
