import sys
import os

# Thêm đường dẫn gốc vào python path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from database import SessionLocal
from models.sql_models import User

db = SessionLocal()
users = db.query(User).all()
print(f"Total users: {len(users)}")
for u in users:
    print(f"ID: {u.id}, Username: {u.username}, Role: {u.role}, Superuser: {u.is_superuser}")
db.close()
