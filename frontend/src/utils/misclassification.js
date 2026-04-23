// Helpers for Misclassification Explorer (Task 1 / Node Classification).
//
// Backend (`backend/tasks/node_classification.py`) emits each epoch snapshot
// with a `node_correctness` field — a list of booleans indexed by node id
// where `true` means the model prediction matches the ground truth label.

export function isNodeMisclassified(nodeId, nodeCorrectness) {
  if (!Array.isArray(nodeCorrectness) || nodeCorrectness.length === 0) return false
  if (typeof nodeId !== 'number' || !Number.isInteger(nodeId)) return false
  if (nodeId < 0 || nodeId >= nodeCorrectness.length) return false
  return nodeCorrectness[nodeId] === false || nodeCorrectness[nodeId] === 0
}

export function countMisclassified(nodeCorrectness) {
  if (!Array.isArray(nodeCorrectness)) return 0
  let n = 0
  for (let i = 0; i < nodeCorrectness.length; i += 1) {
    if (nodeCorrectness[i] === false || nodeCorrectness[i] === 0) n += 1
  }
  return n
}
