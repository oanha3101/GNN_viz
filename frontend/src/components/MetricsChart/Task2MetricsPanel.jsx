import React, { useEffect, useMemo, useState } from 'react'
import usePlayerStore from '../../store/playerStore'
import useGNNStore from '../../store/useGNNStore'
import MetricsChart from './MetricsChart'
import Task2ConfusionMatrix from './Task2ConfusionMatrix'
import Task2HardCases from './Task2HardCases'
import Task2Diagnostics from './Task2Diagnostics'
import EmptyState from '../primitives/EmptyState'
import Panel from '../primitives/Panel'
import {
  assessTask2Reliability,
  buildTask2BestEpochSuggestion,
  buildTask2FocusBuckets,
  buildTask2FocusStory,
  buildTask2GraphDescriptors,
  buildTask2NarrativeSummary,
  buildTask2ResearchSignals,
  filterTask2DescriptorsByCell,
  filterTask2Snapshot,
  sortTask2Descriptors,
  summarizeGraphCollection,
} from '../../utils/task2Metrics'

function buildGraphClassNames(graphs = [], taskClassNames = []) {
  if (Array.isArray(taskClassNames) && taskClassNames.length) {
    return taskClassNames
  }
  const seen = new Set()
  for (const graph of graphs) {
    if (Number.isInteger(graph?.groundTruth)) {
      seen.add(graph.groundTruth)
    }
  }
  const inferred = [...seen].sort((a, b) => a - b)
  return inferred.length ? inferred.map((classId) => `Class ${classId}`) : ['Class 0']
}

function formatFailureTag(tag) {
  switch (tag) {
    case 'overconfident_miss':
      return 'Overconfident miss'
    case 'diffuse_readout':
      return 'Diffuse readout'
    case 'structural_outlier':
      return 'Structural outlier'
    case 'boundary_case':
      return 'Boundary case'
    case 'stable_win':
    default:
      return 'Stable win'
  }
}

function buildReadoutNarrative(descriptor) {
  if (!descriptor) return ''
  if (descriptor.failureTag === 'overconfident_miss') {
    return 'The classifier is confident, but it is anchoring on the wrong graph-level cue. Inspect the top contributing nodes before trusting the label.'
  }
  if (descriptor.failureTag === 'diffuse_readout') {
    return 'Attention is spread across many weak nodes, so the readout never consolidates around one decisive motif.'
  }
  if (descriptor.failureTag === 'structural_outlier') {
    return 'This graph is atypical for the collection. Treat it as a topology exception first, then judge the prediction.'
  }
  if (descriptor.failureTag === 'boundary_case') {
    return 'This graph sits close to the decision boundary. Use it as a soft counterexample, not a stable win.'
  }
  return 'This graph is a stable reference example for the current motif family.'
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'failures', label: 'Failures' },
  { id: 'structure', label: 'Structure' },
  { id: 'readout', label: 'Readout' },
]

