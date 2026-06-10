import React, { useEffect, useMemo, useRef, useState } from 'react'
import usePlayerStore from '../../store/playerStore'
import useGNNStore from '../../store/useGNNStore'
import { useLanguage } from '../../contexts/LanguageContext'
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
  buildTask2ModelSignature,
  buildTask2NarrativeSummary,
  buildTask2ResearchSignals,
  describeTask2ReadoutPattern,
  filterTask2DescriptorsByCell,
  filterTask2Snapshot,
  formatTask2ClassLabel,
  sortTask2Descriptors,
  summarizeGraphCollection,
} from '../../utils/task2Metrics'
import {
  translateTask2EpochSuggestion,
  translateTask2FailureTagLabel,
  translateTask2FocusBucket,
  localizeTask2Element,
  translateTask2ReportText,
  translateTask2Signal,
} from '../../utils/task2ReportI18n'

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

function buildReadoutNarrative(descriptor, lang = 'en') {
  if (!descriptor) return ''
  if (descriptor.failureTag === 'overconfident_miss') {
    return lang === 'vi'
      ? 'Bộ phân loại đang rất tự tin, nhưng lại bám vào tín hiệu mức đồ thị không đúng. Hãy kiểm tra các nút đóng góp lớn nhất trước khi tin vào nhãn.'
      : 'The classifier is confident, but it is anchoring on the wrong graph-level cue. Inspect the top contributing nodes before trusting the label.'
  }
  if (descriptor.failureTag === 'diffuse_readout') {
    return lang === 'vi'
      ? 'Attention đang bị dàn trải trên nhiều nút yếu, nên readout không hội tụ quanh một motif quyết định rõ ràng.'
      : 'Attention is spread across many weak nodes, so the readout never consolidates around one decisive motif.'
  }
  if (descriptor.entropyBucket === 'diffuse' && descriptor.readoutBucket === 'concentrated') {
    return lang === 'vi'
      ? 'Phân phối attention toàn cục đang loãng, nhưng một nhóm cục bộ nhỏ vẫn đóng góp phần lớn readout. Hãy đọc đây như một giải thích pha trộn, không phải motif lock sạch.'
      : 'The global attention distribution is diffuse, but a small local set still contributes most of the readout. Treat this as a mixed explanation, not a clean motif lock.'
  }
  if (descriptor.failureTag === 'structural_outlier') {
    return lang === 'vi'
      ? 'Đồ thị này là trường hợp lệch chuẩn so với collection. Hãy xem nó như một ngoại lệ topology trước khi phán xét dự đoán.'
      : 'This graph is atypical for the collection. Treat it as a topology exception first, then judge the prediction.'
  }
  if (descriptor.failureTag === 'boundary_case') {
    return lang === 'vi'
      ? 'Đồ thị này nằm sát ranh giới quyết định. Hãy xem nó như một phản ví dụ mềm, không phải ca thắng ổn định.'
      : 'This graph sits close to the decision boundary. Use it as a soft counterexample, not a stable win.'
  }
  return lang === 'vi'
    ? 'Đồ thị này là một ví dụ tham chiếu ổn định cho họ motif hiện tại.'
    : 'This graph is a stable reference example for the current motif family.'
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'mechanism', label: 'Mechanism' },
  { id: 'failures', label: 'Failures' },
  { id: 'structure', label: 'Structure' },
  { id: 'readout', label: 'Readout' },
]

const TASK2_TAB_LABELS = {
  vi: {
    overview: 'Tổng quan',
    mechanism: 'Cơ chế học',
    failures: 'Lỗi',
    structure: 'Cấu trúc',
    readout: 'Readout',
  },
  en: Object.fromEntries(TABS.map((tab) => [tab.id, tab.label])),
}

