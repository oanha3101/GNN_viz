import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { easeInOutCubic } from '../../engine/interpolate'

import { polygonHull } from 'd3-polygon'

const COMMUNITY_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#06b6d4', '#ec4899']

export default function TaskTopology4() {
  const rawGraphData = useGNNStore(s => s.graphData)
  const { snapshots, currentEpochFloat } = usePlayerStore()

  const containerRef = useRef()
  const fgRef = useRef()
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 })
  const [selectedCommunity, setSelectedCommunity] = useState(null)

  // 1. Fixed Graph Structure
  const graphData = useMemo(() => {
    if (!rawGraphData) return null
    return {
      nodes: rawGraphData.nodes.map(n => ({ ...n })),
      links: rawGraphData.links.map((l, i) => ({ ...l, _idx: i }))
    }
  }, [rawGraphData])

  // 2. Community Force (Island Force)
  useEffect(() => {
    if (fgRef.current && snapshots.length > 0 && graphData) {
        const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
        const snap = snapshots[epochInt]
        const preds = snap?.node_predictions || []
        
        const fg = fgRef.current
        const centers = [
            { x: -220, y: -150 }, { x: 220, y: -150 },
            { x: -220, y: 150 }, { x: 220, y: 150 },
            { x: 0, y: -250 }, { x: 0, y: 250 },
            { x: 0, y: 0 }
        ]

        fg.d3Force('community', (alpha) => {
            graphData.nodes.forEach(node => {
                const cid = preds[node.id] ?? 0
                const center = centers[cid % centers.length]
                // Apply velocity towards community center with higher strength (0.08)
                node.vx += (center.x - node.x) * alpha * 0.08
                node.vy += (center.y - node.y) * alpha * 0.08
            })
        })
        
        fg.d3Force('charge').strength(-120) // Push nodes apart within islands
        fg.d3ReheatSimulation()
    }
  }, [currentEpochFloat, snapshots, graphData])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      if (e.contentRect.width > 0) setDimensions({ width: e.contentRect.width, height: e.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [graphData])

  useEffect(() => {
    if (!fgRef.current) return
    const id = requestAnimationFrame(() => {
      try { fgRef.current && fgRef.current.zoomToFit(300, 32) } catch { /* settle */ }
    })
    return () => cancelAnimationFrame(id)
  }, [dimensions.width, dimensions.height])

  // 3. Convex Hulls Calculation
  const communityHulls = useMemo(() => {
    if (snapshots.length === 0 || !graphData) return []
    const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
    const snap = snapshots[epochInt]
    const preds = snap?.node_predictions || []
    
    const communities = {}
    graphData.nodes.forEach(node => {
      const cid = preds[node.id] ?? 0
      if (!communities[cid]) communities[cid] = []
      communities[cid].push([node.x, node.y])
    })

    return Object.entries(communities).map(([cid, points]) => {
      if (points.length < 3) return null
      const hull = polygonHull(points)
      return hull ? { cid: parseInt(cid), path: hull } : null
    }).filter(Boolean)
  }, [currentEpochFloat, snapshots, graphData])

  // 4. Custom Drawing
  const nodeCanvasObject = useCallback((node, ctx, globalScale) => {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return

    const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
    const snap = snapshots[epochInt] || snapshots[0]
    const communityId = snap?.node_predictions?.[node.id] ?? 0
    const isBridge = snap?.bridge_nodes?.[node.id] || false
    
    const color = COMMUNITY_COLORS[communityId % COMMUNITY_COLORS.length]
    const size = Math.sqrt(node.degree || 1) * 2 + 5

    // Bridge Pulse Effect
    if (isBridge) {
        const pulse = (Math.sin(Date.now() / 300) + 1) * 2;
        ctx.beginPath()
        ctx.arc(node.x, node.y, size + 4 + pulse, 0, 2 * Math.PI)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
        ctx.fill()
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 + pulse/10})`
        ctx.lineWidth = 1/globalScale
        ctx.stroke()
    }

    // Node Core with Gradient
    const grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, size)
    grad.addColorStop(0, '#fff')
    grad.addColorStop(0.2, color)
    grad.addColorStop(1, 'rgba(0,0,0,0.2)')
    
    ctx.beginPath()
    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI)
    ctx.fillStyle = grad
    ctx.fill()

    // Community Label (only at higher zoom)
    if (globalScale > 2) {
        ctx.font = `bold ${10/globalScale}px Inter, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillStyle = 'white'
        ctx.fillText(`${node.id}`, node.x, node.y + size + 7/globalScale)
    }
  }, [snapshots, currentEpochFloat])

  // Drawing the Hulls (Background clouds)
  const drawBefore = useCallback((ctx, globalScale) => {
    communityHulls.forEach(hull => {
      const color = COMMUNITY_COLORS[hull.cid % COMMUNITY_COLORS.length]
      ctx.beginPath()
      ctx.moveTo(hull.path[0][0], hull.path[0][1])
      for (let i = 1; i < hull.path.length; i++) {
        ctx.lineTo(hull.path[i][0], hull.path[i][1])
      }
      ctx.closePath()
      
      // Glassy bubble effect
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.strokeStyle = `${color}44`
      ctx.lineWidth = 40 / globalScale
      ctx.stroke()
      
      ctx.fillStyle = `${color}11`
      ctx.fill()
    })
  }, [communityHulls])

  if (!graphData) return null

  const modularityQ = snapshots[Math.floor(currentEpochFloat)]?.modularity_q || 0

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
        linkColor={(link) => {
            const snap = snapshots[Math.floor(currentEpochFloat)] || snapshots[0]
            if (!snap) return 'rgba(148,163,184,0.05)'
            const srcComm = snap.node_predictions?.[link.source.id]
            const tgtComm = snap.node_predictions?.[link.target.id]
            return srcComm === tgtComm 
                ? `${COMMUNITY_COLORS[srcComm % COMMUNITY_COLORS.length]}33` 
                : 'rgba(148, 163, 184, 0.05)'
        }}
        linkWidth={(link) => {
            const snap = snapshots[Math.floor(currentEpochFloat)] || snapshots[0]
            if (!snap) return 0.5
            const srcComm = snap.node_predictions?.[link.source.id]
            const tgtComm = snap.node_predictions?.[link.target.id]
            return srcComm === tgtComm ? 1.5 : 0.5
        }}
        cooldownTicks={100}
        backgroundColor="transparent"
        onNodeClick={(node) => {
          const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
          const snap = snapshots[epochInt]
          const cid = snap?.node_predictions?.[node.id]
          if (cid !== undefined) setSelectedCommunity(cid)
        }}
      />

      {/* Q HUD — compact bottom-right */}
      <div className="absolute top-12 left-2 z-10">
        <div className="bg-slate-900/80 backdrop-blur-md rounded-lg px-3 py-2 border border-slate-700/40 flex items-center gap-2">
          <span className="text-[8px] text-slate-500 uppercase font-bold tracking-wider">Q</span>
          <span className={`text-base font-black font-mono leading-none ${modularityQ > 0.4 ? 'text-green-400' : 'text-amber-400'}`}>
              {modularityQ.toFixed(3)}
          </span>
          <div className="w-14 bg-slate-800/50 h-1.5 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-500 to-green-500 transition-all duration-500" 
                 style={{ width: `${modularityQ * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Legend — compact horizontal strip */}
      <div className="absolute bottom-2 left-2 right-2 bg-slate-900/80 backdrop-blur-md rounded-lg px-3 py-1.5 border border-slate-700/40 z-10 flex items-center gap-3 flex-wrap">
        {COMMUNITY_COLORS.slice(0, 6).map((c, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
            <span className="text-[8px] text-slate-400 font-mono">C{i}</span>
          </div>
        ))}
        <div className="flex items-center gap-1 ml-1 pl-2 border-l border-slate-700/50">
          <div className="w-2.5 h-2.5 rounded-full border border-white/60 bg-white/10" />
          <span className="text-[8px] text-slate-400 font-bold">Bridge</span>
        </div>
      </div>

      {/* Community Profile Panel — bottom-left */}
      {selectedCommunity !== null && (() => {
        const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
        const snap = snapshots[epochInt]
        const metrics = snap?.per_community_metrics?.[selectedCommunity]
        if (!metrics) return null
        const color = COMMUNITY_COLORS[selectedCommunity % COMMUNITY_COLORS.length]
        return (
          <div className="absolute bottom-14 left-2 z-10 bg-slate-900/90 backdrop-blur-md rounded-xl px-4 py-3 border border-slate-700/50 min-w-[220px]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-sm font-bold text-white">Community {selectedCommunity}</span>
              </div>
              <button
                onClick={() => setSelectedCommunity(null)}
                className="text-[10px] text-slate-400 hover:text-white transition-colors font-bold"
              >
                Clear
              </button>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="text-slate-500">Size</div>
              <div className="text-slate-200 font-mono text-right">{metrics.size ?? 'N/A'}</div>
              <div className="text-slate-500">Density</div>
              <div className="text-slate-200 font-mono text-right">{(metrics.density ?? 0).toFixed(3)}</div>
              <div className="text-slate-500">Conductance</div>
              <div className="text-slate-200 font-mono text-right">{(metrics.conductance ?? 0).toFixed(3)}</div>
              <div className="text-slate-500">Internal Edges</div>
              <div className="text-slate-200 font-mono text-right">{metrics.internal_edges ?? 'N/A'}</div>
              <div className="text-slate-500">External Edges</div>
              <div className="text-slate-200 font-mono text-right">{metrics.external_edges ?? 'N/A'}</div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

