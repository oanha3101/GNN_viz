import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from pymongo import MongoClient
import redis

# ── 1. MySQL (Relational Meta-data) ──────────────────────────────────────────
Base = declarative_base()

MYSQL_URL = os.getenv("MYSQL_URL", "mysql+pymysql://root@127.0.0.1:3307/gnn_insight")

# Fallback to SQLite if MySQL fails or isn't needed locally
try:
    engine = create_engine(MYSQL_URL, pool_pre_ping=True)
    engine.connect().close()
except Exception:
    print("Warning: MySQL connection failed, falling back to SQLite.")
    engine = create_engine("sqlite:///./gnn_insight.db", connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    from models.sql_models import User, Project, Experiment
    Base.metadata.create_all(bind=engine)
    print("Relational Database initialized.")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ── 2. MongoDB (JSON Blobs & Documents) ─────────────────────────────────────
MONGO_URI = os.getenv("MONGO_URI", "mongodb://admin:password@localhost:27017/")
mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=2000)
mongo_available = False
try:
    mongo_client.server_info()
    mongo_available = True
except Exception:
    print("Warning: MongoDB connection failed. Falling back to SQL for JSON storage.")
    
mongo_db = mongo_client["gnn_insight"]
mongo_experiments = mongo_db["experiments"]

# ── 3. Redis (Caching & Queue) ─────────────────────────────────────────────
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=False)
try:
    redis_client.ping()
except Exception:
    print("Warning: Redis connection failed.")

if __name__ == "__main__":
    init_db()
