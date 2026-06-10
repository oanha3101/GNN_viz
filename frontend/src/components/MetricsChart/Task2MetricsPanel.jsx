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
  computeHeatmapRowStats,
  computeHeatmapSummary,
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
  translateTask2ReasonTag,
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
  { id: 'failures', label: 'Failures' },
  { id: 'structure', label: 'Structure' },
  { id: 'readout', label: 'Readout' },
]

const TASK2_TAB_LABELS = {
  vi: {
    overview: 'Tổng quan',
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
      className="border-line-default/50 bg-gradient-to-b from-deep/60 to-deep/30 shadow-[0_4px_24px_rgba(0,0,0,0.12)]"
      actions={(
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <div className="rounded-lg border border-cyan-500/25 bg-gradient-to-r from-cyan-500/12 to-cyan-500/6 px-2.5 py-1 text-[10px] font-bold tracking-wide text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.08)]">
            E{epochInt}
          </div>
          <div className="rounded-lg border border-line-default/60 bg-nebula/60 px-2.5 py-1 text-[10px] font-bold tracking-wide text-slate-300">
            {collectionSummary.totalGraphs} {isViReport ? 'đồ thị' : 'graphs'}
          </div>
          {currentAccuracy != null && (
            <div className="rounded-lg border border-emerald-500/25 bg-gradient-to-r from-emerald-500/12 to-emerald-500/6 px-2.5 py-1 text-[10px] font-bold tracking-wide text-emerald-300">
              {currentAccuracy.label} {currentAccuracy.value.toFixed(1)}%
              {currentAccuracy.secondary != null && (
                <span className="ml-1 text-emerald-200/50">All {currentAccuracy.secondary.toFixed(1)}%</span>
              )}
            </div>
          )}
        </div>
      )}
      footer={(
        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
          <span className="line-clamp-1 leading-relaxed">{translatedReliability?.readingGuide}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {resolvedSelectedCell && !forcedSelectedCell && (
              <button
                type="button"
                onClick={() => setSelectedCell(null)}
                className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1 font-bold tracking-wide text-cyan-200 transition-all hover:bg-cyan-500/16 hover:border-cyan-400/40"
              >
                {isViReport ? 'Ô' : 'Cell'} {resolvedSelectedCell.pred} {'→'} {resolvedSelectedCell.gt}
              </button>
            )}
            <span className="rounded-lg border border-line-default/60 bg-nebula/50 px-2.5 py-1 font-bold tracking-wide text-slate-300">
              {isViReport ? 'Lát cắt' : 'Focus'}: {translatedActiveFocus.label} ({focusedDescriptors.length})
            </span>
          </div>
        </div>
      )}
      >
        <div className="flex h-full flex-col gap-3 p-3">
        {!hideTabControls && (
          <div className="flex items-center rounded-xl bg-slate-950/30 border border-line-subtle/25 p-1 w-fit">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`relative rounded-lg px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] transition-all duration-200 ${
                  tab === item.id
                    ? 'bg-gradient-to-b from-cyan-500/20 to-cyan-500/10 text-cyan-300 shadow-[0_1px_6px_rgba(6,182,212,0.15),inset_0_1px_0_rgba(6,182,212,0.12)]'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'
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
            reportLang={reportLang}
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
              bestEpochSuggestion={epochSuggestion}
              reportMode={reportMode}
              reportLimit={reportLimit}
              reportLang={reportLang}
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

function FocusChipRow({ buckets, activeId, onChange, reportLang = 'vi' }) {
  if (!buckets?.length) return null
  const isVi = reportLang === 'vi'
  return (
    <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-slate-950/35 border border-line-subtle/20 w-fit max-w-full">
      {buckets.map((bucket) => {
        const active = bucket.id === activeId
        const count = bucket.graphIds?.length ?? 0
        return (
          <button
            key={bucket.id}
            type="button"
            onClick={() => onChange(bucket.id)}
            title={count === 0 ? (isVi ? 'Không có dữ liệu trong lát cắt này' : 'No data in this slice') : bucket.description}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 focus:outline-none ${
              active
                ? 'bg-gradient-to-b from-cyan-500/18 to-cyan-500/8 text-cyan-300 border border-cyan-500/20 shadow-[0_1px_4px_rgba(6,182,212,0.10)]'
                : count === 0
                  ? 'text-slate-600 border border-transparent opacity-50'
                  : 'text-slate-500 border border-transparent hover:text-slate-300 hover:bg-white/[0.04]'
            }`}
          >
            <span>{bucket.label}</span>
            <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold ${
              active ? 'bg-cyan-500/18 text-cyan-200' : count === 0 ? 'bg-slate-900/30 text-slate-700' : 'bg-slate-900/50 text-slate-500'
            }`}>
              {count}
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
        <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
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
        <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
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

function SectionHeader({ title, subtitle, reportLang = 'vi' }) {
  return (
    <div className="mb-2.5">
      <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-300">{title}</h3>
      {subtitle && <p className="mt-0.5 text-[10px] text-slate-500">{subtitle}</p>}
    </div>
  )
}

function CollapsibleSection({ title, children, defaultOpen = false, reportLang = 'vi' }) {
  const [open, setOpen] = useState(defaultOpen)
  const isVi = reportLang === 'vi'
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.015]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-white/[0.02]"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{title}</span>
        <span className="text-[10px] text-slate-600">{open ? '▲' : `▼ ${isVi ? 'Xem thêm' : 'Show more'}`}</span>
      </button>
      {open && <div className="border-t border-white/[0.04] px-4 py-3">{children}</div>}
    </div>
  )
}

function ExecutiveSummaryCard({ narrative, reliability, researchSignals, epochSuggestion, modelSignature, graphClassNames, reportLang = 'vi' }) {
  if (!narrative) return null
  const isVi = reportLang === 'vi'
  const metrics = reliability?.metrics || {}
  const weakClass = metrics.weakClass
  const weakLabel = weakClass ? (graphClassNames?.[weakClass.classId] || `Lớp ${weakClass.classId}`) : null
  const weakRecall = weakClass ? (weakClass.recall * 100).toFixed(0) : null

  const signals = [researchSignals?.collapse, researchSignals?.calibration, researchSignals?.shortcut].filter(Boolean)
  const riskSignals = signals.filter((s) => s.status === 'danger' || s.status === 'warn')
  const topRisk = riskSignals[0] || signals[0]

  const confReliable = (metrics.calibrationEce ?? 1) < 0.12 && (metrics.highConfWrongRate ?? 1) < 0.1
  const shortcutActive = Math.abs(metrics.densityBias ?? 0) > 0.32 || Math.abs(metrics.sizeBias ?? 0) > 0.32

  const status = reliability?.status === 'danger' ? 'bad' : reliability?.status === 'warn' ? 'warn' : 'good'
  const statusLabel = status === 'bad' ? (isVi ? 'Cần đọc cẩn thận' : 'Fragile') : status === 'warn' ? (isVi ? 'Cần ngữ cảnh' : 'Needs context') : (isVi ? 'Đáng tin' : 'Reliable')
  const statusClasses = status === 'bad' ? 'border-rose-500/25 bg-rose-500/8 text-rose-300' : status === 'warn' ? 'border-amber-500/25 bg-amber-500/8 text-amber-300' : 'border-emerald-500/25 bg-emerald-500/8 text-emerald-300'

  return (
    <div className={`rounded-2xl border p-4 ${statusClasses}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="text-sm">📋</div>
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-200">
            {isVi ? 'TÓM TẮT CHẨN ĐOÁN' : 'EXECUTIVE SUMMARY'}
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${statusClasses}`}>
          {statusLabel}
        </span>
      </div>

      {/* Main conclusion */}
      <p className="text-[12px] leading-relaxed text-white font-semibold mb-3">
        {narrative.mainInsight}
      </p>

      {/* Key findings grid */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {/* Weak class */}
        <div className="rounded-lg bg-black/20 px-3 py-2">
          <div className="text-[8px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-1">{isVi ? 'Lớp yếu nhất' : 'Weakest class'}</div>
          <div className="text-[11px] font-semibold text-white">{weakLabel || '—'}</div>
          {weakRecall && <div className="text-[10px] text-amber-300 font-mono">Recall {weakRecall}%</div>}
        </div>

        {/* Confidence reliability */}
        <div className="rounded-lg bg-black/20 px-3 py-2">
          <div className="text-[8px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-1">{isVi ? 'Hiệu chuẩn' : 'Calibration'}</div>
          <div className={`text-[11px] font-semibold ${confReliable ? 'text-emerald-300' : 'text-amber-300'}`}>
            {confReliable ? (isVi ? 'Đáng tin' : 'Reliable') : (isVi ? 'Cần kiểm tra' : 'Needs review')}
          </div>
          <div className="text-[10px] text-slate-400 font-mono">ECE {((metrics.calibrationEce ?? 0) * 100).toFixed(1)}%</div>
        </div>

        {/* Shortcut risk */}
        <div className="rounded-lg bg-black/20 px-3 py-2">
          <div className="text-[8px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-1">{isVi ? 'Thiên lệch shortcut' : 'Shortcut bias'}</div>
          <div className={`text-[11px] font-semibold ${shortcutActive ? 'text-rose-300' : 'text-emerald-300'}`}>
            {shortcutActive ? (isVi ? 'Có rủi ro' : 'At risk') : (isVi ? 'Không đáng kể' : 'Low')}
          </div>
        </div>

        {/* Top risk signal */}
        <div className="rounded-lg bg-black/20 px-3 py-2">
          <div className="text-[8px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-1">{isVi ? 'Rủi ro chính' : 'Main risk'}</div>
          <div className="text-[11px] font-semibold text-white break-words">{topRisk?.title || '—'}</div>
          {topRisk && <div className={`text-[9px] font-bold uppercase ${topRisk.status === 'danger' ? 'text-rose-300' : topRisk.status === 'warn' ? 'text-amber-300' : 'text-emerald-300'}`}>{topRisk.status === 'danger' ? (isVi ? 'Rủi ro cao' : 'High risk') : topRisk.status === 'warn' ? (isVi ? 'Cần ngữ cảnh' : 'Needs context') : (isVi ? 'Ổn định' : 'Stable')}</div>}
        </div>
      </div>

      {/* Main risk narrative */}
      {narrative.mainRisk && (
        <p className="mt-3 text-[11px] leading-relaxed text-white/70">
          {narrative.mainRisk}
        </p>
      )}

      {/* Best epoch hint */}
      {epochSuggestion?.recommendation && (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-white/60">
          <span>💡</span>
          <span>{epochSuggestion.recommendation}</span>
        </div>
      )}
    </div>
  )
}

function CompactRiskCard({ signal, onAction, reportLang = 'vi' }) {
  const isVi = reportLang === 'vi'
  const toneMap = {
    danger: { dot: 'bg-rose-400', badge: 'bg-rose-500/15 text-rose-200 border-rose-500/25', label: isVi ? 'Rủi ro cao' : 'High risk' },
    warn: { dot: 'bg-amber-400', badge: 'bg-amber-500/15 text-amber-200 border-amber-500/25', label: isVi ? 'Cần ngữ cảnh' : 'Needs context' },
    ok: { dot: 'bg-emerald-400', badge: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/25', label: isVi ? 'Ổn định' : 'Stable' },
  }
  const t = toneMap[signal.status] || toneMap.ok
  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
      <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${t.dot}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] font-bold text-slate-100">{signal.title}</span>
          <span className={`rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase ${t.badge}`}>{t.label}</span>
        </div>
        <p className="text-[10px] leading-relaxed text-slate-400 mb-1.5">{signal.evidence}</p>
        <p className="text-[10px] leading-relaxed text-cyan-300/80">→ {signal.recommendation}</p>
      </div>
      <button
        type="button"
        onClick={() => onAction?.(signal.id)}
        className="shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] font-bold uppercase text-slate-300 transition-colors hover:bg-white/[0.08]"
      >
        {isVi ? 'Mở' : 'Open'}
      </button>
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
  const isVi = reportLang === 'vi'

  const signals = [researchSignals?.collapse, researchSignals?.calibration, researchSignals?.shortcut].filter(Boolean)
  const collectionStats = collectionSummary.totalGraphs > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-1 py-1">

      {/* ─── Section 1: Executive Summary ─── */}
      <ExecutiveSummaryCard
        narrative={narrative}
        reliability={reliability}
        researchSignals={researchSignals}
        epochSuggestion={epochSuggestion}
        modelSignature={modelSignature}
        graphClassNames={graphClassNames}
        reportLang={reportLang}
      />

      {/* ─── Section 2: Main Risks (compact signal cards) ─── */}
      {signals.length > 0 && (
        <section>
          <SectionHeader title={isVi ? 'Rủi ro chính' : 'Main Risks'} reportLang={reportLang} />
          <div className="grid gap-2 md:grid-cols-3">
            {signals.map((item) => (
              <CompactRiskCard key={item.id} signal={item} onAction={onSignalAction} reportLang={reportLang} />
            ))}
          </div>
        </section>
      )}

      {/* ─── Section 3: Class-wise Performance ─── */}
      {perClass.length > 0 && (
        <section>
          <SectionHeader title={isVi ? 'Hiệu năng theo lớp' : 'Class-wise Performance'} reportLang={reportLang} />
          <PerClassMetricsVisual perClass={perClass} classNames={graphClassNames} reportLang={reportLang} />
          <div className="mt-3">
            <CollectionBalanceVisual classCounts={classCounts} reportLang={reportLang} />
          </div>
        </section>
      )}

      {/* ─── Section 4: Confidence Calibration ─── */}
      <section>
        <SectionHeader title={isVi ? 'Hiệu chuẩn xác suất' : 'Confidence Calibration'} reportLang={reportLang} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TrustProfileVisual metrics={metrics} reportLang={reportLang} />
          <div className="flex flex-col gap-3">
            {/* Collection stats — only show if data exists */}
            {collectionStats && (
              <div className="grid gap-2 grid-cols-3">
                <StatCell label={isVi ? 'Đồ thị' : 'Graphs'} value={collectionSummary.totalGraphs} digits={0} tone="info" />
                <StatCell label={isVi ? 'Số nút TB' : 'Avg Nodes'} value={collectionSummary.avgNodes} digits={1} tone="info" />
                <StatCell label={isVi ? 'Số cạnh TB' : 'Avg Edges'} value={collectionSummary.avgEdges} digits={1} tone="info" />
              </div>
            )}
            <div className="grid gap-2 grid-cols-2">
              <StatCell label="ECE" value={(calibrationEce || 0) * 100} digits={1} suffix="%" tone={Number.isFinite(calibrationEce) && calibrationEce < 0.1 ? 'good' : 'warn'} />
              <StatCell label={isVi ? 'Lớp' : 'Classes'} value={graphClassNames.length || 1} digits={0} tone="info" />
            </div>
          </div>
        </div>
      </section>

      {/* ─── Section 5: Structural Shortcut ─── */}
      <section>
        <SectionHeader title={isVi ? 'Thiên lệch cấu trúc' : 'Structural Shortcut'} reportLang={reportLang} />
        <div className="grid gap-3 sm:grid-cols-3">
          <ShortcutBiasMeter label={isVi ? 'Tự tin vs Mật độ' : 'Conf vs Density'} value={densityBias} />
          <ShortcutBiasMeter label={isVi ? 'Tự tin vs Kích thước' : 'Conf vs Size'} value={sizeBias} />
          <ShortcutBiasMeter label={isVi ? 'Tự tin vs Số cạnh' : 'Conf vs Edges'} value={metrics.edgeBias || 0} />
        </div>
      </section>

      {/* ─── Section 6: Training Trend ─── */}
      <section>
        <SectionHeader title={isVi ? 'Xu hướng huấn luyện' : 'Training Trend'} reportLang={reportLang} />
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-4">
          <div className="mb-2 flex flex-wrap items-center gap-3 text-[9px] font-bold uppercase tracking-[0.12em]">
            <span className="flex items-center gap-1.5"><span className="inline-block h-1.5 w-4 rounded-full bg-cyan-400" /><span className="text-cyan-300">{isVi ? 'Độ chính xác' : 'Accuracy'}</span></span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-1.5 w-4 rounded-full bg-emerald-400" /><span className="text-emerald-300">Macro F1</span></span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-1.5 w-4 rounded-full bg-violet-400" /><span className="text-violet-300">{isVi ? 'Độ chính xác cân bằng' : 'Balanced Acc'}</span></span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-1.5 w-4 rounded-full bg-rose-400" /><span className="text-rose-300">Loss</span></span>
          </div>
          <div className="h-[200px]">
            <MetricsChart />
          </div>
        </div>
      </section>

      {/* ─── Section 7: Recommended Next Actions ─── */}
      <section>
        <SectionHeader title={isVi ? 'Hành động tiếp theo' : 'Recommended Next Actions'} reportLang={reportLang} />
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Best epoch */}
          <BestEpochSuggestionCard suggestion={epochSuggestion} onJumpToEpoch={onJumpToEpoch} reportLang={reportLang} />
          {/* Next lens + model signature */}
          <div className="flex flex-col gap-3">
            <HeroNarrativeCard narrative={narrative} onNextLensAction={onNextLensAction} reportLang={reportLang} />
            <Task2ModelSignatureCard signature={modelSignature} reportLang={reportLang} />
          </div>
        </div>
      </section>

      {/* ─── Collapsible secondary diagnostics ─── */}
      <CollapsibleSection title={isVi ? 'Chi tiết lát cắt & Focus' : 'Slice & Focus Details'} reportLang={reportLang}>
        {metrics.weakClass && (
          <div className="mb-3 rounded-xl border border-amber-500/18 bg-amber-500/5 p-3 flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-300">
              <span className="font-semibold text-amber-200">{metrics.weakClass.label}</span> {isVi ? 'là lớp yếu nhất' : 'is the weakest class'} — Recall {(metrics.weakClass.recall * 100).toFixed(1)}%, F1 {(metrics.weakClass.f1 * 100).toFixed(1)}%
            </p>
            <button
              type="button"
              onClick={onJumpToWeakClass}
              className="shrink-0 rounded-lg border border-amber-400/25 bg-amber-500/12 px-2.5 py-1 text-[10px] font-semibold text-amber-100 hover:bg-amber-500/18"
            >
              {isVi ? 'Mở lát cắt' : 'Open slice'}
            </button>
          </div>
        )}
        <FocusRoutingCard story={focusStory} weakClass={metrics.weakClass} onJumpToWeakClass={onJumpToWeakClass} onJumpToStructure={onJumpToStructure} reportLang={reportLang} />
      </CollapsibleSection>

      <CollapsibleSection title={isVi ? 'Cảnh báo độ tin cậy' : 'Reliability Warnings'} reportLang={reportLang}>
        <ReliabilityAlertBanner reliability={reliability} reportLang={reportLang} />
      </CollapsibleSection>

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
  const toneMap = {
    danger: {
      card: 'border-red-500/25 bg-gradient-to-br from-red-500/8 to-red-500/3',
      pill: 'border-red-400/30 bg-red-500/16 text-red-200',
      dot: 'bg-red-400',
    },
    warn: {
      card: 'border-amber-500/25 bg-gradient-to-br from-amber-500/8 to-amber-500/3',
      pill: 'border-amber-400/30 bg-amber-500/16 text-amber-200',
      dot: 'bg-amber-400',
    },
    ok: {
      card: 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/8 to-emerald-500/3',
      pill: 'border-emerald-400/25 bg-emerald-500/14 text-emerald-200',
      dot: 'bg-emerald-400',
    },
  }
  const t = toneMap[signal.status] || toneMap.ok
  const label = signal.status === 'danger'
    ? (isVi ? 'Rủi ro cao' : 'High risk')
    : signal.status === 'warn'
      ? (isVi ? 'Cần ngữ cảnh' : 'Needs context')
      : (isVi ? 'Ổn định' : 'Stable')

  return (
    <div className={`flex flex-col justify-between rounded-2xl border p-4 ${t.card}`}>
      <div>
        <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-white/[0.04]">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${t.dot} shadow-[0_0_6px_currentColor]`} />
            <div className="text-[11px] font-bold text-slate-100 uppercase tracking-wide">{signal.title}</div>
          </div>
          <span className={`rounded-lg border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${t.pill}`}>{label}</span>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-300 font-medium">{signal.summary}</p>

        <div className="mt-3.5 space-y-3 text-[11px] leading-relaxed">
          <div className="rounded-lg bg-black/15 px-3 py-2">
            <div className="text-[9px] uppercase tracking-ultra text-slate-500 mb-1">{isVi ? 'BẰNG CHỨNG' : 'Evidence'}</div>
            <p className="text-slate-400 leading-normal">{signal.evidence}</p>
          </div>
          <div className="rounded-lg bg-black/15 px-3 py-2">
            <div className="text-[9px] uppercase tracking-ultra text-slate-500 mb-1">{isVi ? 'KHUYẾN NGHỊ' : 'Recommended move'}</div>
            <p className="text-slate-400 leading-normal">{signal.recommendation}</p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onAction?.(signal.id)}
        className="mt-4 w-full rounded-xl border border-white/10 bg-white/[0.04] py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-300 transition-all hover:bg-white/[0.08] hover:text-slate-100 hover:border-white/15"
      >
        Open lens
      </button>
    </div>
  )
}

