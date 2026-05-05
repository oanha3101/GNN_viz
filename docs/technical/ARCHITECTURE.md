# GNN-Insight Architecture

## Purpose

This document is the source of truth for the product architecture of GNN-Insight.
If code, roadmap notes, or older documents disagree with this file, update the code
or the older docs to match this file before continuing feature work.
For HTTP payload shapes, use `docs/technical/API_CONTRACT.md` as the matching
source of truth beside this architecture file.

## Target Architecture: Hybrid Powerhouse

| Layer | Technology | Stores | Why |
| --- | --- | --- | --- |
| Relational Core | MySQL | users, roles, projects, datasets, dataset_versions, experiments, training_sessions, audit_logs | ACID integrity, joins, permissions, governance |
| Document Store | MongoDB | experiment_snapshots, experiment_metrics, graph_payloads | fast replay reads, flexible JSON metrics, compare-runs queries |
| Blob Store | MinIO / S3 | raw dataset files, model weights, exported reports | scalable large-object storage, cheap retention, version-friendly |
| Cache / Ephemeral | Redis | short-lived model cache, export cache, active training hints | fast transient access, no system-of-record responsibility |

## Data Ownership Rules

- MySQL is the source of truth for metadata, references, ownership, status, lifecycle,
  and permissions.
- MongoDB is the source of truth for replay payloads, per-epoch snapshots, detailed
  metrics, and large JSON structures needed by the UI.
- Blob storage owns binary artifacts and raw uploaded files. MySQL stores object keys,
  never large file contents.
- Redis must be treated as disposable. Nothing required for recovery may exist only
  in Redis.

## Primary Entities

### User

- Owns projects, datasets, experiments, and sessions.
- Has role `admin`, `researcher`, or `viewer`.

### Project

- Main collaborative container for experiments.
- Belongs to one owner, can later be shared with role-based access.

### Dataset

- Stable logical dataset identity.
- Contains metadata only.

### DatasetVersion

- Immutable version of a dataset.
- Holds validation summary, schema version, blob object keys, and publish state.
- Lifecycle: `draft -> validated -> published -> deprecated`.

### Experiment

- One saved run attached to a project and dataset version.
- Stores summary metadata in MySQL and pointers into MongoDB / blob storage.

### TrainingSession

- Runtime lifecycle for a live training process.
- Can exist before an experiment is finalized.
- Tracks status, last epoch, error message, and stop/resume state.

### Snapshot

- One replayable epoch payload for an experiment.
- Stored in MongoDB with `(experiment_id, epoch)` identity.

## Canonical Naming

### MySQL Tables

- `users`
- `projects`
- `datasets`
- `dataset_versions`
- `experiments`
- `training_sessions`
- `audit_logs`

### Mongo Collections

- `experiment_snapshots`
- `experiment_metrics`
- `graph_payloads`

### Blob Prefixes

- `datasets/raw/...`
- `models/weights/...`
- `reports/export/...`

## Lifecycle Flows

### Dataset Lifecycle

1. User uploads raw files.
2. Files are stored in blob storage and referenced by object key.
3. Validation produces schema summary and warnings.
4. A `dataset_version` is created in `draft`.
5. Once validated, it moves to `validated`.
6. Admin or owner can publish to `published`.
7. Deprecated versions remain readable for old experiments but cannot be used for new runs.

### Training Lifecycle

1. User selects `project + dataset_version + task + model`.
2. Backend creates `training_session`.
3. WebSocket training streams graph data first, then epoch snapshots.
4. Each epoch snapshot is persisted to MongoDB.
5. MySQL session metadata is updated with status and `last_epoch`.
6. On completion, an `experiment` summary row is finalized in MySQL.
7. MongoDB retains replay payloads and summary metrics for compare-runs.
8. Stop actions must target one concrete `session_id`; production flows must not
   support a global "stop all sessions" shortcut from the main UI.

### Replay Flow

1. Frontend opens an experiment.
2. Summary metadata comes from MySQL.
3. Graph payload and replay snapshots come from MongoDB.
4. Timeline requests can fetch all retained snapshots or one epoch at a time.

### Session Recovery Flow

1. Frontend stores a recoverable `session_id` when a live WebSocket drops before
   the session reaches a terminal state.
2. `GET /api/sessions/{session_id}/resume` returns both replay snapshots and the
   operational Lab context: project, dataset version, config, upload metadata,
   task-specific runtime config, and any linked experiment/report pointers.
3. Frontend rebuilds the Lab from that payload instead of guessing from local UI
   state.

### Compare Runs Flow

