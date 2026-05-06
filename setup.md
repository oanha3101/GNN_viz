# Setup Local cho GNN-Insight

Tai lieu nay mo ta duong chay local chuan cua repo tren Windows.

## 1. Khoi dong ha tang

Chay tu thu muc goc:

```powershell
docker-compose up -d
```

Stack mac dinh:

- MySQL: `127.0.0.1:3344`
- MongoDB: `127.0.0.1:27017`
- Redis: `127.0.0.1:6379`
- MinIO API: `127.0.0.1:9000`
- MinIO Console: `http://127.0.0.1:9001`
- phpMyAdmin: `http://127.0.0.1:8080`

Kiem tra nhanh:

```powershell
docker-compose ps
```

## 2. Cai backend

```powershell
cd backend
python -m pip install -r requirements.txt
```

Neu truoc do backend bao thieu `PyMongo` hoac `redis`, lenh tren se cai dung
dependency theo repo.

## 3. Chay backend

```powershell
cd backend
python main.py
```

Backend mac dinh chay tai `http://127.0.0.1:8000`.

Mot so bien moi truong local quan trong trong `backend/.env`:

```env
MYSQL_URL=mysql+pymysql://root:root@127.0.0.1:3344/gnn_db
MONGO_URI=mongodb://admin:password@127.0.0.1:27017/
REDIS_URL=redis://127.0.0.1:6379/0
```

## 4. Chay frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend mac dinh chay tai `http://127.0.0.1:5173`.

## 5. Dong bo schema MySQL khi can

Neu database cu chua co du bang hoac cot moi:

```powershell
Get-Content backend/sql/mysql_schema_sync.sql -Raw | mysql -h 127.0.0.1 -P 3344 -u root -proot gnn_db
```

Neu database cu co constraint hoac index legacy bi trung:

```powershell
Get-Content backend/sql/mysql_schema_cleanup_legacy_constraints.sql -Raw | mysql -h 127.0.0.1 -P 3344 -u root -proot gnn_db
```

## 6. Xem bang MySQL

Co hai cach nhanh:

1. phpMyAdmin: `http://127.0.0.1:8080`
2. CLI:

```powershell
mysql -h 127.0.0.1 -P 3344 -u root -proot gnn_db
```

## 7. Chay full test va build

Tu thu muc goc:

```powershell
.\scripts\verify_all.ps1
```

Script nay chay:

- `pytest backend/tests -q`
- `npm test`
- `npm run build`

## 8. Check runtime stack

```powershell
.\scripts\check_runtime.ps1
```

Script nay check nhanh:

- MySQL
- MongoDB
- Redis
- MinIO
- phpMyAdmin
- backend `/api/health`

## 9. Smoke check toi thieu

Sau khi boot xong, nen kiem tra:

1. `GET /api/health`
2. `GET /api/auth/me`
3. `GET /api/experiments`
4. dang nhap vao frontend roi kiem tra route `/app/dashboard` hoac `/admin/overview`
