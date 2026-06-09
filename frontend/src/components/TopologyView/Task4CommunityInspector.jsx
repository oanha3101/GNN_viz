import React, { useMemo } from 'react'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import {
  buildBridgeRanking,
  buildStabilityMatrix,
  computeAggregateStability,
  buildTask4NodeProfile,
} from '../../utils/task4Metrics'
import { getCommunityColor } from '../../utils/colors'
import { getTask4Copy } from '../../utils/task4I18n'

export default function Task4CommunityInspector() {
  const copy = getTask4Copy()
  const selectedCommunityId = useGNNStore((s) => s.selectedCommunityId)
  const setSelectedCommunity = useGNNStore((s) => s.setSelectedCommunity)
  const selectedNodeId = useGNNStore((s) => s.selectedNodeId)
  const setSelectedNode = useGNNStore((s) => s.setSelectedNode)
  const graphData = useGNNStore((s) => s.graphData)
  const communityGroundTruth = useGNNStore((s) => s.communityGroundTruth)
  const { snapshots, currentEpochFloat } = usePlayerStore()

  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]
  const prevSnap = epochInt > 0 ? snapshots[epochInt - 1] : null

  const selectedNodeProfile = useMemo(
    () => buildTask4NodeProfile({ snap, prevSnap, nodeId: selectedNodeId, graphData, communityGroundTruth }),
    [snap, prevSnap, selectedNodeId, graphData, communityGroundTruth]
  )

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
        <p className="text-micro text-center">{copy.empty.inspector}</p>
      </div>
    )
  }

  if (selectedCommunityId == null) {
    const numComms = snap?.community_sizes?.length || 0
    const totalN = (snap?.community_sizes || []).reduce((a, b) => a + b, 0)
    const modQ = snap?.modularity_q ?? 0
    return (
      <div className="h-full overflow-auto p-3 text-xs space-y-3">
        <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">{copy.labels.communityOverview}</div>
        <div className="grid grid-cols-2 gap-2">
          <MetricCell label={copy.labels.communities} value={numComms} />
          <MetricCell label={copy.labels.nodes} value={totalN} />
          <MetricCell label={copy.labels.modularity} value={modQ} digits={3} />
          <MetricCell label={copy.labels.stability} value={stabilityInfo?.overall ?? 1} digits={3} />
        </div>
        {numComms > 0 && (
          <div className="space-y-1">
            <span className="text-[7px] text-slate-500 uppercase font-bold tracking-wider block">{copy.labels.perCommunity}</span>
            {(snap?.community_sizes || []).map((size, ci) => (
              <button
                key={ci}
                onClick={() => setSelectedCommunity(ci)}
                className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 border transition-colors bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-900/70"
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getCommunityColor(ci) }} />
                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200">C{ci}</span>
                <span className="text-[10px] font-mono text-slate-500 ml-auto">{size} {copy.labels.nodesInCommunity.toLowerCase()}</span>
              </button>
            ))}
          </div>
        )}
        {selectedNodeProfile && (
          <SelectedNodeEvidence copy={copy} profile={selectedNodeProfile} onClear={() => setSelectedNode(null)} />
        )}
        <p className="text-[9px] text-slate-400 dark:text-slate-600 text-center leading-relaxed">
          {copy.labels.actionHint}
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
          <span className="text-sm font-bold text-white">{copy.labels.community} {selectedCommunityId}</span>
        </div>
        <button
          onClick={() => setSelectedCommunity(null)}
          className="text-nano text-slate-400 hover:text-white font-bold uppercase tracking-ultra"
        >
          {copy.labels.clear}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MetricCell label={copy.labels.size} value={metrics?.size ?? nodesInComm.length} />
        <MetricCell label={copy.labels.density} value={metrics?.density} digits={3} />
        <MetricCell label={copy.labels.conductance} value={metrics?.conductance} digits={3} />
        <MetricCell label={copy.labels.stability} value={stabilityInfo?.perCommunity?.[selectedCommunityId]} digits={3} />
        <MetricCell label={copy.labels.internal} value={metrics?.internal_edges} />
        <MetricCell label={copy.labels.external} value={metrics?.external_edges} />
      </div>

      {selectedNodeProfile && selectedNodeProfile.community === selectedCommunityId && (
        <SelectedNodeEvidence copy={copy} profile={selectedNodeProfile} onClear={() => setSelectedNode(null)} />
      )}

      <div>
        <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra block mb-1.5">{copy.labels.bridgesInCommunity}</span>
        {bridges.length === 0 ? (
          <div className="text-nano text-slate-600">{copy.empty.bridges}</div>
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
        <span className="text-nano text-slate-500 uppercase font-bold tracking-ultra block mb-1.5">{copy.labels.nodesInCommunity} ({nodesInComm.length})</span>
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

      {epochInt > 0 && (
        <div className="mt-8 pt-4 border-t border-slate-800/80">
          <div className="flex items-center justify-between mb-2">
            <span className="text-nano text-amber-500 uppercase font-black tracking-widest">
              {copy.labels.migrationFlow}
            </span>
            <span className="text-[10px] text-slate-500 font-mono italic">Epoch {epochInt}</span>
          </div>

          <div className="bg-slate-900/40 rounded-lg p-2 border border-amber-500/10">
            {(() => {
              const previous = snapshots[epochInt - 1]
              const prevPreds = previous?.node_predictions_aligned ?? previous?.node_predictions ?? []
              const migrants = nodesInComm.filter((id) => prevPreds[id] !== selectedCommunityId)

              if (migrants.length === 0) {
                return (
                  <div className="py-2 text-center">
                    <span className="text-[10px] text-slate-600 font-medium italic">
                      {copy.labels.noMigrations}
                    </span>
                  </div>
                )
              }

              return (
                <div className="flex flex-wrap gap-1.5">
                  {migrants.slice(0, 20).map((id) => (
                    <div key={id} className="group relative flex items-center gap-1 px-2 py-1 rounded bg-amber-500/5 border border-amber-500/20 text-nano font-mono text-amber-300">
                      <span className="font-bold">#{id}</span>
                      <span className="text-slate-600 opacity-60">&larr;</span>
                      <span className="text-amber-500/70">C{prevPreds[id]}</span>
                    </div>
                  ))}
                  {migrants.length > 20 && (
                    <span className="text-nano text-slate-600 self-center pl-1">
                      + {migrants.length - 20} {copy.labels.nodesInCommunity.toLowerCase()}
                    </span>
                  )}
                </div>
              )
            })()}
          </div>
          <p className="mt-2 text-[9px] text-slate-600 leading-tight">
            {copy.labels.migrationFlow}: {copy.labels.fromCommunity.toLowerCase()} khac vao cum nay.
          </p>
        </div>
      )}
    </div>
  )
}

