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
            className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-300 disabled:opacity-50"
          >
            {busy ? 'Running...' : 'Dry run'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => runRetention(false)}
            className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300 disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      }
    >
      {results.length ? (
        <div className="space-y-3">
          {results.map((item) => (
            <div key={item.experiment_id} className="rounded-3xl border border-slate-800/70 bg-slate-950/50 p-5 text-sm text-slate-300">
              <div className="font-semibold text-white">Experiment #{item.experiment_id}</div>
              <div className="mt-2 text-slate-400">Mode: {item.mode} • {item.keep_full ? 'Keep full' : 'Compacted'}</div>
              <div className="mt-2 text-slate-500">Reason: {Array.isArray(item.reason) ? item.reason.join(', ') : item.reason}</div>
              <div className="mt-2 text-slate-500">Kept epochs: {(item.kept_epochs || []).join(', ') || 'none'}</div>
            </div>
          ))}
          {error ? <div className="text-sm text-red-300">{error.message}</div> : null}
        </div>
      ) : (
        <EmptyState title="No retention actions in preview" description="Dry-run results will appear here when compaction candidates exist." />
      )}
    </SectionCard>
  )
}
