import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Loader2, RotateCcw, Save, Square } from 'lucide-react'
import useGNNStore from '../store/useGNNStore'
import usePlayerStore from '../store/playerStore'
import useSessionStore from '../store/sessionStore'
import useAuthStore from '../store/authStore'
import { useLanguage } from '../contexts/LanguageContext'
import {
  generateTask1Mock,
  generateTask2Mock,
  generateTask3Mock,
  generateTask4Mock,
  generateTask5Mock,
  generateTask6Mock,
} from '../mock/generateMockSnapshots'
import { apiUrl, AUTH_TOKEN_KEY, getAuthHeaders } from '../utils/api'
import { buildTaskTrainingDefaults } from '../utils/taskTrainingDefaults'

const TASK_PROFILE_LABELS = {
  1: 'Node Classification',
  2: 'Graph Classification',
  3: 'Link Prediction',
  4: 'Community Detection',
  5: 'Graph Embedding',
  6: 'Graph Generation',
}

const TASK_NAMES = {
  1: 'Phân loại nút',
  2: 'Phân loại đồ thị',
  3: 'Dự đoán liên kết',
  4: 'Phát hiện cộng đồng',
  5: 'Biểu diễn đồ thị',
  6: 'Sinh đồ thị',
}

function getMockFrameInterval(snapshotCount) {
  if (!snapshotCount) return 70
  return Math.max(8, Math.min(70, Math.round(4500 / snapshotCount)))
}

