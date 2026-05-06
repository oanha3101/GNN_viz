# GNN-Insight — Tài liệu dự án (DUAN65)

> Ngày tạo: 2026-05-06
> Phiên bản hệ thống: 3.0.0
> Tech Stack: FastAPI + React (Vite) + MySQL + MongoDB + Redis + MinIO

---

## Mục lục

1. [Tổng quan hệ thống](#1-tổng-quan-hệ-thống)
2. [Đánh giá độ hoàn thiện](#2-đánh-giá-độ-hoàn-thiện)
3. [Những điều cần làm tiếp](#3-những-điều-cần-làm-tiếp)
4. [Hướng dẫn sử dụng từng bước](#4-hướng-dẫn-sử-dụng-từng-bước)
5. [Test Cases kiểm thử](#5-test-cases-kiểm-thử)

---

## 1. Tổng quan hệ thống

### GNN-Insight là gì?

GNN-Insight là nền tảng web để **huấn luyện, trực quan hóa và quản trị thí nghiệm Graph Neural Networks (GNN)** — một nhánh của AI chuyên xử lý dữ liệu dạng đồ thị (mạng xã hội, mạng phân tử, citation network...).

### Kiến trúc tổng thể

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (React)                  │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │  Auth    │ │Dashboard │ │ Projects │ │  Admin  │ │
│  │  Pages   │ │ Datasets │ │   Lab    │ │ Console │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬────┘ │
│       └─────────────┴────────────┴─────────────┘     │
│                    Zustand Store                      │
│                    WebSocket Hook                     │
└────────────────────────┬────────────────────────────┘
                         │ REST API + WebSocket
┌────────────────────────┴────────────────────────────┐
│                   Backend (FastAPI)                   │
│  ┌────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ │
│  │  Auth  │ │ Sessions │ │Training  │ │ Experiments│ │
│  │ Router │ │  Router  │ │ Router   │ │  Router    │ │
│  └────────┘ └──────────┘ └──────────┘ └───────────┘ │
│  ┌────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ │
│  │Datasets│ │ Projects │ │  Admin   │ │User Loader│ │
│  │ Router │ │  Router  │ │  Router  │ │           │ │
│  └────────┘ └──────────┘ └──────────┘ └───────────┘ │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │           GNN Tasks (6 tasks)                   │ │
│  │  Node Classification │ Graph Classification     │ │
│  │  Link Prediction     │ Community Detection      │ │
│  │  Graph Embedding     │ Graph Generation         │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │        Models: GCN / GAT / GraphSAGE            │ │
│  └─────────────────────────────────────────────────┘ │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────┐
│                  Infrastructure                       │
│  ┌─────────┐ ┌──────────┐ ┌───────┐ ┌────────────┐ │
│  │ MySQL   │ │ MongoDB  │ │ Redis │ │ MinIO/S3   │ │
│  │(metadata│ │(snapshots│ │(cache)│ │(blob store)│ │
│  │ & auth) │ │& metrics)│ │       │ │            │ │
│  └─────────┘ └──────────┘ └───────┘ └────────────┘ │
└──────────────────────────────────────────────────────┘
```

### Các vai trò người dùng

| Vai trò | Quyền hạn |
|---|---|
| **Admin** | Quản trị toàn bộ: users, datasets, experiments, sessions, audit logs, retention |
| **Researcher** | Tạo project, upload dataset, chạy training, xem kết quả, replay, so sánh |
| **Viewer** | Chỉ xem, không được chạy training hay chỉnh sửa |

### 6 GNN Tasks trong hệ thống

| # | Task | Mô tả | Dataset mẫu |
|---|---|---|---|
| 1 | Node Classification | Phân loại nút trong đồ thị (ví dụ: phân loại paper theo chủ đề) | Cora |
| 2 | Graph Classification | Phân loại toàn bộ đồ thị (ví dụ: phân loại phân tử độc/hại) | MUTAG |
| 3 | Link Prediction | Dự đoán liên kết mới có thể xuất hiện | Cora |
| 4 | Community Detection | Phát hiện cộng đồng/biểu đồ trong mạng | Karate |
| 5 | Graph Embedding | Biểu diễn nút thành vector không gian thấp | Karate |
| 6 | Graph Generation | Sinh đồ thị mới tương tự đồ thị mẫu | Karate |

### 3 Model Architecture

| Model | Đặc điểm |
|---|---|
| **GCN** (Graph Convolutional Network) | Lan truyền đặc trưng qua các lớp tích chập đồ thị, có LayerNorm + residual |
| **GAT** (Graph Attention Network) | Sử dụng attention mechanism, trọng số attention khác nhau cho mỗi neighbor |
| **GraphSAGE** | Sampling + aggregating từ neighborhood, phù hợp đồ thị lớn |

---

## 2. Đánh giá độ hoàn thiện

### Bảng tổng hợp

| Nhóm tính năng | Hoàn thiện | Chi tiết |
|---|---|---|
| Core Training System | **95%** | 6 tasks, 3 models, WebSocket streaming, playback — thiếu K-Hop + Error Mode |
| Visualization | **80%** | Topology/Embedding/Metrics cơ bản đầy đủ — Task 5/6 thiếu advanced charts |
| Auth & Admin | **98%** | JWT, roles, 7 trang admin, audit — thiếu env-based URLs |
| Experiment Management | **95%** | CRUD, replay, compare, report — thiếu recommended actions |
| Data Management | **85%** | Upload CSV/Excel/JSON/PT, column mapping — thiếu validation |
| UX / Quality of Life | **60%** | Sidebar, hover, animations — thiếu dark mode, shortcuts, export |
| Testing & CI | **90%** | 13 BE + 24 FE test files, GitHub Actions — thiếu regression tests |

### **Độ hoàn thiện tổng thể: ~85%**

### Tính năng đã hoàn thiện đầy đủ

- Hệ thống auth JWT với phân quyền (admin/researcher/viewer)
- 6 GNN training tasks với snapshot data phong phú per epoch
- 3 model architectures (GCN, GAT, GraphSAGE) với LayerNorm + residual
- WebSocket streaming real-time trong lúc training
- Epoch playback (play/pause/seek/speed)
- CRUD cho Projects, Datasets (có versioning), Experiments, Sessions
- Admin console 7 trang (overview, users, datasets, experiments, sessions, retention, audit)
- Experiment replay, compare 2-4 runs, report generation
- Hybrid persistence với graceful fallbacks (MySQL→SQLite, Mongo→JSON, Redis→null, MinIO→local)
- Session recovery khi mất kết nối
- Docker Compose infrastructure (MySQL, MongoDB, Redis, MinIO, phpMyAdmin)
- CI pipeline (pytest + vitest + build)
- 37 test files tổng cộng

### Tính năng còn thiếu hoặc bị disable

| Tính năng | Vấn đề | Mức độ |
|---|---|---|
| Task 1 Error Mode | `showErrorsOnlySafe = false` hardcode trong TopologyView.jsx | Critical |
| Hardcoded API URLs | `localhost:8000` trong 5+ file FE thay vì dùng env vars | Critical |
| Frontend upload validation | Không check duplicate node IDs, missing edge references | High |
| K-Hop visualization | Backend chưa tính, frontend chưa có component | Medium |
| Task 5: Stress/Distortion Chart | Chưa implement | Medium |
| Task 5: Node Importance Ranking | Chưa implement | Medium |
| Task 5: Embedding Drift Animation | Chưa implement | Low |
| Task 6: Latent Space Interpolation | Chưa implement | Medium |
| Task 6: Validity/Novelty/Uniqueness Dashboard | Chưa implement chi tiết | Medium |
| Task 6: Generated Graph Gallery | Chưa implement | Low |
| Export chart PNG | Chưa implement | Low |
| Keyboard shortcuts | Chưa implement (README ghi sai) | Low |
| Dark/Light mode | Chưa implement | Low |
| Snapshot schema versioning | Chưa implement | Medium |
| Unified Insight Panel | Chưa implement (What/Why/Next) | Medium |
| Regression test suite | Chưa có cho playback/diagnostic/report | Medium |

---

## 3. Những điều cần làm tiếp

### Ưu tiên 1 — Fix Critical Bugs (làm ngay)

1. **Bật lại Task 1 Error Mode**
   - File: `frontend/src/components/TopologyView/TopologyView.jsx`
   - Tìm `showErrorsOnlySafe = false`, đổi thành `true` hoặc tạo toggle UI

2. **Loại bỏ hardcoded URLs**
   - Tìm tất cả `localhost:8000` trong frontend, thay bằng `import.meta.env.VITE_API_BASE_URL`
   - Các file cần kiểm tra: search `grep -r "localhost:8000" frontend/src/`

3. **Thêm frontend upload validation**
   - Check duplicate node IDs trước khi submit
   - Check edge references (source/target phải tồn tại trong node list)
   - Hiển thị lỗi rõ ràng cho user

### Ưu tiên 2 — Complete Task 5/6 Visualization

4. **Task 5: Stress/Distortion Chart** — tính stress metric từ embedding, vẽ chart
5. **Task 5: Node Importance Ranking** — dựa trên embedding norm hoặc centrality
6. **Task 6: Latent Space Interpolation** — nội suy giữa 2 điểm trong latent space
7. **Task 6: Generated Graph Gallery** — grid so sánh generated vs original

### Ưu tiên 3 — UX Polish

8. **K-Hop visualization** — backend tính K-Hop influence, frontend hiển thị
9. **Export chart PNG** — dùng Plotly `toImage` hoặc html2canvas
10. **Keyboard shortcuts** — Space=play, Left/Right=prev/next epoch
11. **Dark/Light mode** — Tailwind dark mode + theme toggle

### Ưu tiên 4 — Infrastructure

12. **Snapshot schema versioning** — version mỗi snapshot format để backward compatible
13. **Unified Insight Panel** — "What happened / Why likely / What to try next"
14. **Regression test suite** — test playback flow, diagnostic panels, report generation

---

## 4. Hướng dẫn sử dụng từng bước

> Hướng dẫn này dành cho người mới lần đầu sử dụng hệ thống.

### Bước 0: Khởi động hệ thống

#### 0.1 Prerequisites

- Docker Desktop đang chạy
- Node.js >= 18
- Python >= 3.10

#### 0.2 Start Infrastructure

```bash
# Khởi động MySQL, MongoDB, Redis, MinIO
docker-compose up -d

# Kiểm tra các container đang chạy
docker ps
```

#### 0.3 Start Backend

```bash
cd backend

# Tạo virtual environment (lần đầu)
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux/Mac

# Cài dependencies
pip install -r requirements.txt

# Khởi động backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend sẽ chạy tại `http://localhost:8000`
API docs (Swagger): `http://localhost:8000/docs`

#### 0.4 Start Frontend

```bash
cd frontend

# Cài dependencies (lần đầu)
npm install

# Khởi động frontend
npm run dev
```

Frontend sẽ chạy tại `http://localhost:5173`

#### 0.5 Tạo tài khoản Admin (lần đầu)

```bash
# Trong thư mục backend, chạy script tạo admin
python scratch/create_admin.py
```

Hoặc đăng ký qua API:
```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123", "role": "admin"}'
```

---

### Bước 1: Đăng nhập

1. Mở trình duyệt, truy cập `http://localhost:5173`
2. Hệ thống chuyển đến trang **Đăng nhập** (`/login`)
3. Nhập thông tin:
   - **Tên đăng nhập:** admin (hoặc tài khoản đã tạo)
   - **Mật khẩu:** admin123
4. Nhấn **Đăng nhập**
5. Hệ thống xác thực JWT token → chuyển đến Dashboard

**Lưu ý:**
- Nếu chưa có tài khoản, nhấn "Đăng ký" để tạo tài khoản mới
- Tài khoản mới mặc định có vai trò `researcher`
- Chỉ admin mới có thể truy cập `/admin/*`

---

### Bước 2: Làm quen giao diện chính

Sau khi đăng nhập, bạn sẽ thấy **App Shell** với thanh điều hướng bên trái:

```
┌──────────┬────────────────────────────────────┐
│          │                                    │
│  Sidebar │       Nội dung chính               │
│          │                                    │
│ Dashboard│   (thay đổi theo route)            │
│ Projects │                                    │
│ Datasets │                                    │
│ Experiments                                   │
│ Lab      │                                    │
│          │                                    │
│ ──────── │                                    │
│ Admin    │                                    │
│ (nếu là  │                                    │
│  admin)  │                                    │
└──────────┴────────────────────────────────────┘
```

| Menu | Chức năng |
|---|---|
| **Dashboard** | Tổng quan hệ thống |
| **Projects** | Quản lý các dự án nghiên cứu |
| **Datasets** | Quản lý tập dữ liệu (upload, version, publish) |
| **Experiments** | Xem lịch sử thí nghiệm, replay, so sánh |
| **Lab** | Không gian làm việc chính — nơi huấn luyện và trực quan hóa |
| **Admin** | Quản trị (chỉ admin thấy) |

---

### Bước 3: Tạo Project

1. Từ sidebar, nhấn vào **Projects**
2. Nhấn nút **Tạo dự án mới** (biểu tượng dấu +)
3. Điền thông tin:
   - **Tên dự án:** Ví dụ "Thí nghiệm Node Classification với Cora"
   - **Mô tả:** Mô tả mục tiêu thí nghiệm
4. Nhấn **Tạo**
5. Project mới xuất hiện trong danh sách

---

### Bước 4: Chuẩn bị Dataset

#### 4.1 Sử dụng Dataset có sẵn (Builtin)

Hệ thống đã tích hợp sẵn 3 dataset mẫu:

| Dataset | Task | Mô tả |
|---|---|---|
| **Cora** | Node Classification, Link Prediction | Mạng citation 2708 papers, 7 chủ đề |
| **Karate** | Community Detection, Graph Embedding, Graph Generation | Câu lạc bộ Karate 34 thành viên |
| **MUTAG** | Graph Classification | 184 phân tử, phân loại mutagenic |

Các dataset này tự động xuất hiện trong **Datasets** → tab **Builtin**.

#### 4.2 Upload Dataset tùy chỉnh

1. Vào **Datasets** → nhấn **Upload**
2. Chọn task muốn thực hiện
3. Upload file theo định dạng:
   - **CSV:** 2 file — `nodes.csv` (id, features...) + `edges.csv` (source, target)
   - **Excel:** File `.xlsx` với sheet nodes + edges
   - **JSON:** Format node-link
   - **PyTorch:** File `.pt` (PyG Data format)
4. Hệ thống hiển thị **Column Mapping** — ánh xạ cột dữ liệu
5. Nhấn **Validate** để kiểm tra
6. Nhấn **Configure** để lưu

---

### Bước 5: Chạy Training trong Lab

Đây là bước quan trọng nhất — nơi bạn huấn luyện model và xem kết quả.

#### 5.1 Vào Lab

1. Nhấn **Lab** trong sidebar
2. Giao diện Lab hiện ra với các panel:

```
┌──────────────────────────────────────────────────────┐
│  Task: [Node Classification ▼]  Model: [GCN ▼]      │
│  Dataset: [Cora ▼]  Epochs: [50]  LR: [0.01]        │
│                                                       │
│ ┌─────────────────┐ ┌─────────────────┐ ┌──────────┐│
│ │                 │ │                 │ │          ││
│ │   Topology      │ │   Embedding     │ │ Metrics  ││
│ │   View          │ │   View          │ │ Chart    ││
│ │   (đồ thị)      │ │   (PCA/t-SNE)   │ │ (loss/   ││
│ │                 │ │                 │ │  acc)    ││
│ └─────────────────┘ └─────────────────┘ └──────────┘│
│                                                       │
│ ┌───────────────────────────────────────────────────┐│
│ │  Player: [|◁] [▷] [▷|] ══════════════ Epoch: 0  ││
│ │  Speed: [1x] [2x] [4x]                           ││
│ └───────────────────────────────────────────────────┘│
│                                                       │
│  [Start Training]  [Stop]  [Save Experiment]         │
└──────────────────────────────────────────────────────┘
```

#### 5.2 Cấu hình Training

1. **Chọn Task:** Dropdown bên trái (Node Classification, Graph Classification, ...)
2. **Chọn Model:** GCN / GAT / GraphSAGE
3. **Chọn Dataset:** Dataset đã upload hoặc builtin
4. **Set Hyperparameters:**
   - **Epochs:** Số vòng lặp huấn luyện (mặc định 50)
   - **Learning Rate:** Tốc độ học (mặc định 0.01)
   - **Hidden Channels:** Số chiều ẩn (mặc định 64)

#### 5.3 Bắt đầu Training

1. Nhấn nút **Start Training**
2. Hệ thống mở WebSocket connection → bắt đầu stream snapshots
3. Quan sát real-time:
   - **Topology View:** Đồ thị thay đổi theo epoch (màu sắc = class dự đoán)
   - **Embedding View:** Các nút di chuyển trong không gian PCA/t-SNE
   - **Metrics Chart:** Loss giảm, Accuracy tăng
4. Khi training xong → hiệu ứng confetti + nút **Save Experiment** sáng lên

#### 5.4 Sử dụng Player

- **Play/Pause:** Tự động phát hoặc dừng lại từng epoch
- **Seek:** Kéo thanh trượt để nhảy đến epoch cụ thể
- **Speed:** Chọn tốc độ phát (1x, 2x, 4x)
- **Prev/Next:** Nút mũi tên để chuyển epoch trước/sau

---

### Bước 6: Phân tích kết quả theo từng Task

#### Task 1 — Node Classification

- **Topology View:** Nút được tô màu theo class dự đoán. Nhấn vào nút xem chi tiết (confidence, ground truth, neighbor majority)
- **Metrics:** Loss, Accuracy, Confusion Matrix, Per-class F1
- **Oversmoothing Tab:** Dirichlet Energy theo epoch — kiểm tra hiện tượng oversmoothing
- **Homophily Tab:** Tỷ lệ neighbor cùng class

#### Task 2 — Graph Classification

- **Topology View:** Đồ thị con với node contributions (đóng góp của từng nút vào prediction)
- **Metrics:** Loss, Accuracy, Confidence Margin, Attention Entropy
- **Structure Tab:** So sánh structural metrics giữa các graph

#### Task 3 — Link Prediction

- **Topology View:** Các cạnh được hiển thị với màu TP/FP/TN/FN
- **Top-K Badge:** Các liên kết được dự đoán mạnh nhất
- **Metrics:** AUC, Loss, Edge Scores distribution

#### Task 4 — Community Detection

- **Topology View:** Nút được tô màu theo cộng đồng, hiển thị bridge nodes
- **Metrics:** Modularity Q, Silhouette Score, NMI, Community Stability
- **Dendrogram:** Cây phân cấp cộng đồng (hierarchical clustering)

#### Task 5 — Graph Embedding

- **Embedding View:** PCA + t-SNE song song
- **Metrics:** kNN Preservation, Link Reconstruction AUC, Isotropy, Outlier Scores

#### Task 6 — Graph Generation

- **Topology View:** Đồ thị sinh ra so với đồ thị gốc
- **Metrics:** Validity Rate, Uniqueness Rate, Novelty Rate, Reconstruction Loss, KL Loss
- **Latent Space:** PCA của latent vectors

---

### Bước 7: Lưu và quản lý Experiment

#### 7.1 Lưu Experiment

1. Sau khi training xong, nhấn **Save Experiment**
2. Nhập tên và ghi chú (tuỳ chọn)
3. Experiment được lưu vào MySQL + MongoDB (snapshots)

#### 7.2 Xem lại Experiment

1. Vào **Experiments** trong sidebar
2. Danh sách tất cả experiments hiện ra
3. Nhấn vào một experiment để xem chi tiết
4. Nhấn **Replay** để xem lại quá trình training

#### 7.3 So sánh Experiments

1. Trong **Experiments**, chọn 2-4 experiments (tick checkbox)
2. Nhấn **Compare**
3. Hệ thống hiển thị metrics song song để so sánh

#### 7.4 Xuất Report

1. Trong chi tiết experiment, nhấn **Generate Report**
2. Hệ thống tạo report tóm tắt kết quả

---

### Bước 8: Admin Console (chỉ Admin)

Truy cập `/admin/*` với tài khoản admin:

| Trang | Chức năng |
|---|---|
| **Overview** | Dashboard tổng quan (số users, datasets, experiments, sessions) |
| **Users** | Quản lý người dùng (xem, đổi vai trò) |
| **Datasets** | Xem tất cả datasets trong hệ thống |
| **Experiments** | Xem tất cả experiments |
| **Sessions** | Quản lý sessions đang chạy (stop, retry) |
| **Retention** | Chạy chính sách dữ liệu (xóa snapshots cũ, dọn blob orphan) |
| **Audit** | Xem nhật ký hành động của tất cả users |

---

## 5. Test Cases kiểm thử

> Dưới đây là test cases chi tiết cho từng bước, dành cho người kiểm thử (QA).

### TC-01: Đăng ký tài khoản mới

| Mục | Chi tiết |
|---|---|
| **ID** | TC-01 |
| **Tên** | Đăng ký tài khoản mới |
| **Precondition** | Hệ thống đang chạy, chưa có tài khoản test |
| **Steps** | 1. Truy cập `/login` → nhấn "Đăng ký" |
| | 2. Nhập username: `testuser1` |
| | 3. Nhập password: `Test@1234` |
| | 4. Nhấn "Đăng ký" |
| **Expected** | Đăng ký thành công, chuyển sang trang đăng nhập |
| **Verify** | Đăng nhập lại với `testuser1` / `Test@1234` → vào được Dashboard |

### TC-02: Đăng nhập thành công

| Mục | Chi tiết |
|---|---|
| **ID** | TC-02 |
| **Tên** | Đăng nhập thành công |
| **Precondition** | Đã có tài khoản `admin` / `admin123` |
| **Steps** | 1. Truy cập `http://localhost:5173` |
| | 2. Nhập username: `admin` |
| | 3. Nhập password: `admin123` |
| | 4. Nhấn "Đăng nhập" |
| **Expected** | Đăng nhập thành công, chuyển đến `/app/dashboard` |
| **Verify** | Thấy sidebar với các menu: Dashboard, Projects, Datasets, Experiments, Lab |

### TC-03: Đăng nhập thất bại — sai mật khẩu

| Mục | Chi tiết |
|---|---|
| **ID** | TC-03 |
| **Tên** | Đăng nhập thất bại với mật khẩu sai |
| **Precondition** | Đã có tài khoản `admin` |
| **Steps** | 1. Truy cập `/login` |
| | 2. Nhập username: `admin` |
| | 3. Nhập password: `saimatkhaunhe` |
| | 4. Nhấn "Đăng nhập" |
| **Expected** | Hiển thị lỗi "Tên đăng nhập hoặc mật khẩu không đúng" |
| **Verify** | Vẫn ở trang `/login`, không chuyển trang |

### TC-04: Tạo Project mới

| Mục | Chi tiết |
|---|---|
| **ID** | TC-04 |
| **Tên** | Tạo Project mới |
| **Precondition** | Đã đăng nhập thành công |
| **Steps** | 1. Nhấn **Projects** trong sidebar |
| | 2. Nhấn nút **Tạo dự án mới** |
| | 3. Nhập tên: `Test Project NodeCls` |
| | 4. Nhập mô tả: `Thí nghiệm phân loại nút trên Cora` |
| | 5. Nhấn **Tạo** |
| **Expected** | Project mới xuất hiện trong danh sách |
| **Verify** | Thấy project với tên `Test Project NodeCls` trong list |

### TC-05: Xem Dataset có sẵn (Builtin)

| Mục | Chi tiết |
|---|---|
| **ID** | TC-05 |
| **Tên** | Xem danh sách dataset builtin |
| **Precondition** | Đã đăng nhập |
| **Steps** | 1. Nhấn **Datasets** trong sidebar |
| | 2. Xem tab **Builtin** |
| **Expected** | Thấy ít nhất 3 dataset: Cora, Karate, MUTAG |
| **Verify** | Mỗi dataset có tên, mô tả, task type tương ứng |

### TC-06: Upload Dataset tùy chỉnh

| Mục | Chi tiết |
|---|---|
| **ID** | TC-06 |
| **Tên** | Upload dataset CSV tùy chỉnh |
| **Precondition** | Đã đăng nhập, có file CSV nodes + edges sẵn |
| **Steps** | 1. Vào **Datasets** → nhấn **Upload** |
| | 2. Chọn task: **Node Classification** |
| | 3. Upload file `nodes.csv` và `edges.csv` |
| | 4. Xem Column Mapping — kiểm tra ánh xạ đúng |
| | 5. Nhấn **Validate** |
| | 6. Nhấn **Configure** |
| **Expected** | Upload thành công, dataset mới xuất hiện trong danh sách |
| **Verify** | Dataset có tên, đúng số nodes/edges |

### TC-07: Chạy Training — Node Classification (GCN)

| Mục | Chi tiết |
|---|---|
| **ID** | TC-07 |
| **Tên** | Chạy training Node Classification với GCN trên Cora |
| **Precondition** | Đã đăng nhập, Cora dataset có sẵn |
| **Steps** | 1. Nhấn **Lab** trong sidebar |
| | 2. Chọn Task: **Node Classification** |
| | 3. Chọn Model: **GCN** |
| | 4. Chọn Dataset: **Cora** |
| | 5. Set Epochs: **20**, Learning Rate: **0.01** |
| | 6. Nhấn **Start Training** |
| | 7. Chờ training hoàn thành |
| **Expected** | Training chạy, stream snapshots real-time |
| **Verify** | - Topology View hiển thị đồ thị Cora với node colors |
| | - Embedding View hiển thị PCA scatter |
| | - Metrics Chart hiển thị loss giảm, accuracy tăng |
| | - Player hiển thị progress bar theo epoch |
| | - Khi xong: confetti hiện, nút Save sáng |

### TC-08: Chạy Training — Graph Classification (GAT)

| Mục | Chi tiết |
|---|---|
| **ID** | TC-08 |
| **Tên** | Chạy training Graph Classification với GAT trên MUTAG |
| **Precondition** | Đã đăng nhập, MUTAG dataset có sẵn |
| **Steps** | 1. Vào **Lab** |
| | 2. Chọn Task: **Graph Classification** |
| | 3. Chọn Model: **GAT** |
| | 4. Chọn Dataset: **MUTAG** |
| | 5. Set Epochs: **30** |
| | 6. Nhấn **Start Training** |
| | 7. Chờ hoàn thành |
| **Expected** | Training chạy, hiển thị graph-level predictions |
| **Verify** | - Topology View hiển thị đồ thị con với node contributions |
| | - Metrics: Loss, Accuracy, Confidence Margin |
| | - Attention entropy chart (GAT-specific) |

### TC-09: Chạy Training — Link Prediction

| Mục | Chi tiết |
|---|---|
| **ID** | TC-09 |
| **Tên** | Chạy training Link Prediction với GCN trên Cora |
| **Precondition** | Đã đăng nhập |
| **Steps** | 1. Vào **Lab** |
| | 2. Chọn Task: **Link Prediction** |
| | 3. Chọn Model: **GCN** |
| | 4. Chọn Dataset: **Cora** |
| | 5. Set Epochs: **25** |
| | 6. Nhấn **Start Training** |
| **Expected** | Training chạy, hiển thị edge predictions |
| **Verify** | - Topology View hiển thị cạnh với màu TP/FP/TN/FN |
| | - Metrics: AUC, Loss, Edge Scores |
| | - Top-K predicted links badge |

### TC-10: Chạy Training — Community Detection

| Mục | Chi tiết |
|---|---|
| **ID** | TC-10 |
| **Tên** | Chạy training Community Detection với GraphSAGE trên Karate |
| **Precondition** | Đã đăng nhập |
| **Steps** | 1. Vào **Lab** |
| | 2. Chọn Task: **Community Detection** |
| | 3. Chọn Model: **GraphSAGE** |
| | 4. Chọn Dataset: **Karate** |
| | 5. Set Epochs: **15** |
| | 6. Nhấn **Start Training** |
| **Expected** | Training chạy, hiển thị cộng đồng |
| **Verify** | - Topology View: nút màu theo cộng đồng, bridge nodes |
| | - Metrics: Modularity Q, Silhouette, NMI |
| | - Dendrogram hiển thị hierarchical clustering |

### TC-11: Sử dụng Player — Play/Pause/Seek

| Mục | Chi tiết |
|---|---|
| **ID** | TC-11 |
| **Tên** | Kiểm tra điều khiển Player |
| **Precondition** | Đã chạy training xong (hoặc đang chạy) |
| **Steps** | 1. Nhấn nút **Play** (▶) |
| | 2. Quan sát epoch tự động tăng |
| | 3. Nhấn **Pause** (⏸) |
| | 4. Kéo thanh trượt Seek đến epoch 10 |
| | 5. Nhấn nút **Next** (▶|) |
| | 6. Nhấn nút **Prev** (|◀) |
| | 7. Đổi Speed: **2x** rồi **4x** |
| **Expected** | Player hoạt động mượt, topology/embedding/metrics cập nhật theo epoch |
| **Verify** | - Play: epoch tăng tự động |
| | - Pause: dừng lại |
| | - Seek: nhảy đúng epoch |
| | - Speed 2x: nhanh gấp đôi |
| | - Prev/Next: chuyển đúng ±1 epoch |

### TC-12: Lưu Experiment

| Mục | Chi tiết |
|---|---|
| **ID** | TC-12 |
| **Tên** | Lưu experiment sau training |
| **Precondition** | Đã chạy training xong |
| **Steps** | 1. Nhấn **Save Experiment** |
| | 2. Nhập tên: `GCN Cora 20 epochs` |
| | 3. Nhập ghi chú: `Test run, accuracy ~82%` |
| | 4. Nhấn **Lưu** |
| **Expected** | Experiment được lưu, thông báo thành công |
| **Verify** | Vào **Experiments** → thấy experiment `GCN Cora 20 epochs` trong list |

### TC-13: Replay Experiment

| Mục | Chi tiết |
|---|---|
| **ID** | TC-13 |
| **Tên** | Replay lại experiment đã lưu |
| **Precondition** | Đã lưu ít nhất 1 experiment |
| **Steps** | 1. Vào **Experiments** |
| | 2. Nhấn vào experiment muốn replay |
| | 3. Nhấn **Replay** |
| **Expected** | Hệ thống load lại snapshots, Player hoạt động bình thường |
| **Verify** | Topology/Embedding/Metrics hiển thị đúng như lúc training |

### TC-14: So sánh 2 Experiments

| Mục | Chi tiết |
|---|---|
| **ID** | TC-14 |
| **Tên** | So sánh 2 experiments |
| **Precondition** | Đã lưu ít nhất 2 experiments |
| **Steps** | 1. Vào **Experiments** |
| | 2. Tick chọn 2 experiments |
| | 3. Nhấn **Compare** |
| **Expected** | Hiển thị metrics song song của 2 experiments |
| **Verify** | Loss/Accuracy curves của cả 2 hiện trên cùng 1 chart, dễ so sánh |

### TC-15: Generate Report

| Mục | Chi tiết |
|---|---|
| **ID** | TC-15 |
| **Tên** | Tạo report cho experiment |
| **Precondition** | Đã lưu experiment |
| **Steps** | 1. Vào **Experiments** → nhấn vào 1 experiment |
| | 2. Nhấn **Generate Report** |
| **Expected** | Report được tạo với tóm tắt kết quả |
| **Verify** | Report chứa: task, model, dataset, final metrics, training config |

### TC-16: Admin — Xem Dashboard

| Mục | Chi tiết |
|---|---|
| **ID** | TC-16 |
| **Tên** | Admin xem dashboard tổng quan |
| **Precondition** | Đăng nhập với tài khoản admin |
| **Steps** | 1. Nhấn **Admin** trong sidebar → **Overview** |
| **Expected** | Hiển thị tổng số users, datasets, experiments, active sessions |
| **Verify** | Số liệu đúng với thực tế trong hệ thống |

### TC-17: Admin — Quản lý Users

| Mục | Chi tiết |
|---|---|
| **ID** | TC-17 |
| **Tên** | Admin đổi vai trò người dùng |
| **Precondition** | Đăng nhập admin, có user `testuser1` |
| **Steps** | 1. Vào **Admin** → **Users** |
| | 2. Tìm `testuser1` |
| | 3. Đổi vai trò từ `researcher` → `viewer` |
| | 4. Nhấn **Lưu** |
| **Expected** | Vai trò được cập nhật |
| **Verify** | Đăng nhập `testuser1` → không thấy menu Lab (viewer không được truy cập Lab) |

### TC-18: Route Guard — Viewer không được vào Lab

| Mục | Chi tiết |
|---|---|
| **ID** | TC-18 |
| **Tên** | Kiểm tra route guard cho viewer |
| **Precondition** | Có tài khoản viewer |
| **Steps** | 1. Đăng nhập với vai trò `viewer` |
| | 2. Thử truy cập trực tiếp `/app/lab` |
| **Expected** | Bị redirect về Dashboard hoặc hiển thị "Không có quyền truy cập" |
| **Verify** | Không thể vào Lab, không thấy nút Start Training |

### TC-19: Session Recovery — Mất kết nối WebSocket

| Mục | Chi tiết |
|---|---|
| **ID** | TC-19 |
| **Tên** | Kiểm tra session recovery khi mất kết nối |
| **Precondition** | Đang chạy training |
| **Steps** | 1. Bắt đầu training |
| | 2. Tắt Wi-Fi / ngắt mạng tạm thời |
| | 3. Bật lại Wi-Fi / kết nối mạng |
| **Expected** | Hệ thống tự reconnect WebSocket, tiếp tục nhận snapshots |
| **Verify** | Không mất dữ liệu, training tiếp tục bình thường |

### TC-20: Kiểm tra API Health

| Mục | Chi tiết |
|---|---|
| **ID** | TC-20 |
| **Tên** | Kiểm tra health endpoint |
| **Precondition** | Backend đang chạy |
| **Steps** | 1. Mở trình duyệt, truy cập `http://localhost:8000/api/health` |
| **Expected** | Trả về JSON với status các dịch vụ |
| **Verify** | Response chứa: `mysql: ok`, `mongodb: ok`, `redis: ok`, `blob: ok` |

---

### Test Cases cho Regression (quan trọng)

### TC-R1: End-to-End Flow — Đăng nhập → Training → Lưu → Replay

| Mục | Chi tiết |
|---|---|
| **ID** | TC-R1 |
| **Tên** | Luồng end-to-end hoàn chỉnh |
| **Steps** | 1. Đăng nhập (TC-02) |
| | 2. Vào Lab, chọn Node Classification + GCN + Cora |
| | 3. Start Training (TC-07) |
| | 4. Chờ training xong |
| | 5. Save Experiment (TC-12) |
| | 6. Vào Experiments → Replay (TC-13) |
| | 7. Kiểm tra tất cả panels hiển thị đúng |
| **Expected** | Toàn bộ flow hoạt động không lỗi |

### TC-R2: Switch Tasks — không bị leak state

| Mục | Chi tiết |
|---|---|
| **ID** | TC-R2 |
| **Tên** | Chuyển task không bị lẫn dữ liệu |
| **Steps** | 1. Chạy Node Classification → xong |
| | 2. Chuyển sang Community Detection |
| | 3. Start Training |
| **Expected** | Topology/Embedding/Metrics reset hoàn toàn, không còn dữ liệu task cũ |
| **Verify** | Không thấy node colors hay metrics từ task trước |

### TC-R3: Nhiều Experiments — so sánh cross-task

| Mục | Chi tiết |
|---|---|
| **ID** | TC-R3 |
| **Tên** | So sánh experiments từ các task khác nhau |
| **Steps** | 1. Lưu experiment Node Classification |
| | 2. Lưu experiment Graph Classification |
| | 3. Chọn cả 2 → Compare |
| **Expected** | Hệ thống báo lỗi hoặc chỉ so sánh được cùng task |
| **Verify** | Không crash, thông báo rõ ràng |

---

## Phụ lục: Danh sách API Endpoints

Xem thêm tại `http://localhost:8000/docs` (Swagger UI).

<details>
<summary>Click để mở danh sách đầy đủ</summary>

**Auth:** `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`

**Projects:** `POST/GET /api/projects`, `GET/PATCH /api/projects/{id}`

**Datasets:** `POST/GET /api/datasets`, `GET /api/datasets/{id}`, `POST /api/datasets/{id}/versions`, `POST /api/datasets/{id}/publish`, `POST /api/datasets/{id}/deprecate`

**Sessions:** `POST/GET /api/sessions`, `GET /api/sessions/{id}`, `GET /api/sessions/{id}/resume`, `PATCH /api/sessions/{id}`, `POST /api/sessions/{id}/stop`

**Experiments:** `POST/GET /api/experiments`, `GET /api/experiments/{id}`, `POST /api/experiments/{id}/replay`, `POST /api/experiments/compare`, `PATCH /api/experiments/{id}`, `GET /api/experiments/{id}/report`, `DELETE /api/experiments/{id}`

**Admin:** `GET /api/admin/summary`, `GET /api/admin/users`, `PATCH /api/admin/users/{id}/role`, `GET /api/admin/datasets`, `GET /api/admin/experiments`, `GET /api/admin/sessions`, `GET /api/admin/audit-logs`, `POST /api/admin/retention`, `POST /api/admin/blob-cleanup`

**Training:** `WS /ws/train`

**Health:** `GET /api/health`, `GET /metrics`

</details>

---

## Phụ lục: Cấu trúc thư mục frontend

```
frontend/src/
├── components/
│   ├── Admin/           # Admin console components
│   ├── Auth/            # Login/Register forms
│   ├── ConfigPanel/     # Training config UI
│   ├── EmbeddingView/   # PCA/t-SNE scatter plots
│   ├── Lab/             # LabShell — main workspace
│   ├── Library/         # Project library (legacy)
│   ├── MetricsChart/    # Task-specific metrics panels
│   ├── Shell/           # App shell, sidebar, layouts
│   ├── TopologyView/    # Force-directed graph views
│   ├── UploadPanel/     # Dataset upload UI
│   ├── Workspace/       # Dataset config workspace
│   ├── primitives/      # Reusable UI primitives
│   └── ui/              # Generic UI components
├── contracts/           # WS message schemas (mirror backend)
├── hooks/               # useWebSocket hook
├── layouts/             # Route layouts (Admin, App, Public)
├── pages/               # Route pages
├── store/               # Zustand stores
├── utils/               # API helpers, colors, metrics math
└── theme/               # Design tokens
```

---

*Tài liệu này được tạo tự động từ phân tích codebase ngày 2026-05-06.*
*Cập nhật khi có thay đổi lớn trong dự án.*
