/**
 * ProjectLibrary – Sidebar panel showing all saved training runs.
 * Users can click a run to reload it (snapshots + graph data + config)
 * and visually replay past training sessions.
 */
import { useState, useEffect, useCallback } from 'react'
import { X, RefreshCw, Trash2, Play, AlertTriangle, Loader2, FolderOpen, Network, BarChart3, Link2, Users, Globe2, Dna } from 'lucide-react'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { API_BASE } from '../../utils/api'

const API = API_BASE

const TASK_NAMES = {
  1: 'Phân loại nút',
  2: 'Phân loại đồ thị',
  3: 'Dự đoán liên kết',
  4: 'Phát hiện cộng đồng',
  5: 'Biểu diễn đồ thị',
  6: 'Sinh đồ thị',
}

const TASK_ICONS = {
  1: Network, 2: BarChart3, 3: Link2, 4: Users, 5: Globe2, 6: Dna,
}

export default function ProjectLibrary({ isOpen, onClose }) {
  const [experiments, setExperiments] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingId, setLoadingId] = useState(null)
  const [filterTask, setFilterTask] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [error, setError] = useState(null)

  const setTask = useGNNStore((s) => s.setTask)
  const setModel = useGNNStore((s) => s.setModel)
  const setGraphData = useGNNStore((s) => s.setGraphData)
  const setGroundTruth = useGNNStore((s) => s.setGroundTruth)
  const setTaskData = useGNNStore((s) => s.setTaskData)
  const setMockMode = useGNNStore((s) => s.setMockMode)
  const setHyperparams = useGNNStore((s) => s.setHyperparams)
  const loadSnapshots = usePlayerStore((s) => s.loadSnapshots)
  const setDone = usePlayerStore((s) => s.setDone)

  // Fetch experiments list
  const fetchExperiments = useCallback(async () => {
    setLoading(true)
    try {
      const url = filterTask
        ? `${API}/experiments?task_type=${filterTask}`
        : `${API}/experiments`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setExperiments(data)
        setError(null)
      } else {
        throw new Error(`Server returned ${res.status}`)
      }
    } catch (e) {
      console.error('Failed to fetch experiments:', e)
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filterTask])

  useEffect(() => {
    if (isOpen) fetchExperiments()
  }, [isOpen, fetchExperiments])

  // Listen for save events from TrainingControls
  useEffect(() => {
    const handler = () => {
      if (isOpen) fetchExperiments()
    }
    window.addEventListener('gnn:experiment-saved', handler)
    return () => window.removeEventListener('gnn:experiment-saved', handler)
  }, [isOpen, fetchExperiments])

  // Load a specific experiment for replay
  const handleLoadExperiment = async (expId) => {
    setLoadingId(expId)
    try {
      const res = await fetch(`${API}/experiments/${expId}`)
      if (!res.ok) throw new Error('Failed to load experiment')
      const exp = await res.json()

      // Restore task and model
      setTask(exp.task_type)
      // We need to wait a tick for task switch to take effect
      await new Promise(r => setTimeout(r, 50))
      
      // Restore model without clearing graph data — use store directly
      useGNNStore.setState({ selectedModel: exp.model_type })

      // Restore hyperparams
      if (exp.config_json) {
        setHyperparams({
          epochs: exp.epoch_count || exp.config_json.epochs || 100,
          lr: exp.learning_rate || exp.config_json.lr || 0.01,
          hidden: exp.hidden_dim || exp.config_json.hidden || 64,
          dropout: exp.dropout || exp.config_json.dropout || 0.5,
          dataset: exp.dataset_name || 'cora',
        })
      }

      // Restore graph data
      if (exp.graph_data_json) {
        setGraphData(exp.graph_data_json)
      }
      if (exp.ground_truth_json) {
        setGroundTruth(exp.ground_truth_json)
      }
      if (exp.task_data_json) {
        setTaskData(exp.task_data_json)
      }

      // Restore snapshots and enable replay
      if (exp.snapshots_json && exp.snapshots_json.length > 0) {
        loadSnapshots(exp.snapshots_json)
        setDone(exp.snapshots_json.length - 1)
      }

      // Mark as mock mode false (real data is loaded)
      setMockMode(false)

      onClose()
    } catch (e) {
      console.error('Failed to load experiment:', e)
      alert('Không thể tải lại thí nghiệm: ' + e.message)
    } finally {
      setLoadingId(null)
    }
  }

  // Delete experiment
  const handleDelete = async (expId) => {
    try {
      const res = await fetch(`${API}/experiments/${expId}`, { method: 'DELETE' })
      if (res.ok) {
        setExperiments(prev => prev.filter(e => e.id !== expId))
        setDeleteConfirm(null)
      }
    } catch (e) {
      console.error('Failed to delete:', e)
    }
  }

  // Delete all experiments
  const handleDeleteAll = async () => {
    if (!window.confirm("Bạn có chắc chắn muốn xoá toàn bộ thí nghiệm và file dữ liệu đi kèm trong thư viện?")) return;
    try {
      const res = await fetch(`${API}/experiments`, { method: 'DELETE' })
      if (res.ok) {
        setExperiments([])
        setDeleteConfirm(null)
      }
    } catch (e) {
      console.error('Failed to delete all:', e)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[90] bg-slate-950/88 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-full max-w-4xl max-h-[85vh] rounded-[24px] border border-slate-700/50 bg-[#071120] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/70 px-6 py-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-300/80 mb-1 flex items-center gap-1.5">
              <FolderOpen size={12} /> Thư viện huấn luyện
            </div>
            <h2 className="text-xl font-semibold text-white">
              Lịch sử thí nghiệm
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Bấm vào bất kỳ thí nghiệm nào để tải lại và phát lại quá trình huấn luyện.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-700/40 bg-slate-900/70 p-2.5 text-slate-300 hover:bg-slate-800/80 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Task Filter */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-800/50 overflow-x-auto">
          <button
            onClick={() => setFilterTask(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
              filterTask === null
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30'
                : 'bg-slate-800/60 text-slate-400 border border-slate-700/40 hover:border-slate-600'
            }`}
          >
            Tất cả
          </button>
          {[1, 2, 3, 4, 5, 6].map(t => {
            const TaskIcon = TASK_ICONS[t]
            return (
              <button
                key={t}
                onClick={() => setFilterTask(t)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  filterTask === t
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30'
                    : 'bg-slate-800/60 text-slate-400 border border-slate-700/40 hover:border-slate-600'
                }`}
              >
                <TaskIcon size={12} /> Task {t}
              </button>
            )
          })}
        </div>

        {/* Experiments List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-cyan-400/30" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 text-red-400">
              <AlertTriangle size={48} className="mb-4 opacity-50" />
              <p className="text-lg font-medium">Lỗi kết nối database</p>
              <p className="text-sm mt-1 opacity-70">{error}</p>
              <button 
                onClick={fetchExperiments}
                className="mt-6 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-bold hover:bg-red-500/20 transition-all"
              >
                Thử lại
              </button>
            </div>
          ) : experiments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <FolderOpen size={48} className="mb-4 opacity-30" />
              <p className="text-lg font-medium">Chưa có thí nghiệm nào</p>
              <p className="text-sm mt-1">Hãy huấn luyện mô hình và dữ liệu sẽ được tự động lưu tại đây.</p>
            </div>
          ) : (
            experiments.map(exp => {
              const TaskIcon = TASK_ICONS[exp.task_type] || Network
              return (
                <div
                  key={exp.id}
                  className="group relative flex items-center gap-4 rounded-2xl border border-slate-700/40 bg-slate-900/50 p-4 hover:border-cyan-500/30 hover:bg-slate-800/50 transition-all cursor-pointer"
                  onClick={() => handleLoadExperiment(exp.id)}
                >
                  {/* Task Icon */}
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-slate-800/80 flex items-center justify-center">
                    <TaskIcon size={22} className="text-slate-400" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-white truncate">
                        {TASK_NAMES[exp.task_type] || `Task ${exp.task_type}`}
                      </h3>
                      <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-medium">
                        {exp.model_type}
                      </span>
                      {exp.is_mock && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-medium">
                          Mock
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 text-[11px] text-slate-400">
                      <span>{exp.dataset_name}</span>
                      <span>{exp.epoch_count} epochs</span>
                      <span>{(exp.accuracy * 100).toFixed(1)}% acc</span>
                      <span>{exp.loss.toFixed(3)} loss</span>
                    </div>
                  </div>

                  {/* Date & Actions */}
                  <div className="flex-shrink-0 flex items-center gap-2">
                    <span className="text-[10px] text-slate-500">
                      {new Date(exp.created_at).toLocaleDateString('vi-VN', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>

                    {loadingId === exp.id ? (
                      <Loader2 size={20} className="animate-spin text-cyan-400" />
                    ) : (
                      <>
                        <button
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 transition-all"
                          onClick={(e) => { e.stopPropagation(); handleLoadExperiment(exp.id) }}
                          title="Tải lại"
                        >
                          <Play size={12} />
                        </button>
                        <button
                          className="p-1.5 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-all"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (deleteConfirm === exp.id) {
                              handleDelete(exp.id)
                            } else {
                              setDeleteConfirm(exp.id)
                              setTimeout(() => setDeleteConfirm(null), 3000)
                            }
                          }}
                          title={deleteConfirm === exp.id ? "Bấm lần nữa để xoá" : "Xoá"}
                        >
                          {deleteConfirm === exp.id ? <AlertTriangle size={12} /> : <Trash2 size={12} />}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer with count */}
        <div className="px-6 py-4 border-t border-slate-800/50 text-[11px] text-slate-500 flex justify-between items-center bg-slate-900/40">
          <span>{experiments.length} thí nghiệm đã lưu</span>
          <div className="flex items-center gap-4">
            {experiments.length > 0 && (
              <button
                onClick={handleDeleteAll}
                className="flex items-center gap-1 text-red-400 hover:text-red-300 transition-colors font-medium"
              >
                <Trash2 size={12} /> Xoá tất cả
              </button>
            )}
            <button
              onClick={fetchExperiments}
              className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 transition-colors font-medium"
            >
              <RefreshCw size={12} /> Làm mới
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
