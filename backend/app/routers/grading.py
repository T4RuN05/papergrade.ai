import threading
from typing import Optional, Dict, Any
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import select

from backend.app.config import settings
from backend.app.db.session import get_db
from backend.app.db.models import Submission, AnswerRegion, Exam
from backend.app.schemas import ManualEditAnswerRequest, ManualEditRegionRequest
from backend.app.services.grading_service import grading_service
from backend.app.services.storage import get_storage_service
from backend.app.services.pdf_service import pdf_service
from backend.app.services.auth import get_current_user, require_branch_manager

_render_lock = threading.Lock()

router = APIRouter(prefix="/api/grading", tags=["Grading & Overrides"])

PAGE_CACHE_HEADERS = {
    "Cache-Control": "public, max-age=604800, immutable",
}

NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}


@router.post("/exams/{exam_id}/clear-all-reviews")
def clear_all_exam_reviews(
    exam_id: str,
    current_user: Dict[str, Any] = Depends(require_branch_manager)
):
    try:
        result = grading_service.bulk_clear_exam_reviews(exam_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to bulk clear exam reviews: {str(e)}")


@router.post("/{submission_id}/clear-review")
def clear_submission_review(
    submission_id: str,
    current_user: Dict[str, Any] = Depends(require_branch_manager)
):
    try:
        updated = grading_service.clear_all_review_flags(submission_id)
        return updated
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
    current_user: Dict[str, Any] = Depends(require_branch_manager)
):
    try:
        updated = grading_service.manual_edit_answer(submission_id, answer_id, req)
        return updated
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to edit answer: {str(e)}")


@router.post("/regions/{submission_id}/{region_id}/edit")
@router.post("/{submission_id}/regions/{region_id}")
@router.patch("/{submission_id}/regions/{region_id}")
@router.post("/regions/{submission_id}/add")
def edit_region(
    submission_id: str,
    region_id: str = "new",
    req: ManualEditRegionRequest = None,
    current_user: Dict[str, Any] = Depends(require_branch_manager)
):
    try:
        updated = grading_service.manual_edit_region(submission_id, region_id, req)
        return updated
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to edit region: {str(e)}")


@router.delete("/regions/{submission_id}/{region_id}")
@router.delete("/{submission_id}/regions/{region_id}")
def delete_region(
    submission_id: str,
    region_id: str,
    current_user: Dict[str, Any] = Depends(require_branch_manager)
):
    try:
        updated = grading_service.delete_region(submission_id, region_id)
        return updated
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete region: {str(e)}")


@router.get("/page-image/{submission_id}/{page_num}")
def get_page_image(
    submission_id: str,
    page_num: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    sub = db.scalar(select(Submission).where(Submission.id == submission_id))

    if sub and sub.is_document_purged:
        raise HTTPException(
            status_code=410,
            detail="Document unavailable: Graded answer sheets are permanently purged in accordance with the 15-day storage retention policy to preserve storage. Question marks and scores remain archived."
        )

    # Student ownership & publication isolation
    if current_user.get("role") == "STUDENT":
        user_roll = (current_user.get("roll_number") or "").strip().upper()
        user_stu_id = current_user.get("student_id")
        owns_sub = (user_roll and sub and sub.roll_number and sub.roll_number.upper() == user_roll) or (user_stu_id and sub and sub.student_id == user_stu_id)
        if not owns_sub:
            raise HTTPException(status_code=403, detail="Forbidden: You cannot access another student's page image.")
        if sub and sub.publication_status != "PUBLISHED":
            exam = db.scalar(select(Exam).where(Exam.id == sub.exam_id))
            if not exam or exam.is_published != 1:
                raise HTTPException(status_code=403, detail="Forbidden: Evaluation results have not been officially published yet.")

    img_path = settings.RENDERS_DIR / submission_id / f"page_{page_num}.png"
    if not img_path.exists() and sub:
        with _render_lock:
            # Double check inside mutex in case previous thread just finished rendering it
            if not img_path.exists():
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

                storage = get_storage_service()
                for k in candidate_keys:
                    try:
                        if storage.file_exists(k):
                            local_pdf = storage.get_local_path_or_download(k)
                            if local_pdf and local_pdf.exists():
                                pdf_service.render_pdf_pages_to_images(local_pdf, submission_id)
                                if img_path.exists():
                                    break
                    except Exception:
                        continue

    if not img_path.exists():
        raise HTTPException(status_code=404, detail=f"Page image {page_num} not found.")
    return FileResponse(str(img_path), media_type="image/png", headers=PAGE_CACHE_HEADERS)


@router.get("/crop/{submission_id}/{answer_id}")
def get_answer_crop(
    submission_id: str,
    answer_id: str,
    region_id: Optional[str] = None,
    v: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.get("role") == "STUDENT":
        sub = db.scalar(select(Submission).where(Submission.id == submission_id))
        user_roll = (current_user.get("roll_number") or "").strip().upper()
        user_stu_id = current_user.get("student_id")
        owns_sub = (user_roll and sub and sub.roll_number and sub.roll_number.upper() == user_roll) or (user_stu_id and sub and sub.student_id == user_stu_id)
        if not owns_sub:
            raise HTTPException(status_code=403, detail="Forbidden: You cannot access another student's answer crop.")
        if sub and sub.publication_status != "PUBLISHED":
            exam = db.scalar(select(Exam).where(Exam.id == sub.exam_id))
            if not exam or exam.is_published != 1:
                raise HTTPException(status_code=403, detail="Forbidden: Evaluation results have not been officially published yet.")

    crops_dir = settings.RENDERS_DIR / submission_id / "crops"
    crops_dir.mkdir(parents=True, exist_ok=True)

    target_crop_path = None
    target_reg = None

    if region_id:
        reg_crop_path = crops_dir / f"crop_{answer_id}_{region_id}.png"
        if reg_crop_path.exists():
            return FileResponse(str(reg_crop_path), media_type="image/png", headers=NO_CACHE_HEADERS)
        target_crop_path = reg_crop_path
        target_reg = db.scalar(select(AnswerRegion).where(AnswerRegion.id == region_id))

    if not target_crop_path or not target_reg:
        primary_crop_path = crops_dir / f"crop_{answer_id}.png"
        if primary_crop_path.exists():
            return FileResponse(str(primary_crop_path), media_type="image/png", headers=NO_CACHE_HEADERS)
        target_crop_path = primary_crop_path
        target_reg = db.scalar(
            select(AnswerRegion)
            .where(AnswerRegion.answer_id == answer_id)
            .order_by(AnswerRegion.id.asc())
            .limit(1)
        )

    # Dynamic fallback: regenerate crop if missing from disk
    if target_reg:
        page_num = target_reg.page_number
        page_img = settings.RENDERS_DIR / submission_id / f"page_{page_num}.png"
        if not page_img.exists():
            sub = db.scalar(select(Submission).where(Submission.id == submission_id))
            if sub:
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

                storage = get_storage_service()
                for k in candidate_keys:
                    try:
                        if storage.file_exists(k):
                            local_pdf = storage.get_local_path_or_download(k)
                            if local_pdf and local_pdf.exists():
                                pdf_service.render_pdf_pages_to_images(local_pdf, submission_id)
                                if page_img.exists():
                                    break
                    except Exception:
                        continue

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
