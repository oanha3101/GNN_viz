"""
JWT Auth — register, login, get current user.
Supports DISABLE_AUTH=1 env var for development.
"""
import os
import logging
from typing import Optional

from fastapi import APIRouter, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy.orm import Session
from passlib.context import CryptContext

from database import get_db
from models.sql_models import User
from services import auth_service

logger = logging.getLogger(__name__)

# ── Config ───────────────────────────────────────────────────────────────────
SECRET_KEY = os.getenv("JWT_SECRET", "gnn-insight-dev-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))  # 24h default
DISABLE_AUTH = os.getenv("DISABLE_AUTH", "0") == "1"

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
    role: Optional[str] = None


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
    role: str
    is_active: bool


# ── Helpers ──────────────────────────────────────────────────────────────────

def _token_codec_kwargs() -> dict:
    return {
        "secret_key": SECRET_KEY,
        "algorithm": ALGORITHM,
        "has_jose": HAS_JOSE,
        "jwt_module": jwt if HAS_JOSE else None,
        "fallback_hashlib": hashlib if not HAS_JOSE else None,
        "fallback_json": json if not HAS_JOSE else None,
        "fallback_base64": base64 if not HAS_JOSE else None,
    }


def _token_factory(data: dict) -> str:
    return create_access_token(data)


def create_access_token(data: dict) -> str:
    """Create JWT access token."""
    return auth_service.create_access_token(
        data=data,
        expire_minutes=ACCESS_TOKEN_EXPIRE_MINUTES,
        **_token_codec_kwargs(),
    )


def decode_token(token: str) -> Optional[dict]:
    """Decode and verify JWT token."""
    return auth_service.decode_token(
        token=token,
        **_token_codec_kwargs(),
    )


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """
    Dependency to get current user from JWT.
    If DISABLE_AUTH=1, returns None (anonymous access allowed).
    """
    return auth_service.get_current_user_from_credentials(
        credentials=credentials,
        db=db,
        disable_auth=DISABLE_AUTH,
        **_token_codec_kwargs(),
    )


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Like get_current_user but returns None instead of raising 401."""
    return auth_service.get_optional_user_from_credentials(
        credentials=credentials,
        db=db,
        disable_auth=DISABLE_AUTH,
        **_token_codec_kwargs(),
    )


def require_admin_user(user: Optional[User] = Depends(get_current_user)) -> Optional[User]:
    """Require an admin user when auth is enabled; allow None in DISABLE_AUTH dev mode."""
    return auth_service.require_admin_user(user)


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse)
async def register(req: RegisterRequest, db: Session = Depends(get_db)):
    """Register a new user."""
    payload = auth_service.register_user(
        db,
        email=req.email,
        username=req.username,
        password=req.password,
        full_name=req.full_name,
        role=req.role,
        password_hash=pwd_context.hash(req.password),
        token_factory=_token_factory,
    )
    return TokenResponse(access_token=payload["access_token"], user=payload["user"])


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: Session = Depends(get_db)):
    """Login with username/password."""
    payload = auth_service.login_user(
        db,
        username=req.username,
        password=req.password,
        password_verifier=lambda plain, hashed: pwd_context.verify(plain, hashed),
        token_factory=_token_factory,
    )
    return TokenResponse(access_token=payload["access_token"], user=payload["user"])


@router.get("/me")
async def get_me(user: User = Depends(get_current_user)):
    """Get current user profile."""
    return auth_service.get_me_payload(user)
