import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  FolderKanban,
  Globe,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  Trash2,
  X,
  Check,
} from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip } from 'recharts'
import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useState } from 'react'
import EmptyState from '../../components/primitives/EmptyState'
import ErrorState from '../../components/primitives/ErrorState'
import LoadingState from '../../components/primitives/LoadingState'
import useGNNStore from '../../store/useGNNStore'
import { apiJson, normalizeCollectionPayload } from '../../utils/api'

const VISIBILITY_FILTERS = [
  { value: '', label: 'All' },
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
]

const PAGE_SIZE = 9

function initialsFromTitle(title) {
  return (title || 'P')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || 'P'
}

function gradientFromId(id) {
  const palettes = [
    'linear-gradient(135deg, #fda4af 0%, #fb7185 100%)',
    'linear-gradient(135deg, #fdba74 0%, #f87171 100%)',
    'linear-gradient(135deg, #fca5a5 0%, #f97316 100%)',
    'linear-gradient(135deg, #fbcfe8 0%, #f472b6 100%)',
    'linear-gradient(135deg, #fde68a 0%, #fb923c 100%)',
    'linear-gradient(135deg, #fecaca 0%, #ef4444 100%)',
  ]
  return palettes[Math.abs(Number(id) || 0) % palettes.length]
}

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatRelative(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const diff = Date.now() - d.getTime()
  const min = 60 * 1000
  const hour = 60 * min
  const day = 24 * hour
  const week = 7 * day
  if (diff < min) return 'Just now'
  if (diff < hour) return `${Math.floor(diff / min)}m ago`
  if (diff < day) return `${Math.floor(diff / hour)}h ago`
  if (diff < week) return `${Math.floor(diff / day)}d ago`
  if (diff < 4 * week) return `${Math.floor(diff / week)}w ago`
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'az', label: 'A → Z' },
  { value: 'za', label: 'Z → A' },
]

