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

  const [showNodes, setShowNodes] = useState(true)
  const [showTriangles, setShowTriangles] = useState(true)
  const [showTopK, setShowTopK] = useState(true)
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
    
    // Find index in test edges
    const testIdx = testEdges.findIndex(te => 
      (te.source === link.source.id && te.target === link.target.id) ||
      (te.source === link.target.id && te.target === link.source.id)
    )

    let color = 'rgba(148, 163, 184, 0.15)'
    let width = 1.5
    let isFuture = false

    if (testIdx !== -1) {
      const scoreA = snapA?.edge_scores?.[testIdx] || 0
      const scoreB = snapB?.edge_scores?.[testIdx] || scoreA
      
      // Calculate smooth score via LERP
      let score = lerp(scoreA, scoreB, t)
      
      // SAGE specific Jitter
      if (selectedModel === 'SAGE') {
         const noise = (Math.sin(testIdx * 10 + currentEpochFloat * 8) * 0.05) * (1 - (currentEpochFloat/snapshots.length))
         score = Math.max(0, Math.min(1, score + noise))
      }

      color = getLinkColor(score)
      width = 3 + score * 4
      isFuture = !testEdges[testIdx].exists && score > 0.5
    }

    ctx.beginPath()
    if (isFuture) {
      ctx.setLineDash([4, 4])
      ctx.lineDashOffset = -(performance.now() / 40) % 10
    } else {
      ctx.setLineDash([])
    }
    
    ctx.moveTo(link.source.x, link.source.y)
    ctx.lineTo(link.target.x, link.target.y)
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.stroke()
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
          ctx.fillStyle = color
          ctx.fill()
          ctx.strokeStyle = 'rgba(255,255,255,0.5)'
          ctx.lineWidth = 1.5 / globalScale
          ctx.stroke()

          // Node ID label
          const fontSize = Math.max(8, 10 / Math.sqrt(globalScale))
          ctx.font = `bold ${fontSize}px monospace`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = '#fff'
          ctx.fillText(`${node.id}`, node.x, node.y)
        }}
        nodeCanvasObjectMode={() => 'replace'}
        linkCanvasObject={linkCanvasObject}
        linkCanvasObjectMode={() => 'replace'}
        onEngineStop={() => {
          if (fitPendingRef.current && fgRef.current) {
            fitPendingRef.current = false
            try {
              fgRef.current.zoomToFit(420, 72)
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

      {/* Top-K predicted links overlay — drawn via postRender */}
      {showTopK && (() => {
        const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
        const snap = snapshots[epochInt]
        const topLinks = snap?.top_k_links || []
        if (topLinks.length === 0 || !fgRef.current) return null
        
        return (
          <div className="absolute top-2 left-2 z-20 bg-violet-900/80 backdrop-blur-md rounded-xl px-3 py-1.5 border border-violet-500/30 text-[8px] flex flex-col pointer-events-none">
            <div className="text-violet-300 font-bold mb-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
              Top-{topLinks.length} Predicted Links
            </div>
            <div className="space-y-0.5 max-h-24 overflow-auto fade-in">
              {topLinks.slice(0, 6).map((l, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="w-4 h-0.5 bg-violet-400 rounded-full" style={{ opacity: l.score }} />
                  <span className="text-violet-400/80 font-mono">{l.source}↔{l.target}</span>
                  <span className="text-violet-300 font-bold ml-auto">{(l.score * 100).toFixed(0)}%</span>
                </div>
              ))}
              {topLinks.length > 6 && <div className="text-violet-600 italic">+{topLinks.length - 6} more...</div>}
            </div>
          </div>
        )
      })()}

      <div className="absolute top-12 left-2 z-20 flex gap-2">
        <button onClick={() => setShowNodes(!showNodes)} 
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${showNodes ? 'bg-slate-900/80 border-slate-700 text-slate-400' : 'bg-indigo-600/20 border-indigo-500 text-indigo-400'}`}>
          {showNodes ? '🧬 HIDE' : '👻 SHOW'}
        </button>
        {selectedModel === 'GAT' && (
          <button onClick={() => setShowTriangles(!showTriangles)} 
                  className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${showTriangles ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400' : 'bg-slate-900/80 border-slate-700 text-slate-500'}`}>
            △ {showTriangles ? 'ON' : 'OFF'}
          </button>
        )}
      </div>

      <div className="absolute bottom-2 right-2 z-10 flex flex-col items-end gap-1.5 w-40">
        <div className="bg-slate-900/90 backdrop-blur-md rounded-lg px-2.5 py-1.5 border border-slate-700/50 w-full flex justify-between items-center">
            <span className="text-[8px] text-slate-400 uppercase font-bold tracking-wider">AUC-ROC</span>
            <span className={`text-sm font-black font-mono leading-none ${auc > 0.85 ? 'text-green-500' : auc > 0.7 ? 'text-yellow-500' : 'text-red-500'}`}>
                {auc.toFixed(3)}
            </span>
        </div>

        <div className="bg-slate-900/90 backdrop-blur-md rounded-lg px-2.5 py-1.5 border border-slate-700/50 w-full text-[8px]">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-1 bg-red-600 rounded" /><span className="text-slate-300 font-bold">Positive</span></div>
                <span className="text-slate-500">&gt; 0.7</span>
            </div>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-1 bg-yellow-500 rounded" /><span className="text-slate-300">Uncertain</span></div>
                <span className="text-slate-500">0.3-0.7</span>
            </div>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-1 bg-blue-500 rounded" /><span className="text-slate-300">Negative</span></div>
                <span className="text-slate-500">&lt; 0.3</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
