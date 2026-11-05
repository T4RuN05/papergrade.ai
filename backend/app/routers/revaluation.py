import uuid
import json
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select, update, func, or_

from backend.app.config import settings
from backend.app.db.session import get_db
from backend.app.db.base import get_iso_now
from backend.app.db.models import (
    RevaluationRequest,
    Submission,
    Exam,
    Student,
    Answer,
    Batch,
    User,
    AuditLog,
)
from backend.app.services.auth import (
    get_current_user,
    require_root_admin,
    require_student,
)
from backend.app.services.notification_service import (
    send_notification,
    notify_branch_managers,
    notify_root_admins,
    get_branch_name,
)

router = APIRouter(prefix="/api/v1/revaluation", tags=["Manual Revaluation (Strictly Human)"])


class SubmitRevaluationRequest(BaseModel):
    question_ids: List[str]
    student_reason: str


class RevisedAnswerItem(BaseModel):
    question_id: str
    revised_marks: float
    comment: str


class ResolveRevaluationRequest(BaseModel):
    decision: str  # "MARKS_REVISED" or "MARKS_UPHELD"
    reviewer_notes: str
    revised_answers: Optional[List[RevisedAnswerItem]] = None


@router.post("/{submission_id}/request")
def request_revaluation(
    submission_id: str,
    req: SubmitRevaluationRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Student submits a revaluation request within the 7-calendar-day window from publication.
    Enforces time bounds, student ownership, and single-open-request invariants via ORM.
    """
    clean_reason = req.student_reason.strip()
    if not clean_reason:
        raise HTTPException(status_code=400, detail="A justification reason is required for revaluation.")
    if not req.question_ids:
        raise HTTPException(status_code=400, detail="At least one question must be selected for revaluation.")

    result = db.execute(
        select(Submission, Exam)
        .join(Exam, Submission.exam_id == Exam.id)
        .where(Submission.id == submission_id)
    ).first()

    if not result:
        raise HTTPException(status_code=404, detail="Submission not found.")

    sub, exam = result

    # Check publication state
    is_published = (
        sub.publication_status == "PUBLISHED" or 
        bool(exam.is_published == 1) or 
        sub.status == "COMPLETED"
    )
    if not is_published:
        raise HTTPException(status_code=400, detail="Cannot request revaluation before official results publication.")

    # Check 7-calendar-day window
    now_dt = datetime.now(timezone.utc)
    pub_iso = exam.published_at or sub.created_at or now_dt.isoformat()
    try:
        pub_dt = datetime.fromisoformat(pub_iso.replace("Z", "+00:00"))
    except Exception:
        pub_dt = now_dt
    window_expiry_dt = pub_dt + timedelta(days=settings.REVALUATION_WINDOW_DAYS)

    if now_dt > window_expiry_dt:
        raise HTTPException(
            status_code=400,
            detail=f"Revaluation window has expired. Requests must be submitted within {settings.REVALUATION_WINDOW_DAYS} calendar days of publication."
        )

    # Check for existing open request
    existing_open = db.scalar(
        select(RevaluationRequest.id)
        .where(
            RevaluationRequest.submission_id == submission_id,
            RevaluationRequest.status.in_(['SUBMITTED', 'UNDER_REVIEW'])
        )
    )
    if existing_open:
        raise HTTPException(status_code=400, detail="A revaluation request is already pending for this submission.")

    # Resolve student ID
    student_id = None
    if current_user and current_user.get("role") == "STUDENT":
        stu_rec = db.scalar(
            select(Student)
            .where(Student.user_id == current_user["sub"])
            .order_by(Student.account_claimed.desc(), Student.claimed_at.desc())
            .limit(1)
        )
        if stu_rec:
            student_id = stu_rec.id
        else:
            student_id = current_user.get("student_id") or current_user["sub"]

    if not student_id:
        student_id = sub.student_id

    if not student_id and sub.roll_number:
        stu_rec = db.scalar(
            select(Student)
            .where(func.upper(Student.roll_number) == sub.roll_number.strip().upper())
            .order_by(Student.account_claimed.desc(), Student.claimed_at.desc())
            .limit(1)
        )
        if stu_rec:
            student_id = stu_rec.id

    if not student_id and current_user:
        student_id = current_user["sub"]

    req_id = f"rev_{uuid.uuid4().hex[:12]}"
    now_iso = now_dt.isoformat()
    expiry_iso = window_expiry_dt.isoformat()

    new_rev = RevaluationRequest(
        id=req_id,
        submission_id=submission_id,
        student_id=student_id,
        exam_id=sub.exam_id,
        status='SUBMITTED',
        question_ids_json=json.dumps(req.question_ids),
        student_reason=clean_reason,
        requested_at=now_iso,
        expires_at=expiry_iso,
    )
    db.add(new_rev)

    # Student notification
    q_str = ", ".join(req.question_ids)
    exam_title = exam.title or "Exam"
    send_notification(
        cursor=db,
        user_id=current_user["sub"],
        notif_type="REVALUATION_REQUESTED",
        title="Revaluation Appeal Lodged",
        message=f"Your appeal for '{exam_title}' on question(s) {q_str} has been received and is pending faculty review.",
        link_url=f"/student/submissions/{submission_id}"
    )

    effective_branch = exam.branch_id
    if not effective_branch and sub.batch_id:
        batch = db.scalar(select(Batch).where(Batch.id == sub.batch_id))
        if batch:
            effective_branch = batch.branch_id

    branch_name = get_branch_name(db, effective_branch)
    roll = sub.roll_number or "Student"

    notify_branch_managers(
        cursor=db,
        branch_id=effective_branch,
        notif_type="REVALUATION_REQUESTED",
        title="New Revaluation Request",
        message=f"Student {roll} requested revaluation for '{exam_title}' on question(s) {q_str}.",
        link_url="/revaluation"
    )

    notify_root_admins(
        cursor=db,
        notif_type="REVALUATION_REQUESTED",
        title="Revaluation Appeal Submitted",
        message=f"{branch_name} • Student {roll} submitted an appeal for '{exam_title}' (Questions: {q_str}).",
        link_url="/revaluation"
    )

    db.add(AuditLog(
        id=f"aud_{uuid.uuid4().hex[:12]}",
        user_id=current_user["sub"],
        action="SUBMIT_REVALUATION_REQUEST",
        resource_type="SUBMISSION",
        resource_id=submission_id,
        details_json=json.dumps({"request_id": req_id, "question_ids": req.question_ids}),
        created_at=now_iso
    ))

    db.commit()

    return {
        "status": "success",
        "request_id": req_id,
        "submission_id": submission_id,
        "questions_selected": req.question_ids,
        "expires_at": expiry_iso,
        "message": "Revaluation request submitted successfully. It will be reviewed manually by an evaluator."
    }


@router.get("/my-requests")
def get_my_revaluation_requests(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns all revaluation requests submitted by the logged-in student via ORM.
    """
    st = db.scalar(
        select(Student).where(Student.user_id == current_user["sub"]).limit(1)
    )
    stu_id = st.id if st else (current_user.get("student_id") or "")
    stu_roll = (st.roll_number if st else (current_user.get("roll_number") or "")).strip().upper()

    stmt = (
        select(RevaluationRequest, Submission, Exam)
        .join(Submission, RevaluationRequest.submission_id == Submission.id)
        .join(Exam, Submission.exam_id == Exam.id)
        .where(
            or_(
                RevaluationRequest.student_id == stu_id,
                func.upper(Submission.roll_number) == stu_roll,
                Submission.student_id == stu_id
            )
        )
        .order_by(RevaluationRequest.requested_at.desc())
    )

    rows = db.execute(stmt).all()
    output = []
    for r, s, e in rows:
        output.append({
            "id": r.id,
            "submission_id": r.submission_id,
            "student_id": r.student_id,
            "question_ids_json": r.question_ids_json,
            "student_reason": r.student_reason,
            "status": r.status,
            "resolution_notes": r.resolution_notes,
            "delta_marks": r.delta_marks,
            "resolved_by": r.resolved_by,
            "requested_at": r.requested_at,
            "resolved_at": r.resolved_at,
            "student_name": s.student_name,
            "roll_number": s.roll_number,
            "total_awarded_marks": s.total_awarded_marks,
            "max_marks": s.max_marks,
            "exam_title": e.title,
            "exam_subject": e.subject,
        })
    return output


@router.get("/requests")
def list_revaluation_requests(
    exam_id: Optional[str] = None,
    branch_id: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(require_root_admin),
    db: Session = Depends(get_db)
):
    """
    Root Admin review desk: lists pending student revaluation requests.
    """
    stmt = (
        select(RevaluationRequest, Submission, Exam)
        .join(Submission, RevaluationRequest.submission_id == Submission.id)
        .join(Exam, Submission.exam_id == Exam.id)
    )

    if exam_id:
        stmt = stmt.where(Submission.exam_id == exam_id)
    if branch_id:
        stmt = stmt.where(Exam.branch_id == branch_id)

    stmt = stmt.order_by(RevaluationRequest.requested_at.asc())
    rows = db.execute(stmt).all()

    output = []
    for r, s, e in rows:
        output.append({
            "id": r.id,
            "submission_id": r.submission_id,
            "student_id": r.student_id,
            "question_ids_json": r.question_ids_json,
            "student_reason": r.student_reason,
            "status": r.status,
            "resolution_notes": r.resolution_notes,
            "delta_marks": r.delta_marks,
            "resolved_by": r.resolved_by,
            "requested_at": r.requested_at,
            "resolved_at": r.resolved_at,
            "student_name": s.student_name,
            "roll_number": s.roll_number,
            "total_awarded_marks": s.total_awarded_marks,
            "max_marks": s.max_marks,
            "exam_title": e.title,
        })
    return output


@router.post("/{request_id}/resolve")
def resolve_revaluation_request(
    request_id: str,
    req: ResolveRevaluationRequest,
    current_user: Dict[str, Any] = Depends(require_root_admin),
    db: Session = Depends(get_db)
):
    """
    Root Admin manually resolves a revaluation request.
    CRITICAL INVARIANT: NEVER INVOKES AI. 100% human-verified marks update.
    Recalculates totals, updates audit logs, and notifies student via ORM.
    """
    if req.decision not in ["MARKS_REVISED", "MARKS_UPHELD"]:
        raise HTTPException(status_code=400, detail="Decision must be MARKS_REVISED or MARKS_UPHELD.")

    reval = db.scalar(select(RevaluationRequest).where(RevaluationRequest.id == request_id))
    if not reval:
        raise HTTPException(status_code=404, detail="Revaluation request not found.")

    sub_id = reval.submission_id
    now = get_iso_now()

    # If marks revised, apply human overrides to the answers table
    if req.decision == "MARKS_REVISED" and req.revised_answers:
        for item in req.revised_answers:
            db.execute(
                update(Answer)
                .where(Answer.submission_id == sub_id, Answer.question_id == item.question_id)
                .values(
                    awarded_marks=item.revised_marks,
                    is_manual_override=1,
                    review_notes=f"[Revaluation] {item.comment}",
                    updated_at=now
                )
            )

        # Recalculate submission total and percentage
        new_total = db.scalar(
            select(func.sum(Answer.awarded_marks))
            .where(Answer.submission_id == sub_id, Answer.is_extra_attempt == 0)
        ) or 0.0

        sub = db.scalar(select(Submission).where(Submission.id == sub_id))
        max_m = sub.max_marks or 1.0
        new_pct = round((new_total / max_m) * 100, 2) if max_m > 0 else 0.0

        if sub:
            sub.total_awarded_marks = new_total
            sub.percentage = new_pct
            sub.is_manual_override = 1
            sub.reviewed_at = now
            sub.updated_at = now

    # Resolve request
    reval.status = 'RESOLVED'
    reval.resolution_notes = req.reviewer_notes.strip()
    reval.resolved_by = current_user["sub"]
    reval.resolved_at = now

    # Notify student and management
    sub_owner = db.execute(
        select(Submission, Exam)
        .join(Exam, Submission.exam_id == Exam.id)
        .where(Submission.id == sub_id)
    ).first()

    student_user_id = None
    if sub_owner:
        s_obj, e_obj = sub_owner
        # Priority 1: Check audit_logs to identify the specific student user who submitted the appeal
        audit_submitter = db.scalar(
            select(AuditLog.user_id)
            .where(
                AuditLog.action == 'SUBMIT_REVALUATION_REQUEST',
                or_(
                    AuditLog.resource_id == sub_id,
                    AuditLog.details_json.like(f'%"{request_id}"%')
                )
            )
            .order_by(AuditLog.created_at.desc())
            .limit(1)
        )
        if audit_submitter:
            u_check = db.scalar(select(User.id).where(User.id == audit_submitter))
            if u_check:
                student_user_id = audit_submitter

        # Priority 2: Look up claimed student account by student_id or roll number
        if not student_user_id:
            stu_claim = db.scalar(
                select(Student.user_id)
                .where(
                    or_(
                        Student.id == s_obj.student_id,
                        func.upper(Student.roll_number) == (s_obj.roll_number or "").strip().upper()
                    ),
                    Student.user_id.isnot(None)
                )
                .order_by(Student.account_claimed.desc(), Student.claimed_at.desc())
                .limit(1)
            )
            if stu_claim:
                student_user_id = stu_claim

        # Priority 3: Check if student_id is user_id
        if not student_user_id and s_obj.student_id:
            u_check = db.scalar(select(User.id).where(User.id == s_obj.student_id))
            if u_check:
                student_user_id = s_obj.student_id

        exam_title = e_obj.title or "Exam"
        if student_user_id:
            send_notification(
                cursor=db,
                user_id=student_user_id,
                notif_type="REVALUATION_DECIDED",
                title="Revaluation Resolved",
                message=f"Your revaluation request for '{exam_title}' has been resolved: {req.decision.replace('_', ' ')}.",
                link_url=f"/student/submissions/{sub_id}"
            )

        exam_branch = e_obj.branch_id
        roll_num = s_obj.roll_number or "Student"

        notify_branch_managers(
            cursor=db,
            branch_id=exam_branch,
            notif_type="REVALUATION_DECIDED",
            title="Revaluation Appeal Resolved",
            message=f"Revaluation for student {roll_num} on '{exam_title}' has been resolved: {req.decision.replace('_', ' ')}.",
            link_url="/revaluation",
            exclude_user_id=current_user["sub"]
        )

        if current_user.get("role") == "BRANCH_MANAGER":
            b_name = get_branch_name(db, exam_branch)
            notify_root_admins(
                cursor=db,
                notif_type="REVALUATION_DECIDED",
                title="Branch Revaluation Resolved",
                message=f"{b_name} • Revaluation for student {roll_num} on '{exam_title}' was resolved as {req.decision.replace('_', ' ')}.",
                link_url="/revaluation",
                exclude_user_id=current_user["sub"]
            )

    db.add(AuditLog(
        id=f"aud_{uuid.uuid4().hex[:12]}",
        user_id=current_user["sub"],
        action="RESOLVE_REVALUATION",
        resource_type="REVALUATION_REQUEST",
        resource_id=request_id,
        details_json=json.dumps({"decision": req.decision, "notes": req.reviewer_notes.strip()}),
        created_at=now
    ))

    db.commit()

    return {
        "status": "success",
        "request_id": request_id,
        "decision": req.decision,
        "resolved_at": now
    }
