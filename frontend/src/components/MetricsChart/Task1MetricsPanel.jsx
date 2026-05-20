import React, { useEffect, useMemo, useState } from 'react'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'
import usePlayerStore from '../../store/playerStore'
import useGNNStore from '../../store/useGNNStore'
import { apiJson, normalizeCollectionPayload } from '../../utils/api'
import {
  buildConfusionMatrixK,
  buildClassDistribution,
  extractDirichletSeries,
  computeHomophilyScatter,
  buildTask1ModelSignature,
  assessTask1Reliability,
} from '../../utils/task1Metrics'
import LatentSpaceVisualization from '../ResearchAnalyst/LatentSpaceVisualization'
import Panel from '../primitives/Panel'

const CLASS_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#06b6d4', '#ec4899']
const MODEL_COMPARE_COLORS = {
  GCN: '#34d399',
  GAT: '#fbbf24',
  SAGE: '#22d3ee',
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'confusion', label: 'Confusion' },
  { id: 'homophily', label: 'Homophily' },
  { id: 'insights', label: 'Insights' },
]

export default function Task1MetricsPanel() {
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const graphData = useGNNStore((s) => s.graphData)
  const setSelectedNode = useGNNStore((s) => s.setSelectedNode)
  const selectedNodeId = useGNNStore((s) => s.selectedNodeId)
  const [tab, setTab] = useState('overview')

  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]

  if (!snapshots.length) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 p-6 text-slate-500">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-500/15 bg-cyan-500/8 text-base font-semibold text-cyan-300">
          T1
        </div>
        <p className="text-sm font-semibold text-slate-300">Task 1 metrics will appear here</p>
        <p className="max-w-xs text-center text-micro text-slate-500">
          Start or replay a training run to inspect node classification quality, confusion, and latent separation.
        </p>
      </div>
    )
  }

  return (
    <Panel
      title="Task 1 Lens"
      subtitle="Node classification diagnostics across accuracy, confusion, neighborhood fit, and embedding structure."
      padding="none"
      className="border-slate-800/70 bg-slate-950/55 shadow-[0_12px_32px_rgba(15,23,42,0.35)]"
      actions={(
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="rounded-full border border-cyan-500/20 bg-cyan-500/8 px-2.5 py-1 text-[11px] font-semibold text-cyan-300">
            Epoch {epochInt}
          </div>
          <div className="rounded-full border border-slate-700/70 bg-slate-900/70 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
            {snapshots.length} snapshots
          </div>
        </div>
      )}
      footer={(
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>Polished for readability only, without adding heavier charts or runtime effects.</span>
          <span className="rounded-full border border-slate-700/70 bg-slate-900/70 px-2.5 py-1 font-semibold text-slate-300">
            Active view: {TABS.find((t) => t.id === tab)?.label}
          </span>
        </div>
      )}
    >
      <div className="flex h-full flex-col gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-full border px-3 py-1.5 text-nano font-bold uppercase tracking-ultra transition-colors ${
                tab === t.id
                  ? 'border-cyan-400/35 bg-cyan-500/12 text-cyan-300 shadow-[0_0_0_1px_rgba(34,211,238,0.08)]'
                  : 'border-slate-800/70 bg-slate-900/55 text-slate-500 hover:border-slate-700 hover:text-slate-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1">
          {tab === 'overview' && <OverviewTab snapshots={snapshots} epochInt={epochInt} snap={snap} graphData={graphData} />}
          {tab === 'confusion' && (
            <ConfusionTab snap={snap} graphData={graphData} onPick={setSelectedNode} snapshots={snapshots} epochInt={epochInt} />
          )}
          {tab === 'homophily' && <HomophilyTab snap={snap} onPick={setSelectedNode} />}
          {tab === 'insights' && (
            <InsightsTab
              snap={snap}
              snapshots={snapshots}
              graphData={graphData}
              selectedNodeId={selectedNodeId}
            />
          )}
        </div>
      </div>
    </Panel>
  )
}