export default function ProjectsPage() {
  const activeProjectId = useGNNStore((s) => s.activeProjectId)
  const setActiveProjectContext = useGNNStore((s) => s.setActiveProjectContext)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [projects, setProjects] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(PAGE_SIZE)

  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [visibility, setVisibility] = useState('')
  const [viewMode, setViewMode] = useState('grid')
  const [sortBy, setSortBy] = useState('newest')

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ title: '', description: '', is_public: false })
  const [submitting, setSubmitting] = useState(false)

  const [editTarget, setEditTarget] = useState(null)
  const [editForm, setEditForm] = useState({ title: '', description: '', is_public: false })

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])

  const loadProjects = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('page_size', String(pageSize))
      if (searchDebounced) params.set('search', searchDebounced)
      if (visibility) params.set('visibility', visibility)
      const payload = await apiJson(`/projects?${params.toString()}`)
      const normalized = normalizeCollectionPayload(payload)
      setProjects(normalized.items)
      setTotal(normalized.total)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, searchDebounced, visibility])

  useEffect(() => { loadProjects() }, [loadProjects])

  useEffect(() => { setPage(1) }, [searchDebounced, visibility])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const handleCreate = useCallback(async () => {
    if (!createForm.title.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const project = await apiJson('/projects', {
        method: 'POST',
        body: JSON.stringify({
          title: createForm.title.trim(),
          description: createForm.description.trim() || null,
          is_public: !!createForm.is_public,
        }),
      })
      setCreateForm({ title: '', description: '', is_public: false })
      setIsCreateOpen(false)
      setActiveProjectContext(project.id, project.title)
      await loadProjects()
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }, [createForm, loadProjects, setActiveProjectContext])

  const openEdit = useCallback((project) => {
    setEditTarget(project)
    setEditForm({
      title: project.title || '',
      description: project.description || '',
      is_public: !!project.is_public,
    })
  }, [])

  const handleEditSave = useCallback(async () => {
    if (!editTarget) return
    if (!editForm.title.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await apiJson(`/projects/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editForm.title.trim(),
          description: editForm.description.trim() || null,
          is_public: !!editForm.is_public,
        }),
      })
      setEditTarget(null)
      await loadProjects()
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }, [editForm, editTarget, loadProjects])

  const openDelete = useCallback((project) => {
    setDeleteTarget(project)
    setDeleteConfirmText('')
  }, [])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    if (deleteConfirmText.trim() !== deleteTarget.title) return
    setDeleting(true)
    setError(null)
    try {
      await apiJson(`/projects/${deleteTarget.id}`, { method: 'DELETE' })
      setDeleteTarget(null)
      setDeleteConfirmText('')
      if (activeProjectId === deleteTarget.id) {
        setActiveProjectContext(null, null)
      }
      await loadProjects()
    } catch (err) {
      setError(err)
    } finally {
      setDeleting(false)
    }
  }, [deleteConfirmText, deleteTarget, activeProjectId, setActiveProjectContext, loadProjects])

  const sortedProjects = useMemo(() => {
    const list = [...projects]
    switch (sortBy) {
      case 'oldest':
        return list.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
      case 'az':
        return list.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
      case 'za':
        return list.sort((a, b) => (b.title || '').localeCompare(a.title || ''))
      case 'newest':
      default:
        return list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    }
  }, [projects, sortBy])

  const headerStats = useMemo(() => ({
    visible: projects.length,
    total,
    activeName: projects.find((p) => p.id === activeProjectId)?.title || null,
  }), [projects, total, activeProjectId])

  if (loading && projects.length === 0) {
    return <LoadingState title="Loading projects..." className="min-h-[480px]" />
  }
  if (error && projects.length === 0) {
    return <ErrorState title="Could not load projects" error={error} onRetry={loadProjects} className="min-h-[480px]" />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="surface-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="surface-eyebrow">Project Workspace</div>
            <h2 className="surface-title">Projects ({headerStats.total})</h2>
            <p className="surface-sub">
              Group experiments under a shared context — the active project owns upcoming training runs.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={loadProjects} className="surface-action">
              <RefreshCw size={13} /> Refresh
            </button>
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="primary-cta inline-flex items-center gap-2"
            >
              <Plus size={14} /> Create project
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label className="relative flex min-w-[260px] flex-1 items-center">
            <Search size={14} className="pointer-events-none absolute left-3 text-fg-faint" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by title or description..."
              className="w-full rounded-xl border border-line-subtle bg-bg pl-9 pr-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
            />
          </label>
          <div className="flex items-center gap-1.5 rounded-xl border border-line-subtle bg-bg p-1">
            {VISIBILITY_FILTERS.map((option) => (
              <button
                key={option.value || 'all'}
                type="button"
                onClick={() => setVisibility(option.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  visibility === option.value
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-fg-muted hover:text-fg'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            className="rounded-xl border border-line-subtle bg-bg px-3 py-2 text-xs font-semibold text-fg focus:border-primary focus:outline-none"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>Sort: {opt.label}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Split layout: list (left) + insights (right) */}
      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban size={26} />}
          title={searchDebounced || visibility ? 'No matching projects' : 'No projects yet'}
          description={searchDebounced || visibility
            ? 'Try clearing filters or searching for something else.'
            : 'Create the first project so training sessions and saved runs have a governed home.'}
          actionLabel={searchDebounced || visibility ? 'Clear filters' : 'Create project'}
          onAction={() => {
            if (searchDebounced || visibility) {
              setSearch('')
              setVisibility('')
            } else {
              setIsCreateOpen(true)
            }
          }}
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
          {/* LEFT — clean project list */}
          <section className="surface-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line-subtle px-5 py-3">
              <div>
                <div className="surface-eyebrow">All projects</div>
                <div className="mt-0.5 text-sm font-bold text-fg">
                  {sortedProjects.length} project{sortedProjects.length === 1 ? '' : 's'}
                </div>
              </div>
              <div className="text-xs text-fg-muted">
                Page {page} of {totalPages}
              </div>
            </div>
            <ul className="divide-y divide-line-subtle">
              <AnimatePresence>
                {sortedProjects.map((project) => {
                  const isActive = activeProjectId === project.id
                  return (
                    <motion.li
                      layout
                      key={project.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.18 }}
                      className={`project-row ${isActive ? 'project-row-active' : ''}`}
                    >
                      <span className="project-row-avatar-md" style={{ background: gradientFromId(project.id) }}>
                        {initialsFromTitle(project.title)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-fg">{project.title}</span>
                          <span className={`project-vis-pill ${project.is_public ? 'is-public' : ''}`}>
                            {project.is_public ? <Globe size={10} /> : <Lock size={10} />}
                            {project.is_public ? 'Public' : 'Private'}
                          </span>
                          {isActive ? (
                            <span className="project-active-badge">
                              <span className="project-active-dot" /> Active
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 truncate text-xs text-fg-muted">
                          {project.description || 'No description yet.'}
                        </div>
                        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-fg-faint">
                          <span>#{project.id}</span>
                          <span>·</span>
                          <span>Owner #{project.owner_id ?? 'system'}</span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <Clock size={10} /> {formatRelative(project.updated_at || project.created_at)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setActiveProjectContext(project.id, project.title)}
                          disabled={isActive}
                          className={`project-row-set ${isActive ? 'is-active' : ''}`}
                        >
                          {isActive ? 'Selected' : 'Select'}
                        </button>
                        <button type="button" onClick={() => openEdit(project)} className="project-action-icon" aria-label="Edit">
                          <Pencil size={13} />
                        </button>
                        <button type="button" onClick={() => openDelete(project)} className="project-action-icon project-action-danger" aria-label="Delete">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </motion.li>
                  )
                })}
              </AnimatePresence>
            </ul>
          </section>

          {/* RIGHT — Insights side panel */}
          <ProjectsInsightsPanel
            total={total}
            projects={projects}
            activeProjectId={activeProjectId}
            onCreate={() => setIsCreateOpen(true)}
          />
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 ? (
        <div className="flex items-center justify-between rounded-2xl border border-line-subtle bg-bg-elev px-4 py-3">
          <div className="text-xs text-fg-muted">
            Showing <strong className="text-fg">{(page - 1) * pageSize + 1}</strong>–
            <strong className="text-fg">{Math.min(total, page * pageSize)}</strong> of{' '}
            <strong className="text-fg">{total}</strong>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="pager-btn"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 6).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPage(n)}
                className={`pager-btn ${page === n ? 'pager-btn-active' : ''}`}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="pager-btn"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      ) : null}

      {/* Create modal */}
      <ProjectModal
        open={isCreateOpen}
        title="Create project"
        eyebrow="New container"
        onClose={() => setIsCreateOpen(false)}
        form={createForm}
        setForm={setCreateForm}
        submitting={submitting}
        onSubmit={handleCreate}
        submitLabel="Create project"
      />

      {/* Edit modal */}
      <ProjectModal
        open={!!editTarget}
        title="Edit project"
        eyebrow={`Project #${editTarget?.id ?? ''}`}
        onClose={() => setEditTarget(null)}
        form={editForm}
        setForm={setEditForm}
        submitting={submitting}
        onSubmit={handleEditSave}
        submitLabel="Save changes"
      />

      {/* Delete modal */}
      <AnimatePresence>
        {deleteTarget ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-backdrop"
            onClick={() => setDeleteTarget(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              className="modal-card modal-card-danger"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-icon-danger"><AlertTriangle size={20} /></div>
              <h3 className="modal-title">Delete this project?</h3>
              <p className="modal-sub">
                This will remove <strong>{deleteTarget.title}</strong> and is irreversible.
                Type the project name to confirm.
              </p>
              <input
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                placeholder={deleteTarget.title}
                className="modal-input"
              />
              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="modal-btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleting || deleteConfirmText.trim() !== deleteTarget.title}
                  onClick={handleDelete}
                  className="modal-btn-danger disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Delete project'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function ProjectModal({ open, title, eyebrow, onClose, form, setForm, submitting, onSubmit, submitLabel }) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="modal-backdrop"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            className="modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="modal-eyebrow">{eyebrow}</div>
                <h3 className="modal-title">{title}</h3>
              </div>
              <button type="button" onClick={onClose} className="modal-close" aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="mt-5 space-y-4">
              <label className="modal-field">
                <span className="modal-field-label">Title</span>
                <input
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="e.g. Cora citation experiments"
                  className="modal-input"
                />
              </label>
              <label className="modal-field">
                <span className="modal-field-label">Description</span>
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Short description for the team"
                  rows={3}
                  className="modal-textarea"
                />
              </label>
              <label className="modal-toggle">
                <input
                  type="checkbox"
                  checked={!!form.is_public}
                  onChange={(event) => setForm((prev) => ({ ...prev, is_public: event.target.checked }))}
                />
                <span className="modal-toggle-track" />
                <span className="modal-field-label flex items-center gap-1.5">
                  {form.is_public ? <Globe size={12} /> : <Lock size={12} />}
                  {form.is_public ? 'Public — visible to other members' : 'Private — only you can see'}
                </span>
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={onClose} className="modal-btn-ghost">Cancel</button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={submitting || !form.title.trim()}
                className="modal-btn-primary disabled:opacity-50"
              >
                {submitting ? 'Saving...' : submitLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function ProjectsInsightsPanel({ total, projects, activeProjectId, onCreate }) {
  const stats = useMemo(() => {
    const totalLoaded = projects.length
    const publicCount = projects.filter((p) => p.is_public).length
    const privateCount = totalLoaded - publicCount
    const active = projects.find((p) => p.id === activeProjectId) || null
    const newest = [...projects].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null
    return { totalLoaded, publicCount, privateCount, active, newest }
  }, [projects, activeProjectId])

  const donutData = useMemo(() => [
    { name: 'Public', value: stats.publicCount },
    { name: 'Private', value: stats.privateCount },
  ], [stats.publicCount, stats.privateCount])

  const COLORS = ['#10b981', '#f43f5e']
  const hasData = stats.publicCount + stats.privateCount > 0

  return (
    <aside className="space-y-4">
      {/* Active project card */}
      <section className="surface-card p-5">
        <div className="surface-eyebrow flex items-center gap-1">
          <Sparkles size={11} /> Active project
        </div>
        {stats.active ? (
          <div className="mt-3 space-y-2.5">
            <div className="flex items-center gap-3">
              <span className="project-row-avatar-md" style={{ background: gradientFromId(stats.active.id) }}>
                {initialsFromTitle(stats.active.title)}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-fg">{stats.active.title}</div>
                <div className="text-xs text-fg-muted">#{stats.active.id} · Owner #{stats.active.owner_id ?? 'system'}</div>
              </div>
            </div>
            <div className="text-xs text-fg-muted line-clamp-2">
              {stats.active.description || 'No description yet.'}
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-line bg-bg p-4 text-xs text-fg-muted">
            No project selected. Pick one in the list to make it the context for upcoming experiments.
          </div>
        )}
      </section>

      {/* Donut: visibility */}
      <section className="surface-card p-5">
        <div className="flex items-center justify-between">
          <div className="surface-eyebrow">Visibility mix</div>
          <div className="text-xs font-semibold text-fg-muted">{stats.totalLoaded} loaded</div>
        </div>
        <div className="mt-3 grid grid-cols-[1fr_140px] items-center gap-3">
          <div className="space-y-2">
            <div className="insight-row">
              <span className="insight-dot" style={{ background: COLORS[0] }} />
              <span>Public</span>
              <strong className="ml-auto">{stats.publicCount}</strong>
            </div>
            <div className="insight-row">
              <span className="insight-dot" style={{ background: COLORS[1] }} />
              <span>Private</span>
              <strong className="ml-auto">{stats.privateCount}</strong>
            </div>
            <div className="insight-row">
              <span className="insight-dot" style={{ background: 'var(--c-fg-muted)' }} />
              <span>Total (server)</span>
              <strong className="ml-auto">{total}</strong>
            </div>
          </div>
          <div className="h-[120px]">
            {hasData ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    innerRadius={32}
                    outerRadius={52}
                    paddingAngle={2}
                    stroke="var(--c-bg-elev)"
                    strokeWidth={2}
                  >
                    {donutData.map((entry, idx) => (
                      <Cell key={entry.name} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <ReTooltip
                    contentStyle={{
                      background: 'var(--c-bg-elev)',
                      border: '1px solid var(--c-border-subtle)',
                      borderRadius: 10,
                      fontSize: 11,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-xs text-fg-faint">No data</div>
            )}
          </div>
        </div>
      </section>

      {/* Quick action */}
      <section className="surface-card p-5">
        <div className="surface-eyebrow flex items-center gap-1">
          <TrendingUp size={11} /> Quick start
        </div>
        {stats.newest ? (
          <div className="mt-3 flex items-center gap-3">
            <span className="project-row-avatar-md" style={{ background: gradientFromId(stats.newest.id) }}>
              {initialsFromTitle(stats.newest.title)}
            </span>
            <div className="min-w-0">
              <div className="text-xs text-fg-muted">Last added</div>
              <div className="text-xs text-fg-muted">{formatRelative(stats.newest.created_at)}</div>
            </div>
          </div>
        ) : (
          <div className="mt-2 text-xs text-fg-muted">Nothing yet.</div>
        )}
        <button
          type="button"
          onClick={onCreate}
          className="primary-cta mt-4 inline-flex w-full items-center justify-center gap-2"
        >
          <Plus size={14} /> Create another project
        </button>
      </section>
    </aside>
  )
}
