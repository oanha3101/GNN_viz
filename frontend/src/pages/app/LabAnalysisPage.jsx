import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Download, Globe2, Network, Printer, ScanSearch } from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import usePlayerStore from '../../store/playerStore'
import useGNNStore from '../../store/useGNNStore'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  EmbeddingRouter,
  InfoRouter,
  MetricsRouter,
  TASK_LABELS,
  TopologyRouter,
  preloadLabAnalysisViews,
} from '../../components/Lab/LabViewRegistry'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import {
  assessTask2Reliability,
  buildTask2BestEpochSuggestion,
  buildTask2FocusStory,
  buildTask2GraphDescriptors,
  buildTask2NarrativeSummary,
  buildTask2ResearchSignals,
  summarizeGraphCollection,
} from '../../utils/task2Metrics'
import { translateTask2ReportText as translateTask2ReportTextShared } from '../../utils/task2ReportI18n'
import { getTask3Copy } from '../../utils/task3I18n'
import { getTask4Copy } from '../../utils/task4I18n'

function PanelLoader({ label }) {
  return (
    <div className="flex h-full min-h-[360px] items-center justify-center text-[11px] font-bold uppercase tracking-[0.18em] text-twilight">
      {label}
    </div>
  )
}

function buildGraphClassNames(graphs = [], taskClassNames = []) {
  if (Array.isArray(taskClassNames) && taskClassNames.length) {
    return taskClassNames
  }
  const seen = new Set()
  for (const graph of graphs) {
    if (Number.isInteger(graph?.groundTruth)) {
      seen.add(graph.groundTruth)
    }
  }
  const inferred = [...seen].sort((a, b) => a - b)
  return inferred.length ? inferred.map((classId) => `Class ${classId}`) : ['Class 0']
}

function toPercent(value, digits = 1) {
  if (!Number.isFinite(value)) return 'N/A'
  return `${(value * 100).toFixed(digits)}%`
}

