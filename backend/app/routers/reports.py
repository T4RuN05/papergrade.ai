import os
import uuid
import json
import logging
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, status
from fastapi.responses import FileResponse, Response, RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import select, func, case, or_

from backend.app.config import settings
from backend.app.db.session import get_db
from backend.app.db.base import get_iso_now
from backend.app.db.models import TechnicalReport, User, Student, Branch
from backend.app.services.auth import get_current_user, require_root_admin
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
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Submit a technical issue report with up to 3 screenshots (max 500KB each) and max 1000 characters description.
    Automatically notifies all Root Admins via in-app notification and Web Push using SQLAlchemy ORM.
    """
    user_id = current_user.get("sub") or current_user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid authentication token")

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

    valid_files = [f for f in screenshots if f.filename and f.filename.strip()]
    if len(valid_files) > MAX_SCREENSHOT_COUNT:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum of {MAX_SCREENSHOT_COUNT} screenshots allowed. You uploaded {len(valid_files)}."
        )

    saved_filenames = []
    report_id = f"rep_{uuid.uuid4().hex[:12]}"

    for idx, upload in enumerate(valid_files):
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

        ext = "png"
        if "jpeg" in content_type or "jpg" in content_type:
            ext = "jpg"
        elif "webp" in content_type:
            ext = "webp"

        safe_filename = f"{report_id}_img_{idx + 1}_{uuid.uuid4().hex[:6]}.{ext}"
        storage_key = f"reports/{report_id}/{safe_filename}"

        try:
            storage = get_storage_service()
            storage.upload_file(content, storage_key, content_type=content_type)
        except Exception as st_err:
            logger.warning("Failed uploading screenshot to storage service: %s", st_err)

        target_path = settings.REPORTS_DIR / safe_filename
        try:
            with open(target_path, "wb") as f:
                f.write(content)
        except Exception:
            pass

        saved_filenames.append(safe_filename)

    screenshots_json = json.dumps(saved_filenames)
    now = get_iso_now()

    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User account not found.")

    user_role = user.role
    user_name = user.full_name
    user_email = user.email
    branch_id = user.branch_id
    user_roll = None

    if user_role == "STUDENT":
        st = db.scalar(select(Student).where(Student.user_id == user_id).limit(1))
        if st:
            user_roll = st.roll_number

    new_report = TechnicalReport(
        id=report_id,
        user_id=user_id,
        user_role=user_role,
        user_name=user_name,
        user_email=user_email,
        user_roll=user_roll,
        branch_id=branch_id,
        category=clean_cat,
        subject=clean_subj,
        description=clean_desc,
        screenshots_json=screenshots_json,
        status='OPEN',
        created_at=now,
        updated_at=now,
    )
    db.add(new_report)

    role_label = "Student" if user_role == "STUDENT" else "Branch Mgr"
    ident = f" ({user_roll})" if user_roll else ""
    notif_msg = f"[{role_label}] {user_name}{ident} reported an issue: {clean_subj}"
    notify_root_admins(
        db,
        notif_type="REPORT_RECEIVED",
        title="New Technical Issue Reported",
        message=notif_msg,
        link_url="/admin/reports"
    )

    db.commit()

    return {
        "success": True,
        "report_id": report_id,
        "message": "Technical report submitted successfully. System administrators have been notified."
    }


@router.get("/my")
def get_my_reports(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Fetch reports filed by the currently authenticated user."""
    user_id = current_user.get("sub") or current_user.get("id")

    rows = db.execute(
        select(TechnicalReport, Branch)
        .outerjoin(Branch, TechnicalReport.branch_id == Branch.id)
        .where(TechnicalReport.user_id == user_id)
        .order_by(TechnicalReport.created_at.desc())
    ).all()

    reports = []
    for r, b in rows:
        d = {
            "id": r.id,
            "user_id": r.user_id,
            "user_role": r.user_role,
            "user_name": r.user_name,
            "user_email": r.user_email,
            "user_roll": r.user_roll,
            "branch_id": r.branch_id,
            "branch_name": b.name if b else None,
            "category": r.category,
            "subject": r.subject,
            "description": r.description,
            "status": r.status,
            "admin_notes": r.admin_notes,
            "resolved_by": r.resolved_by,
            "resolved_at": r.resolved_at,
            "created_at": r.created_at,
            "updated_at": r.updated_at,
        }
        try:
            d["screenshots"] = json.loads(r.screenshots_json or "[]")
        except Exception:
            d["screenshots"] = []
        reports.append(d)

    return {"reports": reports}