export default function Task2MetricsPanel({
  forcedTab = null,
  forcedFocus = null,
  forcedSelectedCell = null,
  hideTabControls = false,
  hideFocusControls = false,
  disableAutoSelection = false,
  reportMode = false,
  reportLimit = 56,
}) {
  const { lang } = useLanguage()
  const reportLang = lang
  const isViReport = reportLang === 'vi'
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
  const selectedModel = useGNNStore((s) => s.selectedModel)

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
  const modelSignature = useMemo(
    () => buildTask2ModelSignature(snap, snapshots, descriptors, selectedModel),
    [snap, snapshots, descriptors, selectedModel]
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
  const translatedFocusBuckets = useMemo(
    () => focusBuckets.map((bucket) => translateTask2FocusBucket(bucket, reportLang)),
    [focusBuckets, reportLang],
  )
  const translatedActiveFocus = useMemo(
    () => translateTask2FocusBucket(activeFocus, reportLang),
    [activeFocus, reportLang],
  )

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
    () => translateTask2EpochSuggestion(buildTask2BestEpochSuggestion(snapshots), reportLang),
    [snapshots, reportLang]
  )
  const focusStory = useMemo(
    () => buildTask2FocusStory({
      reliability,
      descriptors: focusedDescriptors,
      classNames: graphClassNames,
    }),
    [reliability, focusedDescriptors, graphClassNames]
  )
  const translatedNarrative = useMemo(() => {
    if (reportLang !== 'vi' || !narrative) return narrative
    return {
      ...narrative,
      mainInsight: translateTask2ReportText(narrative.mainInsight, reportLang),
      mainRisk: translateTask2ReportText(narrative.mainRisk, reportLang),
      recommendedNextLens: translateTask2ReportText(narrative.recommendedNextLens, reportLang),
    }
  }, [narrative, reportLang])
  const translatedResearchSignals = useMemo(() => {
    if (reportLang !== 'vi' || !researchSignals) return researchSignals
    return {
      collapse: translateTask2Signal(researchSignals.collapse, reportLang),
      calibration: translateTask2Signal(researchSignals.calibration, reportLang),
      shortcut: translateTask2Signal(researchSignals.shortcut, reportLang),
    }
  }, [researchSignals, reportLang])
  const translatedFocusStory = useMemo(() => {
    if (reportLang !== 'vi' || !focusStory) return focusStory
    return {
      ...focusStory,
      title: translateTask2ReportText(focusStory.title, reportLang),
      summary: translateTask2ReportText(focusStory.summary, reportLang),
      evidence: translateTask2ReportText(focusStory.evidence, reportLang),
      recommendation: translateTask2ReportText(focusStory.recommendation, reportLang),
    }
  }, [focusStory, reportLang])
  const translatedReliability = useMemo(() => {
    if (reportLang !== 'vi' || !reliability) return reliability
    return {
      ...reliability,
      readingGuide: translateTask2ReportText(reliability.readingGuide, reportLang),
      warnings: (reliability.warnings || []).map((warning) => translateTask2ReportText(warning, reportLang)),
    }
  }, [reliability, reportLang])
  const groundTruth = useMemo(() => focusedDescriptors.map((descriptor) => descriptor.groundTruth), [focusedDescriptors])
  const currentAccuracy = useMemo(() => {
    if (!snap) return null
    const validation = Number(snap.stable_val_acc ?? snap.val_acc)
    const allCorrect = Array.isArray(snap.graph_correct) && snap.graph_correct.length
      ? snap.graph_correct.reduce((sum, value) => sum + value, 0) / snap.graph_correct.length
      : null
    if (Number.isFinite(validation)) {
      return {
        label: snap.stable_val_acc != null ? 'Stable Val' : 'Val',
        value: validation * 100,
        secondary: Number.isFinite(allCorrect) ? allCorrect * 100 : null,
      }
    }
    if (!snap?.graph_correct?.length) return null
    const correct = snap.graph_correct.reduce((sum, value) => sum + value, 0)
    return {
      label: 'All',
      value: (correct / snap.graph_correct.length) * 100,
      secondary: null,
    }
  }, [snap])

  useEffect(() => {
    if (forcedTab) {
      setTab(forcedTab)
    }
  }, [forcedTab])

  // We only auto-select a featured graph ONCE per metrics-panel mount/snapshot
  // batch. Without this guard the effect would fight the “Back to Gallery”
  // button: user clears selectedNodeId → effect immediately re-selects the
  // featured graph → the gallery view is never shown.
  const didAutoSelectRef = useRef(false)
  const panelRootRef = useRef(null)
  useEffect(() => {
    didAutoSelectRef.current = false
  }, [snapshots.length])

  useEffect(() => {
    if (disableAutoSelection) return
    if (!featuredDescriptor) return
    if (didAutoSelectRef.current) return
    const explicit = focusedDescriptors.find((descriptor) => descriptor.originalGraphId === selectedNodeId)
    if (explicit) return
    if (selectedNodeId === featuredDescriptor.originalGraphId) return
    if (selectedNodeId !== null && selectedNodeId !== undefined) return
    didAutoSelectRef.current = true
    setSelectedNode(featuredDescriptor.originalGraphId)
  }, [disableAutoSelection, featuredDescriptor, focusedDescriptors, selectedNodeId, setSelectedNode])

  useEffect(() => {
    if (reportLang !== 'vi' || !panelRootRef.current) return undefined
    const rafId = window.requestAnimationFrame(() => {
      localizeTask2Element(panelRootRef.current, reportLang)
    })
    return () => window.cancelAnimationFrame(rafId)
  }, [
    reportMode,
    reportLang,
    tab,
    epochInt,
    selectedNodeId,
    focusedDescriptors.length,
    resolvedSelectedCell?.pred,
    resolvedSelectedCell?.gt,
    activeFocus.id,
  ])

  if (!snapshots.length) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 p-6 text-slate-500">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-500/15 bg-cyan-500/8 text-base font-semibold text-cyan-300">
          T2
        </div>
        <p className="text-sm font-semibold text-slate-300">{isViReport ? 'Chỉ số Task 2 sẽ hiện ở đây' : 'Task 2 metrics will appear here'}</p>
        <p className="max-w-xs text-center text-micro text-slate-500">
          {isViReport
            ? 'Hãy bắt đầu hoặc phát lại một lượt chạy phân loại đồ thị để kiểm tra lỗi ở mức collection, cấu trúc và chất lượng readout.'
            : 'Start or replay a graph classification run to inspect collection-level failures, structure, and readout quality.'}
        </p>
      </div>
    )
  }

  return (
    <div ref={panelRootRef} className="h-full">
      <Panel
      title={isViReport ? 'Lăng kính Task 2' : 'Task 2 Lens'}
      subtitle={isViReport
        ? `Chẩn đoán phân loại đồ thị cho ${datasetName || 'collection đang hoạt động'} qua độ tin cậy, lỗi, cấu trúc và hành vi readout.`
        : `Graph classification diagnostics for ${datasetName || 'the active collection'} across reliability, failures, structure, and readout behavior.`}
      padding="none"
      className="border-line-subtle/35 bg-deep/45 shadow-none"
      actions={(
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="rounded-full border border-cyan-500/20 bg-cyan-500/8 px-2.5 py-1 text-[11px] font-semibold text-cyan-300">
            Epoch {epochInt}
          </div>
          <div className="rounded-full border border-line-default bg-nebula px-2.5 py-1 text-[11px] font-semibold text-slate-300">
            {collectionSummary.totalGraphs} {isViReport ? 'đồ thị' : 'graphs'}
          </div>
          {currentAccuracy != null && (
            <div className="rounded-full border border-emerald-500/20 bg-emerald-500/8 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
              {currentAccuracy.label} {currentAccuracy.value.toFixed(1)}%
              {currentAccuracy.secondary != null && (
                <span className="ml-1 text-emerald-200/60">All {currentAccuracy.secondary.toFixed(1)}%</span>
              )}
            </div>
          )}
        </div>
      )}
      footer={(
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>{translatedReliability?.readingGuide}</span>
          <div className="flex flex-wrap items-center gap-2">
            {resolvedSelectedCell && !forcedSelectedCell && (
              <button
                type="button"
                onClick={() => setSelectedCell(null)}
                className="rounded-full border border-cyan-500/20 bg-cyan-500/8 px-2.5 py-1 font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/12"
              >
                {isViReport ? 'Ô' : 'Cell'} {resolvedSelectedCell.pred} {'->'} {resolvedSelectedCell.gt}
              </button>
            )}
            <span className="rounded-full border border-line-default bg-nebula px-2.5 py-1 font-semibold text-slate-300">
              {isViReport ? 'Lát cắt' : 'Focus'}: {translatedActiveFocus.label} ({focusedDescriptors.length})
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
                    : 'border-line-default bg-nebula text-slate-500 hover:border-line-default hover:text-slate-300'
                }`}
              >
                {TASK2_TAB_LABELS[reportLang]?.[item.id] || item.label}
              </button>
            ))}
          </div>
        )}

        {!hideFocusControls && (
          <FocusChipRow
            buckets={translatedFocusBuckets}
            activeId={activeFocus.id}
            onChange={setFocus}
          />
        )}

        <div className="min-h-0 flex-1">
          {tab === 'overview' && (
            <OverviewTab
              reliability={reliability}
              collectionSummary={collectionSummary}
              focus={translatedActiveFocus}
              filteredCount={focusedDescriptors.length}
              graphClassNames={graphClassNames}
              narrative={translatedNarrative}
              researchSignals={translatedResearchSignals}
              epochSuggestion={epochSuggestion}
              focusStory={translatedFocusStory}
              modelSignature={modelSignature}
              reportLang={reportLang}
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
              snap={snap}
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
              reportMode={reportMode}
              reportLimit={reportLimit}
              reportLang={reportLang}
            />
          )}
          {tab === 'mechanism' && (
            <MechanismTab
              signature={modelSignature}
              descriptors={focusedDescriptors}
              snapshots={snapshots}
              reportLang={reportLang}
              onSelect={setSelectedNode}
              onOpenReadout={(graphId) => {
                if (graphId != null) setSelectedNode(graphId)
                setTab('readout')
              }}
            />
          )}
          {tab === 'structure' && (
            <StructureTab
              snap={filteredSnap}
              graphs={focusedDescriptors}
              selectedId={selectedNodeId}
              onSelect={setSelectedNode}
              focus={translatedActiveFocus}
              selectedCell={resolvedSelectedCell}
              reportLang={reportLang}
            />
          )}
          {tab === 'readout' && (
            <ReadoutTab
              graph={featuredDescriptor}
              modelSignature={modelSignature}
              classNames={graphClassNames}
              onSelect={setSelectedNode}
              reportLang={reportLang}
            />
          )}
        </div>
        </div>
      </Panel>
    </div>
  )
}

function FocusChipRow({ buckets, activeId, onChange }) {
  if (!buckets?.length) return null
  return (
    <div className="flex flex-wrap gap-1.5 p-1 rounded-2xl bg-slate-950/45 border border-line-subtle/30 w-fit max-w-full">
      {buckets.map((bucket) => {
        const active = bucket.id === activeId
        return (
          <button
            key={bucket.id}
            type="button"
            onClick={() => onChange(bucket.id)}
            title={bucket.description}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all duration-200 focus:outline-none ${
              active
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/25 shadow-[0_2px_8px_rgba(6,182,212,0.15)]'
                : 'text-slate-400 border border-transparent hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <span>{bucket.label}</span>
            <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold ${
              active ? 'bg-cyan-500/20 text-cyan-200' : 'bg-slate-900/60 text-slate-500'
            }`}>
              {bucket.graphIds?.length ?? 0}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function ShortcutBiasMeter({ label, value }) {
  const isFinite = Number.isFinite(value)
  const displayVal = isFinite ? value.toFixed(2) : '0.00'
  const percentage = isFinite ? ((value + 1) / 2) * 100 : 50 // Map -1..1 to 0..100%
  
  const absVal = Math.abs(value || 0)
  const isHighBias = absVal > 0.35
  const isMediumBias = absVal > 0.2 && absVal <= 0.35
  
  const barColor = isHighBias 
    ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' 
    : isMediumBias 
      ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' 
      : 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]'
      
  return (
    <div className="flex flex-col gap-1.5 p-3 rounded-2xl border border-line-subtle/25 bg-slate-950/20">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-semibold text-slate-400">
        <span>{label}</span>
        <span className={`font-mono font-bold text-xs ${
          isHighBias ? 'text-red-400' : isMediumBias ? 'text-amber-400' : 'text-slate-200'
        }`}>
          {value > 0 ? `+${displayVal}` : displayVal}
        </span>
      </div>
      
      <div className="relative h-2 w-full rounded-full bg-slate-900 overflow-visible border border-line-subtle/15 mt-1">
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-800" />
        {isFinite && (
          <div 
            className={`absolute top-0 bottom-0 rounded-full ${barColor}`}
            style={{
              left: value >= 0 ? '50%' : `${percentage}%`,
              right: value >= 0 ? `${100 - percentage}%` : '50%'
            }}
          />
        )}
        {isFinite && (
          <div 
            className="absolute -top-1 w-3 h-3 rounded-full bg-white border-2 border-slate-950 -ml-1.5 shadow"
            style={{ left: `${percentage}%` }}
          />
        )}
      </div>
      
      <div className="flex items-center justify-between text-[8px] font-mono text-slate-600">
        <span>-1.0</span>
        <span>0.0</span>
        <span>+1.0</span>
      </div>
    </div>
  )
}

