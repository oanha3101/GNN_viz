import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileText,
  Lightbulb,
  Loader2,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import useAuthStore from '../../store/authStore'
import { apiUrl } from '../../utils/api'

const PRIORITY_CONFIG = {
  high: { color: '#ef4444', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: AlertTriangle, label: 'High' },
  moderate: { color: '#f59e0b', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: Target, label: 'Moderate' },
  low: { color: '#22c55e', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: Lightbulb, label: 'Low' },
}

const CATEGORY_CONFIG = {
  architecture: { icon: Zap, color: '#a855f7' },
  regularization: { icon: Target, color: '#3b82f6' },
  optimization: { icon: TrendingUp, color: '#f59e0b' },
  model_selection: { icon: CheckCircle2, color: '#22c55e' },
  loss_function: { icon: Sparkles, color: '#ec4899' },
  dataset: { icon: FileText, color: '#06b6d4' },
}

/**
 * RecommendationsPanel — Shows actionable recommendations for improving
 * the experiment, with priority ranking and expected impact.
 */
export default function RecommendationsPanel({ experimentId }) {
  const getAuthHeaders = useAuthStore((s) => s.getAuthHeaders)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [researchNotes, setResearchNotes] = useState(null)
  const [notesLoading, setNotesLoading] = useState(false)
  const [activeView, setActiveView] = useState('recommendations')

  const fetchData = useCallback(async () => {
    if (!experimentId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(apiUrl(`/experiments/${experimentId}/recommendations`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      })
      const text = await res.text()
      if (!res.ok) {
        let detail = 'Failed to load recommendations'
        try { detail = JSON.parse(text).detail || detail } catch {}
        throw new Error(detail)
      }
      setData(JSON.parse(text))
    } catch (err) {
      setError(err?.message || 'Failed to load recommendations')
    } finally {
      setLoading(false)
    }
  }, [experimentId, getAuthHeaders])

  const fetchResearchNotes = useCallback(async () => {
    if (!experimentId) return
    setNotesLoading(true)
    try {
      const res = await fetch(apiUrl(`/experiments/${experimentId}/research-notes`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      })
      const text = await res.text()
      if (!res.ok) {
        let detail = 'Failed to generate research notes'
        try { detail = JSON.parse(text).detail || detail } catch {}
        throw new Error(detail)
      }
      setResearchNotes(JSON.parse(text))
    } catch (err) {
      console.error('Research notes error:', err)
    } finally {
      setNotesLoading(false)
    }
  }, [experimentId, getAuthHeaders])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-purple-400" />
        <span className="ml-2 text-sm text-slate-400">Analyzing experiment...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
        <div className="font-semibold">Failed to load recommendations</div>
        <div className="mt-1 text-red-200/90">{error}</div>
      </div>
    )
  }

  if (!data) return null

  const recs = data.recommendations || []
  const highRecs = recs.filter((r) => r.priority === 'high')
  const modRecs = recs.filter((r) => r.priority === 'moderate')
  const lowRecs = recs.filter((r) => r.priority === 'low')
  const analystSource = data.source === 'llm' ? 'AI Analyst' : 'Heuristic Analyst'
  const analystModel = data?.llm?.model

  return (
    <div className="space-y-4">
      {/* View Toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveView('recommendations')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeView === 'recommendations'
              ? 'bg-purple-500/15 text-purple-300 ring-1 ring-purple-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          Recommendations
        </button>
        <button
          onClick={() => {
            setActiveView('notes')
            if (!researchNotes) fetchResearchNotes()
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeView === 'notes'
              ? 'bg-purple-500/15 text-purple-300 ring-1 ring-purple-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          Research Notes
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeView === 'recommendations' ? (
          <motion.div key="recs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            {/* Summary */}
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-400 mb-2">
                <Sparkles size={14} /> Analysis Summary
              </div>
              <div className="mb-2 text-[11px] text-slate-400">
                Source: <span className="text-slate-200">{analystSource}</span>
                {analystModel ? <span className="text-slate-500"> · {analystModel}</span> : null}
              </div>
              <p className="text-sm text-slate-200">{data.summary}</p>
              <div className="flex items-center gap-3 mt-3">
                <PriorityBadge count={data.priority_counts?.high} priority="high" />
                <PriorityBadge count={data.priority_counts?.moderate} priority="moderate" />
                <PriorityBadge count={data.priority_counts?.low} priority="low" />
              </div>
            </div>

            {data.analyst_brief ? (
              <div className="grid gap-3 md:grid-cols-3">
                <BriefBlock title="Key findings" items={data.analyst_brief.findings} />
                <BriefBlock title="Main risks" items={data.analyst_brief.risks} />
                <BriefBlock title="Next steps" items={data.analyst_brief.next_steps} />
              </div>
            ) : null}

            {/* High Priority */}
            {highRecs.length > 0 && (
              <RecommendationGroup title="High Priority" recs={highRecs} />
            )}

            {/* Moderate Priority */}
            {modRecs.length > 0 && (
              <RecommendationGroup title="Moderate Priority" recs={modRecs} />
            )}

            {/* Low Priority */}
            {lowRecs.length > 0 && (
              <RecommendationGroup title="Suggestions" recs={lowRecs} />
            )}

            {recs.length === 0 && (
              <div className="flex items-center gap-3 text-sm text-emerald-400 py-4">
                <CheckCircle2 size={20} />
                Training looks healthy — no major improvements needed.
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div key="notes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            {notesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={16} className="animate-spin text-purple-400" />
                <span className="ml-2 text-sm text-slate-400">Generating research notes...</span>
              </div>
            ) : researchNotes ? (
              <ResearchNotesDisplay notes={researchNotes} />
            ) : (
              <div className="text-sm text-slate-400 py-4">Failed to generate research notes.</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PriorityBadge({ count, priority }) {
  const config = PRIORITY_CONFIG[priority]
  if (!count) return null
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${config.bg}`}>
      <config.icon size={10} style={{ color: config.color }} />
      <span style={{ color: config.color }}>{count} {config.label}</span>
    </span>
  )
}

function RecommendationGroup({ title, recs }) {
  return (
    <div>
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">{title}</h4>
      <div className="space-y-2">
        {recs.map((rec, i) => (
          <RecommendationCard key={i} rec={rec} index={i} />
        ))}
      </div>
    </div>
  )
}

function RecommendationCard({ rec, index }) {
  const priorityConfig = PRIORITY_CONFIG[rec.priority] || PRIORITY_CONFIG.low
  const categoryConfig = CATEGORY_CONFIG[rec.category] || CATEGORY_CONFIG.dataset
  const CategoryIcon = categoryConfig.icon
  const PriorityIcon = priorityConfig.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`rounded-xl border ${priorityConfig.border} ${priorityConfig.bg} p-3`}
    >
      <div className="flex items-start gap-3">
        <div className="p-1.5 rounded-lg" style={{ backgroundColor: `${categoryConfig.color}20` }}>
          <CategoryIcon size={14} style={{ color: categoryConfig.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h5 className="text-xs font-semibold text-slate-100">{rec.action}</h5>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase"
              style={{ backgroundColor: `${priorityConfig.color}20`, color: priorityConfig.color }}>
              {rec.priority}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400">
              {rec.category?.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-[11px] text-slate-300 mt-1.5">{rec.reason}</p>
          {rec.expected_impact && (
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-cyan-300">
              <ArrowRight size={10} />
              {rec.expected_impact}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

function ResearchNotesDisplay({ notes }) {
  const sections = notes?.sections || []

  return (
    <div className="space-y-3">
      <div className="text-[11px] text-slate-400">
        Source: <span className="text-slate-200">{notes?.source === 'llm' ? 'AI Analyst' : 'Heuristic Analyst'}</span>
        {notes?.llm?.model ? <span className="text-slate-500"> · {notes.llm.model}</span> : null}
      </div>
      {sections.map((section, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08 }}
          className="rounded-xl border border-slate-800 bg-slate-900/40 p-4"
        >
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">{section.title}</h4>
          <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
            {section.content}
          </div>
        </motion.div>
      ))}
    </div>
  )
}

function BriefBlock({ title, items }) {
  if (!items?.length) return null
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
      <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">{title}</h4>
      <div className="space-y-1.5">
        {items.map((item, index) => (
          <div key={index} className="text-xs text-slate-300">
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}
