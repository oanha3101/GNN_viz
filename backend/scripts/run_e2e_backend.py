import os
import pathlib
import sys

import uvicorn


def main() -> None:
    backend_root = pathlib.Path(__file__).resolve().parents[1]
    os.chdir(backend_root)
    if str(backend_root) not in sys.path:
        sys.path.insert(0, str(backend_root))
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

    db_path = backend_root / "e2e_gnn.db"
    if db_path.exists():
        db_path.unlink()

    os.environ.setdefault("DISABLE_AUTH", "0")
    os.environ.setdefault("JWT_SECRET", "e2e-secret-key")
    os.environ.setdefault("REQUIRE_RUNTIME_STACK", "0")
    os.environ.setdefault("MYSQL_URL", "sqlite:///./e2e_gnn.db")
    os.environ.setdefault("MONGO_URI", "mongodb://invalid-host:27017/")
    os.environ.setdefault("REDIS_URL", "redis://invalid-host:6379/0")
    os.environ.setdefault("BLOB_STORE_PROVIDER", "local")
    os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000")

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)


if __name__ == "__main__":
    main()
