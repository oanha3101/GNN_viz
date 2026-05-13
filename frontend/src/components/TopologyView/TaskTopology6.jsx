import React, { useMemo, useState, useRef, useEffect } from 'react'
import usePlayerStore from '../../store/playerStore'
import useGNNStore from '../../store/useGNNStore'
import { filterGraphsBy } from '../../utils/task6Metrics.js'
import {
  classifyGraphShape,
  classifyNodeRoles,
  countComponents,
  countTriangles,
  computeForceLayout,
  findNearestSourceGraph,
} from '../../utils/task6Structure.js'

const ROLE_COLOR = {
  isolated: '#f43f5e',
  leaf: '#5b5689',
  bridge: '#fbbf24',
  hub: '#a855f7',
  regular: '#a5a0d0',
}

const SHAPE_TONE = {
  disconnected: { bg: 'bg-red-500/15',     border: 'border-red-500/40',     text: 'text-red-300' },
  star:         { bg: 'bg-cyan-500/15',    border: 'border-cyan-500/40',    text: 'text-cyan-200' },
  cycle:        { bg: 'bg-indigo-500/15',  border: 'border-indigo-500/40',  text: 'text-indigo-200' },
  tree:         { bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', text: 'text-emerald-200' },
  clique:       { bg: 'bg-fuchsia-500/15', border: 'border-fuchsia-500/40', text: 'text-fuchsia-200' },
  dense:        { bg: 'bg-amber-500/15',   border: 'border-amber-500/40',   text: 'text-amber-200' },
  sparse:       { bg: 'bg-slate-500/15',   border: 'border-slate-500/40',   text: 'text-slate-300' },
  generic:      { bg: 'bg-slate-800/40',   border: 'border-slate-700/60',   text: 'text-slate-300' },
  empty:        { bg: 'bg-slate-800/40',   border: 'border-slate-700/60',   text: 'text-slate-500' },
}

/**
 * StructuralMiniGraph — force-directed mini layout with role-based coloring.
 * - Node size = sqrt(degree) clamped to [3, 7]
 * - Color by role: isolated red, leaf slate, bridge amber, hub cyan
 * - Dashed stroke + reduced opacity for sparse / disconnected shapes so
 *   failure modes read at a glance.
 */
function StructuralMiniGraph({ nodes, links, size = 140, shape, invalid }) {
  const pos = useMemo(
    () => computeForceLayout(nodes, links, size, 80),
    [nodes, links, size],
  )
  const roles = useMemo(() => classifyNodeRoles(nodes, links), [nodes, links])
  const degs = useMemo(() => {
    const d = new Array(nodes.length).fill(0)
    for (const l of links) {
      const s = typeof l.source === 'object' ? l.source.id : l.source
      const t = typeof l.target === 'object' ? l.target.id : l.target
      if (Number.isInteger(s) && Number.isInteger(t)) { d[s] += 1; d[t] += 1 }
    }
    return d
  }, [nodes, links])

  const edgeStroke = invalid ? '#ef4444' : shape === 'sparse' ? '#64748b' : '#475569'
  const dashed = shape === 'sparse' || shape === 'disconnected'

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`}>
      {links.map((l, i) => {
        const s = typeof l.source === 'object' ? l.source.id : l.source
        const t = typeof l.target === 'object' ? l.target.id : l.target
        const p1 = pos[s]; const p2 = pos[t]
        if (!p1 || !p2) return null
        return (
          <line
            key={i}
            x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
            stroke={edgeStroke} strokeWidth={1.2}
            strokeOpacity={dashed ? 0.5 : 0.8}
            strokeDasharray={dashed ? '3 2' : undefined}
          />
        )
      })}
      {nodes.map((node, i) => {
        const p = pos[node.id]
        if (!p) return null
        const role = roles[i] || 'regular'
        const r = Math.max(3, Math.min(7, 2.5 + Math.sqrt(degs[i] || 0) * 1.4))
        const flash = role === 'isolated' ? (
          <circle cx={p.x} cy={p.y} r={r + 3} fill="none" stroke="#ef4444" strokeOpacity={0.4}>
            <animate attributeName="r" values={`${r + 1};${r + 4};${r + 1}`} dur="1.4s" repeatCount="indefinite" />
            <animate attributeName="stroke-opacity" values="0.6;0.0;0.6" dur="1.4s" repeatCount="indefinite" />
          </circle>
        ) : null
        return (
          <g key={node.id}>
            {flash}
            <circle cx={p.x} cy={p.y} r={r} fill={ROLE_COLOR[role]} stroke="#0f172a" strokeWidth={1} />
          </g>
        )
      })}
    </svg>
  )
}

function ShapeBadge({ shape }) {
  const tone = SHAPE_TONE[shape] || SHAPE_TONE.generic
  return (
    <span className={`text-nano font-black uppercase tracking-ultra px-1.5 py-0.5 rounded border ${tone.bg} ${tone.border} ${tone.text}`}>
      {shape}
    </span>
  )
}

function LegendDot({ color, label, pulsing }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block w-2.5 h-2.5 rounded-full"
        style={{ background: color, boxShadow: pulsing ? `0 0 0 2px ${color}33` : undefined }}
      />
      {label}
    </span>
  )
}

function CompareCard({ title, graph, invalid }) {
  const shape = classifyGraphShape(graph.nodes, graph.links)
  const comp = countComponents(graph.nodes, graph.links)
  const tri = countTriangles(graph.nodes, graph.links)
  const m = graph.links.length
  const n = graph.nodes.length
  const d = (graph.density ?? (m / Math.max(1, (n * (n - 1)) / 2))).toFixed(2)
  return (
    <div className="bg-slate-900/40 rounded-xl p-3 border border-slate-800/60">
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="text-nano font-black text-slate-400 uppercase tracking-ultra">{title}</span>
        <ShapeBadge shape={shape} />
      </div>
      <div className="w-full" style={{ height: 160 }}>
        <StructuralMiniGraph nodes={graph.nodes} links={graph.links} size={180} shape={shape} invalid={invalid} />
      </div>
      <div className="mt-2 text-nano font-mono text-slate-400 tabular-nums">
        n={n} · m={m} · c={comp} · Δ={tri} · d={d}
      </div>
    </div>
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
  const filterMode = useGNNStore((s) => s.task6FilterMode) || 'all'
  const setFilterMode = useGNNStore((s) => s.setTask6FilterMode) || (() => {})

  const prevGraphsRef = useRef([])
  const rawGraphs = snap?.generated_graphs || prevGraphsRef.current || []
  useEffect(() => {
    if (snap?.generated_graphs?.length) prevGraphsRef.current = snap.generated_graphs
  }, [snap])

  const generatedGraphs = useMemo(
    () => filterGraphsBy(rawGraphs, filterMode),
    [rawGraphs, filterMode],
  )

  const expanded = useMemo(
    () => rawGraphs.find((g) => g.id === expandedGraph) || null,
    [rawGraphs, expandedGraph],
  )
  const nearestSource = useMemo(
    () => (expanded ? findNearestSourceGraph(expanded, snap?.source_graphs || []) : null),
    [expanded, snap],
  )

  if (!rawGraphs.length) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-600 bg-slate-950">
        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-ultra">Awaiting Latent Formation</p>
        </div>
      </div>
    )
  }

  const validCount = rawGraphs.filter((g) => g.valid).length
  const validityPct = ((validCount / rawGraphs.length) * 100).toFixed(0)
  const avgNodes = (rawGraphs.reduce((sum, g) => sum + g.nodes.length, 0) / rawGraphs.length).toFixed(1)
  const novelCount = rawGraphs.filter((g) => g.matches_source !== true).length

  return (
    <div className="w-full h-full overflow-y-auto p-6 bg-slate-950 custom-scrollbar">
      <div className="flex flex-wrap items-center gap-3 mb-3">
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

      <div className="flex flex-wrap items-center gap-3 mb-4 text-nano text-slate-500 font-bold uppercase tracking-ultra">
        <LegendDot color={ROLE_COLOR.isolated} label="Isolated" pulsing />
        <LegendDot color={ROLE_COLOR.bridge} label="Bridge" />
        <LegendDot color={ROLE_COLOR.hub} label="Hub" />
        <LegendDot color={ROLE_COLOR.leaf} label="Leaf" />
        <span className="text-slate-600">·  Node size ∝ degree  ·  Dashed edges = sparse / disconnected</span>
      </div>

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
          const shape = classifyGraphShape(g.nodes, g.links)
          const comp = countComponents(g.nodes, g.links)
          const tri = countTriangles(g.nodes, g.links)
          const m = g.links.length
          const n = g.nodes.length
          const d = (g.density ?? (m / Math.max(1, (n * (n - 1)) / 2))).toFixed(2)

          const borderClass = selected
            ? 'border-indigo-500/60 ring-2 ring-indigo-500/40'
            : g.valid
              ? 'border-slate-800/60 hover:border-slate-600/60'
              : 'border-red-500/30 hover:border-red-400/50'

          return (
            <div
              key={g.id ?? i}
              onClick={() => setExpandedGraph(selected ? null : g.id)}
              className={`relative rounded-xl p-3 cursor-pointer border bg-slate-900/40 transition-colors ${borderClass}`}
            >
              <div className="flex items-center justify-between mb-2 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <ShapeBadge shape={shape} />
                  {g.matches_source && (
                    <span className="text-nano font-black uppercase tracking-ultra px-1.5 py-0.5 rounded border bg-amber-500/15 border-amber-500/40 text-amber-200">
                      memorized
                    </span>
                  )}
                </div>
                <span className={`text-sm font-black font-mono tabular-nums ${g.valid ? 'text-green-400' : 'text-red-400'}`}>
                  {((g.score ?? 0) * 100).toFixed(0)}%
                </span>
              </div>

              <div className="w-full" style={{ height: 130 }}>
                <StructuralMiniGraph
                  nodes={g.nodes}
                  links={g.links}
                  size={140}
                  shape={shape}
                  invalid={!g.valid}
                />
              </div>

              <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-nano font-mono text-slate-400 tabular-nums">
                <span>n={n} · m={m} · c={comp} · Δ={tri} · d={d}</span>
              </div>

              {!g.valid && g.invalidity_reason && (
                <div className="mt-1 text-nano font-bold text-red-300 truncate" title={g.invalidity_reason}>
                  × {g.invalidity_reason}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {expanded && (
        <div className="mt-6 bg-slate-900/60 border border-indigo-500/30 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-micro font-black text-slate-300 uppercase tracking-ultra">
              Generated vs nearest source graph
            </h3>
            <button
              className="text-nano font-black text-slate-400 uppercase tracking-ultra hover:text-slate-200"
              onClick={() => setExpandedGraph(null)}
            >
              Close
            </button>
          </div>
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
          >
            <CompareCard title="Generated" graph={expanded} invalid={!expanded.valid} />
            {nearestSource?.graph ? (
              <CompareCard
                title={`Nearest source · dist ${nearestSource.distance.toFixed(2)}`}
                graph={nearestSource.graph}
              />
            ) : (
              <div className="bg-slate-900/40 rounded-xl p-3 text-slate-500 text-xs flex items-center justify-center">
                No source distribution available.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
