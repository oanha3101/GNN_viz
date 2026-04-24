# BE ↔ FE ↔ DB ↔ Network Unification Plan

> Mục tiêu: thống nhất luồng dữ liệu **Backend (FastAPI+PyTorch) ↔ Frontend (React+Zustand) ↔ Database (MySQL/SQLite + MongoDB + Redis) ↔ Network (WebSocket)** thành một contract duy nhất, có versioning, có persistence liên tục, có authentication, và tuân thủ các nguyên tắc lập trình mạng (framing, heartbeat, resume, backpressure).
>
> Base branch: `feat/ui-redesign-and-task3-polish`. Không sửa UI ở plan này (riêng biệt với sidebar PR trước).

---

## 1. Đánh giá hiện trạng (audit)

### A. Kiến trúc tổng thể

```
┌──────────────────────┐      WebSocket (/ws/train)     ┌──────────────────────┐
│  React (Zustand)     │  ◀────── gzipped JSON ──────▶  │  FastAPI (asyncio)   │
│  - useGNNStore       │                                │  - training_router   │
│  - playerStore       │      REST /api/...             │  - experiments       │
│  - useWebSocket      │  ◀────── fetch ────────────▶   │  - user_loader       │
└──────────────────────┘                                └──────────┬───────────┘
                                                                    │
                          ┌─────────────────────────────────────────┼──────────┐
                          ▼                       ▼                 ▼          ▼
                    ┌───────────┐          ┌──────────────┐  ┌────────┐ ┌───────────┐
                    │  MySQL/   │          │  MongoDB     │  │ Redis  │ │ Disk:     │
                    │  SQLite   │          │  (optional)  │  │ (pkl)  │ │ .json.gz  │
                    │ meta only │          │ file_path    │  │ emb    │ │ snapshots │
                    └───────────┘          └──────────────┘  └────────┘ └───────────┘
```

### B. Vấn đề phát hiện

#### B1. Contract drift giữa BE ↔ FE
- **Không có Pydantic schema cho WebSocket messages**. BE emit field bằng tên, FE đoán tên.
- Cùng tên `node_predictions` nhưng Task 1 = class labels, Task 4 = community IDs → semantic clash.
- Task 3 `edge_scores` align với `test_edges` theo `_idx` — fragile.
- Task 5 emit `embeddings_2d` nhưng FE nhiều chỗ lại expect `pca_2d`.
- Chỉ upload metadata có `schema_version: "2.0"`; WS payload + snapshot không có version.
- Không có constants chung (TaskId, MessageType, MetricKey) giữa Python ↔ JS → lỗi typo rất khó trace.

#### B2. Database persistence gaps
- Snapshot chỉ lưu khi user click **Save** cuối run (REST `POST /experiments`). WS disconnect giữa chừng = mất toàn bộ snapshots FE đang giữ.
- `SessionManager` chỉ nằm trong RAM (`_active_sessions: Dict[str, bool]`). Session không được persist → không resume được, không audit được.
- Bảng `User` + `Project` tồn tại nhưng **không có auth flow, không có login endpoint**, mọi experiment lưu với `owner_id=null`.
- `Experiment.project_id` là FK nhưng chưa có `/api/projects` CRUD → cột chết.
- Mongo collection không có index trên `task_type`, `created_at` → Library list chậm.
- Redis key `last_embeddings_{session_id}` pickled, không TTL → leak.
- Mix 3 store (MySQL + Mongo + file .json.gz) cho 1 khái niệm "experiment" — phức tạp không cần thiết cho 99% use-case.

#### B3. Network layer (lập trình mạng) gaps
- **Một WS endpoint duy nhất** `/ws/train`. Trộn: config handshake, streaming snapshots, error, complete, ping.
- **Không có heartbeat**. FE định nghĩa `ping` type nhưng BE không bao giờ gửi → proxy/LB tự đóng sau 60–120s idle.
- **Không auto-reconnect** (đã disable sau code 1006). User phải click lại Run → training BE vẫn chạy tiếp nhưng không ai nghe.
- **Không resume protocol**. Không có cách nào để FE nói "tôi mất kết nối ở epoch 37, gửi tiếp từ 38".
- **Không có seq/ack hay backpressure** — BE cứ emit 1 snapshot/epoch bất kể FE xử lý kịp hay không.
- `type: error` trả `traceback` thô Python → leak stacktrace ra browser, xấu về UX + security.
- CORS `allow_origins=["*"]` → OK cho dev, không OK cho production.
- Config gửi qua WS open message **không được Pydantic validate** → JSON lỗi = crash silent.

