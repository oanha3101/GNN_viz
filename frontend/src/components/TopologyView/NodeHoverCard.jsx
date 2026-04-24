import React, { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { buildHoverSummary } from '../../utils/nodeHoverSummary'

/**
 * NodeHoverCard — A sleek, task-aware overlay showing node information.
 * Anchored to the top-right of its parent container.
 */
export default function NodeHoverCard() {
  const hoveredNodeId = useGNNStore(s => s.hoveredNodeId)
  const selectedNodeId = useGNNStore(s => s.selectedNodeId)
  const selectedTask = useGNNStore(s => s.selectedTask)
  const graphData = useGNNStore(s => s.graphData)
  const groundTruth = useGNNStore(s => s.groundTruth)
  
  const snapshots = usePlayerStore(s => s.snapshots)
  const currentEpoch = usePlayerStore(s => s.currentEpoch)
  const snap = snapshots[currentEpoch] || null

  // Which node to prioritize: hovered or selected (if no hover)
  const activeId = hoveredNodeId !== null ? hoveredNodeId : null

  const summary = useMemo(() => {
    if (activeId === null) return null
    return buildHoverSummary(selectedTask, activeId, snap, graphData, groundTruth)
  }, [selectedTask, activeId, snap, graphData, groundTruth])

  return (
    <AnimatePresence>
      {summary && (
        <motion.div
          initial={{ opacity: 0, x: 20, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 10, scale: 0.95 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="absolute top-4 right-4 z-30 w-64 pointer-events-none"
        >
          <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden shadow-black/50">
            {/* Header */}
            <div className="bg-white/5 px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Node Inspector
              </span>
              <span className="text-micro font-mono text-cyan-400 font-bold">
                ID: {activeId}
              </span>
            </div>

            {/* Body */}
            <div className="p-4 space-y-3">
              {/* Chips */}
              {summary.chips.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {summary.chips.map((chip, i) => (
                    <div
                      key={i}
                      className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight border ${
                        chip.tone === 'green' ? 'bg-green-500/10 border-green-500/20 text-green-400' :
                        chip.tone === 'red' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                        chip.tone === 'purple' ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' :
                        chip.tone === 'amber' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                        chip.tone === 'cyan' ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' :
                        'bg-blue-500/10 border-blue-500/20 text-blue-400'
                      }`}
                    >
                      {chip.label}: {chip.value}
                    </div>
                  ))}
                </div>
              )}

              {/* Rows */}
              <div className="space-y-1.5">
                {summary.rows.map((row, i) => (
                  <div key={i} className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-500 font-medium">{row.label}</span>
                    <span className="text-slate-200 font-mono font-bold">{row.value}</span>
                  </div>
                ))}
              </div>

              {/* Hint */}
              <div className="pt-2 mt-2 border-t border-white/5">
                <p className="text-[8px] text-slate-500 italic text-center uppercase tracking-widest font-bold">
                  Click to Pin & View Full Details
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
