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
  autoFollow: true, // When true, new snapshots auto-advance the view

  loadSnapshots: (snapshots) => {
    set((s) => ({
      snapshots,
      totalEpochs: snapshots.length,
      // Preserve current position if already viewing; jump to latest if at start
      currentEpoch: s.currentEpoch > 0 ? Math.min(s.currentEpoch, snapshots.length - 1) : snapshots.length - 1,
      currentEpochFloat: s.currentEpochFloat > 0 ? Math.min(s.currentEpochFloat, snapshots.length - 1) : snapshots.length - 1,
      trainingDone: snapshots.length > 0,
      isPlaying: false
    }))
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
      autoFollow: true,  // Must re-enable so addSnapshot auto-advances during new training
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

      const newLen = s.snapshots.length + 1
      const update = {
        snapshots: [...s.snapshots, snapshot],
        totalEpochs: newLen,
      }
      // Only auto-advance view if user hasn't manually scrubbed
      if (s.autoFollow) {
        update.currentEpoch = newLen - 1
        update.currentEpochFloat = newLen - 1
      }
      return update
    })
  },

  setDone: (bestEpoch, isHistory = false) => {
    set((s) => ({
      trainingDone: true,
      bestEpoch,
      autoFollow: false, // Stop auto-following after training completes
      reportVersion: isHistory ? s.reportVersion : s.reportVersion + 1
    }))
    // Stay at the current epoch — don't reset to 0
  },

  seekTo: (floatVal) => {
    const max = get().snapshots.length - 1
    const safeVal = Math.max(0, Math.min(max, floatVal))
    // If user scrubs to a position that isn't the latest, disable auto-follow
    const isAtEnd = safeVal >= max - 0.5
    set({ currentEpochFloat: safeVal, currentEpoch: Math.floor(safeVal), autoFollow: isAtEnd })
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
    set({ isPlaying: true, autoFollow: true, rafId: requestAnimationFrame(tick) })
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
