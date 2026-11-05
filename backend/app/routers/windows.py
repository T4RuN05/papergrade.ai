import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, status, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select, func, update

from backend.app.config import settings
from backend.app.db.session import get_db
from backend.app.db.base import get_iso_now
from backend.app.db.models import (
    Exam,
    SubmissionWindow,
    RubricVersion,
    AuditLog,
)
from backend.app.services.auth import (
    get_current_user,
    require_branch_manager,
    require_root_admin,
)
from backend.app.services.notification_service import (
    background_dispatch_window_event,
)

router = APIRouter(prefix="/api/v1/windows", tags=["Submission Windows & Lifecycles"])


class OpenWindowRequest(BaseModel):
    duration_minutes: Optional[int] = None
    grace_minutes: Optional[int] = None


class ReopenWindowRequest(BaseModel):
    reopen_reason: str
    reopen_scope: str = "UNSUBMITTED_ONLY"  # "UNSUBMITTED_ONLY" or "ALL_STUDENTS"
    duration_minutes: Optional[int] = None


class CloseWindowRequest(BaseModel):
    reason: Optional[str] = "Manually closed by administrator"


def parse_iso(iso_str: str) -> datetime:
    try:
        return datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
    except Exception:
        return datetime.now(timezone.utc)


def calculate_window_dict(window: Optional[Dict[str, Any]], now: Optional[datetime] = None) -> Dict[str, Any]:
    if not now:
        now = datetime.now(timezone.utc)
    if not window:
        return {
            "has_window": False,
            "status": "NOT_OPENED",
            "is_active": False,
            "seconds_remaining": 0,
            "is_in_grace": False,
            "is_expired": True,
            "should_display": False,
        }

    deadline = parse_iso(window["deadline_at"])
    grace_deadline = parse_iso(window["grace_deadline_at"])

    is_in_window = now <= deadline
    is_in_grace = deadline < now <= grace_deadline
    is_active = (is_in_window or is_in_grace) and window.get("status") == "OPEN"
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
        "should_display": should_display,
    }


def _window_to_dict(w: SubmissionWindow) -> Dict[str, Any]:
    return {
        "id": w.id,
        "exam_id": w.exam_id,
        "branch_id": w.branch_id,
        "window_number": w.window_number,
        "opened_at": w.opened_at,
        "deadline_at": w.deadline_at,
        "grace_deadline_at": w.grace_deadline_at,
        "status": w.status,
        "reopen_reason": w.reopen_reason,
        "reopen_scope": w.reopen_scope,
        "created_by": w.created_by,
        "created_at": w.created_at,
    }


