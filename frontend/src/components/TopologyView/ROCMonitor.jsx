import React, { useMemo, useState } from 'react'
import Plot from 'react-plotly.js'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'

export default function ROCMonitor() {
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const taskData = useGNNStore((s) => s.taskData)
  const [viewMode, setViewMode] = useState('roc') // 'roc' | 'pr' | 'dist'

  const { rocData, prData, distData, auc, prAuc } = useMemo(() => {
    if (snapshots.length === 0 || !taskData?.testEdges)
      return { rocData: null, prData: null, distData: null, auc: 0.5, prAuc: 0 }

    const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
    const snap = snapshots[epochInt]
    const scores = snap?.edge_scores || []
    const testEdges = taskData.testEdges

    const paired = scores.map((s, i) => ({ s, y: testEdges[i]?.exists ? 1 : 0 }))
    paired.sort((a, b) => b.s - a.s)

    const totalPos = paired.filter(p => p.y === 1).length
    const totalNeg = paired.length - totalPos

    if (totalPos === 0 || totalNeg === 0)
      return { rocData: null, prData: null, auc: 0.5, prAuc: 0 }

    // ── ROC Curve ─────────────────────────────────
    const tpr = [0], fpr = [0]
    let curTP = 0, curFP = 0
    paired.forEach(p => {
      if (p.y === 1) curTP++
      else curFP++
      tpr.push(curTP / totalPos)
      fpr.push(curFP / totalNeg)
    })

    // AUC (trapezoidal)
    let aucVal = 0
    for (let i = 1; i < fpr.length; i++) {
      aucVal += (fpr[i] - fpr[i - 1]) * (tpr[i] + tpr[i - 1]) / 2
    }

    const rocData = [
      {
        x: fpr, y: tpr,
        type: 'scatter', mode: 'lines',
        name: 'ROC',
        line: { color: '#3b82f6', width: 3, shape: 'hv' },
        fill: 'tozeroy', fillcolor: 'rgba(59, 130, 246, 0.1)'
      },
      {
        x: [0, 1], y: [0, 1],
        type: 'scatter', mode: 'lines',
        name: 'Random',
        line: { color: 'rgba(148, 163, 184, 0.3)', width: 1, dash: 'dash' }
      }
    ]

    // ── Precision-Recall Curve ────────────────────
    const precision = [], recall = []
    let tp2 = 0, fp2 = 0
    paired.forEach(p => {
      if (p.y === 1) tp2++
      else fp2++
      const prec = tp2 / (tp2 + fp2)
      const rec = tp2 / totalPos
      precision.push(prec)
      recall.push(rec)
    })

    // PR AUC (trapezoidal)
    let prAucVal = 0
    for (let i = 1; i < recall.length; i++) {
      prAucVal += (recall[i] - recall[i - 1]) * (precision[i] + precision[i - 1]) / 2
    }

    const prData = [
      {
        x: recall, y: precision,
        type: 'scatter', mode: 'lines',
        name: 'PR',
        line: { color: '#a855f7', width: 3, shape: 'hv' },
        fill: 'tozeroy', fillcolor: 'rgba(168, 85, 247, 0.1)'
      },
      {
        x: [0, 1], y: [totalPos / paired.length, totalPos / paired.length],
        type: 'scatter', mode: 'lines',
        name: 'Baseline',
        line: { color: 'rgba(148, 163, 184, 0.3)', width: 1, dash: 'dash' }
      }
    ]

    // ── Score Distribution Histogram ──────────────
    const posScores = paired.filter(p => p.y === 1).map(p => p.s)
    const negScores = paired.filter(p => p.y === 0).map(p => p.s)
    const distData = [
      {
        x: posScores,
        type: 'histogram',
        name: 'Positive Edges',
        opacity: 0.7,
        marker: { color: '#22c55e' }
      },
      {
        x: negScores,
        type: 'histogram',
        name: 'Negative Edges',
        opacity: 0.7,
        marker: { color: '#ef4444' }
      }
    ]

    return { rocData, prData, distData, auc: aucVal, prAuc: prAucVal }
  }, [snapshots, currentEpochFloat, taskData])

  const snapAuc = snapshots[Math.floor(currentEpochFloat)]?.auc || auc

  return (
    <div className="h-full flex flex-col p-3 bg-slate-950">
      {/* Header with tabs */}
      <div className="flex justify-between items-center mb-2">
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode('roc')}
            className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all
              ${viewMode === 'roc'
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'text-slate-500 hover:text-slate-300'}`}
          >
            ROC
          </button>
          <button
            onClick={() => setViewMode('pr')}
            className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all
              ${viewMode === 'pr'
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                : 'text-slate-500 hover:text-slate-300'}`}
          >
            PR
          </button>
          <button
            onClick={() => setViewMode('dist')}
            className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all
              ${viewMode === 'dist'
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                : 'text-slate-500 hover:text-slate-300'}`}
          >
            DIST
          </button>
        </div>
        {viewMode !== 'dist' && (
          <span className={`text-sm font-mono font-bold ${(viewMode === 'roc' ? snapAuc : prAuc) > 0.8 ? 'text-green-400' : 'text-yellow-400'}`}>
            {viewMode === 'roc' ? 'AUC' : 'PR-AUC'}: {(viewMode === 'roc' ? snapAuc : prAuc).toFixed(3)}
          </span>
        )}
      </div>
      <div className="flex-1 bg-slate-900/30 rounded-xl border border-slate-800/50 overflow-hidden">
        <Plot
          data={(viewMode === 'roc' ? rocData : viewMode === 'pr' ? prData : distData) || []}
          layout={{
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            margin: { l: 25, r: 10, t: 10, b: 25 },
            barmode: viewMode === 'dist' ? 'overlay' : 'group',
            xaxis: {
              title: viewMode === 'roc' ? 'FPR' : viewMode === 'pr' ? 'Recall' : 'Score',
              color: '#475569', gridcolor: '#1e293b', zeroline: false, range: [0, 1]
            },
            yaxis: {
              title: viewMode === 'roc' ? 'TPR' : viewMode === 'pr' ? 'Precision' : 'Count',
              color: '#475569', gridcolor: '#1e293b', zeroline: false, range: viewMode === 'dist' ? undefined : [0, 1]
            },
            showlegend: viewMode === 'dist',
            legend: { x: 0.5, y: 1.1, xanchor: 'center', orientation: 'h', font: { color: '#94a3b8', size: 10 } }
          }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}
