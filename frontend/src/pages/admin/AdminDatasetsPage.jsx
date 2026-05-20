import { useCallback, useEffect, useState } from 'react'
import { Activity, CalendarDays, Database, Eye, Globe2, PencilLine, Save, Trash2, X } from 'lucide-react'
import EmptyState from '../../components/primitives/EmptyState'
import ErrorState from '../../components/primitives/ErrorState'
import LoadingState from '../../components/primitives/LoadingState'
import { apiJson, normalizeCollectionPayload } from '../../utils/api'
import { AdminListToolbar, AdminPagination, buildAdminListPath } from './AdminListControls'
import { SectionCard } from '../shared/PageBlocks'

export default function AdminDatasetsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [items, setItems] = useState([])
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createDraft, setCreateDraft] = useState({
    name: '',
    description: '',
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
      const payload = await apiJson(buildAdminListPath('/admin/datasets', filters))
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
              name: item.name || '',
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

  const handleSave = useCallback(async (datasetId) => {
    try {
      setBusyKey(`save-${datasetId}`)
      const draft = drafts[datasetId]
      await apiJson(`/admin/datasets/${datasetId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: draft?.name,
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

  const handleDelete = useCallback(async (datasetId, datasetName) => {
    const confirmed = window.confirm(`Delete dataset "${datasetName}"?`)
    if (!confirmed) return
    try {
      setBusyKey(`delete-${datasetId}`)
      await apiJson(`/admin/datasets/${datasetId}`, { method: 'DELETE' })
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
      await apiJson('/datasets', {
        method: 'POST',
        body: JSON.stringify({
          name: createDraft.name,
          description: createDraft.description || null,
          is_public: createDraft.is_public,
        }),
      })
      setCreateDraft({
        name: '',
        description: '',
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
        name: item.name || '',
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
        name: item.name || '',
        description: item.description || '',
        is_public: Boolean(item.is_public),
      },
    }))
    setEditingId((current) => (current === item.id ? null : current))
  }, [])

  if (loading) {
    return <LoadingState title="Loading governed datasets..." className="min-h-[480px]" />
  }

  if (error && items.length === 0) {
    return <ErrorState title="Could not load datasets" error={error} onRetry={load} className="min-h-[480px]" />
  }

  return (
    <SectionCard title="Dataset Governance" subtitle="Track lifecycle and usage concentration across the workspace.">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line-subtle bg-deep/60 px-4 py-4">
        <div>
          <div className="text-sm font-semibold text-white-star">Create dataset</div>
          <div className="mt-1 text-xs text-twilight">Open a new dataset draft only when you actually need to register one.</div>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreateError(null)
            setIsCreateOpen((prev) => !prev)
          }}
          className="admin-action-pill admin-action-pill-primary"
        >
          <Database size={14} />
          {isCreateOpen ? 'Close form' : 'Create dataset'}
        </button>
      </div>
      {isCreateOpen ? (
        <div className="glass-card admin-record-card admin-record-card-editing mb-4">
          <div className="admin-edit-banner">
            <Database size={13} />
            New dataset
          </div>
          <div className="admin-edit-shell">
            <input
              value={createDraft.name}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, name: event.target.value }))}
              className="input-cosmic w-full"
              placeholder="Dataset name"
            />
            <textarea
              value={createDraft.description}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, description: event.target.value }))}
              rows={3}
              className="input-cosmic w-full resize-none"
              placeholder="Dataset description"
            />
            <div className="admin-card-actions">
              <label className="admin-checkbox-chip">
                <input
                  type="checkbox"
                  checked={Boolean(createDraft.is_public)}
                  onChange={(event) => setCreateDraft((prev) => ({ ...prev, is_public: event.target.checked }))}
                />
                Public
              </label>
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
                {creating ? 'Creating...' : 'Create dataset'}
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
        searchPlaceholder="Search by dataset name, slug, description"
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
                      <Database size={13} />
                      Editing dataset
                    </div>
                  ) : null}
                  <div className="text-base font-semibold text-white-star">{item.name}</div>
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
                      onClick={() => handleDelete(item.id, item.name)}
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
                    value={drafts[item.id]?.name || ''}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: {
                          ...(prev[item.id] || {}),
                          name: event.target.value,
                        },
                      }))
                    }
                    className="input-cosmic w-full"
                    placeholder="Dataset name"
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
                    placeholder="Dataset description"
                  />
                </div>
              ) : null}
              <div className="admin-metadata-grid">
                <div className="admin-metadata-item">
                  <Eye size={14} className="text-moonlight" />
                  <span>Slug <strong>{item.slug}</strong></span>
                </div>
                <div className="admin-metadata-item">
                  <Database size={14} className="text-moonlight" />
                  <span>Versions <strong>{item.version_count}</strong></span>
                </div>
                <div className="admin-metadata-item">
                  <Activity size={14} className="text-aurora-cyan" />
                  <span>Usage <strong>{item.usage_count}</strong></span>
                </div>
                <div className="admin-metadata-item">
                  <Globe2 size={14} className={item.is_public ? 'text-aurora-green' : 'text-aurora-amber'} />
                  <span>Visibility <strong>{item.is_public ? 'Public' : 'Private'}</strong></span>
                </div>
                <div className="admin-metadata-item">
                  <CalendarDays size={14} className="text-moonlight" />
                  <span>Created <strong>{item.created_at || 'n/a'}</strong></span>
                </div>
                <div className="admin-metadata-item">
                  <Database size={14} className="text-moonlight" />
                  <span>Current <strong>{item.current_version ? `v${item.current_version.version} (${item.current_version.lifecycle})` : 'n/a'}</strong></span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No governed datasets" description="Governed dataset inventory will appear here once dataset records are created." />
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
