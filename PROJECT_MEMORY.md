# PROJECT_MEMORY.md

## Tóm tắt kiến trúc

GNN-Insight là ứng dụng huấn luyện, replay và quản trị thí nghiệm Graph Neural Network.
Backend dùng FastAPI, frontend dùng React/Vite, dữ liệu runtime được lưu theo mô hình hybrid.

Luồng chính:

1. Người dùng upload hoặc chọn dataset.
2. Backend chuẩn hóa dữ liệu thành PyTorch Geometric `Data` hoặc danh sách graph.
3. Frontend mở WebSocket `/ws/train` để chạy training realtime.
4. Backend stream `graph_data`, `epoch_snapshot`, `training_complete`.
5. Khi lưu experiment, metadata vào SQL, replay payload/metrics/snapshots vào MongoDB hoặc fallback local gzip, artifact lớn vào blob store.

Nguồn sự thật dữ liệu:

- MySQL/SQLite: metadata, user, project, dataset, experiment, session, audit log.
- MongoDB/local gzip fallback: graph payload, snapshots, metrics để replay/compare/report.
- MinIO/S3/local blob: file upload, PyG artifact, object lớn.
- Redis: cache tạm, không được xem là source of truth.

## Thư mục quan trọng

- `backend/main.py`: entrypoint FastAPI, mount router, health, upload graph, metrics.
- `backend/database.py`: cấu hình MySQL/MongoDB/Redis, fallback SQLite/local, init DB.
- `backend/models/sql_models.py`: SQLAlchemy models cho user/project/dataset/experiment/session/audit.
- `backend/api/`: REST/WebSocket API layer, chủ yếu validate request rồi gọi service.
- `backend/api/user_loader.py`: upload/configure dataset, parse file, map column, lưu PyG artifact.
- `backend/api/task_adapters.py`: adapter cho 6 task GNN, tạo PyG data và graph JSON cho frontend.
- `backend/services/`: business logic cho experiment/session/project/dataset/admin/auth/persistence.
- `backend/services/hybrid_store.py`: blob store, Mongo repository, fallback local gzip, retention.
- `backend/core/session_manager.py`: quản lý training session, stop flag, snapshot persistence.
- `backend/data/loaders.py`: load Cora/CiteSeer, CSV/JSON/PT custom graph, auto-detect features/masks.
- `backend/tasks/`: training loop cho 6 task.
- `backend/models/`: GCN, GAT, GraphSAGE model definitions.
- `backend/tests/`: pytest regression tests.
- `frontend/src/`: React app, store, pages, components, contracts.
- `frontend/e2e/`: Playwright E2E tests.
- `docs/technical/`: tài liệu kiến trúc, API contract, testing, deployment.
- `scripts/`: scripts kiểm tra runtime và verify toàn repo.

## Lệnh chạy local

Từ root repo:

```powershell
docker-compose up -d
```

Backend:

```powershell
cd backend
python -m pip install -r requirements.txt
python main.py
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

URL mặc định:

- Backend: `http://127.0.0.1:8000`
- Frontend: `http://127.0.0.1:5173`
- MinIO console: `http://127.0.0.1:9001`
- phpMyAdmin: `http://127.0.0.1:8080`

## Lệnh test và verify

Backend:

```powershell
cd backend
pytest tests -q
```

Frontend:

```powershell
cd frontend
npm test
npm run build
npm run test:e2e
```

Verify toàn repo:

```powershell
.\scripts\verify_all.ps1
```

Kiểm tra runtime stack:

```powershell
.\scripts\check_runtime.ps1
```

## Quy ước coding

- Giữ API layer mỏng; logic nghiệp vụ đặt trong `backend/services`.
- Với thay đổi training/data logic, đọc luồng hiện tại trước rồi mới sửa; tránh phá WebSocket, DB và state frontend.
- WebSocket phải giữ envelope v3 trong `backend/utils/ws_msg.py`.
- SQL chỉ lưu metadata và key tham chiếu; không nhét payload lớn vào SQL.
- Dataset upload runtime nên đi qua blob store, không hard-code path local.
- Redis chỉ dùng cho dữ liệu tạm.
- Khi đổi contract API/WebSocket, cập nhật `docs/technical/API_CONTRACT.md` và test liên quan.
- Khi đổi ownership/lifecycle/persistence, cập nhật `docs/technical/ARCHITECTURE.md`.
- Backend ưu tiên pytest theo TDD cho service/API behavior.
- Frontend ưu tiên Vitest cho store/component/contract, Playwright cho flow lớn.
- Không revert thay đổi chưa rõ nguồn gốc trong working tree.
- Repo đang có nhiều thay đổi chưa commit; luôn kiểm tra `git status --short` trước khi sửa rộng.
