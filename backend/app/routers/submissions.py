import uuid
import json
import shutil
import hashlib
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, status, BackgroundTasks
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel
import fitz
import logging
from sqlalchemy.orm import Session
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

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Submissions & Uploads"])

_backend_stitching_semaphore = asyncio.Semaphore(1)


def _purge_and_replace_previous_submissions(
    cursor,
    exam_id: str,
    clean_roll: str,
    student_id: Optional[str] = None,
    new_sub_id: Optional[str] = None,
    current_user_id: Optional[str] = None
) -> int:
    """
    Purges any previous active or superseded submissions for the same student & exam.
    Deletes Cloudinary/storage files, cancels evaluation queue entries, deletes DB rows,
    and logs an audit record so there are no duplicate submissions or orphaned cloud files.
    Supports both SQLAlchemy Session and legacy DBAPI cursor.
    """
    now = get_iso_now()
    storage = get_storage_service()

    if isinstance(cursor, Session):
        stmt = select(Submission).where(Submission.exam_id == exam_id)
        if student_id:
            stmt = stmt.where(or_(func.upper(Submission.roll_number) == clean_roll, Submission.student_id == student_id))
        else:
            stmt = stmt.where(func.upper(Submission.roll_number) == clean_roll)

        if new_sub_id:
            stmt = stmt.where(Submission.id != new_sub_id)

        prev_subs = cursor.scalars(stmt).all()
        if not prev_subs:
            return 0

        for ps in prev_subs:
            pid = ps.id
            for file_key in [ps.original_file_path, ps.canonical_pdf_path, ps.annotated_pdf_path]:
                if file_key:
                    try:
                        storage.delete_file(file_key)
                    except Exception as e:
                        logger.warning(f"Could not delete replaced submission storage file {file_key}: {e}")

            # Delete local artifacts
            try:
                local_renders = settings.RENDERS_DIR / pid
                if local_renders.exists():
                    shutil.rmtree(local_renders, ignore_errors=True)
                local_page_renders = settings.PAGE_RENDERS_DIR / f"sub_{pid}"
                if local_page_renders.exists():
                    shutil.rmtree(local_page_renders, ignore_errors=True)
                local_annotated = settings.EXPORTS_DIR / f"{pid}_annotated.pdf"
                if local_annotated.exists():
                    local_annotated.unlink(missing_ok=True)
                local_uploads = settings.UPLOADS_DIR / "submissions" / pid
                if local_uploads.exists():
                    shutil.rmtree(local_uploads, ignore_errors=True)
            except Exception as e:
                logger.warning(f"Could not delete local submission files for {pid}: {e}")

            # Delete evaluation queue entries
            cursor.execute(delete(EvaluationQueue).where(EvaluationQueue.submission_id == pid))

            # Delete child answers, criterion scores, revaluations
            ans_ids_stmt = select(Answer.id).where(Answer.submission_id == pid)
            cursor.execute(delete(CriterionScore).where(CriterionScore.answer_id.in_(ans_ids_stmt)))
            cursor.execute(delete(AnswerRegion).where(AnswerRegion.answer_id.in_(ans_ids_stmt)))
            cursor.execute(delete(Answer).where(Answer.submission_id == pid))
            cursor.execute(delete(RevaluationRequest).where(RevaluationRequest.submission_id == pid))

            # Delete the previous submission record
            cursor.delete(ps)

            # Audit log
            cursor.add(AuditLog(
                id=f"aud_{uuid.uuid4().hex[:12]}",
                user_id=current_user_id or "system",
                action="REPLACE_SUBMISSION",
                resource_type="SUBMISSION",
                resource_id=pid,
                details_json=json.dumps({"replaced_by": new_sub_id, "exam_id": exam_id, "roll_number": clean_roll}),
                created_at=now
            ))

        return len(prev_subs)

    # Legacy raw cursor fallback
    conds = ["exam_id = ?"]
    params = [exam_id]
    if student_id:
        conds.append("(UPPER(roll_number) = ? OR student_id = ?)")
        params.extend([clean_roll, student_id])
    else:
        conds.append("UPPER(roll_number) = ?")
        params.append(clean_roll)

    if new_sub_id:
        conds.append("id != ?")
        params.append(new_sub_id)

    query = f"""
        SELECT id, original_file_path, canonical_pdf_path, annotated_pdf_path 
        FROM submissions 
        WHERE {' AND '.join(conds)}
    """
    cursor.execute(query, tuple(params))
    prev_subs = [dict(r) for r in cursor.fetchall()]

    if not prev_subs:
        return 0

    for ps in prev_subs:
        pid = ps["id"]
        for file_key in [ps.get("original_file_path"), ps.get("canonical_pdf_path"), ps.get("annotated_pdf_path")]:
            if file_key:
                try:
                    storage.delete_file(file_key)
                except Exception as e:
                    logger.warning(f"Could not delete replaced submission storage file {file_key}: {e}")

        try:
            local_renders = settings.RENDERS_DIR / pid
            if local_renders.exists():
                shutil.rmtree(local_renders, ignore_errors=True)
            local_page_renders = settings.PAGE_RENDERS_DIR / f"sub_{pid}"
            if local_page_renders.exists():
                shutil.rmtree(local_page_renders, ignore_errors=True)
            local_annotated = settings.EXPORTS_DIR / f"{pid}_annotated.pdf"
            if local_annotated.exists():
                local_annotated.unlink(missing_ok=True)
            local_uploads = settings.UPLOADS_DIR / "submissions" / pid
            if local_uploads.exists():
                shutil.rmtree(local_uploads, ignore_errors=True)
        except Exception as e:
            logger.warning(f"Could not delete local submission files for {pid}: {e}")

        cursor.execute("DELETE FROM evaluation_queue WHERE submission_id = ?", (pid,))
        cursor.execute("DELETE FROM criterion_scores WHERE answer_id IN (SELECT id FROM answers WHERE submission_id = ?)", (pid,))
        cursor.execute("DELETE FROM answer_regions WHERE answer_id IN (SELECT id FROM answers WHERE submission_id = ?)", (pid,))
        cursor.execute("DELETE FROM answers WHERE submission_id = ?", (pid,))
        cursor.execute("DELETE FROM revaluation_requests WHERE submission_id = ?", (pid,))
        cursor.execute("DELETE FROM submissions WHERE id = ?", (pid,))

        cursor.execute("""
            INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details_json, created_at)
            VALUES (?, ?, 'REPLACE_SUBMISSION', 'SUBMISSION', ?, ?, ?)
        """, (
            f"aud_{uuid.uuid4().hex[:12]}",
            current_user_id or "system",
            pid,
            json.dumps({"replaced_by": new_sub_id, "exam_id": exam_id, "roll_number": clean_roll}),
            now
        ))

    return len(prev_subs)


