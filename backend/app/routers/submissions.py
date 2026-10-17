import uuid
import shutil
import hashlib
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, status, BackgroundTasks
from pydantic import BaseModel
import fitz

from backend.app.config import settings
from backend.app.database import get_db, get_iso_now
from backend.app.services.storage import get_storage_service
from backend.app.services.pdf_service import pdf_service
from backend.app.services.grading_service import grading_service
from backend.app.services.auth import (
    get_current_user,
    get_current_user_optional,
    require_root_admin,
    require_branch_manager,
)
from backend.app.services.notification_service import (
    send_notification,
    notify_branch_managers,
)
from backend.app.services.retention_service import RetentionService

router = APIRouter(tags=["Submissions & Uploads"])

@router.get("")
def list_submissions(
    exam_id: Optional[str] = None,
    batch_id: Optional[str] = None,
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)
):
    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT s.*, 
                   e.title AS exam_title, 
                   e.subject AS exam_subject, 
                   e.total_marks AS exam_total_marks,
                   e.is_published AS exam_is_published,
                   e.published_at AS exam_published_at
            FROM submissions s
            LEFT JOIN exams e ON s.exam_id = e.id
            WHERE s.submission_status = 'SUBMITTED'
        """
        params = []
        if exam_id:
            query += " AND s.exam_id = ?"
            params.append(exam_id)
        if batch_id:
            query += " AND s.batch_id = ?"
            params.append(batch_id)
            
        # Student privacy isolation: only own submissions across all enrolled student records
        if current_user and current_user.get("role") == "STUDENT":
            cursor.execute("SELECT id, roll_number, full_name, student_id_num FROM students WHERE user_id = ?", (current_user["sub"],))
            stu_records = cursor.fetchall()
            student_ids = [r["id"] for r in stu_records]
            roll_numbers = [r["roll_number"].strip().upper() for r in stu_records if r.get("roll_number")]
            names = [r["full_name"].strip() for r in stu_records if r.get("full_name")]
            
            if current_user.get("student_id"):
                student_ids.append(current_user["student_id"])
            if current_user.get("roll_number"):
                roll_numbers.append(current_user["roll_number"].strip().upper())
            if current_user.get("full_name"):
                names.append(current_user["full_name"].strip())

            student_ids = list(set(filter(None, student_ids)))
            roll_numbers = list(set(filter(None, roll_numbers)))
            names = list(set(filter(None, names)))

            conditions = []
            if student_ids:
                ph = ",".join(["?"] * len(student_ids))
                conditions.append(f"s.student_id IN ({ph})")
                params.extend(student_ids)
            if roll_numbers:
                ph = ",".join(["?"] * len(roll_numbers))
                conditions.append(f"UPPER(s.roll_number) IN ({ph})")
                params.extend(roll_numbers)
            if names:
                ph = ",".join(["?"] * len(names))
                conditions.append(f"s.student_name IN ({ph})")
                params.extend(names)
            
            if conditions:
                query += f" AND ({' OR '.join(conditions)})"
            else:
                query += " AND s.student_id = ?"
                params.append(current_user["sub"])
            
        query += " ORDER BY s.roll_number ASC, s.created_at ASC"
        cursor.execute(query, tuple(params))
        submissions = [dict(r) for r in cursor.fetchall()]

        # Attach answers, revaluation, and 15-day storage retention lifecycle info
        is_student_user = bool(current_user and current_user.get("role") == "STUDENT")
        for s in submissions:
            is_pub = bool(s.get("publication_status") == "PUBLISHED" or s.get("exam_is_published") == 1)
            s["is_published"] = is_pub

            if is_student_user and not is_pub:
                # Strictly decouple and mask internal AI grading marks and answers before official publication!
                s["total_awarded_marks"] = None
                s["percentage"] = None
                s["answers"] = []
                s["revaluation"] = None
                s["publication_status"] = "UNPUBLISHED"
                s["student_status"] = (
                    "Under Evaluation"
                    if s.get("status") in ["QUEUED", "PROCESSING", "GRADED", "COMPLETED", "NEEDS_REVIEW", "PAUSED_QUOTA"]
                    else "Submitted"
                )
                s["days_remaining"] = None
                s["seconds_remaining"] = None
                s["retention_expires_at"] = None
            else:
                cursor.execute("SELECT * FROM answers WHERE submission_id = ? ORDER BY question_id ASC", (s["id"],))
                s["answers"] = [dict(a) for a in cursor.fetchall()]
                
                cursor.execute("SELECT * FROM revaluation_requests WHERE submission_id = ? ORDER BY requested_at DESC LIMIT 1", (s["id"],))
                reval = cursor.fetchone()
                s["revaluation"] = dict(reval) if reval else None

                # Retention info (TTL 15 days post-grading)
                retention_info = RetentionService.get_retention_info(s)
                s.update(retention_info)
                s["student_status"] = "Results Published" if is_pub else "Under Evaluation"

        return submissions

@router.get("/exam/{exam_id}")
def get_submissions_for_exam(exam_id: str):
    """Return all submissions for an exam with their nested answer breakdown for the marks ledger."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM submissions WHERE exam_id = ? ORDER BY roll_number ASC", (exam_id,))
        subs = [dict(r) for r in cursor.fetchall()]
        
        for s in subs:
            cursor.execute("SELECT * FROM answers WHERE submission_id = ? ORDER BY question_id ASC", (s["id"],))
            s["answers"] = [dict(a) for a in cursor.fetchall()]
        return subs

