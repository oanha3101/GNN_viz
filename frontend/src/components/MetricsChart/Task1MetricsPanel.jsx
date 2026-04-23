import React, { useMemo, useState } from 'react'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'
import usePlayerStore from '../../store/playerStore'
import useGNNStore from '../../store/useGNNStore'
import {
  buildConfusionMatrixK,
  buildClassDistribution,
  extractDirichletSeries,
  computeHomophilyScatter,
} from '../../utils/task1Metrics'

/**
 * Task1MetricsPanel — per-class diagnostics for Node Classification.
 * Tabs (max 4 per viz-dashboards skill):
 *   Overview    — loss/acc curves + macro-F1 + headline accuracy.
 *   Confusion   — K×K heatmap, per-class P/R/F1 table, click cell to focus node.
 *   Homophily   — scatter majority_ratio × correctness, highlights heterophilic
 *                 misclassifieds.
 *   Diagnostics — dirichlet energy curve (over-smoothing) + GT vs pred class
 *                 distribution bars.
 */

const CLASS_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#06b6d4', '#ec4899']

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'confusion', label: 'Confusion' },
  { id: 'homophily', label: 'Homophily' },
  { id: 'diagnostics', label: 'Diagnostics' },
]

export default function Task1MetricsPanel() {
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const graphData = useGNNStore((s) => s.graphData)
  const setSelectedNode = useGNNStore((s) => s.setSelectedNode)
  const [tab, setTab] = useState('overview')

  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]

  if (!snapshots.length) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 p-6 gap-2">
        <div className="text-3xl opacity-40 animate-pulse">...</div>
        <p className="text-micro text-center">Run training để xem Node Classification metrics</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-2 p-2">
      <div className="flex items-center gap-1 px-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`text-nano font-bold uppercase tracking-ultra px-2.5 py-1 rounded-md transition-colors ${
              tab === t.id ? 'bg-slate-800 text-white' : 'bg-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab snapshots={snapshots} epochInt={epochInt} snap={snap} graphData={graphData} />}
      {tab === 'confusion' && (
        <ConfusionTab snap={snap} graphData={graphData} onPick={setSelectedNode} snapshots={snapshots} epochInt={epochInt} />
      )}
      {tab === 'homophily' && <HomophilyTab snap={snap} onPick={setSelectedNode} />}
      {tab === 'diagnostics' && <DiagnosticsTab snap={snap} snapshots={snapshots} graphData={graphData} />}
    </div>
  )
}

