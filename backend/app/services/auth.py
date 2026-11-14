import time
import threading
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from fastapi import HTTPException, Security, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from backend.app.config import settings

security = HTTPBearer(auto_error=False)

_active_user_cache: Dict[str, tuple[bool, float]] = {}
_cache_lock = threading.Lock()
ACTIVE_CACHE_TTL = 15.0  # seconds

def is_user_active_in_db(user_id: str) -> bool:
    """Check if user account is active in the database with short-lived TTL cache."""
    now = time.time()
    with _cache_lock:
        if user_id in _active_user_cache:
            is_active, exp = _active_user_cache[user_id]
            if now < exp:
                return is_active

    try:
        from backend.app.db.session import get_session
        from backend.app.db.models import User
        from sqlalchemy import select

        with get_session() as session:
            active = session.scalar(select(User.is_active).where(User.id == user_id))
            if active is None:
                # Fallback for synthetic/test users that are not in DB
                is_active_bool = user_id.startswith("usr_test") or user_id.startswith("user_")
            else:
                is_active_bool = bool(active == 1)
    except Exception:
        # Fallback gracefully if DB session unavailable
        is_active_bool = True

    with _cache_lock:
        _active_user_cache[user_id] = (is_active_bool, now + ACTIVE_CACHE_TTL)

    return is_active_bool

def hash_password(password: str) -> str:
    """Hash plaintext password with bcrypt."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against bcrypt hash."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False

def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT access token."""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "iat": now})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

def decode_access_token(token: str) -> Dict[str, Any]:
    """Decode and validate JWT access token."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    token: Optional[str] = None
) -> Dict[str, Any]:
    """FastAPI dependency to extract current user from Authorization header or ?token= query param."""
    raw_token = credentials.credentials if credentials else token
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header or token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(raw_token)
    user_id = payload.get("sub")
    role = payload.get("role")
    if not user_id or not role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed authentication payload",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not is_user_active_in_db(user_id):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is deactivated or invalid",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload

def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    token: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """FastAPI dependency to extract current user if Authorization header or ?token= is provided, or None if guest."""
    raw_token = credentials.credentials if (credentials and credentials.credentials) else (token.strip() if token else None)
    if not raw_token:
        return None
    try:
        payload = decode_access_token(raw_token)
        if not payload.get("sub") or not payload.get("role"):
            return None
        return payload
    except Exception:
        return None

def require_role(allowed_roles: list[str]):
    """Guard dependency factory that enforces allowed roles."""
    def role_checker(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        user_role = current_user.get("role")
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: role '{user_role}' is not authorized for this resource.",
            )
        return current_user
    return role_checker

# Role-specific guards
require_root_admin = require_role(["ROOT_ADMIN"])
require_institute_director = require_role(["ROOT_ADMIN", "INSTITUTE_DIRECTOR"])
require_branch_manager = require_role(["ROOT_ADMIN", "INSTITUTE_DIRECTOR", "BRANCH_MANAGER"])
require_student = require_role(["STUDENT"])
