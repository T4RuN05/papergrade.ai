"""
Student Portal Router - Consolidated High-Performance Endpoints.

Provides a unified portal-state endpoint (GET /api/v1/student/portal-state)
that replaces 10+ fragmented HTTP calls with 1 fast, non-blocking query.
Includes 4-second in-memory window caching to prevent DB connection pool starvation
during high-traffic student upload bursts.
Migrated to SQLAlchemy 2.0 ORM.
"""

import time
import json
import asyncio
import threading
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, or_, func

from backend.app.db.session import get_session
from backend.app.db.models import (
    User,
    Student,
    Batch,
    Exam,
    ExamBatch,
    SubmissionWindow,
    Submission,
    RevaluationRequest,
    Answer
)
from backend.app.services.auth import get_current_user
from backend.app.services.retention_service import RetentionService

router = APIRouter(prefix="/api/v1/student", tags=["Student Portal"])

# Lightweight in-memory window cache (4-second TTL) to protect DB pool during bursts
_window_cache: Dict[str, Any] = {}
_cache_lock = threading.Lock()
CACHE_TTL_SECONDS = 4.0

def parse_iso(iso_str: str) -> datetime:
    try:
        return datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
    except Exception:
        return datetime.now(timezone.utc)

def _compute_window_status(window_row: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not window_row:
        return {
            "has_window": False,
            "status": "NOT_OPENED",
            "is_active": False,
            "seconds_remaining": 0,
            "is_in_grace": False,
            "is_expired": True,
            "closed_at": None,
            "seconds_since_closed": None,
            "seconds_until_card_expires": 0,
            "should_display": False
        }
    
    now = datetime.now(timezone.utc)
    deadline = parse_iso(window_row["deadline_at"])
    grace_deadline = parse_iso(window_row["grace_deadline_at"])
    
    is_in_window = now <= deadline
    is_in_grace = deadline < now <= grace_deadline
    is_active = (is_in_window or is_in_grace) and window_row.get("status") == "OPEN"
    seconds_remaining = max(0, int((deadline - now).total_seconds()))
    grace_seconds_remaining = max(0, int((grace_deadline - now).total_seconds()))

    closed_at_iso = window_row.get("grace_deadline_at") or window_row.get("deadline_at")
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
        "window_id": window_row.get("id"),
        "window_number": window_row.get("window_number", 1),
        "status": window_row.get("status"),
        "opened_at": window_row.get("opened_at"),
        "deadline_at": window_row.get("deadline_at"),
        "grace_deadline_at": window_row.get("grace_deadline_at"),
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

def _fetch_portal_state_sync(user_id: str, user_role: str) -> Dict[str, Any]:
    now_ts = time.time()
    
    with get_session() as session:
        # 1. Fetch user & student profile
        u = session.scalar(select(User).where(User.id == user_id))
        if not u:
            raise HTTPException(status_code=404, detail="User not found")
        
        user_dict = {
            "id": u.id,
            "role": u.role,
            "email": u.email,
            "full_name": u.full_name,
            "name": u.full_name,
            "institute_id": u.institute_id,
            "branch_id": u.branch_id
        }
        
        # Lookup student record if enrolled
        st = session.scalar(
            select(Student)
            .where(Student.user_id == user_id)
            .order_by(Student.claimed_at.desc())
            .limit(1)
        )
        
        roll_number = None
        student_id = None
        batch_id = None
        branch_id = u.branch_id
        
        if st:
            roll_number = st.roll_number
            student_id = st.id
            batch_id = st.batch_id
            user_dict["student_id"] = st.id
            user_dict["student_id_num"] = st.student_id_num
            user_dict["roll_number"] = st.roll_number
            user_dict["batch_id"] = st.batch_id
            user_dict["student"] = {
                "student_id": st.id,
                "student_id_num": st.student_id_num,
                "roll_number": st.roll_number,
                "batch_id": st.batch_id
            }
            if not branch_id and batch_id:
                b_row = session.scalar(select(Batch).where(Batch.id == batch_id))
                if b_row:
                    branch_id = b_row.branch_id
                    user_dict["branch_id"] = branch_id

        # 2. Fetch Exams visible to this branch
        exam_stmt = select(Exam)
        if branch_id:
            exam_stmt = exam_stmt.where(or_(Exam.branch_id == branch_id, Exam.branch_id == None))
        exam_stmt = exam_stmt.order_by(Exam.created_at.desc())

        raw_exams = session.scalars(exam_stmt).all()
        raw_exam_rows = [
            {
                "id": ex.id,
                "title": ex.title,
                "subject": ex.subject,
                "total_marks": ex.total_marks,
                "status": ex.status,
                "lifecycle_status": ex.lifecycle_status,
                "is_published": ex.is_published,
                "branch_id": ex.branch_id,
                "batch_scope": ex.batch_scope,
                "batch_ids": ex.batch_ids,
                "created_at": ex.created_at
            }
            for ex in raw_exams
        ]

        # Filter exams by batch scoping:
        # If batch_scope == 'ALL': visible to all in branch
        # If batch_scope in ('SPECIFIC', 'BATCHES'): visible only if student's batch_id is in allowed batches
        exam_rows = []
        for ex in raw_exam_rows:
            scope = ex.get("batch_scope") or "ALL"
            if scope == "ALL":
                exam_rows.append(ex)
            else:
                allowed_bids = set()
                raw_bids = ex.get("batch_ids")
                if raw_bids:
                    try:
                        parsed = json.loads(raw_bids)
                        if isinstance(parsed, list):
                            allowed_bids = set(str(b).strip() for b in parsed if str(b).strip())
                    except Exception:
                        allowed_bids = set(b.strip() for b in raw_bids.split(",") if b.strip())
                if not allowed_bids:
                    ex_batches = session.scalars(
                        select(ExamBatch.batch_id).where(ExamBatch.exam_id == ex["id"])
                    ).all()
                    allowed_bids = set(b_id for b_id in ex_batches if b_id)

                if batch_id and str(batch_id) in allowed_bids:
                    exam_rows.append(ex)

        # 3. Check Windows for these exams (with short-lived memory cache to prevent pool exhaustion)
        cache_key = f"windows_{branch_id or 'all'}"
        with _cache_lock:
            cached_entry = _window_cache.get(cache_key)
            if cached_entry and (now_ts - cached_entry["time"]) < CACHE_TTL_SECONDS:
                windows_by_exam = cached_entry["data"]
            else:
                windows_by_exam = {}
                if exam_rows:
                    exam_ids = [e["id"] for e in exam_rows]
                    windows = session.scalars(
                        select(SubmissionWindow)
                        .where(SubmissionWindow.exam_id.in_(exam_ids))
                        .order_by(SubmissionWindow.created_at.desc())
                    ).all()
                    for w in windows:
                        ex_id = w.exam_id
                        if ex_id not in windows_by_exam:
                            windows_by_exam[ex_id] = {
                                "id": w.id,
                                "exam_id": w.exam_id,
                                "window_number": w.window_number,
                                "status": w.status,
                                "opened_at": w.opened_at,
                                "deadline_at": w.deadline_at,
                                "grace_deadline_at": w.grace_deadline_at,
                            }
                _window_cache[cache_key] = {"time": now_ts, "data": windows_by_exam}

        # Match active exam windows
        active_windows = []
        recently_closed_candidates = []
        
        for ex in exam_rows:
            w_row = windows_by_exam.get(ex["id"])
            w_stat = _compute_window_status(w_row)
            if w_stat.get("is_active"):
                active_windows.append({
                    "exam": ex,
                    "window_status": w_stat
                })
            elif w_stat.get("should_display"):
                recently_closed_candidates.append({
                    "exam": ex,
                    "window_status": w_stat,
                    "seconds_since_closed": w_stat.get("seconds_since_closed", 999999)
                })
        
        # Sort recently closed candidates by most recently closed first
        recently_closed_candidates.sort(key=lambda item: item["seconds_since_closed"])

        displayable_windows = active_windows if active_windows else recently_closed_candidates[:1]
        active_exam = displayable_windows[0]["exam"] if displayable_windows else None
        active_window_status = displayable_windows[0]["window_status"] if displayable_windows else None

        # 4. Fetch Submissions for this student
        submissions = []
        sub_filters = []
        if student_id:
            sub_filters.append(Submission.student_id == student_id)
        if roll_number:
            sub_filters.append(func.upper(Submission.roll_number) == roll_number.upper())
        if not sub_filters:
            sub_filters.append(Submission.student_id == user_id)

        sub_exam_rows = session.execute(
            select(Submission, Exam)
            .join(Exam, Submission.exam_id == Exam.id)
            .where(or_(*sub_filters), Submission.submission_status.in_(['SUBMITTED', 'EVALUATED']))
            .order_by(Submission.created_at.desc())
        ).all()

        # Deduplicate submissions by exam_id (keep only newest active submission per exam)
        seen_exam_ids = set()
        deduped_sub_pairs = []
        for s, ex in sub_exam_rows:
            if s.exam_id not in seen_exam_ids:
                seen_exam_ids.add(s.exam_id)
                deduped_sub_pairs.append((s, ex))

        # Attach revaluation, artifact, and retention info
        for s, ex in deduped_sub_pairs:
            sub = {
                "id": s.id,
                "exam_id": s.exam_id,
                "batch_id": s.batch_id,
                "student_id": s.student_id,
                "roll_number": s.roll_number,
                "student_name": s.student_name,
                "submission_status": s.submission_status,
                "status": s.status,
                "total_awarded_marks": s.total_awarded_marks,
                "max_marks": s.max_marks,
                "percentage": s.percentage,
                "total_pages": s.page_count,
                "storage_path": s.original_file_path,
                "created_at": s.created_at,
                "updated_at": s.updated_at,
                "publication_status": s.publication_status,
                "is_document_purged": bool(s.is_document_purged),
                "exam_title": ex.title,
                "exam_subject": ex.subject,
                "exam_total_marks": ex.total_marks,
                "exam_is_published": ex.is_published,
                "exam_question_paper_path": ex.question_paper_path,
                "exam_answer_key_path": ex.answer_key_path,
                "exam_is_document_purged": bool(ex.is_document_purged)
            }

            is_pub = bool(sub.get("publication_status") == "PUBLISHED" or ex.is_published == 1)
            sub["is_published"] = is_pub
            exam_purged = bool(ex.is_document_purged)
            sub["has_question_paper"] = bool(is_pub and ex.question_paper_path and not exam_purged)
            sub["has_answer_key"] = bool(is_pub and ex.answer_key_path and not exam_purged)
            sub["exam_is_document_purged"] = exam_purged

            if user_role == "STUDENT" and not is_pub:
                # Strictly decouple and mask internal AI grading marks and answers before official publication!
                sub["total_awarded_marks"] = None
                sub["percentage"] = None
                sub["answers"] = []
                sub["revaluation"] = None
                sub["publication_status"] = "UNPUBLISHED"
                sub["student_status"] = (
                    "Under Evaluation"
                    if s.status in ["QUEUED", "PROCESSING", "GRADED", "COMPLETED", "NEEDS_REVIEW", "PAUSED_QUOTA"]
                    else "Submitted"
                )
                sub["days_remaining"] = None
                sub["seconds_remaining"] = None
                sub["retention_expires_at"] = None
                sub["retention"] = {
                    "days_remaining": None,
                    "retention_expires_at": None,
                    "is_active": False
                }
            else:
                sub["retention"] = RetentionService.get_retention_info(sub)
                sub["days_remaining"] = sub["retention"].get("days_remaining")
                sub["student_status"] = "Results Published" if is_pub else "Under Evaluation"

                # Fetch active revaluation if any
                reval = session.scalar(
                    select(RevaluationRequest)
                    .where(RevaluationRequest.submission_id == s.id)
                    .order_by(RevaluationRequest.requested_at.desc())
                    .limit(1)
                )
                if reval:
                    sub["revaluation"] = {
                        "id": reval.id,
                        "submission_id": reval.submission_id,
                        "student_id": reval.student_id,
                        "exam_id": reval.exam_id,
                        "status": reval.status,
                        "question_ids_json": reval.question_ids_json,
                        "student_reason": reval.student_reason,
                        "student_remark": reval.student_reason,
                        "decision": reval.decision,
                        "reviewer_notes": reval.reviewer_notes,
                        "teacher_feedback": reval.reviewer_notes,
                        "resolved_by": reval.resolved_by,
                        "requested_at": reval.requested_at,
                        "resolved_at": reval.resolved_at,
                        "expires_at": reval.expires_at,
                    }
                else:
                    sub["revaluation"] = None

                # Fetch answers breakdown for published papers
                ans_records = session.scalars(
                    select(Answer)
                    .where(Answer.submission_id == s.id)
                    .order_by(Answer.question_id.asc())
                ).all()
                sub["answers"] = [
                    {
                        "id": a.id,
                        "submission_id": a.submission_id,
                        "question_id": a.question_id,
                        "subquestion_id": a.subquestion_id,
                        "section_id": a.section_id,
                        "awarded_marks": a.awarded_marks,
                        "max_marks": a.max_marks,
                        "extracted_text": a.extracted_text,
                        "grading_rationale": a.grading_rationale,
                        "feedback": a.grading_rationale,
                        "needs_review": a.needs_review,
                        "review_reason": a.review_reason,
                        "page_number": a.page_number,
                        "confidence_score": round(1.0 - (a.grading_uncertainty or 0.0), 2),
                        "is_manually_edited": a.is_manual_override,
                        "is_manual_override": a.is_manual_override,
                        "override_reason": a.override_reason,
                        "is_extra_attempt": a.is_extra_attempt,
                        "is_missing": a.is_missing,
                    }
                    for a in ans_records
                ]

            submissions.append(sub)

        return {
            "user": user_dict,
            "active_exam": active_exam,
            "window_status": active_window_status,
            "active_windows": displayable_windows,
            "exams": exam_rows,
            "submissions": submissions
        }

@router.get("/portal-state")
async def get_student_portal_state(current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Consolidated high-performance student portal endpoint.
    Retrieves student identity, branch exams, active submission windows,
    and submission history in a single non-blocking thread execution.
    """
    user_id = current_user.get("sub") or current_user.get("id")
    user_role = current_user.get("role", "STUDENT")
    return await asyncio.to_thread(_fetch_portal_state_sync, user_id, user_role)
