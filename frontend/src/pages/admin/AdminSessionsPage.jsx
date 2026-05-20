import { Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import EmptyState from '../../components/primitives/EmptyState'
import ErrorState from '../../components/primitives/ErrorState'
import LoadingState from '../../components/primitives/LoadingState'
import { apiJson, normalizeCollectionPayload } from '../../utils/api'
import { AdminListToolbar, AdminPagination, buildAdminListPath } from './AdminListControls'
import { SectionCard } from '../shared/PageBlocks'

const STATUS_COLORS = {
  running: 'bg-amethyst',
  completed: 'bg-aurora-green',
  failed: 'bg-aurora-rose',
  stopped: 'bg-aurora-amber',
  queued: 'bg-aurora-blue',
}
const STATUS_OPTIONS = ['', 'running', 'completed', 'failed', 'stopped', 'queued', 'pending']

export default function AdminSessionsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [items, setItems] = useState([])
  const [pendingSessionId, setPendingSessionId] = useState(null)
  const [filters, setFilters] = useState({
    q: '',
    status: '',
    date_from: '',
    date_to: '',
    page: 1,
    page_size: 12,
  })
  const [meta, setMeta] = useState({ total: 0, page: 1, page_size: 12 })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await apiJson(buildAdminListPath('/admin/sessions', filters))
      const normalized = normalizeCollectionPayload(payload)
      setItems(normalized.items)
      setMeta({
        total: normalized.total,
        page: normalized.page,
        page_size: normalized.page_size,
      })
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [filters])

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

  if (loading) {
    return <LoadingState title="Loading sessions..." className="min-h-[480px]" />
  }

  if (error && items.length === 0) {
    return <ErrorState title="Could not load sessions" error={error} onRetry={load} className="min-h-[480px]" />
  }

  return (
    <SectionCard
      title="Session Monitor"
      subtitle="Stop, retry, or delete historical sessions without touching the database or the server console."
    >
      <AdminListToolbar
        searchValue={filters.q}
        onSearchChange={(value) => setFilters((prev) => ({ ...prev, q: value, page: 1 }))}
        searchPlaceholder="Search by session id, dataset, model, status, error"
        dateFrom={filters.date_from}
        dateTo={filters.date_to}
        onDateFromChange={(value) => setFilters((prev) => ({ ...prev, date_from: value, page: 1 }))}
        onDateToChange={(value) => setFilters((prev) => ({ ...prev, date_to: value, page: 1 }))}
        onPageSizeChange={(value) => setFilters((prev) => ({ ...prev, page_size: value, page: 1 }))}
        onRefresh={load}
        onClear={() => setFilters({ q: '', status: '', date_from: '', date_to: '', page: 1, page_size: meta.page_size || 12 })}
        pageSize={filters.page_size}
        showDateFilters
        extraControls={
          <select
            value={filters.status}
            onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value, page: 1 }))}
            className="input-cosmic text-sm"
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status || 'all'} value={status}>
                {status || 'All statuses'}
              </option>
            ))}
          </select>
        }
      />
      {items.length ? (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} data-testid={`admin-session-${item.id}`} className="glass-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${STATUS_COLORS[item.status] || 'bg-twilight'}`} />
                    <span className="text-base font-semibold text-white-star font-mono text-sm">{item.id}</span>
                  </div>
                  <div className="mt-1 text-sm text-twilight">
                    {item.task_type} • {item.model_type} • {item.dataset_name}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    data-testid={`admin-session-stop-${item.id}`}
                    onClick={() => handleAction(item.id, 'stop')}
                    disabled={pendingSessionId === item.id}
                    className="rounded-lg border border-aurora-rose/20 bg-aurora-rose/[0.08] px-3 py-2 text-xs font-semibold text-aurora-rose transition-all hover:bg-aurora-rose/[0.15] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Stop
                  </button>
                  <button
                    type="button"
                    data-testid={`admin-session-retry-${item.id}`}
                    onClick={() => handleAction(item.id, 'retry')}
                    disabled={pendingSessionId === item.id}
                    className="rounded-lg border border-aurora-green/20 bg-aurora-green/[0.08] px-3 py-2 text-xs font-semibold text-aurora-green transition-all hover:bg-aurora-green/[0.15] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    disabled={pendingSessionId === item.id}
                    className="inline-flex items-center gap-2 rounded-lg border border-aurora-rose/20 bg-aurora-rose/[0.08] px-3 py-2 text-xs font-semibold text-aurora-rose transition-all hover:bg-aurora-rose/[0.15] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-text-shadow md:grid-cols-2 xl:grid-cols-4">
                <span>Status: <span className="text-starlight">{item.status}</span></span>
                <span>Epoch: <span className="text-starlight">{item.last_epoch}/{item.total_epochs}</span></span>
                <span>Started: <span className="text-starlight">{item.started_at || 'n/a'}</span></span>
                <span className={item.error_message ? 'text-aurora-rose' : ''}>
                  {item.error_message ? `Error: ${item.error_message}` : 'No error'}
                </span>
              </div>
            </div>
          ))}
          {error ? <div className="text-sm text-aurora-rose">{error.message}</div> : null}
        </div>
      ) : (
        <EmptyState title="No sessions found" description="Live and historical training sessions will appear here once they exist." />
      )}
      <AdminPagination
        page={meta.page}
        pageSize={meta.page_size}
        total={meta.total}
        onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
      />
    </SectionCard>
  )
}
