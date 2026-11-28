import os
import io
import json
import base64
import hashlib
import logging
import asyncio
from typing import Optional, Dict, Any, List
import httpx
from cryptography.fernet import Fernet
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.config import settings
from backend.app.db.base import get_iso_now
from backend.app.db.models.byos import GoogleStorageConnection, PublishedDocumentArchive
from backend.app.db.models.grading import Submission
from backend.app.db.models.academic import Exam
from backend.app.db.models.tenancy import Student
from backend.app.db.models.auth import User
from backend.app.services.storage import get_storage_service

logger = logging.getLogger(__name__)

# Google OAuth 2.0 Endpoints
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_DRIVE_API_BASE = "https://www.googleapis.com/drive/v3"
GOOGLE_DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3/files"

# Scopes
# Non-sensitive base scopes for user authentication
LOGIN_SCOPES = [
    "openid",
    "email",
    "profile",
]

# Sensitive scope for BYOS Google Drive archival (restricted to app-created files)
BYOS_SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/drive.file",
]

DEFAULT_SCOPES = LOGIN_SCOPES


def _get_fernet() -> Fernet:
    """Derive a 32-byte url-safe base64 Fernet key from the config encryption key."""
    key_material = settings.GOOGLE_STORAGE_ENCRYPTION_KEY.encode("utf-8")
    derived = hashlib.sha256(key_material).digest()
    url_safe_key = base64.urlsafe_b64encode(derived)
    return Fernet(url_safe_key)


def encrypt_token(raw_token: str) -> str:
    """Encrypt a Google OAuth refresh token for secure at-rest storage."""
    if not raw_token:
        return ""
    f = _get_fernet()
    return f.encrypt(raw_token.encode("utf-8")).decode("utf-8")


def decrypt_token(encrypted_token: str) -> str:
    """Decrypt a stored Google OAuth refresh token."""
    if not encrypted_token:
        return ""
    f = _get_fernet()
    return f.decrypt(encrypted_token.encode("utf-8")).decode("utf-8")


def get_google_auth_url(state: str, mode: str = "login", prompt_consent: bool = True) -> str:
    """
    Constructs the Google OAuth 2.0 authorization consent URL.
    `state` contains serialized CSRF token and redirect mode ('login', 'link', or 'byos').
    - 'login' / 'link': Requests only non-sensitive identity scopes (openid, email, profile), avoiding the 100-user cap and unverified screen.
    - 'byos': Requests drive.file for personal Google Drive archival with offline refresh token.
    """
    client_id = settings.GOOGLE_CLIENT_ID
    redirect_uri = settings.GOOGLE_REDIRECT_URI
    is_drive_mode = mode in ("byos", "drive")
    scopes = BYOS_SCOPES if is_drive_mode else LOGIN_SCOPES
    scope_str = " ".join(scopes)

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": scope_str,
        "access_type": "offline" if is_drive_mode else "online",
        "state": state,
        "include_granted_scopes": "true",
        "prompt": "select_account consent" if is_drive_mode else "select_account",
    }

    import urllib.parse
    query_str = urllib.parse.urlencode(params)
    return f"{GOOGLE_AUTH_URL}?{query_str}"


