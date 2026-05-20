from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from models.sql_models import AuditAction, User, UserRole
from services.hybrid_store import record_audit_log


def create_access_token(
    *,
    data: dict,
    secret_key: str,
    algorithm: str,
    expire_minutes: int,
    has_jose: bool,
    jwt_module=None,
    fallback_hashlib=None,
    fallback_json=None,
    fallback_base64=None,
) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=expire_minutes)
    to_encode.update({"exp": expire})

    if has_jose:
        return jwt_module.encode(to_encode, secret_key, algorithm=algorithm)

    payload = fallback_json.dumps(to_encode, default=str)
    sig = fallback_hashlib.sha256(f"{payload}{secret_key}".encode()).hexdigest()[:16]
    return fallback_base64.urlsafe_b64encode(payload.encode()).decode() + "." + sig


def decode_token(
    *,
    token: str,
    secret_key: str,
    algorithm: str,
    has_jose: bool,
    jwt_module=None,
    fallback_hashlib=None,
    fallback_json=None,
    fallback_base64=None,
) -> Optional[dict]:
    try:
        if has_jose:
            return jwt_module.decode(token, secret_key, algorithms=[algorithm])

        parts = token.rsplit(".", 1)
        if len(parts) != 2:
            return None
        payload_b64, sig = parts
        payload_str = fallback_base64.urlsafe_b64decode(payload_b64).decode()
        expected_sig = fallback_hashlib.sha256(f"{payload_str}{secret_key}".encode()).hexdigest()[:16]
        if sig != expected_sig:
            return None
        return fallback_json.loads(payload_str)
    except Exception:
        return None


def serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "full_name": user.full_name,
        "bio": user.bio,
        "github_url": user.github_url,
        "organization": user.organization,
        "job_title": user.job_title,
        "location": user.location,
        "profile_image": user.profile_image,
        "role": user.role,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None,
    }


def get_current_user_from_credentials(
    *,
    credentials,
    db: Session,
    disable_auth: bool,
    secret_key: str,
    algorithm: str,
    has_jose: bool,
    jwt_module=None,
    fallback_hashlib=None,
    fallback_json=None,
    fallback_base64=None,
) -> Optional[User]:
    if disable_auth:
        return None

    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    payload = decode_token(
        token=credentials.credentials,
        secret_key=secret_key,
        algorithm=algorithm,
        has_jose=has_jose,
        jwt_module=jwt_module,
        fallback_hashlib=fallback_hashlib,
        fallback_json=fallback_json,
        fallback_base64=fallback_base64,
    )
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


def get_optional_user_from_credentials(
    *,
    credentials,
    db: Session,
    disable_auth: bool,
    secret_key: str,
    algorithm: str,
    has_jose: bool,
    jwt_module=None,
    fallback_hashlib=None,
    fallback_json=None,
    fallback_base64=None,
) -> Optional[User]:
    if disable_auth or not credentials:
        return None

    payload = decode_token(
        token=credentials.credentials,
        secret_key=secret_key,
        algorithm=algorithm,
        has_jose=has_jose,
        jwt_module=jwt_module,
        fallback_hashlib=fallback_hashlib,
        fallback_json=fallback_json,
        fallback_base64=fallback_base64,
    )
    if not payload:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    return db.query(User).filter_by(id=int(user_id), is_active=True).first()


def require_admin_user(user: Optional[User]) -> Optional[User]:
    if user is None:
        return None
    if user.is_superuser or user.role == UserRole.ADMIN.value:
        return user
    raise HTTPException(status_code=403, detail="Admin access required")


def create_user_record(
    db: Session,
    *,
    email: str,
    username: str,
    full_name: Optional[str],
    role: Optional[str],
    password_hash: str,
    is_active: bool = True,
) -> User:
    email = (email or "").strip().lower()
    username = (username or "").strip()
    full_name = (full_name or "").strip() or None

    if not email or not username:
        raise HTTPException(status_code=400, detail="Email and username are required")

    existing = db.query(User).filter(
        (User.email == email) | (User.username == username)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email or username already exists")

    user = User(
        email=email,
        username=username,
        hashed_password=password_hash,
        full_name=full_name,
        role=role if role in {r.value for r in UserRole} else UserRole.RESEARCHER.value,
        is_active=bool(is_active),
    )
    db.add(user)
    db.flush()
    return user


def register_user(
    db: Session,
    *,
    email: str,
    username: str,
    password: str,
    full_name: Optional[str],
    role: Optional[str],
    password_hash: str,
    token_factory,
) -> dict:
    user = create_user_record(
        db,
        email=email,
        username=username,
        full_name=full_name,
        role=role,
        password_hash=password_hash,
    )
    record_audit_log(db, AuditAction.LOGIN.value, "user", str(user.id), actor_user_id=user.id, details={"event": "register"})
    db.commit()
    db.refresh(user)

    token = token_factory({"sub": str(user.id), "username": user.username})
    return {"access_token": token, "user": serialize_user(user)}


def login_user(
    db: Session,
    *,
    username: str,
    password: str,
    password_verifier,
    token_factory,
) -> dict:
    user = db.query(User).filter_by(username=username).first()
    if not user or not password_verifier(password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    record_audit_log(db, AuditAction.LOGIN.value, "user", str(user.id), actor_user_id=user.id, details={"event": "login"})
    db.commit()
    token = token_factory({"sub": str(user.id), "username": user.username})
    return {"access_token": token, "user": serialize_user(user)}


def get_me_payload(user: Optional[User]) -> dict:
    if user is None:
        return {"id": None, "username": "anonymous", "message": "Auth disabled"}
    return serialize_user(user)


def update_current_user_profile(
    db: Session,
    *,
    user: User,
    email: Optional[str],
    username: Optional[str],
    full_name: Optional[str],
    bio: Optional[str],
    github_url: Optional[str],
    organization: Optional[str],
    job_title: Optional[str],
    location: Optional[str],
    profile_image: Optional[str],
) -> dict:
    next_email = (email or "").strip().lower()
    next_username = (username or "").strip()
    next_full_name = (full_name or "").strip() or None
    next_bio = (bio or "").strip() or None
    next_github_url = (github_url or "").strip() or None
    next_organization = (organization or "").strip() or None
    next_job_title = (job_title or "").strip() or None
    next_location = (location or "").strip() or None
    next_profile_image = (profile_image or "").strip() or None

    if not next_email or not next_username:
        raise HTTPException(status_code=400, detail="Email and username are required")

    duplicate = (
        db.query(User)
        .filter(
            User.id != user.id,
            ((User.email == next_email) | (User.username == next_username)),
        )
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="Email or username already exists")

    if next_github_url and not (
        next_github_url.startswith("https://github.com/")
        or next_github_url.startswith("http://github.com/")
    ):
        raise HTTPException(status_code=400, detail="GitHub URL must point to github.com")

    user.email = next_email
    user.username = next_username
    user.full_name = next_full_name
    user.bio = next_bio
    user.github_url = next_github_url
    user.organization = next_organization
    user.job_title = next_job_title
    user.location = next_location
    user.profile_image = next_profile_image
    user.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(user)
    return serialize_user(user)
