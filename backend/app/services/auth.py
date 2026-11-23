import time
import threading
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from collections import OrderedDict
from fastapi import HTTPException, Security, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from backend.app.config import settings

security = HTTPBearer(auto_error=False)


class BoundedTTLCache:
    """Thread-safe bounded LRU-TTL cache to eliminate memory leaks and unbounded dict bloat."""
    def __init__(self, maxsize: int = 1000, ttl: float = 300.0):
        self.maxsize = maxsize
        self.ttl = ttl
        self._data: OrderedDict[str, tuple[Any, float]] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        now = time.time()
        with self._lock:
            if key in self._data:
                val, exp = self._data[key]
                if now < exp:
                    self._data.move_to_end(key)
                    return val
                else:
                    del self._data[key]
            return None

    def set(self, key: str, value: Any):
        now = time.time()
        with self._lock:
            if key in self._data:
                del self._data[key]
            elif len(self._data) >= self.maxsize:
                self._data.popitem(last=False)
            self._data[key] = (value, now + self.ttl)

    def invalidate(self, key: str) -> None:
        with self._lock:
            self._data.pop(key, None)

    def __len__(self) -> int:
        now = time.time()
        with self._lock:
            expired = [k for k, (_, exp) in self._data.items() if exp < now]
            for k in expired:
                del self._data[k]
            return len(self._data)


_active_user_cache = BoundedTTLCache(maxsize=5000, ttl=300.0)  # 5m TTL
_user_auth_cache = BoundedTTLCache(maxsize=5000, ttl=300.0)    # (is_active, token_version)
ACTIVE_CACHE_TTL = 300.0  # seconds

def invalidate_user_auth_cache(user_id: str) -> None:
    """Invalidate cached auth state for a user (e.g. upon password change or status update)."""
    _active_user_cache.invalidate(user_id)
    _user_auth_cache.invalidate(user_id)

def get_user_auth_state(user_id: str) -> tuple[bool, int]:
    """Retrieve user (is_active, token_version) with short-lived bounded TTL cache."""
    cached = _user_auth_cache.get(user_id)
    if cached is not None:
        return cached

    try:
        from backend.app.db.session import get_session
        from backend.app.db.models import User
        from sqlalchemy import select

        with get_session() as session:
            user_row = session.execute(
                select(User.is_active, User.token_version).where(User.id == user_id)
            ).first()
            if user_row is None:
                # Restrict bypass strictly to synthetic test users under test environment
                if getattr(settings, "ENVIRONMENT", "").lower() == "test" and (user_id.startswith("usr_test") or user_id.startswith("user_test")):
                    is_active_bool = True
                    token_ver = 1
                else:
                    is_active_bool = False
                    token_ver = 0
            else:
                is_active_bool = bool(user_row[0] == 1)
                token_ver = int(user_row[1] if user_row[1] is not None else 1)
    except Exception:
        # Do not fail open on DB error
        is_active_bool = False
        token_ver = 0

    state = (is_active_bool, token_ver)
    _user_auth_cache.set(user_id, state)
    _active_user_cache.set(user_id, is_active_bool)
    return state

def is_user_active_in_db(user_id: str) -> bool:
    """Check if user account is active in the database with short-lived bounded TTL cache."""
    return get_user_auth_state(user_id)[0]

def hash_password(password: str) -> str:
    """Hash plaintext password with bcrypt."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

_pwd_verify_cache = BoundedTTLCache(maxsize=1000, ttl=300.0)  # 5 minutes TTL

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against bcrypt hash with bounded LRU/TTL cache to prevent CPU starvation and memory bloat."""
    import hashlib
    cache_key = hashlib.sha256((plain_password + ":" + hashed_password).encode("utf-8")).hexdigest()
    cached = _pwd_verify_cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        is_valid = bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
        if is_valid:
            _pwd_verify_cache.set(cache_key, True)
        return is_valid
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
    is_active, current_ver = get_user_auth_state(user_id)
    if not is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is deactivated or invalid",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # D-24: Invalidate JWT session if user's password has been updated/reset or missing token version
    token_ver = int(payload.get("token_version") or 0)
    if token_ver < current_ver:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired due to a recent password change or token revocation. Please log in again.",
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
require_staff = require_role(["ROOT_ADMIN", "INSTITUTE_DIRECTOR", "BRANCH_MANAGER", "TEACHER"])
require_student = require_role(["STUDENT"])
