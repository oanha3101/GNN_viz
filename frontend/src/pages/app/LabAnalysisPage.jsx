import { Suspense } from 'react'
import { ArrowLeft, Download, Globe2, Network, Printer, ScanSearch } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import useGNNStore from '../../store/useGNNStore'
import {
  EmbeddingRouter,
  InfoRouter,
  MetricsRouter,
  TASK_LABELS,
  TopologyRouter,
} from '../../components/Lab/LabViewRegistry'
import { ErrorBoundary } from '../../components/ErrorBoundary'

function PanelLoader({ label }) {
  return (
    <div className="flex h-full min-h-[360px] items-center justify-center text-[11px] font-bold uppercase tracking-[0.18em] text-[#5b5689]">
      {label}
    </div>
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
  report: {
    title: 'Expanded PDF report',
    description: 'A print-ready analysis book that expands latent modes, structure, and Task 2 lenses into separate pages.',
    icon: Download,
    render: () => (
      <div className="space-y-6 print:space-y-0">
        {[
          {
            id: 'metrics-full',
            label: 'Metrics · full panel',
            icon: ScanSearch,
            render: () => <MetricsRouter hideFocusControls={false} />,
          },
          {
            id: 'latent-predicted',
            label: 'Latent space · predicted',
            icon: Globe2,
            render: () => <EmbeddingRouter forcedTask2ColorMode="predicted" hideTask2Toolbar />,
          },
          {
            id: 'latent-correctness',
            label: 'Latent space · correctness',
            icon: Globe2,
            render: () => <EmbeddingRouter forcedTask2ColorMode="correctness" hideTask2Toolbar />,
          },
          {
            id: 'latent-confidence',
            label: 'Latent space · confidence',
            icon: Globe2,
            render: () => <EmbeddingRouter forcedTask2ColorMode="confidence" hideTask2Toolbar />,
          },
          {
            id: 'latent-entropy',
            label: 'Latent space · entropy',
            icon: Globe2,
            render: () => <EmbeddingRouter forcedTask2ColorMode="entropy" hideTask2Toolbar />,
          },
          {
            id: 'structure',
            label: 'Structure and inspector',
            icon: Network,
            render: () => VIEW_CONFIG.structure.render(),
          },
          {
            id: 'gallery-priority',
            label: 'Gallery · priority',
            icon: Network,
            render: () => <TopologyRouter forcedGallerySort="priority" hideGalleryControls showFullCollection showGalleryOnly />,
          },
          {
            id: 'gallery-confidence',
            label: 'Gallery · confidence',
            icon: Network,
            render: () => <TopologyRouter forcedGallerySort="confidence_desc" hideGalleryControls showFullCollection showGalleryOnly />,
          },
          {
            id: 'gallery-entropy',
            label: 'Gallery · entropy',
            icon: Network,
            render: () => <TopologyRouter forcedGallerySort="entropy_desc" hideGalleryControls showFullCollection showGalleryOnly />,
          },
          {
            id: 'gallery-size',
            label: 'Gallery · size',
            icon: Network,
            render: () => <TopologyRouter forcedGallerySort="size_desc" hideGalleryControls showFullCollection showGalleryOnly />,
          },
          {
            id: 'metrics-overview',
            label: 'Metrics · overview',
            icon: ScanSearch,
            render: () => <MetricsRouter forcedTab="overview" hideTabControls hideFocusControls />,
          },
          {
            id: 'metrics-failures',
            label: 'Metrics · failures',
            icon: ScanSearch,
            render: () => <MetricsRouter forcedTab="failures" hideTabControls hideFocusControls />,
          },
          {
            id: 'metrics-weak-class',
            label: 'Metrics · weak-class misses',
            icon: ScanSearch,
            render: () => <MetricsRouter forcedTab="failures" forcedFocus="weak_class" hideTabControls hideFocusControls />,
          },
          {
            id: 'metrics-structure',
            label: 'Metrics · structure',
            icon: ScanSearch,
            render: () => <MetricsRouter forcedTab="structure" hideTabControls hideFocusControls />,
          },
          {
            id: 'metrics-outlier',
            label: 'Metrics · structural outliers',
            icon: ScanSearch,
            render: () => <MetricsRouter forcedTab="structure" forcedFocus="outlier" hideTabControls hideFocusControls />,
          },
          {
            id: 'metrics-readout',
            label: 'Metrics · readout',
            icon: ScanSearch,
            render: () => <MetricsRouter forcedTab="readout" hideTabControls hideFocusControls />,
          },
          {
            id: 'readout-weak-class',
            label: 'Readout · weak-class slice',
            icon: Network,
            render: () => (
              <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="min-h-[620px] overflow-hidden rounded-2xl border border-[rgba(168,85,247,0.12)] bg-[#120b24]">
                  <TopologyRouter forcedFocus="weak_class" hideGalleryControls showFullCollection />
                </div>
                <div className="min-h-[620px] overflow-hidden rounded-2xl border border-[rgba(168,85,247,0.12)] bg-[#120b24]">
                  <InfoRouter forcedFocus="weak_class" />
                </div>
              </div>
            ),
          },
          {
            id: 'readout-outlier',
            label: 'Readout · structural outliers',
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
        ].map((page, index) => {
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
        })}
      </div>
    ),
  },
}

export default function LabAnalysisPage() {
  const navigate = useNavigate()
  const { panel = 'metrics' } = useParams()
  const selectedTask = useGNNStore((state) => state.selectedTask)
  const datasetName = useGNNStore((state) => state.datasetName || state.activeDatasetVersionName || 'Active dataset')

  const config = VIEW_CONFIG[panel] || VIEW_CONFIG.metrics
  const Icon = config.icon

  return (
    <div className="min-h-screen bg-[#0a0514] text-[#e7e4ff]">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-5 px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-[rgba(168,85,247,0.12)] bg-[#120b24]/88 px-5 py-4 shadow-[0_18px_48px_rgba(4,0,12,0.35)] backdrop-blur-xl print:hidden">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8f88bc]">
              {TASK_LABELS[selectedTask]} · {datasetName}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Icon size={18} className="text-[#a855f7]" />
              <h1 className="text-2xl font-black tracking-tight text-white">{config.title}</h1>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#a9a3d0]">
              {config.description}
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
              {config.render()}
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  )
}
