import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { easeInOutCubic, lerp } from '../../engine/interpolate'
import { CLASS_COLORS } from '../../utils/colors'

// Smooth color interpolation for edges
function getLinkColor(score) {
  // Positive: Bright Red, Uncertain: Bright Yellow, Negative: Visible Blue
  if (score > 0.7) return `rgba(239, 68, 68, ${0.7 + (score - 0.7) * 1.0})`;
  if (score > 0.3) return `rgba(234, 179, 8, ${0.5 + (score - 0.3) * 1.2})`;
  return `rgba(96, 165, 250, ${0.15 + score * 0.5})`;
}

export default function TaskTopology3() {
  const rawGraphData = useGNNStore(s => s.graphData)
  const groundTruth = useGNNStore(s => s.groundTruth)
  const taskData = useGNNStore(s => s.taskData)
  const selectedModel = useGNNStore(s => s.selectedModel)
  const { snapshots, currentEpochFloat } = usePlayerStore()

  const selectedNodeId = useGNNStore(s => s.selectedNodeId)
  const selectedTargetNodeId = useGNNStore(s => s.selectedTargetNodeId)
  const setSelectedNode = useGNNStore(s => s.setSelectedNode)

  const [showNodes, setShowNodes] = useState(true)
  const [showTriangles, setShowTriangles] = useState(true)
  const [showTopK, setShowTopK] = useState(true)
  const [showErrorsOnly, setShowErrorsOnly] = useState(false)
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 })
  const [stableGraphData, setStableGraphData] = useState(null)
  const containerRef = useRef()
  const fgRef = useRef()
  const fitPendingRef = useRef(false)
  const trianglesRef = useRef([])

  // 1. Cố định cấu trúc đồ thị
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

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(([e]) => {
      if (e.contentRect.width > 0) setDimensions({ width: e.contentRect.width, height: e.contentRect.height })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!fgRef.current || !activeGraphData) return
    const fg = fgRef.current
    fg.d3Force('charge')?.strength(-100).distanceMax(250)
    fg.d3Force('link')?.distance(35)
    fg.d3ReheatSimulation()
  }, [activeGraphData])

  // 2. Hàm vẽ Cạnh với NỘI SUY ĐIỂM SỐ (Interpolated Scores)
  const linkCanvasObject = useCallback((link, ctx) => {
    if (!snapshots || snapshots.length === 0) return

    const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
    const t = easeInOutCubic(Math.max(0, Math.min(1, currentEpochFloat - epochInt)))

    const snapA = snapshots[epochInt]
    const snapB = snapshots[epochInt + 1] || snapA

    // Explainability data
    const classifications = snapA?.edge_classifications || []
    const commonNeighbors = snapA?.test_edge_common_neighbors || []
    const testEdges = taskData?.testEdges || []

    // Find index in test edges
    const testIdx = testEdges.findIndex(te =>
      (te.source === link.source.id && te.target === link.target.id) ||
      (te.source === link.target.id && te.target === link.source.id)
    )

    let color = 'rgba(148, 163, 184, 0.15)'
    let width = 1.5
    let isFuture = false
    let isTargetedPair = false
    let isConnectedToSelected = false

    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;

    const hasSelection = selectedNodeId !== null;
    if (hasSelection) {
      if ((sourceId === selectedNodeId && targetId === selectedTargetNodeId) ||
          (sourceId === selectedTargetNodeId && targetId === selectedNodeId)) {
        isTargetedPair = true;
      }
      if (sourceId === selectedNodeId || targetId === selectedNodeId ||
          sourceId === selectedTargetNodeId || targetId === selectedTargetNodeId) {
        isConnectedToSelected = true;
      }
    }

    if (testIdx !== -1) {
      const classification = classifications[testIdx]
      const isFP = classification?.classification === 'FP'
      const isFN = classification?.classification === 'FN'
      const isTP = classification?.classification === 'TP'
      const isTN = classification?.classification === 'TN'

      // Error Analysis Mode: highlight FP/FN edges
      if (showErrorsOnly) {
        if (isFP) {
          color = 'rgba(239, 68, 68, 0.8)' // Red for false positive
          width = 5
        } else if (isFN) {
          color = 'rgba(234, 179, 8, 0.8)' // Yellow for false negative
          width = 5
        } else {
          color = 'rgba(148, 163, 184, 0.05)' // Dim correct predictions
          width = 1
        }
      } else {
        const scoreA = snapA?.edge_scores?.[testIdx] || 0
        const scoreB = snapB?.edge_scores?.[testIdx] || scoreA
        let score = lerp(scoreA, scoreB, t)
        if (selectedModel === 'SAGE') {
          const noise = (Math.sin(testIdx * 10 + currentEpochFloat * 8) * 0.05) * (1 - (currentEpochFloat / snapshots.length))
          score = Math.max(0, Math.min(1, score + noise))
        }
        color = getLinkColor(score)
        width = 3 + score * 4
      }

      isFuture = !testEdges[testIdx].exists && (showErrorsOnly ? isFP : (snapA?.edge_scores?.[testIdx] || 0) > 0.5)
    }

    ctx.beginPath()

    // Animation for dotted future links
    if (isFuture) {
      ctx.setLineDash([4, 4])
      ctx.lineDashOffset = -(performance.now() / 40) % 10
    } else {
      ctx.setLineDash([])
    }

    // If there is a selection, dim unselected edges
    let finalAlpha = 1;
    if (hasSelection) {
      if (isTargetedPair) {
        width = Math.max(width, 4);
        color = '#fff'; // Brilliant white for the target pair
      } else if (isConnectedToSelected) {
        finalAlpha = 0.6; // Keep connections to selected nodes somewhat visible
      } else {
        finalAlpha = 0.05; // Dim the rest heavily
      }
    }

    ctx.globalAlpha = finalAlpha;
    ctx.moveTo(link.source.x, link.source.y)
    ctx.lineTo(link.target.x, link.target.y)
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.stroke()
    ctx.globalAlpha = 1;
    ctx.setLineDash([])

    // Triangle closure detection for GAT:
    // If this edge is a test edge with score > 0.5 and model is GAT,
    // check if source and target share a common neighbor with high attention
    if (selectedModel === 'GAT' && showTriangles && testIdx !== -1) {
      const scoreA = snapA?.edge_scores?.[testIdx] || 0
      if (scoreA > 0.5 && snapA?.attention_weights) {
        const sId = link.source.id
        const tId = link.target.id
        // Find common neighbors
        const graphLinks = rawGraphData?.links || []
        const sNeighbors = new Set()
        const tNeighbors = new Set()
        graphLinks.forEach((gl, gi) => {
          const gs = typeof gl.source === 'object' ? gl.source.id : gl.source
          const gt = typeof gl.target === 'object' ? gl.target.id : gl.target
          const attn = snapA.attention_weights[gi] || 0
          if (attn > 0.3) {
            if (gs === sId) sNeighbors.add(gt)
            if (gt === sId) sNeighbors.add(gs)
            if (gs === tId) tNeighbors.add(gt)
            if (gt === tId) tNeighbors.add(gs)
          }
        })
        // Common high-attention neighbors = triangle candidates
        for (const common of sNeighbors) {
          if (tNeighbors.has(common)) {
            // Find the common node's position
            const fg = fgRef.current
            const nodes = fg?.graphData()?.nodes
            const cNode = nodes?.find(n => n.id === common)
            if (cNode && Number.isFinite(cNode.x) && Number.isFinite(cNode.y)) {
              // Draw triangle highlight
              ctx.beginPath()
              ctx.moveTo(link.source.x, link.source.y)
              ctx.lineTo(link.target.x, link.target.y)
              ctx.lineTo(cNode.x, cNode.y)
              ctx.closePath()
              ctx.fillStyle = 'rgba(234, 179, 8, 0.06)'
              ctx.fill()
              ctx.strokeStyle = 'rgba(234, 179, 8, 0.25)'
              ctx.lineWidth = 1
              ctx.setLineDash([3, 3])
              ctx.stroke()
              ctx.setLineDash([])
            }
          }
        }
      }
    }
  }, [snapshots, currentEpochFloat, taskData, selectedModel, showTriangles, rawGraphData])

  if (!activeGraphData) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 text-slate-500">
        <div className="text-center">
          <div className="mb-2 text-3xl opacity-60">o-o</div>
          <div className="text-xs uppercase tracking-[0.24em]">Dang tai lien ket...</div>
        </div>
      </div>
    )
  }

  const auc = snapshots[Math.floor(currentEpochFloat)]?.auc || 0.5

  return (
    <div ref={containerRef} className="w-full h-full relative bg-slate-950 overflow-hidden">
      <ForceGraph2D
        ref={fgRef}
        graphData={activeGraphData}
        width={dimensions.width}
        height={dimensions.height}
        nodeCanvasObject={(node, ctx, globalScale) => {
          if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return
          if (!showNodes) {
            ctx.beginPath(); ctx.arc(node.x, node.y, 2, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fill();
            return;
          }
          const degree = node.degree || 1
          const r = Math.max(6, Math.sqrt(degree) * 2.5 + 4)
          const color = CLASS_COLORS[groundTruth?.[node.id]] || '#6366f1'

          // Glow halo
          ctx.beginPath()
          ctx.arc(node.x, node.y, r + 4, 0, 2 * Math.PI)
          ctx.fillStyle = color + '25'
          ctx.fill()

          // Main circle
          ctx.beginPath()
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)

          // Dim nodes if there's a selection and this node isn't involved
          const isSelected = selectedNodeId === node.id || selectedTargetNodeId === node.id;
          const hasSelection = selectedNodeId !== null;
          const globalAlpha = hasSelection && !isSelected ? 0.2 : 1;

          ctx.globalAlpha = globalAlpha;
          ctx.fillStyle = color
          ctx.fill()

          ctx.strokeStyle = isSelected ? '#fff' : 'rgba(255,255,255,0.5)'
          ctx.lineWidth = (isSelected ? 3 : 1.5) / globalScale
          ctx.stroke()

          // Node ID label
          const fontSize = Math.max(8, (isSelected ? 14 : 10) / Math.sqrt(globalScale))
          ctx.font = `bold ${fontSize}px monospace`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = '#fff'
          ctx.fillText(`${node.id}`, node.x, node.y)
          
          ctx.globalAlpha = 1; // Reset alpha
        }}
        onNodeClick={(node) => setSelectedNode(node.id)}
        nodeCanvasObjectMode={() => 'replace'}
        linkCanvasObject={linkCanvasObject}
        linkCanvasObjectMode={() => 'replace'}
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
        onRenderFramePost={(ctx, globalScale) => {
          if (!showTopK || !snapshots || snapshots.length === 0) return;
          const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)));
          const topLinks = snapshots[epochInt]?.top_k_links || [];
          if (topLinks.length === 0) return;

          const nodes = fgRef.current?.graphData()?.nodes;
          if (!nodes || nodes.length === 0) return;

          // Optional map for fast lookup if not present, but simple O(N) array search is fine for 100 nodes
          const nodeMap = new Map();
          for (const n of nodes) {
            nodeMap.set(n.id, n);
            nodeMap.set(String(n.id), n);
          }

          ctx.save();
          // Draw pulsating lines
          const time = performance.now() / 40;

          topLinks.forEach(link => {
            const sNode = nodeMap.get(link.source) || nodeMap.get(String(link.source));
            const tNode = nodeMap.get(link.target) || nodeMap.get(String(link.target));

            if (sNode && tNode && sNode.x !== undefined && tNode.x !== undefined) {
              ctx.beginPath();
              ctx.moveTo(sNode.x, sNode.y);
              ctx.lineTo(tNode.x, tNode.y);
              // Violet glowing effect based on predicted score
              ctx.strokeStyle = `rgba(167, 139, 250, ${link.score * 0.9 + 0.1})`;
              ctx.lineWidth = (1 + link.score * 2.5) / globalScale;
              ctx.setLineDash([6 / globalScale, 6 / globalScale]);
              ctx.lineDashOffset = -time % 100;
              ctx.stroke();
            }
          });
          ctx.restore();
        }}
        warmupTicks={30}
        cooldownTicks={100}
        backgroundColor="transparent"
      />

      {/* Top-K predicted links overlay */}
      {showTopK && (() => {
        const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
        const snap = snapshots[epochInt]
        const topLinks = snap?.top_k_links || []
        if (topLinks.length === 0 || !fgRef.current) return null

        return (
          <div className="absolute top-2 left-2 z-20 bg-violet-900/80 backdrop-blur-md rounded-lg px-2 py-1 border border-violet-500/30 text-[7px] flex flex-col pointer-events-none">
            <div className="text-violet-300 font-bold mb-0.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              Top-{topLinks.length} Predictions
            </div>
            <div className="space-y-0.5 max-h-20 overflow-hidden">
              {topLinks.slice(0, 4).map((l, i) => (
                <div key={i} className="flex items-center gap-1">
                  <span className="text-violet-400/80 font-mono">{l.source}↔{l.target}</span>
                  <span className="text-violet-300 font-bold ml-auto">{(l.score * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      <div className="absolute top-2 right-2 z-20 flex flex-col gap-1 items-end">
        <div className="flex gap-1">
          <button onClick={() => setShowNodes(!showNodes)}
            className={`px-2 py-1 rounded-md text-[8px] font-bold border transition-all ${showNodes ? 'bg-slate-900/80 border-slate-700 text-slate-400' : 'bg-indigo-600/20 border-indigo-500 text-indigo-400'}`}>
            {showNodes ? 'HIDE NODES' : 'SHOW NODES'}
          </button>
          <button onClick={() => setShowErrorsOnly(!showErrorsOnly)}
            className={`px-2 py-1 rounded-md text-[8px] font-bold border transition-all ${showErrorsOnly ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-slate-900/80 border-slate-700 text-slate-500'}`}>
            ERRORS
          </button>
        </div>
        {selectedModel === 'GAT' && (
          <button onClick={() => setShowTriangles(!showTriangles)}
            className={`px-2 py-1 rounded-md text-[8px] font-bold border transition-all ${showTriangles ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400' : 'bg-slate-900/80 border-slate-700 text-slate-500'}`}>
            TRIANGLES: {showTriangles ? 'ON' : 'OFF'}
          </button>
        )}
      </div>

      <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-1 w-auto max-w-[220px] pointer-events-none">
        <div className="bg-slate-900/90 backdrop-blur-md rounded-lg px-2 py-1 border border-slate-700/50 w-full flex justify-between items-center">
          <span className="text-[7px] text-slate-500 uppercase font-bold tracking-wider">AUC-ROC</span>
          <span className={`text-[11px] font-black font-mono leading-none ${auc > 0.85 ? 'text-green-500' : auc > 0.7 ? 'text-yellow-500' : 'text-red-500'}`}>
            {auc.toFixed(3)}
          </span>
        </div>

        <div className="bg-slate-900/90 backdrop-blur-md rounded-lg px-2 py-1.5 border border-slate-700/50 w-full text-[8px] pointer-events-auto">
          <div className="space-y-1.5 min-w-[150px]">
            <div className="text-slate-300 font-bold mb-1 uppercase tracking-wider text-[7px] border-b border-slate-800 pb-1">Chú thích đồ thị</div>
            
            <div className="flex items-center gap-2">
              <div className="w-4 border-t-2 border-slate-500" />
              <span className="text-slate-400 font-medium">Đường liền (Cấu trúc gốc)</span>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="w-4 border-t-2 border-dashed border-red-400 drop-shadow-[0_0_2px_rgba(248,113,113,0.8)]" />
              <span className="text-slate-400 font-medium">Nét đứt (Links dự đoán mới)</span>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="w-4 border-t-[3px] border-white drop-shadow-[0_0_3px_rgba(255,255,255,0.8)]" />
              <span className="text-slate-300 font-bold">Viền trắng (Cạnh đang chọn)</span>
            </div>
            
            <div className="pt-1 mt-1 border-t border-slate-800">
              <div className="flex items-center justify-between text-[7px] text-slate-500 mb-0.5 font-bold">
                <span>0%</span>
                <span className="text-slate-400">Xác suất kết nối</span>
                <span>100%</span>
              </div>
              <div className="w-full h-1.5 bg-gradient-to-r from-blue-500 via-yellow-500 to-red-500 rounded-sm opacity-80" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
