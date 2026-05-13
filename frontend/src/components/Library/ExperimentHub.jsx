import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  FileText,
  Filter,
  Loader2,
  Pin,
  Play,
  RefreshCw,
  Save,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { motion, AnimatePresence } from 'framer-motion'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import useAuthStore from '../../store/authStore'
import { apiUrl, normalizeCollectionPayload } from '../../utils/api'
import Panel from '../primitives/Panel'
import LoadingState from '../primitives/LoadingState'
import ErrorState from '../primitives/ErrorState'
import EmptyState from '../primitives/EmptyState'

const COMPARE_COLORS = ['#818cf8', '#f472b6', '#22d3ee', '#34d399']

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="flex min-w-[150px] flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.16em] text-twilight">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-cosmic text-sm border-line-subtle focus:border-accent-amethyst transition-colors"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

function RunChip({ selected, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all ${
        selected
          ? 'border-aurora-blue/40 bg-aurora-blue/12 text-aurora-blue'
          : 'border-line-subtle bg-glass text-twilight hover:text-starlight hover:border-line-active'
      }`}
    >
      {children}
    </button>
  )
}

function StatusDot({ status }) {
  const map = {
    completed: 'bg-emerald-400',
    running: 'bg-amber-400 animate-pulse',
    failed: 'bg-rose-400',
    stopped: 'bg-slate-500',
  }
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${map[status] || 'bg-slate-500'}`} />
}

function buildCompareSeries(results) {
  const epochMap = new Map()
  results.forEach((item, index) => {
    const history = item.metrics?.history || {}
    const epochs = history.epoch || []
    const scores = history.primary_score || []
    epochs.forEach((epoch, i) => {
      const row = epochMap.get(epoch) || { epoch }
      row[`run_${index}`] = scores[i] ?? null
      epochMap.set(epoch, row)
    })
  })
  return Array.from(epochMap.values()).sort((a, b) => a.epoch - b.epoch)
}