function OverviewTab({ snapshots, epochInt, snap, graphData }) {
  const selectedModel = useGNNStore((s) => s.selectedModel)
  const trainMask = useGNNStore((s) => s.trainMask)
  const taskData = useGNNStore((s) => s.taskData)
  const datasetName = useGNNStore((s) => s.datasetName || s.activeDatasetVersionName || s.hyperparams?.dataset)
  const series = useMemo(
    () => snapshots.slice(0, epochInt + 1).map((s, i) => ({
      epoch: i,
      train_loss: s.train_loss ?? 0,
      val_loss: s.val_loss ?? 0,
      val_acc: (s.val_acc ?? 0) * 100,
    })),
    [snapshots, epochInt]
  )

  const { perClass } = useMemo(() => {
    const gt = (graphData?.nodes || []).map((n) => n.groundTruth)
    const preds = snap?.node_predictions || []
    return buildConfusionMatrixK(gt, preds)
  }, [snap, graphData])

  const macroF1 = perClass.length ? perClass.reduce((a, p) => a + p.f1, 0) / perClass.length : 0
  const valAcc = snap?.val_acc ?? 0
  const trainLoss = snap?.train_loss ?? 0
  const signature = useMemo(
    () => buildTask1ModelSignature({ snapshot: snap, snapshots, model: selectedModel }),
    [selectedModel, snap, snapshots],
  )
  const reliability = useMemo(
    () => assessTask1Reliability({ snapshot: snap, snapshots, graphData, trainMask, taskData, datasetName }),
    [datasetName, graphData, snap, snapshots, taskData, trainMask],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
      <ReliabilityCard reliability={reliability} />

      <div className="grid grid-cols-3 gap-2">
        <StatCell label="Val Acc" value={valAcc * 100} digits={1} suffix="%" tone={valAcc > 0.85 ? 'good' : valAcc > 0.6 ? 'warn' : 'bad'} />
        <StatCell label="Macro F1" value={macroF1 * 100} digits={1} suffix="%" tone={macroF1 > 0.8 ? 'good' : macroF1 > 0.5 ? 'warn' : 'bad'} />
        <StatCell label="Train Loss" value={trainLoss} digits={3} tone={trainLoss < 0.2 ? 'good' : trainLoss < 0.6 ? 'warn' : 'bad'} />
      </div>

      <LiveSignatureCard model={selectedModel} signature={signature} />

      <div className="rounded-xl border border-slate-800/60 bg-slate-950/45 p-3">
        <div className="mb-2">
          <span className="block text-nano font-bold uppercase tracking-ultra text-slate-500">Loss and validation accuracy</span>
          <p className="mt-1 text-[11px] text-slate-400">
            Read the slope first: rising accuracy with falling loss means the run is still healthy.
          </p>
        </div>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="epoch" tick={{ fill: '#94a3b8', fontSize: 9 }} />
              <YAxis yAxisId="loss" tick={{ fill: '#94a3b8', fontSize: 9 }} domain={[0, 'auto']} />
              <YAxis yAxisId="acc" orientation="right" tick={{ fill: '#94a3b8', fontSize: 9 }} domain={[0, 100]} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 10 }}
                itemStyle={{ color: '#e2e8f0' }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Line yAxisId="loss" type="monotone" dataKey="train_loss" stroke="#f97316" strokeWidth={2} dot={false} name="Train Loss" />
              <Line yAxisId="loss" type="monotone" dataKey="val_loss" stroke="#ef4444" strokeWidth={2} dot={false} name="Val Loss" />
              <Line yAxisId="acc" type="monotone" dataKey="val_acc" stroke="#22c55e" strokeWidth={2} dot={false} name="Val Acc (%)" />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <Task1ModelCompare currentSnapshot={snap} />
    </div>
  )
}

