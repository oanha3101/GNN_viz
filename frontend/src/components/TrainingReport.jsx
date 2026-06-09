import { ExternalLink, FileText, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import useGNNStore from '../store/useGNNStore'
import usePlayerStore from '../store/playerStore'
import { useLanguage } from '../contexts/LanguageContext'

const TASK_NAMES = {
  1: 'Node Classification',
  2: 'Graph Classification',
  3: 'Link Prediction',
  4: 'Community Detection',
  5: 'Graph Embedding',
  6: 'Graph Generation',
}

export default function TrainingReport() {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const reportOpen = useGNNStore((s) => s.reportOpen)
  const setReportOpen = useGNNStore((s) => s.setReportOpen)
  const selectedTask = useGNNStore((s) => s.selectedTask)
  const selectedModel = useGNNStore((s) => s.selectedModel)
  const datasetName = useGNNStore((s) => s.datasetName || s.activeDatasetVersionName || 'Active dataset')
  const snapshots = usePlayerStore((s) => s.snapshots)
  const currentEpoch = usePlayerStore((s) => s.currentEpoch)

  if (!reportOpen) return null

  const pageCount = selectedTask === 2 ? 16 : 3
  const copy = lang === 'vi'
    ? {
        eyebrow: 'Điều hướng báo cáo',
        title: `${TASK_NAMES[selectedTask]} với ${selectedModel}`,
        description: 'Bản report huấn luyện gọn cũ đã được thay bằng PDF Book đầy đủ để khi xuất file, bạn luôn nhận đúng các trang đang xem trong ứng dụng.',
        dataset: 'Tập dữ liệu',
        currentEpoch: 'Epoch hiện tại',
        exportPackage: 'Gói xuất',
        capturePages: 'trang capture',
        task2Hint: 'Với Task 2, nút này sẽ mở PDF Book đầy đủ gồm executive summary, metrics slices, latent modes, gallery slices, structure và readout pages.',
        close: 'Đóng',
        openBook: 'Mở PDF Book đầy đủ',
      }
    : {
        eyebrow: 'Report routing',
        title: `${TASK_NAMES[selectedTask]} with ${selectedModel}`,
        description: 'The old compact training report has been replaced by the full capture book so your exports always include the same pages you review in the app.',
        dataset: 'Dataset',
        currentEpoch: 'Current epoch',
        exportPackage: 'Export package',
        capturePages: 'capture pages',
        task2Hint: 'For Task 2 this opens the full PDF Book with executive summary, metrics slices, latent modes, gallery slices, structure, and readout pages.',
        close: 'Close',
        openBook: 'Open full PDF Book',
      }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/78 p-6 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-[28px] border border-slate-700/40 bg-deep shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800/70 px-6 py-5">
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.28em] text-cyan-300/80">
              <FileText size={12} />
              {copy.eyebrow}
            </div>
            <h2 className="text-2xl font-semibold text-white">{copy.title}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {copy.description}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReportOpen(false)}
            className="rounded-xl border border-slate-700/40 bg-slate-900/70 p-2.5 text-slate-300 transition-colors hover:bg-slate-800/80"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="rounded-2xl border border-slate-700/40 bg-slate-900/60 p-4 text-sm leading-6 text-slate-300">
            <p>
              {copy.dataset}: <span className="font-semibold text-white">{datasetName}</span>
            </p>
            <p>
              {copy.currentEpoch}: <span className="font-semibold text-white">{snapshots.length ? currentEpoch : 'N/A'}</span>
            </p>
            <p>
              {copy.exportPackage}: <span className="font-semibold text-white">{pageCount} {copy.capturePages}</span>
            </p>
          </div>

          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/8 p-4 text-sm leading-6 text-cyan-100">
            {copy.task2Hint}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setReportOpen(false)}
              className="rounded-xl border border-slate-700/40 bg-slate-900/70 px-4 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-slate-800/80"
            >
              {copy.close}
            </button>
            <button
              type="button"
              onClick={() => {
                setReportOpen(false)
                navigate('/app/lab/analysis/report')
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/12 px-4 py-2 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/18"
            >
              <ExternalLink size={15} />
              {copy.openBook}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