export default function Task2MetricsPanel({
  forcedTab = null,
  forcedFocus = null,
  forcedSelectedCell = null,
  hideTabControls = false,
  hideFocusControls = false,
  disableAutoSelection = false,
}) {
  const { snapshots, currentEpochFloat, seekTo } = usePlayerStore()
  const taskData = useGNNStore((s) => s.taskData)
  const classNames = useGNNStore((s) => s.classNames)
  const setSelectedNode = useGNNStore((s) => s.setSelectedNode)
  const selectedNodeId = useGNNStore((s) => s.selectedNodeId)
  const focus = useGNNStore((s) => s.task2FocusMode)
  const setFocus = useGNNStore((s) => s.setTask2FocusMode)
  const selectedCell = useGNNStore((s) => s.task2SelectedCell)
  const setSelectedCell = useGNNStore((s) => s.setTask2SelectedCell)
  const datasetName = useGNNStore((s) => s.datasetName || s.activeDatasetVersionName || s.hyperparams?.dataset)

  const [tab, setTab] = useState(forcedTab || 'overview')

  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]
  const graphs = taskData?.graphs || []
  const graphClassNames = useMemo(
    () => buildGraphClassNames(graphs, taskData?.classNames || classNames),
    [graphs, taskData?.classNames, classNames]
  )

  const indexedGraphs = useMemo(
    () => graphs.map((graph, index) => ({
      ...graph,
      originalGraphId: graph?.originalGraphId ?? index,
      sourceIndex: graph?.sourceIndex ?? index,
    })),
    [graphs]
  )

  const collectionSummary = useMemo(
    () => summarizeGraphCollection(indexedGraphs, graphClassNames),
    [indexedGraphs, graphClassNames]
  )
  const reliability = useMemo(
    () => assessTask2Reliability({ snapshot: snap, graphs: indexedGraphs, classNames: graphClassNames }),
    [snap, indexedGraphs, graphClassNames]
  )
  const descriptors = useMemo(
    () => buildTask2GraphDescriptors({ snapshot: snap, graphs: indexedGraphs, classNames: graphClassNames }),
    [snap, indexedGraphs, graphClassNames]
  )
  const focusBuckets = useMemo(
    () => buildTask2FocusBuckets({ snapshot: snap, graphs: indexedGraphs, classNames: graphClassNames }),
    [snap, indexedGraphs, graphClassNames]
  )
  const resolvedFocusId = forcedFocus || focus
  const resolvedSelectedCell = forcedSelectedCell ?? selectedCell
  const activeFocus = focusBuckets.find((bucket) => bucket.id === resolvedFocusId) || focusBuckets[0] || {
    id: 'all',
    label: 'All',
    description: 'Entire graph collection.',
    graphIds: indexedGraphs.map((graph) => graph.originalGraphId),
  }

  useEffect(() => {
    if (forcedFocus) return
    if (!focusBuckets.some((bucket) => bucket.id === focus)) {
      setFocus('all')
    }
  }, [focus, focusBuckets, forcedFocus, setFocus])

  const focusedDescriptors = useMemo(() => {
    if (activeFocus.id === 'all') return descriptors
    const idSet = new Set(activeFocus.graphIds)
    return descriptors.filter((descriptor) => idSet.has(descriptor.originalGraphId))
  }, [activeFocus, descriptors])

  const filteredSnap = useMemo(
    () => filterTask2Snapshot(snap, activeFocus.graphIds, descriptors),
    [snap, activeFocus.graphIds, descriptors]
  )

  const selectedCellDescriptors = useMemo(
    () => filterTask2DescriptorsByCell(focusedDescriptors, resolvedSelectedCell),
    [focusedDescriptors, resolvedSelectedCell]
  )
  const featuredDescriptor = useMemo(() => {
    const explicit = focusedDescriptors.find((descriptor) => descriptor.originalGraphId === selectedNodeId)
    if (explicit) return explicit
    const scoped = resolvedSelectedCell ? selectedCellDescriptors : focusedDescriptors
    return sortTask2Descriptors(scoped, 'priority')[0] || focusedDescriptors[0] || null
  }, [focusedDescriptors, resolvedSelectedCell, selectedCellDescriptors, selectedNodeId])
  const narrative = useMemo(
    () => buildTask2NarrativeSummary(focusedDescriptors, reliability),
    [focusedDescriptors, reliability]
  )
  const researchSignals = useMemo(
    () => buildTask2ResearchSignals({
      snapshot: snap,
      graphs: focusedDescriptors,
      classNames: graphClassNames,
      reliability,
      descriptors: focusedDescriptors,
    }),
    [snap, focusedDescriptors, graphClassNames, reliability]
  )
  const epochSuggestion = useMemo(
    () => buildTask2BestEpochSuggestion(snapshots),
    [snapshots]
  )
  const focusStory = useMemo(
    () => buildTask2FocusStory({
      reliability,
      descriptors: focusedDescriptors,
      classNames: graphClassNames,
    }),
    [reliability, focusedDescriptors, graphClassNames]
  )
  const groundTruth = useMemo(() => focusedDescriptors.map((descriptor) => descriptor.groundTruth), [focusedDescriptors])
  const currentAccuracy = useMemo(() => {
    if (!snap?.graph_correct?.length) return null
    const correct = snap.graph_correct.reduce((sum, value) => sum + value, 0)
    return (correct / snap.graph_correct.length) * 100
  }, [snap])

  useEffect(() => {
    if (forcedTab) {
      setTab(forcedTab)
    }
  }, [forcedTab])

  useEffect(() => {
    if (disableAutoSelection) return
    if (!featuredDescriptor) return
    const explicit = focusedDescriptors.find((descriptor) => descriptor.originalGraphId === selectedNodeId)
    if (explicit) return
    if (selectedNodeId === featuredDescriptor.originalGraphId) return
    setSelectedNode(featuredDescriptor.originalGraphId)
  }, [disableAutoSelection, featuredDescriptor, focusedDescriptors, selectedNodeId, setSelectedNode])

  if (!snapshots.length) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 p-6 text-slate-500">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-500/15 bg-cyan-500/8 text-base font-semibold text-cyan-300">
          T2
        </div>
        <p className="text-sm font-semibold text-slate-300">Task 2 metrics will appear here</p>
        <p className="max-w-xs text-center text-micro text-slate-500">
          Start or replay a graph classification run to inspect collection-level failures, structure, and readout quality.
        </p>
      </div>
    )
  }

  return (
    <Panel
      title="Task 2 Lens"
      subtitle={`Graph classification diagnostics for ${datasetName || 'the active collection'} across reliability, failures, structure, and readout behavior.`}
      padding="none"
      className="border-slate-800/70 bg-slate-950/55 shadow-[0_12px_32px_rgba(15,23,42,0.35)]"
      actions={(
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="rounded-full border border-cyan-500/20 bg-cyan-500/8 px-2.5 py-1 text-[11px] font-semibold text-cyan-300">
            Epoch {epochInt}
          </div>
          <div className="rounded-full border border-slate-700/70 bg-slate-900/70 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
            {collectionSummary.totalGraphs} graphs
          </div>
          {currentAccuracy != null && (
            <div className="rounded-full border border-emerald-500/20 bg-emerald-500/8 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
              Acc {currentAccuracy.toFixed(1)}%
            </div>
          )}
        </div>
      )}
      footer={(
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>{reliability?.readingGuide}</span>
          <div className="flex flex-wrap items-center gap-2">
            {resolvedSelectedCell && !forcedSelectedCell && (
              <button
                type="button"
                onClick={() => setSelectedCell(null)}
                className="rounded-full border border-cyan-500/20 bg-cyan-500/8 px-2.5 py-1 font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/12"
              >
                Cell {resolvedSelectedCell.pred} {'->'} {resolvedSelectedCell.gt}
              </button>
            )}
            <span className="rounded-full border border-slate-700/70 bg-slate-900/70 px-2.5 py-1 font-semibold text-slate-300">
              Focus: {activeFocus.label} ({focusedDescriptors.length})
            </span>
          </div>
        </div>
      )}
    >
      <div className="flex h-full flex-col gap-3 p-3">
        {!hideTabControls && (
          <div className="flex flex-wrap items-center gap-2">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`rounded-full border px-3 py-1.5 text-nano font-bold uppercase tracking-ultra transition-colors ${
                  tab === item.id
                    ? 'border-cyan-400/35 bg-cyan-500/12 text-cyan-300 shadow-[0_0_0_1px_rgba(34,211,238,0.08)]'
                    : 'border-slate-800/70 bg-slate-900/55 text-slate-500 hover:border-slate-700 hover:text-slate-300'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        {!hideFocusControls && (
          <FocusChipRow
            buckets={focusBuckets}
            activeId={activeFocus.id}
            onChange={setFocus}
          />
        )}

        <div className="min-h-0 flex-1">
          {tab === 'overview' && (
            <OverviewTab
              reliability={reliability}
              collectionSummary={collectionSummary}
              focus={activeFocus}
              filteredCount={focusedDescriptors.length}
              graphClassNames={graphClassNames}
              narrative={narrative}
              researchSignals={researchSignals}
              epochSuggestion={epochSuggestion}
              focusStory={focusStory}
              onJumpToEpoch={(epoch) => seekTo?.(epoch)}
              onJumpToWeakClass={() => {
                setFocus('weak_class')
                setTab('failures')
              }}
              onJumpToStructure={() => {
                setFocus('outlier')
                setTab('structure')
              }}
              onSignalAction={(signalId) => {
                if (signalId === 'collapse') {
                  setFocus('weak_class')
                  setTab('failures')
                  return
                }
                if (signalId === 'calibration') {
                  setFocus('failures')
                  setTab('readout')
                  const candidate = sortTask2Descriptors(
                    focusedDescriptors.filter((descriptor) => descriptor.failureTag === 'overconfident_miss'),
                    'priority'
                  )[0] || sortTask2Descriptors(focusedDescriptors, 'priority')[0]
                  if (candidate) {
                    setSelectedNode(candidate.originalGraphId)
                  }
                  return
                }
                if (signalId === 'shortcut') {
                  setFocus('outlier')
                  setTab('structure')
                }
              }}
              onNextLensAction={() => {
                const lens = (narrative?.recommendedNextLens || '').toLowerCase()
                if (lens.includes('readout')) {
                  setTab('readout')
                  const candidate = sortTask2Descriptors(focusedDescriptors, 'priority')[0]
                  if (candidate) setSelectedNode(candidate.originalGraphId)
                  return
                }
                if (lens.includes('structure')) {
                  setFocus('outlier')
                  setTab('structure')
                  return
                }
                setFocus('failures')
                setTab('failures')
              }}
            />
          )}
          {tab === 'failures' && (
            <FailuresTab
              snap={filteredSnap}
              snapshots={snapshots}
              epochInt={epochInt}
              graphs={focusedDescriptors}
              hardCaseGraphs={resolvedSelectedCell ? selectedCellDescriptors : focusedDescriptors}
              groundTruth={groundTruth}
              classNames={graphClassNames}
              selectedId={selectedNodeId}
              selectedCell={resolvedSelectedCell}
              onSelectCell={(pred, gt) => {
                if (forcedSelectedCell) return
                if (resolvedSelectedCell?.pred === pred && resolvedSelectedCell?.gt === gt) {
                  setSelectedCell(null)
                  return
                }
                setSelectedCell({ pred, gt })
              }}
              onSelect={setSelectedNode}
            />
          )}
          {tab === 'structure' && (
            <StructureTab
              snap={filteredSnap}
              graphs={focusedDescriptors}
              selectedId={selectedNodeId}
              onSelect={setSelectedNode}
              focus={activeFocus}
              selectedCell={resolvedSelectedCell}
            />
          )}
          {tab === 'readout' && (
            <ReadoutTab
              graph={featuredDescriptor}
              classNames={graphClassNames}
              onSelect={setSelectedNode}
            />
          )}
        </div>
      </div>
    </Panel>
  )
}

function FocusChipRow({ buckets, activeId, onChange }) {
  if (!buckets?.length) return null
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
      {buckets.map((bucket) => {
        const active = bucket.id === activeId
        return (
          <button
            key={bucket.id}
            type="button"
            onClick={() => onChange(bucket.id)}
            className={`rounded-2xl border px-3 py-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/50 ${
              active
                ? 'border-cyan-400/30 bg-cyan-500/10'
                : 'border-slate-800/70 bg-slate-950/45 hover:border-slate-700 hover:bg-slate-900/60'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`text-nano font-bold uppercase tracking-ultra ${active ? 'text-cyan-300' : 'text-slate-400'}`}>
                {bucket.label}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${active ? 'bg-cyan-500/18 text-cyan-200' : 'bg-slate-800/80 text-slate-400'}`}>
                {bucket.graphIds.length}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{bucket.description}</p>
          </button>
        )
      })}
    </div>
  )
}

function OverviewTab({
  reliability,
  collectionSummary,
  focus,
  filteredCount,
  graphClassNames,
  narrative,
  researchSignals,
  epochSuggestion,
  focusStory,
  onJumpToEpoch,
  onJumpToWeakClass,
  onJumpToStructure,
  onSignalAction,
  onNextLensAction,
}) {
  const classCounts = collectionSummary?.classCounts || []
  const metrics = reliability?.metrics || {}
  const perClass = metrics.perClass || []
  const calibrationEce = metrics.calibrationEce
  const densityBias = metrics.densityBias
  const sizeBias = metrics.sizeBias

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
      <ReliabilityCard reliability={reliability} />
      <HeroNarrativeCard narrative={narrative} onNextLensAction={onNextLensAction} />
      <BestEpochSuggestionCard suggestion={epochSuggestion} onJumpToEpoch={onJumpToEpoch} />
      <ResearchSignalsCard signals={researchSignals} onSignalAction={onSignalAction} />
      <TrustProfileCard metrics={metrics} />
      <FocusRoutingCard
        story={focusStory}
        weakClass={metrics.weakClass}
        onJumpToWeakClass={onJumpToWeakClass}
        onJumpToStructure={onJumpToStructure}
      />

      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <StatCell label="Graphs" value={collectionSummary.totalGraphs} digits={0} tone="good" />
        <StatCell label="Classes" value={graphClassNames.length || 1} digits={0} tone="info" />
        <StatCell label="Avg Nodes" value={collectionSummary.avgNodes} digits={1} tone="warn" />
        <StatCell label="Avg Edges" value={collectionSummary.avgEdges} digits={1} tone="warn" />
        <StatCell label="Macro F1" value={(metrics.macroF1 || 0) * 100} digits={1} suffix="%" tone={(metrics.macroF1 || 0) > 0.75 ? 'good' : 'warn'} />
        <StatCell label="Balanced Acc" value={(metrics.balancedAccuracy || 0) * 100} digits={1} suffix="%" tone={(metrics.balancedAccuracy || 0) > 0.75 ? 'good' : 'warn'} />
        <StatCell label="Median Margin" value={(metrics.medianMargin || 0) * 100} digits={1} suffix="%" tone={(metrics.medianMargin || 0) > 18 ? 'good' : 'bad'} />
        <StatCell label="ECE" value={(calibrationEce || 0) * 100} digits={1} suffix="%" tone={Number.isFinite(calibrationEce) && calibrationEce < 0.1 ? 'good' : 'warn'} />
        <StatCell label="Size Bias" value={sizeBias || 0} digits={2} tone={Math.abs(sizeBias || 0) > 0.35 ? 'bad' : 'info'} />
      </div>

      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/45 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-nano font-bold uppercase tracking-ultra text-slate-500">Current focus</div>
            <p className="mt-1 text-[11px] text-slate-400">
              {focus.description} This lens is currently showing {filteredCount} graph{filteredCount === 1 ? '' : 's'}.
            </p>
          </div>
          <div className="rounded-full border border-slate-700/70 bg-slate-900/70 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
            Slice size: {filteredCount}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/45 p-3">
        <div className="mb-3">
          <span className="block text-nano font-bold uppercase tracking-ultra text-slate-500">Collection balance</span>
          <p className="mt-1 text-[11px] text-slate-400">
            Class support tells you whether Task 2 should be read like a benchmark or more like a motif probe.
          </p>
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          {classCounts.map((item) => (
            <div key={item.classId} className="rounded-xl border border-slate-800/60 bg-slate-900/55 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-200">{item.label}</span>
                <span className="text-[11px] font-mono text-slate-400">{item.support}</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800/70">
                <div className="h-full rounded-full bg-cyan-400/80" style={{ width: `${item.share * 100}%` }} />
              </div>
              <div className="mt-1 text-nano text-slate-500">{(item.share * 100).toFixed(1)}% of collection</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/45 p-3">
        <div className="mb-2">
          <span className="block text-nano font-bold uppercase tracking-ultra text-slate-500">Training trend</span>
          <p className="mt-1 text-[11px] text-slate-400">
            Use this as the health trace. Then confirm the story with the failure slice and structure slice.
          </p>
        </div>
        <div className="h-[260px]">
          <MetricsChart />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/45 p-3">
        <div className="mb-2">
          <span className="block text-nano font-bold uppercase tracking-ultra text-slate-500">Per-class metrics</span>
          <p className="mt-1 text-[11px] text-slate-400">
            Read recall first for the weak class, then confirm precision, F1, and mean confidence.
          </p>
        </div>
        {metrics.weakClass && (
          <div className="mb-3 rounded-xl border border-amber-500/18 bg-amber-500/8 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-ultra text-amber-200">Weak-class watch</div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                  {metrics.weakClass.label} is the weakest class right now with recall {(metrics.weakClass.recall * 100).toFixed(1)}% and F1 {(metrics.weakClass.f1 * 100).toFixed(1)}%.
                  Use the <span className="text-amber-200">Weak-class misses</span> focus chip to inspect why recall is lagging.
                </p>
              </div>
              <button
                type="button"
                onClick={onJumpToWeakClass}
                className="shrink-0 rounded-full border border-amber-400/25 bg-amber-500/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-ultra text-amber-100 transition-colors hover:bg-amber-500/18"
              >
                Open slice
              </button>
            </div>
          </div>
        )}
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {perClass.map((row) => (
            <div key={row.class_id} className="rounded-xl border border-slate-800/60 bg-slate-900/55 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-100">Class {row.class_id}</span>
                <span className="text-[10px] font-mono text-slate-400">support {row.support}</span>
              </div>
              <div className="mt-2 grid gap-1 text-[11px] text-slate-300">
                <div className="flex items-center justify-between gap-2"><span className="text-slate-500">Precision</span><span>{(row.precision * 100).toFixed(1)}%</span></div>
                <div className="flex items-center justify-between gap-2"><span className="text-slate-500">Recall</span><span>{(row.recall * 100).toFixed(1)}%</span></div>
                <div className="flex items-center justify-between gap-2"><span className="text-slate-500">F1</span><span>{(row.f1 * 100).toFixed(1)}%</span></div>
                <div className="flex items-center justify-between gap-2"><span className="text-slate-500">Mean conf</span><span>{((row.mean_confidence || 0) * 100).toFixed(1)}%</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/45 p-3">
        <div className="mb-2">
          <span className="block text-nano font-bold uppercase tracking-ultra text-slate-500">Shortcut bias</span>
          <p className="mt-1 text-[11px] text-slate-400">
            Positive or negative correlation here suggests the model may be leaning on graph size or density.
          </p>
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <StatCell label="Conf vs Density" value={densityBias} digits={2} tone={Math.abs(densityBias || 0) > 0.35 ? 'bad' : 'info'} />
          <StatCell label="Conf vs Size" value={sizeBias} digits={2} tone={Math.abs(sizeBias || 0) > 0.35 ? 'bad' : 'info'} />
          <StatCell label="Conf vs Edges" value={metrics.edgeBias || 0} digits={2} tone={Math.abs(metrics.edgeBias || 0) > 0.35 ? 'bad' : 'info'} />
        </div>
      </div>
    </div>
  )
}

function ResearchSignalsCard({ signals, onSignalAction }) {
  const items = [signals?.collapse, signals?.calibration, signals?.shortcut].filter(Boolean)
  if (!items.length) return null

  return (
    <div className="rounded-2xl border border-violet-500/15 bg-violet-500/6 p-3">
      <div className="text-nano font-bold uppercase tracking-ultra text-violet-200">Research signals</div>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
        These cards turn the current run into three questions: is the model collapsing toward one class, are its confidences trustworthy, and is it using structural shortcuts.
      </p>
      <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {items.map((item) => (
          <SignalCard key={item.id} signal={item} onAction={onSignalAction} />
        ))}
      </div>
    </div>
  )
}

function TrustProfileCard({ metrics }) {
  if (!metrics) return null
  const brier = metrics.brier
  const highConfWrong = metrics.highConfWrongRate || 0
  const shortcutRisk = metrics.shortcutRiskScore || 0
  const diffuseShare = metrics.readoutDiffuseShare || 0
  const temperature = metrics.calibrationTemperature

  return (
    <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/6 p-3">
      <div className="text-nano font-bold uppercase tracking-ultra text-emerald-200">Trust profile</div>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
        A compact research-grade read: calibration quality, high-confidence mistakes, shortcut pressure, and whether readout is concentrated enough to support motif-level claims.
      </p>
      <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <StatCell
          label="Brier"
          value={Number.isFinite(brier) ? brier : 0}
          digits={3}
          tone={Number.isFinite(brier) && brier < 0.18 ? 'good' : 'warn'}
        />
        <StatCell
          label="High-conf wrong"
          value={highConfWrong * 100}
          digits={1}
          suffix="%"
          tone={highConfWrong > 0.15 ? 'bad' : highConfWrong > 0.05 ? 'warn' : 'good'}
        />
        <StatCell
          label="Shortcut risk"
          value={shortcutRisk}
          digits={2}
          tone={Math.abs(shortcutRisk) > 0.5 ? 'bad' : Math.abs(shortcutRisk) > 0.3 ? 'warn' : 'good'}
        />
        <StatCell
          label="Readout diffuse"
          value={diffuseShare * 100}
          digits={1}
          suffix="%"
          tone={diffuseShare > 0.45 ? 'bad' : diffuseShare > 0.25 ? 'warn' : 'good'}
        />
        <StatCell
          label="Temp scale"
          value={Number.isFinite(temperature) ? temperature : 1}
          digits={2}
          tone={Number.isFinite(temperature) && temperature > 1.4 ? 'warn' : 'info'}
        />
      </div>
    </div>
  )
}

function BestEpochSuggestionCard({ suggestion, onJumpToEpoch }) {
  if (!suggestion) return null

  return (
    <div className="rounded-2xl border border-sky-500/15 bg-sky-500/6 p-3">
      <div className="text-nano font-bold uppercase tracking-ultra text-sky-200">Best epoch suggestion</div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-300">{suggestion.recommendation}</p>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{suggestion.rationale}</p>
      <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div className="rounded-xl border border-white/6 bg-slate-950/55 p-3">
          <div className="text-[10px] uppercase tracking-ultra text-slate-500">Best Macro F1</div>
          <div className="mt-2 text-[12px] font-semibold text-slate-100">
            Epoch {suggestion.bestMacro?.epoch ?? '—'}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {(Number(suggestion.bestMacro?.macroF1 || 0) * 100).toFixed(1)}% Macro F1
          </div>
          {Number.isInteger(suggestion.bestMacro?.epoch) && (
            <button
              type="button"
              onClick={() => onJumpToEpoch?.(suggestion.bestMacro.epoch)}
              className="mt-3 rounded-full border border-sky-400/25 bg-sky-500/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-ultra text-sky-100 transition-colors hover:bg-sky-500/18"
            >
              Jump to epoch
            </button>
          )}
        </div>
        <div className="rounded-xl border border-white/6 bg-slate-950/55 p-3">
          <div className="text-[10px] uppercase tracking-ultra text-slate-500">Best Balanced Acc</div>
          <div className="mt-2 text-[12px] font-semibold text-slate-100">
            Epoch {suggestion.bestBalanced?.epoch ?? '—'}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {(Number(suggestion.bestBalanced?.balancedAccuracy || 0) * 100).toFixed(1)}% Balanced Acc
          </div>
          {Number.isInteger(suggestion.bestBalanced?.epoch) && (
            <button
              type="button"
              onClick={() => onJumpToEpoch?.(suggestion.bestBalanced.epoch)}
              className="mt-3 rounded-full border border-sky-400/25 bg-sky-500/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-ultra text-sky-100 transition-colors hover:bg-sky-500/18"
            >
              Jump to epoch
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function FocusRoutingCard({ story, weakClass, onJumpToWeakClass, onJumpToStructure }) {
  if (!story || !weakClass) return null

  const toneClass = story.status === 'danger'
    ? 'border-red-500/20 bg-red-500/7'
    : story.status === 'warn'
      ? 'border-amber-500/20 bg-amber-500/7'
      : 'border-emerald-500/20 bg-emerald-500/7'

  return (
    <div className={`rounded-2xl border p-3 ${toneClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-nano font-bold uppercase tracking-ultra text-slate-200">{story.title}</div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-300">{story.summary}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{story.evidence}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onJumpToWeakClass}
            className="rounded-full border border-amber-400/25 bg-amber-500/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-ultra text-amber-100 transition-colors hover:bg-amber-500/18"
          >
            Weak-class misses
          </button>
          <button
            type="button"
            onClick={onJumpToStructure}
            className="rounded-full border border-cyan-400/25 bg-cyan-500/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-ultra text-cyan-100 transition-colors hover:bg-cyan-500/18"
          >
            Structure lens
          </button>
        </div>
      </div>
    </div>
  )
}

function SignalCard({ signal, onAction }) {
  const tone = signal.status === 'danger'
    ? 'border-red-500/20 bg-red-500/7'
    : signal.status === 'warn'
      ? 'border-amber-500/20 bg-amber-500/7'
      : 'border-emerald-500/18 bg-emerald-500/7'
  const pill = signal.status === 'danger'
    ? 'border-red-400/25 bg-red-500/14 text-red-200'
    : signal.status === 'warn'
      ? 'border-amber-400/25 bg-amber-500/14 text-amber-200'
      : 'border-emerald-400/20 bg-emerald-500/12 text-emerald-200'
  const label = signal.status === 'danger' ? 'High risk' : signal.status === 'warn' ? 'Needs context' : 'Stable'

  return (
    <div className={`rounded-xl border p-3 ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold text-slate-100">{signal.title}</div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${pill}`}>{label}</span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-300">{signal.summary}</p>
      <div className="mt-3 space-y-2 text-[11px] leading-relaxed">
        <div>
          <div className="text-[10px] uppercase tracking-ultra text-slate-500">Evidence</div>
          <p className="mt-1 text-slate-400">{signal.evidence}</p>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-ultra text-slate-500">Recommended move</div>
          <p className="mt-1 text-slate-400">{signal.recommendation}</p>
        </div>
        <button
          type="button"
          onClick={() => onAction?.(signal.id)}
          className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-ultra text-slate-200 transition-colors hover:bg-white/8"
        >
          Open lens
        </button>
      </div>
    </div>
  )
}

function HeroNarrativeCard({ narrative, onNextLensAction }) {
  if (!narrative) return null
  return (
    <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/6 p-3">
      <div className="text-nano font-bold uppercase tracking-ultra text-cyan-300">Research narrative</div>
      <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <NarrativeCell label="Main insight" value={narrative.mainInsight} />
        <NarrativeCell label="Main risk" value={narrative.mainRisk} />
        <NarrativeCell label="Next lens" value={narrative.recommendedNextLens} actionLabel="Open lens" onAction={onNextLensAction} />
      </div>
    </div>
  )
}

function NarrativeCell({ label, value, actionLabel = null, onAction = null }) {
  return (
    <div className="rounded-xl border border-white/6 bg-slate-950/55 p-3">
      <div className="text-[10px] uppercase tracking-ultra text-slate-500">{label}</div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-300">{value}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-3 rounded-full border border-cyan-400/25 bg-cyan-500/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-ultra text-cyan-100 transition-colors hover:bg-cyan-500/18"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

function ReliabilityCard({ reliability }) {
  if (!reliability) return null

  const toneClass = reliability.status === 'danger'
    ? 'border-red-500/25 bg-red-500/6'
    : reliability.status === 'warn'
      ? 'border-amber-500/25 bg-amber-500/6'
      : 'border-emerald-500/20 bg-emerald-500/6'
  const toneText = reliability.status === 'danger'
    ? 'text-red-300'
    : reliability.status === 'warn'
      ? 'text-amber-300'
      : 'text-emerald-300'

  return (
    <div className={`rounded-2xl border p-3 ${toneClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className={`text-nano font-bold uppercase tracking-ultra ${toneText}`}>Reliability guardrail</div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{reliability.readingGuide}</p>
        </div>
        <div className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
          reliability.status === 'danger'
            ? 'border-red-400/30 bg-red-500/15 text-red-200'
            : reliability.status === 'warn'
              ? 'border-amber-400/30 bg-amber-500/15 text-amber-200'
              : 'border-emerald-400/25 bg-emerald-500/12 text-emerald-200'
        }`}>
          {reliability.status === 'danger' ? 'Fragile read' : reliability.status === 'warn' ? 'Needs context' : 'Stable enough'}
        </div>
      </div>
      {!!reliability.warnings?.length && (
        <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {reliability.warnings.map((warning) => (
            <div key={warning} className="rounded-xl border border-white/6 bg-black/18 p-3 text-[11px] leading-relaxed text-slate-300">
              {warning}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FailuresTab({
  snap,
  snapshots,
  epochInt,
  graphs,
  hardCaseGraphs,
  groundTruth,
  classNames,
  selectedId,
  selectedCell,
  onSelectCell,
  onSelect,
}) {
  if (!graphs.length) {
    return <EmptyState title="No graphs in this slice" description="Pick another focus chip to inspect a broader portion of the collection." />
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
      {selectedCell && (
        <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/6 px-3 py-2 text-[11px] text-cyan-100">
          Confusion cell active: predicted class {selectedCell.pred}, ground truth class {selectedCell.gt}. Hard cases below are scoped to this cell.
        </div>
      )}

      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/45 p-3">
        <div className="mb-2">
          <span className="block text-nano font-bold uppercase tracking-ultra text-slate-500">Batch heatmap</span>
          <p className="mt-1 text-[11px] text-slate-400">
            Each row is a graph, each column is an epoch checkpoint. Use it to spot stubborn failures and late recoveries.
          </p>
        </div>
        <BatchHeatmap
          snap={snap}
          snapshots={snapshots}
          epochInt={epochInt}
          graphs={graphs}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <div className="min-w-0 rounded-2xl border border-slate-800/70 bg-slate-950/45 p-3">
          <Task2ConfusionMatrix
            predictions={snap?.graph_predictions}
            groundTruth={groundTruth}
            classNames={classNames}
            selectedCell={selectedCell}
            onSelectCell={onSelectCell}
          />
        </div>
        <div className="min-w-0 rounded-2xl border border-slate-800/70 bg-slate-950/45 p-3">
          <div className="mb-2">
            <span className="block text-nano font-bold uppercase tracking-ultra text-slate-500">Hardest cases</span>
            <p className="mt-1 text-[11px] text-slate-400">
              Misclassified graphs surface first, then the correct graphs with the thinnest margins.
            </p>
          </div>
          <Task2HardCases
            snap={snap}
            graphs={hardCaseGraphs}
            classNames={classNames}
            k={10}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </div>
      </div>
    </div>
  )
}

function StructureTab({ snap, graphs, selectedId, onSelect, focus, selectedCell }) {
  const outliers = useMemo(
    () => [...graphs]
      .filter((descriptor) => descriptor.structuralOutlier)
      .sort((a, b) => (b.structuralOutlierScore || 0) - (a.structuralOutlierScore || 0))
      .slice(0, 6),
    [graphs]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/45 p-3">
        <div className="mb-2">
          <span className="block text-nano font-bold uppercase tracking-ultra text-slate-500">Structure explanation</span>
          <p className="mt-1 text-[11px] text-slate-400">
            The current slice is <span className="text-slate-200">{focus.label}</span>. Read entropy, density, and correctness together before concluding the model understands a motif.
          </p>
        </div>
        <Task2Diagnostics
          snap={snap}
          graphs={graphs}
          selectedId={selectedId}
          selectedCell={selectedCell}
          onSelect={onSelect}
        />
      </div>

      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/45 p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <span className="block text-nano font-bold uppercase tracking-ultra text-slate-500">Structural outliers</span>
            <p className="mt-1 text-[11px] text-slate-400">
              These graphs depart from the collection norm on density or clustering. They are the best place to test whether the model is reacting to motif shape or just graph size.
            </p>
          </div>
          {selectedCell && (
            <span className="rounded-full border border-cyan-500/20 bg-cyan-500/8 px-2.5 py-1 text-[10px] font-semibold text-cyan-200">
              Cell lens active
            </span>
          )}
        </div>
        {outliers.length ? (
          <div className="grid gap-2">
            {outliers.map((descriptor) => (
              <button
                key={descriptor.originalGraphId}
                type="button"
                onClick={() => onSelect?.(descriptor.originalGraphId)}
                className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                  selectedId === descriptor.originalGraphId
                    ? 'border-cyan-500/50 bg-cyan-500/10'
                    : 'border-slate-800/60 bg-slate-900/55 hover:border-slate-700 hover:bg-slate-900/70'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-semibold text-slate-100">G#{descriptor.originalGraphId}</div>
                    <div className="mt-1 text-[11px] text-slate-400">{descriptor.motifSignature}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <TagChip label={descriptor.densityBucket} tone="info" />
                    <TagChip label={descriptor.clusteringBucket} tone="warn" />
                    <TagChip label={descriptor.readoutBucket} tone="good" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState title="No strong outliers here" description="This slice stays close to the collection norm, so use Failures or Readout to explain the remaining mistakes." />
        )}
      </div>
    </div>
  )
}

function ReadoutTab({ graph, classNames, onSelect }) {
  if (!graph) {
    return <EmptyState title="No graph selected" description="Pick a graph from the topology or hard-case list to inspect graph-level readout." />
  }

  const gtLabel = classNames[graph.groundTruth] || `Class ${graph.groundTruth}`
  const predLabel = graph.predicted != null ? (classNames[graph.predicted] || `Class ${graph.predicted}`) : 'Pending'
  const topContributors = graph.topContributors || []

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div className="rounded-2xl border border-slate-800/70 bg-slate-950/45 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-nano font-bold uppercase tracking-ultra text-slate-500">Featured graph</div>
              <div className="mt-1 text-sm font-semibold text-slate-100">G#{graph.originalGraphId}</div>
            </div>
            <button
              type="button"
              onClick={() => onSelect?.(graph.originalGraphId)}
              className="rounded-full border border-cyan-500/20 bg-cyan-500/8 px-2.5 py-1 text-[11px] font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/14"
            >
              Focus
            </button>
          </div>
          <div className="mt-3 space-y-2 text-[11px] text-slate-300">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">Ground truth</span>
              <span className="font-semibold text-slate-100">{gtLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">Prediction</span>
              <span className={`font-semibold ${graph.correct === 1 ? 'text-emerald-300' : 'text-red-300'}`}>{predLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">Nodes / edges</span>
              <span className="font-mono text-slate-200">{graph.nodes.length}n / {graph.links.length}e</span>
            </div>
          </div>
        </div>

        <StatCell label="Confidence" value={(graph.confidence || 0) * 100} digits={1} suffix="%" tone={(graph.confidence || 0) > 0.8 ? 'good' : (graph.confidence || 0) > 0.55 ? 'warn' : 'bad'} />
        <StatCell label="Margin" value={(graph.margin || 0) * 100} digits={1} suffix="%" tone={(graph.margin || 0) > 0.2 ? 'good' : (graph.margin || 0) > 0.1 ? 'warn' : 'bad'} />
        <StatCell label="Entropy" value={(graph.entropy || 0) * 100} digits={1} suffix="%" tone={(graph.entropy || 0) > 0.8 ? 'bad' : (graph.entropy || 0) > 0.55 ? 'warn' : 'good'} />
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div className="rounded-2xl border border-slate-800/70 bg-slate-950/45 p-3">
          <div className="text-nano font-bold uppercase tracking-ultra text-slate-500">Readout interpretation</div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-300">{buildReadoutNarrative(graph)}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <TagChip label={formatFailureTag(graph.failureTag)} tone={graph.correct === 1 ? 'good' : 'bad'} />
            <TagChip label={graph.densityBucket} tone="info" />
            <TagChip label={graph.entropyBucket} tone="warn" />
            <TagChip label={graph.readoutBucket} tone="good" />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800/70 bg-slate-950/45 p-3">
          <div className="text-nano font-bold uppercase tracking-ultra text-slate-500">Structural profile</div>
          <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <MiniMetric label="Density" value={graph.structural?.density} />
            <MiniMetric label="Clustering" value={graph.structural?.avg_clustering} />
            <MiniMetric label="AvgDeg" value={graph.structural?.avg_degree} digits={1} />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
            Motif signature: <span className="font-semibold text-slate-200">{graph.motifSignature}</span>
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800/70 bg-slate-950/45 p-3">
          <div className="text-nano font-bold uppercase tracking-ultra text-slate-500">Readout concentration</div>
          <div className="mt-2 text-lg font-semibold text-slate-100">{(graph.readoutConcentration * 100).toFixed(0)}%</div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            The top-3 node contributions suggest a <span className="font-semibold text-slate-200">{graph.readoutBucket}</span> graph-level readout.
          </p>
          <div className="mt-3 space-y-2">
            {topContributors.length ? topContributors.map((item) => (
              <div key={item.nodeId} className="flex items-center gap-2">
                <div className="w-8 shrink-0 rounded-md border border-slate-700/70 bg-slate-900/70 px-2 py-1 text-center text-[11px] font-mono text-slate-200">
                  {item.nodeId}
                </div>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800/70">
                  <div className="h-full rounded-full bg-amber-400/85" style={{ width: `${Math.max(4, item.value * 100)}%` }} />
                </div>
                <div className="w-12 shrink-0 text-right text-[11px] font-mono text-amber-300">
                  {(item.value * 100).toFixed(0)}%
                </div>
              </div>
            )) : (
              <p className="text-[11px] text-slate-500">No node contribution data yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function BatchHeatmap({ snap, snapshots, epochInt, graphs, selectedId, onSelect }) {
  const { heatmapRows, graphLabels, numGraphs } = useMemo(() => {
    if (!snapshots?.length) return { heatmapRows: [], graphLabels: [], numGraphs: 0 }
    const nG = snap?.graph_correct?.length || snapshots.find((item) => item.graph_correct)?.graph_correct?.length || 0
    if (!nG) return { heatmapRows: [], graphLabels: [], numGraphs: 0 }

    const step = Math.max(1, Math.floor(snapshots.length / 20))
    const rows = []
    for (let i = 0; i < snapshots.length; i += step) {
      const item = filterTask2Snapshot(snapshots[i], graphs.map((graph) => graph.originalGraphId), graphs)
      rows.push({ epoch: i, data: item?.graph_correct || new Array(nG).fill(null) })
    }
    if (snap?.graph_correct) {
      rows.push({ epoch: epochInt, data: snap.graph_correct, isCurrent: true })
    }

    const labels = graphs.length
      ? graphs.map((graph, index) => `G${graph.originalGraphId ?? index}`)
      : Array.from({ length: nG }, (_, index) => `G${index}`)

    return { heatmapRows: rows, graphLabels: labels, numGraphs: nG }
  }, [snapshots, snap, epochInt, graphs])

  if (!numGraphs) {
    return (
      <EmptyState
        title="No snapshots yet"
        description="Start Task 2 training to inspect graph-level correctness over time."
      />
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-nano text-slate-400 leading-relaxed">
        Each tile is one graph at one checkpoint. Green means correct, red means wrong.
      </p>
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="inline-flex flex-col gap-0.5 min-w-max">
          <div className="flex gap-0.5 items-center">
            <div className="w-12 shrink-0" />
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
            const graphId = graphs[gi]?.originalGraphId ?? gi
            const isSelected = selectedId === graphId
            return (
              <div
                key={graphId}
                onClick={() => onSelect?.(graphId)}
                className={`flex gap-0.5 items-center cursor-pointer transition-colors rounded-sm hover:bg-white/5 ${
                  isSelected ? 'bg-cyan-500/10 ring-1 ring-cyan-500/30' : ''
                }`}
              >
                <div
                  className={`w-12 text-right text-nano font-mono shrink-0 pr-1 ${
                    isSelected ? 'text-cyan-300 font-bold' : 'text-slate-500'
                  }`}
                >
                  {graphLabels[gi]}
                </div>
                {heatmapRows.map((row, ci) => {
                  const val = row.data[gi]
                  const status = val === 1 ? 'correct' : val === 0 ? 'wrong' : 'unknown'
                  const tileFill =
                    val === 1
                      ? (row.isCurrent ? '#22c55e' : isSelected ? '#4ade80' : '#86efac')
                      : val === 0
                        ? (row.isCurrent ? '#ef4444' : isSelected ? '#f87171' : '#fca5a5')
                        : '#1e293b'
                  const tileStroke = val === 1 ? '#047857' : val === 0 ? '#b91c1c' : '#334155'
                  return (
                    <div
                      key={ci}
                      title={`Graph ${graphLabels[gi]} · Epoch ${row.epoch}: ${val === 1 ? 'correct' : val === 0 ? 'wrong' : 'unknown'}`}
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
                        printColorAdjust: 'exact',
                        WebkitPrintColorAdjust: 'exact',
                        forcedColorAdjust: 'none',
                      }}
                    >
                      <svg
                        data-testid="task2-batch-heatmap-tile"
                        role="img"
                        aria-label={`Graph ${graphLabels[gi]} epoch ${row.epoch}: ${status}`}
                        viewBox="0 0 20 20"
                        className="block h-full w-full"
                        style={{
                          printColorAdjust: 'exact',
                          WebkitPrintColorAdjust: 'exact',
                          forcedColorAdjust: 'none',
                        }}
                      >
                        <title>{`Graph ${graphLabels[gi]} - Epoch ${row.epoch}: ${status}`}</title>
                        <rect
                          x="1"
                          y="1"
                          width="18"
                          height="18"
                          rx="3"
                          fill={tileFill}
                          stroke={tileStroke}
                          strokeWidth={row.isCurrent ? 1.2 : 0.8}
                        />
                        {row.isCurrent && (
                          <rect
                            x="0.5"
                            y="0.5"
                            width="19"
                            height="19"
                            rx="3.5"
                            fill="none"
                            stroke="#22d3ee"
                            strokeWidth={isSelected ? 2 : 1.2}
                          />
                        )}
                      </svg>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function TagChip({ label, tone = 'info' }) {
  const palette = {
    good: 'border-emerald-500/20 bg-emerald-500/8 text-emerald-200',
    warn: 'border-amber-500/20 bg-amber-500/8 text-amber-200',
    bad: 'border-red-500/20 bg-red-500/8 text-red-200',
    info: 'border-slate-700/70 bg-slate-900/70 text-slate-200',
  }
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${palette[tone] || palette.info}`}>
      {label}
    </span>
  )
}

function StatCell({ label, value, digits = 0, suffix = '', tone = 'info' }) {
  const palette = {
    good: 'border-emerald-500/20 bg-emerald-500/8 text-emerald-200',
    warn: 'border-amber-500/20 bg-amber-500/8 text-amber-200',
    bad: 'border-red-500/20 bg-red-500/8 text-red-200',
    info: 'border-slate-700/70 bg-slate-900/70 text-slate-200',
  }

  const display = Number.isFinite(value) ? `${Number(value).toFixed(digits)}${suffix}` : '—'
  return (
    <div className={`rounded-2xl border p-3 ${palette[tone] || palette.info}`}>
      <div className="text-nano font-bold uppercase tracking-ultra text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-semibold tabular-nums">{display}</div>
    </div>
  )
}

function MiniMetric({ label, value, digits = 2 }) {
  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/55 p-2">
      <div className="text-[10px] uppercase tracking-ultra text-slate-500">{label}</div>
      <div className="mt-1 text-[12px] font-mono font-semibold text-slate-200 tabular-nums">
        {Number.isFinite(value) ? value.toFixed(digits) : '—'}
      </div>
    </div>
  )
}
