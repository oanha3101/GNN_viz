import { useRef, useCallback, useEffect } from 'react'
import useGNNStore from '../store/useGNNStore'
import usePlayerStore from '../store/playerStore'

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
      console.error('Max reconnection attempts reached')
      statusRef.current = 'disconnected'
      setTraining(false, 0)
      return
    }

    reconnectAttemptsRef.current += 1
    console.log(`Attempting to reconnect (${reconnectAttemptsRef.current}/${maxReconnectAttempts})...`)
    
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

    const wsUrl = 'ws://localhost:8000/ws/train'
    wsRef.current = new WebSocket(wsUrl)
    statusRef.current = 'connecting'

    wsRef.current.onopen = () => {
      statusRef.current = 'connected'
      wsRef.current.send(JSON.stringify(config))
    }

    wsRef.current.onmessage = (event) => {
      const msg = JSON.parse(event.data)

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
      // Auto-reconnect if connection was lost unexpectedly (code 1006 = abnormal closure)
      if (event.code === 1006 && configRef.current && reconnectAttemptsRef.current < maxReconnectAttempts) {
        attemptReconnect()
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
