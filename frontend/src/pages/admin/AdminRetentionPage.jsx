import { useCallback, useEffect, useState } from 'react'
import EmptyState from '../../components/primitives/EmptyState'
import ErrorState from '../../components/primitives/ErrorState'
import LoadingState from '../../components/primitives/LoadingState'
import { apiJson } from '../../utils/api'
import { SectionCard } from '../shared/PageBlocks'

export default function AdminRetentionPage() {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [results, setResults] = useState([])

  const runRetention = useCallback(async (dryRun = true) => {
    setBusy(true)
    setError(null)
    try {
      const payload = await apiJson(`/admin/retention?dry_run=${dryRun ? 'true' : 'false'}`, {
        method: 'POST',
      })
      setResults(payload.results || [])
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    runRetention(true)
  }, [runRetention])

  if (loading) {
    return <LoadingState title="Loading retention preview..." className="min-h-[480px]" />
  }

  if (error && results.length === 0) {
    return <ErrorState title="Could not load retention preview" error={error} onRetry={() => runRetention(true)} className="min-h-[480px]" />
  }

  return (
    <SectionCard
      title="Retention Monitor"
      subtitle="Dry-run first, then apply only when the preview looks safe."
      actions={
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => runRetention(true)}
            className="btn-nebula inline-flex items-center gap-2 text-xs disabled:opacity-50"
          >
            {busy ? 'Running...' : 'Dry run'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => runRetention(false)}
            className="rounded-lg border border-aurora-amber/20 bg-aurora-amber/[0.08] px-3 py-2 text-xs font-semibold text-aurora-amber transition-all hover:bg-aurora-amber/[0.15] disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      }
    >
      {results.length ? (
        <div className="space-y-3">
          {results.map((item) => (
            <div key={item.experiment_id} className="glass-card p-5 text-sm text-starlight">
              <div className="font-semibold text-white-star font-mono text-sm">Experiment #{item.experiment_id}</div>
              <div className="mt-2 flex items-center gap-3 text-twilight">
                <span>Mode: <span className="text-starlight">{item.mode}</span></span>
                <span className={`badge-cosmic ${item.keep_full ? 'badge-aurora' : ''}`}>
                  {item.keep_full ? 'Keep full' : 'Compacted'}
                </span>
              </div>
              <div className="mt-2 text-xs text-text-shadow">
                Reason: {Array.isArray(item.reason) ? item.reason.join(', ') : item.reason}
              </div>
              <div className="mt-2 text-xs text-text-shadow">
                Kept epochs: {(item.kept_epochs || []).join(', ') || 'none'}
              </div>
            </div>
          ))}
          {error ? <div className="text-sm text-aurora-rose">{error.message}</div> : null}
        </div>
      ) : (
        <EmptyState title="No retention actions in preview" description="Dry-run results will appear here when compaction candidates exist." />
      )}
    </SectionCard>
  )
}
