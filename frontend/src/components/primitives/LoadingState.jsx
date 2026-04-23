import React from 'react'

/**
 * <LoadingState> — consistent spinner + progress feedback.
 *
 * Example:
 *   <LoadingState title="Loading snapshots" progress={0.42} />
 */
export function LoadingState({ title = 'Loading…', progress = null, className = '' }) {
  const pct =
    typeof progress === 'number' ? Math.max(0, Math.min(1, progress)) : null

  return (
    <div
      role="status"
      aria-live="polite"
      className={`w-full h-full flex flex-col items-center justify-center p-6 text-slate-400 ${className}`}
    >
      <div className="w-5 h-5 border-2 border-slate-700 border-t-cyan-400 rounded-full animate-spin mb-3" />
      <div className="text-xs font-medium text-slate-300">{title}</div>
      {pct !== null && (
        <div className="mt-3 w-40 h-1 rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-cyan-500 transition-all"
            style={{ width: `${pct * 100}%` }}
          />
        </div>
      )}
    </div>
  )
}

export default LoadingState
