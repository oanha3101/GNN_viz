import React, { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useLanguage } from '../../contexts/LanguageContext'
import usePlayerStore from '../../store/playerStore'
import useGNNStore from '../../store/useGNNStore'
import {
  accuracyAtThreshold,
  brierScore,
  buildCalibrationBins,
  buildPRPoints,
  buildROCPoints,
  buildScoreHistogram,
  hitsAtK,
  pairScores,
  precisionAtK,
  recallAtK,
  topKHardEdges,
} from '../../utils/task3Metrics'
import { getTask3Copy } from '../../utils/task3I18n'
import { buildTask3ReasoningPack } from '../../utils/task3Reasoning'

export default function Task3MetricsPanel({
  forcedTab = null,
  hideTabControls = false,
  compactNarrative = false,
  reportMode = false,
}) {
  const { lang } = useLanguage()
  const copy = useMemo(() => getTask3Copy(lang), [lang])
  const tabs = useMemo(
    () => [
      { id: 'overview', label: copy.tabs.overview },
      { id: 'failures', label: copy.tabs.failures },
      { id: 'structure', label: copy.tabs.structure },
      { id: 'reasoning', label: copy.tabs.reasoning },
    ],
    [copy],
  )
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const taskData = useGNNStore((s) => s.taskData)
  const graphData = useGNNStore((s) => s.graphData)
  const groundTruth = useGNNStore((s) => s.groundTruth)
  const selectedModel = useGNNStore((s) => s.selectedModel)
  const focusedEdgeIdx = useGNNStore((s) => s.focusedEdgeIdx)
  const setFocusedEdge = useGNNStore((s) => s.setFocusedEdge)
  const [activeTab, setActiveTab] = useState(forcedTab || 'overview')

  useEffect(() => {
    if (forcedTab) setActiveTab(forcedTab)
  }, [forcedTab])

  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]
  const paired = useMemo(
    () => pairScores(snap?.edge_scores || [], taskData?.testEdges || []),
    [snap, taskData],
  )
  const reasoningPack = useMemo(
    () => buildTask3ReasoningPack({ paired, graphData, snapshots, groundTruth, snapshot: snap, lang }),
    [paired, graphData, snapshots, groundTruth, snap, lang],
  )
  const hardEdges = useMemo(() => topKHardEdges(paired, 6, 0.5), [paired])
  const enrichedByIdx = useMemo(
    () => new Map(reasoningPack.enriched.map((row) => [row.idx, row])),
    [reasoningPack.enriched],
  )
  const enrichedHardEdges = useMemo(
    () => ({
      falsePositives: hardEdges.falsePositives.map((row) => enrichedByIdx.get(row.idx) || row),
      falseNegatives: hardEdges.falseNegatives.map((row) => enrichedByIdx.get(row.idx) || row),
    }),
    [hardEdges, enrichedByIdx],
  )
  const selectedReasoning = useMemo(() => {
    const preferred =
      reasoningPack.enriched.find((row) => row.idx === focusedEdgeIdx)
      || enrichedHardEdges.falsePositives[0]
      || enrichedHardEdges.falseNegatives[0]
      || reasoningPack.ambiguous[0]
      || reasoningPack.enriched[0]
      || null
    return preferred
      ? reasoningPack.enriched.find((row) => row.idx === preferred.idx) || preferred
      : null
  }, [focusedEdgeIdx, enrichedHardEdges, reasoningPack])

  if (!snapshots.length) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 p-6 gap-2">
        <div className="text-3xl opacity-40 animate-pulse">...</div>
        <p className="text-micro text-center">{copy.empty.startTraining}</p>
      </div>
    )
  }

  if (!taskData?.testEdges?.length) {
    return <EmptyPanel label={copy.labels.noTestEdges} />
  }

  return (
    <div className="h-full flex flex-col gap-2">
      {!hideTabControls && (
        <div className="flex items-center gap-1 px-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`text-nano font-bold uppercase tracking-ultra px-2.5 py-1 rounded-md transition-colors ${
                activeTab === tab.id
                  ? 'bg-slate-800 text-white'
                  : 'bg-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {activeTab === 'overview' && (
        <OverviewTab
          copy={copy}
          snap={snap}
          snapshots={snapshots}
          epochInt={epochInt}
          paired={paired}
          heroEdge={selectedReasoning}
          roc={buildROCPoints(paired)}
          pr={buildPRPoints(paired)}
          summary={reasoningPack.summary}
        />
      )}
      {activeTab === 'failures' && (
        <FailuresTab
          copy={copy}
          falsePositives={enrichedHardEdges.falsePositives}
          falseNegatives={enrichedHardEdges.falseNegatives}
          ambiguous={reasoningPack.ambiguous}
          onFocus={setFocusedEdge}
          compactNarrative={compactNarrative || reportMode}
        />
      )}
      {activeTab === 'structure' && (
        <StructureTab
          copy={copy}
          edge={selectedReasoning}
          bridgeEdges={reasoningPack.bridgeEdges}
          hubDriven={reasoningPack.hubDriven}
          onFocus={setFocusedEdge}
        />
      )}
      {activeTab === 'reasoning' && (
        <ReasoningTab
          copy={copy}
          edge={selectedReasoning}
          unstable={reasoningPack.unstable}
          summary={reasoningPack.summary}
          paired={paired}
          selectedModel={selectedModel}
          onFocus={setFocusedEdge}
          compactNarrative={compactNarrative || reportMode}
        />
      )}
    </div>
  )
}