#### B4. Auth & multi-user
- Không có `/api/auth/login|register|me`.
- Không có JWT middleware.
- WS không authenticate → bất kỳ ai biết URL đều chạy được training, tốn GPU/CPU.

#### B5. Observability
- Không structured logging (print thô).
- Không metric endpoint (`/metrics` Prometheus).
- Không tracing (request-id/session-id không lan truyền cross-layer).

---

## 2. Kế hoạch phased (P0 → P3)

### Phase A — Shared contract & versioning **(P0, unblocks tất cả)**

> Mục tiêu: 1 spec duy nhất cho mọi message giữa BE ↔ FE, sinh từ một nguồn sự thật.

**Symbols sẽ thêm/sửa** (control-flow order):

1. **`shared/contracts.yaml` (NEW)** — single source-of-truth:
   ```yaml
   schema_version: "3.0"
   tasks:
     1: { name: node_classification, snapshot: SnapshotTask1 }
     2: { name: graph_classification, snapshot: SnapshotTask2 }
     ...
   messages:
     WS_IN: [start, pause, resume, seek, stop, ping]
     WS_OUT: [session_created, graph_data, graph_metadata,
              epoch_snapshot, training_complete, error, pong]
   snapshots:
     SnapshotTask1: { epoch: int, node_predictions: array[int],
                      node_confidence: array[float], ... }
   ```

2. **`backend/schemas/ws.py` (NEW)** — Pydantic v2 models generated / hand-mirrored:
   ```python
   class WSMessage(BaseModel):
       v: int = 1
       type: Literal["epoch_snapshot", "graph_data", ...]
       ts: int  # ms since epoch
       seq: int
       payload: Union[EpochSnapshotPayload, GraphDataPayload, ...]

   class SnapshotTask1(BaseModel):
       epoch: int
       node_predictions: list[int]
       node_confidence: list[float]
       node_probabilities: list[list[float]]
       dirichlet_energy: float
       # ...
   ```

3. **`frontend/src/contracts/wsMessages.js` (NEW)** — JSDoc typedefs + zod (hoặc hand-written validator) mirror:
   ```js
   /** @typedef {{ v: number, type: 'epoch_snapshot', ts: number, seq: number, payload: SnapshotTask1 }} WSMessage */
   export const SCHEMA_VERSION = 3
   export function parseWSMessage(raw) { /* validate, throw on drift */ }
   ```

4. **`backend/main.py`** — đính `v` + `ts` + `seq` vào mọi `send_json_zipped` (wrapper đổi).

5. **`frontend/src/hooks/useWebSocket.js`** — parse qua `parseWSMessage`; drift log → `/api/telemetry/contract-drift`.

**Test** (vitest + pytest):
- `backend/tests/test_ws_schemas.py` — mỗi task emit snapshot, validate qua Pydantic, round-trip JSON.
- `frontend/src/contracts/wsMessages.test.js` — fixtures ref (sample JSON từ BE) → parse không throw.

**PR**: `feat/shared-ws-contract` — độc lập, **không** sửa UI.

---

### Phase B — DB persistence liên tục **(P0, giải vấn đề mất snapshot khi disconnect)**

> Mục tiêu: mọi training run có dòng đời được lưu, resume được, và 1 user có thể mở nhiều tab/nhiều máy.

**Schema mới**:

```python
class TrainingSession(Base):
    __tablename__ = "training_sessions"
    id: UUID (pk)
    user_id: int (fk users.id, nullable)
    project_id: int (fk projects.id, nullable)
    task_type: int
    model_type: str
    config_json: JSON
    status: str   # enum: pending|running|completed|failed|stopped
    last_epoch: int
    started_at: datetime
    ended_at: datetime | null

class SessionSnapshot(Base):
    __tablename__ = "session_snapshots"
    session_id: UUID (fk)
    epoch: int
    blob_ref: str   # file path or mongo doc id
    created_at: datetime
    __table_args__ = (UniqueConstraint('session_id', 'epoch'),)
```

**Flow mới**:
- `POST /api/sessions` → create `TrainingSession` row (status=pending), return `session_id`.
- FE mở WS `/ws/sessions/{session_id}` → BE validate session tồn tại, status=pending|running.
- BE, mỗi epoch: upsert `SessionSnapshot(session_id, epoch)` + blob (file.json.gz hoặc mongo).
- On training_complete: update `TrainingSession.status=completed, ended_at=now, last_epoch=N`.
- `GET /api/sessions/{id}/resume` → return `{ last_epoch: N, snapshots: [...] }` → FE rehydrate `playerStore`, có thể mở lại WS với `?resume_from=N+1`.

