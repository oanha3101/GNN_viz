import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileText,
  Lightbulb,
  Loader2,
  Save,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import useAuthStore from '../../store/authStore'
import { useLanguage } from '../../contexts/LanguageContext'
import { apiUrl } from '../../utils/api'

const PRIORITY_CONFIG = {
  high: { color: '#ef4444', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: AlertTriangle, labelKey: 'analyst.high' },
  moderate: { color: '#f59e0b', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: Target, labelKey: 'analyst.moderate' },
  low: { color: '#22c55e', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: Lightbulb, labelKey: 'analyst.low' },
}

const CATEGORY_CONFIG = {
  architecture: { icon: Zap, color: '#a855f7', labelKey: 'analyst.category_architecture' },
  regularization: { icon: Target, color: '#3b82f6', labelKey: 'analyst.category_regularization' },
  optimization: { icon: TrendingUp, color: '#f59e0b', labelKey: 'analyst.category_optimization' },
  model_selection: { icon: CheckCircle2, color: '#22c55e', labelKey: 'analyst.category_model_selection' },
  loss_function: { icon: Sparkles, color: '#ec4899', labelKey: 'analyst.category_loss_function' },
  dataset: { icon: FileText, color: '#06b6d4', labelKey: 'analyst.category_dataset' },
}

/**
 * RecommendationsPanel — Shows actionable recommendations for improving
 * the experiment, with priority ranking and expected impact.
 */
