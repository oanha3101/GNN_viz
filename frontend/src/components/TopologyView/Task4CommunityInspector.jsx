import React, { useMemo } from 'react'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { buildBridgeRanking, buildStabilityMatrix, computeAggregateStability } from '../../utils/task4Metrics'
import { getCommunityColor } from '../../utils/colors'

/**
 * Task4CommunityInspector — right-rail Inspector content for Task 4. Shows
 * detailed metadata for the community selected on the canvas (or nothing
 * when the user has not yet picked a cluster).
 */
export default function Task4CommunityInspector() {
  const selectedCommunityId = useGNNStore(s => s.selectedCommunityId)
  const setSelectedCommunity = useGNNStore(s => s.setSelectedCommunity)
  const { snapshots, currentEpochFloat } = usePlayerStore()

  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]

  const stabilityInfo = useMemo(() => {
    if (!snapshots.length) return null
    const matrix = buildStabilityMatrix(snapshots)
    return {
      overall: computeAggregateStability(matrix),
      perCommunity: matrix.matrix.map((row) => row[epochInt] ?? 1),
    }
  }, [snapshots, epochInt])

  const bridges = useMemo(
    () => buildBridgeRanking(snap, 10).filter((b) => selectedCommunityId == null || b.community === selectedCommunityId),
    [snap, selectedCommunityId]
  )

  if (!snapshots.length) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 p-4 gap-2">
        <div className="text-3xl opacity-40 animate-pulse">&#8230;</div>
        <p className="text-micro text-center">Run training to inspect communities</p>
      </div>
    )
  }

  if (selectedCommunityId == null) {
    const numComms = snap?.community_sizes?.length || 0
    const totalN = (snap?.community_sizes || []).reduce((a, b) => a + b, 0)
    const modQ = snap?.modularity_q ?? 0
    return (
      <div className="h-full overflow-auto p-3 text-xs space-y-3">
        <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Community Overview</div>
        <div className="grid grid-cols-2 gap-2">
          <MetricCell label="Communities" value={numComms} />
          <MetricCell label="Nodes" value={totalN} />
          <MetricCell label="Modularity Q" value={modQ} digits={3} />
          <MetricCell label="Stability" value={stabilityInfo?.overall ?? 1} digits={3} />
        </div>
        {numComms > 0 && (
          <div className="space-y-1">
            <span className="text-[7px] text-slate-500 uppercase font-bold tracking-wider block">Per community</span>
            {(snap?.community_sizes || []).map((size, ci) => (
              <button
                key={ci}
                onClick={() => setSelectedCommunity(ci)}
                className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 border transition-colors
                  bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/50
                  hover:bg-slate-100 dark:hover:bg-slate-900/70"
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getCommunityColor(ci) }} />
                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200">C{ci}</span>
                <span className="text-[10px] font-mono text-slate-500 ml-auto">{size} nodes</span>
              </button>
            ))}
          </div>
        )}
        <p className="text-[9px] text-slate-400 dark:text-slate-600 text-center leading-relaxed">
          Click a community above or a node on the canvas to inspect details.
        </p>
      </div>
    )
  }

  const metrics = snap?.per_community_metrics?.[selectedCommunityId]
  const color = getCommunityColor(selectedCommunityId)
  const preds = snap?.node_predictions_aligned ?? snap?.node_predictions ?? []
  const nodesInComm = preds
    .map((cid, idx) => (cid === selectedCommunityId ? idx : null))
    .filter((x) => x != null)

  return (
    <div className="h-full overflow-auto p-3 text-xs space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full shadow-[0_0_8px] shadow-current" style={{ color, backgroundColor: color }} />
          <span className="text-sm font-bold text-white">Community {selectedCommunityId}</span>
        </div>
        <button
          onClick={() => setSelectedCommunity(null)}
          className="text-nano text-slate-400 hover:text-white font-bold uppercase tracking-ultra"
        >
          Clear
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MetricCell label="Size" value={metrics?.size ?? nodesInComm.length} />
        <MetricCell label="Density" value={metrics?.density} digits={3} />
        <MetricCell label="Conductance" value={metrics?.conductance} digits={3} />
        <MetricCell label="Stability" value={stabilityInfo?.perCommunity?.[selectedCommunityId]} digits={3} />
        <MetricCell label="Internal" value={metrics?.internal_edges} />
        <MetricCell label="External" value={metrics?.external_edges} />
      </div>

      <div>
        <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra block mb-1.5">Bridges in this community</span>
        {bridges.length === 0 ? (
          <div className="text-nano text-slate-600">None flagged</div>
        ) : (
          <div className="space-y-1">
            {bridges.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="w-5 h-5 rounded-sm flex items-center justify-center bg-slate-800 text-nano font-bold text-slate-100 shrink-0">
                    {b.id}
                  </div>
                  <div className="h-1 flex-1 bg-slate-800/50 rounded-full overflow-hidden">
                    <div className="h-full bg-white/60" style={{ width: `${Math.max(0, Math.min(1, b.strength)) * 100}%` }} />
                  </div>
                </div>
                <span className="text-nano font-bold font-mono text-slate-200 tabular-nums shrink-0">
                  {b.strength.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra block mb-1.5">Nodes ({nodesInComm.length})</span>
        <div className="flex flex-wrap gap-1">
          {nodesInComm.slice(0, 40).map((id) => (
            <span key={id} className="inline-flex items-center justify-center w-6 h-5 rounded-sm bg-slate-800 text-nano font-mono text-slate-200">
              {id}
            </span>
          ))}
          {nodesInComm.length > 40 && (
            <span className="text-nano text-slate-500 font-mono">+{nodesInComm.length - 40}</span>
          )}
        </div>
      </div>

      {/* Node Migration Flow section */}
      {epochInt > 0 && (
        <div className="mt-8 pt-4 border-t border-slate-800/80">
          <div className="flex items-center justify-between mb-2">
            <span className="text-nano text-amber-500 uppercase font-black tracking-widest">
              NODE MIGRATION FLOW
            </span>
            <span className="text-[10px] text-slate-500 font-mono italic">Epoch {epochInt}</span>
          </div>

          <div className="bg-slate-900/40 rounded-lg p-2 border border-amber-500/10">
            {(() => {
              const prevSnap = snapshots[epochInt - 1]
              const prevPreds = prevSnap?.node_predictions_aligned ?? prevSnap?.node_predictions ?? []
              const migrants = nodesInComm.filter(id => prevPreds[id] !== selectedCommunityId)

              if (migrants.length === 0) {
                return (
                  <div className="py-2 text-center">
                    <span className="text-[10px] text-slate-600 font-medium italic">
                      No migrations this epoch
                    </span>
                  </div>
                )
              }

              return (
                <div className="flex flex-wrap gap-1.5">
                  {migrants.slice(0, 20).map(id => (
                    <div key={id} className="group relative flex items-center gap-1 px-2 py-1 rounded bg-amber-500/5 border border-amber-500/20 text-nano font-mono text-amber-300">
                      <span className="font-bold">#{id}</span>
                      <span className="text-slate-600 opacity-60">&larr;</span>
                      <span className="text-amber-500/70">C{prevPreds[id]}</span>
                    </div>
                  ))}
                  {migrants.length > 20 && (
                    <span className="text-nano text-slate-600 self-center pl-1">
                      + {migrants.length - 20} more
                    </span>
                  )}
                </div>
              )
            })()}
          </div>
          <p className="mt-2 text-[9px] text-slate-600 leading-tight">
            Nodes that switched into this community from others.
          </p>
        </div>
      )}
    </div>
  )
}

function MetricCell({ label, value, digits = 0 }) {
  const display = Number.isFinite(value)
    ? (digits > 0 ? value.toFixed(digits) : `${value}`)
    : '—'
  return (
    <div className="rounded-lg px-2 py-1.5 border bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800/50">
      <span className="text-[7px] text-slate-500 uppercase font-bold tracking-wider block">{label}</span>
      <span className="text-sm font-bold font-mono text-slate-800 dark:text-slate-100 tabular-nums">{display}</span>
    </div>
  )
}
