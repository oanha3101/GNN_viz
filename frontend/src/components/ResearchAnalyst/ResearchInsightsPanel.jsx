import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  GitCompare,
  Lightbulb,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts'
import { motion, AnimatePresence } from 'framer-motion'
import useAuthStore from '../../store/authStore'
import { useLanguage } from '../../contexts/LanguageContext'
import { apiUrl, readApiResponse } from '../../utils/api'

const COLORS = {
  purple: '#a855f7',
  blue: '#3b82f6',
  cyan: '#06b6d4',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  pink: '#ec4899',
  indigo: '#6366f1',
}

const DIAGNOSTIC_COLORS = {
  strong: '#22c55e',
  well_separated: '#22c55e',
  well_calibrated: '#22c55e',
  stable: '#22c55e',
  healthy: '#22c55e',
  focused: '#22c55e',
  confident: '#22c55e',
  fast: '#22c55e',
  efficient: '#22c55e',
  smooth: '#22c55e',
  robust: '#22c55e',
  diverse: '#22c55e',
  concentrated: '#22c55e',
  highly_coherent: '#22c55e',

  moderate: '#f59e0b',
  moderate_fit: '#f59e0b',
  moderate_smoothing: '#f59e0b',
  mild_overfitting: '#f59e0b',
  mild_smoothing: '#f59e0b',
  noisy: '#f59e0b',
  fragmented: '#f59e0b',
  redundant: '#f59e0b',
  moderate_attention: '#f59e0b',
  moderate_confidence: '#f59e0b',
  moderate_stability: '#f59e0b',

  weak: '#ef4444',
  overlapping: '#ef4444',
  miscalibrated: '#ef4444',
  unstable: '#ef4444',
  severe_collapse: '#ef4444',
  overfitting: '#ef4444',
  diffuse: '#ef4444',
  uncertain: '#ef4444',
  wasteful: '#ef4444',
  collapsing: '#ef4444',
  fragile: '#ef4444',
}

const ANALYST_COPY = {
  en: {
    showDetails: 'Show details',
    hideDetails: 'Hide details',
    less: 'Less',
    moreMetrics: (count) => `+${count} more metrics`,
    failurePatternMatrix: 'Failure Pattern Matrix',
    noFailurePatterns: 'No significant failure patterns detected',
    issueCount: (count) => `${count} ${count === 1 ? 'issue' : 'issues'}`,
    datasetAwareRecommendations: 'Dataset-Aware Recommendations',
    nodes: 'Nodes',
    edges: 'Edges',
    classes: 'Classes',
    avgDegree: 'Avg Degree',
    density: 'Density',
    homophily: 'Homophily',
    classBalance: 'Class Balance',
    type: 'Type',
    strengths: 'Strengths',
    weaknesses: 'Weaknesses',
    bestFor: 'Best For',
    model: 'Model',
    winner: 'Recommended Run',
    leaderboard: 'Reliability Leaderboard',
    nextSteps: 'Next Steps',
    watchout: 'Watchout',
    compositeScore: 'Composite score',
  },
  vi: {
    showDetails: 'Xem chi tiết',
    hideDetails: 'Ẩn chi tiết',
    less: 'Thu gọn',
    moreMetrics: (count) => `+${count} chỉ số nữa`,
    failurePatternMatrix: 'Ma trận mẫu lỗi',
    noFailurePatterns: 'Chưa phát hiện mẫu lỗi nghiêm trọng',
    issueCount: (count) => `${count} vấn đề`,
    datasetAwareRecommendations: 'Khuyến nghị theo cấu trúc dữ liệu',
    nodes: 'Đỉnh',
    edges: 'Cạnh',
    classes: 'Lớp',
    avgDegree: 'Bậc TB',
    density: 'Mật độ',
    homophily: 'Homophily',
    classBalance: 'Cân bằng lớp',
    type: 'Loại',
    strengths: 'Điểm mạnh',
    weaknesses: 'Điểm yếu',
    bestFor: 'Phù hợp nhất',
    model: 'Mô hình',
    winner: 'Phiên nên ưu tiên',
    leaderboard: 'Bảng xếp hạng độ tin cậy',
    nextSteps: 'Bước tiếp theo',
    watchout: 'Điểm cần canh chừng',
    compositeScore: 'Điểm tổng hợp',
  },
}

function getColor(label) {
  return DIAGNOSTIC_COLORS[label] || '#94a3b8'
}

function getAnalystCopy(lang) {
  return lang === 'vi' ? ANALYST_COPY.vi : ANALYST_COPY.en
}

function getRunColor(modelType, index = 0) {
  const palette = {
    GCN: '#22c55e',
    GAT: '#f59e0b',
    SAGE: '#06b6d4',
    GRAPHSAGE: '#06b6d4',
    GRAPH_SAGE: '#06b6d4',
  }
  const fallback = ['#a855f7', '#3b82f6', '#ec4899', '#14b8a6']
  return palette[String(modelType || '').toUpperCase()] || fallback[index % fallback.length]
}

