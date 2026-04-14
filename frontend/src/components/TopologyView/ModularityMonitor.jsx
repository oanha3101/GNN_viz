import React, { useMemo } from 'react'
import { AreaChart, Area, BarChart, Bar, Cell,
         XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import usePlayerStore from '../../store/playerStore'

const COMMUNITY_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#06b6d4', '#ec4899']

export default function ModularityMonitor() {
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]

  // Build history data for charts
  const historyData = useMemo(() => {
    return snapshots.slice(0, epochInt + 1).map((s, i) => ({
      epoch: i,
      modularity: s.modularity_q ?? 0,
      conductance: s.conductance ?? 0,
    }))
  }, [snapshots, epochInt])

  // Community size distribution
  const commSizes = snap?.community_sizes || []
  const sizeData = commSizes.map((size, i) => ({
    name: `C${i}`,
    size,
    fill: COMMUNITY_COLORS[i % COMMUNITY_COLORS.length],
  }))

  const modQ = snap?.modularity_q ?? 0
  const cond = snap?.conductance ?? 0
  const bridgeCount = (snap?.bridge_nodes || []).filter(Boolean).length

  if (snapshots.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 text-[10px] p-4">
        <div className="text-3xl mb-3 opacity-40 animate-pulse">🏝️</div>
        <p className="text-center">Start training to see<br/>community metrics</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col p-3 text-xs overflow-auto bg-slate-950">
      {/* Header Metrics */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-slate-900/80 rounded-lg px-2 py-1.5 text-center border border-slate-800/50">
          <span className="text-[8px] text-slate-500 block uppercase tracking-wider font-bold">Modularity Q</span>
          <span className={`text-sm font-black font-mono ${modQ > 0.4 ? 'text-green-400' : modQ > 0.2 ? 'text-yellow-400' : 'text-red-400'}`}>
            {modQ.toFixed(3)}
          </span>
        </div>
        <div className="bg-slate-900/80 rounded-lg px-2 py-1.5 text-center border border-slate-800/50">
          <span className="text-[8px] text-slate-500 block uppercase tracking-wider font-bold">Conductance</span>
          <span className={`text-sm font-black font-mono ${cond < 0.2 ? 'text-green-400' : 'text-yellow-400'}`}>
            {cond.toFixed(3)}
          </span>
        </div>
        <div className="bg-slate-900/80 rounded-lg px-2 py-1.5 text-center border border-slate-800/50">
          <span className="text-[8px] text-slate-500 block uppercase tracking-wider font-bold">Bridges</span>
          <span className="text-sm font-black font-mono text-white">{bridgeCount}</span>
        </div>
      </div>

      {/* Modularity + Conductance Chart */}
      <div className="flex-1 min-h-[100px] mb-2">
        <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-1">Q & Conductance over Epochs</div>
        <ResponsiveContainer width="100%" height="85%">
          <AreaChart data={historyData}>
            <defs>
              <linearGradient id="modGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="condGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="epoch" tick={{ fill: '#475569', fontSize: 8 }} />
            <YAxis domain={[-0.1, 1]} tick={{ fill: '#475569', fontSize: 8 }} />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 10 }}
              labelStyle={{ color: '#94a3b8' }}
            />
            <ReferenceLine y={0.4} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity={0.4} />
            <Area type="monotone" dataKey="modularity" stroke="#22c55e" fill="url(#modGrad)" strokeWidth={2} name="Modularity Q" />
            <Area type="monotone" dataKey="conductance" stroke="#f97316" fill="url(#condGrad)" strokeWidth={2} name="Conductance" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Community Size Distribution */}
      <div className="min-h-[80px]">
        <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-1">Community Sizes</div>
        <ResponsiveContainer width="100%" height={60}>
          <BarChart data={sizeData} layout="vertical">
            <XAxis type="number" tick={{ fill: '#475569', fontSize: 8 }} />
            <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 9 }} width={24} />
            <Bar dataKey="size" radius={[0, 4, 4, 0]}>
              {sizeData.map((entry, i) => (
                <Cell key={`cell-${i}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
