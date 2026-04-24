import { useRef, useCallback } from 'react'
import { SkipBack, SkipForward, Rewind, FastForward, Play, Pause, Star } from 'lucide-react'
import usePlayerStore from '../store/playerStore'

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
    <div className="flex flex-col gap-1.5 py-1">
      {/* Interactive scrubber track */}
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className={`relative h-1.5 rounded-full bg-slate-800/60 ${disabled ? 'opacity-30' : 'cursor-pointer group hover:h-2 transition-all'}`}
        style={{ touchAction: 'none' }}
      >
        {/* Fill bar */}
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 transition-[width] duration-75"
          style={{ width: `${fillPct}%` }}
        />
        {/* Thumb */}
        <div
          className={`absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-white/90 bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.5)] transition-transform ${
            disabled ? 'hidden' : 'scale-0 group-hover:scale-100'
          }`}
          style={{ left: `calc(${fillPct}% - 7px)` }}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button onClick={() => seekTo(0)} disabled={disabled} className="p-1.5 text-slate-500 hover:text-white disabled:opacity-30 transition-colors rounded-lg hover:bg-slate-800/50">
            <SkipBack size={14} />
          </button>
          <button onClick={stepBack} disabled={disabled} className="p-1.5 text-slate-500 hover:text-white disabled:opacity-30 transition-colors rounded-lg hover:bg-slate-800/50">
            <Rewind size={14} />
          </button>
          <button
            onClick={isPlaying ? pause : play}
            disabled={disabled}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-30 transition-all shadow-lg shadow-cyan-500/10"
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
          </button>
          <button onClick={stepForward} disabled={disabled} className="p-1.5 text-slate-500 hover:text-white disabled:opacity-30 transition-colors rounded-lg hover:bg-slate-800/50">
            <FastForward size={14} />
          </button>
          <button onClick={() => seekTo(maxFloat)} disabled={disabled} className="p-1.5 text-slate-500 hover:text-white disabled:opacity-30 transition-colors rounded-lg hover:bg-slate-800/50">
            <SkipForward size={14} />
          </button>

          <div className="ml-4 flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-[8px] uppercase text-slate-500 font-bold">Current</span>
              <span className="text-[11px] font-mono text-cyan-400 font-bold">{currentEpochFloat.toFixed(1)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] uppercase text-slate-500 font-bold">Total</span>
              <span className="text-[11px] font-mono text-slate-300">{snapshots.length}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-slate-900/40 p-1 rounded-lg border border-slate-800/60">
          {[0.5, 1, 2, 4].map((speed) => (
            <button
              key={speed}
              onClick={() => setSpeed(speed)}
              disabled={disabled}
              className={`px-2.5 py-1 rounded-md text-[9px] font-bold transition-all ${
                playbackSpeed === speed ? 'bg-slate-800 text-cyan-400' : 'text-slate-500 hover:text-slate-300'
              } disabled:opacity-30`}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
