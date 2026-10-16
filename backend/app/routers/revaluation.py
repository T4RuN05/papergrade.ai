import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel

from backend.app.config import settings
from backend.app.database import get_db, get_iso_now
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
    decision: str # "MARKS_REVISED" or "MARKS_UPHELD"
    reviewer_notes: str
    revised_answers: Optional[List[RevisedAnswerItem]] = None

@router.post("/{submission_id}/request")
def request_revaluation(
    submission_id: str,
    req: SubmitRevaluationRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Student submits a revaluation request within the 7-calendar-day window from publication.
    Enforces time bounds, student ownership, and single-open-request invariants.
    """
    clean_reason = req.student_reason.strip()
    if not clean_reason:
        raise HTTPException(status_code=400, detail="A justification reason is required for revaluation.")
    if not req.question_ids:
        raise HTTPException(status_code=400, detail="At least one question must be selected for revaluation.")
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # 1. Fetch submission and exam
        cursor.execute("""
            SELECT s.*, e.published_at, e.is_published, e.title as exam_title, e.branch_id as exam_branch_id
            FROM submissions s
            JOIN exams e ON s.exam_id = e.id
            WHERE s.id = ?
        """, (submission_id,))
        sub = cursor.fetchone()
        
        if not sub:
            raise HTTPException(status_code=404, detail="Submission not found.")
        
        # 2. Check publication state
        is_published = (
            sub["publication_status"] == "PUBLISHED" or 
            bool(sub.get("is_published")) or 
            sub.get("status") == "COMPLETED"
        )
        if not is_published:
            raise HTTPException(status_code=400, detail="Cannot request revaluation before official results publication.")
        
        # 3. Check 7-calendar-day window
        now_dt = datetime.now(timezone.utc)
        pub_iso = sub.get("published_at") or sub.get("created_at") or now_dt.isoformat()
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
        
        # 4. Check for existing open request
        cursor.execute("""
            SELECT id FROM revaluation_requests 
            WHERE submission_id = ? AND status IN ('SUBMITTED', 'UNDER_REVIEW')
        """, (submission_id,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="A revaluation request is already pending for this submission.")
        
        # 5. Resolve student ID
        student_id = None
        if current_user and current_user.get("role") == "STUDENT":
            cursor.execute("""
                SELECT id FROM students 
                WHERE user_id = ? 
                ORDER BY account_claimed DESC, claimed_at DESC LIMIT 1
            """, (current_user["sub"],))
            stu_rec = cursor.fetchone()
            if stu_rec:
                student_id = stu_rec["id"]
            else:
                student_id = current_user.get("student_id") or current_user["sub"]

        if not student_id:
            student_id = sub.get("student_id")
            
        if not student_id and sub.get("roll_number"):
            cursor.execute("""
                SELECT id FROM students 
                WHERE UPPER(roll_number) = ? 
                ORDER BY account_claimed DESC, claimed_at DESC LIMIT 1
            """, (sub["roll_number"].strip().upper(),))
            stu_rec = cursor.fetchone()
            if stu_rec:
                student_id = stu_rec["id"]

        if not student_id and current_user:
            student_id = current_user["sub"]

        # 6. Insert request
        req_id = f"rev_{uuid.uuid4().hex[:12]}"
        now_iso = now_dt.isoformat()
        expiry_iso = window_expiry_dt.isoformat()
        import json
        
        cursor.execute("""
            INSERT INTO revaluation_requests (
                id, submission_id, student_id, exam_id, status,
                question_ids_json, student_reason, requested_at, expires_at
            ) VALUES (?, ?, ?, ?, 'SUBMITTED', ?, ?, ?, ?)
        """, (
            req_id, submission_id, student_id, sub["exam_id"],
            json.dumps(req.question_ids), clean_reason, now_iso, expiry_iso
        ))
        
        # Dispatch notifications across roles
        # 1. Confirmation to the Student
        q_str = ", ".join(req.question_ids)
        send_notification(
            cursor=cursor,
            user_id=current_user["sub"],
            notif_type="REVALUATION_REQUESTED",
            title="Revaluation Appeal Lodged",
            message=f"Your appeal for '{sub['exam_title']}' on question(s) {q_str} has been received and is pending faculty review.",
            link_url=f"/student/submissions/{submission_id}"
        )
        
        # Resolve branch for tenant isolation
        effective_branch = sub.get("exam_branch_id")
        if not effective_branch and sub.get("batch_id"):
            cursor.execute("SELECT branch_id FROM batches WHERE id = ?", (sub["batch_id"],))
            b_row = cursor.fetchone()
            if b_row:
                effective_branch = b_row["branch_id"]
        
        branch_name = get_branch_name(cursor, effective_branch)
        roll = sub.get("roll_number", "Student")
        
        # 2. Scoped notification to Branch Manager of that branch
        notify_branch_managers(
            cursor=cursor,
            branch_id=effective_branch,
            notif_type="REVALUATION_REQUESTED",
            title="New Revaluation Request",
            message=f"Student {roll} requested revaluation for '{sub['exam_title']}' on question(s) {q_str}.",
            link_url="/revaluation"
        )
        
        # 3. System-wide notification to Root Admins
        notify_root_admins(
            cursor=cursor,
            notif_type="REVALUATION_REQUESTED",
            title="Revaluation Appeal Submitted",
            message=f"{branch_name} • Student {roll} submitted an appeal for '{sub['exam_title']}' (Questions: {q_str}).",
            link_url="/revaluation"
        )
        
        # Audit log
        cursor.execute("""
            INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details_json, created_at)
            VALUES (?, ?, 'SUBMIT_REVALUATION_REQUEST', 'SUBMISSION', ?, ?, ?)
        """, (
            f"aud_{uuid.uuid4().hex[:12]}",
            current_user["sub"],
            submission_id,
            f'{{"request_id": "{req_id}", "question_ids": {json.dumps(req.question_ids)}}}',
            now_iso
        ))
        
        return {
            "status": "success",
            "request_id": req_id,
            "submission_id": submission_id,
            "questions_selected": req.question_ids,
            "expires_at": expiry_iso,
            "message": "Revaluation request submitted successfully. It will be reviewed manually by an evaluator."
        }

@router.get("/my-requests")
def get_my_revaluation_requests(current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Returns all revaluation requests submitted by the logged-in student.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, roll_number FROM students WHERE user_id = ?", (current_user["sub"],))
        st = cursor.fetchone()
        stu_id = st["id"] if st else (current_user.get("student_id") or "")
        stu_roll = (st["roll_number"] if st else (current_user.get("roll_number") or "")).strip().upper()

        query = """
            SELECT r.*, s.student_name, s.roll_number, s.total_awarded_marks, s.max_marks, e.title as exam_title, e.subject as exam_subject
            FROM revaluation_requests r
            JOIN submissions s ON r.submission_id = s.id
            JOIN exams e ON r.exam_id = e.id
            WHERE r.student_id = ? OR UPPER(s.roll_number) = ? OR s.student_id = ?
            ORDER BY r.requested_at DESC
        """
        cursor.execute(query, (stu_id, stu_roll, stu_id))
        return [dict(row) for row in cursor.fetchall()]

@router.get("/requests")
def list_revaluation_requests(
    exam_id: Optional[str] = None,
    branch_id: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(require_root_admin)
):
    """
    Root Admin review desk: lists pending student revaluation requests.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT r.*, s.student_name, s.roll_number, s.total_awarded_marks, s.max_marks, e.title as exam_title
            FROM revaluation_requests r
            JOIN submissions s ON r.submission_id = s.id
            JOIN exams e ON r.exam_id = e.id
        """
        clauses = []
        params = []
        if exam_id:
            clauses.append("r.exam_id = ?")
            params.append(exam_id)
        if branch_id:
            clauses.append("e.branch_id = ?")
            params.append(branch_id)
            
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
            
        query += " ORDER BY r.requested_at ASC"
        
        cursor.execute(query, tuple(params))
        return [dict(row) for row in cursor.fetchall()]

@router.post("/{request_id}/resolve")
def resolve_revaluation_request(
    request_id: str,
    req: ResolveRevaluationRequest,
    current_user: Dict[str, Any] = Depends(require_root_admin)
):
    """
    Root Admin manually resolves a revaluation request.
    CRITICAL INVARIANT: NEVER INVOKES AI. 100% human-verified marks update.
    Recalculates totals, updates audit logs, and notifies student.
    """
    if req.decision not in ["MARKS_REVISED", "MARKS_UPHELD"]:
        raise HTTPException(status_code=400, detail="Decision must be MARKS_REVISED or MARKS_UPHELD.")
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM revaluation_requests WHERE id = ?", (request_id,))
        reval = cursor.fetchone()
        if not reval:
            raise HTTPException(status_code=404, detail="Revaluation request not found.")
        
        sub_id = reval["submission_id"]
        now = get_iso_now()
        
        # If marks revised, apply human overrides to the answers table
        if req.decision == "MARKS_REVISED" and req.revised_answers:
            for item in req.revised_answers:
                cursor.execute("""
                    UPDATE answers 
                    SET awarded_marks = ?, is_manual_override = 1, override_reason = ?, updated_at = ?
                    WHERE submission_id = ? AND question_id = ?
                """, (item.revised_marks, f"[Revaluation] {item.comment}", now, sub_id, item.question_id))
            
            # Recalculate submission total and percentage
            cursor.execute("SELECT SUM(awarded_marks) as total FROM answers WHERE submission_id = ? AND is_extra_attempt = 0", (sub_id,))
            new_total = cursor.fetchone()["total"] or 0.0
            
            cursor.execute("SELECT max_marks FROM submissions WHERE id = ?", (sub_id,))
            max_m = cursor.fetchone()["max_marks"] or 1.0
            new_pct = round((new_total / max_m) * 100, 2) if max_m > 0 else 0.0
            
            cursor.execute("""
                UPDATE submissions 
                SET total_awarded_marks = ?, percentage = ?, is_manual_override = 1, reviewed_at = ?, updated_at = ?
                WHERE id = ?
            """, (new_total, new_pct, now, now, sub_id))
        
        # Resolve request
        cursor.execute("""
            UPDATE revaluation_requests 
            SET status = 'RESOLVED', decision = ?, reviewer_notes = ?, resolved_by = ?, resolved_at = ?
            WHERE id = ?
        """, (req.decision, req.reviewer_notes.strip(), current_user["sub"], now, request_id))
        
        # Notify student and management
        cursor.execute("""
            SELECT s.student_id, s.roll_number, s.exam_id, e.title as exam_title, e.branch_id as exam_branch_id
            FROM submissions s
            JOIN exams e ON s.exam_id = e.id
            WHERE s.id = ?
        """, (sub_id,))
        sub_owner = cursor.fetchone()

        # Robustly resolve the student's active user_id
        student_user_id = None

        # Priority 1: Check audit_logs to identify the specific student user who submitted the appeal
        cursor.execute("""
            SELECT user_id FROM audit_logs 
            WHERE action = 'SUBMIT_REVALUATION_REQUEST' 
              AND (resource_id = ? OR details_json LIKE ?)
            ORDER BY created_at DESC LIMIT 1
        """, (sub_id, f'%"{request_id}"%'))
        audit_submitter = cursor.fetchone()
        if audit_submitter and audit_submitter["user_id"]:
            cursor.execute("SELECT id FROM users WHERE id = ?", (audit_submitter["user_id"],))
            if cursor.fetchone():
                student_user_id = audit_submitter["user_id"]

        # Priority 2: Look up claimed student account by student_id or roll number
        if not student_user_id and sub_owner:
            stu_id = sub_owner.get("student_id")
            roll_num = (sub_owner.get("roll_number") or "").strip().upper()
            cursor.execute("""
                SELECT user_id FROM students 
                WHERE (id = ? OR (roll_number IS NOT NULL AND UPPER(roll_number) = ?))
                  AND user_id IS NOT NULL
                ORDER BY account_claimed DESC, claimed_at DESC LIMIT 1
            """, (stu_id, roll_num))
            st_claim = cursor.fetchone()
            if st_claim and st_claim["user_id"]:
                student_user_id = st_claim["user_id"]

        # Priority 3: Check if sub_owner["student_id"] is itself a valid user_id
        if not student_user_id and sub_owner and sub_owner.get("student_id"):
            cursor.execute("SELECT id FROM users WHERE id = ?", (sub_owner["student_id"],))
            if cursor.fetchone():
                student_user_id = sub_owner["student_id"]

        if student_user_id:
            exam_title = sub_owner["exam_title"] if sub_owner else "Exam"
            send_notification(
                cursor=cursor,
                user_id=student_user_id,
                notif_type="REVALUATION_DECIDED",
                title="Revaluation Resolved",
                message=f"Your revaluation request for '{exam_title}' has been resolved: {req.decision.replace('_', ' ')}.",
                link_url=f"/student/submissions/{sub_id}"
            )
        
        # Scoped notification to Branch Manager & Root Admin
        exam_branch = sub_owner["exam_branch_id"] if sub_owner else None
        roll_num = sub_owner["roll_number"] if sub_owner else "Student"
        exam_title = sub_owner["exam_title"] if sub_owner else "Exam"
        
        notify_branch_managers(
            cursor=cursor,
            branch_id=exam_branch,
            notif_type="REVALUATION_DECIDED",
            title="Revaluation Appeal Resolved",
            message=f"Revaluation for student {roll_num} on '{exam_title}' has been resolved: {req.decision.replace('_', ' ')}.",
            link_url="/revaluation",
            exclude_user_id=current_user["sub"]
        )
        if current_user.get("role") == "BRANCH_MANAGER":
            b_name = get_branch_name(cursor, exam_branch)
            notify_root_admins(
                cursor=cursor,
                notif_type="REVALUATION_DECIDED",
                title="Branch Revaluation Resolved",
                message=f"{b_name} • Revaluation for student {roll_num} on '{exam_title}' was resolved as {req.decision.replace('_', ' ')}.",
                link_url="/revaluation",
                exclude_user_id=current_user["sub"]
            )
        
        # Audit log
        cursor.execute("""
            INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details_json, created_at)
            VALUES (?, ?, 'RESOLVE_REVALUATION', 'REVALUATION_REQUEST', ?, ?, ?)
        """, (
            f"aud_{uuid.uuid4().hex[:12]}",
            current_user["sub"],
            request_id,
            f'{{"decision": "{req.decision}", "notes": "{req.reviewer_notes.strip()}"}}',
            now
        ))
        
        return {
            "status": "success",
            "request_id": request_id,
            "decision": req.decision,
            "resolved_at": now
        }
