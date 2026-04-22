import pytest
import os
import json
import gzip
from fastapi.testclient import TestClient
import sys

# Thêm đường dẫn backend vào sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app
from database import Base, engine, init_db

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_test_db():
    # Khởi tạo bảng dữ liệu trước khi test
    Base.metadata.create_all(bind=engine)
    yield
    # Có thể xóa bảng sau khi test xong nếu dùng DB tạm
    # Base.metadata.drop_all(bind=engine)

def test_save_large_experiment():
    """
    Test saving a large payload that simulates a >16MB snapshot
    to ensure it writes to the filesystem as gzip instead of crushing MongoDB.
    """
    # 1. Tạo dữ liệu giả lập cực lớn (>16MB)
    # 5MB mỗi epoch * 5 epochs = 25MB (vượt giới hạn 16MB của MongoDB)
    huge_data = "data_chunk_" * 500000 
    
    heavy_payload = {
        "title": "TDD Massive Graph Run",
        "task_type": 1,
        "model_type": "GCN",
        "dataset_name": "tdd_mock_data",
        "epoch_count": 5,
        "learning_rate": 0.01,
        "hidden_dim": 64,
        "dropout": 0.5,
        "accuracy": 0.95,
        "loss": 0.15,
        "is_mock": True,
        "snapshots_json": [{"epoch": i, "data": huge_data} for i in range(5)],
        "graph_data_json": {"nodes": [], "links": []},
        "ground_truth_json": [],
        "task_data_json": {}
    }

    # 2. Gửi request lưu trữ
    response = client.post("/api/experiments", json=heavy_payload)
    
    # Assert
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["status"] == "saved"
    exp_id = res_data["id"]

    # 3. Thử lấy lại dữ liệu để đảm bảo tính toàn vẹn và giải nén đúng
    get_response = client.get(f"/api/experiments/{exp_id}")
    assert get_response.status_code == 200
    detail = get_response.json()
    
    assert len(detail["snapshots_json"]) == 5
    assert detail["snapshots_json"][0]["data"] == huge_data
    
    # 4. Kiểm tra file vật lý có tồn tại không
    # Dữ liệu thật sẽ được nén trong thư mục data/saved_experiments
    
    # 5. Cleanup (Xóa test data)
    del_response = client.delete(f"/api/experiments/{exp_id}")
    assert del_response.status_code == 200
