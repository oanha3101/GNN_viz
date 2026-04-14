import React, { useMemo, useState } from 'react'
import usePlayerStore from '../../store/playerStore'
import useGNNStore from '../../store/useGNNStore'
import MetricsChart from './MetricsChart'

/**
 * Task2MetricsPanel — Sprint 4
 * Tabs: METRICS | BATCH HEATMAP
 *
 * BatchHeatmap shows per-graph correct/wrong as a grid of colored tiles
 * that updates live as epochs progress. Each tile = 1 graph.
 * Green = predicted correctly, Red = wrong, dim = not yet evaluated.
 */
export default function Task2MetricsPanel() {
  const [viewMode, setViewMode] = useState('chart')
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const taskData = useGNNStore(s => s.taskData)

  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]

  // Build heatmap data: history of graph_correct across epochs (downsampled)
  const { heatmapRows, graphLabels, numGraphs } = useMemo(() => {
    if (snapshots.length === 0) return { heatmapRows: [], graphLabels: [], numGraphs: 0 }
    const nG = snap?.graph_correct?.length || snapshots.find(s => s.graph_correct)?.graph_correct?.length || 0
    if (!nG) return { heatmapRows: [], graphLabels: [], numGraphs: 0 }

    // Take up to 20 epoch checkpoints
    const step = Math.max(1, Math.floor(snapshots.length / 20))
    const rows = []
    for (let i = 0; i < snapshots.length; i += step) {
      const s = snapshots[i]
      rows.push({ epoch: i, data: s.graph_correct || new Array(nG).fill(null) })
    }
    // Always include current epoch
    if (snap?.graph_correct) {
      rows.push({ epoch: epochInt, data: snap.graph_correct, isCurrent: true })
    }

    const graphLabels = taskData?.graphs
      ? taskData.graphs.map((g, i) => `G${i}`)
      : Array.from({ length: nG }, (_, i) => `G${i}`)

    return { heatmapRows: rows, graphLabels, numGraphs: nG }
  }, [snapshots, epochInt, snap, taskData])

  // Current epoch accuracy
  const currentAccuracy = useMemo(() => {
    if (!snap?.graph_correct?.length) return null
    const correct = snap.graph_correct.reduce((s, v) => s + v, 0)
    return (correct / snap.graph_correct.length * 100).toFixed(1)
  }, [snap])

  // History accuracy trend for sparkline
  const accHistory = useMemo(() =>
    snapshots.map((s, i) => ({
      epoch: i,
      acc: s.graph_correct
        ? s.graph_correct.reduce((a, v) => a + v, 0) / s.graph_correct.length
        : s.val_acc ?? 0
    }))
  , [snapshots])

  return (
    <div className="w-full h-full flex flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 pt-2 pb-1.5 border-b border-slate-800/60 shrink-0 flex-wrap">
        <button onClick={() => setViewMode('chart')}
          className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all
            ${viewMode === 'chart' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'}`}>
          Loss / Acc
        </button>
        <button onClick={() => setViewMode('heatmap')}
          className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all
            ${viewMode === 'heatmap' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'}`}>
          Batch Heatmap
        </button>
        {viewMode === 'heatmap' && currentAccuracy && (
          <span className="ml-auto text-[9px] font-mono font-bold text-emerald-400">
            Epoch {epochInt} · Acc: {currentAccuracy}%
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {viewMode === 'chart' && <MetricsChart />}

        {viewMode === 'heatmap' && (
          <div className="w-full h-full flex flex-col p-3 overflow-auto">
            {numGraphs === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs gap-2">
                <div className="text-4xl opacity-30">&#8203;</div>
                <p className="text-center">Bắt đầu huấn luyện Task 2<br/>để xem Batch Accuracy Heatmap</p>
              </div>
            ) : (
              <>
                {/* Explanation */}
                <div className="mb-3 rounded-xl border border-slate-800/60 bg-slate-900/50 p-3 text-[9px] text-slate-400 leading-relaxed">
                  <div className="font-bold text-slate-300 text-[10px] mb-1">Batch Accuracy Heatmap</div>
                  Mỗi ô = 1 đồ thị trong batch · <span className="text-green-400">Xanh</span> = dự đoán đúng ·
                  <span className="text-red-400"> Đỏ</span> = sai · Cột = Epoch checkpoint · Hàng = Graph ID
                </div>

                {/* Heatmap grid */}
                <div className="flex-1 min-h-0 overflow-auto">
                  <div className="inline-flex flex-col gap-0.5 min-w-max">
                    {/* Column headers (epoch labels) */}
                    <div className="flex gap-0.5 items-center">
                      <div className="w-8 shrink-0" />
                      {heatmapRows.map((row, ci) => (
                        <div key={ci}
                          className={`w-5 text-center text-[6px] font-mono shrink-0 ${row.isCurrent ? 'text-cyan-400 font-bold' : 'text-slate-600'}`}>
                          {row.epoch}
                        </div>
                      ))}
                    </div>

                    {/* Rows = graphs */}
                    {Array.from({ length: numGraphs }, (_, gi) => {
                      const gt = taskData?.graphs?.[gi]?.groundTruth
                      return (
                        <div key={gi} className="flex gap-0.5 items-center">
                          {/* Graph label */}
                          <div className="w-8 text-right text-[7px] font-mono text-slate-500 shrink-0 pr-1">
                            {graphLabels[gi]}
                          </div>
                          {/* Cells across epochs */}
                          {heatmapRows.map((row, ci) => {
                            const val = row.data[gi]
                            return (
                              <div key={ci}
                                title={`Graph ${gi} · Epoch ${row.epoch}: ${val === 1 ? '✓ Đúng' : val === 0 ? '✗ Sai' : '?'}`}
                                className={`w-5 h-5 rounded-sm shrink-0 transition-all duration-300 ${row.isCurrent ? 'ring-1 ring-cyan-500/40' : ''}`}
                                style={{
                                  backgroundColor: val === 1
                                    ? `rgba(34,197,94,${row.isCurrent ? 0.9 : 0.5})`
                                    : val === 0
                                      ? `rgba(239,68,68,${row.isCurrent ? 0.8 : 0.4})`
                                      : 'rgba(15,23,42,0.6)'
                                }}
                              />
                            )
                          })}
                        </div>
                      )
                    })}

                    {/* Accuracy bar at bottom */}
                    <div className="flex gap-0.5 items-center mt-1">
                      <div className="w-8 text-right text-[6px] font-mono text-slate-600 shrink-0 pr-1">acc</div>
                      {heatmapRows.map((row, ci) => {
                        const correct = row.data.filter(v => v === 1).length
                        const pct = row.data.length > 0 ? correct / row.data.length : 0
                        return (
                          <div key={ci} className="w-5 flex flex-col items-center shrink-0">
                            <div className="w-full h-6 bg-slate-800/50 rounded-sm overflow-hidden flex flex-col-reverse">
                              <div style={{ height: `${pct * 100}%`, backgroundColor: pct > 0.8 ? '#22c55e' : pct > 0.5 ? '#eab308' : '#ef4444' }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
