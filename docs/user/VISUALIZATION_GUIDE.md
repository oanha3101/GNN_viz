# GNN-Insight Visualization Guide

This guide is the canonical user-facing reference for task visualization. It
replaces the older per-task and concept Markdown files.

## Global Layout

- Topology view shows graph structure, predictions, errors, and selected-node
  context.
- Embedding views show PCA/t-SNE or latent spaces when a task exposes them.
- Metrics panels use at most four tabs per task and must render empty states
  instead of blank charts when data is missing.
- Playback controls scrub epoch snapshots from the WebSocket stream or replay
  storage.

## GraphSAGE Behavior

GraphSAGE uses neighborhood aggregation and is especially useful for inductive
reasoning. In the UI, GraphSAGE runs should emphasize neighborhood context,
local preservation, and how information from sampled or nearby nodes affects the
current prediction. Task 6 remains a graph generation diagnostic workflow rather
than a true GraphSAGE generator.

## Task 1: Node Classification

- Primary question: which label should each node receive?
- Key views: topology coloring, selected-node probabilities, train/validation
  loss and accuracy, confusion, homophily, and diagnostics.
- GraphSAGE-specific signal: compare a node prediction against its local
  neighborhood and k-hop context.

## Task 2: Graph Classification

- Primary question: which class should an entire graph receive?
- Key views: graph grid, selected graph inspector, readout contribution, class
  probabilities, confidence margin, confusion, and graph embedding.
- GraphSAGE-specific signal: graph-level readout is built from node embeddings
  produced by the selected encoder, including GraphSAGE.

## Task 3: Link Prediction

- Primary question: which missing or future edges are likely?
- Key views: existing edges, candidate edges, ROC/PR metrics, hard false
  positives/negatives, and pair proximity.
- GraphSAGE-specific signal: link scores should be interpreted through learned
  endpoint embeddings and neighborhood similarity.

## Task 4: Community Detection

- Primary question: which nodes form communities?
- Key views: community coloring, modularity, bridge nodes, stability, and
  community inspector.
- GraphSAGE-specific signal: neighborhood aggregation should make community
  boundaries and bridge nodes easier to diagnose.

## Task 5: Graph Embedding

- Primary question: does the embedding preserve useful graph structure?
- Key views: embedding quality overview, k-NN preservation, outliers,
  reconstruction AUC/loss, embedding norms, and isotropy.
- Required data contract: `per_node_knn_preservation` may be an object map keyed
  by node id; `outlier_scores` may be object rows with `node_id`,
  `avg_distance_to_neighbors`, and `is_outlier`.

## Task 6: Graph Generation

- Primary question: are generated graphs valid, unique, novel, and structurally
  close to the source distribution?
- Key views: generated-vs-source comparison, invalidity reasons, signatures,
  memorization flags, validity, uniqueness, novelty, reconstruction loss, and
  KL loss.
- Required data contract: generated graphs should expose a stable `signature`
  when possible; the frontend also computes a fallback signature from links.

## Smoke Checklist

For every model/task combination touched by a change:

1. Start a run and confirm `graph_data` arrives before snapshots.
2. Scrub the player and confirm charts update without blank panels.
3. Switch to GraphSAGE where applicable and confirm task-specific diagnostics
   still render.
4. Save and replay an experiment, then compare the replayed snapshot with the
   live panel behavior.
