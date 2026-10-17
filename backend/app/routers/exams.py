import uuid
import shutil
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, status
from fastapi.responses import FileResponse, Response
import fitz

logger = logging.getLogger(__name__)

from backend.app.config import settings
from backend.app.database import get_db, get_iso_now
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
    send_notification,
    notify_branch_students,
    notify_branch_managers,
    notify_root_admins,
    get_branch_name,
)
from backend.app.services.retention_service import RetentionService

router = APIRouter(tags=["Exams, Rubrics & Publication"])

@router.get("")
def list_exams(
    branch_id: Optional[str] = None,
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)
):
    user_role = current_user.get("role") if current_user else "ROOT_ADMIN"
    user_branch = current_user.get("branch_id") if current_user else None
    
    with get_db() as conn:
        cursor = conn.cursor()
        base_query = """
            SELECT e.*, 
                   COALESCE(i.id, b.institute_id) as institute_id,
                   COALESCE(i.name, ib.name) as institute_name,
                   COALESCE(i.code, ib.code) as institute_code,
                   b.name as branch_name, 
                   b.code as branch_code, 
                   b.city as branch_city,
                   COALESCE((
                       SELECT rv.is_approved 
                       FROM rubric_versions rv 
                       WHERE rv.exam_id = e.id 
                       ORDER BY rv.is_approved DESC, rv.version_num DESC 
                       LIMIT 1
                   ), 0) as is_rubric_approved
            FROM exams e
            LEFT JOIN branches b ON e.branch_id = b.id
            LEFT JOIN institutes i ON e.institute_id = i.id
            LEFT JOIN institutes ib ON b.institute_id = ib.id
        """
        if user_role == "BRANCH_MANAGER" and user_branch:
            cursor.execute(base_query + " WHERE e.branch_id = ? ORDER BY e.created_at DESC", (user_branch,))
        elif branch_id:
            cursor.execute(base_query + " WHERE e.branch_id = ? ORDER BY e.created_at DESC", (branch_id,))
        else:
            cursor.execute(base_query + " ORDER BY e.created_at DESC")
        return [dict(r) for r in cursor.fetchall()]

