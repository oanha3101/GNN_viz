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
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import useAuthStore from '../../store/authStore'
import { apiUrl, normalizeCollectionPayload } from '../../utils/api'
import Panel from '../primitives/Panel'
import LoadingState from '../primitives/LoadingState'
import ErrorState from '../primitives/ErrorState'
import EmptyState from '../primitives/EmptyState'

const COLORS = ['#22d3ee', '#a78bfa', '#f59e0b', '#34d399']

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="flex min-w-[150px] flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 outline-none"
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
          ? 'border-cyan-500/30 bg-cyan-500/12 text-cyan-300'
          : 'border-slate-700 bg-slate-900/60 text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  )
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
  return parsed.toLocaleString('vi-VN')
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
      { value: '', label: 'Tất cả owner' },
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
    : 'fixed inset-0 z-[92] bg-slate-950/88 backdrop-blur-sm p-6'
  const shellInnerClass = isPage
    ? 'mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-[28px] border border-slate-700/50 bg-[#071120] shadow-2xl'
    : 'mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-[28px] border border-slate-700/50 bg-[#071120] shadow-2xl'

  return (
    <div className={shellOuterClass}>
      <div className={shellInnerClass}>
        <div className="flex items-center justify-between border-b border-slate-800/70 px-6 py-5">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.28em] text-cyan-300/80">
              <BookOpen size={12} /> Experiment Hub
            </div>
            <h2 className="mt-1 text-xl font-semibold text-white">Replay, filter và manage runs</h2>
            <p className="mt-1 text-sm text-slate-400">
              Luồng mới đọc replay qua hybrid API, thêm notes, pin best run và report v1 nhưng vẫn giữ ProjectLibrary cũ làm fallback.
            </p>
          </div>
          {!isPage ? (
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-700/40 bg-slate-900/70 p-2.5 text-slate-300 hover:bg-slate-800/80"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>

        <div className="border-b border-slate-800/60 px-6 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[220px] flex-1 flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Search</span>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Tìm theo title, dataset, model hoặc task"
                className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 outline-none"
              />
            </label>
            <FilterSelect
              label="Project"
              value={filters.projectId}
              onChange={(value) => setFilters((prev) => ({ ...prev, projectId: value }))}
              options={[{ value: '', label: 'Tất cả project' }, ...projects.map((item) => ({ value: String(item.id), label: item.title }))]}
            />
            <FilterSelect
              label="Dataset Version"
              value={filters.datasetVersionId}
              onChange={(value) => setFilters((prev) => ({ ...prev, datasetVersionId: value }))}
              options={[{ value: '', label: 'Tất cả version' }, ...datasets.map((item) => ({ value: String(item.current_version_id || ''), label: `${item.name}${item.current_version_id ? ` • current #${item.current_version_id}` : ''}` }))]}
            />
            <FilterSelect
              label="Task"
              value={filters.taskType}
              onChange={(value) => setFilters((prev) => ({ ...prev, taskType: value }))}
              options={[
                { value: '', label: 'Tất cả task' },
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
                { value: '', label: 'Tất cả model' },
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
                { value: '', label: 'Tất cả trạng thái' },
                { value: 'completed', label: 'completed' },
                { value: 'running', label: 'running' },
                { value: 'failed', label: 'failed' },
                { value: 'stopped', label: 'stopped' },
              ]}
            />
            <button
              onClick={fetchHubData}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-cyan-300"
            >
              <RefreshCw size={13} /> Làm mới
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="min-h-0 border-r border-slate-800/60">
            {loading ? (
              <LoadingState title="Đang tải danh sách runs..." />
            ) : error && !detailLoading ? (
              <ErrorState title="Không tải được Experiment Hub" error={error} onRetry={fetchHubData} />
            ) : visibleExperiments.length === 0 ? (
              <EmptyState icon={<Filter size={28} />} title="Không có run phù hợp" description="Thử đổi filter hoặc lưu thêm experiment mới." />
            ) : (
              <div className="h-full overflow-auto p-5 space-y-3">
                {visibleExperiments.map((exp) => {
                  const isSelected = selectedExperimentId === exp.id
                  return (
                    <div
                      key={exp.id}
                      onClick={() => setSelectedExperimentId(exp.id)}
                      className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                        isSelected
                          ? 'border-cyan-500/30 bg-cyan-500/8'
                          : 'border-slate-800/70 bg-slate-950/50 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-semibold text-white">
                            <span>{exp.title}</span>
                            {exp.is_best ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300">
                                <Star size={11} /> Best
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-400">
                            <span>Task {exp.task_type}</span>
                            <span>{exp.model_type}</span>
                            <span>{exp.dataset_name}</span>
                            <span>{exp.status}</span>
                            <span>retention: {exp.retention_state}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <RunChip selected={selectedCompareIds.includes(exp.id)} onClick={(event) => {
                            event.stopPropagation()
                            handleCompareToggle(exp.id)
                          }}
                          >
                            {selectedCompareIds.includes(exp.id) ? 'Đã chọn compare' : 'Chọn compare'}
                          </RunChip>
                          <button
                            onClick={(event) => {
                              event.stopPropagation()
                              handleReplayLoad(exp.id)
                            }}
                            className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-2 text-cyan-300"
                            title="Tải replay"
                          >
                            {actionKey === `replay-${exp.id}` ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                          </button>
                          <button
                            onClick={(event) => {
                              event.stopPropagation()
                              handleDelete(exp.id)
                            }}
                            className="rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-red-300"
                            title="Xóa run"
                          >
                            {actionKey === `delete-${exp.id}` ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-slate-400 md:grid-cols-2 xl:grid-cols-4">
                        <span>Acc: {(exp.accuracy * 100).toFixed(1)}%</span>
                        <span>Loss: {exp.loss.toFixed(4)}</span>
                        <span>Epochs: {exp.epoch_count}</span>
                        <span>Created: {formatDateTime(exp.created_at)}</span>
                      </div>
                      {exp.notes ? (
                        <div className="mt-3 rounded-xl border border-slate-800/70 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
                          {exp.notes}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="min-h-0 overflow-auto p-5">
            <div className="space-y-5">
              <Panel
                title="Selected Run"
                subtitle="Ghi chú nghiên cứu, pin best run và tải replay từ cùng một panel."
                className="!h-auto"
                actions={
                  selectedDetail ? (
                    <button
                      onClick={() => handleSaveMetadata(!selectedDetail.is_best)}
                      disabled={saveLoading}
                      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
                        selectedDetail.is_best
                          ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
                          : 'border-slate-700/60 bg-slate-900/60 text-slate-200'
                      }`}
                    >
                      <Pin size={13} /> {selectedDetail.is_best ? 'Bỏ pin best' : 'Pin best run'}
                    </button>
                  ) : null
                }
              >
                {detailLoading ? (
                  <LoadingState title="Đang tải chi tiết run..." />
                ) : !selectedDetail ? (
                  <EmptyState icon={<Sparkles size={28} />} title="Chưa chọn run" description="Bấm vào một run ở cột trái để xem notes và report." />
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4 text-sm text-slate-300">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Context</div>
                        <div className="mt-2 space-y-3">
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Run Title</span>
                            <input
                              value={titleDraft}
                              onChange={(event) => setTitleDraft(event.target.value)}
                              className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none"
                            />
                          </label>
                          <div className="space-y-1">
                          <div>Task {selectedDetail.task_type} • {selectedDetail.model_type}</div>
                          <div>Dataset version #{selectedDetail.dataset_version_id || 'n/a'}</div>
                          <div>Created: {formatDateTime(selectedDetail.created_at)}</div>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4 text-sm text-slate-300">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Result</div>
                        <div className="mt-2 space-y-1">
                          <div>Best epoch: <span className="text-white">{selectedDetail.best_epoch}</span></div>
                          <div>Accuracy: <span className="text-white">{(selectedDetail.accuracy * 100).toFixed(1)}%</span></div>
                          <div>Loss: <span className="text-white">{selectedDetail.loss.toFixed(4)}</span></div>
                          <div>Retention: <span className="text-white">{selectedDetail.retention_state}</span></div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Research Notes</div>
                      <textarea
                        value={notesDraft}
                        onChange={(event) => setNotesDraft(event.target.value)}
                        rows={5}
                        placeholder="Ghi lại giả thuyết, điều đã thử, hoặc bước tiếp theo cho run này..."
                        className="w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-slate-200 outline-none"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleSaveMetadata(selectedDetail.is_best)}
                        disabled={saveLoading}
                        className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-300 disabled:opacity-50"
                      >
                        {saveLoading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Lưu notes
                      </button>
                      <button
                        onClick={() => handleReplayLoad(selectedDetail.id)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-200"
                      >
                        <Play size={14} /> Load replay
                      </button>
                    </div>
                  </div>
                )}
              </Panel>

              <Panel
                title="Report v1"
                subtitle="Summary metrics, config, dataset version, replay link, notes và next action."
                className="!h-auto"
                actions={
                  selectedReport ? (
                    <>
                      <button
                        onClick={() => handleExportReport('json')}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-200"
                      >
                        <FileText size={13} /> JSON
                      </button>
                      <button
                        onClick={() => handleExportReport('markdown')}
                        className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300"
                      >
                        <FileText size={13} /> Markdown
                      </button>
                    </>
                  ) : null
                }
              >
                {detailLoading ? (
                  <LoadingState title="Đang dựng report..." />
                ) : !selectedReport ? (
                  <EmptyState icon={<FileText size={28} />} title="Chưa có report" description="Chọn một run để backend compose report payload." />
                ) : (
                  <div className="space-y-4 text-sm text-slate-300">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Summary</div>
                        <div className="mt-2 space-y-1">
                          <div>Primary metric: <span className="text-white">{selectedReport.summary?.primary_metric}</span></div>
                          <div>Best epoch: <span className="text-white">{selectedReport.summary?.best_epoch}</span></div>
                          <div>Best score: <span className="text-white">{Number(selectedReport.summary?.best_score || 0).toFixed(4)}</span></div>
                          <div>Replay endpoint: <span className="font-mono text-cyan-300">{selectedReport.replay?.api_path}</span></div>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Dataset Version</div>
                        <div className="mt-2 space-y-1">
                          <div>Name: <span className="text-white">{selectedReport.experiment?.dataset_record_name || selectedReport.experiment?.dataset_name}</span></div>
                          <div>Version: <span className="text-white">{selectedReport.dataset_version?.version ?? 'n/a'}</span></div>
                          <div>Lifecycle: <span className="text-white">{selectedReport.dataset_version?.lifecycle || 'unknown'}</span></div>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-cyan-500/12 bg-cyan-500/6 p-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-cyan-300/80">Next Action</div>
                      <div className="mt-2 text-white">{selectedReport.next_action}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Config Snapshot</div>
                      <pre className="mt-2 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-300">
                        {JSON.stringify(selectedReport.config || {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </Panel>

              <Panel
                title="Compare Runs"
                subtitle="Chọn 2-4 runs để so sánh metrics summary từ Mongo summary documents."
                className="!h-auto"
                actions={
                  <button
                    onClick={handleCompare}
                    disabled={selectedCompareIds.length < 2 || compareLoading}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 disabled:opacity-50"
                  >
                    <BarChart3 size={13} /> So sánh
                  </button>
                }
              >
                {compareLoading ? (
                  <LoadingState title="Đang so sánh runs..." />
                ) : compareResults.length === 0 ? (
                  <EmptyState
                    icon={<CheckCircle2 size={28} />}
                    title="Chưa có compare view"
                    description="Chọn ít nhất 2 run ở panel bên trái rồi bấm So sánh."
                  />
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      {compareResults.map((item, index) => (
                        <div key={item.experiment.id} className="rounded-xl border border-slate-800/70 bg-slate-950/60 p-3 text-xs text-slate-300">
                          <div className="flex items-center gap-2">
                            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                            <span className="font-semibold text-white">{item.experiment.title}</span>
                          </div>
                          <div className="mt-2 grid gap-1 text-slate-400">
                            <span>Model: {item.experiment.model_type}</span>
                            <span>Dataset: {item.experiment.dataset_name}</span>
                            <span>Best epoch: {item.experiment.best_epoch}</span>
                            <span>Best score: {Number(item.metrics?.best_score || 0).toFixed(4)}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="h-[280px] w-full rounded-2xl border border-slate-800/70 bg-slate-950/50 p-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={compareSeries}>
                          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                          <XAxis dataKey="epoch" stroke="#64748b" fontSize={11} />
                          <YAxis stroke="#64748b" fontSize={11} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#020617', border: '1px solid #334155', color: '#e2e8f0' }}
                          />
                          <Legend />
                          {compareResults.map((item, index) => (
                            <Line
                              key={item.experiment.id}
                              type="monotone"
                              dataKey={`run_${index}`}
                              name={item.experiment.title}
                              stroke={COLORS[index % COLORS.length]}
                              strokeWidth={2}
                              dot={false}
                              connectNulls
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </Panel>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