function CircularGauge({ label, value, max = 1, format = (v) => `${(v * 100).toFixed(0)}%`, tone = 'info', description }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const radius = 24
  const strokeWidth = 4
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (pct / 100) * circumference
  
  const colors = {
    good: { stroke: 'stroke-emerald-400 fill-none', text: 'text-emerald-300', bg: 'bg-emerald-500/8 border-emerald-500/15' },
    warn: { stroke: 'stroke-amber-400 fill-none', text: 'text-amber-300', bg: 'bg-amber-500/8 border-amber-500/15' },
    bad: { stroke: 'stroke-red-400 fill-none', text: 'text-red-300', bg: 'bg-red-500/8 border-red-500/15' },
    info: { stroke: 'stroke-cyan-400 fill-none', text: 'text-cyan-300', bg: 'bg-slate-900/35 border-line-subtle/25' }
  }
  const color = colors[tone] || colors.info

  return (
    <div className={`flex items-center gap-3 p-3 rounded-2xl border ${color.bg}`}>
      <div className="relative w-14 h-14 shrink-0">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 60 60">
          <circle
            cx="30"
            cy="30"
            r={radius}
            className="stroke-slate-900/80 fill-none"
            strokeWidth={strokeWidth}
          />
          <circle
            cx="30"
            cy="30"
            r={radius}
            className={`transition-all duration-500 ease-out ${color.stroke}`}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-bold text-slate-100">
          {format(value)}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-nano font-bold uppercase tracking-wider text-slate-400">{label}</div>
        <p className="text-[10px] leading-tight text-slate-500 mt-0.5 truncate" title={description}>{description}</p>
      </div>
    </div>
  )
}

function TrustProfileVisual({ metrics, reportLang = 'vi' }) {
  if (!metrics) return null
  const isVi = reportLang === 'vi'
  const brier = metrics.brier ?? 0
  const highConfWrong = metrics.highConfWrongRate ?? 0
  const shortcutRisk = metrics.shortcutRiskScore ?? 0
  const diffuseShare = metrics.readoutDiffuseShare ?? 0
  const temp = metrics.calibrationTemperature ?? 1.0

  return (
    <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/5 p-4">
      <div className="flex items-center justify-between mb-1">
        <div className="text-nano font-bold uppercase tracking-ultra text-emerald-300">
          Trust profile
        </div>
        <div className="text-[10px] font-mono text-slate-500 bg-slate-900/55 px-2 py-0.5 rounded border border-line-subtle/15">
          Temp Scale: <span className="font-bold text-slate-200">{Number.isFinite(temp) ? temp.toFixed(2) : '1.00'}</span>
        </div>
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed mb-3.5">
        {isVi 
          ? 'Chẩn đoán độ tin cậy của xác suất dự đoán, các lỗi tự tin sai, áp lực shortcut và mức tập trung của readout.' 
          : 'Diagnostic of confidence calibration, confident mistakes, shortcut pressure, and readout focus.'}
      </p>
      
      <div className="grid gap-2.5 sm:grid-cols-2">
        <CircularGauge 
          label="Brier" 
          value={brier}
          format={(v) => v.toFixed(3)}
          tone={brier < 0.18 ? 'good' : 'warn'}
          description={isVi ? 'Sai số dự đoán bình phương (càng nhỏ càng tốt)' : 'Squared prediction error (lower is better)'}
        />
        <CircularGauge 
          label="High-conf wrong" 
          value={highConfWrong}
          tone={highConfWrong > 0.15 ? 'bad' : highConfWrong > 0.05 ? 'warn' : 'good'}
          description={isVi ? 'Tỉ lệ dự đoán sai khi confidence >= 75%' : 'Ratio of incorrect predictions when confidence >= 75%'}
        />
        <CircularGauge 
          label="Shortcut risk" 
          value={shortcutRisk}
          format={(v) => v.toFixed(2)}
          tone={Math.abs(shortcutRisk) > 0.5 ? 'bad' : Math.abs(shortcutRisk) > 0.3 ? 'warn' : 'good'}
          description={isVi ? 'Mức độ mô hình bám vào kích thước/mật độ đồ thị' : 'Degree to which model relies on graph size/density'}
        />
        <CircularGauge 
          label="Readout diffuse" 
          value={diffuseShare}
          tone={diffuseShare > 0.45 ? 'bad' : diffuseShare > 0.25 ? 'warn' : 'good'}
          description={isVi ? 'Tỷ lệ đồ thị có attention bị phân tán' : 'Ratio of graphs with spread-out attention'}
        />
      </div>
    </div>
  )
}

function ClassMetricBar({ label, value, colorClass }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
        <span>{label}</span>
        <span className="font-bold text-slate-200">{(value * 100).toFixed(1)}%</span>
      </div>
      <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-line-subtle/10">
        <div 
          className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
          style={{ width: `${value * 100}%` }}
        />
      </div>
    </div>
  )
}

