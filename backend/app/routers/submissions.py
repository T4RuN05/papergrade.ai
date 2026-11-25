import uuid
import json
import shutil
import hashlib
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Optional, List, Dict, Any, Tuple
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, status, Query, BackgroundTasks
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel
import fitz
import logging
import threading
from sqlalchemy.orm import Session, defer
from sqlalchemy import select, delete, update, func, or_

from backend.app.config import settings
from backend.app.db.session import get_db, get_session
from backend.app.db.base import get_iso_now
from backend.app.db.models import (
    Submission,
    Answer,
    AnswerRegion,
    CriterionScore,
    EvaluationQueue,
    RevaluationRequest,
    Exam,
    ExamBatch,
    SubmissionWindow,
    Batch,
    Student,
    AuditLog,
)
from backend.app.services.storage import get_storage_service
from backend.app.services.portal_cache import PortalStateEpochManager
from backend.app.services.grading_service import grading_service
from backend.app.services.auth import (
    get_current_user,
    require_root_admin,
    require_branch_manager,
    BoundedTTLCache,
)
from backend.app.services.authorization import (
    parse_iso_utc,
    verify_exam_tenancy,
    verify_staff_exam_scope,
    verify_submission_tenancy,
)
from backend.app.services.notification_service import (
    send_notification,
    notify_branch_managers,
)
from backend.app.services.retention_service import RetentionService

logger = logging.getLogger(__name__)

# Double-submit debounce and idempotency guard (15s sliding TTL)
_submission_confirm_cache = BoundedTTLCache(maxsize=2000, ttl=15.0)
_submission_in_flight: set[str] = set()
_submission_lock = threading.Lock()

router = APIRouter(tags=["Submissions & Uploads"])


def _purge_and_replace_previous_submissions(
    cursor,
    exam_id: str,
    clean_roll: str,
    student_id: Optional[str] = None,
    new_sub_id: Optional[str] = None,
    current_user_id: Optional[str] = None,
    deferred_delete_keys: Optional[List[str]] = None,
) -> int:
    """
    Purges any previous active or superseded submissions for the same student & exam.
    Cancels evaluation queue entries, deletes DB rows, and collects/deletes cloud/local files.
    """
    now = get_iso_now()

    if isinstance(cursor, Session):
        norm_roll = (clean_roll or "").strip().upper()
        stmt = select(
            Submission.id,
            Submission.original_file_path,
            Submission.canonical_pdf_path,
            Submission.annotated_pdf_path,
        ).where(Submission.exam_id == exam_id)
        if student_id:
            stmt = stmt.where(or_(func.upper(Submission.roll_number) == norm_roll, Submission.student_id == student_id))
        else:
            stmt = stmt.where(func.upper(Submission.roll_number) == norm_roll)

        if new_sub_id:
            stmt = stmt.where(Submission.id != new_sub_id)

        prev_rows = cursor.execute(stmt).all()
        if not prev_rows:
            return 0

        prev_ids = [r[0] for r in prev_rows]
        keys_to_delete: List[str] = list(dict.fromkeys(
            k for r in prev_rows for k in r[1:] if k
        ))

        for pid in prev_ids:
            try:
                for local_dir in (settings.RENDERS_DIR / pid, settings.RENDERS_DIR / f"sub_{pid}", settings.UPLOADS_DIR / "submissions" / pid):
                    if local_dir.exists():
                        shutil.rmtree(local_dir, ignore_errors=True)
                local_annotated = settings.EXPORTS_DIR / f"{pid}_annotated.pdf"
                if local_annotated.exists():
                    local_annotated.unlink(missing_ok=True)
            except Exception as e:
                logger.warning(f"Could not delete local submission files for {pid}: {e}")

        ans_ids_stmt = select(Answer.id).where(Answer.submission_id.in_(prev_ids))
        cursor.execute(delete(EvaluationQueue).where(EvaluationQueue.submission_id.in_(prev_ids)))
        cursor.execute(delete(CriterionScore).where(CriterionScore.answer_id.in_(ans_ids_stmt)))
        cursor.execute(delete(AnswerRegion).where(AnswerRegion.answer_id.in_(ans_ids_stmt)))
        cursor.execute(delete(Answer).where(Answer.submission_id.in_(prev_ids)))
        cursor.execute(delete(RevaluationRequest).where(RevaluationRequest.submission_id.in_(prev_ids)))
        cursor.execute(delete(Submission).where(Submission.id.in_(prev_ids)))

        cursor.add_all([
            AuditLog(
                id=f"aud_{uuid.uuid4().hex[:12]}",
                user_id=current_user_id or "system",
                action="REPLACE_SUBMISSION",
                resource_type="SUBMISSION",
                resource_id=pid,
                details_json=json.dumps({"replaced_by": new_sub_id, "exam_id": exam_id, "roll_number": clean_roll}),
                created_at=now,
            )
            for pid in prev_ids
        ])

        if deferred_delete_keys is not None:
            deferred_delete_keys.extend(keys_to_delete)
        elif keys_to_delete:
            storage = get_storage_service()
            for file_key in keys_to_delete:
                try:
                    storage.delete_file(file_key)
                except Exception as e:
                    logger.warning(f"Could not delete replaced submission storage file {file_key}: {e}")

        return len(prev_ids)

    with get_session() as session:
        return _purge_and_replace_previous_submissions(
            cursor=session,
            exam_id=exam_id,
            clean_roll=clean_roll,
            student_id=student_id,
            new_sub_id=new_sub_id,
            current_user_id=current_user_id,
            deferred_delete_keys=deferred_delete_keys,
        )