def parse_iso(iso_str: str) -> datetime:
    try:
        return datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
    except Exception:
        return datetime.now(timezone.utc)


def verify_active_submission_window(exam_id: str, cursor, allow_grace: bool = False):
    """Verify that the exam has an active submission window."""
    if isinstance(cursor, Session):
        window = cursor.scalar(
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
            else:
                raise HTTPException(status_code=400, detail="Submission window has closed.")
        return window

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


@router.get("")
def list_submissions(
    exam_id: Optional[str] = None,
    batch_id: Optional[str] = None,
    include_answers: bool = False,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    stmt = (
        select(Submission, Exam)
        .outerjoin(Exam, Submission.exam_id == Exam.id)
        .where(Submission.submission_status == 'SUBMITTED')
    )

    if exam_id:
        stmt = stmt.where(Submission.exam_id == exam_id)
    if batch_id:
        stmt = stmt.where(Submission.batch_id == batch_id)

    user_role = current_user.get("role")
    user_branch = current_user.get("branch_id")

    # Branch Manager & Institute Director isolation
    if user_role == "BRANCH_MANAGER" and user_branch:
        stmt = stmt.where(or_(Exam.branch_id == user_branch, Exam.branch_id.is_(None)))
    elif user_role == "INSTITUTE_DIRECTOR":
        user_inst = current_user.get("institute_id")
        if user_inst:
            stmt = stmt.where(or_(Exam.institute_id == user_inst, Exam.institute_id.is_(None)))

    # Student privacy isolation
    if user_role == "STUDENT":
        stu_records = db.scalars(
            select(Student).where(Student.user_id == current_user["sub"])
        ).all()
        student_ids = [r.id for r in stu_records]
        roll_numbers = [r.roll_number.strip().upper() for r in stu_records if r.roll_number]
        names = [r.full_name.strip() for r in stu_records if r.full_name]

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
            conditions.append(Submission.student_id.in_(student_ids))
        if roll_numbers:
            conditions.append(func.upper(Submission.roll_number).in_(roll_numbers))
        if names:
            conditions.append(Submission.student_name.in_(names))

        if conditions:
            stmt = stmt.where(or_(*conditions))
        else:
            stmt = stmt.where(Submission.student_id == current_user["sub"])

    stmt = stmt.order_by(Submission.roll_number.asc(), Submission.created_at.asc())
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
    db: Session = Depends(get_db)
):
    """
    Direct zero-RAM PDF delivery endpoint.
    Redirects (307) directly to Cloudinary / R2 pre-signed CDN URL so zero PDF bytes buffer in server RAM.
    """
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

    # Check student role access and strict ownership
    user_role = current_user.get("role")
    is_pub = bool(sub.publication_status == "PUBLISHED" or (exam and exam.is_published == 1))

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
    current_user: Dict[str, Any] = Depends(require_branch_manager),
    db: Session = Depends(get_db)
):
    """Return all active submissions for an exam with their nested answer breakdown for the marks ledger."""
    subs = db.scalars(
        select(Submission)
        .where(Submission.exam_id == exam_id, Submission.submission_status == 'SUBMITTED')
        .order_by(Submission.roll_number.asc())
    ).all()

    sub_ids = [s.id for s in subs]
    answers_by_sub: Dict[str, List[Dict[str, Any]]] = {}
    if sub_ids:
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

    verify_active_submission_window(exam_id, db, allow_grace=False)

    exam = db.scalar(select(Exam).where(Exam.id == exam_id))
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found.")

    if exam.batch_scope in ("SPECIFIC", "BATCHES"):
        student_batch = req.batch_id
        if not student_batch:
            st_row = db.scalar(
                select(Student).where(
                    or_(
                        func.upper(Student.roll_number) == clean_roll,
                        Student.id == (req.student_id or ""),
                        Student.user_id == ((current_user or {}).get("sub", ""))
                    )
                ).limit(1)
            )
            if st_row:
                student_batch = st_row.batch_id

        allowed_bids = set()
        if exam.batch_ids:
            try:
                p = json.loads(exam.batch_ids)
                if isinstance(p, list):
                    allowed_bids = set(str(x).strip() for x in p if str(x).strip())
            except Exception:
                allowed_bids = set(b.strip() for b in exam.batch_ids.split(",") if b.strip())
        if not allowed_bids:
            allowed_bids = set(
                db.scalars(select(ExamBatch.batch_id).where(ExamBatch.exam_id == exam_id)).all()
            )

        if not student_batch or str(student_batch) not in allowed_bids:
            raise HTTPException(
                status_code=403,
                detail="This examination is restricted to specific batches. Your batch is not eligible to submit."
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
        "headers": presigned.get("headers", {}),
        "is_direct_cloud": presigned.get("is_direct_cloud", False)
    }


