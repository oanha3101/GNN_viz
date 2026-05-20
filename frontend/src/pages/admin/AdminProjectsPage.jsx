import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FolderKanban,
  Globe2,
  Lock,
  Pencil,
  PlaySquare,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  User2,
  Waves,
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

const TASK_OPTIONS = [
  { value: '', label: 'All tasks' },
  { value: '1', label: 'Task 1' },
  { value: '2', label: 'Task 2' },
  { value: '3', label: 'Task 3' },
  { value: '4', label: 'Task 4' },
  { value: '5', label: 'Task 5' },
  { value: '6', label: 'Task 6' },
]

const VISIBILITY_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
]

const TASK_LABEL = {
  1: 'Node Classification',
  2: 'Graph Classification',
  3: 'Link Prediction',
  4: 'Community Detection',
  5: 'Graph Embedding',
  6: 'Graph Generation',
}

const TASK_TONE = {
  1: 'bg-sky-500/12 text-sky-700 border-sky-500/25 dark:text-sky-300',
  2: 'bg-violet-500/12 text-violet-700 border-violet-500/25 dark:text-violet-300',
  3: 'bg-emerald-500/12 text-emerald-700 border-emerald-500/25 dark:text-emerald-300',
  4: 'bg-amber-500/12 text-amber-700 border-amber-500/25 dark:text-amber-300',
  5: 'bg-fuchsia-500/12 text-fuchsia-700 border-fuchsia-500/25 dark:text-fuchsia-300',
  6: 'bg-rose-500/12 text-rose-700 border-rose-500/25 dark:text-rose-300',
}

function getCreateDraft() {
  return {
    title: '',
    description: '',
    task_type: '',
    model_type: '',
    is_public: false,
  }
}

function getEditDraft(item) {
  return {
    title: item.title || '',
    description: item.description || '',
    is_public: Boolean(item.is_public),
  }
}

