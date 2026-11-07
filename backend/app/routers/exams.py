import uuid
import json
import shutil
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, status, BackgroundTasks
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import select, func, update, delete, or_, and_
import fitz

logger = logging.getLogger(__name__)

from backend.app.config import settings
from backend.app.db.session import get_db
from backend.app.db.base import get_iso_now
from backend.app.db.models import (
    Exam,
    ExamBatch,
    Batch,
    Branch,
    Institute,
    Student,
    RubricVersion,
    SubmissionWindow,
    Submission,
    Answer,
    AnswerRegion,
    CriterionScore,
    EvaluationQueue,
    RevaluationRequest,
    AuditLog,
    Notification,
    ApiUsageEvent,
    ExperimentBenchmark,
)
from backend.app.schemas import ExamRubricExtractionResult, RubricApproveRequest
from backend.app.services.exam_service import exam_service
from backend.app.services.pdf_service import pdf_service
from backend.app.services.storage import get_storage_service
from backend.app.services.auth import (
    get_current_user,
    get_current_user_optional,
    require_root_admin,
    require_branch_manager,
)
from backend.app.services.notification_service import (
    background_dispatch_exam_created,
    background_dispatch_results_published,
)
from backend.app.services.retention_service import RetentionService
from backend.app.routers.windows import calculate_window_dict, _window_to_dict

router = APIRouter(tags=["Exams, Rubrics & Publication"])


