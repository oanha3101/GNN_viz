import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import usePlayerStore from '../../store/playerStore'
import useGNNStore from '../../store/useGNNStore'
import { filterGraphsBy } from '../../utils/task6Metrics.js'

const NODE_COLORS = ['#22c55e', '#ef4444', '#3b82f6', '#eab308', '#a855f7', '#06b6d4']

/**
 * MiniGraphSVG for Task 6 — with optional "grow" animation.
 * Nodes & edges appear sequentially (GraphRNN-style) based on revealProgress.
 */
function MiniGraphSVG({ nodes, links, size = 130, valid, revealProgress = 1 }) {
  const padding = 20
  const r = (size - padding * 2) / 2
  const cx = size / 2
  const cy = size / 2

  const nodePos = useMemo(() => {
    const pos = {}
    const n = nodes.length
    if (n === 1) { pos[nodes[0].id] = { x: cx, y: cy }; return pos }
    nodes.forEach((node, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2
      pos[node.id] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
    })
    return pos
  }, [nodes, r, cx, cy])

  const visibleNodesCount = Math.ceil(nodes.length * revealProgress)
  const visibleLinksCount = Math.ceil(links.length * revealProgress)

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
      <defs>
        <filter id="glow6">
          <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      {links.slice(0, visibleLinksCount).map((link, i) => {
        const s = typeof link.source === 'object' ? link.source.id : link.source
        const t = typeof link.target === 'object' ? link.target.id : link.target
        if (s >= visibleNodesCount || t >= visibleNodesCount) return null
        const p1 = nodePos[s]; const p2 = nodePos[t]
        if (!p1 || !p2) return null
        return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                     stroke={valid ? '#4ade80' : '#f87171'} strokeWidth="1.2" strokeOpacity="0.4"
                     strokeDasharray="2 1" />
      })}

      {nodes.slice(0, visibleNodesCount).map((node, ni) => {
        const p = nodePos[node.id]
        if (!p) return null
        const color = NODE_COLORS[ni % NODE_COLORS.length]
        const delay = (ni / nodes.length) * 0.3
        return (
          <g key={node.id} style={{ transition: `all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)`, transitionDelay: `${delay}s` }}>
            <circle cx={p.x} cy={p.y} r={4.5} fill={color} filter="url(#glow6)" />
            <circle cx={p.x} cy={p.y} r={2} fill="#fff" />
          </g>
        )
      })}
    </svg>
  )
}

const FILTER_CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'valid', label: 'Valid' },
  { id: 'invalid', label: 'Invalid' },
  { id: 'novel', label: 'Novel' },
]

