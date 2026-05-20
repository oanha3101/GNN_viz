export function LoadingState({ title = 'Loading...', progress = null, className = '' }) {
  const pct =
    typeof progress === 'number' ? Math.max(0, Math.min(1, progress)) : null

  return (
    <div
      role="status"
      aria-live="polite"
      className={`w-full h-full flex flex-col items-center justify-center p-6 text-twilight ${className}`}
    >
      <div className="w-5 h-5 border-2 border-line-default border-t-amethyst rounded-full animate-spin mb-3" />
      <div className="text-xs font-medium text-starlight">{title}</div>
      {pct !== null && (
        <div className="mt-3 w-40 h-1 rounded-full bg-deep overflow-hidden">
          <div
            data-testid="progress-bar"
            className="h-full bg-amethyst transition-all"
            style={{ width: `${pct * 100}%` }}
          />
        </div>
      )}
    </div>
  )
}

export default LoadingState
