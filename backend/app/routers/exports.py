import re
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse, Response

from backend.app.database import get_db
from backend.app.services.export_service import export_service
from backend.app.services.auth import get_current_user_optional

router = APIRouter(prefix="/api/exports", tags=["Exports"])

def _resolve_pdf_response(
    submission_id: str,
    custom_filename: Optional[str] = None,
    current_user: Optional[Dict[str, Any]] = None
):
    clean_sub_id = submission_id.removesuffix(".pdf")

    # Check 15-day retention purge status & publication status
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT s.is_document_purged, s.purged_at, s.publication_status, e.is_published as exam_is_published
            FROM submissions s
            LEFT JOIN exams e ON s.exam_id = e.id
            WHERE s.id = ?
        """, (clean_sub_id,))
        sub_check = cursor.fetchone()

    if sub_check and sub_check.get("is_document_purged"):
        raise HTTPException(
            status_code=410,
            detail="Document unavailable: This evaluated answer sheet was permanently removed in accordance with the 15-day storage retention policy. Question-by-question marks and final scores are permanently preserved in your academic record."
        )

    # Prevent student access to annotated PDF before official publication
    is_student = bool(current_user and current_user.get("role") == "STUDENT")
    if is_student and sub_check and not (sub_check.get("publication_status") == "PUBLISHED" or sub_check.get("exam_is_published") == 1):
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Evaluation results for this examination have not been officially published yet. Graded PDFs will become available once officially released by academic faculty."
        )

    pdf_path = export_service.get_submission_pdf_path(clean_sub_id)
    if not pdf_path or not pdf_path.exists():
        raise HTTPException(status_code=404, detail="Annotated PDF not found or could not be generated.")

    if custom_filename:
        safe_name = custom_filename if custom_filename.lower().endswith(".pdf") else f"{custom_filename}.pdf"
    else:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT student_name, roll_number FROM submissions WHERE id = ?", (clean_sub_id,))
            row = cursor.fetchone()

        if row:
            raw_roll = (row["roll_number"] or "ROLL").strip()
            raw_name = (row["student_name"] or "Student").strip()
            base = f"{raw_roll}_{raw_name}_Graded"
            safe_base = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', base)
            safe_name = f"{safe_base}.pdf"
        else:
            safe_name = f"submission_{clean_sub_id[:8]}_graded.pdf"

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
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)
):
    return _resolve_pdf_response(submission_id, current_user=current_user)

@router.get("/pdf/{submission_id}/{filename}")
def download_annotated_pdf_with_name(
    submission_id: str,
    filename: str,
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)
):
    return _resolve_pdf_response(submission_id, custom_filename=filename, current_user=current_user)

def _resolve_zip_response(batch_id: str, custom_filename: Optional[str] = None):
    clean_batch_id = batch_id.removesuffix(".zip")
    zip_path = export_service.create_batch_zip(clean_batch_id)
    if not zip_path or not zip_path.exists():
        raise HTTPException(status_code=404, detail="Could not create batch ZIP archive.")

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM batches WHERE id = ?", (clean_batch_id,))
        row = cursor.fetchone()

    if row and row["name"]:
        raw_name = row["name"].strip()
        clean_name = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', raw_name)
        safe_name = f"{clean_name}_Graded_PDFs.zip"
    else:
        safe_name = f"Batch_{clean_batch_id[:8]}_Graded_PDFs.zip"

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
def download_batch_zip(batch_id: str):
    return _resolve_zip_response(batch_id)

@router.get("/batch-zip/{batch_id}/{filename}")
def download_batch_zip_with_name(batch_id: str, filename: str):
    return _resolve_zip_response(batch_id, custom_filename=filename)

@router.get("/marks-csv/{exam_id}")
@router.get("/marks-csv/{exam_id}/{filename}")
def download_marks_csv(exam_id: str, filename: Optional[str] = None):
    clean_exam_id = exam_id.removesuffix(".csv")
    csv_content = export_service.generate_exam_marks_csv(clean_exam_id)

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT title, subject FROM exams WHERE id = ?", (clean_exam_id,))
        row = cursor.fetchone()

    if row:
        base = f"{row['title']}_{row['subject']}_Marks".strip()
        clean_base = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', base)
        safe_name = f"{clean_base}.csv"
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
