import sqlalchemy
from sqlalchemy import create_engine

def debug_mysql(url):
    print(f"Testing: {url}")
    try:
        engine = create_engine(url, connect_args={"connect_timeout": 5})
        conn = engine.connect()
        print(" [OK] Connected!")
        # Check databases
        res = conn.execute(sqlalchemy.text("SHOW DATABASES"))
        dbs = [r[0] for r in res]
        print(f" Databases found: {dbs}")
        conn.close()
        return True
    except Exception as e:
        print(f" [FAIL] Error: {e}")
        return False

# Try common XAMPP strings
urls = [
    "mysql+pymysql://gnn_user:gnn_password@127.0.0.1:3307/gnn_db",
    "mysql+pymysql://root@127.0.0.1:3307/gnn_db",
    "mysql+pymysql://root@127.0.0.1:3307/",
    "mysql+pymysql://root@127.0.0.1:3306/",
]

if __name__ == "__main__":
    for url in urls:
        if debug_mysql(url): break
