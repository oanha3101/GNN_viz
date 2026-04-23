import React, { useMemo, useState, useEffect } from 'react'
import usePlayerStore from '../../store/playerStore'
import useGNNStore from '../../store/useGNNStore'
import MetricsChart from './MetricsChart'
import Task2ConfusionMatrix from './Task2ConfusionMatrix'
import Task2HardCases from './Task2HardCases'
import Task2Diagnostics from './Task2Diagnostics'
import EmptyState from '../primitives/EmptyState'

const GRAPH_CLASS_NAMES = ['Dense', 'Sparse']

const TABS = [
  { id: 'trends', label: 'Trends' },
  { id: 'heatmap', label: 'Batch heatmap' },
  { id: 'confusion', label: 'Confusion' },
  { id: 'diagnostics', label: 'Diagnostics' },
]

export default function Task2MetricsPanel() {
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const taskData = useGNNStore((s) => s.taskData)
  const setSelectedNode = useGNNStore((s) => s.setSelectedNode)
  const selectedNodeId = useGNNStore((s) => s.selectedNodeId)

  const [viewMode, setViewMode] = useState('trends')
  const [lastSnapshotCount, setLastSnapshotCount] = useState(0)
  const [selectedCell, setSelectedCell] = useState(null)

  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]

  const graphs = taskData?.graphs || []
  const groundTruth = useMemo(() => graphs.map((g) => g?.groundTruth), [graphs])

  const currentAccuracy = useMemo(() => {
    if (!snap?.graph_correct?.length) return null
    const correct = snap.graph_correct.reduce((s, v) => s + v, 0)
    return (correct / snap.graph_correct.length) * 100
  }, [snap])

  // Auto-jump to Batch heatmap the first time data arrives so the user sees
  // the live signal without hunting for the tab.
  useEffect(() => {
    if (
      snapshots.length > 0 &&
      lastSnapshotCount === 0 &&
      snap?.graph_correct?.length > 0 &&
      viewMode === 'trends'
    ) {
      setViewMode('heatmap')
    }
    setLastSnapshotCount(snapshots.length)
  }, [snapshots.length, lastSnapshotCount, snap, viewMode])

  return (
    <div className="w-full h-full flex flex-col bg-panel">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 pt-2 pb-1.5 border-b border-slate-800/60 shrink-0 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setViewMode(t.id)}
            className={`px-2.5 py-1 rounded-md text-micro font-bold uppercase tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/50 ${
              viewMode === t.id
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            {t.label}
          </button>
        ))}
        {currentAccuracy != null && (
          <span className="ml-auto text-nano font-mono font-bold text-emerald-400 tabular-nums">
            Epoch {epochInt} · Acc {currentAccuracy.toFixed(1)}%
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-auto p-3">
        {viewMode === 'trends' && <MetricsChart />}

        {viewMode === 'heatmap' && (
          <BatchHeatmap
            snap={snap}
            snapshots={snapshots}
            epochInt={epochInt}
            graphs={graphs}
            selectedId={selectedNodeId}
            onSelect={setSelectedNode}
          />
        )}

        {viewMode === 'confusion' && (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}
          >
            <div className="min-w-0">
              <Task2ConfusionMatrix
                predictions={snap?.graph_predictions}
                groundTruth={groundTruth}
                classNames={GRAPH_CLASS_NAMES}
                selectedCell={selectedCell}
                onSelectCell={(pred, gt) =>
                  setSelectedCell((prev) => (prev && prev.pred === pred && prev.gt === gt ? null : { pred, gt }))
                }
              />
            </div>
            <div className="min-w-0">
              <h4 className="text-nano uppercase tracking-ultra text-slate-500 mb-2">
                Hardest cases (smallest margin)
              </h4>
              <Task2HardCases
                snap={snap}
                graphs={graphs}
                classNames={GRAPH_CLASS_NAMES}
                k={10}
                selectedId={selectedNodeId}
                onSelect={setSelectedNode}
              />
            </div>
          </div>
        )}

        {viewMode === 'diagnostics' && (
          <Task2Diagnostics
            snap={snap}
            graphs={graphs}
            selectedId={selectedNodeId}
            onSelect={setSelectedNode}
          />
        )}
      </div>
    </div>
  )
}

function BatchHeatmap({ snap, snapshots, epochInt, graphs, selectedId, onSelect }) {
  const { heatmapRows, graphLabels, numGraphs } = useMemo(() => {
    if (!snapshots?.length) return { heatmapRows: [], graphLabels: [], numGraphs: 0 }
    const nG = snap?.graph_correct?.length || snapshots.find((s) => s.graph_correct)?.graph_correct?.length || 0
    if (!nG) return { heatmapRows: [], graphLabels: [], numGraphs: 0 }

    const step = Math.max(1, Math.floor(snapshots.length / 20))
    const rows = []
    for (let i = 0; i < snapshots.length; i += step) {
      const s = snapshots[i]
      rows.push({ epoch: i, data: s.graph_correct || new Array(nG).fill(null) })
    }
    if (snap?.graph_correct) {
      rows.push({ epoch: epochInt, data: snap.graph_correct, isCurrent: true })
    }

    const labels = graphs.length
      ? graphs.map((_, i) => `G${i}`)
      : Array.from({ length: nG }, (_, i) => `G${i}`)

    return { heatmapRows: rows, graphLabels: labels, numGraphs: nG }
  }, [snapshots, snap, epochInt, graphs])

  if (!numGraphs) {
    return (
      <EmptyState
        title="Chưa có snapshots"
        description="Bắt đầu huấn luyện Task 2 để xem Batch Accuracy Heatmap (mỗi ô = 1 đồ thị)."
      />
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-nano text-slate-400 leading-relaxed">
        Mỗi ô = 1 đồ thị trong batch · <span className="text-emerald-400">xanh</span> = đúng ·{' '}
        <span className="text-red-400">đỏ</span> = sai · Hàng = Graph, Cột = Epoch checkpoint.
      </p>
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="inline-flex flex-col gap-0.5 min-w-max">
          <div className="flex gap-0.5 items-center">
            <div className="w-8 shrink-0" />
            {heatmapRows.map((row, ci) => (
              <div
                key={ci}
                className={`w-5 text-center text-nano font-mono shrink-0 ${
                  row.isCurrent ? 'text-cyan-300 font-bold' : 'text-slate-600'
                }`}
              >
                {row.epoch}
              </div>
            ))}
          </div>

          {Array.from({ length: numGraphs }, (_, gi) => {
            const isSelected = selectedId === gi
            return (
              <div
                key={gi}
                onClick={() => onSelect?.(gi)}
                className={`flex gap-0.5 items-center cursor-pointer transition-colors rounded-sm hover:bg-white/5 ${
                  isSelected ? 'bg-cyan-500/10 ring-1 ring-cyan-500/30' : ''
                }`}
              >
                <div
                  className={`w-8 text-right text-nano font-mono shrink-0 pr-1 ${
                    isSelected ? 'text-cyan-300 font-bold' : 'text-slate-500'
                  }`}
                >
                  {graphLabels[gi]}
                </div>
                {heatmapRows.map((row, ci) => {
                  const val = row.data[gi]
                  return (
                    <div
                      key={ci}
                      title={`Graph ${gi} · Epoch ${row.epoch}: ${val === 1 ? '✓ đúng' : val === 0 ? '✗ sai' : '?'}`}
                      className={`w-5 h-5 rounded-sm shrink-0 transition-all ${
                        row.isCurrent
                          ? isSelected
                            ? 'ring-2 ring-cyan-400'
                            : 'ring-1 ring-cyan-500/40'
                          : ''
                      }`}
                      style={{
                        backgroundColor:
                          val === 1
                            ? `rgba(34,197,94,${row.isCurrent ? 0.9 : isSelected ? 0.7 : 0.5})`
                            : val === 0
                              ? `rgba(239,68,68,${row.isCurrent ? 0.8 : isSelected ? 0.6 : 0.4})`
                              : 'rgba(15,23,42,0.6)',
                      }}
                    />
                  )
                })}
              </div>
            )
          })}

          {/* Accuracy strip */}
          <div className="flex gap-0.5 items-center mt-1">
            <div className="w-8 text-right text-nano font-mono text-slate-600 shrink-0 pr-1">acc</div>
            {heatmapRows.map((row, ci) => {
              const correct = row.data.filter((v) => v === 1).length
              const pct = row.data.length > 0 ? correct / row.data.length : 0
              return (
                <div key={ci} className="w-5 flex flex-col items-center shrink-0">
                  <div className="w-full h-6 bg-slate-800/50 rounded-sm overflow-hidden flex flex-col-reverse">
                    <div
                      style={{
                        height: `${pct * 100}%`,
                        backgroundColor: pct > 0.8 ? '#22c55e' : pct > 0.5 ? '#eab308' : '#ef4444',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
