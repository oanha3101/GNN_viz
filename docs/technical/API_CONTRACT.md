# GNN-Insight API Contract

## Purpose

This document keeps frontend and backend aligned on the public API shapes that
drive the product shell, governance pages, experiment hub, and admin console.
If an API shape changes, update this file in the same change.

## List Response Contract

All page-facing list endpoints should return this shape:

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "page_size": 0
}
```

### Rules

- `items` is always an array.
- `total` is the total number of matching records before any future paging UI.
- `page` defaults to `1` for the current internal workspace flow.
- `page_size` is the number of items returned in the payload.

## Current Standardized List Routes

- `GET /api/projects`
- `GET /api/datasets`
- `GET /api/experiments`
- `GET /api/admin/users`
- `GET /api/admin/datasets`
- `GET /api/admin/experiments`
- `GET /api/admin/sessions`
- `GET /api/admin/audit-logs`

### Experiment list filters

`GET /api/experiments` currently supports these query params:

- `project_id`
- `dataset_version_id`
- `task_type`
- `model_type`
- `owner_id`
- `status`
- `q` for lightweight text search over title, dataset name, and model type

## Detail and Action Routes

- Detail routes return one domain object, not a list wrapper.
- Action routes return either:
  - the updated domain object, or
  - a compact action payload such as `{ "status": "deleted", "id": 123 }`

## Current Detail Route Shapes

### `GET /api/datasets/{dataset_id}`

```json
{
  "dataset": {
    "id": 1,
    "name": "Cora",
    "slug": "cora",
    "description": "Citation graph",
    "owner_id": 2,
    "is_public": false,
    "current_version_id": 4,
    "created_at": "2026-05-04T10:00:00+00:00"
  },
  "versions": [
    {
      "id": 4,
      "dataset_id": 1,
      "version": 2,
      "lifecycle": "published",
      "schema_version": "2.0",
      "summary_json": {},
      "validation_json": {},
      "source_files_json": {},
      "raw_blob_key": "datasets/raw/cora-v2.zip",
      "processed_blob_key": "datasets/processed/cora-v2.pt",
      "created_by": 2,
      "published_by": 1,
      "created_at": "2026-05-04T10:00:00+00:00",
      "published_at": "2026-05-04T10:30:00+00:00"
    }
  ]
}
```

### `GET /api/admin/summary`

```json
{
  "users": 12,
  "projects": 5,
  "datasets": 8,
  "dataset_versions": 14,
  "experiments": 48,
  "training_sessions": 9,
  "active_sessions": 2,
  "failed_sessions_recent": 1,
  "retention_compacted_runs": 7,
  "recent_audit_events": 14,
  "blob_provider": "local",
  "mongo_available": true,
  "redis_available": true,
  "admin_user": {
    "id": 1,
    "email": "admin@example.com",
    "username": "admin",
    "full_name": "Admin",
    "role": "admin",
    "is_active": true,
    "created_at": "2026-05-04T10:00:00+00:00"
  }
}
```

### `GET /api/sessions/{session_id}/resume`

```json
{
  "session_id": "uuid",
  "task_type": 3,
  "model_type": "GAT",
  "dataset_name": "resume_graph",
  "project_id": 77,
  "project_title": "Graph Bench",
  "dataset_id": 12,
  "dataset_version_id": 88,
  "dataset_version_name": "resume_graph v2",
  "config": {
    "epochs": 9,
    "lr": 0.03,
    "hidden": 24,
    "dropout": 0.4,
    "heads": 2
  },
  "task_config": {
    "edge_split_ratio": 0.15
  },
  "uploaded_file_path": "datasets/runtime/resume-graph.pt",
  "upload_metadata": {
    "num_nodes": 24,
    "num_edges": 48
  },
  "ws_url": "/ws/train",
  "last_epoch": 2,
  "last_seq": 11,
  "status": "running",
  "experiment_id": 101,
  "report_path": "/api/experiments/101/report",
  "replay_path": "/api/experiments/101/replay?epoch=2",
  "snapshot_count": 3,
  "snapshots": [
    { "epoch": 0 },
    { "epoch": 1 },
    { "epoch": 2 }
  ]
}
```

### `GET /api/experiments/{id}`

```json
{
  "id": 101,
  "title": "Baseline run",
  "project_id": 10,
  "owner_id": 2,
  "dataset_id": 4,
  "dataset_version_id": 9,
  "task_type": 1,
  "model_type": "GCN",
  "dataset_name": "cora",
  "epoch_count": 4,
  "accuracy": 0.91,
  "loss": 0.11,
  "best_epoch": 3,
  "status": "completed",
  "is_best": true,
  "is_mock": false,
  "retention_state": "full",
  "created_at": "2026-05-05T00:00:00+00:00",
  "learning_rate": 0.01,
  "hidden_dim": 64,
  "dropout": 0.5,
  "config_json": {},
  "graph_payload": {},
  "snapshots_json": [],
  "metrics_json": {},
  "notes": "Candidate baseline"
}
```

## Current Action Route Shapes

### Auth

- `POST /api/auth/register` returns:
  - `{ "access_token": "...", "token_type": "bearer", "user": { ... } }`
- `POST /api/auth/login` returns:
  - `{ "access_token": "...", "token_type": "bearer", "user": { ... } }`
- `GET /api/auth/me` returns:
  - one `user` object when auth is enabled
  - `{ "id": null, "username": "anonymous", "message": "Auth disabled" }` in dev auth-disabled mode

### Dataset lifecycle

- `POST /api/datasets` returns:
  - `{ "dataset": { ... }, "version": { ... } }`
- `POST /api/datasets/{dataset_id}/versions` returns:
  - one `dataset version` object
- `POST /api/datasets/{dataset_id}/publish?version_id=...` returns:
  - one `dataset version` object with `lifecycle = "published"`
- `POST /api/datasets/{dataset_id}/deprecate?version_id=...` returns:
  - one `dataset version` object with `lifecycle = "deprecated"`

### Admin actions

- `PATCH /api/admin/users/{user_id}/role` returns:
  - one `user` object with the updated `role`
- `POST /api/admin/sessions/{session_id}/stop` returns:
  - one `training session` object with updated `status`
- `POST /api/admin/sessions/{session_id}/retry` returns:
  - a session action payload from session manager, currently including `session_id`, `status`, and connection metadata when available
- `POST /api/admin/retention?dry_run=true|false` returns:
  - `{ "results": [], "dry_run": true }`

### Session actions

- `POST /api/sessions` returns:
  - `{ "session_id": "uuid", "ws_url": "/ws/train", "status": "pending" }`
- `PATCH /api/sessions/{session_id}` returns:
  - `{ "session_id": "uuid", "status": "running" }`
- `POST /api/sessions/{session_id}/stop` returns:
  - `{ "session_id": "uuid", "status": "stopped" }`
- `POST /api/stop` is deprecated and returns:
  - `410 Gone` with a message pointing clients to the session-scoped stop route

### Experiment actions

- `POST /api/experiments` returns:
  - `{ "id": 101, "status": "saved", "experiment_status": "completed", "session_id": "uuid", "mongo_run_id": "101", "graph_payload_id": "...", "snapshot_count": 4, "report_path": "/api/experiments/101/report", "replay_path": "/api/experiments/101/replay?epoch=3" }`
- `POST /api/experiments/{id}/replay?epoch=...` returns:
  - one replay payload with `experiment_id`, `graph_payload`, `best_epoch`, and either `snapshots` or one `snapshot`
- `POST /api/experiments/compare` returns:
  - `{ "results": [{ "experiment": { ... }, "metrics": { ... } }] }`
- `PATCH /api/experiments/{id}` returns:
  - one `experiment detail` object
  - when `is_best = true`, backend enforces one best run per project by clearing
    the previous pinned run in that same project
- `GET /api/experiments/{id}/report` returns:
  - one report payload with `experiment`, `summary`, `config`, `metrics`, `dataset_version`, `replay`, `notes`, `next_action`
- `DELETE /api/experiments/{id}` returns:
  - `{ "status": "deleted", "id": 101 }`

## Frontend Compatibility Note

- Frontend pages may temporarily keep a defensive adapter for older array-only
  payloads during rollout.
- New backend work should target the standardized list contract above, not the
  legacy bare-array shape.