function OverviewTab({ copy, snap, snapshots, epochInt, paired, heroEdge, roc, pr, summary }) {
  const history = useMemo(
    () =>
      snapshots.slice(0, epochInt + 1).map((entry, index) => ({
        epoch: index,
        auc: entry.auc ?? 0.5,
        loss: entry.train_loss ?? entry.loss ?? null,
      })),
    [epochInt, snapshots],
  )

  const auc = snap?.auc ?? 0.5
  const acc = accuracyAtThreshold(paired, 0.5)
  const loss = snap?.train_loss ?? snap?.loss ?? null
  const histogram = buildScoreHistogram(paired, 10)
  const calibrationBins = buildCalibrationBins(paired, 5)
  const k = Math.min(5, Math.max(1, paired.length))

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
      >
        <Metric label={copy.labels.auc} value={auc.toFixed(3)} tone={auc > 0.9 ? 'emerald' : 'amber'} />
        <Metric label={copy.labels.ap} value={pr.ap.toFixed(3)} tone="amber" />
        <Metric label={copy.labels.precisionAtK} value={`${(precisionAtK(paired, k) * 100).toFixed(0)}%`} tone="emerald" />
        <Metric label={copy.labels.hitsAtK} value={hitsAtK(paired, k) ? '1/1' : '0/1'} tone={hitsAtK(paired, k) ? 'emerald' : 'red'} />
        <Metric label={copy.labels.recallAtK} value={`${(recallAtK(paired, k) * 100).toFixed(0)}%`} tone="cyan" />
        <Metric label={copy.labels.accAt05} value={`${(acc * 100).toFixed(1)}%`} tone="cyan" />
        <Metric label={copy.labels.brier} value={brierScore(paired).toFixed(3)} tone="slate" />
        <Metric label={copy.labels.loss} value={loss == null ? '-' : loss.toFixed(3)} tone="slate" />
        <Metric label={copy.labels.heroEdge} value={heroEdge ? `${heroEdge.source}-${heroEdge.target}` : '-'} tone="slate" />
      </div>

      <Panel title={copy.labels.executiveSummary}>
        <div className="p-3 space-y-2">
          <p className="text-sm font-semibold text-slate-100">{copy.labels.overviewHeadline}</p>
          <p className="text-nano leading-relaxed text-slate-400">
            {heroEdge?.takeaway || copy.labels.overviewFallback}
          </p>
          {summary?.dominant && (
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200">
                {copy.labels.dominantFailureMode}: {summary.dominant.label}
              </div>
              <p className="mt-1 text-nano leading-relaxed text-slate-300">{summary.recommendation}</p>
            </div>
          )}
        </div>
      </Panel>

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}
      >
        <Panel title={copy.labels.aucAndLoss}>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
                <XAxis dataKey="epoch" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="auc" domain={[0.4, 1]} tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="loss" orientation="right" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Line yAxisId="auc" type="monotone" dataKey="auc" stroke="#22d3ee" strokeWidth={2} dot={false} />
                <Line yAxisId="loss" type="monotone" dataKey="loss" stroke="#f59e0b" strokeWidth={2} dot={false} />
                <ReferenceLine x={epochInt} stroke="#a855f7" strokeWidth={1.5} strokeDasharray="4 3" yAxisId="auc" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ChartCaption text={copy.chartCaptions.aucLoss} />
        </Panel>

        <Panel title={`ROC ${roc.auc.toFixed(3)} · ${copy.labels.scoreZones}`}>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histogram} margin={{ top: 6, right: 10, bottom: 14, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Bar dataKey="positive" stackId="a" fill="#22c55e" name="Positive" />
                <Bar dataKey="negative" stackId="a" fill="#ef4444" name="Negative" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ChartCaption text={copy.chartCaptions.scoreZones} />
        </Panel>

        <Panel title={copy.labels.calibrationTitle}>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={calibrationBins} margin={{ top: 6, right: 10, bottom: 14, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Bar dataKey="avgConfidence" fill="#22d3ee" name="Avg confidence" />
                <Bar dataKey="empiricalRate" fill="#f59e0b" name="Empirical rate" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ChartCaption text={copy.chartCaptions.calibration} />
        </Panel>
      </div>
    </div>
  )
}

function FailuresTab({ copy, falsePositives, falseNegatives, ambiguous, onFocus, compactNarrative }) {
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}
      >
        <Panel title={`${copy.labels.falsePositives} (${falsePositives.length})`}>
          <EdgeReasoningTable rows={falsePositives} onFocus={onFocus} emptyLabel={copy.empty.noFalsePositive} copy={copy} compactNarrative={compactNarrative} />
        </Panel>
        <Panel title={`${copy.labels.falseNegatives} (${falseNegatives.length})`}>
          <EdgeReasoningTable rows={falseNegatives} onFocus={onFocus} emptyLabel={copy.empty.noFalseNegative} copy={copy} compactNarrative={compactNarrative} />
        </Panel>
      </div>

      <Panel title={copy.labels.ambiguousZone}>
        <EdgeReasoningTable rows={ambiguous} onFocus={onFocus} emptyLabel={copy.empty.noBoundary} showNarrative copy={copy} compactNarrative={compactNarrative} />
      </Panel>
    </div>
  )
}

