import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Play, Save, Square } from 'lucide-react'
import useAuthStore from '../store/authStore'
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
import { logger } from '../utils/logger'

const TASK_NAMES = {
  1: 'Node Classification',
  2: 'Graph Classification',
  3: 'Link Prediction',
  4: 'Community Detection',
  5: 'Graph Embedding',
  6: 'Graph Generation',
}

async function saveExperiment(taskType, modelType, hyperparams, snapshots, graphData, groundTruth, taskData, isMock, extra = {}) {
  try {
    const lastSnap = snapshots[snapshots.length - 1] || {}
    const payload = {
      title: `Task ${taskType} - ${modelType}`,
      task_type: taskType,
      model_type: modelType,
      dataset_name: extra.dataset_name || hyperparams.dataset || 'cora',
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

    const res = await fetch(apiUrl('/experiments'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      logger.error('Failed to save experiment', { status: res.status, body: await res.text() })
      return null
    }

    const data = await res.json()
    useSessionStore.getState().setSavedExperiment(data)
    logger.info('Experiment saved:', data)
    window.dispatchEvent(new Event('gnn:experiment-saved'))
    return data
  } catch (error) {
    logger.error('Error saving experiment', error)
    return null
  }
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
  const user = useAuthStore((s) => s.user)

  const loadSnapshots = usePlayerStore((s) => s.loadSnapshots)
  const setDone = usePlayerStore((s) => s.setDone)
  const resetForTraining = usePlayerStore((s) => s.resetForTraining)
  const trainingDone = usePlayerStore((s) => s.trainingDone)
  const reportVersion = usePlayerStore((s) => s.reportVersion)
  const isViewer = user?.role === 'viewer'

  const lastPreparedVersion = useRef(0)
  const [saveState, setSaveState] = useState('idle')

  useEffect(() => {
    if (!trainingDone) return
    if (reportVersion <= lastPreparedVersion.current) return
    const snapshots = usePlayerStore.getState().snapshots
    if (snapshots.length === 0) return

    lastPreparedVersion.current = reportVersion
    setSaveState('ready')
  }, [trainingDone, reportVersion])

  const handleSaveExperiment = useCallback(async () => {
    if (saveState === 'saving' || saveState === 'saved') {
      return
    }

    const snapshots = usePlayerStore.getState().snapshots
    if (snapshots.length === 0) {
      return
    }

    setSaveState('saving')
    const gnnState = useGNNStore.getState()
    const saved = await saveExperiment(
      gnnState.selectedTask,
      gnnState.selectedModel,
      gnnState.hyperparams,
      snapshots,
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
        dataset_name: gnnState.datasetName,
      },
    )

    setSaveState(saved ? 'saved' : 'ready')
  }, [saveState])

  const handleStart = useCallback(async () => {
    if (isTraining) {
      return
    }
    if (isViewer) {
      logger.warn('Viewer attempted to start training')
      return
    }

    resetForTraining()
    setReportOpen(false)
    setSaveState('idle')

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
      return
    }

    const gnnState = useGNNStore.getState()
    if (!gnnState.activeProjectId || !gnnState.activeDatasetVersionId) {
      alert('Please select a project and dataset version before starting live training.')
      return
    }

    const uploadedPath = gnnState.uploadedFilePath
    if (!uploadedPath) {
      alert('The selected dataset version has no processed training artifact yet. Upload or sync the dataset in Lab first.')
      return
    }

    let sessionId = useSessionStore.getState().sessionId
    try {
      const session = await createSession({
        project_id: gnnState.activeProjectId,
        dataset_version_id: gnnState.activeDatasetVersionId,
        task: selectedTask,
        model: gnnState.selectedModel,
        dataset: gnnState.datasetName || hyperparams.dataset || 'cora',
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
    } catch (error) {
      logger.error('Failed to create session before training', error)
      setTraining(false, 0)
      return
    }

    const taskConfig = gnnState.taskConfig || {}
    window.dispatchEvent(new CustomEvent('gnn:start-training', {
      detail: {
        task: selectedTask,
        model: gnnState.selectedModel,
        dataset: gnnState.datasetName || hyperparams.dataset || 'cora',
        epochs: hyperparams.epochs,
        lr: hyperparams.lr,
        hidden: hyperparams.hidden,
        dropout: hyperparams.dropout,
        heads: hyperparams.heads,
        aggregator: hyperparams.aggregator,
        project_id: gnnState.activeProjectId,
        dataset_version_id: gnnState.activeDatasetVersionId,
        session_id: sessionId,
        auth_token: useAuthStore.getState().token,
        uploaded_file_path: uploadedPath,
        ...taskConfig,
      },
    }))
    setTraining(true, 0)
  }, [
    createSession,
    hyperparams,
    isTraining,
    isViewer,
    loadSnapshots,
    mockMode,
    resetForTraining,
    selectedTask,
    setDone,
    setGraphData,
    setGroundTruth,
    setReportOpen,
    setSessionStatus,
    setTaskData,
    setTraining,
    setTrainMask,
  ])

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
      logger.error('Cannot stop live training without a session id')
      return
    }

    try {
      await fetch(apiUrl(`/sessions/${sessionId}/stop`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      })
    } catch (error) {
      logger.error('Failed to notify backend to stop', error)
    }
    setSessionStatus('stopped')
    setTraining(false, trainingProgress)
  }, [mockMode, setSessionStatus, setTraining, trainingProgress])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <button
          onClick={isTraining ? handleStop : handleStart}
          disabled={!isTraining && isViewer}
          className={`flex-1 rounded-xl px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-all shadow-lg flex items-center justify-center gap-2 ${
            isTraining
              ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
              : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400 shadow-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50'
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
        <button
          type="button"
          onClick={() => void handleSaveExperiment()}
          disabled={isTraining || !trainingDone || saveState === 'idle' || saveState === 'saving' || saveState === 'saved'}
          className={`ml-2 rounded-xl border px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-all shadow-lg flex items-center justify-center gap-2 ${
            saveState === 'ready'
              ? 'animate-pulse border-amber-400/40 bg-amber-400/15 text-amber-200 shadow-amber-500/20'
              : saveState === 'saved'
                ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                : 'border-slate-800 bg-slate-900/60 text-slate-500 disabled:cursor-not-allowed disabled:opacity-60'
          }`}
        >
          <Save size={12} />
          {saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved' : 'Save Experiment'}
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

      {!isTraining && trainingDone ? (
        <div className={`rounded-xl border px-3 py-2 text-[10px] font-semibold ${
          saveState === 'saved'
            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
            : 'border-amber-500/20 bg-amber-500/10 text-amber-200'
        }`}>
          {saveState === 'saved'
            ? 'This run has been saved to Experiment Hub.'
            : 'Training is complete. Save Experiment is now ready.'}
        </div>
      ) : null}
    </div>
  )
}
