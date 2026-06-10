import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { useLanguage } from '../../contexts/LanguageContext'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import NodeHoverCard from './NodeHoverCard'
import { easeInOutCubic, lerp, interpolateSnapshots } from '../../engine/interpolate'
import { CLASS_COLORS } from '../../utils/colors'
import {
  buildTask3FocusContext,
  clampTask3Zoom,
  getTask3NodeRadius,
  selectTask3OverlayEdgeIndexes,
  shouldAutoFocusTask3,
  shouldShowTask3EdgeLabel,
  shouldShowTask3NodeLabel,
} from '../../utils/task3Topology'
import { getTask3Copy } from '../../utils/task3I18n'

const TASK3_FIT_PADDING = 110
const TASK3_FOCUS_ZOOM = 1.28
const TASK3_MIN_ZOOM = 0.45
const TASK3_MAX_ZOOM = 1.5
const TASK3_MANUAL_CAMERA_HOLD_MS = 6500

function emptyFocusContext() {
  return {
    hasFocus: false,
    highlightedNodes: new Set(),
    endpointNodes: new Set(),
    mutualNeighbors: new Set(),
    pathNodes: new Set(),
    neighborhoodNodes: new Set(),
  }
}

function getLinkColor(score) {
  if (score > 0.8) return `rgba(52, 211, 153, ${0.85 + (score - 0.8) * 0.7})`
  if (score > 0.4) return `rgba(168, 85, 247, ${0.7 + (score - 0.4) * 0.5})`
  return `rgba(236, 72, 153, ${0.4 + score * 0.4})`
}

