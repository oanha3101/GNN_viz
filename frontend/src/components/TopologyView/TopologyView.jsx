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

export default function TopologyView() {
  // 1. Dữ liệu tĩnh
  const rawGraphData = useGNNStore(s => s.graphData)
  const groundTruth = useGNNStore(s => s.groundTruth)
  const selectedModel = useGNNStore(s => s.selectedModel)
  const viewMode = useGNNStore(s => s.viewMode)
  const selectedNodeId = useGNNStore(s => s.selectedNodeId)
  const setSelectedNode = useGNNStore(s => s.setSelectedNode)
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

  // Tooltip state
  const [hoveredNode, setHoveredNode] = useState(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  // K-Hop neighborhood state
  const [kHopEnabled, setKHopEnabled] = useState(true)
  const [kHopMaxHops, setKHopMaxHops] = useState(3)
  const kHopNeighborsRef = useRef(null)

  // Misclassification Explorer state - TEMPORARILY DISABLED FOR DEBUGGING
  const [showErrorsOnly, setShowErrorsOnly] = useState(false)
  const showErrorsOnlySafe = false // Force disable until bug is fixed

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
    nodeCorrectness: null
  })

  // Cập nhật Ref và ép Redraw 60 lần/giây
  useEffect(() => {
    // Safely get current epoch snapshot data
    const currentSnap = snapshots && snapshots.length > 0
      ? snapshots[Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))]
      : null

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
      showErrorsOnlySafe,
      nodeCorrectness: currentSnap ? (currentSnap.node_correctness || null) : null
    }

    // Compute K-Hop neighbors when selected node changes
    if (selectedNodeId !== null && rawGraphData?.links && kHopEnabled) {
      kHopNeighborsRef.current = computeKHopNeighbors(selectedNodeId, rawGraphData.links, kHopMaxHops)
    } else {
      kHopNeighborsRef.current = null
    }
  }, [snapshots, currentEpochFloat, selectedNodeId, viewMode, groundTruth, selectedModel, attentionHead, kHopEnabled, kHopMaxHops, rawGraphData, showErrorsOnly])

  // Resize handler
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setDimensions({ width, height })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Đánh chỉ mục cạnh để truy xuất nhanh O(1)
  // Build edge index mapping that matches backend's edge_index order
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

      const { snaps, cef, vm, gt, sid, kHopEnabled, kHopNeighbors, showErrorsOnlySafe, nodeCorrectness } = state
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

      // Check if node is misclassified (for error highlighting) - DISABLED
      let isMisclassified = false
      // if (showErrorsOnlySafe && Array.isArray(nodeCorrectness) && nodeCorrectness.length > 0) {
      //   const nodeId = node.id
      //   if (typeof nodeId === 'number' && nodeId >= 0 && nodeId < nodeCorrectness.length) {
      //     isMisclassified = nodeCorrectness[nodeId] === 0
      //   }
      // }

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
        const hopColors = ['#22d3ee', '#a78bfa', '#fbbf24']

        ctx.beginPath()
        ctx.arc(node.x, node.y, glowRadius, 0, 2 * Math.PI)
        ctx.fillStyle = hopColors[kHopInfo.hop - 1] + Math.floor(alpha * 255).toString(16).padStart(2, '0')
        ctx.fill()
      }

      // Draw error highlight (red pulse ring for misclassified nodes) - DISABLED
      // if (showErrorsOnlySafe && isMisclassified) {
      //   const pulseRadius = 12 + Math.sin(Date.now() / 200) * 3
      //   ctx.beginPath()
      //   ctx.arc(node.x, node.y, pulseRadius, 0, 2 * Math.PI)
      //   ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)'
      //   ctx.lineWidth = 2
      //   ctx.stroke()
      //   
      //   ctx.beginPath()
      //   ctx.arc(node.x, node.y, 8, 0, 2 * Math.PI)
      //   ctx.fillStyle = 'rgba(239, 68, 68, 0.15)'
      //   ctx.fill()
      // }

      drawTask1Node({ ...node, color: nodeColor }, ctx, globalScale, {
        currentEpochFloat: cef || 0,
        totalEpochs: totalEpochsSafe,
        selectedModel: selectedModelSafe,
        isSelected: node.id === sid,
        isHovered: false,
        kHopInfo,
        isMisclassified: false // showErrorsOnlySafe && isMisclassified
      })
    } catch (error) {
      console.error('nodeCanvasObject error:', error)
    }
  }, [selectedModel, totalEpochs]) // Removed showErrorsOnly dependency

  if (!activeGraphData) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-700 bg-slate-950">
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
      className="w-full h-full relative bg-slate-950 overflow-visible cursor-crosshair"
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
        onNodeHover={(node) => setHoveredNode(node)}
        onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
        // Ép vẽ lại bằng cách đưa CEF vào một prop mà thư viện theo dõi
        onRenderFramePre={() => { }}
        linkColor={(link) => {
          const { snaps, cef, sid, model, kHopEnabled, kHopNeighbors } = animState.current

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
                return `rgba(34, 211, 238, ${alpha})`
              }
            }
            // Dim edges outside the neighborhood
            return 'rgba(148, 163, 184, 0.03)'
          }

          if (model === 'SAGE') {
            const seed = link._idx + Math.floor(cef * 5)
            const isActive = (Math.sin(seed) * 10000 % 1) > 0.4
            return isActive ? 'rgba(139, 92, 246, 0.2)' : 'rgba(148, 163, 184, 0.04)'
          }
          if (model !== 'GAT' || !snaps || snaps.length === 0) return 'rgba(148,163,184,0.1)'

          const snap = snaps[Math.floor(cef)] || snaps[0]

          // Get attention weight with proper bounds checking
          let weight = 0
          const attnWeights = snap.attention_weights
          if (attnWeights && Array.isArray(attnWeights)) {
            const weightIdx = link._idx
            if (weightIdx >= 0 && weightIdx < attnWeights.length) {
              weight = attnWeights[weightIdx] || 0
            }
          }

          if (sid !== null) {
            const isConnected = link.source.id === sid || link.target.id === sid
            return isConnected ? `rgba(34, 211, 238, ${0.4 + weight * 0.6})` : 'rgba(148,163,184,0.05)'
          }
          return `rgba(59, 130, 246, ${0.08 + weight * 0.25})`
        }}
        linkDirectionalParticles={(link) => {
          const { model, snaps, cef } = animState.current
          if (model === 'SAGE') {
            const seed = link._idx + Math.floor(cef * 10)
            return (Math.sin(seed) * 10000 % 1) > 0.85 ? 1 : 0
          }
          if (model !== 'GAT' || !snaps || snaps.length === 0) return 0
          const snap = snaps[Math.floor(cef)] || snaps[0]
          const attnWeights = snap?.attention_weights
          let weight = 0
          if (attnWeights && Array.isArray(attnWeights) && link._idx >= 0 && link._idx < attnWeights.length) {
            weight = attnWeights[link._idx] || 0
          }
          return weight > 0.4 ? 2 : 0
        }}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleSpeed={(link) => {
          const { model, snaps, cef } = animState.current
          if (model === 'SAGE') return 0.015
          const snap = snaps[Math.floor(cef)] || snaps[0]
          const attnWeights = snap?.attention_weights
          let weight = 0
          if (attnWeights && Array.isArray(attnWeights) && link._idx >= 0 && link._idx < attnWeights.length) {
            weight = attnWeights[link._idx] || 0
          }
          return 0.002 + weight * 0.008
        }}
        linkDirectionalParticleColor={(link) => animState.current.model === 'SAGE' ? '#8b5cf6' : 'rgba(34, 211, 238, 0.8)'}
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

      {/* Custom Tooltip */}
      <AnimatePresence>
        {hoveredNode && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            className="absolute z-[100] pointer-events-none px-4 py-3 rounded-2xl border border-slate-700/40 bg-[#020617]/95 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] min-w-[180px]"
            style={{ 
              left: tooltipPos.x + 20, 
              top: tooltipPos.y - 40,
            }}
          >
            <div className="flex items-center justify-between gap-4 mb-2">
              <div className="flex items-center gap-2">
                <span 
                  className="w-3 h-3 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)]" 
                  style={{ backgroundColor: CLASS_COLORS[groundTruth?.[hoveredNode.id] || 0] }} 
                />
                <span className="text-[11px] font-black text-white uppercase tracking-tighter">
                  Node #{hoveredNode.original_id || hoveredNode.id}
                </span>
              </div>
              <div className="text-[9px] bg-slate-800/80 px-1.5 py-0.5 rounded text-slate-400 font-mono">
                ID {hoveredNode.id}
              </div>
            </div>

            {hoveredNode.label_name && (
               <div className="text-[10px] text-indigo-300 font-bold mb-2 flex items-center gap-1.5 bg-indigo-500/10 px-2 py-1 rounded-lg border border-indigo-500/20">
                 <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                 Label: {hoveredNode.label_name}
               </div>
            )}

            <div className="space-y-1.5 mb-2">
              <div className="flex justify-between items-center text-[9px]">
                <span className="text-slate-500 uppercase font-bold">Ground Truth</span>
                <span className="text-slate-300 font-mono">{CLASS_NAMES[groundTruth?.[hoveredNode.id]] || groundTruth?.[hoveredNode.id] || 'N/A'}</span>
              </div>
              
              {snapshots?.[Math.floor(currentEpochFloat)]?.node_predictions?.[hoveredNode.id] !== undefined && (
                <div className="flex justify-between items-center text-[9px]">
                  <span className="text-slate-500 uppercase font-bold">GNN Prediction</span>
                  <span className="text-cyan-400 font-black">
                    {CLASS_NAMES?.[snapshots[Math.floor(currentEpochFloat)].node_predictions[hoveredNode.id]] 
                       || snapshots[Math.floor(currentEpochFloat)].node_predictions[hoveredNode.id]}
                  </span>
                </div>
              )}
            </div>

            {/* Quick Features Preview */}
            {hoveredNode.features && Object.keys(hoveredNode.features).length > 0 && (
              <div className="pt-2 border-t border-slate-800/60 mt-2 space-y-1">
                {Object.entries(hoveredNode.features).slice(0, 3).map(([key, val]) => (
                  <div key={key} className="flex justify-between items-center text-[8px]">
                    <span className="text-slate-500 truncate w-20">{key}</span>
                    <span className="text-emerald-400 font-mono font-bold">
                      {typeof val === 'number' ? val.toFixed(3) : String(val).substring(0, 8)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 pt-2 border-t border-slate-800/60 text-[8px] text-slate-500 italic flex items-center justify-center gap-1.5 bg-slate-900/40 -mx-4 -mb-3 rounded-b-2xl py-2">
               <Info size={10} className="text-indigo-400" /> 
               <span>CLICK ĐỂ XEM CHI TIẾT META</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed z-[100] w-48 rounded-xl border border-slate-700/50 bg-[#071120]/95 backdrop-blur-xl shadow-2xl overflow-hidden p-1"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-slate-800/60 mb-1">
              <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest">Node Actions</div>
            </div>
            <button
              onClick={() => handleFocusNode(contextMenu.nodeId)}
              className="w-full flex items-center gap-3 px-3 py-2 text-[11px] font-medium text-slate-300 hover:text-white hover:bg-cyan-500/20 rounded-lg transition-colors"
            >
              <span>🎯</span> Focus & Center
            </button>
            <button
              onClick={() => {
                setSelectedNode(contextMenu.nodeId)
                handleCloseContextMenu()
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-[11px] font-medium text-slate-300 hover:text-white hover:bg-indigo-500/20 rounded-lg transition-colors"
            >
              <Info size={14} /> View Details
            </button>
            <button
              onClick={handleToggleKHop}
              className="w-full flex items-center gap-3 px-3 py-2 text-[11px] font-medium text-slate-300 hover:text-white hover:bg-purple-500/20 rounded-lg transition-colors"
            >
              <Share2 size={14} /> {kHopEnabled ? 'Disable' : 'Enable'} K-Hop
            </button>
            <div className="h-px bg-slate-800/60 my-1" />
            <button
              onClick={handleCloseContextMenu}
              className="w-full flex items-center gap-3 px-3 py-2 text-[11px] font-medium text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
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
                  : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
                }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Misclassification Explorer Toggle - TEMPORARILY HIDDEN */}
        {/* <button
          onClick={() => setShowErrorsOnly(!showErrorsOnly)}
          className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all border flex items-center gap-1.5
            ${showErrorsOnly
              ? 'bg-red-500/20 border-red-500/40 text-red-300 shadow-[0_0_15px_rgba(239,68,68,0.3)]'
              : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
            }`}
        >
          <span>{showErrorsOnly ? '🔴' : '⚪'}</span>
          <span>Errors Only</span>
        </button> */}

        {/* K-Hop Neighborhood Toggle */}
        {selectedNodeId !== null && (
          <div className="bg-slate-900/90 backdrop-blur-md rounded-lg p-1.5 border border-slate-700/50">
            <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-1 text-center">K-Hop</div>
            <div className="flex gap-1">
              <button
                onClick={() => setKHopEnabled(!kHopEnabled)}
                className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all
                  ${kHopEnabled
                    ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-500 hover:text-slate-300 border border-slate-700'}`}
              >
                {kHopEnabled ? 'ON' : 'OFF'}
              </button>
              {[1, 2, 3].map((k) => (
                <button
                  key={k}
                  onClick={() => setKHopMaxHops(k)}
                  className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all
                    ${kHopMaxHops === k
                      ? 'bg-purple-500/30 text-purple-300 border border-purple-500/40'
                      : 'text-slate-500 hover:text-slate-300 border border-slate-700'}`}
                >
                  {k}H
                </button>
              ))}
            </div>
          </div>
        )}

        {/* GAT Attention Head Selector */}
        {selectedModel === 'GAT' && (
          <div className="flex gap-1 bg-slate-900/90 backdrop-blur-md rounded-lg p-1 border border-slate-700/50">
            {['avg', '0', '1', '2', '3'].map((h) => (
              <button
                key={h}
                onClick={() => setAttentionHead(h)}
                className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all
                  ${attentionHead === h
                    ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-500 hover:text-slate-300'}`}
              >
                {h === 'avg' ? 'AVG' : `H${h}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur-md rounded-lg px-3 py-2
                      border border-slate-800/50 z-10 pointer-events-none">
        <div className="flex items-center gap-3">
          {CLASS_COLORS.slice(0, 7).map((c, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: c }} />
              <span className="text-[9px] text-slate-500 font-bold font-mono">C{i}</span>
            </div>
          ))}
        </div>
        {selectedNodeId !== null && kHopEnabled && (
          <div className="mt-2 pt-2 border-t border-slate-800/50">
            <div className="text-[8px] text-slate-600 uppercase tracking-wider mb-1">K-Hop Legend</div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#22d3ee' }} />
                <span className="text-[8px] text-slate-500 font-bold">1-Hop</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#a78bfa' }} />
                <span className="text-[8px] text-slate-500 font-bold">2-Hop</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#fbbf24' }} />
                <span className="text-[8px] text-slate-500 font-bold">3-Hop</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
