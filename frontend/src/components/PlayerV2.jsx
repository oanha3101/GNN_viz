import { useRef, useCallback, useEffect } from 'react'
import { SkipBack, SkipForward, Rewind, FastForward, Play, Pause, Loader2 } from 'lucide-react'
import usePlayerStore from '../store/playerStore'
import useGNNStore from '../store/useGNNStore'

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

  const isTraining = useGNNStore((s) => s.isTraining)
  const isViewer = useGNNStore((s) => s.userRole === 'viewer')
  const idle = !isTraining && !trainingDone && snapshots.length === 0
  const disabled = !trainingDone || totalEpochs < 2

  const startTraining = useCallback(() => {
    if (isViewer || isTraining) return
    window.dispatchEvent(new CustomEvent('gnn:request-start-training'))
  }, [isTraining, isViewer])

  // Space shortcut: when idle, Space starts training. When training is done, Space toggles playback.
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Space') return
      const tag = (e.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return
      e.preventDefault()
      if (idle) {
        startTraining()
      } else if (trainingDone && totalEpochs >= 2) {
        if (isPlaying) pause(); else play()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [idle, isPlaying, pause, play, startTraining, totalEpochs, trainingDone])
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
        data-testid="player-track"
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
          <button data-testid="player-seek-start" onClick={() => seekTo(0)} disabled={disabled} className="p-1.5 text-slate-500 hover:text-white disabled:opacity-30 transition-colors rounded-lg hover:bg-slate-800/50">
            <SkipBack size={14} />
          </button>
          <button data-testid="player-step-back" onClick={stepBack} disabled={disabled} className="p-1.5 text-slate-500 hover:text-white disabled:opacity-30 transition-colors rounded-lg hover:bg-slate-800/50">
            <Rewind size={14} />
          </button>
          <button
            data-testid="player-toggle-play"
            onClick={() => {
              if (idle) startTraining()
              else if (isPlaying) pause()
              else play()
            }}
            disabled={(!idle && disabled) || isTraining}
            title={idle ? 'Run training (Space)' : isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            className={`w-9 h-9 flex items-center justify-center rounded-full transition-all shadow-lg ${
              idle
                ? 'bg-rose-500 text-white hover:bg-rose-400 shadow-rose-500/30 ring-2 ring-rose-300/30 animate-[pulse_2s_ease-in-out_infinite]'
                : isTraining
                  ? 'bg-rose-500/40 text-white shadow-rose-500/20'
                  : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-30 shadow-cyan-500/10'
            }`}
          >
            {isTraining
              ? <Loader2 size={16} className="animate-spin" />
              : isPlaying
                ? <Pause size={15} />
                : <Play size={15} className="ml-0.5" />}
          </button>
          <button data-testid="player-step-forward" onClick={stepForward} disabled={disabled} className="p-1.5 text-slate-500 hover:text-white disabled:opacity-30 transition-colors rounded-lg hover:bg-slate-800/50">
            <FastForward size={14} />
          </button>
          <button data-testid="player-seek-end" onClick={() => seekTo(maxFloat)} disabled={disabled} className="p-1.5 text-slate-500 hover:text-white disabled:opacity-30 transition-colors rounded-lg hover:bg-slate-800/50">
            <SkipForward size={14} />
          </button>

          <div className="ml-4 flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-[8px] uppercase text-slate-500 font-bold">Current</span>
              <span data-testid="player-current-epoch" className="text-[11px] font-mono text-cyan-400 font-bold">{currentEpochFloat.toFixed(1)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] uppercase text-slate-500 font-bold">Total</span>
              <span data-testid="player-total-epochs" className="text-[11px] font-mono text-slate-300">{snapshots.length}</span>
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
