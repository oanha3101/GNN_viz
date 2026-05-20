import React, { useMemo } from 'react'
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
         Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import usePlayerStore from '../../store/playerStore'
import useGNNStore from '../../store/useGNNStore'

/**
 * LinkMetricsPanel — Dedicated info panel for Task 3 (Link Prediction)
 * Shows: AUC over epochs, score distribution histogram, edge stats
 * Replaces the shared MetricsChart with task-specific metrics
 */
export default function LinkMetricsPanel() {
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const taskData = useGNNStore(s => s.taskData)

  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]

  // AUC history
  const aucHistory = useMemo(() => {
    return snapshots.slice(0, epochInt + 1).map((s, i) => ({
      epoch: i,
      auc: s.auc ?? 0.5,
    }))
  }, [snapshots, epochInt])

  // Score distribution (histogram bins)
  const distribution = useMemo(() => {
    if (!snap?.edge_scores) return []
    const scores = snap.edge_scores
    const testEdges = taskData?.testEdges || []
    const bins = Array.from({ length: 10 }, (_, i) => ({
      range: `${(i * 0.1).toFixed(1)}`,
      positive: 0,
      negative: 0,
    }))
    scores.forEach((s, i) => {
      const binIdx = Math.min(9, Math.floor(s * 10))
      if (testEdges[i]?.exists) bins[binIdx].positive++
      else bins[binIdx].negative++
    })
    return bins
  }, [snap, taskData])

  // Current stats
  const auc = snap?.auc ?? 0.5
  const totalEdges = taskData?.testEdges?.length ?? 0
  const posEdges = taskData?.testEdges?.filter(e => e.exists).length ?? 0
  const negEdges = totalEdges - posEdges

  // Prediction accuracy at threshold 0.5
  const accuracy = useMemo(() => {
    if (!snap?.edge_scores || !taskData?.testEdges) return 0
    let correct = 0
    snap.edge_scores.forEach((s, i) => {
      const pred = s > 0.5
      const actual = taskData.testEdges[i]?.exists
      if (pred === actual) correct++
    })
    return totalEdges > 0 ? correct / totalEdges : 0
  }, [snap, taskData, totalEdges])

  if (snapshots.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 text-[10px] p-4">
        <div className="text-3xl mb-3 opacity-40 animate-pulse">&#8230;</div>
        <p className="text-center">Link prediction metrics<br/>will appear during training</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col p-3 text-xs overflow-auto bg-slate-950">
      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
        Link Prediction
      </h3>

      {/* Metric cards */}
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        <div className="bg-slate-900/80 rounded-lg px-1.5 py-1.5 text-center border border-slate-800/50">
          <span className="text-[7px] text-slate-500 block uppercase font-bold">AUC</span>
          <span className={`text-sm font-black font-mono ${auc > 0.8 ? 'text-green-400' : auc > 0.6 ? 'text-yellow-400' : 'text-red-400'}`}>
            {auc.toFixed(3)}
          </span>
        </div>
        <div className="bg-slate-900/80 rounded-lg px-1.5 py-1.5 text-center border border-slate-800/50">
          <span className="text-[7px] text-slate-500 block uppercase font-bold">Acc@0.5</span>
          <span className={`text-sm font-black font-mono ${accuracy > 0.8 ? 'text-green-400' : 'text-yellow-400'}`}>
            {(accuracy * 100).toFixed(1)}%
          </span>
        </div>
        <div className="bg-slate-900/80 rounded-lg px-1.5 py-1.5 text-center border border-slate-800/50">
          <span className="text-[7px] text-slate-500 block uppercase font-bold">Edges</span>
          <span className="text-sm font-black font-mono text-slate-300">{totalEdges}</span>
        </div>
      </div>

      {/* Edge breakdown */}
      <div className="flex gap-2 mb-3">
        <div className="flex-1 bg-blue-900/20 rounded-lg px-2 py-1 text-center border border-blue-500/20">
          <span className="text-[8px] text-blue-400">● {posEdges} positive</span>
        </div>
        <div className="flex-1 bg-red-900/20 rounded-lg px-2 py-1 text-center border border-red-500/20">
          <span className="text-[8px] text-red-400">● {negEdges} negative</span>
        </div>
      </div>

      {/* AUC over epochs */}
      <div className="flex-1 min-h-[80px] mb-2">
        <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-1">AUC over Epochs</div>
        <ResponsiveContainer width="100%" height={70}>
          <AreaChart data={aucHistory}>
            <defs>
              <linearGradient id="aucGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
            <XAxis dataKey="epoch" tick={{ fill: '#475569', fontSize: 7 }} />
            <YAxis domain={[0.4, 1]} tick={{ fill: '#475569', fontSize: 7 }} />
            <ReferenceLine y={0.5} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.4} />
            <Area type="monotone" dataKey="auc" stroke="#3b82f6" fill="url(#aucGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Score Distribution */}
      {distribution.length > 0 && (
        <div className="min-h-[80px]">
          <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-1">Score Distribution</div>
          <ResponsiveContainer width="100%" height={70}>
            <AreaChart data={distribution} stackOffset="none">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
              <XAxis dataKey="range" tick={{ fill: '#475569', fontSize: 7 }} />
              <YAxis tick={{ fill: '#475569', fontSize: 7 }} />
              <Tooltip
                contentStyle={{ background: 'var(--c-bg-elev)', border: '1px solid var(--c-border)', color: 'var(--c-fg)', borderRadius: 8, fontSize: 9 }}
              />
              <Area type="monotone" dataKey="positive" stackId="1" stroke="#3b82f6" fill="#3b82f680" />
              <Area type="monotone" dataKey="negative" stackId="1" stroke="#ef4444" fill="#ef444480" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
