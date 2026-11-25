import os
import re
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse, Response
from sqlalchemy import select

from backend.app.db.session import get_session
from backend.app.db.models import Submission, Exam, Batch, Branch
from backend.app.services.export_service import export_service
from backend.app.services.grading_service import grading_service
from backend.app.services.storage import (
    get_storage_service,
    is_remote_storage,
    build_remote_redirect_response,
    sync_file_to_remote_storage,
)
from backend.app.services.auth import get_current_user, require_branch_manager
from backend.app.services.authorization import (
    is_exam_published,
    student_owns_submission,
    verify_exam_tenancy,
    verify_staff_exam_scope,
)

router = APIRouter(prefix="/api/exports", tags=["Exports"])


def _sanitize_download_filename(raw_name: str, default_ext: str) -> str:
    clean = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', os.path.basename(raw_name.strip())) or f"download.{default_ext}"
    if not clean.lower().endswith(f".{default_ext}"):
        clean = f"{clean}.{default_ext}"
    return clean


def _resolve_pdf_response(
    submission_id: str,
    custom_filename: Optional[str] = None,
    current_user: Optional[Dict[str, Any]] = None
):
    clean_sub_id = submission_id.removesuffix(".pdf")

    with get_session() as db:
        result = db.execute(
            select(Submission, Exam)
            .outerjoin(Exam, Submission.exam_id == Exam.id)
            .where(Submission.id == clean_sub_id)
        ).first()

        sub = result[0] if result else None
        exam = result[1] if result else None

        if not sub:
            raise HTTPException(status_code=404, detail="Submission not found")

        if sub.is_document_purged:
            raise HTTPException(
                status_code=410,
                detail="Document unavailable: This evaluated answer sheet was permanently removed in accordance with the 15-day storage retention policy. Question-by-question marks and final scores are permanently preserved in your academic record."
            )

        is_student = bool(current_user and current_user.get("role") == "STUDENT")
        if is_student:
            if not student_owns_submission(current_user, sub.student_id, sub.roll_number):
                raise HTTPException(status_code=403, detail="Forbidden: You cannot download another student's graded PDF.")
            if not (sub.publication_status == "PUBLISHED" or is_exam_published(exam)):
                raise HTTPException(
                    status_code=403,
                    detail="Forbidden: Evaluation results for this examination have not been officially published yet. Graded PDFs will become available once officially released by academic faculty."
                )
        elif current_user:
            verify_staff_exam_scope(
                current_user,
                exam.institute_id if exam else None,
                exam.branch_id if exam else None,
                exam_id=sub.exam_id,
            )

        sub_roll = sub.roll_number
        sub_name = sub.student_name
        sub_annotated_path = sub.annotated_pdf_path

    if custom_filename:
        safe_name = _sanitize_download_filename(custom_filename, "pdf")
    else:
        raw_roll = (sub_roll or "ROLL").strip()
        raw_name = (sub_name or "Student").strip()
        safe_name = _sanitize_download_filename(f"{raw_roll}_{raw_name}_Graded", "pdf")

    storage = get_storage_service()
    annotated_key = (
        sub_annotated_path
        if sub_annotated_path and sub_annotated_path not in ("", "PURGED")
        else f"exports/{clean_sub_id}_annotated.pdf"
    )
    if is_remote_storage(storage) and not grading_service.is_export_dirty(clean_sub_id):
        if storage.file_exists(annotated_key):
            redirect_resp = build_remote_redirect_response(
                storage, annotated_key, filename=safe_name, attachment=True
            )
            if redirect_resp is not None:
                return redirect_resp

    pdf_path = export_service.get_submission_pdf_path(clean_sub_id)
    if not pdf_path or not pdf_path.exists():
        raise HTTPException(status_code=404, detail="Annotated PDF not found or could not be generated.")

    if is_remote_storage(storage):
        sync_file_to_remote_storage(pdf_path, annotated_key, content_type="application/pdf", storage=storage)
        redirect_resp = build_remote_redirect_response(
            storage, annotated_key, filename=safe_name, attachment=True
        )
        if redirect_resp is not None:
            return redirect_resp

    return FileResponse(
        str(pdf_path),
        media_type="application/pdf",
        filename=safe_name,
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}"',
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )


@router.get("/pdf/{submission_id}")
def download_annotated_pdf(
    submission_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    return _resolve_pdf_response(submission_id, current_user=current_user)


@router.get("/pdf/{submission_id}/{filename}")
def download_annotated_pdf_with_name(
    submission_id: str,
    filename: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    return _resolve_pdf_response(submission_id, custom_filename=filename, current_user=current_user)


def _resolve_zip_response(
    batch_id: str,
    custom_filename: Optional[str] = None,
    current_user: Optional[Dict[str, Any]] = None
):
    clean_batch_id = batch_id.removesuffix(".zip")
    with get_session() as db:
        batch = db.scalar(select(Batch).where(Batch.id == clean_batch_id))
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")

        branch = db.scalar(select(Branch).where(Branch.id == batch.branch_id)) if batch.branch_id else None
        batch_inst = branch.institute_id if branch else None
        if current_user:
            verify_staff_exam_scope(current_user, batch_inst, batch.branch_id)
        batch_name = batch.name

    zip_path = export_service.create_batch_zip(clean_batch_id)
    if not zip_path or not zip_path.exists():
        raise HTTPException(status_code=404, detail="Could not create batch ZIP archive.")

    if custom_filename:
        safe_name = _sanitize_download_filename(custom_filename, "zip")
    elif batch_name:
        safe_name = _sanitize_download_filename(f"{batch_name}_Graded_PDFs", "zip")
    else:
        safe_name = f"Batch_{clean_batch_id[:8]}_Graded_PDFs.zip"

    storage = get_storage_service()
    if is_remote_storage(storage):
        zip_key = f"exports/batch_{clean_batch_id}_graded_pdfs.zip"
        if sync_file_to_remote_storage(zip_path, zip_key, content_type="application/zip", storage=storage):
            redirect_resp = build_remote_redirect_response(
                storage, zip_key, filename=safe_name, attachment=True
            )
            if redirect_resp is not None:
                return redirect_resp

    return FileResponse(
        str(zip_path),
        media_type="application/zip",
        filename=safe_name,
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}"',
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )


@router.get("/batch-zip/{batch_id}")
def download_batch_zip(
    batch_id: str,
    current_user: Dict[str, Any] = Depends(require_branch_manager),
):
    return _resolve_zip_response(batch_id, current_user=current_user)


@router.get("/batch-zip/{batch_id}/{filename}")
def download_batch_zip_with_name(
    batch_id: str,
    filename: str,
    current_user: Dict[str, Any] = Depends(require_branch_manager),
):
    return _resolve_zip_response(batch_id, custom_filename=filename, current_user=current_user)


@router.get("/marks-csv/{exam_id}")
@router.get("/marks-csv/{exam_id}/{filename}")
def download_marks_csv(
    exam_id: str,
    filename: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(require_branch_manager),
):
    clean_exam_id = exam_id.removesuffix(".csv")
    with get_session() as db:
        exam = verify_exam_tenancy(clean_exam_id, current_user, db)
        exam_title = exam.title
        exam_subject = exam.subject

    csv_content = export_service.generate_exam_marks_csv(clean_exam_id)

    if filename:
        safe_name = _sanitize_download_filename(filename, "csv")
    elif exam_title:
        safe_name = _sanitize_download_filename(f"{exam_title}_{exam_subject}_Marks", "csv")
    else:
        safe_name = f"Exam_{clean_exam_id[:8]}_Marks.csv"

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}"',
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )
