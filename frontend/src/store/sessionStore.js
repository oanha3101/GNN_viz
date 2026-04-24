/**
 * Session Store — manages training session lifecycle.
 * Enables resume-from-disconnect by tracking session_id + lastEpoch.
 */
import { create } from 'zustand';
import { apiUrl } from '../utils/api';

const useSessionStore = create((set, get) => ({
  sessionId: null,
  status: 'idle', // idle | pending | running | completed | failed | stopped
  lastEpoch: -1,
  lastSeq: -1,
  wsUrl: null,
  error: null,

  /**
   * Create a new session via REST, store session_id.
   */
  createSession: async (config) => {
    try {
      const res = await fetch(apiUrl('/sessions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({
        sessionId: data.session_id,
        wsUrl: data.ws_url,
        status: 'pending',
        lastEpoch: -1,
        lastSeq: -1,
        error: null,
      });
      return data;
    } catch (err) {
      set({ error: err.message, status: 'failed' });
      throw err;
    }
  },

  /**
   * Update session status.
   */
  setStatus: (status) => set({ status }),

  /**
   * Track epoch progress from WS messages.
   */
  onEpochReceived: (epoch, seq) => {
    set({ lastEpoch: epoch, lastSeq: seq, status: 'running' });
  },

  /**
   * Handle WS disconnect — store resume info.
   */
  onDisconnect: () => {
    const { sessionId, lastEpoch, lastSeq } = get();
    if (sessionId && lastEpoch >= 0) {
      // Persist to localStorage for reconnect
      try {
        localStorage.setItem('gnn_last_session', JSON.stringify({
          sessionId, lastEpoch, lastSeq,
          disconnectedAt: Date.now(),
        }));
      } catch { /* ignore */ }
    }
    set({ status: 'stopped' });
  },

  /**
   * Resume from a previous session.
   */
  resumeSession: async (sessionId) => {
    try {
      const res = await fetch(apiUrl(`/sessions/${sessionId}/resume`));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({
        sessionId: data.session_id,
        lastEpoch: data.last_epoch,
        lastSeq: data.last_seq,
        status: data.status,
        error: null,
      });
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  /**
   * Try to recover last session from localStorage.
   */
  tryRecoverSession: () => {
    try {
      const raw = localStorage.getItem('gnn_last_session');
      if (!raw) return null;
      const data = JSON.parse(raw);
      // Only recover if less than 30 minutes old
      if (Date.now() - data.disconnectedAt > 30 * 60 * 1000) {
        localStorage.removeItem('gnn_last_session');
        return null;
      }
      return data;
    } catch {
      return null;
    }
  },

  /**
   * Clear session state.
   */
  reset: () => set({
    sessionId: null, status: 'idle', lastEpoch: -1, lastSeq: -1,
    wsUrl: null, error: null,
  }),
}));

export default useSessionStore;