export default function AdminProjectsPage() {
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
    task_type: '',
    visibility: '',
    page: 1,
    page_size: 12,
  })
  const [meta, setMeta] = useState({ total: 0, page: 1, page_size: 12 })

  const apiFilters = useMemo(() => {
    const { task_type, visibility, ...rest } = filters
    const out = { ...rest }
    if (task_type) out.task_type = task_type
    if (visibility) out.is_public = visibility === 'public' ? 'true' : 'false'
    return out
  }, [filters])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await apiJson(buildAdminListPath('/admin/projects', apiFilters))
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
      await apiJson(`/admin/projects/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editDraft.title,
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

  const handleDelete = useCallback(async (project) => {
    const confirmed = window.confirm(`Delete project "${project.title}"?`)
    if (!confirmed) return
    try {
      setDeletingId(project.id)
      await apiJson(`/admin/projects/${project.id}`, { method: 'DELETE' })
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
      await apiJson('/projects', {
        method: 'POST',
        body: JSON.stringify({
          title: createDraft.title,
          description: createDraft.description || null,
          task_type: createDraft.task_type ? Number(createDraft.task_type) : null,
          model_type: createDraft.model_type || null,
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
            <div className="admin-list-hero-icon"><FolderKanban size={18} /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Project Governance</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-200">{meta.total}</span> total · <span className="font-semibold">{items.filter((p) => p.is_public).length}</span> public here
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={load} className="admin-btn-secondary" title="Refresh">
              <RefreshCw size={13} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              type="button"
              onClick={() => { setCreateError(null); setIsCreateOpen(true) }}
              className="admin-btn-primary"
            >
              <Plus size={14} /> New project
            </button>
          </div>
        </div>
        <div className="admin-filter-strip">
          <label className="admin-search">
            <Search size={13} />
            <input
              value={filters.q}
              onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value, page: 1 }))}
              placeholder="Search by title, description, model..."
              className="admin-search-input"
            />
          </label>
          <ChipGroup
            value={filters.task_type}
            options={TASK_OPTIONS}
            onChange={(value) => setFilters((prev) => ({ ...prev, task_type: value, page: 1 }))}
          />
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
        <LoadingState title="Loading governed projects..." className="min-h-[320px]" />
      ) : error && items.length === 0 ? (
        <ErrorState title="Could not load projects" error={error} onRetry={load} className="min-h-[320px]" />
      ) : items.length === 0 ? (
        <div className="admin-card">
          <EmptyState title="No projects" description="Create the first workspace project to get started." />
        </div>
      ) : (
        <div className="admin-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="admin-th admin-th-lead">Project</th>
                  <th className="admin-th">Task</th>
                  <th className="admin-th">Visibility</th>
                  <th className="admin-th admin-th-meta">Activity</th>
                  <th className="admin-th">Created</th>
                  <th className="admin-th admin-th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="admin-tr">
                    <td className="admin-td">
                      <div className="flex items-start gap-3">
                        <div className="admin-user-cell-avatar">
                          <FolderKanban size={15} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
                            <span className="truncate">{item.title}</span>
                            <span className="admin-id-pill">#{item.id}</span>
                          </div>
                          <div className="mt-0.5 line-clamp-2 max-w-[280px] truncate text-xs text-slate-500 dark:text-slate-400">{item.description || 'No description'}</div>
                          <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
                            <User2 size={10} className="opacity-70" />
                            Owner #{item.owner_id || 'system'}
                            {item.model_type ? (
                              <>
                                <span>·</span>
                                <span className="font-semibold text-slate-500 dark:text-slate-300">{item.model_type}</span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="admin-td">
                      {item.task_type ? (
                        <span className={`admin-role-pill ${TASK_TONE[item.task_type] || ''}`}>
                          T{item.task_type}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
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
                        <span className="inline-flex items-center gap-1"><PlaySquare size={11} className="opacity-60" /> {item.experiment_count ?? 0}</span>
                        <span className="inline-flex items-center gap-1"><Waves size={11} className="opacity-60" /> {item.session_count ?? 0}</span>
                      </div>
                    </td>
                    <td className="admin-td">
                      <span className="text-xs text-slate-600 dark:text-slate-300">{relativeDate(item.created_at)}</span>
                    </td>
                    <td className="admin-td admin-td-actions">
                      <div className="flex items-center justify-end gap-1.5">
                        <button type="button" onClick={() => openEdit(item)} className="admin-icon-btn" title="Edit project">
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          disabled={deletingId === item.id}
                          className="admin-icon-btn admin-icon-btn-danger"
                          title="Delete project"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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
        title="Create project"
        subtitle="A new workspace container for experiments."
        icon={FolderKanban}
        onClose={() => { setCreateError(null); setIsCreateOpen(false) }}
        footer={
          <>
            <button type="button" onClick={() => { setCreateError(null); setIsCreateOpen(false) }} className="admin-btn-secondary">Cancel</button>
            <button type="button" onClick={handleCreate} disabled={creating} className="admin-btn-primary">
              <Save size={13} /> {creating ? 'Creating...' : 'Create project'}
            </button>
          </>
        }
      >
        <div className="grid gap-3">
          <FormField icon={FolderKanban} label="Title" required>
            <input
              value={createDraft.title}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, title: event.target.value }))}
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
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField icon={PlaySquare} label="Task type">
              <select
                value={createDraft.task_type}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, task_type: event.target.value }))}
                className="input-cosmic w-full"
              >
                <option value="">Select task type</option>
                {Object.entries(TASK_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </FormField>
            <FormField icon={ShieldCheck} label="Model type">
              <select
                value={createDraft.model_type}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, model_type: event.target.value }))}
                className="input-cosmic w-full"
              >
                <option value="">Select model type</option>
                <option value="GCN">GCN</option>
                <option value="GAT">GAT</option>
                <option value="SAGE">GraphSAGE</option>
              </select>
            </FormField>
          </div>
          <FormField icon={Globe2} label="Visibility">
            <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-subtle/55 bg-deep/45 px-3 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={Boolean(createDraft.is_public)}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, is_public: event.target.checked }))}
              />
              Public project
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
        title={editTarget ? `Edit ${editTarget.title}` : ''}
        subtitle="Update project metadata."
        icon={FolderKanban}
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
            <FormField icon={FolderKanban} label="Title">
              <input
                value={editDraft.title}
                onChange={(event) => setEditDraft((prev) => ({ ...prev, title: event.target.value }))}
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

