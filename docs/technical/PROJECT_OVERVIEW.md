# GNN-Insight Project Overview

This file is a short orientation index. Detailed source-of-truth documents live
in the linked canonical docs below.

## Product Summary

GNN-Insight is an auth-first web product for training, visualizing, replaying,
and governing Graph Neural Network experiments. It supports six graph learning
workflows and streams training state over WebSocket so the UI can show topology,
embedding, and metric changes per epoch.

## Canonical Docs

- [Architecture](ARCHITECTURE.md): storage ownership, replay, retention,
  governance, and runtime boundaries.
- [API Contract](API_CONTRACT.md): REST and WebSocket payload shapes.
- [Frontend Structure](FRONTEND_STRUCTURE.md): route-first UI and state
  boundaries.
- [Testing Strategy](TESTING_STRATEGY.md): local and CI verification gates.
- [Deployment Notes](DEPLOYMENT.md): Docker stack, env vars, and smoke checks.
- [Visualization Guide](../user/VISUALIZATION_GUIDE.md): task-specific panels
  and GraphSAGE visualization behavior.

## Six Tasks

| Task | Workflow | Backend | Primary UI |
| --- | --- | --- | --- |
| 1 | Node classification | `backend/tasks/node_classification.py` | `TopologyView`, `Task1MetricsPanel` |
| 2 | Graph classification | `backend/tasks/graph_classification.py` | `TaskTopology2`, `Task2MetricsPanel` |
| 3 | Link prediction | `backend/tasks/link_prediction.py` | `TaskTopology3`, `Task3MetricsPanel` |
| 4 | Community detection | `backend/tasks/community_detection.py` | `TaskTopology4`, `Task4MetricsPanel` |
| 5 | Graph embedding | `backend/tasks/graph_embedding.py` | `TaskTopology5`, `Task5MetricsPanel` |
| 6 | Graph generation | `backend/tasks/graph_generation.py` | `TaskTopology6`, `Task6MetricsPanel` |

## Runtime Flow

1. The user signs in through `/login` or `/register`.
2. The app shell under `/app/*` starts or replays experiments.
3. Training sends `graph_data`, then repeated `epoch_snapshot` messages, then
   `training_complete`.
4. Experiment metadata is stored in SQL, replay payloads in MongoDB or local
   fallback, and large artifacts in local or S3-compatible blob storage.