function MetricCell({ label, value, digits = 0 }) {
  const display = Number.isFinite(value)
    ? (digits > 0 ? value.toFixed(digits) : `${value}`)
    : '-'
  return (
    <div className="rounded-lg px-2 py-1.5 border bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800/50">
      <span className="text-[7px] text-slate-500 uppercase font-bold tracking-wider block">{label}</span>
      <span className="text-sm font-bold font-mono text-slate-800 dark:text-slate-100 tabular-nums">{display}</span>
    </div>
  )
}

function nodeTakeaway(profile) {
  if (profile.isBridge && profile.crossCommunityNeighbors > 0) {
    return `Node #${profile.id} la node bien: noi ${profile.crossCommunityNeighbors} lang gieng khac cum, nen co the lam ro ri cong dong.`
  }
  if (Number.isFinite(profile.silhouette) && profile.silhouette < 0.2) {
    return `Node #${profile.id} nam chua chac trong cum hien tai vi silhouette thap.`
  }
  return `Node #${profile.id} dang thuoc loi tuong doi on cua cong dong ${profile.community}.`
}

function SelectedNodeEvidence({ copy, profile, onClear }) {
  if (!profile) return null
  return (
    <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-nano text-cyan-500 uppercase font-black tracking-ultra">
          {copy.labels.selectedNode} #{profile.id}
        </span>
        <button
          onClick={onClear}
          className="text-nano text-slate-500 hover:text-cyan-400 font-bold uppercase tracking-ultra"
        >
          {copy.labels.clear}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MetricCell label={copy.labels.community} value={profile.community} />
        <MetricCell label="Ground truth" value={profile.groundTruth} />
        <MetricCell label={copy.labels.degree} value={profile.degree} />
        <MetricCell
          label="Status"
          value={profile.groundTruth == null ? null : (profile.isMismatch ? 'Mismatch' : 'Match')}
        />
        <MetricCell label={copy.labels.confidence} value={Number.isFinite(profile.confidence) ? profile.confidence * 100 : null} digits={1} />
        <MetricCell label={copy.labels.silhouette} value={profile.silhouette} digits={3} />
        <MetricCell label={copy.labels.bridge} value={Number.isFinite(profile.bridgeStrength) ? profile.bridgeStrength * 100 : null} digits={1} />
        <MetricCell label={copy.labels.crossNeighbors} value={profile.crossCommunityNeighbors} />
      </div>
      <div className="text-[10px] leading-snug text-cyan-100/85">{nodeTakeaway(profile)}</div>
      {profile.migrated && (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1 text-[10px] text-amber-400 font-mono">
          {copy.labels.movedThisEpoch} C{profile.previousCommunity} -&gt; C{profile.community}.
        </div>
      )}
      {Number.isFinite(profile.localSmoothness) && (
        <div className="text-[9px] text-slate-500 leading-snug">
          {copy.labels.localSmoothness}: <span className="font-mono text-slate-300">{profile.localSmoothness.toFixed(4)}</span>
        </div>
      )}
    </div>
  )
}
