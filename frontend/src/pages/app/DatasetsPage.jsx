import { AlertCircle, Database, PencilLine, Plus, Save, Sparkles, Trash2, Upload, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useState } from 'react'
import DataInputView from '../../components/UploadPanel/DataInputView'
import EmptyState from '../../components/primitives/EmptyState'
import ErrorState from '../../components/primitives/ErrorState'
import LoadingState from '../../components/primitives/LoadingState'
import useAuthStore from '../../store/authStore'
import useGNNStore from '../../store/useGNNStore'
import { useLanguage } from '../../contexts/LanguageContext'
import { apiJson, normalizeCollectionPayload } from '../../utils/api'
import { AdminPagination } from '../admin/AdminListControls'

export default function DatasetsPage() {
  const { t } = useLanguage()
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
    const confirmed = window.confirm(t('datasets.delete_confirm', { name: dataset.name }))
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
  }, [activeDatasetId, datasets, loadDatasetDetail, loadDatasets, setActiveDatasetContext, setDatasetName, setTaskConfig, setUploadMetadata, setUploadedFilePath, t])

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
    return <LoadingState title={t('datasets.loading')} className="min-h-[480px]" />
  }

  if (error && datasets.length === 0) {
    return <ErrorState title={t('datasets.load_error')} error={error} onRetry={loadDatasets} className="min-h-[480px]" />
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="surface-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="surface-eyebrow">{t('datasets.library_eyebrow')}</div>
            <h2 className="surface-title">{t('datasets.page_title_count', { n: datasets.length })}</h2>
            <p className="surface-sub">
              {t('datasets.page_sub')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setIsUploaderOpen((v) => !v)} className="surface-action">
              <Upload size={13} /> {isUploaderOpen ? t('datasets.hide_uploader') : t('datasets.open_uploader')}
            </button>
            <button type="button" onClick={() => setIsCreateOpen(true)} className="primary-cta inline-flex items-center gap-2">
              <Plus size={14} /> {t('datasets.new_dataset')}
            </button>
          </div>
        </div>

        {hasUploadReady ? (
          <div className="ds-upload-banner mt-4">
            <div className="ds-upload-icon"><Upload size={14} /></div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-fg">{t('datasets.pending_upload_ready')}</div>
              <div className="mt-0.5 text-xs text-fg-muted">
                <span className="font-mono text-primary">{uploadedFilePath}</span> · {uploadMetadata?.num_nodes ?? '?'} {t('datasets.nodes_short')} · {uploadMetadata?.num_edges ?? '?'} {t('datasets.edges_short')}
              </div>
            </div>
            {selectedDatasetId ? (
              <button
                type="button"
                onClick={handleCreateVersionFromUpload}
                disabled={versionSubmitting}
                className="primary-cta disabled:opacity-50"
              >
                {versionSubmitting ? t('datasets.attaching') : t('datasets.attach_to_selected')}
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Master-Detail */}
      {datasets.length === 0 ? (
        <EmptyState
          icon={<Database size={26} />}
          title={t('datasets.no_datasets_title')}
          description={t('datasets.no_datasets_desc')}
          actionLabel={t('datasets.open_uploader')}
          onAction={handleOpenUploader}
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(300px,340px)_minmax(0,1fr)]">
          {/* LEFT: list */}
          <aside className="surface-card overflow-hidden">
            <div className="border-b border-line-subtle p-4">
              <div className="surface-eyebrow">{t('datasets.library')}</div>
              <div className="mt-1 text-sm font-bold text-fg">{t('datasets.dataset_count', { n: datasets.length })}</div>
            </div>
            <ul className="ds-list custom-scrollbar">
              {datasets.map((dataset) => {
                const isSelected = dataset.id === selectedDatasetId
                const versionCount = dataset.version_count ?? (dataset.id === selectedDatasetId ? currentDetail?.versions?.length : null)
                const isActive = dataset.id === activeDatasetId
                return (
                  <li key={dataset.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedDatasetId(dataset.id)}
                      onDragOver={(event) => handleDatasetDragOver(event, dataset.id)}
                      onDragLeave={() => handleDatasetDragLeave(dataset.id)}
                      onDrop={(event) => handleDatasetDrop(event, dataset.id)}
                      className={`ds-list-item ${isSelected ? 'ds-list-item-active' : ''} ${dropTargetDatasetId === dataset.id ? 'ds-list-item-drop' : ''}`}
                    >
                      <span className="ds-list-icon"><Database size={14} /></span>
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-sm font-semibold text-fg">{dataset.name}</span>
                        <span className="mt-0.5 flex items-center gap-2 text-[11px] text-fg-muted">
                          <span>#{dataset.owner_id ?? 'system'}</span>
                          {versionCount != null ? (
                            <span className="ds-list-chip">v{versionCount}</span>
                          ) : null}
                          {isActive ? <span className="ds-list-active">{t('datasets.active')}</span> : null}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </aside>

          {/* RIGHT: detail */}
          <section className="surface-card overflow-hidden">
            {!currentDetail ? (
              <div className="p-8">
                <EmptyState
                  icon={<Database size={26} />}
                  title={t('datasets.select_dataset_title')}
                  description={t('datasets.select_dataset_desc')}
                />
              </div>
            ) : (
              <DatasetDetailPane
                detail={currentDetail}
                draft={currentDatasetDraft}
                setDatasetDrafts={setDatasetDrafts}
                isEditing={editingDatasetId === currentDetail.dataset.id}
                onEdit={() => openDatasetEdit(currentDetail.dataset)}
                onCancelEdit={() => cancelDatasetEdit(currentDetail.dataset)}
                onSave={() => handleUpdateDataset(currentDetail.dataset)}
                onDelete={() => handleDeleteDataset(currentDetail.dataset)}
                canManage={canManageSelectedDataset}
                busyAction={busyAction}
                activeDatasetVersionId={activeDatasetVersionId}
                onSelectVersion={(version) => applyDatasetVersionContext(currentDetail.dataset, version)}
                onPublish={(versionId) => handlePublishVersion(currentDetail.dataset.id, versionId)}
                onDeprecate={(versionId) => handleDeprecateVersion(currentDetail.dataset.id, versionId)}
                onOpenInLab={() => setIsUploaderOpen((v) => !v)}
                versions={visibleVersions}
                versionTotal={versionTotal}
                versionPage={safeVersionPage}
                versionTotalPages={versionTotalPages}
                versionPageSize={versionPageSize}
                setVersionPage={setVersionPage}
                setVersionPageSize={setVersionPageSize}
                error={error}
                isUploaderOpen={isUploaderOpen}
                onCloseUploader={() => { void handleCloseUploader() }}
                t={t}
              />
            )}
          </section>
        </div>
      )}

      {/* Create dataset modal */}
      <AnimatePresence>
        {isCreateOpen ? (
          <DatasetCreateModal
            open={isCreateOpen}
            onClose={() => setIsCreateOpen(false)}
            form={form}
            setForm={setForm}
            intakeMode={intakeMode}
            setIntakeMode={setIntakeMode}
            hasUploadReady={hasUploadReady}
            uploadedFilePath={uploadedFilePath}
            uploadMetadata={uploadMetadata}
            submitting={submitting}
            onSubmit={handleCreateDataset}
            t={t}
          />
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function DatasetDetailPane({
  detail,
  draft,
  setDatasetDrafts,
  isEditing,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
  canManage,
  busyAction,
  activeDatasetVersionId,
  onSelectVersion,
  onPublish,
  onDeprecate,
  onOpenInLab,
  versions,
  versionTotal,
  versionPage,
  versionTotalPages,
  versionPageSize,
  setVersionPage,
  setVersionPageSize,
  error,
  isUploaderOpen,
  onCloseUploader,
  t,
}) {
  const dataset = detail.dataset
  const allVersions = detail.versions || []
  const currentVersion = allVersions.find((v) => v.id === activeDatasetVersionId) || allVersions[0] || null

  const lifecycleLabel = (lc) => {
    if (!lc) return '—'
    const key = `datasets.lifecycle_${lc}`
    const v = t(key)
    return v === key ? lc : v
  }

  const stats = [
    { label: t('datasets.stat_versions'), value: allVersions.length },
    { label: t('datasets.stat_active'), value: currentVersion ? `v${currentVersion.version}` : '—' },
    { label: t('datasets.stat_lifecycle'), value: lifecycleLabel(currentVersion?.lifecycle) },
    { label: t('datasets.stat_owner'), value: `#${dataset.owner_id ?? 'system'}` },
  ]

  const isSaving = busyAction === `save-${dataset.id}`
  const isDeleting = busyAction === `delete-${dataset.id}`

  return (
    <div className="space-y-5 p-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {!isEditing ? (
            <>
              <div className="surface-eyebrow">{t('datasets.dataset_detail')}</div>
              <h3 className="ds-title">{dataset.name}</h3>
              <p className="surface-sub mt-1">{dataset.description || t('datasets.no_description')}</p>
            </>
          ) : (
            <div className="space-y-3">
              <label className="modal-field">
                <span className="modal-field-label">{t('datasets.form_name')}</span>
                <input
                  value={draft?.name || ''}
                  onChange={(event) => setDatasetDrafts((prev) => ({ ...prev, [dataset.id]: { ...prev[dataset.id], name: event.target.value } }))}
                  className="modal-input"
                />
              </label>
              <label className="modal-field">
                <span className="modal-field-label">{t('datasets.form_description')}</span>
                <textarea
                  value={draft?.description || ''}
                  onChange={(event) => setDatasetDrafts((prev) => ({ ...prev, [dataset.id]: { ...prev[dataset.id], description: event.target.value } }))}
                  rows={2}
                  className="modal-textarea"
                />
              </label>
              <label className="modal-toggle">
                <input
                  type="checkbox"
                  checked={!!draft?.is_public}
                  onChange={(event) => setDatasetDrafts((prev) => ({ ...prev, [dataset.id]: { ...prev[dataset.id], is_public: event.target.checked } }))}
                />
                <span className="modal-toggle-track" />
                <span className="modal-field-label">{draft?.is_public ? t('datasets.is_public') : t('datasets.is_private')}</span>
              </label>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isEditing ? (
            <>
              {canManage ? (
                <button type="button" onClick={onEdit} className="project-action-icon" aria-label={t('datasets.edit_dataset')}>
                  <PencilLine size={14} />
                </button>
              ) : null}
              {canManage ? (
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={isDeleting}
                  className="project-action-icon project-action-danger disabled:opacity-50"
                  aria-label={t('datasets.delete_dataset')}
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
            </>
          ) : (
            <>
              <button type="button" onClick={onCancelEdit} className="modal-btn-ghost">{t('datasets.cancel')}</button>
              <button
                type="button"
                onClick={onSave}
                disabled={isSaving}
                className="modal-btn-primary disabled:opacity-50"
              >
                <Save size={13} /> {isSaving ? t('datasets.saving') : t('datasets.save')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="ds-stat">
            <div className="ds-stat-label">{stat.label}</div>
            <div className="ds-stat-value">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Version timeline */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="ds-section-title">{t('datasets.version_timeline', { n: versionTotal })}</h4>
          <button type="button" onClick={onOpenInLab} className="surface-action">
            <Upload size={12} /> {t('datasets.add_new_version')}
          </button>
        </div>
        {versions.length === 0 ? (
          <EmptyState
            icon={<Database size={22} />}
            title={t('datasets.no_versions_title')}
            description={t('datasets.no_versions_desc')}
            className="mt-3"
          />
        ) : (
          <ol className="ds-timeline mt-4">
            {versions.map((version) => {
              const isActiveVersion = activeDatasetVersionId === version.id
              return (
                <li key={version.id} className={`ds-timeline-row ${isActiveVersion ? 'is-active' : ''}`}>
                  <span className="ds-timeline-dot" />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="ds-version-num">v{version.version}</span>
                      <span className={`ds-lifecycle ds-lifecycle-${version.lifecycle}`}>{lifecycleLabel(version.lifecycle)}</span>
                      {isActiveVersion ? <span className="ds-active-pill">{t('datasets.active')}</span> : null}
                      <span className="text-[11px] text-fg-faint">
                        {version.created_at ? new Date(version.created_at).toLocaleString() : '—'}
                      </span>
                    </div>
                    {version.processed_blob_key ? (
                      <div className="mt-1 truncate font-mono text-[11px] text-fg-muted">
                        {version.processed_blob_key}
                      </div>
                    ) : null}
                    {version.summary_json ? (
                      <div className="mt-1 text-[11px] text-fg-muted">
                        {t('datasets.version_meta', {
                          nodes: version.summary_json.num_nodes ?? '?',
                          edges: version.summary_json.num_edges ?? '?',
                          features: version.summary_json.num_features ?? '?',
                        })}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectVersion(version)}
                      disabled={isActiveVersion}
                      className={`pager-btn ${isActiveVersion ? 'pager-btn-active' : ''}`}
                    >
                      {isActiveVersion ? t('datasets.active') : t('datasets.set_active')}
                    </button>
                    {canManage && version.lifecycle !== 'published' ? (
                      <button type="button" onClick={() => onPublish(version.id)} className="pager-btn">
                        {t('datasets.publish')}
                      </button>
                    ) : null}
                    {canManage && version.lifecycle === 'published' ? (
                      <button type="button" onClick={() => onDeprecate(version.id)} className="pager-btn">
                        {t('datasets.deprecate')}
                      </button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ol>
        )}

        {versionTotalPages > 1 ? (
          <AdminPagination
            page={versionPage}
            totalPages={versionTotalPages}
            pageSize={versionPageSize}
            onPageChange={setVersionPage}
            onPageSizeChange={setVersionPageSize}
            className="mt-4"
          />
        ) : null}
      </div>

      {/* Inline uploader (was modal) */}
      {isUploaderOpen ? (
        <div className="border-t border-line-subtle pt-5">
          <div className="flex items-center justify-between">
            <h4 className="ds-section-title">{t('datasets.uploader_section')}</h4>
            <button type="button" onClick={onCloseUploader} className="surface-action">
              {t('datasets.close')}
            </button>
          </div>
          <div className="mt-3">
            <DataInputView onClose={onCloseUploader} variant="inline" />
          </div>
        </div>
      ) : null}

      {error ? <div className="text-sm text-rose-500">{error.message}</div> : null}
    </div>
  )
}

function DatasetCreateModal({
  open,
  onClose,
  form,
  setForm,
  intakeMode,
  setIntakeMode,
  hasUploadReady,
  uploadedFilePath,
  uploadMetadata,
  submitting,
  onSubmit,
  t,
}) {
  if (!open) return null
  return (
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
            <div className="modal-eyebrow">{t('datasets.create_modal_eyebrow')}</div>
            <h3 className="modal-title">{t('datasets.create_dataset')}</h3>
          </div>
          <button type="button" onClick={onClose} className="modal-close" aria-label={t('datasets.close')}>
            <X size={16} />
          </button>
        </div>
        <div className="mt-5 space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setIntakeMode('upload')}
              disabled={!hasUploadReady}
              className={`ds-intake ${intakeMode === 'upload' ? 'ds-intake-active' : ''} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Sparkles size={14} />
              <div>
                <div className="text-sm font-semibold">{t('datasets.intake_from_upload_title')}</div>
                <div className="mt-0.5 text-xs">{t('datasets.intake_from_upload_desc')}</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setIntakeMode('record')}
              className={`ds-intake ${intakeMode === 'record' ? 'ds-intake-active' : ''}`}
            >
              <Database size={14} />
              <div>
                <div className="text-sm font-semibold">{t('datasets.intake_empty_title')}</div>
                <div className="mt-0.5 text-xs">{t('datasets.intake_empty_desc')}</div>
              </div>
            </button>
          </div>
          <label className="modal-field">
            <span className="modal-field-label">{t('datasets.form_name')}</span>
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder={t('datasets.form_name_placeholder')}
              className="modal-input"
            />
          </label>
          <label className="modal-field">
            <span className="modal-field-label">{t('datasets.form_description')}</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              rows={2}
              className="modal-textarea"
              placeholder={t('datasets.form_description_placeholder')}
            />
          </label>
          {intakeMode === 'upload' && hasUploadReady ? (
            <div className="ds-upload-preview">
              <div className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">{t('datasets.will_attach_v1')}</div>
              <div className="mt-1 truncate font-mono text-xs text-primary">{uploadedFilePath}</div>
              <div className="mt-1 text-[11px] text-fg-muted">
                {t('datasets.version_meta', {
                  nodes: uploadMetadata?.num_nodes ?? '?',
                  edges: uploadMetadata?.num_edges ?? '?',
                  features: uploadMetadata?.num_features ?? '?',
                })}
              </div>
            </div>
          ) : null}
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onClose} className="modal-btn-ghost">{t('datasets.cancel')}</button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="modal-btn-primary disabled:opacity-50"
          >
            {submitting ? t('datasets.creating') : t('datasets.create_dataset')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

