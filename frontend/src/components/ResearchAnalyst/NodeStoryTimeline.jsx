import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  Loader2,
  Target,
  Zap,
} from 'lucide-react'
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { motion, AnimatePresence } from 'framer-motion'
import useAuthStore from '../../store/authStore'
import { apiUrl } from '../../utils/api'

const CLASS_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#06b6d4', '#ec4899']

/**
 * NodeStoryTimeline — Shows the prediction evolution of a single node
 * across all training epochs, with shift detection and attention tracking.
 */
export default function NodeStoryTimeline({ experimentId, nodeId, graphData, onClose }) {
  const getAuthHeaders = useAuthStore((s) => s.getAuthHeaders)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [story, setStory] = useState(null)

  const fetchStory = useCallback(async () => {
    if (!experimentId || nodeId === undefined || nodeId === null) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(apiUrl(`/experiments/${experimentId}/node-story/${nodeId}`), {
        headers: { ...getAuthHeaders() },
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to load node story')
      }
      setStory(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [experimentId, nodeId, getAuthHeaders])

  useEffect(() => {
    fetchStory()
  }, [fetchStory])

  const confidenceData = useMemo(() => {
    if (!story?.timeline) return []
    return story.timeline
      .filter((t) => t.confidence !== undefined)
      .map((t) => ({
        epoch: t.epoch,
        confidence: t.confidence * 100,
        prediction: t.prediction,
        correct: t.correct ? 1 : 0,
      }))
  }, [story])

  const classProbData = useMemo(() => {
    if (!story?.timeline) return []
    const numClasses = story.timeline[0]?.probabilities?.length || 0
    return story.timeline.map((t) => {
      const row = { epoch: t.epoch }
      if (t.probabilities) {
        for (let c = 0; c < numClasses; c++) {
          row[`C${c}`] = (t.probabilities[c] || 0) * 100
        }
      }
      return row
    })
  }, [story])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-purple-400" />
        <span className="ml-2 text-sm text-slate-400">Loading node story...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
        {error}
      </div>
    )
  }

  if (!story) return null

  const nodeInfo = story.node_info || {}
  const shifts = story.shifts || []

  return (
    <div className="space-y-4">
      {/* Node Header */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-slate-100">Node #{nodeId}</h4>
            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
              {nodeInfo.groundTruth !== undefined && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CLASS_COLORS[nodeInfo.groundTruth % CLASS_COLORS.length] }} />
                  True class: C{nodeInfo.groundTruth}
                </span>
              )}
              {story.final_prediction !== undefined && (
                <span className="flex items-center gap-1">
                  <Target size={10} />
                  Final: C{story.final_prediction} ({(story.final_confidence * 100).toFixed(0)}%)
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Epochs</div>
            <div className="text-lg font-bold text-slate-100">{story.total_epochs}</div>
          </div>
        </div>
      </div>

      {/* Prediction Shifts */}
      {shifts.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-3 flex items-center gap-2">
            <Zap size={14} /> Prediction Shifts ({shifts.length})
          </h4>
          <div className="space-y-2">
            {shifts.map((shift, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-center gap-3 text-xs"
              >
                <span className="text-slate-500 font-mono w-16">Epoch {shift.epoch}</span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{
                      backgroundColor: `${CLASS_COLORS[shift.from % CLASS_COLORS.length]}20`,
                      color: CLASS_COLORS[shift.from % CLASS_COLORS.length],
                    }}
                  >
                    C{shift.from}
                  </span>
                  <ArrowRight size={12} className="text-slate-500" />
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{
                      backgroundColor: `${CLASS_COLORS[shift.to % CLASS_COLORS.length]}20`,
                      color: CLASS_COLORS[shift.to % CLASS_COLORS.length],
                    }}
                  >
                    C{shift.to}
                  </span>
                </span>
                <span className="text-slate-400">
                  {(shift.confidence * 100).toFixed(0)}% confidence
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Confidence Curve */}
      {confidenceData.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
            Confidence Evolution
          </h4>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={confidenceData}>
                <defs>
                  <linearGradient id="confGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
                <XAxis dataKey="epoch" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 9 }} />
                <Tooltip
                  contentStyle={{ background: 'var(--c-bg-elev)', border: '1px solid var(--c-border)', color: 'var(--c-fg)', borderRadius: 8, fontSize: 10 }}
                  formatter={(value) => [`${value.toFixed(1)}%`, 'Confidence']}
                />
                <Area type="monotone" dataKey="confidence" stroke="#a855f7" fill="url(#confGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Class Probability Evolution */}
      {classProbData.length > 0 && classProbData[0] && Object.keys(classProbData[0]).length > 2 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
            Class Probability Evolution
          </h4>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={classProbData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
                <XAxis dataKey="epoch" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 9 }} />
                <Tooltip
                  contentStyle={{ background: 'var(--c-bg-elev)', border: '1px solid var(--c-border)', color: 'var(--c-fg)', borderRadius: 8, fontSize: 10 }}
                  formatter={(value) => [`${value?.toFixed(1) || 0}%`]}
                />
                {Object.keys(classProbData[0])
                  .filter((k) => k !== 'epoch')
                  .map((key, i) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={CLASS_COLORS[i % CLASS_COLORS.length]}
                      strokeWidth={1.5}
                      dot={false}
                      name={key}
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Narrative Timeline */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
          <Clock size={14} /> Narrative Timeline
        </h4>
        <div className="space-y-3">
          {story.timeline
            .filter((_, i) => {
              // Show first, last, shifts, and every 25% of epochs
              const total = story.timeline.length
              return i === 0 || i === total - 1 ||
                shifts.some((s) => s.epoch === i) ||
                i % Math.max(1, Math.floor(total / 4)) === 0
            })
            .map((entry, i, arr) => {
              const isShift = shifts.some((s) => s.epoch === entry.epoch)
              const isFirst = i === 0
              const isLast = i === arr.length - 1

              return (
                <motion.div
                  key={entry.epoch}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`flex gap-3 ${isShift ? 'bg-amber-500/5 -mx-2 px-2 py-1 rounded-lg' : ''}`}
                >
                  <div className="flex flex-col items-center">
                    <div className={`w-2.5 h-2.5 rounded-full ${
                      isShift ? 'bg-amber-400' : isFirst ? 'bg-blue-400' : isLast ? 'bg-emerald-400' : 'bg-slate-600'
                    }`} />
                    {i < arr.length - 1 && <div className="w-px flex-1 bg-slate-700/50 mt-1" />}
                  </div>
                  <div className="pb-3 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-500">Epoch {entry.epoch}</span>
                      {entry.prediction !== undefined && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                          style={{
                            backgroundColor: `${CLASS_COLORS[entry.prediction % CLASS_COLORS.length]}20`,
                            color: CLASS_COLORS[entry.prediction % CLASS_COLORS.length],
                          }}
                        >
                          C{entry.prediction}
                        </span>
                      )}
                      {entry.confidence !== undefined && (
                        <span className="text-[10px] text-slate-400">
                          {(entry.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                      {entry.correct !== undefined && (
                        <span className={`text-[10px] ${entry.correct ? 'text-emerald-400' : 'text-red-400'}`}>
                          {entry.correct ? '✓' : '✗'}
                        </span>
                      )}
                    </div>
                    {isShift && (
                      <p className="text-[11px] text-amber-300 mt-0.5">
                        Shifted from C{shifts.find((s) => s.epoch === entry.epoch)?.from} to C{shifts.find((s) => s.epoch === entry.epoch)?.to}
                        {entry.confidence > 0.8 ? ' with high confidence' : ''}
                      </p>
                    )}
                    {isFirst && (
                      <p className="text-[11px] text-slate-400 mt-0.5">Initial prediction</p>
                    )}
                    {isLast && !isShift && (
                      <p className="text-[11px] text-emerald-300 mt-0.5">
                        Prediction stabilized at C{entry.prediction} ({(entry.confidence * 100).toFixed(0)}% confidence)
                      </p>
                    )}
                  </div>
                </motion.div>
              )
            })}
        </div>
      </div>
    </div>
  )
}
