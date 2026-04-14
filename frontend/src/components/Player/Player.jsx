import React, { useRef, useEffect, useState } from 'react'
import usePlayerStore from '../../store/playerStore'

const Btn = ({ children, onClick, disabled, title }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-slate-200 text-sm transition-all hover:scale-105 active:scale-95"
  >
    {children}
  </button>
)

export default function Player() {
  const {
    snapshots, currentEpochFloat, isPlaying, playbackSpeed, 
    trainingDone, bestEpoch, totalEpochs, play, pause, seekTo, stepForward, stepBack, setSpeed
  } = usePlayerStore()

  const disabled = !trainingDone || totalEpochs < 2
  const maxFloat = Math.max(0, totalEpochs - 1)
  
  // Timeline Scrubber
  const timelineRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)

  const handlePointerDown = (e) => {
    if (disabled) return
    setIsDragging(true)
    pause()
    updateFromPointer(e)
  }

  const handlePointerMove = (e) => {
    if (!isDragging || disabled) return
    updateFromPointer(e)
  }

  const handlePointerUp = () => {
    setIsDragging(false)
  }

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
      return () => {
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerUp)
      }
    }
  }, [isDragging])

  const updateFromPointer = (e) => {
    if (!timelineRef.current) return
    const rect = timelineRef.current.getBoundingClientRect()
    let x = (e.clientX - rect.left) / rect.width
    x = Math.max(0, Math.min(1, x))
    seekTo(x * maxFloat)
  }

  const fillPct = totalEpochs <= 1 ? 0 : (currentEpochFloat / maxFloat) * 100
  const bestPct = totalEpochs <= 1 ? 0 : (bestEpoch / maxFloat) * 100

  return (
    <div className="bg-slate-900 border-t border-slate-800 z-50">
      {/* Timeline */}
      <div 
        ref={timelineRef}
        className={`h-6 relative group cursor-pointer touch-none select-none px-4 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
        onPointerDown={handlePointerDown}
      >
        <div className="absolute top-1/2 left-4 right-4 -translate-y-1/2 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-transform duration-75"
            style={{ width: `${fillPct}%` }}
          />
        </div>
        
        {/* Playhead Dot */}
        <div 
          className="absolute top-1/2 -translate-y-1/2 -ml-2 w-4 h-4 bg-white rounded-full shadow-[0_0_10px_rgba(59,130,246,0.8)] opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `calc(1rem + ${fillPct} * calc(100% - 2rem) / 100)` }}
        />

        {/* Best Epoch Marker */}
        {trainingDone && totalEpochs > 1 && (
          <div 
            className="absolute top-1/2 -translate-y-1/2 -ml-2 text-yellow-400 text-[10px] pointer-events-none drop-shadow-[0_0_4px_rgba(250,204,21,0.8)]"
            style={{ left: `calc(1rem + ${bestPct} * calc(100% - 2rem) / 100)` }}
            title={`Best Epoch: ${bestEpoch}`}
          >
            ★
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between px-4 pb-2 pt-1">
        <div className="flex items-center gap-1">
          <Btn onClick={() => seekTo(0)} disabled={disabled} title="Go to start">⏮</Btn>
          <Btn onClick={stepBack} disabled={disabled} title="Step back">⏪</Btn>
          <button
            onClick={isPlaying ? pause : play}
            disabled={disabled}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 disabled:opacity-30 text-white text-lg transition-all hover:scale-105 active:scale-95 shadow-lg shadow-blue-500/20"
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <Btn onClick={stepForward} disabled={disabled} title="Step forward">⏩</Btn>
          <Btn onClick={() => seekTo(maxFloat)} disabled={disabled} title="Go to end">⏭</Btn>
          
          <div className="ml-4 font-mono text-xs text-slate-400 min-w[60px]">
            Ep: {currentEpochFloat.toFixed(1)}
          </div>
        </div>

        {/* Speed Selector */}
        <div className="flex bg-slate-800 rounded-lg p-1">
          {[0.25, 0.5, 1, 2, 4].map(s => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              disabled={disabled}
              className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${playbackSpeed === s ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'} disabled:opacity-30`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
