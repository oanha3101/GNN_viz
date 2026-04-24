"""
JWT Auth — register, login, get current user.
Supports DISABLE_AUTH=1 env var for development.
"""
import os
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from passlib.context import CryptContext

from database import get_db
from models.sql_models import User

logger = logging.getLogger(__name__)

# ── Config ───────────────────────────────────────────────────────────────────
SECRET_KEY = os.getenv("JWT_SECRET", "gnn-insight-dev-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))  # 24h default
DISABLE_AUTH = os.getenv("DISABLE_AUTH", "1") == "1"

# Try to import jose; if not available, use a simple fallback
try:
    from jose import jwt, JWTError
    HAS_JOSE = True
except ImportError:
    HAS_JOSE = False
    import hashlib
    import json
    import base64
    logger.warning("python-jose not installed. Using basic token fallback.")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Pydantic Models ──────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    username: str
    password: str
    full_name: Optional[str] = None


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    full_name: Optional[str]
    is_active: bool


# ── Helpers ──────────────────────────────────────────────────────────────────

def create_access_token(data: dict) -> str:
    """Create JWT access token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})

    if HAS_JOSE:
        return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    else:
        # Simple fallback token (NOT for production)
        payload = json.dumps(to_encode, default=str)
        sig = hashlib.sha256(f"{payload}{SECRET_KEY}".encode()).hexdigest()[:16]
        token = base64.urlsafe_b64encode(payload.encode()).decode() + "." + sig
        return token


def decode_token(token: str) -> Optional[dict]:
    """Decode and verify JWT token."""
    try:
        if HAS_JOSE:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            return payload
        else:
            parts = token.rsplit(".", 1)
            if len(parts) != 2:
                return None
            payload_b64, sig = parts
            payload_str = base64.urlsafe_b64decode(payload_b64).decode()
            expected_sig = hashlib.sha256(f"{payload_str}{SECRET_KEY}".encode()).hexdigest()[:16]
            if sig != expected_sig:
                return None
            return json.loads(payload_str)
    except Exception:
        return None


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """
    Dependency to get current user from JWT.
    If DISABLE_AUTH=1, returns None (anonymous access allowed).
    """
    if DISABLE_AUTH:
        return None

    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    user = db.query(User).filter_by(id=int(user_id)).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Like get_current_user but returns None instead of raising 401."""
    if DISABLE_AUTH:
        return None
    if not credentials:
        return None
    payload = decode_token(credentials.credentials)
    if not payload:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    return db.query(User).filter_by(id=int(user_id), is_active=True).first()


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse)
async def register(req: RegisterRequest, db: Session = Depends(get_db)):
    """Register a new user."""
    # Check duplicates
    existing = db.query(User).filter(
        (User.email == req.email) | (User.username == req.username)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email or username already exists")

    user = User(
        email=req.email,
        username=req.username,
        hashed_password=pwd_context.hash(req.password),
        full_name=req.full_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id), "username": user.username})
    return TokenResponse(
        access_token=token,
        user={"id": user.id, "email": user.email, "username": user.username,
              "full_name": user.full_name},
    )


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: Session = Depends(get_db)):
    """Login with username/password."""
    user = db.query(User).filter_by(username=req.username).first()
    if not user or not pwd_context.verify(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    token = create_access_token({"sub": str(user.id), "username": user.username})
    return TokenResponse(
        access_token=token,
        user={"id": user.id, "email": user.email, "username": user.username,
              "full_name": user.full_name},
    )


@router.get("/me")
async def get_me(user: User = Depends(get_current_user)):
    """Get current user profile."""
    if user is None:
        return {"id": None, "username": "anonymous", "message": "Auth disabled"}
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "full_name": user.full_name,
        "is_active": user.is_active,
    }
