import React, { useMemo, useState } from 'react'
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts'
import usePlayerStore from '../../store/playerStore'
import useGNNStore from '../../store/useGNNStore'
import {
  pairScores,
  buildROCPoints,
  buildPRPoints,
  topKHardEdges,
  buildScoreHistogram,
  accuracyAtThreshold,
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
  const setFocusedEdge = useGNNStore((s) => s.setFocusedEdge)
  const [activeTab, setActiveTab] = useState('overview')

  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]

  const paired = useMemo(
    () => pairScores(snap?.edge_scores || [], taskData?.testEdges || []),
    [snap, taskData]
  )

  if (!snapshots.length) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 p-6 gap-2">
        <div className="text-3xl opacity-40 animate-pulse">&#8230;</div>
        <p className="text-micro text-center">Start training to see link prediction metrics</p>
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

      {activeTab === 'overview' && (
        <OverviewTab snap={snap} snapshots={snapshots} epochInt={epochInt} paired={paired} />
      )}
      {activeTab === 'curves' && <CurvesTab paired={paired} />}
      {activeTab === 'hard' && <HardEdgesTab paired={paired} onFocus={setFocusedEdge} />}
      {activeTab === 'diagnostics' && <DiagnosticsTab paired={paired} />}
    </div>
  )
}

// ── Overview ───────────────────────────────────────────────────────
function OverviewTab({ snap, snapshots, epochInt, paired }) {
  const aucHistory = useMemo(
    () => snapshots.slice(0, epochInt + 1).map((s, i) => ({
      epoch: i,
      auc: s.auc ?? 0.5,
      loss: s.train_loss ?? s.loss ?? null,
    })),
    [snapshots, epochInt]
  )

  const auc = snap?.auc ?? 0.5
  const acc = accuracyAtThreshold(paired, 0.5)
  const loss = snap?.train_loss ?? snap?.loss ?? null

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
      <div className="grid grid-cols-3 gap-2">
        <Metric label="AUC" value={auc.toFixed(3)} tone={auc > 0.85 ? 'emerald' : auc > 0.7 ? 'amber' : 'red'} />
        <Metric label="Acc@0.5" value={`${(acc * 100).toFixed(1)}%`} tone="cyan" />
        <Metric label="Loss" value={loss == null ? '—' : loss.toFixed(3)} tone="slate" />
      </div>

      <Panel title="AUC · Loss / Epoch">
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={aucHistory} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="epoch" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="auc" domain={[0.4, 1]} tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="loss" orientation="right" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip 
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 10 }} 
                itemStyle={{ color: '#e2e8f0' }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Line yAxisId="auc" type="monotone" dataKey="auc" stroke="#22d3ee" strokeWidth={2} dot={false} />
              <Line yAxisId="loss" type="monotone" dataKey="loss" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  )
}

