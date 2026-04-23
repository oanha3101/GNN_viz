import React, { useState } from 'react'

/**
 * <ErrorState> — consistent inline error with retry + details toggle.
 *
 * Example:
 *   <ErrorState
 *     title="Could not load metrics"
 *     error={err}
 *     onRetry={refetch}
 *   />
 */
export function ErrorState({
  title = 'Something went wrong',
  error,
  onRetry,
  className = '',
}) {
  const [showDetails, setShowDetails] = useState(false)
  const message =
    (error && (error.message || String(error))) || 'Unknown error'

  return (
    <div
      role="alert"
      className={`w-full h-full flex flex-col items-center justify-center text-center p-6 ${className}`}
    >
      <div className="text-base text-red-400 font-semibold mb-1">{title}</div>
      <p className="text-xs text-slate-500 max-w-sm break-words">{message}</p>
      <div className="mt-4 flex items-center gap-2">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-slate-800 text-cyan-300 border border-slate-700 hover:border-cyan-500/40 transition-colors"
          >
            Retry
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowDetails(v => !v)}
          className="px-3 py-1.5 rounded-md text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
        >
          {showDetails ? 'Hide details' : 'Details'}
        </button>
      </div>
      {showDetails && error && error.stack && (
        <pre className="mt-3 max-w-md max-h-40 overflow-auto text-[10px] text-left text-slate-500 bg-slate-900/60 p-3 rounded border border-slate-800/60">
          {error.stack}
        </pre>
      )}
    </div>
  )
}

export default ErrorState
