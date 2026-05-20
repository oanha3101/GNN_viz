import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AtSign,
  BadgeCheck,
  Building2,
  Camera,
  ChevronLeft,
  ChevronRight,
  Eye,
  GitBranch,
  IdCard,
  MapPin,
  Pencil,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserRoundCog,
  Users,
  X,
} from 'lucide-react'
import EmptyState from '../../components/primitives/EmptyState'
import ErrorState from '../../components/primitives/ErrorState'
import LoadingState from '../../components/primitives/LoadingState'
import { apiJson, normalizeCollectionPayload } from '../../utils/api'
import { buildAdminListPath } from './AdminListControls'

const ROLE_OPTIONS = ['admin', 'researcher', 'viewer']
const PAGE_SIZE_OPTIONS = [8, 12, 24, 48]

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

function initialsFor(item) {
  const source = (item?.full_name || item?.username || 'U').trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function relativeDate(value) {
  if (!value) return '—'
  try {
    const d = new Date(value)
    const diff = (Date.now() - d.getTime()) / 1000
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return '—'
  }
}

const ROLE_TONES = {
  admin: 'bg-rose-500/12 text-rose-300 border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-200',
  researcher: 'bg-sky-500/12 text-sky-700 border-sky-500/30 dark:text-sky-300',
  viewer: 'bg-slate-500/12 text-slate-700 border-slate-500/30 dark:text-slate-300',
}

export default function AdminUsersPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [users, setUsers] = useState([])
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createDraft, setCreateDraft] = useState(getCreateDraft)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [editTarget, setEditTarget] = useState(null) // user object
  const [editDraft, setEditDraft] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [editError, setEditError] = useState(null)
  const [filters, setFilters] = useState({
    q: '',
    role: '',
    status: '',
    date_from: '',
    date_to: '',
    page: 1,
    page_size: 12,
  })
  const [meta, setMeta] = useState({ total: 0, page: 1, page_size: 12 })

  const apiFilters = useMemo(() => {
    const { role, status, ...rest } = filters
    const out = { ...rest }
    if (role) out.role = role
    if (status) out.is_active = status === 'active' ? 'true' : 'false'
    return out
  }, [filters])

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await apiJson(buildAdminListPath('/admin/users', apiFilters))
      const normalized = normalizeCollectionPayload(payload)
      setUsers(normalized.items)
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
  }, [apiFilters])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const handleSave = useCallback(async () => {
    if (!editTarget || !editDraft) return
    try {
      setSavingId(editTarget.id)
      setEditError(null)
      await apiJson(`/admin/users/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editDraft),
      })
      setEditTarget(null)
      setEditDraft(null)
      await loadUsers()
    } catch (err) {
      setError(err)
      setEditError(err.message)
    } finally {
      setSavingId(null)
    }
  }, [editTarget, editDraft, loadUsers])

  const handleDelete = useCallback(async (user) => {
    const confirmed = window.confirm(`Delete user "${user.username}"?`)
    if (!confirmed) return
    try {
      setDeletingId(user.id)
      await apiJson(`/admin/users/${user.id}`, { method: 'DELETE' })
      await loadUsers()
    } catch (err) {
      setError(err)
    } finally {
      setDeletingId(null)
    }
  }, [loadUsers])

  const handleCreate = useCallback(async () => {
    try {
      setCreating(true)
      setCreateError(null)
      await apiJson('/admin/users', { method: 'POST', body: JSON.stringify(createDraft) })
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

  const openEdit = useCallback((user) => {
    setEditTarget(user)
    setEditDraft(getUserDraft(user))
    setEditError(null)
  }, [])

  const closeEdit = useCallback(() => {
    setEditTarget(null)
    setEditDraft(null)
    setEditError(null)
  }, [])

  const totalPages = Math.max(1, Math.ceil((meta.total || 0) / (meta.page_size || 12)))
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.page_size + 1
  const to = meta.total === 0 ? 0 : Math.min(meta.page * meta.page_size, meta.total)

  return (
    <div className="space-y-4">
      {/* Header strip */}
      <header className="admin-list-hero">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="admin-list-hero-icon">
              <Users size={18} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">User Management</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-200">{meta.total}</span> total · <span className="font-semibold">{users.filter((u) => u.is_active).length}</span> active here
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadUsers}
              className="admin-btn-secondary"
              title="Refresh"
            >
              <RefreshCw size={13} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setCreateError(null)
                setIsCreateOpen(true)
              }}
              className="admin-btn-primary"
            >
              <UserPlus size={14} />
              New user
            </button>
          </div>
        </div>

        {/* Filter strip */}
        <div className="admin-filter-strip">
          <label className="admin-search">
            <Search size={13} />
            <input
              value={filters.q}
              onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value, page: 1 }))}
              placeholder="Search username, email, name..."
              className="admin-search-input"
            />
          </label>
          <RoleChips
            value={filters.role}
            onChange={(value) => setFilters((prev) => ({ ...prev, role: value, page: 1 }))}
          />
          <StatusChips
            value={filters.status}
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

      {/* Table / list */}
      {loading ? (
        <LoadingState title="Loading users..." className="min-h-[320px]" />
      ) : error && users.length === 0 ? (
        <ErrorState title="Could not load users" error={error} onRetry={loadUsers} className="min-h-[320px]" />
      ) : users.length === 0 ? (
        <div className="admin-card">
          <EmptyState
            title="No users found"
            description="Try clearing filters or invite the first researcher to the workspace."
          />
        </div>
      ) : (
        <div className="admin-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="admin-th admin-th-lead">User</th>
                  <th className="admin-th">Role</th>
                  <th className="admin-th">Status</th>
                  <th className="admin-th">Joined</th>
                  <th className="admin-th admin-th-meta">Workplace</th>
                  <th className="admin-th admin-th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((item) => (
                  <tr key={item.id} className="admin-tr">
                    <td className="admin-td">
                      <div className="flex items-center gap-3">
                        <div className="admin-user-cell-avatar">
                          {item.profile_image ? (
                            <img src={item.profile_image} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span>{initialsFor(item)}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
                            <span className="truncate">{item.full_name || item.username}</span>
                            <span className="admin-id-pill">#{item.id}</span>
                          </div>
                          <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{item.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="admin-td">
                      <span className={`admin-role-pill ${ROLE_TONES[item.role] || ROLE_TONES.viewer}`}>
                        <ShieldCheck size={11} />
                        {item.role}
                      </span>
                    </td>
                    <td className="admin-td">
                      <span className={`admin-status-dot ${item.is_active ? 'admin-status-active' : 'admin-status-disabled'}`}>
                        <span className="admin-status-led" />
                        {item.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="admin-td">
                      <span className="text-xs text-slate-600 dark:text-slate-300">{relativeDate(item.created_at)}</span>
                    </td>
                    <td className="admin-td admin-td-meta">
                      <div className="space-y-0.5 text-xs">
                        {item.organization ? (
                          <div className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                            <Building2 size={11} className="opacity-60" />
                            <span className="truncate">{item.organization}</span>
                          </div>
                        ) : null}
                        {item.job_title ? (
                          <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                            <BadgeCheck size={11} className="opacity-60" />
                            <span className="truncate">{item.job_title}</span>
                          </div>
                        ) : null}
                        {!item.organization && !item.job_title ? (
                          <span className="text-slate-400 dark:text-slate-500">—</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="admin-td admin-td-actions">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          className="admin-icon-btn"
                          title="Edit user"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          disabled={deletingId === item.id}
                          className="admin-icon-btn admin-icon-btn-danger"
                          title="Delete user"
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

          {/* Pagination */}
          <div className="admin-pagination">
            <div>
              Showing <span className="font-semibold text-slate-700 dark:text-slate-200">{from}–{to}</span> of <span className="font-semibold text-slate-700 dark:text-slate-200">{meta.total}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFilters((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                disabled={meta.page <= 1}
                className="admin-page-btn"
              >
                <ChevronLeft size={13} />
                Prev
              </button>
              <span className="admin-page-indicator">Page {meta.page} / {totalPages}</span>
              <button
                type="button"
                onClick={() => setFilters((prev) => ({ ...prev, page: Math.min(totalPages, prev.page + 1) }))}
                disabled={meta.page >= totalPages}
                className="admin-page-btn"
              >
                Next
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-over: Create */}
      <SlideOver
        open={isCreateOpen}
        title="Invite new user"
        subtitle="Provision a workspace account directly."
        icon={UserPlus}
        onClose={() => {
          setCreateError(null)
          setIsCreateOpen(false)
        }}
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setCreateError(null)
                setIsCreateOpen(false)
              }}
              className="admin-btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="admin-btn-primary"
            >
              <Save size={13} />
              {creating ? 'Creating...' : 'Create user'}
            </button>
          </>
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          <FormField icon={AtSign} label="Email" required>
            <input
              type="email"
              value={createDraft.email}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, email: event.target.value }))}
              className="input-cosmic w-full"
            />
          </FormField>
          <FormField icon={UserRoundCog} label="Username" required>
            <input
              type="text"
              value={createDraft.username}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, username: event.target.value }))}
              className="input-cosmic w-full"
            />
          </FormField>
          <FormField icon={IdCard} label="Full name">
            <input
              type="text"
              value={createDraft.full_name}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, full_name: event.target.value }))}
              className="input-cosmic w-full"
            />
          </FormField>
          <FormField icon={ShieldCheck} label="Password" required>
            <input
              type="password"
              value={createDraft.password}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, password: event.target.value }))}
              className="input-cosmic w-full"
            />
          </FormField>
          <FormField icon={ShieldCheck} label="Role">
            <select
              value={createDraft.role}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, role: event.target.value }))}
              className="input-cosmic w-full"
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </FormField>
          <FormField icon={Eye} label="Status">
            <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-subtle/55 bg-deep/45 px-3 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={Boolean(createDraft.is_active)}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, is_active: event.target.checked }))}
              />
              Active on create
            </label>
          </FormField>
          <FormField icon={Building2} label="Organization">
            <input
              type="text"
              value={createDraft.organization}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, organization: event.target.value }))}
              className="input-cosmic w-full"
            />
          </FormField>
          <FormField icon={BadgeCheck} label="Job title">
            <input
              type="text"
              value={createDraft.job_title}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, job_title: event.target.value }))}
              className="input-cosmic w-full"
            />
          </FormField>
          <FormField icon={MapPin} label="Location">
            <input
              type="text"
              value={createDraft.location}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, location: event.target.value }))}
              className="input-cosmic w-full"
            />
          </FormField>
          <FormField icon={GitBranch} label="GitHub URL">
            <input
              type="text"
              value={createDraft.github_url}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, github_url: event.target.value }))}
              className="input-cosmic w-full"
            />
          </FormField>
          <FormField icon={Camera} label="Avatar URL" colSpan="md:col-span-2">
            <input
              type="text"
              value={createDraft.profile_image}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, profile_image: event.target.value }))}
              className="input-cosmic w-full"
              placeholder="https://... or data:image/..."
            />
          </FormField>
          <FormField label="Bio" colSpan="md:col-span-2">
            <textarea
              value={createDraft.bio}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, bio: event.target.value }))}
              rows={3}
              className="input-cosmic w-full resize-none"
            />
          </FormField>
        </div>
        {createError ? (
          <div className="mt-3 rounded-lg border border-aurora-rose/25 bg-aurora-rose/[0.08] px-3 py-2 text-xs text-aurora-rose">
            {createError}
          </div>
        ) : null}
      </SlideOver>

      {/* Slide-over: Edit */}
      <SlideOver
        open={Boolean(editTarget)}
        title={editTarget ? `Edit ${editTarget.username}` : ''}
        subtitle="Update role, status, or profile details."
        icon={UserRoundCog}
        onClose={closeEdit}
        footer={
          <>
            <button type="button" onClick={closeEdit} className="admin-btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={savingId === editTarget?.id}
              className="admin-btn-primary"
            >
              <Save size={13} />
              {savingId === editTarget?.id ? 'Saving...' : 'Save changes'}
            </button>
          </>
        }
      >
        {editDraft ? (
          <div className="grid gap-3 md:grid-cols-2">
            <FormField icon={ShieldCheck} label="Role">
              <select
                value={editDraft.role}
                onChange={(event) => setEditDraft((prev) => ({ ...prev, role: event.target.value }))}
                className="input-cosmic w-full"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </FormField>
            <FormField icon={Eye} label="Status">
              <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-subtle/55 bg-deep/45 px-3 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={Boolean(editDraft.is_active)}
                  onChange={(event) => setEditDraft((prev) => ({ ...prev, is_active: event.target.checked }))}
                />
                Active
              </label>
            </FormField>
            <FormField icon={IdCard} label="Full name">
              <input
                type="text"
                value={editDraft.full_name}
                onChange={(event) => setEditDraft((prev) => ({ ...prev, full_name: event.target.value }))}
                className="input-cosmic w-full"
              />
            </FormField>
            <FormField icon={AtSign} label="Email">
              <input
                type="email"
                value={editDraft.email}
                onChange={(event) => setEditDraft((prev) => ({ ...prev, email: event.target.value }))}
                className="input-cosmic w-full"
              />
            </FormField>
            <FormField icon={UserRoundCog} label="Username">
              <input
                type="text"
                value={editDraft.username}
                onChange={(event) => setEditDraft((prev) => ({ ...prev, username: event.target.value }))}
                className="input-cosmic w-full"
              />
            </FormField>
            <FormField icon={Building2} label="Organization">
              <input
                type="text"
                value={editDraft.organization}
                onChange={(event) => setEditDraft((prev) => ({ ...prev, organization: event.target.value }))}
                className="input-cosmic w-full"
              />
            </FormField>
            <FormField icon={BadgeCheck} label="Job title">
              <input
                type="text"
                value={editDraft.job_title}
                onChange={(event) => setEditDraft((prev) => ({ ...prev, job_title: event.target.value }))}
                className="input-cosmic w-full"
              />
            </FormField>
            <FormField icon={MapPin} label="Location">
              <input
                type="text"
                value={editDraft.location}
                onChange={(event) => setEditDraft((prev) => ({ ...prev, location: event.target.value }))}
                className="input-cosmic w-full"
              />
            </FormField>
            <FormField icon={GitBranch} label="GitHub URL" colSpan="md:col-span-2">
              <input
                type="text"
                value={editDraft.github_url}
                onChange={(event) => setEditDraft((prev) => ({ ...prev, github_url: event.target.value }))}
                className="input-cosmic w-full"
              />
            </FormField>
            <FormField icon={Camera} label="Avatar URL" colSpan="md:col-span-2">
              <input
                type="text"
                value={editDraft.profile_image}
                onChange={(event) => setEditDraft((prev) => ({ ...prev, profile_image: event.target.value }))}
                className="input-cosmic w-full"
              />
            </FormField>
            <FormField label="Bio" colSpan="md:col-span-2">
              <textarea
                value={editDraft.bio}
                onChange={(event) => setEditDraft((prev) => ({ ...prev, bio: event.target.value }))}
                rows={3}
                className="input-cosmic w-full resize-none"
              />
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

function RoleChips({ value, onChange }) {
  const options = [
    { value: '', label: 'All roles' },
    { value: 'admin', label: 'Admin' },
    { value: 'researcher', label: 'Researcher' },
    { value: 'viewer', label: 'Viewer' },
  ]
  return (
    <div className="admin-chip-group">
      {options.map((opt) => (
        <button
          key={opt.value || 'all'}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`admin-chip ${value === opt.value ? 'admin-chip-active' : ''}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function StatusChips({ value, onChange }) {
  const options = [
    { value: '', label: 'Any' },
    { value: 'active', label: 'Active' },
    { value: 'disabled', label: 'Disabled' },
  ]
  return (
    <div className="admin-chip-group">
      {options.map((opt) => (
        <button
          key={opt.value || 'all'}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`admin-chip ${value === opt.value ? 'admin-chip-active' : ''}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function FormField({ icon: Icon, label, required, colSpan = '', children }) {
  return (
    <label className={`block ${colSpan}`}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
        {Icon ? <Icon size={11} /> : null}
        <span>{label}{required ? <span className="text-aurora-rose"> *</span> : null}</span>
      </div>
      {children}
    </label>
  )
}

function SlideOver({ open, title, subtitle, icon: Icon, onClose, footer, children }) {
  useEffect(() => {
    if (!open) return
    const handler = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="admin-slideover-root">
      <button type="button" aria-label="Close" onClick={onClose} className="admin-slideover-backdrop" />
      <aside className="admin-slideover-panel">
        <header className="admin-slideover-header">
          <div className="flex items-center gap-3">
            {Icon ? (
              <div className="admin-slideover-icon">
                <Icon size={16} />
              </div>
            ) : null}
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
              {subtitle ? <p className="text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
            </div>
          </div>
          <button type="button" onClick={onClose} className="admin-icon-btn" aria-label="Close">
            <X size={14} />
          </button>
        </header>
        <div className="admin-slideover-body">{children}</div>
        <footer className="admin-slideover-footer">{footer}</footer>
      </aside>
    </div>
  )
}
