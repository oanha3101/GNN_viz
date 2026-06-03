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
  buildTask4QualitySummary,
  buildTask4DendrogramRows,
  buildTask4ReasoningPack,
  buildTask4ReasoningHighlights,
  buildTask4NodeProfile,
} from '../../utils/task4Metrics'
import { COMMUNITY_COLORS, getCommunityColor } from '../../utils/colors'
import { getTask4Copy } from '../../utils/task4I18n'

const TASK4_COPY = getTask4Copy()

const TABS = [
  { id: 'overview', label: 'Tá»•ng quan' },
  { id: 'bridges', label: 'Cáº§u ná»‘i' },
  { id: 'stability', label: 'á»”n Ä‘á»‹nh' },
  { id: 'diagnostics', label: 'Cháº©n Ä‘oĂ¡n' },
]

/** Tick at ~24fps to animate pulse dots â€” only active when Stability tab is visible. */
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

export default function Task4MetricsPanel({ forcedTab = null, hideTabControls = false }) {
  const copy = getTask4Copy()
  const tabs = useMemo(() => ([
    { id: 'overview', label: copy.tabs.overview },
    { id: 'bridges', label: copy.tabs.bridges },
    { id: 'stability', label: copy.tabs.stability },
    { id: 'diagnostics', label: copy.tabs.diagnostics },
  ]), [copy])
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const setSelectedCommunity = useGNNStore((s) => s.setSelectedCommunity)
  const graphData = useGNNStore((s) => s.graphData)
  const selectedModel = useGNNStore((s) => s.selectedModel)
  const [activeTab, setActiveTab] = useState(forcedTab || 'overview')
  useEffect(() => { if (forcedTab) setActiveTab(forcedTab) }, [forcedTab])

  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]

  if (!snapshots.length) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 p-6 gap-2">
        <div className="text-3xl opacity-40 animate-pulse">&#8230;</div>
        <p className="text-micro text-center">{copy.empty.metrics}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-3">
      {!hideTabControls && (
        <div className="w-fit rounded-2xl border border-white/8 bg-slate-950/55 p-1 shadow-[0_10px_24px_rgba(2,6,23,0.28)]">
          <div className="flex items-center gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`rounded-xl px-3 py-1.5 text-nano font-bold uppercase tracking-ultra transition-all ${
                  activeTab === t.id
                    ? 'bg-slate-800/95 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                    : 'bg-transparent text-slate-500 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'overview' && <OverviewTab copy={copy} snap={snap} snapshots={snapshots} epochInt={epochInt} graphData={graphData} selectedModel={selectedModel} />}
      {activeTab === 'bridges' && <BridgesTab copy={copy} snap={snap} graphData={graphData} onFocus={(cid) => setSelectedCommunity(cid)} />}
      {activeTab === 'stability' && <StabilityTab copy={copy} snap={snap} snapshots={snapshots} epochInt={epochInt} />}
      {activeTab === 'diagnostics' && <DiagnosticsTab copy={copy} snap={snap} snapshots={snapshots} epochInt={epochInt} />}
    </div>
  )
}