async def exchange_code_for_tokens(code: str) -> Dict[str, Any]:
    """Exchanges an authorization code for Google access and refresh tokens."""
    payload = {
        "code": code,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(GOOGLE_TOKEN_URL, data=payload)
        if resp.status_code != 200:
            logger.error(f"Google token exchange failed: {resp.status_code} {resp.text}")
            raise ValueError(f"Failed to exchange Google authorization code: {resp.text}")
        return resp.json()


async def get_google_user_info(access_token: str) -> Dict[str, Any]:
    """Retrieves Google profile and sub ID via userinfo endpoint."""
    headers = {"Authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(GOOGLE_USERINFO_URL, headers=headers)
        if resp.status_code != 200:
            logger.error(f"Failed to fetch Google userinfo: {resp.status_code} {resp.text}")
            raise ValueError("Failed to retrieve Google profile information.")
        return resp.json()


async def refresh_google_access_token(encrypted_refresh_token: str) -> str:
    """Uses the decrypted refresh token to acquire a fresh Google access token."""
    raw_refresh_token = decrypt_token(encrypted_refresh_token)
    if not raw_refresh_token:
        raise ValueError("Missing or invalid Google refresh token.")

    payload = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "refresh_token": raw_refresh_token,
        "grant_type": "refresh_token",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(GOOGLE_TOKEN_URL, data=payload)
        if resp.status_code != 200:
            logger.error(f"Failed to refresh Google access token: {resp.status_code} {resp.text}")
            raise ValueError("Google access token refresh failed. User re-authentication required.")
        data = resp.json()
        return data["access_token"]


def revoke_google_token_sync(encrypted_refresh_token: str) -> bool:
    """
    Revoke a user's Google OAuth refresh token upstream at Google's revocation endpoint.
    Google accepts either access or refresh tokens and revokes the full grant on Google's side.
    """
    if not encrypted_refresh_token:
        return False
    if os.environ.get("PYTEST_CURRENT_TEST") or getattr(settings, "ENVIRONMENT", "").lower() == "test":
        return True
    try:
        raw_token = decrypt_token(encrypted_refresh_token)
        if not raw_token:
            return False
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                GOOGLE_REVOKE_URL,
                data={"token": raw_token},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            if resp.status_code in (200, 400):
                # 200 = revoked cleanly; 400 = already revoked/expired on Google's side
                logger.info(f"Google token revocation completed (status={resp.status_code}).")
                return True
            logger.warning(f"Unexpected status during Google token revocation: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        logger.warning(f"Google token revocation exception (non-fatal): {e}")
        return False


async def get_google_drive_storage_quota(encrypted_refresh_token: str) -> Dict[str, Any]:
    """
    Fetches the user's Google Drive storage quota AND sums the footprint of files
    created by PaperGrade AI (visible via drive.file scope) so the UI can show
    a partitioned bar (Other Google Storage vs PaperGrade AI Backups).
    """
    access_token = await refresh_google_access_token(encrypted_refresh_token)
    headers = {"Authorization": f"Bearer {access_token}"}
    about_url = f"{GOOGLE_DRIVE_API_BASE}/about?fields=storageQuota,user"

    papergrade_bytes = 0
    papergrade_files_count = 0

    async with httpx.AsyncClient(timeout=12.0) as client:
        resp = await client.get(about_url, headers=headers)
        if resp.status_code != 200:
            logger.error(f"Failed to fetch Google Drive storage quota: {resp.status_code} {resp.text}")
            raise ValueError(f"Drive quota query failed: {resp.text}")
        data = resp.json()

        # Under drive.file scope, files.list returns ONLY non-folder files created/opened by PaperGrade AI
        try:
            page_token: Optional[str] = None
            for _ in range(5):  # Guard max 5 pages (5,000 files)
                params: Dict[str, Any] = {
                    "q": "mimeType != 'application/vnd.google-apps.folder' and trashed = false",
                    "fields": "nextPageToken,files(id,size)",
                    "pageSize": 1000,
                }
                if page_token:
                    params["pageToken"] = page_token
                files_resp = await client.get(f"{GOOGLE_DRIVE_API_BASE}/files", params=params, headers=headers)
                if files_resp.status_code != 200:
                    break
                f_data = files_resp.json()
                for f_item in f_data.get("files", []):
                    papergrade_files_count += 1
                    try:
                        papergrade_bytes += int(f_item.get("size") or 0)
                    except (TypeError, ValueError):
                        pass
                page_token = f_data.get("nextPageToken")
                if not page_token:
                    break
        except Exception as list_err:
            logger.warning(f"Failed computing PaperGrade Drive footprint (non-fatal): {list_err}")

        quota = data.get("storageQuota", {})

        limit_bytes = int(quota.get("limit", 0)) if quota.get("limit") is not None else 0
        usage_bytes = int(quota.get("usage", 0)) if quota.get("usage") is not None else 0
        usage_in_drive = int(quota.get("usageInDrive", 0)) if quota.get("usageInDrive") is not None else 0
        other_bytes = max(0, usage_bytes - papergrade_bytes)

        # Calculate percentages and readable units
        if limit_bytes > 0:
            usage_percent = round((usage_bytes / limit_bytes) * 100, 1)
            papergrade_percent = round((papergrade_bytes / limit_bytes) * 100, 3)
            other_percent = round((other_bytes / limit_bytes) * 100, 1)
            limit_gb = round(limit_bytes / (1024 ** 3), 2)
        else:
            usage_percent = 0.0
            papergrade_percent = 0.0
            other_percent = 0.0
            limit_gb = None  # Unlimited (e.g. Google Workspace pooled storage)

        usage_gb = round(usage_bytes / (1024 ** 3), 2)
        usage_in_drive_gb = round(usage_in_drive / (1024 ** 3), 2)
        other_gb = round(other_bytes / (1024 ** 3), 2)
        papergrade_mb = round(papergrade_bytes / (1024 ** 2), 2)

        return {
            "limit_bytes": limit_bytes,
            "usage_bytes": usage_bytes,
            "usage_in_drive_bytes": usage_in_drive,
            "papergrade_bytes": papergrade_bytes,
            "other_bytes": other_bytes,
            "papergrade_files_count": papergrade_files_count,
            "limit_gb": limit_gb,
            "usage_gb": usage_gb,
            "usage_in_drive_gb": usage_in_drive_gb,
            "other_gb": other_gb,
            "papergrade_mb": papergrade_mb,
            "usage_percent": usage_percent,
            "other_percent": other_percent,
            "papergrade_percent": papergrade_percent,
            "is_near_full": bool(limit_bytes > 0 and usage_percent >= 85.0),
            "is_critical": bool(limit_bytes > 0 and usage_percent >= 95.0),
        }


def _escape_drive_query(value: str) -> str:
    """Escape backslashes and single quotes for Google Drive q search syntax."""
    return (value or "").replace("\\", "\\\\").replace("'", "\\'")


async def check_drive_file_exists(access_token: str, file_id: str) -> Optional[Dict[str, Any]]:
    """Verify whether a previously synced Drive file still exists and is not trashed."""
    if not file_id:
        return None
    headers = {"Authorization": f"Bearer {access_token}"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{GOOGLE_DRIVE_API_BASE}/files/{file_id}",
                params={"fields": "id,name,trashed,webViewLink"},
                headers=headers,
            )
            if resp.status_code == 200:
                data = resp.json()
                if not data.get("trashed"):
                    return data
    except Exception as e:
        logger.warning(f"Failed verifying Drive file {file_id}: {e}")
    return None


async def find_drive_file_in_folder(access_token: str, folder_id: str, file_name: str) -> Optional[Dict[str, Any]]:
    """Find an existing non-trashed file with the same name in a Drive folder."""
    headers = {"Authorization": f"Bearer {access_token}"}
    safe_name = _escape_drive_query(file_name)
    q = f"name = '{safe_name}' and '{folder_id}' in parents and trashed = false"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{GOOGLE_DRIVE_API_BASE}/files",
                params={"q": q, "fields": "files(id, name, webViewLink)"},
                headers=headers,
            )
            if resp.status_code == 200:
                files = resp.json().get("files", [])
                if files:
                    return files[0]
    except Exception as e:
        logger.warning(f"Failed searching Drive file '{file_name}': {e}")
    return None


def _raise_drive_api_error(resp: httpx.Response, action_desc: str) -> None:
    """Parse Google Drive HTTP error payload and raise a clean, actionable ValueError."""
    reason = None
    message = resp.text
    try:
        err_obj = resp.json().get("error", {})
        message = err_obj.get("message") or message
        errors = err_obj.get("errors") or []
        if errors and isinstance(errors, list):
            reason = errors[0].get("reason")
    except Exception:
        pass

    logger.error(f"Google Drive API error during {action_desc} ({resp.status_code}, reason={reason}): {resp.text}")

    if resp.status_code == 403 and (
        reason == "accessNotConfigured"
        or "has not been used in project" in message
        or "is disabled" in message
    ):
        raise ValueError(
            "Google Drive API is not enabled on this Google Cloud project. Please contact the administrator to enable drive.googleapis.com."
        )
    if reason in ("storageQuotaExceeded", "teamDriveFileLimitExceeded") or "quota" in message.lower():
        raise ValueError("storageQuotaExceeded: Your Google Drive storage is full.")
    if resp.status_code == 401 or reason in ("insufficientPermissions", "insufficientFilePermissions", "authError"):
        raise ValueError(
            "Google Drive authorization is missing or expired. Please unlink and reconnect your Google account from Account & Settings."
        )
    raise ValueError(f"{action_desc}: {message[:220]}")


async def ensure_drive_folder(
    access_token: str,
    folder_name: str,
    parent_id: Optional[str] = None
) -> str:
    """
    Finds or creates a folder in Google Drive.
    Returns the Google Drive folder ID.
    """
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        # Search for existing folder
        safe_folder = _escape_drive_query(folder_name)
        q = f"mimeType = 'application/vnd.google-apps.folder' and name = '{safe_folder}' and trashed = false"
        if parent_id:
            q += f" and '{parent_id}' in parents"
        else:
            q += " and 'root' in parents"

        search_resp = await client.get(
            f"{GOOGLE_DRIVE_API_BASE}/files",
            params={"q": q, "fields": "files(id, name)"},
            headers=headers,
        )
        if search_resp.status_code == 200:
            files = search_resp.json().get("files", [])
            if files:
                return files[0]["id"]
        elif search_resp.status_code in (401, 403):
            _raise_drive_api_error(search_resp, f"Could not access Google Drive folder '{folder_name}'")

        # If not found, create it
        body: Dict[str, Any] = {
            "name": folder_name,
            "mimeType": "application/vnd.google-apps.folder",
        }
        if parent_id:
            body["parents"] = [parent_id]

        create_resp = await client.post(
            f"{GOOGLE_DRIVE_API_BASE}/files",
            json=body,
            headers=headers,
        )
        if create_resp.status_code not in (200, 201):
            _raise_drive_api_error(create_resp, f"Could not create Google Drive folder '{folder_name}'")
        return create_resp.json()["id"]


async def upload_pdf_to_drive(
    access_token: str,
    folder_id: str,
    file_name: str,
    pdf_bytes: bytes,
) -> Dict[str, Any]:
    """
    Uploads a PDF file into the designated Google Drive folder using multipart upload.
    Returns file metadata including `id`, `name`, and `webViewLink`.
    """
    metadata = {
        "name": file_name,
        "parents": [folder_id],
    }

    boundary = f"=======PaperGradeUpload{hashlib.md5(file_name.encode()).hexdigest()[:12]}=="
    delimiter = f"--{boundary}\r\n".encode("utf-8")
    close_delimiter = f"\r\n--{boundary}--\r\n".encode("utf-8")

    body = io.BytesIO()
    # Part 1: Metadata JSON
    body.write(delimiter)
    body.write(b"Content-Type: application/json; charset=UTF-8\r\n\r\n")
    body.write(json.dumps(metadata).encode("utf-8"))
    body.write(b"\r\n")

    # Part 2: Media binary
    body.write(delimiter)
    body.write(b"Content-Type: application/pdf\r\n\r\n")
    body.write(pdf_bytes)
    body.write(close_delimiter)

    content = body.getvalue()

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": f"multipart/related; boundary={boundary}",
        "Content-Length": str(len(content)),
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{GOOGLE_DRIVE_UPLOAD_BASE}?uploadType=multipart&fields=id,name,webViewLink,webContentLink",
            content=content,
            headers=headers,
        )
        if resp.status_code not in (200, 201):
            _raise_drive_api_error(resp, "Drive upload failed")
        return resp.json()


async def sync_published_submission_to_google_drive(
    db: Session,
    submission_id: str,
    raise_on_error: bool = False,
) -> Optional[Dict[str, Any]]:
    """
    Core BYOS worker function:
    1. Checks if student has an active Google Drive connection.
    2. Checks if the annotated PDF is already synced in Google Drive (and not trashed).
    3. Downloads annotated PDF from storage (or generates it on demand via export_service).
    4. Creates/resolves the flat hierarchy: 'PaperGrade AI / <Subject>' (no date or exam subfolders).
    5. Uploads PDF (without creating duplicates) and persists PublishedDocumentArchive record.
    """
    submission = db.scalar(select(Submission).where(Submission.id == submission_id))
    if not submission or not submission.student_id:
        return None
    if getattr(submission, "is_document_purged", 0):
        return None

    student = db.scalar(select(Student).where(Student.id == submission.student_id))
    if not student or not student.user_id:
        return None

    exam = db.scalar(select(Exam).where(Exam.id == submission.exam_id)) if submission.exam_id else None
    exam_title = exam.title if exam else "General Examination"
    exam_subject = getattr(exam, "subject", None) if exam else None

    # Check connection
    conn = db.scalar(
        select(GoogleStorageConnection).where(
            GoogleStorageConnection.user_id == student.user_id,
            GoogleStorageConnection.is_active == 1,
        )
    )

    now = get_iso_now()

    # If student is NOT connected, create a pending/unlinked archive record for student portal display
    if not conn:
        existing_archive = db.scalar(
            select(PublishedDocumentArchive).where(PublishedDocumentArchive.submission_id == submission_id)
        )
        if not existing_archive:
            archive = PublishedDocumentArchive(
                id=f"pdoc_{hashlib.md5(f'{submission_id}:1'.encode()).hexdigest()[:12]}",
                submission_id=submission_id,
                version_number=1,
                pdf_sha256="pending_connection",
                archive_status="NOT_LINKED",
                created_at=now,
            )
            db.add(archive)
            db.commit()
        return None

    try:
        # 1. Acquire fresh Google access token
        access_token = await refresh_google_access_token(conn.encrypted_refresh_token)

        # 1a. Check if existing archive file still lives in Google Drive
        existing_archive = db.scalar(
            select(PublishedDocumentArchive).where(PublishedDocumentArchive.submission_id == submission_id)
        )
        if existing_archive and existing_archive.archive_status == "EXPORTED" and existing_archive.drive_file_id:
            verified = await check_drive_file_exists(access_token, existing_archive.drive_file_id)
            if verified:
                link = verified.get("webViewLink") or existing_archive.drive_web_view_link
                return {
                    "status": "success",
                    "already_exists": True,
                    "file_id": existing_archive.drive_file_id,
                    "web_view_link": link,
                }

        # 2. Fetch canonical annotated PDF bytes (Storage first, on-demand export fallback)
        from backend.app.services.storage import is_remote_storage, sync_file_to_remote_storage
        from backend.app.services.export_service import export_service
        from backend.app.services.grading_service import grading_service

        storage = get_storage_service()
        sub_annotated = getattr(submission, "annotated_pdf_path", None)
        annotated_key = (
            sub_annotated
            if sub_annotated and sub_annotated not in ("", "PURGED")
            else f"exports/{submission_id}_annotated.pdf"
        )

        pdf_bytes: Optional[bytes] = None
        if not grading_service.is_export_dirty(submission_id) and await asyncio.to_thread(storage.file_exists, annotated_key):
            try:
                pdf_bytes = await asyncio.to_thread(storage.download_file, annotated_key)
            except Exception as dl_err:
                logger.warning(f"Remote annotated PDF download failed for {submission_id}, regenerating locally: {dl_err}")

        if not pdf_bytes:
            local_pdf_path = await asyncio.to_thread(export_service.get_submission_pdf_path, submission_id)
            if local_pdf_path and local_pdf_path.exists():
                pdf_bytes = local_pdf_path.read_bytes()
                if is_remote_storage(storage):
                    await asyncio.to_thread(
                        sync_file_to_remote_storage,
                        local_pdf_path,
                        annotated_key,
                        "application/pdf",
                        storage,
                    )

        if not pdf_bytes:
            logger.error(f"Could not generate or retrieve annotated PDF bytes for submission '{submission_id}' during BYOS sync.")
            return None

        pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()

        # 3. Create/resolve flat subject-based folder hierarchy: 'PaperGrade AI / <Subject>'
        root_id = await ensure_drive_folder(access_token, "PaperGrade AI")
        clean_subject = (
            "".join(c for c in (exam_subject or "") if c.isalnum() or c in (" ", "-", "_")).strip()
            or "General"
        )
        subject_dir_id = await ensure_drive_folder(access_token, clean_subject, parent_id=root_id)

        # 4. Upload PDF directly inside subject folder (avoid duplicate files)
        clean_exam_title = (
            "".join(c for c in exam_title if c.isalnum() or c in (" ", "-", "_")).strip()
            or "Examination"
        )
        roll_clean = (student.roll_number or "Student").replace("/", "-")
        exam_id_suffix = (exam.id or "")[-6:] if exam else ""
        target_filename = (
            f"{roll_clean}_{clean_exam_title}_{exam_id_suffix}_Graded.pdf"
            if exam_id_suffix
            else f"{roll_clean}_{clean_exam_title}_Graded.pdf"
        )

        existing_drive_file = await find_drive_file_in_folder(access_token, subject_dir_id, target_filename)
        if existing_drive_file:
            drive_file_id = existing_drive_file.get("id")
            drive_link = existing_drive_file.get("webViewLink")
        else:
            upload_meta = await upload_pdf_to_drive(
                access_token=access_token,
                folder_id=subject_dir_id,
                file_name=target_filename,
                pdf_bytes=pdf_bytes,
            )
            drive_file_id = upload_meta.get("id")
            drive_link = upload_meta.get("webViewLink")

        # 5. Persist archive state
        archive = existing_archive
        if not archive:
            archive = PublishedDocumentArchive(
                id=f"pdoc_{hashlib.md5(f'{submission_id}:1'.encode()).hexdigest()[:12]}",
                submission_id=submission_id,
                version_number=1,
                pdf_sha256=pdf_hash,
                drive_file_id=drive_file_id,
                drive_web_view_link=drive_link,
                archive_status="EXPORTED",
                exported_at=now,
                created_at=now,
            )
            db.add(archive)
        else:
            archive.drive_file_id = drive_file_id
            archive.drive_web_view_link = drive_link
            archive.pdf_sha256 = pdf_hash
            archive.archive_status = "EXPORTED"
            archive.exported_at = now
            archive.updated_at = now

        # Update connection last sync
        conn.last_sync_at = now
        conn.error_state = None
        db.commit()

        logger.info(
            f"Successfully archived submission {submission_id} to student's Google Drive: {drive_link}"
        )
        return {
            "status": "success",
            "file_id": drive_file_id,
            "web_view_link": drive_link,
        }

    except Exception as e:
        logger.error(f"Error syncing submission {submission_id} to Google Drive: {e}", exc_info=True)
        if conn:
            conn.error_state = str(e)[:255]
            db.commit()
        if raise_on_error:
            raise
        return None