function toSigned(value, digits = 2) {
  if (!Number.isFinite(value)) return 'N/A'
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`
}

function formatCellLabel(cell, classNames = []) {
  if (!cell) return 'Entire collection'
  const pred = classNames?.[cell.pred] || `Class ${cell.pred}`
  const gt = classNames?.[cell.gt] || `Class ${cell.gt}`
  return `Pred ${pred} vs GT ${gt}`
}

function resolveGraphEndpoint(value) {
  return typeof value === 'object' && value !== null ? value.id : value
}

function formatTask1ClassName(classNames = [], classId) {
  if (!Number.isFinite(classId)) return 'Unknown'
  return classNames?.[classId] || `C${classId}`
}

function translateTask2ReportText(text, lang) {
  if (!text || lang !== 'vi') return text
  const sharedTranslation = translateTask2ReportTextShared(text, lang)
  if (sharedTranslation !== text) return sharedTranslation

  const exact = {
    'Class collapse': 'Sụp đổ lớp',
    Calibration: 'Hiệu chuẩn',
    'Shortcut bias': 'Thiên lệch shortcut',
    'No weak-class signal yet': 'Chưa có tín hiệu lớp yếu',
    'The slice is mostly stable, but boundary examples still deserve attention.': 'Lát cắt này nhìn chung khá ổn định, nhưng các ca vùng biên vẫn cần được chú ý.',
    'Structural outliers are the strongest signal in this slice.': 'Structural outliers là tín hiệu mạnh nhất trong lát cắt này.',
    'Most graphs are stable wins, so the remaining errors are likely boundary cases.': 'Phần lớn đồ thị là các ca đúng ổn định, nên lỗi còn lại nhiều khả năng là boundary cases.',
    'Confidence and Macro F1 should be read together before trusting the benchmark story.': 'Cần đọc confidence cùng với Macro F1 trước khi tin vào câu chuyện benchmark.',
    'Overconfident misses suggest the classifier is trusting the wrong motif shape.': 'Các ca sai nhưng quá tự tin cho thấy bộ phân loại đang tin vào motif shape không đúng.',
    'Thin margins mean the decision boundary is still fragile.': 'Margin mỏng cho thấy ranh giới quyết định vẫn còn mong manh.',
    'Use the Failure tab to isolate the hardest graphs.': 'Hãy mở tab Failures để tách ra các đồ thị khó nhất.',
    'Use the Structure tab to inspect structural outliers.': 'Hãy mở tab Structure để soi các structural outliers.',
    'Use the Readout tab to inspect overconfident misses.': 'Hãy mở tab Readout để kiểm tra các ca sai nhưng quá tự tin.',
    'Use the Failures tab to inspect boundary cases.': 'Hãy mở tab Failures để kiểm tra các boundary cases.',
    'Predictions are spread across classes without an obvious collapse pattern.': 'Dự đoán đang được phân bố qua nhiều lớp, chưa thấy dấu hiệu sụp đổ rõ rệt vào một lớp duy nhất.',
    'Per-class recall and prediction share are staying within a usable range.': 'Recall theo lớp và tỉ lệ phân bố dự đoán vẫn đang nằm trong vùng có thể sử dụng để đọc nghiên cứu.',
    'Use Failures to inspect the remaining boundary graphs.': 'Hãy dùng tab Failures để soi các đồ thị vùng biên còn lại.',
    'Confidence is tracking correctness closely enough for visual interpretation.': 'Độ tin cậy hiện vẫn bám tương đối sát độ đúng, đủ dùng cho việc diễn giải trực quan.',
    'Use Readout to validate the most confident mistakes before exporting conclusions.': 'Hãy dùng tab Readout để kiểm tra các lỗi tự tin nhất trước khi chốt kết luận.',
    'High-confidence predictions are not lining up cleanly with correctness on this slice.': 'Các dự đoán có độ tự tin cao không còn khớp sạch với độ đúng trong lát cắt này.',
    'Treat confidence as a ranking cue, not proof. Inspect the Failure and Readout tabs together.': 'Hãy xem confidence như tín hiệu xếp hạng, không phải bằng chứng. Nên đọc đồng thời Failures và Readout.',
    'Confidence is usable, but it still runs ahead of true reliability.': 'Confidence có thể dùng được, nhưng vẫn đang đi trước độ tin cậy thực sự.',
    'Compare confidence with margins and hard-case slices before trusting graph-level certainty.': 'Hãy đối chiếu confidence với margin và các hard-case slice trước khi tin vào độ chắc chắn ở mức đồ thị.',
    'No strong structural shortcut is dominating confidence on this slice.': 'Chưa thấy structural shortcut mạnh nào chi phối confidence trong lát cắt này.',
    'Use Structure for motif reading, not just for shortcut checking.': 'Hãy dùng tab Structure để đọc motif, không chỉ để kiểm tra shortcut.',
    'Confidence is strongly correlated with density, so the model may be using a structural shortcut.': 'Confidence đang tương quan mạnh với mật độ, nên mô hình có thể đang dùng structural shortcut.',
    'Confidence is strongly correlated with graph size, so the model may be using a structural shortcut.': 'Confidence đang tương quan mạnh với kích thước đồ thị, nên mô hình có thể đang dùng structural shortcut.',
    'Use Structure to inspect whether hard cases cluster by topology before trusting motif-level language.': 'Hãy dùng tab Structure để kiểm tra xem hard cases có đang tụ theo topology hay không trước khi kết luận ở mức motif.',
    'There is a mild structural shortcut signal in the confidence pattern.': 'Đang có tín hiệu shortcut cấu trúc nhẹ trong pattern của confidence.',
    'Cross-check topology slices with misclassified graphs to confirm the model is reading motifs, not just size cues.': 'Hãy đối chiếu topology slices với các đồ thị bị phân loại sai để xác nhận mô hình đang đọc motif, không chỉ bám theo tín hiệu kích thước.',
    'Treat this collection more like a motif probe than a benchmark. Use confusion, margins, and structural slices together.': 'Hãy xem collection này như một phép dò motif hơn là benchmark thuần. Nên đọc confusion, margin và structural slices cùng nhau.',
    'Use accuracy for trend, but confirm with Macro F1, hard cases, and readout concentration before concluding the model is robust.': 'Hãy dùng accuracy để xem xu hướng, nhưng cần xác nhận thêm bằng Macro F1, hard cases và mức độ tập trung readout trước khi kết luận mô hình thật sự robust.',
  }

  if (exact[text]) return exact[text]

  const overconfidentMatch = text.match(/^The model is making (\d+) overconfident mistake(s)? on this slice\.$/)
  if (overconfidentMatch) {
    return `Mô hình đang tạo ra ${overconfidentMatch[1]} lỗi quá tự tin trong lát cắt này.`
  }

  const diffuseMatch = text.match(/^Diffuse readout dominates (\d+) graph(s)? in this slice\.$/)
  if (diffuseMatch) {
    return `Readout loãng đang chiếm ưu thế trên ${diffuseMatch[1]} đồ thị trong lát cắt này.`
  }

  const weakClassMatch = text.match(/^(.+?) is still the weak class with recall at ([\d.]+)%\.$/)
  if (weakClassMatch) {
    return `${weakClassMatch[1]} vẫn là lớp yếu với recall ở mức ${weakClassMatch[2]}%.`
  }

  const collapseTowardMatch = text.match(/^Predictions are collapsing toward (.+?) while (.+?) recall is only ([\d.]+)%\.$/)
  if (collapseTowardMatch) {
    return `Dự đoán đang sụp dồn về ${collapseTowardMatch[1]}, trong khi recall của ${collapseTowardMatch[2]} chỉ còn ${collapseTowardMatch[3]}%.`
  }

  const absorbedMatch = text.match(/^(\d+) graph(s)? from the weak class are being absorbed into the dominant prediction stream\.$/)
  if (absorbedMatch) {
    return `${absorbedMatch[1]} đồ thị của lớp yếu đang bị hút vào luồng dự đoán chiếm ưu thế.`
  }

  const predShareMatch = text.match(/^Prediction share is leaning (?:toward )?(.+?) \(([\d.]+)%\), and balanced accuracy is ([\d.]+)%\.$/)
  if (predShareMatch) {
    return `Tỉ lệ dự đoán đang nghiêng về ${predShareMatch[1]} (${predShareMatch[2]}%), và balanced accuracy là ${predShareMatch[3]}%.`
  }

  const eceWrongMatch = text.match(/^ECE is ([\d.]+)% and wrong graphs are averaging ([\d.]+)% confidence\.$/)
  if (eceWrongMatch) {
    return `ECE là ${eceWrongMatch[1]}% và các đồ thị sai đang có confidence trung bình ${eceWrongMatch[2]}%.`
  }

  const overconfidentSignalMatch = text.match(/^(\d+) overconfident miss(?:es)? detected(?: and ECE is ([\d.]+)%)?\.$/)
  if (overconfidentSignalMatch) {
    return `${overconfidentSignalMatch[1]} ca sai quá tự tin đã được phát hiện${overconfidentSignalMatch[2] ? ` và ECE là ${overconfidentSignalMatch[2]}%` : ''}.`
  }

  const confVsMatch = text.match(/^Conf vs density ([+\-]?\d+\.\d+), size ([+\-]?\d+\.\d+), edges ([+\-]?\d+\.\d+), shortcut risk ([+\-]?\d+\.\d+)\.$/)
  if (confVsMatch) {
    return `Conf theo mật độ ${confVsMatch[1]}, theo kích thước ${confVsMatch[2]}, theo số cạnh ${confVsMatch[3]}, mức rủi ro shortcut ${confVsMatch[4]}.`
  }

  const shortcutStrongMatch = text.match(/^Shortcut risk is ([\d.]+); the strongest visible correlation is ([+\-]?\d+\.\d+) and should be treated as a bias signal, not a motif explanation\.$/)
  if (shortcutStrongMatch) {
    return `Shortcut risk là ${shortcutStrongMatch[1]}; tương quan mạnh nhất hiện thấy là ${shortcutStrongMatch[2]} và nên được đọc như tín hiệu bias, không phải giải thích motif.`
  }

  const bestReadMatch = text.match(/^Best read: epoch (\d+) by Macro F1(?: and Balanced Acc)?\.$/)
  if (bestReadMatch) {
    return `Mốc đọc tốt nhất: epoch ${bestReadMatch[1]} theo Macro F1${text.includes('Balanced Acc') ? ' và Balanced Acc' : ''}.`
  }

  const rationaleSplitMatch = text.match(/^Macro F1 peaks at epoch (\d+), while Balanced Acc peaks at epoch (\d+)\. Use the Macro F1 peak for headline reading, then compare the Balanced Acc peak if weak-class recall is the priority\.$/)
  if (rationaleSplitMatch) {
    return `Macro F1 đạt đỉnh ở epoch ${rationaleSplitMatch[1]}, trong khi Balanced Acc đạt đỉnh ở epoch ${rationaleSplitMatch[2]}. Hãy dùng đỉnh Macro F1 cho phần headline chính, rồi so sánh thêm đỉnh Balanced Acc nếu ưu tiên của bạn là weak-class recall.`
  }

  const rationaleDefaultMatch = text.match(/^Use this epoch when you care more about class balance and weak-class recall than raw accuracy\.$/)
  if (rationaleDefaultMatch) {
    return 'Hãy dùng epoch này khi bạn quan tâm nhiều hơn tới cân bằng lớp và weak-class recall thay vì chỉ nhìn raw accuracy.'
  }

  return text
}

function translateTask2Signal(signal, lang) {
  if (!signal || lang !== 'vi') return signal
  return {
    ...signal,
    title: translateTask2ReportText(signal.title, lang),
    summary: translateTask2ReportText(signal.summary, lang),
    evidence: translateTask2ReportText(signal.evidence, lang),
    recommendation: translateTask2ReportText(signal.recommendation, lang),
  }
}

function translateTask2EpochSuggestion(suggestion, lang) {
  if (!suggestion || lang !== 'vi') return suggestion
  return {
    ...suggestion,
    recommendation: translateTask2ReportText(suggestion.recommendation, lang),
    rationale: translateTask2ReportText(suggestion.rationale, lang),
  }
}

function Task1NodeExplanationReport() {
  const { lang } = useLanguage()
  const graphData = useGNNStore((state) => state.graphData)
  const groundTruth = useGNNStore((state) => state.groundTruth)
  const selectedNodeId = useGNNStore((state) => state.selectedNodeId)
  const selectedModel = useGNNStore((state) => state.selectedModel)
  const classNames = useGNNStore((state) => state.classNames)
  const { snapshots, currentEpochFloat } = usePlayerStore()

  const epochInt = snapshots?.length
    ? Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat || 0)))
    : 0
  const snapshot = snapshots?.[epochInt] || null
  const nodes = graphData?.nodes || []
  const links = graphData?.links || []
  const fallbackMistake = Array.isArray(snapshot?.node_correctness)
    ? snapshot.node_correctness.findIndex((value) => value === 0)
    : -1
  const fallbackNode = nodes[0]?.id
  const nodeId = Number.isFinite(selectedNodeId)
    ? selectedNodeId
    : fallbackMistake >= 0
      ? fallbackMistake
      : fallbackNode

  if (!snapshot || !nodes.length || !groundTruth || !Number.isFinite(nodeId)) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm leading-6 text-slate-600">
        {lang === 'vi'
          ? 'Chưa có giải thích cấp nút cho report này. Hãy chọn một nút trên canvas cấu trúc hoặc chạy Task 1 với dự đoán nút, độ tin cậy và chẩn đoán lân cận.'
          : 'No node-level explanation is available yet. Select a node on the structure canvas or run a Task 1 experiment with node predictions, confidence, and neighborhood diagnostics.'}
      </div>
    )
  }

  const node = nodes.find((item) => resolveGraphEndpoint(item.id) === nodeId) || { id: nodeId }
  const gt = Array.isArray(groundTruth) ? groundTruth[nodeId] : groundTruth?.[nodeId]
  const pred = snapshot.node_predictions?.[nodeId]
  const probs = snapshot.node_probabilities?.[nodeId] || []
  const confidence = Number.isFinite(snapshot.node_confidence?.[nodeId])
    ? snapshot.node_confidence[nodeId]
    : Math.max(0, ...probs.filter(Number.isFinite))
  const neighborContext = snapshot.neighbor_majority?.[nodeId] || null
  const isCorrect = pred === gt
  const neighbors = []

  for (const link of links) {
    const src = resolveGraphEndpoint(link.source)
    const tgt = resolveGraphEndpoint(link.target)
    if (src === nodeId) neighbors.push(tgt)
    if (tgt === nodeId) neighbors.push(src)
  }

  const probRows = probs
    .map((value, index) => ({ index, value }))
    .filter((item) => Number.isFinite(item.value))
    .sort((a, b) => b.value - a.value)
    .slice(0, 4)

  const majorityClass = neighborContext?.majority_class
  const majorityRatio = neighborContext?.majority_ratio
  const confidenceTone = !isCorrect && confidence >= 0.85 ? 'rose' : confidence >= 0.75 ? 'emerald' : 'amber'
  const explanation = !isCorrect && confidence >= 0.85
    ? (lang === 'vi'
      ? 'Mô hình sai nhưng lại rất tự tin. Hãy xem đây là một boundary case quá tự tin và kiểm tra liệu majority của hàng xóm có đang kéo dự đoán lệch khỏi nhãn thật hay không.'
      : 'High confidence on a wrong node. Treat this as an overconfident boundary case and inspect whether the neighborhood majority is pulling the model away from the true label.')
    : Number.isFinite(majorityRatio) && majorityRatio >= 0.75
      ? (lang === 'vi'
        ? 'Dự đoán đang bám rất mạnh theo homophily của hàng xóm cục bộ. Đây là tín hiệu tốt cho GCN, nhưng cũng là rủi ro shortcut nếu lớp vùng biên bị thiếu mẫu.'
        : 'Prediction is strongly aligned with local neighborhood homophily. This is useful evidence for GCN, but also a shortcut risk if the boundary class is under-represented.')
      : (lang === 'vi'
        ? 'Dự đoán phụ thuộc vào một vùng lân cận pha trộn. Đây là ca phù hợp để soi boundary diagnostics, embedding và recall theo từng lớp.'
        : 'Prediction depends on a mixed neighborhood. This is a good candidate for boundary diagnostics, embedding inspection, and per-class recall checks.')

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
          {selectedModel || 'GCN'} node explanation
        </div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-3xl font-black tracking-tight text-slate-950">
              Node {node.original_id ?? `#${nodeId}`}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {lang === 'vi'
                ? 'Bản in gọn cho nút đang chọn hoặc nút fallback, để PDF vẫn giữ được phần giải thích mà không cần inspector dài và nặng.'
                : 'Compact print view for the selected/fallback node so the PDF keeps the explanation without a scroll-heavy inspector.'}
            </p>
          </div>
          <span className={`rounded-full border px-3 py-1.5 text-xs font-black ${isCorrect ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
            {isCorrect ? (lang === 'vi' ? 'Dự đoán đúng' : 'Correct prediction') : (lang === 'vi' ? 'Dự đoán sai' : 'Wrong prediction')}
          </span>
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <ReportMetricCard label={lang === 'vi' ? 'Lớp thật' : 'True class'} value={formatTask1ClassName(classNames, gt)} tone="slate" />
        <ReportMetricCard label={lang === 'vi' ? 'Lớp dự đoán' : 'Predicted class'} value={formatTask1ClassName(classNames, pred)} tone={isCorrect ? 'emerald' : 'rose'} />
        <ReportMetricCard label={lang === 'vi' ? 'Độ tin cậy' : 'Confidence'} value={toPercent(confidence, 1)} tone={confidenceTone} />
        <ReportMetricCard label={lang === 'vi' ? 'Bậc nút' : 'Degree'} value={String(neighbors.length)} tone="cyan" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{lang === 'vi' ? 'Tín hiệu lân cận' : 'Neighborhood signal'}</div>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            {Number.isFinite(majorityClass)
              ? (lang === 'vi'
                ? `${toPercent(majorityRatio, 1)} trong số ${neighborContext.total_neighbors ?? neighbors.length} hàng xóm trực tiếp đang nghiêng về ${formatTask1ClassName(classNames, majorityClass)}.`
                : `${toPercent(majorityRatio, 1)} of ${neighborContext.total_neighbors ?? neighbors.length} direct neighbors vote as ${formatTask1ClassName(classNames, majorityClass)}.`)
              : (lang === 'vi' ? 'Chưa có chẩn đoán majority của hàng xóm cho nút này.' : 'No neighborhood-majority diagnostic is available for this node.')}
          </p>
          <p className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            {explanation}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{lang === 'vi' ? 'Xác suất nổi bật' : 'Top probabilities'}</div>
          <div className="mt-4 grid gap-2">
            {probRows.length ? probRows.map((item) => (
              <div key={item.index} className="grid grid-cols-[86px_1fr_54px] items-center gap-3 text-xs font-semibold text-slate-700">
                <span>{formatTask1ClassName(classNames, item.index)}</span>
                <span className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full rounded-full bg-cyan-500" style={{ width: `${Math.max(2, Math.min(100, item.value * 100))}%` }} />
                </span>
                <span className="text-right">{toPercent(item.value, 1)}</span>
              </div>
            )) : (
              <p className="text-sm text-slate-500">{lang === 'vi' ? 'Checkpoint này chưa có vector xác suất.' : 'Probability vector is not available for this checkpoint.'}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function inferTask2ReportCell(descriptors = [], reliability = null) {
  const weakClassId = reliability?.metrics?.weakClass?.classId
  const scoped = descriptors.filter((descriptor) => (
    descriptor.correct === 0 && (weakClassId == null || descriptor.groundTruth === weakClassId)
  ))
  const pool = scoped.length ? scoped : descriptors.filter((descriptor) => descriptor.correct === 0)
  if (!pool.length) return null

  const counts = new Map()
  for (const descriptor of pool) {
    if (!Number.isInteger(descriptor.predicted) || !Number.isInteger(descriptor.groundTruth)) continue
    const key = `${descriptor.predicted}:${descriptor.groundTruth}`
    const current = counts.get(key) || { pred: descriptor.predicted, gt: descriptor.groundTruth, count: 0 }
    current.count += 1
    counts.set(key, current)
  }

  const best = [...counts.values()].sort((a, b) => b.count - a.count)[0]
  return best ? { pred: best.pred, gt: best.gt } : null
}

function ReportMetricCard({ label, value, tone = 'slate' }) {
  const toneMap = {
    slate: 'border-slate-200 bg-white text-slate-900',
    cyan: 'border-cyan-200 bg-cyan-50/80 text-cyan-950',
    amber: 'border-amber-200 bg-amber-50/80 text-amber-950',
    rose: 'border-rose-200 bg-rose-50/80 text-rose-950',
    emerald: 'border-emerald-200 bg-emerald-50/80 text-emerald-950',
  }

  return (
    <div className={`rounded-2xl border p-4 ${toneMap[tone] || toneMap.slate}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-black tracking-tight">{value}</div>
    </div>
  )
}

