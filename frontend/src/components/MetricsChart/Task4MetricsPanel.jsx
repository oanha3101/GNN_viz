import React, { useMemo, useState, useEffect } from 'react'
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell,
} from 'recharts'
import usePlayerStore from '../../store/playerStore'
import useGNNStore from '../../store/useGNNStore'
import {
  buildBridgeRanking,
  buildStabilityMatrix,
  buildClusterConfidenceHistogram,
  computeAggregateStability,
} from '../../utils/task4Metrics'
import { COMMUNITY_COLORS, getCommunityColor } from '../../utils/colors'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'bridges', label: 'Bridges' },
  { id: 'stability', label: 'Stability' },
  { id: 'diagnostics', label: 'Diagnostics' },
]

/** Tick at ~24fps to animate pulse dots — only active when Stability tab is visible. */
function useAnimationTick() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let id
    const loop = () => { setTick(t => t + 1); id = requestAnimationFrame(loop) }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [])
  return tick
}

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

      {activeTab === 'overview' && <OverviewTab snap={snap} snapshots={snapshots} epochInt={epochInt} currentEpochFloat={currentEpochFloat} />}
      {activeTab === 'bridges' && <BridgesTab snap={snap} onFocus={(cid) => setSelectedCommunity(cid)} />}
      {activeTab === 'stability' && <StabilityTab snapshots={snapshots} epochInt={epochInt} currentEpochFloat={currentEpochFloat} />}
      {activeTab === 'diagnostics' && <DiagnosticsTab snap={snap} snapshots={snapshots} epochInt={epochInt} currentEpochFloat={currentEpochFloat} />}
    </div>
  )
}

/* ── Pulse dot — renders only at a specific data index ────────────────────── */
function PulseDot({ cx, cy, index, activeIndex }) {
  if (index !== activeIndex) return null
  const now = Date.now()
  const pulse = (Math.sin(now / 400) + 1) * 0.5 // 0..1 oscillation
  const r = 4 + pulse * 3
  const opacity = 0.6 + pulse * 0.4
  return (
    <>
      <circle cx={cx} cy={cy} r={r + 4} fill="rgba(34,211,238,0.15)" />
      <circle cx={cx} cy={cy} r={r} fill="#22d3ee" fillOpacity={opacity} />
    </>
  )
}

/* ── Overview ─────────────────────────────────────────────────────────────── */
function OverviewTab({ snap, snapshots, epochInt, currentEpochFloat }) {
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
  const totalNodes = snap?.node_predictions?.length ?? 1
  const transitions = snap?.community_transitions || {}
  const migratedCount = Object.values(transitions).reduce((a, b) => a + b, 0)
  const migrationPct = (migratedCount / totalNodes) * 100

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-auto">
      <div className="grid grid-cols-3 gap-2">
        <StatCell label="Migration %" value={migrationPct} digits={1}
          tone={migrationPct < 5 ? 'good' : migrationPct < 15 ? 'warn' : 'bad'} />
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
            <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
            <XAxis dataKey="epoch" tick={{ fill: '#94a3b8', fontSize: 9 }} />
            <YAxis domain={[-0.1, 1]} tick={{ fill: '#94a3b8', fontSize: 9 }} />
            <Tooltip
              contentStyle={{ background: 'var(--c-bg-elev)', border: '1px solid var(--c-border)', color: 'var(--c-fg)', borderRadius: 8, fontSize: 10 }}
              itemStyle={{ color: '#e2e8f0' }}
              labelStyle={{ color: '#94a3b8' }}
            />
            <ReferenceLine y={0.4} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity={0.4} />
            <ReferenceLine x={epochInt} stroke="#06b6d4" strokeWidth={1.5} strokeDasharray="4 2" strokeOpacity={0.7} />
            <Area type="monotone" dataKey="modularity" stroke="#22c55e" fill="url(#modGrad)" strokeWidth={2} name="Modularity Q" />
            <Area type="monotone" dataKey="conductance" stroke="#f97316" fill="url(#condGrad)" strokeWidth={2} name="Conductance" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* ── Bridges ──────────────────────────────────────────────────────────────── */
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
          <span className="text-nano font-mono text-slate-500 shrink-0" style={{ color: getCommunityColor(b.community) }}>
            C{b.community}
          </span>
        </button>
      ))}
    </div>
  )
}

