import { create } from 'zustand'

const usePlayerStore = create((set, get) => ({
  snapshots: [],
  currentEpoch: 0,
  currentEpochFloat: 0,
  isPlaying: false,
  playbackSpeed: 1,
  rafId: null,
  totalEpochs: 0,
  trainingDone: false,
  bestEpoch: 0,
  reportVersion: 0,

  loadSnapshots: (snapshots) => {
    set({
      snapshots,
      totalEpochs: snapshots.length,
      currentEpoch: 0,
      currentEpochFloat: 0,
      trainingDone: snapshots.length > 0,
      isPlaying: false
    })
  },

  resetForTraining: () => {
    const { rafId } = get()
    if (rafId) cancelAnimationFrame(rafId)
    set({
      snapshots: [],
      currentEpoch: 0,
      currentEpochFloat: 0,
      isPlaying: false,
      rafId: null,
      totalEpochs: 0,
      trainingDone: false,
      bestEpoch: 0,
    })
  },

  addSnapshot: (snapshot) => {
    set((s) => {
      // Optimized check for duplicates (O(1) instead of O(N))
      // Since snapshots arrive via WebSocket in sequential order, 
      // we only need to compare with the most recent entry.
      const lastSnapshot = s.snapshots[s.snapshots.length - 1]
      if (lastSnapshot && lastSnapshot.epoch === snapshot.epoch) {
        return {}
      }
      
      return {
        snapshots: [...s.snapshots, snapshot],
        currentEpoch: s.snapshots.length,
        currentEpochFloat: s.snapshots.length,
        totalEpochs: s.snapshots.length + 1,
      }
    })
  },

  setDone: (bestEpoch, isHistory = false) => {
    set((s) => ({ 
      trainingDone: true, 
      bestEpoch, 
      reportVersion: isHistory ? s.reportVersion : s.reportVersion + 1 
    }))
    const { snapshots } = get()
    // Go back to the beginning after training is finished, so user can press play
    if (snapshots.length > 0) {
       get().seekTo(0)
    }
  },

  seekTo: (floatVal) => {
    const max = get().snapshots.length - 1
    const safeVal = Math.max(0, Math.min(max, floatVal))
    set({ currentEpochFloat: safeVal, currentEpoch: Math.floor(safeVal) })
  },

  play: () => {
    if (get().isPlaying) return
    const snaps = get().snapshots
    if (snaps.length < 2) return

    let lastTime = performance.now()
    const tick = (time) => {
      const state = get()
      if (!state.isPlaying) return

      const delta = time - lastTime
      lastTime = time

      const EPOCH_DURATION_MS = 1000 / state.playbackSpeed
      const epochDelta = delta / EPOCH_DURATION_MS

      let nextFloat = state.currentEpochFloat + epochDelta
      const maxFloat = state.snapshots.length - 1

      if (nextFloat >= maxFloat) {
        set({ 
          isPlaying: false, 
          currentEpochFloat: maxFloat, 
          currentEpoch: Math.floor(maxFloat) 
        })
        return
      }
      set({ 
        currentEpochFloat: nextFloat, 
        currentEpoch: Math.floor(nextFloat),
        rafId: requestAnimationFrame(tick)
      })
    }
    set({ isPlaying: true, rafId: requestAnimationFrame(tick) })
  },

  pause: () => {
    const { rafId } = get()
    if (rafId) cancelAnimationFrame(rafId)
    set({ isPlaying: false, rafId: null })
  },

  setSpeed: (speed) => set({ playbackSpeed: speed }),

  stepForward: () => {
    const { currentEpoch, snapshots } = get()
    if (currentEpoch < snapshots.length - 1) {
      get().seekTo(currentEpoch + 1)
    }
  },

  stepBack: () => {
    const { currentEpoch } = get()
    if (currentEpoch > 0) {
      get().seekTo(currentEpoch - 1)
    }
  },
}))

export default usePlayerStore
