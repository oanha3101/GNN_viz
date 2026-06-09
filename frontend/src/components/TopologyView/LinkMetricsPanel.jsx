import React, { useMemo } from 'react'
import { useLanguage } from '../../contexts/LanguageContext'
import usePlayerStore from '../../store/playerStore'
import useGNNStore from '../../store/useGNNStore'
import { getTask3Copy } from '../../utils/task3I18n'
import { pairScores, topKHardEdges } from '../../utils/task3Metrics'
import { buildTask3ReasoningPack } from '../../utils/task3Reasoning'

export default function LinkMetricsPanel() {
  const { lang } = useLanguage()
  const copy = useMemo(() => getTask3Copy(lang), [lang])
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const taskData = useGNNStore((s) => s.taskData)
  const graphData = useGNNStore((s) => s.graphData)
  const groundTruth = useGNNStore((s) => s.groundTruth)
  const focusedEdgeIdx = useGNNStore((s) => s.focusedEdgeIdx)
  const setFocusedEdge = useGNNStore((s) => s.setFocusedEdge)

  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]
  const paired = useMemo(
    () => pairScores(snap?.edge_scores || [], taskData?.testEdges || []),
    [snap, taskData],
  )
  const reasoningPack = useMemo(
    () => buildTask3ReasoningPack({ paired, graphData, snapshots, groundTruth, snapshot: snap, lang }),
    [paired, graphData, snapshots, groundTruth, snap, lang],
  )
  const hard = useMemo(() => topKHardEdges(paired, 4, 0.5), [paired])
  const selected = useMemo(() => {
    const preferred =
      reasoningPack.enriched.find((row) => row.idx === focusedEdgeIdx)
      || hard.falsePositives[0]
      || hard.falseNegatives[0]
      || reasoningPack.ambiguous[0]
      || reasoningPack.enriched[0]
      || null

    return preferred
      ? reasoningPack.enriched.find((row) => row.idx === preferred.idx) || null
      : null
  }, [focusedEdgeIdx, hard, reasoningPack])

  if (snapshots.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 text-[10px] p-4">
        <div className="text-3xl mb-3 opacity-40 animate-pulse">...</div>
        <p className="text-center">{copy.empty.edgeReasoningLoading}</p>
      </div>
    )
  }

  const auc = snap?.auc ?? 0.5
  const shortlist = [...hard.falsePositives, ...hard.falseNegatives]
    .map((row) => reasoningPack.enriched.find((candidate) => candidate.idx === row.idx) || row)
    .slice(0, 4)

  return (
    <div className="h-full flex flex-col p-3 text-xs overflow-auto bg-slate-950 gap-3">
      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
        {copy.labels.evidenceCard}
      </h3>

      <div className="grid grid-cols-2 gap-2">
        <Card label={copy.labels.auc} value={auc.toFixed(3)} tone={auc > 0.85 ? 'text-emerald-300' : 'text-amber-300'} />
        <Card label={copy.labels.focusedEdge} value={selected ? `${selected.source}-${selected.target}` : '-'} tone="text-cyan-300" />
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <div className="border-b border-slate-800 px-3 py-2 text-[11px] font-semibold text-slate-200">
          {copy.labels.evidenceCard}
        </div>
        <div className="p-3 space-y-2">
          {selected ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Chip label={copy.labels.mutualNeighbors} value={selected.metrics?.commonNeighbors ?? 0} />
                <Chip label={copy.labels.shortestPath} value={selected.metrics?.shortestPath ?? '>4'} />
                <Chip label={copy.labels.embeddingSim} value={selected.metrics?.embeddingSimilarity?.toFixed?.(2) ?? '0.00'} />
                <Chip label={copy.labels.flips} value={selected.stability?.flipCount ?? 0} />
                <Chip label={copy.labels.severity} value={selected.severityScore?.toFixed?.(1) ?? '-'} />
                <Chip label={copy.labels.supportLevel} value={selected.supportLevelLabel ?? '-'} />
              </div>
              {selected.takeaway && (
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-nano leading-relaxed text-cyan-50">
                  <div className="font-semibold">{copy.labels.takeaway}</div>
                  <div className="mt-1">{selected.takeaway}</div>
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                {selected.dominantFailureModeLabel && <Tag label={selected.dominantFailureModeLabel} />}
                {selected.rootCauseTagLabels?.map((tag) => (
                  <Tag key={tag} label={tag} />
                ))}
              </div>
              {selected.warnings?.length > 0 && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-nano leading-relaxed text-amber-50">
                  <div className="font-semibold">{copy.labels.topologyWarning}</div>
                  {selected.warnings.map((warning) => (
                    <div key={warning}>• {warning}</div>
                  ))}
                </div>
              )}
              <EvidenceBullets bullets={selected.evidenceBullets} />
            </>
          ) : (
            <p className="text-nano text-slate-500">{copy.empty.chooseEdge}</p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <div className="border-b border-slate-800 px-3 py-2 text-[11px] font-semibold text-slate-200">
          {copy.labels.failureShortlist}
        </div>
        <div className="divide-y divide-slate-800/80">
          {shortlist.map((row) => (
            <button
              key={row.idx}
              onClick={() => setFocusedEdge(row.idx)}
              className="w-full px-3 py-2 text-left hover:bg-slate-800/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-mono text-micro text-slate-100">{row.source} - {row.target}</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {row.dominantFailureModeLabel && <Tag label={row.dominantFailureModeLabel} />}
                    {row.rootCauseTagLabels?.slice(0, 3).map((tag) => (
                      <Tag key={tag} label={tag} />
                    ))}
                  </div>
                  {row.takeaway && (
                    <p className="mt-1 text-nano leading-relaxed text-slate-400">{row.takeaway}</p>
                  )}
                </div>
                <span className="font-mono text-nano text-cyan-300">{Number(row.score ?? 0).toFixed(3)}</span>
              </div>
            </button>
          ))}
          {!shortlist.length && (
            <div className="px-3 py-3 text-nano text-slate-500">{copy.empty.noHardEdge}</div>
          )}
        </div>
      </section>
    </div>
  )
}

function Card({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
      <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${tone}`}>{value}</div>
    </div>
  )
}

function Chip({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-2 py-2">
      <div className="text-[9px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-100">{value}</div>
    </div>
  )
}

function Tag({ label }) {
  return (
    <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-cyan-200">
      {label}
    </span>
  )
}

function EvidenceBullets({ bullets }) {
  if (!bullets?.length) return null
  return (
    <div className="grid gap-1">
      {bullets.map((bullet) => (
        <div key={bullet.key} className="rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-200">{bullet.label}</span>
          <span className="ml-2 text-nano leading-relaxed text-slate-300">{bullet.value}</span>
        </div>
      ))}
    </div>
  )
}
