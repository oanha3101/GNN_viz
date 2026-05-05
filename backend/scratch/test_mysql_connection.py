import sqlalchemy
from sqlalchemy import create_engine, text

urls = [
    "mysql+pymysql://root:root@127.0.0.1:3306/gnn_db",
    "mysql+pymysql://root:@127.0.0.1:3306/gnn_db",
    "mysql+pymysql://root:root@127.0.0.1:3306/",
    "mysql+pymysql://root:@127.0.0.1:3306/",
]

for url in urls:
    try:
        engine = create_engine(url)
        with engine.connect() as conn:
            print(f"[SUCCESS] Connected to {url}")
            if "gnn_db" not in url:
                # Try to create database
                conn.execute(text("CREATE DATABASE IF NOT EXISTS gnn_db"))
                print("[INFO] Created database gnn_db")
        break
    except Exception as e:
        print(f"[FAIL] {url}: {e}")
