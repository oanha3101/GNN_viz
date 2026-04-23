import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'

const GRAPH_LABELS = ['Dense Structure', 'Sparse Network']

/**
 * Mini circular-layout preview of a single graph.
 * Node color encodes learned attention weight.
 */
function MiniGraphSVG({ nodes, links, contributions, size = 100 }) {
  const padding = 15
  const r = (size - padding * 2) / 2
  const cx = size / 2
  const cy = size / 2

  const nodePos = useMemo(() => {
    const pos = {}
    const n = nodes.length
    nodes.forEach((node, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2
      pos[node.id] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
    })
    return pos
  }, [nodes, r, cx, cy])

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} className="drop-shadow-sm">
      {links.map((link, i) => {
        const s = typeof link.source === 'object' ? link.source.id : link.source
        const t = typeof link.target === 'object' ? link.target.id : link.target
        const p1 = nodePos[s]
        const p2 = nodePos[t]
        if (!p1 || !p2) return null
        return (
          <line
            key={i}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke="rgba(148,163,184,0.15)"
            strokeWidth="0.8"
          />
        )
      })}
      {nodes.map((node, i) => {
        const p = nodePos[node.id]
        if (!p) return null
        const weight = contributions ? contributions[i] || 0 : 0.5
        const nodeFill = weight > 0.8 ? '#ffffff' : weight > 0.5 ? '#f59e0b' : '#3b82f6'
        const nodeSize = 2.5 + weight * 4.5
        return (
          <g key={node.id}>
            {weight > 0.7 && (
              <circle cx={p.x} cy={p.y} r={nodeSize + 3} fill={nodeFill} opacity="0.15" />
            )}
            <circle
              cx={p.x}
              cy={p.y}
              r={nodeSize}
              fill={nodeFill}
              className="transition-all duration-500"
            />
          </g>
        )
      })}
    </svg>
  )
}

/**
 * Container-query style grid: columns derive from the left-panel width
 * (measured via ResizeObserver) instead of the viewport, so a narrow
 * workspace never gets squeezed to a single column.
 */
function useResponsiveGridCols(ref) {
  const [cols, setCols] = useState(3)
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return undefined
    const el = ref.current
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width
        let next = 1
        if (w >= 1400) next = 5
        else if (w >= 1100) next = 4
        else if (w >= 820) next = 3
        else if (w >= 520) next = 2
        setCols(next)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return cols
}

