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
    configuredEpochs,
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
  const currentSnapshot = snapshots[Math.floor(currentEpochFloat)] || snapshots[snapshots.length - 1] || null
  const currentEpochLabel = Number.isFinite(Number(currentSnapshot?.epoch))
    ? Number(currentSnapshot.epoch)
    : currentEpochFloat
  const configuredEpochTotal = Number.isFinite(Number(configuredEpochs)) && Number(configuredEpochs) > 0
    ? Number(configuredEpochs)
    : snapshots.length

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
        className={`lab-player-track relative h-1.5 rounded-full ${disabled ? 'opacity-30' : 'cursor-pointer group hover:h-2 transition-all'}`}
        style={{ touchAction: 'none' }}
      >
        {/* Fill bar */}
        <div
          className="lab-player-fill absolute left-0 top-0 h-full rounded-full transition-[width] duration-75"
          style={{ width: `${fillPct}%` }}
        />
        {!disabled && Number.isFinite(bestEpoch) && bestEpoch >= 0 && (
          <div
            className="absolute top-1/2 h-3 w-1 -translate-y-1/2 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.75)]"
            style={{ left: `calc(${bestPct}% - 2px)` }}
            title={`Best epoch ${bestEpoch}`}
          />
        )}
        {/* Thumb */}
        <div
          className={`lab-player-thumb absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 transition-transform ${
            disabled ? 'hidden' : 'scale-0 group-hover:scale-100'
          }`}
          style={{ left: `calc(${fillPct}% - 7px)` }}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button data-testid="player-seek-start" onClick={() => seekTo(0)} disabled={disabled} className="lab-player-secondary p-1.5 disabled:opacity-30 transition-colors rounded-lg">
            <SkipBack size={14} />
          </button>
          <button data-testid="player-step-back" onClick={stepBack} disabled={disabled} className="lab-player-secondary p-1.5 disabled:opacity-30 transition-colors rounded-lg">
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
                ? 'lab-player-toggle-active lab-player-toggle-idle animate-[pulse_2s_ease-in-out_infinite]'
                : isTraining
                  ? 'lab-player-toggle-active lab-player-toggle-training'
                  : 'lab-player-toggle-active disabled:opacity-30'
            }`}
          >
            {isTraining
              ? <Loader2 size={16} className="lab-player-toggle-icon animate-spin" />
              : isPlaying
                ? <Pause size={15} className="lab-player-toggle-icon" />
                : <Play size={15} className="lab-player-toggle-icon ml-0.5" />}
          </button>
          <button data-testid="player-step-forward" onClick={stepForward} disabled={disabled} className="lab-player-secondary p-1.5 disabled:opacity-30 transition-colors rounded-lg">
            <FastForward size={14} />
          </button>
          <button data-testid="player-seek-end" onClick={() => seekTo(maxFloat)} disabled={disabled} className="lab-player-secondary p-1.5 disabled:opacity-30 transition-colors rounded-lg">
            <SkipForward size={14} />
          </button>

          <div className="ml-4 flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-[8px] uppercase text-fg-faint font-bold">Current</span>
              <span data-testid="player-current-epoch" className="lab-player-metric text-[11px] font-mono font-bold">{Number(currentEpochLabel).toFixed(1)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] uppercase text-fg-faint font-bold">Epochs</span>
              <span data-testid="player-total-epochs" className="text-[11px] font-mono text-fg-muted">{configuredEpochTotal}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] uppercase text-fg-faint font-bold">Frames</span>
              <span data-testid="player-total-frames" className="text-[11px] font-mono text-fg-muted">{snapshots.length}</span>
            </div>
          </div>
        </div>

        <div className="lab-player-speed-wrap flex items-center gap-1 p-1 rounded-lg border">
          {[0.5, 1, 2, 4].map((speed) => (
            <button
              key={speed}
              onClick={() => setSpeed(speed)}
              disabled={disabled}
              className={`px-2.5 py-1 rounded-md text-[9px] font-bold transition-all ${
                playbackSpeed === speed ? 'lab-player-speed-active' : 'lab-player-speed-idle'
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