def parse_iso(iso_str: str) -> datetime:
    return parse_iso_utc(iso_str) or datetime.now(timezone.utc)


def _verify_student_exam_eligibility(
    exam: Exam,
    window_reopen_scope: Optional[str],
    clean_roll: str,
    student_id: Optional[str],
    batch_id: Optional[str],
    current_user_id: Optional[str],
    db: Session,
) -> None:
    """Shared eligibility validator across request-upload, confirm-upload, and direct multipart upload."""
    if window_reopen_scope == "UNSUBMITTED_ONLY":
        prior_sub = db.scalar(
            select(Submission.id).where(
                Submission.exam_id == exam.id,
                or_(
                    func.upper(Submission.roll_number) == clean_roll,
                    Submission.student_id == (student_id or ""),
                ),
                Submission.submission_status == "SUBMITTED",
            ).limit(1)
        )
        if prior_sub:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This submission window was reopened for unsubmitted students only. Re-submissions are not permitted.",
            )

    if exam.batch_scope in ("SPECIFIC", "BATCHES"):
        student_batch = batch_id
        if not student_batch:
            st_row = db.scalar(
                select(Student.batch_id).where(
                    or_(
                        func.upper(Student.roll_number) == clean_roll,
                        Student.id == (student_id or ""),
                        Student.user_id == (current_user_id or ""),
                    )
                ).limit(1)
            )
            if st_row:
                student_batch = st_row

        allowed_bids = set()
        if exam.batch_ids:
            try:
                p = json.loads(exam.batch_ids)
                if isinstance(p, list):
                    allowed_bids = {str(x).strip() for x in p if str(x).strip()}
            except Exception:
                allowed_bids = {b.strip() for b in exam.batch_ids.split(",") if b.strip()}
        if not allowed_bids:
            allowed_bids = set(
                db.scalars(select(ExamBatch.batch_id).where(ExamBatch.exam_id == exam.id)).all()
            )

        if not student_batch or str(student_batch) not in allowed_bids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This examination is restricted to specific batches. Your batch is not eligible to submit.",
            )


def get_exam_and_active_window(
    exam_id: str,
    db: Session,
    allow_grace: bool = False
) -> Tuple[Any, Any]:
    """
    Consolidated single-query column-projected fetch for Exam metadata and its latest SubmissionWindow.
    Avoids transferring large Exam TEXT/JSON columns (rubric_data) over Supavisor WAN.
    """
    stmt = (
        select(
            Exam.id,
            Exam.title,
            Exam.branch_id,
            Exam.total_marks,
            Exam.batch_scope,
            Exam.batch_ids,
            SubmissionWindow.status,
            SubmissionWindow.deadline_at,
            SubmissionWindow.grace_deadline_at,
            SubmissionWindow.reopen_scope,
        )
        .outerjoin(SubmissionWindow, SubmissionWindow.exam_id == Exam.id)
        .where(Exam.id == exam_id)
        .order_by(SubmissionWindow.created_at.desc())
        .limit(1)
    )
    row = db.execute(stmt).first()
    if not row or not row.id:
        raise HTTPException(status_code=404, detail="Exam not found.")

    exam = SimpleNamespace(
        id=row.id,
        title=row.title,
        branch_id=row.branch_id,
        total_marks=row.total_marks,
        batch_scope=row.batch_scope,
        batch_ids=row.batch_ids,
    )
    window = (
        SimpleNamespace(
            status=row.status,
            deadline_at=row.deadline_at,
            grace_deadline_at=row.grace_deadline_at,
            reopen_scope=row.reopen_scope,
        )
        if row.status is not None
        else None
    )

    if not window or window.status != "OPEN":
        raise HTTPException(status_code=400, detail="Submission window is not currently open for this examination.")

    now = datetime.now(timezone.utc)
    target_deadline = parse_iso(window.grace_deadline_at if allow_grace else window.deadline_at)
    if now > target_deadline:
        if allow_grace:
            raise HTTPException(status_code=400, detail="Grace period has expired. Upload rejected.")
        else:
            raise HTTPException(status_code=400, detail="Submission window has closed.")

    return exam, window


def verify_active_submission_window(exam_id: str, session: Session, allow_grace: bool = False):
    """Verify via SQLAlchemy ORM that the exam has an active submission window."""
    window = session.scalar(
        select(SubmissionWindow)
        .where(SubmissionWindow.exam_id == exam_id)
        .order_by(SubmissionWindow.created_at.desc())
        .limit(1)
    )
    if not window or window.status != "OPEN":
        raise HTTPException(status_code=400, detail="Submission window is not currently open for this examination.")
    now = datetime.now(timezone.utc)
    target_deadline = parse_iso(window.grace_deadline_at if allow_grace else window.deadline_at)
    if now > target_deadline:
        if allow_grace:
            raise HTTPException(status_code=400, detail="Grace period has expired. Upload rejected.")
        raise HTTPException(status_code=400, detail="Submission window has closed.")
    return window


