/**
 * Session Store — manages training session lifecycle.
 * Enables resume-from-disconnect by tracking session_id + lastEpoch.
 */
import { create } from 'zustand';
import { apiUrl, getAuthHeaders } from '../utils/api';

const RECOVERY_KEY = 'gnn_last_session';

function isTerminalStatus(status) {
  return ['completed', 'failed', 'stopped', 'idle'].includes(status);
}

function clearRecoveryStorage() {
  try {
    localStorage.removeItem(RECOVERY_KEY);
  } catch {
    // ignore storage failures
  }
}

const useSessionStore = create((set, get) => ({
  sessionId: null,
  status: 'idle', // idle | pending | running | disconnected | completed | failed | stopped
  lastEpoch: -1,
  lastSeq: -1,
  wsUrl: null,
  error: null,
  experimentId: null,
  reportPath: null,
  replayPath: null,

  /**
   * Create a new session via REST, store session_id.
   */
  createSession: async (config) => {
    try {
      clearRecoveryStorage();
      const res = await fetch(apiUrl('/sessions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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
        experimentId: null,
        reportPath: null,
        replayPath: null,
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
  setStatus: (status) => {
    if (isTerminalStatus(status)) {
      clearRecoveryStorage();
    }
    set({ status });
  },

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
    const { sessionId, lastEpoch, lastSeq, status } = get();
    if (isTerminalStatus(status)) {
      return;
    }
    if (sessionId) {
      // Persist to localStorage for reconnect
      try {
        localStorage.setItem(RECOVERY_KEY, JSON.stringify({
          sessionId, lastEpoch, lastSeq,
          disconnectedAt: Date.now(),
        }));
      } catch { /* ignore */ }
    }
    set({ status: 'disconnected' });
  },

  /**
   * Resume from a previous session.
   */
  resumeSession: async (sessionId) => {
    try {
      const res = await fetch(apiUrl(`/sessions/${sessionId}/resume`), {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({
        sessionId: data.session_id,
        lastEpoch: data.last_epoch,
        lastSeq: data.last_seq,
        status: data.status,
        wsUrl: data.ws_url || '/ws/train',
        error: null,
        experimentId: data.experiment_id ?? null,
        reportPath: data.report_path ?? null,
        replayPath: data.replay_path ?? null,
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
      const raw = localStorage.getItem(RECOVERY_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      // Only recover if less than 30 minutes old
      if (Date.now() - data.disconnectedAt > 30 * 60 * 1000) {
        clearRecoveryStorage();
        return null;
      }
      return data;
    } catch {
      return null;
    }
  },

  clearRecoveredSession: () => clearRecoveryStorage(),

  setSavedExperiment: (payload) => {
    set({
      experimentId: payload?.id ?? null,
      reportPath: payload?.report_path ?? null,
      replayPath: payload?.replay_path ?? null,
    });
  },

  /**
   * Clear session state.
   */
  reset: () => {
    clearRecoveryStorage();
    set({
      sessionId: null, status: 'idle', lastEpoch: -1, lastSeq: -1,
      wsUrl: null, error: null,
      experimentId: null, reportPath: null, replayPath: null,
    });
  },
}));

export default useSessionStore;