class RequestUploadBody(BaseModel):
    roll_number: str
    student_id: Optional[str] = None
    batch_id: Optional[str] = None

class ConfirmUploadBody(BaseModel):
    upload_session_id: str
    storage_key: str
    roll_number: str
    student_name: Optional[str] = None
    student_id: Optional[str] = None
    batch_id: Optional[str] = None
    file_size_bytes: Optional[int] = None
    sha256_hash: Optional[str] = None

def parse_iso(iso_str: str) -> datetime:
    try:
        return datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
    except Exception:
        return datetime.now(timezone.utc)

def verify_active_submission_window(exam_id: str, cursor, allow_grace: bool = False):
    """Verify that the exam has an active submission window."""
    cursor.execute(
        "SELECT * FROM submission_windows WHERE exam_id = ? ORDER BY created_at DESC LIMIT 1",
        (exam_id,)
    )
    window = cursor.fetchone()
    if not window or window["status"] != "OPEN":
        raise HTTPException(status_code=400, detail="Submission window is not currently open for this examination.")
    
    now = datetime.now(timezone.utc)
    target_deadline = parse_iso(window["grace_deadline_at"] if allow_grace else window["deadline_at"])
    
    if now > target_deadline:
        if allow_grace:
            raise HTTPException(status_code=400, detail="Grace period has expired. Upload rejected.")
        else:
            raise HTTPException(status_code=400, detail="Submission window has closed.")
    return window