@router.get("")
def list_submissions(
    exam_id: Optional[str] = None,
    batch_id: Optional[str] = None,
    include_answers: bool = False,
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    stmt = (
        select(Submission, Exam)
        .options(defer(Submission.stage1_extraction_json))
        .outerjoin(Exam, Submission.exam_id == Exam.id)
        .where(Submission.submission_status == 'SUBMITTED')
    )

    if exam_id:
        stmt = stmt.where(Submission.exam_id == exam_id)
    if batch_id:
        stmt = stmt.where(Submission.batch_id == batch_id)

    user_role = current_user.get("role")
    user_branch = current_user.get("branch_id")
    user_inst = current_user.get("institute_id")

    # Fail-closed multi-tenant scoping for non-root staff
    if user_role == "BRANCH_MANAGER":
        if not user_branch:
            raise HTTPException(status_code=403, detail="Forbidden: Branch assignment missing.")
        stmt = stmt.where(Exam.branch_id == user_branch)
        if user_inst:
            stmt = stmt.where(Exam.institute_id == user_inst)
    elif user_role == "TEACHER":
        if not user_inst and not user_branch:
            raise HTTPException(status_code=403, detail="Forbidden: Institute or branch assignment missing.")
        if user_inst:
            stmt = stmt.where(Exam.institute_id == user_inst)
        if user_branch:
            stmt = stmt.where(Exam.branch_id == user_branch)
    elif user_role == "INSTITUTE_DIRECTOR":
        if not user_inst:
            raise HTTPException(status_code=403, detail="Forbidden: Institute assignment missing.")
        stmt = stmt.where(Exam.institute_id == user_inst)

    # Student privacy isolation (identity + tenant scoped; never match by full_name)
    if user_role == "STUDENT":
        stu_records = db.scalars(
            select(Student).where(Student.user_id == current_user["sub"])
        ).all()
        student_ids = [r.id for r in stu_records]
        roll_numbers = [r.roll_number.strip().upper() for r in stu_records if r.roll_number]

        if current_user.get("student_id"):
            student_ids.append(current_user["student_id"])
        if current_user.get("roll_number"):
            roll_numbers.append(current_user["roll_number"].strip().upper())

        student_ids = list(set(filter(None, student_ids)))
        roll_numbers = list(set(filter(None, roll_numbers)))

        conditions = []
        if student_ids:
            conditions.append(Submission.student_id.in_(student_ids))
        if roll_numbers:
            conditions.append(func.upper(Submission.roll_number).in_(roll_numbers))

        if conditions:
            stmt = stmt.where(or_(*conditions))
        else:
            stmt = stmt.where(Submission.student_id == current_user["sub"])

        if user_inst:
            stmt = stmt.where(or_(Exam.institute_id == user_inst, Exam.institute_id.is_(None)))
        if user_branch:
            stmt = stmt.where(or_(Exam.branch_id == user_branch, Exam.branch_id.is_(None)))

    stmt = stmt.order_by(Submission.roll_number.asc(), Submission.created_at.asc()).offset(offset).limit(limit)
    results = db.execute(stmt).all()

    if not results:
        return []

    submissions = []
    sub_ids = []
    for s_sub, s_exam in results:
        s_dict = {
            "id": s_sub.id,
            "exam_id": s_sub.exam_id,
            "batch_id": s_sub.batch_id,
            "student_id": s_sub.student_id,
            "student_name": s_sub.student_name,
            "roll_number": s_sub.roll_number,
            "page_count": s_sub.page_count,
            "file_size_bytes": s_sub.file_size_bytes,
            "original_file_path": s_sub.original_file_path,
            "canonical_pdf_path": s_sub.canonical_pdf_path,
            "annotated_pdf_path": s_sub.annotated_pdf_path,
            "total_awarded_marks": s_sub.total_awarded_marks,
            "max_marks": s_sub.max_marks,
            "percentage": s_sub.percentage,
            "status": s_sub.status,
            "submission_status": s_sub.submission_status,
            "publication_status": s_sub.publication_status,
            "created_at": s_sub.created_at,
            "updated_at": s_sub.updated_at,
            "submitted_at": s_sub.submitted_at,
            "graded_at": s_sub.graded_at,
            "reviewed_at": s_sub.reviewed_at,
            "is_document_purged": bool(s_sub.is_document_purged),
            "purged_at": s_sub.purged_at,
            "ttl_days": s_sub.ttl_days,
            "retention_expires_at": s_sub.retention_expires_at,
            "exam_title": s_exam.title if s_exam else None,
            "exam_subject": s_exam.subject if s_exam else None,
            "exam_total_marks": s_exam.total_marks if s_exam else None,
            "exam_is_published": s_exam.is_published if s_exam else 0,
            "exam_published_at": s_exam.published_at if s_exam else None,
        }
        submissions.append(s_dict)
        sub_ids.append(s_sub.id)

    # Batch load answers & revaluations
    answers_by_sub: Dict[str, List[Dict[str, Any]]] = {}
    reval_by_sub: Dict[str, Dict[str, Any]] = {}

    if include_answers and sub_ids:
        ans_rows = db.scalars(
            select(Answer).where(Answer.submission_id.in_(sub_ids)).order_by(Answer.question_id.asc())
        ).all()
        for a in ans_rows:
            answers_by_sub.setdefault(a.submission_id, []).append({
                "id": a.id,
                "submission_id": a.submission_id,
                "question_id": a.question_id,
                "awarded_marks": a.awarded_marks,
                "max_marks": a.max_marks,
                "needs_review": bool(a.needs_review),
                "is_extra_attempt": bool(a.is_extra_attempt),
            })

    if sub_ids:
        rev_rows = db.scalars(
            select(RevaluationRequest)
            .where(RevaluationRequest.submission_id.in_(sub_ids))
            .order_by(RevaluationRequest.requested_at.desc())
        ).all()
        for r in rev_rows:
            if r.submission_id not in reval_by_sub:
                reval_by_sub[r.submission_id] = {
                    "id": r.id,
                    "submission_id": r.submission_id,
                    "student_id": r.student_id,
                    "status": r.status,
                    "student_reason": r.student_reason,
                    "requested_at": r.requested_at,
                    "resolved_at": r.resolved_at,
                }

    # Attach answers, revaluation, and retention lifecycle info
    is_student_user = bool(current_user and current_user.get("role") == "STUDENT")
    for s in submissions:
        is_pub = bool(s.get("publication_status") == "PUBLISHED" or s.get("exam_is_published") == 1)
        s["is_published"] = is_pub

        if is_student_user and not is_pub:
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
            s["answers"] = answers_by_sub.get(s["id"], [])
            s["revaluation"] = reval_by_sub.get(s["id"])
            retention_info = RetentionService.get_retention_info(s)
            s.update(retention_info)
            s["student_status"] = "Results Published" if is_pub else "Under Evaluation"

    return submissions


@router.get("/{submission_id}/pdf")
def get_submission_pdf_stream(
    submission_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Direct zero-RAM PDF delivery endpoint (Zero-Hold DB session boundary).
    Redirects (307) directly to Cloudinary / R2 pre-signed CDN URL so zero PDF bytes buffer in server RAM.
    """
    with get_session() as db:
        result = db.execute(
            select(Submission, Exam)
            .outerjoin(Exam, Submission.exam_id == Exam.id)
            .where(Submission.id == submission_id)
        ).first()

        if not result:
            raise HTTPException(status_code=404, detail="Submission not found")

        sub, exam = result
        if sub.is_document_purged:
            raise HTTPException(
                status_code=410,
                detail="Document unavailable: Graded answer sheets are permanently purged in accordance with the 15-day storage retention policy."
            )

        user_role = current_user.get("role")
        if user_role == "STUDENT":
            user_roll = (current_user.get("roll_number") or "").strip().upper()
            user_stu_id = current_user.get("student_id")
            user_sub_id = current_user.get("sub")
            allowed_rolls = [user_roll] if user_roll else []
            allowed_ids = [user_stu_id] if user_stu_id else []
            if user_sub_id:
                stu_rows = db.scalars(select(Student).where(Student.user_id == user_sub_id)).all()
                for r in stu_rows:
                    if r.roll_number:
                        allowed_rolls.append(r.roll_number.strip().upper())
                    if r.id:
                        allowed_ids.append(r.id)
            sub_roll = (sub.roll_number or "").strip().upper() if sub else ""
            sub_stu_id = sub.student_id if sub else ""
            owns_sub = (sub_roll and sub_roll in allowed_rolls) or (sub_stu_id and sub_stu_id in allowed_ids)
            if not owns_sub:
                raise HTTPException(status_code=403, detail="Forbidden: You cannot access another student's submission.")
        elif user_role != "ROOT_ADMIN":
            verify_staff_exam_scope(
                current_user,
                exam.institute_id if exam else None,
                exam.branch_id if exam else None,
                exam_id=sub.exam_id,
            )

        key = sub.canonical_pdf_path or sub.original_file_path
        if not key:
            raise HTTPException(status_code=404, detail="PDF path not found for submission.")

    storage = get_storage_service()
    if hasattr(storage, "generate_presigned_download_url"):
        try:
            download_url = storage.generate_presigned_download_url(key)
            if download_url and (download_url.startswith("http://") or download_url.startswith("https://")):
                return RedirectResponse(url=download_url, status_code=307)
        except Exception:
            pass

    local_path = storage.get_local_path_or_download(key)
    if not local_path or not local_path.exists():
        raise HTTPException(status_code=404, detail="PDF file not found in storage.")

    return FileResponse(
        str(local_path),
        media_type="application/pdf",
        headers={"Cache-Control": "private, no-cache"}
    )


@router.get("/exam/{exam_id}")
def get_submissions_for_exam(
    exam_id: str,
    include_answers: bool = Query(True, description="Whether to include full nested answers for each submission"),
    current_user: Dict[str, Any] = Depends(require_branch_manager),
    db: Session = Depends(get_db)
):
    """Return all active submissions for an exam with their nested answer breakdown for the marks ledger."""
    exam = verify_exam_tenancy(exam_id, current_user, db)

    subs = db.scalars(
        select(Submission)
        .where(Submission.exam_id == exam_id, Submission.submission_status == 'SUBMITTED')
        .order_by(Submission.roll_number.asc())
    ).all()

    sub_ids = [s.id for s in subs]
    answers_by_sub: Dict[str, List[Dict[str, Any]]] = {}
    if include_answers and sub_ids:
        all_ans = db.scalars(
            select(Answer).where(Answer.submission_id.in_(sub_ids)).order_by(Answer.question_id.asc())
        ).all()
        for a in all_ans:
            answers_by_sub.setdefault(a.submission_id, []).append({
                "id": a.id,
                "question_id": a.question_id,
                "awarded_marks": a.awarded_marks,
                "max_marks": a.max_marks,
                "needs_review": bool(a.needs_review),
                "is_extra_attempt": bool(a.is_extra_attempt),
            })

    output = []
    for s in subs:
        s_dict = {
            "id": s.id,
            "exam_id": s.exam_id,
            "batch_id": s.batch_id,
            "student_id": s.student_id,
            "student_name": s.student_name,
            "roll_number": s.roll_number,
            "page_count": s.page_count,
            "file_size_bytes": s.file_size_bytes,
            "original_file_path": s.original_file_path,
            "canonical_pdf_path": s.canonical_pdf_path,
            "annotated_pdf_path": s.annotated_pdf_path,
            "total_awarded_marks": s.total_awarded_marks,
            "max_marks": s.max_marks,
            "percentage": s.percentage,
            "status": s.status,
            "submission_status": s.submission_status,
            "publication_status": s.publication_status,
            "created_at": s.created_at,
            "updated_at": s.updated_at,
            "submitted_at": s.submitted_at,
            "answers": answers_by_sub.get(s.id, []),
            "is_absent": False,
        }
        output.append(s_dict)

    # Roster reconciliation: identify enrolled students who did not submit and flag as ABSENT
    exam = db.scalar(select(Exam).where(Exam.id == exam_id))
    batch_ids = set()
    if exam:
        if exam.batch_ids:
            try:
                parsed = json.loads(exam.batch_ids)
                if isinstance(parsed, list):
                    batch_ids.update(str(b).strip() for b in parsed if str(b).strip())
            except Exception:
                batch_ids.update(b.strip() for b in exam.batch_ids.split(",") if b.strip())
        ex_batches = db.scalars(select(ExamBatch.batch_id).where(ExamBatch.exam_id == exam_id)).all()
        batch_ids.update(b for b in ex_batches if b)

        if not batch_ids and exam.branch_id:
            branch_batches = db.scalars(select(Batch.id).where(Batch.branch_id == exam.branch_id)).all()
            batch_ids.update(branch_batches)

    if batch_ids:
        enrolled_students = db.scalars(
            select(Student).where(Student.batch_id.in_(list(batch_ids))).order_by(Student.roll_number.asc())
        ).all()
        submitted_rolls = {s.roll_number.strip().upper() for s in subs if s.roll_number}
        submitted_stu_ids = {s.student_id for s in subs if s.student_id}

        for st in enrolled_students:
            clean_roll = (st.roll_number or "").strip().upper()
            is_submitted = (st.id in submitted_stu_ids) or (clean_roll and clean_roll in submitted_rolls)
            if not is_submitted:
                output.append({
                    "id": f"absent_{st.id}",
                    "exam_id": exam_id,
                    "batch_id": st.batch_id,
                    "student_id": st.id,
                    "student_name": st.full_name,
                    "roll_number": st.roll_number,
                    "page_count": 0,
                    "file_size_bytes": 0,
                    "original_file_path": "",
                    "canonical_pdf_path": "",
                    "annotated_pdf_path": None,
                    "total_awarded_marks": 0.0,
                    "max_marks": exam.total_marks if exam else 0.0,
                    "percentage": 0.0,
                    "status": "ABSENT",
                    "submission_status": "ABSENT",
                    "publication_status": "PUBLISHED" if (exam and exam.is_published) else "UNPUBLISHED",
                    "created_at": exam.created_at if exam else "",
                    "updated_at": exam.created_at if exam else "",
                    "submitted_at": "",
                    "answers": [],
                    "is_absent": True,
                })

    output.sort(key=lambda x: x.get("roll_number", ""))
    return output


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
    page_count: Optional[int] = None
    file_size_bytes: Optional[int] = None
    sha256_hash: Optional[str] = None


@router.post("/{exam_id}/request-upload")
def request_presigned_upload(
    exam_id: str,
    req: RequestUploadBody,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Step 1 of Direct-to-Storage Upload:
    Validates submission window, creates upload session, and generates pre-signed S3/R2 PUT URL.
    """
    clean_roll = req.roll_number.strip().upper()

    # BOLA / Student ownership enforcement
    if current_user.get("role") == "STUDENT":
        user_roll = (current_user.get("roll_number") or "").strip().upper()
        if user_roll and clean_roll != user_roll:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: You are logged in as {user_roll}. You cannot submit for {clean_roll}."
            )

    exam, window = get_exam_and_active_window(exam_id, db, allow_grace=True)
    _verify_student_exam_eligibility(
        exam=exam,
        window_reopen_scope=getattr(window, "reopen_scope", None),
        clean_roll=clean_roll,
        student_id=req.student_id,
        batch_id=req.batch_id or (current_user or {}).get("batch_id"),
        current_user_id=(current_user or {}).get("sub"),
        db=db,
    )

    upload_session_id = f"upsess_{uuid.uuid4().hex}"
    student_tag = req.student_id or clean_roll
    destination_key = f"submissions/{exam_id}/{student_tag}/original_{upload_session_id}.pdf"

    storage = get_storage_service()
    presigned = storage.generate_presigned_upload_url(
        key=destination_key,
        content_type="application/pdf",
        expires_in=300
    )

    return {
        "status": "authorized",
        "upload_session_id": upload_session_id,
        "destination_key": destination_key,
        "upload_url": presigned["url"],
        "method": presigned["method"],
        "fields": presigned.get("fields", {}),
        "headers": presigned.get("headers", {}),
        "is_direct_cloud": presigned.get("is_direct_cloud", False)
    }


def _delete_storage_keys_bg(keys: List[str]) -> None:
    """Delete superseded remote storage keys off the request thread after HTTP confirmation."""
    if not keys:
        return
    storage = get_storage_service()
    for old_key in dict.fromkeys(keys):
        try:
            storage.delete_file(old_key)
        except Exception as exc:
            logger.warning("Failed deferred storage cleanup for %s: %s", old_key, exc)


@router.post("/{exam_id}/confirm-upload")
def confirm_presigned_upload(
    exam_id: str,
    req: ConfirmUploadBody,
    background_tasks: BackgroundTasks,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    clean_roll = req.roll_number.strip().upper()

    # Double-submit debounce & idempotency fast path (15s sliding TTL)
    idempotency_key = f"{exam_id}:{clean_roll}:{req.upload_session_id or req.storage_key}"
    cached_res = _submission_confirm_cache.get(idempotency_key)
    if cached_res:
        return cached_res

    in_flight_key = f"{exam_id}:{clean_roll}"
    with _submission_lock:
        if in_flight_key in _submission_in_flight:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A submission confirmation for this student is currently in progress. Please wait a moment."
            )
        _submission_in_flight.add(in_flight_key)

    try:
        res = _do_confirm_presigned_upload(
            exam_id, req, current_user, clean_roll, background_tasks=background_tasks
        )
        _submission_confirm_cache.set(idempotency_key, res)
        return res
    finally:
        with _submission_lock:
            _submission_in_flight.discard(in_flight_key)


def _do_confirm_presigned_upload(
    exam_id: str,
    req: ConfirmUploadBody,
    current_user: Dict[str, Any],
    clean_roll: str,
    background_tasks: Optional[BackgroundTasks] = None,
) -> Dict[str, Any]:
    """
    Step 2 of Direct-to-Storage Upload (Zero-Hold DB isolation):
    All storage checks/deletes execute strictly outside DB sessions.
    """
    if current_user.get("role") == "STUDENT":
        user_roll = (current_user.get("roll_number") or "").strip().upper()
        if user_roll and clean_roll != user_roll:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: You are logged in as {user_roll}. You cannot confirm uploads for {clean_roll}."
            )

    if not req.storage_key.startswith(f"submissions/{exam_id}/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid storage key for this examination."
        )

    if req.page_count and req.page_count > settings.MAX_PAGE_COUNT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"PDF exceeds maximum page limit of {settings.MAX_PAGE_COUNT} pages (claimed {req.page_count})."
        )
    if req.file_size_bytes and req.file_size_bytes > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File exceeds maximum upload limit of {settings.MAX_UPLOAD_SIZE_MB} MB."
        )

    storage = get_storage_service()

    # Step A: Short bounded read-only DB check for active window, reopen scope & batch eligibility
    try:
        with get_session() as db:
            exam, window = get_exam_and_active_window(exam_id, db, allow_grace=True)
            exam_total = exam.total_marks if exam else 0.0
            exam_title = (exam.title if exam and exam.title else None) or "Exam"
            exam_branch = exam.branch_id if exam else None
            window_reopen_scope = getattr(window, "reopen_scope", None)
            _verify_student_exam_eligibility(
                exam=exam,
                window_reopen_scope=window_reopen_scope,
                clean_roll=clean_roll,
                student_id=req.student_id,
                batch_id=req.batch_id,
                current_user_id=current_user.get("sub"),
                db=db,
            )
    except Exception:
        try:
            storage.delete_file(req.storage_key)
        except Exception:
            pass
        raise

    # Step B: WAN storage validation with ZERO DB connections held
    if not storage.file_exists(req.storage_key):
        raise HTTPException(status_code=400, detail="Uploaded file was not found in storage. Please re-upload.")

    file_size = req.file_size_bytes or 0
    page_count = req.page_count or 1

    local_path = None
    if hasattr(storage, "_resolve_path"):
        try:
            candidate_path = storage._resolve_path(req.storage_key)
            if candidate_path.exists():
                local_path = candidate_path
        except Exception:
            pass

    if local_path and local_path.exists():
        file_size = local_path.stat().st_size
        try:
            doc = fitz.open(str(local_path))
            try:
                page_count = len(doc)
            finally:
                doc.close()
        except Exception:
            pass

    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if file_size > max_bytes:
        storage.delete_file(req.storage_key)
        raise HTTPException(
            status_code=400,
            detail=f"File exceeds maximum size limit of {settings.MAX_UPLOAD_SIZE_MB} MB."
        )

    if page_count > settings.MAX_PAGE_COUNT:
        storage.delete_file(req.storage_key)
        raise HTTPException(
            status_code=400,
            detail=f"PDF exceeds maximum page limit of {settings.MAX_PAGE_COUNT} pages (received {page_count} pages)."
        )

    # Step C: Short bounded DB transaction for atomic replacement + submission insert
    now = get_iso_now()
    sub_id = f"sub_{uuid.uuid4().hex[:12]}"
    deferred_delete_keys: List[str] = []

    with get_session() as db:
        s_name = req.student_name or f"Student {clean_roll}"
        student_id = req.student_id
        if not student_id:
            if current_user and current_user.get("role") == "STUDENT":
                student_id = current_user.get("student_id")
                if not req.student_name and current_user.get("full_name"):
                    s_name = current_user["full_name"]
            if not student_id:
                stu_rec = db.scalar(select(Student).where(func.upper(Student.roll_number) == clean_roll))
                if stu_rec:
                    student_id = stu_rec.id
                    if not req.student_name:
                        s_name = stu_rec.full_name
        elif not req.student_name and current_user and current_user.get("full_name"):
            s_name = current_user["full_name"]

        replaced_count = _purge_and_replace_previous_submissions(
            cursor=db,
            exam_id=exam_id,
            clean_roll=clean_roll,
            student_id=student_id,
            new_sub_id=sub_id,
            current_user_id=current_user["sub"] if current_user else None,
            deferred_delete_keys=deferred_delete_keys,
        )

        new_sub = Submission(
            id=sub_id,
            batch_id=req.batch_id,
            exam_id=exam_id,
            student_id=student_id,
            student_name=s_name,
            roll_number=clean_roll,
            original_file_path=req.storage_key,
            canonical_pdf_path=req.storage_key,
            page_count=page_count,
            file_size_bytes=file_size,
            sha256_hash=req.sha256_hash,
            upload_session_id=req.upload_session_id,
            submission_status='SUBMITTED',
            status='UPLOADED',
            publication_status='UNPUBLISHED',
            max_marks=exam_total,
            submitted_at=now,
            created_at=now,
            updated_at=now,
        )
        db.add(new_sub)

        if req.batch_id:
            db.execute(update(Batch).where(Batch.id == req.batch_id).values(updated_at=now))

        target_user_id = current_user.get("sub") if current_user and current_user.get("role") == "STUDENT" else None
        if not target_user_id and student_id:
            stu = db.scalar(select(Student).where(Student.id == student_id))
            if stu and stu.user_id:
                target_user_id = stu.user_id

        if target_user_id:
            send_notification(
                cursor=db,
                user_id=target_user_id,
                notif_type="SUBMISSION_CONFIRMED",
                title="Answer Sheet Submitted",
                message=f"Your answer sheet for '{exam_title}' has been received. Status: Submitted.",
                link_url="/student/portal"
            )

        notify_branch_managers(
            cursor=db,
            branch_id=exam_branch,
            notif_type="SUBMISSION_RECEIVED",
            title="New Student Submission",
            message=f"Student {clean_roll} submitted their answer script for '{exam_title}'.",
            link_url=f"/exams/{exam_id}"
        )

        db.commit()

    # Step D: Delete superseded cloud files strictly after DB session has closed (and off HTTP response when queued)
    if deferred_delete_keys:
        if background_tasks is not None:
            background_tasks.add_task(_delete_storage_keys_bg, deferred_delete_keys)
        else:
            _delete_storage_keys_bg(deferred_delete_keys)

    if target_user_id:
        PortalStateEpochManager.bump_user(target_user_id)
    if exam_branch:
        PortalStateEpochManager.bump_branch(exam_branch)

    return {
        "status": "success",
        "submission_id": sub_id,
        "student_name": s_name,
        "roll_number": clean_roll,
        "page_count": page_count,
        "file_size_bytes": file_size,
        "is_replacement": bool(replaced_count > 0),
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
    # Validate PDF structure and page count strictly in-memory BEFORE storage or DB writes
    try:
        doc = fitz.open(stream=content, filetype="pdf")
        try:
            page_count = len(doc)
        finally:
            doc.close()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Corrupted or invalid PDF: {str(e)}")

    if page_count > settings.MAX_PAGE_COUNT:
        raise HTTPException(status_code=400, detail=f"File exceeds {settings.MAX_PAGE_COUNT} page limit.")

    with get_session() as session:
        exam, window = get_exam_and_active_window(exam_id, session, allow_grace=True)
        exam_total = exam.total_marks if exam else 0.0
        exam_title = (exam.title if exam and exam.title else None) or "Exam"
        exam_branch = exam.branch_id if exam else None
        _verify_student_exam_eligibility(
            exam=exam,
            window_reopen_scope=getattr(window, "reopen_scope", None),
            clean_roll=clean_roll,
            student_id=None,
            batch_id=batch_id,
            current_user_id=current_sub,
            db=session,
        )

    sub_id = f"sub_{uuid.uuid4().hex[:12]}"
    dest_key = f"submissions/{exam_id}/{clean_roll}/original_{sub_id}.pdf"
    file_size = len(content)
    sha256 = hashlib.sha256(content).hexdigest()
    now = get_iso_now()
    s_name = (student_name or "").strip() or f"Student {clean_roll}"

    storage = get_storage_service()
    storage.upload_file(content, dest_key, content_type="application/pdf")

    deferred_delete_keys: List[str] = []
    with get_session() as session:
        student_id = None
        stu_rec = session.scalar(select(Student).where(func.upper(Student.roll_number) == clean_roll))
        if stu_rec:
            student_id = stu_rec.id
            if not student_name:
                s_name = stu_rec.full_name
            if not batch_id and stu_rec.batch_id:
                batch_id = stu_rec.batch_id
        elif current_role == "STUDENT" and current_sub:
            stu_rec = session.scalar(select(Student).where(Student.user_id == current_sub))
            if stu_rec:
                student_id = stu_rec.id
                if not student_name:
                    s_name = stu_rec.full_name
                if not batch_id and stu_rec.batch_id:
                    batch_id = stu_rec.batch_id

        replaced_count = _purge_and_replace_previous_submissions(
            cursor=session,
            exam_id=exam_id,
            clean_roll=clean_roll,
            student_id=student_id,
            new_sub_id=sub_id,
            current_user_id=current_sub,
            deferred_delete_keys=deferred_delete_keys,
        )

        new_sub = Submission(
            id=sub_id,
            batch_id=batch_id,
            exam_id=exam_id,
            student_id=student_id,
            student_name=s_name,
            roll_number=clean_roll,
            original_file_path=dest_key,
            canonical_pdf_path=dest_key,
            page_count=page_count,
            file_size_bytes=file_size,
            sha256_hash=sha256,
            submission_status='SUBMITTED',
            status='UPLOADED',
            publication_status='UNPUBLISHED',
            max_marks=exam_total,
            submitted_at=now,
            created_at=now,
            updated_at=now,
        )
        session.add(new_sub)

        target_user_id = current_sub if current_role == "STUDENT" else None
        if not target_user_id and student_id:
            stu = session.scalar(select(Student).where(Student.id == student_id))
            if stu and stu.user_id:
                target_user_id = stu.user_id

        if target_user_id:
            send_notification(
                cursor=session,
                user_id=target_user_id,
                notif_type="SUBMISSION_CONFIRMED",
                title="Answer Sheet Submitted",
                message=f"Your answer sheet for '{exam_title}' has been received. Status: Submitted.",
                link_url="/student/portal"
            )

        notify_branch_managers(
            cursor=session,
            branch_id=exam_branch,
            notif_type="SUBMISSION_RECEIVED",
            title="New Student Submission",
            message=f"Student {clean_roll} submitted their answer script for '{exam_title}'.",
            link_url=f"/exams/{exam_id}"
        )

        session.commit()

    for old_key in deferred_delete_keys:
        try:
            storage.delete_file(old_key)
        except Exception as exc:
            logger.warning("Failed deferred storage cleanup for %s: %s", old_key, exc)

    payload = {
        "status": "success",
        "submission_id": sub_id,
        "roll_number": clean_roll,
        "page_count": page_count,
        "file_size_bytes": file_size,
        "is_replacement": bool(replaced_count > 0),
        "student_status": "Submitted"
    }
    return payload, dest_key, sub_id


@router.post("/{exam_id}/upload-single")
async def upload_single_multipart(
    exam_id: str,
    roll_number: str = Form(...),
    student_name: Optional[str] = Form(""),
    batch_id: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    files: Optional[List[UploadFile]] = File(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    clean_roll = roll_number.strip().upper()

    # BOLA / Student ownership enforcement
    if current_user.get("role") == "STUDENT":
        user_roll = (current_user.get("roll_number") or "").strip().upper()
        if user_roll and clean_roll != user_roll:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: You are logged in as {user_roll}. You cannot upload for {clean_roll}."
            )

    all_files: List[UploadFile] = []
    seen_filenames = set()

    if file and file.filename:
        all_files.append(file)
        seen_filenames.add(file.filename)

    if files:
        for f in files:
            if f and f.filename and f.filename not in seen_filenames:
                all_files.append(f)
                seen_filenames.add(f.filename)

    if not all_files:
        raise HTTPException(status_code=400, detail="No answer sheet file provided for upload.")

    if len(all_files) != 1 or Path(all_files[0].filename).suffix.lower() != ".pdf":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Submissions must be a single canonical PDF. Multi-image captures must be assembled client-side before upload."
        )

    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    upload_file = all_files[0]
    buf = bytearray()
    chunk_size = 1024 * 1024
    try:
        while True:
            chunk = await upload_file.read(chunk_size)
            if not chunk:
                break
            if len(buf) + len(chunk) > max_bytes:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"File exceeds maximum size of {settings.MAX_UPLOAD_SIZE_MB} MB."
                )
            buf.extend(chunk)
            if len(buf) >= 5 and not buf[:5] == b"%PDF-":
                raise HTTPException(status_code=400, detail="Invalid PDF file: Missing %PDF- header.")
    finally:
        await upload_file.close()

    if not buf:
        raise HTTPException(status_code=400, detail="Empty PDF file.")
    content = bytes(buf)

    current_sub = current_user.get("sub") if current_user else None
    current_role = current_user.get("role") if current_user else None

    debounce_key = f"{exam_id}:{clean_roll}"
    with _submission_lock:
        if debounce_key in _submission_in_flight:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An upload for this student is currently being processed. Please wait a moment."
            )
        _submission_in_flight.add(debounce_key)

    try:
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

        if current_sub:
            PortalStateEpochManager.bump_user(current_sub)

        return res_payload
    finally:
        with _submission_lock:
            _submission_in_flight.discard(debounce_key)


