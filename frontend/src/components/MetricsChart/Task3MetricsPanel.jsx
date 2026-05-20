import React, { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import usePlayerStore from '../../store/playerStore'
import useGNNStore from '../../store/useGNNStore'
import {
  accuracyAtThreshold,
  buildPRPoints,
  buildROCPoints,
  buildScoreHistogram,
  pairScores,
  topKHardEdges,
} from '../../utils/task3Metrics'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'curves', label: 'Curves' },
  { id: 'hard', label: 'Hard Edges' },
  { id: 'diagnostics', label: 'Diagnostics' },
]

export default function Task3MetricsPanel() {
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const taskData = useGNNStore((s) => s.taskData)
  const selectedModel = useGNNStore((s) => s.selectedModel)
  const setFocusedEdge = useGNNStore((s) => s.setFocusedEdge)
  const [activeTab, setActiveTab] = useState('overview')

  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]
  const paired = useMemo(
    () => pairScores(snap?.edge_scores || [], taskData?.testEdges || []),
    [snap, taskData],
  )

  if (!snapshots.length) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 p-6 gap-2">
        <div className="text-3xl opacity-40 animate-pulse">...</div>
        <p className="text-micro text-center">Start training to see link prediction metrics.</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center gap-1 px-1">
        {TABS.map((tab) => (
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

      {activeTab === 'overview' && (
        <OverviewTab snap={snap} snapshots={snapshots} epochInt={epochInt} paired={paired} />
      )}
      {activeTab === 'curves' && <CurvesTab paired={paired} />}
      {activeTab === 'hard' && <HardEdgesTab paired={paired} onFocus={setFocusedEdge} />}
      {activeTab === 'diagnostics' && (
        <DiagnosticsTab
          paired={paired}
          snapshots={snapshots}
          epochInt={epochInt}
          selectedModel={selectedModel}
        />
      )}
    </div>
  )
}

function OverviewTab({ snap, snapshots, epochInt, paired }) {
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
  const averageScore = paired.length
    ? paired.reduce((sum, row) => sum + (row.score ?? 0), 0) / paired.length
    : 0

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
        <Metric label="AUC" value={auc.toFixed(3)} tone={auc > 0.85 ? 'emerald' : auc > 0.7 ? 'amber' : 'red'} />
        <Metric label="Acc @ 0.5" value={`${(acc * 100).toFixed(1)}%`} tone="cyan" />
        <Metric label="Loss" value={loss == null ? '-' : loss.toFixed(3)} tone="slate" />
        <Metric label="Mean Score" value={averageScore.toFixed(3)} tone="amber" />
      </div>

      <Panel title="AUC and Loss over Epochs">
        <div className="h-44 w-full">
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
      </Panel>

      <Panel title="Interpretation">
        <div className="p-3 text-nano text-slate-400 leading-relaxed">
          A healthy link predictor pushes positive pairs toward score 1 and negative pairs toward
          score 0. If AUC rises but hard-edge errors stay high, the model is learning a global
          ranking but still struggling around the decision boundary.
        </div>
      </Panel>
    </div>
  )
}