// Global variable taskData can contain classNames or the store can. Let's make sure classNames fallback works.
function PerClassMetricsVisual({ perClass = [], classNames = [], reportLang = 'vi' }) {
  if (!perClass?.length) return null
  const isVi = reportLang === 'vi'
  
  return (
    <div className="rounded-2xl border border-line-default bg-nebula p-4 space-y-3.5">
      <div>
        <span className="block text-nano font-bold uppercase tracking-ultra text-slate-500">
          {isVi ? 'CHỈ SỐ THEO LỚP' : 'Per-class metrics'}
        </span>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          {isVi 
            ? 'So sánh hiệu năng Precision, Recall và F1-Score trên từng nhãn phân loại.' 
            : 'Performance comparison of Precision, Recall, and F1-score across classes.'}
        </p>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2">
        {perClass.map((row) => {
          const className = classNames[row.class_id] || `Class ${row.class_id}`
          return (
            <div key={row.class_id} className="p-3 rounded-2xl border border-line-subtle bg-slate-950/20 space-y-3">
              <div className="flex items-center justify-between border-b border-line-subtle/20 pb-2">
                <span className="text-xs font-bold text-cyan-300 uppercase tracking-wide">{className}</span>
                <span className="text-[10px] font-mono bg-slate-900/60 px-2 py-0.5 rounded text-slate-400">
                  {isVi ? 'Hỗ trợ' : 'Support'}: <span className="font-bold text-slate-300">{row.support}</span>
                </span>
              </div>
              
              <div className="space-y-2.5">
                <ClassMetricBar label="Precision" value={row.precision} colorClass="bg-cyan-500 shadow-[0_0_6px_rgba(6,182,212,0.3)]" />
                <ClassMetricBar label="Recall" value={row.recall} colorClass="bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.3)]" />
                <ClassMetricBar label="F1-Score" value={row.f1} colorClass="bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.3)]" />
              </div>
              
              <div className="flex items-center justify-between text-[10px] bg-slate-900/40 p-2 rounded-xl text-slate-400">
                <span>{isVi ? 'Xác suất trung bình (Mean Conf)' : 'Mean Confidence'}</span>
                <span className="font-mono font-bold text-slate-200">{(row.mean_confidence * 100).toFixed(1)}%</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CollectionBalanceVisual({ classCounts = [], reportLang = 'vi' }) {
  if (!classCounts?.length) return null
  const isVi = reportLang === 'vi'
  
  const colors = [
    'from-cyan-500 to-cyan-400',
    'from-violet-500 to-violet-400',
    'from-amber-500 to-amber-400',
    'from-emerald-500 to-emerald-400'
  ]

  return (
    <div className="rounded-2xl border border-line-default bg-nebula p-4 space-y-3">
      <div>
        <span className="block text-nano font-bold uppercase tracking-ultra text-slate-500">
          {isVi ? 'CÂN BẰNG COLLECTION' : 'Collection balance'}
        </span>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          {isVi 
            ? 'Phân bổ số lượng đồ thị thực tế giữa các lớp.' 
            : 'Distribution of graph counts across classes.'}
        </p>
      </div>
      
      <div className="h-4 w-full rounded-full bg-slate-950 flex overflow-hidden border border-line-subtle/10 animate-pulse-subtle">
        {classCounts.map((item, idx) => {
          const pct = item.share * 100
          if (pct <= 0) return null
          const color = colors[idx % colors.length]
          return (
            <div 
              key={item.classId}
              style={{ width: `${pct}%` }}
              title={`${item.label}: ${item.support} (${pct.toFixed(1)}%)`}
              className={`h-full bg-gradient-to-r ${color} transition-all duration-500`}
            />
          )
        })}
      </div>
      
      <div className="flex flex-wrap gap-x-4 gap-y-2.5 pt-1">
        {classCounts.map((item, idx) => {
          const pct = item.share * 100
          const colorDot = colors[idx % colors.length].split(' ')[0].replace('from-', 'bg-')
          return (
            <div key={item.classId} className="flex items-center gap-2 text-xs">
              <span className={`w-2.5 h-2.5 rounded-full ${colorDot}`} />
              <span className="font-semibold text-slate-200">{item.label}</span>
              <span className="font-mono text-slate-500">
                {item.support} ({pct.toFixed(0)}%)
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ReliabilityAlertBanner({ reliability, reportLang = 'vi' }) {
  if (!reliability) return null
  const isVi = reportLang === 'vi'
  const isDanger = reliability.status === 'danger'
  const isWarn = reliability.status === 'warn'
  
  if (!isDanger && !isWarn) return null
  
  const borderTone = isDanger ? 'border-red-500/25 bg-red-500/8' : 'border-amber-500/25 bg-amber-500/8'
  const textTone = isDanger ? 'text-red-300' : 'text-amber-300'
  const badgeTone = isDanger ? 'bg-red-500/20 text-red-200 border-red-500/30' : 'bg-amber-500/20 text-amber-200 border-amber-500/30'
  
  return (
    <div className={`flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 rounded-2xl border ${borderTone} transition-all duration-300`}>
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 text-base">⚠️</span>
        <div>
          <h4 className={`text-xs font-bold uppercase tracking-wider ${textTone}`}>
            {isVi 
              ? (isDanger ? 'RÀO CHẮN ĐỘ TIN CẬY: ĐỌC YẾU' : 'RÀO CHẮN ĐỘ TIN CẬY: CẦN THÊM NGỮ CẢNH')
              : (isDanger ? 'Reliability Guardrail: Fragile Read' : 'Reliability Guardrail: Needs Context')}
          </h4>
          <p className="text-[11px] text-slate-300 leading-relaxed mt-0.5">{reliability.readingGuide}</p>
          {!!reliability.warnings?.length && (
            <ul className="list-disc list-inside mt-1.5 space-y-1 text-[10px] text-slate-400">
              {reliability.warnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className={`self-start md:self-center shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badgeTone}`}>
        {isDanger ? (isVi ? 'Yếu' : 'Fragile') : (isVi ? 'Cần Ngữ Cảnh' : 'Needs Context')}
      </div>
    </div>
  )
}

function Task2ModelSignatureCard({ signature, reportLang = 'en' }) {
  if (!signature) return null
  const isVi = reportLang === 'vi'
  const metricRows = signature.id === 'GAT'
    ? [
      [isVi ? 'Độ tập trung attention' : 'Attention focus', signature.metrics.attention_focus],
      [isVi ? 'Top-k đóng góp' : 'Top-k mass', signature.metrics.topk_contribution_mass],
      [isVi ? 'Entropy giảm' : 'Entropy drop', signature.metrics.attention_entropy_trend],
    ]
    : signature.id === 'SAGE'
      ? [
        [isVi ? 'Độ ổn định' : 'Stability', signature.metrics.score_stability],
        [isVi ? 'Graph dao động' : 'Flip rate', signature.metrics.prediction_flip_rate],
        [isVi ? 'Dao động margin' : 'Margin variance', signature.metrics.margin_variance],
      ]
      : [
        [isVi ? 'Độ mượt readout' : 'Readout smoothness', signature.metrics.readout_smoothness],
        [isVi ? 'Đồng thuận cạnh' : 'Edge agreement', signature.metrics.contribution_agreement],
        [isVi ? 'Readout loãng' : 'Diffuse share', signature.metrics.diffuse_readout_share],
      ]

  return (
    <div className="rounded-2xl border border-cyan-500/18 bg-cyan-500/8 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-nano font-bold uppercase tracking-ultra text-cyan-300">
            {isVi ? 'Dấu hiệu model đang học gì' : 'Model learning signature'}
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-100">{signature.primaryLabel}</div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{signature.explanation}</p>
        </div>
        <div className="rounded-full border border-cyan-400/25 bg-cyan-500/12 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-cyan-100">
          {signature.metricLabel} {(signature.currentScore * 100).toFixed(0)}%
        </div>
      </div>
      <div className="mt-3.5 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
        {metricRows.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-line-subtle bg-nebula p-2">
            <div className="text-[9px] font-bold uppercase tracking-ultra text-slate-500 leading-tight">{label}</div>
            <div className="mt-1 font-mono text-sm font-bold text-slate-100">{(Math.max(0, Math.min(1, value || 0)) * 100).toFixed(0)}%</div>
          </div>
        ))}
      </div>
      {signature.trend?.length > 1 && (
        <div className="mt-3.5">
          <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <span>{isVi ? 'Sparkline theo epoch' : 'Epoch sparkline'}</span>
            <span>{signature.trend.length} frames</span>
          </div>
          <div className="flex h-10 items-end gap-1 rounded-xl border border-line-subtle bg-nebula px-2 py-1">
            {signature.trend.slice(-32).map((point) => (
              <div
                key={point.epoch}
                className="min-w-0 flex-1 rounded-t bg-cyan-400/75 transition-all duration-350 hover:bg-cyan-300"
                title={`Epoch ${point.epoch}: ${(point.value * 100).toFixed(1)}%`}
                style={{ height: `${Math.max(8, Math.min(100, point.value * 100))}%` }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function getMechanismCopy(signature, reportLang = 'en') {
  const isVi = reportLang === 'vi'
  if (signature?.id === 'GAT') {
    return {
      title: isVi ? 'GAT học bằng cách khóa attention vào motif quyết định' : 'GAT learns by locking attention onto decisive motifs',
      principle: isVi
        ? 'Mô hình không xem mọi hàng xóm như nhau. Nó học node hoặc cạnh nào đáng tin hơn, rồi để một nhóm nhỏ node kéo readout của cả graph.'
        : 'The model does not treat every neighbor equally. It learns which nodes or edges deserve more weight, then lets a small set pull the graph readout.',
      expected: isVi
        ? 'Khi học tốt, top-k node đóng góp tăng, entropy giảm, và các graph cùng lớp bắt đầu khóa vào motif giống nhau.'
        : 'When learning is healthy, top-k contribution rises, entropy falls, and same-class graphs begin to lock onto similar motifs.',
      risk: isVi
        ? 'Nếu attention quá hẹp hoặc đổi liên tục, GAT có thể khóa nhầm motif và vẫn rất tự tin.'
        : 'If attention is too narrow or keeps moving, GAT can lock onto the wrong motif while staying confident.',
      primary: isVi ? 'Motif lock' : 'Motif lock',
      secondary: isVi ? 'Entropy còn lại' : 'Remaining entropy',
    }
  }
  if (signature?.id === 'SAGE') {
    return {
      title: isVi ? 'GraphSAGE học bằng biểu quyết lân cận ổn định dần' : 'GraphSAGE learns through stabilizing neighborhood votes',
      principle: isVi
        ? 'Mỗi node gom ngữ cảnh từ vùng lân cận, rồi graph-level readout dùng các vùng vote đó để quyết định nhãn toàn graph.'
        : 'Each node aggregates local neighborhood context, then the graph readout uses those neighborhood votes to decide the graph label.',
      expected: isVi
        ? 'Khi học tốt, prediction ít flip hơn, margin bớt dao động, và các graph sát biên dần có quyết định rõ hơn.'
        : 'When learning is healthy, predictions flip less, margins calm down, and boundary graphs settle into clearer decisions.',
      risk: isVi
        ? 'Nếu neighborhood vote yếu, cùng một graph sẽ đổi ý nhiều lần qua epoch hoặc giữ margin rất mỏng.'
        : 'If the neighborhood vote is weak, the same graph keeps changing its mind across epochs or keeps a very thin margin.',
      primary: isVi ? 'Vote ổn định' : 'Vote stability',
      secondary: isVi ? 'Flip pressure' : 'Flip pressure',
    }
  }
  return {
    title: isVi ? 'GCN học bằng lan truyền và làm mượt tín hiệu cấu trúc' : 'GCN learns by propagating and smoothing structural signals',
    principle: isVi
      ? 'Mỗi lớp GCN trộn tín hiệu qua cạnh, nên các node kề nhau dần có biểu diễn đồng thuận hơn trước khi được gom thành graph embedding.'
      : 'Each GCN layer mixes signals across edges, so neighboring nodes gradually become more aligned before they are pooled into a graph embedding.',
    expected: isVi
      ? 'Khi học tốt, đóng góp giữa các node kề nhau đồng thuận hơn, readout mượt hơn, và motif không bị chia thành nhiều tín hiệu rời rạc.'
      : 'When learning is healthy, neighboring node contributions agree more, the readout smooths out, and motifs stop fragmenting into isolated signals.',
    risk: isVi
      ? 'Nếu quá mượt, graph khác nhau có thể trông giống nhau trong embedding và motif quyết định bị loãng.'
      : 'If it oversmooths, different graphs can look too similar in embedding space and the decisive motif gets diluted.',
    primary: isVi ? 'Độ mượt' : 'Smoothing',
    secondary: isVi ? 'Readout loãng' : 'Diffuse readout',
  }
}

function getMechanismRows(signature, reportLang = 'en') {
  const isVi = reportLang === 'vi'
  const metrics = signature?.metrics || {}
  if (signature?.id === 'GAT') {
    return [
      { label: isVi ? 'Attention focus' : 'Attention focus', value: metrics.attention_focus, tone: metrics.attention_focus > 0.65 ? 'good' : 'warn' },
      { label: isVi ? 'Top-k motif mass' : 'Top-k motif mass', value: metrics.topk_contribution_mass, tone: metrics.topk_contribution_mass > 0.65 ? 'good' : 'warn' },
      { label: isVi ? 'Entropy đã giảm' : 'Entropy resolved', value: metrics.attention_entropy_trend, tone: metrics.attention_entropy_trend > 0.45 ? 'good' : 'warn' },
      { label: isVi ? 'Motif lock score' : 'Motif lock score', value: metrics.motif_lock_score, tone: metrics.motif_lock_score > 0.45 ? 'good' : 'warn' },
    ]
  }
  if (signature?.id === 'SAGE') {
    return [
      { label: isVi ? 'Vote stability' : 'Vote stability', value: metrics.score_stability, tone: metrics.score_stability > 0.65 ? 'good' : 'warn' },
      { label: isVi ? 'Ít flip hơn' : 'Flip resistance', value: 1 - (metrics.prediction_flip_rate || 0), tone: metrics.prediction_flip_rate < 0.15 ? 'good' : 'warn' },
      { label: isVi ? 'Margin ổn định' : 'Margin calm', value: 1 - (metrics.margin_variance || 0), tone: metrics.margin_variance < 0.18 ? 'good' : 'warn' },
      { label: isVi ? 'Graph dao động' : 'Unstable graphs', value: Math.min(1, (signature.unstableGraphIds?.length || 0) / 12), tone: signature.unstableGraphIds?.length ? 'bad' : 'good' },
    ]
  }
  return [
    { label: isVi ? 'Readout smoothness' : 'Readout smoothness', value: metrics.readout_smoothness, tone: metrics.readout_smoothness > 0.55 ? 'good' : 'warn' },
    { label: isVi ? 'Neighbor agreement' : 'Neighbor agreement', value: metrics.contribution_agreement, tone: metrics.contribution_agreement > 0.55 ? 'good' : 'warn' },
    { label: isVi ? 'Embedding tightening' : 'Embedding tightening', value: metrics.embedding_cluster_tightening, tone: metrics.embedding_cluster_tightening > 0.5 ? 'good' : 'warn' },
    { label: isVi ? 'Readout không loãng' : 'Readout clarity', value: 1 - (metrics.diffuse_readout_share || 0), tone: metrics.diffuse_readout_share < 0.35 ? 'good' : 'warn' },
  ]
}

function rankMechanismGraphs(signature, descriptors = []) {
  const model = signature?.id || 'GCN'
  const unstable = new Set(signature?.unstableGraphIds || [])
  return [...descriptors]
    .map((graph) => {
      const base =
        model === 'GAT'
          ? (graph.readoutConcentration || 0) * 0.55 + (1 - (graph.entropy || 0)) * 0.35 + (graph.correct === 1 ? 0.1 : 0)
          : model === 'SAGE'
            ? (unstable.has(graph.originalGraphId) ? 0.55 : 0) + (1 - Math.min(1, graph.margin || 0)) * 0.25 + (graph.correct === 0 ? 0.2 : 0)
            : (1 - (graph.entropy || 0)) * 0.35 + (graph.readoutBucket !== 'diffuse' ? 0.25 : 0) + (graph.correct === 1 ? 0.2 : 0) + (1 - Math.min(1, graph.structuralOutlierScore || 0)) * 0.2
      return { ...graph, mechanismScore: Math.max(0, Math.min(1, base)) }
    })
    .sort((a, b) => b.mechanismScore - a.mechanismScore)
    .slice(0, 4)
}

function MechanismTab({ signature, descriptors = [], snapshots = [], reportLang = 'en', onSelect, onOpenReadout }) {
  if (!signature) {
    return <EmptyState title="No mechanism signal" description="Start Task 2 training to inspect how the selected model is learning graph labels." />
  }

  const isVi = reportLang === 'vi'
  const copy = getMechanismCopy(signature, reportLang)
  const rows = getMechanismRows(signature, reportLang)
  const examples = rankMechanismGraphs(signature, descriptors)
  const lastTrend = signature.trend?.slice(-40) || []

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
      <div className="rounded-2xl border border-cyan-500/18 bg-cyan-500/8 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-nano font-bold uppercase tracking-ultra text-cyan-300">
              {isVi ? 'Model mechanism lens' : 'Model mechanism lens'}
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-100">{copy.title}</div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-300">{copy.principle}</p>
          </div>
          <div className="rounded-full border border-cyan-400/25 bg-cyan-500/12 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-cyan-100">
            {signature.shortLabel}
          </div>
        </div>
        <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <MechanismTextBlock label={isVi ? 'Khi học đúng hướng' : 'Healthy learning evidence'} value={copy.expected} />
          <MechanismTextBlock label={isVi ? 'Rủi ro cần nhìn kỹ' : 'Failure mode to watch'} value={copy.risk} />
        </div>
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {rows.map((row) => (
          <StatCell
            key={row.label}
            label={row.label}
            value={(Math.max(0, Math.min(1, row.value || 0)) * 100)}
            digits={0}
            suffix="%"
            tone={row.tone}
          />
        ))}
      </div>

      <div className="rounded-2xl border border-line-default bg-nebula p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-nano font-bold uppercase tracking-ultra text-slate-500">
              {isVi ? 'Bằng chứng theo epoch' : 'Epoch evidence'}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              {copy.primary} {isVi ? 'là tín hiệu chính; cột mờ bên dưới là tín hiệu phụ để biết model đang ổn định hay đang phân tán.' : 'is the primary signal; the muted rail tracks the secondary pressure behind it.'}
            </p>
          </div>
          <span className="rounded-full border border-line-default bg-nebula px-2.5 py-1 text-[11px] font-semibold text-slate-300">
            {snapshots.length} epochs
          </span>
        </div>
        <div className="grid h-24 grid-cols-[minmax(0,1fr)] gap-2 rounded-xl border border-line-subtle bg-nebula px-2 py-2">
          <div className="flex items-end gap-1">
            {lastTrend.map((point) => (
              <div key={`p-${point.epoch}`} className="min-w-0 flex-1 rounded-t bg-cyan-400/80" style={{ height: `${Math.max(8, Math.min(100, point.value * 100))}%` }} title={`Epoch ${point.epoch}: ${(point.value * 100).toFixed(1)}%`} />
            ))}
          </div>
          <div className="flex items-end gap-1">
            {lastTrend.map((point) => (
              <div key={`s-${point.epoch}`} className="min-w-0 flex-1 rounded-t bg-slate-500/45" style={{ height: `${Math.max(6, Math.min(100, (point.secondary || 0) * 100))}%` }} title={`Epoch ${point.epoch}: ${(Number(point.secondary || 0) * 100).toFixed(1)}%`} />
            ))}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          <span>{copy.primary}</span>
          <span>{copy.secondary}</span>
        </div>
      </div>

      <div className="rounded-2xl border border-line-default bg-nebula p-3">
        <div className="mb-3">
          <div className="text-nano font-bold uppercase tracking-ultra text-slate-500">
            {isVi ? 'Graph chứng minh cơ chế học' : 'Mechanism evidence graphs'}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            {isVi ? 'Các graph này được chọn vì chúng làm lộ rõ nhất cách model đang ra quyết định, không chỉ vì đúng hay sai.' : 'These graphs are ranked by how clearly they expose the model behavior, not just by correctness.'}
          </p>
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
          {examples.map((graph) => (
            <MechanismGraphCard
              key={graph.originalGraphId}
              graph={graph}
              signature={signature}
              reportLang={reportLang}
              onSelect={onSelect}
              onOpenReadout={onOpenReadout}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function MechanismTextBlock({ label, value }) {
  return (
    <div className="rounded-xl border border-line-subtle bg-nebula p-3">
      <div className="text-[10px] font-bold uppercase tracking-ultra text-slate-500">{label}</div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-300">{value}</p>
    </div>
  )
}

function MechanismGraphCard({ graph, signature, reportLang = 'en', onSelect, onOpenReadout }) {
  const isVi = reportLang === 'vi'
  const model = signature?.id || 'GCN'
  const reason = model === 'GAT'
    ? `${isVi ? 'Top-k đóng góp' : 'Top-k mass'} ${(graph.readoutConcentration * 100).toFixed(0)}%, entropy ${((graph.entropy || 0) * 100).toFixed(0)}%.`
    : model === 'SAGE'
      ? `${isVi ? 'Margin' : 'Margin'} ${((graph.margin || 0) * 100).toFixed(1)}%, ${signature.unstableGraphIds?.includes(graph.originalGraphId) ? (isVi ? 'đang dao động' : 'unstable') : (isVi ? 'đang ổn định' : 'settling')}.`
      : `${isVi ? 'Readout' : 'Readout'} ${graph.readoutBucket}, ${isVi ? 'motif' : 'motif'} ${graph.motifSignature}.`

  return (
    <div className="rounded-xl border border-line-subtle bg-nebula p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold text-slate-100">G#{graph.originalGraphId}</div>
          <div className={`mt-1 text-[10px] font-semibold ${graph.correct === 1 ? 'text-emerald-300' : 'text-red-300'}`}>
            {graph.correct === 1 ? (isVi ? 'Đúng' : 'Correct') : (isVi ? 'Sai' : 'Wrong')}
          </div>
        </div>
        <span className="rounded-full border border-line-default bg-nebula px-2 py-0.5 text-[10px] font-mono text-slate-300">
          {(graph.mechanismScore * 100).toFixed(0)}%
        </span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{reason}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <TagChip label={graph.densityBucket} tone="info" />
        <TagChip label={graph.entropyBucket} tone={graph.entropyBucket === 'diffuse' ? 'warn' : 'good'} />
        <TagChip label={graph.failureTag} tone={graph.correct === 1 ? 'good' : 'bad'} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSelect?.(graph.originalGraphId)}
          className="rounded-full border border-cyan-400/25 bg-cyan-500/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-ultra text-cyan-100 transition-colors hover:bg-cyan-500/18"
        >
          Focus
        </button>
        <button
          type="button"
          onClick={() => onOpenReadout?.(graph.originalGraphId)}
          className="rounded-full border border-line-subtle bg-nebula px-2.5 py-1 text-[10px] font-semibold uppercase tracking-ultra text-slate-200 transition-colors hover:bg-nebula"
        >
          Readout
        </button>
      </div>
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
  modelSignature,
  reportLang = 'en',
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
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
      {/* Top Banner Alert if reliability has issues */}
      <ReliabilityAlertBanner reliability={reliability} reportLang={reportLang} />

      {/* Main Grid: 2 columns on larger screens */}
      <div className="grid gap-4 lg:grid-cols-[38%_62%] items-start">
        
        {/* Left Column: Narrative, suggestions, actions */}
        <div className="flex flex-col gap-4 min-w-0">
          <Task2ModelSignatureCard signature={modelSignature} reportLang={reportLang} />
          
          <HeroNarrativeCard narrative={narrative} onNextLensAction={onNextLensAction} reportLang={reportLang} />
          
          <BestEpochSuggestionCard suggestion={epochSuggestion} onJumpToEpoch={onJumpToEpoch} reportLang={reportLang} />
          
          {metrics.weakClass && (
            <div className="rounded-2xl border border-amber-500/18 bg-amber-500/5 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-nano font-bold uppercase tracking-ultra text-amber-200">Weak-class watch</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                    {metrics.weakClass.label} is the weakest class right now with recall {(metrics.weakClass.recall * 100).toFixed(1)}% and F1 {(metrics.weakClass.f1 * 100).toFixed(1)}%.
                    Use the <span className="text-amber-200">Weak-class misses</span> focus chip to inspect why recall is lagging.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onJumpToWeakClass}
                  className="shrink-0 rounded-xl border border-amber-400/25 bg-amber-500/12 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-ultra text-amber-100 transition-colors hover:bg-amber-500/18"
                >
                  Open slice
                </button>
              </div>
            </div>
          )}

          <FocusRoutingCard
            story={focusStory}
            weakClass={metrics.weakClass}
            onJumpToWeakClass={onJumpToWeakClass}
            onJumpToStructure={onJumpToStructure}
            reportLang={reportLang}
          />
        </div>
        
        {/* Right Column: Visual analytics dashboard */}
        <div className="flex flex-col gap-4 min-w-0">
          
          {/* Trust Profile Visual Progress Meters */}
          <TrustProfileVisual metrics={metrics} reportLang={reportLang} />
          
          {/* Shortcut Bias Horizontal Scale Gauges */}
          <div className="rounded-2xl border border-line-default bg-nebula p-4 space-y-3">
            <div>
              <span className="block text-nano font-bold uppercase tracking-ultra text-slate-500">
                {reportLang === 'vi' ? 'THIÊN LỆCH SHORTCUT' : 'Shortcut bias'}
              </span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {reportLang === 'vi' 
                  ? 'Tương quan giữa mức độ tự tin dự đoán và các đặc tính cấu trúc đồ thị. Nếu tương quan tuyệt đối > 0.35, mô hình có nguy cơ cao chỉ học tắt theo đặc tính đó.' 
                  : 'Correlation between confidence and graph properties. absolute value > 0.35 suggests structural shortcut risk.'}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <ShortcutBiasMeter label={reportLang === 'vi' ? 'Tự tin vs Mật độ' : 'Conf vs Density'} value={densityBias} />
              <ShortcutBiasMeter label={reportLang === 'vi' ? 'Tự tin vs Kích thước' : 'Conf vs Size'} value={sizeBias} />
              <ShortcutBiasMeter label={reportLang === 'vi' ? 'Tự tin vs Số cạnh' : 'Conf vs Edges'} value={metrics.edgeBias || 0} />
            </div>
          </div>
          
          {/* Per Class Metrics Visual Bar Comparison */}
          <PerClassMetricsVisual perClass={perClass} classNames={graphClassNames} reportLang={reportLang} />
          
          {/* Collection Balance Stacked Distribution Bar */}
          <CollectionBalanceVisual classCounts={classCounts} reportLang={reportLang} />

          {/* Quick stats row */}
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-5">
            <StatCell label="Graphs" value={collectionSummary.totalGraphs} digits={0} tone="good" />
            <StatCell label="Classes" value={graphClassNames.length || 1} digits={0} tone="info" />
            <StatCell label="Avg Nodes" value={collectionSummary.avgNodes} digits={1} tone="warn" />
            <StatCell label="Avg Edges" value={collectionSummary.avgEdges} digits={1} tone="warn" />
            <StatCell label="ECE" value={(calibrationEce || 0) * 100} digits={1} suffix="%" tone={Number.isFinite(calibrationEce) && calibrationEce < 0.1 ? 'good' : 'warn'} />
          </div>

          {/* Training Trend Chart */}
          <div className="rounded-2xl border border-line-default bg-nebula p-4 space-y-2">
            <div>
              <span className="block text-nano font-bold uppercase tracking-ultra text-slate-500">
                {reportLang === 'vi' ? 'XU HƯỚNG HUẤN LUYỆN' : 'Training trend'}
              </span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {reportLang === 'vi' 
                  ? 'Đường sức khỏe huấn luyện toàn cục. Kiểm tra khu vực overfit và nhấp vào best epoch để nhảy tới.' 
                  : 'Global health metrics over epochs. Look for overfit zones and click recommendations.'}
              </p>
            </div>
            <div className="h-[220px]">
              <MetricsChart />
            </div>
          </div>
          
        </div>
      </div>
      
      {/* Research Signals at the bottom - wide row */}
      <ResearchSignalsCard signals={researchSignals} onSignalAction={onSignalAction} reportLang={reportLang} />
    </div>
  )
}

function ResearchSignalsCard({ signals, onSignalAction, reportLang = 'vi' }) {
  const items = [signals?.collapse, signals?.calibration, signals?.shortcut].filter(Boolean)
  if (!items.length) return null
  const isVi = reportLang === 'vi'

  return (
    <div className="rounded-2xl border border-violet-500/15 bg-violet-500/5 p-4 mt-2">
      <div className="text-nano font-bold uppercase tracking-ultra text-violet-200">
        {isVi ? 'TÍN HIỆU NGHIÊN CỨU' : 'Research signals'}
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
        {isVi
          ? 'Các phân tích tự động trả lời ba câu hỏi quan trọng: mô hình có bị sụp đổ dự đoán về một lớp, độ tin cậy của xác suất có khớp thực tế, và mô hình có dùng shortcut cấu trúc.'
          : 'Automated signals answering three key questions: model collapse, calibration trustworthiness, and structural shortcuts.'}
      </p>
      <div className="mt-3.5 grid gap-3 md:grid-cols-3">
        {items.map((item) => (
          <SignalCard key={item.id} signal={item} onAction={onSignalAction} reportLang={reportLang} />
        ))}
      </div>
    </div>
  )
}

function TrustProfileCard({ metrics }) {
  return null // Deprecated, replaced by TrustProfileVisual
}

function BestEpochSuggestionCard({ suggestion, onJumpToEpoch, reportLang = 'vi' }) {
  if (!suggestion) return null

  return (
    <div className="rounded-2xl border border-sky-500/15 bg-sky-500/5 p-4 space-y-3">
      <div className="text-nano font-bold uppercase tracking-ultra text-sky-200">
        Best epoch suggestion
      </div>
      <p className="text-[11px] leading-relaxed text-slate-300 font-semibold">{suggestion.recommendation}</p>
      <p className="text-[11px] leading-relaxed text-slate-400">{suggestion.rationale}</p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <div className="rounded-xl border border-line-subtle bg-slate-950/25 p-3 flex flex-col justify-between">
          <div>
            <div className="text-[9px] uppercase tracking-ultra text-slate-500">Best Macro F1</div>
            <div className="mt-1 text-[12px] font-bold text-slate-100">
              Epoch {suggestion.bestMacro?.epoch ?? '—'}
            </div>
            <div className="text-[10px] text-slate-400">
              {(Number(suggestion.bestMacro?.macroF1 || 0) * 100).toFixed(1)}% Macro F1
            </div>
          </div>
          {Number.isInteger(suggestion.bestMacro?.epoch) && (
            <button
              type="button"
              onClick={() => onJumpToEpoch?.(suggestion.bestMacro.epoch)}
              className="mt-3 w-full rounded-xl border border-sky-400/25 bg-sky-500/12 py-1.5 text-[10px] font-semibold uppercase tracking-ultra text-sky-100 transition-colors hover:bg-sky-500/18"
            >
              Jump to epoch
            </button>
          )}
        </div>
        <div className="rounded-xl border border-line-subtle bg-slate-950/25 p-3 flex flex-col justify-between">
          <div>
            <div className="text-[9px] uppercase tracking-ultra text-slate-500">Best Balanced Acc</div>
            <div className="mt-1 text-[12px] font-bold text-slate-100">
              Epoch {suggestion.bestBalanced?.epoch ?? '—'}
            </div>
            <div className="text-[10px] text-slate-400">
              {(Number(suggestion.bestBalanced?.balancedAccuracy || 0) * 100).toFixed(1)}% Balanced Acc
            </div>
          </div>
          {Number.isInteger(suggestion.bestBalanced?.epoch) && (
            <button
              type="button"
              onClick={() => onJumpToEpoch?.(suggestion.bestBalanced.epoch)}
              className="mt-3 w-full rounded-xl border border-sky-400/25 bg-sky-500/12 py-1.5 text-[10px] font-semibold uppercase tracking-ultra text-sky-100 transition-colors hover:bg-sky-500/18"
            >
              Jump to epoch
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function FocusRoutingCard({ story, weakClass, onJumpToWeakClass, onJumpToStructure, reportLang = 'vi' }) {
  if (!story || !weakClass) return null

  const toneClass = story.status === 'danger'
    ? 'border-red-500/20 bg-red-500/7'
    : story.status === 'warn'
      ? 'border-amber-500/20 bg-amber-500/7'
      : 'border-emerald-500/20 bg-emerald-500/7'

  return (
    <div className={`rounded-2xl border p-4 ${toneClass} space-y-3`}>
      <div className="min-w-0">
        <div className="text-nano font-bold uppercase tracking-ultra text-slate-200">{story.title}</div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-300">{story.summary}</p>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{story.evidence}</p>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={onJumpToWeakClass}
          className="rounded-xl border border-amber-400/25 bg-amber-500/12 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-ultra text-amber-100 transition-colors hover:bg-amber-500/18"
        >
          Weak-class misses
        </button>
        <button
          type="button"
          onClick={onJumpToStructure}
          className="rounded-xl border border-cyan-400/25 bg-cyan-500/12 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-ultra text-cyan-100 transition-colors hover:bg-cyan-500/18"
        >
          Structure lens
        </button>
      </div>
    </div>
  )
}

function SignalCard({ signal, onAction, reportLang = 'vi' }) {
  const isVi = reportLang === 'vi'
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
      
  const label = signal.status === 'danger' 
    ? (isVi ? 'Rủi ro cao' : 'High risk') 
    : signal.status === 'warn' 
      ? (isVi ? 'Cần ngữ cảnh' : 'Needs context') 
      : (isVi ? 'Ổn định' : 'Stable')

  return (
    <div className={`flex flex-col justify-between rounded-xl border p-3.5 ${tone}`}>
      <div>
        <div className="flex items-center justify-between gap-2 border-b border-line-subtle/10 pb-2 mb-2">
          <div className="text-[11px] font-bold text-slate-100 uppercase tracking-wide">{signal.title}</div>
          <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${pill}`}>{label}</span>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-300 font-semibold">{signal.summary}</p>
        
        <div className="mt-3.5 space-y-2.5 text-[11px] leading-relaxed">
          <div>
            <div className="text-[9px] uppercase tracking-ultra text-slate-500">{isVi ? 'BẰNG CHỨNG' : 'Evidence'}</div>
            <p className="mt-0.5 text-slate-400 leading-normal">{signal.evidence}</p>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-ultra text-slate-500">{isVi ? 'KHUYẾN NGHỊ' : 'Recommended move'}</div>
            <p className="mt-0.5 text-slate-400 leading-normal">{signal.recommendation}</p>
          </div>
        </div>
      </div>
      
      <button
        type="button"
        onClick={() => onAction?.(signal.id)}
        className="mt-4 w-full rounded-xl border border-line-subtle bg-slate-950/40 py-1.5 text-nano font-bold uppercase tracking-ultra text-slate-300 transition-all hover:bg-slate-900/60 hover:text-slate-200"
      >
        Open lens
      </button>
    </div>
  )
}

function HeroNarrativeCard({ narrative, onNextLensAction, reportLang = 'vi' }) {
  if (!narrative) return null
  return (
    <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/5 p-4 space-y-3">
      <div className="text-nano font-bold uppercase tracking-ultra text-cyan-300">
        Research narrative
      </div>
      <div className="grid gap-2.5 sm:grid-cols-3">
        <NarrativeCell label="Main insight" value={narrative.mainInsight} />
        <NarrativeCell label="Main risk" value={narrative.mainRisk} />
        <NarrativeCell 
          label="Next lens" 
          value={narrative.recommendedNextLens} 
          actionLabel="Open lens" 
          onAction={onNextLensAction} 
        />
      </div>
    </div>
  )
}

function NarrativeCell({ label, value, actionLabel = null, onAction = null }) {
  return (
    <div className="rounded-xl border border-line-subtle bg-nebula p-3 flex flex-col justify-between">
      <div>
        <div className="text-[9px] uppercase tracking-ultra text-slate-500">{label}</div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-300">{value}</p>
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-3 w-full rounded-xl border border-cyan-400/25 bg-cyan-500/12 py-1.5 text-[10px] font-semibold uppercase tracking-ultra text-cyan-100 transition-colors hover:bg-cyan-500/18"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

function ReliabilityCard({ reliability }) {
  return null // Deprecated, replaced by ReliabilityAlertBanner
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
  reportMode = false,
  reportLimit = 56,
}) {
  const visibleGraphs = useMemo(
    () => (reportMode ? sortTask2Descriptors(graphs, 'priority').slice(0, reportLimit) : graphs),
    [graphs, reportLimit, reportMode],
  )
  const visibleSnap = useMemo(
    () => filterTask2Snapshot(snap, visibleGraphs.map((graph) => graph.originalGraphId), visibleGraphs),
    [snap, visibleGraphs],
  )
  const visibleGroundTruth = useMemo(
    () => visibleGraphs.map((descriptor) => descriptor.groundTruth),
    [visibleGraphs],
  )
  const visibleHardCases = useMemo(
    () => (reportMode ? visibleGraphs : hardCaseGraphs),
    [hardCaseGraphs, reportMode, visibleGraphs],
  )

  if (!graphs.length) {
    return <EmptyState title="No graphs in this slice" description="Pick another focus chip to inspect a broader portion of the collection." />
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-3 ${reportMode ? 'overflow-hidden' : 'overflow-auto'}`}>
      {selectedCell && (
        <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/6 px-3 py-2 text-[11px] text-cyan-100">
          Confusion cell slice active: predicted class {selectedCell.pred}, ground truth class {selectedCell.gt}. Hard cases below are scoped to this cell; counts describe this slice, not overall accuracy.
        </div>
      )}

      <div className="rounded-2xl border border-line-default bg-nebula p-3 task2-report-card">
        <div className="mb-2">
          <span className="block text-nano font-bold uppercase tracking-ultra text-slate-500">Batch heatmap</span>
          <p className="mt-1 text-[11px] text-slate-400">
            Each row is a graph, each column is an epoch checkpoint. {reportMode && graphs.length > visibleGraphs.length ? `Showing the top ${visibleGraphs.length} priority rows; full collection available in interactive view.` : 'Use it to spot stubborn failures and late recoveries.'}
          </p>
        </div>
        <BatchHeatmap
          snap={visibleSnap}
          snapshots={snapshots}
          epochInt={epochInt}
          graphs={visibleGraphs}
          selectedId={selectedId}
          onSelect={onSelect}
          reportMode={reportMode}
        />
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <div className="min-w-0 rounded-2xl border border-line-default bg-nebula p-3">
          {selectedCell && (
            <div className="mb-2 rounded-lg border border-cyan-500/15 bg-cyan-500/8 px-2 py-1 text-[10px] font-semibold uppercase tracking-ultra text-cyan-200">
              Confusion matrix slice counts
            </div>
          )}
          <Task2ConfusionMatrix
            predictions={visibleSnap?.graph_predictions}
            groundTruth={visibleGroundTruth}
            classNames={classNames}
            selectedCell={selectedCell}
            onSelectCell={onSelectCell}
            scopeLabel={selectedCell ? 'Cell slice' : 'Focus slice'}
          />
        </div>
        <div className="min-w-0 rounded-2xl border border-line-default bg-nebula p-3">
          <div className="mb-2">
            <span className="block text-nano font-bold uppercase tracking-ultra text-slate-500">Hardest cases</span>
            <p className="mt-1 text-[11px] text-slate-400">
              Misclassified graphs surface first, then the correct graphs with the thinnest margins.
            </p>
          </div>
          <Task2HardCases
            snap={snap}
            graphs={visibleHardCases}
            classNames={classNames}
            k={reportMode ? 8 : 10}
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
      <div className="rounded-2xl border border-line-default bg-nebula p-3">
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

      <div className="rounded-2xl border border-line-default bg-nebula p-3">
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
                    : 'border-line-subtle bg-nebula hover:border-line-default hover:bg-nebula'
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

function buildTask2ModelFailureReading(graph, signature, reportLang = 'en') {
  if (!graph || graph.correct === 1 || !signature) {
    return reportLang === 'vi'
      ? 'Graph này đang khớp nhãn hiện tại; hãy dùng readout để kiểm tra model bám vào tín hiệu nào.'
      : 'This graph currently matches the label; use readout to inspect which signal the model trusts.'
  }
  if (signature.id === 'GAT') {
    return reportLang === 'vi'
      ? 'Ca sai này nên được đọc như khả năng GAT đã khóa attention vào motif không đúng hoặc quá hẹp. So sánh top-k node với entropy trước khi tin giải thích.'
      : 'Read this miss as a possible wrong or too-narrow GAT attention lock. Compare top-k nodes with entropy before trusting the explanation.'
  }
  if (signature.id === 'SAGE') {
    return reportLang === 'vi'
      ? 'Ca sai này nên được đọc như neighborhood vote chưa ổn định. Nếu margin thấp hoặc graph nằm trong nhóm dao động, đừng xem đây là quyết định đã hội tụ.'
      : 'Read this miss as unstable neighborhood voting. If margin is low or the graph is unstable, do not treat the decision as converged.'
  }
  return reportLang === 'vi'
    ? 'Ca sai này nên được đọc như nguy cơ GCN quá mượt hoặc lan truyền tín hiệu sai qua vùng lân cận, làm motif quyết định bị loãng.'
    : 'Read this miss as possible GCN oversmoothing or wrong signal propagation through neighbors, diluting the decisive motif.'
}

function ReadoutTab({ graph, modelSignature = null, classNames, onSelect, reportLang = 'en' }) {
  if (!graph) {
    return <EmptyState title="No graph selected" description="Pick a graph from the topology or hard-case list to inspect graph-level readout." />
  }

  const gtLabel = formatTask2ClassLabel(classNames, graph.groundTruth, 'Unknown')
  const predLabel = formatTask2ClassLabel(classNames, graph.predicted, 'Pending')
  const topContributors = graph.topContributors || []
  const readoutPattern = graph.readoutPattern || describeTask2ReadoutPattern({
    entropyBucket: graph.entropyBucket,
    readoutBucket: graph.readoutBucket,
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div className="rounded-2xl border border-cyan-500/18 bg-cyan-500/8 p-3">
          <div className="text-nano font-bold uppercase tracking-ultra text-cyan-300">
            {reportLang === 'vi' ? 'Đọc theo model' : 'Model reading'}
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-100">{modelSignature?.primaryLabel || 'Graph readout'}</div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-300">
            {buildTask2ModelFailureReading(graph, modelSignature, reportLang)}
          </p>
        </div>

        <div className="rounded-2xl border border-line-default bg-nebula p-3">
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
        <div className="rounded-2xl border border-line-default bg-nebula p-3">
          <div className="text-nano font-bold uppercase tracking-ultra text-slate-500">Readout interpretation</div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-300">{buildReadoutNarrative(graph, reportLang)}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <TagChip label={formatFailureTag(graph.failureTag)} tone={graph.correct === 1 ? 'good' : 'bad'} />
            <TagChip label={graph.densityBucket} tone="info" />
            <TagChip label={graph.entropyBucket} tone="warn" />
            <TagChip label={readoutPattern} tone="good" />
          </div>
        </div>

        <div className="rounded-2xl border border-line-default bg-nebula p-3">
          <div className="text-nano font-bold uppercase tracking-ultra text-slate-500">Structural profile</div>
          <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <MiniMetric label="Density" value={graph.structural?.density} />
            <MiniMetric label="Cluster Coef" value={graph.structural?.avg_clustering} />
            <MiniMetric label="AvgDeg" value={graph.structural?.avg_degree} digits={1} />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
            Motif signature: <span className="font-semibold text-slate-200">{graph.motifSignature}</span>
          </p>
        </div>

        <div className="rounded-2xl border border-line-default bg-nebula p-3">
          <div className="text-nano font-bold uppercase tracking-ultra text-slate-500">Readout concentration</div>
          <div className="mt-2 text-lg font-semibold text-slate-100">{(graph.readoutConcentration * 100).toFixed(0)}%</div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            Top-k contribution is <span className="font-semibold text-slate-200">{graph.readoutBucket}</span>, while global entropy is <span className="font-semibold text-slate-200">{graph.entropyBucket}</span>. Pattern: <span className="font-semibold text-slate-200">{readoutPattern}</span>.
          </p>
          <div className="mt-3 space-y-2">
            {topContributors.length ? topContributors.map((item) => (
              <div key={item.nodeId} className="flex items-center gap-2">
                <div className="w-8 shrink-0 rounded-md border border-line-default bg-nebula px-2 py-1 text-center text-[11px] font-mono text-slate-200">
                  {item.nodeId}
                </div>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-nebula">
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

function BatchHeatmap({ snap, snapshots, epochInt, graphs, selectedId, onSelect, reportMode = false }) {
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
    <div className={`flex flex-col gap-2 ${reportMode ? 'task2-report-heatmap overflow-hidden' : ''}`}>
      <p className="text-nano text-slate-400 leading-relaxed">
        Each tile is one graph at one checkpoint. Green means correct, red means wrong.
      </p>
      <div className={`flex-1 min-h-0 ${reportMode ? 'overflow-hidden' : 'overflow-auto'}`}>
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
    info: 'border-line-default bg-nebula text-slate-200',
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
    info: 'border-line-default bg-nebula text-slate-200',
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
    <div className="rounded-xl border border-line-subtle bg-nebula p-2">
      <div className="text-[10px] uppercase tracking-ultra text-slate-500">{label}</div>
      <div className="mt-1 text-[12px] font-mono font-semibold text-slate-200 tabular-nums">
        {Number.isFinite(value) ? value.toFixed(digits) : '—'}
      </div>
    </div>
  )
}
