/**
 * TDD RED: Tests for WS message contract parser/validator.
 * 
 * Tests cross-validate against sample JSON fixtures that mirror
 * what the backend actually emits.
 */
import { describe, it, expect } from 'vitest';
import {
  SCHEMA_VERSION,
  TASK_IDS,
  MSG_TYPE_OUT,
  MSG_TYPE_IN,
  ERROR_CODES,
  ContractDriftError,
  parseWSMessage,
  validateSnapshot,
  getPayload,
} from './wsMessages';

// ─── Test: Constants Mirror Backend ─────────────────────────────────────────

describe('Constants', () => {
  it('SCHEMA_VERSION should be 3', () => {
    expect(SCHEMA_VERSION).toBe(3);
  });

  it('TASK_IDS should have all 6 tasks', () => {
    expect(Object.keys(TASK_IDS)).toHaveLength(6);
    expect(TASK_IDS.NODE_CLASSIFICATION).toBe(1);
    expect(TASK_IDS.GRAPH_GENERATION).toBe(6);
  });

  it('MSG_TYPE_OUT should include all server message types', () => {
    expect(MSG_TYPE_OUT.EPOCH_SNAPSHOT).toBe('epoch_snapshot');
    expect(MSG_TYPE_OUT.GRAPH_DATA).toBe('graph_data');
    expect(MSG_TYPE_OUT.GRAPH_METADATA).toBe('graph_metadata');
    expect(MSG_TYPE_OUT.TRAINING_COMPLETE).toBe('training_complete');
    expect(MSG_TYPE_OUT.ERROR).toBe('error');
    expect(MSG_TYPE_OUT.PONG).toBe('pong');
    expect(MSG_TYPE_OUT.SESSION_CREATED).toBe('session_created');
  });

  it('MSG_TYPE_IN should include all client message types', () => {
    expect(MSG_TYPE_IN.START).toBe('start');
    expect(MSG_TYPE_IN.STOP).toBe('stop');
    expect(MSG_TYPE_IN.PING).toBe('ping');
    expect(MSG_TYPE_IN.ACK).toBe('ack');
    expect(MSG_TYPE_IN.PAUSE).toBe('pause');
    expect(MSG_TYPE_IN.RESUME).toBe('resume');
    expect(MSG_TYPE_IN.SEEK).toBe('seek');
  });

  it('ERROR_CODES should match backend constants', () => {
    expect(ERROR_CODES.ERR_INVALID_CONFIG).toBe('ERR_INVALID_CONFIG');
    expect(ERROR_CODES.ERR_INTERNAL).toBe('ERR_INTERNAL');
    expect(ERROR_CODES.ERR_AUTH_REQUIRED).toBe('ERR_AUTH_REQUIRED');
  });
});

// ─── Test: parseWSMessage — v3 Envelope ─────────────────────────────────────

describe('parseWSMessage (v3 envelope)', () => {
  it('parses a valid v3 envelope', () => {
    const raw = {
      v: 3,
      type: 'epoch_snapshot',
      ts: 1713880000000,
      seq: 5,
      payload: { epoch: 5, train_loss: 0.3 },
      progress: 0.5,
    };
    const msg = parseWSMessage(raw);
    expect(msg.v).toBe(3);
    expect(msg.type).toBe('epoch_snapshot');
    expect(msg.seq).toBe(5);
    expect(msg.payload.epoch).toBe(5);
    expect(msg.progress).toBe(0.5);
  });

  it('throws ContractDriftError on version mismatch', () => {
    const raw = { v: 2, type: 'epoch_snapshot', seq: 0 };
    expect(() => parseWSMessage(raw)).toThrow(ContractDriftError);
    expect(() => parseWSMessage(raw)).toThrow(/Schema version mismatch/);
  });

  it('throws ContractDriftError on unknown message type', () => {
    const raw = { v: 3, type: 'unknown_type', seq: 0 };
    expect(() => parseWSMessage(raw)).toThrow(ContractDriftError);
    expect(() => parseWSMessage(raw)).toThrow(/Unknown message type/);
  });

  it('throws ContractDriftError on missing type', () => {
    const raw = { v: 3, seq: 0 };
    expect(() => parseWSMessage(raw)).toThrow(ContractDriftError);
  });

  it('throws ContractDriftError on non-numeric seq', () => {
    const raw = { v: 3, type: 'graph_data', seq: 'abc' };
    expect(() => parseWSMessage(raw)).toThrow(ContractDriftError);
  });

  it('throws ContractDriftError on null input', () => {
    expect(() => parseWSMessage(null)).toThrow(ContractDriftError);
  });

  it('throws ContractDriftError on non-object input', () => {
    expect(() => parseWSMessage('string')).toThrow(ContractDriftError);
  });

  it('fills missing ts with current time', () => {
    const raw = { v: 3, type: 'pong', seq: 0 };
    const msg = parseWSMessage(raw);
    expect(msg.ts).toBeGreaterThan(0);
  });
});

// ─── Test: parseWSMessage — Legacy Format ───────────────────────────────────

describe('parseWSMessage (legacy format)', () => {
  it('wraps legacy message in pseudo-envelope', () => {
    const raw = {
      type: 'epoch_snapshot',
      data: { epoch: 10, train_loss: 0.5 },
      progress: 0.8,
    };
    const msg = parseWSMessage(raw);
    expect(msg.v).toBe(0); // Legacy marker
    expect(msg.type).toBe('epoch_snapshot');
    expect(msg.seq).toBe(-1); // Unknown
    expect(msg.payload.epoch).toBe(10);
    expect(msg.progress).toBe(0.8);
  });

  it('throws on legacy message without type', () => {
    const raw = { data: { epoch: 0 } };
    expect(() => parseWSMessage(raw)).toThrow(ContractDriftError);
  });
});

