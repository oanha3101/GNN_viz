import os
from dotenv import load_dotenv
from sqlalchemy.engine import make_url

load_dotenv()

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

try:
    import redis
except ImportError:
    redis = None

try:
    from pymongo import ASCENDING, MongoClient
except ImportError:
    ASCENDING = 1
    MongoClient = None

# 1. MySQL (Relational metadata)
Base = declarative_base()

MYSQL_URL = os.getenv("MYSQL_URL", "mysql+pymysql://root:root@127.0.0.1:3344/gnn_db")
STRICT_RUNTIME_STACK = os.getenv("REQUIRE_RUNTIME_STACK", "0") == "1"
mysql_fallback_active = False

try:
    engine = create_engine(MYSQL_URL, pool_pre_ping=True)
    engine.connect().close()
except Exception:
    print("Warning: MySQL connection failed, falling back to SQLite.")
    engine = create_engine("sqlite:///./gnn_insight.db", connect_args={"check_same_thread": False})
    mysql_fallback_active = True

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class NullCollection:
    def find_one(self, *args, **kwargs):
        return None

    def find(self, *args, **kwargs):
        return []

    def create_index(self, *args, **kwargs):
        return None

    def update_one(self, *args, **kwargs):
        return None

    def delete_many(self, *args, **kwargs):
        return None


class NullRedisClient:
    def ping(self):
        return False

    def set(self, *args, **kwargs):
        return False

    def get(self, *args, **kwargs):
        return None


# 2. MongoDB (Replay payloads, metrics, graph JSON)
MONGO_URI = os.getenv("MONGO_URI", "mongodb://admin:password@localhost:27017/")
mongo_available = False
if MongoClient is None:
    print("Warning: PyMongo not installed. Mongo-backed replay will use local fallbacks.")
    mongo_client = None
    mongo_experiment_snapshots = NullCollection()
    mongo_experiment_metrics = NullCollection()
    mongo_graph_payloads = NullCollection()
else:
    mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=2000)
    try:
        mongo_client.server_info()
        mongo_available = True
    except Exception:
        print("Warning: MongoDB connection failed. Mongo-backed replay will use local fallbacks.")

    mongo_db = mongo_client["gnn_insight"]
    mongo_experiment_snapshots = mongo_db["experiment_snapshots"]
    mongo_experiment_metrics = mongo_db["experiment_metrics"]
    mongo_graph_payloads = mongo_db["graph_payloads"]


def ensure_mongo_indexes():
    if not mongo_available:
        return
    mongo_experiment_snapshots.create_index(
        [("run_id", ASCENDING), ("epoch", ASCENDING)],
        unique=True,
        name="uq_run_epoch",
    )
    mongo_experiment_snapshots.create_index(
        [("project_id", ASCENDING), ("created_at", ASCENDING)],
        name="idx_snapshot_project_created",
    )
    mongo_experiment_metrics.create_index(
        [("project_id", ASCENDING), ("created_at", ASCENDING)],
        name="idx_metrics_project_created",
    )
    mongo_experiment_metrics.create_index(
        [("task_type", ASCENDING), ("model_type", ASCENDING), ("created_at", ASCENDING)],
        name="idx_metrics_task_model_created",
    )
    mongo_graph_payloads.create_index(
        [("experiment_id", ASCENDING)],
        unique=True,
        name="uq_graph_payload_experiment",
    )


# 3. Redis (Ephemeral cache)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
redis_available = False
if redis is None:
    print("Warning: redis package not installed. Redis cache disabled.")
    redis_client = NullRedisClient()
else:
    redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=False)
    try:
        redis_client.ping()
        redis_available = True
    except Exception:
        print("Warning: Redis connection failed.")
        redis_client = NullRedisClient()


def _safe_engine_url() -> str:
    try:
        return str(make_url(str(engine.url)))
    except Exception:
        return str(engine.url)


def get_runtime_status() -> dict:
    return {
        "strict_runtime_stack": STRICT_RUNTIME_STACK,
        "mysql": {
            "configured_url": MYSQL_URL,
            "engine_url": _safe_engine_url(),
            "available": not mysql_fallback_active,
            "fallback_active": mysql_fallback_active,
            "driver": engine.dialect.name,
        },
        "mongo": {
            "configured_url": MONGO_URI,
            "available": mongo_available,
            "fallback_active": not mongo_available,
        },
        "redis": {
            "configured_url": REDIS_URL,
            "available": redis_available,
            "fallback_active": not redis_available,
        },
    }


def validate_runtime_requirements(require_runtime_stack: bool | None = None) -> dict:
    status = get_runtime_status()
    require_runtime_stack = STRICT_RUNTIME_STACK if require_runtime_stack is None else require_runtime_stack
    if not require_runtime_stack:
        return status

    degraded_services = []
    if status["mysql"]["fallback_active"]:
        degraded_services.append("mysql")
    if status["mongo"]["fallback_active"]:
        degraded_services.append("mongo")
    if status["redis"]["fallback_active"]:
        degraded_services.append("redis")

    if degraded_services:
        joined = ", ".join(degraded_services)
        raise RuntimeError(
            f"Runtime stack is incomplete in strict mode. Degraded services: {joined}."
        )
    return status


def init_db():
    from models.sql_models import (
        AuditLog,
        Dataset,
        DatasetVersion,
        Experiment,
        Project,
        SessionSnapshot,
        TrainingSession,
        User,
    )

    Base.metadata.create_all(bind=engine)
    ensure_mongo_indexes()
    print("Relational Database initialized.")


if __name__ == "__main__":
    init_db()
