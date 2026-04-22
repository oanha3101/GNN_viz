import React, { useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Activity, ShieldCheck, Zap, AlertTriangle } from 'lucide-react'
import usePlayerStore from '../../store/playerStore'
import useGNNStore from '../../store/useGNNStore'

/**
 * LinkMetricsPanel — Nâng cấp XAI chuyên sâu cho Task 3
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

  const auc = snap?.auc ?? 0.5
  const totalEdges = taskData?.testEdges?.length ?? 0

  if (snapshots.length === 0) return <div className="p-4 text-[10px] text-slate-500 italic animate-pulse">Awaiting signal analysis...</div>

  return (
    <div className="h-full flex flex-col p-4 text-xs bg-[#050c19] custom-scrollbar overflow-y-auto">
      {/* ─── STATUS HEADER ─── */}
      <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
              <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Link Intelligence</h3>
          </div>
          <span className="text-[9px] font-mono text-slate-500">v3.0_stable</span>
      </div>

      {/* ─── INSIGHT CARDS ─── */}
      <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-cyan-400 mb-1">
                  <ShieldCheck size={12} />
                  <span className="text-[8px] font-bold uppercase tracking-wider">Confidence</span>
              </div>
              <span className="text-xl font-black text-white font-mono">{(auc * 100).toFixed(1)}%</span>
              <div className="h-1 w-full bg-slate-800 rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-cyan-500" style={{ width: `${auc * 100}%` }} />
              </div>
          </div>
          <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-amber-400 mb-1">
                  <Zap size={12} />
                  <span className="text-[8px] font-bold uppercase tracking-wider">Candidates</span>
              </div>
              <span className="text-xl font-black text-white font-mono">{totalEdges}</span>
              <span className="text-[8px] text-slate-500 font-bold uppercase">Test Pairs</span>
          </div>
      </div>

      {/* ─── AUC CHART ─── */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] text-slate-500 uppercase font-black tracking-widest flex items-center gap-2">
                <Activity size={10} /> Model Stability
            </span>
            <span className="text-[10px] text-emerald-400 font-mono font-bold">+{((auc - 0.5)*100).toFixed(1)}%</span>
        </div>
        <div className="h-24 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={aucHistory}>
                    <defs>
                        <linearGradient id="aucArea" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="epoch" hide />
                    <YAxis domain={[0.4, 1]} hide />
                    <Area type="monotone" dataKey="auc" stroke="#22d3ee" strokeWidth={2} fill="url(#aucArea)" animationDuration={300} />
                </AreaChart>
            </ResponsiveContainer>
        </div>
      </div>

      {/* ─── LIVE TOP PREDICTIONS ─── */}
      <div>
          <div className="flex items-center gap-2 mb-3 text-slate-400">
              <AlertTriangle size={10} className="text-indigo-400" />
              <span className="text-[9px] font-black uppercase tracking-widest">Key Anomalies Detected</span>
          </div>
          <div className="space-y-2">
              {snap?.top_k_links?.slice(0, 4).map((link, i) => (
                  <div key={i} className="group flex items-center justify-between bg-slate-900/30 hover:bg-slate-800/50 border border-white/5 rounded-xl p-2.5 transition-all cursor-pointer">
                      <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-[10px] font-black text-cyan-400 border border-white/5">
                              {link.source}
                          </div>
                          <div className="h-px w-4 bg-slate-700 group-hover:w-6 transition-all" />
                          <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-[10px] font-black text-indigo-400 border border-white/5">
                              {link.target}
                          </div>
                      </div>
                      <div className="text-right">
                          <div className="text-[10px] font-black text-white font-mono">{(link.score * 100).toFixed(1)}%</div>
                          <div className="text-[7px] text-slate-500 uppercase font-bold">Potential</div>
                      </div>
                  </div>
              ))}
          </div>
      </div>
    </div>
  )
}