@router.get("/{submission_id}")
def get_submission_details(
    submission_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    with get_session() as db:
        user_role = current_user.get("role")
        is_student = user_role == "STUDENT"

        if not is_student:
            verify_submission_tenancy(submission_id, current_user, db)
        else:
            row = db.execute(
                select(Submission.student_id, Submission.roll_number)
                .where(Submission.id == submission_id)
            ).first()
            if not row:
                raise HTTPException(status_code=404, detail="Submission not found")
            sub_stu_id, sub_roll = row
            stu_rows = db.scalars(select(Student).where(Student.user_id == current_user["sub"])).all()
            allowed_rolls = [r.roll_number.strip().upper() for r in stu_rows if r.roll_number]
            allowed_ids = [r.id for r in stu_rows]
            if current_user.get("roll_number"):
                allowed_rolls.append(current_user["roll_number"].strip().upper())
            if current_user.get("student_id"):
                allowed_ids.append(current_user["student_id"])

            norm_roll = (sub_roll or "").strip().upper()
            if (norm_roll not in allowed_rolls) and ((sub_stu_id or "") not in allowed_ids):
                raise HTTPException(status_code=403, detail="Forbidden: You can only view your own submission.")

    sub = grading_service.get_submission_details(submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    is_published = sub.get("publication_status") == "PUBLISHED"
    if current_user.get("role") == "STUDENT":

        if not is_published:
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
                "pdf_url": f"/api/submissions/{sub['id']}/pdf",
                "submitted_at": sub.get("submitted_at") or sub.get("created_at")
            }
        else:
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
                    else (f"/api/storage/download?key={sub.get('annotated_pdf_path')}" if sub.get("annotated_pdf_path") else None)
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
                "pdf_url": f"/api/submissions/{sub['id']}/pdf",
                "submitted_at": sub.get("submitted_at") or sub.get("created_at")
            }

    sub["pdf_url"] = f"/api/submissions/{sub['id']}/pdf"
    return sub


@router.post("/purge-expired")
def purge_expired_documents(current_user: Dict[str, Any] = Depends(require_root_admin)):
    """
    Root Admin maintenance task:
    Scans and purges all student submissions that have exceeded the 15-day TTL post-grading.
    """
    res = RetentionService.check_and_purge_expired_submissions()
    return res
