import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, CheckCircle2, PencilLine, Save, Sparkles, Trash2, Trophy, Waves, X } from 'lucide-react'
import EmptyState from '../../components/primitives/EmptyState'
import ErrorState from '../../components/primitives/ErrorState'
import LoadingState from '../../components/primitives/LoadingState'
import { apiJson, normalizeCollectionPayload } from '../../utils/api'
import { AdminListToolbar, AdminPagination, buildAdminListPath } from './AdminListControls'
import { SectionCard } from '../shared/PageBlocks'

const STATUS_COLORS = {
  completed: 'bg-aurora-green',
  running: 'bg-amethyst',
  failed: 'bg-aurora-rose',
  queued: 'bg-aurora-amber',
}
const STATUS_OPTIONS = ['', 'completed', 'running', 'failed', 'queued', 'pending', 'stopped']

export default function AdminExperimentsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [items, setItems] = useState([])
  const [drafts, setDrafts] = useState({})
  const [editingId, setEditingId] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [busyKey, setBusyKey] = useState(null)
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
      const payload = await apiJson(buildAdminListPath('/admin/experiments', filters))
      const normalized = normalizeCollectionPayload(payload)
      const nextItems = normalized.items
      setItems(nextItems)
      setMeta({
        total: normalized.total,
        page: normalized.page,
        page_size: normalized.page_size,
      })
      setDrafts(
        Object.fromEntries(
          nextItems.map((item) => [
            item.id,
            {
              title: item.title || '',
              notes: item.notes || '',
              is_best: Boolean(item.is_best),
            },
          ])
        )
      )
      setSelectedIds((prev) => prev.filter((id) => nextItems.some((item) => item.id === id)))
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    load()
  }, [load])

  const handleSave = useCallback(async (experimentId) => {
    try {
      setBusyKey(`save-${experimentId}`)
      const draft = drafts[experimentId]
      await apiJson(`/experiments/${experimentId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: draft?.title,
          notes: draft?.notes,
          is_best: draft?.is_best,
        }),
      })
      setEditingId(null)
      await load()
    } catch (err) {
      setError(err)
    } finally {
      setBusyKey(null)
    }
  }, [drafts, load])

  const handleDelete = useCallback(async (experimentId, title) => {
    const confirmed = window.confirm(`Delete experiment "${title}"?`)
    if (!confirmed) return
    try {
      setBusyKey(`delete-${experimentId}`)
      await apiJson(`/experiments/${experimentId}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err)
    } finally {
      setBusyKey(null)
    }
  }, [load])

  const handleBulkDelete = useCallback(async () => {
    if (!selectedIds.length) return
    const confirmed = window.confirm(`Delete ${selectedIds.length} selected experiment(s)?`)
    if (!confirmed) return
    try {
      setBusyKey('bulk-delete')
      await apiJson('/experiments/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ experiment_ids: selectedIds }),
      })
      await load()
      setSelectedIds([])
    } catch (err) {
      setError(err)
    } finally {
      setBusyKey(null)
    }
  }, [load, selectedIds])

  const openEdit = useCallback((item) => {
    setDrafts((prev) => ({
      ...prev,
      [item.id]: {
        title: item.title || '',
        notes: item.notes || '',
        is_best: Boolean(item.is_best),
      },
    }))
    setEditingId(item.id)
  }, [])

  const cancelEdit = useCallback((item) => {
    setDrafts((prev) => ({
      ...prev,
      [item.id]: {
        title: item.title || '',
        notes: item.notes || '',
        is_best: Boolean(item.is_best),
      },
    }))
    setEditingId((current) => (current === item.id ? null : current))
  }, [])

  if (loading) {
    return <LoadingState title="Loading experiments..." className="min-h-[480px]" />
  }

  if (error && items.length === 0) {
    return <ErrorState title="Could not load experiments" error={error} onRetry={load} className="min-h-[480px]" />
  }

  return (
    <SectionCard
      title="Experiment Governance"
      subtitle="Review run status, retention state, edit metadata, or remove stale runs from the admin shell."
      actions={
        <button
          type="button"
          onClick={handleBulkDelete}
          disabled={!selectedIds.length || busyKey === 'bulk-delete'}
          className="admin-action-pill admin-action-pill-danger"
        >
          <Trash2 size={14} />
          {busyKey === 'bulk-delete' ? 'Deleting...' : `Delete Selected${selectedIds.length ? ` (${selectedIds.length})` : ''}`}
        </button>
      }
    >
      <AdminListToolbar
        searchValue={filters.q}
        onSearchChange={(value) => setFilters((prev) => ({ ...prev, q: value, page: 1 }))}
        searchPlaceholder="Search by title, dataset, model, notes, status"
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
            <div key={item.id} className={`glass-card admin-record-card ${editingId === item.id ? 'admin-record-card-editing' : ''}`}>
              <div className="admin-record-header">
                <div className="admin-record-copy space-y-3">
                  {editingId === item.id ? (
                    <div className="admin-edit-banner">
                      <Sparkles size={13} />
                      Editing experiment
                    </div>
                  ) : null}
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={(event) =>
                        setSelectedIds((prev) =>
                          event.target.checked
                            ? [...prev, item.id]
                            : prev.filter((value) => value !== item.id)
                        )
                      }
                    />
                    <div className="text-base font-semibold text-white-star">{item.title}</div>
                  </div>
                  <div className="text-sm text-twilight">
                    {item.task_type} - {item.model_type} - {item.dataset_name}
                  </div>
                  <div className="text-sm text-twilight">{item.notes || 'No notes'}</div>
                </div>
                {editingId === item.id ? (
                  <div className="admin-card-actions">
                    <label className="admin-checkbox-chip">
                      <input
                        type="checkbox"
                        checked={Boolean(drafts[item.id]?.is_best)}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [item.id]: {
                              ...(prev[item.id] || {}),
                              is_best: event.target.checked,
                            },
                          }))
                        }
                      />
                      Best run
                    </label>
                    <button
                      type="button"
                      onClick={() => cancelEdit(item)}
                      className="admin-action-pill admin-action-pill-subtle"
                    >
                      <X size={14} />
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSave(item.id)}
                      disabled={busyKey === `save-${item.id}`}
                      className="admin-action-pill admin-action-pill-primary"
                    >
                      <Save size={14} />
                      {busyKey === `save-${item.id}` ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                ) : (
                  <div className="admin-card-actions">
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      className="admin-action-pill"
                    >
                      <PencilLine size={14} />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id, item.title)}
                      disabled={busyKey === `delete-${item.id}`}
                      className="admin-action-pill admin-action-pill-danger"
                    >
                      <Trash2 size={14} />
                      {busyKey === `delete-${item.id}` ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                )}
              </div>
              {editingId === item.id ? (
                <div className="admin-edit-shell">
                  <input
                    value={drafts[item.id]?.title || ''}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: {
                          ...(prev[item.id] || {}),
                          title: event.target.value,
                        },
                      }))
                    }
                    className="input-cosmic w-full"
                    placeholder="Experiment title"
                  />
                  <textarea
                    value={drafts[item.id]?.notes || ''}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: {
                          ...(prev[item.id] || {}),
                          notes: event.target.value,
                        },
                      }))
                    }
                    rows={3}
                    className="input-cosmic w-full resize-none"
                    placeholder="Notes"
                  />
                </div>
              ) : null}
              <div className="admin-metadata-grid">
                <div className="admin-metadata-item">
                  <CalendarDays size={14} className="text-moonlight" />
                  <span>Epochs <strong>{item.epoch_count}</strong></span>
                </div>
                <div className="admin-metadata-item">
                  <Trophy size={14} className="text-aurora-cyan" />
                  <span>Best <strong>{item.best_epoch}</strong></span>
                </div>
                <div className="admin-metadata-item">
                  <span className={`h-2 w-2 rounded-full ${STATUS_COLORS[item.status] || 'bg-twilight'}`} />
                  <span>Status <strong>{item.status}</strong></span>
                </div>
                <div className="admin-metadata-item">
                  <Waves size={14} className="text-aurora-amber" />
                  <span>Retention <strong>{item.retention_state}</strong></span>
                </div>
                <div className="admin-metadata-item">
                  <CheckCircle2 size={14} className={item.is_best ? 'text-aurora-green' : 'text-moonlight'} />
                  <span>Flagged <strong>{item.is_best ? 'Best run' : 'Standard'}</strong></span>
                </div>
              </div>
            </div>
          ))}
          {error ? <div className="text-sm text-aurora-rose">{error.message}</div> : null}
        </div>
      ) : (
        <EmptyState title="No experiments found" description="Saved experiments will appear here once runs complete and persist into the hybrid store." />
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