export default function TaskTopology3({ viewMode = null, reportMode = false }) {
  const { lang } = useLanguage()
  const copy = useMemo(() => getTask3Copy(lang), [lang])
  const rawGraphData = useGNNStore((s) => s.graphData)
  const groundTruth = useGNNStore((s) => s.groundTruth)
  const taskData = useGNNStore((s) => s.taskData)
  const selectedModel = useGNNStore((s) => s.selectedModel)
  const isTraining = useGNNStore((s) => s.isTraining)
  const selectedNodeId = useGNNStore((s) => s.selectedNodeId)
  const setSelectedNode = useGNNStore((s) => s.setSelectedNode)
  const setHoveredNode = useGNNStore((s) => s.setHoveredNode)
  const focusedEdgeIdx = useGNNStore((s) => s.focusedEdgeIdx)
  const setFocusedEdge = useGNNStore((s) => s.setFocusedEdge)
  const { snapshots, currentEpochFloat } = usePlayerStore()

  const [showNodes, setShowNodes] = useState(true)
  const [hoveredLink, setHoveredLink] = useState(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 })
  const [stableGraphData, setStableGraphData] = useState(null)
  const [localViewMode, setLocalViewMode] = useState(reportMode ? 'evidence' : 'focus')
  const effectiveViewMode = viewMode || localViewMode

  const overlayMode = selectedModel === 'GAT'
    ? 'attention'
    : selectedModel === 'GCN'
      ? 'smoothness'
      : selectedModel === 'SAGE'
        ? 'stability'
        : 'none'

  const nodeCount = rawGraphData?.nodes?.length || 0
  const showBulkNodeLabels = nodeCount <= 60

  const currentSnap = useMemo(() => {
    if (!snapshots?.length) return null
    const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
    return snapshots[epochInt] || null
  }, [snapshots, currentEpochFloat])

  const { hasFP, hasFN } = useMemo(() => {
    if (!currentSnap?.edge_scores || !taskData?.testEdges) return { hasFP: false, hasFN: false }
    const testEdges = taskData.testEdges
    const scores = currentSnap.edge_scores
    let fp = false
    let fn = false
    for (let i = 0; i < Math.min(scores.length, testEdges.length); i++) {
      if (!testEdges[i].exists && scores[i] >= 0.5) fp = true
      if (testEdges[i].exists && scores[i] < 0.5) fn = true
      if (fp && fn) break
    }
    return { hasFP: fp, hasFN: fn }
  }, [currentSnap, taskData?.testEdges])

  const containerRef = useRef(null)
  const fgRef = useRef(null)
  const fitDoneRef = useRef(false)
  const prevDimsRef = useRef({ width: 0, height: 0 })
  const overlayEdgeIndexesRef = useRef([])
  const autoFocusRef = useRef(null)
  const manualCameraHoldUntilRef = useRef(0)
  const programmaticCameraUntilRef = useRef(0)

  const graphData = useMemo(() => {
    if (!rawGraphData) return null
    return {
      nodes: rawGraphData.nodes.map((node) => ({ ...node })),
      links: rawGraphData.links.map((link, index) => ({ ...link, _idx: index })),
    }
  }, [rawGraphData])

  useEffect(() => {
    if (graphData?.nodes?.length) {
      setStableGraphData(graphData)
      fitDoneRef.current = false
    }
  }, [graphData])

  const activeGraphData = stableGraphData || graphData

  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) {
        setDimensions({ width, height })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [activeGraphData])

  const runCameraAction = useCallback((fn, duration = 500) => {
    const now = performance.now()
    programmaticCameraUntilRef.current = now + duration + 180
    try {
      fn()
    } catch {
      // Ignore transient camera errors while the force simulation settles.
    }
  }, [])

  const fitView = useCallback((duration = 500, padding = TASK3_FIT_PADDING) => {
    if (!fgRef.current) return
    runCameraAction(() => fgRef.current.zoomToFit(duration, padding), duration)
  }, [runCameraAction])

  useEffect(() => {
    const prev = prevDimsRef.current
    prevDimsRef.current = { width: dimensions.width, height: dimensions.height }
    if (prev.width === 0 || prev.height === 0) return undefined
    const id = requestAnimationFrame(() => fitView(400, TASK3_FIT_PADDING))
    return () => cancelAnimationFrame(id)
  }, [dimensions.width, dimensions.height, fitView])

  useEffect(() => {
    const onKey = (event) => {
      const tag = event.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return
      if (event.key === 'f' || event.key === 'F') fitView(600, TASK3_FIT_PADDING)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fitView])

  useEffect(() => {
    if (!fgRef.current || !activeGraphData) return
    const fg = fgRef.current
    fg.d3Force('charge')?.strength(-180).distanceMax(500)
    fg.d3Force('link')?.distance(50)
    fg.d3Force('center')?.strength(0.15)
    fg.d3ReheatSimulation()
  }, [activeGraphData])

  const testEdgeMap = useMemo(() => {
    const map = new Map()
    const edges = taskData?.testEdges
    if (edges) {
      for (let i = 0; i < edges.length; i += 1) {
        const edge = edges[i]
        const key = `${Math.min(edge.source, edge.target)}-${Math.max(edge.source, edge.target)}`
        map.set(key, i)
      }
    }
    return map
  }, [taskData?.testEdges])

  const adjacencyMap = useMemo(() => {
    const map = new Map()
    if (!activeGraphData?.nodes) return map
    for (const node of activeGraphData.nodes) {
      map.set(node.id, new Set())
    }
    if (activeGraphData.links) {
      for (const link of activeGraphData.links) {
        const source = typeof link.source === 'object' ? link.source.id : link.source
        const target = typeof link.target === 'object' ? link.target.id : link.target
        if (source == null || target == null) continue
        if (!map.has(source)) map.set(source, new Set())
        if (!map.has(target)) map.set(target, new Set())
        map.get(source).add(target)
        map.get(target).add(source)
      }
    }
    return map
  }, [activeGraphData])



  const mostInterestingLink = useMemo(() => {
    if (hoveredLink) return hoveredLink
    // Don't auto-select when user has manually focused an edge
    if (focusedEdgeIdx != null) {
      const edge = taskData?.testEdges?.[focusedEdgeIdx]
      if (edge) {
        const epochInt = Math.max(0, Math.min((snapshots?.length || 1) - 1, Math.floor(currentEpochFloat)))
        const score = snapshots?.[epochInt]?.edge_scores?.[focusedEdgeIdx] || 0
        return { source: { id: edge.source }, target: { id: edge.target }, _idx: focusedEdgeIdx, score, isAuto: false }
      }
    }

    const epochInt = Math.max(0, Math.min((snapshots?.length || 1) - 1, Math.floor(currentEpochFloat)))
    const snap = snapshots?.[epochInt]
    if (!snap?.edge_scores || !taskData?.testEdges) return null

    if (selectedNodeId !== null) {
      let bestIdx = -1
      let maxScore = -1
      taskData.testEdges.forEach((edge, index) => {
        if (edge.source === selectedNodeId || edge.target === selectedNodeId) {
          const score = snap.edge_scores[index] || 0
          if (score > maxScore) {
            maxScore = score
            bestIdx = index
          }
        }
      })
      if (bestIdx !== -1) {
        const edge = taskData.testEdges[bestIdx]
        return { source: { id: edge.source }, target: { id: edge.target }, _idx: bestIdx, score: maxScore, isAuto: true }
      }
    }

    let bestIdx = -1
    let maxScore = -1
    taskData.testEdges.forEach((edge, index) => {
      if (!edge.exists) {
        const score = snap.edge_scores[index] || 0
        if (score > maxScore) {
          maxScore = score
          bestIdx = index
        }
      }
    })

    if (bestIdx !== -1 && maxScore > 0.7) {
      const edge = taskData.testEdges[bestIdx]
      return { source: { id: edge.source }, target: { id: edge.target }, _idx: bestIdx, score: maxScore, isAuto: true }
    }

    return null
  }, [hoveredLink, selectedNodeId, snapshots, currentEpochFloat, taskData])

  const focusContext = useMemo(
    () => buildTask3FocusContext({
      graphData: activeGraphData,
      testEdges: taskData?.testEdges || [],
      focusedEdgeIdx,
      selectedNodeId,
    }),
    [activeGraphData, taskData, focusedEdgeIdx, selectedNodeId],
  )
  const visibleFocusContext = useMemo(
    () => (effectiveViewMode === 'global' ? emptyFocusContext() : focusContext),
    [effectiveViewMode, focusContext],
  )

  const overlayEdgeIndexes = useMemo(() => {
    if (!snapshots?.length || !taskData?.testEdges?.length) return []
    const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
    const t = easeInOutCubic(Math.max(0, Math.min(1, currentEpochFloat - epochInt)))
    const snapA = snapshots[epochInt]
    const snapB = snapshots[epochInt + 1] || snapA

    const indexes = []
    taskData.testEdges.forEach((edge, idx) => {
      const scoreA = snapA?.edge_scores?.[idx] ?? 0
      const scoreB = snapB?.edge_scores?.[idx] ?? scoreA
      const score = scoreA + (scoreB - scoreA) * t

      const isPositivePrediction = score >= 0.5
      const isFalseNegative = edge.exists && score < 0.5

      if (isPositivePrediction || isFalseNegative) {
        indexes.push(idx)
      }
    })
    return indexes
  }, [snapshots, currentEpochFloat, taskData])

  useEffect(() => {
    overlayEdgeIndexesRef.current = overlayEdgeIndexes
  }, [overlayEdgeIndexes])

  useEffect(() => {
    if (!fgRef.current || !activeGraphData) return
    const anchorIdx = overlayEdgeIndexesRef.current[0]
    const now = performance.now()
    if (!shouldAutoFocusTask3({
      isTraining,
      anchorIdx,
      focusedEdgeIdx,
      selectedNodeId,
      manualHoldUntil: manualCameraHoldUntilRef.current,
      now,
      previousFocusKey: autoFocusRef.current,
    })) {
      return
    }

    const edge = taskData?.testEdges?.[anchorIdx]
    if (!edge) return
    const nodes = activeGraphData.nodes || []
    const sourceNode = nodes.find((node) => node.id === edge.source)
    const targetNode = nodes.find((node) => node.id === edge.target)
    if (!sourceNode || !targetNode) return
    if (!Number.isFinite(sourceNode.x) || !Number.isFinite(targetNode.x)) return

    autoFocusRef.current = String(anchorIdx)
    runCameraAction(() => {
      fgRef.current.centerAt((sourceNode.x + targetNode.x) / 2, (sourceNode.y + targetNode.y) / 2, 420)
      fgRef.current.zoom(1.08, 420)
      fgRef.current.refresh?.()
    }, 420)
  }, [activeGraphData, focusedEdgeIdx, isTraining, runCameraAction, selectedNodeId, taskData, overlayEdgeIndexes])

  const attentionMap = useMemo(() => {
    if (overlayMode !== 'attention') return null
    const epochInt = Math.max(0, Math.min((snapshots?.length || 1) - 1, Math.floor(currentEpochFloat)))
    const edges = snapshots?.[epochInt]?.attention_edges
    if (!edges) return null
    const map = new Map()
    edges.forEach((edge) => {
      const key = `${Math.min(edge.source, edge.target)}-${Math.max(edge.source, edge.target)}`
      map.set(key, edge.weight)
    })
    return map
  }, [overlayMode, snapshots, currentEpochFloat])

  const drawBefore = useCallback((ctx, scale) => {
    if (!activeGraphData?.nodes?.length || !taskData?.testEdges?.length || !snapshots?.length) return

    const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
    const t = easeInOutCubic(Math.max(0, Math.min(1, currentEpochFloat - epochInt)))
    const snapA = snapshots[epochInt]
    const snapB = snapshots[epochInt + 1] || snapA

    overlayEdgeIndexes.forEach((edgeIdx, order) => {
      const edge = taskData.testEdges?.[edgeIdx]
      if (!edge) return
      const sourceNode = activeGraphData.nodes.find((node) => node.id === edge.source)
      const targetNode = activeGraphData.nodes.find((node) => node.id === edge.target)
      if (!sourceNode || !targetNode) return
      if (!Number.isFinite(sourceNode.x) || !Number.isFinite(targetNode.x)) return

      const scoreA = snapA?.edge_scores?.[edgeIdx] ?? 0
      const scoreB = snapB?.edge_scores?.[edgeIdx] ?? scoreA
      const score = lerp(scoreA, scoreB, t)
      const isUnstable = Array.isArray(snapA?.unstable_edge_indices) && snapA.unstable_edge_indices.includes(edgeIdx)
      const isFocused = edgeIdx === focusedEdgeIdx
      const isFuture = !edge.exists
      const isConnectedToSelected = selectedNodeId !== null && (edge.source === selectedNodeId || edge.target === selectedNodeId)

      const isHovered = hoveredLink && (
        ((hoveredLink.source.id ?? hoveredLink.source) === edge.source && (hoveredLink.target.id ?? hoveredLink.target) === edge.target) ||
        ((hoveredLink.source.id ?? hoveredLink.source) === edge.target && (hoveredLink.target.id ?? hoveredLink.target) === edge.source)
      )

      let alpha = 0.55
      if (selectedNodeId !== null) {
        alpha = isConnectedToSelected ? 0.92 : 0.08
      }
      if (isFocused || isHovered) {
        alpha = 0.95
      }

      let baseWidth = isFuture ? 1.8 : 2.2
      if (isFocused || isHovered) {
        baseWidth = 4.5
      } else if (selectedNodeId !== null && isConnectedToSelected) {
        baseWidth = 3.2
      }

      const lineWidth = (baseWidth + (isUnstable ? 1.2 : 0)) / Math.max(scale, 0.75)
      const color = isUnstable
        ? `rgba(45, 212, 191, ${Math.max(alpha, 0.7)})`
        : getLinkColor(score).replace(/[\d.]+\)$/, `${alpha})`)

      ctx.save()
      ctx.beginPath()
      if (isUnstable) {
        ctx.setLineDash([3 / scale, 4 / scale])
        ctx.lineDashOffset = -(performance.now() / 16) % (10 / Math.max(scale, 0.7))
      } else if (isFuture) {
        ctx.setLineDash(isFocused ? [8 / scale, 10 / scale] : [5 / scale, 7 / scale])
        ctx.lineDashOffset = -(performance.now() / 22) % (18 / Math.max(scale, 0.7))
      }
      ctx.moveTo(sourceNode.x, sourceNode.y)
      ctx.lineTo(targetNode.x, targetNode.y)
      ctx.strokeStyle = color
      ctx.lineWidth = lineWidth
      ctx.shadowColor = color
      ctx.shadowBlur = (isFocused || isHovered ? 12 : isConnectedToSelected ? 8 : 4) / Math.max(scale, 0.75)
      ctx.stroke()
      ctx.setLineDash([])

      if (shouldShowTask3EdgeLabel({
        isFocused: isFocused || isHovered,
        isConnectedToSelected,
        selectedNodeId,
        hoveredLink,
        scale,
      })) {
        const mx = (sourceNode.x + targetNode.x) / 2
        const my = (sourceNode.y + targetNode.y) / 2
        const label = `${(score * 100).toFixed(0)}%`
        ctx.font = `900 ${10.5 / Math.max(scale, 0.85)}px monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.strokeStyle = 'rgba(10, 5, 20, 0.88)'
        ctx.lineWidth = 3 / Math.max(scale, 0.85)
        ctx.strokeText(label, mx, my - 11 / Math.max(scale, 0.85))
        ctx.fillStyle = '#ffffff'
        ctx.fillText(label, mx, my - 11 / Math.max(scale, 0.85))
      }

      // FP/FN visual marks on test edges
      const isFP = !edge.exists && score >= 0.5
      const isFN = edge.exists && score < 0.5
      const mx = (sourceNode.x + targetNode.x) / 2
      const my = (sourceNode.y + targetNode.y) / 2

      if (selectedNodeId === null || isConnectedToSelected) {
        if (isFP) {
          // False Positive: just bold red text "FP" with dark stroke for high readability
          ctx.font = `900 ${10.5 / scale}px monospace`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          
          ctx.strokeStyle = 'rgba(10, 5, 20, 0.88)'
          ctx.lineWidth = 3 / scale
          ctx.strokeText('FP', mx, my)
          
          ctx.fillStyle = 'rgba(239, 68, 68, 0.95)'
          ctx.fillText('FP', mx, my)
        } else if (isFN) {
          // False Negative: orange "X" (missing) symbol + "FN" label below
          ctx.strokeStyle = 'rgba(249, 115, 22, 0.95)'
          ctx.lineWidth = 2.8 / scale
          ctx.beginPath()
          ctx.moveTo(mx - 6 / scale, my - 6 / scale)
          ctx.lineTo(mx + 6 / scale, my + 6 / scale)
          ctx.moveTo(mx + 6 / scale, my - 6 / scale)
          ctx.lineTo(mx - 6 / scale, my + 6 / scale)
          ctx.stroke()

          ctx.font = `900 ${8.5 / scale}px monospace`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          ctx.fillStyle = 'rgba(249, 115, 22, 0.95)'
          ctx.fillText('FN', mx, my + 9 / scale)
        }
      }

      ctx.restore()
    })
  }, [activeGraphData, currentEpochFloat, focusedEdgeIdx, hoveredLink, overlayEdgeIndexes, selectedNodeId, snapshots, taskData])

  const linkCanvasObject = useCallback((link, ctx, globalScale) => {
    if (!snapshots?.length) return
    const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
    const t = easeInOutCubic(Math.max(0, Math.min(1, currentEpochFloat - epochInt)))
    const snapA = snapshots[epochInt]
    const snapB = snapshots[epochInt + 1] || snapA
    const testEdges = taskData?.testEdges || []

    const sourceId = link.source.id
    const targetId = link.target.id
    const edgeKey = `${Math.min(sourceId, targetId)}-${Math.max(sourceId, targetId)}`
    const testIdx = testEdgeMap.get(edgeKey) ?? -1

    let color = 'rgba(91, 86, 137, 0.2)'
    let width = 1.0
    let score = 0
    let isFuture = false
    const hasSelection = selectedNodeId !== null
    const isConnectedToSelected = sourceId === selectedNodeId || targetId === selectedNodeId
    const isMIL = mostInterestingLink && (
      (mostInterestingLink.source.id === sourceId && mostInterestingLink.target.id === targetId) ||
      (mostInterestingLink.source.id === targetId && mostInterestingLink.target.id === sourceId)
    )

    const isInFocusNeighborhood = visibleFocusContext.neighborhoodNodes.has(sourceId) || visibleFocusContext.neighborhoodNodes.has(targetId)
    const isFocusEdge = focusedEdgeIdx != null && testIdx === focusedEdgeIdx
    let finalAlpha = hasSelection ? (isConnectedToSelected ? 1 : 0.08) : 1
    if (visibleFocusContext.hasFocus) {
      if (isFocusEdge) finalAlpha = 1
      else if (isInFocusNeighborhood) finalAlpha *= effectiveViewMode === 'evidence' ? 0.28 : 0.42
      else finalAlpha *= effectiveViewMode === 'evidence' ? 0.028 : 0.055
    }
    if (mostInterestingLink && !isMIL && !mostInterestingLink.isAuto) finalAlpha *= 0.35

    if (testIdx !== -1) {
      const scoreA = snapA?.edge_scores?.[testIdx] || 0
      const scoreB = snapB?.edge_scores?.[testIdx] || scoreA
      score = lerp(scoreA, scoreB, t)
      color = getLinkColor(score)
      width = Math.min(3.4, 1.15 + score * 2.25)
      isFuture = !testEdges[testIdx].exists && score > 0.5
    } else {
      // Background edges: apply model-specific overlays
      if (overlayMode === 'attention' && attentionMap) {
        const weight = attentionMap.get(edgeKey) ?? 0
        if (weight > 0.05) {
          color = `rgba(251, 191, 36, ${0.3 + weight * 0.7})`
          width = 0.85 + weight * 3.1
        } else {
          color = 'rgba(91, 86, 137, 0.08)'
          width = 0.7
        }
      } else if (overlayMode === 'stability') {
        const neighborsA = adjacencyMap?.get(sourceId)
        const neighborsB = adjacencyMap?.get(targetId)
        let sharedCount = 0
        if (neighborsA && neighborsB) {
          for (const neighborId of neighborsA) {
            if (neighborsB.has(neighborId)) {
              sharedCount++
            }
          }
        }
        const stabilityWeight = Math.min(1.0, sharedCount / 4.0)
        const alpha = 0.08 + stabilityWeight * 0.72
        color = `rgba(45, 212, 191, ${alpha})`
        width = 0.55 + stabilityWeight * 1.8
      } else if (overlayMode === 'smoothness') {
        const embA = snapA?.embeddings_2d?.[sourceId]
        const embB = snapA?.embeddings_2d?.[targetId]
        if (embA && embB) {
          const dx = embA[0] - embB[0]
          const dy = embA[1] - embB[1]
          const dist = Math.sqrt(dx * dx + dy * dy)
          const similarity = 1 / (1 + dist)

          const embB_A = snapB?.embeddings_2d?.[sourceId]
          const embB_B = snapB?.embeddings_2d?.[targetId]
          let similarityB = similarity
          if (embB_A && embB_B) {
            const dxB = embB_A[0] - embB_B[0]
            const dyB = embB_A[1] - embB_B[1]
            similarityB = 1 / (1 + Math.sqrt(dxB * dxB + dyB * dyB))
          }
          const interpSim = lerp(similarity, similarityB, t)

          const deA = snapA?.dirichlet_energy ?? 0.5
          const deB = snapB?.dirichlet_energy ?? deA
          const dirichlet = lerp(deA, deB, t)

          const r = Math.round(lerp(120, 34, interpSim))
          const g = Math.round(lerp(113, 197, interpSim))
          const b = Math.round(lerp(160, 94, interpSim))

          const opacity = Math.max(0.02, Math.min(0.75, dirichlet * 1.5))
          color = `rgba(${r}, ${g}, ${b}, ${opacity})`
          width = 0.55 + interpSim * 1.6
        } else {
          color = 'rgba(91, 86, 137, 0.08)'
          width = 0.7
        }
      }
    }

    ctx.save()
    ctx.globalAlpha = finalAlpha
    ctx.beginPath()

    if (isMIL) {
      const pulse = Math.sin(performance.now() / 240) * 0.22 + 0.68
      ctx.shadowColor = color
      ctx.shadowBlur = (isFuture ? 18 : 10) * pulse / globalScale
      if (mostInterestingLink.isAuto) ctx.globalAlpha *= 0.8
    }

    if (isFuture && score > 0.7) {
      ctx.setLineDash([7, 10])
      ctx.lineDashOffset = -(performance.now() / 18) % 18
      width *= 1.25
    } else if (isFuture) {
      ctx.setLineDash([3, 5])
    }

    ctx.moveTo(link.source.x, link.source.y)
    ctx.lineTo(link.target.x, link.target.y)
    ctx.strokeStyle = color
    ctx.lineWidth = width / globalScale
    ctx.stroke()

    ctx.restore()
  }, [snapshots, currentEpochFloat, taskData, selectedNodeId, mostInterestingLink, testEdgeMap, overlayMode, attentionMap, visibleFocusContext, effectiveViewMode, focusedEdgeIdx, adjacencyMap])

  const nodeCanvasObject = useCallback((node, ctx, globalScale) => {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return

    const isSelected = selectedNodeId === node.id
    const isCommonNeighbor = visibleFocusContext.mutualNeighbors.has(node.id)
    const isEndpoint = visibleFocusContext.endpointNodes.has(node.id)
    const isPathNode = visibleFocusContext.pathNodes.has(node.id)
    const hasContext = selectedNodeId !== null || hoveredLink !== null || visibleFocusContext.hasFocus
    const inHighlight = visibleFocusContext.highlightedNodes.has(node.id)
    const alpha = hasContext
      ? ((isSelected || isCommonNeighbor || isEndpoint || isPathNode || inHighlight) ? 1 : (effectiveViewMode === 'evidence' ? 0.07 : 0.12))
      : 1

    if (!showNodes && !isSelected && !isCommonNeighbor) {
      ctx.beginPath()
      ctx.arc(node.x, node.y, 0.9, 0, 2 * Math.PI)
      ctx.fillStyle = `rgba(255,255,255,${alpha * 0.08})`
      ctx.fill()
      return
    }

    const radius = getTask3NodeRadius({
      degree: node.degree || 1,
      isSelected: isSelected || isEndpoint,
      isCommonNeighbor: isCommonNeighbor || isPathNode,
    })
    const color = isEndpoint
      ? '#22d3ee'
      : isCommonNeighbor
        ? '#fbbf24'
        : isPathNode
          ? '#a855f7'
          : (CLASS_COLORS[groundTruth?.[node.id]] || '#6366f1')

    // Draw solid background circle to mask underlying edges
    ctx.save()
    ctx.beginPath()
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI)
    ctx.fillStyle = '#0a0519'
    ctx.fill()
    ctx.restore()

    ctx.save()
    ctx.globalAlpha = alpha
    ctx.shadowColor = color
    ctx.shadowBlur = (isSelected || isCommonNeighbor || isEndpoint || isPathNode) ? (isEndpoint ? 22 : 14) / globalScale : 0
    ctx.beginPath()
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI)
    ctx.fillStyle = color
    ctx.fill()

    const gradient = ctx.createRadialGradient(node.x - radius / 3, node.y - radius / 3, radius / 12, node.x, node.y, radius)
    gradient.addColorStop(0, 'rgba(255,255,255,0.18)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient
    ctx.fill()

    ctx.strokeStyle = (isSelected || isCommonNeighbor || isEndpoint || isPathNode) ? '#fff' : 'rgba(255,255,255,0.34)'
    ctx.lineWidth = (isSelected || isCommonNeighbor || isEndpoint || isPathNode ? 2.4 : 1) / globalScale
    ctx.stroke()

    if (shouldShowTask3NodeLabel({
      globalScale,
      showBulkNodeLabels,
      isSelected: isSelected || isEndpoint,
      isCommonNeighbor: isCommonNeighbor || isPathNode,
    })) {
      const fontSize = Math.max(4, (isSelected || isCommonNeighbor || isEndpoint || isPathNode ? 10.5 : 7.2) / Math.sqrt(globalScale))
      ctx.font = `900 ${fontSize}px Inter, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const text = String(node.id)
      ctx.strokeStyle = 'rgba(0,0,0,0.78)'
      ctx.lineWidth = 1.6 / globalScale
      ctx.strokeText(text, node.x, node.y)
      ctx.fillStyle = '#fff'
      ctx.fillText(text, node.x, node.y)
    }

    ctx.restore()
  }, [groundTruth, selectedNodeId, visibleFocusContext, hoveredLink, showNodes, showBulkNodeLabels, effectiveViewMode])

  const animStateRef = useRef(null)
  if (!animStateRef.current) {
    animStateRef.current = {}
  }
  animStateRef.current.selectedModel = selectedModel
  animStateRef.current.snapshots = snapshots
  animStateRef.current.currentEpochFloat = currentEpochFloat
  animStateRef.current.attentionMap = attentionMap
  animStateRef.current.testEdgeMap = testEdgeMap
  animStateRef.current.testEdges = taskData?.testEdges || []
  animStateRef.current.overlayMode = overlayMode
  animStateRef.current.adjacencyMap = adjacencyMap

  const linkDirectionalParticles = useCallback((link) => {
    const { selectedModel, snapshots, currentEpochFloat, attentionMap, testEdgeMap } = animStateRef.current
    if (!snapshots?.length) return 0

    const srcId = typeof link.source === 'object' ? link.source.id : link.source
    const tgtId = typeof link.target === 'object' ? link.target.id : link.target
    const edgeKey = `${Math.min(srcId, tgtId)}-${Math.max(srcId, tgtId)}`
    const testIdx = testEdgeMap?.get(edgeKey) ?? -1

    const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
    const t = currentEpochFloat - epochInt
    const snapA = snapshots[epochInt]
    const snapB = snapshots[epochInt + 1] || snapA

    if (selectedModel === 'GAT') {
      if (testIdx !== -1) {
        const scoreA = snapA?.edge_scores?.[testIdx] || 0
        const scoreB = snapB?.edge_scores?.[testIdx] || scoreA
        const score = scoreA + (scoreB - scoreA) * t
        return score > 0.55 ? (score > 0.85 ? 3 : 2) : 0
      } else {
        const weight = attentionMap?.get(edgeKey) ?? 0
        return weight > 0.25 ? (weight > 0.55 ? 3 : 2) : 0
      }
    }

    if (selectedModel === 'GCN') {
      const overSmooth = snapA?.oversmoothing_score ?? 0
      if (testIdx !== -1) {
        const simA = snapA?.edge_similarity?.[testIdx] ?? 0.5
        const simB = snapB?.edge_similarity?.[testIdx] ?? simA
        const similarity = simA + (simB - simA) * t
        if (overSmooth > 0.8) return 0
        return similarity > 0.45 ? (similarity > 0.75 ? 2 : 1) : 0
      } else {
        if (overSmooth > 0.75) return 0
        const seed = link._idx + Math.floor(currentEpochFloat * 2.5)
        const threshold = 0.65 + overSmooth * 0.25
        return (Math.sin(seed) * 10000 % 1) > threshold ? 1 : 0
      }
    }

    if (selectedModel === 'SAGE') {
      if (testIdx !== -1) {
        const varA = snapA?.score_variance_by_edge?.[testIdx] ?? 0
        const varB = snapB?.score_variance_by_edge?.[testIdx] ?? varA
        const variance = varA + (varB - varA) * t
        return variance < 0.018 ? 2 : (Math.sin(performance.now() / 150) > 0 ? 1 : 0)
      } else {
        const stability = snapA?.sage_stability_score ?? 0.8
        const seed = link._idx + Math.floor(currentEpochFloat * 1.5)
        const threshold = 0.82 - (stability - 0.5) * 0.15
        return (Math.sin(seed) * 10000 % 1) > threshold ? 1 : 0
      }
    }

    return 0
  }, [])

  const linkDirectionalParticleSpeed = useCallback((link) => {
    const { selectedModel, snapshots, currentEpochFloat, attentionMap, testEdgeMap, adjacencyMap } = animStateRef.current
    if (!snapshots?.length) return 0

    const srcId = typeof link.source === 'object' ? link.source.id : link.source
    const tgtId = typeof link.target === 'object' ? link.target.id : link.target
    const edgeKey = `${Math.min(srcId, tgtId)}-${Math.max(srcId, tgtId)}`
    const testIdx = testEdgeMap?.get(edgeKey) ?? -1

    const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
    const t = currentEpochFloat - epochInt
    const snapA = snapshots[epochInt]
    const snapB = snapshots[epochInt + 1] || snapA

    if (selectedModel === 'GAT') {
      if (testIdx !== -1) {
        const scoreA = snapA?.edge_scores?.[testIdx] || 0
        const scoreB = snapB?.edge_scores?.[testIdx] || scoreA
        const score = scoreA + (scoreB - scoreA) * t
        return 0.003 + score * 0.016
      } else {
        const weight = attentionMap?.get(edgeKey) ?? 0
        return 0.002 + weight * 0.018
      }
    }

    if (selectedModel === 'GCN') {
      const overSmooth = snapA?.oversmoothing_score ?? 0
      const speedFactor = Math.max(0.1, 1 - overSmooth * 0.9)
      if (testIdx !== -1) {
        const simA = snapA?.edge_similarity?.[testIdx] ?? 0.5
        const simB = snapB?.edge_similarity?.[testIdx] ?? simA
        const similarity = simA + (simB - simA) * t
        return speedFactor * (0.004 + similarity * 0.016)
      } else {
        return speedFactor * 0.008
      }
    }

    if (selectedModel === 'SAGE') {
      if (testIdx !== -1) {
        const varA = snapA?.score_variance_by_edge?.[testIdx] ?? 0
        const varB = snapB?.score_variance_by_edge?.[testIdx] ?? varA
        const variance = varA + (varB - varA) * t
        return variance > 0.018 ? 0.024 : 0.012
      } else {
        const neighborsA = adjacencyMap?.get(srcId)
        const neighborsB = adjacencyMap?.get(tgtId)
        let sharedCount = 0
        if (neighborsA && neighborsB) {
          for (const neighborId of neighborsA) {
            if (neighborsB.has(neighborId)) {
              sharedCount++
            }
          }
        }
        const stabilityWeight = Math.min(1.0, sharedCount / 4.0)
        return 0.005 + stabilityWeight * 0.015
      }
    }

    return 0.01
  }, [])

  const linkDirectionalParticleColor = useCallback((link) => {
    const { selectedModel, snapshots, currentEpochFloat, testEdgeMap } = animStateRef.current
    if (!snapshots?.length) return 'rgba(255, 255, 255, 0.5)'

    const srcId = typeof link.source === 'object' ? link.source.id : link.source
    const tgtId = typeof link.target === 'object' ? link.target.id : link.target
    const edgeKey = `${Math.min(srcId, tgtId)}-${Math.max(srcId, tgtId)}`
    const testIdx = testEdgeMap?.get(edgeKey) ?? -1

    const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
    const t = currentEpochFloat - epochInt
    const snapA = snapshots[epochInt]
    const snapB = snapshots[epochInt + 1] || snapA

    if (selectedModel === 'GAT') {
      return 'rgba(251, 191, 36, 0.88)'
    }

    if (selectedModel === 'GCN') {
      if (testIdx !== -1) {
        const simA = snapA?.edge_similarity?.[testIdx] ?? 0.5
        const simB = snapB?.edge_similarity?.[testIdx] ?? simA
        const similarity = simA + (simB - simA) * t
        return similarity > 0.55 ? 'rgba(34, 197, 94, 0.9)' : 'rgba(239, 68, 68, 0.9)'
      }
      return 'rgba(99, 102, 241, 0.65)'
    }

    if (selectedModel === 'SAGE') {
      if (testIdx !== -1) {
        const varA = snapA?.score_variance_by_edge?.[testIdx] ?? 0
        const varB = snapB?.score_variance_by_edge?.[testIdx] ?? varA
        const variance = varA + (varB - varA) * t
        return variance > 0.018 ? 'rgba(236, 72, 153, 0.9)' : 'rgba(45, 212, 191, 0.9)'
      }
      return 'rgba(45, 212, 191, 0.65)'
    }

    return 'rgba(255, 255, 255, 0.5)'
  }, [])

  if (!activeGraphData) {
    return (
      <div className="w-full h-full bg-abyss flex items-center justify-center text-twilight text-[10px] uppercase font-black">
        {copy.empty.startTraining}
      </div>
    )
  }

  const auc = snapshots[Math.floor(currentEpochFloat)]?.auc || 0.5

  return (
    <div ref={containerRef} className="w-full h-full relative bg-abyss overflow-hidden">
      <ForceGraph2D
        ref={fgRef}
        graphData={activeGraphData}
        width={dimensions.width}
        height={dimensions.height}
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode={() => 'replace'}
        linkCanvasObject={linkCanvasObject}
        linkCanvasObjectMode={() => 'replace'}
        onRenderFramePre={drawBefore}
        linkDirectionalParticles={linkDirectionalParticles}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleSpeed={linkDirectionalParticleSpeed}
        linkDirectionalParticleColor={linkDirectionalParticleColor}
        onNodeClick={(node) => {
          manualCameraHoldUntilRef.current = performance.now() + TASK3_MANUAL_CAMERA_HOLD_MS
          setSelectedNode(selectedNodeId === node.id ? null : node.id)
        }}
        onNodeHover={(node) => setHoveredNode(node?.id ?? null)}
        onLinkHover={(link) => setHoveredLink(link)}
        onLinkClick={(link) => {
          if (link) {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source
            const targetId = typeof link.target === 'object' ? link.target.id : link.target
            const edgeKey = `${Math.min(sourceId, targetId)}-${Math.max(sourceId, targetId)}`
            const testIdx = testEdgeMap.get(edgeKey) ?? -1
            if (testIdx !== -1) {
              setFocusedEdge(focusedEdgeIdx === testIdx ? null : testIdx)
            }
          }
        }}
        onBackgroundClick={() => {
          setSelectedNode(null)
          setFocusedEdge(null)
        }}
        onZoom={(transform) => {
          if (!fgRef.current || !transform) return
          const clamped = clampTask3Zoom(transform.k)
          if (Math.abs(clamped - transform.k) > 0.001) {
            runCameraAction(() => fgRef.current.zoom(clamped, 0), 0)
          }
          if (performance.now() > programmaticCameraUntilRef.current) {
            manualCameraHoldUntilRef.current = performance.now() + TASK3_MANUAL_CAMERA_HOLD_MS
          }
        }}
        minZoom={TASK3_MIN_ZOOM}
        maxZoom={TASK3_MAX_ZOOM}
        backgroundColor="transparent"
        cooldownTicks={200}
        warmupTicks={30}
        onEngineStop={() => {
          if (fitDoneRef.current) return
          fitDoneRef.current = true
          fitView(400, TASK3_FIT_PADDING)
        }}
      />

      {!reportMode && <NodeHoverCard />}

      <div className="absolute bottom-6 right-6 pointer-events-none flex flex-col items-center">
        <div className="relative w-28 h-14 overflow-hidden mb-2">
          <svg viewBox="0 0 100 50" className="w-full h-full drop-shadow-[0_0_15px_rgba(168,85,247,0.4)]">
            <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" strokeLinecap="round" />
            <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="url(#aucGrad)" strokeWidth="10" strokeLinecap="round" strokeDasharray="125.6" strokeDashoffset={125.6 - (auc * 125.6)} className="transition-all duration-500" />
            <g transform={`translate(50, 50) rotate(${auc * 180 - 90})`} className="transition-all duration-500">
              <path d="M -2,0 L 0,-38 L 2,0 Z" fill="#f1f0ff" />
              <circle cx="0" cy="0" r="4" fill="#a855f7" stroke="#f1f0ff" strokeWidth="1" />
            </g>
            <defs>
              <linearGradient id="aucGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f43f5e" />
                <stop offset="50%" stopColor="#a855f7" />
                <stop offset="100%" stopColor="#34d399" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div className="bg-deep/90 backdrop-blur-xl rounded-2xl px-4 py-2 border border-line-subtle shadow-2xl flex flex-col items-center min-w-[100px]">
          <span className="text-[8px] text-twilight uppercase font-black tracking-widest mb-1">{copy.labels.modelAuc}</span>
          <span className={`text-2xl font-black font-mono leading-none ${auc > 0.85 ? 'text-[#34d399]' : auc > 0.7 ? 'text-[#fbbf24]' : 'text-[#f43f5e]'}`}>
            {auc.toFixed(3)}
          </span>
        </div>
      </div>



      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <button
          onClick={() => setShowNodes(!showNodes)}
          className={`px-3 py-1.5 rounded-xl text-nano font-black tracking-wider uppercase border transition-all ${showNodes ? 'bg-deep/90 border-line-default text-moonlight hover:text-starlight' : 'bg-amethyst/15 border-amethyst text-amethyst'}`}
        >
          {copy.labels.nodes}
        </button>
        <button
          onClick={() => fitView(600, TASK3_FIT_PADDING)}
          title="Fit to view (F)"
          className="px-3 py-1.5 rounded-xl text-nano font-black tracking-wider uppercase border bg-deep/80 border-line-default text-moonlight hover:text-starlight hover:border-line-active transition-all"
        >
          {copy.labels.fit}
        </button>
      </div>

      <div className="absolute bottom-6 left-6 z-20 rounded-2xl border border-line-default bg-nebula/78 px-3 py-2 backdrop-blur-md">
        <div className="mb-2 text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
          {copy.labels.legend}
        </div>
        <div className="grid gap-1 text-[10px] text-slate-300">
          {/* Cạnh */}
          <LegendSwatch color="rgba(91,86,137,0.35)" label={copy.labels.backgroundGraph} />
          <LegendSwatch color="#34d399" label={copy.labels.predictedEdge} />
          {overlayMode === 'attention' && currentSnap?.attention_edges?.length > 0 && (
            <LegendSwatch color="#fbbf24" label={copy.labels.attention} />
          )}
          {overlayMode === 'stability' && Number.isFinite(currentSnap?.score_variance) && (
            <LegendSwatch color="rgba(45,212,191,0.7)" label={copy.labels.stability} />
          )}
          {overlayMode === 'smoothness' && currentSnap?.edge_similarity?.length > 0 && (
            <>
              <LegendSwatch color="#22c55e" label={copy.labels.similarityHigh} />
              <LegendSwatch color="#ef4444" label={copy.labels.similarityLow} />
            </>
          )}
          {hasFP && <LegendSwatch color="#ef4444" label={copy.labels.falsePositives} />}
          {hasFN && <LegendSwatch color="#f97316" label={copy.labels.falseNegatives} />}
          {/* Nút — chỉ hiện khi có focus */}
          {focusContext.hasFocus && (
            <>
              <div className="my-1 border-t border-line-subtle" />
              <LegendSwatch color="#22d3ee" label={copy.labels.focusedShort} />
              <LegendSwatch color="#f59e0b" label={copy.labels.mutualRing} />
              <LegendSwatch color="#a855f7" label={copy.labels.pathNodes} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function LegendSwatch({ color, label }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span>{label}</span>
    </div>
  )
}
