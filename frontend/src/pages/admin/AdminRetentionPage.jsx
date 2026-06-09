import { useCallback, useEffect, useState } from 'react'
import { Archive, CheckCircle2, FlaskRound, RefreshCw, Sparkles } from 'lucide-react'
import EmptyState from '../../components/primitives/EmptyState'
import ErrorState from '../../components/primitives/ErrorState'
import LoadingState from '../../components/primitives/LoadingState'
import { apiJson } from '../../utils/api'

export default function AdminRetentionPage() {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [results, setResults] = useState([])
  const [lastMode, setLastMode] = useState('dry')

  const runRetention = useCallback(async (dryRun = true) => {
    setBusy(true)
    setError(null)
    setLastMode(dryRun ? 'dry' : 'apply')
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

  const keptFull = results.filter((r) => r.keep_full).length

  return (
    <div className="space-y-4">
      <header className="admin-list-hero">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="admin-list-hero-icon"><Archive size={18} /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Retention Monitor</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {results.length ? (
                  <>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{results.length}</span> candidates · <span className="font-semibold">{keptFull}</span> kept full · last run: <span className="font-semibold">{lastMode === 'dry' ? 'Dry-run' : 'Applied'}</span>
                  </>
                ) : 'Dry-run first, then apply only when the preview looks safe.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => runRetention(true)}
              className="admin-btn-secondary disabled:opacity-50"
            >
              <RefreshCw size={13} /> {busy && lastMode === 'dry' ? 'Running...' : 'Dry run'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => runRetention(false)}
              className="admin-btn-primary disabled:opacity-50"
            >
              <Sparkles size={13} /> {busy && lastMode === 'apply' ? 'Applying...' : 'Apply'}
            </button>
          </div>
        </div>
      </header>

      {loading ? (
        <LoadingState title="Loading retention preview..." className="min-h-[320px]" />
      ) : error && results.length === 0 ? (
        <ErrorState title="Could not load retention preview" error={error} onRetry={() => runRetention(true)} className="min-h-[320px]" />
      ) : results.length === 0 ? (
        <div className="admin-card">
          <EmptyState title="No retention actions" description="Dry-run results appear here when compaction candidates exist." />
        </div>
      ) : (
        <div className="admin-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="admin-th admin-th-lead">Experiment</th>
                  <th className="admin-th">Mode</th>
                  <th className="admin-th">Outcome</th>
                  <th className="admin-th admin-th-meta">Kept epochs</th>
                  <th className="admin-th admin-th-meta">Reason</th>
                </tr>
              </thead>
              <tbody>
                {results.map((item) => (
                  <tr key={item.experiment_id} className="admin-tr">
                    <td className="admin-td">
                      <div className="flex items-center gap-2 font-mono text-xs font-semibold text-slate-900 dark:text-white">
                        <FlaskRound size={13} className="opacity-70" />
                        Experiment #{item.experiment_id}
                      </div>
                    </td>
                    <td className="admin-td">
                      <span className="admin-role-pill bg-sky-500/12 text-sky-700 border-sky-500/25 dark:text-sky-300">{item.mode}</span>
                    </td>
                    <td className="admin-td">
                      <span className={`admin-role-pill ${item.keep_full ? 'bg-emerald-500/12 text-emerald-700 border-emerald-500/25 dark:text-emerald-300' : 'bg-amber-500/12 text-amber-700 border-amber-500/25 dark:text-amber-300'}`}>
                        <CheckCircle2 size={11} /> {item.keep_full ? 'Keep full' : 'Compacted'}
                      </span>
                    </td>
                    <td className="admin-td admin-td-meta">
                      <span className="font-mono text-xs text-slate-600 dark:text-slate-300">
                        {(item.kept_epochs || []).join(', ') || '—'}
                      </span>
                    </td>
                    <td className="admin-td admin-td-meta">
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {Array.isArray(item.reason) ? item.reason.join(', ') : item.reason}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {error ? <div className="text-sm text-rose-500 dark:text-rose-400">{error.message}</div> : null}
    </div>
  )
}