function formatMetricLabel(metric, lang) {
  const labels = {
    convergence_speed: lang === 'vi' ? 'Tốc độ hội tụ' : 'Convergence Speed',
    stability_score: lang === 'vi' ? 'Độ ổn định' : 'Stability Score',
    overfitting_risk: lang === 'vi' ? 'Rủi ro quá khớp' : 'Overfitting Risk',
    over_smoothing_risk: lang === 'vi' ? 'Rủi ro over-smoothing' : 'Over-Smoothing Risk',
    boundary_accuracy: lang === 'vi' ? 'Độ đúng vùng biên' : 'Boundary Accuracy',
    prediction_entropy: lang === 'vi' ? 'Entropy dự đoán' : 'Prediction Entropy',
    embedding_separation: lang === 'vi' ? 'Tách cụm embedding' : 'Embedding Separation',
    attention_focus_score: lang === 'vi' ? 'Độ tập trung attention' : 'Attention Focus',
  }
  return labels[metric] || metric.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDiagnosticValueLabel(label, lang) {
  if (!label) return ''
  const labelMap = {
    strong: lang === 'vi' ? 'mạnh' : 'strong',
    weak: lang === 'vi' ? 'yếu' : 'weak',
    moderate: lang === 'vi' ? 'trung bình' : 'moderate',
    unstable: lang === 'vi' ? 'không ổn định' : 'unstable',
    overlapping: lang === 'vi' ? 'chồng lấp' : 'overlapping',
    diffuse: lang === 'vi' ? 'loãng' : 'diffuse',
    focused: lang === 'vi' ? 'tập trung' : 'focused',
    robust: lang === 'vi' ? 'bền' : 'robust',
    healthy: lang === 'vi' ? 'ổn' : 'healthy',
    fast: lang === 'vi' ? 'nhanh' : 'fast',
    moderate_fit: lang === 'vi' ? 'khớp vừa' : 'moderate fit',
    mild_overfitting: lang === 'vi' ? 'quá khớp nhẹ' : 'mild overfitting',
    moderate_smoothing: lang === 'vi' ? 'làm mượt vừa' : 'moderate smoothing',
    mild_smoothing: lang === 'vi' ? 'làm mượt nhẹ' : 'mild smoothing',
    highly_coherent: lang === 'vi' ? 'rất gắn kết' : 'highly coherent',
  }
  return labelMap[label] || label.replace(/_/g, ' ')
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export default function ResearchInsightsPanel({ experimentIds, onClose }) {
  const getAuthHeaders = useAuthStore((s) => s.getAuthHeaders)
  const { t, lang } = useLanguage()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [activeTab, setActiveTab] = useState('insights')

  const fetchInsights = useCallback(async () => {
    if (!experimentIds || experimentIds.length < 2) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(apiUrl(`/experiments/compare-insights?lang=${lang}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ experiment_ids: experimentIds }),
      })
      const payload = await readApiResponse(res)
      if (!res.ok) {
        throw new Error(
          typeof payload === 'string'
            ? payload
            : payload?.detail || 'Failed to generate insights'
        )
      }
      setData(payload)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [experimentIds, getAuthHeaders, lang])

  useEffect(() => {
    fetchInsights()
  }, [fetchInsights])

  const tabs = [
    { id: 'insights', label: t('analyst.tab_insights'), icon: Brain },
    { id: 'diagnostics', label: t('analyst.tab_diagnostics'), icon: Target },
    { id: 'failures', label: t('analyst.tab_failures'), icon: AlertTriangle },
    { id: 'dataset', label: t('analyst.tab_dataset'), icon: GitCompare },
    { id: 'models', label: t('analyst.tab_models'), icon: Zap },
  ]

  if (!experimentIds || experimentIds.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Brain size={48} className="text-slate-600 mb-4" />
        <h3 className="text-lg font-semibold text-slate-200">{t('analyst.ai_research_analyst')}</h3>
        <p className="text-sm text-slate-400 mt-2 max-w-md">
          {t('analyst.ai_analyst_empty')}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="border-b border-line-subtle px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeTab === tab.id
                    ? 'bg-purple-500/15 text-purple-300 ring-1 ring-purple-500/30 shadow-[0_0_0_1px_rgba(168,85,247,0.16)]'
                    : 'text-slate-400 hover:bg-nebula/50 hover:text-slate-200'
                }`}
              >
                <Icon size={13} />
                <span className="whitespace-nowrap">{tab.label}</span>
              </button>
            )
          })}
          <div className="flex-1" />
          <div className="rounded-full border border-line-default bg-nebula px-3 py-1 text-[11px] font-medium text-slate-400">
            {t('analyst.runs_selected', { n: experimentIds.length })}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs leading-relaxed text-slate-500">
            {t('analyst.cross_run_view')}
          </p>
        <button
          onClick={fetchInsights}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-slate-400 transition-all hover:bg-nebula/50 hover:text-slate-200"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          {t('analyst.refresh')}
        </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-purple-400" />
            <span className="ml-3 text-sm text-slate-400">{t('analyst.analyzing_experiments')}</span>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
            {error}
          </div>
        ) : data ? (
          <AnimatePresence mode="wait">
            {activeTab === 'insights' && <InsightsTab key="insights" data={data} t={t} lang={lang} />}
            {activeTab === 'diagnostics' && <DiagnosticsTab key="diagnostics" data={data} t={t} lang={lang} />}
            {activeTab === 'failures' && <FailuresTab key="failures" data={data} t={t} lang={lang} />}
            {activeTab === 'dataset' && <DatasetTab key="dataset" data={data} t={t} lang={lang} />}
            {activeTab === 'models' && <ModelsTab key="models" data={data} t={t} lang={lang} />}
          </AnimatePresence>
        ) : null}
      </div>
    </div>
  )
}


