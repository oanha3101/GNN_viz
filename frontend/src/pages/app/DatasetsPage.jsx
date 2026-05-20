import { AlertCircle, CheckCircle2, Database, PencilLine, Plus, Save, Sparkles, Trash2, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import DataInputView from '../../components/UploadPanel/DataInputView'
import EmptyState from '../../components/primitives/EmptyState'
import ErrorState from '../../components/primitives/ErrorState'
import LoadingState from '../../components/primitives/LoadingState'
import useAuthStore from '../../store/authStore'
import useGNNStore from '../../store/useGNNStore'
import { apiJson, normalizeCollectionPayload } from '../../utils/api'
import { AdminPagination } from '../admin/AdminListControls'
import { SectionCard, SelectionButton } from '../shared/PageBlocks'

export default function DatasetsPage() {
  const user = useAuthStore((s) => s.user)
  const activeDatasetId = useGNNStore((s) => s.activeDatasetId)
  const activeDatasetVersionId = useGNNStore((s) => s.activeDatasetVersionId)
  const datasetName = useGNNStore((s) => s.datasetName)
  const uploadedFilePath = useGNNStore((s) => s.uploadedFilePath)
  const uploadMetadata = useGNNStore((s) => s.uploadMetadata)
  const setActiveDatasetContext = useGNNStore((s) => s.setActiveDatasetContext)
  const setUploadedFilePath = useGNNStore((s) => s.setUploadedFilePath)
  const setUploadMetadata = useGNNStore((s) => s.setUploadMetadata)
  const setTaskConfig = useGNNStore((s) => s.setTaskConfig)
  const setDatasetName = useGNNStore((s) => s.setDatasetName)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [datasets, setDatasets] = useState([])
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isUploaderOpen, setIsUploaderOpen] = useState(false)
  const [intakeMode, setIntakeMode] = useState('upload')
  const [selectedDatasetId, setSelectedDatasetId] = useState(null)
  const [datasetDetails, setDatasetDetails] = useState({})
  const [form, setForm] = useState({ name: '', description: '' })
  const [submitting, setSubmitting] = useState(false)
  const [versionSubmitting, setVersionSubmitting] = useState(false)
  const [editingDatasetId, setEditingDatasetId] = useState(null)
  const [datasetDrafts, setDatasetDrafts] = useState({})
  const [busyAction, setBusyAction] = useState(null)
  const [versionPage, setVersionPage] = useState(1)
  const [versionPageSize, setVersionPageSize] = useState(4)
  const [draggingUpload, setDraggingUpload] = useState(false)
  const [dropTargetDatasetId, setDropTargetDatasetId] = useState(null)

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

  useEffect(() => {
    setVersionPage(1)
  }, [selectedDatasetId])

  const currentDetail = selectedDatasetId ? datasetDetails[selectedDatasetId] : null
  const currentDatasetDraft = selectedDatasetId ? datasetDrafts[selectedDatasetId] : null
  const versionTotal = currentDetail?.versions?.length || 0
  const versionTotalPages = Math.max(1, Math.ceil(versionTotal / versionPageSize))
  const safeVersionPage = Math.min(versionPage, versionTotalPages)
  const visibleVersions = useMemo(() => {
    if (!currentDetail?.versions) return []
    const start = (safeVersionPage - 1) * versionPageSize
    return currentDetail.versions.slice(start, start + versionPageSize)
  }, [currentDetail?.versions, safeVersionPage, versionPageSize])

  useEffect(() => {
    if (versionPage !== safeVersionPage) {
      setVersionPage(safeVersionPage)
    }
  }, [safeVersionPage, versionPage])

  const applyDatasetVersionContext = useCallback((dataset, version) => {
    setActiveDatasetContext(
      dataset.id,
      version.id,
      `${dataset.name} - v${version.version} (${version.lifecycle})`
    )
    setDatasetName(dataset.name)
    setUploadedFilePath(version.processed_blob_key || null)
    setUploadMetadata(version.summary_json || null)
    setTaskConfig(version.summary_json?.task_profile_config || null)
  }, [setActiveDatasetContext, setDatasetName, setTaskConfig, setUploadMetadata, setUploadedFilePath])

  const handleCreateDataset = useCallback(async () => {
    setSubmitting(true)
    setError(null)
    try {
      const isUploadMode = intakeMode === 'upload'
      const payload = await apiJson('/datasets', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim() || datasetName || 'Custom Dataset',
          description:
            form.description.trim() ||
            (isUploadMode
              ? `Imported for ${datasetName || 'workspace'}`
              : 'Metadata-only dataset record'),
          summary_json: isUploadMode ? uploadMetadata || undefined : undefined,
          validation_json: isUploadMode && uploadMetadata ? { source: 'datasets_page', valid: true } : undefined,
          processed_blob_key: isUploadMode ? uploadedFilePath || undefined : undefined,
        }),
      })
      setForm({ name: '', description: '' })
      setIsCreateOpen(false)
      setSelectedDatasetId(payload.dataset.id)
      if (payload.version?.processed_blob_key) {
        applyDatasetVersionContext(payload.dataset, payload.version)
      }
      await loadDatasets()
      await loadDatasetDetail(payload.dataset.id)
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }, [applyDatasetVersionContext, datasetName, form.description, form.name, intakeMode, loadDatasetDetail, loadDatasets, uploadMetadata, uploadedFilePath])

  const handleAttachUploadToDataset = useCallback(async (datasetId) => {
    if (!datasetId || !uploadedFilePath) return
    setVersionSubmitting(true)
    setError(null)
    try {
      await apiJson(`/datasets/${datasetId}/versions`, {
        method: 'POST',
        body: JSON.stringify({
          summary_json: uploadMetadata || undefined,
          validation_json: uploadMetadata ? { source: 'datasets_page', valid: true } : undefined,
          processed_blob_key: uploadedFilePath || undefined,
        }),
      })
      const detail = await apiJson(`/datasets/${datasetId}`)
      setDatasetDetails((prev) => ({ ...prev, [datasetId]: detail }))
      if (detail?.dataset && Array.isArray(detail?.versions) && detail.versions.length > 0) {
        applyDatasetVersionContext(detail.dataset, detail.versions[0])
      }
      setSelectedDatasetId(datasetId)
      await loadDatasets()
    } catch (err) {
      setError(err)
    } finally {
      setVersionSubmitting(false)
      setDraggingUpload(false)
      setDropTargetDatasetId(null)
    }
  }, [applyDatasetVersionContext, loadDatasets, uploadMetadata, uploadedFilePath])

  const handleCreateVersionFromUpload = useCallback(async () => {
    await handleAttachUploadToDataset(selectedDatasetId)
  }, [handleAttachUploadToDataset, selectedDatasetId])

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

  const openDatasetEdit = useCallback((dataset) => {
    setDatasetDrafts((prev) => ({
      ...prev,
      [dataset.id]: {
        name: dataset.name || '',
        description: dataset.description || '',
        is_public: Boolean(dataset.is_public),
      },
    }))
    setEditingDatasetId(dataset.id)
  }, [])

  const cancelDatasetEdit = useCallback((dataset) => {
    setDatasetDrafts((prev) => ({
      ...prev,
      [dataset.id]: {
        name: dataset.name || '',
        description: dataset.description || '',
        is_public: Boolean(dataset.is_public),
      },
    }))
    setEditingDatasetId((current) => (current === dataset.id ? null : current))
  }, [])

  const handleUpdateDataset = useCallback(async (dataset) => {
    try {
      setBusyAction(`save-${dataset.id}`)
      setError(null)
      const draft = datasetDrafts[dataset.id] || {}
      await apiJson(`/datasets/${dataset.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: draft.name,
          description: draft.description,
          is_public: draft.is_public,
        }),
      })
      setEditingDatasetId(null)
      await Promise.all([loadDatasets(), loadDatasetDetail(dataset.id)])
    } catch (err) {
      setError(err)
    } finally {
      setBusyAction(null)
    }
  }, [datasetDrafts, loadDatasetDetail, loadDatasets])

  const handleDeleteDataset = useCallback(async (dataset) => {
    const confirmed = window.confirm(`Delete dataset "${dataset.name}"?`)
    if (!confirmed) return

    try {
      setBusyAction(`delete-${dataset.id}`)
      setError(null)
      await apiJson(`/datasets/${dataset.id}`, { method: 'DELETE' })

      const remaining = datasets.filter((item) => item.id !== dataset.id)
      const nextSelectedId = remaining[0]?.id || null

      if (activeDatasetId === dataset.id) {
        setActiveDatasetContext(null, null, null)
        setDatasetName(null)
        setUploadedFilePath(null)
        setUploadMetadata(null)
        setTaskConfig(null)
      }

      setDatasetDetails((prev) => {
        const next = { ...prev }
        delete next[dataset.id]
        return next
      })
      setSelectedDatasetId(nextSelectedId)
      await loadDatasets()
      if (nextSelectedId) {
        await loadDatasetDetail(nextSelectedId)
      }
    } catch (err) {
      setError(err)
    } finally {
      setBusyAction(null)
    }
  }, [activeDatasetId, datasets, loadDatasetDetail, loadDatasets, setActiveDatasetContext, setDatasetName, setTaskConfig, setUploadMetadata, setUploadedFilePath])

  const selectedDatasetRow = useMemo(
    () => datasets.find((item) => item.id === selectedDatasetId) || null,
    [datasets, selectedDatasetId]
  )
  const selectedSampleCatalog = selectedDatasetRow?.sample_catalog || null
  const selectedRecommendedTask = selectedDatasetRow?.recommended_task_label || selectedDatasetRow?.current_version_summary?.task_profile_name || null
  const hasUploadReady = Boolean(uploadedFilePath)
  const canManageSelectedDataset = Boolean(
    currentDetail?.dataset && (user?.role === 'admin' || currentDetail.dataset.owner_id === user?.id)
  )
  const handleOpenUploader = useCallback(() => {
    if (currentDetail?.dataset) {
      const preferredVersion = currentDetail.versions?.find((version) => version.id === activeDatasetVersionId)
        || currentDetail.versions?.[0]
        || null
      if (preferredVersion) {
        applyDatasetVersionContext(currentDetail.dataset, preferredVersion)
      }
    }
    setIsUploaderOpen(true)
  }, [activeDatasetVersionId, applyDatasetVersionContext, currentDetail])

  const handleCloseUploader = useCallback(async () => {
    setIsUploaderOpen(false)
    await loadDatasets()
    if (selectedDatasetId) {
      await loadDatasetDetail(selectedDatasetId)
    }
  }, [loadDatasetDetail, loadDatasets, selectedDatasetId])

  const handleUploadDragStart = useCallback((event) => {
    if (!hasUploadReady) return
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', uploadedFilePath || 'pending-upload')
    setDraggingUpload(true)
  }, [hasUploadReady, uploadedFilePath])

  const handleUploadDragEnd = useCallback(() => {
    setDraggingUpload(false)
    setDropTargetDatasetId(null)
  }, [])

  const handleDatasetDragOver = useCallback((event, datasetId) => {
    if (!hasUploadReady) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTargetDatasetId(datasetId)
  }, [hasUploadReady])

  const handleDatasetDragLeave = useCallback((datasetId) => {
    setDropTargetDatasetId((current) => (current === datasetId ? null : current))
  }, [])

  const handleDatasetDrop = useCallback(async (event, datasetId) => {
    if (!hasUploadReady) return
    event.preventDefault()
    setDropTargetDatasetId(null)
    await handleAttachUploadToDataset(datasetId)
  }, [handleAttachUploadToDataset, hasUploadReady])

  if (loading) {
    return <LoadingState title="Loading datasets..." className="min-h-[480px]" />
  }

  if (error && datasets.length === 0) {
    return <ErrorState title="Could not load datasets" error={error} onRetry={loadDatasets} className="min-h-[480px]" />
  }

  return (
    <div className="space-y-5">
      <div className="workspace-info-grid">
        <div className="workspace-info-item">
          <span className="workspace-info-label">Pending Upload</span>
          <strong>{hasUploadReady ? 'Ready to attach' : 'No upload yet'}</strong>
        </div>
        <div className="workspace-info-item">
          <span className="workspace-info-label">Selected Dataset</span>
          <strong>{currentDetail?.dataset?.name || 'Nothing selected yet'}</strong>
        </div>
        <div className="workspace-info-item">
          <span className="workspace-info-label">Active Version</span>
          <strong>
            {activeDatasetVersionId
              ? currentDetail?.versions?.find((version) => version.id === activeDatasetVersionId)?.lifecycle || 'Selected'
              : 'No active version'}
          </strong>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
        <SectionCard
          title="Pending Upload"
          subtitle={
            hasUploadReady
              ? 'Drag this upload onto a dataset card on the right, or turn it into a brand-new dataset.'
              : 'Bring one payload into the workspace here. Once it exists, you can drop it onto any dataset beside it.'
          }
          className="h-fit"
          actions={
            <button
              type="button"
              onClick={handleOpenUploader}
              className="btn-nebula inline-flex items-center gap-2 text-xs"
            >
              <Upload size={13} /> Open uploader
            </button>
          }
        >
          <div className="space-y-4">
            <UploadSummary
              uploadedFilePath={uploadedFilePath}
              uploadMetadata={uploadMetadata}
              isUploadMode
              draggable={hasUploadReady}
              isDragging={draggingUpload}
              onDragStart={handleUploadDragStart}
              onDragEnd={handleUploadDragEnd}
            />

            {hasUploadReady ? (
              <InlineCallout
                tone={selectedDatasetId ? 'ok' : 'neutral'}
                title={selectedDatasetId ? 'Drop it on the right, or attach it directly' : 'Choose a dataset on the right'}
                copy={
                  selectedDatasetId
                    ? 'Dataset cards on the right are drop targets. If you already know the destination, use the button below.'
                    : 'After you pick a dataset from the library, you can either drop the upload onto that card or create a new dataset from it.'
                }
              />
            ) : (
              <InlineCallout
                tone="neutral"
                title="Nothing is waiting in intake"
                copy="Open the uploader when you want to bring in a new payload. Until then, the library on the right is only for browsing records and versions."
              />
            )}

            {hasUploadReady && selectedDatasetId ? (
              <div className="workspace-create-banner">
                <div>
                  <div className="text-sm font-semibold text-white-star">Quick attach</div>
                  <div className="mt-1 text-xs leading-6 text-twilight">
                    Attach this pending upload straight into the currently selected dataset.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCreateVersionFromUpload}
                  disabled={versionSubmitting}
                  className="btn-galaxy inline-flex items-center gap-2 text-xs disabled:opacity-50"
                >
                  <Upload size={14} /> {versionSubmitting ? 'Attaching...' : 'Attach to selected'}
                </button>
              </div>
            ) : null}

            <div className="workspace-create-banner">
              <div>
                <div className="text-sm font-semibold text-white-star">Create a dataset record</div>
                <div className="mt-1 text-xs leading-6 text-twilight">
                  Use this when the upload belongs in a brand-new dataset instead of an existing one.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen((prev) => !prev)}
                className="btn-galaxy inline-flex items-center gap-2"
              >
                <Plus size={14} /> {isCreateOpen ? 'Close form' : 'Create dataset'}
              </button>
            </div>

            {isCreateOpen ? (
              <div className="workspace-edit-card space-y-3">
                <div className="workspace-edit-banner">
                  <Sparkles size={13} />
                  {intakeMode === 'upload' ? 'Create a dataset from the pending upload' : 'Create an empty dataset container first'}
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setIntakeMode('upload')}
                    className={`rounded-2xl border px-4 py-3 text-left transition-all ${
                      intakeMode === 'upload'
                        ? 'border-amethyst/30 bg-amethyst/[0.12] text-moonlight'
                        : 'border-line-default bg-deep text-twilight hover:border-line-active'
                    }`}
                  >
                    <div className="text-sm font-semibold">From pending upload</div>
                    <div className="mt-1 text-xs leading-5">
                      Create the dataset and make the current upload become version 1 right away.
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIntakeMode('record')}
                    className={`rounded-2xl border px-4 py-3 text-left transition-all ${
                      intakeMode === 'record'
                        ? 'border-amethyst/30 bg-amethyst/[0.12] text-moonlight'
                        : 'border-line-default bg-deep text-twilight hover:border-line-active'
                    }`}
                  >
                    <div className="text-sm font-semibold">Empty container first</div>
                    <div className="mt-1 text-xs leading-5">
                      Register the dataset name now and attach real versions later when you are ready.
                    </div>
                  </button>
                </div>
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
                {intakeMode === 'upload' && !hasUploadReady ? (
                  <InlineCallout
                    tone="warn"
                    title="No pending upload attached"
                    copy="Open the uploader first if you want this new dataset to start with a real trainable payload in version 1."
                  />
                ) : null}
                <div className="workspace-inline-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setForm({ name: '', description: '' })
                      setIsCreateOpen(false)
                    }}
                    className="btn-ghost inline-flex items-center gap-2"
                  >
                    <X size={14} /> Cancel
                  </button>
                  <button
                    type="button"
                    disabled={submitting || (intakeMode === 'upload' && !hasUploadReady)}
                    onClick={handleCreateDataset}
                    className="btn-galaxy inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    <Plus size={14} /> {submitting ? 'Creating...' : intakeMode === 'upload' ? 'Create dataset from upload' : 'Create empty dataset'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard
          title="Dataset Library"
          subtitle="Starter samples are pinned first. Choose a dataset below, then attach new uploads or activate the exact version you want Lab to use."
        >
          {datasets.length ? (
            <div className="space-y-5">
              <div className={`rounded-2xl border px-4 py-3 transition-all ${
                draggingUpload
                  ? 'border-aurora-cyan/30 bg-aurora-cyan/[0.10] text-moonlight'
                  : 'border-line-default bg-deep text-twilight'
              }`}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-shadow">
                  Dataset targets
                </div>
                <div className="mt-2 text-xs leading-6">
                  {hasUploadReady
                    ? draggingUpload
                      ? 'Release the pending upload over any dataset card below.'
                      : 'Drag the pending upload from the left and drop it onto the dataset that should receive the new version.'
                    : 'Choose a dataset first. When an upload exists, these cards become drop targets.'}
                </div>
              </div>

              <div className="custom-scrollbar flex gap-3 overflow-x-auto pb-2">
                {datasets.map((dataset) => {
                  const isSelected = selectedDatasetId === dataset.id
                  const versionCount = datasetDetails[dataset.id]?.versions?.length
                  const isSample = Boolean(dataset.is_sample)
                  const recommendedTask = dataset.recommended_task_label || dataset.current_version_summary?.task_profile_name || null
                  return (
                    <button
                      key={dataset.id}
                      type="button"
                      onClick={() => setSelectedDatasetId(dataset.id)}
                      onDragOver={(event) => void handleDatasetDragOver(event, dataset.id)}
                      onDragLeave={() => handleDatasetDragLeave(dataset.id)}
                      onDrop={(event) => void handleDatasetDrop(event, dataset.id)}
                      className={`min-w-[240px] max-w-[280px] flex-1 overflow-hidden rounded-2xl border px-4 py-4 text-left transition-all ${
                        isSelected
                          ? 'border-amethyst/30 bg-amethyst/[0.12] text-moonlight glow-violet-sm'
                          : dropTargetDatasetId === dataset.id
                            ? 'border-aurora-cyan/30 bg-aurora-cyan/[0.10] text-moonlight'
                            : 'border-line-default bg-deep text-twilight hover:border-line-active'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {isSample ? (
                              <span className="rounded-full border border-aurora-cyan/20 bg-aurora-cyan/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-aurora-cyan">
                                Starter sample
                              </span>
                            ) : null}
                            {recommendedTask ? (
                              <span className="rounded-full border border-line-default bg-deep px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-shadow">
                                {recommendedTask}
                              </span>
                            ) : null}
                          </div>
                          <div className="truncate text-sm font-semibold">{dataset.name}</div>
                          <div className="mt-1 line-clamp-2 text-xs leading-5 text-twilight">
                            {dataset.description || 'No description yet.'}
                          </div>
                        </div>
                        <span className="rounded-full border border-line-default bg-deep px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-shadow">
                          {versionCount ?? dataset.versions_count ?? '-'} v
                        </span>
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.12em]">
                        <span className="text-text-shadow">
                          {dropTargetDatasetId === dataset.id ? 'Drop upload here' : isSelected ? 'Selected dataset' : 'Dataset record'}
                        </span>
                        {isSelected ? <span className="text-moonlight">Open</span> : null}
                      </div>
                    </button>
                  )
                })}
              </div>

              {currentDetail ? (
                <div className="min-w-0 space-y-4">
                  <div className="glass-card p-5">
                    <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
                      <div className="min-w-0 flex-1">
                        {editingDatasetId === currentDetail.dataset.id ? (
                          <div className="space-y-3">
                            <div className="workspace-edit-banner">
                              <PencilLine size={13} />
                              Editing dataset record
                            </div>
                            <input
                              value={currentDatasetDraft?.name || ''}
                              onChange={(event) =>
                                setDatasetDrafts((prev) => ({
                                  ...prev,
                                  [currentDetail.dataset.id]: {
                                    ...(prev[currentDetail.dataset.id] || {}),
                                    name: event.target.value,
                                  },
                                }))
                              }
                              className="input-cosmic w-full"
                              placeholder="Dataset name"
                            />
                            <textarea
                              value={currentDatasetDraft?.description || ''}
                              onChange={(event) =>
                                setDatasetDrafts((prev) => ({
                                  ...prev,
                                  [currentDetail.dataset.id]: {
                                    ...(prev[currentDetail.dataset.id] || {}),
                                    description: event.target.value,
                                  },
                                }))
                              }
                              rows={3}
                              className="input-cosmic w-full resize-none"
                              placeholder="Dataset description"
                            />
                          </div>
                        ) : (
                          <>
                            <div className="text-lg font-semibold text-white-star">{selectedDatasetRow?.name}</div>
                            <div className="mt-2 max-w-3xl text-sm leading-6 text-twilight">
                              {selectedDatasetRow?.description || currentDetail.dataset.description || 'No description yet.'}
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 2xl:max-w-[360px] 2xl:justify-end">
                        {editingDatasetId === currentDetail.dataset.id ? (
                          <>
                            <label className="admin-checkbox-chip">
                              <input
                                type="checkbox"
                                checked={Boolean(currentDatasetDraft?.is_public)}
                                onChange={(event) =>
                                  setDatasetDrafts((prev) => ({
                                    ...prev,
                                    [currentDetail.dataset.id]: {
                                      ...(prev[currentDetail.dataset.id] || {}),
                                      is_public: event.target.checked,
                                    },
                                  }))
                                }
                              />
                              Public
                            </label>
                            <button
                              type="button"
                              onClick={() => cancelDatasetEdit(currentDetail.dataset)}
                              className="btn-ghost inline-flex items-center gap-2 text-xs"
                            >
                              <X size={13} />
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateDataset(currentDetail.dataset)}
                              disabled={busyAction === `save-${currentDetail.dataset.id}`}
                              className="btn-galaxy inline-flex items-center gap-2 text-xs disabled:opacity-50"
                            >
                              <Save size={13} />
                              {busyAction === `save-${currentDetail.dataset.id}` ? 'Saving...' : 'Save'}
                            </button>
                          </>
                        ) : (
                          <>
                            {hasUploadReady ? (
                              <button
                                type="button"
                                onClick={handleCreateVersionFromUpload}
                                disabled={versionSubmitting}
                                className="btn-nebula inline-flex items-center gap-2 text-xs disabled:opacity-50"
                              >
                                <Upload size={13} />
                                {versionSubmitting ? 'Attaching...' : 'Attach upload'}
                              </button>
                            ) : null}
                            {canManageSelectedDataset ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openDatasetEdit(currentDetail.dataset)}
                                  className="btn-ghost inline-flex items-center gap-2 text-xs"
                                >
                                  <PencilLine size={13} />
                                  Edit record
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDataset(currentDetail.dataset)}
                                  disabled={busyAction === `delete-${currentDetail.dataset.id}`}
                                  className="rounded-lg border border-aurora-rose/20 bg-aurora-rose/[0.08] px-3 py-2 text-xs font-semibold text-aurora-rose transition-all hover:bg-aurora-rose/[0.15] disabled:opacity-50"
                                >
                                  <Trash2 size={13} className="mr-2 inline-block" />
                                  {busyAction === `delete-${currentDetail.dataset.id}` ? 'Deleting...' : 'Delete'}
                                </button>
                              </>
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>

                    <div className="workspace-info-grid mt-4">
                      <div className="workspace-info-item">
                        <span className="workspace-info-label">Owner</span>
                        <strong>{currentDetail.dataset.owner_id || 'system'}</strong>
                      </div>
                      <div className="workspace-info-item">
                        <span className="workspace-info-label">Versions</span>
                        <strong>{currentDetail.versions.length}</strong>
                      </div>
                      <div className="workspace-info-item">
                        <span className="workspace-info-label">Recommended Task</span>
                        <strong>{selectedRecommendedTask || 'No recommendation yet'}</strong>
                      </div>
                      <div className="workspace-info-item">
                        <span className="workspace-info-label">Dataset Type</span>
                        <strong>{selectedSampleCatalog?.is_starter_sample ? 'Starter sample' : 'Workspace dataset'}</strong>
                      </div>
                    </div>

                    {selectedSampleCatalog?.note ? (
                      <div className="mt-4 rounded-xl border border-line-default bg-deep px-4 py-3 text-sm leading-6 text-twilight">
                        <span className="mr-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-shadow">Sample note</span>
                        {selectedSampleCatalog.note}
                      </div>
                    ) : null}

                    <div className="mt-4">
                      {hasUploadReady ? (
                        <InlineCallout
                          tone="ok"
                          title="A pending upload is ready"
                          copy="If it belongs here, drop it onto this dataset card or use Attach upload. If not, leave this record alone and choose another card."
                        />
                      ) : (
                        <InlineCallout
                          tone="neutral"
                          title="No pending upload attached"
                          copy="That is fine. You can still review versions here, or open the uploader whenever you are ready to add more data."
                        />
                      )}
                    </div>

                    {error ? (
                      <div className="mt-4 rounded-lg border border-aurora-rose/20 bg-aurora-rose/[0.08] px-3 py-2 text-xs text-aurora-rose">
                        {error.message}
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-white-star">Versions</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] uppercase tracking-[0.12em] text-text-shadow">Page size</span>
                        <select
                          value={versionPageSize}
                          onChange={(event) => {
                            setVersionPageSize(Number(event.target.value))
                            setVersionPage(1)
                          }}
                          className="input-cosmic px-3 py-2 text-xs"
                        >
                          {[2, 4, 6, 8].map((option) => (
                            <option key={option} value={option}>
                              {option} / page
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {visibleVersions.map((version) => {
                      const hasPayload = Boolean(version.processed_blob_key)
                      const taskProfileName = version.summary_json?.task_profile_name || null
                      const canSelect =
                        hasPayload && (
                          version.lifecycle === 'published' ||
                          currentDetail.dataset.owner_id === user?.id ||
                          user?.role === 'admin'
                        )
                      const isActive = activeDatasetVersionId === version.id

                      return (
                        <div
                          key={version.id}
                          className={`workspace-record-card ${isActive ? 'border-amethyst/25 glow-violet-sm' : ''}`}
                        >
                          <div className="workspace-version-card">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-base font-semibold text-white-star">
                                  Version {version.version}
                                </div>
                                <span className="rounded-full border border-line-default bg-deep px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-twilight">
                                  {version.lifecycle}
                                </span>
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                                  hasPayload
                                    ? 'border-aurora-green/20 bg-aurora-green/[0.08] text-aurora-green'
                                    : 'border-aurora-amber/20 bg-aurora-amber/[0.08] text-aurora-amber'
                                }`}>
                                  {hasPayload ? 'Ready to train' : 'Metadata only'}
                                </span>
                              </div>
                              <div className="mt-3 workspace-version-meta">
                                <div className="workspace-info-item">
                                  <span className="workspace-info-label">Created</span>
                                  <strong>{version.created_at || 'n/a'}</strong>
                                </div>
                                <div className="workspace-info-item">
                                  <span className="workspace-info-label">Schema</span>
                                  <strong>{version.schema_version}</strong>
                                </div>
                                <div className="workspace-info-item">
                                  <span className="workspace-info-label">Initial Profile</span>
                                  <strong>{taskProfileName || 'Not specified'}</strong>
                                </div>
                                {version.published_at ? (
                                  <div className="workspace-info-item">
                                    <span className="workspace-info-label">Published</span>
                                    <strong>{version.published_at}</strong>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            <div className="workspace-version-side">
                              <SelectionButton
                                active={isActive}
                                disabled={!canSelect}
                                onClick={() =>
                                  canSelect &&
                                  applyDatasetVersionContext(currentDetail.dataset, version)
                                }
                              />
                              <div className="workspace-version-actions">
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
                          </div>
                        </div>
                      )
                    })}
                    {versionTotal > versionPageSize ? (
                      <AdminPagination
                        page={safeVersionPage}
                        pageSize={versionPageSize}
                        total={versionTotal}
                        onPageChange={setVersionPage}
                      />
                    ) : null}
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={<Database size={30} />}
                  title="Select a dataset"
                  description="The right column will show the selected dataset record and every version inside it."
                />
              )}
            </div>
          ) : (
            <EmptyState
              icon={<Database size={30} />}
              title="No datasets yet"
              description="Open the uploader first or create an empty dataset record, then add versions when you are ready."
            />
          )}
        </SectionCard>
      </div>
      {isUploaderOpen ? <DataInputView onClose={() => { void handleCloseUploader() }} /> : null}
    </div>
  )
}

function UploadSummary({
  uploadedFilePath,
  uploadMetadata,
  isUploadMode = false,
  draggable = false,
  isDragging = false,
  onDragStart,
  onDragEnd,
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`glass-card p-4 ${draggable ? 'cursor-grab active:cursor-grabbing' : ''} ${isDragging ? 'ring-1 ring-aurora-cyan/40 opacity-85' : ''}`}
    >
      <div className="text-micro uppercase tracking-ultra text-text-shadow">Pending upload</div>
      {uploadedFilePath ? (
        <div className="mt-3 space-y-1 text-sm text-starlight">
          <div className="text-xs uppercase tracking-[0.12em] text-text-shadow">File source</div>
          <div><span className="break-all font-mono text-aurora-cyan text-xs">{uploadedFilePath}</span></div>
          <div className="text-twilight">
            Nodes: {uploadMetadata?.num_nodes ?? '?'} | Edges: {uploadMetadata?.num_edges ?? '?'} | Features: {uploadMetadata?.num_features ?? '?'}
          </div>
          {uploadMetadata?.task_profile_name ? (
            <div className="text-twilight">
              Initial profile: <span className="text-white-star">{uploadMetadata.task_profile_name}</span>
            </div>
          ) : null}
          {draggable ? (
            <div className="pt-2 text-[11px] uppercase tracking-[0.12em] text-aurora-cyan">
              Drag this upload onto a dataset to attach it as a new version
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 text-xs text-text-shadow">
          {isUploadMode
            ? 'There is no pending upload attached right now. Open the uploader when you want to bring one payload into the workspace.'
            : 'No current upload metadata. That is okay because this mode only creates a metadata record.'}
        </div>
      )}
    </div>
  )
}

function InlineCallout({ tone = 'neutral', title, copy }) {
  const styles = {
    ok: {
      wrap: 'border-aurora-green/20 bg-aurora-green/[0.08] text-aurora-green',
      icon: <CheckCircle2 size={14} />,
    },
    warn: {
      wrap: 'border-aurora-amber/20 bg-aurora-amber/[0.08] text-aurora-amber',
      icon: <AlertCircle size={14} />,
    },
    neutral: {
      wrap: 'border-line-default bg-deep text-twilight',
      icon: <Database size={14} />,
    },
  }

  const style = styles[tone] || styles.neutral

  return (
    <div className={`rounded-2xl border px-4 py-3 ${style.wrap}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">{style.icon}</div>
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="mt-1 text-xs leading-6">{copy}</div>
        </div>
      </div>
    </div>
  )
}
