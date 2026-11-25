import os
import io
import json
import base64
import hashlib
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
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
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_DRIVE_API_BASE = "https://www.googleapis.com/drive/v3"
GOOGLE_DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3/files"

# Minimal Non-Sensitive Scopes
# drive.file only grants access to files created by PaperGrade AI itself
DEFAULT_SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/drive.file",
]


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


def get_google_auth_url(state: str, prompt_consent: bool = True) -> str:
    """
    Constructs the Google OAuth 2.0 authorization consent URL.
    `state` contains serialized CSRF token and redirect mode ('login' or 'byos').
    """
    client_id = settings.GOOGLE_CLIENT_ID
    redirect_uri = settings.GOOGLE_REDIRECT_URI
    scope_str = " ".join(DEFAULT_SCOPES)

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": scope_str,
        "access_type": "offline",  # Required to receive refresh_token
        "state": state,
        "include_granted_scopes": "true",
        "prompt": "select_account consent",
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
        q = f"mimeType = 'application/vnd.google-apps.folder' and name = '{folder_name}' and trashed = false"
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
            logger.error(f"Failed to create Google Drive folder '{folder_name}': {create_resp.text}")
            raise ValueError(f"Could not create Google Drive folder '{folder_name}'")
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
            logger.error(f"Google Drive PDF upload failed: {resp.status_code} {resp.text}")
            raise ValueError(f"Drive upload failed: {resp.text}")
        return resp.json()


async def sync_published_submission_to_google_drive(
    db: Session,
    submission_id: str,
) -> Optional[Dict[str, Any]]:
    """
    Core BYOS worker function:
    1. Checks if student has an active Google Drive connection.
    2. Downloads canonical annotated PDF from R2.
    3. Traverses/creates hierarchy: 'PaperGrade AI / <Year> / <Month> / <Exam Title>'.
    4. Uploads PDF and records PublishedDocumentArchive record.
    """
    submission = db.scalar(select(Submission).where(Submission.id == submission_id))
    if not submission or not submission.student_id:
        return None

    student = db.scalar(select(Student).where(Student.id == submission.student_id))
    if not student or not student.user_id:
        return None

    exam = db.scalar(select(Exam).where(Exam.id == submission.exam_id)) if submission.exam_id else None
    exam_title = exam.title if exam else "General Examination"

    # Check connection
    conn = db.scalar(
        select(GoogleStorageConnection).where(
            GoogleStorageConnection.user_id == student.user_id,
            GoogleStorageConnection.is_active == 1,
        )
    )

    now = get_iso_now()
    now_dt = datetime.now(timezone.utc)

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

        # 2. Fetch canonical annotated PDF bytes from storage (R2)
        storage = get_storage_service()
        pdf_key = submission.annotated_pdf_url or submission.pdf_path
        if not pdf_key:
            logger.warning(f"Submission {submission_id} has no annotated PDF key available for BYOS sync.")
            return None

        # Clean key for R2 fetch
        clean_key = pdf_key.split("?")[0].lstrip("/")
        if "submissions/" in clean_key:
            clean_key = clean_key[clean_key.find("submissions/"):]

        pdf_bytes = storage.download_file(clean_key)
        if not pdf_bytes:
            logger.error(f"Could not retrieve PDF bytes for key '{clean_key}' during BYOS sync.")
            return None

        pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()

        # 3. Create/resolve folder hierarchy in student's Google Drive
        # Root: PaperGrade AI
        root_id = await ensure_drive_folder(access_token, "PaperGrade AI")
        # Year folder: e.g. 2026
        year_str = str(now_dt.year)
        year_id = await ensure_drive_folder(access_token, year_str, parent_id=root_id)
        # Month folder: e.g. November
        month_str = now_dt.strftime("%B")
        month_id = await ensure_drive_folder(access_token, month_str, parent_id=year_id)
        # Exam folder: e.g. Physics Midterm
        clean_exam_title = "".join(c for c in exam_title if c.isalnum() or c in (" ", "-", "_")).strip()
        exam_id_dir = await ensure_drive_folder(access_token, clean_exam_title, parent_id=month_id)

        # 4. Upload PDF
        roll_clean = (student.roll_number or "Student").replace("/", "-")
        target_filename = f"{roll_clean}_{clean_exam_title}_Graded_v1.pdf"

        upload_meta = await upload_pdf_to_drive(
            access_token=access_token,
            folder_id=exam_id_dir,
            file_name=target_filename,
            pdf_bytes=pdf_bytes,
        )

        drive_file_id = upload_meta.get("id")
        drive_link = upload_meta.get("webViewLink")

        # 5. Persist archive state
        archive = db.scalar(
            select(PublishedDocumentArchive).where(PublishedDocumentArchive.submission_id == submission_id)
        )
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
        return None
