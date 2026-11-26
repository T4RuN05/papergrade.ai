import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import Request
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from backend.app.config import settings
from backend.app.db.base import get_iso_now
from backend.app.db.models.auth import User, UserSession
from backend.app.services.auth import (
    prime_session_auth_cache,
    mark_session_revoked_cache,
    revoke_all_user_sessions_cache,
)

logger = logging.getLogger(__name__)

MAX_CONCURRENT_SESSIONS_PER_USER = 10


def extract_client_ip(request: Optional[Request]) -> Optional[str]:
    """Extract client IP safely respecting reverse proxy headers (X-Forwarded-For / X-Real-IP)."""
    if request is None:
        return None
    forwarded = request.headers.get("x-forwarded-for") or request.headers.get("X-Forwarded-For")
    if forwarded:
        first_hop = forwarded.split(",")[0].strip()
        if first_hop:
            return first_hop[:64]
    real_ip = request.headers.get("x-real-ip") or request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()[:64]
    if request.client and request.client.host:
        return str(request.client.host)[:64]
    return None


def mask_ip_address(ip: Optional[str]) -> Optional[str]:
    """Return a privacy-friendly masked IP string while preserving subnet recognizability."""
    if not ip:
        return None
    clean = ip.strip()
    if "." in clean:
        parts = clean.split(".")
        if len(parts) == 4:
            return f"{parts[0]}.{parts[1]}.xxx.{parts[3]}"
    if ":" in clean:
        parts = clean.split(":")
        if len(parts) > 2:
            return f"{parts[0]}:{parts[1]}::***"
    return clean


def parse_device_label(user_agent: Optional[str]) -> str:
    """Parse HTTP User-Agent into a clean human-readable browser/OS label without external deps."""
    if not user_agent:
        return "Web Browser"

    ua = user_agent
    ua_low = ua.lower()

    # OS detection
    os_name = "Unknown OS"
    if "iphone" in ua_low:
        os_name = "iPhone (iOS)"
    elif "ipad" in ua_low:
        os_name = "iPad (iPadOS)"
    elif "android" in ua_low:
        os_name = "Android"
    elif "windows" in ua_low:
        os_name = "Windows"
    elif "mac os x" in ua_low or "macintosh" in ua_low:
        os_name = "macOS"
    elif "cros" in ua_low:
        os_name = "ChromeOS"
    elif "linux" in ua_low:
        os_name = "Linux"

    # Browser / Client detection
    browser = "Browser"
    if "edg/" in ua_low or "edga/" in ua_low or "edgios/" in ua_low:
        browser = "Edge"
    elif "opr/" in ua_low or "opera" in ua_low:
        browser = "Opera"
    elif "samsungbrowser" in ua_low:
        browser = "Samsung Internet"
    elif "crios/" in ua_low or ("chrome/" in ua_low and "chromium" not in ua_low):
        browser = "Chrome"
    elif "fxios/" in ua_low or "firefox/" in ua_low:
        browser = "Firefox"
    elif "safari/" in ua_low and "chrome/" not in ua_low and "chromium" not in ua_low:
        browser = "Safari"
    elif "curl/" in ua_low or "python" in ua_low or "httpx" in ua_low:
        browser = "API Client"
        return browser

    return f"{browser} on {os_name}" if os_name != "Unknown OS" else browser


def create_user_session(
    db: Session,
    user: User,
    auth_method: str = "PASSWORD",
    request: Optional[Request] = None,
) -> UserSession:
    """
    Create a persistent active session row, enforce the max-10 concurrent sessions cap
    (pruning the oldest excess sessions), and warm _session_auth_cache.
    """
    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.isoformat()
    expires_iso = (now_dt + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)).isoformat()

    raw_ua = (request.headers.get("user-agent") or "").strip()[:512] if request is not None else None
    client_ip = extract_client_ip(request)
    device_label = parse_device_label(raw_ua)

    session_id = f"sess_{uuid.uuid4().hex[:16]}"
    token_ver = getattr(user, "token_version", 1) or 1

    # Enforce active-session cap per user (keep newest MAX_CONCURRENT_SESSIONS_PER_USER - 1 before insert)
    existing_active = list(
        db.scalars(
            select(UserSession)
            .where(
                UserSession.user_id == user.id,
                UserSession.is_revoked == 0,
            )
            .order_by(UserSession.last_active_at.desc(), UserSession.created_at.desc())
        ).all()
    )

    if len(existing_active) >= MAX_CONCURRENT_SESSIONS_PER_USER:
        to_prune = existing_active[MAX_CONCURRENT_SESSIONS_PER_USER - 1 :]
        for stale in to_prune:
            stale.is_revoked = 1
            stale.revoked_at = now_iso
            mark_session_revoked_cache(stale.id)

    sess_row = UserSession(
        id=session_id,
        user_id=user.id,
        token_version=token_ver,
        auth_method=auth_method,
        device_label=device_label,
        user_agent=raw_ua,
        ip_address=client_ip,
        is_revoked=0,
        revoked_at=None,
        last_active_at=now_iso,
        expires_at=expires_iso,
        created_at=now_iso,
    )
    db.add(sess_row)
    prime_session_auth_cache(session_id, user.id, True, expires_iso)
    return sess_row


def revoke_session_by_id(db: Session, user_id: str, session_id: str) -> bool:
    """Revoke a specific session belonging to user_id and immediately evict it from auth cache."""
    sess = db.scalar(
        select(UserSession).where(
            UserSession.id == session_id,
            UserSession.user_id == user_id,
        )
    )
    if not sess:
        return False

    if sess.is_revoked != 1:
        sess.is_revoked = 1
        sess.revoked_at = get_iso_now()
    mark_session_revoked_cache(session_id)
    return True


def revoke_other_user_sessions(
    db: Session,
    user_id: str,
    keep_session_id: Optional[str] = None,
) -> int:
    """Revoke all active sessions for user_id except keep_session_id (if supplied)."""
    now_iso = get_iso_now()
    stmt = select(UserSession).where(
        UserSession.user_id == user_id,
        UserSession.is_revoked == 0,
    )
    if keep_session_id:
        stmt = stmt.where(UserSession.id != keep_session_id)

    rows = list(db.scalars(stmt).all())
    for row in rows:
        row.is_revoked = 1
        row.revoked_at = now_iso
        mark_session_revoked_cache(row.id)
    return len(rows)


def revoke_all_user_sessions(db: Session, user_id: str) -> int:
    """Revoke every active session for user_id (e.g., on password change or account deactivation)."""
    count = revoke_other_user_sessions(db, user_id, keep_session_id=None)
    revoke_all_user_sessions_cache(user_id)
    return count