// ── Curves ─────────────────────────────────────────────────────────
function CurvesTab({ paired }) {
  const { roc, pr } = useMemo(() => {
    return {
      roc: buildROCPoints(paired),
      pr: buildPRPoints(paired),
    }
  }, [paired])

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <Panel title={`ROC · AUC ${roc.auc.toFixed(3)}`}>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={roc.points} margin={{ top: 6, right: 10, bottom: 14, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="fpr" type="number" domain={[0, 1]} tick={{ fontSize: 9, fill: '#64748b' }} label={{ value: 'FPR', position: 'insideBottom', offset: -2, fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="tpr" type="number" domain={[0, 1]} tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 10 }} 
                  itemStyle={{ color: '#e2e8f0' }}
                  labelStyle={{ color: '#94a3b8' }}
                  formatter={(v) => v.toFixed(3)} 
                />
                <Line type="monotone" dataKey="tpr" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line data={[{ fpr: 0, tpr: 0 }, { fpr: 1, tpr: 1 }]} type="linear" dataKey="tpr" stroke="#475569" strokeWidth={1} strokeDasharray="3 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title={`Precision-Recall · AP ${pr.ap.toFixed(3)}`}>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={pr.points} margin={{ top: 6, right: 10, bottom: 14, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="recall" type="number" domain={[0, 1]} tick={{ fontSize: 9, fill: '#64748b' }} label={{ value: 'Recall', position: 'insideBottom', offset: -2, fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="precision" type="number" domain={[0, 1]} tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 10 }} 
                  itemStyle={{ color: '#e2e8f0' }}
                  labelStyle={{ color: '#94a3b8' }}
                  formatter={(v) => v.toFixed(3)} 
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

// ── Hard Edges ─────────────────────────────────────────────────────
function HardEdgesTab({ paired, onFocus }) {
  const { falsePositives, falseNegatives } = useMemo(() => topKHardEdges(paired, 5, 0.5), [paired])

  if (!paired.length) {
    return <div className="flex-1 flex items-center justify-center text-micro text-slate-500">No test edges available yet.</div>
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <Panel title={`False Positives (top ${falsePositives.length})`} tone="red">
          <HardTable rows={falsePositives} onFocus={onFocus} tone="red" />
        </Panel>
        <Panel title={`False Negatives (top ${falseNegatives.length})`} tone="amber">
          <HardTable rows={falseNegatives} onFocus={onFocus} tone="amber" />
        </Panel>
      </div>
      <p className="text-nano text-slate-500 px-1">
        Click a row to focus that edge on the canvas — the force graph will zoom and centre on
        it for ~1.5s so you can inspect the surrounding neighborhood.
      </p>
    </div>
  )
}

function HardTable({ rows, onFocus, tone }) {
  if (!rows.length) {
    return <div className="py-4 text-center text-nano text-slate-500">None at threshold 0.5</div>
  }
  const accent = tone === 'red' ? 'text-red-400' : 'text-amber-400'
  return (
    <div className="divide-y divide-slate-800/80">
      {rows.map((r) => (
        <button
          key={`${r.idx}-${r.source}-${r.target}`}
          onClick={() => onFocus?.(r.idx)}
          className="w-full flex items-center justify-between gap-2 px-2 py-1.5 hover:bg-slate-800/50 transition-colors text-left group"
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-nano text-slate-500">#{r.idx}</span>
            <span className="font-mono text-micro text-slate-200">{r.source} → {r.target}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`font-mono text-micro font-bold ${accent}`}>{r.score.toFixed(3)}</span>
            <span className="text-nano text-slate-500 group-hover:text-cyan-400 transition-colors">focus →</span>
          </div>
        </button>
      ))}
    </div>
  )
}

// ── Diagnostics ────────────────────────────────────────────────────
function DiagnosticsTab({ paired }) {
  const histogram = useMemo(() => buildScoreHistogram(paired, 10), [paired])
  const acc05 = accuracyAtThreshold(paired, 0.5)
  const acc07 = accuracyAtThreshold(paired, 0.7)
  const acc03 = accuracyAtThreshold(paired, 0.3)

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <Panel title="Score distribution">
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histogram} margin={{ top: 6, right: 10, bottom: 14, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip 
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 10 }} 
                itemStyle={{ color: '#e2e8f0' }}
                labelStyle={{ color: '#94a3b8' }}
              />
                <Legend wrapperStyle={{ fontSize: 9 }} />
                <Bar dataKey="positive" stackId="a" fill="#22c55e" name="Positive" />
                <Bar dataKey="negative" stackId="a" fill="#ef4444" name="Negative" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Accuracy @ threshold">
          <div className="p-3 space-y-2">
            <ThresholdRow label="0.3" acc={acc03} />
            <ThresholdRow label="0.5" acc={acc05} />
            <ThresholdRow label="0.7" acc={acc07} />
          </div>
        </Panel>
      </div>
      <p className="text-nano text-slate-500 px-1">
        An ideal separability: positives cluster on the right (score → 1), negatives on the left
        (score → 0). Heavy overlap around 0.5 indicates the model can&apos;t discriminate those
        pairs.
      </p>
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

// ── Primitives ─────────────────────────────────────────────────────
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
  const border = tone === 'red' ? 'border-red-500/30' : tone === 'amber' ? 'border-amber-500/30' : 'border-slate-800'
  return (
    <div className={`bg-slate-900/40 border ${border} rounded-lg overflow-hidden`}>
      <div className="px-2 py-1.5 border-b border-slate-800 bg-slate-900/60">
        <div className="text-nano uppercase tracking-ultra text-slate-400 font-bold">{title}</div>
      </div>
      <div>{children}</div>
    </div>
  )
}
