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
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200"
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
            className="rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-500/30"
          />
          <input
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="Short description"
            className="rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-500/30"
          />
          <button
            type="button"
            disabled={submitting || !form.title.trim()}
            onClick={handleCreateProject}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-300 disabled:opacity-50"
          >
            <Plus size={14} /> {submitting ? 'Creating...' : 'Create'}
          </button>
        </div>
        {error ? <div className="mt-3 text-sm text-red-300">{error.message}</div> : null}
      </SectionCard>

      <SectionCard title="Project Library" subtitle="Select the active project that should own upcoming runs.">
        {projects.length ? (
          <div className="space-y-3">
            {projects.map((project) => (
              <div
                key={project.id}
                className={`rounded-3xl border p-5 ${
                  activeProjectId === project.id
                    ? 'border-cyan-500/25 bg-cyan-500/8'
                    : 'border-slate-800/70 bg-slate-950/50'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-base font-semibold text-white">{project.title}</div>
                    <div className="mt-1 text-sm text-slate-400">{project.description || 'No description yet.'}</div>
                    <div className="mt-3 text-xs text-slate-500">
                      owner={project.owner_id || 'system'} • {project.is_public ? 'public' : 'private'}
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
