import { describe, it, expect, beforeEach } from 'vitest'
import useConfigStore from './configStore'

describe('configStore', () => {
  beforeEach(() => {
    useConfigStore.setState({
      selectedTask: 1,
      selectedModel: 'GCN',
      mockMode: true,
      hyperparams: {
        epochs: 200,
        lr: 0.01,
        hidden: 64,
        dropout: 0.5,
        heads: 4,
        aggregator: 'mean'
      }
    })
  })

  it('should initialize with default config', () => {
    const state = useConfigStore.getState()
    expect(state.selectedTask).toBe(1)
    expect(state.selectedModel).toBe('GCN')
    expect(state.mockMode).toBe(true)
  })

  it('should update config properly', () => {
    useConfigStore.getState().setTask(2)
    useConfigStore.getState().setModel('GAT')
    const state = useConfigStore.getState()
    expect(state.selectedTask).toBe(2)
    expect(state.selectedModel).toBe('GAT')
  })

  it('should update hyperparams', () => {
    useConfigStore.getState().setHyperparams({ lr: 0.05, hidden: 128 })
    const state = useConfigStore.getState()
    expect(state.hyperparams.lr).toBe(0.05)
    expect(state.hyperparams.hidden).toBe(128)
    // Keep existing params intact
    expect(state.hyperparams.epochs).toBe(200)
    expect(state.hyperparams.dropout).toBe(0.5)
  })

  it('should build training config correctly', () => {
    useConfigStore.getState().setMockMode(false)
    useConfigStore.getState().setTask(3)
    const config = useConfigStore.getState().buildTrainingConfig()
    expect(config.task).toBe(3)
    expect(config.dataset).toBe('custom')
    expect(config.lr).toBe(0.01)
  })
})
