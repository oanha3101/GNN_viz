import { useState } from 'react'

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
      <div className="text-base text-aurora-rose font-semibold mb-1">{title}</div>
      <p className="text-xs text-twilight max-w-sm break-words">{message}</p>
      <div className="mt-4 flex items-center gap-2">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="btn-nebula text-xs"
          >
            Retry
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowDetails(v => !v)}
          className="btn-ghost text-xs"
        >
          {showDetails ? 'Hide details' : 'Details'}
        </button>
      </div>
      {showDetails && error && error.stack && (
        <pre className="mt-3 max-w-md max-h-40 overflow-auto text-[10px] text-left text-twilight bg-deep p-3 rounded-lg border border-line-subtle font-mono">
          {error.stack}
        </pre>
      )}
    </div>
  )
}

export default ErrorState
