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
    const density = snap?.graph_structural_metrics?.[selectedGraphIdx]?.density
    const clustering = snap?.graph_structural_metrics?.[selectedGraphIdx]?.avg_clustering
    const avgDeg = snap?.graph_structural_metrics?.[selectedGraphIdx]?.avg_degree
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
              if (fgRefDetail.current) fgRefDetail.current.zoomToFit(400, 80)
            }}
          />
        </div>

        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 50 }}>
          <div className="absolute top-3 left-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedGraphIdx(null)
                setSelectedNode(null)
              }}
              className="pointer-events-auto px-3 py-1.5 rounded-md text-micro font-bold tracking-wide bg-slate-900/95 text-slate-200 hover:bg-slate-800 transition-colors border border-slate-700/60 uppercase shadow-xl cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            >
              ← Exit drill-down
            </button>

            <div className="bg-slate-900/95 border border-slate-700/50 px-3 py-2.5 rounded-lg min-w-[220px] pointer-events-auto shadow-xl flex flex-col gap-2">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <h2 className="text-sm font-bold text-white leading-tight">
                    {GRAPH_LABELS[g.groundTruth] || `Class ${g.groundTruth}`}
                  </h2>
                  <p className="text-nano text-slate-500 font-mono">
                    #{selectedGraphIdx} · {g.nodes.length}n / {g.links.length}e
                  </p>
                </div>
                <div
                  className={`w-7 h-7 rounded-md flex items-center justify-center text-sm font-bold ${
                    isCorrect ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/20 text-red-300'
                  }`}
                >
                  {isCorrect ? '✓' : '✗'}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1 text-nano text-slate-400 font-mono bg-slate-950/60 rounded-md p-1.5 border border-slate-800/60">
                <Stat label="Density" value={density} />
                <Stat label="Clustering" value={clustering} />
                <Stat label="AvgDeg" value={avgDeg} digits={1} />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-nano text-slate-500 uppercase font-semibold">Confidence</span>
                  <span
                    className={`text-micro font-mono font-bold tabular-nums ${
                      conf > 0.8 ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {(conf * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-800/60 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${isCorrect ? 'bg-emerald-500' : 'bg-red-500'}`}
                    style={{ width: `${conf * 100}%` }}
                  />
                </div>
              </div>

              <TopContributors contributions={contributions[selectedGraphIdx]} />
            </div>
          </div>
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

function Stat({ label, value, digits = 3 }) {
  return (
    <div>
      <div className="text-slate-500 uppercase">{label}</div>
      <div className="text-slate-200 font-bold">
        {value != null && Number.isFinite(value) ? value.toFixed(digits) : '—'}
      </div>
    </div>
  )
}

function TopContributors({ contributions }) {
  const topNodes = useMemo(() => {
    if (!contributions?.length) return []
    return contributions
      .map((val, idx) => ({ id: idx, val }))
      .sort((a, b) => b.val - a.val)
      .slice(0, 3)
  }, [contributions])

  return (
    <div>
      <span className="text-nano text-slate-500 uppercase font-semibold block mb-1.5 border-l-2 border-amber-500 pl-2">
        Top contributors
      </span>
      {topNodes.length === 0 ? (
        <div className="text-nano text-slate-600 italic">No data yet</div>
      ) : (
        topNodes.map((node) => (
          <div key={node.id} className="flex items-center justify-between mb-1 last:mb-0 gap-2">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-sm flex items-center justify-center bg-slate-800 text-nano font-bold text-slate-100">
                {node.id}
              </div>
              <div className="h-1 w-16 bg-slate-800/50 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500" style={{ width: `${node.val * 100}%` }} />
              </div>
            </div>
            <span className="text-nano font-bold font-mono text-amber-400 tabular-nums">
              {(node.val * 100).toFixed(0)}%
            </span>
          </div>
        ))
      )}
    </div>
  )
}
