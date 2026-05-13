import logging
import os
import sys
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import declarative_base, sessionmaker

logger = logging.getLogger(__name__)

load_dotenv()

try:
    import redis  # type: ignore
except ImportError:
    redis = None

try:
    from pymongo import ASCENDING, MongoClient  # type: ignore
except ImportError:
    ASCENDING = 1
    MongoClient = None

# 1. MySQL (Relational metadata)
Base = declarative_base()

MYSQL_URL = os.getenv("MYSQL_URL", "mysql+pymysql://root:root@127.0.0.1:3344/gnn_db")
STRICT_RUNTIME_STACK = os.getenv("REQUIRE_RUNTIME_STACK", "1") == "1"
mysql_fallback_active = False

try:
    # Explicitly check for MySQL connection if configured
    if "mysql" in MYSQL_URL:
        # We use a temporary engine to check if database exists
        base_url = MYSQL_URL.rsplit('/', 1)[0] + '/'
        temp_engine = create_engine(base_url, pool_pre_ping=True)
        with temp_engine.connect() as conn:
            db_name = MYSQL_URL.rsplit('/', 1)[1]
            # Use AUTOCOMMIT for DDL
            conn.execution_options(isolation_level="AUTOCOMMIT").execute(
                text(f"CREATE DATABASE IF NOT EXISTS {db_name}")
            )
        temp_engine.dispose()
    
    engine = create_engine(MYSQL_URL, pool_pre_ping=True)
    engine.connect().close()
    logger.info(f"✅ Connected to MySQL: {MYSQL_URL}")
except Exception as e:
    if STRICT_RUNTIME_STACK:
        logger.error(f"❌ CRITICAL: MySQL connection failed and STRICT_RUNTIME_STACK is enabled: {e}")
        sys.exit(1)
    logger.warning(f"⚠️ Warning: MySQL connection failed, falling back to SQLite: {e}")
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
        return self

    def sort(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def __iter__(self):
        return iter([])

    def create_index(self, *args, **kwargs):
        return None

    def update_one(self, *args, **kwargs):
        return None

    def insert_one(self, *args, **kwargs):
        return None

    def delete_one(self, *args, **kwargs):
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

    def delete(self, *args, **kwargs):
        return 0


# 2. MongoDB (Replay payloads, metrics, graph JSON)
MONGO_URI = os.getenv("MONGO_URI", "mongodb://admin:password@localhost:27017/")
mongo_available = False
if MongoClient is None:
    logger.warning("PyMongo not installed. Mongo-backed replay will use local fallbacks.")
    mongo_client = None
    mongo_experiment_snapshots = NullCollection()
    mongo_experiment_metrics = NullCollection()
    mongo_graph_payloads = NullCollection()
else:
    mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=2000)
    try:
        mongo_client.server_info()
        mongo_available = True
        logger.info(f"✅ Connected to MongoDB: {MONGO_URI}")
    except Exception as e:
        if STRICT_RUNTIME_STACK:
            logger.error(f"❌ CRITICAL: MongoDB connection failed and STRICT_RUNTIME_STACK is enabled: {e}")
            sys.exit(1)
        logger.warning(f"⚠️ Warning: MongoDB connection failed, falling back to local files: {e}")
        mongo_available = False

    mongo_db = mongo_client["gnn_insight"] if mongo_available and mongo_client else None
    if mongo_available and mongo_db:
        mongo_experiment_snapshots = mongo_db["experiment_snapshots"]
        mongo_experiment_metrics = mongo_db["experiment_metrics"]
        mongo_graph_payloads = mongo_db["graph_payloads"]
    else:
        mongo_experiment_snapshots = NullCollection()
        mongo_experiment_metrics = NullCollection()
        mongo_graph_payloads = NullCollection()


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
    logger.warning("redis package not installed. Redis cache disabled.")
    redis_client = NullRedisClient()
else:
    redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=False)
    try:
        redis_client.ping()
        redis_available = True
        logger.info(f"✅ Connected to Redis: {REDIS_URL}")
    except Exception as e:
        if STRICT_RUNTIME_STACK:
            logger.error(f"❌ CRITICAL: Redis connection failed and STRICT_RUNTIME_STACK is enabled: {e}")
            sys.exit(1)
        logger.warning(f"⚠️ Warning: Redis connection failed, falling back to in-memory: {e}")
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


def _validate_env_config() -> None:
    """Warn about missing or insecure env config at startup."""
    warnings = []

    jwt_secret = os.getenv("JWT_SECRET", "")
    if not jwt_secret or jwt_secret == "gnn-insight-dev-secret-key-change-in-production":
        warnings.append("JWT_SECRET is using the default value - change it for production")

    disable_auth = os.getenv("DISABLE_AUTH", "0")
    if disable_auth == "1":
        warnings.append("DISABLE_AUTH=1 - authentication is disabled")

    cors_origins = os.getenv("CORS_ORIGINS", "")
    if "*" in cors_origins:
        warnings.append("CORS_ORIGINS contains wildcard '*' - restrict it for production")

    blob_provider = os.getenv("BLOB_STORE_PROVIDER", "local")
    if blob_provider == "local":
        warnings.append("BLOB_STORE_PROVIDER=local - using local disk instead of MinIO/S3")

    for warning in warnings:
        logger.warning("[CONFIG] %s", warning)


def _log_startup_status() -> None:
    """Log a clear summary of runtime stack status at startup."""
    degraded = []
    if mysql_fallback_active:
        degraded.append("MySQL (using SQLite fallback)")
    if not mongo_available:
        degraded.append("MongoDB (using local JSON fallback)")
    if not redis_available:
        degraded.append("Redis (cache disabled)")

    if degraded:
        logger.warning(
            "[RUNTIME] Degraded mode - %s. "
            "Set REQUIRE_RUNTIME_STACK=0 in .env to suppress strict-mode failures.",
            ", ".join(degraded),
        )
    else:
        logger.info("[RUNTIME] All services healthy (MySQL, MongoDB, Redis).")


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
    # Satisfy linters that complain about unused imports used for metadata registration
    _ = [AuditLog, Dataset, DatasetVersion, Experiment, Project, SessionSnapshot, TrainingSession, User]
    ensure_mongo_indexes()
    logger.info("Relational Database initialized.")
    _validate_env_config()
    _log_startup_status()


if __name__ == "__main__":
    init_db()