export default function RecommendationsPanel({ experimentId }) {
  const getAuthHeaders = useAuthStore((s) => s.getAuthHeaders)
  const { t, lang } = useLanguage()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [researchNotes, setResearchNotes] = useState(null)
  const [notesLoading, setNotesLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null)
  const [activeView, setActiveView] = useState('recommendations')

  const fetchData = useCallback(async () => {
    if (!experimentId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(apiUrl(`/experiments/${experimentId}/recommendations?lang=${lang}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      })
      const text = await res.text()
      if (!res.ok) {
        let detail = t('analyst.load_failed')
        try { detail = JSON.parse(text).detail || detail } catch {}
        throw new Error(detail)
      }
      setData(JSON.parse(text))
    } catch (err) {
      setError(err?.message || t('analyst.load_failed'))
    } finally {
      setLoading(false)
    }
  }, [experimentId, getAuthHeaders, t, lang])

  const fetchResearchNotes = useCallback(async () => {
    if (!experimentId) return
    setNotesLoading(true)
    try {
      const res = await fetch(apiUrl(`/experiments/${experimentId}/research-notes?lang=${lang}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      })
      const text = await res.text()
      if (!res.ok) {
        let detail = t('analyst.notes_failed')
        try { detail = JSON.parse(text).detail || detail } catch {}
        throw new Error(detail)
      }
      setResearchNotes(JSON.parse(text))
    } catch (err) {
      console.error('Research notes error:', err)
    } finally {
      setNotesLoading(false)
    }
  }, [experimentId, getAuthHeaders, t, lang])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const saveAnalysisToNotes = useCallback(async () => {
    if (!experimentId || !data) return
    setSaveLoading(true)
    setSaveStatus(null)
    try {
      const currentRes = await fetch(apiUrl(`/experiments/${experimentId}`), {
        headers: { ...getAuthHeaders() },
      })
      const currentText = await currentRes.text()
      if (!currentRes.ok) {
        let detail = 'Không tải được ghi chú hiện tại.'
        try { detail = JSON.parse(currentText).detail || detail } catch {}
        throw new Error(detail)
      }
      const current = JSON.parse(currentText)
      const existingNotes = current.notes || ''
      const payload = activeView === 'notes' && researchNotes
        ? formatResearchNotesForSave(researchNotes)
        : formatRecommendationsForSave(data)
      const nextNotes = [existingNotes.trim(), payload].filter(Boolean).join('\n\n')
      const patchRes = await fetch(apiUrl(`/experiments/${experimentId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ notes: nextNotes }),
      })
      const patchText = await patchRes.text()
      if (!patchRes.ok) {
        let detail = 'Không lưu được phân tích AI.'
        try { detail = JSON.parse(patchText).detail || detail } catch {}
        throw new Error(detail)
      }
      setSaveStatus('saved')
    } catch (err) {
      setSaveStatus(err?.message || 'Không lưu được phân tích AI.')
    } finally {
      setSaveLoading(false)
    }
  }, [activeView, data, experimentId, getAuthHeaders, researchNotes])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-purple-400" />
        <span className="ml-2 text-sm text-slate-400">{t('analyst.analyzing')}</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
        <div className="font-semibold">{t('analyst.load_failed')}</div>
        <div className="mt-1 text-red-200/90">{error}</div>
      </div>
    )
  }

  if (!data) return null

  const recs = data.recommendations || []
  const highRecs = recs.filter((r) => r.priority === 'high')
  const modRecs = recs.filter((r) => r.priority === 'moderate')
  const lowRecs = recs.filter((r) => r.priority === 'low')
  const analystSource = data.source === 'llm' ? t('analyst.ai_analyst') : t('analyst.heuristic_analyst')
  const analystProvider = data?.llm?.provider
  const analystModel = data?.llm?.model
  const analystLabel = data.source === 'llm' && analystProvider
    ? `${analystProvider.toUpperCase()} Analyst`
    : analystSource

  return (
    <div className="space-y-4">
      {/* View Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveView('recommendations')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeView === 'recommendations'
              ? 'bg-purple-500/15 text-purple-300 ring-1 ring-purple-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-nebula/50'
          }`}
        >
          {t('analyst.recommendations')}
        </button>
        <button
          onClick={() => {
            setActiveView('notes')
            if (!researchNotes) fetchResearchNotes()
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeView === 'notes'
              ? 'bg-purple-500/15 text-purple-300 ring-1 ring-purple-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-nebula/50'
          }`}
        >
          {t('analyst.research_notes')}
        </button>
        </div>
        <button
          type="button"
          onClick={saveAnalysisToNotes}
          disabled={saveLoading || !data}
          className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:border-cyan-400/40 hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saveLoading ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {saveLoading ? 'Đang lưu' : 'Lưu phân tích'}
        </button>
      </div>
      {saveStatus ? (
        <div className={`rounded-lg border px-3 py-2 text-xs ${
          saveStatus === 'saved'
            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
            : 'border-red-500/20 bg-red-500/10 text-red-200'
        }`}>
          {saveStatus === 'saved' ? 'Đã lưu phân tích AI vào ghi chú thí nghiệm.' : saveStatus}
        </div>
      ) : null}

      <AnimatePresence mode="wait">
        {activeView === 'recommendations' ? (
          <motion.div key="recs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            {/* Summary */}
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-400 mb-2">
                <Sparkles size={14} /> {t('analyst.analysis_summary')}
              </div>
              <div className="mb-2 text-[11px] text-slate-400">
                {t('analyst.source')}: <span className="text-slate-200">{analystLabel}</span>
                {analystModel ? <span className="text-slate-500"> - {analystModel}</span> : null}
              </div>
              <p className="text-sm text-slate-200">{data.summary}</p>
              <div className="flex items-center gap-3 mt-3">
                <PriorityBadge count={data.priority_counts?.high} priority="high" t={t} lang={lang} />
                <PriorityBadge count={data.priority_counts?.moderate} priority="moderate" t={t} lang={lang} />
                <PriorityBadge count={data.priority_counts?.low} priority="low" t={t} lang={lang} />
              </div>
            </div>

            {data.analyst_brief ? (
              <div className="grid gap-3 md:grid-cols-3">
                <BriefBlock title={t('analyst.key_findings')} items={data.analyst_brief.findings} />
                <BriefBlock title={t('analyst.main_risks')} items={data.analyst_brief.risks} />
                <BriefBlock title={t('analyst.next_steps')} items={data.analyst_brief.next_steps} />
              </div>
            ) : null}

            {data.detailed_analysis?.length ? (
              <DetailedAnalysis sections={data.detailed_analysis} />
            ) : null}

            {/* High Priority */}
            {highRecs.length > 0 && (
              <RecommendationGroup title={t('analyst.high_priority')} recs={highRecs} t={t} />
            )}

            {/* Moderate Priority */}
            {modRecs.length > 0 && (
              <RecommendationGroup title={t('analyst.moderate_priority')} recs={modRecs} t={t} />
            )}

            {/* Low Priority */}
            {lowRecs.length > 0 && (
              <RecommendationGroup title={t('analyst.suggestions')} recs={lowRecs} t={t} />
            )}

            {recs.length === 0 && (
              <div className="flex items-center gap-3 text-sm text-emerald-400 py-4">
                <CheckCircle2 size={20} />
                {t('analyst.training_healthy')}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div key="notes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            {notesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={16} className="animate-spin text-purple-400" />
                <span className="ml-2 text-sm text-slate-400">{t('analyst.generating_notes')}</span>
              </div>
            ) : researchNotes ? (
              <ResearchNotesDisplay notes={researchNotes} t={t} />
            ) : (
              <div className="text-sm text-slate-400 py-4">{t('analyst.notes_failed')}</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function formatList(items = []) {
  return items.filter(Boolean).map((item) => `- ${item}`).join('\n')
}

function formatRecommendationsForSave(data) {
  const brief = data?.analyst_brief || {}
  const llm = data?.llm || {}
  const provider = llm.provider ? `${String(llm.provider).toUpperCase()} Analyst` : (data?.source || 'analyst')
  const model = llm.model ? ` - ${llm.model}` : ''
  const sections = (data?.detailed_analysis || [])
    .map((section) => `### ${section.title}\n${section.body}`)
    .join('\n\n')
  const recs = (data?.recommendations || [])
    .map((rec) => [
      `- [${rec.priority || 'moderate'}] ${rec.action || ''}`,
      rec.reason ? `  Lý do: ${rec.reason}` : '',
      rec.expected_impact ? `  Tác động: ${rec.expected_impact}` : '',
    ].filter(Boolean).join('\n'))
    .join('\n')

  return [
    `## AI Analyst Snapshot (${new Date().toLocaleString()})`,
    `Nguồn: ${provider}${model}`,
    data?.summary ? `\n### Tóm tắt\n${data.summary}` : '',
    brief.findings?.length ? `\n### Phát hiện chính\n${formatList(brief.findings)}` : '',
    brief.risks?.length ? `\n### Rủi ro\n${formatList(brief.risks)}` : '',
    brief.next_steps?.length ? `\n### Bước tiếp theo\n${formatList(brief.next_steps)}` : '',
    sections ? `\n${sections}` : '',
    recs ? `\n### Khuyến nghị\n${recs}` : '',
  ].filter(Boolean).join('\n')
}

function formatResearchNotesForSave(notes) {
  const llm = notes?.llm || {}
  const provider = notes?.source === 'llm' && llm.provider ? `${String(llm.provider).toUpperCase()} Analyst` : (notes?.source || 'analyst')
  const model = llm.model ? ` - ${llm.model}` : ''
  const sections = notes?.sections?.length
    ? notes.sections.map((section) => `### ${section.title}\n${section.content}`).join('\n\n')
    : notes?.notes || ''

  return [
    `## AI Research Notes (${new Date().toLocaleString()})`,
    `Nguồn: ${provider}${model}`,
    sections,
  ].filter(Boolean).join('\n')
}

function PriorityBadge({ count, priority, t, lang }) {
  const config = PRIORITY_CONFIG[priority]
  if (!count) return null
  const baseLabel = t(config.labelKey).toLowerCase()
  const label = lang === 'vi' && priority === 'low'
    ? `gợi ý ${baseLabel}`
    : lang === 'vi'
      ? `ưu tiên ${baseLabel}`
      : baseLabel
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${config.bg}`}>
      <config.icon size={10} style={{ color: config.color }} />
      <span style={{ color: config.color }}>{count} {label}</span>
    </span>
  )
}

function RecommendationGroup({ title, recs, t }) {
  return (
    <div>
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">{title}</h4>
      <div className="space-y-2">
        {recs.map((rec, i) => (
          <RecommendationCard key={i} rec={rec} index={i} t={t} />
        ))}
      </div>
    </div>
  )
}

function RecommendationCard({ rec, index, t }) {
  const priorityConfig = PRIORITY_CONFIG[rec.priority] || PRIORITY_CONFIG.low
  const categoryConfig = CATEGORY_CONFIG[rec.category] || CATEGORY_CONFIG.dataset
  const CategoryIcon = categoryConfig.icon

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
              {t(priorityConfig.labelKey)}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-nebula text-slate-400">
              {t(categoryConfig.labelKey)}
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

function ResearchNotesDisplay({ notes, t }) {
  const sections = notes?.sections || []

  return (
    <div className="space-y-3">
      <div className="text-[11px] text-slate-400">
        {t('analyst.source')}: <span className="text-slate-200">{notes?.source === 'llm' ? t('analyst.ai_analyst') : t('analyst.heuristic_analyst')}</span>
        {notes?.llm?.model ? <span className="text-slate-500"> - {notes.llm.model}</span> : null}
      </div>
      {sections.map((section, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08 }}
          className="rounded-xl border border-line-default bg-nebula p-4"
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

function DetailedAnalysis({ sections }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {sections.map((section, index) => (
        <motion.div
          key={`${section.title}-${index}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
          className="rounded-xl border border-cyan-500/15 bg-cyan-500/5 p-3"
        >
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-cyan-300">{section.title}</h4>
          <p className="text-xs leading-relaxed text-slate-300">{section.body}</p>
        </motion.div>
      ))}
    </div>
  )
}

function BriefBlock({ title, items }) {
  if (!items?.length) return null
  return (
    <div className="rounded-xl border border-line-default bg-nebula p-3">
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


