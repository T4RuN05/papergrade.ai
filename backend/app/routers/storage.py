import asyncio
from pathlib import Path
from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import FileResponse
from sqlalchemy import select

from backend.app.config import settings
from backend.app.db.models import Batch, Exam, Student, Submission
from backend.app.db.session import get_session
from backend.app.services.auth import get_current_user
from backend.app.services.authorization import (
    is_exam_published,
    student_owns_submission,
    verify_staff_exam_scope,
)
from backend.app.services.storage import (
    LocalStorageService,
    build_remote_redirect_response,
    get_storage_service,
)

router = APIRouter(prefix="/api/storage", tags=["Storage"])


def _verify_student_path_token_match(current_user: Dict[str, Any], clean_key: str) -> bool:
    """Safely check whether student identity appears as a full path segment in a storage key."""
    segments = [seg.strip() for seg in clean_key.split("/") if seg.strip()]
    upper_segments = {seg.upper() for seg in segments}
    user_roll = (current_user.get("roll_number") or "").strip().upper()
    student_id = str(current_user.get("student_id") or "").strip()
    user_id = str(current_user.get("sub") or "").strip()

    if user_roll and user_roll in upper_segments:
        return True
    if student_id and (student_id in segments or student_id in clean_key):
        return True
    if user_id and (user_id in segments or user_id in clean_key):
        return True
    return False


def _authorize_storage_read(clean_key: str, current_user: Dict[str, Any]) -> None:
    """Enforce fail-closed RBAC + tenant + publication checks on storage downloads."""
    role = current_user.get("role")
    if role == "ROOT_ADMIN":
        return

    parts = clean_key.split("/")
    if role == "STUDENT":
        if clean_key.startswith("submissions/"):
            if not _verify_student_path_token_match(current_user, clean_key):
                raise HTTPException(status_code=403, detail="Forbidden: You cannot access another student's file.")
            exam_id = parts[1] if len(parts) > 1 else ""
            if exam_id:
                with get_session() as session:
                    ex = session.scalar(select(Exam).where(Exam.id == exam_id))
                    if ex:
                        user_inst = current_user.get("institute_id")
                        user_branch = current_user.get("branch_id")
                        if user_inst and ex.institute_id and ex.institute_id != user_inst:
                            raise HTTPException(status_code=403, detail="Forbidden: Exam belongs to another institute.")
                        if user_branch and ex.branch_id and ex.branch_id != user_branch:
                            raise HTTPException(status_code=403, detail="Forbidden: Exam belongs to another branch.")
            return

        if clean_key.startswith("exports/"):
            sub_id = Path(clean_key).name.replace("_annotated.pdf", "").replace(".pdf", "")
            user_id = current_user.get("sub", "")
            with get_session() as session:
                row = session.execute(
                    select(Submission, Exam)
                    .join(Exam, Submission.exam_id == Exam.id)
                    .where(Submission.id == sub_id)
                ).first()
                if not row:
                    raise HTTPException(status_code=404, detail="Submission export not found.")
                sub_obj, exam_obj = row
                stu_rec = session.scalar(select(Student.id).where(Student.user_id == user_id).limit(1))
                if not student_owns_submission(current_user, sub_obj.student_id, sub_obj.roll_number, db_student_id=stu_rec):
                    raise HTTPException(status_code=403, detail="Forbidden: You cannot access another student's graded export.")
                if not (sub_obj.publication_status == "PUBLISHED" or is_exam_published(exam_obj)):
                    raise HTTPException(status_code=403, detail="Forbidden: Results are not yet published.")
            return

        if clean_key.startswith("exams/") or clean_key.startswith("artifacts/"):
            exam_id = parts[1] if len(parts) > 1 else ""
            with get_session() as session:
                ex = session.scalar(select(Exam).where(Exam.id == exam_id))
                if not ex or not is_exam_published(ex):
                    raise HTTPException(
                        status_code=403,
                        detail="Forbidden: Examination materials are confidential until results are published.",
                    )
                user_inst = current_user.get("institute_id")
                user_branch = current_user.get("branch_id")
                if user_inst and ex.institute_id and ex.institute_id != user_inst:
                    raise HTTPException(status_code=403, detail="Forbidden: Exam belongs to another institute.")
                if user_branch and ex.branch_id and ex.branch_id != user_branch:
                    raise HTTPException(status_code=403, detail="Forbidden: Exam belongs to another branch.")
            return

        raise HTTPException(status_code=403, detail="Forbidden: Students may only access submissions, graded exports, and published exam materials.")

    # Non-root staff (INSTITUTE_DIRECTOR, BRANCH_MANAGER, TEACHER)
    with get_session() as session:
        if clean_key.startswith("exports/"):
            sub_id = Path(clean_key).name.replace("_annotated.pdf", "").replace(".pdf", "")
            row = session.execute(
                select(Exam.institute_id, Exam.branch_id, Batch.branch_id, Exam.id)
                .join(Submission, Submission.exam_id == Exam.id)
                .outerjoin(Batch, Submission.batch_id == Batch.id)
                .where(Submission.id == sub_id)
            ).first()
            if not row:
                raise HTTPException(status_code=404, detail="Submission export not found.")
            inst_id, ex_branch_id, batch_branch_id, exam_id = row
            verify_staff_exam_scope(current_user, inst_id, batch_branch_id or ex_branch_id, exam_id=exam_id)
            return

        if clean_key.startswith(("submissions/", "exams/", "artifacts/")):
            exam_id = parts[1] if len(parts) > 1 else ""
            ex = session.scalar(select(Exam).where(Exam.id == exam_id))
            if not ex:
                raise HTTPException(status_code=404, detail="Associated exam not found.")
            verify_staff_exam_scope(current_user, ex.institute_id, ex.branch_id, exam_id=ex.id)
            return

    raise HTTPException(status_code=403, detail="Forbidden: Access to this storage namespace is restricted.")