@router.get("")
def list_reports(
    status: Optional[str] = None,
    role: Optional[str] = None,
    branch_id: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(require_root_admin),
    db: Session = Depends(get_db)
):
    """
    List all technical reports for Root Admins with optional filtering.
    Includes count statistics.
    """
    count_rows = db.execute(
        select(TechnicalReport.status, func.count(TechnicalReport.id))
        .group_by(TechnicalReport.status)
    ).all()
    counts_map = {st: cnt for st, cnt in count_rows}

    total_count = sum(counts_map.values())
    open_count = counts_map.get("OPEN", 0)
    in_progress_count = counts_map.get("IN_PROGRESS", 0)
    resolved_count = counts_map.get("RESOLVED", 0)

    stmt = (
        select(TechnicalReport, Branch, User)
        .outerjoin(Branch, TechnicalReport.branch_id == Branch.id)
        .outerjoin(User, TechnicalReport.resolved_by == User.id)
    )

    if status and status.upper() != "ALL":
        stmt = stmt.where(TechnicalReport.status == status.upper())
    if role and role.upper() != "ALL":
        stmt = stmt.where(TechnicalReport.user_role == role.upper())
    if branch_id and branch_id.upper() != "ALL":
        stmt = stmt.where(TechnicalReport.branch_id == branch_id)

    status_priority = case(
        (TechnicalReport.status == 'OPEN', 1),
        (TechnicalReport.status == 'IN_PROGRESS', 2),
        else_=3
    )
    stmt = stmt.order_by(status_priority, TechnicalReport.created_at.desc())

    rows = db.execute(stmt).all()

    reports = []
    for r, b, u_res in rows:
        d = {
            "id": r.id,
            "user_id": r.user_id,
            "user_role": r.user_role,
            "user_name": r.user_name,
            "user_email": r.user_email,
            "user_roll": r.user_roll,
            "branch_id": r.branch_id,
            "branch_name": b.name if b else None,
            "resolved_by_name": u_res.full_name if u_res else None,
            "category": r.category,
            "subject": r.subject,
            "description": r.description,
            "status": r.status,
            "admin_notes": r.admin_notes,
            "resolved_by": r.resolved_by,
            "resolved_at": r.resolved_at,
            "created_at": r.created_at,
            "updated_at": r.updated_at,
        }
        try:
            d["screenshots"] = json.loads(r.screenshots_json or "[]")
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
def get_report_image(
    report_id: str,
    filename: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Serve a screenshot securely from persistent storage or local reports cache."""
    # Check access permission: ROOT_ADMIN or the report author
    if current_user.get("role") != "ROOT_ADMIN":
        rep = db.scalar(select(TechnicalReport).where(TechnicalReport.id == report_id))
        if not rep or rep.user_id != current_user.get("sub"):
            raise HTTPException(status_code=403, detail="Forbidden: You cannot access screenshots from another user's report.")

    safe_filename = os.path.basename(filename)

    media_type = "image/png"
    if safe_filename.endswith(".jpg") or safe_filename.endswith(".jpeg"):
        media_type = "image/jpeg"
    elif safe_filename.endswith(".webp"):
        media_type = "image/webp"

    storage_key = f"reports/{report_id}/{safe_filename}"
    storage = get_storage_service()

    try:
        if storage.file_exists(storage_key):
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

    file_path = settings.REPORTS_DIR / safe_filename
    if file_path.exists() and file_path.is_file():
        return FileResponse(file_path, media_type=media_type)

    raise HTTPException(status_code=404, detail="Screenshot image not found.")


@router.patch("/{report_id}")
def update_report_status(
    report_id: str,
    payload: ReportUpdatePayload,
    current_user: Dict[str, Any] = Depends(require_root_admin),
    db: Session = Depends(get_db)
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

    report = db.scalar(select(TechnicalReport).where(TechnicalReport.id == report_id))
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")

    resolved_at = now if new_status == "RESOLVED" else None
    resolved_by = admin_id if new_status == "RESOLVED" else None

    report.status = new_status
    report.admin_notes = admin_notes
    report.resolved_by = resolved_by
    report.resolved_at = resolved_at
    report.updated_at = now

    if new_status == "RESOLVED":
        reporter_id = report.user_id
        link_target = "/student/portal" if report.user_role == "STUDENT" else "/branch/batches"
        note_snip = f": {admin_notes}" if admin_notes else " - please refresh your portal."
        notif_msg = f"Your report '{report.subject[:45]}' has been marked resolved{note_snip}"

        send_notification(
            db,
            user_id=reporter_id,
            notif_type="REPORT_RESOLVED",
            title="Technical Issue Resolved",
            message=notif_msg,
            link_url=link_target
        )

    db.commit()

    # Fetch updated details
    row = db.execute(
        select(TechnicalReport, Branch, User)
        .outerjoin(Branch, TechnicalReport.branch_id == Branch.id)
        .outerjoin(User, TechnicalReport.resolved_by == User.id)
        .where(TechnicalReport.id == report_id)
    ).first()

    r, b, u_res = row
    res_dict = {
        "id": r.id,
        "user_id": r.user_id,
        "user_role": r.user_role,
        "user_name": r.user_name,
        "user_email": r.user_email,
        "user_roll": r.user_roll,
        "branch_id": r.branch_id,
        "branch_name": b.name if b else None,
        "resolved_by_name": u_res.full_name if u_res else None,
        "category": r.category,
        "subject": r.subject,
        "description": r.description,
        "status": r.status,
        "admin_notes": r.admin_notes,
        "resolved_by": r.resolved_by,
        "resolved_at": r.resolved_at,
        "created_at": r.created_at,
        "updated_at": r.updated_at,
    }
    try:
        res_dict["screenshots"] = json.loads(r.screenshots_json or "[]")
    except Exception:
        res_dict["screenshots"] = []

    return {
        "success": True,
        "report": res_dict,
        "message": f"Report updated to {new_status}."
    }