function OverviewTab({ snapshots, epochInt, snap, graphData }) {
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

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-auto">
      <div className="grid grid-cols-3 gap-2">
        <StatCell label="Val Acc" value={valAcc * 100} digits={1} suffix="%" tone={valAcc > 0.85 ? 'good' : valAcc > 0.6 ? 'warn' : 'bad'} />
        <StatCell label="Macro F1" value={macroF1 * 100} digits={1} suffix="%" tone={macroF1 > 0.8 ? 'good' : macroF1 > 0.5 ? 'warn' : 'bad'} />
        <StatCell label="Train Loss" value={trainLoss} digits={3} tone={trainLoss < 0.2 ? 'good' : trainLoss < 0.6 ? 'warn' : 'bad'} />
      </div>

      <div className="flex-1 min-h-[140px]">
        <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra block mb-1">Loss &amp; Val-Acc over Epochs</span>
        <ResponsiveContainer width="100%" height="90%">
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="epoch" tick={{ fill: '#475569', fontSize: 9 }} />
            <YAxis yAxisId="loss" tick={{ fill: '#475569', fontSize: 9 }} domain={[0, 'auto']} />
            <YAxis yAxisId="acc" orientation="right" tick={{ fill: '#475569', fontSize: 9 }} domain={[0, 100]} />
            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 10 }} />
            <Line yAxisId="loss" type="monotone" dataKey="train_loss" stroke="#f97316" strokeWidth={2} dot={false} name="Train Loss" />
            <Line yAxisId="loss" type="monotone" dataKey="val_loss" stroke="#ef4444" strokeWidth={2} dot={false} name="Val Loss" />
            <Line yAxisId="acc" type="monotone" dataKey="val_acc" stroke="#22c55e" strokeWidth={2} dot={false} name="Val Acc (%)" />
            <Legend wrapperStyle={{ fontSize: 10 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function ConfusionTab({ snap, graphData, onPick, snapshots, epochInt }) {
  const [sel, setSel] = useState(null) // { t, p }

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

  if (!matrix) return <div className="flex-1 flex items-center justify-center text-slate-500 text-micro">No predictions yet</div>

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-auto">
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div className="bg-slate-900/40 rounded-lg p-2 border border-slate-800/60">
          <div className="text-nano text-slate-500 uppercase font-bold tracking-ultra mb-1">
            {numClasses}×{numClasses} Matrix · diag=green, off=red
          </div>
          <div className="overflow-auto">
            <table className="text-nano font-mono">
              <thead>
                <tr>
                  <th className="w-6" />
                  {Array.from({ length: numClasses }, (_, j) => (
                    <th key={j} className="w-7 h-5 text-center" style={{ color: CLASS_COLORS[j % CLASS_COLORS.length] }}>
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
                      <td className="w-6 h-6 text-center" style={{ color: CLASS_COLORS[t % CLASS_COLORS.length] }}>
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
                              title={`True ${t} → Pred ${p}: ${val}`}
                              className={`w-7 h-6 rounded-sm text-nano font-bold transition-transform ${
                                val ? 'hover:scale-110 cursor-pointer' : 'cursor-default'
                              } ${isSel ? 'ring-1 ring-cyan-400' : ''}`}
                              style={{ backgroundColor: bg, color: val ? '#f8fafc' : '#1e293b' }}
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

        <div className="bg-slate-900/40 rounded-lg p-2 border border-slate-800/60">
          <div className="text-nano text-slate-500 uppercase font-bold tracking-ultra mb-1">Per-class · Precision / Recall / F1</div>
          <table className="text-nano font-mono w-full">
            <thead>
              <tr className="text-slate-500">
                <th className="text-left py-1">#</th>
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
      <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-micro gap-1">
        <p>Chưa có dữ liệu homophily.</p>
        <p className="text-nano">BE cần emit `majority_ratio` và `node_correctness`.</p>
      </div>
    )
  }

  const correctPts = points.filter((p) => p.correct === 1)
  const wrongPts = points.filter((p) => p.correct === 0)

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-auto">
      <div className="text-nano text-slate-500 uppercase font-bold tracking-ultra">
        Neighbor majority ratio × node correctness · click a dot to focus node on canvas
      </div>
      <div className="flex-1 min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="ratio"
              type="number"
              domain={[0, 1]}
              tick={{ fill: '#475569', fontSize: 9 }}
              label={{ value: 'majority_ratio →', fill: '#475569', fontSize: 9, dy: 14 }}
            />
            <YAxis
              dataKey="correct"
              type="number"
              domain={[-0.1, 1.1]}
              ticks={[0, 1]}
              tick={{ fill: '#475569', fontSize: 9 }}
              label={{ value: 'correct', fill: '#475569', fontSize: 9, angle: -90, dx: -8 }}
            />
            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 10 }} />
            <ReferenceLine x={0.5} stroke="#f59e0b" strokeDasharray="3 3" strokeOpacity={0.5} />
            <Scatter name="Correct" data={correctPts} fill="#22c55e" onClick={(d) => onPick(d.id)} />
            <Scatter name="Wrong" data={wrongPts} fill="#ef4444" onClick={(d) => onPick(d.id)} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="text-nano text-slate-500">
        Heterophilic misclassifieds cluster at low ratio + correct=0 (bottom-left); homophilic correct wins sit at high ratio + correct=1 (top-right).
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
    <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-auto">
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div className="bg-slate-900/40 rounded-lg p-2 border border-slate-800/60">
          <div className="flex items-center justify-between mb-1">
            <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra">Dirichlet Energy (over-smoothing)</span>
            {isOversmooth && <span className="text-nano text-red-400 font-bold">⚠ collapsed</span>}
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
                <XAxis dataKey="epoch" tick={{ fill: '#475569', fontSize: 9 }} />
                <YAxis tick={{ fill: '#475569', fontSize: 9 }} domain={[0, 1]} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 10 }} />
                <Area type="monotone" dataKey="energy" stroke="#a855f7" fill="url(#t1energyGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="text-nano text-slate-500 mt-1">
            current {currentEnergy.toFixed(3)} · initial {initialEnergy.toFixed(3)}
          </div>
        </div>

        <div className="bg-slate-900/40 rounded-lg p-2 border border-slate-800/60">
          <div className="text-nano text-slate-500 uppercase font-bold tracking-ultra mb-1">
            Class distribution · GT vs Predicted
          </div>
          <div className="h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="cls" tick={{ fill: '#475569', fontSize: 9 }} />
                <YAxis tick={{ fill: '#475569', fontSize: 9 }} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 10 }} />
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

function StatCell({ label, value, digits = 2, suffix = '', tone = 'neutral' }) {
  const toneClass = tone === 'good' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : tone === 'bad' ? 'text-red-400' : 'text-slate-200'
  const safe = Number.isFinite(value) ? value : 0
  return (
    <div className="bg-slate-900/40 rounded-md px-2 py-1 border border-slate-800/60">
      <div className="text-nano text-slate-500 uppercase font-bold tracking-ultra">{label}</div>
      <div className={`text-sm font-mono font-black tabular-nums ${toneClass}`}>
        {safe.toFixed(digits)}
        {suffix}
      </div>
    </div>
  )
}