@router.post("/{exam_id}/request-upload")
def request_presigned_upload(
    exam_id: str,
    req: RequestUploadBody,
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user)
):
    """
    Step 1 of Direct-to-Storage Upload:
    Validates submission window, creates upload session, and generates pre-signed S3/R2 PUT URL.
    Zero Render RAM/bandwidth consumed during file transmission.
    """
    clean_roll = req.roll_number.strip().upper()
    
    with get_db() as conn:
        cursor = conn.cursor()
        # Verify active window (strict deadline, not grace, for new upload initiation)
        verify_active_submission_window(exam_id, cursor, allow_grace=False)
        
        # Verify exam exists
        cursor.execute("SELECT id, title FROM exams WHERE id = ?", (exam_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Exam not found.")
        
        upload_session_id = f"upsess_{uuid.uuid4().hex}"
        student_tag = req.student_id or clean_roll
        destination_key = f"submissions/{exam_id}/{student_tag}/original_{upload_session_id}.pdf"
        
        storage = get_storage_service()
        presigned = storage.generate_presigned_upload_url(
            key=destination_key,
            content_type="application/pdf",
            expires_in=300 # 5 minutes
        )
        
        return {
            "status": "authorized",
            "upload_session_id": upload_session_id,
            "destination_key": destination_key,
            "upload_url": presigned["url"],
            "method": presigned["method"],
            "headers": presigned.get("headers", {}),
            "is_direct_cloud": presigned.get("is_direct_cloud", False)
        }

@router.post("/{exam_id}/confirm-upload")
def confirm_presigned_upload(
    exam_id: str,
    req: ConfirmUploadBody,
    background_tasks: BackgroundTasks,
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user)
):
    """
    Step 2 of Direct-to-Storage Upload:
    Validates file integrity with PyMuPDF, enforces bounds (<=15 pages, <=7MB),
    and executes atomic replacement (superseding any previous submission).
    """
    clean_roll = req.roll_number.strip().upper()
    storage = get_storage_service()
    
    # Check that file exists in storage
    if not storage.file_exists(req.storage_key):
        raise HTTPException(status_code=400, detail="Uploaded file was not found in storage. Please re-upload.")
    
    local_path = storage.get_local_path_or_download(req.storage_key)
    file_size = local_path.stat().st_size
    
    # 1. Enforce max file size
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if file_size > max_bytes:
        storage.delete_file(req.storage_key)
        raise HTTPException(
            status_code=400,
            detail=f"File exceeds maximum size limit of {settings.MAX_UPLOAD_SIZE_MB} MB (received {file_size / (1024*1024):.1f} MB)."
        )
    
    # 2. Enforce PDF structure and page count with PyMuPDF
    try:
        doc = fitz.open(str(local_path))
        page_count = len(doc)
        doc.close()
    except Exception as e:
        storage.delete_file(req.storage_key)
        raise HTTPException(status_code=400, detail=f"Invalid or corrupted PDF file: {str(e)}")
    
    if page_count > settings.MAX_PAGE_COUNT:
        storage.delete_file(req.storage_key)
        raise HTTPException(
            status_code=400,
            detail=f"PDF exceeds maximum page limit of {settings.MAX_PAGE_COUNT} pages (received {page_count} pages)."
        )
    
    now = get_iso_now()
    sub_id = f"sub_{uuid.uuid4().hex[:12]}"
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Verify active window (allows grace period for in-flight completions)
        verify_active_submission_window(exam_id, cursor, allow_grace=True)
        
        # Fetch exam total marks and branch
        cursor.execute("SELECT title, branch_id, total_marks FROM exams WHERE id = ?", (exam_id,))
        exam = cursor.fetchone()
        exam_total = exam["total_marks"] if exam else 0.0
        
        # ATOMIC REPLACEMENT: Find existing active submission for this student
        cursor.execute("""
            SELECT id FROM submissions 
            WHERE exam_id = ? AND UPPER(roll_number) = ? AND submission_status = 'SUBMITTED'
        """, (exam_id, clean_roll))
        prev_sub = cursor.fetchone()
        
        if prev_sub:
            # Mark previous submission as SUPERSEDED
            cursor.execute("""
                UPDATE submissions 
                SET submission_status = 'SUPERSEDED', updated_at = ?
                WHERE id = ?
            """, (now, prev_sub["id"]))
            
            cursor.execute("""
                INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details_json, created_at)
                VALUES (?, ?, 'SUPERSEDE_SUBMISSION', 'SUBMISSION', ?, ?, ?)
            """, (
                f"aud_{uuid.uuid4().hex[:12]}",
                current_user["sub"] if current_user else "system",
                prev_sub["id"],
                f'{{"superseded_by": "{sub_id}", "roll_number": "{clean_roll}"}}',
                now
            ))
        
        s_name = req.student_name or f"Student {clean_roll}"
        student_id = req.student_id
        if not student_id:
            cursor.execute("SELECT id, full_name FROM students WHERE UPPER(roll_number) = ?", (clean_roll,))
            stu_rec = cursor.fetchone()
            if stu_rec:
                student_id = stu_rec["id"]
                if not req.student_name:
                    s_name = stu_rec["full_name"]
            elif current_user and current_user.get("role") == "STUDENT":
                cursor.execute("SELECT id, full_name FROM students WHERE user_id = ?", (current_user["sub"],))
                stu_rec = cursor.fetchone()
                if stu_rec:
                    student_id = stu_rec["id"]
                    if not req.student_name:
                        s_name = stu_rec["full_name"]
        
        # Schedule page rendering asynchronously in background
        background_tasks.add_task(pdf_service.render_pdf_pages_to_images, local_path, sub_id)
        
        # Insert active submission
        cursor.execute("""
            INSERT INTO submissions (
                id, batch_id, exam_id, student_id, student_name, roll_number,
                original_file_path, canonical_pdf_path, page_count, file_size_bytes,
                sha256_hash, upload_session_id, submission_status, status, publication_status,
                max_marks, submitted_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', 'UPLOADED', 'UNPUBLISHED', ?, ?, ?, ?)
        """, (
            sub_id, req.batch_id, exam_id, student_id, s_name, clean_roll,
            req.storage_key, req.storage_key, page_count, file_size,
            req.sha256_hash, req.upload_session_id, exam_total, now, now, now
        ))
        
        # Update batch counters if batch exists
        if req.batch_id:
            cursor.execute("UPDATE batches SET updated_at = ? WHERE id = ?", (now, req.batch_id))
        
        # Student confirmation notification
        target_user_id = current_user.get("sub") if current_user and current_user.get("role") == "STUDENT" else None
        if not target_user_id and student_id:
            cursor.execute("SELECT user_id FROM students WHERE id = ?", (student_id,))
            s_row = cursor.fetchone()
            if s_row and s_row["user_id"]:
                target_user_id = s_row["user_id"]
        
        exam_title = exam["title"] if exam and exam.get("title") else "Exam"
        exam_branch = exam.get("branch_id") if exam else None
        
        if target_user_id:
            send_notification(
                cursor=cursor,
                user_id=target_user_id,
                notif_type="SUBMISSION_CONFIRMED",
                title="Answer Sheet Submitted",
                message=f"Your answer sheet for '{exam_title}' has been received. Status: Submitted.",
                link_url="/student/portal"
            )
        
        notify_branch_managers(
            cursor=cursor,
            branch_id=exam_branch,
            notif_type="SUBMISSION_RECEIVED",
            title="New Student Submission",
            message=f"Student {clean_roll} submitted their answer script for '{exam_title}'.",
            link_url="/overview"
        )
        
        return {
            "status": "success",
            "submission_id": sub_id,
            "student_name": s_name,
            "roll_number": clean_roll,
            "page_count": page_count,
            "file_size_bytes": file_size,
            "is_replacement": bool(prev_sub),
            "submitted_at": now,
            "student_status": "Submitted"
        }

def _process_submission_sync(
    exam_id: str,
    clean_roll: str,
    student_name: Optional[str],
    batch_id: Optional[str],
    content: bytes,
    current_sub: Optional[str],
    current_role: Optional[str]
) -> Dict[str, Any]:
    storage = get_storage_service()
    
    with get_db() as conn:
        cursor = conn.cursor()
        verify_active_submission_window(exam_id, cursor, allow_grace=False)
        
        cursor.execute("SELECT title, branch_id, total_marks FROM exams WHERE id = ?", (exam_id,))
        exam = cursor.fetchone()
        exam_total = exam["total_marks"] if exam else 0.0
    
    sub_id = f"sub_{uuid.uuid4().hex[:12]}"
    dest_key = f"submissions/{exam_id}/{clean_roll}/original_{sub_id}.pdf"
    file_size = len(content)
    
    # Save to storage (Cloudinary / R2 / local disk)
    storage.upload_file(content, dest_key, content_type="application/pdf")
    local_path = storage.get_local_path_or_download(dest_key)
    
    try:
        doc = fitz.open(str(local_path))
        page_count = len(doc)
        doc.close()
    except Exception as e:
        storage.delete_file(dest_key)
        raise HTTPException(status_code=400, detail=f"Corrupted or invalid PDF: {str(e)}")
    
    if page_count > settings.MAX_PAGE_COUNT:
        storage.delete_file(dest_key)
        raise HTTPException(status_code=400, detail=f"File exceeds {settings.MAX_PAGE_COUNT} page limit.")
    
    sha256 = hashlib.sha256(content).hexdigest()
    now = get_iso_now()
    s_name = (student_name or "").strip() or f"Student {clean_roll}"
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Resolve student_id if student is enrolled in students table
        student_id = None
        cursor.execute("SELECT id, full_name, batch_id FROM students WHERE UPPER(roll_number) = ?", (clean_roll,))
        stu_rec = cursor.fetchone()
        if stu_rec:
            student_id = stu_rec["id"]
            if not student_name:
                s_name = stu_rec["full_name"]
            if not batch_id and stu_rec["batch_id"]:
                batch_id = stu_rec["batch_id"]
        elif current_role == "STUDENT" and current_sub:
            cursor.execute("SELECT id, full_name, batch_id FROM students WHERE user_id = ?", (current_sub,))
            stu_rec = cursor.fetchone()
            if stu_rec:
                student_id = stu_rec["id"]
                if not student_name:
                    s_name = stu_rec["full_name"]
                if not batch_id and stu_rec["batch_id"]:
                    batch_id = stu_rec["batch_id"]

        # Atomic replacement
        cursor.execute("""
            SELECT id FROM submissions 
            WHERE exam_id = ? AND UPPER(roll_number) = ? AND submission_status = 'SUBMITTED'
        """, (exam_id, clean_roll))
        prev_sub = cursor.fetchone()
        
        if prev_sub:
            cursor.execute("UPDATE submissions SET submission_status = 'SUPERSEDED', updated_at = ? WHERE id = ?", (now, prev_sub["id"]))
        
        cursor.execute("""
            INSERT INTO submissions (
                id, batch_id, exam_id, student_id, student_name, roll_number,
                original_file_path, canonical_pdf_path, page_count, file_size_bytes,
                sha256_hash, submission_status, status, publication_status,
                max_marks, submitted_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', 'UPLOADED', 'UNPUBLISHED', ?, ?, ?, ?)
        """, (
            sub_id, batch_id, exam_id, student_id, s_name, clean_roll,
            dest_key, dest_key, page_count, file_size,
            sha256, exam_total, now, now, now
        ))
        
        # Student confirmation notification
        target_user_id = current_sub if current_role == "STUDENT" else None
        if not target_user_id and student_id:
            cursor.execute("SELECT user_id FROM students WHERE id = ?", (student_id,))
            s_row = cursor.fetchone()
            if s_row and s_row["user_id"]:
                target_user_id = s_row["user_id"]
        
        exam_title = exam["title"] if exam and exam.get("title") else "Exam"
        exam_branch = exam.get("branch_id") if exam else None
        
        if target_user_id:
            send_notification(
                cursor=cursor,
                user_id=target_user_id,
                notif_type="SUBMISSION_CONFIRMED",
                title="Answer Sheet Submitted",
                message=f"Your answer sheet for '{exam_title}' has been received. Status: Submitted.",
                link_url="/student/portal"
            )
        
        notify_branch_managers(
            cursor=cursor,
            branch_id=exam_branch,
            notif_type="SUBMISSION_RECEIVED",
            title="New Student Submission",
            message=f"Student {clean_roll} submitted their answer script for '{exam_title}'.",
            link_url="/overview"
        )
        
        payload = {
            "status": "success",
            "submission_id": sub_id,
            "roll_number": clean_roll,
            "page_count": page_count,
            "file_size_bytes": file_size,
            "is_replacement": bool(prev_sub),
            "student_status": "Submitted"
        }
        return payload, str(local_path), sub_id

@router.post("/{exam_id}/upload-single")
async def upload_single_multipart(
    exam_id: str,
    background_tasks: BackgroundTasks,
    roll_number: str = Form(...),
    student_name: Optional[str] = Form(""),
    batch_id: Optional[str] = Form(None),
    file: UploadFile = File(...),
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user)
):
    """
    Standard multipart upload endpoint for single-PDF submissions.
    Supports local dev testing and direct file picker upload in PWA.
    Upload validation and DB transactions run non-blocking, and heavy page rendering
    is dispatched to background_tasks to return an instant HTTP 200 acknowledgment.
    """
    clean_roll = roll_number.strip().upper()
    content = await file.read()
    file_size = len(content)
    
    if file_size > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File exceeds maximum size of {settings.MAX_UPLOAD_SIZE_MB} MB.")

    current_sub = current_user.get("sub") if current_user else None
    current_role = current_user.get("role") if current_user else None

    res_payload, local_path, sub_id = await asyncio.to_thread(
        _process_submission_sync,
        exam_id,
        clean_roll,
        student_name,
        batch_id,
        content,
        current_sub,
        current_role
    )

    # Decouple page rendering to background task for instant < 250ms HTTP 200 response
    background_tasks.add_task(pdf_service.render_pdf_pages_to_images, Path(local_path), sub_id)

    return res_payload

