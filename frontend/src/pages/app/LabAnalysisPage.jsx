import { Suspense, useMemo } from 'react'
import { ArrowLeft, Download, Globe2, Network, Printer, ScanSearch } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import usePlayerStore from '../../store/playerStore'
import useGNNStore from '../../store/useGNNStore'
import {
  EmbeddingRouter,
  InfoRouter,
  MetricsRouter,
  TASK_LABELS,
  TopologyRouter,
} from '../../components/Lab/LabViewRegistry'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import {
  assessTask2Reliability,
  buildTask2BestEpochSuggestion,
  buildTask2FocusStory,
  buildTask2GraphDescriptors,
  buildTask2NarrativeSummary,
  buildTask2ResearchSignals,
  summarizeGraphCollection,
} from '../../utils/task2Metrics'

function PanelLoader({ label }) {
  return (
    <div className="flex h-full min-h-[360px] items-center justify-center text-[11px] font-bold uppercase tracking-[0.18em] text-[#5b5689]">
      {label}
    </div>
  )
}

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

function toPercent(value, digits = 1) {
  if (!Number.isFinite(value)) return 'N/A'
  return `${(value * 100).toFixed(digits)}%`
}

function toSigned(value, digits = 2) {
  if (!Number.isFinite(value)) return 'N/A'
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`
}

function formatCellLabel(cell, classNames = []) {
  if (!cell) return 'Entire collection'
  const pred = classNames?.[cell.pred] || `Class ${cell.pred}`
  const gt = classNames?.[cell.gt] || `Class ${cell.gt}`
  return `Pred ${pred} vs GT ${gt}`
}

function inferTask2ReportCell(descriptors = [], reliability = null) {
  const weakClassId = reliability?.metrics?.weakClass?.classId
  const scoped = descriptors.filter((descriptor) => (
    descriptor.correct === 0 && (weakClassId == null || descriptor.groundTruth === weakClassId)
  ))
  const pool = scoped.length ? scoped : descriptors.filter((descriptor) => descriptor.correct === 0)
  if (!pool.length) return null

  const counts = new Map()
  for (const descriptor of pool) {
    if (!Number.isInteger(descriptor.predicted) || !Number.isInteger(descriptor.groundTruth)) continue
    const key = `${descriptor.predicted}:${descriptor.groundTruth}`
    const current = counts.get(key) || { pred: descriptor.predicted, gt: descriptor.groundTruth, count: 0 }
    current.count += 1
    counts.set(key, current)
  }

  const best = [...counts.values()].sort((a, b) => b.count - a.count)[0]
  return best ? { pred: best.pred, gt: best.gt } : null
}

function ReportMetricCard({ label, value, tone = 'slate' }) {
  const toneMap = {
    slate: 'border-slate-200 bg-white text-slate-900',
    cyan: 'border-cyan-200 bg-cyan-50/80 text-cyan-950',
    amber: 'border-amber-200 bg-amber-50/80 text-amber-950',
    rose: 'border-rose-200 bg-rose-50/80 text-rose-950',
    emerald: 'border-emerald-200 bg-emerald-50/80 text-emerald-950',
  }

  return (
    <div className={`rounded-2xl border p-4 ${toneMap[tone] || toneMap.slate}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-black tracking-tight">{value}</div>
    </div>
  )
}