function HeroNarrativeCard({ narrative, onNextLensAction, reportLang = 'vi' }) {
  if (!narrative) return null
  return (
    <div className="rounded-2xl border border-cyan-500/15 bg-gradient-to-br from-cyan-500/[0.06] to-transparent p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.6)]" />
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">
          Research narrative
        </div>
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
    <div className="rounded-xl border border-line-subtle/50 bg-gradient-to-b from-nebula/60 to-nebula/30 p-3.5 flex flex-col justify-between backdrop-blur-sm">
      <div>
        <div className="text-[9px] uppercase tracking-[0.14em] text-slate-500 font-bold">{label}</div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-300">{value}</p>
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-3 w-full rounded-lg border border-cyan-400/20 bg-gradient-to-r from-cyan-500/14 to-cyan-500/8 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-cyan-200 transition-all hover:from-cyan-500/20 hover:to-cyan-500/12 hover:border-cyan-400/35"
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
  bestEpochSuggestion = null,
  reportMode = false,
  reportLimit = 56,
  reportLang = 'vi',
}) {
  const isVi = reportLang === 'vi'
  const [heatmapFilter, setHeatmapFilter] = useState('all')
  const [heatmapSort, setHeatmapSort] = useState('id')
  const [showInfoCard, setShowInfoCard] = useState(false)

  const visibleGraphs = useMemo(
    () => (reportMode ? sortTask2Descriptors(graphs, 'priority').slice(0, reportLimit) : graphs),
    [graphs, reportLimit, reportMode],
  )

  // Compute per-graph epoch stats for filtering/sorting
  const rowStats = useMemo(
    () => computeHeatmapRowStats(snapshots, visibleGraphs),
    [snapshots, visibleGraphs],
  )
  const summary = useMemo(
    () => computeHeatmapSummary(rowStats),
    [rowStats],
  )

  // Apply filter
  const filteredGraphs = useMemo(() => {
    if (heatmapFilter === 'all') return visibleGraphs
    return visibleGraphs.filter((g) => {
      const stats = rowStats.get(g.originalGraphId)
      if (!stats) return false
      if (heatmapFilter === 'persistent') return stats.persistentError
      if (heatmapFilter === 'flip') return stats.flipHeavy
      if (heatmapFilter === 'late') return stats.lateRecovery
      return true
    })
  }, [visibleGraphs, heatmapFilter, rowStats])

  // Apply sort
  const sortedGraphs = useMemo(() => {
    const items = [...filteredGraphs]
    if (heatmapSort === 'id') {
      items.sort((a, b) => a.originalGraphId - b.originalGraphId)
    } else if (heatmapSort === 'errors') {
      items.sort((a, b) => {
        const sa = rowStats.get(a.originalGraphId)
        const sb = rowStats.get(b.originalGraphId)
        return (sb?.errorCount ?? 0) - (sa?.errorCount ?? 0)
      })
    } else if (heatmapSort === 'recovery') {
      items.sort((a, b) => {
        const sa = rowStats.get(a.originalGraphId)
        const sb = rowStats.get(b.originalGraphId)
        const ra = sa?.recoveryEpoch ?? Infinity
        const rb = sb?.recoveryEpoch ?? Infinity
        return ra - rb
      })
    }
    return items
  }, [filteredGraphs, heatmapSort, rowStats])

  const visibleSnap = useMemo(
    () => filterTask2Snapshot(snap, sortedGraphs.map((graph) => graph.originalGraphId), sortedGraphs),
    [snap, sortedGraphs],
  )
  const visibleGroundTruth = useMemo(
    () => sortedGraphs.map((descriptor) => descriptor.groundTruth),
    [sortedGraphs],
  )
  const visibleHardCases = useMemo(
    () => (reportMode ? sortedGraphs : hardCaseGraphs),
    [hardCaseGraphs, reportMode, sortedGraphs],
  )

  const bestEpoch = bestEpochSuggestion?.epoch ?? '—'

  // Filter chip definitions
  const filterChips = [
    { id: 'all', label: isVi ? 'Tất cả' : 'All', count: visibleGraphs.length },
    { id: 'persistent', label: isVi ? 'Dai dẳng' : 'Persistent', count: summary.persistentCount },
    { id: 'flip', label: isVi ? 'Flip nhiều' : 'Flip-heavy', count: summary.flipHeavyCount },
    { id: 'late', label: isVi ? 'Phục hồi muộn' : 'Late recovery', count: summary.lateRecoveryCount },
  ]

  const sortOptions = [
    { id: 'id', label: isVi ? 'Mã đồ thị' : 'Graph ID' },
    { id: 'errors', label: isVi ? 'Số lỗi' : 'Error count' },
    { id: 'recovery', label: isVi ? 'Epoch phục hồi' : 'Recovery epoch' },
  ]

  if (!graphs.length) {
    return <EmptyState title={isVi ? 'Không có đồ thị trong lát cắt này' : 'No graphs in this slice'} description={isVi ? 'Hãy chọn focus chip khác để kiểm tra phần rộng hơn của collection.' : 'Pick another focus chip to inspect a broader portion of the collection.'} />
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-3 ${reportMode ? 'overflow-hidden' : 'overflow-auto'}`}>
      {/* Context banner for confusion cell */}
      {selectedCell && (
        <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/8 to-cyan-500/4 px-4 py-2.5 text-[11px] text-cyan-100 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0 shadow-[0_0_6px_rgba(34,211,238,0.5)]" />
          {isVi
            ? <>Ô confusion đang hoạt động: lớp dự đoán {selectedCell.pred}, lớp thật {selectedCell.gt}. Các ca khó bên dưới đang được lọc theo ô này.</>
            : <>Confusion cell slice active: predicted class {selectedCell.pred}, ground truth class {selectedCell.gt}. Hard cases below are scoped to this cell.</>}
        </div>
      )}

      {/* Summary bar */}
      <div className="grid grid-cols-5 gap-2">
        <SummaryBadge
          label={isVi ? 'Ca khó' : 'Hard cases'}
          value={summary.totalHard}
          icon="🔥"
          tone="bad"
        />
        <SummaryBadge
          label={isVi ? 'Lỗi dai dẳng' : 'Persistent errors'}
          value={summary.persistentCount}
          icon="📌"
          tone="bad"
        />
        <SummaryBadge
          label={isVi ? 'Phục hồi muộn' : 'Late recovery'}
          value={summary.lateRecoveryCount}
          icon="🕐"
          tone="warn"
        />
        <SummaryBadge
          label={isVi ? 'Flip nhiều' : 'Flip-heavy'}
          value={summary.flipHeavyCount}
          icon="🔄"
          tone="warn"
        />
        <SummaryBadge
          label={isVi ? 'Mốc tốt nhất' : 'Best checkpoint'}
          value={`E${bestEpoch}`}
          icon="✓"
          tone="good"
        />
      </div>

      {/* How to read info card */}
      <div className="rounded-xl border border-line-default/40 bg-gradient-to-r from-nebula/40 to-nebula/20">
        <button
          type="button"
          onClick={() => setShowInfoCard(!showInfoCard)}
          className="w-full flex items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-white/[0.02]"
        >
          <span className="w-5 h-5 rounded-full border border-slate-500/40 flex items-center justify-center text-[10px] text-slate-400 font-bold">?</span>
          <span className="text-[11px] text-slate-400 font-semibold">{isVi ? 'Cách đọc phần này' : 'How to read this section'}</span>
          <span className={`ml-auto text-[10px] text-slate-500 transition-transform ${showInfoCard ? 'rotate-180' : ''}`}>▼</span>
        </button>
        {showInfoCard && (
          <div className="px-4 pb-3 pt-1 text-[11px] text-slate-400 leading-relaxed space-y-1.5 border-t border-line-subtle/30">
            <p>• <span className="text-slate-300 font-semibold">{isVi ? 'Heatmap:' : 'Heatmap:'}</span> {isVi ? 'Mỗi hàng là một đồ thị, mỗi cột là một mốc epoch. Xanh = đúng, đỏ = sai.' : 'Each row is a graph, each column is an epoch. Green = correct, red = wrong.'}</p>
            <p>• <span className="text-slate-300 font-semibold">{isVi ? 'Lỗi dai dẳng:' : 'Persistent:'}</span> {isVi ? 'Đồ thị sai ở >70% epoch — mô hình chưa học được motif này.' : 'Graphs wrong at >70% of epochs — the model never learned this motif.'}</p>
            <p>• <span className="text-slate-300 font-semibold">{isVi ? 'Flip nhiều:' : 'Flip-heavy:'}</span> {isVi ? 'Đồ thị đổi nhãn đúng/sai ≥4 lần — quyết định không ổn định.' : 'Graphs that flipped correct/incorrect ≥4 times — unstable decision.'}</p>
            <p>• <span className="text-slate-300 font-semibold">{isVi ? 'Phục hồi muộn:' : 'Late recovery:'}</span> {isVi ? 'Đồ thị chỉ trở thành đúng sau 70% quá trình huấn luyện.' : 'Graphs that only became correct after 70% of training.'}</p>
            <p>• {isVi ? 'Nhấp vào ô confusion để lọc hard cases theo cặp lớp sai.' : 'Click a confusion cell to filter hard cases by that misclassification pair.'}</p>
          </div>
        )}
      </div>

      {/* Heatmap card */}
      <div className="rounded-2xl border border-line-default/60 bg-gradient-to-b from-nebula/60 to-nebula/30 p-4 task2-report-card">
        <div className="mb-3 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{isVi ? 'Heatmap theo lô' : 'Batch heatmap'}</span>
            <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
              {isVi
                ? 'Dùng để phát hiện các lỗi dai dẳng và phục hồi muộn. Di chuột vào hàng để xem chi tiết.'
                : 'Use it to spot stubborn failures and late recoveries. Hover a row for details.'}
            </p>
          </div>
          {/* Sort control */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[9px] text-slate-500 uppercase tracking-wide">{isVi ? 'Sắp xếp:' : 'Sort:'}</span>
            {sortOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setHeatmapSort(opt.id)}
                className={`rounded-md px-2 py-0.5 text-[9px] font-bold transition-all ${
                  heatmapSort === opt.id
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/30'
                    : 'text-slate-500 border border-transparent hover:text-slate-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          {filterChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setHeatmapFilter(chip.id)}
              className={`rounded-lg px-2.5 py-1 text-[10px] font-bold transition-all flex items-center gap-1.5 ${
                heatmapFilter === chip.id
                  ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/30 shadow-[0_0_8px_rgba(34,211,238,0.08)]'
                  : 'text-slate-400 border border-line-subtle/40 hover:border-line-default/60 hover:text-slate-200'
              }`}
            >
              {chip.label}
              <span className={`rounded-full px-1.5 py-0 text-[9px] tabular-nums ${
                heatmapFilter === chip.id ? 'bg-cyan-500/20 text-cyan-300' : 'bg-white/[0.04] text-slate-500'
              }`}>
                {chip.count}
              </span>
            </button>
          ))}
        </div>

        <BatchHeatmap
          snap={visibleSnap}
          snapshots={snapshots}
          epochInt={epochInt}
          graphs={sortedGraphs}
          selectedId={selectedId}
          onSelect={onSelect}
          rowStats={rowStats}
          reportMode={reportMode}
          reportLang={reportLang}
        />
      </div>

      {/* Lower section: confusion + hard cases */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        {/* Left: Confusion matrix */}
        <div className="min-w-0 rounded-2xl border border-line-default/60 bg-gradient-to-b from-nebula/60 to-nebula/30 p-4">
          {selectedCell && (
            <div className="mb-2.5 rounded-lg border border-cyan-500/20 bg-cyan-500/8 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-cyan-200">
              {isVi ? 'Số liệu theo ô confusion' : 'Confusion matrix slice counts'}
            </div>
          )}
          <Task2ConfusionMatrix
            predictions={visibleSnap?.graph_predictions}
            groundTruth={visibleGroundTruth}
            classNames={classNames}
            selectedCell={selectedCell}
            onSelectCell={onSelectCell}
            scopeLabel={selectedCell ? (isVi ? 'Ô đang chọn' : 'Cell slice') : (isVi ? 'Lát cắt' : 'Focus slice')}
            lang={reportLang}
          />
        </div>

        {/* Right: Hard cases */}
        <div className="min-w-0 rounded-2xl border border-line-default/60 bg-gradient-to-b from-nebula/60 to-nebula/30 p-4">
          <Task2HardCases
            snap={snap}
            graphs={visibleHardCases}
            classNames={classNames}
            k={reportMode ? 8 : 10}
            selectedId={selectedId}
            onSelect={onSelect}
            lang={reportLang}
          />
        </div>
      </div>
    </div>
  )
}

