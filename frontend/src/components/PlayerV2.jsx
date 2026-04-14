import { useRef, useCallback } from 'react'
import usePlayerStore from '../store/playerStore'

function IconButton({ children, onClick, title, disabled = false, primary = false }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm transition-all ${
        primary
          ? 'bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/25 hover:bg-cyan-300'
          : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
      } disabled:cursor-not-allowed disabled:opacity-35`}
    >
      {children}
    </button>
  )
}

export default function PlayerV2() {
  const {
    snapshots,
    currentEpochFloat,
    isPlaying,
    playbackSpeed,
    trainingDone,
    bestEpoch,
    totalEpochs,
    play,
    pause,
    seekTo,
    stepForward,
    stepBack,
    setSpeed,
  } = usePlayerStore()

  const trackRef = useRef(null)
  const draggingRef = useRef(false)

  const disabled = !trainingDone || totalEpochs < 2
  const maxFloat = Math.max(0, totalEpochs - 1)
  const fillPct = totalEpochs <= 1 ? 0 : (currentEpochFloat / maxFloat) * 100
  const bestPct = totalEpochs <= 1 ? 0 : (bestEpoch / maxFloat) * 100

  const seekFromEvent = useCallback((e) => {
    if (disabled || !trackRef.current) return
    const rect = trackRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    const pct = x / rect.width
    const epoch = pct * maxFloat
    seekTo(epoch)
  }, [disabled, maxFloat, seekTo])

  const handlePointerDown = useCallback((e) => {
    if (disabled) return
    draggingRef.current = true
    seekFromEvent(e)
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [disabled, seekFromEvent])

  const handlePointerMove = useCallback((e) => {
    if (!draggingRef.current) return
    seekFromEvent(e)
  }, [seekFromEvent])

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false
  }, [])

  return (
    <div className="border-t border-slate-800/80 bg-slate-950/92 px-4 py-2.5 backdrop-blur-md">
      {/* Interactive scrubber track */}
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className={`relative mb-2.5 h-2.5 rounded-full bg-slate-800 ${disabled ? 'opacity-40' : 'cursor-pointer group'}`}
        style={{ touchAction: 'none' }}
      >
        {/* Fill bar */}
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 transition-[width] duration-75"
          style={{ width: `${fillPct}%` }}
        />
        {/* Thumb */}
        <div
          className={`absolute top-1/2 h-4.5 w-4.5 -translate-y-1/2 rounded-full border-2 border-white/80 bg-white shadow-[0_0_14px_rgba(96,165,250,0.7)] transition-transform ${
            disabled ? '' : 'group-hover:scale-125'
          }`}
          style={{ left: `calc(${fillPct}% - 9px)` }}
        />
        {/* Best epoch marker */}
        {trainingDone && totalEpochs > 1 && (
          <div
            className="absolute top-full mt-0.5 text-[10px] text-yellow-300 pointer-events-none"
            style={{ left: `calc(${bestPct}% - 5px)` }}
            title={`Epoch tốt nhất: ${bestEpoch}`}
          >
            ★
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <IconButton onClick={() => seekTo(0)} title="Về đầu" disabled={disabled}>⏮</IconButton>
          <IconButton onClick={stepBack} title="Lùi 1 bước" disabled={disabled}>⏪</IconButton>
          <IconButton onClick={isPlaying ? pause : play} title={isPlaying ? 'Tạm dừng' : 'Phát'} disabled={disabled} primary>
            {isPlaying ? '⏸' : '▶'}
          </IconButton>
          <IconButton onClick={stepForward} title="Tiến 1 bước" disabled={disabled}>⏩</IconButton>
          <IconButton onClick={() => seekTo(maxFloat)} title="Về cuối" disabled={disabled}>⏭</IconButton>

          <div className="ml-2 rounded-lg border border-slate-700/50 bg-slate-900/70 px-2.5 py-1.5 text-[11px] text-slate-300">
            Epoch: <span className="font-mono text-cyan-300">{currentEpochFloat.toFixed(1)}</span>
          </div>
          <div className="rounded-lg border border-slate-700/50 bg-slate-900/70 px-2.5 py-1.5 text-[11px] text-slate-300">
            Tổng: <span className="font-mono text-slate-100">{snapshots.length}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-slate-700/50 bg-slate-900/65 p-0.5">
          {[0.25, 0.5, 1, 2, 4].map((speed) => (
            <button
              key={speed}
              onClick={() => setSpeed(speed)}
              disabled={disabled}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all ${
                playbackSpeed === speed ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              } disabled:opacity-40`}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
