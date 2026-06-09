#!/bin/bash
echo "=== Khởi động GNN-Insight Backend ==="
echo "Đang cấu hình kết nối Database (Local Docker)..."

export MYSQL_URL="mysql+pymysql://root:root@127.0.0.1:3344/gnn_db"
export MONGO_URI="mongodb://admin:password@127.0.0.1:27017/"
export REDIS_URL="redis://127.0.0.1:6379/0"

echo "MySQL: $MYSQL_URL"
echo "MongoDB: $MONGO_URI"
echo "Redis: $REDIS_URL"

cd backend
if [ -d "venv" ]; then
    echo "Phát hiện môi trường ảo, đang kích hoạt..."
    source venv/bin/activate
fi

echo "Khởi chạy server..."
python3 main.py || python main.py