export default function TaskTopology6() {
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]

  const [expandedGraph, setExpandedGraph] = useState(null)
  const [revealProgress, setRevealProgress] = useState(1)
  // Filter chip state — also readable by Task6 Invalidity tab via useGNNStore
  // so clicking a row there can narrow the grid. Local to component for now.
  const filterMode = useGNNStore((s) => s.task6FilterMode) || 'all'
  const setFilterMode = useGNNStore((s) => s.setTask6FilterMode) || (() => {})

  const prevGraphsRef = useRef([])
  const rawGraphs = snap?.generated_graphs || prevGraphsRef.current || []
  useEffect(() => {
    if (snap?.generated_graphs?.length) prevGraphsRef.current = snap.generated_graphs
  }, [snap])

  // Grow-in animation when epoch ticks
  const prevEpochRef = useRef(epochInt)
  useEffect(() => {
    if (epochInt !== prevEpochRef.current) {
      prevEpochRef.current = epochInt
      setRevealProgress(0)
      let start = performance.now()
      const duration = 800
      const animate = (now) => {
        const p = Math.min(1, (now - start) / duration)
        setRevealProgress(p)
        if (p < 1) requestAnimationFrame(animate)
      }
      requestAnimationFrame(animate)
    }
  }, [epochInt])

  const generatedGraphs = useMemo(
    () => filterGraphsBy(rawGraphs, filterMode),
    [rawGraphs, filterMode],
  )

  if (!rawGraphs.length) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-600 bg-slate-950">
        <div className="text-center animate-pulse">
          <div className="text-5xl mb-4 opacity-20">&#9888;</div>
          <p className="text-xs font-black uppercase tracking-ultra">Awaiting Latent Formation</p>
        </div>
      </div>
    )
  }

  const validCount = rawGraphs.filter(g => g.valid).length
  const validityPct = ((validCount / rawGraphs.length) * 100).toFixed(0)
  const avgNodes = (rawGraphs.reduce((sum, g) => sum + g.nodes.length, 0) / rawGraphs.length).toFixed(1)
  const novelCount = rawGraphs.filter(g => g.matches_source !== true).length

  return (
    <div className="w-full h-full overflow-y-auto p-6 bg-slate-950 custom-scrollbar">
      {/* Compact header — 3 stat pills + filter chips */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-2 bg-slate-900/60 border border-white/5 px-3 py-2 rounded-xl">
          <span className="text-nano text-slate-500 font-black uppercase tracking-ultra">Valid</span>
          <span className="text-lg font-black font-mono text-green-400">{validityPct}%</span>
        </div>
        <div className="flex items-center gap-2 bg-slate-900/60 border border-white/5 px-3 py-2 rounded-xl">
          <span className="text-nano text-slate-500 font-black uppercase tracking-ultra">Mean n</span>
          <span className="text-lg font-black font-mono text-slate-200">{avgNodes}</span>
        </div>
        <div className="flex items-center gap-2 bg-slate-900/60 border border-white/5 px-3 py-2 rounded-xl">
          <span className="text-nano text-slate-500 font-black uppercase tracking-ultra">Novel</span>
          <span className="text-lg font-black font-mono text-purple-300">{novelCount}/{rawGraphs.length}</span>
        </div>

        <div className="flex-1 flex justify-end gap-1">
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip.id}
              onClick={() => setFilterMode(chip.id)}
              className={`px-3 py-1.5 text-nano font-black uppercase tracking-ultra rounded-lg border transition-colors ${
                filterMode === chip.id
                  ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-200'
                  : 'bg-slate-900/40 border-white/5 text-slate-500 hover:text-slate-300'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid — container-query auto-fit, reflows with the panel width */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
      >
        {generatedGraphs.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-500 text-xs">
            No graphs match this filter.
          </div>
        )}
        {generatedGraphs.map((g, i) => {
          const selected = expandedGraph === g.id
          const borderClass = selected
            ? 'border-indigo-500/50'
            : g.valid
              ? 'border-green-500/20 hover:border-green-400/40'
              : 'border-red-500/20 hover:border-red-400/40'
          return (
            <div
              key={g.id || i}
              onClick={() => setExpandedGraph(selected ? null : g.id)}
              className={`group relative rounded-xl p-4 cursor-pointer overflow-hidden
                transition-colors duration-200 border ${borderClass} bg-slate-900/40`}
            >
              <div className="w-full h-[128px] relative z-10">
                <MiniGraphSVG
                  nodes={g.nodes}
                  links={g.links}
                  size={140}
                  valid={g.valid}
                  revealProgress={revealProgress}
                />
              </div>

              <div className="w-full flex justify-between items-end mt-3 relative z-10 border-t border-white/5 pt-3">
                <div>
                  <p className="text-nano text-slate-500 font-black uppercase tracking-ultra mb-1">Latent DNA</p>
                  <div className="flex gap-0.5">
                    {[
                      g.nodes.length / 12,
                      g.links.length / Math.max(1, g.nodes.length * 2),
                      g.density ?? 0,
                      (g.avg_degree ?? 0) / 4,
                      1 - (g.isolated_ratio ?? 0),
                      g.score ?? 0,
                    ].map((metric, j) => (
                      <div
                        key={j}
                        className="w-1 rounded-full"
                        style={{
                          height: `${Math.max(2, Math.min(14, metric * 14))}px`,
                          backgroundColor: g.valid ? '#22c55e66' : '#ef444466',
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  <span className={`text-xl font-black font-mono tracking-tighter block leading-none ${g.valid ? 'text-green-400' : 'text-red-400'}`}>
                    {(g.score * 100).toFixed(0)}%
                  </span>
                  <span className="text-nano text-slate-600 font-bold uppercase tracking-ultra">Q-Score</span>
                  {!g.valid && g.invalidity_reason && (
                    <div
                      className="mt-1 px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-nano text-red-400 font-bold max-w-[120px] truncate"
                      title={g.invalidity_reason}
                    >
                      {g.invalidity_reason}
                    </div>
                  )}
                  {g.matches_source && (
                    <div
                      className="mt-1 px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-nano text-amber-300 font-bold"
                      title="Memorized from training set"
                    >
                      memorized
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Latent trajectory Monitor */}
      {snap && (
        <div className="mt-8 pt-6 border-t border-white/5">
          <div className="flex justify-between items-center mb-4">
             <h3 className="text-micro text-slate-500 font-black uppercase tracking-ultra">Latent Space Trajectory</h3>
             <div className="flex gap-4 text-micro font-mono">
                <span className="text-orange-400">REC: {(snap.recon_loss || 0).toFixed(4)}</span>
                <span className="text-purple-400">KLD: {(snap.kl_loss || 0).toFixed(4)}</span>
             </div>
          </div>
          <div className="h-24 bg-slate-900/40 rounded-xl border border-white/5 relative overflow-hidden flex items-end px-4 gap-1">
            {snapshots.slice(Math.max(0, epochInt - 19), epochInt + 1).map((entry, j, arr) => {
              const validity = entry.validity_rate ?? 0
              const novelty = entry.novelty_rate ?? 0
              const uniqueness = entry.uniqueness_rate ?? 0
              const q = (validity * 0.45 + uniqueness * 0.25 + novelty * 0.3) * 100
              const isActive = j === arr.length - 1
              return (
                <div
                  key={j}
                  className={`flex-1 rounded-t-sm transition-colors ${isActive ? 'bg-indigo-400' : 'bg-slate-700'}`}
                  style={{ height: `${Math.max(2, q)}%` }}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
