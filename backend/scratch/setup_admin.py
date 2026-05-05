from passlib.context import CryptContext
import sqlite3
import os

db_path = 'backend/gnn_insight.db'
if not os.path.exists(db_path):
    print(f"Error: {db_path} not found")
    exit(1)

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')
hashed = pwd_context.hash('admin123')

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Check if admin exists
cursor.execute('SELECT id FROM users WHERE username="admin"')
user = cursor.fetchone()

if user:
    cursor.execute('UPDATE users SET role="admin", hashed_password=? WHERE username="admin"', (hashed,))
    print(f"Updated existing admin user. Username: admin, Password: admin123")
else:
    cursor.execute('''
        INSERT INTO users (email, username, hashed_password, full_name, role, is_active, is_superuser, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ''', ('admin@example.com', 'admin', hashed, 'System Admin', 'admin', 1, 1))
    print(f"Created new admin user. Username: admin, Password: admin123")

conn.commit()
conn.close()
