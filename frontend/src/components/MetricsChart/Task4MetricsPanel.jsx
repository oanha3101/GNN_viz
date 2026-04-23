import React, { useMemo, useState } from 'react'
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import usePlayerStore from '../../store/playerStore'
import useGNNStore from '../../store/useGNNStore'
import {
  buildBridgeRanking,
  buildStabilityMatrix,
  buildClusterConfidenceHistogram,
  computeAggregateStability,
} from '../../utils/task4Metrics'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'bridges', label: 'Bridges' },
  { id: 'stability', label: 'Stability' },
  { id: 'diagnostics', label: 'Diagnostics' },
]

const COMMUNITY_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#06b6d4', '#ec4899']

export default function Task4MetricsPanel() {
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const setSelectedCommunity = useGNNStore((s) => s.setSelectedCommunity)
  const [activeTab, setActiveTab] = useState('overview')

  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]

  if (!snapshots.length) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 p-6 gap-2">
        <div className="text-3xl opacity-40 animate-pulse">&#8230;</div>
        <p className="text-micro text-center">Start training to see community metrics</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center gap-1 px-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`text-nano font-bold uppercase tracking-ultra px-2.5 py-1 rounded-md transition-colors ${
              activeTab === t.id
                ? 'bg-slate-800 text-white'
                : 'bg-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewTab snap={snap} snapshots={snapshots} epochInt={epochInt} />}
      {activeTab === 'bridges' && <BridgesTab snap={snap} onFocus={(cid) => setSelectedCommunity(cid)} />}
      {activeTab === 'stability' && <StabilityTab snapshots={snapshots} />}
      {activeTab === 'diagnostics' && <DiagnosticsTab snap={snap} />}
    </div>
  )
}

function OverviewTab({ snap, snapshots, epochInt }) {
  const historyData = useMemo(
    () => snapshots.slice(0, epochInt + 1).map((s, i) => ({
      epoch: i,
      modularity: s.modularity_q ?? 0,
      conductance: s.conductance ?? 0,
    })),
    [snapshots, epochInt]
  )

  const modQ = snap?.modularity_q ?? 0
  const cond = snap?.conductance ?? 0
  const bridgeCount = (snap?.bridge_nodes || []).filter(Boolean).length

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-auto">
      <div className="grid grid-cols-3 gap-2">
        <StatCell label="Modularity Q" value={modQ} digits={3}
          tone={modQ > 0.4 ? 'good' : modQ > 0.2 ? 'warn' : 'bad'} />
        <StatCell label="Conductance" value={cond} digits={3}
          tone={cond < 0.2 ? 'good' : 'warn'} />
        <StatCell label="Bridges" value={bridgeCount} digits={0} />
      </div>

      <div className="flex-1 min-h-[140px]">
        <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra block mb-1">Q &amp; Conductance over Epochs</span>
        <ResponsiveContainer width="100%" height="90%">
          <AreaChart data={historyData}>
            <defs>
              <linearGradient id="modGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="condGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="epoch" tick={{ fill: '#475569', fontSize: 9 }} />
            <YAxis domain={[-0.1, 1]} tick={{ fill: '#475569', fontSize: 9 }} />
            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 10 }} labelStyle={{ color: '#94a3b8' }} />
            <ReferenceLine y={0.4} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity={0.4} />
            <Area type="monotone" dataKey="modularity" stroke="#22c55e" fill="url(#modGrad)" strokeWidth={2} name="Modularity Q" />
            <Area type="monotone" dataKey="conductance" stroke="#f97316" fill="url(#condGrad)" strokeWidth={2} name="Conductance" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function BridgesTab({ snap, onFocus }) {
  const bridges = useMemo(() => buildBridgeRanking(snap, 10), [snap])

  if (bridges.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500 text-micro">
        No bridge nodes at this epoch.
      </div>
    )
  }
  return (
    <div className="flex-1 overflow-auto space-y-1.5">
      <div className="text-nano text-slate-500 uppercase font-bold tracking-ultra">Top Bridges · sorted by strength</div>
      {bridges.map((b) => (
        <button
          key={b.id}
          onClick={() => onFocus(b.community)}
          className="w-full flex items-center gap-2 bg-slate-900/40 hover:bg-slate-900/70 rounded-md px-2 py-1.5 border border-slate-800/50 transition-colors"
          title={`Focus community C${b.community}`}
        >
          <div className="w-6 h-6 rounded-sm flex items-center justify-center bg-slate-800 text-nano font-bold text-slate-100 shrink-0">
            {b.id}
          </div>
          <div className="h-1.5 flex-1 bg-slate-800/60 rounded-full overflow-hidden">
            <div className="h-full bg-white/60" style={{ width: `${Math.max(0, Math.min(1, b.strength)) * 100}%` }} />
          </div>
          <span className="text-nano font-mono font-bold text-slate-200 tabular-nums shrink-0">
            {b.strength.toFixed(2)}
          </span>
          <span className="text-nano font-mono text-slate-500 shrink-0" style={{ color: COMMUNITY_COLORS[b.community % COMMUNITY_COLORS.length] }}>
            C{b.community}
          </span>
        </button>
      ))}
    </div>
  )
}

function StabilityTab({ snapshots }) {
  const { matrix, numCommunities, numEpochs, epochAverages } = useMemo(() => buildStabilityMatrix(snapshots), [snapshots])
  const overall = useMemo(() => computeAggregateStability({ epochAverages, numEpochs }), [epochAverages, numEpochs])
  const lineData = useMemo(
    () => epochAverages.map((v, i) => ({ epoch: i, stability: v })),
    [epochAverages]
  )

  // Column width scales down gracefully so the heatmap never spills out.
  const cellSize = Math.max(4, Math.min(12, Math.floor(240 / Math.max(1, numEpochs))))

  return (
    <div className="flex-1 overflow-auto space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <StatCell label="Overall Stability" value={overall} digits={3} tone={overall > 0.85 ? 'good' : overall > 0.6 ? 'warn' : 'bad'} />
        <StatCell label="Communities" value={numCommunities} digits={0} />
      </div>

      <div>
        <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra block mb-1">Overall stability per epoch</span>
        <ResponsiveContainer width="100%" height={90}>
          <LineChart data={lineData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="epoch" tick={{ fill: '#475569', fontSize: 8 }} />
            <YAxis domain={[0, 1]} tick={{ fill: '#475569', fontSize: 8 }} />
            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 10 }} />
            <Line type="monotone" dataKey="stability" stroke="#22d3ee" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra block mb-1.5">Community × Epoch stability heatmap</span>
        <div className="flex flex-col gap-0.5">
          {matrix.map((row, cid) => (
            <div key={cid} className="flex items-center gap-1">
              <span className="text-nano font-mono w-6 shrink-0 text-right" style={{ color: COMMUNITY_COLORS[cid % COMMUNITY_COLORS.length] }}>C{cid}</span>
              <div className="flex gap-[1px]">
                {row.map((v, e) => (
                  <div
                    key={e}
                    title={`C${cid} · epoch ${e} · ${v.toFixed(2)}`}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: stabilityColor(v),
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DiagnosticsTab({ snap }) {
  const hist = useMemo(() => buildClusterConfidenceHistogram(snap, 10), [snap])
  const nmi = snap?.nmi_score
  const silhouette = (snap?.silhouette_scores || []).reduce((acc, v, _i, arr) => acc + v / arr.length, 0) || 0

  return (
    <div className="flex-1 overflow-auto space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Gauge label="NMI" value={nmi ?? null} />
        <Gauge label="Silhouette" value={silhouette} />
      </div>

      <div>
        <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra block mb-1">Cluster confidence histogram</span>
        <div className="flex items-end gap-0.5 h-[70px]">
          {hist.map((bin, i) => {
            const max = Math.max(1, ...hist.map((b) => b.count))
            const h = (bin.count / max) * 100
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${bin.range[0].toFixed(1)}–${bin.range[1].toFixed(1)} · ${bin.count}`}>
                <div style={{ height: `${h}%`, width: '100%' }} className="bg-cyan-400/70 rounded-sm" />
                <span className="text-nano text-slate-600 font-mono">{bin.range[0].toFixed(1)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StatCell({ label, value, digits = 0, tone = 'neutral' }) {
  const colorClass = {
    good: 'text-green-400',
    warn: 'text-amber-400',
    bad: 'text-red-400',
    neutral: 'text-slate-100',
  }[tone]
  const display = Number.isFinite(value) ? (digits > 0 ? value.toFixed(digits) : `${value}`) : '—'
  return (
    <div className="bg-slate-900/60 rounded-md px-2 py-1.5 border border-slate-800/50 text-center">
      <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra block">{label}</span>
      <span className={`text-sm font-bold font-mono tabular-nums ${colorClass}`}>{display}</span>
    </div>
  )
}

function Gauge({ label, value }) {
  const v = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null
  return (
    <div className="bg-slate-900/60 rounded-md px-2 py-1.5 border border-slate-800/50">
      <div className="flex items-center justify-between">
        <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra">{label}</span>
        <span className="text-micro font-mono font-bold text-slate-100">{v == null ? '—' : v.toFixed(3)}</span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1">
        <div className="h-full bg-cyan-400" style={{ width: `${(v ?? 0) * 100}%` }} />
      </div>
    </div>
  )
}

function stabilityColor(v) {
  if (!Number.isFinite(v)) return '#1e293b'
  // Red (low) → amber → green (high). No gradient fn to avoid extra deps.
  if (v >= 0.85) return 'rgba(34,197,94,0.9)'
  if (v >= 0.65) return 'rgba(250,204,21,0.85)'
  if (v >= 0.4) return 'rgba(249,115,22,0.8)'
  return 'rgba(239,68,68,0.85)'
}
