import React, { useMemo } from 'react'
import usePlayerStore from '../../store/playerStore'
import LazyPlot from '../primitives/LazyPlot'
import { COMMUNITY_COLORS, getCommunityColor } from '../../utils/colors'

function isDarkMode() {
  if (typeof document === 'undefined') return false
  return document.documentElement.classList.contains('dark')
}

/**
 * CommunityEvolution — Latent-space / side panel for Task 4.
 * KPI strip  +  community chips  +  stacked area chart (community sizes over epochs).
 */
export default function CommunityEvolution() {
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]

  const { areaData, numCommunities } = useMemo(() => {
    if (snapshots.length === 0) return { areaData: [], numCommunities: 0 }
    const allSizes = snapshots.map(s => s.community_sizes || [])
    const nC = Math.max(...allSizes.map(s => s.length), 0)
    const traces = Array.from({ length: nC }, (_, ci) => ({
      x: snapshots.map((_, i) => i),
      y: allSizes.map(s => s[ci] ?? 0),
      type: 'scatter',
      mode: 'lines',
      name: `C${ci}`,
      stackgroup: 'one',
      fillcolor: getCommunityColor(ci) + '55',
      line: { color: getCommunityColor(ci), width: 1.5 },
    }))
    return { areaData: traces, numCommunities: nC }
  }, [snapshots])

  const currentSizes = snap?.community_sizes || []
  const totalNodes = currentSizes.reduce((a, b) => a + b, 0)
  const modQ = snap?.modularity_q ?? 0
  const cond = snap?.conductance ?? 0
  const transitions = snap?.community_transitions || {}
  const migrated = Object.values(transitions).reduce((a, b) => a + b, 0)
  const migPct = totalNodes > 0 ? (migrated / totalNodes) * 100 : 0

  const dark = isDarkMode()
  const plotBg = 'transparent'
  const gridColor = dark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.22)'
  const axisColor = dark ? '#94a3b8' : '#64748b'

  return (
    <div className="w-full h-full flex flex-col bg-white/60 dark:bg-slate-950 overflow-hidden pt-7">
      {/* KPI strip */}
      <div className="px-3 pb-2 shrink-0 border-b border-slate-200/60 dark:border-slate-800/60">
        <div className="grid grid-cols-4 gap-1.5 mb-2">
          <KpiTile label="Modularity Q" value={modQ.toFixed(3)} tone={modQ > 0.4 ? 'good' : 'warn'} />
          <KpiTile label="Communities" value={numCommunities} />
          <KpiTile label="Nodes" value={totalNodes} />
          <KpiTile label="Migration" value={`${migPct.toFixed(1)}%`} tone={migPct < 5 ? 'good' : migPct < 15 ? 'warn' : 'bad'} />
        </div>

        {snapshots.length > 0 && numCommunities > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 hide-scrollbar">
            {currentSizes.map((size, ci) => {
              if (size === 0) return null
              return (
                <div
                  key={ci}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full border whitespace-nowrap
                    bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-700/30"
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getCommunityColor(ci) }} />
                  <span className="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300">C{ci}</span>
                  <span className="text-[10px] font-mono" style={{ color: getCommunityColor(ci) }}>
                    {size}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Stacked area chart */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="text-[8px] text-slate-500 uppercase tracking-widest font-bold px-3 pt-2 pb-0 shrink-0">
          Community Sizes over Epochs
        </div>
        <div className="flex-1 min-h-0">
          {areaData.length > 0 ? (
            <LazyPlot
              data={areaData}
              layout={{
                paper_bgcolor: plotBg,
                plot_bgcolor: plotBg,
                margin: { l: 35, r: 10, t: 5, b: 25 },
                xaxis: { color: axisColor, gridcolor: gridColor, zeroline: false, title: '' },
                yaxis: { color: axisColor, gridcolor: gridColor, zeroline: false, title: '' },
                showlegend: false,
                shapes: [{
                  type: 'line', x0: epochInt, x1: epochInt, y0: 0, y1: 1,
                  xref: 'x', yref: 'paper',
                  line: { color: '#06b6d4', width: 1.5, dash: 'dot' },
                }],
              }}
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: '100%', height: '100%' }}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-600 text-[10px] italic p-4">
              Community size data will appear after 1 epoch
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function KpiTile({ label, value, tone }) {
  const colors = {
    good: 'text-emerald-600 dark:text-emerald-400',
    warn: 'text-amber-600 dark:text-amber-400',
    bad: 'text-rose-600 dark:text-rose-400',
  }
  const valColor = colors[tone] || 'text-slate-800 dark:text-slate-100'
  return (
    <div className="rounded-lg px-2 py-1.5 border bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800/50">
      <span className="text-[7px] text-slate-500 uppercase font-bold tracking-wider block">{label}</span>
      <span className={`text-sm font-bold font-mono tabular-nums leading-none ${valColor}`}>{value}</span>
    </div>
  )
}