@router.get("/{exam_id}")
def get_exam(exam_id: str, current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)):
    exam = exam_service.get_exam(exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    
    # If student, mask answer key and rubric until published
    if current_user and current_user.get("role") == "STUDENT":
        if not exam.get("is_published"):
            exam["answer_key_path"] = None
            exam["rubric_version"] = None
    return exam

@router.post("")
async def create_exam(
    title: str = Form(...),
    subject: str = Form(...),
    branch_id: Optional[str] = Form(None),
    question_paper: Optional[List[UploadFile]] = File(None),
    current_user: Dict[str, Any] = Depends(require_branch_manager)
):
    """
    Create exam (Root Admin or Branch Manager).
    Branch Manager creates within their branch.
    Answer key is NOT uploaded here (Answer keys are strictly Root Admin only).
    """
    exam_id = f"exam_{uuid.uuid4().hex[:12]}"
    effective_branch = current_user.get("branch_id") if current_user.get("role") == "BRANCH_MANAGER" else branch_id
    
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
    
    created_exam = exam_service.create_exam(
        title=title.strip(),
        subject=subject.strip(),
        question_paper_path=Path(qp_path) if qp_path else None,
        answer_key_path=None, # Answer key strictly uploaded later by Root Admin
        extra_notes=""
    )
    exam_id = created_exam["id"]
    created_exam["branch_id"] = effective_branch
    
    # Update branch affiliation and dispatch notifications
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE exams SET branch_id = ?, created_by = ? WHERE id = ?", (effective_branch, current_user["sub"], exam_id))
        
        # 1. Notify all students enrolled in this branch
        notify_branch_students(
            cursor=cursor,
            branch_id=effective_branch,
            notif_type="EXAM_CREATED",
            title="New Exam Scheduled",
            message=f"A new examination '{title.strip()}' ({subject.strip()}) has been scheduled for your branch.",
            link_url="/student/portal"
        )
        
        # 2. Scoped Branch Manager & Root Admin notifications
        if current_user.get("role") == "BRANCH_MANAGER":
            branch_name = get_branch_name(cursor, effective_branch)
            notify_root_admins(
                cursor=cursor,
                notif_type="EXAM_CREATED",
                title="Branch Exam Created",
                message=f"Branch '{branch_name}' created exam '{title.strip()}' ({subject.strip()}). Awaiting answer key upload.",
                link_url=f"/exams",
                exclude_user_id=current_user["sub"]
            )
        elif current_user.get("role") == "ROOT_ADMIN" and effective_branch:
            # Root Admin created an exam for a specific branch -> notify that branch's manager
            notify_branch_managers(
                cursor=cursor,
                branch_id=effective_branch,
                notif_type="EXAM_CREATED",
                title="New Exam Assigned to Branch",
                message=f"Root Administration scheduled exam '{title.strip()}' ({subject.strip()}) for your branch.",
                link_url=f"/exams",
                exclude_user_id=current_user["sub"]
            )
    
    return created_exam

@router.post("/{exam_id}/answer-key")
async def upload_answer_key(
    exam_id: str,
    answer_key: List[UploadFile] = File(...),
    current_user: Dict[str, Any] = Depends(require_root_admin)
):
    """
    Root Admin alone uploads answer key.
    Triggers draft rubric generation via Gemini, but DOES NOT auto-approve or auto-grade.
    """
    exam = exam_service.get_exam(exam_id)
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
    qp_raw = exam.get("question_paper_path")
    qp_path = Path(qp_raw) if qp_raw and Path(qp_raw).exists() else ak_pdf
    
    draft_rubric, _ = gemini_client.extract_exam_rubric(
        exam_id=exam_id,
        question_paper_path=qp_path,
        answer_key_path=ak_pdf,
        extra_notes=f"Subject: {exam.get('subject', '')}"
    )
    
    # Save draft rubric version (is_approved = 0)
    now = get_iso_now()
    version_id = f"rub_{uuid.uuid4().hex[:12]}"
    total_marks = getattr(draft_rubric, "total_marks", getattr(draft_rubric, "total_exam_marks", 100.0))
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO rubric_versions (id, exam_id, version_num, is_approved, rubric_data, created_at)
            VALUES (?, ?, 1, 0, ?, ?)
        """, (version_id, exam_id, draft_rubric.model_dump_json(), now))
        
        cursor.execute("""
            UPDATE exams 
            SET answer_key_path = ?, total_marks = ?, current_rubric_version_id = ?,
                lifecycle_status = 'EVALUATION_READY', updated_at = ?
            WHERE id = ?
        """, (storage_key, total_marks, version_id, now, exam_id))
    
    return {
        "status": "draft_rubric_generated",
        "exam_id": exam_id,
        "rubric_version_id": version_id,
        "is_approved": False,
        "rubric_data": draft_rubric.model_dump()
    }

@router.post("/{exam_id}/question-paper")
async def upload_question_paper(
    exam_id: str,
    question_paper: List[UploadFile] = File(...),
    current_user: Dict[str, Any] = Depends(require_branch_manager)
):
    """
    Branch Manager or Root Admin uploads or replaces Question Paper post-creation.
    """
    exam = exam_service.get_exam(exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
        
    if current_user.get("role") == "BRANCH_MANAGER" and exam.get("branch_id"):
        if exam["branch_id"] != current_user.get("branch_id"):
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
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE exams SET question_paper_path = ?, updated_at = ? WHERE id = ?", (storage_key, now, exam_id))
        
    return {
        "status": "question_paper_uploaded",
        "exam_id": exam_id,
        "question_paper_path": storage_key
    }

@router.post("/{exam_id}/generate-rubric")
def generate_rubric(
    exam_id: str,
    current_user: Dict[str, Any] = Depends(require_root_admin)
):
    """
    Root Admin triggers draft rubric generation via Gemini Multimodal AI.
    Requires at least answer_key_path to be uploaded.
    """
    exam = exam_service.get_exam(exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
        
    ak_raw = exam.get("answer_key_path")
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
        
    qp_raw = exam.get("question_paper_path")
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
        extra_notes=f"Subject: {exam.get('subject', '')}"
    )
    
    now = get_iso_now()
    version_id = f"rub_{uuid.uuid4().hex[:12]}"
    total_marks = getattr(draft_rubric, "total_marks", getattr(draft_rubric, "total_exam_marks", 100.0))
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as cnt FROM rubric_versions WHERE exam_id = ?", (exam_id,))
        v_num = (cursor.fetchone()["cnt"] or 0) + 1
        
        cursor.execute("""
            INSERT INTO rubric_versions (id, exam_id, version_num, is_approved, rubric_data, created_at)
            VALUES (?, ?, ?, 0, ?, ?)
        """, (version_id, exam_id, v_num, draft_rubric.model_dump_json(), now))
        
        cursor.execute("""
            UPDATE exams 
            SET total_marks = ?, current_rubric_version_id = ?,
                lifecycle_status = 'EVALUATION_READY', updated_at = ?
            WHERE id = ?
        """, (total_marks, version_id, now, exam_id))
        
    return {
        "status": "draft_rubric_generated",
        "exam_id": exam_id,
        "rubric_version_id": version_id,
        "is_approved": False,
        "rubric_data": draft_rubric.model_dump()
    }

@router.post("/{exam_id}/rubric/approve")
def approve_rubric(
    exam_id: str,
    req: RubricApproveRequest,
    current_user: Dict[str, Any] = Depends(require_root_admin)
):
    """
    Root Admin locks the examination rubric version.
    Creates an immutable approved rubric record.
    """
    exam = exam_service.get_exam(exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    
    now = get_iso_now()
    version_id = f"rub_{uuid.uuid4().hex[:12]}"
    
    with get_db() as conn:
        cursor = conn.cursor()
        # Count prior versions
        cursor.execute("SELECT COUNT(*) as cnt FROM rubric_versions WHERE exam_id = ?", (exam_id,))
        v_num = cursor.fetchone()["cnt"] + 1
        
        cursor.execute("""
            INSERT INTO rubric_versions (id, exam_id, version_num, is_approved, approved_by, approved_at, rubric_data, created_at)
            VALUES (?, ?, ?, 1, ?, ?, ?, ?)
        """, (version_id, exam_id, v_num, current_user["sub"], now, req.rubric_data.model_dump_json(), now))
        
        cursor.execute("""
            UPDATE exams 
            SET current_rubric_version_id = ?, total_marks = ?, status = 'RUBRIC_APPROVED',
                lifecycle_status = 'EVALUATION_READY', updated_at = ?
            WHERE id = ?
        """, (version_id, req.rubric_data.total_exam_marks, now, exam_id))
        
        # Audit log
        cursor.execute("""
            INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details_json, created_at)
            VALUES (?, ?, 'APPROVE_RUBRIC', 'EXAM', ?, ?, ?)
        """, (
            f"aud_{uuid.uuid4().hex[:12]}",
            current_user["sub"],
            exam_id,
            f'{{"version_num": {v_num}, "total_marks": {req.rubric_data.total_exam_marks}}}',
            now
        ))
        
    return {
        "status": "approved",
        "exam_id": exam_id,
        "version_num": v_num,
        "total_marks": req.rubric_data.total_exam_marks
    }

@router.post("/{exam_id}/start-evaluation")
def start_evaluation(
    exam_id: str,
    current_user: Dict[str, Any] = Depends(require_root_admin)
):
    """
    Root Admin alone triggers evaluation queue.
    Strictly verifies all 4 invariants:
    1. Submission window is closed.
    2. Answer key is uploaded.
    3. Rubric is approved.
    4. Explicit Root Admin action.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM exams WHERE id = ?", (exam_id,))
        exam = cursor.fetchone()
        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found")
        
        # 1. Window closed check
        cursor.execute("SELECT * FROM submission_windows WHERE exam_id = ? ORDER BY created_at DESC LIMIT 1", (exam_id,))
        window = cursor.fetchone()
        now = datetime.now(timezone.utc)
        if window and window["status"] == "OPEN":
            grace_deadline = datetime.fromisoformat(window["grace_deadline_at"].replace("Z", "+00:00"))
            if now <= grace_deadline:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot start evaluation: submission window is still active."
                )
        
        # 2. Answer key check
        if not exam["answer_key_path"]:
            raise HTTPException(status_code=400, detail="Cannot start evaluation: answer key has not been uploaded.")
        
        # 3. Approved rubric check
        cursor.execute("SELECT * FROM rubric_versions WHERE id = ? AND is_approved = 1", (exam["current_rubric_version_id"],))
        rubric = cursor.fetchone()
        if not rubric:
            raise HTTPException(status_code=400, detail="Cannot start evaluation: no approved rubric exists for this exam.")
        
        # 4. Enqueue all active submissions (including previously failed ones)
        cursor.execute("""
            SELECT id, roll_number FROM submissions 
            WHERE exam_id = ? AND submission_status = 'SUBMITTED' AND status IN ('UPLOADED', 'AWAITING_KEY', 'AWAITING_RUBRIC', 'QUEUED', 'FAILED')
            ORDER BY roll_number ASC, created_at ASC
        """, (exam_id,))
        subs_to_grade = cursor.fetchall()
        
        now_iso = get_iso_now()
        enqueued_count = 0
        for sub in subs_to_grade:
            queue_id = f"q_{uuid.uuid4().hex[:12]}"
            # Insert into evaluation queue
            cursor.execute("""
                INSERT INTO evaluation_queue (id, submission_id, exam_id, priority, status, created_at, updated_at)
                VALUES (?, ?, ?, 100, 'QUEUED', ?, ?)
            """, (queue_id, sub["id"], exam_id, now_iso, now_iso))
            
            # Update submission status - clear any previous error and reset retry count
            cursor.execute("""
                UPDATE submissions 
                SET status = 'QUEUED', error_message = NULL, retry_count = 0, updated_at = ? 
                WHERE id = ?
            """, (now_iso, sub["id"]))
            enqueued_count += 1
        
        cursor.execute("""
            UPDATE exams 
            SET lifecycle_status = 'EVALUATING', status = 'EVALUATING', updated_at = ?
            WHERE id = ?
        """, (now_iso, exam_id))
        
        # Audit log
        cursor.execute("""
            INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details_json, created_at)
            VALUES (?, ?, 'START_EVALUATION', 'EXAM', ?, ?, ?)
        """, (
            f"aud_{uuid.uuid4().hex[:12]}",
            current_user["sub"],
            exam_id,
            f'{{"enqueued_papers": {enqueued_count}}}',
            now_iso
        ))
        
        return {
            "status": "evaluation_started",
            "exam_id": exam_id,
            "enqueued_papers": enqueued_count
        }