function SummaryBadge({ label, value, icon, tone = 'info' }) {
  const palette = {
    good: 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-500/4',
    warn: 'border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-amber-500/4',
    bad: 'border-red-500/20 bg-gradient-to-br from-red-500/10 to-red-500/4',
    info: 'border-line-default/60 bg-gradient-to-b from-nebula/60 to-nebula/30',
  }
  const textPalette = {
    good: 'text-emerald-200',
    warn: 'text-amber-200',
    bad: 'text-red-200',
    info: 'text-slate-200',
  }
  return (
    <div className={`rounded-xl border px-3 py-2 ${palette[tone] || palette.info}`}>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px]">{icon}</span>
        <span className={`text-sm font-bold tabular-nums ${textPalette[tone] || textPalette.info}`}>{value}</span>
      </div>
      <div className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-slate-500 font-bold truncate">{label}</div>
    </div>
  )
}

function StructureTab({ snap, graphs, selectedId, onSelect, focus, selectedCell, reportLang = 'vi' }) {
  const isVi = reportLang === 'vi'
  const [showInfoCard, setShowInfoCard] = useState(false)

  const outliers = useMemo(
    () => [...graphs]
      .filter((descriptor) => descriptor.structuralOutlier)
      .sort((a, b) => (b.structuralOutlierScore || 0) - (a.structuralOutlierScore || 0))
      .slice(0, 8),
    [graphs]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
      {/* Diagnostics card */}
      <div className="rounded-2xl border border-line-default/60 bg-gradient-to-b from-nebula/60 to-nebula/30 p-4">
        <div className="mb-3">
          <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
            {isVi ? 'Giải thích cấu trúc' : 'Structure explanation'}
          </span>
          <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed">
            {isVi ? (
              <>Lát cắt hiện tại là <span className="text-slate-200 font-semibold">{focus.label}</span>. Đọc entropy, mật độ và độ đúng cùng nhau trước khi kết luận mô hình hiểu motif.</>
            ) : (
              <>The current slice is <span className="text-slate-200 font-semibold">{focus.label}</span>. Read entropy, density, and correctness together before concluding the model understands a motif.</>
            )}
          </p>
        </div>
        <Task2Diagnostics
          snap={snap}
          graphs={graphs}
          selectedId={selectedId}
          selectedCell={selectedCell}
          onSelect={onSelect}
          lang={reportLang}
        />
      </div>

      {/* Info card */}
      <div className="rounded-xl border border-line-default/40 bg-gradient-to-r from-nebula/40 to-nebula/20">
        <button
          type="button"
          onClick={() => setShowInfoCard(!showInfoCard)}
          className="w-full flex items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-white/[0.02]"
        >
          <span className="w-5 h-5 rounded-full border border-slate-500/40 flex items-center justify-center text-[10px] text-slate-400 font-bold">?</span>
          <span className="text-[11px] text-slate-400 font-semibold">{isVi ? 'Cách đọc phần này' : 'How to read this section'}</span>
          <span className={`ml-auto text-[10px] text-slate-500 transition-transform ${showInfoCard ? 'rotate-180' : ''}`}>▼</span>
        </button>
        {showInfoCard && (
          <div className="px-4 pb-3 pt-1 text-[11px] text-slate-400 leading-relaxed space-y-1.5 border-t border-line-subtle/30">
            <p>• {isVi ? 'Accuracy chỉ cho biết xu hướng tổng quát. Cần đọc thêm Macro F1, hard cases và mức tập trung readout trước khi kết luận mô hình robust.' : 'Accuracy only shows the general trend. Read Macro F1, hard cases, and readout concentration before concluding the model is robust.'}</p>
            <p>• {isVi ? 'Các đồ thị ở góc trên bên trái scatter (entropy cao, mật độ thấp) là nơi mô hình có thể chưa tìm được motif cục bộ.' : 'Graphs in the upper-left corner of the scatter (high entropy, low density) are where the model may be missing a local motif.'}</p>
            <p>• {isVi ? 'Ngoại lệ cấu trúc là đồ thị lệch chuẩn về mật độ hoặc phân cụm — nơi tốt nhất để kiểm tra mô hình có đang bám tín hiệu hình dạng motif hay chỉ kích thước.' : 'Structural outliers depart from the norm on density or clustering — the best place to test whether the model reads motif shape or just graph size.'}</p>
          </div>
        )}
      </div>

      {/* Structural outliers */}
      <div className="rounded-2xl border border-line-default/60 bg-gradient-to-b from-nebula/60 to-nebula/30 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              {isVi ? 'Ngoại lệ cấu trúc' : 'Structural outliers'}
            </span>
            <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed">
              {isVi
                ? 'Các đồ thị này lệch chuẩn về mật độ hoặc phân cụm. Đây là nơi tốt nhất để kiểm tra mô hình có đang phản ứng với hình dạng motif hay chỉ kích thước đồ thị.'
                : 'These graphs depart from the collection norm on density or clustering. They are the best place to test whether the model is reacting to motif shape or just graph size.'}
            </p>
          </div>
          {selectedCell && (
            <span className="rounded-full border border-cyan-500/20 bg-cyan-500/8 px-2.5 py-1 text-[10px] font-semibold text-cyan-200 shrink-0">
              {isVi ? 'Đang lọc theo ô' : 'Cell lens active'}
            </span>
          )}
        </div>
        {outliers.length ? (
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {outliers.map((descriptor) => (
              <button
                key={descriptor.originalGraphId}
                type="button"
                onClick={() => onSelect?.(descriptor.originalGraphId)}
                className={`rounded-xl border px-3.5 py-2.5 text-left transition-all duration-200 ${
                  selectedId === descriptor.originalGraphId
                    ? 'border-cyan-500/40 bg-gradient-to-r from-cyan-500/10 to-cyan-500/5 shadow-[0_0_12px_rgba(6,182,212,0.08)]'
                    : 'border-line-subtle/50 bg-nebula/40 hover:border-line-default/60 hover:bg-nebula/60'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="text-[11px] font-semibold text-slate-100">G#{descriptor.originalGraphId}</div>
                  <div className="text-[10px] text-slate-500 font-mono tabular-nums">
                    {((descriptor.structuralOutlierScore || 0) * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="text-[11px] text-slate-400 mb-2">{descriptor.motifSignature}</div>
                <div className="flex flex-wrap gap-1.5">
                  <TagChip label={`${isVi ? 'Mật độ' : 'Density'}: ${descriptor.densityBucket}`} tone="info" />
                  <TagChip label={`${isVi ? 'Cụm' : 'Cluster'}: ${descriptor.clusteringBucket}`} tone="warn" />
                  <TagChip label={`${isVi ? 'Readout' : 'Readout'}: ${descriptor.readoutBucket}`} tone="good" />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title={isVi ? 'Không có ngoại lệ mạnh' : 'No strong outliers here'}
            description={isVi
              ? 'Lát cắt này gần chuẩn chung của collection, hãy dùng tab Lỗi hoặc Readout để giải thích các lỗi còn lại.'
              : 'This slice stays close to the collection norm, so use Failures or Readout to explain the remaining mistakes.'}
          />
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
    return <EmptyState title={reportLang === 'vi' ? 'Chưa chọn đồ thị' : 'No graph selected'} description={reportLang === 'vi' ? 'Chọn một đồ thị từ topology hoặc danh sách hard-case để kiểm tra readout.' : 'Pick a graph from the topology or hard-case list to inspect graph-level readout.'} />
  }

  const isVi = reportLang === 'vi'
  const gtLabel = formatTask2ClassLabel(classNames, graph.groundTruth, 'Unknown')
  const predLabel = formatTask2ClassLabel(classNames, graph.predicted, 'Pending')
  const topContributors = graph.topContributors || []
  const readoutPattern = graph.readoutPattern || describeTask2ReadoutPattern({
    entropyBucket: graph.entropyBucket,
    readoutBucket: graph.readoutBucket,
  })
  const nodeCount = graph.nodes?.length ?? graph.numNodes ?? 0
  const edgeCount = graph.links?.length ?? graph.numEdges ?? 0
  const conf = graph.confidence ?? 0
  const margin = graph.margin ?? 0
  const entropy = graph.entropy ?? 0
  const readoutConcentration = graph.readoutConcentration ?? 0
  const failureLabel = translateTask2FailureTagLabel(graph.failureTag, reportLang)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
      {/* Top row: model reading + featured graph + metric gauges */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {/* Model reading card */}
        <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-cyan-500/4 p-4">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.5)]" />
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">
              {isVi ? 'Đọc theo model' : 'Model reading'}
            </div>
          </div>
          <div className="mt-2 text-sm font-semibold text-slate-100">{modelSignature?.primaryLabel || (isVi ? 'Readout đồ thi' : 'Graph readout')}</div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-300">
            {buildTask2ModelFailureReading(graph, modelSignature, reportLang)}
          </p>
        </div>

        {/* Featured graph card */}
        <div className="rounded-2xl border border-line-default/60 bg-gradient-to-b from-nebula/60 to-nebula/30 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{isVi ? 'Đồ thị nổi bật' : 'Featured graph'}</div>
              <div className="mt-1.5 text-sm font-bold text-slate-100">G#{graph.originalGraphId}</div>
            </div>
            <button
              type="button"
              onClick={() => onSelect?.(graph.originalGraphId)}
              className="rounded-lg border border-cyan-500/20 bg-gradient-to-r from-cyan-500/12 to-cyan-500/6 px-3 py-1.5 text-[10px] font-bold text-cyan-300 transition-all hover:from-cyan-500/18 hover:to-cyan-500/10 hover:border-cyan-400/35"
            >
              {isVi ? 'Tập trung' : 'Focus'}
            </button>
          </div>
          <div className="mt-3 space-y-2 text-[11px] text-slate-300">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">{isVi ? 'Nhãn thật' : 'Ground truth'}</span>
              <span className="font-semibold text-slate-100">{gtLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">{isVi ? 'Dự đoán' : 'Prediction'}</span>
              <span className={`font-semibold ${graph.correct === 1 ? 'text-emerald-300' : 'text-red-300'}`}>{predLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">{isVi ? 'Nút / cạnh' : 'Nodes / edges'}</span>
              <span className="font-mono text-slate-200">{nodeCount}n / {edgeCount}e</span>
            </div>
          </div>
        </div>

        {/* Metric gauges */}
        <StatCell label="Confidence" value={conf * 100} digits={1} suffix="%" tone={conf > 0.8 ? 'good' : conf > 0.55 ? 'warn' : 'bad'} />
        <StatCell label="Margin" value={margin * 100} digits={1} suffix="%" tone={margin > 0.2 ? 'good' : margin > 0.1 ? 'warn' : 'bad'} />
        <StatCell label="Entropy" value={entropy * 100} digits={1} suffix="%" tone={entropy > 0.8 ? 'bad' : entropy > 0.55 ? 'warn' : 'good'} />
      </div>

      {/* Bottom row: interpretation + structural + concentration */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {/* Readout interpretation */}
        <div className="rounded-2xl border border-line-default/60 bg-gradient-to-b from-nebula/60 to-nebula/30 p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{isVi ? 'Diễn giải readout' : 'Readout interpretation'}</div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-300">{buildReadoutNarrative(graph, reportLang)}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <TagChip label={failureLabel} tone={graph.correct === 1 ? 'good' : 'bad'} />
            <TagChip label={graph.densityBucket} tone="info" />
            <TagChip label={graph.entropyBucket} tone="warn" />
            <TagChip label={readoutPattern} tone="good" />
          </div>
        </div>

        {/* Structural profile */}
        <div className="rounded-2xl border border-line-default/60 bg-gradient-to-b from-nebula/60 to-nebula/30 p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{isVi ? 'Hồ sơ cấu trúc' : 'Structural profile'}</div>
          <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <MiniMetric label={isVi ? 'Mật độ' : 'Density'} value={graph.structural?.density} />
            <MiniMetric label={isVi ? 'Hệ cụm' : 'Cluster Coef'} value={graph.structural?.avg_clustering} />
            <MiniMetric label={isVi ? 'TB bậc' : 'AvgDeg'} value={graph.structural?.avg_degree} digits={1} />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
            {isVi ? 'Chữ ký motif:' : 'Motif signature:'} <span className="font-semibold text-slate-200">{graph.motifSignature || '—'}</span>
          </p>
        </div>

        {/* Readout concentration */}
        <div className="rounded-2xl border border-line-default/60 bg-gradient-to-b from-nebula/60 to-nebula/30 p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{isVi ? 'Mức tập trung readout' : 'Readout concentration'}</div>
            <span className={`text-lg font-bold tabular-nums ${
              readoutConcentration > 0.6 ? 'text-emerald-300' : readoutConcentration > 0.35 ? 'text-amber-300' : 'text-red-300'
            }`}>
              {(readoutConcentration * 100).toFixed(0)}%
            </span>
          </div>
          {/* Concentration bar */}
          <div className="h-2 w-full rounded-full bg-slate-950/40 overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all ${
                readoutConcentration > 0.6 ? 'bg-emerald-500/70' : readoutConcentration > 0.35 ? 'bg-amber-500/70' : 'bg-red-500/70'
              }`}
              style={{ width: `${Math.max(2, readoutConcentration * 100)}%` }}
            />
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400">
            {isVi ? (
              <>Top-k đóng góp là <span className="font-semibold text-slate-200">{graph.readoutBucket}</span>, entropy toàn cục <span className="font-semibold text-slate-200">{graph.entropyBucket}</span>. Pattern: <span className="font-semibold text-slate-200">{readoutPattern}</span>.</>
            ) : (
              <>Top-k contribution is <span className="font-semibold text-slate-200">{graph.readoutBucket}</span>, global entropy is <span className="font-semibold text-slate-200">{graph.entropyBucket}</span>. Pattern: <span className="font-semibold text-slate-200">{readoutPattern}</span>.</>
            )}
          </p>
          {/* Top contributors */}
          <div className="mt-3 space-y-2">
            {topContributors.length ? topContributors.map((item, idx) => (
              <div key={item.nodeId} className="flex items-center gap-2">
                <div className="w-7 shrink-0 rounded-md border border-line-default bg-nebula px-1.5 py-1 text-center text-[10px] font-mono text-slate-200">
                  {item.nodeId}
                </div>
                <div className="flex-1 h-2 overflow-hidden rounded-full bg-slate-950/40">
                  <div
                    className={`h-full rounded-full ${idx === 0 ? 'bg-amber-400/85' : idx === 1 ? 'bg-amber-400/60' : 'bg-amber-400/40'}`}
                    style={{ width: `${Math.max(3, item.value * 100)}%` }}
                  />
                </div>
                <div className="w-10 shrink-0 text-right text-[10px] font-mono text-amber-300 tabular-nums">
                  {(item.value * 100).toFixed(0)}%
                </div>
              </div>
            )) : (
              <p className="text-[11px] text-slate-500 italic">{isVi ? 'Chưa có dữ liệu đóng góp nút.' : 'No node contribution data yet.'}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function BatchHeatmap({ snap, snapshots, epochInt, graphs, selectedId, onSelect, rowStats, reportMode = false, reportLang = 'vi' }) {
  const isVi = reportLang === 'vi'
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

  // Compute epoch label step to avoid overcrowding
  const epochLabelStep = Math.max(1, Math.ceil(heatmapRows.length / 12))

  return (
    <div className={`flex flex-col gap-2 ${reportMode ? 'task2-report-heatmap overflow-hidden' : ''}`}>
      <p className="text-[10px] text-slate-500 leading-relaxed">
        {isVi ? 'Xanh = đúng, đỏ = sai. Di chuột vào hàng để xem chi tiết.' : 'Green = correct, red = wrong. Hover a row for details.'}
      </p>
      <div className={`flex-1 min-h-0 ${reportMode ? 'overflow-hidden' : 'overflow-auto'}`}>
        <div className="inline-flex flex-col gap-0.5 min-w-max">
          {/* Epoch header */}
          <div className="flex gap-0.5 items-center">
            <div className="w-14 shrink-0" />
            {heatmapRows.map((row, ci) => {
              const showLabel = ci % epochLabelStep === 0 || row.isCurrent
              return (
                <div
                  key={ci}
                  className={`w-5 text-center text-[8px] font-mono shrink-0 ${
                    row.isCurrent ? 'text-cyan-300 font-bold' : showLabel ? 'text-slate-500' : 'text-transparent'
                  }`}
                >
                  {row.isCurrent ? (
                    <span className="inline-block rounded bg-cyan-500/20 px-0.5 text-[8px]">{row.epoch}</span>
                  ) : (
                    row.epoch
                  )}
                </div>
              )
            })}
          </div>

          {/* Graph rows */}
          {Array.from({ length: numGraphs }, (_, gi) => {
            const graphId = graphs[gi]?.originalGraphId ?? gi
            const isSelected = selectedId === graphId
            const stats = rowStats?.get(graphId)
            const errorCount = stats?.errorCount ?? 0
            const flipCount = stats?.flipCount ?? 0
            const recoveryEpoch = stats?.recoveryEpoch
            const wrongCount = heatmapRows.filter((row) => row.data[gi] === 0).length

            // Build tooltip
            const tooltip = [
              `${isVi ? 'Đồ thị' : 'Graph'} ${graphLabels[gi]}`,
              `${isVi ? 'Sai tại' : 'Wrong at'} ${wrongCount}/${heatmapRows.length} ${isVi ? 'mốc' : 'checkpoints'}`,
              `${isVi ? 'Đổi nhãn' : 'Flips'}: ${flipCount}`,
              recoveryEpoch != null
                ? `${isVi ? 'Phục hồi tại epoch' : 'Recovered at epoch'} ${recoveryEpoch}`
                : (isVi ? 'Chưa phục hồi' : 'Not recovered'),
            ].join(' · ')

            return (
              <div
                key={graphId}
                onClick={() => onSelect?.(graphId)}
                title={tooltip}
                className={`flex gap-0.5 items-center cursor-pointer transition-colors rounded-sm hover:bg-white/5 ${
                  isSelected ? 'bg-cyan-500/10 ring-1 ring-cyan-500/30' : ''
                }`}
              >
                {/* Left accent bar for selected row */}
                {isSelected && (
                  <div className="w-0.5 h-5 rounded-full bg-cyan-400 shrink-0" />
                )}
                <div
                  className={`${isSelected ? 'w-13' : 'w-14'} text-right text-[9px] font-mono shrink-0 pr-1 ${
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
    info: 'border-line-default/50 bg-white/[0.04] text-slate-300',
  }
  return (
    <span className={`rounded-lg border px-2 py-0.5 text-[9px] font-bold capitalize ${palette[tone] || palette.info}`}>
      {label}
    </span>
  )
}

function StatCell({ label, value, digits = 0, suffix = '', tone = 'info' }) {
  const palette = {
    good: 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-500/4 text-emerald-200',
    warn: 'border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-amber-500/4 text-amber-200',
    bad: 'border-red-500/20 bg-gradient-to-br from-red-500/10 to-red-500/4 text-red-200',
    info: 'border-line-default/60 bg-gradient-to-b from-nebula/60 to-nebula/30 text-slate-200',
  }

  const display = Number.isFinite(value) ? `${Number(value).toFixed(digits)}${suffix}` : '—'
  return (
    <div className={`rounded-2xl border p-4 ${palette[tone] || palette.info}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-bold tabular-nums">{display}</div>
    </div>
  )
}

function MiniMetric({ label, value, digits = 2 }) {
  return (
    <div className="rounded-xl border border-line-subtle/40 bg-gradient-to-b from-nebula/50 to-nebula/25 p-2.5">
      <div className="text-[9px] uppercase tracking-[0.14em] text-slate-500 font-bold">{label}</div>
      <div className="mt-1.5 text-[12px] font-mono font-bold text-slate-200 tabular-nums">
        {Number.isFinite(value) ? value.toFixed(digits) : '—'}
      </div>
    </div>
  )
}
