import { FolderKanban, Plus, RefreshCw, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import EmptyState from '../../components/primitives/EmptyState'
import ErrorState from '../../components/primitives/ErrorState'
import LoadingState from '../../components/primitives/LoadingState'
import useGNNStore from '../../store/useGNNStore'
import { apiJson, normalizeCollectionPayload } from '../../utils/api'
import { SectionCard, SelectionButton } from '../shared/PageBlocks'

export default function ProjectsPage() {
  const activeProjectId = useGNNStore((s) => s.activeProjectId)
  const setActiveProjectContext = useGNNStore((s) => s.setActiveProjectContext)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [projects, setProjects] = useState([])
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [form, setForm] = useState({ title: '', description: '' })
  const [submitting, setSubmitting] = useState(false)

  const loadProjects = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await apiJson('/projects')
      setProjects(normalizeCollectionPayload(payload).items)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const handleCreateProject = useCallback(async () => {
    if (!form.title.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const project = await apiJson('/projects', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
        }),
      })
      setForm({ title: '', description: '' })
      setIsCreateOpen(false)
      setActiveProjectContext(project.id, project.title)
      await loadProjects()
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }, [form.description, form.title, loadProjects, setActiveProjectContext])

  if (loading) {
    return <LoadingState title="Loading projects..." className="min-h-[480px]" />
  }

  if (error && projects.length === 0) {
    return <ErrorState title="Could not load projects" error={error} onRetry={loadProjects} className="min-h-[480px]" />
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Project Setup"
        subtitle="Keep project creation tucked away until you need a new governed space for upcoming runs."
        actions={
          <button
            type="button"
            onClick={loadProjects}
            className="btn-ghost inline-flex items-center gap-2 text-xs"
          >
            <RefreshCw size={13} /> Refresh
          </button>
        }
      >
        <div className="workspace-create-banner">
          <div>
            <div className="text-sm font-semibold text-white-star">Create project</div>
            <div className="mt-1 text-xs text-twilight">
              Open a draft only when you are ready to group experiments under a shared context.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsCreateOpen((prev) => !prev)}
            className="btn-galaxy inline-flex items-center justify-center gap-2"
          >
            <Plus size={14} /> {isCreateOpen ? 'Close form' : 'Create project'}
          </button>
        </div>
        {isCreateOpen ? (
          <div className="workspace-edit-card mt-4">
            <div className="workspace-edit-banner">
              <Sparkles size={13} />
              New project
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Project title"
                className="input-cosmic"
              />
              <input
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Short description"
                className="input-cosmic"
              />
            </div>
            <div className="workspace-inline-actions mt-4">
              <button
                type="button"
                onClick={() => {
                  setForm({ title: '', description: '' })
                  setIsCreateOpen(false)
                }}
                className="btn-ghost inline-flex items-center gap-2"
              >
                <X size={14} /> Cancel
              </button>
              <button
                type="button"
                disabled={submitting || !form.title.trim()}
                onClick={handleCreateProject}
                className="btn-galaxy inline-flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Plus size={14} /> {submitting ? 'Creating...' : 'Create project'}
              </button>
            </div>
            {error ? <div className="mt-3 text-sm text-aurora-rose">{error.message}</div> : null}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Project Library" subtitle="Select the active project that should own upcoming runs.">
        {projects.length ? (
          <div className="space-y-3">
            {projects.map((project) => (
              <div
                key={project.id}
                className={`workspace-record-card ${
                  activeProjectId === project.id
                    ? 'border-amethyst/25 glow-violet-sm'
                    : ''
                }`}
              >
                <div className="workspace-project-card">
                  <div className="workspace-project-copy">
                    <div className="text-base font-semibold text-white-star">{project.title}</div>
                    <div className="mt-1 text-sm text-twilight">{project.description || 'No description yet.'}</div>
                    <div className="workspace-project-meta">
                      <div className="workspace-info-item">
                        <span className="workspace-info-label">Owner</span>
                        <strong>{project.owner_id || 'system'}</strong>
                      </div>
                      <div className="workspace-info-item">
                        <span className="workspace-info-label">Visibility</span>
                        <strong>{project.is_public ? 'Public' : 'Private'}</strong>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-3 text-xs text-text-shadow">
                      <span className={`badge-cosmic ${project.is_public ? 'badge-aurora' : ''}`}>
                        {project.is_public ? 'public' : 'private'}
                      </span>
                    </div>
                  </div>
                  <div className="workspace-project-actions">
                    <SelectionButton
                      active={activeProjectId === project.id}
                      onClick={() => setActiveProjectContext(project.id, project.title)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<FolderKanban size={30} />}
            title="No projects yet"
            description="Create the first project so training sessions and saved runs have a governed home."
          />
        )}
      </SectionCard>
    </div>
  )
}
