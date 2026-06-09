import { beforeEach, describe, expect, it } from 'vitest'
import usePlayerStore from './playerStore'

describe('playerStore best checkpoint focus', () => {
  beforeEach(() => {
    usePlayerStore.getState().resetForTraining()
  })

  it('keeps history loads at epoch 0 when the viewer is still at the start', () => {
    usePlayerStore.getState().loadSnapshots([{ epoch: 0 }, { epoch: 1 }, { epoch: 2 }])

    const state = usePlayerStore.getState()
    expect(state.currentEpoch).toBe(0)
    expect(state.currentEpochFloat).toBe(0)
    expect(state.trainingDone).toBe(true)
  })

  it('tracks configured epochs separately from snapshot frames', () => {
    usePlayerStore.getState().addSnapshot({ epoch: 0, epochs_target: 100 })
    usePlayerStore.getState().addSnapshot({ epoch: 5, epochs_target: 100 })

    const state = usePlayerStore.getState()
    expect(state.totalEpochs).toBe(2)
    expect(state.configuredEpochs).toBe(100)
  })

  it('keeps the report view on the best composite epoch after training completes', () => {
    for (let epoch = 0; epoch < 8; epoch += 1) {
      usePlayerStore.getState().addSnapshot({ epoch })
    }

    usePlayerStore.getState().seekTo(5)
    usePlayerStore.getState().setDone(5)

    const state = usePlayerStore.getState()
    expect(state.trainingDone).toBe(true)
    expect(state.bestEpoch).toBe(5)
    expect(state.currentEpoch).toBe(5)
    expect(state.currentEpochFloat).toBe(5)
    expect(state.autoFollow).toBe(false)
  })
})
