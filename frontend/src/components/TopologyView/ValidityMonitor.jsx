import React, { useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import usePlayerStore from '../../store/playerStore'

/**
 * ValidityMonitor — Info panel for Task 6 (Graph Generation)
 * Shows 3 metrics over epochs: Validity%, Uniqueness%, Novelty%
 */
export default function ValidityMonitor() {
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]

  const historyData = useMemo(() => {
    return snapshots.slice(0, epochInt + 1).map((s, i) => ({
      epoch: i,
      validity: (s.validity_rate ?? 0) * 100,
      uniqueness: (s.uniqueness_rate ?? 0) * 100,
      novelty: (s.novelty_rate ?? 0) * 100,
    }))
  }, [snapshots, epochInt])

  const validity = snap?.validity_rate ?? 0
  const uniqueness = snap?.uniqueness_rate ?? 0
  const novelty = snap?.novelty_rate ?? 0
  const reconLoss = snap?.recon_loss ?? 0
  const klLoss = snap?.kl_loss ?? 0

  if (snapshots.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 text-micro p-4">
        <div className="text-3xl mb-3 opacity-40 animate-pulse">&#8230;</div>
        <p className="text-center">Generation metrics<br/>will appear during training</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col p-3 text-xs overflow-auto bg-slate-950">
      <h3 className="text-micro font-black text-slate-400 uppercase tracking-ultra mb-3">
        Generation Quality
      </h3>

      {/* Metric cards */}
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        <div className="bg-green-900/20 rounded-lg px-1.5 py-1.5 text-center border border-green-500/20">
          <span className="text-nano text-green-500/70 block uppercase font-bold">Valid</span>
          <span className="text-sm font-black font-mono text-green-400">{(validity * 100).toFixed(0)}%</span>
        </div>
        <div className="bg-blue-900/20 rounded-lg px-1.5 py-1.5 text-center border border-blue-500/20">
          <span className="text-nano text-blue-500/70 block uppercase font-bold">Unique</span>
          <span className="text-sm font-black font-mono text-blue-400">{(uniqueness * 100).toFixed(0)}%</span>
        </div>
        <div className="bg-purple-900/20 rounded-lg px-1.5 py-1.5 text-center border border-purple-500/20">
          <span className="text-nano text-purple-500/70 block uppercase font-bold">Novel</span>
          <span className="text-sm font-black font-mono text-purple-400">{(novelty * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* Stacked area chart */}
      <div className="flex-1 min-h-[120px] mb-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={historyData}>
            <defs>
              <linearGradient id="validGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="uniGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="novGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="epoch" tick={{ fill: '#475569', fontSize: 8 }} />
            <YAxis domain={[0, 100]} tick={{ fill: '#475569', fontSize: 8 }} unit="%" />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 10 }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(val) => `${val.toFixed(1)}%`}
            />
            <Area type="monotone" dataKey="validity" stroke="#22c55e" fill="url(#validGrad)" strokeWidth={2} name="Validity" />
            <Area type="monotone" dataKey="uniqueness" stroke="#3b82f6" fill="url(#uniGrad)" strokeWidth={2} name="Uniqueness" />
            <Area type="monotone" dataKey="novelty" stroke="#a855f7" fill="url(#novGrad)" strokeWidth={2} name="Novelty" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Loss cards */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-slate-900/60 rounded-lg px-2 py-1.5 text-center border border-slate-800/50">
          <span className="text-nano text-slate-500 block uppercase font-bold">Recon Loss</span>
          <span className="text-xs font-bold font-mono text-orange-400">{reconLoss.toFixed(3)}</span>
        </div>
        <div className="bg-slate-900/60 rounded-lg px-2 py-1.5 text-center border border-slate-800/50">
          <span className="text-nano text-slate-500 block uppercase font-bold">KL Loss</span>
          <span className="text-xs font-bold font-mono text-purple-400">{klLoss.toFixed(3)}</span>
        </div>
      </div>
    </div>
  )
}