@router.get("/{submission_id}")
def get_submission_details(
    submission_id: str,
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)
):
    """
    Fetch submission record with strict role-based visibility decoupling.
    Students see only 3 statuses: 'Submitted', 'Under Evaluation', 'Results Published'.
    Marks, rationales, and graded PDFs are hidden until publication_status == 'PUBLISHED'.
    """
    sub = grading_service.get_submission_details(submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    is_student = current_user and current_user.get("role") == "STUDENT"
    is_published = sub.get("publication_status") == "PUBLISHED"
    
    if is_student:
        # Check student ownership
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, roll_number FROM students WHERE user_id = ?", (current_user["sub"],))
            stu_rows = cursor.fetchall()
            allowed_rolls = [r["roll_number"].strip().upper() for r in stu_rows if r.get("roll_number")]
            allowed_ids = [r["id"] for r in stu_rows]
            if current_user.get("roll_number"):
                allowed_rolls.append(current_user["roll_number"].strip().upper())
            if current_user.get("student_id"):
                allowed_ids.append(current_user["student_id"])
            
            sub_roll = (sub.get("roll_number") or "").strip().upper()
            sub_stu_id = sub.get("student_id") or ""
            
            if allowed_rolls or allowed_ids:
                if sub_roll not in allowed_rolls and sub_stu_id not in allowed_ids:
                    raise HTTPException(status_code=403, detail="Forbidden: You can only view your own submission.")
        
        # Student-facing view
        if not is_published:
            # Mask internal AI grading results
            student_status = (
                "Under Evaluation"
                if sub.get("status") in ["QUEUED", "PROCESSING", "GRADED", "COMPLETED", "NEEDS_REVIEW", "PAUSED_QUOTA"]
                else "Submitted"
            )
            return {
                "id": sub["id"],
                "exam_id": sub["exam_id"],
                "exam": sub.get("exam", {}),
                "student_name": sub["student_name"],
                "roll_number": sub["roll_number"],
                "page_count": sub["page_count"],
                "submission_status": sub["submission_status"],
                "student_status": student_status,
                "is_published": False,
                "submitted_at": sub.get("submitted_at") or sub.get("created_at")
            }
        else:
            # Published: student can view full paper, answer regions, bounding boxes (if not purged), and download PDF (if not purged)
            is_purged = bool(sub.get("is_document_purged"))
            return {
                "id": sub["id"],
                "exam_id": sub["exam_id"],
                "exam": sub.get("exam", {}),
                "student_name": sub["student_name"],
                "roll_number": sub["roll_number"],
                "page_count": sub["page_count"],
                "student_status": "Results Published",
                "is_published": True,
                "publication_status": "PUBLISHED",
                "total_awarded_marks": sub["total_awarded_marks"],
                "max_marks": sub["max_marks"],
                "percentage": sub["percentage"],
                "answers": sub.get("answers", []),
                "revaluation_requests": sub.get("revaluation_requests", []),
                "annotated_pdf_url": (
                    None if is_purged
                    else (f"/api/v1/storage/download?key={sub.get('annotated_pdf_path')}" if sub.get("annotated_pdf_path") else None)
                ),
                "is_document_purged": is_purged,
                "purged_at": sub.get("purged_at"),
                "graded_at": sub.get("graded_at"),
                "ttl_days": sub.get("ttl_days") or 15,
                "retention_expires_at": sub.get("retention_expires_at"),
                "days_remaining": sub.get("days_remaining"),
                "seconds_remaining": sub.get("seconds_remaining"),
                "revaluation_days_remaining": sub.get("revaluation_days_remaining"),
                "revaluation_window_open": sub.get("revaluation_window_open"),
                "storage_notice": sub.get("storage_notice"),
                "submitted_at": sub.get("submitted_at") or sub.get("created_at")
            }
    
    # Root Admin / Branch Manager view: return full internal representation
    return sub

@router.post("/purge-expired")
def purge_expired_documents(current_user: Dict[str, Any] = Depends(require_root_admin)):
    """
    Root Admin maintenance task:
    Scans and purges all student submissions that have exceeded the 15-day TTL post-grading.
    Deletes raw and annotated PDFs from storage, renders from disk, and removes answer_regions (bounding boxes) from database.
    """
    res = RetentionService.check_and_purge_expired_submissions()
    return res