**Symbols sẽ sửa**:
1. `backend/models/sql_models.py` — thêm `TrainingSession`, `SessionSnapshot`.
2. `backend/core/session_manager.py` — từ dict in-RAM → repository pattern (RAM cache + DB persist).
3. `backend/api/routers/training_router.py` — URL `/ws/sessions/{id}`, trong loop gọi `session_repo.save_snapshot(...)`.
4. `backend/api/routers/sessions.py` (NEW) — CRUD sessions + resume.
5. `frontend/src/hooks/useWebSocket.js` — flow mới: REST create session → open WS by id → on close, remember `session_id` trong store → optional resume button.
6. `frontend/src/store/sessionStore.js` (NEW) — track active `sessionId`, `lastEpoch`, `status`.

**Migration strategy**: 
- Sử dụng Alembic để tạo version stub (repo chưa có → khởi tạo).
- Backfill: experiments cũ không có session_id → để null, mới bắt buộc.

**Test**: pytest `test_session_crud.py`, `test_snapshot_incremental.py`; FE `test/sessionResume.test.js`.

**PR**: `feat/training-session-persistence` — **phụ thuộc Phase A đã merge**.

---

### Phase C — Network protocol upgrade (framing, heartbeat, reconnect) **(P1)**

> Mục tiêu: WS hoạt động đúng kiểu lập trình mạng chuyên nghiệp.

**Thay đổi**:

1. **Frame envelope chuẩn** (phase A đã có trường `v, type, ts, seq`):
   ```json
   { "v": 1, "type": "epoch_snapshot", "ts": 1713880000, "seq": 37, "payload": {...} }
   ```

2. **Heartbeat**:
   - BE: coroutine riêng gửi `{"type":"ping","ts":..., "seq":...}` mỗi 20s.
   - FE: reply `{"type":"pong","ts":...}`; 2 missed ping → BE đóng session.

3. **Reconnect + resume**:
   - FE lưu `{session_id, last_seq}` vào localStorage.
   - Reconnect → open `/ws/sessions/{id}?resume_from_seq=N`.
   - BE đọc `SessionSnapshot` replay epochs từ N+1.

4. **Backpressure**: FE gửi `{"type":"ack","seq":N}` mỗi 5 snapshots; BE không emit quá 3 chưa ack (simple credit-based).

5. **Error taxonomy**:
   ```json
   { "type":"error", "code":"ERR_INVALID_CONFIG", "message":"heads must be > 0",
     "retriable": false, "field": "heads" }
   ```
   Không bao giờ leak traceback Python ra FE (log internal).

6. **Interactive commands** (new): `pause`, `resume`, `seek_to_epoch`, `stop`. Thay cho REST `/api/stop` hack.

7. **CORS**: env allowlist `CORS_ORIGINS=https://app.example.com,...`.

**Symbols sẽ sửa**:
1. `backend/utils/ws_msg.py` — envelope builder + seq counter.
2. `backend/api/routers/training_router.py` — handshake mới, heartbeat task, command dispatcher, error codes enum.
3. `backend/errors.py` (NEW) — Enum `ErrorCode`.
4. `frontend/src/hooks/useWebSocket.js` — heartbeat, ack, reconnect-with-resume.
5. `frontend/src/contracts/errorCodes.js` (NEW).

**PR**: `feat/ws-protocol-upgrade` — **phụ thuộc Phase B**.

---

### Phase D — Auth + multi-user **(P1)**

> Mục tiêu: experiment scoped per user, WS yêu cầu token.

1. `POST /api/auth/register`, `POST /api/auth/login` (bcrypt + JWT HS256 từ `JWT_SECRET` env).
2. `GET /api/auth/me` → current user.
3. FastAPI dependency `get_current_user` — đính kèm mọi endpoint experiments/sessions.
4. WS auth: query `?token=...` hoặc first-message handshake `{"type":"auth","token":"..."}`.
5. `Experiment.owner_id` + `TrainingSession.user_id` enforced not-null.
6. FE: `authStore` (zustand), login modal, axios-like interceptor đính `Authorization: Bearer ...`.

**Schema migration**: thêm `is_superuser` để có 1 admin read-all.

**PR**: `feat/auth-jwt` — **độc lập** với C nhưng thường làm song song.

---