function CurvesTab({ paired }) {
  const { roc, pr } = useMemo(
    () => ({
      roc: buildROCPoints(paired),
      pr: buildPRPoints(paired),
    }),
    [paired],
  )

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
      <div
        className="grid grid-cols-1 xl:grid-cols-2 gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}
      >
        <Panel title={`ROC Curve · AUC ${roc.auc.toFixed(3)}`}>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={roc.points} margin={{ top: 6, right: 10, bottom: 14, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
                <XAxis
                  dataKey="fpr"
                  type="number"
                  domain={[0, 1]}
                  tick={{ fontSize: 9, fill: '#64748b' }}
                  label={{ value: 'FPR', position: 'insideBottom', offset: -2, fill: '#94a3b8', fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis dataKey="tpr" type="number" domain={[0, 1]} tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                  formatter={(value) => value.toFixed(3)}
                />
                <Line type="monotone" dataKey="tpr" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line
                  data={[{ fpr: 0, tpr: 0 }, { fpr: 1, tpr: 1 }]}
                  type="linear"
                  dataKey="tpr"
                  stroke="#475569"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title={`Precision-Recall · AP ${pr.ap.toFixed(3)}`}>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={pr.points} margin={{ top: 6, right: 10, bottom: 14, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
                <XAxis
                  dataKey="recall"
                  type="number"
                  domain={[0, 1]}
                  tick={{ fontSize: 9, fill: '#64748b' }}
                  label={{ value: 'Recall', position: 'insideBottom', offset: -2, fill: '#94a3b8', fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis dataKey="precision" type="number" domain={[0, 1]} tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                  formatter={(value) => value.toFixed(3)}
                />
                <Line type="monotone" dataKey="precision" stroke="#a855f7" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </div>
  )
}

function HardEdgesTab({ paired, onFocus }) {
  const { falsePositives, falseNegatives } = useMemo(() => topKHardEdges(paired, 5, 0.5), [paired])

  if (!paired.length) {
    return <div className="flex-1 flex items-center justify-center text-micro text-slate-500">No test edges available yet.</div>
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <Panel title={`False Positives (${falsePositives.length})`} tone="red">
          <HardTable rows={falsePositives} onFocus={onFocus} tone="red" />
        </Panel>
        <Panel title={`False Negatives (${falseNegatives.length})`} tone="amber">
          <HardTable rows={falseNegatives} onFocus={onFocus} tone="amber" />
        </Panel>
      </div>
      <p className="text-nano text-slate-500 px-1">
        Click a row to focus that edge on the canvas. The graph will zoom toward its local
        neighborhood so we can inspect why the pair is difficult.
      </p>
    </div>
  )
}

function DiagnosticsTab({ paired, snapshots, epochInt, selectedModel }) {
  const histogram = useMemo(() => buildScoreHistogram(paired, 10), [paired])
  const acc03 = accuracyAtThreshold(paired, 0.3)
  const acc05 = accuracyAtThreshold(paired, 0.5)
  const acc07 = accuracyAtThreshold(paired, 0.7)

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <Panel title="Score Distribution">
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histogram} margin={{ top: 6, right: 10, bottom: 14, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Legend wrapperStyle={{ fontSize: 9 }} />
                <Bar dataKey="positive" stackId="a" fill="#22c55e" name="Positive" />
                <Bar dataKey="negative" stackId="a" fill="#ef4444" name="Negative" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Accuracy at Threshold">
          <div className="p-3 space-y-2">
            <ThresholdRow label="0.3" acc={acc03} />
            <ThresholdRow label="0.5" acc={acc05} />
            <ThresholdRow label="0.7" acc={acc07} />
          </div>
        </Panel>
      </div>

      <SignatureSection snapshots={snapshots} epochInt={epochInt} selectedModel={selectedModel} />

      <p className="text-nano text-slate-500 px-1">
        A clean separation means positives cluster near score 1 and negatives near score 0. Heavy
        overlap around 0.5 is the first sign that the model still cannot discriminate ambiguous
        pairs.
      </p>
    </div>
  )
}

function HardTable({ rows, onFocus, tone }) {
  if (!rows.length) {
    return <div className="py-4 text-center text-nano text-slate-500">None at threshold 0.5.</div>
  }

  const accent = tone === 'red' ? 'text-red-400' : 'text-amber-400'
  return (
    <div className="divide-y divide-slate-800/80">
      {rows.map((row) => (
        <button
          key={`${row.idx}-${row.source}-${row.target}`}
          onClick={() => onFocus?.(row.idx)}
          className="w-full flex items-center justify-between gap-2 px-2 py-1.5 hover:bg-slate-800/50 transition-colors text-left group"
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-nano text-slate-500">#{row.idx}</span>
            <span className="font-mono text-micro text-slate-200">{row.source} - {row.target}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`font-mono text-micro font-bold ${accent}`}>{row.score.toFixed(3)}</span>
            <span className="text-nano text-slate-500 group-hover:text-cyan-400 transition-colors">focus</span>
          </div>
        </button>
      ))}
    </div>
  )
}

function ThresholdRow({ label, acc }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-micro text-slate-500 w-10">{label}</span>
      <div className="flex-1 h-2 rounded bg-slate-800 overflow-hidden">
        <div className="h-full bg-cyan-500 transition-all" style={{ width: `${acc * 100}%` }} />
      </div>
      <span className="font-mono text-micro text-cyan-300 w-12 text-right">{(acc * 100).toFixed(1)}%</span>
    </div>
  )
}

function SignatureSection({ snapshots, epochInt, selectedModel }) {
  const model = selectedModel || 'GCN'
  const snap = snapshots[epochInt]
  const history = useMemo(
    () =>
      snapshots.slice(0, epochInt + 1).map((entry, index) => ({
        epoch: index,
        dirichlet_energy: entry.dirichlet_energy ?? null,
        smoothness_separation: entry.smoothness_separation ?? null,
        score_variance: entry.score_variance ?? null,
      })),
    [epochInt, snapshots],
  )

  const attnHistogram = useMemo(() => {
    if (model !== 'GAT' || !snap?.attention_edges) return null
    const bins = Array.from({ length: 10 }, (_, index) => ({
      label: (index / 10).toFixed(1),
      count: 0,
    }))
    for (const edge of snap.attention_edges) {
      const bin = Math.min(9, Math.floor(edge.weight * 10))
      bins[bin].count += 1
    }
    return bins
  }, [model, snap?.attention_edges])

  const attnStats = useMemo(() => {
    if (model !== 'GAT' || !snap?.attention_edges?.length) return null
    const weights = snap.attention_edges.map((edge) => edge.weight)
    const average = weights.reduce((sum, value) => sum + value, 0) / weights.length
    return { average, max: Math.max(...weights), min: Math.min(...weights), count: weights.length }
  }, [model, snap?.attention_edges])

  return (
    <Panel title={`Model Signal · ${model}`}>
      <div className="p-3 space-y-3">
        {model === 'GAT' && (
          <>
            {attnStats ? (
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                <Metric label="Edges" value={attnStats.count} tone="amber" />
                <Metric label="Avg W" value={attnStats.average.toFixed(3)} tone="amber" />
                <Metric label="Max W" value={attnStats.max.toFixed(3)} tone="emerald" />
                <Metric label="Min W" value={attnStats.min.toFixed(3)} tone="slate" />
              </div>
            ) : (
              <div className="text-nano text-slate-500">No attention weights are available for this epoch.</div>
            )}
            {attnHistogram && (
              <div className="h-36 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={attnHistogram} margin={{ top: 6, right: 10, bottom: 14, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                    <Bar dataKey="count">
                      {attnHistogram.map((_, index) => (
                        <Cell key={index} fill={`rgba(251, 191, 36, ${0.3 + (index / 9) * 0.7})`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}

        {model === 'GCN' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <Panel title="Dirichlet Energy">
              <div className="h-32 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
                    <XAxis dataKey="epoch" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                    <Line type="monotone" dataKey="dirichlet_energy" stroke="#34d399" strokeWidth={2} dot={false} connectNulls />
                    <ReferenceLine x={epochInt} stroke="#a855f7" strokeWidth={1.5} strokeDasharray="4 3" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Smoothness Separation">
              <div className="h-32 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
                    <XAxis dataKey="epoch" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                    <Line type="monotone" dataKey="smoothness_separation" stroke="#22d3ee" strokeWidth={2} dot={false} connectNulls />
                    <ReferenceLine x={epochInt} stroke="#a855f7" strokeWidth={1.5} strokeDasharray="4 3" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>
        )}

        {model === 'SAGE' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Score Variance" value={snap?.score_variance?.toFixed(4) ?? '-'} tone="cyan" />
              <Metric
                label="Stability"
                value={
                  snap?.score_variance == null
                    ? '-'
                    : snap.score_variance < 0.01
                      ? 'High'
                      : snap.score_variance < 0.05
                        ? 'Medium'
                        : 'Low'
                }
                tone={
                  snap?.score_variance == null
                    ? 'slate'
                    : snap.score_variance < 0.01
                      ? 'emerald'
                      : snap.score_variance < 0.05
                        ? 'amber'
                        : 'red'
                }
              />
            </div>
            <div className="h-32 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
                  <XAxis dataKey="epoch" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                  <Line type="monotone" dataKey="score_variance" stroke="#22d3ee" strokeWidth={2} dot={false} connectNulls />
                  <ReferenceLine x={epochInt} stroke="#a855f7" strokeWidth={1.5} strokeDasharray="4 3" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </Panel>
  )
}

function Metric({ label, value, tone = 'slate' }) {
  const colors = {
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
    cyan: 'text-cyan-300',
    slate: 'text-slate-200',
  }
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2">
      <div className="text-nano uppercase tracking-ultra text-slate-500 font-bold">{label}</div>
      <div className={`font-mono text-lg font-black leading-tight ${colors[tone]}`}>{value}</div>
    </div>
  )
}

function Panel({ title, tone = 'slate', children }) {
  const border =
    tone === 'red'
      ? 'border-red-500/30'
      : tone === 'amber'
        ? 'border-amber-500/30'
        : 'border-slate-800'
  return (
    <div className={`bg-slate-900/40 border ${border} rounded-lg overflow-hidden`}>
      <div className="px-2 py-1.5 border-b border-slate-800 bg-slate-900/60">
        <div className="text-nano uppercase tracking-ultra text-slate-400 font-bold">{title}</div>
      </div>
      <div>{children}</div>
    </div>
  )
}

const tooltipStyle = { background: 'var(--c-bg-elev)', border: '1px solid var(--c-border)', color: 'var(--c-fg)', fontSize: 10 }
const tooltipItemStyle = { color: '#e2e8f0' }
const tooltipLabelStyle = { color: '#94a3b8' }
