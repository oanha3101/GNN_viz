import React, { useMemo, useRef, useEffect, useState } from 'react'
import usePlayerStore from '../../store/playerStore'
import useGNNStore from '../../store/useGNNStore'

const COMMUNITY_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#06b6d4', '#ec4899']

/**
 * DendrogramView (Sprint 2)
 * ─────────────────────────
 * Renders a REAL hierarchical dendrogram from scipy Ward linkage matrix
 * sent by the backend.
 * Falls back to a simplified cluster view when no linkage data available.
 */
export default function DendrogramView() {
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const graphData = useGNNStore(s => s.graphData)

  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [dims, setDims] = useState({ width: 400, height: 300 })

  // Use last available epoch that has linkage_matrix
  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  
  // Walk backwards to find nearest snapshot with linkage matrix
  const snap = useMemo(() => {
    for (let i = epochInt; i >= 0; i--) {
      if (snapshots[i]?.linkage_matrix) return snapshots[i]
    }
    return snapshots[epochInt]
  }, [snapshots, epochInt])

  // Responsive resize
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      if (width > 0 && height > 0) setDims({ width, height })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Build dendrogram tree from linkage matrix
  const tree = useMemo(() => {
    const lm = snap?.linkage_matrix
    if (!lm || lm.length === 0) return null

    const n = lm.length + 1  // number of leaves
    // Each row: [left_child, right_child, distance, count]
    // Nodes 0..(n-1) are leaves, n..(2n-2) are internal

    // Build positions using recursive layout
    const positions = {}  // nodeId -> { x, y }
    const heights = {}    // nodeId -> normalized height (0..1)

    const maxDist = Math.max(...lm.map(row => row[2]), 1)

    // Leaf x positions assigned by leaf order
    const leafOrder = []
    function getLeaves(nodeId) {
      if (nodeId < n) {
        leafOrder.push(nodeId)
        return
      }
      const row = lm[nodeId - n]
      getLeaves(Math.round(row[0]))
      getLeaves(Math.round(row[1]))
    }
    getLeaves(2 * n - 2)

    // Assign x coords to leaves
    leafOrder.forEach((leafId, pos) => {
      positions[leafId] = { xFrac: (pos + 0.5) / leafOrder.length }
      heights[leafId] = 0
    })

    // Assign x and height to internal nodes
    function assignInternal(nodeId) {
      if (nodeId < n) return positions[nodeId].xFrac
      const row = lm[nodeId - n]
      const left = Math.round(row[0])
      const right = Math.round(row[1])
      const dist = row[2]
      const lx = assignInternal(left)
      const rx = assignInternal(right)
      positions[nodeId] = { xFrac: (lx + rx) / 2 }
      heights[nodeId] = dist / maxDist
      return positions[nodeId].xFrac
    }
    assignInternal(2 * n - 2)

    return { positions, heights, lm, n, leafOrder, maxDist }
  }, [snap])

  // Community assignments at this epoch for leaf coloring
  const clusterMap = useMemo(() => {
    const preds = snap?.node_predictions
    if (!preds || !tree) return {}
    const map = {}
    tree.leafOrder.forEach(leafId => {
      map[leafId] = preds[leafId] ?? 0
    })
    return map
  }, [snap, tree])

  // Draw on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { width, height } = dims
    const dpr = window.devicePixelRatio || 1

    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    const pad = { top: 20, bottom: 30, left: 16, right: 16 }
    const W = width - pad.left - pad.right
    const H = height - pad.top - pad.bottom

    if (!tree) {
      // Fallback: show cluster pills when no linkage matrix yet
      const preds = snap?.node_predictions
      if (!preds) {
        ctx.fillStyle = '#475569'
        ctx.font = '11px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('Đang huấn luyện... dendrogram sẽ xuất hiện', width / 2, height / 2)
        return
      }
      // Draw simple community circles
      const comms = {}
      preds.forEach((c, i) => { if (!comms[c]) comms[c] = 0; comms[c]++ })
      const ids = Object.keys(comms).sort((a, b) => a - b)
      const cw = W / Math.max(ids.length, 1)
      ids.forEach((cid, ci) => {
        const cx = pad.left + ci * cw + cw / 2
        const cy = height / 2
        const r = Math.min(cw * 0.3, 28)
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, 2 * Math.PI)
        ctx.fillStyle = COMMUNITY_COLORS[cid % COMMUNITY_COLORS.length]
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.font = `bold ${Math.max(9, r * 0.5)}px monospace`
        ctx.textAlign = 'center'
        ctx.fillText(`C${cid}`, cx, cy - 4)
        ctx.font = `${Math.max(7, r * 0.35)}px monospace`
        ctx.fillStyle = 'rgba(255,255,255,0.7)'
        ctx.fillText(`${comms[cid]}`, cx, cy + 10)
      })
      ctx.fillStyle = '#374151'
      ctx.font = '8px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Linkage matrix loading at epoch 0/10/20...', width / 2, height - 6)
      return
    }

    const { positions, heights, lm, n, leafOrder } = tree

    // Map fractional positions to canvas coords
    const cx = (xFrac) => pad.left + xFrac * W
    const cy = (h) => pad.top + H * (1 - h)  // 0=bottom, 1=top

    // Draw connections
    function drawNode(nodeId) {
      if (nodeId < n) return  // leaf
      const row = lm[nodeId - n]
      const left = Math.round(row[0])
      const right = Math.round(row[1])
      const thisH = heights[nodeId]
      const lx = cx(positions[left].xFrac)
      const rx = cx(positions[right].xFrac)
      const mx = cx(positions[nodeId].xFrac)
      const topY = cy(thisH)
      const leftY = cy(heights[left])
      const rightY = cy(heights[right])

      // Left vertical
      ctx.beginPath()
      ctx.moveTo(lx, leftY)
      ctx.lineTo(lx, topY)
      ctx.strokeStyle = 'rgba(100,116,139,0.55)'
      ctx.lineWidth = 1.5
      ctx.stroke()
      // Right vertical
      ctx.beginPath()
      ctx.moveTo(rx, rightY)
      ctx.lineTo(rx, topY)
      ctx.stroke()
      // Horizontal connector
      ctx.beginPath()
      ctx.moveTo(lx, topY)
      ctx.lineTo(rx, topY)
      ctx.strokeStyle = 'rgba(71,85,105,0.4)'
      ctx.stroke()

      drawNode(left)
      drawNode(right)
    }

    drawNode(2 * n - 2)

    // Draw leaves
    leafOrder.forEach(leafId => {
      const lx = cx(positions[leafId].xFrac)
      const ly = cy(0)
      const comm = clusterMap[leafId] ?? 0
      const color = COMMUNITY_COLORS[comm % COMMUNITY_COLORS.length]

      ctx.beginPath()
      ctx.arc(lx, ly, 3, 0, 2 * Math.PI)
      ctx.fillStyle = color
      ctx.fill()

      // tick line
      ctx.beginPath()
      ctx.moveTo(lx, ly)
      ctx.lineTo(lx, ly + 4)
      ctx.strokeStyle = color + '80'
      ctx.lineWidth = 1
      ctx.stroke()
    })

    // Y-axis distance labels
    ctx.font = '7px monospace'
    ctx.fillStyle = '#475569'
    ctx.textAlign = 'right'
    for (let i = 0; i <= 4; i++) {
      const frac = i / 4
      const y = cy(frac)
      ctx.fillText((frac * tree.maxDist).toFixed(2), pad.left - 2, y + 3)
      ctx.beginPath()
      ctx.moveTo(pad.left, y)
      ctx.lineTo(pad.left + W, y)
      ctx.strokeStyle = 'rgba(30,41,59,0.5)'
      ctx.lineWidth = 0.5
      ctx.stroke()
    }

    // X label
    ctx.fillStyle = '#334155'
    ctx.font = '7px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('← Nodes (sampled) →', width / 2, height - 4)

  }, [tree, clusterMap, dims, snap])

  const modQ = snap?.modularity_q ?? 0
  const epoch = snap?.epoch ?? 0

  return (
    <div ref={containerRef} className="w-full h-full relative bg-slate-950 overflow-hidden">
      <canvas
        ref={canvasRef}
        style={{ width: dims.width, height: dims.height }}
        className="absolute inset-0"
      />

      {/* Info badge */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
        <div className="bg-slate-900/80 backdrop-blur-md rounded-lg px-2 py-1 border border-slate-700/40 text-[8px] font-mono">
          <span className="text-slate-500">EPOCH </span>
          <span className="text-cyan-400 font-bold">{epoch}</span>
          <span className="text-slate-600 mx-1">·</span>
          <span className="text-slate-500">Q=</span>
          <span className={`font-bold ${modQ > 0.4 ? 'text-green-400' : modQ > 0.2 ? 'text-yellow-400' : 'text-red-400'}`}>
            {modQ.toFixed(3)}
          </span>
        </div>
        {tree && (
          <div className="bg-slate-900/70 backdrop-blur-md rounded-lg px-2 py-1 border border-slate-700/30 text-[8px] text-slate-500">
            Ward linkage · {tree.n} nodes
          </div>
        )}
      </div>

      {/* Community legend */}
      {snap?.node_predictions && (() => {
        const uniq = [...new Set(snap.node_predictions)].sort((a, b) => a - b).slice(0, 6)
        return (
          <div className="absolute bottom-2 right-2 z-10 bg-slate-900/80 backdrop-blur-md rounded-lg px-2 py-1.5 border border-slate-700/40">
            <div className="flex gap-2">
              {uniq.map(cid => (
                <div key={cid} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COMMUNITY_COLORS[cid % COMMUNITY_COLORS.length] }} />
                  <span className="text-[7px] text-slate-400 font-mono">C{cid}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
