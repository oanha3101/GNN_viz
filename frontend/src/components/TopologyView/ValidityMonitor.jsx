import React, { useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import usePlayerStore from '../../store/playerStore'

/**
 * ValidityBar — Single horizontal progress bar with label and value.
 * Smooth transition-all for the fill width.
 */
function ValidityBar({ label, value, color }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider">
        <span className="text-slate-500">{label}</span>
        <span style={{ color }}>{(value * 100).toFixed(1)}%</span>
      </div>
      <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden border border-white/5">
        <div 
          className="h-full rounded-full transition-all duration-300 ease-out"
          style={{ width: `${value * 100}%`, backgroundColor: color, boxShadow: `0 0 8px ${color}44` }} 
        />
      </div>
    </div>
  )
}

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
    <div className="h-full flex flex-col p-4 text-xs overflow-y-auto overflow-x-hidden bg-abyss custom-scrollbar">
      <h3 className="text-micro font-black text-slate-400 uppercase tracking-ultra mb-4">
        Generation Quality
      </h3>

      {/* Progress Bars */}
      <div className="flex flex-col gap-4 mb-6">
        <ValidityBar label="Validity" value={validity} color="#22c55e" />
        <ValidityBar label="Uniqueness" value={uniqueness} color="#3b82f6" />
        <ValidityBar label="Novelty" value={novelty} color="#a855f7" />
      </div>

      <div className="h-px bg-slate-800/40 mb-4" />

      {/* Stacked area chart */}
      <div className="flex-1 min-h-[160px] mb-4">
        <div className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-2">Historique Qualité</div>
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
            <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
            <XAxis dataKey="epoch" tick={{ fill: '#475569', fontSize: 8 }} />
            <YAxis domain={[0, 100]} tick={{ fill: '#475569', fontSize: 8 }} unit="%" />
            <Tooltip
              contentStyle={{ background: 'var(--c-bg-elev)', border: '1px solid var(--c-border)', color: 'var(--c-fg)', borderRadius: 8, fontSize: 10 }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(val) => `${val.toFixed(1)}%`}
            />
            <Area type="monotone" dataKey="validity" stroke="#22c55e" fill="url(#validGrad)" strokeWidth={2} name="Validity" />
            <Area type="monotone" dataKey="uniqueness" stroke="#3b82f6" fill="url(#uniGrad)" strokeWidth={2} name="Uniqueness" />
            <Area type="monotone" dataKey="novelty" stroke="#a855f7" fill="url(#novGrad)" strokeWidth={2} name="Novelty" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Loss metrics */}
      <div className="grid grid-cols-2 gap-2 mt-auto">
        <div className="bg-slate-900/60 rounded-lg px-2 py-2 text-center border border-slate-800/50">
          <span className="text-nano text-slate-500 block uppercase font-bold mb-1">Recon Loss</span>
          <span className="text-xs font-bold font-mono text-orange-400">{reconLoss.toFixed(3)}</span>
        </div>
        <div className="bg-slate-900/60 rounded-lg px-2 py-2 text-center border border-slate-800/50">
          <span className="text-nano text-slate-500 block uppercase font-bold mb-1">KL Loss</span>
          <span className="text-xs font-bold font-mono text-purple-400">{klLoss.toFixed(3)}</span>
        </div>
      </div>
    </div>
  )
}
