import { useRef, useCallback, useEffect } from 'react'
import useGNNStore from '../store/useGNNStore'
import usePlayerStore from '../store/playerStore'
import useSessionStore from '../store/sessionStore'
import { WS_URL } from '../utils/api'
import { logger } from '../utils/logger'
import { parseWSMessage, getPayload } from '../contracts/wsMessages'
import { getErrorMessage } from '../contracts/errorCodes'

export default function useWebSocket() {
  const wsRef       = useRef(null)
  const statusRef   = useRef('disconnected')
  const configRef   = useRef(null)
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 5
  const reconnectDelay = 2000 // 2 seconds

  const setTraining   = useGNNStore((s) => s.setTraining)
  const setGraphData  = useGNNStore((s) => s.setGraphData)
  const setGroundTruth = useGNNStore((s) => s.setGroundTruth)
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

  const connect = useCallback((config) => {
    // Store config for reconnection
    configRef.current = config
    reconnectAttemptsRef.current = 0

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
        addSnapshot(payload)
        setTraining(true, msg.progress)
        if (typeof payload?.epoch === 'number') {
          useSessionStore.getState().onEpochReceived(payload.epoch, msg.seq)
        }

      } else if (msg.type === 'training_complete') {
        // v3: payload = { all_snapshots, session_id }
        // legacy: top-level all_snapshots
        const allSnaps = payload?.all_snapshots || rawMsg.all_snapshots;
        if (allSnaps && allSnaps.length > 0) {
          loadSnapshots(allSnaps)
        }
        setTraining(false, 1)
        useSessionStore.getState().setStatus('completed')
        // Don't auto-seek to 0 - let user stay at the latest epoch they were watching
        if (allSnaps && allSnaps.length > 0) {
          setDone(allSnaps.length - 1)
        }

      } else if (msg.type === 'error') {
        // v3: structured error with code, message, retriable (no traceback)
        // legacy: raw message + traceback
        const errPayload = payload || {};
        const errMsg = errPayload.message || errPayload.code || 'Unknown error';
        const userMsg = errPayload.code 
          ? getErrorMessage(errPayload.code, errPayload.message)
          : errMsg;
        console.error('Training error:', userMsg);
        setTraining(false, 0)
        useSessionStore.getState().setStatus('failed')

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
      // Disable auto-reconnect for training tasks to avoid infinite crash loops.
      // If the backend fails, the user should be notified and choose to rerun manually.
      setTraining(false, 0)
      useSessionStore.getState().onDisconnect()
      
      if (event.code === 1006) {
        console.warn('WebSocket closed abnormally (1006). Potential backend crash or network issue.')
      }
    }
  }, [addSnapshot, loadSnapshots, setTraining, setGraphData, setGroundTruth, setTaskData, setTask5Meta, setDone, attemptReconnect])

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    statusRef.current = 'disconnected'
  }, [])

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
