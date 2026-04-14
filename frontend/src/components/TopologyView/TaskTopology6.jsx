import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import usePlayerStore from '../../store/playerStore'

const NODE_COLORS = ['#22c55e', '#ef4444', '#3b82f6', '#eab308', '#a855f7', '#06b6d4']

/**
 * MiniGraphSVG for Task 6 — with optional "grow" animation
 * Nodes & edges appear sequentially (GraphRNN-style) based on revealProgress
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

export default function TaskTopology6() {
  const { snapshots, currentEpochFloat, isPlaying } = usePlayerStore()
  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]

  const [expandedGraph, setExpandedGraph] = useState(null)
  const [revealProgress, setRevealProgress] = useState(1)

  const prevGraphsRef = useRef([])
  const generatedGraphs = snap?.generated_graphs || prevGraphsRef.current || []

  useEffect(() => {
    if (snap?.generated_graphs?.length) {
      prevGraphsRef.current = snap.generated_graphs
    }
  }, [snap])

  const prevEpochRef = useRef(epochInt)
  useEffect(() => {
    if (epochInt !== prevEpochRef.current) {
      prevEpochRef.current = epochInt
      setRevealProgress(0)
      let start = performance.now()
      const duration = 800
      const animate = (now) => {
        const elapsed = now - start
        const p = Math.min(1, elapsed / duration)
        setRevealProgress(p)
        if (p < 1) requestAnimationFrame(animate)
      }
      requestAnimationFrame(animate)
    }
  }, [epochInt])

  if (!generatedGraphs.length) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-600 bg-slate-950">
        <div className="text-center animate-pulse">
          <div className="text-5xl mb-4 opacity-20">🧬</div>
          <p className="text-xs font-black uppercase tracking-[0.2em]">Awaiting Latent Formation</p>
        </div>
      </div>
    )
  }

  const validCount = generatedGraphs.filter(g => g.valid).length
  const avgNodes = (generatedGraphs.reduce((sum, g) => sum + g.nodes.length, 0) / generatedGraphs.length).toFixed(1)
  const history = snapshots.slice(Math.max(0, epochInt - 19), epochInt + 1)
  const qualityTrend = history.map((entry) => {
    const validity = entry.validity_rate ?? 0
    const novelty = entry.novelty_rate ?? 0
    const uniqueness = entry.uniqueness_rate ?? 0
    return (validity * 0.45 + uniqueness * 0.25 + novelty * 0.3) * 100
  })

  return (
    <div className="w-full h-full overflow-y-auto p-6 bg-slate-950 custom-scrollbar">
      {/* Header Stats */}
      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <div className="flex-1 bg-slate-900/60 backdrop-blur-xl border border-white/5 p-4 rounded-3xl shadow-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest block">Structural Validity</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white font-mono">{((validCount / generatedGraphs.length) * 100).toFixed(0)}%</span>
              <span className="text-xs text-green-400 font-bold uppercase">Success Rate</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-full border-4 border-slate-800 border-t-green-500 animate-spin" style={{ animationDuration: '3s' }} />
        </div>

        <div className="bg-slate-900/40 backdrop-blur-md border border-white/5 p-4 rounded-3xl min-w-[160px]">
          <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest block mb-1">Mean Complexity</span>
          <div className="text-2xl font-black text-slate-300 font-mono italic">{avgNodes} <span className="text-[10px] opacity-40">nodes</span></div>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
        {generatedGraphs.map((g, i) => (
          <div
            key={g.id || i}
            onClick={() => setExpandedGraph(expandedGraph === g.id ? null : g.id)}
            className={`group relative rounded-[2rem] p-5 cursor-pointer overflow-hidden
              transition-all duration-500 border-2
              ${expandedGraph === g.id ? 'border-indigo-500/50 scale-[1.02] shadow-2xl' : 'border-white/5 hover:border-white/10'}
              ${g.valid ? 'bg-green-500/5' : 'bg-red-500/5'}`}
          >
            {/* Background Texture */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
                 style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '10px 10px' }} />

            <div className="w-full h-[140px] relative z-10">
              <MiniGraphSVG
                nodes={g.nodes}
                links={g.links}
                size={140}
                valid={g.valid}
                revealProgress={revealProgress}
              />
            </div>

            <div className="w-full flex justify-between items-end mt-4 relative z-10 border-t border-white/5 pt-3">
              <div>
                <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-1">Latent DNA</p>
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
                      className="w-1 rounded-full bg-slate-800"
                      style={{
                        height: `${Math.max(2, Math.min(14, metric * 14))}px`,
                        backgroundColor: g.valid ? '#22c55e66' : '#ef444466',
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="text-right">
                <span className={`text-xl font-black font-mono tracking-tighter block leading-none ${g.valid ? 'text-green-400' : 'text-red-400'}`}>
                  {(g.score * 100).toFixed(0)}%
                </span>
                <span className="text-[8px] text-slate-600 font-bold uppercase tracking-tight">Q-Score</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Latent trajectory Monitor */}
      {snap && (
        <div className="mt-8 pt-6 border-t border-white/5">
          <div className="flex justify-between items-center mb-4">
             <h3 className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em]">Latent Space Trajectory</h3>
             <div className="flex gap-4 text-[10px] font-mono">
                <span className="text-orange-400">REC: {(snap.recon_loss || 0).toFixed(4)}</span>
                <span className="text-purple-400">KLD: {(snap.kl_loss || 0).toFixed(4)}</span>
             </div>
          </div>
          <div className="h-24 bg-slate-900/40 rounded-3xl border border-white/5 relative overflow-hidden flex items-end px-4 gap-1">
             {qualityTrend.map((height, i) => {
                const isCurrent = i === qualityTrend.length - 1
                return (
                  <div
                    key={i}
                    className={`flex-1 rounded-t-full transition-all duration-500 ${isCurrent ? 'bg-indigo-500 shadow-[0_0_15px_#6366f1]' : 'bg-slate-800/40'}`}
                    style={{ height: `${Math.max(10, height)}%` }}
                  />
                )
             })}
             <div className="absolute inset-x-0 top-1/2 h-px bg-white/5" />
          </div>
        </div>
      )}
    </div>
  )
}

