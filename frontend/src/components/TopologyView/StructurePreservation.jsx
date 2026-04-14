import React, { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import usePlayerStore from '../../store/playerStore'

/**
 * StructurePreservation — View C for Task 5
 * 
 * 3 metrics over epochs:
 *   1. k-NN Preservation Rate (%)
 *   2. Link Reconstruction AUC (%)
 *   3. Reconstruction Loss
 * 
 * Auto-scales Y axis. Shows "Converged ✓" badge when metrics
 * have been stable for 5+ consecutive epochs.
 */
export default function StructurePreservation() {
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]

  const historyData = useMemo(() => {
    return snapshots.slice(0, epochInt + 1).map((s, i) => ({
      epoch: i,
      knn: (s.knn_preservation ?? 0) * 100,
      auc: (s.link_recon_auc ?? 0) * 100,
      loss: s.reconstruction_loss ?? s.train_loss ?? 0,
    }))
  }, [snapshots, epochInt])

  // Detect convergence: last 5 epochs' kNN and AUC vary < 2%
  const isConverged = useMemo(() => {
    if (historyData.length < 8) return false
    const tail = historyData.slice(-5)
    const knnRange = Math.max(...tail.map(d => d.knn)) - Math.min(...tail.map(d => d.knn))
    const aucRange = Math.max(...tail.map(d => d.auc)) - Math.min(...tail.map(d => d.auc))
    const lossRange = Math.max(...tail.map(d => d.loss)) - Math.min(...tail.map(d => d.loss))
    return knnRange < 2 && aucRange < 2 && lossRange < 0.05
  }, [historyData])

  // Auto-scale Y for loss
  const lossRange = useMemo(() => {
    if (historyData.length === 0) return [0, 1]
    const losses = historyData.map(d => d.loss)
    const min = Math.min(...losses)
    const max = Math.max(...losses)
    const padding = (max - min) * 0.15 || 0.1
    return [Math.max(0, min - padding), max + padding]
  }, [historyData])

  const knnVal = snap?.knn_preservation ?? 0
  const aucVal = snap?.link_recon_auc ?? 0
  const lossVal = snap?.reconstruction_loss ?? snap?.train_loss ?? 0
  const isotropyVal = snap?.isotropy_score ?? 0

  if (snapshots.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 text-[10px] p-4">
        <div className="text-3xl mb-3 opacity-40 animate-pulse">📏</div>
        <p className="text-center">Chỉ số giữ cấu trúc<br/>sẽ xuất hiện khi huấn luyện</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col p-3 text-xs overflow-auto bg-slate-950">
      {/* Header with convergence badge */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          Structure Preservation
        </h3>
        {isConverged && (
          <div className="flex items-center gap-1 bg-green-500/15 border border-green-500/30 rounded-full px-2.5 py-0.5 animate-pulse">
            <span className="text-green-400 text-[9px] font-bold">Embedding Converged ✓</span>
          </div>
        )}
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-4 gap-1.5 mb-2">
        <div className="bg-slate-900/80 rounded-lg px-2 py-1.5 text-center border border-slate-800/50">
          <span className="text-[7px] text-slate-500 block uppercase tracking-wider font-bold">k-NN</span>
          <span className={`text-sm font-black font-mono ${knnVal > 0.7 ? 'text-green-400' : 'text-yellow-400'}`}>
            {(knnVal * 100).toFixed(0)}%
          </span>
        </div>
        <div className="bg-slate-900/80 rounded-lg px-2 py-1.5 text-center border border-slate-800/50">
          <span className="text-[7px] text-slate-500 block uppercase tracking-wider font-bold">AUC</span>
          <span className={`text-sm font-black font-mono ${aucVal > 0.8 ? 'text-green-400' : 'text-yellow-400'}`}>
            {(aucVal * 100).toFixed(0)}%
          </span>
        </div>
        <div className="bg-slate-900/80 rounded-lg px-2 py-1.5 text-center border border-slate-800/50">
          <span className="text-[7px] text-slate-500 block uppercase tracking-wider font-bold">Loss</span>
          <span className="text-sm font-black font-mono text-orange-400">
            {lossVal.toFixed(3)}
          </span>
        </div>
        <div className="bg-slate-900/80 rounded-lg px-2 py-1.5 text-center border border-slate-800/50">
          <span className="text-[7px] text-slate-500 block uppercase tracking-wider font-bold">Isotropy</span>
          <span className={`text-sm font-black font-mono ${isotropyVal > 0.6 ? 'text-green-400' : 'text-yellow-400'}`}>
            {(isotropyVal * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Chart: kNN + AUC */}
      <div className="flex-1 min-h-[80px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={historyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="epoch" tick={{ fill: '#475569', fontSize: 8 }} />
            <YAxis domain={[0, 100]} tick={{ fill: '#475569', fontSize: 8 }} unit="%" />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 10 }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(val, name) => [`${val.toFixed(1)}%`, name]}
            />
            <ReferenceLine y={80} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity={0.3} />
            <Line type="monotone" dataKey="knn" stroke="#3b82f6" strokeWidth={2} dot={false} name="k-NN Pres." />
            <Line type="monotone" dataKey="auc" stroke="#a855f7" strokeWidth={2} dot={false} name="Link AUC" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Chart: Loss */}
      <div className="min-h-[60px] mt-1">
        <ResponsiveContainer width="100%" height={60}>
          <LineChart data={historyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="epoch" tick={false} />
            <YAxis domain={lossRange} tick={{ fill: '#475569', fontSize: 7 }} width={35} />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 10 }}
              formatter={(val) => [val.toFixed(4), 'Recon Loss']}
            />
            <Line type="monotone" dataKey="loss" stroke="#f97316" strokeWidth={2} dot={false} name="Reconstruction Loss" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
