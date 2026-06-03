import { beforeEach, describe, expect, it } from 'vitest'
import usePlayerStore from './playerStore'

describe('playerStore best checkpoint focus', () => {
  beforeEach(() => {
    usePlayerStore.getState().resetForTraining()
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
