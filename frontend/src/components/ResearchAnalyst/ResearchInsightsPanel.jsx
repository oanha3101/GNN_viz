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

function getColor(label) {
  return DIAGNOSTIC_COLORS[label] || '#94a3b8'
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export default function ResearchInsightsPanel({ experimentIds, onClose }) {
  const getAuthHeaders = useAuthStore((s) => s.getAuthHeaders)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [activeTab, setActiveTab] = useState('insights')

  const fetchInsights = useCallback(async () => {
    if (!experimentIds || experimentIds.length < 2) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(apiUrl('/experiments/compare-insights'), {
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
  }, [experimentIds, getAuthHeaders])

  useEffect(() => {
    fetchInsights()
  }, [fetchInsights])

  const tabs = [
    { id: 'insights', label: 'AI Insights', icon: Brain },
    { id: 'diagnostics', label: 'Diagnostics', icon: Target },
    { id: 'failures', label: 'Failure Patterns', icon: AlertTriangle },
    { id: 'dataset', label: 'Dataset Analysis', icon: GitCompare },
    { id: 'models', label: 'Model Profiles', icon: Zap },
  ]

  if (!experimentIds || experimentIds.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Brain size={48} className="text-slate-600 mb-4" />
        <h3 className="text-lg font-semibold text-slate-200">AI Research Analyst</h3>
        <p className="text-sm text-slate-400 mt-2 max-w-md">
          Select 2-4 experiments to compare, then the AI will analyze convergence, stability,
          failure patterns, and dataset compatibility.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="border-b border-slate-800/60 px-4 py-3">
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
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                }`}
              >
                <Icon size={13} />
                <span className="whitespace-nowrap">{tab.label}</span>
              </button>
            )
          })}
          <div className="flex-1" />
          <div className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-[11px] font-medium text-slate-400">
            {experimentIds.length} run{experimentIds.length > 1 ? 's' : ''} selected
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs leading-relaxed text-slate-500">
            Cross-run analyst view for convergence, failure patterns, and dataset fit.
          </p>
        <button
          onClick={fetchInsights}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-slate-400 transition-all hover:bg-slate-800/50 hover:text-slate-200"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-purple-400" />
            <span className="ml-3 text-sm text-slate-400">Analyzing experiments...</span>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
            {error}
          </div>
        ) : data ? (
          <AnimatePresence mode="wait">
            {activeTab === 'insights' && <InsightsTab key="insights" data={data} />}
            {activeTab === 'diagnostics' && <DiagnosticsTab key="diagnostics" data={data} />}
            {activeTab === 'failures' && <FailuresTab key="failures" data={data} />}
            {activeTab === 'dataset' && <DatasetTab key="dataset" data={data} />}
            {activeTab === 'models' && <ModelsTab key="models" data={data} />}
          </AnimatePresence>
        ) : null}
      </div>
    </div>
  )
}


// ---------------------------------------------------------------------------
// Insights Tab
// ---------------------------------------------------------------------------

function InsightsTab({ data }) {
  const insights = data?.insights?.insights || []
  const summary = data?.insights?.summary || ''

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {/* Narrative Summary */}
      <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-5">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-400 mb-3">
          <Sparkles size={14} /> AI Analysis Summary
        </div>
        <p className="text-sm text-slate-200 leading-relaxed">
          {summary || 'The analyst is ready, but this comparison does not yet have enough signal for a strong narrative summary.'}
        </p>
      </div>

      {/* Insight Cards */}
      <div className="grid gap-3">
        {insights.length ? (
          insights.map((insight, i) => (
            <InsightCard key={i} insight={insight} index={i} />
          ))
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400">
            No comparison insights were generated for this set of runs yet.
          </div>
        )}
      </div>
    </motion.div>
  )
}

function InsightCard({ insight, index }) {
  const [expanded, setExpanded] = useState(false)
  const Icon = insight.type === 'convergence' ? TrendingUp
    : insight.type === 'stability' ? Target
    : insight.type === 'overfitting' ? AlertTriangle
    : insight.type === 'performance' ? CheckCircle2
    : insight.type === 'dataset_fit' ? GitCompare
    : Lightbulb

  const sigColor = insight.significance === 'high' ? 'border-amber-500/30 bg-amber-500/5' : 'border-slate-700 bg-slate-900/40'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className={`rounded-xl border p-4 ${sigColor} transition-all`}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${
          insight.significance === 'high' ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-800 text-slate-400'
        }`}>
          <Icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-100">{insight.title}</h4>
            {insight.significance === 'high' && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-bold uppercase">
                Key Finding
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
              {expanded ? 'Hide details' : 'Show details'}
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

function DiagnosticsTab({ data }) {
  const modelDiags = data?.model_diagnostics || {}
  const modelNames = Object.keys(modelDiags)

  // Build radar chart data
  const radarData = useMemo(() => {
    const metrics = [
      'convergence_speed', 'stability_score', 'overfitting_risk',
      'over_smoothing_risk', 'boundary_accuracy', 'prediction_entropy',
    ]
    return metrics.map((metric) => {
      const row = { metric: metric.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }
      modelNames.forEach((model) => {
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

  const MODEL_COLORS = { GCN: '#22c55e', GAT: '#f59e0b', SAGE: '#06b6d4' }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {/* Radar Comparison */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Model Comparison Radar</h4>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData}>
              <PolarGrid stroke="var(--c-border)" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: '#94a3b8', fontSize: 9 }} />
              <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
              {modelNames.map((model) => (
                <Radar
                  key={model}
                  name={model}
                  dataKey={model}
                  stroke={MODEL_COLORS[model] || '#a855f7'}
                  fill={MODEL_COLORS[model] || '#a855f7'}
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
        {modelNames.map((model) => {
          const diag = modelDiags[model]?.diagnostics || {}
          return (
            <DiagnosticCard key={model} model={model} diagnostics={diag} color={MODEL_COLORS[model]} />
          )
        })}
      </div>
    </motion.div>
  )
}

function DiagnosticCard({ model, diagnostics, color }) {
  const [expanded, setExpanded] = useState(false)

  const diagEntries = Object.entries(diagnostics).filter(([_, v]) => v && typeof v === 'object')
  const mainDiags = diagEntries.slice(0, 6)
  const extraDiags = diagEntries.slice(6)

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
        <h4 className="text-sm font-bold text-slate-100">{model}</h4>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {mainDiags.map(([key, value]) => (
          <DiagnosticMetric key={key} label={key} value={value} />
        ))}
      </div>

      {extraDiags.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 mt-3 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {expanded ? 'Less' : `+${extraDiags.length} more metrics`}
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
                    <DiagnosticMetric key={key} label={key} value={value} />
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

function DiagnosticMetric({ label, value }) {
  if (!value || typeof value !== 'object') return null

  const displayLabel = label.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
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
    <div className="bg-slate-800/50 rounded-lg px-2.5 py-1.5">
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

function FailuresTab({ data }) {
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

  const MODEL_COLORS = { GCN: '#22c55e', GAT: '#f59e0b', SAGE: '#06b6d4' }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {/* Failure Matrix */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Failure Pattern Matrix</h4>
        <FailureMatrix failureData={failureData} />
      </div>

      {/* Per-Model Failure Cards */}
      <div className="grid gap-3 lg:grid-cols-2">
        {failureData.map(({ model, issues, diagnostics }) => (
          <div key={model} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: MODEL_COLORS[model] }} />
              <h4 className="text-sm font-bold text-slate-100">{model}</h4>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                {issues.length} issue{issues.length !== 1 ? 's' : ''}
              </span>
            </div>

            {issues.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-400 py-2">
                <CheckCircle2 size={16} />
                No significant failure patterns detected
              </div>
            ) : (
              <div className="space-y-2">
                {issues.map((issue, i) => (
                  <FailureIssue key={i} issue={issue} model={model} diagnostics={diagnostics} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  )
}

function FailureMatrix({ failureData }) {
  const allIssueTypes = ['over_smoothing', 'overfitting', 'boundary', 'stability', 'embedding', 'attention']
  const issueLabels = {
    over_smoothing: 'Over-Smoothing',
    overfitting: 'Overfitting',
    boundary: 'Boundary',
    stability: 'Stability',
    embedding: 'Embedding',
    attention: 'Attention',
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="text-left py-2 px-2 text-slate-500 font-medium">Model</th>
            {allIssueTypes.map((type) => (
              <th key={type} className="text-center py-2 px-1 text-slate-500 font-medium text-[10px]">
                {issueLabels[type]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {failureData.map(({ model, issues }) => (
            <tr key={model} className="border-t border-slate-800/50">
              <td className="py-2 px-2 font-semibold text-slate-200">{model}</td>
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

function FailureIssue({ issue, model, diagnostics }) {
  const descriptions = {
    over_smoothing: `${model} embeddings are collapsing. Dirichlet energy at ${(diagnostics.over_smoothing_risk?.collapse_ratio * 100).toFixed(0)}% of initial.`,
    overfitting: `Train-val gap is ${(diagnostics.overfitting_risk?.gap * 100).toFixed(1)}% and widening.`,
    boundary: `Only ${(diagnostics.boundary_accuracy?.score * 100).toFixed(0)}% of boundary nodes correctly classified.`,
    stability: `Training variance is high (CV=${diagnostics.stability_score?.cv?.toFixed(4) || 'N/A'}).`,
    embedding: `Inter/intra-class ratio is only ${diagnostics.embedding_separation?.ratio?.toFixed(2) || 'N/A'}x.`,
    attention: `Attention weights are diffuse — top-5% edges hold only ${(diagnostics.attention_focus_score?.top5_share * 100)?.toFixed(0) || 0}% of mass.`,
  }

  const recommendations = {
    over_smoothing: 'Add residual connections or reduce layers.',
    overfitting: 'Increase dropout or add weight decay.',
    boundary: 'Try GAT with learned attention for boundary nodes.',
    stability: 'Reduce learning rate or add gradient clipping.',
    embedding: 'Add contrastive loss or increase hidden dimension.',
    attention: 'Reduce attention heads or add regularization.',
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

function DatasetTab({ data }) {
  const topo = data?.dataset_topology || {}
  const props = topo.properties || {}
  const recs = topo.recommendations || []

  const classDist = props.class_distribution || {}
  const classData = Object.entries(classDist).map(([cls, count]) => ({
    class: `C${cls}`,
    count,
  }))

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {/* Topology Overview */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Dataset Topology</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <TopologyStat label="Nodes" value={props.n_nodes} />
          <TopologyStat label="Edges" value={props.n_edges} />
          <TopologyStat label="Classes" value={props.n_classes} />
          <TopologyStat label="Avg Degree" value={props.avg_degree?.toFixed(1)} />
          <TopologyStat label="Density" value={props.density?.toFixed(4)} />
          <TopologyStat label="Homophily" value={props.homophily_estimate?.toFixed(3)}
            color={props.homophily_estimate > 0.7 ? '#22c55e' : props.homophily_estimate < 0.4 ? '#ef4444' : '#f59e0b'} />
          <TopologyStat label="Class Balance" value={props.class_balance?.toFixed(3)}
            color={props.class_balance > 0.7 ? '#22c55e' : props.class_balance < 0.3 ? '#ef4444' : '#f59e0b'} />
          <TopologyStat label="Type" value={topo.type?.replace(/_/g, ' ') || 'unknown'} />
        </div>
      </div>

      {/* Class Distribution */}
      {classData.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Class Distribution</h4>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
                <XAxis dataKey="class" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: 'var(--c-bg-elev)', border: '1px solid var(--c-border)', color: 'var(--c-fg)', borderRadius: 8, fontSize: 10 }}
                />
                <Bar dataKey="count" name="Nodes" radius={[4, 4, 0, 0]}>
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
            <Lightbulb size={14} /> Dataset-Aware Recommendations
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
    <div className="bg-slate-800/50 rounded-lg px-3 py-2">
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

function ModelsTab({ data }) {
  const modelDiags = data?.model_diagnostics || {}
  const modelNames = Object.keys(modelDiags)

  const MODEL_PROFILES = {
    GCN: {
      personality: 'Fast & Stable',
      strengths: ['Fast convergence', 'Clean baseline', 'Efficient aggregation'],
      weaknesses: ['Over-smoothing in deep nets', 'Weak on boundary nodes', 'No attention'],
      bestFor: ['Homophilic graphs', 'Shallow architectures', 'Large-scale graphs'],
    },
    GAT: {
      personality: 'Expressive but Unstable',
      strengths: ['Learned attention', 'Better boundaries', 'Multi-head features'],
      weaknesses: ['Higher variance', 'Diffuse attention risk', 'Computationally expensive'],
      bestFor: ['Heterophilic graphs', 'Edge-distinctive tasks', 'Interpretable attention'],
    },
    SAGE: {
      personality: 'Scalable & Balanced',
      strengths: ['Inductive capability', 'Scalable sampling', 'Balanced aggregation'],
      weaknesses: ['Sampling variance', 'Misses rare patterns', 'Smoother curves'],
      bestFor: ['Large graphs', 'Inductive settings', 'Medium-homophily datasets'],
    },
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {modelNames.map((model) => {
        const profile = MODEL_PROFILES[model] || {}
        const diag = modelDiags[model]?.diagnostics || {}
        const color = { GCN: '#22c55e', GAT: '#f59e0b', SAGE: '#06b6d4' }[model] || '#a855f7'

        return (
          <div key={model} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-4 h-4 rounded-full" style={{ backgroundColor: color }} />
              <div>
                <h4 className="text-sm font-bold text-slate-100">{model}</h4>
                <span className="text-[11px] text-slate-400">{profile.personality}</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <h5 className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-2">Strengths</h5>
                <ul className="space-y-1">
                  {(profile.strengths || []).map((s, i) => (
                    <li key={i} className="text-[11px] text-slate-300 flex items-center gap-1.5">
                      <CheckCircle2 size={10} className="text-emerald-400" /> {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h5 className="text-[10px] font-bold uppercase tracking-wider text-red-400 mb-2">Weaknesses</h5>
                <ul className="space-y-1">
                  {(profile.weaknesses || []).map((w, i) => (
                    <li key={i} className="text-[11px] text-slate-300 flex items-center gap-1.5">
                      <AlertTriangle size={10} className="text-red-400" /> {w}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h5 className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-2">Best For</h5>
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
            <div className="mt-3 text-[11px] text-slate-400 leading-relaxed bg-slate-800/30 rounded-lg p-3">
              {model === 'GCN' && 'GCN applies symmetric normalization across all neighbors equally. It excels when neighbors share labels (homophily) but treats all edges equally, making it vulnerable to noisy or heterophilic connections.'}
              {model === 'GAT' && 'GAT learns to weight neighbor importance via attention. When attention focuses correctly, it outperforms GCN on hard cases. However, attention can fail to converge to meaningful patterns, especially on small or noisy graphs.'}
              {model === 'SAGE' && 'GraphSAGE samples and aggregates neighbor features, enabling training on large graphs. Its sampling introduces variance but also acts as regularization. It provides a balanced trade-off between GCN simplicity and GAT expressiveness.'}
            </div>
          </div>
        )
      })}
    </motion.div>
  )
}
