from typing import Dict, Any
from fastapi import APIRouter, HTTPException, Query, Request, Response, Depends, status
from fastapi.responses import FileResponse, Response
from pathlib import Path

from backend.app.config import settings
from backend.app.services.storage import get_storage_service, LocalStorageService
from backend.app.services.auth import get_current_user

router = APIRouter(prefix="/api/v1/storage", tags=["Storage"])

@router.get("/download")
def download_file(
    key: str = Query(..., description="Storage key of the file"),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    # Prevent directory traversal
    clean_key = key.replace("\\", "/").strip().lstrip("/")
    if ".." in clean_key:
        raise HTTPException(status_code=400, detail="Invalid storage key.")

    # Student isolation: can only download own submission files or exam materials
    if current_user.get("role") == "STUDENT":
        user_roll = (current_user.get("roll_number") or "").strip().upper()
        user_id = current_user.get("sub", "")
        # If it's a submission key, it must contain student's roll or user id
        if clean_key.startswith("submissions/"):
            if user_roll and (f"/{user_roll}/" not in clean_key and not clean_key.endswith(f"/{user_roll}")):
                if user_id not in clean_key and current_user.get("student_id") not in clean_key:
                    raise HTTPException(status_code=403, detail="Forbidden: You cannot access another student's file.")
        elif not (clean_key.startswith("artifacts/") or clean_key.startswith("exams/")):
            raise HTTPException(status_code=403, detail="Forbidden: Students may only access submissions and published exam materials.")

    storage = get_storage_service()
    if not storage.file_exists(clean_key):
        raise HTTPException(status_code=404, detail=f"Storage key '{clean_key}' not found.")
    
    file_bytes = storage.download_file(clean_key)
    filename = Path(clean_key).name or "file.pdf"
    
    # Infer media type
    media_type = "application/pdf" if clean_key.lower().endswith(".pdf") else "image/png" if clean_key.lower().endswith(".png") else "application/octet-stream"
    
    return Response(
        content=file_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'}
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

    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="Empty file payload")

    # Enforce file size limit
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(body) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum upload size of {settings.MAX_UPLOAD_SIZE_MB} MB."
        )

    # Student isolation: students can only upload to submissions/{exam_id}/{their_roll}/
    if current_user.get("role") == "STUDENT":
        user_roll = (current_user.get("roll_number") or "").strip().upper()
        if not clean_key.startswith("submissions/"):
            raise HTTPException(status_code=403, detail="Forbidden: Students may only upload to submission directories.")
        if user_roll and f"/{user_roll}/" not in clean_key and not clean_key.endswith(f"/{user_roll}"):
            if current_user.get("student_id") not in clean_key:
                raise HTTPException(status_code=403, detail=f"Forbidden: You can only upload to your own submission path.")

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
    storage.upload_file(body, clean_key, content_type=content_type)
    return {"status": "success", "key": clean_key, "size_bytes": len(body)}
