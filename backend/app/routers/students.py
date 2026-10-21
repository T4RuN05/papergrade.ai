"""
Student Portal Router - Consolidated High-Performance Endpoints.

Provides a unified portal-state endpoint (GET /api/v1/student/portal-state)
that replaces 10+ fragmented HTTP calls with 1 fast, non-blocking query.
Includes 4-second in-memory window caching to prevent DB connection pool starvation
during high-traffic student upload bursts.
"""

import time
import json
import asyncio
import threading
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException

from backend.app.database import get_db, is_postgres
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
    param = "%s" if is_postgres() else "?"
    now_ts = time.time()
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # 1. Fetch user & student profile
        cursor.execute(f"SELECT * FROM users WHERE id = {param}", (user_id,))
        u = cursor.fetchone()
        if not u:
            raise HTTPException(status_code=404, detail="User not found")
        
        user_dict = {
            "id": u["id"],
            "role": u["role"],
            "email": u["email"],
            "full_name": u["full_name"],
            "name": u["full_name"],
            "institute_id": u["institute_id"],
            "branch_id": u["branch_id"]
        }
        
        # Lookup student record if enrolled
        cursor.execute(
            f"SELECT * FROM students WHERE user_id = {param} ORDER BY claimed_at DESC LIMIT 1",
            (user_id,)
        )
        st = cursor.fetchone()
        
        roll_number = None
        student_id = None
        batch_id = None
        branch_id = u["branch_id"]
        
        if st:
            roll_number = st["roll_number"]
            student_id = st["id"]
            batch_id = st["batch_id"]
            user_dict["student_id"] = st["id"]
            user_dict["student_id_num"] = st["student_id_num"]
            user_dict["roll_number"] = st["roll_number"]
            user_dict["batch_id"] = st["batch_id"]
            user_dict["student"] = {
                "student_id": st["id"],
                "student_id_num": st["student_id_num"],
                "roll_number": st["roll_number"],
                "batch_id": st["batch_id"]
            }
            if not branch_id and batch_id:
                cursor.execute(f"SELECT branch_id FROM batches WHERE id = {param}", (batch_id,))
                b_row = cursor.fetchone()
                if b_row:
                    branch_id = b_row["branch_id"]
                    user_dict["branch_id"] = branch_id

        # 2. Fetch Exams visible to this branch
        if branch_id:
            cursor.execute(
                f"""
                SELECT id, title, subject, total_marks, status, lifecycle_status, is_published, branch_id, batch_scope, batch_ids, created_at
                FROM exams
                WHERE branch_id = {param} OR branch_id IS NULL
                ORDER BY created_at DESC
                """,
                (branch_id,)
            )
        else:
            cursor.execute("""
                SELECT id, title, subject, total_marks, status, lifecycle_status, is_published, branch_id, batch_scope, batch_ids, created_at
                FROM exams
                ORDER BY created_at DESC
            """)
        raw_exam_rows = [dict(r) for r in cursor.fetchall()]

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
                    cursor.execute(
                        f"SELECT batch_id FROM exam_batches WHERE exam_id = {param}",
                        (ex["id"],)
                    )
                    allowed_bids = set(r["batch_id"] for r in cursor.fetchall() if r["batch_id"])

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
                    placeholders = ",".join([param] * len(exam_ids))
                    cursor.execute(
                        f"""
                        SELECT * FROM submission_windows 
                        WHERE exam_id IN ({placeholders})
                        ORDER BY created_at DESC
                        """,
                        tuple(exam_ids)
                    )
                    for w in cursor.fetchall():
                        ex_id = w["exam_id"]
                        if ex_id not in windows_by_exam:
                            windows_by_exam[ex_id] = dict(w)
                _window_cache[cache_key] = {"time": now_ts, "data": windows_by_exam}

        # Match active exam windows
        # Priority 1: All currently active windows (status == OPEN and within deadline/grace)
        # Priority 2: Windows closed within the last 2 hours (most recently closed candidate)
        # Otherwise: Empty list (card will not show)
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
        conds = []
        sub_params = []
        if student_id:
            conds.append(f"s.student_id = {param}")
            sub_params.append(student_id)
        if roll_number:
            conds.append(f"UPPER(s.roll_number) = {param}")
            sub_params.append(roll_number.upper())
        if not conds:
            conds.append(f"s.student_id = {param}")
            sub_params.append(user_id)

        where_clause = " OR ".join(conds)
        cursor.execute(
            f"""
            SELECT s.*, e.title as exam_title, e.subject as exam_subject, e.total_marks as exam_total_marks, e.is_published as exam_is_published,
                   e.question_paper_path as exam_question_paper_path,
                   e.answer_key_path as exam_answer_key_path,
                   e.is_document_purged as exam_is_document_purged
            FROM submissions s
            JOIN exams e ON s.exam_id = e.id
            WHERE ({where_clause}) AND s.submission_status = 'SUBMITTED'
            ORDER BY s.created_at DESC
            """,
            tuple(sub_params)
        )
        raw_sub_rows = [dict(r) for r in cursor.fetchall()]

        # Deduplicate submissions by exam_id (keep only the newest active submission per exam)
        sub_rows = []
        seen_exam_ids = set()
        for sub in raw_sub_rows:
            e_id = sub.get("exam_id")
            if e_id not in seen_exam_ids:
                seen_exam_ids.add(e_id)
                sub_rows.append(sub)

        # Attach revaluation, artifact, and retention info
        for sub in sub_rows:
            is_pub = bool(sub.get("publication_status") == "PUBLISHED" or sub.get("exam_is_published") == 1)
            sub["is_published"] = is_pub
            exam_purged = bool(sub.get("exam_is_document_purged"))
            sub["has_question_paper"] = bool(is_pub and sub.get("exam_question_paper_path") and not exam_purged)
            sub["has_answer_key"] = bool(is_pub and sub.get("exam_answer_key_path") and not exam_purged)
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
                    if sub.get("status") in ["QUEUED", "PROCESSING", "GRADED", "COMPLETED", "NEEDS_REVIEW", "PAUSED_QUOTA"]
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
                sub["is_document_purged"] = bool(sub.get("is_document_purged"))
                sub["student_status"] = "Results Published" if is_pub else "Under Evaluation"

                # Fetch active revaluation if any
                cursor.execute(
                    f"SELECT * FROM revaluation_requests WHERE submission_id = {param} ORDER BY requested_at DESC LIMIT 1",
                    (sub["id"],)
                )
                reval_row = cursor.fetchone()
                if reval_row:
                    sub["revaluation"] = dict(reval_row)

                # Fetch answers breakdown for published papers
                cursor.execute(
                    f"SELECT * FROM answers WHERE submission_id = {param} ORDER BY question_id ASC",
                    (sub["id"],)
                )
                sub["answers"] = [dict(a) for a in cursor.fetchall()]

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
    user_id = current_user.get("sub")
    user_role = current_user.get("role", "STUDENT")
    return await asyncio.to_thread(_fetch_portal_state_sync, user_id, user_role)
