import { useRef, useCallback, useEffect } from 'react'
import useGNNStore from '../store/useGNNStore'
import usePlayerStore from '../store/playerStore'
import useSessionStore from '../store/sessionStore'
import { WS_URL } from '../utils/api'
import { logger } from '../utils/logger'
import { parseWSMessage, getPayload, validateSnapshot } from '../contracts/wsMessages'
import { getErrorMessage } from '../contracts/errorCodes'

export default function useWebSocket() {
  const wsRef       = useRef(null)
  const statusRef   = useRef('disconnected')
  const configRef   = useRef(null)
  const expectedCloseRef = useRef(false)
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 5
  const reconnectDelay = 2000 // 2 seconds

  const setTraining   = useGNNStore((s) => s.setTraining)
  const setGraphData  = useGNNStore((s) => s.setGraphData)
  const setGroundTruth = useGNNStore((s) => s.setGroundTruth)
  const setTrainMask = useGNNStore((s) => s.setTrainMask)
  const setTaskData   = useGNNStore((s) => s.setTaskData)
  const setTask5Meta  = useGNNStore((s) => s.setTask5Meta)
  const setClassNames = useGNNStore((s) => s.setClassNames)

  const addSnapshot   = usePlayerStore((s) => s.addSnapshot)
  const loadSnapshots = usePlayerStore((s) => s.loadSnapshots)
  const setDone       = usePlayerStore((s) => s.setDone)

  const attemptReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached')
      statusRef.current = 'disconnected'
      setTraining(false, 0)
      return
    }

    reconnectAttemptsRef.current += 1
    logger.warn(`Attempting to reconnect (${reconnectAttemptsRef.current}/${maxReconnectAttempts})...`)

    setTimeout(() => {
      if (configRef.current) {
        connect(configRef.current)
      }
    }, reconnectDelay)
  }, [setTraining])

  const closeCurrentSocket = useCallback((code = 1000, reason = 'client_disconnect') => {
    const current = wsRef.current
    if (current) {
      expectedCloseRef.current = true
      current.close(code, reason)
      wsRef.current = null
    }
  }, [])

  const connect = useCallback((config) => {
    // Store config for reconnection
    configRef.current = config
    reconnectAttemptsRef.current = 0
    expectedCloseRef.current = false

    wsRef.current = new WebSocket(WS_URL)
    statusRef.current = 'connecting'

    wsRef.current.onopen = () => {
      statusRef.current = 'connected'
      wsRef.current.send(JSON.stringify(config))
    }

    wsRef.current.onmessage = async (event) => {
      let rawMsg;
      
      // Kiểm tra nếu dữ liệu là nhị phân (Blob) -> Cần giải nén GZIP
      if (event.data instanceof Blob) {
        try {
          const ds = new DecompressionStream('gzip');
          const decompressedStream = event.data.stream().pipeThrough(ds);
          const response = new Response(decompressedStream);
          const text = await response.text();
          rawMsg = JSON.parse(text);
        } catch (err) {
          console.error('WS Decompression Error:', err);
          return;
        }
      } else {
        // Dữ liệu text thông thường
        rawMsg = JSON.parse(event.data);
      }

      // ── Parse through contract validator ──────────────────────────────
      let msg;
      try {
        msg = parseWSMessage(rawMsg);
      } catch (driftErr) {
        // Contract drift detected — log but don't crash
        console.warn('[Contract Drift]', driftErr.message, driftErr.details);
        // Fallback: try to handle as legacy format
        msg = {
          v: 0,
          type: rawMsg.type || 'unknown',
          ts: Date.now(),
          seq: -1,
          payload: rawMsg.data || rawMsg,
          progress: rawMsg.progress || null,
        };
      }

      // ── Extract payload (handles both v3 envelope and legacy) ─────────
      const payload = getPayload(msg);

      if (msg.type === 'graph_data') {
        const d = payload;

        // Task 1 & 3: node-level graph structure
        if (d.graphData) {
          setGraphData(d.graphData)
        }
        // Task 1 & 3: ground truth node labels
        if (d.groundTruth) {
          setGroundTruth(d.groundTruth)
        }
        if (d.graphData) {
          setTrainMask(Array.isArray(d.trainMask) ? d.trainMask : null)
          setTaskData({
            trainMask: Array.isArray(d.trainMask) ? d.trainMask : null,
            valMask: Array.isArray(d.valMask) ? d.valMask : null,
            testMask: Array.isArray(d.testMask) ? d.testMask : null,
          })
        }
        if (d.classNames) {
          setClassNames(d.classNames)
        }
        // Task 2: synthetic graphs list
        if (d.graphs) {
          setTaskData({ graphs: d.graphs })
        }
        // Task 3: test edges for link prediction (merged with graphs if both present)
        if (d.testEdges && !d.graphs) {
          setTaskData({ testEdges: d.testEdges })
        }
        // Task 4: community ground truth & num communities
        if (d.communityGroundTruth) {
          useGNNStore.getState().setCommunityGroundTruth(d.communityGroundTruth)
        }
        if (d.numCommunities) {
          useGNNStore.getState().setNumCommunities(d.numCommunities)
        }
        // Task 6: reference graph
        if (d.referenceGraph) {
          useGNNStore.getState().setReferenceGraph(d.referenceGraph)
        }

      } else if (msg.type === 'graph_metadata') {
        // Task 5: auto-detected graph properties
        setTask5Meta(payload)

      } else if (msg.type === 'epoch_snapshot') {
        // Validate snapshot contract before adding
        const currentTask = useGNNStore.getState().selectedTask
        const validation = validateSnapshot(currentTask, payload)
        if (!validation.valid) {
          console.warn('[Snapshot Validation]', `Task ${currentTask} missing fields:`, validation.missingFields)
        }
        addSnapshot(payload)
        const progress = typeof msg.progress === 'number' ? msg.progress : null
        const reachedFinalEpoch = progress !== null && progress >= 1
        setTraining(!reachedFinalEpoch, progress)
        if (typeof payload?.epoch === 'number') {
          useSessionStore.getState().onEpochReceived(payload.epoch, msg.seq)
        }
        if (reachedFinalEpoch) {
          useSessionStore.getState().setStatus('completed')
          const finalSnapshots = usePlayerStore.getState().snapshots
          if (finalSnapshots.length > 0 && !usePlayerStore.getState().trainingDone) {
            setDone(finalSnapshots.length - 1)
          }
        }

      } else if (msg.type === 'training_complete') {
        // Snapshots were already streamed via epoch_snapshot messages during training.
        // DO NOT call loadSnapshots here — it resets currentEpochFloat to 0,
        // and setDone then locks autoFollow=false, leaving the view stuck at epoch 0.
        const existingSnaps = usePlayerStore.getState().snapshots
        setTraining(false, 1)
        useSessionStore.getState().setStatus('completed')
        if (existingSnaps.length > 0 && !usePlayerStore.getState().trainingDone) {
          setDone(existingSnaps.length - 1)
        }
        expectedCloseRef.current = true

      } else if (msg.type === 'error') {
        // v3: structured error with code, message, retriable (no traceback)
        // legacy: raw message + traceback
        const errPayload = payload || {};
        const errMsg = errPayload.message || errPayload.code || 'Unknown error';
        const translated = errPayload.code
          ? getErrorMessage(errPayload.code, errPayload.message)
          : errMsg
        const userMsg = errMsg && translated !== errMsg
          ? `${translated}\n\nChi tiết: ${errMsg}`
          : translated
        console.error('Training error:', userMsg);
        if (typeof window !== 'undefined' && userMsg) {
          window.alert(`Live training failed: ${userMsg}`)
        }
        setTraining(false, 0)
        useSessionStore.getState().setStatus('failed')
        expectedCloseRef.current = true

      } else if (msg.type === 'pong' || msg.type === 'ping' || msg.type === 'session_created') {
        // Protocol messages — handled in future phases
      }
    }

    wsRef.current.onerror = () => {
      statusRef.current = 'disconnected'
      setTraining(false, 0)
      useSessionStore.getState().setStatus('failed')
    }

    wsRef.current.onclose = (event) => {
      statusRef.current = 'disconnected'
      setTraining(false, 0)
      const sessionState = useSessionStore.getState()
      const sessionStatus = sessionState.status
      const wasExpected = expectedCloseRef.current || event.wasClean || [1000, 1008, 1011].includes(event.code)

      if (!['completed', 'failed', 'stopped', 'idle'].includes(sessionStatus)) {
        sessionState.onDisconnect()
      }

      if (event.code === 1006 && !wasExpected) {
        console.warn('WebSocket closed abnormally (1006). Potential backend crash or network issue.')
      } else if (!wasExpected && event.code !== 1005) {
        console.warn(`WebSocket closed unexpectedly (${event.code}).`, event.reason || 'No reason provided.')
      }
      expectedCloseRef.current = false
    }
  }, [addSnapshot, loadSnapshots, setTraining, setGraphData, setGroundTruth, setTrainMask, setTaskData, setTask5Meta, setDone, attemptReconnect])

  const disconnect = useCallback(() => {
    closeCurrentSocket()
    statusRef.current = 'disconnected'
  }, [closeCurrentSocket])

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  useEffect(() => {
    return () => disconnect()
  }, [disconnect])

  return { connect, disconnect, send, status: statusRef }
}