@router.post("/{exam_id}/publish")
@router.post("/{exam_id}/publish-results")
def publish_results(
    exam_id: str,
    current_user: Dict[str, Any] = Depends(require_root_admin)
):
    """
    Root Admin explicitly publishes results.
    Decoupled state: marks, breakdowns, and graded PDFs become visible to students.
    Triggers in-app inbox notification delivery.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM exams WHERE id = ?", (exam_id,))
        exam = cursor.fetchone()
        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found")
        
        now = get_iso_now()
        retention_expiry = RetentionService.calculate_retention_expiry(now, settings.SUBMISSION_RETENTION_DAYS)
        
        # Publish all graded submissions and set retention expiry
        cursor.execute("""
            UPDATE submissions 
            SET publication_status = 'PUBLISHED',
                graded_at = COALESCE(graded_at, ?),
                ttl_days = COALESCE(ttl_days, 15),
                retention_expires_at = COALESCE(retention_expires_at, ?),
                updated_at = ?
            WHERE exam_id = ? AND submission_status = 'SUBMITTED' 
              AND status IN ('GRADED', 'REVIEWED', 'COMPLETED', 'NEEDS_REVIEW')
        """, (now, retention_expiry, now, exam_id))
        published_subs_count = cursor.rowcount
        
        cursor.execute("""
            UPDATE exams 
            SET is_published = 1, published_at = ?, lifecycle_status = 'PUBLISHED', status = 'PUBLISHED', updated_at = ?
            WHERE id = ?
        """, (now, now, exam_id))
        
        # Dispatch in-app notifications to all enrolled students
        cursor.execute("""
            SELECT DISTINCT s.id as submission_id, st.user_id 
            FROM submissions s 
            JOIN students st ON s.student_id = st.id OR UPPER(s.roll_number) = UPPER(st.roll_number)
            WHERE s.exam_id = ? AND st.user_id IS NOT NULL AND s.publication_status = 'PUBLISHED'
        """, (exam_id,))
        students_to_notify = cursor.fetchall()
        
        for st in students_to_notify:
            send_notification(
                cursor=cursor,
                user_id=st["user_id"],
                notif_type="RESULT_PUBLISHED",
                title="Results Published",
                message=f"Results for '{exam['title']}' have been officially published. Tap to view your score breakdown.",
                link_url=f"/student/submissions/{st['submission_id']}"
            )
        
        # Scoped notification to Branch Manager
        branch_id = exam.get("branch_id")
        notify_branch_managers(
            cursor=cursor,
            branch_id=branch_id,
            notif_type="RESULT_PUBLISHED",
            title="Results Published to Students",
            message=f"Results for '{exam['title']}' ({published_subs_count} papers) have been officially published. 7-day revaluation window is active.",
            link_url=f"/exams",
            exclude_user_id=current_user["sub"]
        )
        if current_user.get("role") == "BRANCH_MANAGER":
            b_name = get_branch_name(cursor, branch_id)
            notify_root_admins(
                cursor=cursor,
                notif_type="RESULT_PUBLISHED",
                title="Branch Results Published",
                message=f"{b_name} published results for '{exam['title']}' ({published_subs_count} papers).",
                link_url=f"/exams",
                exclude_user_id=current_user["sub"]
            )
        
        # Audit log
        cursor.execute("""
            INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details_json, created_at)
            VALUES (?, ?, 'PUBLISH_RESULTS', 'EXAM', ?, ?, ?)
        """, (
            f"aud_{uuid.uuid4().hex[:12]}",
            current_user["sub"],
            exam_id,
            f'{{"published_papers": {published_subs_count}, "notifications_sent": {len(students_to_notify)}}}',
            now
        ))
        
        return {
            "status": "success",
            "exam_id": exam_id,
            "published_papers": published_subs_count,
            "notifications_sent": len(students_to_notify),
            "published_at": now
        }

@router.post("/{exam_id}/rubric/unlock")
def unlock_rubric(
    exam_id: str,
    current_user: Dict[str, Any] = Depends(require_root_admin)
):
    """
    Root Admin unlocks rubric to draft status.
    """
    exam = exam_service.get_exam(exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    
    now = get_iso_now()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE exams 
            SET status = 'RUBRIC_DRAFT', lifecycle_status = 'SETUP', updated_at = ?
            WHERE id = ?
        """, (now, exam_id))
    
    return exam_service.get_exam(exam_id)

