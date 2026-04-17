import React, { useMemo, useState } from 'react'
import usePlayerStore from '../../store/playerStore'
import Plot from 'react-plotly.js'
import MetricsChart from './MetricsChart'

/**
 * Task1MetricsPanel — Interactive Confusion Matrix with Node Highlighting
 * Tabs: METRICS | CONFUSION MATRIX | OVERSMOOTHING (Dirichlet Energy)
 */
import useGNNStore from '../../store/useGNNStore'

export default function Task1MetricsPanel() {
  const [viewMode, setViewMode] = useState('chart')
  const [selectedCMCell, setSelectedCMCell] = useState(null) // {trueClass, predClass}
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const graphData = useGNNStore(s => s.graphData)
  const setSelectedNode = useGNNStore(s => s.setSelectedNode)

  const { confusionMatrix, numClasses, accuracy, perClassAcc } = useMemo(() => {
    if (snapshots.length === 0 || !graphData?.nodes)
      return { confusionMatrix: null, numClasses: 0, accuracy: 0, perClassAcc: [] }

    const maxIdx = Math.max(0, snapshots.length - 1)
    const epochInt = Math.max(0, Math.min(maxIdx, Math.floor(isNaN(currentEpochFloat) ? maxIdx : currentEpochFloat)))
    const snap = snapshots[epochInt]
    const preds = snap?.node_predictions
    if (!preds) return { confusionMatrix: null, numClasses: 0, accuracy: 0, perClassAcc: [] }

    let maxClass = 0
    graphData.nodes.forEach(n => { if (n.groundTruth > maxClass) maxClass = n.groundTruth })
    const nC = maxClass + 1
    const matrix = Array(nC).fill(0).map(() => Array(nC).fill(0))
    let correct = 0, total = 0
    graphData.nodes.forEach((n, i) => {
      const t = n.groundTruth, p = preds[i]
      if (t !== undefined && p !== undefined) { matrix[t][p]++; if (t === p) correct++; total++ }
    })
    const acc = total > 0 ? (correct / total * 100).toFixed(1) : 0
    const perClassAcc = matrix.map((row, i) => {
      const rowTotal = row.reduce((a, b) => a + b, 0)
      return rowTotal > 0 ? (row[i] / rowTotal * 100).toFixed(0) : '—'
    })
    return { confusionMatrix: matrix, numClasses: nC, accuracy: acc, perClassAcc }
  }, [snapshots, currentEpochFloat, graphData])

  // Dirichlet Energy history — memoized to prevent recomputation
  const { energyTrace, currentEnergy, isOversmoothed } = useMemo(() => {
    const hist = snapshots.map((s, i) => ({ epoch: i, energy: s.dirichlet_energy ?? 0 }))
    const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
    const cur = snapshots[epochInt]?.dirichlet_energy ?? 0
    // Threshold: if energy drops below 5% of initial → likely oversmoothing
    const initial = hist[0]?.energy || 1
    const isOver = initial > 0 && cur < initial * 0.05
    return { energyTrace: hist, currentEnergy: cur, isOversmoothed: isOver }
  }, [snapshots, currentEpochFloat])

  // Metrics history for charts — memoized to prevent .slice on every render
  const metricsHistory = useMemo(() => {
    const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
    return snapshots.slice(0, epochInt + 1).map((s, i) => ({
      epoch: i,
      train_loss: s.train_loss,
      val_loss: s.val_loss,
      train_acc: s.train_acc,
      val_acc: s.val_acc,
    }))
  }, [snapshots, currentEpochFloat])

  const CELL_COLORS = ['#3b82f6','#ef4444','#22c55e','#eab308','#a855f7','#06b6d4','#ec4899']

  // Get nodes in selected confusion matrix cell
  const nodesInSelectedCell = useMemo(() => {
    if (!selectedCMCell || snapshots.length === 0 || !graphData?.nodes) return []
    const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
    const snap = snapshots[epochInt]
    const preds = snap?.node_predictions
    if (!preds) return []

    const matchingNodes = []
    graphData.nodes.forEach((node, i) => {
      if (node.groundTruth === selectedCMCell.trueClass && preds[i] === selectedCMCell.predClass) {
        matchingNodes.push(node.id)
      }
    })
    return matchingNodes.slice(0, 50) // Limit to 50 nodes to avoid performance issues
  }, [selectedCMCell, snapshots, currentEpochFloat, graphData])

  const tabs = [
    { key: 'chart', label: 'Loss / Acc' },
    { key: 'cm', label: 'Confusion Matrix' },
  ]

  return (
    <div className="w-full h-full flex flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 pt-2 pb-1.5 border-b border-slate-800/60 shrink-0 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setViewMode(t.key)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all
              ${viewMode === t.key
                ? t.key === 'chart' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : t.key === 'cm' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
              }`}
          >
            {t.label}
          </button>
        ))}
        {viewMode === 'cm' && confusionMatrix && (
          <span className="ml-auto text-[9px] text-cyan-400/80 font-mono">Acc: {accuracy}% · {numClasses} lớp</span>
        )}

      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        {viewMode === 'chart' && (
          <div className="p-3 space-y-4">
            <div className="h-[200px] bg-slate-900/20 border border-slate-800/40 rounded-lg p-1 overflow-hidden relative">
              <div className="absolute top-1 left-2 z-10 text-[8px] uppercase font-bold text-slate-600 tracking-widest">Training Dynamics</div>
              <MetricsChart />
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-900/40 p-2 rounded-lg border border-slate-800/60">
                <div className="text-[7px] uppercase text-slate-500 font-bold mb-0.5">Accuracy</div>
                <div className="text-lg font-mono font-black text-cyan-400">{accuracy}%</div>
              </div>
              <div className="bg-slate-900/40 p-2 rounded-lg border border-slate-800/60">
                <div className="text-[7px] uppercase text-slate-500 font-bold mb-0.5">Stability</div>
                <div className="text-lg font-mono font-black text-emerald-400">{(perClassAcc.reduce((a,b)=>a+(parseInt(b)||0),0)/numClasses).toFixed(0)}%</div>
              </div>
            </div>
          </div>
        )}

        {viewMode === 'cm' && (
          <div className="w-full h-full overflow-auto p-3 flex flex-col items-center">
            {!confusionMatrix ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs gap-2">
                <div className="text-4xl opacity-30">🔲</div>
                <p>Bắt đầu huấn luyện để xem Confusion Matrix</p>
              </div>
            ) : (
              <div className="inline-flex flex-col gap-1 min-w-max">
                <div className="flex items-center gap-0.5 pl-7">
                  <span className="text-[8px] text-slate-600 w-full text-center tracking-widest uppercase font-bold">Dự đoán (Predicted) →</span>
                </div>
                <div className="flex items-center gap-0.5">
                  <div className="w-6 shrink-0" />
                  {Array.from({ length: numClasses }, (_, i) => (
                    <div key={`hdr-${i}`} className="w-8 h-6 flex items-center justify-center text-[9px] font-bold font-mono rounded-sm shrink-0"
                      style={{ color: CELL_COLORS[i % CELL_COLORS.length], backgroundColor: `${CELL_COLORS[i % CELL_COLORS.length]}18` }}>
                      {i}
                    </div>
                  ))}
                  <div className="w-12 text-[7px] text-slate-600 text-center pl-1 shrink-0">Recall</div>
                </div>
                {confusionMatrix.map((row, i) => {
                  const rowMax = Math.max(...row, 1)
                  const color = CELL_COLORS[i % CELL_COLORS.length]
                  return (
                    <div key={`row-${i}`} className="flex items-center gap-0.5">
                      <div className="w-6 h-8 flex items-center justify-center text-[9px] font-bold font-mono rounded-sm shrink-0"
                        style={{ color, backgroundColor: `${color}18` }}>{i}</div>
                      {row.map((val, j) => {
                        const isDiag = i === j
                        const intensity = val / rowMax
                        const bgColor = val === 0 ? 'rgba(15,23,42,0.4)'
                          : isDiag ? `rgba(34,197,94,${Math.max(0.12, intensity * 0.85)})`
                          : `rgba(239,68,68,${Math.max(0.1, intensity * 0.75)})`
                        const isSelected = selectedCMCell?.trueClass === i && selectedCMCell?.predClass === j
                        return (
                          <div key={`cell-${i}-${j}`}
                            onClick={() => {
                              if (val > 0) {
                                setSelectedCMCell(isSelected ? null : { trueClass: i, predClass: j })
                                // Select first node in cell
                                if (!isSelected && val > 0) {
                                  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
                                  const snap = snapshots[epochInt]
                                  const preds = snap?.node_predictions
                                  if (preds && graphData?.nodes) {
                                    for (let nodeIdx = 0; nodeIdx < graphData.nodes.length; nodeIdx++) {
                                      if (graphData.nodes[nodeIdx].groundTruth === i && preds[nodeIdx] === j) {
                                        setSelectedNode(graphData.nodes[nodeIdx].id)
                                        break
                                      }
                                    }
                                  }
                                }
                              }
                            }}
                            title={`Thực tế lớp ${i} → Dự đoán lớp ${j}: ${val} mẫu${val > 0 ? '\nClick để highlight' : ''}`}
                            className="w-8 h-8 flex items-center justify-center text-[10px] font-mono rounded transition-all duration-200 hover:scale-110 hover:ring-1 hover:ring-white/20 cursor-pointer shrink-0"
                            style={{ 
                              backgroundColor: bgColor, 
                              color: val === 0 ? '#1e293b' : isDiag ? '#dcfce7' : '#fee2e2', 
                              fontWeight: isDiag && val > 0 ? 'bold' : 'normal',
                              ringWidth: isSelected ? '2px' : '0px',
                              ringColor: isSelected ? '#3b82f6' : 'transparent'
                            }}>
                            {val}
                          </div>
                        )
                      })}
                      <div className="w-12 text-center shrink-0">
                        <span className="text-[9px] font-mono font-bold px-1 py-0.5 rounded"
                          style={{ color: parseInt(perClassAcc[i]) > 70 ? '#4ade80' : parseInt(perClassAcc[i]) > 40 ? '#facc15' : '#f87171', backgroundColor: 'rgba(0,0,0,0.3)' }}>
                          {perClassAcc[i]}%
                        </span>
                      </div>
                    </div>
                  )
                })}
                <div className="mt-3 text-[8px] text-slate-600 text-center leading-relaxed">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-500/40 mr-1 align-middle" />Đúng · <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500/30 mr-1 align-middle" />Nhầm · Hover để xem chi tiết
                </div>
                {selectedCMCell && (
                  <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                    <div className="text-[9px] text-blue-300 font-bold mb-1">
                      Selected: True Class {selectedCMCell.trueClass} → Predicted Class {selectedCMCell.predClass}
                    </div>
                    <div className="text-[8px] text-slate-400">
                      {nodesInSelectedCell.length} nodes · Click topology to explore
                    </div>
                    <button
                      onClick={() => setSelectedCMCell(null)}
                      className="mt-2 text-[7px] text-slate-500 hover:text-slate-300 underline"
                    >
                      Clear selection
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}


      </div>
    </div>
  )
}