// ---------------------------------------------------------------------------
// Insights Tab
// ---------------------------------------------------------------------------

function InsightsTab({ data, t, lang }) {
  const insights = data?.insights?.insights || []
  const summary = data?.insights?.summary || ''
  const winner = data?.insights?.winner || null
  const leaderboard = data?.insights?.leaderboard || []
  const nextSteps = data?.insights?.next_steps || []
  const copy = getAnalystCopy(lang)

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {/* Narrative Summary */}
      <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-5">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-400 mb-3">
          <Sparkles size={14} /> {t('analyst.ai_analysis_summary')}
        </div>
        <p className="text-sm text-slate-200 leading-relaxed">
          {summary || t('analyst.no_summary_yet')}
        </p>
      </div>

      {winner ? (
        <div className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-300 mb-3">
              <CheckCircle2 size={14} /> {copy.winner}
            </div>
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: getRunColor(winner.model_type) }} />
              <div>
                <div className="text-sm font-semibold text-slate-100">{winner.label}</div>
                <div className="text-[11px] text-slate-400">{winner.model_type}</div>
              </div>
              <div className="ml-auto rounded-full bg-slate-950/60 px-3 py-1 text-[11px] font-semibold text-emerald-300">
                {copy.compositeScore}: {winner.composite_score}
              </div>
            </div>
            {winner.reason ? (
              <p className="mt-3 text-xs leading-relaxed text-slate-300">
                {copy.watchout}: {winner.reason}
              </p>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              {copy.leaderboard}
            </div>
            <div className="space-y-2">
              {leaderboard.slice(0, 3).map((item, index) => (
                <div key={`${item.experiment_id}-${item.rank}`} className="flex items-center gap-3 rounded-lg bg-slate-800/40 px-3 py-2">
                  <div className="text-xs font-bold text-slate-500">#{item.rank}</div>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getRunColor(item.model_type, index) }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-slate-200">{item.label}</div>
                    <div className="truncate text-[10px] text-slate-500">{item.reason}</div>
                  </div>
                  <div className="text-xs font-semibold text-slate-300">{item.composite_score}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {nextSteps.length ? (
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300 mb-3">
            <Lightbulb size={14} /> {copy.nextSteps}
          </div>
          <ul className="space-y-2">
            {nextSteps.map((step, index) => (
              <li key={index} className="flex items-start gap-2 text-xs leading-relaxed text-slate-200">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cyan-300" />
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Insight Cards */}
      <div className="grid gap-3">
        {insights.length ? (
          insights.map((insight, i) => (
            <InsightCard key={i} insight={insight} index={i} t={t} lang={lang} />
          ))
        ) : (
          <div className="rounded-xl border border-line-default bg-nebula p-4 text-sm text-slate-400">
            {t('analyst.no_insights_yet')}
          </div>
        )}
      </div>
    </motion.div>
  )
}

function InsightCard({ insight, index, t, lang }) {
  const [expanded, setExpanded] = useState(false)
  const copy = getAnalystCopy(lang)
  const Icon = insight.type === 'convergence' ? TrendingUp
    : insight.type === 'stability' ? Target
    : insight.type === 'overfitting' ? AlertTriangle
    : insight.type === 'performance' ? CheckCircle2
    : insight.type === 'dataset_fit' ? GitCompare
    : Lightbulb

  const sigColor = insight.significance === 'high' ? 'border-amber-500/30 bg-amber-500/5' : 'border-line-defaultNone bg-nebula'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className={`rounded-xl border p-4 ${sigColor} transition-all`}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${
          insight.significance === 'high' ? 'bg-amber-500/10 text-amber-400' : 'bg-nebula text-slate-400'
        }`}>
          <Icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-100">{insight.title}</h4>
            {insight.significance === 'high' && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-bold uppercase">
                {t('analyst.key_finding')}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">{insight.finding}</p>

          {insight.details && insight.details.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 mt-2 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
            >
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {expanded ? copy.hideDetails : copy.showDetails}
            </button>
          )}

          <AnimatePresence>
            {expanded && insight.details && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <ul className="mt-2 space-y-1">
                  {insight.details.map((d, i) => (
                    <li key={i} className="text-[11px] text-slate-400 flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-slate-500" />
                      {d}
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>

          {insight.recommendation && (
            <div className="mt-2 flex items-start gap-2 text-[11px] text-cyan-300 bg-cyan-500/5 rounded-lg px-3 py-2">
              <Lightbulb size={12} className="shrink-0 mt-0.5" />
              {insight.recommendation}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}


// ---------------------------------------------------------------------------
// Diagnostics Tab
// ---------------------------------------------------------------------------

function DiagnosticsTab({ data, t, lang }) {
  const modelDiags = data?.model_diagnostics || {}
  const modelNames = Object.keys(modelDiags)

  // Build radar chart data
  const radarData = useMemo(() => {
    const metrics = [
      'convergence_speed', 'stability_score', 'overfitting_risk',
      'over_smoothing_risk', 'boundary_accuracy', 'prediction_entropy',
    ]
    return metrics.map((metric) => {
      const row = { metric: formatMetricLabel(metric, lang) }
      modelNames.forEach((model, index) => {
        const diag = modelDiags[model]?.diagnostics?.[metric]
        if (diag) {
          if (metric === 'convergence_speed') {
            row[model] = diag.speed === 'fast' ? 0.9 : diag.speed === 'moderate' ? 0.6 : 0.3
          } else if (metric === 'stability_score') {
            row[model] = diag.score || 0
          } else if (metric === 'overfitting_risk') {
            row[model] = diag.risk === 'low' ? 0.9 : diag.risk === 'moderate' ? 0.5 : 0.2
          } else if (metric === 'over_smoothing_risk') {
            row[model] = diag.risk === 'none' ? 0.9 : diag.risk === 'low' ? 0.7 : diag.risk === 'moderate' ? 0.4 : 0.1
          } else if (metric === 'boundary_accuracy') {
            row[model] = diag.score || 0
          } else if (metric === 'prediction_entropy') {
            row[model] = 1 - (diag.normalized_entropy || 0)
          }
        }
      })
      return row
    })
  }, [modelDiags, modelNames])

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {/* Radar Comparison */}
      <div className="rounded-xl border border-line-default bg-nebula p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">{t('analyst.model_radar')}</h4>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData}>
              <PolarGrid stroke="var(--c-border)" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: '#94a3b8', fontSize: 9 }} />
              <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
      {modelNames.map((model, index) => (
                <Radar
                  key={model}
                  name={model}
                  dataKey={model}
                  stroke={getRunColor(modelDiags[model]?.model_type || model, index)}
                  fill={getRunColor(modelDiags[model]?.model_type || model, index)}
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              ))}
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              <Tooltip
                contentStyle={{ background: 'var(--c-bg-elev)', border: '1px solid var(--c-border)', color: 'var(--c-fg)', borderRadius: 8, fontSize: 10 }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-Model Diagnostic Cards */}
      <div className="grid gap-3 lg:grid-cols-2">
        {modelNames.map((model, index) => {
          const diag = modelDiags[model]?.diagnostics || {}
          return (
            <DiagnosticCard key={model} model={model} diagnostics={diag} color={getRunColor(modelDiags[model]?.model_type || model, index)} lang={lang} />
          )
        })}
      </div>
    </motion.div>
  )
}

function DiagnosticCard({ model, diagnostics, color, lang }) {
  const [expanded, setExpanded] = useState(false)
  const copy = getAnalystCopy(lang)

  const diagEntries = Object.entries(diagnostics).filter(([_, v]) => v && typeof v === 'object')
  const mainDiags = diagEntries.slice(0, 6)
  const extraDiags = diagEntries.slice(6)

  return (
    <div className="rounded-xl border border-line-default bg-nebula p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
        <h4 className="text-sm font-bold text-slate-100">{model}</h4>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {mainDiags.map(([key, value]) => (
          <DiagnosticMetric key={key} label={key} value={value} lang={lang} />
        ))}
      </div>

      {extraDiags.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 mt-3 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {expanded ? copy.less : copy.moreMetrics(extraDiags.length)}
          </button>
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {extraDiags.map(([key, value]) => (
                    <DiagnosticMetric key={key} label={key} value={value} lang={lang} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  )
}

function DiagnosticMetric({ label, value, lang }) {
  if (!value || typeof value !== 'object') return null

  const displayLabel = formatMetricLabel(label, lang)
  const labelColor = getColor(value.label)

  let displayValue = value.label || ''
  if (value.score !== undefined && value.score !== null) {
    displayValue = `${(value.score * 100).toFixed(0)}%`
    if (value.label) displayValue += ` · ${value.label.replace(/_/g, ' ')}`
  } else if (value.epoch !== undefined) {
    displayValue = `Epoch ${value.epoch}`
    if (value.speed) displayValue += ` · ${value.speed}`
  } else if (value.gap !== undefined) {
    displayValue = `${(value.gap * 100).toFixed(1)}% gap`
  } else if (value.collapse_ratio !== undefined) {
    displayValue = `${(value.collapse_ratio * 100).toFixed(0)}%`
  } else if (value.ratio !== undefined) {
    displayValue = `${value.ratio.toFixed(2)}x`
  } else if (value.ece !== undefined) {
    displayValue = `ECE ${value.ece.toFixed(3)}`
  } else if (value.entropy !== undefined) {
    displayValue = `H=${value.entropy.toFixed(2)}`
  }

  return (
    <div className="bg-nebula/50 rounded-lg px-2.5 py-1.5">
      <div className="text-[10px] text-slate-500 uppercase tracking-wider">{displayLabel}</div>
      <div className="text-[11px] font-semibold mt-0.5" style={{ color: labelColor }}>
        {displayValue}
      </div>
    </div>
  )
}


// ---------------------------------------------------------------------------
// Failures Tab
// ---------------------------------------------------------------------------

function FailuresTab({ data, t, lang }) {
  const copy = getAnalystCopy(lang)
  // Compute failure analysis per model from diagnostics
  const modelDiags = data?.model_diagnostics || {}
  const modelNames = Object.keys(modelDiags)

  const failureData = useMemo(() => {
    return modelNames.map((model) => {
      const diag = modelDiags[model]?.diagnostics || {}
      const issues = []

      if (diag.over_smoothing_risk?.risk === 'high' || diag.over_smoothing_risk?.risk === 'moderate') {
        issues.push({ type: 'over_smoothing', severity: diag.over_smoothing_risk.risk, label: 'Over-Smoothing' })
      }
      if (diag.overfitting_risk?.risk === 'high') {
        issues.push({ type: 'overfitting', severity: 'high', label: 'Overfitting' })
      }
      if (diag.boundary_accuracy?.label === 'weak') {
        issues.push({ type: 'boundary', severity: 'high', label: 'Weak Boundaries' })
      }
      if (diag.stability_score?.label === 'unstable') {
        issues.push({ type: 'stability', severity: 'moderate', label: 'Unstable' })
      }
      if (diag.embedding_separation?.label === 'overlapping') {
        issues.push({ type: 'embedding', severity: 'high', label: 'Embedding Overlap' })
      }
      if (diag.attention_focus_score?.label === 'diffuse') {
        issues.push({ type: 'attention', severity: 'moderate', label: 'Diffuse Attention' })
      }

      return { model, issues, diagnostics: diag }
    })
  }, [modelDiags, modelNames])

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {/* Failure Matrix */}
      <div className="rounded-xl border border-line-default bg-nebula p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">{copy.failurePatternMatrix}</h4>
        <FailureMatrix failureData={failureData} lang={lang} />
      </div>

      {/* Per-Model Failure Cards */}
        <div className="grid gap-3 lg:grid-cols-2">
          {failureData.map(({ model, issues, diagnostics }, index) => (
            <div key={model} className="rounded-xl border border-line-default bg-nebula p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: getRunColor(modelDiags[model]?.model_type || model, index) }} />
                <h4 className="text-sm font-bold text-slate-100">{model}</h4>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-nebula text-slate-400">
                  {copy.issueCount(issues.length)}
              </span>
            </div>

            {issues.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-400 py-2">
                <CheckCircle2 size={16} />
                {copy.noFailurePatterns}
              </div>
            ) : (
              <div className="space-y-2">
                {issues.map((issue, i) => (
                  <FailureIssue key={i} issue={issue} model={model} diagnostics={diagnostics} lang={lang} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  )
}

function FailureMatrix({ failureData, lang }) {
  const allIssueTypes = ['over_smoothing', 'overfitting', 'boundary', 'stability', 'embedding', 'attention']
  const issueLabels = {
    over_smoothing: lang === 'vi' ? 'Over-smoothing' : 'Over-Smoothing',
    overfitting: lang === 'vi' ? 'Quá khớp' : 'Overfitting',
    boundary: lang === 'vi' ? 'Vùng biên' : 'Boundary',
    stability: lang === 'vi' ? 'Ổn định' : 'Stability',
    embedding: 'Embedding',
    attention: 'Attention',
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="text-left py-2 px-2 text-slate-500 font-medium">{lang === 'vi' ? 'Mô hình' : 'Model'}</th>
            {allIssueTypes.map((type) => (
              <th key={type} className="text-center py-2 px-1 text-slate-500 font-medium text-[10px]">
                {issueLabels[type]}
              </th>
            ))}
          </tr>
        </thead>
          <tbody>
            {failureData.map(({ model, issues }, index) => (
              <tr key={model} className="border-t border-line-subtle">
                <td className="py-2 px-2 font-semibold text-slate-200">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getRunColor(modelDiags[model]?.model_type || model, index) }} />
                    {model}
                  </span>
                </td>
                {allIssueTypes.map((type) => {
                const issue = issues.find((i) => i.type === type)
                return (
                  <td key={type} className="text-center py-2 px-1">
                    {issue ? (
                      <span className={`inline-block w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center ${
                        issue.severity === 'high' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {issue.severity === 'high' ? '!' : '~'}
                      </span>
                    ) : (
                      <span className="inline-block w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold flex items-center justify-center">
                        ✓
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FailureIssue({ issue, model, diagnostics, lang }) {
  const descriptions = {
    over_smoothing: lang === 'vi'
      ? `${model} đang có embedding bị co cụm. Dirichlet energy chỉ còn ${(diagnostics.over_smoothing_risk?.collapse_ratio * 100).toFixed(0)}% so với ban đầu.`
      : `${model} embeddings are collapsing. Dirichlet energy at ${(diagnostics.over_smoothing_risk?.collapse_ratio * 100).toFixed(0)}% of initial.`,
    overfitting: lang === 'vi'
      ? `Khoảng cách train-val là ${(diagnostics.overfitting_risk?.gap * 100).toFixed(1)}% và đang nới rộng.`
      : `Train-val gap is ${(diagnostics.overfitting_risk?.gap * 100).toFixed(1)}% and widening.`,
    boundary: lang === 'vi'
      ? `Chỉ ${(diagnostics.boundary_accuracy?.score * 100).toFixed(0)}% nút vùng biên được phân loại đúng.`
      : `Only ${(diagnostics.boundary_accuracy?.score * 100).toFixed(0)}% of boundary nodes correctly classified.`,
    stability: lang === 'vi'
      ? `Độ dao động huấn luyện cao (CV=${diagnostics.stability_score?.cv?.toFixed(4) || 'N/A'}).`
      : `Training variance is high (CV=${diagnostics.stability_score?.cv?.toFixed(4) || 'N/A'}).`,
    embedding: lang === 'vi'
      ? `Tỉ lệ giữa lớp/chính lớp chỉ đạt ${diagnostics.embedding_separation?.ratio?.toFixed(2) || 'N/A'}x.`
      : `Inter/intra-class ratio is only ${diagnostics.embedding_separation?.ratio?.toFixed(2) || 'N/A'}x.`,
    attention: lang === 'vi'
      ? `Attention đang loãng - top 5% cạnh chỉ giữ ${(diagnostics.attention_focus_score?.top5_share * 100)?.toFixed(0) || 0}% tổng khối lượng.`
      : `Attention weights are diffuse - top-5% edges hold only ${(diagnostics.attention_focus_score?.top5_share * 100)?.toFixed(0) || 0}% of mass.`,
  }

  const recommendations = {
    over_smoothing: lang === 'vi' ? 'Thêm residual connection hoặc giảm số lớp.' : 'Add residual connections or reduce layers.',
    overfitting: lang === 'vi' ? 'Tăng dropout hoặc thêm weight decay.' : 'Increase dropout or add weight decay.',
    boundary: lang === 'vi' ? 'Thử GAT với attention học được cho các nút vùng biên.' : 'Try GAT with learned attention for boundary nodes.',
    stability: lang === 'vi' ? 'Giảm learning rate hoặc thêm gradient clipping.' : 'Reduce learning rate or add gradient clipping.',
    embedding: lang === 'vi' ? 'Thêm contrastive loss hoặc tăng hidden dimension.' : 'Add contrastive loss or increase hidden dimension.',
    attention: lang === 'vi' ? 'Giảm số attention heads hoặc tăng regularization.' : 'Reduce attention heads or add regularization.',
  }

  return (
    <div className={`rounded-lg border p-3 ${
      issue.severity === 'high' ? 'border-red-500/20 bg-red-500/5' : 'border-amber-500/20 bg-amber-500/5'
    }`}>
      <div className="flex items-center gap-2">
        <AlertTriangle size={13} className={issue.severity === 'high' ? 'text-red-400' : 'text-amber-400'} />
        <span className="text-xs font-semibold text-slate-100">{issue.label}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
          issue.severity === 'high' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'
        }`}>
          {issue.severity}
        </span>
      </div>
      <p className="text-[11px] text-slate-300 mt-1.5">{descriptions[issue.type]}</p>
      <p className="text-[11px] text-cyan-300 mt-1 flex items-center gap-1">
        <Lightbulb size={10} /> {recommendations[issue.type]}
      </p>
    </div>
  )
}


// ---------------------------------------------------------------------------
// Dataset Tab
// ---------------------------------------------------------------------------

function DatasetTab({ data, t, lang }) {
  const topo = data?.dataset_topology || {}
  const props = topo.properties || {}
  const recs = topo.recommendations || []
  const copy = getAnalystCopy(lang)

  const classDist = props.class_distribution || {}
  const classData = Object.entries(classDist).map(([cls, count]) => ({
    class: `C${cls}`,
    count,
  }))

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {/* Topology Overview */}
      <div className="rounded-xl border border-line-default bg-nebula p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">{t('analyst.dataset_topology')}</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <TopologyStat label={copy.nodes} value={props.n_nodes} />
          <TopologyStat label={copy.edges} value={props.n_edges} />
          <TopologyStat label={copy.classes} value={props.n_classes} />
          <TopologyStat label={copy.avgDegree} value={props.avg_degree?.toFixed(1)} />
          <TopologyStat label={copy.density} value={props.density?.toFixed(4)} />
          <TopologyStat label={copy.homophily} value={props.homophily_estimate?.toFixed(3)}
            color={props.homophily_estimate > 0.7 ? '#22c55e' : props.homophily_estimate < 0.4 ? '#ef4444' : '#f59e0b'} />
          <TopologyStat label={copy.classBalance} value={props.class_balance?.toFixed(3)}
            color={props.class_balance > 0.7 ? '#22c55e' : props.class_balance < 0.3 ? '#ef4444' : '#f59e0b'} />
          <TopologyStat label={copy.type} value={topo.type?.replace(/_/g, ' ') || (lang === 'vi' ? 'không rõ' : 'unknown')} />
        </div>
      </div>

      {/* Class Distribution */}
      {classData.length > 0 && (
        <div className="rounded-xl border border-line-default bg-nebula p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">{t('analyst.class_distribution')}</h4>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
                <XAxis dataKey="class" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: 'var(--c-bg-elev)', border: '1px solid var(--c-border)', color: 'var(--c-fg)', borderRadius: 8, fontSize: 10 }}
                />
                <Bar dataKey="count" name={copy.nodes} radius={[4, 4, 0, 0]}>
                  {classData.map((_, i) => (
                    <Cell key={i} fill={['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#06b6d4', '#ec4899'][i % 7]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recs.length > 0 && (
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-3 flex items-center gap-2">
            <Lightbulb size={14} /> {copy.datasetAwareRecommendations}
          </h4>
          <ul className="space-y-2">
            {recs.map((rec, i) => (
              <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  )
}

function TopologyStat({ label, value, color }) {
  return (
    <div className="bg-nebula/50 rounded-lg px-3 py-2">
      <div className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</div>
      <div className="text-sm font-bold mt-0.5" style={{ color: color || '#e2e8f0' }}>
        {value ?? 'N/A'}
      </div>
    </div>
  )
}


// ---------------------------------------------------------------------------
// Models Tab
// ---------------------------------------------------------------------------

function ModelsTab({ data, t, lang }) {
  const modelDiags = data?.model_diagnostics || {}
  const modelNames = Object.keys(modelDiags)
  const copy = getAnalystCopy(lang)

  const MODEL_PROFILES = {
    GCN: {
      personality: lang === 'vi' ? 'Nhanh và ổn định' : 'Fast & Stable',
      strengths: lang === 'vi' ? ['Hội tụ nhanh', 'Baseline sạch', 'Tổng hợp hiệu quả'] : ['Fast convergence', 'Clean baseline', 'Efficient aggregation'],
      weaknesses: lang === 'vi' ? ['Dễ over-smoothing khi sâu', 'Yếu ở vùng biên', 'Không có attention'] : ['Over-smoothing in deep nets', 'Weak on boundary nodes', 'No attention'],
      bestFor: lang === 'vi' ? ['Đồ thị homophily cao', 'Kiến trúc nông', 'Đồ thị lớn'] : ['Homophilic graphs', 'Shallow architectures', 'Large-scale graphs'],
    },
    GAT: {
      personality: lang === 'vi' ? 'Biểu đạt tốt nhưng kém ổn định' : 'Expressive but Unstable',
      strengths: lang === 'vi' ? ['Attention học được', 'Xử lý vùng biên tốt hơn', 'Đặc trưng đa đầu'] : ['Learned attention', 'Better boundaries', 'Multi-head features'],
      weaknesses: lang === 'vi' ? ['Dao động cao', 'Nguy cơ attention loãng', 'Tốn tính toán'] : ['Higher variance', 'Diffuse attention risk', 'Computationally expensive'],
      bestFor: lang === 'vi' ? ['Đồ thị heterophily', 'Bài toán nhạy theo cạnh', 'Giải thích bằng attention'] : ['Heterophilic graphs', 'Edge-distinctive tasks', 'Interpretable attention'],
    },
    SAGE: {
      personality: lang === 'vi' ? 'Cân bằng và dễ mở rộng' : 'Scalable & Balanced',
      strengths: lang === 'vi' ? ['Khả năng inductive', 'Lấy mẫu mở rộng tốt', 'Tổng hợp cân bằng'] : ['Inductive capability', 'Scalable sampling', 'Balanced aggregation'],
      weaknesses: lang === 'vi' ? ['Dao động do sampling', 'Dễ lỡ pattern hiếm', 'Đường cong mượt nhưng ít sắc'] : ['Sampling variance', 'Misses rare patterns', 'Smoother curves'],
      bestFor: lang === 'vi' ? ['Đồ thị lớn', 'Bối cảnh inductive', 'Dataset homophily trung bình'] : ['Large graphs', 'Inductive settings', 'Medium-homophily datasets'],
    },
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {modelNames.map((model) => {
        const profile = MODEL_PROFILES[model] || {}
        const diag = modelDiags[model]?.diagnostics || {}
        const color = { GCN: '#22c55e', GAT: '#f59e0b', SAGE: '#06b6d4' }[model] || '#a855f7'

        return (
          <div key={model} className="rounded-xl border border-line-default bg-nebula p-4">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-4 h-4 rounded-full" style={{ backgroundColor: color }} />
              <div>
                <h4 className="text-sm font-bold text-slate-100">{model}</h4>
                <span className="text-[11px] text-slate-400">{profile.personality}</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <h5 className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-2">{copy.strengths}</h5>
                <ul className="space-y-1">
                  {(profile.strengths || []).map((s, i) => (
                    <li key={i} className="text-[11px] text-slate-300 flex items-center gap-1.5">
                      <CheckCircle2 size={10} className="text-emerald-400" /> {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h5 className="text-[10px] font-bold uppercase tracking-wider text-red-400 mb-2">{copy.weaknesses}</h5>
                <ul className="space-y-1">
                  {(profile.weaknesses || []).map((w, i) => (
                    <li key={i} className="text-[11px] text-slate-300 flex items-center gap-1.5">
                      <AlertTriangle size={10} className="text-red-400" /> {w}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h5 className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-2">{copy.bestFor}</h5>
                <ul className="space-y-1">
                  {(profile.bestFor || []).map((b, i) => (
                    <li key={i} className="text-[11px] text-slate-300 flex items-center gap-1.5">
                      <Target size={10} className="text-cyan-400" /> {b}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Behavior description */}
            <div className="mt-3 text-[11px] text-slate-400 leading-relaxed bg-nebula/30 rounded-lg p-3">
              {model === 'GCN' && (lang === 'vi'
                ? 'GCN chuẩn hoá đối xứng và gom hàng xóm theo trọng số đều nhau. Nó mạnh khi hàng xóm cùng nhãn, nhưng cũng dễ bị nhiễu nếu cạnh mang tín hiệu lệch hoặc heterophily.'
                : 'GCN applies symmetric normalization across all neighbors equally. It excels when neighbors share labels (homophily) but treats all edges equally, making it vulnerable to noisy or heterophilic connections.')}
              {model === 'GAT' && (lang === 'vi'
                ? 'GAT học trọng số hàng xóm bằng attention. Khi attention hội tụ đúng, nó vượt GCN ở các ca khó; nhưng trên đồ thị nhỏ hoặc nhiễu, attention cũng có thể không tạo được pattern thật sự có nghĩa.'
                : 'GAT learns to weight neighbor importance via attention. When attention focuses correctly, it outperforms GCN on hard cases. However, attention can fail to converge to meaningful patterns, especially on small or noisy graphs.')}
              {model === 'SAGE' && (lang === 'vi'
                ? 'GraphSAGE lấy mẫu và tổng hợp đặc trưng hàng xóm nên phù hợp với đồ thị lớn. Sampling tạo thêm dao động nhưng cũng đóng vai trò regularization, giúp nó cân bằng giữa sự đơn giản của GCN và độ biểu đạt của GAT.'
                : 'GraphSAGE samples and aggregates neighbor features, enabling training on large graphs. Its sampling introduces variance but also acts as regularization. It provides a balanced trade-off between GCN simplicity and GAT expressiveness.')}
            </div>
          </div>
        )
      })}
    </motion.div>
  )
}