@router.post("/load-sample")
def load_sample_exam(current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)):
    """
    Creates or seeds a sample Physics exam for demo/pilot preview.
    """
    now = get_iso_now()
    sample_id = "exam_sample_physics"
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM exams WHERE id = ?", (sample_id,))
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO exams (id, title, subject, total_marks, status, lifecycle_status, is_published, created_at, updated_at)
                VALUES (?, 'Physics Mid-Term Exam (Sample)', 'Physics', 50.0, 'RUBRIC_APPROVED', 'PUBLISHED', 1, ?, ?)
            """, (sample_id, now, now))
    return {
        "exam_id": sample_id,
        "batch_id": "batch_sample",
        "message": "Sample Physics exam loaded successfully."
    }

def _resolve_exam_artifact_pdf(exam_id: str, artifact_type: str) -> Optional[Path]:
    """
    Resolves the local Path for question-paper or answer-key.
    Downloads from storage service if only in remote object storage.
    """
    exam = exam_service.get_exam(exam_id)
    if not exam:
        return None

    is_qp = "question" in artifact_type.lower()
    raw_path = exam.get("question_paper_path") if is_qp else exam.get("answer_key_path")
    filename = "question_paper.pdf" if is_qp else "answer_key.pdf"

    candidates = []
    if raw_path:
        candidates.append(raw_path)

    # Standard disk locations
    candidates.append(str(settings.UPLOADS_DIR / f"exam_{exam_id}" / filename))

    for cand in candidates:
        cand_path = Path(cand)
        if cand_path.exists() and cand_path.is_file():
            return cand_path

    # Check Storage Service (Cloudinary / R2)
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
        f"uploads/exam_{exam_id}/{filename}"
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

    # Sample fallbacks
    pkg_dir = Path(__file__).resolve().parent.parent.parent
    sample_sub = "question_paper.pdf" if is_qp else "answer_key.pdf"
    sample_candidates = [
        Path(f"backend/sample_data/sample_exam/{sample_sub}"),
        pkg_dir / "sample_data" / "sample_exam" / sample_sub,
        pkg_dir / "backend" / "sample_data" / "sample_exam" / sample_sub,
        Path.cwd() / "backend" / "sample_data" / "sample_exam" / sample_sub,
        Path.cwd() / "sample_data" / "sample_exam" / sample_sub
    ]
    for s_path in sample_candidates:
        if s_path.exists() and s_path.is_file():
            return s_path

    return None

@router.get("/{exam_id}/question-paper")
async def get_exam_question_paper(
    exam_id: str,
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)
):
    """
    Stream or download the Question Paper PDF for an examination.
    """
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
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)
):
    """
    Stream or download the Official Answer Key PDF for an examination.
    """
    exam = exam_service.get_exam(exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    # Security guard: Enrolled students cannot access the answer key before results publication
    if current_user and isinstance(current_user, dict) and current_user.get("role") == "STUDENT" and not exam.get("is_published"):
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
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)
):
    """
    Returns metadata (page count, title, status) for question paper or answer key.
    Pre-renders pages to high-resolution PNGs for mobile/PWA native viewing.
    """
    clean_art = artifact_type.lower().replace("_", "-")
    if clean_art not in ["question-paper", "answer-key"]:
        raise HTTPException(status_code=400, detail="Invalid artifact type. Must be question-paper or answer-key.")

    exam = exam_service.get_exam(exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    if clean_art == "answer-key" and current_user and isinstance(current_user, dict) and current_user.get("role") == "STUDENT" and not exam.get("is_published"):
        raise HTTPException(status_code=403, detail="Official answer key is confidential until exam results are published.")

    pdf_path = _resolve_exam_artifact_pdf(exam_id, clean_art)
    if not pdf_path or not pdf_path.exists():
        return {
            "exam_id": exam_id,
            "artifact_type": clean_art,
            "has_document": False,
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
        "page_count": page_count,
        "title": exam.get("title", ""),
        "subject": exam.get("subject", "")
    }

@router.get("/{exam_id}/{artifact_type}/pages/{page_num}")
async def get_exam_artifact_page_image(
    exam_id: str,
    artifact_type: str,
    page_num: int,
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)
):
    """
    Stream a single high-resolution rendered page image (PNG) of the Question Paper
    or Answer Key for seamless, mobile-friendly PWA rendering without browser PDF plugin dependencies.
    """
    clean_art = artifact_type.lower().replace("_", "-")
    if clean_art not in ["question-paper", "answer-key"]:
        raise HTTPException(status_code=400, detail="Invalid artifact type.")

    exam = exam_service.get_exam(exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    if clean_art == "answer-key" and current_user and isinstance(current_user, dict) and current_user.get("role") == "STUDENT" and not exam.get("is_published"):
        raise HTTPException(status_code=403, detail="Official answer key is confidential until exam results are published.")

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