function StructureTab({ copy, edge, bridgeEdges, hubDriven, onFocus }) {
  if (!edge) {
    return <EmptyPanel label={copy.empty.chooseEdge} />
  }

  const cards = [
    [copy.labels.mutualNeighbors, edge.metrics.commonNeighbors],
    [copy.labels.shortestPath, edge.metrics.shortestPath ?? '>4'],
    [copy.labels.embeddingSim, edge.metrics.embeddingSimilarity.toFixed(2)],
    [copy.labels.structuralEquiv, edge.metrics.structuralEquivalence.toFixed(2)],
    [copy.labels.jaccard, edge.metrics.neighborJaccard.toFixed(2)],
    [copy.labels.bridgeSignal, edge.metrics.bridgeLike ? copy.labels.high : copy.labels.low],
  ]

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
      <Panel title={`${copy.labels.selectedEdge} · ${edge.source} - ${edge.target}`}>
        <div
          className="grid gap-2 p-3"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}
        >
          {cards.map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
              <div className="mt-1 text-sm font-semibold text-slate-100">{value}</div>
            </div>
          ))}
        </div>
        <MiniEvidenceSubgraph edge={edge} copy={copy} />
        <div className="px-3 pb-3 space-y-2">
          <p className="text-nano leading-relaxed text-slate-300">{edge.takeaway}</p>
          <EvidenceBullets bullets={edge.evidenceBullets} />
        </div>
      </Panel>

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}
      >
        <Panel title={copy.labels.bridgeCandidates}>
          <EdgeReasoningTable rows={bridgeEdges} onFocus={onFocus} emptyLabel={copy.empty.noBridge} compact copy={copy} />
        </Panel>
        <Panel title={copy.labels.hubAttraction}>
          <EdgeReasoningTable rows={hubDriven} onFocus={onFocus} emptyLabel={copy.empty.noHub} compact copy={copy} />
        </Panel>
      </div>
    </div>
  )
}