function ReportNarrativeCard({ label, body, tone = 'slate' }) {
  const toneMap = {
    slate: 'border-slate-200 bg-white',
    cyan: 'border-cyan-200 bg-cyan-50/75',
    amber: 'border-amber-200 bg-amber-50/75',
    rose: 'border-rose-200 bg-rose-50/75',
  }

  return (
    <div className={`rounded-2xl border p-4 ${toneMap[tone] || toneMap.slate}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <p className="mt-2 text-sm leading-6 text-slate-700">{body}</p>
    </div>
  )
}

function ReportSignalCard({ signal }) {
  const { lang } = useLanguage()
  if (!signal) return null
  const tone = signal.status === 'danger'
    ? 'border-rose-200 bg-rose-50/75'
    : signal.status === 'warn'
      ? 'border-amber-200 bg-amber-50/75'
      : 'border-emerald-200 bg-emerald-50/75'
  const statusLabel = signal.status === 'danger'
    ? (lang === 'vi' ? 'RỦI RO CAO' : 'DANGER')
    : signal.status === 'warn'
      ? (lang === 'vi' ? 'CẢNH BÁO' : 'WARN')
      : (lang === 'vi' ? 'ỔN ĐỊNH' : 'OK')

  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-bold text-slate-900">{signal.title}</div>
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{statusLabel}</div>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-700">{signal.summary}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{signal.evidence}</p>
      <p className="mt-2 text-xs font-semibold text-slate-700">{signal.recommendation}</p>
    </div>
  )
}

function Task2ReportSummaryPage({
  taskLabel,
  datasetName,
  epochInt,
  totalEpochs,
  collectionSummary,
  reliability,
  narrative,
  researchSignals,
  epochSuggestion,
  focusStory,
  reportCell,
  graphClassNames,
  snapshot,
}) {
  const { lang } = useLanguage()
  const metrics = reliability?.metrics || {}
  const hyperparams = snapshot?.model_hyperparams || snapshot?.hyperparams || {}
  const signalList = [researchSignals?.collapse, researchSignals?.calibration, researchSignals?.shortcut]
    .filter(Boolean)
    .map((signal) => translateTask2Signal(signal, lang))
  const localizedEpochSuggestion = translateTask2EpochSuggestion(epochSuggestion, lang)
  const weakClassLabel = metrics.weakClass?.label || 'No weak-class signal yet'
  const weakClassRecall = metrics.weakClass ? toPercent(metrics.weakClass.recall, 1) : 'N/A'
  const recipe = [
    ['Pool', hyperparams.pool_type],
    ['Focal gamma', hyperparams.task2_focal_gamma],
    ['Class weighting', hyperparams.task2_class_weighting === true ? 'on' : hyperparams.task2_class_weighting === false ? 'off' : null],
    ['Edge dropout', hyperparams.task2_edge_dropout],
    ['Attn dropout', hyperparams.task2_attn_dropout ?? hyperparams.attn_dropout],
    ['Label smoothing', hyperparams.task2_label_smoothing],
    ['Temp', snapshot?.calibration_temperature],
  ].filter(([, value]) => value !== null && value !== undefined)

  return (
    <div className="grid gap-5 print:gap-4">
      <div className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-white via-cyan-50/55 to-white p-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
          {taskLabel} - {datasetName}
        </div>
        <h2 className="mt-3 text-4xl font-black tracking-tight text-slate-950">{lang === 'vi' ? 'Báo cáo nghiên cứu Task 2' : 'Task 2 research report'}</h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
          {lang === 'vi'
            ? 'Bản xuất này chuyển Task 2 live lens thành một luồng nghiên cứu dễ in: tổng quan collection, lát cắt lỗi, so sánh latent space, đọc cấu trúc và kiểm tra readout.'
            : 'This export turns the live Task 2 lens into a print-friendly research workflow: collection overview, failure slices, latent-space comparison, structural reading, and readout inspection.'}
        </p>

        <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-slate-700">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">Epoch {epochInt}</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">{collectionSummary.totalGraphs} {lang === 'vi' ? 'đồ thị' : 'graphs'}</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">{graphClassNames.length || 1} {lang === 'vi' ? 'lớp' : 'classes'}</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">{totalEpochs} {lang === 'vi' ? 'checkpoint' : 'checkpoints'}</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">{formatCellLabel(reportCell, graphClassNames)}</span>
        </div>
        {!!recipe.length && (
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-600">
            {recipe.map(([label, value]) => (
              <span key={label} className="rounded-full border border-cyan-100 bg-cyan-50/70 px-3 py-1">
                {label}: {typeof value === 'number' ? Number(value).toFixed(value < 1 ? 3 : 2) : value}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <ReportMetricCard label={lang === 'vi' ? 'Độ chính xác' : 'Accuracy'} value={toPercent(metrics.accuracy, 1)} tone="emerald" />
        <ReportMetricCard label="Macro F1" value={toPercent(metrics.macroF1, 1)} tone="cyan" />
        <ReportMetricCard label={lang === 'vi' ? 'Balanced Acc' : 'Balanced Acc'} value={toPercent(metrics.balancedAccuracy, 1)} tone="cyan" />
        <ReportMetricCard label="ECE" value={toPercent(metrics.calibrationEce, 1)} tone="amber" />
        <ReportMetricCard label={lang === 'vi' ? 'Lệch mật độ' : 'Density Bias'} value={toSigned(metrics.densityBias, 2)} tone={Math.abs(metrics.densityBias || 0) >= 0.35 ? 'rose' : 'slate'} />
        <ReportMetricCard label={lang === 'vi' ? 'Recall lớp yếu' : 'Weak-Class Recall'} value={weakClassRecall} tone={metrics.weakClass && metrics.weakClass.recall < 0.6 ? 'rose' : 'slate'} />
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <ReportNarrativeCard label={lang === 'vi' ? 'Insight chính' : 'Main insight'} body={translateTask2ReportText(narrative?.mainInsight, lang) || (lang === 'vi' ? 'Chưa có tóm tắt narrative.' : 'No narrative summary yet.')} tone="cyan" />
        <ReportNarrativeCard label={lang === 'vi' ? 'Rủi ro chính' : 'Main risk'} body={translateTask2ReportText(narrative?.mainRisk, lang) || translateTask2ReportText(reliability?.readingGuide, lang) || (lang === 'vi' ? 'Chưa có narrative rủi ro.' : 'No risk narrative yet.')} tone="rose" />
        <ReportNarrativeCard label={lang === 'vi' ? 'Lăng kính tiếp theo' : 'Next lens'} body={translateTask2ReportText(narrative?.recommendedNextLens, lang) || (lang === 'vi' ? 'Tiếp tục soi failure slice và readout slice.' : 'Continue with failure and readout slices.')} tone="amber" />
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {signalList.map((signal) => (
          <ReportSignalCard key={signal.id} signal={signal} />
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{lang === 'vi' ? 'Ghi chú điều hướng' : 'Routing note'}</div>
          <p className="mt-2 text-sm leading-6 text-slate-700">{translateTask2ReportText(focusStory?.summary, lang) || translateTask2ReportText(reliability?.readingGuide, lang)}</p>
          <p className="mt-3 text-xs leading-5 text-slate-500">{translateTask2ReportText(focusStory?.evidence, lang) || (lang === 'vi' ? 'Chưa có bằng chứng điều hướng cho checkpoint này.' : 'No routing evidence available for this checkpoint.')}</p>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {lang === 'vi'
              ? <>Lát cắt mặc định của report là <span className="font-semibold">{formatCellLabel(reportCell, graphClassNames)}</span>. Nếu bạn ghim một ô confusion mới trước khi in, các trang slice-aware sẽ đi theo lựa chọn đó.</>
              : <>The default report slice is <span className="font-semibold">{formatCellLabel(reportCell, graphClassNames)}</span>. If you pin a new confusion cell before printing, the slice-aware pages will follow that selection instead.</>}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{lang === 'vi' ? 'Gợi ý epoch tốt nhất' : 'Best epoch suggestion'}</div>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {localizedEpochSuggestion?.recommendation || (lang === 'vi' ? 'Chưa có gợi ý epoch.' : 'No epoch guidance available yet.')}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {localizedEpochSuggestion?.rationale || (lang === 'vi' ? 'Khi có nhiều checkpoint hơn, khối này sẽ nêu ra mốc đọc tốt nhất theo Macro F1 và Balanced Accuracy.' : 'Once multiple checkpoints are available, this block will surface the best Macro F1 and balanced-accuracy reads.')}
          </p>
          <div className="mt-4 grid gap-2 text-sm text-slate-700">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              {lang === 'vi' ? 'Macro F1 tốt nhất' : 'Best Macro F1'}: {localizedEpochSuggestion?.bestMacro ? `epoch ${localizedEpochSuggestion.bestMacro.epoch} - ${toPercent(localizedEpochSuggestion.bestMacro.macroF1, 1)}` : 'N/A'}
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              {lang === 'vi' ? 'Balanced Acc tốt nhất' : 'Best Balanced Acc'}: {localizedEpochSuggestion?.bestBalanced ? `epoch ${localizedEpochSuggestion.bestBalanced.epoch} - ${toPercent(localizedEpochSuggestion.bestBalanced.balancedAccuracy, 1)}` : 'N/A'}
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              {lang === 'vi' ? 'Lớp yếu' : 'Weak class'}: {weakClassLabel}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Task2CalibrationMarginPage({ snapshot, reliability, epochSuggestion }) {
  const { lang } = useLanguage()
  const metrics = reliability?.metrics || {}
  const rawGap = snapshot?.calibration_gap_raw
  const calibratedGap = snapshot?.calibration_gap
  const localizedEpochSuggestion = translateTask2EpochSuggestion(epochSuggestion, lang)
  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{lang === 'vi' ? 'Chẩn đoán calibration và margin' : 'Calibration and margin diagnostics'}</div>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          {lang === 'vi'
            ? 'Dùng trang này để tách phần tăng giảm benchmark khỏi mức độ đáng tin. Margin mỏng, ECE cao, hoặc chênh lệch lớn giữa raw và calibrated confidence là dấu hiệu phần giải thích nên được đọc thận trọng.'
            : 'Use this page to separate benchmark movement from trustworthiness. Thin margin, high ECE, or a large raw-calibrated confidence gap means the visual explanation should stay cautious.'}
        </p>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <ReportMetricCard label="ECE" value={toPercent(metrics.calibrationEce, 1)} tone="amber" />
        <ReportMetricCard label="Brier" value={Number.isFinite(metrics.brier) ? metrics.brier.toFixed(3) : 'N/A'} tone="slate" />
        <ReportMetricCard label={lang === 'vi' ? 'Median margin' : 'Median margin'} value={toPercent(snapshot?.median_margin, 1)} tone={(snapshot?.median_margin || 0) < 0.12 ? 'rose' : 'cyan'} />
        <ReportMetricCard label={lang === 'vi' ? 'Sai nhưng tự tin cao' : 'High-conf wrong'} value={toPercent(metrics.highConfWrongRate, 1)} tone={(metrics.highConfWrongRate || 0) > 0.15 ? 'rose' : 'slate'} />
        <ReportMetricCard label={lang === 'vi' ? 'Chênh raw' : 'Raw gap'} value={toSigned(rawGap, 2)} tone={Math.abs(rawGap || 0) >= 0.15 ? 'rose' : 'slate'} />
        <ReportMetricCard label={lang === 'vi' ? 'Chênh calibrated' : 'Calibrated gap'} value={toSigned(calibratedGap, 2)} tone={Math.abs(calibratedGap || 0) >= 0.12 ? 'amber' : 'emerald'} />
      </div>
      <ReportNarrativeCard
        label={lang === 'vi' ? 'Epoch nghiên cứu nên dùng' : 'Best research epoch'}
        tone="cyan"
        body={snapshot?.best_selection_metric
          ? (lang === 'vi'
            ? `Report nên dùng epoch ${snapshot.best_epoch ?? snapshot.best_val_epoch ?? 'N/A'}, được chọn bởi ${snapshot.best_selection_metric}. Checkpoint nghiên cứu tốt nhất này đạt Macro F1 ${toPercent(snapshot.best_macro_f1, 1)} và Balanced Accuracy ${toPercent(snapshot.best_balanced_accuracy, 1)}; các epoch sau chủ yếu hữu ích để chẩn đoán overfit hoặc shortcut drift.`
            : `Report capture should use epoch ${snapshot.best_epoch ?? snapshot.best_val_epoch ?? 'N/A'}, selected by ${snapshot.best_selection_metric}. That best research checkpoint reached Macro F1 ${toPercent(snapshot.best_macro_f1, 1)} and Balanced Accuracy ${toPercent(snapshot.best_balanced_accuracy, 1)}; later epochs are useful mainly for overfit or shortcut-drift diagnosis.`)
          : (localizedEpochSuggestion?.recommendation || (lang === 'vi' ? 'Ưu tiên Macro F1 và Balanced Accuracy khi chọn checkpoint cho Task 2.' : 'Prefer Macro F1 and Balanced Accuracy for Task 2 checkpoint selection.'))}
      />
    </div>
  )
}

function Task2RecommendationsPage({ researchSignals, reliability, focusStory, snapshot }) {
  const { lang } = useLanguage()
  const metrics = reliability?.metrics || {}
  const hyperparams = snapshot?.model_hyperparams || {}
  const collapseSignal = translateTask2Signal(researchSignals?.collapse, lang)
  const shortcutSignal = translateTask2Signal(researchSignals?.shortcut, lang)
  const calibrationSignal = translateTask2Signal(researchSignals?.calibration, lang)
  const recommendations = [
    collapseSignal?.recommendation || (lang === 'vi' ? 'Giữ class weighting và focal loss cho tới khi recall của lớp yếu ổn định.' : 'Keep class weighting/focal loss active until weak-class recall is stable.'),
    shortcutSignal?.recommendation || (lang === 'vi' ? 'Soi lại lát cắt density và clustering trước khi khẳng định model đã hiểu motif.' : 'Audit density and clustering slices before claiming motif understanding.'),
    calibrationSignal?.recommendation || (lang === 'vi' ? 'Dùng temperature scaling và margin diagnostics trước khi tin các ca sai nhưng tự tin.' : 'Use temperature scaling and margin diagnostics before trusting confident misses.'),
    translateTask2ReportText(focusStory?.recommendation, lang) || (lang === 'vi' ? 'Ở vòng sau, so sánh weak-class misses với structural outliers.' : 'Compare weak-class misses against structural outliers in the next run.'),
  ].filter(Boolean)

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{lang === 'vi' ? 'Công thức cho vòng tiếp theo' : 'Next experiment recipe'}</div>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">{lang === 'vi' ? 'Giữ mô hình dễ giải thích trước khi đuổi theo benchmark' : 'Keep the model explainable before chasing benchmark accuracy'}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          {lang === 'vi'
            ? `Recall lớp yếu hiện là ${metrics.weakClass ? toPercent(metrics.weakClass.recall, 1) : 'N/A'} và density bias là ${toSigned(metrics.densityBias, 2)}. Vòng tiếp theo nên chụp report từ epoch nghiên cứu tốt nhất, đồng thời tối ưu recall, calibration và khả năng kháng shortcut.`
            : `Current weak-class recall is ${metrics.weakClass ? toPercent(metrics.weakClass.recall, 1) : 'N/A'} and density bias is ${toSigned(metrics.densityBias, 2)}. The next iteration should report from the best research epoch while targeting recall, calibration, and shortcut resistance together.`}
        </p>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {recommendations.map((item, index) => (
          <ReportNarrativeCard key={item} label={lang === 'vi' ? `Khuyến nghị ${index + 1}` : `Recommendation ${index + 1}`} body={item} tone={index === 0 ? 'cyan' : index === 1 ? 'rose' : 'amber'} />
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
        {lang === 'vi'
          ? <>Cấu hình nhẹ hiện tại: pool <span className="font-semibold">{hyperparams.pool_type || 'attention_sum'}</span>, focal gamma <span className="font-semibold">{hyperparams.task2_focal_gamma ?? 'N/A'}</span>, class weighting <span className="font-semibold">{hyperparams.task2_class_weighting === true ? 'bật' : 'N/A'}</span>, edge dropout <span className="font-semibold">{hyperparams.task2_edge_dropout ?? 'N/A'}</span>, density contrastive <span className="font-semibold">{hyperparams.task2_density_contrastive_weight ?? 'N/A'}</span>, temperature cap <span className="font-semibold">{hyperparams.task2_temperature_max ?? 'N/A'}</span>, attention dropout <span className="font-semibold">{hyperparams.task2_attn_dropout ?? hyperparams.attn_dropout ?? 'N/A'}</span>, label smoothing <span className="font-semibold">{hyperparams.task2_label_smoothing ?? 'N/A'}</span>.</>
          : <>Current lightweight recipe: pool <span className="font-semibold">{hyperparams.pool_type || 'attention_sum'}</span>, focal gamma <span className="font-semibold">{hyperparams.task2_focal_gamma ?? 'N/A'}</span>, class weighting <span className="font-semibold">{hyperparams.task2_class_weighting === true ? 'on' : 'N/A'}</span>, edge dropout <span className="font-semibold">{hyperparams.task2_edge_dropout ?? 'N/A'}</span>, density contrastive <span className="font-semibold">{hyperparams.task2_density_contrastive_weight ?? 'N/A'}</span>, temperature cap <span className="font-semibold">{hyperparams.task2_temperature_max ?? 'N/A'}</span>, attention dropout <span className="font-semibold">{hyperparams.task2_attn_dropout ?? hyperparams.attn_dropout ?? 'N/A'}</span>, label smoothing <span className="font-semibold">{hyperparams.task2_label_smoothing ?? 'N/A'}</span>.</>}
      </div>
    </div>
  )
}

function ReportSection({ page, index }) {
  const { lang } = useLanguage()
  const ViewIcon = page.icon
  return (
    <section
      key={page.id}
      className="lab-report-section rounded-xl border border-line-subtle/35 bg-deep/45 p-3 print:min-h-screen print:break-after-page print:rounded-none print:border-0 print:bg-white print:p-0 print:shadow-none"
    >
      <div className="mb-3 flex items-center gap-2 border-b border-line-subtle/45 pb-2 print:border-slate-200">
        <ViewIcon size={15} className="text-amethyst print:text-slate-700" />
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-twilight print:text-slate-500">
            {lang === 'vi' ? 'Trang' : 'Page'} {index + 1}
          </div>
          <div className="text-base font-bold text-white print:text-slate-900">{page.label}</div>
        </div>
      </div>
      <ErrorBoundary>
        <Suspense fallback={<PanelLoader label={lang === 'vi' ? 'Đang tải trang báo cáo...' : 'Loading report page...'} />}>
          {page.render()}
        </Suspense>
      </ErrorBoundary>
    </section>
  )
}

const VIEW_CONFIG = {
  metrics: {
    title: 'Metrics capture view',
    description: 'A wide, print-friendly surface for task diagnostics, reliability notes, and task-specific narratives.',
    icon: ScanSearch,
    render: () => <MetricsRouter />,
  },
  latent: {
    title: 'Latent space capture view',
    description: 'A larger latent-space canvas for screenshots, cluster comparison, and quick visual inspection.',
    icon: Globe2,
    render: () => <EmbeddingRouter />,
  },
  structure: {
    title: 'Structure capture view',
    description: 'A dedicated topology canvas with the inspector visible so graph reasoning is easier to review and share.',
    icon: Network,
    render: () => (
      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="lab-report-panel-shell h-[calc(100vh-230px)] min-h-[520px] max-h-[760px] overflow-hidden rounded-xl border border-line-subtle/35 bg-deep/45">
          <TopologyRouter analysisMode />
        </div>
        <div className="lab-report-panel-shell h-[calc(100vh-230px)] min-h-[520px] max-h-[760px] overflow-hidden rounded-xl border border-line-subtle/35 bg-deep/45">
          <InfoRouter analysisMode />
        </div>
      </div>
    ),
  },
}

export default function LabAnalysisPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t, lang } = useLanguage()
  const { panel = 'metrics' } = useParams()
  const { snapshots, currentEpochFloat, totalEpochs } = usePlayerStore()
  const selectedTask = useGNNStore((state) => state.selectedTask)
  const taskData = useGNNStore((state) => state.taskData)
  const classNames = useGNNStore((state) => state.classNames)
  const selectedCell = useGNNStore((state) => state.task2SelectedCell)
  const datasetName = useGNNStore((state) => state.datasetName || state.activeDatasetVersionName || 'Active dataset')
  const [printPreparing, setPrintPreparing] = useState(false)
  const handledPrintRequestRef = useRef(null)

  const config = VIEW_CONFIG[panel] || VIEW_CONFIG.metrics
  const Icon = config.icon

  const reportPages = useMemo(() => {
    const task3Copy = getTask3Copy(lang)
    const task4Copy = getTask4Copy(lang)
    if (selectedTask !== 2) {
      // Task-specific tab configs for the PDF Book
      const TASK_TABS = {
        1: [
          { tab: 'overview', label: lang === 'vi' ? 'Task 1 - tổng quan chỉ số' : 'Task 1 Metrics - overview' },
          { tab: 'confusion', label: lang === 'vi' ? 'Task 1 - ma trận nhầm lẫn' : 'Task 1 Metrics - confusion' },
          { tab: 'homophily', label: lang === 'vi' ? 'Task 1 - homophily' : 'Task 1 Metrics - homophily' },
          { tab: 'insights', label: lang === 'vi' ? 'Task 1 - insight' : 'Task 1 Metrics - insights' },
        ],
        3: [
          { tab: 'overview', label: task3Copy.reportTabs.overview },
          { tab: 'failures', label: task3Copy.reportTabs.failures },
          { tab: 'structure', label: task3Copy.reportTabs.structure },
          { tab: 'reasoning', label: task3Copy.reportTabs.reasoning },
        ],
        4: [
          { tab: 'overview', label: task4Copy.reportTabs.overview },
          { tab: 'bridges', label: task4Copy.reportTabs.bridges },
          { tab: 'stability', label: task4Copy.reportTabs.stability },
        ],
        5: [
          { tab: 'overview', label: lang === 'vi' ? 'Task 5 - tổng quan chỉ số' : 'Task 5 Metrics - overview' },
          { tab: 'outliers', label: lang === 'vi' ? 'Task 5 - các nút ngoại lệ' : 'Task 5 Metrics - outlier nodes' },
          { tab: 'neighborhood', label: lang === 'vi' ? 'Task 5 - bảo toàn lân cận' : 'Task 5 Metrics - neighborhood preservation' },
          { tab: 'diagnostics', label: lang === 'vi' ? 'Task 5 - chẩn đoán' : 'Task 5 Metrics - diagnostics' },
        ],
        6: [
          { tab: 'overview', label: lang === 'vi' ? 'Task 6 - tổng quan chỉ số' : 'Task 6 Metrics - overview' },
          { tab: 'comparison', label: lang === 'vi' ? 'Task 6 - histogram so sánh' : 'Task 6 Metrics - comparison histograms' },
          { tab: 'invalidity', label: lang === 'vi' ? 'Task 6 - lý do không hợp lệ' : 'Task 6 Metrics - invalidity reasons' },
          { tab: 'signatures', label: lang === 'vi' ? 'Task 6 - dấu hiệu đặc trưng' : 'Task 6 Metrics - signatures' },
        ],
      }

      const tabs = selectedTask === 4
        ? [
          { tab: 'overview', label: task4Copy.reportTabs.overview },
          { tab: 'bridges', label: task4Copy.reportTabs.bridges },
          { tab: 'stability', label: task4Copy.reportTabs.stability },
        ]
        : TASK_TABS[selectedTask]
      if (tabs) {
        const taskLabel = TASK_LABELS[selectedTask] || `Task ${selectedTask}`
        const metricsPages = tabs.map((t) => ({
          id: `task${selectedTask}-metrics-${t.tab}`,
          label: t.label,
          icon: ScanSearch,
          render: () => <MetricsRouter forcedTab={t.tab} hideTabControls reportMode compactNarrative />,
        }))
        const structurePages = selectedTask === 1
          ? [
              {
                id: 'structure-full',
                label: lang === 'vi' ? `${taskLabel} - cấu trúc bản in` : `${taskLabel} Structure - print snapshot`,
                icon: Network,
                render: () => (
                  <div className="lab-report-panel-shell lab-report-canvas-shell h-[760px] overflow-hidden rounded-xl border border-line-subtle/35 bg-white">
                    <TopologyRouter reportMode />
                  </div>
                ),
              },
              {
                id: 'node-explanation',
                label: lang === 'vi' ? `${taskLabel} - giải thích nút đã chọn` : `${taskLabel} Selected Node - explanation`,
                icon: ScanSearch,
                render: () => <Task1NodeExplanationReport />,
              },
            ]
          : [
              {
                id: 'structure-full',
                label: lang === 'vi' ? `${taskLabel} - cấu trúc toàn canvas` : `${taskLabel} Structure - full canvas`,
                icon: Network,
                render: () => selectedTask === 3
                  ? (
                    <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
                      <div className="lab-report-panel-shell min-h-[620px] overflow-hidden rounded-xl border border-line-subtle/35 bg-deep/45">
                        <TopologyRouter reportMode viewMode="evidence" />
                      </div>
                      <div className="lab-report-panel-shell min-h-[620px] overflow-hidden rounded-xl border border-line-subtle/35 bg-deep/45">
                        <InfoRouter reportMode />
                      </div>
                    </div>
                  )
                  : selectedTask === 4
                    ? (
                      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
                        <div className="lab-report-panel-shell min-h-[620px] overflow-hidden rounded-xl border border-line-subtle/35 bg-deep/45">
                          <TopologyRouter reportMode viewMode="bridges" />
                        </div>
                        <div className="lab-report-panel-shell min-h-[620px] overflow-hidden rounded-xl border border-line-subtle/35 bg-deep/45">
                          <InfoRouter reportMode />
                        </div>
                      </div>
                    )
                    : VIEW_CONFIG.structure.render(),
              },
            ]
        const normalizedStructurePages = selectedTask === 3
          ? structurePages.map((page) => (
            page.id === 'structure-full'
              ? { ...page, label: task3Copy.reportTabs.canvas }
              : page
          ))
          : selectedTask === 4
            ? structurePages.map((page) => (
              page.id === 'structure-full'
                ? { ...page, label: task4Copy.reportTabs.canvas }
                : page
            ))
          : structurePages

        return [
          ...metricsPages,
          {
            id: 'latent-full',
            icon: Globe2,
            render: () => <EmbeddingRouter reportMode />,
            label: selectedTask === 3
              ? task3Copy.reportTabs.latent
              : task4Copy.reportTabs.latent,
          },
          ...normalizedStructurePages,
        ]
      }

      // Fallback: 3-page generic report
      return [
        {
          id: 'metrics-full',
          label: lang === 'vi' ? 'Chỉ số - toàn bộ panel' : 'Metrics - full panel',
          icon: ScanSearch,
          render: () => <MetricsRouter />,
        },
        {
          id: 'latent-full',
          label: lang === 'vi' ? 'Không gian ẩn - toàn canvas' : 'Latent - full canvas',
          icon: Globe2,
          render: () => <EmbeddingRouter />,
        },
        {
          id: 'structure-full',
          label: lang === 'vi' ? 'Cấu trúc - toàn canvas' : 'Structure - full canvas',
          icon: Network,
          render: () => VIEW_CONFIG.structure.render(),
        },
      ]
    }

    const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
    const snap = snapshots[epochInt] || null
    const graphs = taskData?.graphs || []
    const indexedGraphs = graphs.map((graph, index) => ({
      ...graph,
      originalGraphId: graph?.originalGraphId ?? index,
      sourceIndex: graph?.sourceIndex ?? index,
    }))
    const graphClassNames = buildGraphClassNames(indexedGraphs, taskData?.classNames || classNames)
    const collectionSummary = summarizeGraphCollection(indexedGraphs, graphClassNames)
    const reliability = assessTask2Reliability({ snapshot: snap, graphs: indexedGraphs, classNames: graphClassNames })
    const descriptors = buildTask2GraphDescriptors({ snapshot: snap, graphs: indexedGraphs, classNames: graphClassNames })
    const narrative = buildTask2NarrativeSummary(descriptors, reliability)
    const researchSignals = buildTask2ResearchSignals({
      snapshot: snap,
      graphs: descriptors,
      classNames: graphClassNames,
      reliability,
      descriptors,
    })
    const epochSuggestion = buildTask2BestEpochSuggestion(snapshots)
    const focusStory = buildTask2FocusStory({
      reliability,
      descriptors,
      classNames: graphClassNames,
    })
    const reportCell = selectedCell || inferTask2ReportCell(descriptors, reliability)

    return [
      {
        id: 'task2-summary',
        label: lang === 'vi' ? 'Task 2 - tóm tắt điều hành' : 'Task 2 - executive summary',
        icon: Download,
        render: () => (
          <Task2ReportSummaryPage
            taskLabel={TASK_LABELS[selectedTask]}
            datasetName={datasetName}
            epochInt={epochInt}
            totalEpochs={totalEpochs || snapshots.length}
            collectionSummary={collectionSummary}
            reliability={reliability}
            narrative={narrative}
            researchSignals={researchSignals}
            epochSuggestion={epochSuggestion}
            focusStory={focusStory}
            reportCell={reportCell}
            graphClassNames={graphClassNames}
            snapshot={snap}
          />
        ),
      },
      {
        id: 'metrics-overview',
        label: lang === 'vi' ? 'Tổng quan chỉ số' : 'Metrics overview',
        icon: ScanSearch,
        render: () => <MetricsRouter forcedTab="overview" hideTabControls hideFocusControls disableAutoSelection reportMode />,
      },
      {
        id: 'metrics-failures',
        label: lang === 'vi' ? 'Tổng quan lỗi + confusion' : 'Failure + confusion overview',
        icon: ScanSearch,
        render: () => <MetricsRouter forcedTab="failures" hideTabControls hideFocusControls disableAutoSelection reportMode />,
      },
      {
        id: 'metrics-weak-class',
        label: lang === 'vi' ? 'Các ca trượt của lớp yếu' : 'Weak-class misses',
        icon: ScanSearch,
        render: () => (
          <MetricsRouter
            forcedTab="failures"
            forcedFocus="weak_class"
            forcedSelectedCell={reportCell}
            hideTabControls
            hideFocusControls
            disableAutoSelection
            reportMode
          />
        ),
      },
      {
        id: 'latent-predicted-correctness',
        label: lang === 'vi' ? 'Không gian ẩn - dự đoán và độ đúng' : 'Latent - predicted and correctness',
        icon: Globe2,
        render: () => (
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="lab-report-panel-shell lab-report-compact-viz overflow-hidden rounded-xl border border-line-subtle/35 bg-deep/45">
              <EmbeddingRouter forcedTask2ColorMode="predicted" hideTask2Toolbar reportMode />
            </div>
            <div className="lab-report-panel-shell lab-report-compact-viz overflow-hidden rounded-xl border border-line-subtle/35 bg-deep/45">
              <EmbeddingRouter forcedTask2ColorMode="correctness" hideTask2Toolbar reportMode />
            </div>
          </div>
        ),
      },
      {
        id: 'latent-confidence-entropy-focus',
        label: lang === 'vi' ? 'Không gian ẩn - độ tin cậy, entropy, trọng tâm' : 'Latent - confidence, entropy, focus',
        icon: Globe2,
        render: () => (
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="lab-report-panel-shell lab-report-compact-viz overflow-hidden rounded-xl border border-line-subtle/35 bg-deep/45">
              <EmbeddingRouter forcedTask2ColorMode="confidence" hideTask2Toolbar reportMode />
            </div>
            <div className="lab-report-panel-shell lab-report-compact-viz overflow-hidden rounded-xl border border-line-subtle/35 bg-deep/45">
              <EmbeddingRouter forcedTask2ColorMode="entropy" hideTask2Toolbar reportMode />
            </div>
            <div className="lab-report-panel-shell lab-report-compact-viz overflow-hidden rounded-xl border border-line-subtle/35 bg-deep/45">
              <EmbeddingRouter forcedTask2ColorMode="correctness" forcedTask2SelectedCell={reportCell} hideTask2Toolbar reportMode />
            </div>
          </div>
        ),
      },
      {
        id: 'structure-hard-cases',
        label: lang === 'vi' ? 'Cấu trúc - các ca khó nổi bật' : 'Structure - top hard cases',
        icon: Network,
        render: () => (
          <div className="lab-report-panel-shell lab-report-canvas-shell h-[760px] overflow-hidden rounded-xl border border-line-subtle/35 bg-deep/45">
            <TopologyRouter forcedGallerySort="priority" hideGalleryControls showGalleryOnly reportMode />
          </div>
        ),
      },
      {
        id: 'metrics-outlier',
        label: lang === 'vi' ? 'Ngoại lệ cấu trúc' : 'Structural outliers',
        icon: ScanSearch,
        render: () => <MetricsRouter forcedTab="structure" forcedFocus="outlier" hideTabControls hideFocusControls disableAutoSelection reportMode />,
      },
      {
        id: 'readout-weak-class',
        label: lang === 'vi' ? 'Readout - ca lớp yếu' : 'Readout - weak-class case',
        icon: Network,
        render: () => (
          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="lab-report-panel-shell min-h-[620px] overflow-hidden rounded-xl border border-line-subtle/35 bg-deep/45">
              <TopologyRouter forcedFocus="weak_class" forcedSelectedCell={reportCell} hideGalleryControls reportMode />
            </div>
            <div className="lab-report-panel-shell min-h-[620px] overflow-hidden rounded-xl border border-line-subtle/35 bg-deep/45">
              <InfoRouter forcedFocus="weak_class" forcedSelectedCell={reportCell} reportMode />
            </div>
          </div>
        ),
      },
      {
        id: 'readout-outlier',
        label: lang === 'vi' ? 'Readout - ngoại lệ cấu trúc' : 'Readout - structural outliers',
        icon: Network,
        render: () => (
          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="lab-report-panel-shell min-h-[620px] overflow-hidden rounded-xl border border-line-subtle/35 bg-deep/45">
              <TopologyRouter forcedFocus="outlier" hideGalleryControls reportMode />
            </div>
            <div className="lab-report-panel-shell min-h-[620px] overflow-hidden rounded-xl border border-line-subtle/35 bg-deep/45">
              <InfoRouter forcedFocus="outlier" reportMode />
            </div>
          </div>
        ),
      },
      {
        id: 'calibration-margin',
        label: lang === 'vi' ? 'Hiệu chuẩn + chẩn đoán margin' : 'Calibration + margin diagnostics',
        icon: ScanSearch,
        render: () => <Task2CalibrationMarginPage snapshot={snap} reliability={reliability} epochSuggestion={epochSuggestion} />,
      },
      {
        id: 'recommendations',
        label: lang === 'vi' ? 'Khuyến nghị' : 'Recommendations',
        icon: Download,
        render: () => (
          <Task2RecommendationsPage
            researchSignals={researchSignals}
            reliability={reliability}
            focusStory={focusStory}
            snapshot={snap}
          />
        ),
      },
    ]
  }, [classNames, currentEpochFloat, datasetName, lang, selectedCell, selectedTask, snapshots, taskData, totalEpochs])

  const reportConfig = {
    title: lang === 'vi' ? 'Báo cáo PDF mở rộng' : 'Expanded PDF report',
    description: lang === 'vi'
      ? 'Một cuốn báo cáo sẵn sàng để in, với các trang riêng cho chỉ số, các chế độ không gian ẩn, cấu trúc và các lát cắt readout.'
      : 'A print-ready analysis book with dedicated pages for metrics, latent-space modes, structure, and readout slices.',
    icon: Download,
    render: () => (
      <div className="lab-report-book space-y-6 print:space-y-0">
        {reportPages.map((page, index) => (
          <ReportSection key={page.id} page={page} index={index} />
        ))}
      </div>
    ),
  }

  const resolvedConfig = panel === 'report' ? reportConfig : config
  const ResolvedIcon = resolvedConfig.icon
  const pendingPrintRequest = location.state?.printRequestId

  const printWhenReady = useCallback(async () => {
    setPrintPreparing(true)
    await preloadLabAnalysisViews(selectedTask)
    window.setTimeout(() => {
      window.print()
      setPrintPreparing(false)
    }, 150)
  }, [selectedTask])

  const handlePrintAll = useCallback(() => {
    if (panel !== 'report') {
      navigate('/app/lab/analysis/report', {
        state: { printRequestId: Date.now() },
      })
      return
    }
    printWhenReady()
  }, [navigate, panel, printWhenReady])

  useEffect(() => {
    if (panel !== 'report' || !pendingPrintRequest) return
    if (handledPrintRequestRef.current === pendingPrintRequest) return
    handledPrintRequestRef.current = pendingPrintRequest
    printWhenReady()
  }, [panel, pendingPrintRequest, printWhenReady])

  // We always also render the PDF Book content in a print-only container so
  // that triggering window.print() from any capture tab produces the same
  // editorial PDF layout — keeps "Print / Save PDF" consistent with "PDF Book".
  const printOnlyBook = panel !== 'report' && (
    <div className="hidden print:block">
      <ErrorBoundary>
        <Suspense fallback={null}>
          {reportConfig.render()}
        </Suspense>
      </ErrorBoundary>
    </div>
  )

  return (
    <div className="lab-analysis-page min-h-screen bg-abyss text-starlight">
      <div className="lab-analysis-inner mx-auto flex max-w-[1800px] flex-col gap-3 px-6 py-4 print:gap-0 print:px-0 print:py-0">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line-subtle/55 bg-deep/55 px-4 py-3 backdrop-blur-md print:hidden">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-twilight">
              {TASK_LABELS[selectedTask]} - {datasetName}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <ResolvedIcon size={16} className="text-amethyst" />
              <h1 className="text-lg font-black tracking-tight text-white">{resolvedConfig.title}</h1>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-moonlight">
              {resolvedConfig.description}
            </p>
            <div className="mt-3 inline-flex flex-wrap items-center gap-1 rounded-xl border border-line-subtle/60 bg-deep/55 p-1">
              {[
                ['latent', t('lab.tab_latent'), Globe2],
                ['structure', t('lab.tab_structure'), Network],
                ['metrics', t('lab.tab_metrics'), ScanSearch],
                ['report', t('lab.tab_pdf_book'), Download],
              ].map(([viewId, label, ViewIcon]) => {
                const active = panel === viewId
                return (
                  <button
                    key={viewId}
                    type="button"
                    onClick={() => navigate(`/app/lab/analysis/${viewId}`)}
                    className={`inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                      active
                        ? 'bg-nebula text-white'
                        : 'text-moonlight hover:bg-nebula/70 hover:text-starlight'
                    }`}
                  >
                    <ViewIcon size={13} className={active ? 'text-amethyst' : 'text-twilight'} />
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/app/lab')}
              className="inline-flex items-center gap-2 rounded-lg border border-line-subtle/60 bg-nebula/70 px-3 py-1.5 text-[11px] font-semibold text-starlight transition-colors hover:border-line-active hover:text-white"
            >
              <ArrowLeft size={13} />
              {t('lab.back_to_lab')}
            </button>
            <button
              type="button"
              onClick={handlePrintAll}
              disabled={printPreparing}
              className="inline-flex items-center gap-2 rounded-lg border border-line-subtle/60 bg-nebula/70 px-3 py-1.5 text-[11px] font-semibold text-starlight transition-colors hover:border-line-active"
              title={t('lab.print_tooltip')}
            >
              <Printer size={13} />
              {printPreparing ? t('lab.preparing_pdf') : t('lab.print_save_pdf')}
            </button>
            <button
              type="button"
              onClick={handlePrintAll}
              disabled={printPreparing}
              className="inline-flex items-center gap-2 rounded-lg border border-line-subtle/60 bg-nebula/70 px-3 py-1.5 text-[11px] font-semibold text-starlight transition-colors hover:border-line-active"
            >
              <Download size={13} />
              {printPreparing ? t('lab.preparing') : panel === 'report' ? t('lab.export_detailed_pdf') : t('lab.export_full_pdf')}
            </button>
          </div>
        </div>

        <div className="lab-analysis-content bg-transparent p-0 shadow-none print:border-0 print:bg-white">
          <ErrorBoundary>
            <Suspense fallback={<PanelLoader label={t('lab.loading_capture')} />}>
              {panel === 'report' ? (
                resolvedConfig.render()
              ) : (
                <>
                  <div className="print:hidden">
                    {resolvedConfig.render()}
                  </div>
                  {printOnlyBook}
                </>
              )}
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  )
}