@router.get("/download")
def download_file(
    key: str = Query(..., description="Storage key of the file"),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    # Prevent directory traversal
    clean_key = key.replace("\\", "/").strip().lstrip("/")
    if ".." in clean_key:
        raise HTTPException(status_code=400, detail="Invalid storage key.")

    _authorize_storage_read(clean_key, current_user)

    storage = get_storage_service()
    if not storage.file_exists(clean_key):
        raise HTTPException(status_code=404, detail=f"Storage key '{clean_key}' not found.")

    filename = Path(clean_key).name.replace('"', "").replace("\r", "").replace("\n", "") or "file.pdf"
    redirect_resp = build_remote_redirect_response(storage, clean_key, filename=filename)
    if redirect_resp is not None:
        return redirect_resp

    media_type = (
        "application/pdf"
        if clean_key.lower().endswith(".pdf")
        else "image/png"
        if clean_key.lower().endswith(".png")
        else "application/octet-stream"
    )

    if isinstance(storage, LocalStorageService):
        local_path = storage.get_local_path_or_download(clean_key)
        if local_path.exists():
            return FileResponse(
                str(local_path),
                media_type=media_type,
                headers={"Content-Disposition": f'inline; filename="{filename}"'},
            )

    file_bytes = storage.download_file(clean_key)
    return Response(
        content=file_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )

@router.put("/upload")
async def upload_file_proxy(
    request: Request,
    key: str = Query(..., description="Storage key to write to"),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    clean_key = key.replace("\\", "/").strip().lstrip("/")
    if ".." in clean_key:
        raise HTTPException(status_code=400, detail="Invalid storage key.")

    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    content_len_hdr = request.headers.get("content-length")
    if content_len_hdr:
        try:
            if int(content_len_hdr) > max_bytes:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File exceeds maximum upload size of {settings.MAX_UPLOAD_SIZE_MB} MB.",
                )
        except ValueError:
            pass

    role = current_user.get("role")
    # Ownership & namespace enforcement BEFORE reading request body into RAM
    if role == "STUDENT":
        if not clean_key.startswith("submissions/"):
            raise HTTPException(status_code=403, detail="Forbidden: Students may only upload to submission directories.")
        if not _verify_student_path_token_match(current_user, clean_key):
            raise HTTPException(status_code=403, detail="Forbidden: You can only upload to your own submission path.")
    elif role != "ROOT_ADMIN":
        if not clean_key.startswith(("submissions/", "exams/")):
            raise HTTPException(status_code=403, detail="Forbidden: Invalid upload storage namespace.")
        parts = clean_key.split("/")
        exam_id = parts[1] if len(parts) > 1 else ""
        if exam_id:
            with get_session() as session:
                ex = session.scalar(select(Exam).where(Exam.id == exam_id))
                if ex:
                    verify_staff_exam_scope(current_user, ex.institute_id, ex.branch_id, exam_id=ex.id)

    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="Empty file payload")

    if len(body) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum upload size of {settings.MAX_UPLOAD_SIZE_MB} MB."
        )

    # Validate file magic bytes
    content_type = request.headers.get("content-type", "application/pdf").lower()
    if clean_key.lower().endswith(".pdf") or "pdf" in content_type:
        if not body.startswith(b"%PDF-"):
            raise HTTPException(status_code=400, detail="Invalid PDF file: Missing %PDF- magic bytes header.")
    elif clean_key.lower().endswith(".png") or "png" in content_type:
        if not body.startswith(b"\x89PNG\r\n\x1a\n"):
            raise HTTPException(status_code=400, detail="Invalid PNG file: Missing PNG magic bytes header.")
    elif clean_key.lower().endswith((".jpg", ".jpeg")) or "jpeg" in content_type:
        if not body.startswith(b"\xff\xd8\xff"):
            raise HTTPException(status_code=400, detail="Invalid JPEG file: Missing JPEG magic bytes header.")

    storage = get_storage_service()
    # D-08: Offload synchronous WAN upload from event loop to worker thread
    await asyncio.to_thread(storage.upload_file, body, clean_key, content_type=content_type)
    return {"status": "success", "key": clean_key, "size_bytes": len(body)}