/* ── Stability (with motion) ──────────────────────────────────────────────── */
function StabilityTab({ snapshots, epochInt, currentEpochFloat }) {
  useAnimationTick() // re-render ~24fps for pulse dot
  const { matrix, numCommunities, numEpochs, epochAverages } = useMemo(() => buildStabilityMatrix(snapshots), [snapshots])
  const overall = useMemo(() => computeAggregateStability({ epochAverages, numEpochs }), [epochAverages, numEpochs])
  const lineData = useMemo(
    () => epochAverages.map((v, i) => ({ epoch: i, stability: v })),
    [epochAverages]
  )

  // Delta stability: change from previous epoch
  const deltaData = useMemo(
    () => epochAverages.map((v, i) => ({
      epoch: i,
      delta: i === 0 ? 0 : v - (epochAverages[i - 1] ?? v),
    })),
    [epochAverages]
  )

  // Current delta value
  const currentDelta = epochInt > 0 ? (epochAverages[epochInt] ?? 0) - (epochAverages[epochInt - 1] ?? 0) : 0

  // Column width for heatmap
  const cellSize = Math.max(4, Math.min(12, Math.floor(240 / Math.max(1, numEpochs))))

  return (
    <div className="flex-1 overflow-auto space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <StatCell label="Overall Stability" value={overall} digits={3} tone={overall > 0.85 ? 'good' : overall > 0.6 ? 'warn' : 'bad'} />
        <StatCell label="Communities" value={numCommunities} digits={0} />
        <StatCell label="Δ Stability" value={currentDelta} digits={3}
          tone={currentDelta > 0.01 ? 'good' : currentDelta < -0.01 ? 'bad' : 'neutral'} />
      </div>

      {/* Line chart with playhead + pulse dot */}
      <div>
        <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra block mb-1">Overall stability per epoch</span>
        <ResponsiveContainer width="100%" height={90}>
          <LineChart data={lineData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
            <XAxis dataKey="epoch" tick={{ fill: '#94a3b8', fontSize: 8 }} />
            <YAxis domain={[0, 1]} tick={{ fill: '#94a3b8', fontSize: 8 }} />
            <Tooltip
              contentStyle={{ background: 'var(--c-bg-elev)', border: '1px solid var(--c-border)', color: 'var(--c-fg)', borderRadius: 8, fontSize: 10 }}
              itemStyle={{ color: '#e2e8f0' }}
              labelStyle={{ color: '#94a3b8' }}
            />
            {/* Playhead */}
            <ReferenceLine x={epochInt} stroke="#06b6d4" strokeWidth={1.5} strokeDasharray="4 2" strokeOpacity={0.7} />
            <Line
              type="monotone"
              dataKey="stability"
              stroke="#22d3ee"
              strokeWidth={2}
              dot={(props) => <PulseDot {...props} activeIndex={epochInt} />}
              activeDot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Delta bar chart (velocity) — prominent current-epoch highlight */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra">Stability velocity (Δ)</span>
          <span className={`text-nano font-mono font-bold ${currentDelta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {currentDelta >= 0 ? '+' : ''}{currentDelta.toFixed(4)}
          </span>
        </div>
        <div className="flex items-end gap-[1px] h-[60px]">
          {deltaData.map((d, i) => {
            const maxAbs = Math.max(0.01, ...deltaData.map(x => Math.abs(x.delta)))
            const normH = Math.abs(d.delta) / maxAbs
            const pct = Math.max(2, normH * 100)
            const isCurrent = i === epochInt
            const isPos = d.delta >= 0
            return (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full relative" title={`Epoch ${d.epoch} · Δ ${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(4)}`}>
                {isCurrent && (
                  <span className="text-[7px] font-mono font-bold mb-0.5" style={{ color: isPos ? '#22c55e' : '#ef4444' }}>
                    {d.delta >= 0 ? '+' : ''}{d.delta.toFixed(3)}
                  </span>
                )}
                <div
                  className="w-full rounded-t-sm transition-all duration-200"
                  style={{
                    height: `${pct}%`,
                    backgroundColor: isCurrent
                      ? (isPos ? '#22c55e' : '#ef4444')
                      : (isPos ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'),
                    boxShadow: isCurrent ? `0 0 8px ${isPos ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)'}` : 'none',
                    minWidth: 2,
                  }}
                />
              </div>
            )
          })}
        </div>
        <div className="h-[1px] bg-slate-700/50 mt-0.5" />
      </div>

      {/* Heatmap with highlighted current epoch column */}
      <div>
        <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra block mb-1.5">Community × Epoch stability heatmap</span>
        <div className="flex flex-col gap-0.5">
          {matrix.map((row, cid) => (
            <div key={cid} className="flex items-center gap-1">
              <span className="text-nano font-mono w-6 shrink-0 text-right" style={{ color: getCommunityColor(cid) }}>C{cid}</span>
              <div className="flex gap-[1px]">
                {row.map((v, e) => (
                  <div
                    key={e}
                    title={`C${cid} · epoch ${e} · ${v.toFixed(2)}`}
                    className="transition-all duration-150"
                    style={{
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: stabilityColor(v),
                      outline: e === epochInt ? '1.5px solid #06b6d4' : 'none',
                      outlineOffset: '0px',
                      boxShadow: e === epochInt ? '0 0 6px rgba(6,182,212,0.4)' : 'none',
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

/* ── Diagnostics (with motion) ────────────────────────────────────────────── */
function DiagnosticsTab({ snap, snapshots, epochInt, currentEpochFloat }) {
  const hist = useMemo(() => buildClusterConfidenceHistogram(snap, 10), [snap])
  const nmi = snap?.nmi_score
  const silhouetteScores = snap?.silhouette_scores || []
  const silhouette = silhouetteScores.reduce((acc, v, _i, arr) => acc + v / arr.length, 0) || 0
  const modelType = snap?.model_type || ''
  const dirichlet = snap?.dirichlet_energy
  const robustness = snap?.sage_robustness
  const attnBoundary = snap?.attention_boundary_ratio

  // Mean confidence for marker
  const confidenceValues = (snap?.cluster_confidence || []).filter(v => Number.isFinite(v))
  const meanConfidence = confidenceValues.length > 0
    ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length
    : 0

  // Silhouette history for sparkline
  const silhouetteHistory = useMemo(
    () => snapshots.slice(0, epochInt + 1).map((s, i) => ({
      epoch: i,
      silhouette: (s?.silhouette_scores || []).reduce((a, v, _, arr) => a + v / arr.length, 0) || 0,
    })),
    [snapshots, epochInt]
  )

  // NMI history for sparkline
  const nmiHistory = useMemo(
    () => snapshots.slice(0, epochInt + 1).map((s, i) => ({
      epoch: i,
      nmi: s?.nmi_score ?? null,
    })).filter(d => d.nmi != null),
    [snapshots, epochInt]
  )

  // Dominant bin (highest count)
  const maxBinIdx = hist.length > 0 ? hist.reduce((mi, b, i, arr) => b.count > arr[mi].count ? i : mi, 0) : -1

  return (
    <div className="flex-1 overflow-auto space-y-3">
      {/* Gauges with sparklines */}
      <div className="grid grid-cols-2 gap-2">
        <GaugeWithSparkline label="NMI" value={nmi ?? null} history={nmiHistory} dataKey="nmi" color="#a78bfa" epochInt={epochInt} />
        <GaugeWithSparkline label="Silhouette" value={silhouette} history={silhouetteHistory} dataKey="silhouette" color="#22d3ee" epochInt={epochInt} />
      </div>

      {/* Model-specific signature metrics */}
      {(dirichlet != null || robustness != null || attnBoundary != null) && (
        <div>
          <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra block mb-1">
            {modelType} Signature
          </span>
          <div className="grid grid-cols-3 gap-2">
            {dirichlet != null && (
              <StatCell label="Dirichlet E" value={dirichlet} digits={4}
                tone={dirichlet < 1 ? 'good' : 'warn'} />
            )}
            {robustness != null && (
              <StatCell label="Robustness" value={robustness * 100} digits={1}
                tone={robustness > 0.8 ? 'good' : robustness > 0.5 ? 'warn' : 'bad'} />
            )}
            {attnBoundary != null && (
              <StatCell label="Attn Boundary" value={attnBoundary * 100} digits={1}
                tone={attnBoundary < 0.2 ? 'good' : 'warn'} />
            )}
          </div>
        </div>
      )}

      {/* Cluster confidence histogram with mean marker */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra">Cluster confidence histogram</span>
          <span className="text-nano text-cyan-400 font-mono font-bold">μ={meanConfidence.toFixed(2)}</span>
        </div>
        <div className="relative">
          <div className="flex items-end gap-0.5 h-[55px]">
            {hist.map((bin, i) => {
              const max = Math.max(1, ...hist.map((b) => b.count))
              const h = (bin.count / max) * 100
              const isDominant = i === maxBinIdx
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${bin.range[0].toFixed(1)}–${bin.range[1].toFixed(1)} · ${bin.count}`}>
                  <div
                    className="rounded-sm transition-all duration-300"
                    style={{
                      height: `${h}%`,
                      width: '100%',
                      backgroundColor: isDominant ? '#22d3ee' : 'rgba(34,211,238,0.45)',
                      boxShadow: isDominant ? '0 0 8px rgba(34,211,238,0.3)' : 'none',
                    }}
                  />
                  <span className="text-nano text-slate-600 font-mono">{bin.range[0].toFixed(1)}</span>
                </div>
              )
            })}
          </div>
          {/* Mean marker line — clipped inside histogram */}
          {hist.length > 1 && confidenceValues.length > 0 && (
            <div
              className="absolute bottom-[14px] w-0.5 bg-amber-400 transition-all duration-300 rounded-full"
              style={{
                left: `${((meanConfidence + 1) / 2) * 100}%`,
                height: '42px',
                opacity: 0.6,
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Gauge with mini sparkline ────────────────────────────────────────────── */
function GaugeWithSparkline({ label, value, history, dataKey, color, epochInt }) {
  const v = Number.isFinite(value) ? value : null
  const barV = v == null ? 0 : Math.max(0, Math.min(1, v))

  return (
    <div className="bg-slate-900/60 rounded-md px-2 py-1.5 border border-slate-800/50">
      <div className="flex items-center justify-between">
        <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra">{label}</span>
        <span className="text-micro font-mono font-bold text-slate-100">{v == null ? '—' : v.toFixed(3)}</span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1">
        <div className="h-full transition-all duration-300" style={{ width: `${barV * 100}%`, backgroundColor: color }} />
      </div>
      {/* Mini sparkline */}
      {history.length > 2 && (
        <div className="mt-1 h-[20px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history}>
              <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} dot={false} />
              <ReferenceLine x={epochInt} stroke="#06b6d4" strokeWidth={1} strokeDasharray="2 2" strokeOpacity={0.5} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

/* ── Shared components ────────────────────────────────────────────────────── */
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

function stabilityColor(v) {
  if (!Number.isFinite(v)) return '#1e293b'
  if (v >= 0.85) return 'rgba(34,197,94,0.9)'
  if (v >= 0.65) return 'rgba(250,204,21,0.85)'
  if (v >= 0.4) return 'rgba(249,115,22,0.8)'
  return 'rgba(239,68,68,0.85)'
}
