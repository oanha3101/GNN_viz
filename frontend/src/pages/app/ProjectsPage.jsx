import { FolderKanban, Plus, RefreshCw } from 'lucide-react'
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
        title="Create Project"
        subtitle="Each experiment run should belong to a clear project container."
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
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
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
          <button
            type="button"
            disabled={submitting || !form.title.trim()}
            onClick={handleCreateProject}
            className="btn-galaxy inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Plus size={14} /> {submitting ? 'Creating...' : 'Create'}
          </button>
        </div>
        {error ? <div className="mt-3 text-sm text-aurora-rose">{error.message}</div> : null}
      </SectionCard>

      <SectionCard title="Project Library" subtitle="Select the active project that should own upcoming runs.">
        {projects.length ? (
          <div className="space-y-3">
            {projects.map((project) => (
              <div
                key={project.id}
                className={`glass-card p-5 transition-all ${
                  activeProjectId === project.id
                    ? 'border-amethyst/25 glow-violet-sm'
                    : ''
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-base font-semibold text-white-star">{project.title}</div>
                    <div className="mt-1 text-sm text-twilight">{project.description || 'No description yet.'}</div>
                    <div className="mt-3 flex items-center gap-3 text-xs text-text-shadow">
                      <span>owner: {project.owner_id || 'system'}</span>
                      <span className={`badge-cosmic ${project.is_public ? 'badge-aurora' : ''}`}>
                        {project.is_public ? 'public' : 'private'}
                      </span>
                    </div>
                  </div>
                  <SelectionButton
                    active={activeProjectId === project.id}
                    onClick={() => setActiveProjectContext(project.id, project.title)}
                  />
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
