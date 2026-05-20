import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, PencilLine, Save, ShieldCheck, Trash2, UserRoundCog, X } from 'lucide-react'
import EmptyState from '../../components/primitives/EmptyState'
import ErrorState from '../../components/primitives/ErrorState'
import LoadingState from '../../components/primitives/LoadingState'
import { apiJson, normalizeCollectionPayload } from '../../utils/api'
import { AdminListToolbar, AdminPagination, buildAdminListPath } from './AdminListControls'
import { SectionCard } from '../shared/PageBlocks'

const ROLE_OPTIONS = ['admin', 'researcher', 'viewer']

function getCreateDraft() {
  return {
    email: '',
    username: '',
    full_name: '',
    password: '',
    bio: '',
    github_url: '',
    organization: '',
    job_title: '',
    location: '',
    profile_image: '',
    role: 'researcher',
    is_active: true,
  }
}

function getUserDraft(item) {
  return {
    email: item.email || '',
    username: item.username || '',
    full_name: item.full_name || '',
    bio: item.bio || '',
    github_url: item.github_url || '',
    organization: item.organization || '',
    job_title: item.job_title || '',
    location: item.location || '',
    profile_image: item.profile_image || '',
    role: item.role,
    is_active: item.is_active,
  }
}

export default function AdminUsersPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [users, setUsers] = useState([])
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createDraft, setCreateDraft] = useState(getCreateDraft)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [editingId, setEditingId] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [actionErrors, setActionErrors] = useState({})
  const [filters, setFilters] = useState({
    q: '',
    date_from: '',
    date_to: '',
    page: 1,
    page_size: 12,
  })
  const [meta, setMeta] = useState({ total: 0, page: 1, page_size: 12 })

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await apiJson(buildAdminListPath('/admin/users', filters))
      const normalized = normalizeCollectionPayload(payload)
      const items = normalized.items
      setUsers(items)
      setMeta({
        total: normalized.total,
        page: normalized.page,
        page_size: normalized.page_size,
      })
      setActionErrors({})
      setDrafts(
        Object.fromEntries(
          items.map((item) => [
            item.id,
            getUserDraft(item),
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
    loadUsers()
  }, [loadUsers])

  const handleSave = useCallback(async (userId) => {
    try {
      setSavingId(userId)
      setActionErrors((prev) => ({ ...prev, [userId]: null }))
      const draft = drafts[userId]
      await apiJson(`/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(draft),
      })
      setEditingId(null)
      await loadUsers()
    } catch (err) {
      setError(err)
      setActionErrors((prev) => ({ ...prev, [userId]: err.message }))
    } finally {
      setSavingId(null)
    }
  }, [drafts, loadUsers])

  const handleDelete = useCallback(async (userId, username) => {
    const confirmed = window.confirm(`Delete user "${username}"?`)
    if (!confirmed) return
    try {
      setDeletingId(userId)
      setActionErrors((prev) => ({ ...prev, [userId]: null }))
      await apiJson(`/admin/users/${userId}`, {
        method: 'DELETE',
      })
      await loadUsers()
    } catch (err) {
      setError(err)
      const message = err?.status === 404 && err?.message === 'Not Found'
        ? 'Backend dang chay ban cu hoac chua reload route xoa user. Hay restart backend roi thu lai.'
        : err.message
      setActionErrors((prev) => ({ ...prev, [userId]: message }))
    } finally {
      setDeletingId(null)
    }
  }, [loadUsers])

  const handleCreate = useCallback(async () => {
    try {
      setCreating(true)
      setCreateError(null)
      setError(null)
      await apiJson('/admin/users', {
        method: 'POST',
        body: JSON.stringify(createDraft),
      })
      setCreateDraft(getCreateDraft())
      setIsCreateOpen(false)
      await loadUsers()
    } catch (err) {
      setError(err)
      setCreateError(err.message)
    } finally {
      setCreating(false)
    }
  }, [createDraft, loadUsers])

  const openEdit = useCallback((item) => {
    setDrafts((prev) => ({
      ...prev,
      [item.id]: {
        ...getUserDraft(item),
      },
    }))
    setEditingId(item.id)
  }, [])

  const cancelEdit = useCallback((item) => {
    setDrafts((prev) => ({
      ...prev,
      [item.id]: {
        ...getUserDraft(item),
      },
    }))
    setActionErrors((prev) => ({ ...prev, [item.id]: null }))
    setEditingId((current) => (current === item.id ? null : current))
  }, [])

  if (loading) {
    return <LoadingState title="Loading users..." className="min-h-[480px]" />
  }

  if (error && users.length === 0) {
    return <ErrorState title="Could not load users" error={error} onRetry={loadUsers} className="min-h-[480px]" />
  }

  return (
    <SectionCard title="User Management" subtitle="Adjust roles without leaving the admin shell.">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line-subtle bg-deep/60 px-4 py-4">
        <div>
          <div className="text-sm font-semibold text-white-star">Create user</div>
          <div className="mt-1 text-xs text-twilight">Keep the page clean until you actually need the form.</div>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreateError(null)
            setIsCreateOpen((prev) => !prev)
          }}
          className="btn-galaxy min-h-[40px] px-4 text-xs"
        >
          {isCreateOpen ? 'Close form' : 'Create user'}
        </button>
      </div>
      {isCreateOpen ? (
        <div className="glass-card mb-4 p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white-star">New account</div>
              <div className="mt-1 text-xs text-twilight">Add a new account directly from the admin shell.</div>
            </div>
            <label className="inline-flex items-center gap-2 rounded-lg border border-line-subtle bg-deep px-3 py-2 text-xs text-starlight">
              <input
                type="checkbox"
                checked={Boolean(createDraft.is_active)}
                onChange={(event) =>
                  setCreateDraft((prev) => ({
                    ...prev,
                    is_active: event.target.checked,
                  }))
                }
              />
              Active on create
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              type="email"
              value={createDraft.email}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, email: event.target.value }))}
              className="input-cosmic"
              placeholder="Email"
            />
            <input
              type="text"
              value={createDraft.username}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, username: event.target.value }))}
              className="input-cosmic"
              placeholder="Username"
            />
            <input
              type="text"
              value={createDraft.full_name}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, full_name: event.target.value }))}
              className="input-cosmic"
              placeholder="Full name"
            />
            <input
              type="password"
              value={createDraft.password}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, password: event.target.value }))}
              className="input-cosmic"
              placeholder="Password"
            />
            <input
              type="text"
              value={createDraft.organization}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, organization: event.target.value }))}
              className="input-cosmic"
              placeholder="Organization"
            />
            <input
              type="text"
              value={createDraft.job_title}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, job_title: event.target.value }))}
              className="input-cosmic"
              placeholder="Job title"
            />
            <input
              type="text"
              value={createDraft.location}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, location: event.target.value }))}
              className="input-cosmic"
              placeholder="Location"
            />
            <input
              type="text"
              value={createDraft.github_url}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, github_url: event.target.value }))}
              className="input-cosmic"
              placeholder="GitHub URL"
            />
            <input
              type="text"
              value={createDraft.profile_image}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, profile_image: event.target.value }))}
              className="input-cosmic md:col-span-2"
              placeholder="Avatar URL or data URL"
            />
            <textarea
              value={createDraft.bio}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, bio: event.target.value }))}
              className="input-cosmic min-h-[110px] resize-none md:col-span-2"
              placeholder="Bio"
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select
              value={createDraft.role}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, role: event.target.value }))}
              className="input-cosmic min-w-[160px]"
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setCreateError(null)
                  setIsCreateOpen(false)
                }}
                className="btn-ghost px-4 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="btn-galaxy min-h-[42px] px-4 text-xs"
              >
                {creating ? 'Creating...' : 'Add user'}
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
        searchPlaceholder="Search by username, email, role"
        dateFrom={filters.date_from}
        dateTo={filters.date_to}
        onDateFromChange={(value) => setFilters((prev) => ({ ...prev, date_from: value, page: 1 }))}
        onDateToChange={(value) => setFilters((prev) => ({ ...prev, date_to: value, page: 1 }))}
        onPageSizeChange={(value) => setFilters((prev) => ({ ...prev, page_size: value, page: 1 }))}
        onRefresh={loadUsers}
        onClear={() => setFilters({ q: '', date_from: '', date_to: '', page: 1, page_size: meta.page_size || 12 })}
        pageSize={filters.page_size}
        showDateFilters
      />
      {users.length ? (
        <div className="space-y-3">
          {users.map((item) => (
            <div key={item.id} className={`glass-card admin-record-card ${editingId === item.id ? 'admin-record-card-editing' : ''}`}>
              <div className="admin-record-header">
                <div className="admin-record-copy">
                  {editingId === item.id ? (
                    <div className="admin-edit-banner">
                      <UserRoundCog size={13} />
                      Editing user
                    </div>
                  ) : null}
                  <div className="text-base font-semibold text-white-star">
                    {item.full_name || item.username}
                    <span className="ml-2 badge-cosmic">{item.role}</span>
                  </div>
                  <div className="mt-1 text-sm text-twilight">{item.email}</div>
                  <div className="admin-metadata-grid">
                    <div className="admin-metadata-item">
                      <ShieldCheck size={14} className="text-moonlight" />
                      <span>ID <strong>{item.id}</strong></span>
                    </div>
                    <div className="admin-metadata-item">
                      <CalendarDays size={14} className="text-moonlight" />
                      <span>Created <strong>{item.created_at || 'n/a'}</strong></span>
                    </div>
                    <div className="admin-metadata-item">
                      <span className={`h-2 w-2 rounded-full ${item.is_active ? 'bg-aurora-green' : 'bg-aurora-rose'}`} />
                      <span>Status <strong>{item.is_active ? 'Active' : 'Disabled'}</strong></span>
                    </div>
                    {item.organization ? (
                      <div className="admin-metadata-item">
                        <span>Org <strong>{item.organization}</strong></span>
                      </div>
                    ) : null}
                    {item.job_title ? (
                      <div className="admin-metadata-item">
                        <span>Title <strong>{item.job_title}</strong></span>
                      </div>
                    ) : null}
                  </div>
                  {item.bio ? (
                    <div className="mt-3 text-sm leading-6 text-text-shadow">{item.bio}</div>
                  ) : null}
                </div>
                {editingId === item.id ? (
                  <div className="admin-card-actions">
                    <select
                      value={drafts[item.id]?.role || item.role}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [item.id]: {
                            ...(prev[item.id] || {}),
                            role: event.target.value,
                          },
                        }))
                      }
                      className="input-cosmic text-sm"
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                    <label className="admin-checkbox-chip">
                      <input
                        type="checkbox"
                        checked={Boolean(drafts[item.id]?.is_active)}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [item.id]: {
                              ...(prev[item.id] || {}),
                              is_active: event.target.checked,
                            },
                          }))
                        }
                      />
                      Active
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
                      disabled={savingId === item.id}
                      className="admin-action-pill admin-action-pill-primary"
                    >
                      <Save size={14} />
                      {savingId === item.id ? 'Saving...' : 'Save'}
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
                      onClick={() => handleDelete(item.id, item.username)}
                      disabled={deletingId === item.id}
                      className="admin-action-pill admin-action-pill-danger"
                    >
                      <Trash2 size={14} />
                      {deletingId === item.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                )}
              </div>
              {editingId === item.id ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <input
                    type="text"
                    value={drafts[item.id]?.full_name || ''}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: {
                          ...(prev[item.id] || {}),
                          full_name: event.target.value,
                        },
                      }))
                    }
                    className="input-cosmic text-sm"
                    placeholder="Full name"
                  />
                  <input
                    type="email"
                    value={drafts[item.id]?.email || ''}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: {
                          ...(prev[item.id] || {}),
                          email: event.target.value,
                        },
                      }))
                    }
                    className="input-cosmic text-sm"
                    placeholder="Email"
                  />
                  <input
                    type="text"
                    value={drafts[item.id]?.username || ''}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: {
                          ...(prev[item.id] || {}),
                          username: event.target.value,
                        },
                      }))
                    }
                    className="input-cosmic text-sm"
                    placeholder="Username"
                  />
                  <input
                    type="text"
                    value={drafts[item.id]?.organization || ''}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: {
                          ...(prev[item.id] || {}),
                          organization: event.target.value,
                        },
                      }))
                    }
                    className="input-cosmic text-sm"
                    placeholder="Organization"
                  />
                  <input
                    type="text"
                    value={drafts[item.id]?.job_title || ''}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: {
                          ...(prev[item.id] || {}),
                          job_title: event.target.value,
                        },
                      }))
                    }
                    className="input-cosmic text-sm"
                    placeholder="Job title"
                  />
                  <input
                    type="text"
                    value={drafts[item.id]?.location || ''}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: {
                          ...(prev[item.id] || {}),
                          location: event.target.value,
                        },
                      }))
                    }
                    className="input-cosmic text-sm"
                    placeholder="Location"
                  />
                  <input
                    type="text"
                    value={drafts[item.id]?.github_url || ''}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: {
                          ...(prev[item.id] || {}),
                          github_url: event.target.value,
                        },
                      }))
                    }
                    className="input-cosmic text-sm"
                    placeholder="GitHub URL"
                  />
                  <input
                    type="text"
                    value={drafts[item.id]?.profile_image || ''}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: {
                          ...(prev[item.id] || {}),
                          profile_image: event.target.value,
                        },
                      }))
                    }
                    className="input-cosmic text-sm"
                    placeholder="Avatar URL or data URL"
                  />
                  <textarea
                    value={drafts[item.id]?.bio || ''}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: {
                          ...(prev[item.id] || {}),
                          bio: event.target.value,
                        },
                      }))
                    }
                    className="input-cosmic min-h-[100px] resize-none text-sm md:col-span-2"
                    placeholder="Bio"
                  />
                </div>
              ) : null}
              {actionErrors[item.id] ? (
                <div className="mt-3 rounded-lg border border-aurora-rose/20 bg-aurora-rose/[0.08] px-3 py-2 text-xs text-aurora-rose">
                  {actionErrors[item.id]}
                </div>
              ) : null}
            </div>
          ))}
          {error ? <div className="text-sm text-aurora-rose">{error.message}</div> : null}
        </div>
      ) : (
        <EmptyState title="No users found" description="User accounts will appear here once people start using the workspace." />
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
