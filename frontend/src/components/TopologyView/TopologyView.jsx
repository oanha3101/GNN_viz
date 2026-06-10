import React, { useCallback, useRef, useEffect, useState, useMemo } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { motion, AnimatePresence } from 'framer-motion'
import { Network, Info, Share2, X } from 'lucide-react'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { CLASS_COLORS, CLASS_NAMES } from '../../utils/colors'
import { easeInOutCubic, getNodeColor } from '../../engine/interpolate'
import { drawTask1Node } from '../../engine/drawTask1Node'
import { computeKHopNeighbors } from '../../utils/khop'
import { isNodeMisclassified, countMisclassified } from '../../utils/misclassification'
import { logger } from '../../utils/logger'
import NodeHoverCard from './NodeHoverCard'

function normalizeVisualModel(model) {
  const safe = String(model || 'GCN').toUpperCase().replace('-', '_')
  if (safe === 'GRAPHSAGE' || safe === 'GRAPH_SAGE') return 'SAGE'
  if (safe === 'GAT') return 'GAT'
  return safe === 'SAGE' ? 'SAGE' : 'GCN'
}

export default function TopologyView({ reportMode = false }) {
  // 1. Dữ liệu tĩnh
  const rawGraphData = useGNNStore(s => s.graphData)
  const groundTruth = useGNNStore(s => s.groundTruth)
  const selectedModel = useGNNStore(s => s.selectedModel)
  const viewMode = useGNNStore(s => s.viewMode)
  const selectedNodeId = useGNNStore(s => s.selectedNodeId)
  const classNames = useGNNStore(s => s.classNames)
  const setSelectedNode = useGNNStore(s => s.setSelectedNode)
  const setHoveredNode = useGNNStore(s => s.setHoveredNode)
  const attentionHead = useGNNStore(s => s.attentionHead)
  const setAttentionHead = useGNNStore(s => s.setAttentionHead)

  // 2. Dữ liệu động
  const snapshots = usePlayerStore(s => s.snapshots)
  const currentEpochFloat = usePlayerStore(s => s.currentEpochFloat)
  const totalEpochs = usePlayerStore(s => s.totalEpochs)
  const visualModel = normalizeVisualModel(selectedModel)

  const [dimensions, setDimensions] = useState({ width: 800, height: 400 })
  const [stableGraphData, setStableGraphData] = useState(null)
  const containerRef = useRef()
  const fgRef = useRef()
  const fitPendingRef = useRef(false)

  // Context Menu state
  const [contextMenu, setContextMenu] = useState(null) // { x, y, nodeId }

  // K-Hop neighborhood state
  const [kHopEnabled, setKHopEnabled] = useState(true)
  const [kHopMaxHops, setKHopMaxHops] = useState(1)
  const kHopNeighborsRef = useRef(null)

  // Misclassification Explorer state
  const [showErrorsOnly, setShowErrorsOnly] = useState(false)

  // 3. StateRef: Đảm bảo luồng vẽ Canvas luôn lấy được dữ liệu mới nhất mà không trễ nhịp
  const animState = useRef({
    snaps: [],
    cef: 0,
    currentSnapshot: null,
    sid: null,
    vm: 'prediction',
    gt: null,
    model: 'GCN',
    head: 'avg',
    kHopEnabled: true,
    kHopMaxHops: 1,
    kHopNeighbors: null,
    showErrorsOnly: false,
    nodeCorrectness: null,
    attentionMap: null,
    perHeadMap: null,
    nodeMaxAttnMap: null,
    samplingEdgeMap: null,
    epochDeltaMap: null,
    showNodeLabels: true,
    disableMotion: false,
    showLinkParticles: true,
  })

  const graphPerf = useMemo(() => {
    const nodeCount = rawGraphData?.nodes?.length || 0
    const linkCount = rawGraphData?.links?.length || 0
    const isShowcaseGraph = nodeCount > 0 && nodeCount <= 80 && linkCount <= 260
    const isMediumGraph = nodeCount > 140 || linkCount > 320
    const isLargeGraph = nodeCount > 800 || linkCount > 2000
    const isVeryLargeGraph = nodeCount > 1800 || linkCount > 4500
    return {
      nodeCount,
      linkCount,
      isShowcaseGraph,
      isMediumGraph,
      isLargeGraph,
      isVeryLargeGraph,
      showNodeLabels: !reportMode && nodeCount <= 80,
      disableMotion: reportMode || isVeryLargeGraph,
      showLinkParticles: true,
      enableNodeDrag: !reportMode && nodeCount < 900,
      warmupTicks: isShowcaseGraph ? 45 : isVeryLargeGraph ? 12 : 30,
      cooldownTicks: isShowcaseGraph ? 140 : isVeryLargeGraph ? 40 : 100,
    }
  }, [rawGraphData, reportMode])

  // Cập nhật Ref và ép Redraw 60 lần/giây
  useEffect(() => {
    // Safely get current epoch snapshot data (interpolated for smooth GAT edges)
    const epochInt = snapshots && snapshots.length > 0
      ? Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
      : 0
    const t = easeInOutCubic(Math.max(0, Math.min(1, currentEpochFloat - epochInt)))
    const snapA = snapshots?.[epochInt] || null
    const snapB = snapshots?.[epochInt + 1] || snapA
    const currentSnap = snapA

    // Pre-compute attentionMap from attention_edges (GAT only) — interpolated
    let attentionMap = null
    let nodeMaxAttnMap = null
    if (visualModel === 'GAT') {
      const edgesA = snapA?.attention_edges
      const edgesB = snapB?.attention_edges
      if (edgesA || edgesB) {
        attentionMap = new Map()
        nodeMaxAttnMap = new Map()
        // Build map from snapA
        const mapA = new Map()
        if (edgesA) {
          for (const e of edgesA) {
            const key = Math.min(e.source, e.target) + '-' + Math.max(e.source, e.target)
            mapA.set(key, e.weight)
          }
        }
        // Build map from snapB
        const mapB = new Map()
        if (edgesB) {
          for (const e of edgesB) {
            const key = Math.min(e.source, e.target) + '-' + Math.max(e.source, e.target)
            mapB.set(key, e.weight)
          }
        }
        // Merge all keys and interpolate
        const allKeys = new Set([...mapA.keys(), ...mapB.keys()])
        for (const key of allKeys) {
          const wA = mapA.get(key) || 0
          const wB = mapB.get(key) || 0
          const w = wA + (wB - wA) * t
          attentionMap.set(key, w)
          // Parse edge key for node max attn
          const [src, tgt] = key.split('-').map(Number)
          nodeMaxAttnMap.set(src, Math.max(nodeMaxAttnMap.get(src) || 0, w))
          nodeMaxAttnMap.set(tgt, Math.max(nodeMaxAttnMap.get(tgt) || 0, w))
        }
      }
    }
    // Per-head attention map for head selector (interpolated)
    let perHeadMap = null
    if (visualModel === 'GAT' && attentionHead !== 'avg') {
      const headIdx = parseInt(attentionHead)
      const headsA = snapA?.attention_per_head
      const headsB = snapB?.attention_per_head
      if (headsA || headsB) {
        perHeadMap = new Map()
        const allKeys = new Set([
          ...(headsA ? Object.keys(headsA) : []),
          ...(headsB ? Object.keys(headsB) : []),
        ])
        for (const key of allKeys) {
          const hA = headsA?.[key]?.[headIdx] ?? 0
          const hB = headsB?.[key]?.[headIdx] ?? hA
          perHeadMap.set(key, hA + (hB - hA) * t)
        }
      }
    }

    let samplingEdgeMap = null
    let sampledNodes = null
    if (visualModel === 'SAGE' && Array.isArray(currentSnap?.sampling_edges)) {
      samplingEdgeMap = new Map()
      sampledNodes = new Set()
      currentSnap.sampling_edges.forEach((edge) => {
        const source = typeof edge.source === 'object' ? edge.source.id : edge.source
        const target = typeof edge.target === 'object' ? edge.target.id : edge.target
        if (Number.isFinite(source) && Number.isFinite(target)) {
          samplingEdgeMap.set(Math.min(source, target) + '-' + Math.max(source, target), true)
        }
        if (Number.isFinite(source)) sampledNodes.add(source)
        if (Number.isFinite(target)) sampledNodes.add(target)
      })
    }

    let epochDeltaMap = null
    const prevSnap = epochInt > 0 ? snapshots?.[epochInt - 1] : null
    if (currentSnap?.node_predictions && prevSnap?.node_predictions) {
      epochDeltaMap = new Map()
      currentSnap.node_predictions.forEach((pred, nodeId) => {
        const prevPred = prevSnap.node_predictions?.[nodeId]
        const nowCorrect = currentSnap.node_correctness?.[nodeId]
        const prevCorrect = prevSnap.node_correctness?.[nodeId]
        const predictionChanged = prevPred !== undefined && pred !== prevPred
        const correctnessChanged = prevCorrect !== undefined && nowCorrect !== prevCorrect
        if (predictionChanged || correctnessChanged) {
          epochDeltaMap.set(nodeId, {
            predictionChanged,
            becameCorrect: correctnessChanged && nowCorrect === 1,
            becameWrong: correctnessChanged && nowCorrect === 0,
          })
        }
      })
    }

    animState.current = {
      snaps: snapshots || [],
      cef: currentEpochFloat,
      currentSnapshot: currentSnap,
      totalEpochs: snapshots?.length || 0,
      sid: selectedNodeId,
      vm: viewMode,
      gt: groundTruth || null,
      model: visualModel,
      head: attentionHead,
      kHopEnabled,
      kHopMaxHops,
      kHopNeighbors: kHopNeighborsRef.current,
      showErrorsOnly,
      nodeCorrectness: currentSnap ? (currentSnap.node_correctness || null) : null,
      attentionMap,
      perHeadMap,
      nodeMaxAttnMap,
      samplingEdgeMap,
      sampledNodes,
      epochDeltaMap,
      showNodeLabels: graphPerf.showNodeLabels,
      disableMotion: graphPerf.disableMotion,
      showLinkParticles: graphPerf.showLinkParticles,
    }

    // Compute K-Hop neighbors when selected node changes
    if (selectedNodeId !== null && rawGraphData?.links && kHopEnabled) {
      kHopNeighborsRef.current = computeKHopNeighbors(selectedNodeId, rawGraphData.links, kHopMaxHops)
    } else {
      kHopNeighborsRef.current = null
    }

    // Force a redraw of the canvas to render real-time changes when playing
    fgRef.current?.refresh?.()
  }, [snapshots, currentEpochFloat, selectedNodeId, viewMode, groundTruth, visualModel, attentionHead, kHopEnabled, kHopMaxHops, rawGraphData, showErrorsOnly, graphPerf])

  // Resize handler — re-attach whenever the target node remounts
  // (e.g. after activeGraphData flips from null → data, the render tree swaps
  // from the loading placeholder to the real canvas wrapper).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setDimensions({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [stableGraphData])

  // Re-fit the graph whenever the workspace resizes so nodes always fill the
  // full canvas instead of leaving dark dead space (fixes the "dark lower-left
  // corner" complaint — the initial 800×400 fallback zoom was never re-fit
  // after the observer reported the real container size).
  useEffect(() => {
    if (!fgRef.current) return
    const id = requestAnimationFrame(() => {
      try { fgRef.current && fgRef.current.zoomToFit(400, 12) } catch {
        /* transient fit error while layout settles — next frame will retry */
      }
    })
    return () => cancelAnimationFrame(id)
  }, [dimensions.width, dimensions.height])

  // Đánh chỉ mục cạnh để truy xuất nhanh O(1)
  // Build edge index mapping that matches backend's edge_index order
  const graphData = useMemo(() => {
    if (!rawGraphData) return null

    return {
      nodes: rawGraphData.nodes.map(n => ({
        ...n,
        isInductive: visualModel === 'SAGE' && n.inTrainSet === false,
      })),
      links: rawGraphData.links.map((l, i) => ({ ...l, _idx: i }))
    }
  }, [rawGraphData, visualModel])

  useEffect(() => {
    if (graphData?.nodes?.length) {
      setStableGraphData(graphData)
      fitPendingRef.current = true
    }
  }, [graphData])

  const activeGraphData = stableGraphData || graphData

  const legendEntries = useMemo(() => {
    const explicitNames = Array.isArray(classNames) && classNames.length > 0
      ? classNames
      : null
    const labels = new Set()

    if (explicitNames) {
      explicitNames.forEach((_, index) => labels.add(index))
    } else if (Array.isArray(groundTruth) && groundTruth.length > 0) {
      groundTruth.forEach((label) => {
        if (Number.isFinite(label) && label >= 0) labels.add(Number(label))
      })
    } else {
      const epochInt = snapshots?.length
        ? Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat || 0)))
        : 0
      const snap = snapshots?.[epochInt]
      snap?.node_predictions?.forEach?.((label) => {
        if (Number.isFinite(label) && label >= 0) labels.add(Number(label))
      })
    }

    return Array.from(labels)
      .sort((a, b) => a - b)
      .slice(0, 12)
      .map((label) => ({
        label,
        name: explicitNames?.[label] || CLASS_NAMES[label] || `C${label}`,
        color: CLASS_COLORS[label % CLASS_COLORS.length],
      }))
  }, [classNames, currentEpochFloat, groundTruth, snapshots])

  // Context Menu Handlers
  const handleNodeRightClick = useCallback((node, event) => {
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      nodeId: node.id
    })
  }, [])

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const handleFocusNode = useCallback((nodeId) => {
    if (!fgRef.current || !activeGraphData) return
    const node = activeGraphData.nodes.find(n => n.id === nodeId)
    if (node) {
      fgRef.current.centerAt(node.x, node.y, 1000)
      fgRef.current.zoom(2.5, 1000)
      setSelectedNode(nodeId)
    }
    handleCloseContextMenu()
  }, [activeGraphData, setSelectedNode])

  const handleToggleKHop = useCallback(() => {
    setKHopEnabled(prev => !prev)
    handleCloseContextMenu()
  }, [])

  // Auto-focus on selected node when selectedNodeId changes
  useEffect(() => {
    if (!fgRef.current || !activeGraphData || selectedNodeId === null) return
    const node = activeGraphData.nodes.find(n => n.id === selectedNodeId)
    if (node && Number.isFinite(node.x) && Number.isFinite(node.y)) {
      fgRef.current.centerAt(node.x, node.y, 800)
      fgRef.current.zoom(2.5, 800)
    }
  }, [selectedNodeId, activeGraphData])

  // Simulation Setup — only run once when graph data is first loaded
  // This stabilizes node positions across epochs by not re-running layout
  const layoutInitializedRef = useRef(false)

  useEffect(() => {
    if (!fgRef.current || !activeGraphData || layoutInitializedRef.current) return

    const fg = fgRef.current
    fg.d3Force('charge')?.strength(-200).distanceMax(350)
    fg.d3Force('link')?.distance(50)
    fg.d3Force('center')?.strength(0.03)
    fg.d3ReheatSimulation()

    layoutInitializedRef.current = true
  }, [activeGraphData])

  // Reset layout initialization when graph data changes
  useEffect(() => {
    if (graphData?.nodes?.length) {
      layoutInitializedRef.current = false
    }
  }, [graphData])

  // 4. HÀM VẼ CANVAS: Luôn dùng animState.current.cef để nội suy màu sắc
  const nodeCanvasObject = useCallback((node, ctx, globalScale) => {
    try {
      const state = animState.current
      if (!state) return

      const { snaps, cef, vm, gt, sid, kHopEnabled, kHopNeighbors, showErrorsOnly: showErrors, nodeCorrectness } = state
      let nodeColor = '#475569'

      // Safe checks for required values
      if (!node || !ctx) return
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return

      const totalEpochsSafe = state.totalEpochs || 100
      const selectedModelSafe = visualModel || 'GCN'
      const gtSafe = gt || []

      // Check if this node is in K-Hop neighborhood
      let kHopInfo = null
      if (kHopEnabled && kHopNeighbors && sid !== null && typeof kHopNeighbors.get === 'function') {
        kHopInfo = kHopNeighbors.get(node.id)
      }

      // Check if node is misclassified (for error highlighting)
      const isMisclassified =
        showErrors && isNodeMisclassified(node.id, nodeCorrectness)

      if (Array.isArray(snaps) && snaps.length > 0) {
        const epochInt = Math.max(0, Math.min(snaps.length - 1, Math.floor(cef || 0)))
        const t = easeInOutCubic(Math.max(0, Math.min(1, (cef || 0) - epochInt)))
        const snapA = snaps[epochInt]
        const snapB = (snaps[epochInt + 1]) || snapA

        if (snapA && Array.isArray(snapA.node_predictions)) {
          const predA = snapA.node_predictions[node.id] ?? 0
          const predB = (snapB && snapB.node_predictions) ? (snapB.node_predictions[node.id] ?? predA) : predA
          nodeColor = getNodeColor(predA, predB, t, vm === 'error', gtSafe[node.id] || null)
        }
      }

      // Draw K-Hop glow effect
      if (kHopInfo && typeof kHopInfo === 'object' && kHopInfo.hop > 0) {
        if (!graphPerf.isLargeGraph) {
          const glowRadius = 15 - kHopInfo.hop * 3
          const alpha = 0.4 - kHopInfo.hop * 0.1
          const hopColors = ['#a855f7', '#6366f1', '#ec4899']

          ctx.beginPath()
          ctx.arc(node.x, node.y, glowRadius, 0, 2 * Math.PI)
          ctx.fillStyle = hopColors[kHopInfo.hop - 1] + Math.floor(alpha * 255).toString(16).padStart(2, '0')
          ctx.fill()
        }
      }

      if (isMisclassified) {
        if (graphPerf.isLargeGraph) {
          // Simple small dot — no animation, no glow
          ctx.beginPath()
          ctx.arc(node.x, node.y, 6, 0, 2 * Math.PI)
          ctx.fillStyle = 'rgba(244, 63, 94, 0.35)'
          ctx.fill()
        } else {
          const pulseRadius = state.disableMotion ? 11 : 12 + Math.sin(Date.now() / 200) * 3
          ctx.beginPath()
          ctx.arc(node.x, node.y, pulseRadius, 0, 2 * Math.PI)
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.6)'
          ctx.lineWidth = 2
          ctx.stroke()

          ctx.beginPath()
          ctx.arc(node.x, node.y, 8, 0, 2 * Math.PI)
          ctx.fillStyle = 'rgba(244, 63, 94, 0.15)'
          ctx.fill()
        }
      }

      // Enrich node with GAT maxAttn for glow effect
      const enrichedNode = {
        ...node,
        color: nodeColor,
        confidence: state.currentSnapshot?.node_confidence?.[node.id] ?? 0,
        isCorrect: (() => {
          const correctnessVal = state.currentSnapshot?.node_correctness?.[node.id]
          if (correctnessVal !== undefined && correctnessVal !== null) {
            return correctnessVal === 1 || correctnessVal === true
          }
          if (state.currentSnapshot?.node_predictions && Array.isArray(gtSafe) && gtSafe[node.id] !== undefined) {
            return state.currentSnapshot.node_predictions[node.id] === gtSafe[node.id]
          }
          return null
        })(),
        majorityRatio: state.currentSnapshot?.majority_ratio?.[node.id] ?? 0,
        neighborContext: state.currentSnapshot?.neighbor_majority?.[node.id] ?? null,
        dirichletEnergy: state.currentSnapshot?.dirichlet_energy ?? null,
        initialDirichletEnergy: snaps?.[0]?.dirichlet_energy ?? null,
        isSampled: state.sampledNodes?.has(node.id) === true,
        epochDelta: state.epochDeltaMap?.get(node.id) ?? null,
        isBestSoFar: state.currentSnapshot?.is_best_so_far === true,
        isShowcaseGraph: graphPerf.isShowcaseGraph,
      }
      if (selectedModelSafe === 'GAT' && state.nodeMaxAttnMap) {
        enrichedNode.maxAttn = state.nodeMaxAttnMap.get(node.id) || 0
      }

      drawTask1Node(enrichedNode, ctx, globalScale, {
        currentEpochFloat: cef || 0,
        totalEpochs: totalEpochsSafe,
        selectedModel: selectedModelSafe,
        isSelected: node.id === sid,
        isHovered: false,
        kHopInfo,
        isMisclassified,
        showNodeLabels: state.showNodeLabels,
        disableMotion: state.disableMotion,
        showcaseMode: graphPerf.isShowcaseGraph,
        largeGraph: graphPerf.isLargeGraph,
      })
    } catch (error) {
      logger.error('nodeCanvasObject error:', error)
    }
  }, [graphPerf, visualModel]) // totalEpochs removed — read from animState ref to avoid re-creating callback on every snapshot

  if (!activeGraphData) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[#2a1f45] bg-abyss">
        <div className="text-center animate-pulse">
          <Network size={40} className="mx-auto mb-4 opacity-40" />
          <p className="text-[10px] font-mono tracking-widest uppercase italic">Dang chuan bi do thi...</p>
        </div>
      </div>
    )
  }

  return (
    <div 
      ref={containerRef} 
      className={reportMode
        ? 'topology-report-root relative h-[740px] w-full cursor-default overflow-hidden bg-white'
        : 'w-full h-full relative bg-abyss overflow-visible cursor-crosshair'}
      onClick={handleCloseContextMenu}
      onContextMenu={(e) => e.preventDefault()}
    >
      <ForceGraph2D
        ref={fgRef}
        graphData={activeGraphData}
        width={dimensions.width}
        height={dimensions.height}
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode={() => 'replace'}
        onNodeRightClick={handleNodeRightClick}
        onNodeHover={(node) => setHoveredNode(node?.id ?? null)}
        // Ép vẽ lại bằng cách đưa CEF vào một prop mà thư viện theo dõi
        onRenderFramePre={(ctx) => {
          const state = animState.current
          if (!state.currentSnapshot) return
          const nodes = graphData?.nodes
          if (!nodes) return
          const sid = state.sid
          const selectedNode = sid !== null ? nodes.find(n => n.id === sid) : null

          // ── GAT: Attention Beams ────────────────────────────────────────
          if (state.model === 'GAT' && state.attentionMap) {
            const edges = state.currentSnapshot.attention_edges || []
            for (const edge of edges) {
              const src = edge.source
              const tgt = edge.target
              
              if (sid === null) {
                const weight = edge.weight || 0
                if (weight < 0.3) continue
                const otherNode = nodes.find(n => n.id === tgt)
                const sourceNode = nodes.find(n => n.id === src)
                if (!sourceNode || !otherNode || !Number.isFinite(sourceNode.x) || !Number.isFinite(otherNode.x)) continue
                const thickness = 0.5 + weight * 2
                ctx.beginPath()
                ctx.moveTo(sourceNode.x, sourceNode.y)
                ctx.lineTo(otherNode.x, otherNode.y)
                ctx.strokeStyle = `rgba(251, 191, 36, ${0.05 + weight * 0.12})`
                ctx.lineWidth = thickness
                ctx.stroke()
                continue
              }

              if (src !== sid && tgt !== sid) continue
              const otherId = src === sid ? tgt : src
              const otherNode = nodes.find(n => n.id === otherId)
              if (!otherNode || !Number.isFinite(otherNode.x)) continue
              const weight = edge.weight || 0
              if (weight < 0.05) continue
              const thickness = 1 + weight * 6
              const alpha = 0.2 + weight * 0.7
              ctx.beginPath()
              ctx.moveTo(selectedNode.x, selectedNode.y)
              ctx.lineTo(otherNode.x, otherNode.y)
              ctx.strokeStyle = `rgba(251, 191, 36, ${alpha})`
              ctx.lineWidth = thickness
              ctx.stroke()
            }
          }

          // ── GraphSAGE: Sampling Field ──────────────────────────────────
          if (state.model === 'SAGE') {
            const samplingEdges = state.currentSnapshot.sampling_edges || []
            const sampledSet = new Set()
            for (const edge of samplingEdges) {
              const src = typeof edge.source === 'object' ? edge.source.id : edge.source
              const tgt = typeof edge.target === 'object' ? edge.target.id : edge.target
              
              if (sid === null) {
                const sourceNode = nodes.find(n => n.id === src)
                const targetNode = nodes.find(n => n.id === tgt)
                if (!sourceNode || !targetNode || !Number.isFinite(sourceNode.x) || !Number.isFinite(targetNode.x)) continue
                ctx.save()
                ctx.beginPath()
                ctx.moveTo(sourceNode.x, sourceNode.y)
                ctx.lineTo(targetNode.x, targetNode.y)
                ctx.strokeStyle = 'rgba(34, 211, 238, 0.07)'
                ctx.lineWidth = 1
                ctx.setLineDash([2, 3])
                ctx.stroke()
                ctx.restore()
                continue
              }

              if (src === sid) sampledSet.add(tgt)
              if (tgt === sid) sampledSet.add(src)
            }
            if (sid !== null && selectedNode && Number.isFinite(selectedNode.x)) {
              // Draw sampling edges from selected node
              for (const otherId of sampledSet) {
                const otherNode = nodes.find(n => n.id === otherId)
                if (!otherNode || !Number.isFinite(otherNode.x)) continue
                ctx.beginPath()
                ctx.moveTo(selectedNode.x, selectedNode.y)
                ctx.lineTo(otherNode.x, otherNode.y)
                ctx.strokeStyle = 'rgba(34, 211, 238, 0.5)'
                ctx.lineWidth = 2
                ctx.stroke()
              }
              // Draw glow on sampled neighbors
              for (const otherId of sampledSet) {
                const otherNode = nodes.find(n => n.id === otherId)
                if (!otherNode || !Number.isFinite(otherNode.x)) continue
                ctx.beginPath()
                ctx.arc(otherNode.x, otherNode.y, 12, 0, 2 * Math.PI)
                ctx.fillStyle = 'rgba(34, 211, 238, 0.15)'
                ctx.fill()
                ctx.strokeStyle = 'rgba(34, 211, 238, 0.6)'
                ctx.lineWidth = 1.5
                ctx.stroke()
              }
              // Badge "S" on sampled neighbors
              for (const otherId of sampledSet) {
                const otherNode = nodes.find(n => n.id === otherId)
                if (!otherNode || !Number.isFinite(otherNode.x)) continue
                ctx.font = 'bold 7px Inter, sans-serif'
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillStyle = 'rgba(34, 211, 238, 0.9)'
                ctx.fillText('S', otherNode.x, otherNode.y - 14)
              }
            }
          }
        }}
        linkColor={(link) => {
          const { snaps, cef, sid, model, kHopEnabled, kHopNeighbors, attentionMap, perHeadMap, samplingEdgeMap } = animState.current

          // K-Hop edge highlighting
          if (kHopEnabled && kHopNeighbors && sid !== null) {
            const srcId = typeof link.source === 'object' ? link.source.id : link.source
            const tgtId = typeof link.target === 'object' ? link.target.id : link.target
            const srcHop = kHopNeighbors.get(srcId)
            const tgtHop = kHopNeighbors.get(tgtId)

            if (srcHop && tgtHop) {
              const maxHop = Math.max(srcHop.hop, tgtHop.hop)
              if (maxHop <= 3) {
                const alpha = 0.8 - maxHop * 0.2
                return `rgba(168, 85, 247, ${alpha})`
              }
            }
            return graphPerf.isShowcaseGraph ? 'rgba(91, 86, 137, 0.04)' : 'rgba(91, 86, 137, 0.05)'
          }

          // Large graph: use static color to avoid per-link prediction lookups
          if (graphPerf.isLargeGraph) {
            if (sid !== null) {
              const srcId = typeof link.source === 'object' ? link.source.id : link.source
              const tgtId = typeof link.target === 'object' ? link.target.id : link.target
              return (srcId === sid || tgtId === sid) ? 'rgba(168, 85, 247, 0.4)' : 'rgba(91, 86, 137, 0.08)'
            }
            return 'rgba(91, 86, 137, 0.1)'
          }

          if (model === 'SAGE') {
            const srcId = typeof link.source === 'object' ? link.source.id : link.source
            const tgtId = typeof link.target === 'object' ? link.target.id : link.target
            const edgeKey = Math.min(srcId, tgtId) + '-' + Math.max(srcId, tgtId)
            const isActive = samplingEdgeMap
              ? samplingEdgeMap.has(edgeKey)
              : (Math.sin(link._idx + Math.floor(cef * 5)) * 10000 % 1) > 0.4
            return isActive
              ? (graphPerf.isShowcaseGraph ? 'rgba(34, 211, 238, 0.28)' : 'rgba(34, 211, 238, 0.34)')
              : (graphPerf.isShowcaseGraph ? 'rgba(91, 86, 137, 0.045)' : 'rgba(91, 86, 137, 0.055)')
          }
          // GCN: gradient based on neighbor prediction agreement
          if (model === 'GCN' && snaps && snaps.length > 0) {
            const epochInt = Math.max(0, Math.min(snaps.length - 1, Math.floor(cef || 0)))
            const snap = snaps[epochInt]
            if (snap && snap.node_predictions) {
              const srcId = typeof link.source === 'object' ? link.source.id : link.source
              const tgtId = typeof link.target === 'object' ? link.target.id : link.target
              const srcPred = snap.node_predictions[srcId]
              const tgtPred = snap.node_predictions[tgtId]
              if (srcPred !== undefined && tgtPred !== undefined) {
                const agree = srcPred === tgtPred
                if (graphPerf.isShowcaseGraph) {
                  return agree ? 'rgba(99, 102, 241, 0.18)' : 'rgba(91, 86, 137, 0.05)'
                }
                return agree ? 'rgba(99, 102, 241, 0.3)' : 'rgba(91, 86, 137, 0.08)'
              }
            }
            return graphPerf.isShowcaseGraph ? 'rgba(91,86,137,0.06)' : 'rgba(91,86,137,0.12)'
          }
          if (model !== 'GAT' || !snaps || snaps.length === 0) return graphPerf.isShowcaseGraph ? 'rgba(91,86,137,0.06)' : 'rgba(91,86,137,0.12)'

          // Get attention weight from attentionMap (correct edge mapping)
          const srcId = typeof link.source === 'object' ? link.source.id : link.source
          const tgtId = typeof link.target === 'object' ? link.target.id : link.target
          const edgeKey = Math.min(srcId, tgtId) + '-' + Math.max(srcId, tgtId)

          let weight = 0
          const activeMap = perHeadMap || attentionMap
          if (activeMap) {
            weight = activeMap.get(edgeKey) || 0
          }

          if (sid !== null) {
            const isConnected = srcId === sid || tgtId === sid
            return isConnected ? `rgba(168, 85, 247, ${0.34 + weight * 0.42})` : (graphPerf.isShowcaseGraph ? 'rgba(91,86,137,0.045)' : 'rgba(91,86,137,0.065)')
          }
          return `rgba(99, 102, 241, ${graphPerf.isShowcaseGraph ? 0.075 + weight * 0.18 : 0.1 + weight * 0.27})`
        }}
        linkDirectionalParticles={(link) => {
          const { model, snaps, cef, attentionMap, perHeadMap, showLinkParticles, disableMotion } = animState.current
          if (!showLinkParticles || disableMotion) return 0
          if (model === 'SAGE') {
            const source = typeof link.source === 'object' ? link.source.id : link.source
            const target = typeof link.target === 'object' ? link.target.id : link.target
            const key = Math.min(source, target) + '-' + Math.max(source, target)
            return animState.current.samplingEdgeMap?.has(key) ? 1 : 0
          }
          // GCN: subtle message-passing particles (animate along edges)
          if (model === 'GCN' && snaps && snaps.length > 0) {
            const epochProgress = (cef || 0) / (snaps.length || 1)
            const seed = link._idx + Math.floor(cef * 3)
            // More particles early (message passing establishing), fewer later
            const threshold = 0.7 + epochProgress * 0.2
            return (Math.sin(seed) * 10000 % 1) > threshold ? 1 : 0
          }
          if (model !== 'GAT' || !snaps || snaps.length === 0) return 0

          const srcId = typeof link.source === 'object' ? link.source.id : link.source
          const tgtId = typeof link.target === 'object' ? link.target.id : link.target
          const edgeKey = Math.min(srcId, tgtId) + '-' + Math.max(srcId, tgtId)
          const activeMap = perHeadMap || attentionMap
          let weight = activeMap ? (activeMap.get(edgeKey) || 0) : 0
          return weight > 0.4 ? 2 : 0
        }}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleSpeed={(link) => {
          const { model, attentionMap, perHeadMap, showLinkParticles, disableMotion } = animState.current
          if (!showLinkParticles || disableMotion) return 0
          if (model === 'SAGE') return 0.015
          if (model === 'GCN') return 0.01

          const srcId = typeof link.source === 'object' ? link.source.id : link.source
          const tgtId = typeof link.target === 'object' ? link.target.id : link.target
          const edgeKey = Math.min(srcId, tgtId) + '-' + Math.max(srcId, tgtId)
          const activeMap = perHeadMap || attentionMap
          let weight = activeMap ? (activeMap.get(edgeKey) || 0) : 0
          return 0.002 + weight * 0.008
        }}
        linkDirectionalParticleColor={(link) => {
          const m = animState.current.model
          if (m === 'SAGE') return '#a855f7'
          if (m === 'GCN') return 'rgba(99, 102, 241, 0.6)'
          return 'rgba(168, 85, 247, 0.8)'
        }}
        onNodeClick={(node) => setSelectedNode(node.id)}
        onEngineStop={() => {
          if (fitPendingRef.current && fgRef.current) {
            fitPendingRef.current = false
            try {
              if (selectedNodeId !== null && activeGraphData) {
                const node = activeGraphData.nodes.find(n => n.id === selectedNodeId)
                if (node && Number.isFinite(node.x) && Number.isFinite(node.y)) {
                  fgRef.current.centerAt(node.x, node.y, 500)
                  fgRef.current.zoom(2.5, 500)
                  return
                }
              }
              fgRef.current.zoomToFit(500, 12)
            } catch {
              // Ignore transient fit errors while the layout is settling.
            }
          }
        }}
        warmupTicks={graphPerf.warmupTicks}
        cooldownTicks={graphPerf.cooldownTicks}
        backgroundColor="transparent"
        enableNodeDrag={graphPerf.enableNodeDrag}
      />

      {!reportMode && <NodeHoverCard />}

      {/* Context Menu */}
      {!reportMode && <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed z-[100] w-48 rounded-xl border border-line-default/50 bg-nebula backdrop-blur-xl shadow-2xl overflow-hidden p-1"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-line-subtle/60 mb-1">
              <div className="text-[9px] uppercase font-bold text-twilight tracking-widest">Node Actions</div>
            </div>
            <button
              onClick={() => handleFocusNode(contextMenu.nodeId)}
              className="w-full flex items-center gap-3 px-3 py-2 text-[11px] font-medium text-moonlight hover:text-white hover:bg-amethyst/20 rounded-lg transition-colors"
            >
              <span>🎯</span> Focus & Center
            </button>
            <button
              onClick={() => {
                setSelectedNode(contextMenu.nodeId)
                handleCloseContextMenu()
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-[11px] font-medium text-moonlight hover:text-white hover:bg-[#6366f1]/20 rounded-lg transition-colors"
            >
              <Info size={14} /> View Details
            </button>
            <button
              onClick={handleToggleKHop}
              className="w-full flex items-center gap-3 px-3 py-2 text-[11px] font-medium text-moonlight hover:text-white hover:bg-amethyst/20 rounded-lg transition-colors"
            >
              <Share2 size={14} /> {kHopEnabled ? 'Disable' : 'Enable'} K-Hop
            </button>
            <div className="h-px bg-line-default/60 my-1" />
            <button
              onClick={handleCloseContextMenu}
              className="w-full flex items-center gap-3 px-3 py-2 text-[11px] font-medium text-twilight hover:text-[#f43f5e] hover:bg-[#f43f5e]/10 rounded-lg transition-colors"
            >
              <X size={14} /> Close Menu
            </button>
          </motion.div>
        )}
      </AnimatePresence>}

      {!reportMode && <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10 items-end">
        {/* K-Hop Neighborhood Toggle */}
        {selectedNodeId !== null && (
          <div className="bg-deep/90 backdrop-blur-md rounded-lg p-1.5 border border-line-default/50">
            <div className="text-[8px] text-twilight uppercase tracking-wider mb-1 text-center">K-Hop</div>
            <div className="flex gap-1">
              <button
                onClick={() => setKHopEnabled(!kHopEnabled)}
                className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all
                  ${kHopEnabled
                    ? 'bg-amethyst/30 text-[#c084fc] border border-[#a855f7]/40'
                    : 'text-twilight hover:text-moonlight border border-line-default'}`}
              >
                {kHopEnabled ? 'ON' : 'OFF'}
              </button>
              {[1, 2, 3].map((k) => (
                <button
                  key={k}
                  onClick={() => setKHopMaxHops(k)}
                  className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all
                    ${kHopMaxHops === k
                      ? 'bg-amethyst/30 text-purple-300 border border-purple-500/40'
                      : 'text-twilight hover:text-moonlight border border-line-default'}`}
                >
                  {k}H
                </button>
              ))}
            </div>
          </div>
        )}

        {/* GAT Attention Head Selector with mini heatmap */}
        {visualModel === 'GAT' && (() => {
          // Compute per-head aggregate from current snapshot
          const cs = animState.current.currentSnapshot
          const perHead = cs?.attention_per_head
          let headShares = null
          if (perHead && typeof perHead === 'object') {
            const totals = {}
            let sum = 0
            for (const heads of Object.values(perHead)) {
              if (!Array.isArray(heads)) continue
              heads.forEach((w, idx) => { totals[idx] = (totals[idx] || 0) + w; sum += w })
            }
            if (sum > 0) {
              headShares = Object.entries(totals).map(([idx, w]) => ({
                idx, share: w / sum,
                color: ['#34d399', '#fbbf24', '#22d3ee', '#f472b6'][idx % 4],
              })).sort((a, b) => b.share - a.share)
            }
          }
          return (
            <div className="bg-deep/90 backdrop-blur-md rounded-lg p-1.5 border border-line-default/50">
              <div className="flex gap-1 mb-1">
                {['avg', '0', '1', '2', '3'].map((h) => (
                  <button
                    key={h}
                    onClick={() => setAttentionHead(h)}
                    className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all
                      ${attentionHead === h
                        ? 'bg-amethyst/30 text-[#c084fc] border border-[#a855f7]/40'
                        : 'text-twilight hover:text-moonlight'}`}
                  >
                    {h === 'avg' ? 'AVG' : `H${h}`}
                  </button>
                ))}
              </div>
              {/* Mini head heatmap bars */}
              {headShares && (
                <div className="space-y-0.5 px-0.5">
                  {headShares.map((h) => (
                    <div key={h.idx} className="flex items-center gap-1">
                      <span className="text-[7px] font-mono w-4 text-twilight">H{h.idx}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-nebula overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.max(4, h.share * 100)}%`,
                            backgroundColor: h.color,
                            opacity: attentionHead === String(h.idx) || attentionHead === 'avg' ? 1 : 0.4,
                          }}
                        />
                      </div>
                      <span className="text-[7px] font-mono w-7 text-right text-twilight">
                        {(h.share * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })()}
      </div>}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-abyss/80 backdrop-blur-md rounded-lg px-3 py-2
                      border border-line-subtle/50 z-10 pointer-events-none">
        <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-line-subtle/50 pb-2">
          <span className="rounded-full border border-line-subtle bg-white/5 px-2 py-1 text-[8px] uppercase tracking-[0.18em] text-moonlight">
            {selectedModel}
          </span>
          <span className="text-[9px] text-[#8f88c8]">
            {visualModel === 'GCN' && 'Edge agreement + smoothing halo'}
            {visualModel === 'GAT' && 'Attention focus + head-sensitive glow'}
            {visualModel === 'SAGE' && 'Neighborhood context + boundary resilience'}
          </span>
        </div>
        {/* Dynamic model metric — updates every epoch */}
        {(() => {
          const cs = animState.current.currentSnapshot
          if (!cs) return null
          if (visualModel === 'GCN') {
            const energy = cs.dirichlet_energy
            const ratios = cs.majority_ratio || []
            const agreement = ratios.length ? (ratios.reduce((a, b) => a + b, 0) / ratios.length * 100).toFixed(0) : '—'
            return (
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[8px] font-mono border-b border-line-subtle/50 pb-2">
                <span className="text-[#8f88c8]">Dirichlet E:</span>
                <span className={energy < 0.005 ? 'text-[#f43f5e]' : 'text-[#34d399]'}>{Number.isFinite(energy) ? energy.toFixed(4) : '—'}</span>
                <span className="text-[#3d3766]">·</span>
                <span className="text-[#8f88c8]">Agreement:</span>
                <span className="text-[#22d3ee]">{agreement}%</span>
              </div>
            )
          }
          if (visualModel === 'GAT') {
            const edges = cs.attention_edges || []
            const maxAttn = edges.length ? Math.max(...edges.map(e => e.weight || 0)) : 0
            const perHead = cs.attention_per_head
            const headCount = perHead && typeof perHead === 'object' ? Object.values(perHead).reduce((h, heads) => Math.max(h, Array.isArray(heads) ? heads.length : 0), 0) : 0
            return (
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[8px] font-mono border-b border-line-subtle/50 pb-2">
                <span className="text-[#8f88c8]">Max attn:</span>
                <span className="text-[#fbbf24]">{maxAttn.toFixed(3)}</span>
                <span className="text-[#3d3766]">·</span>
                <span className="text-[#8f88c8]">Heads:</span>
                <span className="text-[#fbbf24]">{headCount}</span>
                <span className="text-[#3d3766]">·</span>
                <span className="text-[#8f88c8]">Edges:</span>
                <span className="text-[#fbbf24]">{edges.length}</span>
              </div>
            )
          }
          if (visualModel === 'SAGE') {
            const samplingEdges = cs.sampling_edges
            const totalE = rawGraphData?.links?.length || 0
            const sampleCount = Array.isArray(samplingEdges) ? samplingEdges.length : 0
            const coverage = totalE > 0 ? (sampleCount / totalE * 100).toFixed(1) : '—'
            const boundary = cs.boundary_accuracy
            return (
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[8px] font-mono border-b border-line-subtle/50 pb-2">
                <span className="text-[#8f88c8]">Sampling:</span>
                <span className="text-[#a855f7]">{sampleCount}/{totalE} ({coverage}%)</span>
                <span className="text-[#3d3766]">·</span>
                <span className="text-[#8f88c8]">Boundary:</span>
                <span className={boundary > 0.7 ? 'text-[#34d399]' : 'text-[#fbbf24]'}>{Number.isFinite(boundary) ? (boundary * 100).toFixed(1) + '%' : '—'}</span>
              </div>
            )
          }
          return null
        })()}
        <div className="flex flex-wrap items-center gap-3 max-w-[22rem]">
          {legendEntries.map((entry) => (
            <div key={entry.label} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: entry.color }} />
              <span className="text-[9px] text-twilight font-bold font-mono">{entry.name}</span>
            </div>
          ))}
        </div>
        {selectedNodeId !== null && kHopEnabled && (
          <div className="mt-2 pt-2 border-t border-line-subtle/50">
            <div className="text-[8px] text-[#3d3766] uppercase tracking-wider mb-1">K-Hop Legend</div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#a855f7' }} />
                <span className="text-[8px] text-twilight font-bold">1-Hop</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#6366f1' }} />
                <span className="text-[8px] text-twilight font-bold">2-Hop</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#ec4899' }} />
                <span className="text-[8px] text-twilight font-bold">3-Hop</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