function formatDateTime(value) {
  if (!value) return 'Unknown'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function buildReportMarkdown(report) {
  if (!report) return ''
  const lines = [
    `# ${report.experiment?.title || 'Experiment Report'}`,
    '',
    `- Experiment ID: ${report.experiment?.id ?? 'n/a'}`,
    `- Project: ${report.experiment?.project_title || 'Default Library'}`,
    `- Model: ${report.experiment?.model_type || 'n/a'}`,
    `- Dataset: ${report.experiment?.dataset_record_name || report.experiment?.dataset_name || 'n/a'}`,
    `- Dataset Version: ${report.dataset_version?.version ?? 'n/a'} (${report.dataset_version?.lifecycle || 'unknown'})`,
    `- Best Epoch: ${report.summary?.best_epoch ?? 0}`,
    `- Best Score: ${Number(report.summary?.best_score || 0).toFixed(4)}`,
    `- Final Accuracy: ${Number(report.summary?.final_accuracy || 0).toFixed(4)}`,
    `- Final Loss: ${Number(report.summary?.final_loss || 0).toFixed(4)}`,
    `- Replay API: ${report.replay?.api_path || 'n/a'}`,
    '',
    '## Notes',
    report.notes || 'No notes yet.',
    '',
    '## Next Action',
    report.next_action || 'Review replay and compare with nearby runs.',
    '',
    '## Config',
    '```json',
    JSON.stringify(report.config || {}, null, 2),
    '```',
  ]
  return lines.join('\n')
}

function downloadTextFile(filename, content, type) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function ExperimentHub({ isOpen, onClose, variant = 'modal' }) {
  const setTask = useGNNStore((s) => s.setTask)
  const setHyperparams = useGNNStore((s) => s.setHyperparams)
  const setGraphData = useGNNStore((s) => s.setGraphData)
  const setGroundTruth = useGNNStore((s) => s.setGroundTruth)
  const setTaskData = useGNNStore((s) => s.setTaskData)
  const setMockMode = useGNNStore((s) => s.setMockMode)
  const setActiveProjectContext = useGNNStore((s) => s.setActiveProjectContext)
  const setActiveDatasetContext = useGNNStore((s) => s.setActiveDatasetContext)
  const loadSnapshots = usePlayerStore((s) => s.loadSnapshots)
  const setDone = usePlayerStore((s) => s.setDone)
  const getAuthHeaders = useAuthStore((s) => s.getAuthHeaders)

  const [experiments, setExperiments] = useState([])
  const [projects, setProjects] = useState([])
  const [datasets, setDatasets] = useState([])
  const [compareResults, setCompareResults] = useState([])
  const [selectedCompareIds, setSelectedCompareIds] = useState([])
  const [selectedExperimentId, setSelectedExperimentId] = useState(null)
  const [selectedDetail, setSelectedDetail] = useState(null)
  const [selectedReport, setSelectedReport] = useState(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [notesDraft, setNotesDraft] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [compareLoading, setCompareLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [actionKey, setActionKey] = useState(null)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({
    projectId: '',
    datasetVersionId: '',
    taskType: '',
    modelType: '',
    ownerId: '',
    status: '',
  })

  const fetchJson = useCallback(async (path, options = {}) => {
    const res = await fetch(apiUrl(path), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
        ...(options.headers || {}),
      },
    })
    const payload = await res.json()
    if (!res.ok) {
      throw new Error(payload.detail || 'Request failed')
    }
    return payload
  }, [getAuthHeaders])

  const fetchHubData = useCallback(async () => {
    if (!isOpen) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filters.taskType) params.set('task_type', filters.taskType)
      if (filters.projectId) params.set('project_id', filters.projectId)
      if (filters.datasetVersionId) params.set('dataset_version_id', filters.datasetVersionId)
      if (filters.ownerId) params.set('owner_id', filters.ownerId)
      if (filters.modelType) params.set('model_type', filters.modelType)
      if (filters.status) params.set('status', filters.status)
      const query = params.toString()
      const [experimentsPayload, projectsPayload, datasetsPayload] = await Promise.all([
        fetchJson(`/experiments${query ? `?${query}` : ''}`),
        fetchJson('/projects'),
        fetchJson('/datasets'),
      ])
      const experimentItems = normalizeCollectionPayload(experimentsPayload).items
      const projectItems = normalizeCollectionPayload(projectsPayload).items
      const datasetItems = normalizeCollectionPayload(datasetsPayload).items
      setExperiments(experimentItems)
      setProjects(projectItems)
      setDatasets(datasetItems)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [fetchJson, filters, isOpen])

  const loadSelectedExperiment = useCallback(async (expId) => {
    if (!expId) {
      setSelectedDetail(null)
      setSelectedReport(null)
      setTitleDraft('')
      setNotesDraft('')
      return
    }
    setDetailLoading(true)
    setError(null)
    try {
      const [detail, report] = await Promise.all([
        fetchJson(`/experiments/${expId}`),
        fetchJson(`/experiments/${expId}/report`),
      ])
      setSelectedDetail(detail)
      setSelectedReport(report)
      setTitleDraft(detail.title || '')
      setNotesDraft(detail.notes || '')
    } catch (err) {
      setError(err)
    } finally {
      setDetailLoading(false)
    }
  }, [fetchJson])

  useEffect(() => {
    if (isOpen) fetchHubData()
  }, [fetchHubData, isOpen])

  useEffect(() => {
    const handler = () => {
      if (isOpen) fetchHubData()
    }
    window.addEventListener('gnn:experiment-saved', handler)
    return () => window.removeEventListener('gnn:experiment-saved', handler)
  }, [fetchHubData, isOpen])

  useEffect(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    const filteredExperiments = !normalizedQuery
      ? experiments
      : experiments.filter((item) => {
        const haystacks = [
          item.title,
          item.dataset_name,
          item.model_type,
          `task ${item.task_type}`,
        ]
        return haystacks.some((value) => String(value || '').toLowerCase().includes(normalizedQuery))
      })
    if (!filteredExperiments.length) {
      setSelectedExperimentId(null)
      return
    }
    const stillExists = filteredExperiments.some((item) => item.id === selectedExperimentId)
    if (!stillExists) {
      setSelectedExperimentId(filteredExperiments[0].id)
    }
  }, [experiments, searchQuery, selectedExperimentId])

  useEffect(() => {
    if (isOpen && selectedExperimentId) {
      loadSelectedExperiment(selectedExperimentId)
    }
  }, [isOpen, loadSelectedExperiment, selectedExperimentId])

  const ownerOptions = useMemo(() => {
    const owners = Array.from(new Set(experiments.map((item) => item.owner_id).filter(Boolean)))
    return [
      { value: '', label: 'All owners' },
      ...owners.map((ownerId) => ({ value: String(ownerId), label: `Owner #${ownerId}` })),
    ]
  }, [experiments])

  const visibleExperiments = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    if (!normalizedQuery) return experiments
    return experiments.filter((item) => {
      const haystacks = [
        item.title,
        item.dataset_name,
        item.model_type,
        `task ${item.task_type}`,
      ]
      return haystacks.some((value) => String(value || '').toLowerCase().includes(normalizedQuery))
    })
  }, [experiments, searchQuery])

  const compareSeries = useMemo(() => buildCompareSeries(compareResults), [compareResults])

  const handleCompareToggle = useCallback((expId) => {
    setSelectedCompareIds((prev) => {
      if (prev.includes(expId)) return prev.filter((id) => id !== expId)
      if (prev.length >= 4) return [...prev.slice(1), expId]
      return [...prev, expId]
    })
  }, [])

  const handleCompare = useCallback(async () => {
    if (selectedCompareIds.length < 2) return
    setCompareLoading(true)
    setError(null)
    try {
      const payload = await fetchJson('/experiments/compare', {
        method: 'POST',
        body: JSON.stringify({ experiment_ids: selectedCompareIds }),
      })
      setCompareResults(payload.results || [])
    } catch (err) {
      setError(err)
    } finally {
      setCompareLoading(false)
    }
  }, [fetchJson, selectedCompareIds])

  const handleDelete = useCallback(async (expId) => {
    setActionKey(`delete-${expId}`)
    try {
      await fetchJson(`/experiments/${expId}`, { method: 'DELETE' })
      setExperiments((prev) => prev.filter((item) => item.id !== expId))
      setSelectedCompareIds((prev) => prev.filter((id) => id !== expId))
      setCompareResults((prev) => prev.filter((item) => item.experiment.id !== expId))
      if (selectedExperimentId === expId) {
        setSelectedExperimentId(null)
      }
    } catch (err) {
      setError(err)
    } finally {
      setActionKey(null)
    }
  }, [fetchJson, selectedExperimentId])

  const handleReplayLoad = useCallback(async (expId) => {
    setActionKey(`replay-${expId}`)
    try {
      const [detail, replay] = await Promise.all([
        fetchJson(`/experiments/${expId}`),
        fetchJson(`/experiments/${expId}/replay`, { method: 'POST' }),
      ])

      setTask(detail.task_type)
      useGNNStore.setState({ selectedModel: detail.model_type })
      setHyperparams({
        epochs: detail.epoch_count || detail.config_json?.epochs || 100,
        lr: detail.learning_rate || detail.config_json?.lr || 0.01,
        hidden: detail.hidden_dim || detail.config_json?.hidden || 64,
        dropout: detail.dropout || detail.config_json?.dropout || 0.5,
        dataset: detail.dataset_name || 'cora',
      })
      setActiveProjectContext(detail.project_id || null, detail.title)
      setActiveDatasetContext(
        detail.dataset_id || null,
        detail.dataset_version_id || null,
        `${detail.dataset_name || 'dataset'} • version #${detail.dataset_version_id}`
      )

      const graphPayload = replay.graph_payload || detail.graph_payload || {}
      setGraphData(graphPayload.graph_data_json || null)
      setGroundTruth(graphPayload.ground_truth_json || null)
      setTaskData(graphPayload.task_data_json || null)

      const snapshots = replay.snapshots || detail.snapshots_json || []
      loadSnapshots(snapshots)
      if (snapshots.length > 0) {
        setDone(snapshots.length - 1, true)
      }
      setMockMode(false)
      onClose()
    } catch (err) {
      setError(err)
    } finally {
      setActionKey(null)
    }
  }, [
    fetchJson,
    loadSnapshots,
    onClose,
    setActiveDatasetContext,
    setActiveProjectContext,
    setDone,
    setGraphData,
    setGroundTruth,
    setHyperparams,
    setMockMode,
    setTask,
    setTaskData,
  ])

  const handleSaveMetadata = useCallback(async (nextIsBest = selectedDetail?.is_best) => {
    if (!selectedExperimentId) return
    setSaveLoading(true)
    setError(null)
    try {
      await fetchJson(`/experiments/${selectedExperimentId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: titleDraft,
          notes: notesDraft,
          is_best: !!nextIsBest,
        }),
      })
      await Promise.all([
        fetchHubData(),
        loadSelectedExperiment(selectedExperimentId),
      ])
    } catch (err) {
      setError(err)
    } finally {
      setSaveLoading(false)
    }
  }, [fetchHubData, fetchJson, loadSelectedExperiment, notesDraft, selectedDetail?.is_best, selectedExperimentId, titleDraft])

  const handleExportReport = useCallback(async (format) => {
    if (!selectedReport || !selectedDetail || !selectedExperimentId) return
    try {
      const exportReport = await fetchJson(`/experiments/${selectedExperimentId}/report?track_export=true`)
      setSelectedReport(exportReport)
      const safeTitle = (selectedDetail.title || `experiment-${selectedDetail.id}`)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
      if (format === 'json') {
        downloadTextFile(`${safeTitle || 'experiment-report'}.json`, JSON.stringify(exportReport, null, 2), 'application/json')
        return
      }
      downloadTextFile(`${safeTitle || 'experiment-report'}.md`, buildReportMarkdown(exportReport), 'text/markdown')
    } catch (err) {
      setError(err)
    }
  }, [fetchJson, selectedDetail, selectedExperimentId, selectedReport])

  if (!isOpen) return null

  const isPage = variant === 'page'
  const shellOuterClass = isPage
    ? 'h-full min-h-[720px]'
    : 'fixed inset-0 z-[92] bg-void/80 backdrop-blur-md p-6'
  const shellInnerClass = isPage
    ? 'mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden'
    : 'mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-2xl glass-panel shadow-panel-lg border-line-subtle'

  return (
    <div className={shellOuterClass}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`${shellInnerClass} relative`}
      >
        {/* Nebula glow inside shell (only if modal) */}
        {!isPage && (
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-2xl">
            <div className="absolute -top-20 -left-20 h-64 w-64 rounded-full bg-amethyst/5 blur-3xl" />
            <div className="absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-aurora-blue/5 blur-3xl" />
          </div>
        )}
        {/* ── Header ── */}
        <div className="relative z-10 flex items-center justify-between px-6 pt-6 pb-2">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.28em] text-moonlight">
              <BookOpen size={12} /> Experiment Hub
            </div>
            <h2 className="mt-1 text-xl font-bold text-white-star">Replay, filter & manage runs</h2>
            <p className="mt-1 text-xs text-twilight">
              Review past runs, pin best results, compose reports, and compare metrics side-by-side.
            </p>
          </div>
          {!isPage ? (
            <button
              onClick={onClose}
              className="rounded-xl border border-line-subtle bg-glass p-2.5 text-starlight hover:bg-glass-hover hover:border-line-active transition-colors"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>

        {/* ── Filter Bar ── */}
        <div className="relative z-10 px-6 pb-4 pt-2">
          <div className="flex flex-wrap items-end gap-3 rounded-xl bg-white/5 p-3 shadow-inner shadow-white/5">
            <label className="flex min-w-[220px] flex-1 flex-col gap-1 group">
              <span className="text-[10px] uppercase tracking-[0.16em] text-twilight group-hover:text-accent-amethyst transition-colors">Search</span>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by title, dataset, model, or task..."
                className="input-cosmic text-sm border-transparent bg-black/20 focus:bg-black/40 focus:border-accent-amethyst hover:bg-black/30 transition-all rounded-lg"
              />
            </label>
            <FilterSelect
              label="Project"
              value={filters.projectId}
              onChange={(value) => setFilters((prev) => ({ ...prev, projectId: value }))}
              options={[{ value: '', label: 'All projects' }, ...projects.map((item) => ({ value: String(item.id), label: item.title }))]}
            />
            <FilterSelect
              label="Dataset Version"
              value={filters.datasetVersionId}
              onChange={(value) => setFilters((prev) => ({ ...prev, datasetVersionId: value }))}
              options={[{ value: '', label: 'All versions' }, ...datasets.map((item) => ({ value: String(item.current_version_id || ''), label: `${item.name}${item.current_version_id ? ` • current #${item.current_version_id}` : ''}` }))]}
            />
            <FilterSelect
              label="Task"
              value={filters.taskType}
              onChange={(value) => setFilters((prev) => ({ ...prev, taskType: value }))}
              options={[
                { value: '', label: 'All tasks' },
                { value: '1', label: 'Task 1' },
                { value: '2', label: 'Task 2' },
                { value: '3', label: 'Task 3' },
                { value: '4', label: 'Task 4' },
                { value: '5', label: 'Task 5' },
                { value: '6', label: 'Task 6' },
              ]}
            />
            <FilterSelect
              label="Model"
              value={filters.modelType}
              onChange={(value) => setFilters((prev) => ({ ...prev, modelType: value }))}
              options={[
                { value: '', label: 'All models' },
                { value: 'GCN', label: 'GCN' },
                { value: 'GAT', label: 'GAT' },
                { value: 'SAGE', label: 'SAGE' },
              ]}
            />
            <FilterSelect
              label="Owner"
              value={filters.ownerId}
              onChange={(value) => setFilters((prev) => ({ ...prev, ownerId: value }))}
              options={ownerOptions}
            />
            <FilterSelect
              label="Status"
              value={filters.status}
              onChange={(value) => setFilters((prev) => ({ ...prev, status: value }))}
              options={[
                { value: '', label: 'All statuses' },
                { value: 'completed', label: 'completed' },
                { value: 'running', label: 'running' },
                { value: 'failed', label: 'failed' },
                { value: 'stopped', label: 'stopped' },
              ]}
            />
            <button
              onClick={fetchHubData}
              className="btn-ghost inline-flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 transition-colors"
            >
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        </div>

        {/* ── Two-Pane Layout ── */}
        <div className="relative z-10 grid min-h-0 flex-1 gap-4 xl:grid-cols-[1.1fr_0.9fr] px-6 pb-6">
          {/* ── Left: Experiment List ── */}
          <div className="min-h-0 rounded-2xl bg-black/20 shadow-inner shadow-white/5">
            {loading ? (
              <LoadingState title="Loading experiments..." />
            ) : error && !detailLoading ? (
              <ErrorState title="Failed to load Experiment Hub" error={error} onRetry={fetchHubData} />
            ) : visibleExperiments.length === 0 ? (
              <EmptyState icon={<Filter size={28} />} title="No matching runs" description="Try adjusting filters or save a new experiment." />
            ) : (
              <div className="h-full overflow-auto p-5 space-y-4 custom-scrollbar">
                <AnimatePresence mode="popLayout">
                  {visibleExperiments.map((exp, idx) => {
                    const isSelected = selectedExperimentId === exp.id
                    return (
                      <motion.div
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(idx * 0.05, 0.5) }}
                        key={exp.id}
                        onClick={() => setSelectedExperimentId(exp.id)}
                        className={`group cursor-pointer rounded-2xl p-5 transition-all duration-300 ${
                          isSelected
                            ? 'bg-amethyst/15 shadow-[0_4px_24px_rgba(147,51,234,0.15)] ring-1 ring-amethyst/50 scale-[1.01]'
                            : 'bg-white/5 hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 ring-1 ring-transparent hover:ring-white/10'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-sm font-bold text-white-star">
                              <span className="truncate group-hover:text-white transition-colors">{exp.title}</span>
                              {exp.is_best ? (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-aurora-amber/20 bg-aurora-amber/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-aurora-amber">
                                  <Star size={11} /> Best
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-twilight">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-0.5">
                                Task {exp.task_type}
                              </span>
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-0.5 text-moonlight">
                                {exp.model_type}
                              </span>
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-0.5">
                                {exp.dataset_name}
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <StatusDot status={exp.status} />
                                {exp.status}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <RunChip selected={selectedCompareIds.includes(exp.id)} onClick={(event) => {
                              event.stopPropagation()
                              handleCompareToggle(exp.id)
                            }}
                            >
                              {selectedCompareIds.includes(exp.id) ? 'Selected' : 'Compare'}
                            </RunChip>
                            <button
                              onClick={(event) => {
                                event.stopPropagation()
                                handleReplayLoad(exp.id)
                              }}
                              className="rounded-xl border border-aurora-blue/20 bg-aurora-blue/10 p-2.5 text-aurora-blue hover:bg-aurora-blue/20 transition-all hover:scale-105 active:scale-95"
                              title="Load replay"
                            >
                              {actionKey === `replay-${exp.id}` ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                            </button>
                            <button
                              onClick={(event) => {
                                event.stopPropagation()
                                handleDelete(exp.id)
                              }}
                              className="rounded-xl border border-aurora-rose/20 bg-aurora-rose/10 p-2.5 text-aurora-rose hover:bg-aurora-rose/20 transition-all hover:scale-105 active:scale-95"
                              title="Delete run"
                            >
                              {actionKey === `delete-${exp.id}` ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                            </button>
                          </div>
                        </div>

                        {/* Metrics row */}
                        <div className="mt-4 grid gap-3 text-xs text-starlight md:grid-cols-2 xl:grid-cols-4">
                          <span className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-twilight/80">Acc</span>
                            <span className="font-mono text-white-star bg-white/5 px-1.5 py-0.5 rounded">{(exp.accuracy * 100).toFixed(1)}%</span>
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-twilight/80">Loss</span>
                            <span className="font-mono text-white-star bg-white/5 px-1.5 py-0.5 rounded">{exp.loss.toFixed(4)}</span>
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-twilight/80">Epochs</span>
                            <span className="font-mono text-white-star bg-white/5 px-1.5 py-0.5 rounded">{exp.epoch_count}</span>
                          </span>
                          <span className="flex items-center gap-2 ml-auto xl:ml-0">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-twilight/80">Created</span>
                            <span className="text-moonlight">{formatDateTime(exp.created_at)}</span>
                          </span>
                        </div>

                        {exp.notes ? (
                          <div className="mt-4 rounded-xl border border-line-subtle bg-white/5 px-4 py-3 text-xs text-starlight/90 leading-relaxed italic">
                            "{exp.notes}"
                          </div>
                        ) : null}
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* ── Right: Detail Panels ── */}
          <div className="min-h-0 overflow-auto custom-scrollbar rounded-2xl bg-black/20 p-5 shadow-inner shadow-white/5">
            <div className="space-y-6">
              <Panel
                title="Selected Run"
                subtitle="Pin best run, edit notes, and load replay from one place."
                className="!h-auto !border-transparent !bg-transparent !p-0 !shadow-none"
                actions={
                  selectedDetail ? (
                    <button
                      onClick={() => handleSaveMetadata(!selectedDetail.is_best)}
                      disabled={saveLoading}
                      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95 ${
                        selectedDetail.is_best
                          ? 'border-aurora-amber/30 bg-aurora-amber/15 text-aurora-amber'
                          : 'btn-ghost border-line-subtle'
                      }`}
                    >
                      <Pin size={13} /> {selectedDetail.is_best ? 'Unpin best' : 'Pin best run'}
                    </button>
                  ) : null
                }
              >
                {detailLoading ? (
                  <LoadingState title="Loading run details..." />
                ) : !selectedDetail ? (
                  <EmptyState icon={<Sparkles size={28} className="text-moonlight/40" />} title="No run selected" description="Click a run in the left panel to view notes and report." />
                ) : (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-5"
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      {/* Context card */}
                      <div className="glass-card rounded-2xl p-5 text-sm text-starlight border-transparent bg-white/5 hover:bg-white/10 transition-colors shadow-lg">
                        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-twilight">Context</div>
                        <div className="mt-3 space-y-4">
                          <label className="flex flex-col gap-1.5 group">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-twilight/80 group-hover:text-accent-amethyst transition-colors">Run Title</span>
                            <input
                              value={titleDraft}
                              onChange={(event) => setTitleDraft(event.target.value)}
                              className="input-cosmic text-sm border-transparent bg-black/30 focus:bg-black/50 focus:ring-1 focus:ring-accent-amethyst hover:bg-black/40 transition-all rounded-lg"
                            />
                          </label>
                          <div className="space-y-2 text-xs">
                            <div className="flex items-center gap-2">
                              <span className="text-twilight/70">Task</span>
                              <span className="text-white-star font-medium">{selectedDetail.task_type}</span>
                              <span className="text-line-subtle mx-1">/</span>
                              <span className="text-moonlight font-medium">{selectedDetail.model_type}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-twilight/70">Dataset</span>
                              <span className="text-white-star font-medium">#{selectedDetail.dataset_version_id || 'n/a'}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Result card */}
                      <div className="glass-card rounded-2xl p-5 text-sm text-starlight border-transparent bg-white/5 hover:bg-white/10 transition-colors shadow-lg">
                        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-twilight">Result Metrics</div>
                        <div className="mt-3 space-y-3 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-twilight/70">Best epoch</span>
                            <span className="font-mono text-white-star bg-white/5 px-2 py-0.5 rounded">{selectedDetail.best_epoch}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-twilight/70">Accuracy</span>
                            <span className="font-mono text-emerald-400 font-bold bg-emerald-400/10 px-2 py-0.5 rounded">{(selectedDetail.accuracy * 100).toFixed(1)}%</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-twilight/70">Loss</span>
                            <span className="font-mono text-aurora-pink bg-aurora-pink/10 px-2 py-0.5 rounded">{selectedDetail.loss.toFixed(4)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-twilight/70">State</span>
                            <span className="text-white-star font-medium uppercase tracking-wider">{selectedDetail.retention_state}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Research Notes */}
                    <div className="group">
                      <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.2em] text-twilight group-hover:text-accent-amethyst transition-colors">Research Notes</div>
                      <textarea
                        value={notesDraft}
                        onChange={(event) => setNotesDraft(event.target.value)}
                        rows={4}
                        placeholder="Record hypotheses, approaches tried, or next steps for this run..."
                        className="input-cosmic w-full text-sm leading-relaxed border-transparent bg-white/5 focus:bg-black/30 focus:ring-1 focus:ring-accent-amethyst hover:bg-white/10 transition-all resize-none rounded-xl"
                      />
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => handleSaveMetadata(selectedDetail.is_best)}
                        disabled={saveLoading}
                        className="btn-galaxy inline-flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-50 hover:scale-[1.02] active:scale-95 transition-all shadow-glow-sm"
                      >
                        {saveLoading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save changes
                      </button>
                      <button
                        onClick={() => handleReplayLoad(selectedDetail.id)}
                        className="btn-nebula inline-flex items-center gap-2 px-5 py-2.5 text-sm border-line-subtle hover:border-accent-amethyst transition-all hover:scale-[1.02] active:scale-95"
                      >
                        <Play size={16} /> Load replay
                      </button>
                    </div>
                  </motion.div>
                )}
              </Panel>

              {/* ── Report Panel ── */}
              <Panel
                title="Report Analysis"
                subtitle="Summary metrics, dataset version, and replay meta-link."
                className="!h-auto !border-transparent !bg-transparent !p-0 !shadow-none mt-6"
                actions={
                  selectedReport ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleExportReport('json')}
                        className="btn-ghost inline-flex items-center gap-2 px-3 py-2 text-xs border border-transparent hover:border-line-subtle transition-all"
                      >
                        <FileText size={13} /> JSON
                      </button>
                      <button
                        onClick={() => handleExportReport('markdown')}
                        className="inline-flex items-center gap-2 rounded-xl border border-aurora-green/20 bg-aurora-green/10 px-3 py-2 text-xs font-semibold text-aurora-green hover:bg-aurora-green/20 transition-all"
                      >
                        <FileText size={13} /> Markdown
                      </button>
                    </div>
                  ) : null
                }
              >
                {detailLoading ? (
                  <LoadingState title="Building report..." />
                ) : !selectedReport ? (
                  <EmptyState icon={<FileText size={28} className="text-moonlight/40" />} title="No report available" description="Select a run to let the backend compose the report payload." />
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-5 text-sm text-starlight"
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="glass-card rounded-2xl p-5 border-transparent bg-white/5 hover:bg-white/10 transition-colors shadow-lg">
                        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-twilight">Metrics Summary</div>
                        <div className="mt-3 space-y-2.5 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-twilight/70">Primary metric</span>
                            <span className="text-white-star font-medium">{selectedReport.summary?.primary_metric}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-twilight/70">Best epoch</span>
                            <span className="font-mono text-white-star bg-white/5 px-2 py-0.5 rounded">{selectedReport.summary?.best_epoch}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-twilight/70">Score</span>
                            <span className="font-mono text-aurora-blue font-bold bg-aurora-blue/10 px-2 py-0.5 rounded">{Number(selectedReport.summary?.best_score || 0).toFixed(4)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="glass-card rounded-2xl p-5 border-transparent bg-white/5 hover:bg-white/10 transition-colors shadow-lg">
                        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-twilight">Dataset Context</div>
                        <div className="mt-3 space-y-2.5 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-twilight/70">Name</span>
                            <span className="text-white-star font-medium truncate ml-2">{selectedReport.experiment?.dataset_record_name || selectedReport.experiment?.dataset_name}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-twilight/70">Version</span>
                            <span className="font-mono text-white-star bg-white/5 px-2 py-0.5 rounded">v{selectedReport.dataset_version?.version ?? 'n/a'}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-twilight/70">Lifecycle</span>
                            <span className="text-white-star font-medium uppercase tracking-wider">{selectedReport.dataset_version?.lifecycle || 'unknown'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Next Action highlight */}
                    <div className="rounded-2xl border-transparent bg-amethyst/10 p-5 shadow-[0_4px_20px_rgba(147,51,234,0.15)] ring-1 ring-amethyst/30 hover:bg-amethyst/15 hover:-translate-y-0.5 transition-all">
                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-amethyst">
                        <Sparkles size={12} /> Recommended Action
                      </div>
                      <div className="mt-3 text-sm text-white-star leading-relaxed font-medium">{selectedReport.next_action}</div>
                    </div>

                    {/* Config Snapshot */}
                    <div className="glass-card rounded-2xl p-5 border-transparent bg-black/40 shadow-inner overflow-hidden">
                      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-twilight">Configuration Snapshot</div>
                      <pre className="mt-3 overflow-auto rounded-xl bg-void/50 p-4 text-[11px] text-starlight/80 font-mono max-h-48 border border-white/5 custom-scrollbar">
                        {JSON.stringify(selectedReport.config || {}, null, 2)}
                      </pre>
                    </div>
                  </motion.div>
                )}
              </Panel>

              {/* ── Compare Panel ── */}
              <Panel
                title="Metrics Comparison"
                subtitle="Select 2–4 runs to visualize learning curves side-by-side."
                className="!h-auto !border-transparent !bg-transparent !p-0 !shadow-none mt-6"
                actions={
                  <button
                    onClick={handleCompare}
                    disabled={selectedCompareIds.length < 2 || compareLoading}
                    className="inline-flex items-center gap-2 rounded-xl border border-aurora-green/20 bg-aurora-green/10 px-4 py-2 text-xs font-bold text-aurora-green hover:bg-aurora-green/20 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-30 disabled:hover:scale-100"
                  >
                    <BarChart3 size={14} /> Compare Metrics
                  </button>
                }
              >
                {compareLoading ? (
                  <LoadingState title="Analyzing comparison data..." />
                ) : compareResults.length === 0 ? (
                  <EmptyState
                    icon={<CheckCircle2 size={28} className="text-moonlight/40" />}
                    title="Comparison ready"
                    description="Select at least 2 runs from the left panel, then trigger the comparison."
                  />
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-6"
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      {compareResults.map((item, index) => (
                        <div key={item.experiment.id} className="glass-card rounded-2xl p-4 text-xs text-starlight border-transparent bg-white/5 hover:bg-white/10 transition-colors shadow-lg">
                          <div className="flex items-center gap-2.5">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full shadow-lg"
                              style={{ backgroundColor: COMPARE_COLORS[index % COMPARE_COLORS.length] }}
                            />
                            <span className="font-bold text-white-star truncate">{item.experiment.title}</span>
                          </div>
                          <div className="mt-3 space-y-1.5 opacity-80">
                            <div className="flex items-center justify-between">
                              <span className="text-twilight">Model</span>
                              <span className="text-moonlight font-medium">{item.experiment.model_type}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-twilight">Best score</span>
                              <span className="font-mono text-aurora-blue font-bold">{Number(item.metrics?.best_score || 0).toFixed(4)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Chart */}
                    <div className="h-[300px] w-full rounded-2xl border border-transparent glass-card p-4 bg-white/5 shadow-lg">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={compareSeries}>
                          <CartesianGrid stroke="rgba(139,92,246,0.05)" strokeDasharray="4 4" vertical={false} />
                          <XAxis 
                            dataKey="epoch" 
                            stroke="#7c6faa" 
                            fontSize={10} 
                            tickLine={false} 
                            axisLine={false} 
                            dy={10}
                          />
                          <YAxis 
                            stroke="#7c6faa" 
                            fontSize={10} 
                            tickLine={false} 
                            axisLine={false} 
                            dx={-5}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'rgba(5,2,16,0.95)',
                              border: '1px solid rgba(139,92,246,0.2)',
                              borderRadius: '16px',
                              color: '#c4b5fd',
                              fontSize: '12px',
                              backdropFilter: 'blur(16px)',
                              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                            }}
                            itemStyle={{ padding: '2px 0' }}
                          />
                          <Legend
                            wrapperStyle={{ fontSize: '11px', color: '#c4b5fd', paddingTop: '20px' }}
                            iconType="circle"
                          />
                          {compareResults.map((item, index) => (
                            <Line
                              key={item.experiment.id}
                              type="monotone"
                              dataKey={`run_${index}`}
                              name={item.experiment.title}
                              stroke={COMPARE_COLORS[index % COMPARE_COLORS.length]}
                              strokeWidth={3}
                              dot={false}
                              connectNulls
                              activeDot={{ r: 6, strokeWidth: 0, shadowBlur: 10 }}
                              animationDuration={1500}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </motion.div>
                )}
              </Panel>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