// ─── Test: validateSnapshot ─────────────────────────────────────────────────

describe('validateSnapshot', () => {
  it('validates Task 1 snapshot with all required fields', () => {
    const snap = {
      epoch: 0,
      node_predictions: [0, 1],
      train_loss: 0.5,
      val_acc: 0.7,
      dirichlet_energy: 1.2,
    };
    const { valid, missingFields } = validateSnapshot(1, snap);
    expect(valid).toBe(true);
    expect(missingFields).toHaveLength(0);
  });

  it('detects missing fields in Task 1 snapshot', () => {
    const snap = { epoch: 0, node_predictions: [0] };
    const { valid, missingFields } = validateSnapshot(1, snap);
    expect(valid).toBe(false);
    expect(missingFields).toContain('dirichlet_energy');
    expect(missingFields).toContain('train_loss');
  });

  it('validates Task 3 snapshot', () => {
    const snap = {
      epoch: 5,
      edge_scores: [0.9, 0.1],
      train_loss: 0.3,
      auc: 0.85,
    };
    const { valid } = validateSnapshot(3, snap);
    expect(valid).toBe(true);
  });

  it('validates Task 4 snapshot', () => {
    const snap = {
      epoch: 10,
      node_predictions: [0, 1, 0],
      modularity_q: 0.5,
      train_loss: 0.4,
    };
    const { valid } = validateSnapshot(4, snap);
    expect(valid).toBe(true);
  });

  it('validates Task 5 snapshot', () => {
    const snap = {
      epoch: 3,
      embeddings_2d: [[0.1, 0.2]],
      knn_preservation: 0.6,
      link_recon_auc: 0.8,
      train_loss: 0.25,
    };
    const { valid } = validateSnapshot(5, snap);
    expect(valid).toBe(true);
  });

  it('validates Task 6 snapshot', () => {
    const snap = {
      epoch: 7,
      generated_graphs: [{ id: 0, valid: true }],
      validity_rate: 0.8,
      train_loss: 0.5,
    };
    const { valid } = validateSnapshot(6, snap);
    expect(valid).toBe(true);
  });

  it('returns invalid for unknown task ID', () => {
    const { valid, missingFields } = validateSnapshot(99, { epoch: 0 });
    expect(valid).toBe(false);
    expect(missingFields[0]).toContain('Unknown');
  });
});

// ─── Test: getPayload ───────────────────────────────────────────────────────

describe('getPayload', () => {
  it('extracts payload from v3 envelope', () => {
    const msg = { v: 3, type: 'epoch_snapshot', payload: { epoch: 5 } };
    expect(getPayload(msg)).toEqual({ epoch: 5 });
  });

  it('extracts payload from legacy message', () => {
    const msg = { v: 0, type: 'epoch_snapshot', payload: { epoch: 10 } };
    expect(getPayload(msg)).toEqual({ epoch: 10 });
  });
});

// ─── Test: Cross-validation with BE fixture ─────────────────────────────────

describe('Cross-validation with backend fixtures', () => {
  it('parses a realistic Task 1 epoch_snapshot from BE', () => {
    // Simulate what build_ws_message() in BE would produce
    const beMessage = {
      v: 3,
      type: 'epoch_snapshot',
      ts: 1713880000000,
      seq: 42,
      payload: {
        epoch: 50,
        node_predictions: [0, 1, 2, 0, 1],
        node_probabilities: [[0.8, 0.1, 0.1], [0.1, 0.85, 0.05], [0.05, 0.1, 0.85],
                             [0.7, 0.2, 0.1], [0.15, 0.8, 0.05]],
        node_confidence: [0.8, 0.85, 0.85, 0.7, 0.8],
        node_correctness: [1, 1, 0, 1, 1],
        embeddings_2d: [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6], [0.7, 0.8], [0.9, 1.0]],
        train_loss: 0.45,
        val_loss: 0.52,
        train_acc: 0.82,
        val_acc: 0.78,
        dirichlet_energy: 1.23,
      },
      progress: 0.5,
    };

    const msg = parseWSMessage(beMessage);
    expect(msg.v).toBe(3);
    expect(msg.type).toBe('epoch_snapshot');

    const { valid } = validateSnapshot(1, msg.payload);
    expect(valid).toBe(true);
  });

  it('parses a realistic error message from BE', () => {
    const beError = {
      v: 3,
      type: 'error',
      ts: 1713880001000,
      seq: 43,
      payload: {
        code: 'ERR_INVALID_CONFIG',
        message: 'heads must be > 0',
        retriable: false,
        field: 'heads',
      },
    };

    const msg = parseWSMessage(beError);
    expect(msg.type).toBe('error');
    expect(msg.payload.code).toBe('ERR_INVALID_CONFIG');
    // Verify no traceback field
    expect(msg.payload.traceback).toBeUndefined();
  });

  it('parses a graph_data message', () => {
    const beGraphData = {
      v: 3,
      type: 'graph_data',
      ts: 1713880000500,
      seq: 1,
      payload: {
        graphData: {
          nodes: [{ id: 0, degree: 3 }, { id: 1, degree: 2 }],
          links: [{ source: 0, target: 1 }],
        },
        groundTruth: [0, 1],
      },
    };

    const msg = parseWSMessage(beGraphData);
    expect(msg.type).toBe('graph_data');
    expect(msg.payload.graphData.nodes).toHaveLength(2);
  });
});
