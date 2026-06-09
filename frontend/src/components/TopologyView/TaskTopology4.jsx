import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import NodeHoverCard from './NodeHoverCard'
import { polygonHull } from 'd3-polygon'
import {
  buildCommunityAnchors,
  buildCoreCommunityEnvelopes,
  buildTask4LayoutIntensity,
  buildTask4MotionProfile,
  buildTask4ReasoningPack,
  buildTask4ReasoningHighlights,
  buildTask4PredictionToGroundTruthMap,
  getTask4PhaseMeta,
  getTask4OverlayMode,
} from '../../utils/task4Metrics'
import { easeInOutCubic, interpolateSnapshots, lerp } from '../../engine/interpolate'
import { getCommunityColor } from '../../utils/colors'
import { getTask4Copy } from '../../utils/task4I18n'
const MIN_ZOOM = 0.3
const MAX_ZOOM = 1.4
const NODE_SIZE_CAP = 11
const NODE_SIZE_MIN = 5

function useDarkThemeFlag() {
  const [isDarkTheme, setIsDarkTheme] = useState(() => {
    if (typeof document === 'undefined') return false
    return document.documentElement.classList.contains('dark')
  })

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const root = document.documentElement
    const syncTheme = () => setIsDarkTheme(root.classList.contains('dark'))
    syncTheme()
    const observer = new MutationObserver(syncTheme)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return isDarkTheme
}

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

function parseColorChannels(color) {
  if (!color) return [148, 163, 184]
  if (color.startsWith('#') && color.length >= 7) {
    return [
      parseInt(color.slice(1, 3), 16),
      parseInt(color.slice(3, 5), 16),
      parseInt(color.slice(5, 7), 16),
    ]
  }
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (match) {
    return [
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
    ]
  }
  return [148, 163, 184]
}

function blendColors(colorA, colorB, ratio = 0.5) {
  const weight = Math.max(0, Math.min(1, ratio))
  const [aR, aG, aB] = parseColorChannels(colorA)
  const [bR, bG, bB] = parseColorChannels(colorB)
  return `rgb(${Math.round(lerp(aR, bR, weight))},${Math.round(lerp(aG, bG, weight))},${Math.round(lerp(aB, bB, weight))})`
}

