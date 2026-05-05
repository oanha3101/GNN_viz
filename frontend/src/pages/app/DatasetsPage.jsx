import { Database, Plus, RefreshCw, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EmptyState from '../../components/primitives/EmptyState'
import ErrorState from '../../components/primitives/ErrorState'
import LoadingState from '../../components/primitives/LoadingState'
import useAuthStore from '../../store/authStore'
import useGNNStore from '../../store/useGNNStore'
import { apiJson, normalizeCollectionPayload } from '../../utils/api'
import { SectionCard, SelectionButton } from '../shared/PageBlocks'

export default function DatasetsPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const activeDatasetId = useGNNStore((s) => s.activeDatasetId)
  const activeDatasetVersionId = useGNNStore((s) => s.activeDatasetVersionId)
  const datasetName = useGNNStore((s) => s.datasetName)
  const uploadedFilePath = useGNNStore((s) => s.uploadedFilePath)
  const uploadMetadata = useGNNStore((s) => s.uploadMetadata)
  const setActiveDatasetContext = useGNNStore((s) => s.setActiveDatasetContext)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [datasets, setDatasets] = useState([])
  const [selectedDatasetId, setSelectedDatasetId] = useState(null)
  const [datasetDetails, setDatasetDetails] = useState({})
  const [form, setForm] = useState({ name: '', description: '' })
  const [submitting, setSubmitting] = useState(false)

  const loadDatasets = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await apiJson('/datasets')
      const items = normalizeCollectionPayload(payload).items
      setDatasets(items)
      setSelectedDatasetId((prev) => prev || activeDatasetId || items[0]?.id || null)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [activeDatasetId])

  const loadDatasetDetail = useCallback(async (datasetId) => {
    if (!datasetId) return
    const payload = await apiJson(`/datasets/${datasetId}`)
    setDatasetDetails((prev) => ({ ...prev, [datasetId]: payload }))
  }, [])

  useEffect(() => {
    loadDatasets()
  }, [loadDatasets])

  useEffect(() => {
    if (selectedDatasetId && !datasetDetails[selectedDatasetId]) {
      loadDatasetDetail(selectedDatasetId).catch(setError)
    }
  }, [datasetDetails, loadDatasetDetail, selectedDatasetId])

  const currentDetail = selectedDatasetId ? datasetDetails[selectedDatasetId] : null

  const handleCreateDataset = useCallback(async () => {
    setSubmitting(true)
    setError(null)
    try {
      const payload = await apiJson('/datasets', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim() || datasetName || 'Custom Dataset',
          description: form.description.trim() || `Imported for ${datasetName || 'workspace'}`,
          summary_json: uploadMetadata || undefined,
          validation_json: uploadMetadata ? { source: 'datasets_page', valid: true } : undefined,
          processed_blob_key: uploadedFilePath || undefined,
        }),
      })
      setForm({ name: '', description: '' })
      setSelectedDatasetId(payload.dataset.id)
      setActiveDatasetContext(
        payload.dataset.id,
        payload.version.id,
        `${payload.dataset.name} • v${payload.version.version} (${payload.version.lifecycle})`
      )
      await loadDatasets()
      await loadDatasetDetail(payload.dataset.id)
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }, [datasetName, form.description, form.name, loadDatasetDetail, loadDatasets, setActiveDatasetContext, uploadMetadata, uploadedFilePath])

  const handlePublishVersion = useCallback(async (datasetId, versionId) => {
    try {
      await apiJson(`/datasets/${datasetId}/publish?version_id=${versionId}`, { method: 'POST' })
      await Promise.all([loadDatasets(), loadDatasetDetail(datasetId)])
    } catch (err) {
      setError(err)
    }
  }, [loadDatasetDetail, loadDatasets])

  const handleDeprecateVersion = useCallback(async (datasetId, versionId) => {
    try {
      await apiJson(`/datasets/${datasetId}/deprecate?version_id=${versionId}`, { method: 'POST' })
      await Promise.all([loadDatasets(), loadDatasetDetail(datasetId)])
    } catch (err) {
      setError(err)
    }
  }, [loadDatasetDetail, loadDatasets])

  const selectedDatasetRow = useMemo(
    () => datasets.find((item) => item.id === selectedDatasetId) || null,
    [datasets, selectedDatasetId]
  )

  if (loading) {
    return <LoadingState title="Loading datasets..." className="min-h-[480px]" />
  }

  if (error && datasets.length === 0) {
    return <ErrorState title="Could not load datasets" error={error} onRetry={loadDatasets} className="min-h-[480px]" />
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <SectionCard
        title="Create Dataset"
        subtitle="Promote the current upload into governed dataset metadata and versions."
        actions={
          <button
            type="button"
            onClick={() => navigate('/app/lab')}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200"
          >
            <Upload size={13} /> Open lab uploader
          </button>
        }
      >
        <div className="space-y-3">
          <input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder={datasetName || 'Dataset name'}
            className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-500/30"
          />
          <textarea
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="Dataset description"
            rows={5}
            className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-500/30"
          />
          <div className="rounded-2xl border border-slate-800/70 bg-slate-950/50 p-4 text-sm text-slate-300">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Upload summary</div>
            {uploadedFilePath ? (
              <div className="mt-3 space-y-1">
                <div>Source: <span className="font-mono text-cyan-300">{uploadedFilePath}</span></div>
                <div>Nodes: {uploadMetadata?.num_nodes ?? '?'} • Edges: {uploadMetadata?.num_edges ?? '?'} • Features: {uploadMetadata?.num_features ?? '?'}</div>
              </div>
            ) : (
              <div className="mt-3 text-slate-500">No current upload metadata. You can still create a metadata-only dataset record.</div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={handleCreateDataset}
              className="inline-flex items-center gap-2 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-300 disabled:opacity-50"
            >
              <Plus size={14} /> {submitting ? 'Creating...' : 'Create dataset'}
            </button>
            <button
              type="button"
              onClick={loadDatasets}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200"
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
          {error ? <div className="text-sm text-red-300">{error.message}</div> : null}
        </div>
      </SectionCard>

      <SectionCard title="Dataset Library" subtitle="Pick a dataset on the left, then select the version that should be trainable.">
        {datasets.length ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {datasets.map((dataset) => (
                <button
                  key={dataset.id}
                  type="button"
                  onClick={() => setSelectedDatasetId(dataset.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    selectedDatasetId === dataset.id
                      ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
                      : 'border-slate-700 bg-slate-900 text-slate-300'
                  }`}
                >
                  {dataset.name}
                </button>
              ))}
            </div>

            {currentDetail ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-800/70 bg-slate-950/50 p-4">
                  <div className="text-base font-semibold text-white">{selectedDatasetRow?.name}</div>
                  <div className="mt-1 text-sm text-slate-400">{selectedDatasetRow?.description || currentDetail.dataset.description || 'No description yet.'}</div>
                </div>
                {currentDetail.versions.map((version) => {
                  const canSelect =
                    version.lifecycle === 'published' ||
                    currentDetail.dataset.owner_id === user?.id ||
                    user?.role === 'admin'
                  const isActive = activeDatasetVersionId === version.id

                  return (
                    <div
                      key={version.id}
                      className={`rounded-3xl border p-5 ${
                        isActive ? 'border-cyan-500/25 bg-cyan-500/8' : 'border-slate-800/70 bg-slate-950/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-base font-semibold text-white">
                            v{version.version} • {version.lifecycle}
                          </div>
                          <div className="mt-1 text-sm text-slate-400">Schema {version.schema_version}</div>
                          <div className="mt-3 text-xs text-slate-500">
                            created={version.created_at || 'n/a'}{version.published_at ? ` • published=${version.published_at}` : ''}
                          </div>
                        </div>
                        <SelectionButton
                          active={isActive}
                          onClick={() =>
                            canSelect &&
                            setActiveDatasetContext(
                              currentDetail.dataset.id,
                              version.id,
                              `${currentDetail.dataset.name} • v${version.version} (${version.lifecycle})`
                            )
                          }
                        />
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {version.lifecycle !== 'published' ? (
                          <button
                            type="button"
                            onClick={() => handlePublishVersion(currentDetail.dataset.id, version.id)}
                            className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300"
                          >
                            Publish
                          </button>
                        ) : null}
                        {version.lifecycle !== 'deprecated' ? (
                          <button
                            type="button"
                            onClick={() => handleDeprecateVersion(currentDetail.dataset.id, version.id)}
                            className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300"
                          >
                            Deprecate
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptyState
                icon={<Database size={30} />}
                title="Select a dataset"
                description="Version details will appear here once the dataset is selected."
              />
            )}
          </div>
        ) : (
          <EmptyState
            icon={<Database size={30} />}
            title="No datasets yet"
            description="Create a dataset record first, then publish versions for training use."
          />
        )}
      </SectionCard>
    </div>
  )
}
