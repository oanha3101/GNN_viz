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
            className="btn-ghost inline-flex items-center gap-2 text-xs"
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
            className="input-cosmic w-full"
          />
          <textarea
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="Dataset description"
            rows={4}
            className="input-cosmic w-full resize-none"
          />
          <div className="glass-card p-4">
            <div className="text-micro uppercase tracking-ultra text-text-shadow">Upload summary</div>
            {uploadedFilePath ? (
              <div className="mt-3 space-y-1 text-sm text-starlight">
                <div>Source: <span className="font-mono text-aurora-cyan text-xs">{uploadedFilePath}</span></div>
                <div className="text-twilight">Nodes: {uploadMetadata?.num_nodes ?? '?'} • Edges: {uploadMetadata?.num_edges ?? '?'} • Features: {uploadMetadata?.num_features ?? '?'}</div>
              </div>
            ) : (
              <div className="mt-3 text-xs text-text-shadow">No current upload metadata. You can still create a metadata-only dataset record.</div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={handleCreateDataset}
              className="btn-galaxy inline-flex items-center gap-2 disabled:opacity-50"
            >
              <Plus size={14} /> {submitting ? 'Creating...' : 'Create dataset'}
            </button>
            <button
              type="button"
              onClick={loadDatasets}
              className="btn-nebula inline-flex items-center gap-2"
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
          {error ? <div className="text-sm text-aurora-rose">{error.message}</div> : null}
        </div>
      </SectionCard>

      <SectionCard title="Dataset Library" subtitle="Pick a dataset, then select the version that should be trainable.">
        {datasets.length ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {datasets.map((dataset) => (
                <button
                  key={dataset.id}
                  type="button"
                  onClick={() => setSelectedDatasetId(dataset.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                    selectedDatasetId === dataset.id
                      ? 'border-amethyst/30 bg-amethyst/[0.12] text-moonlight'
                      : 'border-line-default bg-deep text-twilight hover:border-line-active'
                  }`}
                >
                  {dataset.name}
                </button>
              ))}
            </div>

            {currentDetail ? (
              <div className="space-y-3">
                <div className="glass-card p-4">
                  <div className="text-base font-semibold text-white-star">{selectedDatasetRow?.name}</div>
                  <div className="mt-1 text-sm text-twilight">{selectedDatasetRow?.description || currentDetail.dataset.description || 'No description yet.'}</div>
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
                      className={`glass-card p-5 transition-all ${
                        isActive ? 'border-amethyst/25 glow-violet-sm' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-base font-semibold text-white-star">
                            v{version.version} • {version.lifecycle}
                          </div>
                          <div className="mt-1 text-sm text-twilight">Schema {version.schema_version}</div>
                          <div className="mt-3 flex items-center gap-3 text-xs text-text-shadow">
                            <span>created: {version.created_at || 'n/a'}</span>
                            {version.published_at ? <span>published: {version.published_at}</span> : null}
                          </div>
                        </div>
                        <SelectionButton
                          active={isActive}
                          disabled={!canSelect}
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
                            className="rounded-lg border border-aurora-green/20 bg-aurora-green/[0.08] px-3 py-2 text-xs font-semibold text-aurora-green transition-all hover:bg-aurora-green/[0.15]"
                          >
                            Publish
                          </button>
                        ) : null}
                        {version.lifecycle !== 'deprecated' ? (
                          <button
                            type="button"
                            onClick={() => handleDeprecateVersion(currentDetail.dataset.id, version.id)}
                            className="rounded-lg border border-aurora-amber/20 bg-aurora-amber/[0.08] px-3 py-2 text-xs font-semibold text-aurora-amber transition-all hover:bg-aurora-amber/[0.15]"
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
