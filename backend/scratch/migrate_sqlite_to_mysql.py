import sqlalchemy
from sqlalchemy import create_engine, text
import json

# EXACT ABSOLUTE PATH
SQLITE_PATH = "/Users/nguyenthanhhuyen/Downloads/TEST_GNN-oanh/backend/gnn_insight.db"
SQLITE_URL = f"sqlite:///{SQLITE_PATH}"
MYSQL_URL = "mysql+pymysql://root@127.0.0.1:3307/gnn_insight"

def migrate():
    print(f"Starting Robust SQL Migration: {SQLITE_URL} -> {MYSQL_URL}")
    
    sqlite_engine = create_engine(SQLITE_URL)
    mysql_engine = create_engine(MYSQL_URL)
    
    tables = ['users', 'projects', 'experiments']
    
    with sqlite_engine.connect() as sqlite_conn:
        for table in tables:
            print(f" [+] Migrating {table}...")
            # Fetch
            rows = sqlite_conn.execute(text(f"SELECT * FROM {table}")).mappings().all()
            print(f"     Found {len(rows)} rows.")
            
            if not rows: continue
            
            # Insert with clean connection per table or row
            with mysql_engine.connect() as mysql_conn:
                for row in rows:
                    d = dict(row)
                    # Serialize JSON
                    for k, v in d.items():
                        if k.endswith('_json') and v is not None:
                            if not isinstance(v, (str, int, float, bool)):
                                d[k] = json.dumps(v)
                    
                    cols = ", ".join(d.keys())
                    placeholders = ", ".join([f":{k}" for k in d.keys()])
                    stmt = text(f"INSERT INTO {table} ({cols}) VALUES ({placeholders})")
                    
                    try:
                        mysql_conn.execute(stmt, d)
                        mysql_conn.commit()
                    except Exception as e:
                        # Rollback the local transaction error state
                        mysql_conn.rollback()
                        if "Duplicate entry" not in str(e):
                            print(f" [!] Error in row {d.get('id')}: {e}")
                
                print(f" [OK] {table} finished.")

    print("Migration Finished Successfully!")

if __name__ == "__main__":
    migrate()
