import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel

from backend.app.config import settings
from backend.app.database import get_db, get_iso_now
from backend.app.services.auth import (
    get_current_user,
    require_branch_manager,
    require_root_admin,
)
from backend.app.services.notification_service import (
    notify_branch_students,
    notify_branch_managers,
)

router = APIRouter(prefix="/api/v1/windows", tags=["Submission Windows & Lifecycles"])

class OpenWindowRequest(BaseModel):
    duration_minutes: Optional[int] = None
    grace_minutes: Optional[int] = None

class ReopenWindowRequest(BaseModel):
    reopen_reason: str
    reopen_scope: str = "UNSUBMITTED_ONLY" # "UNSUBMITTED_ONLY" or "ALL_STUDENTS"
    duration_minutes: Optional[int] = None

class CloseWindowRequest(BaseModel):
    reason: Optional[str] = "Manually closed by administrator"

def parse_iso(iso_str: str) -> datetime:
    try:
        return datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
    except Exception:
        return datetime.now(timezone.utc)

@router.get("/{exam_id}/status")
def get_window_status(exam_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Get current submission window status and seconds remaining for an exam.
    Powers the PWA real-time countdown timer.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT * FROM submission_windows 
            WHERE exam_id = ? 
            ORDER BY created_at DESC LIMIT 1
            """,
            (exam_id,)
        )
        window = cursor.fetchone()
        
        if not window:
            return {
                "has_window": False,
                "status": "NOT_OPENED",
                "is_active": False,
                "seconds_remaining": 0,
                "is_in_grace": False,
                "is_expired": True
            }
        
        now = datetime.now(timezone.utc)
        deadline = parse_iso(window["deadline_at"])
        grace_deadline = parse_iso(window["grace_deadline_at"])
        
        is_in_window = now <= deadline
        is_in_grace = deadline < now <= grace_deadline
        is_active = (is_in_window or is_in_grace) and window["status"] == "OPEN"
        seconds_remaining = max(0, int((deadline - now).total_seconds()))
        grace_seconds_remaining = max(0, int((grace_deadline - now).total_seconds()))

        closed_at_iso = window.get("grace_deadline_at") or window.get("deadline_at")
        closed_at_dt = parse_iso(closed_at_iso)
        seconds_since_closed = None
        seconds_until_card_expires = 0
        TWO_HOURS_SECONDS = 2 * 3600

        if not is_active:
            diff = (now - closed_at_dt).total_seconds()
            seconds_since_closed = max(0, int(diff))
            seconds_until_card_expires = max(0, int(TWO_HOURS_SECONDS - seconds_since_closed))

        should_display = is_active or (seconds_since_closed is not None and seconds_since_closed <= TWO_HOURS_SECONDS)
        
        return {
            "has_window": True,
            "window_id": window["id"],
            "window_number": window["window_number"],
            "status": window["status"],
            "opened_at": window["opened_at"],
            "deadline_at": window["deadline_at"],
            "grace_deadline_at": window["grace_deadline_at"],
            "closed_at": closed_at_iso,
            "seconds_since_closed": seconds_since_closed,
            "seconds_until_card_expires": seconds_until_card_expires,
            "is_active": is_active,
            "is_in_window": is_in_window,
            "is_in_grace": is_in_grace,
            "is_expired": now > grace_deadline,
            "seconds_remaining": seconds_remaining,
            "grace_seconds_remaining": grace_seconds_remaining,
            "should_display": should_display
        }

@router.post("/{exam_id}/open")
def open_submission_window(
    exam_id: str,
    req: OpenWindowRequest = OpenWindowRequest(),
    current_user: Dict[str, Any] = Depends(require_branch_manager)
):
    """
    Open the strict 30-minute submission window (+2 minute grace).
    Audited server-side timestamp lock.
    """
    duration = req.duration_minutes or settings.WINDOW_DURATION_MINUTES
    grace = req.grace_minutes or settings.GRACE_PERIOD_MINUTES
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Verify exam exists
        cursor.execute("SELECT * FROM exams WHERE id = ?", (exam_id,))
        exam = cursor.fetchone()
        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found")
        
        # Branch Manager tenancy guard
        if current_user["role"] == "BRANCH_MANAGER":
            user_branch = current_user.get("branch_id")
            if exam["branch_id"] and exam["branch_id"] != user_branch:
                raise HTTPException(status_code=403, detail="Forbidden: exam belongs to another branch.")
        
        now_dt = datetime.now(timezone.utc)
        deadline_dt = now_dt + timedelta(minutes=duration)
        grace_dt = deadline_dt + timedelta(minutes=grace)
        
        now_iso = now_dt.isoformat()
        deadline_iso = deadline_dt.isoformat()
        grace_iso = grace_dt.isoformat()
        
        window_id = f"win_{uuid.uuid4().hex[:12]}"
        
        cursor.execute("""
            INSERT INTO submission_windows (
                id, exam_id, branch_id, window_number, opened_at, deadline_at, grace_deadline_at,
                status, created_by, created_at
            ) VALUES (?, ?, ?, 1, ?, ?, ?, 'OPEN', ?, ?)
        """, (window_id, exam_id, exam["branch_id"], now_iso, deadline_iso, grace_iso, current_user["sub"], now_iso))
        
        cursor.execute("""
            UPDATE exams 
            SET lifecycle_status = 'SUBMISSION_OPEN', status = 'SUBMISSION_OPEN', updated_at = ?
            WHERE id = ?
        """, (now_iso, exam_id))
        
        # Dispatch notification to students in the branch & exam batches
        notify_branch_students(
            cursor=cursor,
            branch_id=exam["branch_id"],
            notif_type="WINDOW_OPENED",
            title="Submission Window Open",
            message=f"The {duration}-minute submission window for '{exam['title']}' is now open! Upload your answer sheet before the deadline.",
            link_url="/student/portal",
            exam_id=exam_id
        )
        
        # Notify branch manager if opened by Root Admin
        if current_user.get("role") == "ROOT_ADMIN" and exam.get("branch_id"):
            notify_branch_managers(
                cursor=cursor,
                branch_id=exam["branch_id"],
                notif_type="WINDOW_OPENED",
                title="Submission Window Activated",
                message=f"Submission window for '{exam['title']}' was opened by Root Administration ({duration} min).",
                link_url="/overview",
                exclude_user_id=current_user["sub"]
            )
        
        # Audit log
        cursor.execute("""
            INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details_json, created_at)
            VALUES (?, ?, 'OPEN_SUBMISSION_WINDOW', 'EXAM', ?, ?, ?)
        """, (
            f"aud_{uuid.uuid4().hex[:12]}",
            current_user["sub"],
            exam_id,
            f'{{"duration_minutes": {duration}, "grace_minutes": {grace}, "deadline": "{deadline_iso}"}}',
            now_iso
        ))
        
        return {
            "status": "success",
            "window_id": window_id,
            "opened_at": now_iso,
            "deadline_at": deadline_iso,
            "grace_deadline_at": grace_iso,
            "duration_minutes": duration,
            "grace_minutes": grace
        }

@router.post("/{exam_id}/reopen")
def reopen_submission_window(
    exam_id: str,
    req: ReopenWindowRequest,
    current_user: Dict[str, Any] = Depends(require_branch_manager)
):
    """
    Reopen an expired submission window. Requires mandatory audited reason and scope.
    """
    clean_reason = req.reopen_reason.strip()
    if not clean_reason:
        raise HTTPException(status_code=400, detail="A mandatory justification reason must be provided to reopen a window.")
    
    duration = req.duration_minutes or settings.WINDOW_DURATION_MINUTES
    grace = settings.GRACE_PERIOD_MINUTES
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM exams WHERE id = ?", (exam_id,))
        exam = cursor.fetchone()
        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found")
        
        # Disallow reopening if evaluation has already started
        if exam["lifecycle_status"] in ["EVALUATION_READY", "EVALUATING", "RESULTS_READY", "PUBLISHED"]:
            raise HTTPException(
                status_code=400,
                detail="Cannot reopen submission window: evaluation has already commenced or completed."
            )
        
        # Count prior windows
        cursor.execute("SELECT COUNT(*) as cnt FROM submission_windows WHERE exam_id = ?", (exam_id,))
        win_count = cursor.fetchone()["cnt"] + 1
        
        now_dt = datetime.now(timezone.utc)
        deadline_dt = now_dt + timedelta(minutes=duration)
        grace_dt = deadline_dt + timedelta(minutes=grace)
        
        now_iso = now_dt.isoformat()
        deadline_iso = deadline_dt.isoformat()
        grace_iso = grace_dt.isoformat()
        
        window_id = f"win_{uuid.uuid4().hex[:12]}"
        
        cursor.execute("""
            INSERT INTO submission_windows (
                id, exam_id, branch_id, window_number, opened_at, deadline_at, grace_deadline_at,
                status, reopen_reason, reopen_scope, created_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?)
        """, (
            window_id, exam_id, exam["branch_id"], win_count,
            now_iso, deadline_iso, grace_iso,
            clean_reason, req.reopen_scope, current_user["sub"], now_iso
        ))
        
        cursor.execute("""
            UPDATE exams 
            SET lifecycle_status = 'SUBMISSION_OPEN', status = 'SUBMISSION_OPEN', updated_at = ?
            WHERE id = ?
        """, (now_iso, exam_id))
        
        # Dispatch notifications to branch & exam students
        notify_branch_students(
            cursor=cursor,
            branch_id=exam["branch_id"],
            notif_type="WINDOW_REOPENED",
            title="Submission Window Reopened",
            message=f"The submission window for '{exam['title']}' has been reopened for {duration} min. Reason: {clean_reason}.",
            link_url="/student/portal",
            exam_id=exam_id
        )
        
        # Notify branch manager if reopened by Root Admin
        if current_user.get("role") == "ROOT_ADMIN" and exam.get("branch_id"):
            notify_branch_managers(
                cursor=cursor,
                branch_id=exam["branch_id"],
                notif_type="WINDOW_REOPENED",
                title="Submission Window Reopened",
                message=f"Submission window for '{exam['title']}' was reopened by Root Admin ({duration} min). Reason: {clean_reason}.",
                link_url="/overview",
                exclude_user_id=current_user["sub"]
            )
        
        # Audit log
        cursor.execute("""
            INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details_json, created_at)
            VALUES (?, ?, 'REOPEN_SUBMISSION_WINDOW', 'EXAM', ?, ?, ?)
        """, (
            f"aud_{uuid.uuid4().hex[:12]}",
            current_user["sub"],
            exam_id,
            f'{{"reason": "{clean_reason}", "scope": "{req.reopen_scope}", "new_deadline": "{deadline_iso}"}}',
            now_iso
        ))
        
        return {
            "status": "success",
            "window_id": window_id,
            "window_number": win_count,
            "opened_at": now_iso,
            "deadline_at": deadline_iso,
            "grace_deadline_at": grace_iso,
            "reopen_reason": clean_reason,
            "reopen_scope": req.reopen_scope
        }

@router.post("/{exam_id}/close")
def close_submission_window(
    exam_id: str,
    req: CloseWindowRequest = CloseWindowRequest(),
    current_user: Dict[str, Any] = Depends(require_branch_manager)
):
    """
    Hard-close an active submission window immediately before timer expiry.
    Terminates student upload capability and transitions exam lifecycle so evaluation can commence.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM exams WHERE id = ?", (exam_id,))
        exam = cursor.fetchone()
        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found")
        
        # Branch Manager tenancy guard
        if current_user["role"] == "BRANCH_MANAGER":
            user_branch = current_user.get("branch_id")
            if exam["branch_id"] and exam["branch_id"] != user_branch:
                raise HTTPException(status_code=403, detail="Forbidden: exam belongs to another branch.")
        
        # Find active open window
        cursor.execute(
            """
            SELECT * FROM submission_windows 
            WHERE exam_id = ? 
            ORDER BY created_at DESC LIMIT 1
            """,
            (exam_id,)
        )
        window = cursor.fetchone()
        if not window or window["status"] != "OPEN":
            raise HTTPException(status_code=400, detail="No active open submission window to close.")
        
        now_dt = datetime.now(timezone.utc)
        now_iso = now_dt.isoformat()
        clean_reason = (req.reason or "Manually closed by administrator").strip()
        
        # Hard close: update status to CLOSED and truncate deadlines to now
        cursor.execute("""
            UPDATE submission_windows 
            SET status = 'CLOSED', deadline_at = ?, grace_deadline_at = ?
            WHERE id = ?
        """, (now_iso, now_iso, window["id"]))
        
        # Determine updated exam lifecycle status
        cursor.execute("SELECT id FROM rubric_versions WHERE id = ? AND is_approved = 1", (exam.get("current_rubric_version_id"),))
        rubric = cursor.fetchone()
        
        if rubric and exam.get("answer_key_path"):
            new_status = "EVALUATION_READY"
            new_lifecycle = "EVALUATION_READY"
        elif rubric:
            new_status = "RUBRIC_APPROVED"
            new_lifecycle = "APPROVED"
        else:
            new_status = "CLOSED"
            new_lifecycle = "SUBMISSION_CLOSED"
        
        cursor.execute("""
            UPDATE exams 
            SET lifecycle_status = ?, status = ?, updated_at = ?
            WHERE id = ?
        """, (new_lifecycle, new_status, now_iso, exam_id))
        
        # Dispatch notifications to branch & exam students
        notify_branch_students(
            cursor=cursor,
            branch_id=exam["branch_id"],
            notif_type="WINDOW_CLOSED",
            title="Submission Window Closed",
            message=f"The submission window for '{exam['title']}' has been closed. Reason: {clean_reason}.",
            link_url="/student/portal",
            exam_id=exam_id
        )
        
        # Notify branch manager if closed by Root Admin
        if current_user.get("role") == "ROOT_ADMIN" and exam.get("branch_id"):
            notify_branch_managers(
                cursor=cursor,
                branch_id=exam["branch_id"],
                notif_type="WINDOW_CLOSED",
                title="Submission Window Closed Early",
                message=f"Submission window for '{exam['title']}' was hard-closed early by Root Admin. Reason: {clean_reason}.",
                link_url="/overview",
                exclude_user_id=current_user["sub"]
            )
        
        # Audit log
        cursor.execute("""
            INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details_json, created_at)
            VALUES (?, ?, 'CLOSE_SUBMISSION_WINDOW', 'EXAM', ?, ?, ?)
        """, (
            f"aud_{uuid.uuid4().hex[:12]}",
            current_user["sub"],
            exam_id,
            f'{{"window_id": "{window["id"]}", "closed_early": true, "reason": "{clean_reason}"}}',
            now_iso
        ))
        
        return {
            "status": "success",
            "window_id": window["id"],
            "closed_at": now_iso,
            "is_active": False,
            "message": "Submission window successfully hard closed."
        }

