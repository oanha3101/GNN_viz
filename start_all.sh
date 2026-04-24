#!/bin/bash

# Hàm xử lý khi nhấn Ctrl+C để tắt cả FE và BE
cleanup() {
    echo ""
    echo "=== Đang dừng GNN-Insight... ==="
    kill $BE_PID $FE_PID
    exit
}

trap cleanup SIGINT

echo "=== Khởi động GNN-Insight Unified (FE + BE) ==="

# 1. Cấu hình Database
export MYSQL_URL="mysql+pymysql://root:root@127.0.0.1:3344/gnn_db"
export MONGO_URI="mongodb://admin:password@127.0.0.1:27017/"
export REDIS_URL="redis://127.0.0.1:6379/0"

# 2. Khởi động Backend (chạy ngầm)
echo "--- [BE] Đang khởi động Backend... ---"
cd backend
if [ -d "venv" ]; then
    source venv/bin/activate
fi

if command -v python3 >/dev/null 2>&1; then
    python3 main.py &
else
    python main.py &
fi
BE_PID=$!
cd ..

# Đợi một chút để BE khởi động xong database
sleep 3

# 3. Khởi động Frontend
echo "--- [FE] Đang khởi động Frontend... ---"
(
    cd frontend
    npm run dev
) &
FE_PID=$!

echo ""
echo ">>> Hệ thống đã sẵn sàng!"
echo ">>> Backend: http://localhost:8000"
echo ">>> Frontend: Kiểm tra link ở trên (thường là http://localhost:5173)"
echo ">>> Nhấn Ctrl+C để dừng toàn bộ hệ thống."
echo ""

# Giữ script chạy để trap SIGINT hoạt động
wait