function ReasoningTab({ copy, edge, unstable, summary, paired, selectedModel, onFocus, compactNarrative }) {
  const scoreTimeline = edge?.stability?.scoreSeries || []
  const signatureCounts = useMemo(() => [
    { label: copy.labels.reasonOverlap, value: paired.filter((row) => Math.abs(row.score - 0.5) > 0.2).length, fill: '#22c55e' },
    { label: copy.labels.reasonBoundary, value: paired.filter((row) => Math.abs(row.score - 0.5) <= 0.1).length, fill: '#f59e0b' },
    { label: copy.labels.reasonLowConf, value: paired.filter((row) => row.score < 0.35).length, fill: '#ef4444' },
  ], [copy, paired])

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
      <Panel title={`${copy.labels.edgeStability} · ${edge ? `${edge.source}-${edge.target}` : selectedModel}`}>
        {edge ? (
          <div className="space-y-3 p-3">
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}
            >
              <Metric label={copy.labels.latestScore} value={edge.stability.latestScore.toFixed(3)} tone="cyan" />
              <Metric label={copy.labels.flips} value={edge.stability.flipCount} tone={edge.stability.flipCount > 0 ? 'red' : 'emerald'} />
              <Metric label={copy.labels.uncertainShare} value={`${(edge.stability.uncertainShare * 100).toFixed(0)}%`} tone="amber" />
              <Metric label={copy.labels.volatility} value={edge.stability.volatility.toFixed(3)} tone="slate" />
            </div>
            {(edge.warnings?.length > 0 || edge.confidenceStoryLabel) && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-nano leading-relaxed text-amber-50">
                <div className="font-semibold">{copy.labels.confidenceStory}: {edge.confidenceStoryLabel}</div>
                {edge.warnings?.length > 0 && (
                  <div className="mt-1 space-y-1">
                    {edge.warnings.map((warning) => (
                      <div key={warning}>• {warning}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={scoreTimeline} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
                  <XAxis dataKey="epoch" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 1]} tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                  <ReferenceLine y={0.5} stroke="#ef4444" strokeDasharray="4 3" />
                  {(edge.stability.crossingEpochs || []).map((epoch) => (
                    <ReferenceLine key={epoch} x={epoch} stroke="#f59e0b" strokeDasharray="2 2" />
                  ))}
                  <Line type="monotone" dataKey="score" stroke="#a855f7" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <ChartCaption text={copy.chartCaptions.stability} />
          </div>
        ) : (
          <div className="p-3 text-nano text-slate-500">{copy.empty.noFocusedEdge}</div>
        )}
      </Panel>

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}
      >
        <Panel title={copy.labels.dominantFailureMode}>
          <div className="p-3 space-y-2">
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2">
              <div className="text-sm font-semibold text-cyan-100">{summary?.dominant?.label || copy.dominantFailureModes.mixed}</div>
              <p className="mt-1 text-nano leading-relaxed text-slate-300">{summary?.recommendation || copy.recommendations.mixed}</p>
            </div>
            <div className="space-y-1">
              {(summary?.topModes || []).map((mode) => (
                <div key={mode.key} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-1.5">
                  <span className="text-nano text-slate-300">{mode.label}</span>
                  <span className="font-mono text-nano text-cyan-300">{mode.count}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title={copy.labels.reasoningMix}>
          <div className="h-36 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={signatureCounts} margin={{ top: 6, right: 10, bottom: 14, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Bar dataKey="value">
                  {signatureCounts.map((row) => (
                    <Cell key={row.label} fill={row.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ChartCaption text={copy.chartCaptions.reasoningMix} />
        </Panel>

        <Panel title={copy.labels.unstableEdges}>
          <EdgeReasoningTable rows={unstable} onFocus={onFocus} emptyLabel={copy.empty.noUnstable} showNarrative copy={copy} compactNarrative={compactNarrative} />
        </Panel>
      </div>
    </div>
  )
}

function EdgeReasoningTable({ rows, onFocus, emptyLabel, showNarrative = false, compact = false, compactNarrative = false, copy }) {
  const [expanded, setExpanded] = useState(null)
  if (!rows?.length) {
    return <div className="py-4 text-center text-nano text-slate-500">{emptyLabel}</div>
  }

  const sortedRows = [...rows].sort((a, b) =>
    (b.severityScore ?? 0) - (a.severityScore ?? 0)
    || (b.stability?.flipCount ?? 0) - (a.stability?.flipCount ?? 0)
    || (b.rootCauseTags?.length ?? 0) - (a.rootCauseTags?.length ?? 0)
    || Math.abs((b.score ?? 0) - 0.5) - Math.abs((a.score ?? 0) - 0.5))

  return (
    <div className="divide-y divide-slate-800/80">
      {sortedRows.map((row) => (
        <div
          key={`${row.idx}-${row.source}-${row.target}`}
          className="w-full px-2 py-2 text-left hover:bg-slate-800/40 transition-colors"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-mono text-micro text-slate-100">{row.source} - {row.target}</div>
              <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-slate-500">
                <span>{copy.labels.score} {Number(row.score ?? row.stability?.latestScore ?? 0).toFixed(3)}</span>
                {row.severityScore != null && <span>{copy.labels.severity} {row.severityScore.toFixed(1)}</span>}
                {row.dominantFailureModeLabel && <Tag key="dominant" label={row.dominantFailureModeLabel} />}
                {!compact && row.rootCauseTagLabels?.slice(0, 4).map((tag) => (
                  <Tag key={tag} label={tag} />
                ))}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setExpanded(expanded === row.idx ? null : row.idx)}
                className="font-mono text-nano text-slate-400 hover:text-slate-100"
              >
                {copy.labels.details}
              </button>
              <button
                type="button"
                onClick={() => onFocus?.(row.idx)}
                className="font-mono text-nano text-cyan-300"
              >
                {copy.labels.focus}
              </button>
            </div>
          </div>
          {row.takeaway && (
            <p className="mt-1 text-nano leading-relaxed text-slate-300">{row.takeaway}</p>
          )}
          {expanded === row.idx && row.evidenceBullets?.length > 0 && (
            <div className="mt-2">
              <EvidenceBullets bullets={row.evidenceBullets} />
            </div>
          )}
          {showNarrative && !compactNarrative && row.narrative && (
            <p className="mt-1 text-nano leading-relaxed text-slate-400">{row.narrative}</p>
          )}
        </div>
      ))}
    </div>
  )
}

function EvidenceBullets({ bullets }) {
  if (!bullets?.length) return null
  return (
    <div className="grid gap-1">
      {bullets.map((bullet) => (
        <div key={bullet.key} className="rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-200">{bullet.label}</span>
          <span className="ml-2 text-nano leading-relaxed text-slate-300">{bullet.value}</span>
        </div>
      ))}
    </div>
  )
}

function Tag({ label }) {
  return (
    <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-cyan-200">
      {label}
    </span>
  )
}

function MiniEvidenceSubgraph({ edge, copy }) {
  const width = 340
  const height = 140
  const source = { x: 58, y: 70 }
  const target = { x: 282, y: 70 }
  const mutual = (edge.metrics.commonNeighborIds || []).slice(0, 4)
  const pathNodes = (edge.metrics.shortestPathNodes || [])
    .filter((nodeId) => nodeId !== edge.source && nodeId !== edge.target)
    .slice(0, 3)

  return (
    <div className="px-3 pb-3">
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{copy.labels.structuralProof}</div>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[420px] overflow-visible">
          <line x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke="rgba(34,211,238,0.35)" strokeWidth="2" strokeDasharray="6 6" />
          <text x={(source.x + target.x) / 2} y="18" textAnchor="middle" fontSize="9" fill="#94a3b8">
            {edge.metrics.sameTopicCluster ? copy.labels.sameClusterCue : copy.labels.crossClusterCue} · {copy.labels.supportLevel}: {edge.supportLevelLabel}
          </text>
          {mutual.map((nodeId, idx) => {
            const x = 122 + idx * 34
            const y = 42 + (idx % 2) * 52
            return (
              <g key={`mutual-${nodeId}`}>
                <line x1={source.x} y1={source.y} x2={x} y2={y} stroke="rgba(251,191,36,0.65)" strokeWidth="1.8" />
                <line x1={target.x} y1={target.y} x2={x} y2={y} stroke="rgba(251,191,36,0.65)" strokeWidth="1.8" />
                <circle cx={x} cy={y} r="10" fill="#f59e0b" />
                <text x={x} y={y + 3} textAnchor="middle" fontSize="8" fill="#08111f">{nodeId}</text>
                <text x={x} y={y - 14} textAnchor="middle" fontSize="7" fill="#fbbf24">{copy.labels.mutualRole}</text>
              </g>
            )
          })}
          {pathNodes.map((nodeId, idx) => {
            const x = 118 + idx * 50
            const y = 110
            return (
              <g key={`path-${nodeId}`}>
                <circle cx={x} cy={y} r="9" fill="#a855f7" />
                <text x={x} y={y + 3} textAnchor="middle" fontSize="8" fill="#fff">{nodeId}</text>
                <text x={x} y={y + 20} textAnchor="middle" fontSize="7" fill="#c084fc">{copy.labels.pathRole}</text>
              </g>
            )
          })}
          <circle cx={source.x} cy={source.y} r="16" fill="#22d3ee" />
          <circle cx={target.x} cy={target.y} r="16" fill="#34d399" />
          <text x={source.x} y={source.y + 4} textAnchor="middle" fontSize="10" fill="#041018">{edge.source}</text>
          <text x={target.x} y={target.y + 4} textAnchor="middle" fontSize="10" fill="#041018">{edge.target}</text>
          <text x={source.x} y={source.y + 30} textAnchor="middle" fontSize="8" fill="#67e8f9">{copy.labels.sourceRole}</text>
          <text x={target.x} y={target.y + 30} textAnchor="middle" fontSize="8" fill="#86efac">{copy.labels.targetRole}</text>
        </svg>
        <div className="mt-2 space-y-1 text-nano leading-relaxed text-slate-400">
          {edge.visualProof?.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>
    </div>
  )
}

function ChartCaption({ text }) {
  return <p className="px-3 pb-3 text-[10px] leading-relaxed text-slate-500">{text}</p>
}

function Metric({ label, value, tone = 'slate' }) {
  const toneMap = {
    emerald: 'text-emerald-300',
    amber: 'text-amber-300',
    cyan: 'text-cyan-300',
    red: 'text-rose-300',
    slate: 'text-slate-200',
  }
  return (
    <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${toneMap[tone] || toneMap.slate}`}>{value}</div>
    </div>
  )
}

function Panel({ title, children }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <div className="border-b border-slate-800 px-3 py-2 text-[11px] font-semibold text-slate-200">{title}</div>
      {children}
    </div>
  )
}

function EmptyPanel({ label }) {
  return (
    <div className="flex-1 flex items-center justify-center text-micro text-slate-500">
      {label}
    </div>
  )
}

const tooltipStyle = {
  background: 'var(--c-bg-elev)',
  border: '1px solid var(--c-border)',
  color: 'var(--c-fg)',
  borderRadius: 8,
  fontSize: 10,
}

const tooltipItemStyle = { color: 'var(--c-fg)', fontSize: 10 }
const tooltipLabelStyle = { color: 'var(--c-fg)', fontSize: 10 }
