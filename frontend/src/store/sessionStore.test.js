import { describe, it, expect, beforeEach } from 'vitest'
import useSessionStore from './sessionStore'

describe('sessionStore', () => {
  beforeEach(() => {
    localStorage.removeItem('gnn_last_session')
    useSessionStore.setState({
      sessionId: null,
      status: 'idle',
      lastEpoch: -1,
      lastSeq: -1,
      wsUrl: null,
      error: null,
      experimentId: null,
      reportPath: null,
      replayPath: null,
    })
    global.fetch = undefined
  })

  it('should set session status properly', () => {
    useSessionStore.getState().setStatus('running')
    expect(useSessionStore.getState().status).toBe('running')
  })

  it('should track epoch progress', () => {
    useSessionStore.getState().onEpochReceived(10, 5)
    expect(useSessionStore.getState().lastEpoch).toBe(10)
    expect(useSessionStore.getState().lastSeq).toBe(5)
    expect(useSessionStore.getState().status).toBe('running')
  })

  it('should reset session', () => {
    useSessionStore.setState({ sessionId: 'sess-123', status: 'completed' })
    useSessionStore.getState().reset()
    expect(useSessionStore.getState().sessionId).toBeNull()
    expect(useSessionStore.getState().status).toBe('idle')
  })

  it('should persist recoverable session on disconnect while running', () => {
    useSessionStore.setState({
      sessionId: 'sess-123',
      status: 'running',
      lastEpoch: 7,
      lastSeq: 3,
    })

    useSessionStore.getState().onDisconnect()

    expect(useSessionStore.getState().status).toBe('disconnected')
    const saved = JSON.parse(localStorage.getItem('gnn_last_session'))
    expect(saved.sessionId).toBe('sess-123')
    expect(saved.lastEpoch).toBe(7)
    expect(saved.lastSeq).toBe(3)
  })

  it('should persist a recoverable session even before the first epoch arrives', () => {
    useSessionStore.setState({
      sessionId: 'sess-pending',
      status: 'pending',
      lastEpoch: -1,
      lastSeq: -1,
    })

    useSessionStore.getState().onDisconnect()

    expect(useSessionStore.getState().status).toBe('disconnected')
    const saved = JSON.parse(localStorage.getItem('gnn_last_session'))
    expect(saved.sessionId).toBe('sess-pending')
    expect(saved.lastEpoch).toBe(-1)
    expect(saved.lastSeq).toBe(-1)
  })

  it('should not downgrade completed session to stopped on disconnect', () => {
    useSessionStore.setState({
      sessionId: 'sess-complete',
      status: 'completed',
      lastEpoch: 12,
      lastSeq: 9,
    })

    useSessionStore.getState().onDisconnect()

    expect(useSessionStore.getState().status).toBe('completed')
    expect(localStorage.getItem('gnn_last_session')).toBeNull()
  })

  it('should store experiment/report pointers after finalize', () => {
    useSessionStore.getState().setSavedExperiment({
      id: 42,
      report_path: '/api/experiments/42/report',
      replay_path: '/api/experiments/42/replay?epoch=7',
    })

    expect(useSessionStore.getState().experimentId).toBe(42)
    expect(useSessionStore.getState().reportPath).toBe('/api/experiments/42/report')
    expect(useSessionStore.getState().replayPath).toBe('/api/experiments/42/replay?epoch=7')
  })

  it('should restore experiment/report pointers from resume payload', async () => {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        session_id: 'sess-restore',
        last_epoch: 4,
        last_seq: 12,
        status: 'completed',
        ws_url: '/ws/train',
        experiment_id: 99,
        report_path: '/api/experiments/99/report',
        replay_path: '/api/experiments/99/replay?epoch=4',
      }),
    })

    const payload = await useSessionStore.getState().resumeSession('sess-restore')

    expect(payload.experiment_id).toBe(99)
    expect(useSessionStore.getState().experimentId).toBe(99)
    expect(useSessionStore.getState().reportPath).toBe('/api/experiments/99/report')
    expect(useSessionStore.getState().replayPath).toBe('/api/experiments/99/replay?epoch=4')
  })
})
