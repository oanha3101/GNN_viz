import { useCallback, useEffect, useRef } from 'react'
import { Play, Square, Loader2 } from 'lucide-react'
import useGNNStore from '../store/useGNNStore'
import usePlayerStore from '../store/playerStore'
import useSessionStore from '../store/sessionStore'
import {
  generateTask1Mock,
  generateTask2Mock,
  generateTask3Mock,
  generateTask4Mock,
  generateTask5Mock,
  generateTask6Mock,
} from '../mock/generateMockSnapshots'
import { apiUrl, getAuthHeaders } from '../utils/api'

const TASK_NAMES = {
  1: 'Phân loại nút',
  2: 'Phân loại đồ thị',
  3: 'Dự đoán liên kết',
  4: 'Phát hiện cộng đồng',
  5: 'Biểu diễn đồ thị',
  6: 'Sinh đồ thị',
}

/**
 * Save the completed training run to backend database.
 */
async function saveExperiment(taskType, modelType, hyperparams, snapshots, graphData, groundTruth, taskData, isMock, extra = {}) {
  try {
    const lastSnap = snapshots[snapshots.length - 1] || {}
    const payload = {
      title: `Task ${taskType} – ${modelType}`,
      task_type: taskType,
      model_type: modelType,
      dataset_name: hyperparams.dataset || 'cora',
      epoch_count: snapshots.length,
      learning_rate: hyperparams.lr || 0.01,
      hidden_dim: hyperparams.hidden || 64,
      dropout: hyperparams.dropout || 0.5,
      accuracy: lastSnap.val_acc ?? lastSnap.accuracy ?? lastSnap.validity_rate ?? 0,
      loss: lastSnap.train_loss ?? lastSnap.loss ?? lastSnap.recon_loss ?? 0,
      config_json: hyperparams,
      snapshots_json: snapshots,
      graph_data_json: graphData,
      ground_truth_json: groundTruth,
      task_data_json: taskData,
      is_mock: isMock,
      ...extra,
    }

    const res = await fetch(`${API}/experiments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      const data = await res.json()
      useSessionStore.getState().setSavedExperiment(data)
      console.log('Experiment saved:', data)
      // Notify Library to refresh
      window.dispatchEvent(new Event('gnn:experiment-saved'))
      return data
    } else {
      console.error('Failed to save experiment:', await res.text())
    }
  } catch (e) {
    console.error('Error saving experiment:', e)
  }
  return null
}

export default function TrainingControlsV2() {
  const isTraining = useGNNStore((s) => s.isTraining)
  const trainingProgress = useGNNStore((s) => s.trainingProgress)
  const mockMode = useGNNStore((s) => s.mockMode)
  const hyperparams = useGNNStore((s) => s.hyperparams)
  const selectedTask = useGNNStore((s) => s.selectedTask)
  const setTraining = useGNNStore((s) => s.setTraining)
  const setGraphData = useGNNStore((s) => s.setGraphData)
  const setGroundTruth = useGNNStore((s) => s.setGroundTruth)
  const setTrainMask = useGNNStore((s) => s.setTrainMask)
  const setTaskData = useGNNStore((s) => s.setTaskData)
  const setReportOpen = useGNNStore((s) => s.setReportOpen)
  const createSession = useSessionStore((s) => s.createSession)
  const setSessionStatus = useSessionStore((s) => s.setStatus)

  const playerSnapshots = usePlayerStore((s) => s.snapshots)
  const loadSnapshots = usePlayerStore((s) => s.loadSnapshots)
  const setDone = usePlayerStore((s) => s.setDone)
  const resetForTraining = usePlayerStore((s) => s.resetForTraining)
  const trainingDone = usePlayerStore((s) => s.trainingDone)
  const reportVersion = usePlayerStore((s) => s.reportVersion)

  // Track whether we've already saved for the current run
  const lastSavedVersion = useRef(0)

  // Auto-save when training completes
  useEffect(() => {
    if (!trainingDone) return
    if (reportVersion <= lastSavedVersion.current) return
    const snaps = usePlayerStore.getState().snapshots
    if (snaps.length === 0) return

    lastSavedVersion.current = reportVersion

    const gnnState = useGNNStore.getState()
    saveExperiment(
      gnnState.selectedTask,
      gnnState.selectedModel,
      gnnState.hyperparams,
      snaps,
      gnnState.graphData,
      gnnState.groundTruth,
      gnnState.taskData,
      gnnState.mockMode,
      {
        project_id: gnnState.activeProjectId,
        dataset_version_id: gnnState.activeDatasetVersionId,
        session_id: useSessionStore.getState().sessionId,
        upload_metadata: gnnState.uploadMetadata,
        uploaded_file_path: gnnState.uploadedFilePath,
      },
    )
  }, [trainingDone, reportVersion])

  const handleStart = useCallback(async () => {
    if (isTraining) {
      return
    }
    resetForTraining()
    setReportOpen(false)

    if (mockMode) {
      setTraining(true, 0)
      setTimeout(() => {
        let result
        switch (selectedTask) {
          case 1:
            result = generateTask1Mock(60, hyperparams.epochs)
            setGraphData(result.graphData)
            setGroundTruth(result.groundTruth)
            setTrainMask(result.trainMask)
            loadSnapshots(result.snapshots)
            break
          case 2:
            result = generateTask2Mock(50, hyperparams.epochs)
            setTaskData({ graphs: result.graphs })
            loadSnapshots(result.snapshots)
            break
          case 3:
            result = generateTask3Mock(40, hyperparams.epochs)
            setGraphData(result.graphData)
            setTaskData({ testEdges: result.testEdges })
            loadSnapshots(result.snapshots)
            break
          case 4:
            result = generateTask4Mock(4, 12, hyperparams.epochs)
            setGraphData(result.graphData)
            setTaskData({ communityGT: result.communityGT })
            setGroundTruth(result.communityGT)
            loadSnapshots(result.snapshots)
            break
          case 5:
            result = generateTask5Mock(40, hyperparams.epochs)
            setGraphData(result.graphData)
            setGroundTruth(result.groundTruth)
            useGNNStore.getState().setTask5Meta(result.graphMeta)
            loadSnapshots(result.snapshots)
            break
          case 6:
            result = generateTask6Mock(hyperparams.epochs)
            loadSnapshots(result.snapshots)
            break
          default:
            result = generateTask1Mock(60, hyperparams.epochs)
            setGraphData(result.graphData)
            setGroundTruth(result.groundTruth)
            setTrainMask(result.trainMask)
            loadSnapshots(result.snapshots)
        }
        setDone(result.snapshots.length - 1)
        setTraining(false, 1)
      }, 280)
    } else {
      // Upload file path if available
      const uploadedPath = useGNNStore.getState().uploadedFilePath
      if (!uploadedPath) {
        alert("⚠️ CHƯA CÓ DỮ LIỆU UPLOAD!\n\nVui lòng nhấn nút 'Upload Data' ở bảng điều khiển bên phải để tải dữ liệu của bạn lên trước khi chạy mô hình thực tế.")
        return
      }
      const gnnState = useGNNStore.getState()
      if (!gnnState.activeProjectId || !gnnState.activeDatasetVersionId) {
        alert("â ï¸ THIáº¾U PROJECT / DATASET VERSION!\n\nHÃ£y vá» Workspace Ä‘á»ƒ chá»n project vĂ  dataset version trÆ°á»›c khi cháº¡y huáº¥n luyá»‡n live.")
        return
      }
      let sessionId = useSessionStore.getState().sessionId
      try {
        const session = await createSession({
          project_id: gnnState.activeProjectId,
          dataset_version_id: gnnState.activeDatasetVersionId,
          task: selectedTask,
          model: gnnState.selectedModel,
          dataset: hyperparams.dataset || 'cora',
          epochs: hyperparams.epochs,
          lr: hyperparams.lr,
          hidden: hyperparams.hidden,
          config: {
            dropout: hyperparams.dropout,
            heads: hyperparams.heads,
            aggregator: hyperparams.aggregator,
          },
        })
        sessionId = session.session_id
        setSessionStatus('pending')
      } catch (e) {
        console.error('Failed to create session before training:', e)
      }
      const taskConfig = useGNNStore.getState().taskConfig || {}
      window.dispatchEvent(new CustomEvent('gnn:start-training', {
        detail: {
          task: selectedTask,
          model: gnnState.selectedModel,
          dataset: hyperparams.dataset || 'cora',
          epochs: hyperparams.epochs,
          lr: hyperparams.lr,
          hidden: hyperparams.hidden,
          dropout: hyperparams.dropout,
          heads: hyperparams.heads,
          aggregator: hyperparams.aggregator,
          project_id: gnnState.activeProjectId,
          dataset_version_id: gnnState.activeDatasetVersionId,
          session_id: sessionId,
          ...(uploadedPath ? { uploaded_file_path: uploadedPath } : {}),
          // Task-specific config from upload
          ...taskConfig,
        },
      }))
      setTraining(true, 0)
    }
  }, [hyperparams, isTraining, mockMode, selectedTask, setTraining, setGraphData, setGroundTruth, setTrainMask, setTaskData, loadSnapshots, setDone, resetForTraining, setReportOpen])

  useEffect(() => {
    const handler = () => {
      void handleStart()
    }
    window.addEventListener('gnn:request-start-training', handler)
    return () => window.removeEventListener('gnn:request-start-training', handler)
  }, [handleStart])

  const handleStop = useCallback(async () => {
    if (mockMode) {
      setSessionStatus('stopped')
      setTraining(false, trainingProgress)
      return
    }

    const sessionId = useSessionStore.getState().sessionId
    if (!sessionId) {
      console.error('Cannot stop live training without a session id')
      return
    }

    try {
      await fetch(apiUrl(`/sessions/${sessionId}/stop`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      })
    } catch (e) {
      console.error('Failed to notify backend to stop:', e)
    }
    setSessionStatus('stopped')
    setTraining(false, trainingProgress)
  }, [mockMode, setSessionStatus, setTraining, trainingProgress])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <button
          onClick={isTraining ? handleStop : handleStart}
          className={`flex-1 rounded-xl px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-all shadow-lg flex items-center justify-center gap-2 ${
            isTraining
              ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
              : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400 shadow-cyan-500/20'
          }`}
        >
          {isTraining ? (
            <>
              <Square size={12} /> Stop Training
            </>
          ) : (
            <>
              <Play size={12} /> Run {TASK_NAMES[selectedTask]}
            </>
          )}
        </button>
      </div>

      <div className="flex items-center gap-2">
        {isTraining ? (
          <div className="flex-1 flex flex-col gap-1">
             <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 transition-[width] duration-150"
                  style={{ width: `${trainingProgress * 100}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-tighter">
                <span className="text-slate-500 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Progress</span>
                <span className="text-cyan-400 font-mono">{Math.round(trainingProgress * 100)}%</span>
              </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-between px-3 py-1.5 rounded-lg border border-slate-800/60 bg-slate-900/30">
            <div className="flex flex-col">
              <span className="text-[8px] uppercase text-slate-500 font-bold">Epochs</span>
              <span className="text-[10px] font-mono text-slate-300">{hyperparams.epochs}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] uppercase text-slate-500 font-bold">LR</span>
              <span className="text-[10px] font-mono text-slate-300">{hyperparams.lr}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] uppercase text-slate-500 font-bold">Hidden</span>
              <span className="text-[10px] font-mono text-slate-300">{hyperparams.hidden}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