function ReliabilityCard({ reliability }) {
  if (!reliability) return null

  const toneClass = reliability.status === 'danger'
    ? 'border-red-500/25 bg-red-500/6'
    : reliability.status === 'warn'
      ? 'border-amber-500/25 bg-amber-500/6'
      : 'border-emerald-500/20 bg-emerald-500/6'

  const toneText = reliability.status === 'danger'
    ? 'text-red-300'
    : reliability.status === 'warn'
      ? 'text-amber-300'
      : 'text-emerald-300'

  const split = reliability.split || {}
  const supportExactMasks = split.hasExactEvalMasks
  const splitColumns = supportExactMasks
    ? [
      { key: 'total', label: 'Total', values: split.classTotals || [] },
      { key: 'train', label: 'Train', values: split.trainClassCounts || [] },
      { key: 'val', label: 'Val', values: split.valClassCounts || [] },
      { key: 'test', label: 'Test', values: split.testClassCounts || [] },
    ]
    : [
      { key: 'total', label: 'Total', values: split.classTotals || [] },
      { key: 'train', label: 'Train', values: split.trainClassCounts || [] },
    ]
  const splitGuidance = split.totalNodes <= 120
    ? 'This graph is better for insight and explainability than for claiming stable benchmark performance from a single run.'
    : 'This dataset is large enough to use as a stronger correctness benchmark, but class balance and split quality still shape the story.'

  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-nano font-bold uppercase tracking-ultra text-slate-500">Reliability guardrail</div>
          <div className={`mt-1 text-sm font-semibold ${toneText}`}>
            {reliability.status === 'danger' ? 'Interpret carefully before trusting a single run' : reliability.status === 'warn' ? 'Metrics are usable, but context matters' : 'Metrics look reasonably stable for this snapshot'}
          </div>
        </div>
        <div className="rounded-full border border-slate-700/70 bg-slate-950/60 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
          Train-val gap {(reliability.trainValGap * 100).toFixed(1)} pts
        </div>
      </div>

      <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <GuardrailStat label="Nodes" value={`${split.totalNodes || 0}`} />
        <GuardrailStat label="Train split" value={`${split.trainCount || 0}`} />
        <GuardrailStat label={supportExactMasks ? 'Val split' : 'Holdout nodes'} value={`${supportExactMasks ? (split.valCount || 0) : (split.holdoutCount || 0)}`} />
        <GuardrailStat label={supportExactMasks ? 'Test split' : 'Classes'} value={`${supportExactMasks ? (split.testCount || 0) : (split.numClasses || 0)}`} />
        <GuardrailStat label="Mean confidence" value={`${(reliability.meanConfidence * 100).toFixed(0)}%`} />
        <GuardrailStat label="Boundary acc" value={`${(reliability.boundary.boundaryAccuracy * 100).toFixed(0)}%`} />
      </div>

      {!supportExactMasks && (
        <div className="mt-2 text-[11px] leading-relaxed text-slate-400">
          Exact validation/test masks are not available in this payload yet, so the card falls back to train vs holdout reporting.
        </div>
      )}

      <div className="mt-3 rounded-lg border border-slate-800/70 bg-slate-950/45 p-3">
        <div className="text-[11px] font-semibold text-slate-200">Per-class split context</div>
        <div className="mt-1 text-[11px] leading-relaxed text-slate-400">
          Read this table before over-interpreting a noisy metric. Tiny class support in `val/test` can make accuracy and Macro F1 jump around across runs.
        </div>
        <div className="mt-3 overflow-auto">
          <table className="min-w-full text-[11px]">
            <thead>
              <tr className="border-b border-slate-800/70 text-slate-500">
                <th className="py-1 pr-4 text-left font-semibold">Class</th>
                {splitColumns.map((column) => (
                  <th key={column.key} className="py-1 text-right font-semibold">{column.label}</th>
                ))}
                {supportExactMasks && <th className="py-1 pl-3 text-right font-semibold">Note</th>}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: split.numClasses || 0 }, (_, classIdx) => {
                const evalSupport = supportExactMasks
                  ? (split.valClassCounts?.[classIdx] || 0) + (split.testClassCounts?.[classIdx] || 0)
                  : null
                return (
                  <tr key={classIdx} className="border-b border-slate-900/80 last:border-b-0">
                    <td className="py-1.5 pr-4 font-semibold" style={{ color: CLASS_COLORS[classIdx % CLASS_COLORS.length] }}>
                      C{classIdx}
                    </td>
                    {splitColumns.map((column) => (
                      <td key={column.key} className="py-1.5 text-right text-slate-200">
                        {column.values?.[classIdx] ?? 0}
                      </td>
                    ))}
                    {supportExactMasks && (
                      <td className="py-1.5 pl-3 text-right text-[10px] text-slate-500">
                        {evalSupport !== null && evalSupport < 3 ? 'thin eval support' : ''}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-slate-800/70 bg-slate-950/45 px-3 py-2 text-[11px] leading-relaxed text-slate-400">
        <span className="font-semibold text-slate-200">Reading guide: </span>
        {splitGuidance}
      </div>

      {!!reliability.warnings.length && (
        <div className="mt-3 space-y-2">
          {reliability.warnings.map((warning) => (
            <div key={warning.code} className="rounded-lg border border-slate-800/70 bg-slate-950/45 px-3 py-2">
              <div className={`text-[11px] font-semibold ${warning.level === 'danger' ? 'text-red-300' : 'text-amber-300'}`}>
                {warning.title}
              </div>
              <div className="mt-1 text-[11px] leading-relaxed text-slate-400">
                {warning.detail}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LiveSignatureCard({ model, signature }) {
  if (!signature) return null
  return (
    <div className="rounded-lg border border-slate-800/60 bg-slate-900/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-nano font-bold uppercase tracking-ultra text-slate-500">Model Lens</div>
          <div className="text-sm font-semibold text-slate-100">{model} | {signature.headline}</div>
        </div>
        <div
          className="rounded-full border px-2.5 py-1 text-nano font-bold uppercase tracking-wide"
          style={{
            borderColor: `${MODEL_COMPARE_COLORS[model] || '#64748b'}55`,
            color: MODEL_COMPARE_COLORS[model] || '#cbd5e1',
            background: `${MODEL_COMPARE_COLORS[model] || '#64748b'}12`,
          }}
        >
          live
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <CompareInsight title={signature.primaryLabel} value={signature.primaryValue} />
        <CompareInsight title={signature.secondaryLabel} value={signature.secondaryValue} />
        <CompareInsight title={signature.tertiaryLabel} value={signature.tertiaryValue} />
      </div>

      <div className="mt-3 text-nano leading-relaxed text-slate-300">
        {signature.summary}
      </div>
    </div>
  )
}

function ConfusionTab({ snap, graphData, onPick, snapshots, epochInt }) {
  const [sel, setSel] = useState(null)

  const { matrix, numClasses, perClass } = useMemo(() => {
    const gt = (graphData?.nodes || []).map((n) => n.groundTruth)
    const preds = snap?.node_predictions || []
    return buildConfusionMatrixK(gt, preds)
  }, [snap, graphData])

  const handleCellClick = (t, p, count) => {
    if (!count) return
    const same = sel && sel.t === t && sel.p === p
    if (same) {
      setSel(null)
      onPick(null)
      return
    }
    setSel({ t, p })
    const preds = snapshots[epochInt]?.node_predictions
    if (!preds || !graphData?.nodes) return
    for (let i = 0; i < graphData.nodes.length; i++) {
      if (graphData.nodes[i].groundTruth === t && preds[i] === p) {
        onPick(graphData.nodes[i].id)
        return
      }
    }
  }

  if (!matrix) return <div className="flex flex-1 items-center justify-center text-micro text-slate-500">No predictions yet</div>

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div className="rounded-lg border border-slate-800/60 bg-slate-900/40 p-2">
          <div className="mb-1 text-nano font-bold uppercase tracking-ultra text-slate-500">
            {numClasses}x{numClasses} matrix | diagonal = green, off-diagonal = red
          </div>
          <div className="overflow-auto">
            <table className="text-nano font-mono">
              <thead>
                <tr>
                  <th className="w-6" />
                  {Array.from({ length: numClasses }, (_, j) => (
                    <th key={j} className="h-5 w-7 text-center" style={{ color: CLASS_COLORS[j % CLASS_COLORS.length] }}>
                      {j}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.map((row, t) => {
                  const rowMax = Math.max(1, ...row)
                  return (
                    <tr key={t}>
                      <td className="h-6 w-6 text-center" style={{ color: CLASS_COLORS[t % CLASS_COLORS.length] }}>
                        {t}
                      </td>
                      {row.map((val, p) => {
                        const isDiag = t === p
                        const intensity = val / rowMax
                        const bg = val === 0 ? 'rgba(15,23,42,0.4)'
                          : isDiag ? `rgba(34,197,94,${Math.max(0.15, intensity * 0.85)})`
                            : `rgba(239,68,68,${Math.max(0.12, intensity * 0.75)})`
                        const isSel = sel && sel.t === t && sel.p === p
                        return (
                          <td key={p}>
                            <button
                              disabled={val === 0}
                              onClick={() => handleCellClick(t, p, val)}
                              title={`True ${t} -> Pred ${p}: ${val}`}
                              className={`h-6 w-7 rounded-sm text-nano font-bold transition-transform ${
                                val ? 'cursor-pointer hover:scale-110' : 'cursor-default'
                              } ${isSel ? 'ring-1 ring-cyan-400' : ''}`}
                              style={{ backgroundColor: bg, color: val ? '#f8fafc' : '#475569' }}
                            >
                              {val}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800/60 bg-slate-900/40 p-2">
          <div className="mb-1 text-nano font-bold uppercase tracking-ultra text-slate-500">Per-class | Precision / Recall / F1</div>
          <table className="w-full text-nano font-mono">
            <thead>
              <tr className="text-slate-500">
                <th className="py-1 text-left">#</th>
                <th className="text-right">Prec</th>
                <th className="text-right">Recall</th>
                <th className="text-right">F1</th>
                <th className="text-right">Support</th>
              </tr>
            </thead>
            <tbody>
              {perClass.map((pc, c) => (
                <tr key={c} className="border-t border-slate-800/40">
                  <td className="py-1" style={{ color: CLASS_COLORS[c % CLASS_COLORS.length] }}>C{c}</td>
                  <td className="text-right text-slate-200">{(pc.precision * 100).toFixed(1)}%</td>
                  <td className="text-right text-slate-200">{(pc.recall * 100).toFixed(1)}%</td>
                  <td className="text-right text-slate-200">{(pc.f1 * 100).toFixed(1)}%</td>
                  <td className="text-right text-slate-500">{pc.support}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function HomophilyTab({ snap, onPick }) {
  const points = useMemo(() => computeHomophilyScatter(snap), [snap])

  if (!points.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 text-micro text-slate-500">
        <p>No homophily data yet.</p>
        <p className="text-nano">Backend needs to emit `majority_ratio` and `node_correctness`.</p>
      </div>
    )
  }

  const correctPts = points.filter((p) => p.correct === 1)
  const wrongPts = points.filter((p) => p.correct === 0)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
      <div className="text-nano font-bold uppercase tracking-ultra text-slate-500">
        Neighbor majority ratio vs node correctness | click a dot to focus the node on canvas
      </div>
      <div className="flex-1 min-h-[200px] rounded-xl border border-slate-800/60 bg-slate-950/45 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="ratio"
              type="number"
              domain={[0, 1]}
              tick={{ fill: '#94a3b8', fontSize: 9 }}
              label={{ value: 'majority_ratio', fill: '#94a3b8', fontSize: 9, dy: 14 }}
            />
            <YAxis
              dataKey="correct"
              type="number"
              domain={[-0.1, 1.1]}
              ticks={[0, 1]}
              tick={{ fill: '#94a3b8', fontSize: 9 }}
              label={{ value: 'correct', fill: '#94a3b8', fontSize: 9, angle: -90, dx: -8 }}
            />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 10 }}
              itemStyle={{ color: '#e2e8f0' }}
              labelStyle={{ color: '#94a3b8' }}
            />
            <ReferenceLine x={0.5} stroke="#f59e0b" strokeDasharray="3 3" strokeOpacity={0.5} />
            <Scatter name="Correct" data={correctPts} fill="#22c55e" onClick={(d) => onPick(d.id)} />
            <Scatter name="Wrong" data={wrongPts} fill="#ef4444" onClick={(d) => onPick(d.id)} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="text-nano text-slate-500">
        Heterophilic mistakes usually cluster at low ratio with incorrect predictions, while clean homophilic wins sit near the upper-right corner.
      </div>
    </div>
  )
}

function InsightsTab({ snap, snapshots, graphData, selectedNodeId }) {
  return (
    <div className="custom-scrollbar space-y-2 overflow-auto">
      <DiagnosticsTab snap={snap} snapshots={snapshots} graphData={graphData} />
      <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <div className="text-nano font-bold uppercase tracking-ultra text-slate-500">Latent space</div>
            <div className="text-[11px] text-slate-400">Use this view to sanity-check class separation and outliers.</div>
          </div>
        </div>
        <div className="min-h-[260px]">
          <LatentSpaceVisualization snapshot={snap} graphData={graphData} selectedNodeId={selectedNodeId} />
        </div>
      </div>
    </div>
  )
}

function DiagnosticsTab({ snap, snapshots, graphData }) {
  const energySeries = useMemo(() => extractDirichletSeries(snapshots), [snapshots])
  const currentEnergy = snap?.dirichlet_energy ?? 0
  const initialEnergy = energySeries[0]?.energy ?? 0
  const isOversmooth = initialEnergy > 0 && currentEnergy < initialEnergy * 0.05

  const dist = useMemo(() => {
    const gt = (graphData?.nodes || []).map((n) => n.groundTruth)
    const preds = snap?.node_predictions || []
    return buildClassDistribution(gt, preds)
  }, [snap, graphData])

  const distData = useMemo(
    () => dist.gtCounts.map((g, i) => ({ cls: `C${i}`, gt: g, pred: dist.predCounts[i] })),
    [dist]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div className="rounded-lg border border-slate-800/60 bg-slate-900/40 p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-nano font-bold uppercase tracking-ultra text-slate-500">Dirichlet Energy (over-smoothing)</span>
            {isOversmooth && <span className="text-nano font-bold text-red-400">Collapsed</span>}
          </div>
          <div className="h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={energySeries}>
                <defs>
                  <linearGradient id="t1energyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="epoch" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} domain={[0, 1]} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 10 }}
                  itemStyle={{ color: '#e2e8f0' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Area type="monotone" dataKey="energy" stroke="#a855f7" fill="url(#t1energyGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 text-nano text-slate-500">
            Current {currentEnergy.toFixed(3)} | Initial {initialEnergy.toFixed(3)}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800/60 bg-slate-900/40 p-2">
          <div className="mb-1 text-nano font-bold uppercase tracking-ultra text-slate-500">
            Class distribution | GT vs predicted
          </div>
          <div className="h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="cls" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 10 }}
                  itemStyle={{ color: '#e2e8f0' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Bar dataKey="gt" name="Ground Truth" fill="#06b6d4" />
                <Bar dataKey="pred" name="Predicted" fill="#f97316" />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

function Task1ModelCompare({ currentSnapshot }) {
  const activeProjectId = useGNNStore((s) => s.activeProjectId)
  const activeDatasetVersionId = useGNNStore((s) => s.activeDatasetVersionId)
  const activeDatasetVersionName = useGNNStore((s) => s.activeDatasetVersionName)
  const selectedModel = useGNNStore((s) => s.selectedModel)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [compareResults, setCompareResults] = useState([])
  const [representatives, setRepresentatives] = useState([])

  useEffect(() => {
    let cancelled = false

    async function loadCompare() {
      if (!activeProjectId || !activeDatasetVersionId) {
        setCompareResults([])
        setRepresentatives([])
        setError(null)
        return
      }

      setLoading(true)
      setError(null)
      try {
        const payload = await apiJson(
          `/experiments?task_type=1&project_id=${activeProjectId}&dataset_version_id=${activeDatasetVersionId}&status=completed&limit=50`,
        )
        if (cancelled) return

        const items = normalizeCollectionPayload(payload).items || []
        const reps = pickRepresentativeRuns(items)
        setRepresentatives(reps)

        if (reps.length < 2) {
          setCompareResults([])
          return
        }

        const comparePayload = await apiJson('/experiments/compare', {
          method: 'POST',
          body: JSON.stringify({ experiment_ids: reps.map((item) => item.id) }),
        })
        if (cancelled) return
        setCompareResults(comparePayload.results || [])
      } catch (err) {
        if (!cancelled) {
          setError(err)
          setCompareResults([])
          setRepresentatives([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadCompare()
    return () => { cancelled = true }
  }, [activeDatasetVersionId, activeProjectId])

  const series = useMemo(() => buildCompareSeries(compareResults), [compareResults])
  const analysis = useMemo(() => analyzeTask1Compare(compareResults), [compareResults])

  return (
    <div className="space-y-3 rounded-lg border border-slate-800/60 bg-slate-900/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-nano font-bold uppercase tracking-ultra text-slate-500">Model Compare</div>
          <div className="text-sm font-semibold text-slate-100">Task 1 | GCN vs GAT vs GraphSAGE</div>
          <div className="mt-1 text-nano text-slate-500">
            Comparing saved completed runs for {activeDatasetVersionName || `dataset version #${activeDatasetVersionId || '-'}`}.
          </div>
        </div>
        <div className="rounded-full border border-slate-700 bg-slate-950/60 px-2.5 py-1 text-nano font-bold uppercase tracking-wide text-slate-300">
          Live model: {selectedModel}
        </div>
      </div>

      {loading ? (
        <div className="py-6 text-center text-micro text-slate-500">Analyzing saved runs...</div>
      ) : error ? (
        <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-nano text-red-300">
          Could not load model comparison right now.
        </div>
      ) : representatives.length < 2 ? (
        <div className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-3 text-nano leading-relaxed text-slate-400">
          Save at least two completed Task 1 runs on this same dataset version to unlock side-by-side
          comparison. Right now we only have {representatives.length} comparable run{representatives.length === 1 ? '' : 's'}.
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {compareResults.map((item) => {
              const exp = item.experiment || {}
              const isCurrentModel = exp.model_type === selectedModel
              return (
                <div
                  key={exp.id}
                  className={`rounded-lg border px-3 py-2 ${
                    isCurrentModel ? 'border-indigo-400/40 bg-indigo-500/10' : 'border-slate-800 bg-slate-950/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-xs font-black uppercase tracking-widest"
                      style={{ color: MODEL_COMPARE_COLORS[exp.model_type] || '#e2e8f0' }}
                    >
                      {exp.model_type}
                    </span>
                    <span className="text-nano text-slate-500">best epoch {exp.best_epoch ?? 0}</span>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between gap-2">
                    <span className="text-[11px] uppercase tracking-wide text-slate-500">Acc</span>
                    <span className="font-mono text-base font-black text-slate-100">
                      {((exp.accuracy || 0) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    <span className="text-[11px] uppercase tracking-wide text-slate-500">Loss</span>
                    <span className="font-mono text-sm font-bold text-slate-300">
                      {(exp.loss || 0).toFixed(3)}
                    </span>
                  </div>
                </div>
              )
            })}

            <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2">
              <div className="text-xs font-black uppercase tracking-widest text-cyan-300">Live Snapshot</div>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <span className="text-[11px] uppercase tracking-wide text-slate-500">Val Acc</span>
                <span className="font-mono text-base font-black text-slate-100">
                  {((currentSnapshot?.val_acc || 0) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-[11px] uppercase tracking-wide text-slate-500">Train Loss</span>
                <span className="font-mono text-sm font-bold text-slate-300">
                  {(currentSnapshot?.train_loss || 0).toFixed(3)}
                </span>
              </div>
            </div>
          </div>

          <div className="h-[200px] rounded-xl border border-slate-800/60 bg-slate-950/45 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="epoch" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                <YAxis domain={[0, 1]} tick={{ fill: '#94a3b8', fontSize: 9 }} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 10 }}
                  itemStyle={{ color: '#e2e8f0' }}
                  labelStyle={{ color: '#94a3b8' }}
                  formatter={(value) => [`${((value || 0) * 100).toFixed(1)}%`, 'Primary score']}
                />
                {compareResults.map((item) => {
                  const model = item.experiment?.model_type || 'model'
                  return (
                    <Line
                      key={item.experiment?.id}
                      type="monotone"
                      dataKey={`run_${item.experiment?.id}`}
                      stroke={MODEL_COMPARE_COLORS[model] || '#cbd5e1'}
                      strokeWidth={2}
                      dot={false}
                      name={model}
                    />
                  )
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid gap-2 lg:grid-cols-3">
            <CompareInsight title="Best accuracy" value={analysis.bestAccuracy} />
            <CompareInsight title="Lowest loss" value={analysis.lowestLoss} />
            <CompareInsight title="Fastest convergence" value={analysis.fastestConvergence} />
          </div>

          <div className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-3 text-nano leading-relaxed text-slate-300">
            <span className="font-bold text-slate-100">Analysis: </span>
            {analysis.summary}
          </div>
        </>
      )}
    </div>
  )
}

function buildCompareSeries(results) {
  const epochMap = new Map()
  results.forEach((item) => {
    const history = item.metrics?.history || {}
    const epochs = history.epoch || []
    const scores = history.primary_score || []
    epochs.forEach((epoch, index) => {
      const row = epochMap.get(epoch) || { epoch }
      row[`run_${item.experiment?.id}`] = scores[index] ?? null
      epochMap.set(epoch, row)
    })
  })
  return Array.from(epochMap.values()).sort((a, b) => a.epoch - b.epoch)
}

function pickRepresentativeRuns(items) {
  const byModel = new Map()
  items.forEach((item) => {
    if (!['GCN', 'GAT', 'SAGE'].includes(item.model_type)) return
    const current = byModel.get(item.model_type)
    if (!current) {
      byModel.set(item.model_type, item)
      return
    }
    const currentBest = Number(current.is_best) ? 1 : 0
    const nextBest = Number(item.is_best) ? 1 : 0
    const currentScore = Number(current.accuracy || 0)
    const nextScore = Number(item.accuracy || 0)
    const currentTime = Date.parse(current.created_at || 0) || 0
    const nextTime = Date.parse(item.created_at || 0) || 0
    if (
      nextBest > currentBest ||
      (nextBest === currentBest && nextScore > currentScore) ||
      (nextBest === currentBest && nextScore === currentScore && nextTime > currentTime)
    ) {
      byModel.set(item.model_type, item)
    }
  })
  return Array.from(byModel.values()).sort((a, b) => ['GCN', 'GAT', 'SAGE'].indexOf(a.model_type) - ['GCN', 'GAT', 'SAGE'].indexOf(b.model_type))
}

function analyzeTask1Compare(results) {
  if (!results.length) {
    return {
      bestAccuracy: 'No data',
      lowestLoss: 'No data',
      fastestConvergence: 'No data',
      summary: 'Save a few runs to unlock model-level analysis.',
    }
  }

  const models = results.map((item) => ({
    model: item.experiment?.model_type || 'Model',
    accuracy: Number(item.experiment?.accuracy || 0),
    loss: Number(item.experiment?.loss || 0),
    bestEpoch: Number(item.experiment?.best_epoch || 0),
    history: item.metrics?.history || {},
  }))

  const bestAccuracyModel = [...models].sort((a, b) => b.accuracy - a.accuracy)[0]
  const lowestLossModel = [...models].sort((a, b) => a.loss - b.loss)[0]
  const fastestModel = [...models].sort((a, b) => {
    const aEpoch = resolveConvergenceEpoch(a)
    const bEpoch = resolveConvergenceEpoch(b)
    return aEpoch - bEpoch
  })[0]

  const lines = []
  lines.push(`${bestAccuracyModel.model} is currently leading on validation accuracy.`)
  if (lowestLossModel.model !== bestAccuracyModel.model) {
    lines.push(`${lowestLossModel.model} is the cleanest fit on loss, so it may be the most stable candidate.`)
  } else {
    lines.push('It also owns the lowest loss, which suggests the run is not just peaking by luck.')
  }
  if (fastestModel) {
    lines.push(`${fastestModel.model} reaches its useful regime the fastest, which matters when we want a quick baseline.`)
  }

  return {
    bestAccuracy: `${bestAccuracyModel.model} | ${(bestAccuracyModel.accuracy * 100).toFixed(1)}%`,
    lowestLoss: `${lowestLossModel.model} | ${lowestLossModel.loss.toFixed(3)}`,
    fastestConvergence: fastestModel ? `${fastestModel.model} | epoch ${resolveConvergenceEpoch(fastestModel)}` : 'No data',
    summary: lines.join(' '),
  }
}

function resolveConvergenceEpoch(model) {
  const scores = model.history?.primary_score || []
  if (!scores.length) return model.bestEpoch || 0
  const peak = Math.max(...scores)
  const target = peak * 0.95
  const hit = scores.findIndex((value) => value >= target)
  return hit >= 0 ? hit : model.bestEpoch || scores.length - 1
}

function CompareInsight({ title, value }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2">
      <div className="text-nano font-bold uppercase tracking-ultra text-slate-500">{title}</div>
      <div className="mt-1 text-sm font-semibold text-slate-100">{value}</div>
    </div>
  )
}

function GuardrailStat({ label, value }) {
  return (
    <div className="rounded-md border border-slate-800/70 bg-slate-950/45 px-3 py-2">
      <div className="text-nano font-bold uppercase tracking-ultra text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-100">{value}</div>
    </div>
  )
}

function StatCell({ label, value, digits = 2, suffix = '', tone = 'neutral' }) {
  const toneClass = tone === 'good' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : tone === 'bad' ? 'text-red-400' : 'text-slate-200'
  const safe = Number.isFinite(value) ? value : 0
  return (
    <div className="rounded-md border border-slate-800/60 bg-slate-900/40 px-2 py-1">
      <div className="text-nano font-bold uppercase tracking-ultra text-slate-500">{label}</div>
      <div className={`text-sm font-mono font-black tabular-nums ${toneClass}`}>
        {safe.toFixed(digits)}
        {suffix}
      </div>
    </div>
  )
}
