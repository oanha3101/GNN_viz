import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Database,
  FlaskConical,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Trophy,
} from 'lucide-react'
import EmptyState from '../../components/primitives/EmptyState'
import ErrorState from '../../components/primitives/ErrorState'
import LoadingState from '../../components/primitives/LoadingState'
import { apiJson, normalizeCollectionPayload } from '../../utils/api'
import { buildAdminListPath } from './AdminListControls'
import {
  AdminPagination,
  ChipGroup,
  FormField,
  PAGE_SIZE_OPTIONS,
  SlideOver,
  relativeDate,
} from './AdminPrimitives'

const STATUS_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'completed', label: 'Completed' },
  { value: 'running', label: 'Running' },
  { value: 'failed', label: 'Failed' },
  { value: 'queued', label: 'Queued' },
]

const STATUS_TONE = {
  completed: 'bg-emerald-500/12 text-emerald-700 border-emerald-500/25 dark:text-emerald-300',
  running: 'bg-sky-500/12 text-sky-700 border-sky-500/25 dark:text-sky-300',
  failed: 'bg-rose-500/12 text-rose-700 border-rose-500/25 dark:text-rose-300',
  queued: 'bg-amber-500/12 text-amber-700 border-amber-500/25 dark:text-amber-300',
  pending: 'bg-slate-500/12 text-slate-700 border-slate-500/25 dark:text-slate-300',
  stopped: 'bg-slate-500/12 text-slate-700 border-slate-500/25 dark:text-slate-300',
}

const RETENTION_TONE = {
  full: 'bg-emerald-500/12 text-emerald-700 border-emerald-500/25 dark:text-emerald-300',
  summary: 'bg-sky-500/12 text-sky-700 border-sky-500/25 dark:text-sky-300',
  archived: 'bg-amber-500/12 text-amber-700 border-amber-500/25 dark:text-amber-300',
  evicted: 'bg-rose-500/12 text-rose-700 border-rose-500/25 dark:text-rose-300',
}

function getEditDraft(item) {
  return {
    title: item.title || '',
    notes: item.notes || '',
    is_best: Boolean(item.is_best),
  }
}

