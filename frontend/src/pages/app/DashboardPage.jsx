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
        <StatCard label="Active Project" value={activeProjectId || '—'} tone="amber" />
        <StatCard label="Active Version" value={activeDatasetVersionId || '—'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard
          title="Training Context"
          subtitle="This is the project and dataset context that will travel with your next training session."
          actions={
            <button
              type="button"
              onClick={() => navigate('/app/lab')}
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-300"
            >
              Open lab <ArrowRight size={13} />
            </button>
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-800/70 bg-slate-950/50 p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Project</div>
              <div className="mt-3 text-base font-semibold text-white">
                {activeProjectName || selectedProject?.title || 'No project selected'}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800/70 bg-slate-950/50 p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Dataset version</div>
              <div className="mt-3 text-base font-semibold text-white">
                {activeDatasetVersionName || (activeDatasetVersionId ? `Version #${activeDatasetVersionId}` : 'No dataset version selected')}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Current Upload"
          subtitle="Raw upload metadata stays visible here so the user does not have to remember what was imported."
          actions={
            <button
              type="button"
              onClick={() => navigate('/app/datasets')}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200"
            >
              Review datasets <Database size={13} />
            </button>
          }
        >
          {uploadedFilePath ? (
            <div className="space-y-3 text-sm text-slate-300">
              <div>
                Dataset name: <span className="font-semibold text-white">{datasetName || 'Custom dataset'}</span>
              </div>
              <div>
                Processed path: <span className="font-mono text-cyan-300">{uploadedFilePath}</span>
              </div>
              <div className="text-slate-400">
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

        <SectionCard title="What changed" subtitle="Phase 2 is turning the old modal workspace into product pages.">
          <div className="space-y-3 text-sm text-slate-300">
            <InfoRow icon={<FolderKanban size={15} />} label="Projects are now managed from a dedicated page route." />
            <InfoRow icon={<Database size={15} />} label="Datasets and versions keep their own lifecycle surface." />
            <InfoRow icon={<Upload size={15} />} label="Lab remains focused on training, replay, and upload actions." />
          </div>
        </SectionCard>
      </div>
    </div>
  )
}

function ChecklistItem({ done, label, action, actionLabel }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-800/70 bg-slate-950/50 p-4">
      <div className="flex items-center gap-3">
        <span className={`h-2.5 w-2.5 rounded-full ${done ? 'bg-emerald-400' : 'bg-amber-400'}`} />
        <span className={done ? 'text-slate-200' : 'text-slate-300'}>{label}</span>
      </div>
      <button
        type="button"
        onClick={action}
        className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200"
      >
        {actionLabel}
      </button>
    </div>
  )
}

function InfoRow({ icon, label }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-800/70 bg-slate-950/50 px-4 py-3">
      <div className="text-cyan-300">{icon}</div>
      <div>{label}</div>
    </div>
  )
}
