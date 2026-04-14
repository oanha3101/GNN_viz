import { useCallback } from 'react'
import useGNNStore from '../store/useGNNStore'
import usePlayerStore from '../store/playerStore'
import generateMockSnapshots, {
  generateTask1Mock,
  generateTask2Mock,
  generateTask3Mock,
  generateTask4Mock,
  generateTask5Mock,
  generateTask6Mock,
} from '../mock/generateMockSnapshots'

export default function TrainingControls() {
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

  const playerSnapshots = usePlayerStore((s) => s.snapshots)
  const loadSnapshots = usePlayerStore((s) => s.loadSnapshots)
  const setDone = usePlayerStore((s) => s.setDone)
  const resetForTraining = usePlayerStore((s) => s.resetForTraining)

  const handleStart = useCallback(() => {
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
            result = generateTask5Mock(30, hyperparams.epochs)
            setGraphData(result.graphData)
            setTaskData({ communities: result.communities })
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
      }, 300)
    } else {
      // Live mode: connect WebSocket and start real training
      const { connect } = useGNNStore.getState()._wsRef?.current
        ? { connect: null }
        : { connect: null }  // ws is managed in useWebSocket hook
      // Signal to App that training should start via websocket
      // The config is broadcast via a custom event picked up by TrainingConnector
      const config = {
        task: selectedTask,
        model: useGNNStore.getState().selectedModel,
        dataset: hyperparams.dataset || 'cora',
        epochs: hyperparams.epochs,
        lr: hyperparams.lr,
        hidden: hyperparams.hidden,
        dropout: hyperparams.dropout,
        heads: hyperparams.heads,
        aggregator: hyperparams.aggregator,
      }
      window.dispatchEvent(new CustomEvent('gnn:start-training', { detail: config }))
      setTraining(true, 0)
    }
  }, [mockMode, hyperparams, selectedTask, setTraining, setGraphData, setGroundTruth, setTrainMask, setTaskData, loadSnapshots, resetForTraining, setReportOpen])

  const handleStop = useCallback(() => {
    setTraining(false, trainingProgress)
  }, [setTraining, trainingProgress])

  const taskNames = {
    1: 'Node Classification',
    2: 'Graph Classification',
    3: 'Link Prediction',
    4: 'Community Detection',
    5: 'Graph Embedding',
    6: 'Graph Generation',
  }

  return (
    <div className="bg-slate-900/80 border-t border-slate-700/50 px-4 py-2">
      <div className="flex items-center gap-3">
        {!isTraining ? (
          <button
            onClick={handleStart}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold
                       bg-gradient-to-r from-emerald-500 to-green-600 text-white
                       hover:from-emerald-400 hover:to-green-500 transition-all
                       shadow-lg shadow-green-500/20 hover:shadow-green-500/30
                       active:scale-95"
          >
            ▶ Train {taskNames[selectedTask]}
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold
                       bg-red-500/80 text-white hover:bg-red-500 transition-all active:scale-95"
          >
            ■ Stop
          </button>
        )}

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Epochs: <span className="text-slate-200 font-medium">{hyperparams.epochs}</span></span>
          <span>LR: <span className="text-slate-200 font-medium">{hyperparams.lr}</span></span>
          <span>Hidden: <span className="text-slate-200 font-medium">{hyperparams.hidden}</span></span>
        </div>

        {isTraining && (
          <div className="flex-1 flex items-center gap-2">
            <div className="flex-1 bg-slate-700 rounded-full h-1.5">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${trainingProgress * 100}%` }}
              />
            </div>
            <span className="text-xs text-slate-400 whitespace-nowrap">
              {mockMode ? 'Generating...' : `${Math.round(trainingProgress * 100)}%`}
            </span>
          </div>
        )}

        {!isTraining && playerSnapshots.length > 0 && (
          <span className="text-xs text-green-400 font-medium">
            ✓ {playerSnapshots.length} epochs ready
          </span>
        )}
      </div>
    </div>
  )
}
