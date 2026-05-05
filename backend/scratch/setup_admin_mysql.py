from sqlalchemy import create_engine, text
from passlib.context import CryptContext
import os

mysql_url = os.getenv("MYSQL_URL", "mysql+pymysql://root:@127.0.0.1:3306/gnn_db")
engine = create_engine(mysql_url)
pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')
hashed = pwd_context.hash('admin123')

with engine.connect() as conn:
    # Check if admin exists
    result = conn.execute(text("SELECT id FROM users WHERE username='admin'"))
    user = result.fetchone()
    
    if user:
        conn.execute(text("UPDATE users SET role='admin', hashed_password=:hp WHERE username='admin'"), {"hp": hashed})
        print("Updated existing admin user in MySQL.")
    else:
        conn.execute(text("""
            INSERT INTO users (email, username, hashed_password, full_name, role, is_active, is_superuser, created_at)
            VALUES ('admin@example.com', 'admin', :hp, 'System Admin', 'admin', 1, 1, NOW())
        """), {"hp": hashed})
        print("Created new admin user in MySQL.")
    conn.commit()
