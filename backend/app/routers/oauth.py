import os
import json
import hmac
import hashlib
import base64
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends, Request, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import select, func, or_

from backend.app.config import settings
from backend.app.db.session import get_db
from backend.app.db.base import get_iso_now
from backend.app.db.models.auth import User
from backend.app.db.models.tenancy import Student
from backend.app.db.models.byos import GoogleStorageConnection, PublishedDocumentArchive
from backend.app.db.models.grading import Submission
from backend.app.db.models.academic import Exam
from backend.app.services.auth import (
    get_current_user,
    create_access_token,
    invalidate_user_auth_cache,
)
from backend.app.services.google_drive_service import (
    get_google_auth_url,
    exchange_code_for_tokens,
    get_google_user_info,
    encrypt_token,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/oauth/google", tags=["Google OAuth & BYOS"])


def _generate_oauth_state(mode: str, user_id: Optional[str] = None, role: Optional[str] = None) -> str:
    """Generate a tamper-proof state payload signed with HMAC-SHA256."""
    now = int(datetime.now(timezone.utc).timestamp())
    payload = {
        "mode": mode,  # "login" or "byos"
        "uid": user_id or "",
        "role": role or "",
        "ts": now,
    }
    raw_json = json.dumps(payload, separators=(",", ":"))
    sig = hmac.new(
        settings.JWT_SECRET.encode("utf-8"),
        raw_json.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()[:16]
    state_str = f"{raw_json}|{sig}"
    return base64.urlsafe_b64encode(state_str.encode("utf-8")).decode("utf-8")


def _verify_oauth_state(state_encoded: str) -> Dict[str, Any]:
    """Verify and parse the signed OAuth state."""
    try:
        raw_bytes = base64.urlsafe_b64decode(state_encoded.encode("utf-8"))
        state_str = raw_bytes.decode("utf-8")
        raw_json, sig = state_str.rsplit("|", 1)
        expected_sig = hmac.new(
            settings.JWT_SECRET.encode("utf-8"),
            raw_json.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()[:16]
        if not hmac.compare_digest(sig, expected_sig):
            raise ValueError("Invalid state signature")

        payload = json.loads(raw_json)
        now = int(datetime.now(timezone.utc).timestamp())
        if now - payload.get("ts", 0) > 900:  # 15 minutes TTL
            raise ValueError("OAuth state expired")
        return payload
    except Exception as e:
        logger.warning(f"OAuth state verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OAuth authorization state. Please try again."
        )


@router.get("/authorize")
def authorize_google(
    mode: str = Query("login", pattern="^(login|byos)$"),
    role: Optional[str] = Query(None),
    user_token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Initiates Google OAuth 2.0 flow.
    - mode='login': For 1-click Google Sign-In with desired role.
    - mode='byos': For connecting Google Drive to an existing student/staff account.
    """
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured on this server. Missing GOOGLE_CLIENT_ID.",
        )

    uid = None
    if mode == "byos":
        if not user_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication token required to connect Google Drive (BYOS).",
            )
        try:
            from backend.app.services.auth import decode_access_token
            payload = decode_access_token(user_token)
            uid = payload.get("sub")
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid session token for Google Drive connection.",
            )

    state = _generate_oauth_state(mode=mode, user_id=uid, role=role)
    auth_url = get_google_auth_url(state=state, mode=mode)
    return {"status": "success", "authorization_url": auth_url}


@router.get("/callback")
async def google_oauth_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Receives authorization code from Google OAuth 2.0 consent screen,
    exchanges code for tokens, and routes according to mode ('login' or 'byos').
    """
    frontend_base = settings.FRONTEND_URL.rstrip("/")

    if error:
        logger.warning(f"Google OAuth consent denied or error: {error}")
        return RedirectResponse(url=f"{frontend_base}/auth/login?oauth_error={error}")

    if not code or not state:
        return RedirectResponse(url=f"{frontend_base}/auth/login?oauth_error=missing_parameters")

    state_data = _verify_oauth_state(state)
    mode = state_data.get("mode", "login")
    user_id = state_data.get("uid")
    desired_role = state_data.get("role")

    try:
        # 1. Exchange code for tokens
        token_data = await exchange_code_for_tokens(code)
        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")

        # 2. Get user profile
        user_info = await get_google_user_info(access_token)
        google_sub = user_info.get("sub")
        google_email = (user_info.get("email") or "").strip().lower()
        google_picture = user_info.get("picture")

        if not google_sub or not google_email:
            return RedirectResponse(url=f"{frontend_base}/auth/login?oauth_error=profile_retrieval_failed")

        now = get_iso_now()

        # 3a. Mode: BYOS (Connect Drive for existing user)
        if mode == "byos":
            if not user_id:
                return RedirectResponse(url=f"{frontend_base}/student/portal?byos_error=missing_user")

            user = db.scalar(select(User).where(User.id == user_id))
            if not user:
                return RedirectResponse(url=f"{frontend_base}/student/portal?byos_error=user_not_found")

            # Check if google_sub or google_email is already linked to another user account
            existing_sub_user = db.scalar(
                select(User).where(
                    or_(
                        User.google_sub == google_sub,
                        func.lower(User.email) == google_email,
                        func.lower(User.google_email) == google_email,
                    ),
                    User.id != user.id,
                )
            )
            if existing_sub_user:
                from urllib.parse import urlencode
                err_params = urlencode({
                    "byos_error": "already_linked_elsewhere",
                    "email": google_email,
                    "existing_role": existing_sub_user.role,
                })
                return RedirectResponse(url=f"{frontend_base}/student/portal?{err_params}")

            # Link Google sub & email to User
            user.google_sub = google_sub
            user.google_email = google_email
            user.google_picture = google_picture
            user.google_linked_at = now

            # Save / update GoogleStorageConnection
            if refresh_token:
                enc_token = encrypt_token(refresh_token)
                conn = db.scalar(select(GoogleStorageConnection).where(GoogleStorageConnection.user_id == user.id))
                if not conn:
                    conn = GoogleStorageConnection(
                        id=f"gconn_{google_sub[:12]}",
                        user_id=user.id,
                        google_sub=google_sub,
                        google_email=google_email,
                        encrypted_refresh_token=enc_token,
                        is_active=1,
                        created_at=now,
                    )
                    db.add(conn)
                else:
                    conn.google_sub = google_sub
                    conn.google_email = google_email
                    conn.encrypted_refresh_token = enc_token
                    conn.is_active = 1
                    conn.error_state = None
                    conn.updated_at = now

            db.commit()
            invalidate_user_auth_cache(user.id)

            redirect_target = "/student/portal" if user.role == "STUDENT" else "/overview"
            return RedirectResponse(url=f"{frontend_base}{redirect_target}?byos=connected")

        # 3b. Mode: Login (1-Click Google Sign-In)
        # Search by google_sub, google_email, or institutional email
        user = db.scalar(
            select(User).where(
                or_(
                    User.google_sub == google_sub,
                    func.lower(User.email) == google_email,
                    func.lower(User.google_email) == google_email,
                )
            ).limit(1)
        )

        if not user:
            # Check if linked via GoogleStorageConnection
            conn_match = db.scalar(
                select(GoogleStorageConnection).where(
                    or_(
                        GoogleStorageConnection.google_sub == google_sub,
                        func.lower(GoogleStorageConnection.google_email) == google_email,
                    )
                ).limit(1)
            )
            if conn_match and conn_match.user_id:
                user = db.scalar(select(User).where(User.id == conn_match.user_id))

        if not user:
            # Check if matching student exists by email to link account
            student = db.scalar(
                select(Student).where(func.lower(Student.email) == google_email).limit(1)
            )
            if student and student.user_id:
                user = db.scalar(select(User).where(User.id == student.user_id))

        if not user:
            # User not found in system
            from urllib.parse import urlencode
            err_params = urlencode({"oauth_error": "unregistered_email", "email": google_email})
            return RedirectResponse(
                url=f"{frontend_base}/auth/login?{err_params}"
            )

        if user.is_active != 1:
            return RedirectResponse(url=f"{frontend_base}/auth/login?oauth_error=account_deactivated")

        # Automatically link Google identity if not linked yet
        if not user.google_sub or user.google_sub != google_sub:
            user.google_sub = google_sub
            user.google_email = google_email
            user.google_picture = google_picture
            user.google_linked_at = now
            user.updated_at = now

        # Update storage connection if refresh_token was returned
        if refresh_token:
            enc_token = encrypt_token(refresh_token)
            conn = db.scalar(select(GoogleStorageConnection).where(GoogleStorageConnection.user_id == user.id))
            if not conn:
                conn = GoogleStorageConnection(
                    id=f"gconn_{google_sub[:12]}",
                    user_id=user.id,
                    google_sub=google_sub,
                    google_email=google_email,
                    encrypted_refresh_token=enc_token,
                    is_active=1,
                    created_at=now,
                )
                db.add(conn)
            else:
                conn.google_sub = google_sub
                conn.google_email = google_email
                conn.encrypted_refresh_token = enc_token
                conn.is_active = 1
                conn.error_state = None
                conn.updated_at = now

        user.last_login_at = now
        db.commit()
        invalidate_user_auth_cache(user.id)

        # Issue 7-Day JWT Token
        token_payload = {
            "sub": user.id,
            "role": user.role,
            "email": user.email or user.google_email or "",
            "full_name": user.full_name,
            "institute_id": user.institute_id,
            "branch_id": user.branch_id,
            "token_version": getattr(user, "token_version", 1) or 1,
        }
        token = create_access_token(token_payload)

        # Redirect user directly to landing view with properly encoded query parameters
        from urllib.parse import urlencode
        query_params = urlencode({
            "oauth_token": token,
            "role": user.role,
            "name": user.full_name or "User",
            "branch_id": user.branch_id or "",
            "institute_id": user.institute_id or "",
        })
        return RedirectResponse(
            url=f"{frontend_base}/auth/login?{query_params}"
        )

    except Exception as e:
        logger.error(f"Google OAuth processing error: {e}", exc_info=True)
        return RedirectResponse(url=f"{frontend_base}/auth/login?oauth_error=processing_error")


@router.get("/status")
def get_google_connection_status(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns current user's Google Drive BYOS connection status."""
    uid = current_user.get("sub")
    user = db.scalar(select(User).where(User.id == uid))
    if not user:
        raise HTTPException(status_code=404, detail="User account not found.")

    conn = db.scalar(
        select(GoogleStorageConnection).where(
            GoogleStorageConnection.user_id == uid,
            GoogleStorageConnection.is_active == 1,
        )
    )

    return {
        "is_connected": conn is not None,
        "google_email": conn.google_email if conn else user.google_email,
        "google_picture": user.google_picture,
        "last_sync_at": conn.last_sync_at if conn else None,
        "error_state": conn.error_state if conn else None,
    }


@router.post("/disconnect")
def disconnect_google_connection(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Disconnects user Google Drive storage and deactivates automatic BYOS syncing."""
    uid = current_user.get("sub")
    conn = db.scalar(
        select(GoogleStorageConnection).where(GoogleStorageConnection.user_id == uid)
    )
    if conn:
        conn.is_active = 0
        conn.updated_at = get_iso_now()

    user = db.scalar(select(User).where(User.id == uid))
    if user:
        user.google_linked_at = None
        user.updated_at = get_iso_now()

    db.commit()
    invalidate_user_auth_cache(uid)

    return {
        "status": "success",
        "message": "Google Drive storage connection removed successfully.",
    }


@router.get("/storage-quota")
async def get_google_storage_quota(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetches live Google Drive storage quota and near-full status."""
    uid = current_user.get("sub")
    conn = db.scalar(
        select(GoogleStorageConnection).where(
            GoogleStorageConnection.user_id == uid,
            GoogleStorageConnection.is_active == 1,
        )
    )
    if not conn or not conn.encrypted_refresh_token:
        return {"is_connected": False}

    try:
        from backend.app.services.google_drive_service import get_google_drive_storage_quota
        quota_data = await get_google_drive_storage_quota(conn.encrypted_refresh_token)
        return {
            "is_connected": True,
            "google_email": conn.google_email,
            **quota_data,
        }
    except Exception as e:
        logger.error(f"Failed to query Google Drive storage quota for user {uid}: {e}")
        return {
            "is_connected": True,
            "google_email": conn.google_email,
            "error": "Failed to fetch storage quota",
        }


@router.post("/sync-submission/{submission_id}")
async def sync_single_submission_to_google_drive(
    submission_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    On-demand manual sync of a graded submission PDF to the student's personal Google Drive.
    1. Validates ownership (student owns submission or staff/admin).
    2. Checks if an exported archive copy already exists.
    3. If not, triggers upload and returns Google Drive web_view_link.
    """
    uid = current_user.get("sub")
    role = current_user.get("role")

    sub = db.scalar(select(Submission).where(Submission.id == submission_id))
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found.")

    target_user_id = uid
    if role == "STUDENT":
        student = db.scalar(select(Student).where(Student.id == sub.student_id))
        if not student or student.user_id != uid:
            raise HTTPException(status_code=403, detail="You can only sync your own examination papers.")
        target_user_id = student.user_id
    else:
        if sub.student_id:
            st = db.scalar(select(Student).where(Student.id == sub.student_id))
            if st and st.user_id:
                target_user_id = st.user_id

    # Check publication status
    exam = db.scalar(select(Exam).where(Exam.id == sub.exam_id))
    is_pub = bool(
        sub.publication_status == "PUBLISHED"
        or (exam and (exam.is_published == 1 or exam.status == "PUBLISHED" or exam.lifecycle_status == "PUBLISHED"))
    )
    if not is_pub:
        raise HTTPException(
            status_code=400,
            detail="This exam evaluation is not yet officially published. Only published results can be archived to Google Drive.",
        )

    # Check if student has connected Google Drive
    conn = db.scalar(
        select(GoogleStorageConnection).where(
            GoogleStorageConnection.user_id == target_user_id,
            GoogleStorageConnection.is_active == 1,
        )
    )
    if not conn:
        raise HTTPException(
            status_code=400,
            detail="Google Drive is not connected. Please connect your Google Drive first from Account Settings.",
        )

    # Check if existing archive is already EXPORTED
    existing_archive = db.scalar(
        select(PublishedDocumentArchive).where(PublishedDocumentArchive.submission_id == submission_id)
    )
    if existing_archive and existing_archive.archive_status == "EXPORTED" and existing_archive.drive_web_view_link:
        return {
            "status": "already_synced",
            "message": "Exam paper is already backed up to your Google Drive.",
            "web_view_link": existing_archive.drive_web_view_link,
            "archive_status": "EXPORTED",
            "exported_at": existing_archive.exported_at,
        }

    # Perform sync
    from backend.app.services.google_drive_service import sync_published_submission_to_google_drive
    try:
        res = await sync_published_submission_to_google_drive(db, submission_id)
        if not res or res.get("status") != "success":
            raise HTTPException(status_code=500, detail="Failed to sync submission to Google Drive.")

        return {
            "status": "synced",
            "message": "Exam paper successfully backed up to Google Drive.",
            "web_view_link": res.get("web_view_link"),
            "archive_status": "EXPORTED",
        }
    except Exception as e:
        err_msg = str(e)
        if "storageQuotaExceeded" in err_msg or "quota" in err_msg.lower():
            raise HTTPException(
                status_code=403,
                detail="Google Drive storage quota exceeded. Please free up space in your Google Drive and try again.",
            )
        logger.error(f"Manual Drive sync error for submission {submission_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to sync to Google Drive: {err_msg}")
