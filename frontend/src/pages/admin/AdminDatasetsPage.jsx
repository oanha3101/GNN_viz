import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Database,
  Globe2,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
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

const VISIBILITY_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
]

const LIFECYCLE_TONE = {
  draft: 'bg-slate-500/12 text-slate-700 border-slate-500/25 dark:text-slate-200',
  active: 'bg-emerald-500/12 text-emerald-700 border-emerald-500/25 dark:text-emerald-300',
  archived: 'bg-amber-500/12 text-amber-700 border-amber-500/25 dark:text-amber-300',
  deprecated: 'bg-rose-500/12 text-rose-700 border-rose-500/25 dark:text-rose-300',
}

function getCreateDraft() {
  return { name: '', description: '', is_public: false }
}

function getEditDraft(item) {
  return {
    name: item.name || '',
    description: item.description || '',
    is_public: Boolean(item.is_public),
  }
}

export default function AdminDatasetsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [items, setItems] = useState([])
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createDraft, setCreateDraft] = useState(getCreateDraft)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [editTarget, setEditTarget] = useState(null)
  const [editDraft, setEditDraft] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [editError, setEditError] = useState(null)
  const [filters, setFilters] = useState({
    q: '',
    visibility: '',
    page: 1,
    page_size: 12,
  })
  const [meta, setMeta] = useState({ total: 0, page: 1, page_size: 12 })

  const apiFilters = useMemo(() => {
    const { visibility, ...rest } = filters
    const out = { ...rest }
    if (visibility) out.is_public = visibility === 'public' ? 'true' : 'false'
    return out
  }, [filters])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await apiJson(buildAdminListPath('/admin/datasets', apiFilters))
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

  const handleSave = useCallback(async () => {
    if (!editTarget || !editDraft) return
    try {
      setSavingId(editTarget.id)
      setEditError(null)
      await apiJson(`/admin/datasets/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editDraft.name,
          description: editDraft.description,
          is_public: editDraft.is_public,
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

  const handleDelete = useCallback(async (dataset) => {
    const confirmed = window.confirm(`Delete dataset "${dataset.name}"?`)
    if (!confirmed) return
    try {
      setDeletingId(dataset.id)
      await apiJson(`/admin/datasets/${dataset.id}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err)
    } finally {
      setDeletingId(null)
    }
  }, [load])

  const handleCreate = useCallback(async () => {
    try {
      setCreating(true)
      setCreateError(null)
      await apiJson('/datasets', {
        method: 'POST',
        body: JSON.stringify({
          name: createDraft.name,
          description: createDraft.description || null,
          is_public: createDraft.is_public,
        }),
      })
      setCreateDraft(getCreateDraft())
      setIsCreateOpen(false)
      await load()
    } catch (err) {
      setError(err)
      setCreateError(err.message)
    } finally {
      setCreating(false)
    }
  }, [createDraft, load])

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

  return (
    <div className="space-y-4">
      <header className="admin-list-hero">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="admin-list-hero-icon"><Database size={18} /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Dataset Governance</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-200">{meta.total}</span> total · <span className="font-semibold">{items.filter((d) => d.is_public).length}</span> public here
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={load} className="admin-btn-secondary"><RefreshCw size={13} /><span className="hidden sm:inline">Refresh</span></button>
            <button type="button" onClick={() => { setCreateError(null); setIsCreateOpen(true) }} className="admin-btn-primary">
              <Plus size={14} /> New dataset
            </button>
          </div>
        </div>
        <div className="admin-filter-strip">
          <label className="admin-search">
            <Search size={13} />
            <input
              value={filters.q}
              onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value, page: 1 }))}
              placeholder="Search by name, slug, description..."
              className="admin-search-input"
            />
          </label>
          <ChipGroup
            value={filters.visibility}
            options={VISIBILITY_OPTIONS}
            onChange={(value) => setFilters((prev) => ({ ...prev, visibility: value, page: 1 }))}
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
        <LoadingState title="Loading datasets..." className="min-h-[320px]" />
      ) : error && items.length === 0 ? (
        <ErrorState title="Could not load datasets" error={error} onRetry={load} className="min-h-[320px]" />
      ) : items.length === 0 ? (
        <div className="admin-card">
          <EmptyState title="No datasets" description="Datasets registered through the upload flow will appear here." />
        </div>
      ) : (
        <div className="admin-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="admin-th admin-th-lead">Dataset</th>
                  <th className="admin-th">Current version</th>
                  <th className="admin-th">Visibility</th>
                  <th className="admin-th admin-th-meta">Versions / Usage</th>
                  <th className="admin-th">Created</th>
                  <th className="admin-th admin-th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const currentVersion = item.current_version || {}
                  const lifecycle = (currentVersion.lifecycle || 'draft').toLowerCase()
                  return (
                    <tr key={item.id} className="admin-tr">
                      <td className="admin-td">
                        <div className="flex items-start gap-3">
                          <div className="admin-user-cell-avatar"><Database size={15} /></div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
                              <span className="truncate">{item.name}</span>
                              <span className="admin-id-pill">#{item.id}</span>
                            </div>
                            <div className="mt-0.5 line-clamp-2 max-w-[280px] truncate text-xs text-slate-500 dark:text-slate-400">{item.description || 'No description'}</div>
                            {item.slug ? (
                              <div className="mt-0.5 font-mono text-[10px] text-slate-400">{item.slug}</div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="admin-td">
                        {currentVersion.id ? (
                          <div className="flex flex-col">
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">v{currentVersion.version}</span>
                            <span className={`admin-role-pill mt-1 w-fit ${LIFECYCLE_TONE[lifecycle] || ''}`}>
                              {lifecycle}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">No version yet</span>
                        )}
                      </td>
                      <td className="admin-td">
                        <span className={`admin-status-dot ${item.is_public ? 'admin-status-active' : 'admin-status-disabled'}`}>
                          {item.is_public ? <Globe2 size={11} /> : <Lock size={11} />}
                          {item.is_public ? 'Public' : 'Private'}
                        </span>
                      </td>
                      <td className="admin-td admin-td-meta">
                        <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                          <span className="inline-flex items-center gap-1"><Database size={11} className="opacity-60" /> {item.version_count ?? 0}</span>
                          <span className="inline-flex items-center gap-1"><Activity size={11} className="opacity-60" /> {item.usage_count ?? 0}</span>
                        </div>
                      </td>
                      <td className="admin-td">
                        <span className="text-xs text-slate-600 dark:text-slate-300">{relativeDate(item.created_at)}</span>
                      </td>
                      <td className="admin-td admin-td-actions">
                        <div className="flex items-center justify-end gap-1.5">
                          <button type="button" onClick={() => openEdit(item)} className="admin-icon-btn" title="Edit dataset">
                            <Pencil size={13} />
                          </button>
                          <button type="button" onClick={() => handleDelete(item)} disabled={deletingId === item.id} className="admin-icon-btn admin-icon-btn-danger" title="Delete dataset">
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
        open={isCreateOpen}
        title="Create dataset"
        subtitle="Register a new dataset slot."
        icon={Database}
        onClose={() => { setCreateError(null); setIsCreateOpen(false) }}
        footer={
          <>
            <button type="button" onClick={() => { setCreateError(null); setIsCreateOpen(false) }} className="admin-btn-secondary">Cancel</button>
            <button type="button" onClick={handleCreate} disabled={creating} className="admin-btn-primary">
              <Save size={13} /> {creating ? 'Creating...' : 'Create dataset'}
            </button>
          </>
        }
      >
        <div className="grid gap-3">
          <FormField icon={Database} label="Name" required>
            <input
              value={createDraft.name}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, name: event.target.value }))}
              className="input-cosmic w-full"
            />
          </FormField>
          <FormField label="Description">
            <textarea
              value={createDraft.description}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, description: event.target.value }))}
              rows={3}
              className="input-cosmic w-full resize-none"
            />
          </FormField>
          <FormField icon={Globe2} label="Visibility">
            <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-subtle/55 bg-deep/45 px-3 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={Boolean(createDraft.is_public)}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, is_public: event.target.checked }))}
              />
              Public dataset
            </label>
          </FormField>
        </div>
        {createError ? (
          <div className="mt-3 rounded-lg border border-aurora-rose/25 bg-aurora-rose/[0.08] px-3 py-2 text-xs text-aurora-rose">
            {createError}
          </div>
        ) : null}
      </SlideOver>

      <SlideOver
        open={Boolean(editTarget)}
        title={editTarget ? `Edit ${editTarget.name}` : ''}
        subtitle="Adjust dataset metadata."
        icon={Database}
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
            <FormField icon={Database} label="Name">
              <input
                value={editDraft.name}
                onChange={(event) => setEditDraft((prev) => ({ ...prev, name: event.target.value }))}
                className="input-cosmic w-full"
              />
            </FormField>
            <FormField label="Description">
              <textarea
                value={editDraft.description}
                onChange={(event) => setEditDraft((prev) => ({ ...prev, description: event.target.value }))}
                rows={3}
                className="input-cosmic w-full resize-none"
              />
            </FormField>
            <FormField icon={Globe2} label="Visibility">
              <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-subtle/55 bg-deep/45 px-3 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={Boolean(editDraft.is_public)}
                  onChange={(event) => setEditDraft((prev) => ({ ...prev, is_public: event.target.checked }))}
                />
                Public
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
