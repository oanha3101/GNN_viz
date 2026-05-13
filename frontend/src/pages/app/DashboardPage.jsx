import { ArrowRight, Database, FolderKanban, Upload } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EmptyState from '../../components/primitives/EmptyState'
import ErrorState from '../../components/primitives/ErrorState'
import LoadingState from '../../components/primitives/LoadingState'
import useGNNStore from '../../store/useGNNStore'
import { apiJson, normalizeCollectionPayload } from '../../utils/api'
import { SectionCard, StatCard } from '../shared/PageBlocks'

export default function DashboardPage() {
  const navigate = useNavigate()
  const activeProjectId = useGNNStore((s) => s.activeProjectId)
  const activeProjectName = useGNNStore((s) => s.activeProjectName)
  const activeDatasetVersionId = useGNNStore((s) => s.activeDatasetVersionId)
  const activeDatasetVersionName = useGNNStore((s) => s.activeDatasetVersionName)
  const datasetName = useGNNStore((s) => s.datasetName)
  const uploadedFilePath = useGNNStore((s) => s.uploadedFilePath)
  const uploadMetadata = useGNNStore((s) => s.uploadMetadata)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [projects, setProjects] = useState([])
  const [datasets, setDatasets] = useState([])

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [projectsPayload, datasetsPayload] = await Promise.all([
          apiJson('/projects'),
          apiJson('/datasets'),
        ])
        if (!active) return
        setProjects(normalizeCollectionPayload(projectsPayload).items)
        setDatasets(normalizeCollectionPayload(datasetsPayload).items)
      } catch (err) {
        if (active) setError(err)
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [])

  const selectedProject = useMemo(
    () => projects.find((item) => item.id === activeProjectId) || null,
    [projects, activeProjectId]
  )

  if (loading) {
    return <LoadingState title="Loading workspace dashboard..." className="min-h-[480px]" />
  }

  if (error) {
    return <ErrorState title="Could not load dashboard" error={error} onRetry={() => window.location.reload()} className="min-h-[480px]" />
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Projects" value={projects.length} />
        <StatCard label="Datasets" value={datasets.length} tone="emerald" />
        <StatCard label="Active Project" value={activeProjectId ? selectedProject?.title || '...' : '—'} tone="amber" />
        <StatCard label="Active Version" value={activeDatasetVersionName || '—'} tone="blue" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard
          title="Training Context"
          subtitle="Project and dataset context that will travel with your next training session."
          actions={
            <button
              type="button"
              onClick={() => navigate('/app/lab')}
              className="btn-galaxy inline-flex items-center gap-2 text-xs"
            >
              Open lab <ArrowRight size={13} />
            </button>
          }
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="glass-card p-4">
              <div className="text-micro uppercase tracking-ultra text-text-shadow">Project</div>
              <div className="mt-2 text-base font-semibold text-white-star">
                {activeProjectName || selectedProject?.title || 'No project selected'}
              </div>
            </div>
            <div className="glass-card p-4">
              <div className="text-micro uppercase tracking-ultra text-text-shadow">Dataset version</div>
              <div className="mt-2 text-base font-semibold text-white-star">
                {activeDatasetVersionName || (activeDatasetVersionId ? `Version #${activeDatasetVersionId}` : 'No dataset version selected')}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Current Upload"
          subtitle="Raw upload metadata stays visible here for traceability."
          actions={
            <button
              type="button"
              onClick={() => navigate('/app/datasets')}
              className="btn-nebula inline-flex items-center gap-2 text-xs"
            >
              Review datasets <Database size={13} />
            </button>
          }
        >
          {uploadedFilePath ? (
            <div className="space-y-3 text-sm text-starlight">
              <div>
                Dataset name: <span className="font-semibold text-white-star">{datasetName || 'Custom dataset'}</span>
              </div>
              <div>
                Processed path: <span className="font-mono text-aurora-cyan text-xs">{uploadedFilePath}</span>
              </div>
              <div className="text-twilight">
                Nodes: {uploadMetadata?.num_nodes ?? '?'} • Edges: {uploadMetadata?.num_edges ?? '?'} • Features: {uploadMetadata?.num_features ?? '?'}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<Upload size={28} />}
              title="No upload context yet"
              description="Upload a dataset in Lab first, then promote it into the governed dataset library."
              actionLabel="Open lab uploader"
              onAction={() => navigate('/app/lab')}
            />
          )}
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Project Readiness" subtitle="Quick guardrails before the next training run.">
          <div className="space-y-3">
            <ChecklistItem
              done={!!activeProjectId}
              label={activeProjectId ? 'Project context selected' : 'Select a project before training'}
              action={() => navigate('/app/projects')}
              actionLabel="Open projects"
            />
            <ChecklistItem
              done={!!activeDatasetVersionId}
              label={activeDatasetVersionId ? 'Dataset version selected' : 'Select a published dataset version'}
              action={() => navigate('/app/datasets')}
              actionLabel="Open datasets"
            />
            <ChecklistItem
              done={!!uploadedFilePath}
              label={uploadedFilePath ? 'Upload metadata available for traceability' : 'Optional: attach upload metadata before training'}
              action={() => navigate('/app/lab')}
              actionLabel="Open lab"
            />
          </div>
        </SectionCard>

        <SectionCard title="Quick Actions" subtitle="Navigate to key areas of the workspace.">
          <div className="grid gap-3 sm:grid-cols-2">
            <QuickAction icon={<FolderKanban size={18} />} label="Manage Projects" desc="Create and select project containers" onClick={() => navigate('/app/projects')} />
            <QuickAction icon={<Database size={18} />} label="Dataset Library" desc="Publish and manage dataset versions" onClick={() => navigate('/app/datasets')} />
            <QuickAction icon={<Upload size={18} />} label="Upload Data" desc="Import graph datasets for training" onClick={() => navigate('/app/lab')} />
            <QuickAction icon={<ArrowRight size={18} />} label="View Experiments" desc="Compare and replay training runs" onClick={() => navigate('/app/experiments')} />
          </div>
        </SectionCard>
      </div>
    </div>
  )
}

function ChecklistItem({ done, label, action, actionLabel }) {
  return (
    <div className="flex items-center justify-between gap-4 glass-card p-4">
      <div className="flex items-center gap-3">
        <span className={`h-2 w-2 rounded-full ${done ? 'bg-aurora-green' : 'bg-aurora-amber'}`} />
        <span className={`text-sm ${done ? 'text-starlight' : 'text-twilight'}`}>{label}</span>
      </div>
      <button
        type="button"
        onClick={action}
        className="btn-ghost text-xs"
      >
        {actionLabel}
      </button>
    </div>
  )
}

function QuickAction({ icon, label, desc, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-card flex items-start gap-3 p-4 text-left transition-all hover:border-line-active hover:glow-violet-sm"
    >
      <div className="mt-0.5 text-moonlight">{icon}</div>
      <div>
        <div className="text-sm font-semibold text-white-star">{label}</div>
        <div className="mt-1 text-xs text-twilight">{desc}</div>
      </div>
    </button>
  )
}
