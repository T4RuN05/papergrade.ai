import threading
from typing import Optional, Dict, Any
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from sqlalchemy import select

from backend.app.config import settings
from backend.app.db.session import get_session
from backend.app.db.models import Submission, Answer, AnswerRegion, Exam, Student
from backend.app.schemas import (
    ManualEditAnswerRequest,
    ManualEditRegionRequest,
    SingleAnswerReevaluateRequest,
)
from backend.app.services.grading_service import grading_service
from backend.app.services.storage import get_storage_service
from backend.app.services.pdf_service import pdf_service
from backend.app.services.auth import get_current_user, require_branch_manager
from backend.app.services.authorization import (
    is_exam_published,
    student_owns_submission,
    verify_exam_tenancy,
    verify_submission_tenancy,
)

_render_locks: Dict[str, threading.Lock] = {}
_render_locks_meta = threading.Lock()

def _get_submission_render_lock(sub_id: str) -> threading.Lock:
    with _render_locks_meta:
        if sub_id not in _render_locks:
            _render_locks[sub_id] = threading.Lock()
        return _render_locks[sub_id]

router = APIRouter(prefix="/api/grading", tags=["Grading & Overrides"])

# Answer-sheet bitmaps are PII: browsers may cache them, shared/proxy caches may not.
PAGE_CACHE_HEADERS = {
    "Cache-Control": "private, max-age=86400, immutable",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
}

NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}