@router.post("/{exam_id}/confirm-upload")
def confirm_presigned_upload(
    exam_id: str,
    req: ConfirmUploadBody,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Step 2 of Direct-to-Storage Upload:
    Validates file integrity with PyMuPDF, enforces bounds (<=15 pages, <=7MB),
    and executes atomic replacement (superseding any previous submission).
    """
    clean_roll = req.roll_number.strip().upper()

    # BOLA / Student ownership enforcement
    if current_user.get("role") == "STUDENT":
        user_roll = (current_user.get("roll_number") or "").strip().upper()
        if user_roll and clean_roll != user_roll:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: You are logged in as {user_roll}. You cannot confirm uploads for {clean_roll}."
            )

    # Validate storage key path to prevent arbitrary overwriting
    if not req.storage_key.startswith(f"submissions/{exam_id}/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid storage key for this examination."
        )

    storage = get_storage_service()

    if not storage.file_exists(req.storage_key):
        raise HTTPException(status_code=400, detail="Uploaded file was not found in storage. Please re-upload.")

    local_path = storage.get_local_path_or_download(req.storage_key)
    file_size = local_path.stat().st_size

    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if file_size > max_bytes:
        storage.delete_file(req.storage_key)
        raise HTTPException(
            status_code=400,
            detail=f"File exceeds maximum size limit of {settings.MAX_UPLOAD_SIZE_MB} MB (received {file_size / (1024*1024):.1f} MB)."
        )

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

    verify_active_submission_window(exam_id, db, allow_grace=True)

    exam = db.scalar(select(Exam).where(Exam.id == exam_id))
    exam_total = exam.total_marks if exam else 0.0

    s_name = req.student_name or f"Student {clean_roll}"
    student_id = req.student_id
    if not student_id:
        stu_rec = db.scalar(select(Student).where(func.upper(Student.roll_number) == clean_roll))
        if stu_rec:
            student_id = stu_rec.id
            if not req.student_name:
                s_name = stu_rec.full_name
        elif current_user and current_user.get("role") == "STUDENT":
            stu_rec = db.scalar(select(Student).where(Student.user_id == current_user["sub"]))
            if stu_rec:
                student_id = stu_rec.id
                if not req.student_name:
                    s_name = stu_rec.full_name

    # Atomic replacement
    replaced_count = _purge_and_replace_previous_submissions(
        cursor=db,
        exam_id=exam_id,
        clean_roll=clean_roll,
        student_id=student_id,
        new_sub_id=sub_id,
        current_user_id=current_user["sub"] if current_user else None
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

    exam_title = exam.title if exam and exam.title else "Exam"
    exam_branch = exam.branch_id if exam else None

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
    storage = get_storage_service()

    with get_session() as session:
        verify_active_submission_window(exam_id, session, allow_grace=False)

        exam = session.scalar(select(Exam).where(Exam.id == exam_id))
        exam_total = exam.total_marks if exam else 0.0

        if exam and exam.batch_scope in ("SPECIFIC", "BATCHES"):
            student_batch = batch_id
            if not student_batch:
                st_row = session.scalar(
                    select(Student).where(
                        or_(
                            func.upper(Student.roll_number) == clean_roll,
                            Student.user_id == (current_sub or "")
                        )
                    ).limit(1)
                )
                if st_row:
                    student_batch = st_row.batch_id

            allowed_bids = set()
            if exam.batch_ids:
                try:
                    p = json.loads(exam.batch_ids)
                    if isinstance(p, list):
                        allowed_bids = set(str(x).strip() for x in p if str(x).strip())
                except Exception:
                    allowed_bids = set(b.strip() for b in exam.batch_ids.split(",") if b.strip())
            if not allowed_bids:
                allowed_bids = set(
                    session.scalars(select(ExamBatch.batch_id).where(ExamBatch.exam_id == exam_id)).all()
                )

            if not student_batch or str(student_batch) not in allowed_bids:
                raise HTTPException(
                    status_code=403,
                    detail="This examination is restricted to specific batches. Your batch is not eligible to submit."
                )

    sub_id = f"sub_{uuid.uuid4().hex[:12]}"
    dest_key = f"submissions/{exam_id}/{clean_roll}/original_{sub_id}.pdf"
    file_size = len(content)

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
            current_user_id=current_sub
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

        exam_title = exam.title if exam and exam.title else "Exam"
        exam_branch = exam.branch_id if exam else None

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

        payload = {
            "status": "success",
            "submission_id": sub_id,
            "roll_number": clean_roll,
            "page_count": page_count,
            "file_size_bytes": file_size,
            "is_replacement": bool(replaced_count > 0),
            "student_status": "Submitted"
        }
        return payload, str(local_path), sub_id


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

    is_single_pdf = len(all_files) == 1 and Path(all_files[0].filename).suffix.lower() == ".pdf"

    if is_single_pdf:
        content = await all_files[0].read()
        file_size = len(content)
        if file_size > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"File exceeds maximum size of {settings.MAX_UPLOAD_SIZE_MB} MB.")
    else:
        import tempfile
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            saved_paths: List[Path] = []
            total_raw_size = 0

            for idx, uf in enumerate(all_files):
                raw_bytes = await uf.read()
                total_raw_size += len(raw_bytes)
                if total_raw_size > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024 * 3:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Total uploaded size exceeds allowable limit of {settings.MAX_UPLOAD_SIZE_MB} MB."
                    )

                ext = Path(uf.filename).suffix.lower() or ".jpg"
                part_path = tmp_path / f"page_{idx+1:03d}{ext}"
                with open(part_path, "wb") as f_out:
                    f_out.write(raw_bytes)

                valid, msg = pdf_service.validate_file(part_path, max_size_mb=settings.MAX_UPLOAD_SIZE_MB)
                if not valid:
                    raise HTTPException(status_code=400, detail=f"Invalid page {idx+1} ({uf.filename}): {msg}")
                saved_paths.append(part_path)

            out_pdf = tmp_path / "canonical_assembled.pdf"
            try:
                async with _backend_stitching_semaphore:
                    await asyncio.to_thread(pdf_service.files_to_canonical_pdf, saved_paths, out_pdf)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Failed to assemble pages into canonical PDF: {str(e)}")

            with open(out_pdf, "rb") as f_pdf:
                content = f_pdf.read()
            file_size = len(content)

            if file_size > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
                raise HTTPException(
                    status_code=400,
                    detail=f"Assembled PDF ({file_size / (1024*1024):.1f} MB) exceeds maximum size of {settings.MAX_UPLOAD_SIZE_MB} MB."
                )

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

    return res_payload


@router.get("/{submission_id}")
def get_submission_details(
    submission_id: str,
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    sub = grading_service.get_submission_details(submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    is_student = current_user and current_user.get("role") == "STUDENT"
    is_published = sub.get("publication_status") == "PUBLISHED"

    if is_student:
        stu_rows = db.scalars(select(Student).where(Student.user_id == current_user["sub"])).all()
        allowed_rolls = [r.roll_number.strip().upper() for r in stu_rows if r.roll_number]
        allowed_ids = [r.id for r in stu_rows]
        if current_user.get("roll_number"):
            allowed_rolls.append(current_user["roll_number"].strip().upper())
        if current_user.get("student_id"):
            allowed_ids.append(current_user["student_id"])

        sub_roll = (sub.get("roll_number") or "").strip().upper()
        sub_stu_id = sub.get("student_id") or ""

        if allowed_rolls or allowed_ids:
            if sub_roll not in allowed_rolls and sub_stu_id not in allowed_ids:
                raise HTTPException(status_code=403, detail="Forbidden: You can only view your own submission.")

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
                "pdf_url": f"/api/v1/submissions/{sub['id']}/pdf",
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
                "pdf_url": f"/api/v1/submissions/{sub['id']}/pdf",
                "submitted_at": sub.get("submitted_at") or sub.get("created_at")
            }

    sub["pdf_url"] = f"/api/v1/submissions/{sub['id']}/pdf"
    return sub


@router.post("/purge-expired")
def purge_expired_documents(current_user: Dict[str, Any] = Depends(require_root_admin)):
    """
    Root Admin maintenance task:
    Scans and purges all student submissions that have exceeded the 15-day TTL post-grading.
    """
    res = RetentionService.check_and_purge_expired_submissions()
    return res
