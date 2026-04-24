import { describe, it, expect, beforeEach } from 'vitest'
import useSessionStore from './sessionStore'

describe('sessionStore', () => {
  beforeEach(() => {
    useSessionStore.setState({
      sessionId: null,
      status: 'idle',
      lastEpoch: -1,
      lastSeq: -1,
      wsUrl: null,
      error: null
    })
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
})
