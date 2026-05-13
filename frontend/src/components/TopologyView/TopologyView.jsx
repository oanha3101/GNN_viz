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

export default function TopologyView() {
  // 1. Dữ liệu tĩnh
  const rawGraphData = useGNNStore(s => s.graphData)
  const groundTruth = useGNNStore(s => s.groundTruth)
  const selectedModel = useGNNStore(s => s.selectedModel)
  const viewMode = useGNNStore(s => s.viewMode)
  const selectedNodeId = useGNNStore(s => s.selectedNodeId)
  const setSelectedNode = useGNNStore(s => s.setSelectedNode)
  const setHoveredNode = useGNNStore(s => s.setHoveredNode)
  const attentionHead = useGNNStore(s => s.attentionHead)
  const setAttentionHead = useGNNStore(s => s.setAttentionHead)

  // 2. Dữ liệu động
  const snapshots = usePlayerStore(s => s.snapshots)
  const currentEpochFloat = usePlayerStore(s => s.currentEpochFloat)
  const totalEpochs = usePlayerStore(s => s.totalEpochs)

  const [dimensions, setDimensions] = useState({ width: 800, height: 400 })
  const [stableGraphData, setStableGraphData] = useState(null)
  const containerRef = useRef()
  const fgRef = useRef()
  const fitPendingRef = useRef(false)

  // Context Menu state
  const [contextMenu, setContextMenu] = useState(null) // { x, y, nodeId }

  // K-Hop neighborhood state
  const [kHopEnabled, setKHopEnabled] = useState(true)
  const [kHopMaxHops, setKHopMaxHops] = useState(3)
  const kHopNeighborsRef = useRef(null)

  // Misclassification Explorer state
  const [showErrorsOnly, setShowErrorsOnly] = useState(false)

  // 3. StateRef: Đảm bảo luồng vẽ Canvas luôn lấy được dữ liệu mới nhất mà không trễ nhịp
  const animState = useRef({
    snaps: [],
    cef: 0,
    sid: null,
    vm: 'prediction',
    gt: null,
    model: 'GCN',
    head: 'avg',
    kHopEnabled: true,
    kHopMaxHops: 3,
    kHopNeighbors: null,
    showErrorsOnly: false,
    nodeCorrectness: null,
  })

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
    if (selectedModel === 'GAT') {
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
    if (selectedModel === 'GAT' && attentionHead !== 'avg') {
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

    animState.current = {
      snaps: snapshots || [],
      cef: currentEpochFloat,
      sid: selectedNodeId,
      vm: viewMode,
      gt: groundTruth || null,
      model: selectedModel,
      head: attentionHead,
      kHopEnabled,
      kHopMaxHops,
      kHopNeighbors: kHopNeighborsRef.current,
      showErrorsOnly,
      nodeCorrectness: currentSnap ? (currentSnap.node_correctness || null) : null,
      attentionMap,
      perHeadMap,
      nodeMaxAttnMap,
    }

    // Compute K-Hop neighbors when selected node changes
    if (selectedNodeId !== null && rawGraphData?.links && kHopEnabled) {
      kHopNeighborsRef.current = computeKHopNeighbors(selectedNodeId, rawGraphData.links, kHopMaxHops)
    } else {
      kHopNeighborsRef.current = null
    }
  }, [snapshots, currentEpochFloat, selectedNodeId, viewMode, groundTruth, selectedModel, attentionHead, kHopEnabled, kHopMaxHops, rawGraphData, showErrorsOnly])

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
      try { fgRef.current && fgRef.current.zoomToFit(300, 32) } catch {
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
        isInductive: selectedModel === 'SAGE' && n.inTrainSet === false,
      })),
      links: rawGraphData.links.map((l, i) => ({ ...l, _idx: i }))
    }
  }, [rawGraphData, selectedModel])

  useEffect(() => {
    if (graphData?.nodes?.length) {
      setStableGraphData(graphData)
      fitPendingRef.current = true
    }
  }, [graphData])

  const activeGraphData = stableGraphData || graphData

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

  // Simulation Setup — only run once when graph data is first loaded
  // This stabilizes node positions across epochs by not re-running layout
  const layoutInitializedRef = useRef(false)

  useEffect(() => {
    if (!fgRef.current || !activeGraphData || layoutInitializedRef.current) return

    const fg = fgRef.current
    fg.d3Force('charge')?.strength(-120).distanceMax(300)
    fg.d3Force('link')?.distance(35)
    fg.d3Force('center')?.strength(0.05)
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

      const totalEpochsSafe = totalEpochs || 100
      const selectedModelSafe = selectedModel || 'GCN'
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
        const glowRadius = 15 - kHopInfo.hop * 3
        const alpha = 0.4 - kHopInfo.hop * 0.1
        const hopColors = ['#a855f7', '#6366f1', '#ec4899']

        ctx.beginPath()
        ctx.arc(node.x, node.y, glowRadius, 0, 2 * Math.PI)
        ctx.fillStyle = hopColors[kHopInfo.hop - 1] + Math.floor(alpha * 255).toString(16).padStart(2, '0')
        ctx.fill()
      }

      if (isMisclassified) {
        const pulseRadius = 12 + Math.sin(Date.now() / 200) * 3
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

      // Enrich node with GAT maxAttn for glow effect
      const enrichedNode = { ...node, color: nodeColor }
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
      })
    } catch (error) {
      logger.error('nodeCanvasObject error:', error)
    }
  }, [selectedModel, totalEpochs]) // Removed showErrorsOnly dependency

  if (!activeGraphData) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[#2a1f45] bg-[#0a0514]">
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
      className="w-full h-full relative bg-[#0a0514] overflow-visible cursor-crosshair"
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
        onRenderFramePre={() => { }}
        linkColor={(link) => {
          const { snaps, cef, sid, model, kHopEnabled, kHopNeighbors, attentionMap, perHeadMap } = animState.current

          // K-Hop edge highlighting
          if (kHopEnabled && kHopNeighbors && sid !== null) {
            const srcId = typeof link.source === 'object' ? link.source.id : link.source
            const tgtId = typeof link.target === 'object' ? link.target.id : link.target
            const srcHop = kHopNeighbors.get(srcId)
            const tgtHop = kHopNeighbors.get(tgtId)

            // Highlight edges in the K-Hop neighborhood
            if (srcHop && tgtHop) {
              const maxHop = Math.max(srcHop.hop, tgtHop.hop)
              if (maxHop <= 3) {
                const alpha = 0.8 - maxHop * 0.2
                return `rgba(168, 85, 247, ${alpha})`
              }
            }
            // Dim edges outside the neighborhood
            return 'rgba(91, 86, 137, 0.03)'
          }

          if (model === 'SAGE') {
            const seed = link._idx + Math.floor(cef * 5)
            const isActive = (Math.sin(seed) * 10000 % 1) > 0.4
            return isActive ? 'rgba(168, 85, 247, 0.2)' : 'rgba(91, 86, 137, 0.04)'
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
                return agree ? 'rgba(99, 102, 241, 0.25)' : 'rgba(91, 86, 137, 0.06)'
              }
            }
            return 'rgba(91,86,137,0.1)'
          }
          if (model !== 'GAT' || !snaps || snaps.length === 0) return 'rgba(91,86,137,0.1)'

          // Get attention weight from attentionMap (correct edge mapping)
          const srcId = typeof link.source === 'object' ? link.source.id : link.source
          const tgtId = typeof link.target === 'object' ? link.target.id : link.target
          const edgeKey = Math.min(srcId, tgtId) + '-' + Math.max(srcId, tgtId)

          let weight = 0
          // Use per-head map if a specific head is selected, otherwise use average
          const activeMap = perHeadMap || attentionMap
          if (activeMap) {
            weight = activeMap.get(edgeKey) || 0
          }

          if (sid !== null) {
            const isConnected = link.source.id === sid || link.target.id === sid
            return isConnected ? `rgba(168, 85, 247, ${0.4 + weight * 0.6})` : 'rgba(91,86,137,0.05)'
          }
          return `rgba(99, 102, 241, ${0.08 + weight * 0.25})`
        }}
        linkDirectionalParticles={(link) => {
          const { model, snaps, cef, attentionMap, perHeadMap } = animState.current
          if (model === 'SAGE') {
            const seed = link._idx + Math.floor(cef * 10)
            return (Math.sin(seed) * 10000 % 1) > 0.85 ? 1 : 0
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
          const { model, attentionMap, perHeadMap } = animState.current
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
              fgRef.current.zoomToFit(400, 24)
            } catch {
              // Ignore transient fit errors while the layout is settling.
            }
          }
        }}
        warmupTicks={30}
        cooldownTicks={100}
        backgroundColor="transparent"
        enableNodeDrag={true}
      />

      <NodeHoverCard />

      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed z-[100] w-48 rounded-xl border border-[#2a1f45]/50 bg-[#071120]/95 backdrop-blur-xl shadow-2xl overflow-hidden p-1"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-[rgba(168,85,247,0.08)]/60 mb-1">
              <div className="text-[9px] uppercase font-bold text-[#5b5689] tracking-widest">Node Actions</div>
            </div>
            <button
              onClick={() => handleFocusNode(contextMenu.nodeId)}
              className="w-full flex items-center gap-3 px-3 py-2 text-[11px] font-medium text-[#a5a0d0] hover:text-white hover:bg-[#a855f7]/20 rounded-lg transition-colors"
            >
              <span>🎯</span> Focus & Center
            </button>
            <button
              onClick={() => {
                setSelectedNode(contextMenu.nodeId)
                handleCloseContextMenu()
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-[11px] font-medium text-[#a5a0d0] hover:text-white hover:bg-[#6366f1]/20 rounded-lg transition-colors"
            >
              <Info size={14} /> View Details
            </button>
            <button
              onClick={handleToggleKHop}
              className="w-full flex items-center gap-3 px-3 py-2 text-[11px] font-medium text-[#a5a0d0] hover:text-white hover:bg-[#a855f7]/20 rounded-lg transition-colors"
            >
              <Share2 size={14} /> {kHopEnabled ? 'Disable' : 'Enable'} K-Hop
            </button>
            <div className="h-px bg-[#2a1f45]/60 my-1" />
            <button
              onClick={handleCloseContextMenu}
              className="w-full flex items-center gap-3 px-3 py-2 text-[11px] font-medium text-[#5b5689] hover:text-[#f43f5e] hover:bg-[#f43f5e]/10 rounded-lg transition-colors"
            >
              <X size={14} /> Close Menu
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mode Toggles */}
      <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10 items-end">
        <div className="flex gap-1.5">
          {['prediction', 'error'].map((mode) => (
            <button
              key={mode}
              onClick={() => useGNNStore.getState().setViewMode(mode)}
              className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all border
                ${viewMode === mode
                  ? 'bg-indigo-600 border-indigo-400 text-white shadow-[0_0_15px_rgba(79,70,229,0.5)]'
                  : 'bg-[#0f0a1e] border-[rgba(168,85,247,0.08)] text-[#5b5689] hover:text-[#a5a0d0]'
                }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Misclassification Explorer Toggle */}
        <button
          onClick={() => setShowErrorsOnly(v => !v)}
          className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all border flex items-center gap-1.5
            ${showErrorsOnly
              ? 'bg-[#f43f5e]/20 border-[#f43f5e]/40 text-[#fda4af] shadow-[0_0_15px_rgba(239,68,68,0.3)]'
              : 'bg-[#0f0a1e] border-[rgba(168,85,247,0.08)] text-[#5b5689] hover:text-[#a5a0d0]'
            }`}
          title={showErrorsOnly
            ? 'Hide misclassification highlight'
            : 'Highlight misclassified nodes (red ring)'}
        >
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${showErrorsOnly ? 'bg-[#f43f5e]' : 'bg-[#5b5689]'}`} />
          <span>
            Errors Only
            {showErrorsOnly && (() => {
              const snaps = animState.current.snaps
              const cur = snaps[Math.max(0, Math.min(snaps.length - 1, Math.floor(currentEpochFloat)))]
              const n = countMisclassified(cur && cur.node_correctness)
              return n > 0 ? ` · ${n}` : ''
            })()}
          </span>
        </button>

        {/* K-Hop Neighborhood Toggle */}
        {selectedNodeId !== null && (
          <div className="bg-[#0f0a1e]/90 backdrop-blur-md rounded-lg p-1.5 border border-[#2a1f45]/50">
            <div className="text-[8px] text-[#5b5689] uppercase tracking-wider mb-1 text-center">K-Hop</div>
            <div className="flex gap-1">
              <button
                onClick={() => setKHopEnabled(!kHopEnabled)}
                className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all
                  ${kHopEnabled
                    ? 'bg-[#a855f7]/30 text-[#c084fc] border border-[#a855f7]/40'
                    : 'text-[#5b5689] hover:text-[#a5a0d0] border border-[#2a1f45]'}`}
              >
                {kHopEnabled ? 'ON' : 'OFF'}
              </button>
              {[1, 2, 3].map((k) => (
                <button
                  key={k}
                  onClick={() => setKHopMaxHops(k)}
                  className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all
                    ${kHopMaxHops === k
                      ? 'bg-[#a855f7]/30 text-purple-300 border border-purple-500/40'
                      : 'text-[#5b5689] hover:text-[#a5a0d0] border border-[#2a1f45]'}`}
                >
                  {k}H
                </button>
              ))}
            </div>
          </div>
        )}

        {/* GAT Attention Head Selector */}
        {selectedModel === 'GAT' && (
          <div className="flex gap-1 bg-[#0f0a1e]/90 backdrop-blur-md rounded-lg p-1 border border-[#2a1f45]/50">
            {['avg', '0', '1', '2', '3'].map((h) => (
              <button
                key={h}
                onClick={() => setAttentionHead(h)}
                className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all
                  ${attentionHead === h
                    ? 'bg-[#a855f7]/30 text-[#c084fc] border border-[#a855f7]/40'
                    : 'text-[#5b5689] hover:text-[#a5a0d0]'}`}
              >
                {h === 'avg' ? 'AVG' : `H${h}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-[#0a0514]/80 backdrop-blur-md rounded-lg px-3 py-2
                      border border-[rgba(168,85,247,0.08)]/50 z-10 pointer-events-none">
        <div className="flex items-center gap-3">
          {CLASS_COLORS.slice(0, 7).map((c, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: c }} />
              <span className="text-[9px] text-[#5b5689] font-bold font-mono">C{i}</span>
            </div>
          ))}
        </div>
        {selectedNodeId !== null && kHopEnabled && (
          <div className="mt-2 pt-2 border-t border-[rgba(168,85,247,0.08)]/50">
            <div className="text-[8px] text-[#3d3766] uppercase tracking-wider mb-1">K-Hop Legend</div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#a855f7' }} />
                <span className="text-[8px] text-[#5b5689] font-bold">1-Hop</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#6366f1' }} />
                <span className="text-[8px] text-[#5b5689] font-bold">2-Hop</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#ec4899' }} />
                <span className="text-[8px] text-[#5b5689] font-bold">3-Hop</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
