import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Database,
  Hourglass,
  Pause,
  RefreshCw,
  RotateCw,
  Search,
  Trash2,
  Zap,
} from 'lucide-react'
import EmptyState from '../../components/primitives/EmptyState'
import ErrorState from '../../components/primitives/ErrorState'
import LoadingState from '../../components/primitives/LoadingState'
import { apiJson, normalizeCollectionPayload } from '../../utils/api'
import { buildAdminListPath } from './AdminListControls'
import {
  AdminPagination,
  ChipGroup,
  PAGE_SIZE_OPTIONS,
  relativeDate,
} from './AdminPrimitives'

const STATUS_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'stopped', label: 'Stopped' },
  { value: 'queued', label: 'Queued' },
]

const STATUS_TONE = {
  running: 'bg-sky-500/12 text-sky-700 border-sky-500/25 dark:text-sky-300',
  completed: 'bg-emerald-500/12 text-emerald-700 border-emerald-500/25 dark:text-emerald-300',
  failed: 'bg-rose-500/12 text-rose-700 border-rose-500/25 dark:text-rose-300',
  stopped: 'bg-amber-500/12 text-amber-700 border-amber-500/25 dark:text-amber-300',
  queued: 'bg-violet-500/12 text-violet-700 border-violet-500/25 dark:text-violet-300',
  pending: 'bg-slate-500/12 text-slate-700 border-slate-500/25 dark:text-slate-300',
}

export default function AdminSessionsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [items, setItems] = useState([])
  const [pendingSessionId, setPendingSessionId] = useState(null)
  const [filters, setFilters] = useState({
    q: '',
    status: '',
    page: 1,
    page_size: 12,
  })
  const [meta, setMeta] = useState({ total: 0, page: 1, page_size: 12 })

  const apiFilters = useMemo(() => {
    const { status, ...rest } = filters
    const out = { ...rest }
    if (status) out.status = status
    return out
  }, [filters])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await apiJson(buildAdminListPath('/admin/sessions', apiFilters))
      const normalized = normalizeCollectionPayload(payload)
      setItems(normalized.items)
      setMeta({ total: normalized.total, page: normalized.page, page_size: normalized.page_size })
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [apiFilters])

  useEffect(() => {
    load()
  }, [load])

  const handleAction = useCallback(async (sessionId, action) => {
    setPendingSessionId(sessionId)
    try {
      await apiJson(`/admin/sessions/${sessionId}/${action}`, { method: 'POST' })
      await load()
    } catch (err) {
      setError(err)
    } finally {
      setPendingSessionId(null)
    }
  }, [load])

  const handleDelete = useCallback(async (sessionId) => {
    const confirmed = window.confirm(`Delete session "${sessionId}"?`)
    if (!confirmed) return
    setPendingSessionId(sessionId)
    setError(null)
    try {
      await apiJson(`/admin/sessions/${sessionId}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err)
    } finally {
      setPendingSessionId(null)
    }
  }, [load])

  const running = items.filter((s) => (s.status || '').toLowerCase() === 'running').length

  return (
    <div className="space-y-4">
      <header className="admin-list-hero">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="admin-list-hero-icon"><Zap size={18} /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Session Monitor</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-200">{meta.total}</span> total · <span className="font-semibold">{running}</span> running here
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={load} className="admin-btn-secondary"><RefreshCw size={13} /><span className="hidden sm:inline">Refresh</span></button>
          </div>
        </div>
        <div className="admin-filter-strip">
          <label className="admin-search">
            <Search size={13} />
            <input
              value={filters.q}
              onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value, page: 1 }))}
              placeholder="Search by session id, dataset, model..."
              className="admin-search-input"
            />
          </label>
          <ChipGroup
            value={filters.status}
            options={STATUS_OPTIONS}
            onChange={(value) => setFilters((prev) => ({ ...prev, status: value, page: 1 }))}
          />
          <select
            value={filters.page_size}
            onChange={(event) => setFilters((prev) => ({ ...prev, page_size: Number(event.target.value), page: 1 }))}
            className="admin-select"
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option} / page</option>
            ))}
          </select>
        </div>
      </header>

      {loading ? (
        <LoadingState title="Loading sessions..." className="min-h-[320px]" />
      ) : error && items.length === 0 ? (
        <ErrorState title="Could not load sessions" error={error} onRetry={load} className="min-h-[320px]" />
      ) : items.length === 0 ? (
        <div className="admin-card">
          <EmptyState title="No sessions" description="Active and historical training sessions will appear here." />
        </div>
      ) : (
        <div className="admin-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="admin-th admin-th-lead">Session</th>
                  <th className="admin-th">Status</th>
                  <th className="admin-th admin-th-meta">Progress</th>
                  <th className="admin-th">Started</th>
                  <th className="admin-th admin-th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const status = (item.status || '').toLowerCase()
                  return (
                    <tr key={item.id} data-testid={`admin-session-${item.id}`} className="admin-tr">
                      <td className="admin-td">
                        <div className="flex items-start gap-3">
                          <div className="admin-user-cell-avatar"><Zap size={14} /></div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-mono text-xs font-semibold text-slate-900 dark:text-white">{item.id}</span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                              {item.task_type ? <span className="font-semibold">T{item.task_type}</span> : null}
                              {item.model_type ? <span className="font-semibold text-slate-600 dark:text-slate-300">{item.model_type}</span> : null}
                              {item.dataset_name ? (
                                <span className="inline-flex items-center gap-1"><Database size={10} className="opacity-60" />{item.dataset_name}</span>
                              ) : null}
                            </div>
                            {item.error_message ? (
                              <div className="mt-1 inline-flex items-center gap-1 rounded-md border border-rose-400/30 bg-rose-500/[0.08] px-1.5 py-0.5 text-[10px] text-rose-600 dark:text-rose-300">
                                <AlertTriangle size={10} /> {item.error_message}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="admin-td">
                        <span className={`admin-role-pill ${STATUS_TONE[status] || STATUS_TONE.pending}`}>
                          {status === 'running' ? <Hourglass size={11} /> : null}
                          {status || '—'}
                        </span>
                      </td>
                      <td className="admin-td admin-td-meta">
                        <div className="text-xs text-slate-600 dark:text-slate-300">
                          {item.last_epoch ?? 0} / {item.total_epochs ?? '—'} epochs
                        </div>
                      </td>
                      <td className="admin-td">
                        <span className="text-xs text-slate-600 dark:text-slate-300">{relativeDate(item.started_at)}</span>
                      </td>
                      <td className="admin-td admin-td-actions">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            data-testid={`admin-session-stop-${item.id}`}
                            onClick={() => handleAction(item.id, 'stop')}
                            disabled={pendingSessionId === item.id}
                            className="admin-icon-btn"
                            title="Stop session"
                          >
                            <Pause size={13} />
                          </button>
                          <button
                            type="button"
                            data-testid={`admin-session-retry-${item.id}`}
                            onClick={() => handleAction(item.id, 'retry')}
                            disabled={pendingSessionId === item.id}
                            className="admin-icon-btn"
                            title="Retry session"
                          >
                            <RotateCw size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id)}
                            disabled={pendingSessionId === item.id}
                            className="admin-icon-btn admin-icon-btn-danger"
                            title="Delete session"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <AdminPagination
            page={meta.page}
            pageSize={meta.page_size}
            total={meta.total}
            onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
          />
        </div>
      )}
    </div>
  )
}