function ReportNarrativeCard({ label, body, tone = 'slate' }) {
  const toneMap = {
    slate: 'border-slate-200 bg-white',
    cyan: 'border-cyan-200 bg-cyan-50/75',
    amber: 'border-amber-200 bg-amber-50/75',
    rose: 'border-rose-200 bg-rose-50/75',
  }

  return (
    <div className={`rounded-2xl border p-4 ${toneMap[tone] || toneMap.slate}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <p className="mt-2 text-sm leading-6 text-slate-700">{body}</p>
    </div>
  )
}

function ReportSignalCard({ signal }) {
  if (!signal) return null
  const tone = signal.status === 'danger'
    ? 'border-rose-200 bg-rose-50/75'
    : signal.status === 'warn'
      ? 'border-amber-200 bg-amber-50/75'
      : 'border-emerald-200 bg-emerald-50/75'

  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-bold text-slate-900">{signal.title}</div>
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{signal.status}</div>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-700">{signal.summary}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{signal.evidence}</p>
      <p className="mt-2 text-xs font-semibold text-slate-700">{signal.recommendation}</p>
    </div>
  )
}

function Task2ReportSummaryPage({
  taskLabel,
  datasetName,
  epochInt,
  totalEpochs,
  collectionSummary,
  reliability,
  narrative,
  researchSignals,
  epochSuggestion,
  focusStory,
  reportCell,
  graphClassNames,
}) {
  const metrics = reliability?.metrics || {}
  const signalList = [researchSignals?.collapse, researchSignals?.calibration, researchSignals?.shortcut].filter(Boolean)
  const weakClassLabel = metrics.weakClass?.label || 'No weak-class signal yet'
  const weakClassRecall = metrics.weakClass ? toPercent(metrics.weakClass.recall, 1) : 'N/A'

  return (
    <div className="grid gap-5 print:gap-4">
      <div className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-white via-cyan-50/55 to-white p-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
          {taskLabel} - {datasetName}
        </div>
        <h2 className="mt-3 text-4xl font-black tracking-tight text-slate-950">Task 2 research report</h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
          This export turns the live Task 2 lens into a print-friendly research workflow: collection overview, failure slices,
          latent-space comparison, structural reading, and readout inspection.
        </p>

        <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-slate-700">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">Epoch {epochInt}</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">{collectionSummary.totalGraphs} graphs</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">{graphClassNames.length || 1} classes</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">{totalEpochs} checkpoints</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">{formatCellLabel(reportCell, graphClassNames)}</span>
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <ReportMetricCard label="Accuracy" value={toPercent(metrics.accuracy, 1)} tone="emerald" />
        <ReportMetricCard label="Macro F1" value={toPercent(metrics.macroF1, 1)} tone="cyan" />
        <ReportMetricCard label="Balanced Acc" value={toPercent(metrics.balancedAccuracy, 1)} tone="cyan" />
        <ReportMetricCard label="ECE" value={toPercent(metrics.calibrationEce, 1)} tone="amber" />
        <ReportMetricCard label="Density Bias" value={toSigned(metrics.densityBias, 2)} tone={Math.abs(metrics.densityBias || 0) >= 0.35 ? 'rose' : 'slate'} />
        <ReportMetricCard label="Weak-Class Recall" value={weakClassRecall} tone={metrics.weakClass && metrics.weakClass.recall < 0.6 ? 'rose' : 'slate'} />
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <ReportNarrativeCard label="Main insight" body={narrative?.mainInsight || 'No narrative summary yet.'} tone="cyan" />
        <ReportNarrativeCard label="Main risk" body={narrative?.mainRisk || reliability?.readingGuide || 'No risk narrative yet.'} tone="rose" />
        <ReportNarrativeCard label="Next lens" body={narrative?.recommendedNextLens || 'Continue with failure and readout slices.'} tone="amber" />
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {signalList.map((signal) => (
          <ReportSignalCard key={signal.id} signal={signal} />
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Routing note</div>
          <p className="mt-2 text-sm leading-6 text-slate-700">{focusStory?.summary || reliability?.readingGuide}</p>
          <p className="mt-3 text-xs leading-5 text-slate-500">{focusStory?.evidence || 'No routing evidence available for this checkpoint.'}</p>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            The default report slice is <span className="font-semibold">{formatCellLabel(reportCell, graphClassNames)}</span>. If you pin a new confusion cell before printing, the slice-aware pages will follow that selection instead.
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Best epoch suggestion</div>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {epochSuggestion?.recommendation || 'No epoch guidance available yet.'}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {epochSuggestion?.rationale || 'Once multiple checkpoints are available, this block will surface the best Macro F1 and balanced-accuracy reads.'}
          </p>
          <div className="mt-4 grid gap-2 text-sm text-slate-700">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              Best Macro F1: {epochSuggestion?.bestMacro ? `epoch ${epochSuggestion.bestMacro.epoch} - ${toPercent(epochSuggestion.bestMacro.macroF1, 1)}` : 'N/A'}
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              Best Balanced Acc: {epochSuggestion?.bestBalanced ? `epoch ${epochSuggestion.bestBalanced.epoch} - ${toPercent(epochSuggestion.bestBalanced.balancedAccuracy, 1)}` : 'N/A'}
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              Weak class: {weakClassLabel}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ReportSection({ page, index }) {
  const ViewIcon = page.icon
  return (
    <section
      key={page.id}
      className="rounded-[28px] border border-[rgba(168,85,247,0.1)] bg-[#0f0a1e] p-4 shadow-[0_22px_60px_rgba(4,0,12,0.4)] print:min-h-screen print:break-after-page print:rounded-none print:border-0 print:bg-white print:p-0 print:shadow-none"
    >
      <div className="mb-4 flex items-center gap-2 border-b border-[rgba(168,85,247,0.12)] pb-3 print:border-slate-200">
        <ViewIcon size={16} className="text-[#a855f7] print:text-slate-700" />
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8f88bc] print:text-slate-500">
            Page {index + 1}
          </div>
          <div className="text-lg font-bold text-white print:text-slate-900">{page.label}</div>
        </div>
      </div>
      <ErrorBoundary>
        <Suspense fallback={<PanelLoader label="Dang tai report page..." />}>
          {page.render()}
        </Suspense>
      </ErrorBoundary>
    </section>
  )
}

const VIEW_CONFIG = {
  metrics: {
    title: 'Metrics capture view',
    description: 'A wide, print-friendly surface for task diagnostics, reliability notes, and task-specific narratives.',
    icon: ScanSearch,
    render: () => <MetricsRouter />,
  },
  latent: {
    title: 'Latent space capture view',
    description: 'A larger latent-space canvas for screenshots, cluster comparison, and quick visual inspection.',
    icon: Globe2,
    render: () => <EmbeddingRouter />,
  },
  structure: {
    title: 'Structure capture view',
    description: 'A dedicated topology canvas with the inspector visible so graph reasoning is easier to review and share.',
    icon: Network,
    render: () => (
      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="min-h-[620px] overflow-hidden rounded-2xl border border-[rgba(168,85,247,0.12)] bg-[#120b24]">
          <TopologyRouter />
        </div>
        <div className="min-h-[620px] overflow-hidden rounded-2xl border border-[rgba(168,85,247,0.12)] bg-[#120b24]">
          <InfoRouter />
        </div>
      </div>
    ),
  },
}

export default function LabAnalysisPage() {
  const navigate = useNavigate()
  const { panel = 'metrics' } = useParams()
  const { snapshots, currentEpochFloat, totalEpochs } = usePlayerStore()
  const selectedTask = useGNNStore((state) => state.selectedTask)
  const taskData = useGNNStore((state) => state.taskData)
  const classNames = useGNNStore((state) => state.classNames)
  const selectedCell = useGNNStore((state) => state.task2SelectedCell)
  const datasetName = useGNNStore((state) => state.datasetName || state.activeDatasetVersionName || 'Active dataset')

  const config = VIEW_CONFIG[panel] || VIEW_CONFIG.metrics
  const Icon = config.icon

  const reportPages = useMemo(() => {
    if (selectedTask !== 2) {
      return [
        {
          id: 'metrics-full',
          label: 'Metrics - full panel',
          icon: ScanSearch,
          render: () => <MetricsRouter />,
        },
        {
          id: 'latent-full',
          label: 'Latent - full canvas',
          icon: Globe2,
          render: () => <EmbeddingRouter />,
        },
        {
          id: 'structure-full',
          label: 'Structure - full canvas',
          icon: Network,
          render: () => VIEW_CONFIG.structure.render(),
        },
      ]
    }

    const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
    const snap = snapshots[epochInt] || null
    const graphs = taskData?.graphs || []
    const indexedGraphs = graphs.map((graph, index) => ({
      ...graph,
      originalGraphId: graph?.originalGraphId ?? index,
      sourceIndex: graph?.sourceIndex ?? index,
    }))
    const graphClassNames = buildGraphClassNames(indexedGraphs, taskData?.classNames || classNames)
    const collectionSummary = summarizeGraphCollection(indexedGraphs, graphClassNames)
    const reliability = assessTask2Reliability({ snapshot: snap, graphs: indexedGraphs, classNames: graphClassNames })
    const descriptors = buildTask2GraphDescriptors({ snapshot: snap, graphs: indexedGraphs, classNames: graphClassNames })
    const narrative = buildTask2NarrativeSummary(descriptors, reliability)
    const researchSignals = buildTask2ResearchSignals({
      snapshot: snap,
      graphs: descriptors,
      classNames: graphClassNames,
      reliability,
      descriptors,
    })
    const epochSuggestion = buildTask2BestEpochSuggestion(snapshots)
    const focusStory = buildTask2FocusStory({
      reliability,
      descriptors,
      classNames: graphClassNames,
    })
    const reportCell = selectedCell || inferTask2ReportCell(descriptors, reliability)

    return [
      {
        id: 'task2-summary',
        label: 'Task 2 - executive summary',
        icon: Download,
        render: () => (
          <Task2ReportSummaryPage
            taskLabel={TASK_LABELS[selectedTask]}
            datasetName={datasetName}
            epochInt={epochInt}
            totalEpochs={totalEpochs || snapshots.length}
            collectionSummary={collectionSummary}
            reliability={reliability}
            narrative={narrative}
            researchSignals={researchSignals}
            epochSuggestion={epochSuggestion}
            focusStory={focusStory}
            reportCell={reportCell}
            graphClassNames={graphClassNames}
          />
        ),
      },
      {
        id: 'metrics-full',
        label: 'Metrics - full panel',
        icon: ScanSearch,
        render: () => <MetricsRouter disableAutoSelection />,
      },
      {
        id: 'metrics-failures',
        label: 'Metrics - failures',
        icon: ScanSearch,
        render: () => <MetricsRouter forcedTab="failures" hideTabControls hideFocusControls disableAutoSelection />,
      },
      {
        id: 'metrics-weak-class',
        label: 'Metrics - weak-class misses',
        icon: ScanSearch,
        render: () => (
          <MetricsRouter
            forcedTab="failures"
            forcedFocus="weak_class"
            forcedSelectedCell={reportCell}
            hideTabControls
            hideFocusControls
            disableAutoSelection
          />
        ),
      },
      {
        id: 'latent-predicted',
        label: 'Latent - predicted labels',
        icon: Globe2,
        render: () => <EmbeddingRouter forcedTask2ColorMode="predicted" hideTask2Toolbar />,
      },
      {
        id: 'latent-correctness',
        label: 'Latent - correctness',
        icon: Globe2,
        render: () => <EmbeddingRouter forcedTask2ColorMode="correctness" hideTask2Toolbar />,
      },
      {
        id: 'latent-confidence',
        label: 'Latent - confidence',
        icon: Globe2,
        render: () => <EmbeddingRouter forcedTask2ColorMode="confidence" hideTask2Toolbar />,
      },
      {
        id: 'latent-entropy',
        label: 'Latent - entropy',
        icon: Globe2,
        render: () => <EmbeddingRouter forcedTask2ColorMode="entropy" hideTask2Toolbar />,
      },
      {
        id: 'latent-focus-slice',
        label: 'Latent - focus slice',
        icon: Globe2,
        render: () => (
          <EmbeddingRouter
            forcedTask2ColorMode="correctness"
            forcedTask2SelectedCell={reportCell}
            hideTask2Toolbar
          />
        ),
      },
      {
        id: 'structure-overview',
        label: 'Structure - gallery and inspector',
        icon: Network,
        render: () => VIEW_CONFIG.structure.render(),
      },
      {
        id: 'gallery-priority',
        label: 'Gallery - priority',
        icon: Network,
        render: () => <TopologyRouter forcedGallerySort="priority" hideGalleryControls showFullCollection showGalleryOnly />,
      },
      {
        id: 'gallery-confidence',
        label: 'Gallery - confidence',
        icon: Network,
        render: () => <TopologyRouter forcedGallerySort="confidence_desc" hideGalleryControls showFullCollection showGalleryOnly />,
      },
      {
        id: 'gallery-focus-slice',
        label: 'Gallery - focus slice',
        icon: Network,
        render: () => (
          <TopologyRouter
            forcedFocus="weak_class"
            forcedSelectedCell={reportCell}
            forcedGallerySort="priority"
            hideGalleryControls
            showFullCollection
            showGalleryOnly
          />
        ),
      },
      {
        id: 'metrics-structure',
        label: 'Metrics - structure',
        icon: ScanSearch,
        render: () => <MetricsRouter forcedTab="structure" hideTabControls hideFocusControls disableAutoSelection />,
      },
      {
        id: 'metrics-outlier',
        label: 'Metrics - structural outliers',
        icon: ScanSearch,
        render: () => <MetricsRouter forcedTab="structure" forcedFocus="outlier" hideTabControls hideFocusControls disableAutoSelection />,
      },
      {
        id: 'metrics-readout',
        label: 'Metrics - readout',
        icon: ScanSearch,
        render: () => <MetricsRouter forcedTab="readout" hideTabControls hideFocusControls disableAutoSelection />,
      },
      {
        id: 'readout-weak-class',
        label: 'Readout - weak-class slice',
        icon: Network,
        render: () => (
          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="min-h-[620px] overflow-hidden rounded-2xl border border-[rgba(168,85,247,0.12)] bg-[#120b24]">
              <TopologyRouter forcedFocus="weak_class" forcedSelectedCell={reportCell} hideGalleryControls showFullCollection />
            </div>
            <div className="min-h-[620px] overflow-hidden rounded-2xl border border-[rgba(168,85,247,0.12)] bg-[#120b24]">
              <InfoRouter forcedFocus="weak_class" forcedSelectedCell={reportCell} />
            </div>
          </div>
        ),
      },
      {
        id: 'readout-outlier',
        label: 'Readout - structural outliers',
        icon: Network,
        render: () => (
          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="min-h-[620px] overflow-hidden rounded-2xl border border-[rgba(168,85,247,0.12)] bg-[#120b24]">
              <TopologyRouter forcedFocus="outlier" hideGalleryControls showFullCollection />
            </div>
            <div className="min-h-[620px] overflow-hidden rounded-2xl border border-[rgba(168,85,247,0.12)] bg-[#120b24]">
              <InfoRouter forcedFocus="outlier" />
            </div>
          </div>
        ),
      },
    ]
  }, [classNames, currentEpochFloat, datasetName, selectedCell, selectedTask, snapshots, taskData, totalEpochs])

  const reportConfig = {
    title: 'Expanded PDF report',
    description: 'A print-ready analysis book with dedicated pages for metrics, latent-space modes, structure, and readout slices.',
    icon: Download,
    render: () => (
      <div className="space-y-6 print:space-y-0">
        {reportPages.map((page, index) => (
          <ReportSection key={page.id} page={page} index={index} />
        ))}
      </div>
    ),
  }

  const resolvedConfig = panel === 'report' ? reportConfig : config
  const ResolvedIcon = resolvedConfig.icon

  return (
    <div className="min-h-screen bg-[#0a0514] text-[#e7e4ff]">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-5 px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-[rgba(168,85,247,0.12)] bg-[#120b24]/88 px-5 py-4 shadow-[0_18px_48px_rgba(4,0,12,0.35)] backdrop-blur-xl print:hidden">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8f88bc]">
              {TASK_LABELS[selectedTask]} - {datasetName}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <ResolvedIcon size={18} className="text-[#a855f7]" />
              <h1 className="text-2xl font-black tracking-tight text-white">{resolvedConfig.title}</h1>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#a9a3d0]">
              {resolvedConfig.description}
            </p>
            <div className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-2xl border border-[rgba(168,85,247,0.14)] bg-[#0d0920]/85 p-1.5">
              {[
                ['latent', 'Latent', Globe2],
                ['structure', 'Structure', Network],
                ['metrics', 'Metrics', ScanSearch],
                ['report', 'PDF Book', Download],
              ].map(([viewId, label, ViewIcon]) => {
                const active = panel === viewId
                return (
                  <button
                    key={viewId}
                    type="button"
                    onClick={() => navigate(`/app/lab/analysis/${viewId}`)}
                    className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                      active
                        ? 'bg-[#201338] text-white shadow-[0_8px_20px_rgba(9,6,20,0.25)]'
                        : 'text-[#9088bd] hover:bg-[#171129] hover:text-[#efeaff]'
                    }`}
                  >
                    <ViewIcon size={14} className={active ? 'text-[#a855f7]' : 'text-[#6f679d]'} />
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/app/lab')}
              className="inline-flex items-center gap-2 rounded-xl border border-[rgba(168,85,247,0.16)] bg-[#1a1231] px-4 py-2 text-xs font-semibold text-[#ddd9ff] transition-colors hover:border-[rgba(168,85,247,0.28)] hover:text-white"
            >
              <ArrowLeft size={14} />
              Back to lab
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-xl border border-[rgba(34,211,238,0.18)] bg-[#0f2130] px-4 py-2 text-xs font-semibold text-[#c8f8ff] transition-colors hover:border-[rgba(34,211,238,0.32)]"
            >
              <Printer size={14} />
              Print / Save PDF
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-xl border border-[rgba(251,191,36,0.16)] bg-[#261d0a] px-4 py-2 text-xs font-semibold text-[#ffe6a8] transition-colors hover:border-[rgba(251,191,36,0.3)]"
            >
              <Download size={14} />
              {panel === 'report' ? 'Export detailed PDF' : 'Export capture'}
            </button>
          </div>
        </div>

        <div className="rounded-[28px] border border-[rgba(168,85,247,0.1)] bg-[#0f0a1e] p-4 shadow-[0_22px_60px_rgba(4,0,12,0.4)] print:border-0 print:bg-white print:p-0 print:shadow-none">
          <ErrorBoundary>
            <Suspense fallback={<PanelLoader label="Dang tai capture view..." />}>
              {resolvedConfig.render()}
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  )
}
