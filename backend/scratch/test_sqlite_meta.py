import sqlalchemy
from sqlalchemy import create_engine, MetaData

SQLITE_PATH = "/Users/nguyenthanhhuyen/Downloads/TEST_GNN-oanh/backend/gnn_insight.db"
SQLITE_URL = f"sqlite:///{SQLITE_PATH}"

def test_sqlite():
    engine = create_engine(SQLITE_URL)
    meta = MetaData()
    meta.reflect(bind=engine)
    print(f"Tables found in SQLite: {list(meta.tables.keys())}")

if __name__ == "__main__":
    test_sqlite()