### Phase E — FE store refactor & validation boundary **(P2)**

> Mục tiêu: mọi state rời rạc gom theo domain; validate schema tại ranh giới network.

1. Split `useGNNStore` → `configStore` (task/model/hyperparams) + `graphStore` (graphData/groundTruth/taskData) + `uiStore` (selection/hover/viewMode) + `sessionStore` (từ phase B).
2. Mọi WS message đi qua `parseWSMessage()` (phase A). Drift → dispatch `toast.error('Contract drift …')` + telemetry.
3. `playerStore.addSnapshot` validate task-specific schema.

**PR**: `refactor/fe-stores-domain-split` — tránh gom vào PR lớn; làm sau khi A+B+C đã stable.

---

### Phase F — Observability **(P2)**

1. `structlog` cho BE, JSON logs, request-id + session-id context.
2. `/metrics` Prometheus: `ws_active_sessions`, `ws_messages_sent_total{type}`, `training_epoch_duration_seconds{task}`.
3. FE: `window.__GNN_DEBUG__` panel hiển thị WS seq, last heartbeat, drift count.

**PR**: `feat/observability-metrics-logs` — independent, làm cuối.

---

## 3. Ma trận phụ thuộc giữa các PR

```
A (shared contract) ─┬─▶ B (session persist) ──▶ C (protocol upgrade) ──▶ E (FE refactor)
                     │                                                      │
                     └────────────────▶ D (auth) ◀─────────────────────────┘
                                                                            │
                                                                            ▼
                                                                      F (observability)
```

PR order khuyến nghị:
1. **A** (contract) — merge trước, unblock tất cả.
2. **B** (session) — áp Phase A vào DB layer.
3. **C** (WS protocol) — yêu cầu B để resume được.
4. **D** (auth) — song song với C.
5. **E** (FE refactor) — sau khi A+B+C merged.
6. **F** (observability) — cuối.

---

## 4. Mock nhanh (ASCII) của flow mới

```
┌─ User clicks Run ──────────────────────────────────────────────────┐
│ 1. POST /api/sessions  { task:1, model:GCN, config:{...} }         │
│ 2. ← { session_id: "uuid", ws_url: "/ws/sessions/uuid" }           │
│ 3. new WebSocket("/ws/sessions/uuid?token=...")                    │
│ 4. ← { type:"session_created", v:1, seq:0 }                        │
│ 5. ← { type:"graph_data", payload:{...}, seq:1 }                   │
│ 6. ← { type:"epoch_snapshot", payload:{epoch:0,...}, seq:2 }       │
│    → [DB insert SessionSnapshot(id,0,blob_ref)]                     │
│ 7. ...                                                              │
│ 8. WS drops at seq:38                                              │
│ 9. FE detects, uses last_seq=37 in localStorage                    │
│10. Reconnect /ws/sessions/uuid?resume_from_seq=38                  │
│11. ← { type:"epoch_snapshot", payload:{epoch:38,...}, seq:38 }     │
│    (BE replays from DB if running still; or streams new epochs)    │
│12. ← { type:"training_complete", payload:{last_epoch:99} }         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. Risk register

| Risk | Mitigation |
|---|---|
| BE schema drift khi đổi field → vỡ FE cũ | `schema_version` bump + FE log drift to telemetry |
| Session table phình to | TTL partition `ended_at < now - 30d` xoá blob |
| WS heartbeat false-positive trong dev tunnel | env toggle `HEARTBEAT_INTERVAL_SEC`, default 30s |
| Auth phase block dev velocity | Dev mode `DISABLE_AUTH=1` skip dependency |
| Mongo unavailable (đã có fallback) | Giữ file-path fallback — phase B respect pattern hiện tại |

---

## 6. Scope quyết định

Cần user xác nhận trước khi code:

- (Q1) Phase order có giữ A→B→C→D→E→F không, hay user muốn gộp một số phase?
- (Q2) DB snapshot lưu ở đâu: **(i)** SQL column JSON (nhanh, đơn giản) **(ii)** Mongo/collection riêng (scale) **(iii)** File `.json.gz` ref từ SQL (đang dùng cho experiments). Khuyến nghị giữ nhất quán = **(iii)** cho snapshot nặng.
- (Q3) Auth JWT với password tự nhập, hay SSO (Google/GitHub)? Khuyến nghị JWT đơn giản trước.
- (Q4) Sau khi plan duyệt, làm **PR đầu tiên (Phase A)** luôn, hay muốn xem lại branch sidebar (đang stash) trước?