export default function TaskTopology4({ viewMode = null, reportMode = false }) {
  const copy = getTask4Copy()
  const isDarkTheme = useDarkThemeFlag()
  const rawGraphData = useGNNStore(s => s.graphData)
  const selectedCommunityId = useGNNStore(s => s.selectedCommunityId)
  const selectedNodeId = useGNNStore(s => s.selectedNodeId)
  const setSelectedCommunity = useGNNStore(s => s.setSelectedCommunity)
  const setSelectedNode = useGNNStore(s => s.setSelectedNode)
  const setHoveredNode = useGNNStore(s => s.setHoveredNode)
  const communityGroundTruth = useGNNStore(s => s.communityGroundTruth)
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
  const timelineProgress = useMemo(() => {
    if (snapshots.length <= 1) return 0
    return Math.max(0, Math.min(1, currentEpochFloat / (snapshots.length - 1)))
  }, [currentEpochFloat, snapshots.length])

  // Use aligned predictions directly (no temporal smoothing — it causes lag)
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
  const groundTruthByNode = useMemo(() => {
    if (!graphData?.nodes?.length && !communityGroundTruth?.length) return []
    const values = []
    for (const node of graphData?.nodes || []) {
      values[node.id] = node.community ?? node.communityGT ?? communityGroundTruth?.[node.id] ?? null
    }
    if (communityGroundTruth?.length) {
      communityGroundTruth.forEach((value, idx) => {
        if (values[idx] == null) values[idx] = value
      })
    }
    return values
  }, [graphData?.nodes, communityGroundTruth])
  const predToGroundTruth = useMemo(
    () => buildTask4PredictionToGroundTruthMap(discretePreds, groundTruthByNode),
    [discretePreds, groundTruthByNode]
  )

  // Pre-compute attention map for GAT overlay (read from snapA directly, no interpolation)
  const attentionMap = useMemo(() => {
    if (overlayMode !== 'attention' || !snapA?.attention_edges) return null
    const map = new Map()
    for (const e of snapA.attention_edges) {
      map.set(`${Math.min(e.source, e.target)}-${Math.max(e.source, e.target)}`, e.weight)
    }
    return map
  }, [overlayMode, snapA?.attention_edges])

  // Pre-compute SAGE robustness migration nodes for edge highlighting.
  const sageMigrationNodeSet = useMemo(() => {
    if (overlayMode !== 'migration' || !Array.isArray(snapA?.sage_noise_migrations)) return null
    const set = new Set()
    snapA.sage_noise_migrations.forEach((didMigrate, nodeId) => {
      if (didMigrate) set.add(nodeId)
    })
    return set
  }, [overlayMode, snapA?.sage_noise_migrations])

  const isSageMigrationEdge = useMemo(() => {
    if (!sageMigrationNodeSet) return null
    return (srcId, tgtId) => sageMigrationNodeSet.has(srcId) || sageMigrationNodeSet.has(tgtId)
  }, [sageMigrationNodeSet])

  const hasSageMigrationNodes = useMemo(
    () => Boolean(sageMigrationNodeSet && sageMigrationNodeSet.size > 0),
    [sageMigrationNodeSet]
  )

  const migrationEdgeStyle = useMemo(() => {
    if (!hasSageMigrationNodes) return null
    const robustness = snapA?.sage_robustness
    const alpha = robustness == null ? 0.45 : Math.max(0.28, Math.min(0.72, 1 - robustness + 0.18))
    return {
      active: `rgba(34, 211, 238, ${alpha})`,
      inactive: 'rgba(148, 163, 184, 0.06)',
    }
  }, [hasSageMigrationNodes, snapA?.sage_robustness])

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
  const layoutIntensity = useMemo(() => buildTask4LayoutIntensity({
    progress: timelineProgress,
    modularity: snap?.modularity_q ?? 0,
    selectedCommunityId,
  }), [timelineProgress, snap?.modularity_q, selectedCommunityId])
  const phaseMeta = useMemo(() => getTask4PhaseMeta(snap?.training_phase), [snap?.training_phase])
  const baselineSimilarity = Number.isFinite(snap?.baseline_similarity) ? snap.baseline_similarity : null
  const visualizationConfidence = Number.isFinite(snap?.visualization_confidence) ? snap.visualization_confidence : null
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
      communityStrength: motionProfile.communityStrength * layoutIntensity.forceMultiplier,
      anchorBlend: layoutIntensity.anchorBlend,
    }
  }, [centers, discretePreds, discretePredsB, easedFrac, motionProfile.communityStrength, layoutIntensity.forceMultiplier, layoutIntensity.anchorBlend])

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
          // 2-phase migration: first color changes, then node gets pulled
          const centerA = activeLayout.centers[cidA % activeLayout.centers.length]
          const centerB = activeLayout.centers[cidB % activeLayout.centers.length]
          // Phase 1 (0–0.4): stay at old center, color starts changing
          // Phase 2 (0.4–1.0): get pulled toward new center
          const pullStart = 0.4
          const pullT = Math.max(0, Math.min(1, (activeLayout.frac - pullStart) / (1 - pullStart)))
          const smoothPull = pullT * pullT * (3 - 2 * pullT) // smoothstep for smooth suction
          targetX = centerA.x + (centerB.x - centerA.x) * smoothPull
          targetY = centerA.y + (centerB.y - centerA.y) * smoothPull
        } else {
          const center = activeLayout.centers[cidA % activeLayout.centers.length]
          targetX = center.x * activeLayout.anchorBlend
          targetY = center.y * activeLayout.anchorBlend
        }

        node.vx += (targetX - node.x) * alpha * activeLayout.communityStrength
        node.vy += (targetY - node.y) * alpha * activeLayout.communityStrength
      })
    })
    const charge = fg.d3Force('charge')
    if (charge) charge.strength(motionProfile.chargeStrength)
    const link = fg.d3Force('link')
    if (link) {
      // Cross-community edges stretch longer → creates visible gaps between island clusters
      link.distance((l) => {
        const preds = layoutStateRef.current.discretePreds
        if (!preds.length) return motionProfile.linkDistance
        const srcId = l.source?.id ?? l.source
        const tgtId = l.target?.id ?? l.target
        const srcComm = preds[srcId]
        const tgtComm = preds[tgtId]
        const base = motionProfile.linkDistance
        return (srcComm != null && tgtComm != null && srcComm !== tgtComm) ? base * layoutIntensity.crossEdgeSpread : base
      })
    }
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
    layoutIntensity.crossEdgeSpread,
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

  // Re-center after simulation settles
  useEffect(() => {
    if (!fgRef.current || snapshots.length === 0) return undefined
    const timer = setTimeout(() => {
      try { fgRef.current?.zoomToFit(400, 60) } catch { /* ignore */ }
    }, 1200)
    return () => clearTimeout(timer)
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
  // Community hulls are computed LIVE inside drawBefore each frame
  // so they follow node positions during simulation (no stale useMemo).

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

    // Base color: community, with slow smooth transition for migrating nodes
    let color = getCommunityColor(communityId)
    if (isMigrating) {
      // Transition strictly within the current frac so changes are sharp and immediate
      const oldColor = getCommunityColor(discretePreds[node.id] ?? 0)
      const newColor = getCommunityColor(discretePredsB[node.id] ?? 0)
      const [oldR, oldG, oldB] = parseColorChannels(oldColor)
      const [newR, newG, newB] = parseColorChannels(newColor)
      const r = Math.round(lerp(oldR, newR, easedFrac))
      const g = Math.round(lerp(oldG, newG, easedFrac))
      const b = Math.round(lerp(oldB, newB, easedFrac))
      color = `rgb(${r},${g},${b})`
    }

    // Smoothness overlay: only when user explicitly selects GCN model
    if (overlayMode === 'smoothness' && snap?.local_smoothness) {
      const sm = snap.local_smoothness[node.id] ?? 0
      const maxSm = Math.max(1, ...snap.local_smoothness.filter(v => v > 0))
      const norm = Math.min(1, sm / maxSm)
      const [baseR, baseG, baseB] = parseColorChannels(color)
      const r = Math.round(lerp(0x94, baseR, norm))
      const g = Math.round(lerp(0xa3, baseG, norm))
      const b = Math.round(lerp(0xb8, baseB, norm))
      color = `rgb(${r},${g},${b})`
    }

    // Wrong community: emphasize the error state on the node itself.
    const gt = groundTruthByNode?.[node.id]
    const alignedGt = communityId != null ? predToGroundTruth.get(communityId) : null
    const isWrong = gt != null && alignedGt != null && alignedGt !== gt
    if (isWrong) {
      color = blendColors(color, '#ef4444', isDarkTheme ? 0.72 : 0.78)
    }

    const size = Math.max(NODE_SIZE_MIN, Math.min(NODE_SIZE_CAP, Math.sqrt(node.degree || 1) * 1.6 + 4))

    // SAGE robustness overlay: highlight nodes that migrate under noise
    if (overlayMode === 'migration' && snap?.sage_noise_migrations?.[node.id]) {
      ctx.beginPath()
      ctx.arc(node.x, node.y, size + 3, 0, 2 * Math.PI)
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.75)'
      ctx.lineWidth = 2.5 / globalScale
      ctx.stroke()

      color = blendColors(color, '#ef4444', isDarkTheme ? 0.4 : 0.5)
    }

    ctx.globalAlpha = isDimmed ? layoutIntensity.selectedDimOpacity : 1

    // Flat 2D circle — solid fill, no gradient/sphere illusion
    ctx.beginPath()
    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI)
    ctx.fillStyle = color
    ctx.fill()
    // Thin white border for clean node separation
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 0.8 / globalScale
    ctx.stroke()

    // Wrong community: keep the red ring so the error survives zoomed-out views.
    if (isWrong && !isDimmed) {
      ctx.beginPath()
      ctx.arc(node.x, node.y, size + 2, 0, 2 * Math.PI)
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)'
      ctx.lineWidth = 1.8 / globalScale
      ctx.stroke()
    }

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

    // Node ID: white text centered inside node
    const fontSize = Math.max(7, size * 0.8)
    ctx.font = `bold ${fontSize}px Inter, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // Dark shadow for readability
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillText(`${node.id}`, node.x + 0.5, node.y + 0.5)
    // White text
    ctx.fillStyle = '#ffffff'
    ctx.fillText(`${node.id}`, node.x, node.y)

    ctx.globalAlpha = 1
  }, [snap, selectedNodeId, selectedCommunityId, discretePreds, discretePredsB, migratingNodes, overlayMode, effectiveVisualMode, isDarkTheme, easedFrac, epochInt, currentEpochFloat, snapshots.length, layoutIntensity.selectedDimOpacity, groundTruthByNode, predToGroundTruth])

  // Ă¢â€â‚¬Ă¢â€â‚¬ Draw before (hulls + migration trails) Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬
  // Hull wraps ALL nodes in predicted community (correct + wrong)
  const drawBefore = useCallback((ctx, globalScale = 1) => {
    if (!graphData || snapshots.length === 0 || !discretePreds.length) return

    // Khi node dịch chuyển > 40% (pullStart = 0.4), vỏ bọc Hull phải đi theo cụm mới
    const predsForHull = easedFrac > 0.4 ? discretePredsB : discretePreds
    const liveHulls = buildCoreCommunityEnvelopes(graphData.nodes, predsForHull, snap, { padding: 20 })
      .map((envelope) => {
        if (envelope.type === 'circle') return envelope
        const hull = polygonHull(envelope.points)
        return hull ? { cid: envelope.cid, type: 'hull', path: hull } : null
      })
      .filter(Boolean)

    liveHulls.forEach((hull) => {
      const color = getCommunityColor(hull.cid)
      const dim = selectedCommunityId != null && hull.cid !== selectedCommunityId

      let cx = 0, cy = 0, maxR = 0
      if (hull.type === 'circle') {
        cx = hull.center.x; cy = hull.center.y; maxR = hull.radius
      } else {
        for (const p of hull.path) { cx += p[0]; cy += p[1] }
        cx /= hull.path.length; cy /= hull.path.length
        for (const p of hull.path) {
          const d = Math.hypot(p[0] - cx, p[1] - cy)
          if (d > maxR) maxR = d
        }
      }

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

      // Gradient fill (disable complex fx for large graphs)
      ctx.save()
      if (motionProfile.isLargeGraph) {
        ctx.fillStyle = withAlpha(color, dim ? 0.02 : 0.12)
      } else {
        ctx.shadowColor = withAlpha(color, dim ? 0.03 : 0.12)
        ctx.shadowBlur = 18 / Math.max(globalScale, 0.85)
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR)
        if (dim) {
          grad.addColorStop(0, withAlpha(color, 0.04))
          grad.addColorStop(1, withAlpha(color, 0.01))
        } else {
          grad.addColorStop(0, withAlpha(color, 0.18))
          grad.addColorStop(0.7, withAlpha(color, 0.10))
          grad.addColorStop(1, withAlpha(color, 0.04))
        }
        ctx.fillStyle = grad
      }
      ctx.fill()
      ctx.restore()

      // Dashed coastline border
      ctx.save()
      ctx.setLineDash(dim ? [3, 5] : [6, 4])
      ctx.strokeStyle = dim ? withAlpha(color, 0.08) : withAlpha(color, 0.4)
      ctx.lineWidth = (dim ? 1 : 1.8) / Math.max(globalScale, 0.85)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()

      // Community label at center
      if (!dim && maxR > 20) {
        ctx.font = `bold ${Math.max(10, Math.min(16, maxR * 0.18)) / Math.max(globalScale, 0.85)}px Inter, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = withAlpha(color, 0.6)
        ctx.fillText(`C${hull.cid}`, cx, cy)
      }
    })
  }, [selectedCommunityId, motionProfile.hullStrokeWidth, motionProfile.isLargeGraph, overlayMode, graphData, discretePreds, snap, snapshots.length])

  if (!graphData) return null

  const modularityQ = snap?.modularity_q ?? 0
  const activeCommunityIds = Array.from(new Set(discretePreds)).sort((a, b) => a - b)

  // Overlay-specific metric
  const overlayMetric = overlayMode === 'attention'
    ? snap?.attention_boundary_ratio
    : overlayMode === 'smoothness'
      ? snap?.dirichlet_energy
      : overlayMode === 'migration'
        ? (snap?.sage_robustness ?? migrationRate)
        : null

  const overlayMetricLabel = overlayMode === 'attention'
    ? copy.labels.attentionBoundary
    : overlayMode === 'smoothness'
      ? copy.labels.dirichlet
      : overlayMode === 'migration'
        ? (snap?.sage_robustness != null ? 'Robustness' : copy.labels.migration)
        : ''

  return (
    <div ref={containerRef} className={`lab-task4-shell ${isDarkTheme ? 'lab-task4-shell-dark' : 'lab-task4-shell-light'} w-full h-full relative overflow-hidden`}>
      <div className={`pointer-events-none absolute inset-0 ${isDarkTheme ? 'lab-task4-backdrop-dark' : 'lab-task4-backdrop-light'}`} />
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
          if (!snap) return 'rgba(148,163,184,0.1)'
          const srcId = link.source.id ?? link.source
          const tgtId = link.target.id ?? link.target
          const srcComm = discretePreds[srcId]
          const tgtComm = discretePreds[tgtId]
          if (srcComm == null || tgtComm == null) return 'rgba(148,163,184,0.1)'
          const isCross = srcComm !== tgtComm

          // GAT Attention Mode: only show high-attention cross-community edges
          if (overlayMode === 'attention' && attentionMap && isCross) {
            const edgeKey = `${Math.min(srcId, tgtId)}-${Math.max(srcId, tgtId)}`
            const weight = attentionMap.get(edgeKey) ?? 0
            // Only show edges with significant attention (>0.15)
            if (weight > 0.15) {
              const alpha = Math.min(0.7, weight * 2)
              return `rgba(251, 191, 36, ${alpha})`
            }
          }

          // SAGE robustness mode: highlight edges attached to nodes that migrate under noise.
          if (overlayMode === 'migration' && migrationEdgeStyle && isSageMigrationEdge) {
            return isSageMigrationEdge(srcId, tgtId)
              ? migrationEdgeStyle.active
              : migrationEdgeStyle.inactive
          }

          // Bridge mode: highlight cross-community edges
          if (effectiveVisualMode === 'bridges' && isCross) return 'rgba(251, 191, 36, 0.5)'
          if (effectiveVisualMode === 'bridges') return withAlpha(getCommunityColor(srcComm), 0.12)

          // Selected node/community: highlight cross-community edges
          if (isCross) {
            const nodeSelected = selectedNodeId != null && (srcId === selectedNodeId || tgtId === selectedNodeId)
            const commSelected = selectedCommunityId != null && (srcComm === selectedCommunityId || tgtComm === selectedCommunityId)
            if (nodeSelected || commSelected) return 'rgba(251, 191, 36, 0.5)'
          }

          // Default: show all edges — cross-community faint, intra-community clear
          if (isCross) return 'rgba(148, 163, 184, 0.08)'
          return withAlpha(getCommunityColor(srcComm), 0.35)
        }}
        linkWidth={(link) => {
          if (!snap) return 0.5
          const srcId = link.source.id ?? link.source
          const tgtId = link.target.id ?? link.target
          const srcComm = discretePreds[srcId]
          const tgtComm = discretePreds[tgtId]
          if (srcComm == null || tgtComm == null) return 0.5
          const isCross = srcComm !== tgtComm

          // GAT Attention Mode: thicker lines for high-attention cross-community edges
          if (overlayMode === 'attention' && attentionMap && isCross) {
            const edgeKey = `${Math.min(srcId, tgtId)}-${Math.max(srcId, tgtId)}`
            const weight = attentionMap.get(edgeKey) ?? 0
            if (weight > 0.15) return Math.max(0.5, weight * 4)
          }

          // SAGE robustness mode: unstable-neighborhood edges are thicker, stable context is faint.
          if (overlayMode === 'migration' && migrationEdgeStyle && isSageMigrationEdge) {
            return isSageMigrationEdge(srcId, tgtId) ? 1.8 : 0.25
          }

          if (effectiveVisualMode === 'bridges') return isCross ? 1.8 : 0.4
          if (isCross) return 0.4
          return 1.0
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

      <div className="absolute bottom-14 left-3 z-10 flex max-w-[270px] flex-col gap-2">
        {/* Toggle button — controls BOTH spotlight + mode buttons */}
        {!reportMode && (
          <button
            onClick={() => setSpotlightCollapsed((value) => !value)}
            className={`self-start rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] backdrop-blur-md transition-colors ${isDarkTheme ? 'border border-white/10 bg-slate-950/72 text-slate-300 hover:border-cyan-400/30 hover:text-white' : 'border border-slate-200 bg-white/90 text-slate-700 hover:border-rose-300 hover:text-slate-950'}`}
          >
            {spotlightCollapsed ? '▸ Mo rong' : '▾ Thu gon'}
          </button>
        )}

        {/* Spotlight card — hidden when collapsed */}
        {!spotlightCollapsed && (
          <div className={`rounded-xl px-3 py-2.5 backdrop-blur-md ${isDarkTheme ? 'lab-task4-overlay-card-dark' : 'lab-task4-overlay-card-light'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.2em] ${isDarkTheme ? 'bg-cyan-400/15 text-cyan-300' : 'bg-rose-500/10 text-rose-500'}`}>
                    Task 4
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] ${spotlight.tone === 'emerald' ? (isDarkTheme ? 'bg-emerald-400/15 text-emerald-300' : 'bg-emerald-500/10 text-emerald-600') :
                      spotlight.tone === 'rose' ? (isDarkTheme ? 'bg-rose-400/15 text-rose-300' : 'bg-rose-500/10 text-rose-600') :
                        spotlight.tone === 'violet' ? (isDarkTheme ? 'bg-violet-400/15 text-violet-300' : 'bg-fuchsia-500/10 text-fuchsia-600') :
                          spotlight.tone === 'amber' ? (isDarkTheme ? 'bg-amber-400/15 text-amber-300' : 'bg-amber-500/10 text-amber-600') :
                            (isDarkTheme ? 'bg-cyan-400/15 text-cyan-300' : 'bg-sky-500/10 text-sky-600')
                    }`}>
                    {spotlight.label}
                  </span>
                </div>
                <div className={`mt-2 text-[13px] font-black leading-tight ${isDarkTheme ? 'text-white' : 'text-slate-950'}`}>{copy.labels.communityDetection}</div>
                <div className={`mt-1 text-[11px] leading-snug ${isDarkTheme ? 'text-slate-300' : 'text-slate-600'}`}>{spotlight.note}</div>
                <div className={`mt-1 text-[10px] font-bold uppercase tracking-[0.14em] ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                  {phaseMeta.label}
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-mono">
              <span className={`rounded-full px-2 py-0.5 ${isDarkTheme ? 'border border-amber-400/20 bg-amber-400/10 text-amber-200' : 'border border-amber-200 bg-amber-50 text-amber-700'}`}>
                {snap?.training_phase === 'baseline' ? 'Baseline chưa train' : phaseMeta.note}
              </span>
              <span className={`rounded-full px-2 py-0.5 ${isDarkTheme ? 'border border-white/10 bg-white/5 text-slate-200' : 'border border-slate-200 bg-white text-slate-700'}`}>
                Q {modularityQ.toFixed(3)}
              </span>
              {baselineSimilarity != null && (
                <span className={`rounded-full px-2 py-0.5 ${isDarkTheme ? 'border border-cyan-400/20 bg-cyan-400/10 text-cyan-200' : 'border border-sky-200 bg-sky-50 text-sky-700'}`}>
                  Baseline {baselineSimilarity.toFixed(3)}
                </span>
              )}
              {visualizationConfidence != null && (
                <span className={`rounded-full px-2 py-0.5 ${isDarkTheme ? 'border border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200' : 'border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700'}`}>
                  Độ tin cậy trực quan {(visualizationConfidence * 100).toFixed(0)}%
                </span>
              )}
              <span className={`rounded-full px-2 py-0.5 ${isDarkTheme ? 'border border-white/10 bg-white/5 text-slate-200' : 'border border-slate-200 bg-white text-slate-700'}`}>
                {copy.labels.bridgeRatio} {((snap?.bridge_ratio ?? 0) * 100).toFixed(1)}%
              </span>
              {Number.isFinite(snap?.best_epoch) && (
                <span className={`rounded-full px-2 py-0.5 ${isDarkTheme ? 'border border-cyan-400/20 bg-cyan-400/10 text-cyan-200' : 'border border-sky-200 bg-sky-50 text-sky-700'}`}>
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
          </div>
        )}

        {/* Mode buttons — always visible, but compact icons when collapsed */}
        {!reportMode && (
          <div className={`flex gap-1 rounded-xl p-1.5 backdrop-blur-md ${isDarkTheme ? 'border border-white/10 bg-slate-950/72 shadow-[0_12px_30px_rgba(2,6,23,0.45)]' : 'border border-slate-200 bg-white/90 shadow-[0_12px_30px_rgba(15,23,42,0.08)]'}`}>
            {[
              ['community', copy.labels.communityMode],
              ['bridges', copy.labels.bridgeMode],
              ['stability', copy.labels.stabilityMode],
            ].map(([mode, label]) => {
              const isActive = effectiveVisualMode === mode
              return (
                <button
                  key={mode}
                  onClick={() => setVisualMode(mode)}
                  className={`rounded-lg px-3 py-1.5 text-nano font-black uppercase tracking-ultra transition-all ${isActive
                      ? (isDarkTheme ? 'bg-slate-800 text-white shadow-inner shadow-cyan-500/10' : 'bg-[var(--gradient-primary)] text-white shadow-[0_10px_20px_-12px_rgba(220,38,38,0.45)]')
                      : (isDarkTheme ? 'text-slate-400 hover:text-slate-100 hover:bg-white/5' : 'text-slate-500 hover:text-slate-950 hover:bg-slate-100')
                    }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Ă¢â€â‚¬Ă¢â€â‚¬ HUD Ă¢â‚¬â€ top-right Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬Ă¢â€â‚¬ */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2 items-end">
        {/* Q score */}
        <div className={`backdrop-blur-md rounded-xl px-3 py-2 flex items-center gap-2 ${isDarkTheme ? 'border border-white/10 bg-slate-950/74 shadow-[0_12px_28px_rgba(2,6,23,0.4)]' : 'border border-slate-200 bg-white/92 shadow-[0_12px_28px_rgba(15,23,42,0.08)]'}`}>
          <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra">Q</span>
          <span className={`text-sm font-black font-mono leading-none ${modularityQ > 0.4 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
            {modularityQ.toFixed(3)}
          </span>
          <div className={`w-14 h-1.5 rounded-full overflow-hidden ${isDarkTheme ? 'bg-slate-800/70' : 'bg-slate-200'}`}>
            <div
              className="h-full bg-amber-500 dark:bg-amber-400"
              style={{ width: `${Math.max(0, Math.min(1, modularityQ)) * 100}%` }}
            />
          </div>
        </div>

        {/* Model overlay badge */}
        {overlayMode !== 'none' && (
          <div className={`backdrop-blur-md rounded-xl px-3 py-1.5 flex items-center gap-2 ${isDarkTheme ? 'border border-white/10 bg-slate-950/74 shadow-[0_12px_28px_rgba(2,6,23,0.4)]' : 'border border-slate-200 bg-white/92 shadow-[0_12px_28px_rgba(15,23,42,0.08)]'}`}>
            <span className={`text-[10px] font-black uppercase tracking-wider ${
              overlayMode === 'smoothness' ? 'text-emerald-400' :
              overlayMode === 'attention' ? 'text-amber-400' :
              'text-cyan-400'
            }`}>
              {overlayMode === 'smoothness' ? 'GCN' : overlayMode === 'attention' ? 'GAT' : 'SAGE'}
            </span>
            <span className="text-nano text-slate-400">
              {overlayMode === 'smoothness' ? 'Smoothness overlay' :
               overlayMode === 'attention' ? 'Attention overlay' :
               'Robustness overlay'}
            </span>
          </div>
        )}

        {/* Overlay metric (auto-shown when model has data) */}
        {overlayMode !== 'none' && overlayMetric != null && (
          <div className={`backdrop-blur-md rounded-xl px-3 py-1.5 flex items-center gap-2 ${isDarkTheme ? 'border border-white/10 bg-slate-950/74 shadow-[0_12px_28px_rgba(2,6,23,0.4)]' : 'border border-slate-200 bg-white/92 shadow-[0_12px_28px_rgba(15,23,42,0.08)]'}`}>
            <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra">{overlayMetricLabel}</span>
            <span className="text-sm font-black font-mono leading-none text-cyan-600 dark:text-cyan-400">
              {overlayMode === 'migration'
                ? `${(overlayMetric * 100).toFixed(1)}%`
                : overlayMetric.toFixed(4)}
            </span>
          </div>
        )}

        {/* Community legend */}
        <div className={`backdrop-blur-md rounded-xl px-3 py-1.5 flex items-center gap-2 flex-wrap max-w-[240px] justify-end ${isDarkTheme ? 'border border-white/10 bg-slate-950/74 shadow-[0_12px_28px_rgba(2,6,23,0.4)]' : 'border border-slate-200 bg-white/92 shadow-[0_12px_28px_rgba(15,23,42,0.08)]'}`}>
          {activeCommunityIds.map((i) => (
            <button
              key={i}
              onClick={() => setSelectedCommunity(selectedCommunityId === i ? null : i)}
              className={`flex items-center gap-1 text-nano font-mono transition-opacity ${selectedCommunityId != null && selectedCommunityId !== i ? 'opacity-40 hover:opacity-100' : 'opacity-100'
                }`}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getCommunityColor(i) }} />
              <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600'}>C{i}</span>
            </button>
          ))}
          {/* Correct/Wrong node legend — only when ground truth available */}
          {graphData?.nodes?.some(n => n.community != null || n.communityGT != null) && (
            <div className={`flex items-center gap-1.5 pl-2 ${isDarkTheme ? 'border-l border-slate-700/50' : 'border-l border-slate-200'}`}>
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className={`text-nano ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>Khớp GT sau align</span>
              <div className="w-2 h-2 rounded-full bg-red-400" />
              <span className={`text-nano ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>Lệch GT sau align</span>
            </div>
          )}
          {overlayMode === 'none' && (
            <div className={`flex items-center gap-1 pl-2 ${isDarkTheme ? 'border-l border-slate-700/50' : 'border-l border-slate-200'}`}>
              <div className={`w-2.5 h-2.5 rounded-full ${isDarkTheme ? 'border border-white/60 bg-white/10' : 'border border-slate-400 bg-slate-100'}`} />
              <span className={`text-nano font-bold ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>{copy.labels.bridgeNode}</span>
            </div>
          )}
          {overlayMode === 'migration' && migratingNodes.size > 0 && (
            <div className={`flex items-center gap-1 pl-2 ${isDarkTheme ? 'border-l border-slate-700/50' : 'border-l border-slate-200'}`}>
              <div className="w-2.5 h-2.5 rounded-full border-2 border-amber-400 bg-amber-400/20" />
              <span className={`text-nano font-bold ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>{copy.labels.migratingNode}</span>
            </div>
          )}
        </div>
      </div>

      {/* Fit to view */}
      <button
        onClick={() => { try { fgRef.current && fgRef.current.zoomToFit(400, 80) } catch { /* ignore */ } }}
        className={`absolute bottom-3 right-3 z-10 backdrop-blur-md rounded-xl px-3 py-1.5 text-nano font-bold transition-colors uppercase tracking-ultra ${isDarkTheme ? 'border border-white/10 bg-slate-950/74 text-slate-300 hover:text-white hover:border-cyan-500/40 shadow-[0_12px_28px_rgba(2,6,23,0.4)]' : 'border border-slate-200 bg-white/92 text-slate-700 hover:text-slate-950 hover:border-rose-300 shadow-[0_12px_28px_rgba(15,23,42,0.08)]'}`}
        title={`${copy.labels.fit} (F)`}
      >
        {copy.labels.fit} - F
      </button>
    </div>
  )
}

function SpotlightRailItem({ tone = 'cyan', title, label, detail }) {
  const isDarkTheme = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  const toneMap = {
    rose: isDarkTheme ? 'border-rose-400/15 bg-rose-400/[0.05] text-rose-100' : 'border-rose-200 bg-rose-50 text-rose-700',
    emerald: isDarkTheme ? 'border-emerald-400/15 bg-emerald-400/[0.05] text-emerald-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700',
    cyan: isDarkTheme ? 'border-cyan-400/15 bg-cyan-400/[0.05] text-cyan-100' : 'border-sky-200 bg-sky-50 text-sky-700',
  }

  return (
    <div className={`rounded-lg border px-2.5 py-2 ${toneMap[tone] || toneMap.cyan}`}>
      <div className={`text-[9px] uppercase tracking-[0.2em] ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>{title}</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className={`text-[11px] font-bold ${isDarkTheme ? 'text-white' : 'text-slate-950'}`}>{label}</div>
      </div>
      <div className={`mt-1 text-[10px] leading-snug ${isDarkTheme ? 'text-slate-300' : 'text-slate-600'}`}>{detail}</div>
    </div>
  )
}