export default function AdminExperimentsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [items, setItems] = useState([])
  const [editTarget, setEditTarget] = useState(null)
  const [editDraft, setEditDraft] = useState(null)
  const [editError, setEditError] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkBusy, setBulkBusy] = useState(false)
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
      const payload = await apiJson(buildAdminListPath('/admin/experiments', apiFilters))
      const normalized = normalizeCollectionPayload(payload)
      setItems(normalized.items)
      setMeta({ total: normalized.total, page: normalized.page, page_size: normalized.page_size })
      setSelectedIds((prev) => prev.filter((id) => normalized.items.some((item) => item.id === id)))
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [apiFilters])

  useEffect(() => {
    load()
  }, [load])

  const handleSave = useCallback(async () => {
    if (!editTarget || !editDraft) return
    try {
      setSavingId(editTarget.id)
      setEditError(null)
      await apiJson(`/experiments/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editDraft.title,
          notes: editDraft.notes,
          is_best: editDraft.is_best,
        }),
      })
      setEditTarget(null)
      setEditDraft(null)
      await load()
    } catch (err) {
      setError(err)
      setEditError(err.message)
    } finally {
      setSavingId(null)
    }
  }, [editTarget, editDraft, load])

  const handleDelete = useCallback(async (experiment) => {
    const confirmed = window.confirm(`Delete experiment "${experiment.title}"?`)
    if (!confirmed) return
    try {
      setDeletingId(experiment.id)
      await apiJson(`/experiments/${experiment.id}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err)
    } finally {
      setDeletingId(null)
    }
  }, [load])

  const handleBulkDelete = useCallback(async () => {
    if (!selectedIds.length) return
    const confirmed = window.confirm(`Delete ${selectedIds.length} selected experiment(s)?`)
    if (!confirmed) return
    try {
      setBulkBusy(true)
      await apiJson('/experiments/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ experiment_ids: selectedIds }),
      })
      setSelectedIds([])
      await load()
    } catch (err) {
      setError(err)
    } finally {
      setBulkBusy(false)
    }
  }, [load, selectedIds])

  const openEdit = useCallback((item) => {
    setEditTarget(item)
    setEditDraft(getEditDraft(item))
    setEditError(null)
  }, [])

  const closeEdit = useCallback(() => {
    setEditTarget(null)
    setEditDraft(null)
    setEditError(null)
  }, [])

  const toggleSelected = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const allSelected = items.length > 0 && items.every((item) => selectedIds.includes(item.id))
  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : items.map((item) => item.id))
  }

  return (
    <div className="space-y-4">
      <header className="admin-list-hero">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="admin-list-hero-icon"><FlaskConical size={18} /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Experiment Governance</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-200">{meta.total}</span> total · <span className="font-semibold">{selectedIds.length}</span> selected
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={load} className="admin-btn-secondary"><RefreshCw size={13} /><span className="hidden sm:inline">Refresh</span></button>
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={!selectedIds.length || bulkBusy}
              className="admin-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 size={13} /> Delete selected
            </button>
          </div>
        </div>
        <div className="admin-filter-strip">
          <label className="admin-search">
            <Search size={13} />
            <input
              value={filters.q}
              onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value, page: 1 }))}
              placeholder="Search by title, model, dataset..."
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
        <LoadingState title="Loading experiments..." className="min-h-[320px]" />
      ) : error && items.length === 0 ? (
        <ErrorState title="Could not load experiments" error={error} onRetry={load} className="min-h-[320px]" />
      ) : items.length === 0 ? (
        <div className="admin-card">
          <EmptyState title="No experiments" description="Experiment runs will appear here once training sessions are recorded." />
        </div>
      ) : (
        <div className="admin-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="admin-th admin-th-lead">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="admin-th">Experiment</th>
                  <th className="admin-th">Status</th>
                  <th className="admin-th">Retention</th>
                  <th className="admin-th admin-th-meta">Epochs</th>
                  <th className="admin-th admin-th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const status = (item.status || '').toLowerCase()
                  const retention = (item.retention_state || '').toLowerCase()
                  return (
                    <tr key={item.id} className="admin-tr">
                      <td className="admin-td" style={{ paddingLeft: 16 }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => toggleSelected(item.id)}
                          aria-label={`Select ${item.title}`}
                        />
                      </td>
                      <td className="admin-td">
                        <div className="flex items-start gap-3">
                          <div className="admin-user-cell-avatar"><FlaskConical size={14} /></div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
                              <span className="truncate">{item.title}</span>
                              {item.is_best ? <Trophy size={12} className="text-amber-500" /> : null}
                              <span className="admin-id-pill">#{item.id}</span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                              {item.task_type ? <span className="font-semibold">T{item.task_type}</span> : null}
                              {item.model_type ? <span className="font-semibold text-slate-600 dark:text-slate-300">{item.model_type}</span> : null}
                              {item.dataset_name ? (
                                <span className="inline-flex items-center gap-1"><Database size={10} className="opacity-60" />{item.dataset_name}</span>
                              ) : null}
                            </div>
                            {item.notes ? (
                              <div className="mt-0.5 line-clamp-1 max-w-[280px] truncate text-[11px] italic text-slate-400">{item.notes}</div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="admin-td">
                        <span className={`admin-role-pill ${STATUS_TONE[status] || STATUS_TONE.pending}`}>
                          {status === 'completed' ? <CheckCircle2 size={11} /> : <Sparkles size={11} />}
                          {status || '—'}
                        </span>
                      </td>
                      <td className="admin-td">
                        {retention ? (
                          <span className={`admin-role-pill ${RETENTION_TONE[retention] || ''}`}>{retention}</span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="admin-td admin-td-meta">
                        <div className="text-xs text-slate-600 dark:text-slate-300">
                          {item.epoch_count ?? 0} epochs · best @{item.best_epoch ?? '—'}
                        </div>
                        <div className="text-[10px] text-slate-400">{relativeDate(item.created_at)}</div>
                      </td>
                      <td className="admin-td admin-td-actions">
                        <div className="flex items-center justify-end gap-1.5">
                          <button type="button" onClick={() => openEdit(item)} className="admin-icon-btn" title="Edit experiment">
                            <Pencil size={13} />
                          </button>
                          <button type="button" onClick={() => handleDelete(item)} disabled={deletingId === item.id} className="admin-icon-btn admin-icon-btn-danger" title="Delete experiment">
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

      <SlideOver
        open={Boolean(editTarget)}
        title={editTarget ? `Edit ${editTarget.title}` : ''}
        subtitle="Update experiment metadata."
        icon={FlaskConical}
        onClose={closeEdit}
        footer={
          <>
            <button type="button" onClick={closeEdit} className="admin-btn-secondary">Cancel</button>
            <button type="button" onClick={handleSave} disabled={savingId === editTarget?.id} className="admin-btn-primary">
              <Save size={13} /> {savingId === editTarget?.id ? 'Saving...' : 'Save changes'}
            </button>
          </>
        }
      >
        {editDraft ? (
          <div className="grid gap-3">
            <FormField icon={FlaskConical} label="Title">
              <input
                value={editDraft.title}
                onChange={(event) => setEditDraft((prev) => ({ ...prev, title: event.target.value }))}
                className="input-cosmic w-full"
              />
            </FormField>
            <FormField label="Notes">
              <textarea
                value={editDraft.notes}
                onChange={(event) => setEditDraft((prev) => ({ ...prev, notes: event.target.value }))}
                rows={4}
                className="input-cosmic w-full resize-none"
              />
            </FormField>
            <FormField icon={Trophy} label="Promote">
              <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-subtle/55 bg-deep/45 px-3 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={Boolean(editDraft.is_best)}
                  onChange={(event) => setEditDraft((prev) => ({ ...prev, is_best: event.target.checked }))}
                />
                Mark as best run
              </label>
            </FormField>
          </div>
        ) : null}
        {editError ? (
          <div className="mt-3 rounded-lg border border-aurora-rose/25 bg-aurora-rose/[0.08] px-3 py-2 text-xs text-aurora-rose">
            {editError}
          </div>
        ) : null}
      </SlideOver>
    </div>
  )
}
