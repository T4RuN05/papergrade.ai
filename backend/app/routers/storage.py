from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse, Response
from pathlib import Path

from backend.app.services.storage import get_storage_service, LocalStorageService

router = APIRouter(prefix="/api/v1/storage", tags=["Storage"])

@router.get("/download")
def download_file(key: str = Query(..., description="Storage key of the file")):
    storage = get_storage_service()
    if not storage.file_exists(key):
        raise HTTPException(status_code=404, detail=f"Storage key '{key}' not found.")
    
    file_bytes = storage.download_file(key)
    filename = Path(key).name or "file.pdf"
    
    # Infer media type
    media_type = "application/pdf" if key.lower().endswith(".pdf") else "image/png" if key.lower().endswith(".png") else "application/octet-stream"
    
    return Response(
        content=file_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'}
    )

@router.put("/upload")
async def upload_file_proxy(request: Request, key: str = Query(..., description="Storage key to write to")):
    storage = get_storage_service()
    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="Empty file payload")
    
    content_type = request.headers.get("content-type", "application/pdf")
    storage.upload_file(body, key, content_type=content_type)
    return {"status": "success", "key": key, "size_bytes": len(body)}