function getDatasetTaskIssue(gnnState, selectedTask) {
  const meta = gnnState.uploadMetadata || {}
  if (!gnnState.uploadedFilePath || !gnnState.uploadMetadata) return null

  const numClasses = Number(meta.num_classes ?? 0)
  const numGraphs = Number(meta.num_graphs ?? 0)

  if (selectedTask === 1) {
    if (numGraphs > 1) {
      return 'Dataset version nay chua nhieu graph. Bai toan phu hop hon la Task 2 - Graph Classification, khong phai Node Classification.'
    }
    if (numClasses < 2) {
      return 'Dataset version nay khong co node labels hop le cho Task 1, hoac chi co mot lop duy nhat. Chay Node Classification se cho ra visualization vo nghia.'
    }
  }

  if (selectedTask === 2) {
    if (numGraphs > 0 && numGraphs < 2) {
      return 'Task 2 can mot tap nhieu graph, trong khi dataset version nay giong mot graph don le.'
    }
    if (numClasses < 2) {
      return 'Dataset version nay khong co graph labels hop le cho Task 2, nen khong the train va visualize Graph Classification dung cach.'
    }
  }

  return null
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
      task_data_json: {
        ...(taskData || {}),
        ...(Array.isArray(extra.trainMask) ? { trainMask: extra.trainMask } : {}),
      },
      is_mock: isMock,
      ...extra,
    }

    const res = await fetch(apiUrl('/experiments'), {
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
  const { t } = useLanguage()
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
  const currentUser = useAuthStore((s) => s.user)

  const addSnapshot = usePlayerStore((s) => s.addSnapshot)
  const setDone = usePlayerStore((s) => s.setDone)
  const resetForTraining = usePlayerStore((s) => s.resetForTraining)
  const trainingDone = usePlayerStore((s) => s.trainingDone)
  const reportVersion = usePlayerStore((s) => s.reportVersion)
  const isViewer = currentUser?.role === 'viewer'

  // Track the save state
  const lastPreparedVersion = useRef(0)
  const mockTimerRef = useRef(null)
  const [saveState, setSaveState] = useState('idle')

  const clearMockTimer = useCallback(() => {
    if (mockTimerRef.current) {
      clearInterval(mockTimerRef.current)
      mockTimerRef.current = null
    }
  }, [])

  // Prepare for saving when training completes
  useEffect(() => {
    if (!trainingDone) return
    if (reportVersion <= lastPreparedVersion.current) return
    const snaps = usePlayerStore.getState().snapshots
    if (snaps.length === 0) return

    lastPreparedVersion.current = reportVersion
    setSaveState('ready')
  }, [trainingDone, reportVersion])

  const handleSaveExperiment = useCallback(async () => {
    if (saveState === 'saving' || saveState === 'saved') return

    const snaps = usePlayerStore.getState().snapshots
    if (snaps.length === 0) return

    setSaveState('saving')
    const gnnState = useGNNStore.getState()
    const saved = await saveExperiment(
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
        trainMask: gnnState.trainMask,
      },
    )
    setSaveState(saved ? 'saved' : 'ready')
  }, [saveState])

  const handleStart = useCallback(async () => {
    if (isTraining) {
      return
    }
    if (isViewer) {
      return
    }

    const prepareNewRun = () => {
      clearMockTimer()
      resetForTraining()
      setReportOpen(false)
      setSaveState('idle')
    }

    if (mockMode) {
      prepareNewRun()
      setTraining(true, 0)
        let result
        switch (selectedTask) {
        case 1:
          result = generateTask1Mock(60, hyperparams.epochs, useGNNStore.getState().selectedModel)
          setGraphData(result.graphData)
          setGroundTruth(result.groundTruth)
          setTrainMask(result.trainMask)
          break
        case 2:
          result = generateTask2Mock(50, hyperparams.epochs)
          setTaskData({ graphs: result.graphs })
          break
        case 3:
          result = generateTask3Mock(40, hyperparams.epochs, useGNNStore.getState().selectedModel)
          setGraphData(result.graphData)
          setTaskData({ testEdges: result.testEdges })
          break
        case 4:
          result = generateTask4Mock(4, 12, hyperparams.epochs, useGNNStore.getState().selectedModel)
          setGraphData(result.graphData)
          setTaskData({ communityGT: result.communityGT })
          setGroundTruth(result.communityGT)
          break
        case 5:
          result = generateTask5Mock(40, hyperparams.epochs)
          setGraphData(result.graphData)
          setGroundTruth(result.groundTruth)
          useGNNStore.getState().setTask5Meta(result.graphMeta)
          break
        case 6:
          result = generateTask6Mock(hyperparams.epochs)
          break
        default:
          result = generateTask1Mock(60, hyperparams.epochs, useGNNStore.getState().selectedModel)
          setGraphData(result.graphData)
          setGroundTruth(result.groundTruth)
          setTrainMask(result.trainMask)
      }

      const snapshots = result.snapshots || []
      if (snapshots.length === 0) {
        setDone(0)
        setTraining(false, 1)
        return
      }

      let index = 0
      const intervalMs = getMockFrameInterval(snapshots.length)
      mockTimerRef.current = setInterval(() => {
        const stillTraining = useGNNStore.getState().isTraining
        if (!stillTraining) {
          clearMockTimer()
          return
        }

        const snapshot = snapshots[index]
        if (snapshot) {
          addSnapshot(snapshot)
        }

        const progress = Math.min(1, (index + 1) / snapshots.length)
        setTraining(true, progress)
        index += 1

        if (index >= snapshots.length) {
          clearMockTimer()
          const bestSnapshot = snapshots.reduce((winner, snap) => {
            const winnerScore = Number(winner?.best_selection_score ?? winner?.val_acc ?? 0)
            const snapScore = Number(snap?.best_selection_score ?? snap?.val_acc ?? 0)
            return snapScore >= winnerScore ? snap : winner
          }, snapshots[0])
          setDone(Number.isFinite(bestSnapshot?.best_epoch) ? bestSnapshot.best_epoch : (bestSnapshot?.epoch ?? snapshots.length - 1))
          setTraining(false, 1)
        }
      }, intervalMs)
    } else {
      const gnnState = useGNNStore.getState()
      if (!gnnState.activeProjectId || !gnnState.activeDatasetVersionId) {
        alert(t('lab.alert_missing_project'))
        return
      }
      const uploadProfileTaskId = gnnState.uploadMetadata?.task_profile_id || null
      if (uploadProfileTaskId && uploadProfileTaskId !== selectedTask) {
        const profileName = gnnState.uploadMetadata?.task_profile_name
          || TASK_PROFILE_LABELS[uploadProfileTaskId]
          || `Task ${uploadProfileTaskId}`
        const selectedTaskName = TASK_PROFILE_LABELS[selectedTask] || `Task ${selectedTask}`
        alert(t('lab.alert_task_mismatch', { profile: profileName, task: selectedTaskName }))
        return
      }
      const uploadedPath = gnnState.uploadedFilePath
      if (!uploadedPath) {
        alert(t('lab.alert_dataset_not_ready'))
        return
      }
      const datasetTaskIssue = getDatasetTaskIssue(gnnState, selectedTask)
      if (datasetTaskIssue) {
        alert(t('lab.alert_dataset_task_issue', { issue: datasetTaskIssue }))
        return
      }
      const taskTrainingDefaults = buildTaskTrainingDefaults(selectedTask, gnnState.selectedModel)
      let sessionId = useSessionStore.getState().sessionId
      try {
        const session = await createSession({
          project_id: gnnState.activeProjectId,
          dataset_version_id: gnnState.activeDatasetVersionId,
          task: selectedTask,
          model: gnnState.selectedModel,
          dataset: hyperparams.dataset || 'cora',
          epochs: hyperparams.epochs,
          lr: taskTrainingDefaults.lr ?? hyperparams.lr,
          hidden: taskTrainingDefaults.hidden ?? hyperparams.hidden,
          config: {
            dropout: taskTrainingDefaults.dropout ?? hyperparams.dropout,
            heads: taskTrainingDefaults.heads ?? hyperparams.heads,
            aggregator: hyperparams.aggregator,
            ...taskTrainingDefaults,
          },
        })
        sessionId = session.session_id
        setSessionStatus('pending')
      } catch (e) {
        console.error('Failed to create session before training:', e)
        alert(t('lab.alert_session_failed', { message: e.message }))
        setTraining(false, 0)
        return
      }
      prepareNewRun()
      const taskConfig = uploadProfileTaskId && uploadProfileTaskId !== selectedTask
        ? {}
        : (useGNNStore.getState().taskConfig || {})
      const authToken = typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function'
        ? localStorage.getItem(AUTH_TOKEN_KEY)
        : null
      window.dispatchEvent(new CustomEvent('gnn:start-training', {
        detail: {
          task: selectedTask,
          model: gnnState.selectedModel,
          dataset: hyperparams.dataset || 'cora',
          epochs: hyperparams.epochs,
          lr: taskTrainingDefaults.lr ?? hyperparams.lr,
          hidden: taskTrainingDefaults.hidden ?? hyperparams.hidden,
          dropout: taskTrainingDefaults.dropout ?? hyperparams.dropout,
          heads: taskTrainingDefaults.heads ?? hyperparams.heads,
          aggregator: hyperparams.aggregator,
          ...taskTrainingDefaults,
          project_id: gnnState.activeProjectId,
          dataset_version_id: gnnState.activeDatasetVersionId,
          session_id: sessionId,
          ...(authToken ? { auth_token: authToken } : {}),
          ...(uploadedPath ? { uploaded_file_path: uploadedPath } : {}),
          // Task-specific config from upload
          ...taskConfig,
        },
      }))
      setTraining(true, 0)
    }
  }, [addSnapshot, clearMockTimer, hyperparams, isTraining, isViewer, mockMode, selectedTask, setTraining, setGraphData, setGroundTruth, setTrainMask, setTaskData, setDone, resetForTraining, setReportOpen, createSession, setSessionStatus, t])

  useEffect(() => {
    const handler = () => {
      void handleStart()
    }
    window.addEventListener('gnn:request-start-training', handler)
    return () => window.removeEventListener('gnn:request-start-training', handler)
  }, [handleStart])

  const handleStop = useCallback(async () => {
    if (mockMode) {
      clearMockTimer()
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
  }, [clearMockTimer, mockMode, setSessionStatus, setTraining, trainingProgress])

  useEffect(() => clearMockTimer, [clearMockTimer])

  return (
    <div className="flex flex-col items-end gap-1.5">
      {isTraining ? (
        <div className="flex w-full flex-col gap-1">
          <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider">
            <span className="text-twilight flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" /> {t('lab.controls_training')}
            </span>
            <span className="font-mono text-amethyst">{Math.round(trainingProgress * 100)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full border border-white/5 bg-black/40">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amethyst via-indigo-500 to-aurora-blue transition-[width] duration-150"
              style={{ width: `${trainingProgress * 100}%` }}
            />
          </div>
          <button
            type="button"
            onClick={handleStop}
            className="self-end inline-flex items-center gap-1 rounded-md border border-aurora-rose/30 bg-aurora-rose/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-aurora-rose transition-colors hover:bg-aurora-rose/20"
          >
            <Square size={10} /> {t('lab.controls_stop')}
          </button>
        </div>
      ) : trainingDone ? (
        <div className="flex flex-col items-end gap-1">
          <div className="flex flex-wrap justify-end gap-1">
            <button
              type="button"
              onClick={handleStart}
              disabled={isViewer}
              data-testid="footer-run-again"
              className="inline-flex items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-300 transition-all hover:bg-cyan-400/20 disabled:opacity-50"
              title={t('lab.controls_run_again_hint')}
            >
              <RotateCcw size={11} /> {t('lab.controls_run_again')}
            </button>
            <button
              type="button"
              onClick={handleSaveExperiment}
              disabled={saveState === 'idle' || saveState === 'saving' || saveState === 'saved'}
              data-testid="footer-save-experiment"
              className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all ${
                saveState === 'ready'
                  ? 'animate-pulse border-aurora-amber/40 bg-aurora-amber/15 text-aurora-amber shadow-[0_0_12px_rgba(245,158,11,0.18)] hover:bg-aurora-amber/25'
                  : saveState === 'saving'
                    ? 'border-aurora-amber/30 bg-aurora-amber/10 text-aurora-amber'
                    : saveState === 'saved'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : 'border-white/10 bg-white/5 text-twilight disabled:opacity-50'
              }`}
            >
              {saveState === 'saving'
                ? <Loader2 size={11} className="animate-spin" />
                : saveState === 'saved'
                  ? <CheckCircle2 size={11} />
                  : <Save size={11} />}
              {saveState === 'saving' ? t('lab.controls_saving') : saveState === 'saved' ? t('lab.controls_saved') : t('lab.controls_save_experiment')}
            </button>
          </div>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
            saveState === 'saved'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-aurora-amber/30 bg-aurora-amber/10 text-aurora-amber'
          }`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {saveState === 'saved' ? t('lab.controls_saved_to_hub') : t('lab.controls_ready_to_save')}
          </span>
        </div>
      ) : (
        <div className="flex flex-col items-end gap-0.5 text-right">
          <span className="text-[10px] font-bold uppercase tracking-wider text-twilight/70">{t('lab.controls_ready')}</span>
          <span className="text-[9px] uppercase tracking-wider text-twilight/50">
            {t('lab.controls_press_space')} <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[8px] text-starlight">Space</kbd> {t('lab.controls_or_button')} <span className="inline-block h-2 w-2 -mb-0.5 rounded-full bg-rose-500" /> {t('lab.controls_to_run')}
          </span>
        </div>
      )}
    </div>
  )
}
