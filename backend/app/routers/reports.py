import os
import uuid
import json
import logging
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, status
from fastapi.responses import FileResponse, Response, RedirectResponse
from backend.app.database import get_db, get_iso_now
from backend.app.services.auth import get_current_user, require_root_admin
from backend.app.config import settings
from backend.app.services.notification_service import notify_root_admins, send_notification
from backend.app.services.storage import get_storage_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Technical Reports"])

# Maximum file constraints
MAX_SCREENSHOT_COUNT = 3
MAX_FILE_SIZE_BYTES = 500 * 1024  # 500 KB per image
ALLOWED_MIME_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}

class ReportUpdatePayload(BaseModel):
    status: str = Field(..., description="OPEN, IN_PROGRESS, or RESOLVED")
    admin_notes: Optional[str] = None

@router.post("", status_code=status.HTTP_201_CREATED)
async def submit_technical_report(
    subject: str = Form(...),
    category: str = Form(...),
    description: str = Form(...),
    screenshots: List[UploadFile] = File([]),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Submit a technical issue report with up to 3 screenshots (max 500KB each) and max 1000 characters description.
    Automatically notifies all Root Admins via in-app notification and Web Push.
    """
    user_id = current_user.get("sub") or current_user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid authentication token")

    # 1. Validate description (max 1000 characters)
    clean_desc = description.strip()
    if not clean_desc:
        raise HTTPException(status_code=400, detail="Description is required.")
    if len(clean_desc) > 1000:
        raise HTTPException(status_code=400, detail=f"Description exceeds 1000 characters limit ({len(clean_desc)} chars provided).")

    clean_subj = subject.strip()
    if not clean_subj:
        raise HTTPException(status_code=400, detail="Subject is required.")
    if len(clean_subj) > 120:
        clean_subj = clean_subj[:120]

    clean_cat = category.strip() or "OTHER"

    # 2. Validate screenshots count
    # Filter out empty files if browser sends empty file input
    valid_files = [f for f in screenshots if f.filename and f.filename.strip()]
    if len(valid_files) > MAX_SCREENSHOT_COUNT:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum of {MAX_SCREENSHOT_COUNT} screenshots allowed. You uploaded {len(valid_files)}."
        )

    # 3. Read and validate each screenshot size and format
    saved_filenames = []
    report_id = f"rep_{uuid.uuid4().hex[:12]}"

    for idx, upload in enumerate(valid_files):
        # Validate MIME type
        content_type = (upload.content_type or "").lower()
        if content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"File '{upload.filename}' is not an accepted image type. Accepted: PNG, JPEG, WebP."
            )

        content = await upload.read()
        if len(content) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"File '{upload.filename}' ({len(content) // 1024} KB) exceeds the 500 KB size limit."
            )

        # Determine extension
        ext = "png"
        if "jpeg" in content_type or "jpg" in content_type:
            ext = "jpg"
        elif "webp" in content_type:
            ext = "webp"

        safe_filename = f"{report_id}_img_{idx + 1}_{uuid.uuid4().hex[:6]}.{ext}"
        storage_key = f"reports/{report_id}/{safe_filename}"

        # 1. Upload to persistent cloud storage (Cloudinary / R2 / local)
        try:
            storage = get_storage_service()
            storage.upload_file(content, storage_key, content_type=content_type)
        except Exception as st_err:
            logger.warning("Failed uploading screenshot to storage service: %s", st_err)

        # 2. Also keep local copy in REPORTS_DIR as cache
        target_path = settings.REPORTS_DIR / safe_filename
        try:
            with open(target_path, "wb") as f:
                f.write(content)
        except Exception:
            pass

        saved_filenames.append(safe_filename)

    screenshots_json = json.dumps(saved_filenames)
    now = get_iso_now()

    # 4. Fetch reporter details from DB
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, role, full_name, email, branch_id FROM users WHERE id = ?", (user_id,))
        user_row = cursor.fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail="User account not found.")

        user_role = user_row["role"]
        user_name = user_row["full_name"]
        user_email = user_row["email"]
        branch_id = user_row["branch_id"]
        user_roll = None

        if user_role == "STUDENT":
            cursor.execute("SELECT roll_number FROM students WHERE user_id = ?", (user_id,))
            st_row = cursor.fetchone()
            if st_row:
                user_roll = st_row["roll_number"]

        # Insert into technical_reports
        cursor.execute("""
            INSERT INTO technical_reports (
                id, user_id, user_role, user_name, user_email, user_roll,
                branch_id, category, subject, description, screenshots_json,
                status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
        """, (
            report_id, user_id, user_role, user_name, user_email, user_roll,
            branch_id, clean_cat, clean_subj, clean_desc, screenshots_json,
            now, now
        ))

        # 5. Dispatch in-app notification & Web Push to all active Root Admins
        role_label = "Student" if user_role == "STUDENT" else "Branch Mgr"
        ident = f" ({user_roll})" if user_roll else ""
        notif_msg = f"[{role_label}] {user_name}{ident} reported an issue: {clean_subj}"
        notify_root_admins(
            cursor,
            notif_type="REPORT_RECEIVED",
            title="New Technical Issue Reported",
            message=notif_msg,
            link_url="/admin/reports"
        )

    return {
        "success": True,
        "report_id": report_id,
        "message": "Technical report submitted successfully. System administrators have been notified."
    }

@router.get("/my")
def get_my_reports(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Fetch reports filed by the currently authenticated user."""
    user_id = current_user.get("sub") or current_user.get("id")
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT r.*, b.name as branch_name
            FROM technical_reports r
            LEFT JOIN branches b ON r.branch_id = b.id
            WHERE r.user_id = ?
            ORDER BY r.created_at DESC
        """, (user_id,))
        rows = cursor.fetchall()
        
        reports = []
        for row in rows:
            d = dict(row)
            try:
                d["screenshots"] = json.loads(d.get("screenshots_json") or "[]")
            except Exception:
                d["screenshots"] = []
            reports.append(d)

        return {"reports": reports}

@router.get("")
def list_reports(
    status: Optional[str] = None,
    role: Optional[str] = None,
    branch_id: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(require_root_admin)
):
    """
    List all technical reports for Root Admins with optional filtering.
    Includes count statistics.
    """
    with get_db() as conn:
        cursor = conn.cursor()

        # Gather summary counts
        cursor.execute("SELECT status, COUNT(*) as cnt FROM technical_reports GROUP BY status")
        counts_rows = cursor.fetchall()
        counts_map = {r["status"]: r["cnt"] for r in counts_rows}

        total_count = sum(counts_map.values())
        open_count = counts_map.get("OPEN", 0)
        in_progress_count = counts_map.get("IN_PROGRESS", 0)
        resolved_count = counts_map.get("RESOLVED", 0)

        # Build dynamic query
        query = """
            SELECT r.*, b.name as branch_name, u_res.full_name as resolved_by_name
            FROM technical_reports r
            LEFT JOIN branches b ON r.branch_id = b.id
            LEFT JOIN users u_res ON r.resolved_by = u_res.id
            WHERE 1=1
        """
        params = []
        if status and status.upper() != "ALL":
            query += " AND r.status = ?"
            params.append(status.upper())
        if role and role.upper() != "ALL":
            query += " AND r.user_role = ?"
            params.append(role.upper())
        if branch_id and branch_id.upper() != "ALL":
            query += " AND r.branch_id = ?"
            params.append(branch_id)

        query += " ORDER BY CASE r.status WHEN 'OPEN' THEN 1 WHEN 'IN_PROGRESS' THEN 2 ELSE 3 END, r.created_at DESC"

        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()

        reports = []
        for row in rows:
            d = dict(row)
            try:
                d["screenshots"] = json.loads(d.get("screenshots_json") or "[]")
            except Exception:
                d["screenshots"] = []
            reports.append(d)

        return {
            "stats": {
                "total": total_count,
                "open": open_count,
                "in_progress": in_progress_count,
                "resolved": resolved_count,
            },
            "reports": reports
        }

@router.get("/{report_id}/images/{filename}")
def get_report_image(report_id: str, filename: str):
    """Serve a screenshot securely from persistent storage or local reports cache."""
    safe_filename = os.path.basename(filename)
    
    media_type = "image/png"
    if safe_filename.endswith(".jpg") or safe_filename.endswith(".jpeg"):
        media_type = "image/jpeg"
    elif safe_filename.endswith(".webp"):
        media_type = "image/webp"

    storage_key = f"reports/{report_id}/{safe_filename}"
    storage = get_storage_service()

    # 1. Check persistent cloud storage (Cloudinary / R2)
    try:
        if storage.file_exists(storage_key):
            # If Cloudinary or remote storage, redirect to direct CDN url for max speed
            if hasattr(storage, "generate_presigned_download_url"):
                cdn_url = storage.generate_presigned_download_url(storage_key)
                if cdn_url and cdn_url.startswith("http"):
                    return RedirectResponse(cdn_url, status_code=307)
            
            file_bytes = storage.download_file(storage_key)
            return Response(
                content=file_bytes,
                media_type=media_type,
                headers={"Cache-Control": "public, max-age=86400, immutable"}
            )
    except Exception as e:
        logger.debug("Storage download notice for %s: %s", storage_key, e)

    # 2. Check local disk fallback in REPORTS_DIR
    file_path = settings.REPORTS_DIR / safe_filename
    if file_path.exists() and file_path.is_file():
        return FileResponse(file_path, media_type=media_type)

    raise HTTPException(status_code=404, detail="Screenshot image not found.")

@router.patch("/{report_id}")
def update_report_status(
    report_id: str,
    payload: ReportUpdatePayload,
    current_user: Dict[str, Any] = Depends(require_root_admin)
):
    """
    Root Admin update report status (e.g. mark IN_PROGRESS or RESOLVED).
    If marked RESOLVED, dispatches in-app notification & Web Push to the reporter.
    """
    new_status = payload.status.upper()
    if new_status not in {"OPEN", "IN_PROGRESS", "RESOLVED"}:
        raise HTTPException(status_code=400, detail="Invalid status. Must be OPEN, IN_PROGRESS, or RESOLVED.")

    admin_notes = (payload.admin_notes or "").strip()
    now = get_iso_now()
    admin_id = current_user.get("sub") or current_user.get("id")

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM technical_reports WHERE id = ?", (report_id,))
        report = cursor.fetchone()
        if not report:
            raise HTTPException(status_code=404, detail="Report not found.")

        resolved_at = now if new_status == "RESOLVED" else None
        resolved_by = admin_id if new_status == "RESOLVED" else None

        cursor.execute("""
            UPDATE technical_reports
            SET status = ?, admin_notes = ?, resolved_by = ?, resolved_at = ?, updated_at = ?
            WHERE id = ?
        """, (new_status, admin_notes, resolved_by, resolved_at, now, report_id))

        # If marking RESOLVED, dispatch notification and WebPush to reporter!
        if new_status == "RESOLVED":
            reporter_id = report["user_id"]
            link_target = "/student/portal" if report["user_role"] == "STUDENT" else "/branch/batches"
            note_snip = f": {admin_notes}" if admin_notes else " - please refresh your portal."
            notif_msg = f"Your report '{report['subject'][:45]}' has been marked resolved{note_snip}"
            
            send_notification(
                cursor,
                user_id=reporter_id,
                notif_type="REPORT_RESOLVED",
                title="Technical Issue Resolved",
                message=notif_msg,
                link_url=link_target
            )

        # Fetch updated record
        cursor.execute("""
            SELECT r.*, b.name as branch_name, u_res.full_name as resolved_by_name
            FROM technical_reports r
            LEFT JOIN branches b ON r.branch_id = b.id
            LEFT JOIN users u_res ON r.resolved_by = u_res.id
            WHERE r.id = ?
        """, (report_id,))
        updated_row = cursor.fetchone()
        res_dict = dict(updated_row)
        try:
            res_dict["screenshots"] = json.loads(res_dict.get("screenshots_json") or "[]")
        except Exception:
            res_dict["screenshots"] = []

        return {
            "success": True,
            "report": res_dict,
            "message": f"Report updated to {new_status}."
        }
