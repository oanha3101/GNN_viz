import { useRef, useCallback, useEffect } from 'react'
import useGNNStore from '../store/useGNNStore'
import usePlayerStore from '../store/playerStore'
import { WS_URL } from '../utils/api'
import { logger } from '../utils/logger'

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
      let msg;
      
      // Kiểm tra nếu dữ liệu là nhị phân (Blob) -> Cần giải nén GZIP
      if (event.data instanceof Blob) {
        try {
          const ds = new DecompressionStream('gzip');
          const decompressedStream = event.data.stream().pipeThrough(ds);
          const response = new Response(decompressedStream);
          const text = await response.text();
          msg = JSON.parse(text);
        } catch (err) {
          console.error('WS Decompression Error:', err);
          return;
        }
      } else {
        // Dữ liệu text thông thường
        msg = JSON.parse(event.data);
      }

      if (msg.type === 'graph_data') {
        const d = msg.data

        // Task 1 & 3: node-level graph structure
        if (d.graphData) {
          setGraphData(d.graphData)
        }
        // Task 1 & 3: ground truth node labels
        if (d.groundTruth) {
          setGroundTruth(d.groundTruth)
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
        setTask5Meta(msg.data)

      } else if (msg.type === 'epoch_snapshot') {
        addSnapshot(msg.data)
        setTraining(true, msg.progress)

      } else if (msg.type === 'training_complete') {
        // Always load the complete snapshots from backend to ensure consistency
        // This prevents race conditions where late epoch_snapshots might arrive
        if (msg.all_snapshots && msg.all_snapshots.length > 0) {
          loadSnapshots(msg.all_snapshots)
        }
        setTraining(false, 1)
        // Don't auto-seek to 0 - let user stay at the latest epoch they were watching
        setDone(msg.all_snapshots.length - 1)

      } else if (msg.type === 'error') {
        console.error('Training error:', msg.message)
        console.error(msg.traceback)
        setTraining(false, 0)

      } else if (msg.type === 'ping') {
        // Keepalive, ignore
      }
    }

    wsRef.current.onerror = () => {
      statusRef.current = 'disconnected'
      setTraining(false, 0)
    }

    wsRef.current.onclose = (event) => {
      statusRef.current = 'disconnected'
      // Disable auto-reconnect for training tasks to avoid infinite crash loops.
      // If the backend fails, the user should be notified and choose to rerun manually.
      setTraining(false, 0)
      
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
