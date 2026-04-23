import React from 'react'

/**
 * <EmptyState> — consistent zero-data presentation.
 *
 * Example:
 *   <EmptyState
 *     icon={<Network size={32} />}
 *     title="No snapshots yet"
 *     description="Start a training run to populate the timeline."
 *     actionLabel="Start training"
 *     onAction={startTraining}
 *   />
 */
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) {
  return (
    <div
      role="status"
      className={`w-full h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 ${className}`}
    >
      {icon && (
        <div className="mb-3 text-slate-600" aria-hidden="true">
          {icon}
        </div>
      )}
      <h4 className="text-sm font-semibold text-slate-300 mb-1">{title}</h4>
      {description && (
        <p className="text-xs text-slate-500 max-w-xs">{description}</p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 px-3 py-1.5 rounded-md text-xs font-semibold bg-slate-800 text-cyan-300 border border-slate-700 hover:border-cyan-500/40 transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

export default EmptyState
