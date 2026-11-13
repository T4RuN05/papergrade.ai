import threading
from typing import Optional, Dict, Any
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import select

from backend.app.config import settings
from backend.app.db.session import get_db
from backend.app.db.models import Submission, AnswerRegion, Exam, Student
from backend.app.schemas import (
    ManualEditAnswerRequest,
    ManualEditRegionRequest,
    SingleAnswerReevaluateRequest,
)
from backend.app.services.grading_service import grading_service
from backend.app.services.storage import (
    get_storage_service,
    is_remote_storage,
    build_remote_redirect_response,
    sync_file_to_remote_storage,
)
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


@router.post("/answers/{submission_id}/{answer_id}/reevaluate")
@router.post("/{submission_id}/answers/{answer_id}/reevaluate")
def reevaluate_answer_crop(
    submission_id: str,
    answer_id: str,
    req: SingleAnswerReevaluateRequest,
    current_user: Dict[str, Any] = Depends(require_branch_manager)
):
    try:
        result = grading_service.reevaluate_answer(
            submission_id=submission_id,
            answer_id=answer_id,
            teacher_prompt=req.teacher_prompt or "",
            region_id=req.region_id
        )
        return result
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


def _ensure_submission_pages_rendered(
    submission_id: str,
    sub: Optional[Submission],
    target_img_path: Path,
    storage,
) -> None:
    """Render submission PDF pages locally (and sync to remote storage) if target image is missing."""
    if target_img_path.exists() or not sub:
        return
    with _render_lock:
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


def _serve_render_image(
    local_path: Path,
    storage_key: str,
    storage,
    headers: Dict[str, str],
    cache_buster: Optional[str] = None,
):
    """Redirect to remote object storage when configured; otherwise stream local PNG."""
    if is_remote_storage(storage):
        synced = True
        if not storage.file_exists(storage_key):
            synced = sync_file_to_remote_storage(local_path, storage_key, content_type="image/png", storage=storage)
        if synced:
            redirect_resp = build_remote_redirect_response(
                storage,
                storage_key,
                cache_buster=cache_buster,
                headers=headers,
            )
            if redirect_resp is not None:
                return redirect_resp
    return FileResponse(str(local_path), media_type="image/png", headers=headers)


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

    # Student ownership check: students are permitted to view raw pages of their own uploaded answer sheet at any time
    if current_user.get("role") == "STUDENT":
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
            raise HTTPException(status_code=403, detail="Forbidden: You cannot access another student's page image.")

    storage = get_storage_service()
    page_storage_key = f"renders/{submission_id}/page_{page_num}.png"
    if is_remote_storage(storage) and storage.file_exists(page_storage_key):
        redirect_resp = build_remote_redirect_response(storage, page_storage_key, headers=PAGE_CACHE_HEADERS)
        if redirect_resp is not None:
            return redirect_resp

    img_path = settings.RENDERS_DIR / submission_id / f"page_{page_num}.png"
    _ensure_submission_pages_rendered(submission_id, sub, img_path, storage)

    if not img_path.exists():
        raise HTTPException(status_code=404, detail=f"Page image {page_num} not found.")
    return _serve_render_image(img_path, page_storage_key, storage, PAGE_CACHE_HEADERS)


@router.get("/crop/{submission_id}/{answer_id}")
def get_answer_crop(
    submission_id: str,
    answer_id: str,
    region_id: Optional[str] = None,
    v: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    sub = db.scalar(select(Submission).where(Submission.id == submission_id))
    if sub and sub.is_document_purged:
        raise HTTPException(
            status_code=410,
            detail="Document unavailable: Graded answer sheets are permanently purged in accordance with the 15-day storage retention policy to preserve storage."
        )

    if current_user.get("role") == "STUDENT":
        user_roll = (current_user.get("roll_number") or "").strip().upper()
        user_stu_id = current_user.get("student_id")
        owns_sub = (user_roll and sub and sub.roll_number and sub.roll_number.upper() == user_roll) or (user_stu_id and sub and sub.student_id == user_stu_id)
        if not owns_sub:
            raise HTTPException(status_code=403, detail="Forbidden: You cannot access another student's answer crop.")
        if sub and sub.publication_status != "PUBLISHED":
            exam = db.scalar(select(Exam).where(Exam.id == sub.exam_id))
            if not exam or exam.is_published != 1:
                raise HTTPException(status_code=403, detail="Forbidden: Evaluation results have not been officially published yet.")

    storage = get_storage_service()
    crops_dir = settings.RENDERS_DIR / submission_id / "crops"
    crops_dir.mkdir(parents=True, exist_ok=True)

    target_crop_path = None
    target_reg = None

    if region_id:
        reg_crop_name = f"crop_{answer_id}_{region_id}.png"
        reg_crop_path = crops_dir / reg_crop_name
        reg_crop_key = f"renders/{submission_id}/crops/{reg_crop_name}"
        if is_remote_storage(storage) and storage.file_exists(reg_crop_key):
            redirect_resp = build_remote_redirect_response(
                storage, reg_crop_key, cache_buster=v, headers=NO_CACHE_HEADERS
            )
            if redirect_resp is not None:
                return redirect_resp
        if reg_crop_path.exists():
            return _serve_render_image(reg_crop_path, reg_crop_key, storage, NO_CACHE_HEADERS, cache_buster=v)
        target_crop_path = reg_crop_path
        target_reg = db.scalar(select(AnswerRegion).where(AnswerRegion.id == region_id))

    if not target_crop_path or not target_reg:
        primary_crop_name = f"crop_{answer_id}.png"
        primary_crop_path = crops_dir / primary_crop_name
        primary_crop_key = f"renders/{submission_id}/crops/{primary_crop_name}"
        if is_remote_storage(storage) and storage.file_exists(primary_crop_key):
            redirect_resp = build_remote_redirect_response(
                storage, primary_crop_key, cache_buster=v, headers=NO_CACHE_HEADERS
            )
            if redirect_resp is not None:
                return redirect_resp
        if primary_crop_path.exists():
            return _serve_render_image(primary_crop_path, primary_crop_key, storage, NO_CACHE_HEADERS, cache_buster=v)
        target_crop_path = primary_crop_path
        target_reg = db.scalar(
            select(AnswerRegion)
            .where(AnswerRegion.answer_id == answer_id)
            .order_by(AnswerRegion.id.asc())
            .limit(1)
        )

    # Dynamic fallback: regenerate crop if missing from disk and object storage
    if target_reg:
        page_num = target_reg.page_number
        page_img = settings.RENDERS_DIR / submission_id / f"page_{page_num}.png"
        _ensure_submission_pages_rendered(submission_id, sub, page_img, storage)

        if not page_img.exists() and is_remote_storage(storage):
            page_key = f"renders/{submission_id}/page_{page_num}.png"
            try:
                if storage.file_exists(page_key):
                    cached_page = storage.get_local_path_or_download(page_key)
                    if cached_page and cached_page.exists():
                        page_img = cached_page
            except Exception:
                pass

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
        crop_key = f"renders/{submission_id}/crops/{target_crop_path.name}"
        return _serve_render_image(target_crop_path, crop_key, storage, NO_CACHE_HEADERS, cache_buster=v)

    raise HTTPException(status_code=404, detail="Crop not found.")