1. Frontend sends 2-4 experiment ids.
2. MySQL resolves ownership, project, and dataset constraints.
3. MongoDB returns summary and derived metrics from `experiment_metrics`.
4. Full raw snapshots are not scanned unless explicitly requested.

### Experiment Review Flow

1. A user opens one saved experiment from `Experiment Hub`.
2. MySQL returns editable metadata such as `notes`, `is_best`, and relational labels.
3. Users can update run title, notes, or pin a run as best without rewriting Mongo replay data.
4. The pinned flag affects retention priority immediately because `is_best = true`
   is part of the retention policy.
5. Best-run pinning is project-scoped: at most one experiment per project should
   be marked as the active pinned reference at a time.

### Report v1 Flow

1. Frontend requests a report payload for one experiment.
2. MySQL provides summary metadata, ownership, dataset version, and notes.
3. MongoDB provides summary metrics and replay references.
4. Backend composes a lightweight report payload that can be exported as JSON or
   Markdown by the frontend.
5. Report generation must not require scanning every raw snapshot when summary
   metrics already exist.

## Retention Policy

Retention starts in Phase 1 and is not optional.

### Full Snapshot Retention

Keep all snapshots when any of the following is true:

- experiment is marked `is_best = true`
- experiment is among the latest 10 runs in its project
- experiment is newer than 14 days

### Compacted Snapshot Retention

For older non-best runs:

- keep epoch `0`
- keep `best_epoch`
- keep `last_epoch`
- keep every `10th` epoch
- move compare-friendly summary metrics into `experiment_metrics`

### Blob Retention

- Raw dataset files and model artifacts without active references may be deleted
  after 90 days.
- Blob deletion must be reference-aware and audit-logged.

## Audit Policy

Audit log entries are required for:

- login
- role change
- dataset upload
- dataset publish / deprecate
- experiment note / pin update
- experiment delete
- report generation when an export payload is requested
- retention compaction / purge
- admin stop or retry of a session

## Indexing Policy

### MySQL

- `experiments(project_id, created_at)`
- `experiments(owner_id, created_at)`
- `experiments(dataset_version_id, created_at)`
- `training_sessions(status, started_at)`
- `audit_logs(actor_user_id, created_at)`

### MongoDB

- `experiment_snapshots(experiment_id, epoch)` unique
- `experiment_snapshots(project_id, created_at)`
- `experiment_metrics(project_id, created_at)`
- `experiment_metrics(task_type, model_type, created_at)`
- `graph_payloads(experiment_id)` unique

## Compatibility and Rollout Rules

- `Mock Mode` must remain functional even if backend governance work is incomplete.
- `Experiment Hub` is now the primary run-management entry under
  `/app/experiments`.
- `ProjectLibrary` is legacy-only. It may remain in the repo during cleanup,
  but it must not be mounted in the main Lab UX or presented as a product path.
- New backend APIs must be additive first; old routes are only removed after the
  frontend has switched behind a feature flag.
- Frontend disconnect state is recoverable by default. A dropped WebSocket must
  not be treated as a confirmed `stopped` session unless the backend session
  status is actually terminal.

## Backend Layering

- Router modules under `backend/api/**` should stay thin:
  request parsing, dependency injection, response selection.
- Business logic belongs in `backend/services/**`.
- ORM persistence stays behind service functions or dedicated store/repository
  helpers such as the hybrid Mongo/MySQL retention store.
- When payload shapes change, update `API_CONTRACT.md` in the same change before
  expanding page logic.
- Current Phase 3 extraction target now includes dedicated services for:
  `auth`, `projects`, `datasets`, `experiments`, `sessions`, and `admin`.

## Frontend Shell Routing

- Product navigation is auth-first. Unauthenticated users land on `/login` or
  `/register` before accessing any protected workflow.
- Protected researcher and viewer routes live under `/app/*`:
  `/app/dashboard`, `/app/projects`, `/app/datasets`, `/app/lab`,
  `/app/experiments`.
- Admin routes live under `/admin/*`:
  `/admin/overview`, `/admin/users`, `/admin/datasets`,
  `/admin/experiments`, `/admin/sessions`, `/admin/retention`, `/admin/audit`.
- `LabShell` is a child route inside `/app/*`, not the application entrypoint.
- `AdminConsole`, `WorkspaceConsole`, and `ExperimentHub` may be reused during
  rollout, but the long-term navigation model is page-first, not overlay-first.

## Implementation Gates

Before code in any phase is merged:

1. `ARCHITECTURE.md` must already describe the intended behavior.
2. Any schema or API contract drift must update this file in the same change.
3. Retention implications must be considered for any new persisted payload.
