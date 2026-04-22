import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from database import engine, mongo_client, redis_client, mongo_available

def check_standard():
    print("=== GNN-Insight Standard Check ===")
    
    # 1. SQL Check
    try:
        conn = engine.connect()
        print(f"[OK] SQL Connection: {engine.url}")
        conn.close()
    except Exception as e:
        print(f"[FAIL] SQL Connection: {e}")

    # 2. MongoDB Check
    if mongo_available:
        print("[OK] MongoDB: Connected")
    else:
        print("[FAIL] MongoDB: Not reachable (using SQL fallback)")

    # 3. Redis Check
    try:
        redis_client.ping()
        print("[OK] Redis: Connected")
    except Exception as e:
        print(f"[FAIL] Redis: Not reachable: {e}")

if __name__ == "__main__":
    check_standard()