@router.get("")
def list_exams(
    branch_id: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_role = current_user.get("role")
    user_branch = current_user.get("branch_id")

    stmt = (
        select(
            Exam,
            Branch.name.label("branch_name"),
            Branch.code.label("branch_code"),
            Branch.city.label("branch_city"),
            Branch.institute_id.label("branch_inst_id"),
            Institute.name.label("inst_name"),
            Institute.code.label("inst_code"),
        )
        .outerjoin(Branch, Exam.branch_id == Branch.id)
        .outerjoin(Institute, Exam.institute_id == Institute.id)
    )

    if user_role == "BRANCH_MANAGER" and user_branch:
        stmt = stmt.where(Exam.branch_id == user_branch)
    elif user_role == "STUDENT" and user_branch:
        stmt = stmt.where(or_(Exam.branch_id == user_branch, Exam.branch_id.is_(None)))
    elif branch_id:
        stmt = stmt.where(Exam.branch_id == branch_id)

    stmt = stmt.order_by(Exam.created_at.desc())
    rows = db.execute(stmt).all()

    exam_ids = [r[0].id for r in rows]

    # Pre-fetch latest submission windows for all returned exams
    windows_by_exam: Dict[str, Dict[str, Any]] = {}
    if exam_ids:
        now_dt = datetime.now(timezone.utc)
        subq = (
            select(
                SubmissionWindow.exam_id,
                func.max(SubmissionWindow.created_at).label("max_created")
            )
            .where(SubmissionWindow.exam_id.in_(exam_ids))
            .group_by(SubmissionWindow.exam_id)
            .subquery()
        )
        win_rows = db.scalars(
            select(SubmissionWindow)
            .join(
                subq,
                and_(
                    SubmissionWindow.exam_id == subq.c.exam_id,
                    SubmissionWindow.created_at == subq.c.max_created
                )
            )
        ).all()
        for w in win_rows:
            windows_by_exam[w.exam_id] = calculate_window_dict(_window_to_dict(w), now_dt)

    # Pre-fetch scoped batches for specific batch exams
    eb_rows = db.execute(
        select(ExamBatch.exam_id, Batch.id, Batch.name, Batch.code, Batch.academic_year)
        .join(Batch, ExamBatch.batch_id == Batch.id)
        .order_by(Batch.name.asc())
    ).all()
    scoped_map: Dict[str, List[Dict[str, Any]]] = {}
    for ex_id, b_id, b_name, b_code, b_year in eb_rows:
        if ex_id not in scoped_map:
            scoped_map[ex_id] = []
        scoped_map[ex_id].append({
            "id": b_id,
            "name": b_name,
            "code": b_code,
            "academic_year": b_year,
        })

    # Pre-fetch latest approved rubric flag
    rubric_approved_rows = db.scalars(
        select(RubricVersion)
        .where(RubricVersion.exam_id.in_(exam_ids))
        .order_by(RubricVersion.is_approved.desc(), RubricVersion.version_num.desc())
    ).all()
    rubric_map: Dict[str, bool] = {}
    for rv in rubric_approved_rows:
        if rv.exam_id not in rubric_map:
            rubric_map[rv.exam_id] = bool(rv.is_approved)

    exams = []
    for exam, b_name, b_code, b_city, b_inst_id, i_name, i_code in rows:
        eff_inst_id = exam.institute_id or b_inst_id
        is_approved = rubric_map.get(exam.id, False)
        window_status = windows_by_exam.get(exam.id, {
            "has_window": False,
            "status": "NOT_OPENED",
            "is_active": False,
            "seconds_remaining": 0,
            "is_in_grace": False,
            "is_expired": True,
            "should_display": False,
        })

        exams.append({
            "id": exam.id,
            "institute_id": eff_inst_id,
            "institute_name": i_name,
            "institute_code": i_code,
            "branch_id": exam.branch_id,
            "branch_name": b_name,
            "branch_code": b_code,
            "branch_city": b_city,
            "title": exam.title,
            "subject": exam.subject,
            "total_marks": exam.total_marks,
            "question_paper_path": exam.question_paper_path,
            "answer_key_path": exam.answer_key_path,
            "current_rubric_version_id": exam.current_rubric_version_id,
            "lifecycle_status": exam.lifecycle_status,
            "is_published": exam.is_published,
            "published_at": exam.published_at,
            "retention_expires_at": exam.retention_expires_at,
            "is_document_purged": exam.is_document_purged,
            "purged_at": exam.purged_at,
            "created_by": exam.created_by,
            "batch_scope": exam.batch_scope,
            "batch_ids": exam.batch_ids,
            "status": exam.status,
            "created_at": exam.created_at,
            "updated_at": exam.updated_at,
            "is_rubric_approved": is_approved,
            "has_approved_rubric": is_approved,
            "window_status": window_status,
            "scoped_batches": scoped_map.get(exam.id, []),
        })

    return exams


@router.get("/{exam_id}/evaluation-status")
def get_exam_evaluation_status(
    exam_id: str,
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Lightweight, single-query endpoint for real-time evaluation polling.
    Returns exam status, aggregated counts, and submission progress in one fast DB call (<5ms).
    """
    exam = db.scalar(select(Exam).where(Exam.id == exam_id))
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    subs = db.scalars(
        select(Submission)
        .where(Submission.exam_id == exam_id, Submission.submission_status == "SUBMITTED")
        .order_by(Submission.roll_number.asc(), Submission.created_at.asc())
    ).all()

    counts = {"QUEUED": 0, "PROCESSING": 0, "COMPLETED": 0, "NEEDS_REVIEW": 0, "FAILED": 0, "PAUSED_QUOTA": 0}
    submissions_list = []
    for s in subs:
        st = s.status or "QUEUED"
        counts[st] = counts.get(st, 0) + 1
        submissions_list.append({
            "id": s.id,
            "roll_number": s.roll_number,
            "student_name": s.student_name,
            "status": s.status,
            "total_awarded_marks": s.total_awarded_marks,
            "max_marks": s.max_marks,
            "percentage": s.percentage,
            "error_message": s.error_message,
            "retry_count": s.retry_count,
            "updated_at": s.updated_at,
        })

    total = len(subs)
    finished = counts["COMPLETED"] + counts["NEEDS_REVIEW"] + counts["FAILED"]
    active = counts["QUEUED"] + counts["PROCESSING"]
    progress_pct = round((finished / total * 100), 1) if total > 0 else 0.0

    return {
        "exam_id": exam.id,
        "title": exam.title,
        "status": exam.status,
        "lifecycle_status": exam.lifecycle_status or exam.status,
        "is_active": active > 0,
        "summary": {
            "total": total,
            "queued": counts["QUEUED"],
            "processing": counts["PROCESSING"],
            "completed": counts["COMPLETED"],
            "needs_review": counts["NEEDS_REVIEW"],
            "failed": counts["FAILED"],
            "paused_quota": counts["PAUSED_QUOTA"],
            "finished": finished,
            "progress_percent": progress_pct,
        },
        "submissions": submissions_list,
    }


@router.get("/{exam_id}")
def get_exam(
    exam_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    exam = exam_service.get_exam(exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    # If student, mask answer key and rubric until published
    if current_user.get("role") == "STUDENT":
        if not exam.get("is_published"):
            exam["answer_key_path"] = None
            exam["rubric_version"] = None

    # Attach latest window status
    window = db.scalar(
        select(SubmissionWindow)
        .where(SubmissionWindow.exam_id == exam_id)
        .order_by(SubmissionWindow.created_at.desc())
        .limit(1)
    )
    exam["window_status"] = calculate_window_dict(_window_to_dict(window) if window else None)

    return exam


@router.post("")
async def create_exam(
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    subject: str = Form(...),
    branch_id: Optional[str] = Form(None),
    batch_scope: Optional[str] = Form("ALL"),
    batch_ids: Optional[str] = Form(None),
    question_paper: Optional[List[UploadFile]] = File(None),
    current_user: Dict[str, Any] = Depends(require_branch_manager),
    db: Session = Depends(get_db)
):
    """
    Create exam (Root Admin or Branch Manager).
    Branch Manager creates within their branch.
    Answer key is NOT uploaded here (Answer keys are strictly Root Admin only).
    """
    exam_id = f"exam_{uuid.uuid4().hex[:12]}"
    effective_branch = current_user.get("branch_id") if current_user.get("role") == "BRANCH_MANAGER" else branch_id

    # Process batch scope and batch IDs
    clean_batch_ids = []
    if batch_ids:
        try:
            parsed = json.loads(batch_ids)
            if isinstance(parsed, list):
                clean_batch_ids = [str(b).strip() for b in parsed if str(b).strip()]
            elif isinstance(parsed, str):
                clean_batch_ids = [b.strip() for b in parsed.split(",") if b.strip()]
        except Exception:
            clean_batch_ids = [b.strip() for b in batch_ids.split(",") if b.strip()]

    clean_scope = "SPECIFIC" if (batch_scope and batch_scope.upper() in ["SPECIFIC", "BATCHES"] and clean_batch_ids) else "ALL"
    saved_batch_ids_json = json.dumps(clean_batch_ids) if clean_scope == "SPECIFIC" else None

    qp_path = None
    raw_qp_files = [f for f in (question_paper or []) if f and f.filename]

    if raw_qp_files:
        exam_uploads_dir = settings.UPLOADS_DIR / f"exam_{exam_id}"
        exam_uploads_dir.mkdir(parents=True, exist_ok=True)
        saved_qp_paths = []
        for idx, qpf in enumerate(raw_qp_files):
            ext = Path(qpf.filename).suffix or ".jpg"
            saved_part = exam_uploads_dir / f"qp_part_{idx+1}{ext}"
            with open(saved_part, "wb") as f_out:
                shutil.copyfileobj(qpf.file, f_out)
            valid, msg = pdf_service.validate_file(saved_part)
            if not valid:
                raise HTTPException(status_code=400, detail=f"Question paper ({qpf.filename}) error: {msg}")
            saved_qp_paths.append(saved_part)

        qp_pdf = exam_uploads_dir / "question_paper.pdf"
        qp_path = str(pdf_service.files_to_canonical_pdf(saved_qp_paths, qp_pdf))
        storage_key = f"exams/{exam_id}/question_paper.pdf"
        try:
            storage = get_storage_service()
            storage.upload_file(qp_pdf, storage_key)
            qp_path = storage_key
        except Exception as e:
            logger.warning(f"Failed to sync QP to storage: {e}")

    now = get_iso_now()

    # Look up institute_id for effective_branch
    institute_id = None
    if effective_branch:
        br = db.scalar(select(Branch).where(Branch.id == effective_branch))
        if br:
            institute_id = br.institute_id

    new_exam = Exam(
        id=exam_id,
        institute_id=institute_id,
        branch_id=effective_branch,
        title=title.strip(),
        subject=subject.strip(),
        total_marks=0.0,
        question_paper_path=qp_path,
        answer_key_path=None,
        lifecycle_status="DRAFT",
        is_published=0,
        status="DRAFT",
        created_by=current_user["sub"],
        batch_scope=clean_scope,
        batch_ids=saved_batch_ids_json,
        created_at=now,
        updated_at=now,
    )
    db.add(new_exam)

    if clean_scope == "SPECIFIC" and clean_batch_ids:
        for b_id in clean_batch_ids:
            eb_id = f"eb_{uuid.uuid4().hex[:12]}"
            db.add(ExamBatch(id=eb_id, exam_id=exam_id, batch_id=b_id, created_at=now))

    db.commit()

    # Dispatch notifications asynchronously
    background_tasks.add_task(
        background_dispatch_exam_created,
        exam_id=exam_id,
        title=title.strip(),
        subject=subject.strip(),
        branch_id=effective_branch,
        batch_scope=clean_scope,
        batch_ids=clean_batch_ids if clean_scope == "SPECIFIC" else None,
        creator_id=current_user["sub"],
        creator_role=current_user.get("role", "BRANCH_MANAGER"),
    )

    return exam_service.get_exam(exam_id)


@router.post("/{exam_id}/answer-key")
async def upload_answer_key(
    exam_id: str,
    answer_key: List[UploadFile] = File(...),
    current_user: Dict[str, Any] = Depends(require_root_admin),
    db: Session = Depends(get_db)
):
    """
    Root Admin alone uploads answer key.
    Triggers draft rubric generation via Gemini, but DOES NOT auto-approve or auto-grade.
    """
    exam = db.scalar(select(Exam).where(Exam.id == exam_id))
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    exam_uploads_dir = settings.UPLOADS_DIR / f"exam_{exam_id}"
    exam_uploads_dir.mkdir(parents=True, exist_ok=True)

    saved_ak_paths = []
    for idx, akf in enumerate(answer_key):
        ext = Path(akf.filename).suffix or ".jpg"
        saved_part = exam_uploads_dir / f"ak_part_{idx+1}{ext}"
        with open(saved_part, "wb") as f_out:
            shutil.copyfileobj(akf.file, f_out)
        valid, msg = pdf_service.validate_file(saved_part)
        if not valid:
            raise HTTPException(status_code=400, detail=f"Answer key error: {msg}")
        saved_ak_paths.append(saved_part)

    ak_pdf = exam_uploads_dir / "answer_key.pdf"
    ak_path = pdf_service.files_to_canonical_pdf(saved_ak_paths, ak_pdf)
    storage_key = f"exams/{exam_id}/answer_key.pdf"
    try:
        storage = get_storage_service()
        storage.upload_file(ak_pdf, storage_key)
    except Exception as e:
        logger.warning(f"Failed to sync answer key to storage: {e}")

    # Generate draft rubric via AI
    from backend.app.gemini.client import gemini_client
    qp_raw = exam.question_paper_path
    qp_path = Path(qp_raw) if qp_raw and Path(qp_raw).exists() else ak_pdf

    draft_rubric, _ = gemini_client.extract_exam_rubric(
        exam_id=exam_id,
        question_paper_path=qp_path,
        answer_key_path=ak_pdf,
        extra_notes=f"Subject: {exam.subject or ''}"
    )

    version_id = f"rub_{uuid.uuid4().hex[:12]}"
    now = get_iso_now()
    rubric_total = getattr(draft_rubric, "total_marks", getattr(draft_rubric, "total_exam_marks", None))
    if rubric_total is None or rubric_total == 0.0:
        rubric_total = sum(getattr(q, "max_marks", 0.0) for q in getattr(draft_rubric, "questions", [])) or 0.0
    total_marks = float(rubric_total)

    v_count = db.scalar(select(func.count(RubricVersion.id)).where(RubricVersion.exam_id == exam_id)) or 0
    v_num = v_count + 1

    rubric_row = RubricVersion(
        id=version_id,
        exam_id=exam_id,
        version_num=v_num,
        is_approved=0,
        rubric_data=draft_rubric.model_dump_json(),
        created_at=now,
    )
    db.add(rubric_row)

    exam.answer_key_path = storage_key
    exam.total_marks = total_marks
    exam.current_rubric_version_id = version_id
    exam.lifecycle_status = "EVALUATION_READY"
    exam.updated_at = now
    db.commit()

    return {
        "status": "draft_rubric_generated",
        "exam_id": exam_id,
        "rubric_version_id": version_id,
        "is_approved": False,
        "rubric_data": draft_rubric.model_dump(),
    }


@router.post("/{exam_id}/question-paper")
async def upload_question_paper(
    exam_id: str,
    question_paper: List[UploadFile] = File(...),
    current_user: Dict[str, Any] = Depends(require_branch_manager),
    db: Session = Depends(get_db)
):
    """
    Branch Manager or Root Admin uploads or replaces Question Paper post-creation.
    """
    exam = db.scalar(select(Exam).where(Exam.id == exam_id))
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    if current_user.get("role") == "BRANCH_MANAGER" and exam.branch_id:
        if exam.branch_id != current_user.get("branch_id"):
            raise HTTPException(status_code=403, detail="Forbidden: exam belongs to another branch.")

    exam_uploads_dir = settings.UPLOADS_DIR / f"exam_{exam_id}"
    exam_uploads_dir.mkdir(parents=True, exist_ok=True)

    saved_qp_paths = []
    for idx, qpf in enumerate(question_paper):
        ext = Path(qpf.filename).suffix or ".jpg"
        saved_part = exam_uploads_dir / f"qp_part_{idx+1}{ext}"
        with open(saved_part, "wb") as f_out:
            shutil.copyfileobj(qpf.file, f_out)
        valid, msg = pdf_service.validate_file(saved_part)
        if not valid:
            raise HTTPException(status_code=400, detail=f"Question paper error: {msg}")
        saved_qp_paths.append(saved_part)

    qp_pdf = exam_uploads_dir / "question_paper.pdf"
    qp_path = pdf_service.files_to_canonical_pdf(saved_qp_paths, qp_pdf)
    now = get_iso_now()
    storage_key = f"exams/{exam_id}/question_paper.pdf"
    try:
        storage = get_storage_service()
        storage.upload_file(qp_pdf, storage_key)
    except Exception as e:
        logger.warning(f"Failed to sync question paper to storage: {e}")

    exam.question_paper_path = storage_key
    exam.updated_at = now
    db.commit()

    return {
        "status": "question_paper_uploaded",
        "exam_id": exam_id,
        "question_paper_path": storage_key,
    }


@router.post("/{exam_id}/generate-rubric")
def generate_rubric(
    exam_id: str,
    current_user: Dict[str, Any] = Depends(require_root_admin),
    db: Session = Depends(get_db)
):
    """
    Root Admin triggers draft rubric generation via Gemini Multimodal AI.
    Requires at least answer_key_path to be uploaded.
    """
    exam = db.scalar(select(Exam).where(Exam.id == exam_id))
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    ak_raw = exam.answer_key_path
    if not ak_raw:
        raise HTTPException(status_code=400, detail="Cannot generate rubric: Answer Key has not been uploaded yet.")

    storage = get_storage_service()
    ak_path = None
    if Path(ak_raw).exists() and Path(ak_raw).is_file():
        ak_path = Path(ak_raw)
    else:
        for k in [ak_raw, f"exams/{exam_id}/answer_key.pdf", f"exam_{exam_id}/answer_key.pdf"]:
            try:
                if storage.file_exists(k):
                    ak_path = storage.get_local_path_or_download(k)
                    break
            except Exception:
                continue

    if not ak_path or not ak_path.exists():
        raise HTTPException(status_code=400, detail="Cannot generate rubric: Answer Key could not be accessed.")

    qp_raw = exam.question_paper_path
    qp_path = ak_path
    if qp_raw:
        if Path(qp_raw).exists() and Path(qp_raw).is_file():
            qp_path = Path(qp_raw)
        else:
            for k in [qp_raw, f"exams/{exam_id}/question_paper.pdf", f"exam_{exam_id}/question_paper.pdf"]:
                try:
                    if storage.file_exists(k):
                        qp_path = storage.get_local_path_or_download(k)
                        break
                except Exception:
                    continue

    from backend.app.gemini.client import gemini_client
    draft_rubric, _ = gemini_client.extract_exam_rubric(
        exam_id=exam_id,
        question_paper_path=qp_path,
        answer_key_path=ak_path,
        extra_notes=f"Subject: {exam.subject or ''}"
    )

    version_id = f"rub_{uuid.uuid4().hex[:12]}"
    now = get_iso_now()
    rubric_total = getattr(draft_rubric, "total_marks", getattr(draft_rubric, "total_exam_marks", None))
    if rubric_total is None or rubric_total == 0.0:
        rubric_total = sum(getattr(q, "max_marks", 0.0) for q in getattr(draft_rubric, "questions", [])) or 0.0
    total_marks = float(rubric_total)

    v_count = db.scalar(select(func.count(RubricVersion.id)).where(RubricVersion.exam_id == exam_id)) or 0
    v_num = v_count + 1

    rubric_row = RubricVersion(
        id=version_id,
        exam_id=exam_id,
        version_num=v_num,
        is_approved=0,
        rubric_data=draft_rubric.model_dump_json(),
        created_at=now,
    )
    db.add(rubric_row)

    exam.total_marks = total_marks
    exam.current_rubric_version_id = version_id
    exam.lifecycle_status = "EVALUATION_READY"
    exam.updated_at = now
    db.commit()

    return {
        "status": "draft_rubric_generated",
        "exam_id": exam_id,
        "rubric_version_id": version_id,
        "is_approved": False,
        "rubric_data": draft_rubric.model_dump(),
    }


@router.post("/{exam_id}/rubric/approve")
def approve_rubric(
    exam_id: str,
    req: RubricApproveRequest,
    current_user: Dict[str, Any] = Depends(require_root_admin),
    db: Session = Depends(get_db)
):
    """
    Root Admin locks the examination rubric version.
    Creates an immutable approved rubric record.
    """
    exam = db.scalar(select(Exam).where(Exam.id == exam_id))
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    now = get_iso_now()
    version_id = f"rub_{uuid.uuid4().hex[:12]}"

    v_count = db.scalar(select(func.count(RubricVersion.id)).where(RubricVersion.exam_id == exam_id)) or 0
    v_num = v_count + 1

    rubric_row = RubricVersion(
        id=version_id,
        exam_id=exam_id,
        version_num=v_num,
        is_approved=1,
        approved_by=current_user["sub"],
        approved_at=now,
        rubric_data=req.rubric_data.model_dump_json(),
        created_at=now,
    )
    db.add(rubric_row)

    exam.current_rubric_version_id = version_id
    exam.total_marks = req.rubric_data.total_exam_marks
    exam.status = "RUBRIC_APPROVED"
    exam.lifecycle_status = "EVALUATION_READY"
    exam.updated_at = now

    audit = AuditLog(
        id=f"aud_{uuid.uuid4().hex[:12]}",
        user_id=current_user["sub"],
        action="APPROVE_RUBRIC",
        resource_type="EXAM",
        resource_id=exam_id,
        details_json=f'{{"version_num": {v_num}, "total_marks": {req.rubric_data.total_exam_marks}}}',
        created_at=now,
    )
    db.add(audit)
    db.commit()

    return exam_service.get_exam(exam_id)


@router.post("/{exam_id}/start-evaluation")
def start_evaluation(
    exam_id: str,
    current_user: Dict[str, Any] = Depends(require_root_admin),
    db: Session = Depends(get_db)
):
    """
    Root Admin alone triggers evaluation queue.
    Strictly verifies all 4 invariants:
    1. Submission window is closed.
    2. Answer key is uploaded.
    3. Rubric is approved.
    4. Explicit Root Admin action.
    """
    exam = db.scalar(select(Exam).where(Exam.id == exam_id))
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    # 1. Window closed check
    window = db.scalar(
        select(SubmissionWindow)
        .where(SubmissionWindow.exam_id == exam_id)
        .order_by(SubmissionWindow.created_at.desc())
        .limit(1)
    )
    now = datetime.now(timezone.utc)
    if window and window.status == "OPEN":
        grace_deadline = datetime.fromisoformat(window.grace_deadline_at.replace("Z", "+00:00"))
        if now <= grace_deadline:
            raise HTTPException(
                status_code=400,
                detail="Cannot start evaluation: submission window is still active."
            )

    # 2. Answer key check
    if not exam.answer_key_path:
        raise HTTPException(status_code=400, detail="Cannot start evaluation: answer key has not been uploaded.")

    # 3. Approved rubric check
    rubric = None
    if exam.current_rubric_version_id:
        rubric = db.scalar(
            select(RubricVersion)
            .where(RubricVersion.id == exam.current_rubric_version_id, RubricVersion.is_approved == 1)
        )
    if not rubric:
        raise HTTPException(status_code=400, detail="Cannot start evaluation: no approved rubric exists for this exam.")

    # 4. Enqueue all active submissions (including previously failed ones)
    subs_to_grade = db.scalars(
        select(Submission)
        .where(
            Submission.exam_id == exam_id,
            Submission.submission_status == "SUBMITTED",
            Submission.status.in_(["UPLOADED", "AWAITING_KEY", "AWAITING_RUBRIC", "QUEUED", "FAILED"])
        )
        .order_by(Submission.roll_number.asc(), Submission.created_at.asc())
    ).all()

    now_iso = get_iso_now()
    enqueued_count = 0
    for sub in subs_to_grade:
        queue_id = f"q_{uuid.uuid4().hex[:12]}"
        db.add(EvaluationQueue(
            id=queue_id,
            submission_id=sub.id,
            exam_id=exam_id,
            priority=100,
            status="QUEUED",
            created_at=now_iso,
            updated_at=now_iso,
        ))
        sub.status = "QUEUED"
        sub.error_message = None
        sub.retry_count = 0
        sub.updated_at = now_iso
        enqueued_count += 1

    exam.lifecycle_status = "EVALUATING"
    exam.status = "EVALUATING"
    exam.updated_at = now_iso

    audit = AuditLog(
        id=f"aud_{uuid.uuid4().hex[:12]}",
        user_id=current_user["sub"],
        action="START_EVALUATION",
        resource_type="EXAM",
        resource_id=exam_id,
        details_json=f'{{"enqueued_papers": {enqueued_count}}}',
        created_at=now_iso,
    )
    db.add(audit)
    db.commit()

    return {
        "status": "evaluation_started",
        "exam_id": exam_id,
        "enqueued_papers": enqueued_count,
    }


@router.post("/{exam_id}/publish")
@router.post("/{exam_id}/publish-results")
def publish_results(
    exam_id: str,
    background_tasks: BackgroundTasks,
    current_user: Dict[str, Any] = Depends(require_root_admin),
    db: Session = Depends(get_db)
):
    """
    Root Admin explicitly publishes results.
    Decoupled state: marks, breakdowns, and graded PDFs become visible to students.
    Triggers in-app inbox notification delivery via FastAPI BackgroundTasks.
    """
    exam = db.scalar(select(Exam).where(Exam.id == exam_id))
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    now = get_iso_now()
    retention_expiry = RetentionService.calculate_retention_expiry(now, settings.SUBMISSION_RETENTION_DAYS)

    # Publish all graded submissions and set retention expiry
    subs = db.scalars(
        select(Submission)
        .where(
            Submission.exam_id == exam_id,
            Submission.submission_status == "SUBMITTED",
            Submission.status.in_(["GRADED", "REVIEWED", "COMPLETED", "NEEDS_REVIEW"])
        )
    ).all()

    for s in subs:
        s.publication_status = "PUBLISHED"
        s.graded_at = s.graded_at or now
        s.ttl_days = s.ttl_days or 15
        s.retention_expires_at = s.retention_expires_at or retention_expiry
        s.updated_at = now

    published_subs_count = len(subs)

    exam.is_published = 1
    exam.published_at = now
    exam.lifecycle_status = "PUBLISHED"
    exam.status = "PUBLISHED"
    exam.retention_expires_at = exam.retention_expires_at or retention_expiry
    exam.is_document_purged = 0
    exam.updated_at = now

    audit = AuditLog(
        id=f"aud_{uuid.uuid4().hex[:12]}",
        user_id=current_user["sub"],
        action="PUBLISH_RESULTS",
        resource_type="EXAM",
        resource_id=exam_id,
        details_json=f'{{"published_papers": {published_subs_count}}}',
        created_at=now,
    )
    db.add(audit)
    db.commit()

    background_tasks.add_task(
        background_dispatch_results_published,
        exam_id=exam_id,
        exam_title=exam.title,
        branch_id=exam.branch_id,
        published_subs_count=published_subs_count,
        publisher_role=current_user.get("role", "ROOT_ADMIN"),
        publisher_id=current_user["sub"],
    )

    return {
        "status": "success",
        "exam_id": exam_id,
        "is_published": True,
        "published_at": now,
        "published_submissions_count": published_subs_count,
    }


@router.post("/{exam_id}/rubric/unlock")
def unlock_rubric(
    exam_id: str,
    current_user: Dict[str, Any] = Depends(require_root_admin),
    db: Session = Depends(get_db)
):
    """Root Admin unlocks rubric to draft status."""
    exam = db.scalar(select(Exam).where(Exam.id == exam_id))
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    now = get_iso_now()
    db.execute(
        update(RubricVersion).where(RubricVersion.exam_id == exam_id).values(is_approved=0)
    )
    exam.status = "RUBRIC_DRAFT"
    exam.lifecycle_status = "SETUP"
    exam.updated_at = now

    audit = AuditLog(
        id=f"aud_{uuid.uuid4().hex[:12]}",
        user_id=current_user["sub"],
        action="UNLOCK_RUBRIC",
        resource_type="EXAM",
        resource_id=exam_id,
        details_json='{"action": "unlocked_to_draft"}',
        created_at=now,
    )
    db.add(audit)
    db.commit()

    return exam_service.get_exam(exam_id)


@router.post("/load-sample")
def load_sample_exam(
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Creates or seeds a sample Physics exam for demo/pilot preview."""
    now = get_iso_now()
    sample_id = "exam_sample_physics"
    existing = db.scalar(select(Exam.id).where(Exam.id == sample_id))
    if not existing:
        sample_exam = Exam(
            id=sample_id,
            title="Physics Mid-Term Exam (Sample)",
            subject="Physics",
            total_marks=50.0,
            status="RUBRIC_APPROVED",
            lifecycle_status="PUBLISHED",
            is_published=1,
            created_at=now,
            updated_at=now,
        )
        db.add(sample_exam)
        db.commit()

    return {
        "exam_id": sample_id,
        "batch_id": "batch_sample",
        "message": "Sample Physics exam loaded successfully.",
    }


def _resolve_exam_artifact_pdf(exam_id: str, artifact_type: str) -> Optional[Path]:
    """Resolves local Path for question-paper or answer-key."""
    exam = exam_service.get_exam(exam_id)
    if not exam:
        return None

    is_qp = "question" in artifact_type.lower()
    raw_path = exam.get("question_paper_path") if is_qp else exam.get("answer_key_path")
    filename = "question_paper.pdf" if is_qp else "answer_key.pdf"

    candidates = []
    if raw_path:
        candidates.append(raw_path)

    candidates.append(str(settings.UPLOADS_DIR / f"exam_{exam_id}" / filename))

    for cand in candidates:
        cand_path = Path(cand)
        if cand_path.exists() and cand_path.is_file():
            return cand_path

    storage = get_storage_service()
    storage_keys = []
    if raw_path:
        clean_raw = str(raw_path).replace("\\", "/").strip().lstrip("/")
        storage_keys.append(clean_raw)
        for marker in ["/exams/", "/submissions/", "/uploads/", "/data/"]:
            if marker in clean_raw:
                storage_keys.append(clean_raw[clean_raw.index(marker) + len(marker):])

    artifact_dir = "question_paper" if is_qp else "answer_key"
    storage_keys.extend([
        f"exams/{exam_id}/{filename}",
        f"exams/{exam_id}/{artifact_dir}",
        f"exam_{exam_id}/{filename}",
        f"uploads/exam_{exam_id}/{filename}",
    ])

    for key in storage_keys:
        try:
            if storage.file_exists(key):
                local_path = storage.get_local_path_or_download(key)
                if local_path and local_path.exists():
                    return local_path
        except Exception as e:
            logger.warning(f"Failed fetching key {key}: {e}")
            continue

    pkg_dir = Path(__file__).resolve().parent.parent.parent
    sample_sub = "question_paper.pdf" if is_qp else "answer_key.pdf"
    sample_candidates = [
        Path(f"backend/sample_data/sample_exam/{sample_sub}"),
        pkg_dir / "sample_data" / "sample_exam" / sample_sub,
        pkg_dir / "backend" / "sample_data" / "sample_exam" / sample_sub,
        Path.cwd() / "backend" / "sample_data" / "sample_exam" / sample_sub,
        Path.cwd() / "sample_data" / "sample_exam" / sample_sub,
    ]
    for s_path in sample_candidates:
        if s_path.exists() and s_path.is_file():
            return s_path

    return None


@router.get("/{exam_id}/question-paper")
async def get_exam_question_paper(
    exam_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    exam = exam_service.get_exam(exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    if exam.get("is_document_purged"):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Document unavailable: Question paper was permanently purged in accordance with the 15-day storage retention policy."
        )

    if current_user.get("role") == "STUDENT" and not exam.get("is_published"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Question paper is available to students once exam results are published."
        )

    pdf_path = _resolve_exam_artifact_pdf(exam_id, "question-paper")
    if not pdf_path or not pdf_path.exists():
        raise HTTPException(status_code=404, detail="Question paper document not found.")

    return FileResponse(
        str(pdf_path),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="question_paper_{exam_id}.pdf"'}
    )


@router.get("/{exam_id}/answer-key")
async def get_exam_answer_key(
    exam_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    exam = exam_service.get_exam(exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    if exam.get("is_document_purged"):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Document unavailable: Official answer key was permanently purged in accordance with the 15-day storage retention policy."
        )

    if current_user.get("role") == "STUDENT" and not exam.get("is_published"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Official answer key is confidential until exam results are published."
        )

    pdf_path = _resolve_exam_artifact_pdf(exam_id, "answer-key")
    if not pdf_path or not pdf_path.exists():
        raise HTTPException(status_code=404, detail="Answer key document not found.")

    return FileResponse(
        str(pdf_path),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="answer_key_{exam_id}.pdf"'}
    )


@router.get("/{exam_id}/{artifact_type}/meta")
async def get_exam_artifact_meta(
    exam_id: str,
    artifact_type: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    clean_art = artifact_type.lower().replace("_", "-")
    if clean_art not in ["question-paper", "answer-key"]:
        raise HTTPException(status_code=400, detail="Invalid artifact type. Must be question-paper or answer-key.")

    exam = exam_service.get_exam(exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    if exam.get("is_document_purged"):
        return {
            "exam_id": exam_id,
            "artifact_type": clean_art,
            "has_document": False,
            "is_purged": True,
            "page_count": 0,
            "title": exam.get("title", ""),
            "notice": "Document permanently purged in accordance with the 15-day retention policy."
        }

    if current_user.get("role") == "STUDENT" and not exam.get("is_published"):
        raise HTTPException(status_code=403, detail="Official examination documents are confidential until results are published.")

    pdf_path = _resolve_exam_artifact_pdf(exam_id, clean_art)
    if not pdf_path or not pdf_path.exists():
        return {
            "exam_id": exam_id,
            "artifact_type": clean_art,
            "has_document": False,
            "is_purged": False,
            "page_count": 0,
            "title": exam.get("title", "")
        }

    render_key = f"exam_{exam_id}_{clean_art}"
    render_dir = settings.RENDERS_DIR / render_key
    page_1 = render_dir / "page_1.png"

    doc = fitz.open(str(pdf_path))
    page_count = len(doc)
    doc.close()

    if not page_1.exists():
        pdf_service.render_pdf_pages_to_images(pdf_path, render_key)

    return {
        "exam_id": exam_id,
        "artifact_type": clean_art,
        "has_document": True,
        "is_purged": False,
        "page_count": page_count,
        "title": exam.get("title", ""),
        "subject": exam.get("subject", "")
    }


@router.get("/{exam_id}/{artifact_type}/pages/{page_num}")
async def get_exam_artifact_page_image(
    exam_id: str,
    artifact_type: str,
    page_num: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    clean_art = artifact_type.lower().replace("_", "-")
    if clean_art not in ["question-paper", "answer-key"]:
        raise HTTPException(status_code=400, detail="Invalid artifact type.")

    exam = exam_service.get_exam(exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    if exam.get("is_document_purged"):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Document page unavailable: Permanently purged after 15 days."
        )

    if current_user and isinstance(current_user, dict) and current_user.get("role") == "STUDENT" and not exam.get("is_published"):
        raise HTTPException(status_code=403, detail="Official examination documents are confidential until results are published.")

    render_key = f"exam_{exam_id}_{clean_art}"
    render_dir = settings.RENDERS_DIR / render_key
    img_path = render_dir / f"page_{page_num}.png"

    if not img_path.exists():
        pdf_path = _resolve_exam_artifact_pdf(exam_id, clean_art)
        if not pdf_path or not pdf_path.exists():
            raise HTTPException(status_code=404, detail="Document not found.")
        pdf_service.render_pdf_pages_to_images(pdf_path, render_key)

    if not img_path.exists():
        raise HTTPException(status_code=404, detail=f"Page {page_num} not found.")

    return FileResponse(
        str(img_path),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=604800, immutable"}
    )


@router.delete("/{exam_id}")
async def delete_exam(
    exam_id: str,
    current_user: Dict[str, Any] = Depends(require_branch_manager),
    db: Session = Depends(get_db)
):
    """
    Permanently delete an examination, all student answer sheets (from DB and CDN/storage),
    evaluation scores, criteria, answers, revaluations, and submission windows.
    Enforces branch tenancy: Branch Manager can only delete exams in their assigned branch.
    """
    storage = get_storage_service()

    exam = db.scalar(select(Exam).where(Exam.id == exam_id))
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    # Tenancy enforcement
    if current_user.get("role") == "BRANCH_MANAGER":
        if exam.branch_id != current_user.get("branch_id"):
            raise HTTPException(status_code=403, detail="Forbidden: You can only delete exams belonging to your branch.")

    exam_title = exam.title

    # Fetch submissions to delete files
    subs = db.scalars(select(Submission).where(Submission.exam_id == exam_id)).all()

    # Cloud & Local file cleanup outside DB transaction
    deleted_files_count = 0
    for sub in subs:
        sub_id = sub.id
        for path_key in [sub.original_file_path, sub.canonical_pdf_path, sub.annotated_pdf_path]:
            if path_key:
                try:
                    storage.delete_file(path_key)
                    deleted_files_count += 1
                except Exception as e:
                    logger.warning(f"Failed to delete storage file {path_key}: {e}")

        local_sub_dir = settings.DATA_DIR / "uploads" / "submissions" / sub_id
        if local_sub_dir.exists():
            shutil.rmtree(local_sub_dir, ignore_errors=True)
        render_sub_dir = settings.RENDERS_DIR / f"sub_{sub_id}"
        if render_sub_dir.exists():
            shutil.rmtree(render_sub_dir, ignore_errors=True)
        annotated_pdf = settings.EXPORTS_DIR / f"{sub_id}_annotated.pdf"
        if annotated_pdf.exists():
            try:
                annotated_pdf.unlink()
            except Exception:
                pass

    for art_key in [
        exam.question_paper_path,
        exam.answer_key_path,
        f"exams/{exam_id}/question_paper.pdf",
        f"exams/{exam_id}/answer_key.pdf",
    ]:
        if art_key:
            try:
                storage.delete_file(art_key)
                deleted_files_count += 1
            except Exception:
                pass

    local_exam_dir = settings.UPLOADS_DIR / f"exam_{exam_id}"
    if local_exam_dir.exists():
        shutil.rmtree(local_exam_dir, ignore_errors=True)

    for clean_art in ["question-paper", "answer-key"]:
        r_dir = settings.RENDERS_DIR / f"exam_{exam_id}_{clean_art}"
        if r_dir.exists():
            shutil.rmtree(r_dir, ignore_errors=True)

    # Atomic DB cleanup via ORM
    sub_ids = [s.id for s in subs]
    if sub_ids:
        ans_ids = db.scalars(select(Answer.id).where(Answer.submission_id.in_(sub_ids))).all()
        if ans_ids:
            db.execute(delete(CriterionScore).where(CriterionScore.answer_id.in_(ans_ids)))
            db.execute(delete(AnswerRegion).where(AnswerRegion.answer_id.in_(ans_ids)))
        db.execute(delete(Answer).where(Answer.submission_id.in_(sub_ids)))

    db.execute(delete(EvaluationQueue).where(EvaluationQueue.exam_id == exam_id))
    db.execute(delete(RevaluationRequest).where(RevaluationRequest.exam_id == exam_id))
    db.execute(delete(ApiUsageEvent).where(ApiUsageEvent.exam_id == exam_id))
    db.execute(delete(ExperimentBenchmark).where(ExperimentBenchmark.exam_id == exam_id))
    db.execute(delete(SubmissionWindow).where(SubmissionWindow.exam_id == exam_id))
    db.execute(delete(RubricVersion).where(RubricVersion.exam_id == exam_id))
    db.execute(delete(ExamBatch).where(ExamBatch.exam_id == exam_id))
    db.execute(delete(Submission).where(Submission.exam_id == exam_id))

    db.execute(
        update(Batch)
        .where(Batch.exam_id == exam_id)
        .values(exam_id=None, total_submissions=0, completed_submissions=0, failed_submissions=0)
    )

    db.execute(delete(Notification).where(Notification.link_url.like(f"%{exam_id}%")))
    db.execute(delete(AuditLog).where(AuditLog.resource_id == exam_id))

    db.delete(exam)
    db.commit()

    logger.info(f"Exam '{exam_title}' ({exam_id}) completely purged by {current_user.get('email')}.")

    return {
        "success": True,
        "message": f"Exam '{exam_title}' and all associated submissions, scores, and cloud files have been permanently deleted.",
        "exam_id": exam_id,
        "deleted_submissions_count": len(subs),
        "deleted_files_count": deleted_files_count,
    }


@router.get("/{exam_id}/rankings")
def get_exam_rankings(
    exam_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Return dense-ranked student leaderboard for an exam.
    Supports both student PWA access and faculty marks inspection.
    
    Privacy Rules for Students:
    - Only returns submissions once results are published.
    - Excludes roll numbers (privacy protected).
    - Uses dense ranking (1, 1, 2, 3...) to avoid skipping places on ties.
    - Flags is_current_student for the requesting student.
    """
    exam = db.scalar(select(Exam).where(Exam.id == exam_id))
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    user_role = current_user.get("role", "STUDENT")
    is_student = user_role == "STUDENT"
    caller_user_id = current_user.get("sub") or current_user.get("id")

    # Match student identity
    student_record = None
    caller_roll = current_user.get("roll_number") or ""
    if is_student:
        student_record = db.scalar(select(Student).where(Student.user_id == caller_user_id))
        if student_record:
            caller_roll = student_record.roll_number or caller_roll

    # Base query for evaluated submissions
    stmt = (
        select(Submission)
        .where(
            Submission.exam_id == exam_id,
            Submission.submission_status == 'SUBMITTED',
            Submission.total_awarded_marks.isnot(None),
            Submission.status != 'FAILED'
        )
    )

    is_exam_published = bool(
        exam.status == 'PUBLISHED' 
        or exam.lifecycle_status == 'PUBLISHED' 
        or getattr(exam, 'is_published', 0) == 1
    )

    is_privileged = user_role in ["ROOT_ADMIN", "ADMIN", "TEACHER", "FACULTY"]

    # The ranking system must NOT be visible to students until the exam is officially published
    if not is_privileged and not is_exam_published:
        return {
            "exam_id": exam_id,
            "exam_title": exam.title,
            "subject": exam.subject,
            "is_published": False,
            "total_students": 0,
            "stats": {
                "total_students": 0,
                "top_score": 0,
                "class_mean": 0,
                "max_marks": float(exam.total_marks or 25)
            },
            "rankings": [],
            "message": "Class rankings will be visible once exam evaluation is published by faculty."
        }

    # Sort descending by awarded marks, then by percentage
    sorted_subs = sorted(
        subs,
        key=lambda s: (float(s.total_awarded_marks or 0), float(s.percentage or 0)),
        reverse=True
    )

    # Compute Dense Rank:
    # Tied scores share the exact same rank.
    # The subsequent distinct score gets rank + 1 (dense ranking: 1, 1, 2, 3...)
    rankings = []
    current_dense_rank = 1
    prev_score = None
    effective_max = float(exam.total_marks or 25)

    for idx, s in enumerate(sorted_subs):
        score = round(float(s.total_awarded_marks or 0), 1)
        if prev_score is not None and abs(score - prev_score) > 0.001:
            current_dense_rank += 1
        prev_score = score

        is_you = False
        if is_student:
            if (student_record and s.student_id == student_record.id) or \
               (caller_roll and s.roll_number and s.roll_number.strip().lower() == caller_roll.strip().lower()) or \
               (str(s.student_id) == str(caller_user_id)):
                is_you = True

        sub_max = float(s.max_marks or effective_max)
        pct = round(float(s.percentage if s.percentage is not None else ((score / sub_max) * 100)), 1)

        item: Dict[str, Any] = {
            "id": s.id,
            "rank": current_dense_rank,
            "student_name": s.student_name or f"Student {idx + 1}",
            "score": score,
            "total_awarded_marks": score,
            "max_marks": sub_max,
            "percentage": pct,
            "is_current_student": is_you,
        }

        # Include roll_number ONLY for staff/faculty, NEVER for student view
        if not is_student:
            item["roll_number"] = s.roll_number

        rankings.append(item)

    scores_list = [r["score"] for r in rankings]
    stats = {
        "total_students": len(rankings),
        "top_score": rankings[0]["score"] if rankings else 0,
        "class_mean": round(sum(scores_list) / len(scores_list), 1) if scores_list else 0,
        "max_marks": effective_max
    }

    return {
        "exam_id": exam_id,
        "exam_title": exam.title,
        "subject": exam.subject,
        "is_published": is_exam_published or len(rankings) > 0,
        "total_students": len(rankings),
        "stats": stats,
        "rankings": rankings
    }
