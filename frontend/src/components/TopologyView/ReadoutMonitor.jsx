import { useMemo, useEffect, useRef } from 'react'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { useLanguage } from '../../contexts/LanguageContext'
import { interpolateSnapshots } from '../../engine/interpolate'
import {
  buildTask2FocusBuckets,
  buildTask2GraphDescriptors,
  buildTask2GraphEpochFrame,
  buildTask2GraphEpochHistory,
  buildTask2ModelSignature,
  formatTask2ClassLabel,
  getTask2DescriptorById,
  sortTask2Descriptors,
} from '../../utils/task2Metrics'
import { localizeTask2Element } from '../../utils/task2ReportI18n'

function buildGraphClassNames(graphs = [], taskClassNames = []) {
  if (Array.isArray(taskClassNames) && taskClassNames.length) {
    return taskClassNames
  }
  const seen = new Set()
  for (const graph of graphs) {
    if (Number.isInteger(graph?.groundTruth)) seen.add(graph.groundTruth)
  }
  return [...seen].sort((a, b) => a - b).map((classId) => `Class ${classId}`)
}

function MiniSparkline({ values = [], tone = '#22d3ee', label = 'sparkline' }) {
  const clean = values.map((value) => (Number.isFinite(value) ? value : 0))
  const width = 120
  const height = 34
  const pad = 4
  const max = Math.max(1, ...clean)
  const min = Math.min(0, ...clean)
  const range = Math.max(0.001, max - min)
  const points = clean.map((value, index) => {
    const x = clean.length === 1 ? width / 2 : pad + (index / Math.max(1, clean.length - 1)) * (width - pad * 2)
    const y = height - pad - ((value - min) / range) * (height - pad * 2)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-9 w-full" role="img" aria-label={label}>
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="rgba(148,163,184,0.18)" />
      {points && <polyline points={points} fill="none" stroke={tone} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  )
}

function CorrectnessStrip({ history = [], currentEpochFloat = 0 }) {
  const activeIndex = Math.max(0, Math.min(history.length - 1, Math.round(currentEpochFloat)))
  return (
    <div className="flex h-7 items-end gap-1" aria-label="Correctness timeline">
      {history.map((item, index) => {
        const active = index === activeIndex
        const color = item.correct === 1 ? 'bg-emerald-400' : item.correct === 0 ? 'bg-rose-400' : 'bg-slate-600'
        return (
          <div
            key={`${item.epoch}-${index}`}
            className={`min-w-[4px] flex-1 rounded-full ${color} ${active ? 'h-7 ring-2 ring-white/70' : 'h-3 opacity-70'}`}
            title={`Epoch ${item.epoch}`}
          />
        )
      })}
    </div>
  )
}

function MetricBar({ label, value = 0, tone = 'bg-cyan-400' }) {
  const pct = Math.max(0, Math.min(1, Number(value) || 0))
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
        <span>{label}</span>
        <span className="font-mono text-slate-100">{(pct * 100).toFixed(1)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-950/70">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct * 100}%`, transition: 'width 220ms ease' }} />
      </div>
    </div>
  )
}

function StatCard({ title, children }) {
  return (
    <section className="rounded-2xl border border-line-subtle bg-deep/58 p-3 shadow-inner">
      <h4 className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{title}</h4>
      {children}
    </section>
  )
}

function ModelLens({ modelSignature }) {
  const model = modelSignature?.id || 'GCN'
  const copy = model === 'GAT'
    ? 'GAT nen lam ro mot vai nut/canh top-k: neu attention tot, entropy giam va contributor chinh noi bat dan.'
    : model === 'SAGE'
      ? 'SAGE nen on dinh theo neighborhood vote: prediction bot flip, margin day len khi cac cum lan can dong thuan.'
      : 'GCN nen lan truyen muot qua vung lien thong: cac nut gan nhau co contribution dong thuan hon theo epoch.'

  return (
    <StatCard title="Model Lens">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-black text-cyan-200">
          {model}
        </span>
        <span className="font-mono text-[11px] font-bold text-slate-100">{((modelSignature?.currentScore || 0) * 100).toFixed(0)}%</span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{copy}</p>
    </StatCard>
  )
}

export default function ReadoutMonitor({ forcedFocus = null, forcedSelectedCell = null, reportMode = false, analysisMode = false }) {
  const { lang } = useLanguage()
  const reportLang = lang
  const hoveredGraphId = useGNNStore((state) => state.hoveredGraphId)
  const setHoveredGraph = useGNNStore((state) => state.setHoveredGraph)
  const selectedNodeId = useGNNStore((state) => state.selectedNodeId)
  const taskData = useGNNStore((state) => state.taskData)
  const classNames = useGNNStore((state) => state.classNames)
  const selectedModel = useGNNStore((state) => state.selectedModel)
  const setSelectedGraph = useGNNStore((state) => state.setSelectedNode)
  const setSelectedCell = useGNNStore((state) => state.setTask2SelectedCell)
  const focusMode = useGNNStore((state) => state.task2FocusMode)
  const selectedCell = useGNNStore((state) => state.task2SelectedCell)
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const panelRootRef = useRef(null)

  const isPinned = selectedNodeId !== null
  const activeGraphId = isPinned ? selectedNodeId : hoveredGraphId
  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const frac = Math.max(0, Math.min(1, currentEpochFloat - epochInt))
  const snapA = snapshots[epochInt]
  const snapB = snapshots[epochInt + 1] || snapA

  const currSnap = useMemo(() => {
    if (!snapA) return null
    return frac > 0 && snapB ? interpolateSnapshots(snapA, snapB, frac) : snapA
  }, [snapA, snapB, frac])

  const indexedGraphs = useMemo(
    () => (taskData?.graphs || []).map((graph, index) => ({
      ...graph,
      originalGraphId: graph?.originalGraphId ?? index,
      sourceIndex: graph?.sourceIndex ?? index,
    })),
    [taskData?.graphs]
  )

  const graphClassNames = useMemo(
    () => buildGraphClassNames(indexedGraphs, taskData?.classNames || classNames),
    [indexedGraphs, taskData?.classNames, classNames]
  )

  const descriptors = useMemo(
    () => buildTask2GraphDescriptors({ snapshot: currSnap, graphs: indexedGraphs, classNames: graphClassNames }),
    [currSnap, indexedGraphs, graphClassNames]
  )
  const modelSignature = useMemo(
    () => buildTask2ModelSignature(currSnap, snapshots, descriptors, selectedModel),
    [currSnap, snapshots, descriptors, selectedModel]
  )
  const focusBuckets = useMemo(
    () => buildTask2FocusBuckets({ snapshot: currSnap, graphs: indexedGraphs, classNames: graphClassNames }),
    [currSnap, indexedGraphs, graphClassNames]
  )

  const activeFocus = focusBuckets.find((bucket) => bucket.id === focusMode) || focusBuckets[0] || {
    id: 'all',
    graphIds: descriptors.map((item) => item.originalGraphId),
  }
  const resolvedFocus = forcedFocus || activeFocus.id
  const resolvedSelectedCell = forcedSelectedCell ?? selectedCell
  const resolvedBucket = focusBuckets.find((bucket) => bucket.id === resolvedFocus) || activeFocus

  const focusDescriptors = useMemo(() => {
    if (resolvedBucket.id === 'all') return descriptors
    const idSet = new Set(resolvedBucket.graphIds)
    return descriptors.filter((descriptorItem) => idSet.has(descriptorItem.originalGraphId))
  }, [resolvedBucket, descriptors])

  const scopedDescriptors = useMemo(() => {
    if (!resolvedSelectedCell) return focusDescriptors
    return focusDescriptors.filter((descriptorItem) => (
      descriptorItem.predicted === resolvedSelectedCell.pred && descriptorItem.groundTruth === resolvedSelectedCell.gt
    ))
  }, [focusDescriptors, resolvedSelectedCell])

  const graph = useMemo(
    () => (
      getTask2DescriptorById(scopedDescriptors, activeGraphId)
      || getTask2DescriptorById(focusDescriptors, activeGraphId)
      || sortTask2Descriptors(scopedDescriptors, 'priority')[0]
      || sortTask2Descriptors(focusDescriptors, 'priority')[0]
      || null
    ),
    [scopedDescriptors, focusDescriptors, activeGraphId]
  )

  useEffect(() => {
    if (forcedSelectedCell) return undefined
    if (!resolvedSelectedCell) return undefined
    if (scopedDescriptors.length) return undefined
    setSelectedCell(null)
    return undefined
  }, [forcedSelectedCell, resolvedSelectedCell, scopedDescriptors.length, setSelectedCell])

  const frame = useMemo(
    () => buildTask2GraphEpochFrame({ snapA, snapB, currentEpochFloat, t: frac, graph, classNames: graphClassNames }),
    [snapA, snapB, currentEpochFloat, frac, graph, graphClassNames]
  )
  const history = useMemo(
    () => buildTask2GraphEpochHistory({ snapshots, graph, classNames: graphClassNames }),
    [snapshots, graph, graphClassNames]
  )

  useEffect(() => {
    if (reportLang !== 'vi' || !panelRootRef.current) return undefined
    const rafId = window.requestAnimationFrame(() => {
      localizeTask2Element(panelRootRef.current, reportLang)
    })
    return () => window.cancelAnimationFrame(rafId)
  }, [reportMode, reportLang, activeGraphId, graph?.originalGraphId, epochInt])

  if (snapshots.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 text-[10px] p-4 bg-nebula">
        <p className="text-center leading-relaxed">Hover a Task 2 embedding point<br />to inspect graph-level readout</p>
      </div>
    )
  }

  if (!graph || !frame) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 text-[10px] p-4 bg-nebula">
        <p className="text-center leading-relaxed">No graph matches the active readout slice.<br />Try a broader focus or clear the confusion cell.</p>
      </div>
    )
  }

  const gtLabel = formatTask2ClassLabel(graphClassNames, frame.groundTruth, 'Unknown')
  const predLabel = formatTask2ClassLabel(graphClassNames, frame.predicted, 'Analyzing')
  const confidenceValues = history.map((item) => item.confidence ?? 0)
  const entropyValues = history.map((item) => item.entropy ?? 0)
  const marginValues = history.map((item) => item.margin ?? 0)

  return (
    <div
      ref={panelRootRef}
      className={`h-full w-full overflow-y-auto custom-scrollbar bg-nebula text-xs text-slate-200 ${analysisMode ? 'p-4' : 'p-3'}`}
    >
      <div className="sticky top-0 z-20 -mx-1 mb-3 rounded-2xl border border-line-subtle bg-deep/94 px-3 py-3 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Readout Lens Task 2</h3>
            <div className="mt-1 flex items-center gap-2">
              <span className="truncate text-xl font-black tracking-tight text-white">Graph #{graph.originalGraphId}</span>
              <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${frame.correct === 1 ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300' : 'border-rose-400/25 bg-rose-500/10 text-rose-300'}`}>
                {frame.correct === 1 ? 'Correct' : 'Wrong'}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <button
              onClick={() => setSelectedGraph(graph.originalGraphId)}
              disabled={reportMode}
              className="rounded-full border border-cyan-400/35 bg-cyan-500/12 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-200 transition-all hover:bg-cyan-400 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              title="Open this graph in the center detail view"
            >
              Xem chi tiết
            </button>
            {isPinned || reportMode ? (
              <button
                onClick={() => setSelectedGraph(null)}
                disabled={reportMode}
                className="rounded-full border border-amber-500/35 bg-amber-500/12 px-2.5 py-1 text-[10px] font-bold text-amber-300 hover:bg-amber-500/25 transition-all disabled:cursor-not-allowed disabled:opacity-50"
                title="Release pinned graph"
              >
                {reportMode ? 'Report' : 'Bỏ ghim'}
              </button>
            ) : (
              <button
                onClick={() => setHoveredGraph(null)}
                className="rounded-full border border-line-default px-2.5 py-1 text-[10px] font-semibold text-slate-500 hover:text-slate-300 transition-colors"
              >
                Hover
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        <StatCard title="Prediction">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-xl bg-nebula/50 p-2">
              <div className="text-slate-500">GT</div>
              <div className="mt-1 font-black text-slate-100">{gtLabel}</div>
            </div>
            <div className="rounded-xl bg-nebula/50 p-2">
              <div className="text-slate-500">Pred</div>
              <div className={`mt-1 font-black ${frame.correct === 1 ? 'text-emerald-300' : 'text-rose-300'}`}>{predLabel}</div>
            </div>
          </div>
          <div className="mt-3">
            <CorrectnessStrip history={history} currentEpochFloat={currentEpochFloat} />
          </div>
        </StatCard>

        <StatCard title="Confidence">
          <div className="space-y-3">
            <MetricBar label="Confidence" value={frame.confidence} tone="bg-cyan-400" />
            <MetricBar label="Margin" value={frame.margin} tone="bg-emerald-400" />
            <div className="grid grid-cols-2 gap-2">
              <MiniSparkline values={confidenceValues} tone="#22d3ee" label="Confidence history" />
              <MiniSparkline values={marginValues} tone="#34d399" label="Margin history" />
            </div>
          </div>
        </StatCard>

        <StatCard title="Readout">
          <div className="space-y-3">
            <MetricBar label="Entropy" value={frame.entropy} tone="bg-amber-400" />
            <MetricBar label="Top-k concentration" value={frame.readoutConcentration} tone="bg-fuchsia-400" />
            <MiniSparkline values={entropyValues} tone="#f59e0b" label="Entropy history" />
            {frame.topContributors?.length > 0 && (
              <div className="space-y-1.5">
                {frame.topContributors.map((node) => (
                  <div key={node.nodeId} className="flex items-center gap-2">
                    <span className="w-6 rounded bg-nebula px-1.5 py-0.5 text-center font-mono text-[10px] font-black text-slate-100">{node.nodeId}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-950/70">
                      <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.max(0, Math.min(1, node.value)) * 100}%` }} />
                    </div>
                    <span className="w-10 text-right font-mono text-[10px] font-bold text-amber-300">{(node.value * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </StatCard>

        <ModelLens modelSignature={modelSignature} />

        <StatCard title="Structure">
          <div className="grid grid-cols-3 gap-2">
            <MetaStat label="Density" value={graph.structural?.density} />
            <MetaStat label="Cluster Coef" value={graph.structural?.avg_clustering} />
            <MetaStat label="AvgDeg" value={graph.structural?.avg_degree} digits={1} />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{graph.motifSignature}</p>
        </StatCard>
      </div>
    </div>
  )
}

function MetaStat({ label, value, digits = 3 }) {
  const display = value != null && Number.isFinite(value) ? value.toFixed(digits) : '-'
  return (
    <div className="rounded-xl bg-nebula/50 p-2">
      <span className="block text-[8px] text-slate-500 uppercase tracking-[0.14em] font-semibold">{label}</span>
      <span className="mt-1 block text-[12px] font-mono font-bold text-slate-100 tabular-nums">{display}</span>
    </div>
  )
}
