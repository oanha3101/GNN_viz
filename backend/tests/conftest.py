import os
import shutil
import sys
from pathlib import Path

import pytest
from sqlalchemy.orm import close_all_sessions


TESTS_DIR = Path(__file__).resolve().parent
BACKEND_DIR = TESTS_DIR.parent
TEST_RUNTIME_DIR = TESTS_DIR / ".runtime"
TEST_DB_PATH = TEST_RUNTIME_DIR / "gnn_test.sqlite3"
TEST_SNAPSHOT_DIR = TEST_RUNTIME_DIR / "snapshots"
TEST_MONGO_FALLBACK_DIR = TEST_RUNTIME_DIR / "mongo_fallback"
TEST_BLOB_DIR = TEST_RUNTIME_DIR / "blob_store"

TEST_RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(BACKEND_DIR))

os.environ["MYSQL_URL"] = f"sqlite:///{TEST_DB_PATH.resolve().as_posix()}"
os.environ["MONGO_URI"] = "mongodb://127.0.0.1:1/"
os.environ["REDIS_URL"] = "redis://127.0.0.1:1/0"
os.environ.setdefault("DISABLE_AUTH", "0")

from database import Base, SessionLocal, engine  # noqa: E402
from core import session_manager as session_manager_module  # noqa: E402
from services import hybrid_store  # noqa: E402


def _reset_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def _reset_sqlite_db_file() -> None:
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()


def _clear_relational_tables() -> None:
    # Delete in a stable order to avoid SQLAlchemy sorted-table warnings caused by the
    # dataset <-> current_version cycle that exists in the product schema.
    ordered_table_names = [
        "audit_logs",
        "session_snapshots",
        "training_sessions",
        "experiments",
        "dataset_versions",
        "datasets",
        "projects",
        "users",
    ]

    with engine.begin() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        try:
            for table_name in ordered_table_names:
                table = Base.metadata.tables.get(table_name)
                if table is not None:
                    connection.execute(table.delete())
        finally:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")


session_manager_module.SNAPSHOT_DIR = str(TEST_SNAPSHOT_DIR)
os.makedirs(session_manager_module.SNAPSHOT_DIR, exist_ok=True)
hybrid_store.LOCAL_MONGO_FALLBACK_DIR = str(TEST_MONGO_FALLBACK_DIR)
hybrid_store.LOCAL_BLOB_DIR = str(TEST_BLOB_DIR)
os.makedirs(hybrid_store.LOCAL_MONGO_FALLBACK_DIR, exist_ok=True)
os.makedirs(hybrid_store.LOCAL_BLOB_DIR, exist_ok=True)


@pytest.fixture(scope="session", autouse=True)
def initialize_test_runtime():
    _reset_dir(TEST_SNAPSHOT_DIR)
    _reset_dir(TEST_MONGO_FALLBACK_DIR)
    _reset_dir(TEST_BLOB_DIR)
    close_all_sessions()
    engine.dispose()
    _reset_sqlite_db_file()

    Base.metadata.create_all(bind=engine)

    yield

    close_all_sessions()
    engine.dispose()


@pytest.fixture(autouse=True)
def isolate_test_state():
    Base.metadata.create_all(bind=engine)
    yield

    close_all_sessions()
    _clear_relational_tables()

    session_manager_module.session_manager._active_sessions.clear()
    _reset_dir(TEST_SNAPSHOT_DIR)
    _reset_dir(TEST_MONGO_FALLBACK_DIR)
    _reset_dir(TEST_BLOB_DIR)