@router.get("/{exam_id}/status")
def get_window_status(
    exam_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get current submission window status and seconds remaining for an exam.
    Powers the PWA real-time countdown timer.
    """
    window = db.scalar(
        select(SubmissionWindow)
        .where(SubmissionWindow.exam_id == exam_id)
        .order_by(SubmissionWindow.created_at.desc())
        .limit(1)
    )
    return calculate_window_dict(_window_to_dict(window) if window else None)


@router.post("/{exam_id}/open")
def open_submission_window(
    exam_id: str,
    background_tasks: BackgroundTasks,
    req: OpenWindowRequest = OpenWindowRequest(),
    current_user: Dict[str, Any] = Depends(require_branch_manager),
    db: Session = Depends(get_db)
):
    """
    Open the strict 30-minute submission window (+2 minute grace).
    Audited server-side timestamp lock.
    """
    duration = req.duration_minutes or settings.WINDOW_DURATION_MINUTES
    grace = req.grace_minutes or settings.GRACE_PERIOD_MINUTES

    exam = db.scalar(select(Exam).where(Exam.id == exam_id))
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    # Branch Manager tenancy guard
    if current_user["role"] == "BRANCH_MANAGER":
        user_branch = current_user.get("branch_id")
        if exam.branch_id and exam.branch_id != user_branch:
            raise HTTPException(status_code=403, detail="Forbidden: exam belongs to another branch.")

    now_dt = datetime.now(timezone.utc)
    deadline_dt = now_dt + timedelta(minutes=duration)
    grace_dt = deadline_dt + timedelta(minutes=grace)

    now_iso = now_dt.isoformat()
    deadline_iso = deadline_dt.isoformat()
    grace_iso = grace_dt.isoformat()

    window_id = f"win_{uuid.uuid4().hex[:12]}"

    # Close any open windows for this exam
    db.execute(
        update(SubmissionWindow)
        .where(SubmissionWindow.exam_id == exam_id, SubmissionWindow.status == "OPEN")
        .values(status="CLOSED")
    )

    prior_count = db.scalar(
        select(func.count(SubmissionWindow.id)).where(SubmissionWindow.exam_id == exam_id)
    ) or 0
    win_count = prior_count + 1

    new_window = SubmissionWindow(
        id=window_id,
        exam_id=exam_id,
        branch_id=exam.branch_id,
        window_number=win_count,
        opened_at=now_iso,
        deadline_at=deadline_iso,
        grace_deadline_at=grace_iso,
        status="OPEN",
        created_by=current_user["sub"],
        created_at=now_iso,
    )
    db.add(new_window)

    exam.lifecycle_status = "SUBMISSION_OPEN"
    exam.status = "SUBMISSION_OPEN"
    exam.updated_at = now_iso

    # Audit log
    audit = AuditLog(
        id=f"aud_{uuid.uuid4().hex[:12]}",
        user_id=current_user["sub"],
        action="OPEN_SUBMISSION_WINDOW",
        resource_type="EXAM",
        resource_id=exam_id,
        details_json=f'{{"duration_minutes": {duration}, "grace_minutes": {grace}, "deadline": "{deadline_iso}"}}',
        created_at=now_iso,
    )
    db.add(audit)
    db.commit()

    # Dispatch student & manager notifications asynchronously
    background_tasks.add_task(
        background_dispatch_window_event,
        exam_id=exam_id,
        exam_title=exam.title,
        branch_id=exam.branch_id,
        duration=duration,
        opened_by_role=current_user.get("role", ""),
        opened_by_id=current_user["sub"],
        action="OPEN"
    )

    return {
        "status": "success",
        "window_id": window_id,
        "opened_at": now_iso,
        "deadline_at": deadline_iso,
        "grace_deadline_at": grace_iso,
        "duration_minutes": duration,
        "grace_minutes": grace,
    }


@router.post("/{exam_id}/reopen")
def reopen_submission_window(
    exam_id: str,
    req: ReopenWindowRequest,
    background_tasks: BackgroundTasks,
    current_user: Dict[str, Any] = Depends(require_branch_manager),
    db: Session = Depends(get_db)
):
    """
    Reopen an expired submission window. Requires mandatory audited reason and scope.
    """
    clean_reason = req.reopen_reason.strip()
    if not clean_reason:
        raise HTTPException(status_code=400, detail="A mandatory justification reason must be provided to reopen a window.")

    duration = req.duration_minutes or settings.WINDOW_DURATION_MINUTES
    grace = settings.GRACE_PERIOD_MINUTES

    exam = db.scalar(select(Exam).where(Exam.id == exam_id))
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    # Disallow reopening if evaluation has already started
    if exam.lifecycle_status in ["EVALUATION_READY", "EVALUATING", "RESULTS_READY", "PUBLISHED"]:
        raise HTTPException(
            status_code=400,
            detail="Cannot reopen submission window: evaluation has already commenced or completed."
        )

    prior_count = db.scalar(
        select(func.count(SubmissionWindow.id)).where(SubmissionWindow.exam_id == exam_id)
    ) or 0
    win_count = prior_count + 1

    now_dt = datetime.now(timezone.utc)
    deadline_dt = now_dt + timedelta(minutes=duration)
    grace_dt = deadline_dt + timedelta(minutes=grace)

    now_iso = now_dt.isoformat()
    deadline_iso = deadline_dt.isoformat()
    grace_iso = grace_dt.isoformat()

    window_id = f"win_{uuid.uuid4().hex[:12]}"

    reopen_win = SubmissionWindow(
        id=window_id,
        exam_id=exam_id,
        branch_id=exam.branch_id,
        window_number=win_count,
        opened_at=now_iso,
        deadline_at=deadline_iso,
        grace_deadline_at=grace_iso,
        status="OPEN",
        reopen_reason=clean_reason,
        reopen_scope=req.reopen_scope,
        created_by=current_user["sub"],
        created_at=now_iso,
    )
    db.add(reopen_win)

    exam.lifecycle_status = "SUBMISSION_OPEN"
    exam.status = "SUBMISSION_OPEN"
    exam.updated_at = now_iso

    # Audit log
    audit = AuditLog(
        id=f"aud_{uuid.uuid4().hex[:12]}",
        user_id=current_user["sub"],
        action="REOPEN_SUBMISSION_WINDOW",
        resource_type="EXAM",
        resource_id=exam_id,
        details_json=f'{{"reason": "{clean_reason}", "scope": "{req.reopen_scope}", "new_deadline": "{deadline_iso}"}}',
        created_at=now_iso,
    )
    db.add(audit)
    db.commit()

    # Dispatch reopen notifications asynchronously
    background_tasks.add_task(
        background_dispatch_window_event,
        exam_id=exam_id,
        exam_title=exam.title,
        branch_id=exam.branch_id,
        duration=duration,
        opened_by_role=current_user.get("role", ""),
        opened_by_id=current_user["sub"],
        action="REOPEN",
        reason=clean_reason,
    )

    return {
        "status": "success",
        "window_id": window_id,
        "window_number": win_count,
        "opened_at": now_iso,
        "deadline_at": deadline_iso,
        "grace_deadline_at": grace_iso,
        "reopen_reason": clean_reason,
        "reopen_scope": req.reopen_scope,
    }


@router.post("/{exam_id}/close")
def close_submission_window(
    exam_id: str,
    background_tasks: BackgroundTasks,
    req: CloseWindowRequest = CloseWindowRequest(),
    current_user: Dict[str, Any] = Depends(require_branch_manager),
    db: Session = Depends(get_db)
):
    """
    Close an active submission window immediately before timer expiry.
    Terminates student upload capability and transitions exam lifecycle so evaluation can commence.
    """
    exam = db.scalar(select(Exam).where(Exam.id == exam_id))
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    # Branch Manager tenancy guard
    if current_user["role"] == "BRANCH_MANAGER":
        user_branch = current_user.get("branch_id")
        if exam.branch_id and exam.branch_id != user_branch:
            raise HTTPException(status_code=403, detail="Forbidden: exam belongs to another branch.")

    # Find active open window
    window = db.scalar(
        select(SubmissionWindow)
        .where(SubmissionWindow.exam_id == exam_id)
        .order_by(SubmissionWindow.created_at.desc())
        .limit(1)
    )
    if not window or window.status != "OPEN":
        raise HTTPException(status_code=400, detail="No active open submission window to close.")

    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.isoformat()
    clean_reason = (req.reason or "Manually closed by administrator").strip()

    # Hard close: update status to CLOSED and truncate deadlines to now
    window.status = "CLOSED"
    window.deadline_at = now_iso
    window.grace_deadline_at = now_iso

    # Determine updated exam lifecycle status
    rubric = None
    if exam.current_rubric_version_id:
        rubric = db.scalar(
            select(RubricVersion.id)
            .where(RubricVersion.id == exam.current_rubric_version_id, RubricVersion.is_approved == 1)
        )

    if rubric and exam.answer_key_path:
        new_status = "EVALUATION_READY"
        new_lifecycle = "EVALUATION_READY"
    elif rubric:
        new_status = "RUBRIC_APPROVED"
        new_lifecycle = "APPROVED"
    else:
        new_status = "CLOSED"
        new_lifecycle = "SUBMISSION_CLOSED"

    exam.lifecycle_status = new_lifecycle
    exam.status = new_status
    exam.updated_at = now_iso

    # Audit log
    audit = AuditLog(
        id=f"aud_{uuid.uuid4().hex[:12]}",
        user_id=current_user["sub"],
        action="CLOSE_SUBMISSION_WINDOW",
        resource_type="EXAM",
        resource_id=exam_id,
        details_json=f'{{"window_id": "{window.id}", "closed_early": true, "reason": "{clean_reason}"}}',
        created_at=now_iso,
    )
    db.add(audit)
    db.commit()

    # Dispatch close notifications asynchronously
    background_tasks.add_task(
        background_dispatch_window_event,
        exam_id=exam_id,
        exam_title=exam.title,
        branch_id=exam.branch_id,
        duration=0,
        opened_by_role=current_user.get("role", ""),
        opened_by_id=current_user["sub"],
        action="CLOSE",
        reason=clean_reason,
    )

    return {
        "status": "success",
        "window_id": window.id,
        "closed_at": now_iso,
        "is_active": False,
        "message": "Submission window successfully closed.",
    }
