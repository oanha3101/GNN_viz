import React, { useMemo, useState } from 'react'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import usePlayerStore from '../../store/playerStore'
import useGNNStore from '../../store/useGNNStore'
import {
  buildComparisonHistograms,
  countInvalidityReasons,
  groupBySignature,
} from '../../utils/task6Metrics.js'

/**
 * Task6MetricsPanel — Graph Generation diagnostics.
 * 4 tabs: Overview | Comparison | Invalidity | Signatures
 *
 * - Overview   — recon + kl loss curve + headline V/U/N stats
 * - Comparison — density / avg-degree / clustering hist, source vs generated
 * - Invalidity — reason breakdown, click row to narrow grid filter
 * - Signatures — top duplicate signatures + matches_source (memorization) flag
 */

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'comparison', label: 'Comparison' },
  { id: 'invalidity', label: 'Invalidity' },
  { id: 'signatures', label: 'Signatures' },
]

export default function Task6MetricsPanel() {
  const [tab, setTab] = useState('overview')
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]

  if (snapshots.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
        Generation metrics appear after training starts.
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center gap-1 px-3 pt-2 pb-1.5 border-b border-slate-800/60 shrink-0 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-2.5 py-1 rounded-md text-micro font-bold transition-colors ${
              tab === t.id
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
            }`}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto text-nano font-mono text-slate-500">Epoch {epochInt}</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3">
        {tab === 'overview' && <OverviewTab snapshots={snapshots} snap={snap} />}
        {tab === 'comparison' && <ComparisonTab snap={snap} />}
        {tab === 'invalidity' && <InvalidityTab snap={snap} />}
        {tab === 'signatures' && <SignaturesTab snap={snap} />}
      </div>
    </div>
  )
}

function StatPill({ label, value, tone = 'slate' }) {
  const toneClass = {
    green: 'text-green-400',
    blue: 'text-blue-400',
    purple: 'text-purple-400',
    slate: 'text-slate-200',
    amber: 'text-amber-300',
  }[tone] || 'text-slate-200'
  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-lg px-3 py-2 min-w-[96px]">
      <div className="text-nano text-slate-500 font-black uppercase tracking-ultra">{label}</div>
      <div className={`text-base font-black font-mono ${toneClass}`}>{value}</div>
    </div>
  )
}

function OverviewTab({ snapshots, snap }) {
  const lossHistory = useMemo(
    () => snapshots.map((s, i) => ({
      epoch: i,
      recon: s.recon_loss ?? 0,
      kl: s.kl_loss ?? 0,
    })),
    [snapshots],
  )
  const validity = snap?.validity_rate ?? 0
  const uniqueness = snap?.uniqueness_rate ?? 0
  const novelty = snap?.novelty_rate ?? 0

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <StatPill label="Validity" value={`${(validity * 100).toFixed(0)}%`} tone="green" />
        <StatPill label="Uniqueness" value={`${(uniqueness * 100).toFixed(0)}%`} tone="blue" />
        <StatPill label="Novelty" value={`${(novelty * 100).toFixed(0)}%`} tone="purple" />
        <StatPill label="Recon" value={(snap?.recon_loss ?? 0).toFixed(3)} tone="amber" />
        <StatPill label="KL" value={(snap?.kl_loss ?? 0).toFixed(3)} tone="purple" />
      </div>
      <div className="flex-1 min-h-[220px]">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={lossHistory} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="epoch" tick={{ fill: '#94a3b8', fontSize: 10 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, fontSize: 11 }}
              labelStyle={{ color: '#94a3b8' }}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
            <Line type="monotone" dataKey="recon" stroke="#fb923c" strokeWidth={2} name="Recon" dot={false} />
            <Line type="monotone" dataKey="kl" stroke="#c084fc" strokeWidth={2} name="KL" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function ComparisonTab({ snap }) {
  const generated = snap?.generated_graphs || []
  const source = snap?.source_graphs || []
  const hist = useMemo(
    () => buildComparisonHistograms(source, generated, 10),
    [source, generated],
  )

  if (!generated.length || !source.length) {
    return (
      <div className="text-slate-500 text-xs py-6 text-center">
        No source distribution available at this epoch.
      </div>
    )
  }

  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
    >
      <HistBlock title="Density" metric={hist.density} axisKey="density" maxX={1} />
      <HistBlock title="Avg Degree" metric={hist.avgDegree} axisKey="avgDegree" />
      <HistBlock title="Clustering" metric={hist.clustering} axisKey="clustering" maxX={1} />
    </div>
  )
}

function HistBlock({ title, metric }) {
  // Fuse source + generated into a recharts-friendly rows shape.
  const rows = metric.source.map((b, i) => ({
    bin: `${b.binLow.toFixed(2)}`,
    source: b.count,
    generated: metric.generated[i]?.count ?? 0,
  }))
  return (
    <div className="bg-slate-900/40 border border-slate-800/60 rounded-lg p-2">
      <div className="text-nano text-slate-400 font-black uppercase tracking-ultra mb-1 px-1">{title}</div>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={rows} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
          <XAxis dataKey="bin" tick={{ fill: '#94a3b8', fontSize: 9 }} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, fontSize: 10 }}
            labelStyle={{ color: '#94a3b8' }}
          />
          <Bar dataKey="source" fill="#64748b" name="Source" />
          <Bar dataKey="generated" fill="#818cf8" name="Generated" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function InvalidityTab({ snap }) {
  const setFilterMode = useGNNStore((s) => s.setTask6FilterMode)
  const rows = useMemo(
    () => countInvalidityReasons(snap?.generated_graphs || []),
    [snap],
  )
  const total = snap?.generated_graphs?.length ?? 0
  const invalidTotal = rows.reduce((acc, r) => acc + r.count, 0)

  if (rows.length === 0) {
    return (
      <div className="text-slate-500 text-xs py-6 text-center">
        All generated graphs are valid at this epoch.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <div className="text-nano text-slate-400 font-black uppercase tracking-ultra">Invalidity Breakdown</div>
        <button
          onClick={() => setFilterMode?.('invalid')}
          className="text-nano font-bold text-red-300 border border-red-500/30 rounded-md px-2 py-1 hover:bg-red-500/10"
        >
          Show {invalidTotal}/{total} on canvas
        </button>
      </div>
      <div className="flex flex-col divide-y divide-slate-800/60 border border-slate-800/60 rounded-lg overflow-hidden">
        {rows.map((r) => {
          const pct = invalidTotal > 0 ? (r.count / invalidTotal) * 100 : 0
          return (
            <button
              key={r.reason}
              onClick={() => setFilterMode?.('invalid')}
              className="flex items-center gap-2 px-3 py-2 text-left bg-slate-900/40 hover:bg-slate-800/60 transition-colors"
            >
              <span className="text-xs text-slate-200 font-mono min-w-[120px]">{r.reason}</span>
              <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-red-500/60" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs font-mono text-red-300 tabular-nums w-8 text-right">{r.count}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SignaturesTab({ snap }) {
  const groups = useMemo(
    () => groupBySignature(snap?.generated_graphs || []),
    [snap],
  )
  const duplicates = groups.filter((g) => g.count > 1)
  const memorized = groups.filter((g) => g.matchesSource)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <StatPill label="Unique sigs" value={groups.length} />
        <StatPill label="Duplicates" value={duplicates.length} tone="amber" />
        <StatPill label="Memorized" value={memorized.length} tone="amber" />
      </div>
      {groups.length === 0 ? (
        <div className="text-slate-500 text-xs py-6 text-center">No signatures yet.</div>
      ) : (
        <div className="flex flex-col divide-y divide-slate-800/60 border border-slate-800/60 rounded-lg overflow-hidden">
          {groups.slice(0, 10).map((g) => (
            <div
              key={g.signature}
              className="flex items-center gap-3 px-3 py-2 bg-slate-900/40 text-xs"
            >
              <span className="font-mono text-slate-300 min-w-[120px] truncate" title={g.signature}>
                {g.signature}
              </span>
              <span className="text-nano text-slate-500 uppercase tracking-ultra">count</span>
              <span className={`font-mono font-bold tabular-nums w-8 text-right ${g.count > 1 ? 'text-amber-300' : 'text-slate-400'}`}>
                {g.count}
              </span>
              <span className="text-nano text-slate-500 uppercase tracking-ultra">ids</span>
              <span className="font-mono text-slate-400 truncate flex-1">{g.ids.join(', ')}</span>
              {g.matchesSource && (
                <span className="text-nano font-bold text-amber-300 border border-amber-500/40 rounded px-1.5 py-0.5 uppercase tracking-ultra">
                  memorized
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
