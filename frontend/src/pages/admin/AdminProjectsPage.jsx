import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, FolderKanban, Globe2, PencilLine, PlaySquare, Save, Trash2, User2, Waves, X } from 'lucide-react'
import EmptyState from '../../components/primitives/EmptyState'
import ErrorState from '../../components/primitives/ErrorState'
import LoadingState from '../../components/primitives/LoadingState'
import { apiJson, normalizeCollectionPayload } from '../../utils/api'
import { AdminListToolbar, AdminPagination, buildAdminListPath } from './AdminListControls'
import { SectionCard } from '../shared/PageBlocks'

export default function AdminProjectsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [items, setItems] = useState([])
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createDraft, setCreateDraft] = useState({
    title: '',
    description: '',
    task_type: '',
    model_type: '',
    is_public: false,
  })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [editingId, setEditingId] = useState(null)
  const [busyKey, setBusyKey] = useState(null)
  const [filters, setFilters] = useState({
    q: '',
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
      const payload = await apiJson(buildAdminListPath('/admin/projects', filters))
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
              description: item.description || '',
              is_public: Boolean(item.is_public),
            },
          ])
        )
      )
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    load()
  }, [load])

  const handleSave = useCallback(async (projectId) => {
    try {
      setBusyKey(`save-${projectId}`)
      const draft = drafts[projectId]
      await apiJson(`/admin/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: draft?.title,
          description: draft?.description,
          is_public: draft?.is_public,
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

  const handleDelete = useCallback(async (projectId, title) => {
    const confirmed = window.confirm(`Delete project "${title}"?`)
    if (!confirmed) return
    try {
      setBusyKey(`delete-${projectId}`)
      await apiJson(`/admin/projects/${projectId}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err)
    } finally {
      setBusyKey(null)
    }
  }, [load])

  const handleCreate = useCallback(async () => {
    try {
      setCreating(true)
      setCreateError(null)
      setError(null)
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
      setCreateDraft({
        title: '',
        description: '',
        task_type: '',
        model_type: '',
        is_public: false,
      })
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
    setDrafts((prev) => ({
      ...prev,
      [item.id]: {
        title: item.title || '',
        description: item.description || '',
        is_public: Boolean(item.is_public),
      },
    }))
    setEditingId(item.id)
  }, [])

  const cancelEdit = useCallback((item) => {
    setDrafts((prev) => ({
      ...prev,
      [item.id]: {
        title: item.title || '',
        description: item.description || '',
        is_public: Boolean(item.is_public),
      },
    }))
    setEditingId((current) => (current === item.id ? null : current))
  }, [])

  if (loading) {
    return <LoadingState title="Loading governed projects..." className="min-h-[480px]" />
  }

  if (error && items.length === 0) {
    return <ErrorState title="Could not load projects" error={error} onRetry={load} className="min-h-[480px]" />
  }

  return (
    <SectionCard title="Project Governance" subtitle="Review, edit, and retire project containers from the admin shell.">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line-subtle bg-deep/60 px-4 py-4">
        <div>
          <div className="text-sm font-semibold text-white-star">Create project</div>
          <div className="mt-1 text-xs text-twilight">Keep project creation tucked away until you need a new workspace container.</div>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreateError(null)
            setIsCreateOpen((prev) => !prev)
          }}
          className="admin-action-pill admin-action-pill-primary"
        >
          <FolderKanban size={14} />
          {isCreateOpen ? 'Close form' : 'Create project'}
        </button>
      </div>
      {isCreateOpen ? (
        <div className="glass-card admin-record-card admin-record-card-editing mb-4">
          <div className="admin-edit-banner">
            <FolderKanban size={13} />
            New project
          </div>
          <div className="admin-edit-shell">
            <input
              value={createDraft.title}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, title: event.target.value }))}
              className="input-cosmic w-full"
              placeholder="Project title"
            />
            <textarea
              value={createDraft.description}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, description: event.target.value }))}
              rows={3}
              className="input-cosmic w-full resize-none"
              placeholder="Project description"
            />
            <div className="grid gap-3 md:grid-cols-3">
              <select
                value={createDraft.task_type}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, task_type: event.target.value }))}
                className="input-cosmic w-full"
                aria-label="Task type"
                placeholder="Task type"
              >
                <option value="">Select task type</option>
                <option value="1">Node Classification</option>
                <option value="2">Graph Classification</option>
                <option value="3">Link Prediction</option>
                <option value="4">Community Detection</option>
                <option value="5">Graph Embedding</option>
                <option value="6">Graph Generation</option>
              </select>
              <select
                value={createDraft.model_type}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, model_type: event.target.value }))}
                className="input-cosmic w-full"
                aria-label="Model type"
                placeholder="Model type"
              >
                <option value="">Select model type</option>
                <option value="GCN">GCN</option>
                <option value="GAT">GAT</option>
                <option value="SAGE">GraphSAGE</option>
              </select>
              <label className="admin-checkbox-chip justify-center md:justify-start">
                <input
                  type="checkbox"
                  checked={Boolean(createDraft.is_public)}
                  onChange={(event) => setCreateDraft((prev) => ({ ...prev, is_public: event.target.checked }))}
                />
                Public
              </label>
            </div>
            <div className="admin-card-actions">
              <button
                type="button"
                onClick={() => {
                  setCreateError(null)
                  setIsCreateOpen(false)
                }}
                className="admin-action-pill admin-action-pill-subtle"
              >
                <X size={14} />
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="admin-action-pill admin-action-pill-primary"
              >
                <Save size={14} />
                {creating ? 'Creating...' : 'Create project'}
              </button>
            </div>
          </div>
          {createError ? (
            <div className="mt-3 rounded-lg border border-aurora-rose/20 bg-aurora-rose/[0.08] px-3 py-2 text-xs text-aurora-rose">
              {createError}
            </div>
          ) : null}
        </div>
      ) : null}
      <AdminListToolbar
        searchValue={filters.q}
        onSearchChange={(value) => setFilters((prev) => ({ ...prev, q: value, page: 1 }))}
        searchPlaceholder="Search by project title, description, model"
        dateFrom={filters.date_from}
        dateTo={filters.date_to}
        onDateFromChange={(value) => setFilters((prev) => ({ ...prev, date_from: value, page: 1 }))}
        onDateToChange={(value) => setFilters((prev) => ({ ...prev, date_to: value, page: 1 }))}
        onPageSizeChange={(value) => setFilters((prev) => ({ ...prev, page_size: value, page: 1 }))}
        onRefresh={load}
        onClear={() => setFilters({ q: '', date_from: '', date_to: '', page: 1, page_size: meta.page_size || 12 })}
        pageSize={filters.page_size}
        showDateFilters
      />
      {items.length ? (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className={`glass-card admin-record-card ${editingId === item.id ? 'admin-record-card-editing' : ''}`}>
              <div className="admin-record-header">
                <div className="admin-record-copy space-y-3">
                  {editingId === item.id ? (
                    <div className="admin-edit-banner">
                      <FolderKanban size={13} />
                      Editing project
                    </div>
                  ) : null}
                  <div className="text-base font-semibold text-white-star">{item.title}</div>
                  <div className="text-sm text-twilight">{item.description || 'No description'}</div>
                </div>
                {editingId === item.id ? (
                  <div className="admin-card-actions">
                    <label className="admin-checkbox-chip">
                      <input
                        type="checkbox"
                        checked={Boolean(drafts[item.id]?.is_public)}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [item.id]: {
                              ...(prev[item.id] || {}),
                              is_public: event.target.checked,
                            },
                          }))
                        }
                      />
                      Public
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
                    placeholder="Project title"
                  />
                  <textarea
                    value={drafts[item.id]?.description || ''}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: {
                          ...(prev[item.id] || {}),
                          description: event.target.value,
                        },
                      }))
                    }
                    rows={3}
                    className="input-cosmic w-full resize-none"
                    placeholder="Project description"
                  />
                </div>
              ) : null}
              <div className="admin-metadata-grid">
                <div className="admin-metadata-item">
                  <User2 size={14} className="text-moonlight" />
                  <span>Owner <strong>{item.owner_id || 'system'}</strong></span>
                </div>
                <div className="admin-metadata-item">
                  <PlaySquare size={14} className="text-aurora-cyan" />
                  <span>Experiments <strong>{item.experiment_count ?? 0}</strong></span>
                </div>
                <div className="admin-metadata-item">
                  <Waves size={14} className="text-aurora-cyan" />
                  <span>Sessions <strong>{item.session_count ?? 0}</strong></span>
                </div>
                <div className="admin-metadata-item">
                  <Globe2 size={14} className={item.is_public ? 'text-aurora-green' : 'text-aurora-amber'} />
                  <span>Visibility <strong>{item.is_public ? 'Public' : 'Private'}</strong></span>
                </div>
                <div className="admin-metadata-item">
                  <CalendarDays size={14} className="text-moonlight" />
                  <span>Created <strong>{item.created_at || 'n/a'}</strong></span>
                </div>
              </div>
            </div>
          ))}
          {error ? <div className="text-sm text-aurora-rose">{error.message}</div> : null}
        </div>
      ) : (
        <EmptyState title="No governed projects" description="Project inventory will appear here once project records are created." />
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