@router.post("/exams/{exam_id}/clear-all-reviews")
def clear_all_exam_reviews(
    exam_id: str,
    current_user: Dict[str, Any] = Depends(require_branch_manager),
):
    with get_session() as db:
        verify_exam_tenancy(exam_id, current_user, db)
    reviewer_id = current_user.get("sub") or "teacher"
    try:
        return grading_service.bulk_clear_exam_reviews(exam_id, reviewer=reviewer_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to bulk clear exam reviews: {str(e)}")


@router.post("/{submission_id}/clear-review")
def clear_submission_review(
    submission_id: str,
    current_user: Dict[str, Any] = Depends(require_branch_manager),
):
    with get_session() as db:
        verify_submission_tenancy(submission_id, current_user, db)
    reviewer_id = current_user.get("sub") or "teacher"
    try:
        return grading_service.clear_all_review_flags(submission_id, reviewer=reviewer_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear review flags: {str(e)}")


@router.post("/answers/{submission_id}/{answer_id}/edit")
@router.post("/{submission_id}/answers/{answer_id}")
@router.patch("/{submission_id}/answers/{answer_id}")
def edit_answer(
    submission_id: str,
    answer_id: str,
    req: ManualEditAnswerRequest,
    current_user: Dict[str, Any] = Depends(require_branch_manager),
):
    with get_session() as db:
        verify_submission_tenancy(submission_id, current_user, db)
    reviewer_id = current_user.get("sub") or "teacher"
    try:
        return grading_service.manual_edit_answer(submission_id, answer_id, req, reviewer_id=reviewer_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to edit answer: {str(e)}")


@router.post("/answers/{submission_id}/{answer_id}/reevaluate")
@router.post("/{submission_id}/answers/{answer_id}/reevaluate")
def reevaluate_answer_crop(
    submission_id: str,
    answer_id: str,
    req: SingleAnswerReevaluateRequest,
    current_user: Dict[str, Any] = Depends(require_branch_manager),
):
    with get_session() as db:
        verify_submission_tenancy(submission_id, current_user, db)
    try:
        return grading_service.reevaluate_answer(
            submission_id=submission_id,
            answer_id=answer_id,
            teacher_prompt=req.teacher_prompt or "",
            region_id=req.region_id
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to re-evaluate answer: {str(e)}")


@router.post("/regions/{submission_id}/{region_id}/edit")
@router.post("/{submission_id}/regions/{region_id}")
@router.patch("/{submission_id}/regions/{region_id}")
@router.post("/regions/{submission_id}/add")
def edit_region(
    submission_id: str,
    req: ManualEditRegionRequest,
    region_id: str = "new",
    current_user: Dict[str, Any] = Depends(require_branch_manager),
):
    with get_session() as db:
        verify_submission_tenancy(submission_id, current_user, db)
    reviewer_id = current_user.get("sub") or "teacher"
    try:
        return grading_service.manual_edit_region(submission_id, region_id, req, reviewer_id=reviewer_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to edit region: {str(e)}")


@router.delete("/regions/{submission_id}/{region_id}")
@router.delete("/{submission_id}/regions/{region_id}")
def delete_region(
    submission_id: str,
    region_id: str,
    current_user: Dict[str, Any] = Depends(require_branch_manager),
):
    with get_session() as db:
        verify_submission_tenancy(submission_id, current_user, db)
    reviewer_id = current_user.get("sub") or "teacher"
    try:
        return grading_service.delete_region(submission_id, region_id, reviewer_id=reviewer_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete region: {str(e)}")


def _ensure_submission_pages_rendered(
    submission_id: str,
    sub: Optional[Submission],
    target_img_path: Path,
    storage,
) -> None:
    """Render submission PDF pages locally (and sync to remote storage) if target image is missing."""
    if target_img_path.exists() or not sub:
        return
    sub_lock = _get_submission_render_lock(submission_id)
    with sub_lock:
        if target_img_path.exists():
            return
        candidate_keys = []
        for raw_k in [sub.canonical_pdf_path, sub.original_file_path]:
            if raw_k:
                candidate_keys.append(raw_k)
                clean_k = str(raw_k).replace("\\", "/").strip().lstrip("/")
                candidate_keys.append(clean_k)
                for marker in ["/submissions/", "/uploads/", "/data/"]:
                    if marker in clean_k:
                        candidate_keys.append(clean_k[clean_k.index(marker) + len(marker):])
                        candidate_keys.append(clean_k[clean_k.index(marker) + 1:])

        exam_id = sub.exam_id
        roll = sub.roll_number
        if exam_id and roll:
            candidate_keys.append(f"submissions/{exam_id}/{roll}/original_{submission_id}.pdf")
            candidate_keys.append(f"submissions/{exam_id}/{roll}/original_sub_{submission_id}.pdf")
        candidate_keys.append(f"submissions/{submission_id}/canonical.pdf")
        candidate_keys.append(f"sub_{submission_id}/canonical.pdf")

        for k in dict.fromkeys(k for k in candidate_keys if k):
            try:
                if storage.file_exists(k):
                    local_pdf = storage.get_local_path_or_download(k)
                    if local_pdf and local_pdf.exists():
                        pdf_service.render_pdf_pages_to_images(local_pdf, submission_id)
                        if target_img_path.exists():
                            break
            except Exception:
                continue


@router.get("/page-image/{submission_id}/{page_num}")
def get_page_image(
    submission_id: str,
    page_num: int,
    w: Optional[int] = None,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    with get_session() as db:
        sub = db.scalar(select(Submission).where(Submission.id == submission_id))

        if sub and sub.is_document_purged:
            raise HTTPException(
                status_code=410,
                detail="Document unavailable: Graded answer sheets are permanently purged in accordance with the 15-day storage retention policy to preserve storage. Question marks and scores remain archived."
            )

        if current_user.get("role") == "STUDENT":
            user_sub_id = current_user.get("sub")
            allowed_rolls = []
            allowed_ids = []
            if current_user.get("roll_number"):
                allowed_rolls.append(current_user["roll_number"].strip().upper())
            if current_user.get("student_id"):
                allowed_ids.append(current_user["student_id"])
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
                raise HTTPException(status_code=403, detail="Forbidden: You cannot access another student's page image.")
        elif current_user.get("role") in ("BRANCH_MANAGER", "TEACHER", "INSTITUTE_DIRECTOR"):
            verify_submission_tenancy(submission_id, current_user, db)

        if sub:
            db.expunge(sub)

    storage = get_storage_service()
    renders_dir = settings.RENDERS_DIR / submission_id
    img_path = pdf_service.get_page_image_path(renders_dir, page_num)
    _ensure_submission_pages_rendered(submission_id, sub, img_path, storage)

    if not img_path.exists():
        img_path = pdf_service.get_page_image_path(renders_dir, page_num)

    if not img_path.exists():
        raise HTTPException(status_code=404, detail=f"Page image {page_num} not found.")

    media_type = "image/jpeg" if img_path.suffix.lower() in (".jpg", ".jpeg") else "image/png"
    return FileResponse(str(img_path), media_type=media_type, headers=PAGE_CACHE_HEADERS)


@router.get("/crop/{submission_id}/{answer_id}")
def get_answer_crop(
    submission_id: str,
    answer_id: str,
    region_id: Optional[str] = None,
    v: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    target_reg = None
    with get_session() as db:
        sub = db.scalar(select(Submission).where(Submission.id == submission_id))
        if sub and sub.is_document_purged:
            raise HTTPException(
                status_code=410,
                detail="Document unavailable: Graded answer sheets are permanently purged in accordance with the 15-day storage retention policy to preserve storage."
            )

        if current_user.get("role") == "STUDENT":
            owns_sub = bool(sub) and student_owns_submission(current_user, sub.student_id, sub.roll_number)
            if not owns_sub:
                raise HTTPException(status_code=403, detail="Forbidden: You cannot access another student's answer crop.")
            if sub and sub.publication_status != "PUBLISHED":
                exam = db.scalar(select(Exam).where(Exam.id == sub.exam_id))
                if not is_exam_published(exam):
                    raise HTTPException(status_code=403, detail="Forbidden: Evaluation results have not been officially published yet.")
        elif current_user.get("role") in ("BRANCH_MANAGER", "TEACHER", "INSTITUTE_DIRECTOR"):
            verify_submission_tenancy(submission_id, current_user, db)

        if region_id:
            target_reg = db.scalar(
                select(AnswerRegion)
                .join(Answer, AnswerRegion.answer_id == Answer.id)
                .where(
                    AnswerRegion.id == region_id,
                    Answer.id == answer_id,
                    Answer.submission_id == submission_id,
                )
            )
        if not target_reg:
            target_reg = db.scalar(
                select(AnswerRegion)
                .join(Answer, AnswerRegion.answer_id == Answer.id)
                .where(
                    AnswerRegion.answer_id == answer_id,
                    Answer.submission_id == submission_id,
                )
                .order_by(AnswerRegion.id.asc())
                .limit(1)
            )

        if sub:
            db.expunge(sub)
        if target_reg:
            db.expunge(target_reg)

    crops_dir = settings.RENDERS_DIR / submission_id / "crops"
    crops_dir.mkdir(parents=True, exist_ok=True)

    target_crop_path = None
    if region_id:
        reg_crop_path = crops_dir / f"crop_{answer_id}_{region_id}.png"
        if reg_crop_path.exists():
            return FileResponse(str(reg_crop_path), media_type="image/png", headers=NO_CACHE_HEADERS)
        if target_reg:
            target_crop_path = reg_crop_path

    if not target_crop_path or not target_reg:
        primary_crop_path = crops_dir / f"crop_{answer_id}.png"
        if primary_crop_path.exists():
            return FileResponse(str(primary_crop_path), media_type="image/png", headers=NO_CACHE_HEADERS)
        target_crop_path = primary_crop_path

    # Dynamic fallback: regenerate crop locally from page render if missing from disk
    if target_reg:
        page_num = target_reg.page_number
        renders_dir = settings.RENDERS_DIR / submission_id
        page_img = pdf_service.get_page_image_path(renders_dir, page_num)
        storage = get_storage_service()
        _ensure_submission_pages_rendered(submission_id, sub, page_img, storage)
        if not page_img.exists():
            page_img = pdf_service.get_page_image_path(renders_dir, page_num)

        if page_img.exists():
            try:
                pdf_service.crop_answer_region(
                    page_img,
                    float(target_reg.x),
                    float(target_reg.y),
                    float(target_reg.width),
                    float(target_reg.height),
                    target_crop_path,
                )
            except Exception:
                pass

    if target_crop_path and target_crop_path.exists():
        return FileResponse(str(target_crop_path), media_type="image/png", headers=NO_CACHE_HEADERS)

    raise HTTPException(status_code=404, detail="Crop not found.")