/* â”€â”€ Pulse dot â€” renders only at a specific data index â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

/* â”€â”€ Overview â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function OverviewTab({ copy, snap, snapshots, epochInt, graphData, selectedModel }) {
  const summary = useMemo(() => buildTask4QualitySummary(snap), [snap])
  const reasoning = useMemo(
    () => ({
      ...buildTask4ReasoningPack(snap, snapshots, graphData, selectedModel),
      ...buildTask4ReasoningHighlights(snap, snapshots, selectedModel),
    }),
    [snap, snapshots, graphData, selectedModel]
  )
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
  const totalNodes = snap?.node_predictions?.length ?? 1
  const transitions = snap?.community_transitions || {}
  const migratedCount = Object.values(transitions).reduce((a, b) => a + b, 0)
  const migrationPct = (migratedCount / totalNodes) * 100

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-auto">
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}
      >
        <StatCell label={copy.labels.health} value={summary.healthScore * 100} digits={1}
          tone={summary.healthScore > 0.75 ? 'good' : summary.healthScore > 0.5 ? 'warn' : 'bad'} />
        <StatCell label={copy.labels.modularity} value={summary.modularity} digits={3} caption={copy.captions.modularity}
          tone={summary.modularity > 0.4 ? 'good' : 'warn'} />
        <StatCell label={copy.labels.bridgeRatio} value={summary.bridgeRatio * 100} digits={1} caption={copy.captions.bridgeRatio}
          tone={summary.bridgeRatio < 0.12 ? 'good' : summary.bridgeRatio < 0.25 ? 'warn' : 'bad'} />
        <StatCell label={copy.labels.migration} value={migrationPct} digits={1} caption={copy.captions.migration}
          tone={migrationPct < 5 ? 'good' : migrationPct < 15 ? 'warn' : 'bad'} />
        <StatCell label={copy.labels.conductance} value={cond} digits={3} caption={copy.captions.conductance}
          tone={cond < 0.2 ? 'good' : 'warn'} />
        <StatCell label={copy.labels.emptyCommunity} value={summary.emptyCommunityCount} digits={0}
          tone={summary.emptyCommunityCount === 0 ? 'good' : 'bad'} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-cyan-400/12 bg-[linear-gradient(135deg,rgba(6,182,212,0.08),rgba(15,23,42,0.72)_34%,rgba(15,23,42,0.92)_100%)] shadow-[0_16px_38px_rgba(2,6,23,0.24)]">
        <div className="border-b border-white/6 px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.24em] font-black text-cyan-300/90">{copy.labels.conclusion}</div>
          <div className="mt-2 text-[20px] font-bold leading-tight text-white">{reasoning.reportHeadline || reasoning.takeaway}</div>
          <div className="mt-2 max-w-4xl text-[13px] leading-relaxed text-slate-300">{reasoning.bridgeNarrative} {reasoning.modelStability.detail}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <SignalBadge label={copy.labels.primaryIssue} value={reasoning.dominantIssue} tone={reasoning.dominantIssue} />
            <SignalBadge label={copy.labels.healthStatus} value={reasoning.healthStatus} tone={reasoning.healthStatus} />
            <SignalBadge label={copy.labels.modelState} value={reasoning.modelStability.label} tone={reasoning.modelStability.status} />
          </div>
        </div>
      </div>

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
      >
        <IssueStrip
          title={copy.labels.worstCommunity}
          tone="rose"
          community={reasoning.worstCommunity}
          fallback="Chua co du du lieu de xac dinh cum xau nhat."
        />
        <IssueStrip
          title={copy.labels.bestCommunity}
          tone="emerald"
          community={reasoning.bestCommunity}
          fallback="Chua co du du lieu de xac dinh cum tot nhat."
        />
        <EpochStrip summary={reasoning.epochChangeSummary} />
      </div>

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}
      >
        <div className="rounded-2xl border border-white/6 bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(15,23,42,0.5))] p-3 shadow-[0_10px_26px_rgba(2,6,23,0.16)]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <div className="text-nano font-bold uppercase tracking-ultra text-slate-400">{copy.labels.communityMap}</div>
              <div className="mt-1 text-xs text-slate-500">{copy.labels.communityMapSubtitle}</div>
            </div>
            <div className="rounded-full border border-white/8 bg-white/4 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
              {reasoning.communityCards.length} {copy.labels.community.toLowerCase()}
            </div>
          </div>

          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            {reasoning.communityCards.map((card) => (
              <CommunityEvidenceCard key={card.id} card={card} />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/6 bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(15,23,42,0.5))] p-3 shadow-[0_10px_26px_rgba(2,6,23,0.16)]">
          <div className="mb-3">
            <div className="text-nano font-bold uppercase tracking-ultra text-slate-400">{copy.labels.primarySignals}</div>
            <div className="mt-1 text-xs text-slate-500">{copy.labels.primarySignalsSubtitle}</div>
          </div>

          <div className="space-y-2.5">
            <MiniMetricBar
              label={copy.labels.modularity}
              value={summary.modularity}
              normalized={Math.max(0, Math.min(1, summary.modularity))}
              color="#4ade80"
              note={copy.captions.modularity}
            />
            <MiniMetricBar
              label={copy.labels.conductance}
              value={cond}
              normalized={Math.max(0, Math.min(1, 1 - cond))}
              color="#f59e0b"
              note={copy.captions.conductance}
            />
            <MiniMetricBar
              label={copy.labels.bridgeRatio}
              value={summary.bridgeRatio * 100}
              normalized={Math.max(0, Math.min(1, 1 - summary.bridgeRatio))}
              color="#fb7185"
              suffix="%"
              note={copy.captions.bridgeRatio}
            />
            <MiniMetricBar
              label={copy.labels.migration}
              value={migrationPct}
              normalized={Math.max(0, Math.min(1, 1 - (migrationPct / 100)))}
              color="#22d3ee"
              suffix="%"
              note={copy.captions.migration}
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/6 bg-slate-950/32 px-1 pt-3">
        <div className="mb-1 px-2">
          <span className="block text-nano font-bold uppercase tracking-ultra text-slate-500">{copy.labels.qConductance}</span>
          <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">{reasoning.epochChangeSummary}</span>
        </div>
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
        <div className="px-2 pb-3">
          <ChartCaption text={copy.captions.overviewChart} />
        </div>
      </div>
    </div>
  )
}

/* â”€â”€ Bridges â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function BridgesTab({ copy, snap, graphData, onFocus }) {
  const bridges = useMemo(() => buildBridgeRanking(snap, 10).map((item) => {
    const profile = buildTask4NodeProfile({ snap, nodeId: item.id, graphData })
    const lowSilhouette = Number.isFinite(profile?.silhouette) ? Math.max(0, 1 - ((profile.silhouette + 1) / 2)) : 0
    const crossPressure = (profile?.crossCommunityNeighbors || 0) / Math.max(1, profile?.degree || 1)
    return {
      ...item,
      profile,
      severity: item.strength * 0.55 + crossPressure * 0.3 + lowSilhouette * 0.15,
    }
  }).sort((a, b) => b.severity - a.severity), [snap, graphData])
  const groupedBridges = useMemo(() => ({
    highRisk: bridges.filter((bridge) => bridge.severity >= 0.66),
    leakage: bridges.filter((bridge) => (bridge.profile?.crossCommunityNeighbors || 0) >= 2),
    stable: bridges.filter((bridge) => bridge.severity < 0.66 && (bridge.profile?.crossCommunityNeighbors || 0) < 2),
  }), [bridges])

  if (bridges.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500 text-micro">
        {copy.empty.bridges}
      </div>
    )
  }
  return (
    <div className="flex-1 overflow-auto space-y-3">
      <div className="text-nano text-slate-500 uppercase font-bold tracking-ultra">{copy.labels.topBridges} - {copy.descriptions.bridgeSorted}</div>
      <BridgeGroup title={copy.labels.highestRiskBridges} items={groupedBridges.highRisk} onFocus={onFocus} copy={copy} />
      <BridgeGroup title={copy.labels.leakingBridges} items={groupedBridges.leakage} onFocus={onFocus} copy={copy} />
      <BridgeGroup title={copy.labels.stableBridges} items={groupedBridges.stable} onFocus={onFocus} copy={copy} />
    </div>
  )
}

/* â”€â”€ Stability (with motion) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function StabilityTab({ copy, snap, snapshots, epochInt }) {
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
  const strongestDrop = useMemo(() => deltaData.reduce((lowest, item) => (
    item.delta < lowest.delta ? item : lowest
  ), deltaData[0] || { epoch: 0, delta: 0 }), [deltaData])
  const leastStableCommunity = useMemo(() => {
    if (!matrix.length) return null
    const rows = matrix.map((row, cid) => ({
      cid,
      mean: row.reduce((sum, value) => sum + value, 0) / Math.max(1, row.length),
    }))
    rows.sort((a, b) => a.mean - b.mean)
    return rows[0] || null
  }, [matrix])

  // Column width for heatmap
  const cellSize = Math.max(4, Math.min(12, Math.floor(240 / Math.max(1, numEpochs))))

  return (
    <div className="flex-1 overflow-auto space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <StatCell label={copy.labels.overallStability} value={overall} digits={3} tone={overall > 0.85 ? 'good' : overall > 0.6 ? 'warn' : 'bad'} />
        <StatCell label={copy.labels.communities} value={numCommunities} digits={0} />
        <StatCell label="Î” Stability" value={currentDelta} digits={3}
          tone={currentDelta > 0.01 ? 'good' : currentDelta < -0.01 ? 'bad' : 'neutral'} />
      </div>

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
      >
        <IssueStrip
          title={copy.labels.worstDropEpoch}
          tone="rose"
          metricLabel={strongestDrop ? `Epoch ${strongestDrop.epoch}` : 'N/A'}
          metricValue={strongestDrop ? `${strongestDrop.delta >= 0 ? '+' : ''}${strongestDrop.delta.toFixed(3)}` : 'N/A'}
          body={strongestDrop ? copy.descriptions.strongestDrop : copy.descriptions.strongestDropFallback}
        />
        <IssueStrip
          title={copy.labels.shakiestCommunity}
          tone="amber"
          metricLabel={leastStableCommunity ? `C${leastStableCommunity.cid}` : 'N/A'}
          metricValue={leastStableCommunity ? `${(leastStableCommunity.mean * 100).toFixed(1)}%` : 'N/A'}
          body={leastStableCommunity ? copy.descriptions.shakiestCommunity : copy.descriptions.shakiestCommunityFallback}
        />
      </div>

      {/* Line chart with playhead + pulse dot */}
      <div>
        <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra block mb-1">{copy.labels.stabilityPerEpoch}</span>
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

      {/* Delta bar chart (velocity) â€” prominent current-epoch highlight */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra">{copy.labels.stabilityVelocity} (Î”)</span>
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
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full relative" title={`Epoch ${d.epoch} Â· Î” ${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(4)}`}>
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
        <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra block mb-1.5">{copy.labels.stabilityHeatmap}</span>
        <div className="flex flex-col gap-0.5">
          {matrix.map((row, cid) => (
            <div key={cid} className="flex items-center gap-1">
              <span className="text-nano font-mono w-6 shrink-0 text-right" style={{ color: getCommunityColor(cid) }}>C{cid}</span>
              <div className="flex gap-[1px]">
                {row.map((v, e) => (
                  <div
                    key={e}
                    title={`C${cid} Â· epoch ${e} Â· ${v.toFixed(2)}`}
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

/* â”€â”€ Diagnostics (with motion) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function DiagnosticsTab({ copy, snap, snapshots, epochInt }) {
  const hist = useMemo(() => buildClusterConfidenceHistogram(snap, 10), [snap])
  const summary = useMemo(() => buildTask4QualitySummary(snap), [snap])
  const nmi = snap?.nmi_score
  const modelType = snap?.model_type || ''
  const dirichlet = snap?.dirichlet_energy
  const robustness = snap?.sage_robustness
  const attnBoundary = snap?.attention_boundary_ratio
  const dendrogramRows = useMemo(() => buildTask4DendrogramRows(snap, 10), [snap])

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
      <div className="grid grid-cols-2 gap-3">
        <GaugeWithSparkline label="NMI" value={nmi ?? null} history={nmiHistory} dataKey="nmi" color="#a78bfa" epochInt={epochInt} />
        <GaugeWithSparkline label="Silhouette" value={summary.silhouette} history={silhouetteHistory} dataKey="silhouette" color="#22d3ee" epochInt={epochInt} />
      </div>

      {/* Model-specific signature metrics */}
      {(dirichlet != null || robustness != null || attnBoundary != null) && (
        <div>
          <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra block mb-1">
            {modelType} {copy.labels.modelSignature}
          </span>
          <div className="grid grid-cols-3 gap-3">
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

      <div className="rounded-2xl border border-white/6 bg-slate-900/42 p-3">
        <div className="text-nano font-bold uppercase tracking-ultra text-slate-400">{copy.labels.modelReadingGuide}</div>
        <div className="mt-2 text-[12px] leading-relaxed text-slate-300">
          {modelType === 'GAT'
            ? copy.descriptions.modelGuideGAT
            : modelType === 'GraphSAGE' || modelType === 'SAGE'
              ? copy.descriptions.modelGuideSAGE
              : copy.descriptions.modelGuideGCN}
        </div>
      </div>

      {/* Cluster confidence histogram with mean marker */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra">{copy.labels.confidenceHistogramTitle}</span>
          <span className="text-nano text-cyan-400 font-mono font-bold">Î¼={meanConfidence.toFixed(2)}</span>
        </div>
        <div className="relative">
          <div className="flex items-end gap-0.5 h-[55px]">
            {hist.map((bin, i) => {
              const max = Math.max(1, ...hist.map((b) => b.count))
              const h = (bin.count / max) * 100
              const isDominant = i === maxBinIdx
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${bin.range[0].toFixed(1)}â€“${bin.range[1].toFixed(1)} Â· ${bin.count}`}>
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
          {/* Mean marker line â€” clipped inside histogram */}
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

      <HierarchyPreview rows={dendrogramRows} />
    </div>
  )
}

function HierarchyPreview({ rows }) {
  if (!rows.length) {
    return (
      <div className="rounded-md border border-slate-800/50 bg-slate-900/40 px-2 py-2">
        <span className="block text-nano text-slate-500 uppercase font-bold tracking-ultra">{TASK4_COPY.labels.hierarchy}</span>
        <span className="text-nano text-slate-600">Linkage data appears every sampled dendrogram epoch.</span>
      </div>
    )
  }
  const maxSize = Math.max(...rows.map((row) => row.size), 1)
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra">{TASK4_COPY.labels.hierarchyMerges}</span>
        <span className="text-nano text-slate-500 font-mono">{rows.length} {TASK4_COPY.labels.hierarchyRows}</span>
      </div>
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.step} className="grid grid-cols-[48px_1fr_38px] items-center gap-2">
            <span className="text-nano font-mono text-slate-500">#{row.step}</span>
            <div className="h-2 rounded-full bg-slate-800/70 overflow-hidden">
              <div
                className="h-full rounded-full bg-cyan-400/70"
                style={{ width: `${Math.max(6, Math.min(100, row.normalizedDistance * 100))}%` }}
              />
            </div>
            <span className="text-nano font-mono text-slate-400 text-right">
              n={Math.round(row.size || maxSize)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* â”€â”€ Gauge with mini sparkline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function GaugeWithSparkline({ label, value, history, dataKey, color, epochInt }) {
  const v = Number.isFinite(value) ? value : null
  const barV = v == null ? 0 : Math.max(0, Math.min(1, v))

  return (
    <div className="rounded-2xl border border-white/6 bg-[linear-gradient(180deg,rgba(15,23,42,0.74),rgba(15,23,42,0.52))] px-3 py-3 shadow-[0_10px_26px_rgba(2,6,23,0.16)]">
      <div className="flex items-center justify-between">
        <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra">{label}</span>
        <span className="text-micro font-mono font-bold text-slate-100">{v == null ? 'â€”' : v.toFixed(3)}</span>
      </div>
      <div className="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden">
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

/* â”€â”€ Shared components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function ChartCaption({ text }) {
  if (!text) return null
  return <p className="mt-1 text-[10px] leading-snug text-slate-500">{text}</p>
}

function SignalBadge({ label, value, tone = 'neutral' }) {
  const normalized = String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
  const tones = {
    strong: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    stable: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    good: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    tot: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    mixed: 'border-slate-300/12 bg-white/6 text-slate-200',
    warn: 'border-amber-400/20 bg-amber-400/10 text-amber-100',
    canh_bao: 'border-amber-400/20 bg-amber-400/10 text-amber-100',
    boundary: 'border-rose-400/20 bg-rose-400/10 text-rose-100',
    leakage: 'border-orange-400/20 bg-orange-400/10 text-orange-100',
    migration: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-100',
    confidence: 'border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-100',
    unstable_drop: 'border-rose-400/20 bg-rose-400/10 text-rose-100',
    bad: 'border-rose-400/20 bg-rose-400/10 text-rose-100',
    yeu: 'border-rose-400/20 bg-rose-400/10 text-rose-100',
  }

  return (
    <div className={`rounded-full border px-2.5 py-1 ${tones[tone] || 'border-white/10 bg-white/5 text-slate-200'}`}>
      <div className="text-[9px] uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className="mt-1 text-[11px] font-semibold">{normalized}</div>
    </div>
  )
}

function CommunityEvidenceCard({ card }) {
  const color = getCommunityColor(card.id)
  const conductanceFill = Math.max(0, Math.min(1, 1 - (card.conductance ?? 1)))
  const bridgeDensity = Math.max(0, Math.min(1, (card.bridgeCount || 0) / Math.max(1, card.size || 1)))

  return (
    <div className="min-w-0 rounded-xl border border-white/6 bg-slate-900/42 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full shadow-[0_0_16px_currentColor]" style={{ backgroundColor: color, color }} />
          <div className="truncate text-sm font-bold text-white">C{card.id}</div>
        </div>
        <span className="rounded-full border border-white/8 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
          {card.size} {TASK4_COPY.labels.nodesInCommunity.toLowerCase()}
        </span>
      </div>

      <div className="mt-2 text-[11px] leading-relaxed text-slate-400">{card.status}</div>
      <div className="mt-3 space-y-2">
        <MiniProgress label={TASK4_COPY.labels.boundaryCleanliness} value={conductanceFill} color={color} right={`${((1 - (card.conductance ?? 1)) * 100).toFixed(0)}%`} />
        <MiniProgress label={TASK4_COPY.labels.bridgeDensity} value={bridgeDensity} color="#fb7185" right={`${card.bridgeCount} node`} />
      </div>
    </div>
  )
}

function MiniMetricBar({ label, value, normalized, color, note, suffix = '' }) {
  const display = Number.isFinite(value) ? value.toFixed(suffix ? 1 : 3) : 'N/A'
  return (
    <div className="rounded-xl border border-white/6 bg-slate-900/38 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-white">{label}</div>
        <div className="text-xs font-mono font-bold tabular-nums" style={{ color }}>{display}{suffix}</div>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800/90">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(1, normalized)) * 100}%`, backgroundColor: color }} />
      </div>
      <div className="mt-2 text-[11px] leading-relaxed text-slate-500">{note}</div>
    </div>
  )
}

function MiniProgress({ label, value, color, right }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
        <span>{label}</span>
        <span className="font-mono text-slate-400">{right}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800/90">
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function IssueStrip({ title, tone = 'neutral', community = null, metricLabel = '', metricValue = '', body = '', fallback = '' }) {
  const toneMap = {
    rose: 'border-rose-400/15 bg-rose-400/[0.05] text-rose-200',
    amber: 'border-amber-400/15 bg-amber-400/[0.05] text-amber-100',
    emerald: 'border-emerald-400/15 bg-emerald-400/[0.05] text-emerald-100',
    neutral: 'border-white/8 bg-white/[0.03] text-slate-200',
  }
  const resolvedMetricLabel = community ? `C${community.id}` : metricLabel
  const resolvedMetricValue = community
    ? `${((community.cleanliness || 0) * 100).toFixed(0)}% sach bien`
    : metricValue
  const resolvedBody = community
    ? `${community.status}. ${community.bridgeCount} node bridge tren ${community.size} node cua cum nay.`
    : body

  return (
    <div className={`rounded-2xl border p-3 shadow-[0_10px_24px_rgba(2,6,23,0.14)] ${toneMap[tone] || toneMap.neutral}`}>
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{title}</div>
      {(community || metricLabel) && (
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="text-lg font-bold text-white">{resolvedMetricLabel}</div>
          <div className="text-xs font-mono font-bold tabular-nums">{resolvedMetricValue}</div>
        </div>
      )}
      <div className="mt-2 text-[12px] leading-relaxed text-slate-300">{resolvedBody || fallback}</div>
    </div>
  )
}

function EpochStrip({ summary }) {
  return (
    <div className="rounded-2xl border border-cyan-400/12 bg-cyan-400/[0.05] p-3 shadow-[0_10px_24px_rgba(2,6,23,0.14)]">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{TASK4_COPY.labels.epochChange}</div>
      <div className="mt-2 text-[12px] leading-relaxed text-slate-300">{summary}</div>
    </div>
  )
}

function BridgeGroup({ title, items, onFocus, copy }) {
  if (!items.length) return null
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{title}</div>
      {items.map((b) => (
        <button
          key={`${title}-${b.id}`}
          onClick={() => onFocus(b.community)}
          className="w-full rounded-xl border border-slate-800/60 bg-slate-900/42 px-3 py-2 text-left transition-colors hover:bg-slate-900/72"
          title={`${copy.labels.focusCommunity} C${b.community}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-slate-800 text-nano font-bold text-slate-100 shrink-0">
              {b.id}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-white">Node {b.id}</div>
                <div className="text-xs font-mono font-bold text-slate-200">{b.strength.toFixed(2)}</div>
              </div>
              <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-400">
                <span style={{ color: getCommunityColor(b.community) }}>C{b.community}</span>
                <span>cross {b.profile?.crossCommunityNeighbors ?? 0}</span>
                <span>sil {Number.isFinite(b.profile?.silhouette) ? b.profile.silhouette.toFixed(2) : 'N/A'}</span>
                <span>sev {b.severity.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}

function StatCell({ label, value, digits = 0, tone = 'neutral', caption = '' }) {
  const colorClass = {
    good: 'text-green-400',
    warn: 'text-amber-400',
    bad: 'text-red-400',
    neutral: 'text-slate-100',
  }[tone]
  const display = Number.isFinite(value) ? (digits > 0 ? value.toFixed(digits) : `${value}`) : 'â€”'
  return (
    <div className="rounded-2xl border border-white/6 bg-[linear-gradient(180deg,rgba(15,23,42,0.74),rgba(15,23,42,0.52))] px-3 py-3 text-center shadow-[0_10px_26px_rgba(2,6,23,0.16)]">
      <span className="block text-nano text-slate-500 uppercase font-bold tracking-ultra">{label}</span>
      <span className={`mt-2 block text-[18px] font-bold font-mono tabular-nums ${colorClass}`}>{display}</span>
      {caption && <span className="mt-2 block text-[11px] leading-snug text-slate-500 normal-case tracking-normal">{caption}</span>}
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
