/**
 * GNN-Insight WebSocket Message Contract (JS mirror of backend schemas)
 * 
 * Single source-of-truth constants + message parser/validator.
 * Must be kept in sync with backend/schemas/constants.py + ws.py
 * 
 * @module contracts/wsMessages
 */

// ─── Schema Version ─────────────────────────────────────────────────────────
export const SCHEMA_VERSION = 3;

// ─── Task IDs ───────────────────────────────────────────────────────────────
export const TASK_IDS = Object.freeze({
  NODE_CLASSIFICATION: 1,
  GRAPH_CLASSIFICATION: 2,
  LINK_PREDICTION: 3,
  COMMUNITY_DETECTION: 4,
  GRAPH_EMBEDDING: 5,
  GRAPH_GENERATION: 6,
});

// ─── Message Types (Server → Client) ────────────────────────────────────────
export const MSG_TYPE_OUT = Object.freeze({
  SESSION_CREATED: 'session_created',
  GRAPH_DATA: 'graph_data',
  GRAPH_METADATA: 'graph_metadata',
  EPOCH_SNAPSHOT: 'epoch_snapshot',
  TRAINING_COMPLETE: 'training_complete',
  ERROR: 'error',
  PONG: 'pong',
});

// ─── Message Types (Client → Server) ────────────────────────────────────────
export const MSG_TYPE_IN = Object.freeze({
  START: 'start',
  PAUSE: 'pause',
  RESUME: 'resume',
  SEEK: 'seek',
  STOP: 'stop',
  PING: 'ping',
  ACK: 'ack',
});

// ─── Error Codes ────────────────────────────────────────────────────────────
export const ERROR_CODES = Object.freeze({
  ERR_INVALID_CONFIG: 'ERR_INVALID_CONFIG',
  ERR_TRAINING_FAILED: 'ERR_TRAINING_FAILED',
  ERR_SESSION_NOT_FOUND: 'ERR_SESSION_NOT_FOUND',
  ERR_DATA_LOAD_FAILED: 'ERR_DATA_LOAD_FAILED',
  ERR_MODEL_BUILD_FAILED: 'ERR_MODEL_BUILD_FAILED',
  ERR_INTERNAL: 'ERR_INTERNAL',
  ERR_AUTH_REQUIRED: 'ERR_AUTH_REQUIRED',
  ERR_AUTH_INVALID: 'ERR_AUTH_INVALID',
});

// ─── Valid outgoing message types set ────────────────────────────────────────
const VALID_OUT_TYPES = new Set(Object.values(MSG_TYPE_OUT));

// ─── Contract Drift Error ───────────────────────────────────────────────────
export class ContractDriftError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ContractDriftError';
    this.details = details;
  }
}

// ─── Required fields per snapshot task ───────────────────────────────────────
const SNAPSHOT_REQUIRED_FIELDS = {
  1: ['epoch', 'node_predictions', 'train_loss', 'val_acc', 'dirichlet_energy'],
  2: ['epoch', 'graph_predictions', 'train_loss', 'val_acc', 'node_contributions'],
  3: ['epoch', 'edge_scores', 'train_loss', 'auc'],
  4: ['epoch', 'node_predictions', 'modularity_q', 'train_loss'],
  5: ['epoch', 'embeddings_2d', 'knn_preservation', 'link_recon_auc', 'train_loss'],
  6: ['epoch', 'generated_graphs', 'validity_rate', 'train_loss'],
};

/**
 * Parse and validate an incoming WebSocket message.
 * 
 * Accepts BOTH legacy format (no envelope) and v3 envelope format.
 * For v3: validates v, type, ts, seq fields.
 * For legacy: wraps in a pseudo-envelope for backward compat.
 * 
 * @param {Object} raw - Parsed JSON object from WS message
 * @returns {Object} Validated message object with { v, type, ts, seq, payload, progress }
 * @throws {ContractDriftError} If message fails validation
 */
export function parseWSMessage(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new ContractDriftError('WS message must be an object', { raw });
  }

  // Check for v3 envelope format
  const isEnvelope = raw.v !== undefined && raw.v !== null;

  if (isEnvelope) {
    // ── v3 Envelope Format ──────────────────────────────────────────────
    if (typeof raw.v !== 'number') {
      throw new ContractDriftError('Envelope "v" must be a number', { v: raw.v });
    }

    if (raw.v !== SCHEMA_VERSION) {
      throw new ContractDriftError(
        `Schema version mismatch: expected ${SCHEMA_VERSION}, got ${raw.v}`,
        { expected: SCHEMA_VERSION, got: raw.v }
      );
    }

    if (!raw.type || typeof raw.type !== 'string') {
      throw new ContractDriftError('Envelope "type" is required', { raw });
    }

    if (!VALID_OUT_TYPES.has(raw.type)) {
      throw new ContractDriftError(`Unknown message type: "${raw.type}"`, {
        type: raw.type,
        validTypes: [...VALID_OUT_TYPES],
      });
    }

    if (typeof raw.seq !== 'number') {
      throw new ContractDriftError('Envelope "seq" must be a number', { seq: raw.seq });
    }

    return {
      v: raw.v,
      type: raw.type,
      ts: raw.ts || Date.now(),
      seq: raw.seq,
      payload: raw.payload || null,
      progress: raw.progress || null,
    };
  }

  // ── Legacy Format (backward compat) ─────────────────────────────────
  // Legacy messages have { type, data, progress } at top level
  if (!raw.type || typeof raw.type !== 'string') {
    throw new ContractDriftError('Message "type" is required', { raw });
  }

  // Wrap in pseudo-envelope
  return {
    v: 0, // Legacy marker
    type: raw.type,
    ts: Date.now(),
    seq: -1, // Unknown for legacy
    payload: raw.data || raw.payload || raw,
    progress: raw.progress || null,
  };
}

/**
 * Validate a snapshot payload against task-specific required fields.
 * 
 * @param {number} taskId - Task ID (1-6)
 * @param {Object} snapshot - Snapshot payload data
 * @returns {{ valid: boolean, missingFields: string[] }}
 */
export function validateSnapshot(taskId, snapshot) {
  const required = SNAPSHOT_REQUIRED_FIELDS[taskId];
  if (!required) {
    return { valid: false, missingFields: [`Unknown taskId: ${taskId}`] };
  }

  const missingFields = required.filter(field => !(field in snapshot));
  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Get the payload data from a WS message, handling both v3 and legacy formats.
 * 
 * @param {Object} msg - Parsed WS message (output of parseWSMessage)
 * @returns {Object} The payload/data object
 */
export function getPayload(msg) {
  // v3 envelope: payload is in msg.payload
  if (msg.v === SCHEMA_VERSION) {
    return msg.payload;
  }
  // Legacy: data was already extracted into payload by parseWSMessage
  return msg.payload;
}