export default function TaskTopology2() {
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const taskData = useGNNStore((s) => s.taskData)
  const setSelectedNode = useGNNStore((s) => s.setSelectedNode)
  const selectedNodeId = useGNNStore((s) => s.selectedNodeId)
  const [selectedGraphIdx, setSelectedGraphIdx] = useState(null)
  const fgRefDetail = useRef()
  const gridRef = useRef(null)
  const cols = useResponsiveGridCols(gridRef)

  const graphs = taskData?.graphs || []

  const detailGraphData = useMemo(() => {
    if (selectedGraphIdx === null || !graphs[selectedGraphIdx]) return null
    const g = graphs[selectedGraphIdx]
    return {
      nodes: g.nodes.map((n) => ({ ...n })),
      links: g.links.map((l) => ({ ...l })),
    }
  }, [selectedGraphIdx, graphs])

  const epochInt = Math.floor(currentEpochFloat)
  const snap = snapshots[epochInt] || snapshots[snapshots.length - 1]

  const contributions = snap?.node_contributions || []
  const predictions = snap?.graph_predictions || []
  const confidenceScores = snap?.graph_confidences || []

  const renderNodeDetail = useCallback(
    (node, ctx, globalScale) => {
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return
      const graphContribs = contributions[selectedGraphIdx] || []
      const weight = graphContribs[node.id] || 0
      const color = weight > 0.8 ? '#ffffff' : weight > 0.5 ? '#f59e0b' : '#3b82f6'
      const size = (4 + weight * 12) / Math.sqrt(globalScale)

      ctx.save()
      const glowR = size * 3
      const grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowR)
      grad.addColorStop(0, weight > 0.5 ? `${color}44` : `${color}22`)
      grad.addColorStop(1, 'transparent')
      ctx.beginPath()
      ctx.arc(node.x, node.y, glowR, 0, 2 * Math.PI)
      ctx.fillStyle = grad
      ctx.fill()
      ctx.restore()

      ctx.beginPath()
      ctx.arc(node.x, node.y, size, 0, 2 * Math.PI)
      ctx.fillStyle = color
      ctx.fill()

      if (weight > 0.7) {
        const pulse = (Math.sin(Date.now() / 200 + node.id) + 1) * 1.5
        ctx.beginPath()
        ctx.arc(node.x, node.y, size + 2 + pulse, 0, 2 * Math.PI)
        ctx.strokeStyle = '#fbbf24'
        ctx.lineWidth = 1 / globalScale
        ctx.stroke()
      }

      const fontSize = Math.max(7, 10 / Math.sqrt(globalScale))
      ctx.font = `bold ${fontSize}px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = weight > 0.6 ? '#0f172a' : '#fff'
      ctx.fillText(`${node.id}`, node.x, node.y)
    },
    [selectedGraphIdx, contributions]
  )

  useEffect(() => {
    if (selectedGraphIdx !== null && fgRefDetail.current) {
      const fg = fgRefDetail.current
      fg.d3Force('charge').strength(-100).distanceMax(250)
      fg.d3Force('link').distance(40)
      fg.d3Force('center').strength(0.1)
      fg.d3ReheatSimulation()
    }
  }, [selectedGraphIdx])

  // Sync selection store → local drill-down
  useEffect(() => {
    if (selectedNodeId !== null && selectedNodeId !== selectedGraphIdx) {
      setSelectedGraphIdx(selectedNodeId)
    }
  }, [selectedNodeId, selectedGraphIdx])

  const showDetail = selectedGraphIdx !== null && detailGraphData && graphs.length > 0
  const g = showDetail ? graphs[selectedGraphIdx] : null
  const pred = showDetail ? predictions[selectedGraphIdx] : undefined
  const isCorrect = showDetail ? pred === g.groundTruth : false
  const conf = showDetail ? confidenceScores[selectedGraphIdx] || 0.5 : 0

  if (!graphs.length) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs bg-panel">
        No graph data
      </div>
    )
  }

  if (showDetail) {
    return (
      <div key="detail_view" className="w-full h-full relative bg-panel overflow-hidden">
        <div className="absolute inset-0" style={{ zIndex: 1 }}>
          <ForceGraph2D
            ref={fgRefDetail}
            graphData={detailGraphData}
            nodeCanvasObject={renderNodeDetail}
            nodeCanvasObjectMode={() => 'replace'}
            linkColor={() => 'rgba(59, 130, 246, 0.15)'}
            linkWidth={1.5}
            backgroundColor="transparent"
            onEngineStop={() => {
              if (fgRefDetail.current) fgRefDetail.current.zoomToFit(400, 30)
            }}
          />
        </div>

        {/* Corner-only exit control; full metadata lives in the right-rail Inspector */}
        <div className="absolute top-3 left-3 z-50">
          <button
            type="button"
            onClick={() => {
              setSelectedGraphIdx(null)
              setSelectedNode(null)
            }}
            className="px-3 py-1.5 rounded-md text-micro font-bold tracking-wide bg-slate-900/90 text-slate-200 hover:bg-slate-800 transition-colors border border-slate-700/60 uppercase shadow-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
          >
            ← Exit drill-down
          </button>
        </div>

        {/* Pill summary (GT / PRED / confidence) at top-right, non-blocking */}
        <div className="absolute top-3 right-3 z-50 flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-900/80 border border-slate-700/50 text-micro font-mono text-slate-300 shadow-lg">
          <span className="text-nano uppercase tracking-ultra text-slate-500">#{selectedGraphIdx}</span>
          <span className="text-slate-200">{GRAPH_LABELS[g.groundTruth] || `Class ${g.groundTruth}`}</span>
          <span
            className={`w-4 h-4 rounded-sm flex items-center justify-center text-nano font-bold ${
              isCorrect ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/25 text-red-300'
            }`}
          >
            {isCorrect ? '✓' : '✗'}
          </span>
          <span className={`tabular-nums ${conf > 0.8 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {(conf * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      key="grid_view"
      ref={gridRef}
      className="w-full h-full overflow-y-auto bg-panel custom-scrollbar"
    >
      <div className="pt-16 pb-6 px-6">
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {graphs.slice(0, 50).map((gr, i) => {
            const pr = predictions[i]
            const cf = confidenceScores[i] || 0
            const hasResult = pr !== undefined
            const ok = pr === gr.groundTruth
            return (
              <button
                type="button"
                key={i}
                onClick={() => {
                  setSelectedGraphIdx(i)
                  setSelectedNode(i)
                }}
                className={`group relative rounded-lg border transition-all cursor-pointer text-left bg-slate-900/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 ${
                  hasResult
                    ? ok
                      ? 'border-emerald-500/30 hover:border-emerald-500/60'
                      : 'border-red-500/30 hover:border-red-500/60'
                    : 'border-slate-800/60 hover:border-slate-600/80'
                }`}
              >
                {hasResult && (
                  <div
                    className={`absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center border-2 border-slate-950 z-20 text-xs font-bold ${
                      ok ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                    }`}
                  >
                    {ok ? '✓' : '✗'}
                  </div>
                )}

                <div className="h-28 p-3 relative">
                  <MiniGraphSVG
                    nodes={gr.nodes}
                    links={gr.links}
                    contributions={contributions[i]}
                  />
                </div>

                <div className="px-3 py-2 border-t border-slate-800/60 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-100 font-semibold uppercase truncate tracking-wide">
                      {GRAPH_LABELS[gr.groundTruth] || `Class ${gr.groundTruth}`}
                    </p>
                    <p className="text-nano text-slate-500 font-mono">
                      G#{i} · {gr.nodes.length}n/{gr.links.length}e
                    </p>
                  </div>
                  {hasResult && (
                    <span
                      className={`text-nano font-mono font-bold px-1.5 py-0.5 rounded-sm tabular-nums ${
                        cf > 0.8
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : cf > 0.5
                            ? 'bg-amber-500/15 text-amber-300'
                            : 'bg-red-500/15 text-red-300'
                      }`}
                    >
                      {(cf * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}


