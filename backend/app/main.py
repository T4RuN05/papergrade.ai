from typing import Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.app.config import settings
from backend.app.database import init_db, get_db
from backend.app.worker.queue_worker import queue_worker
from backend.app.routers import (
    exams,
    submissions,
    grading,
    analytics,
    exports,
    auth,
    tenancy,
    windows,
    storage,
    revaluation,
    notifications,
    students,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure tables exist and start persistent queue worker
    init_db()
    queue_worker.start()
    yield
    # Shutdown: stop worker cleanly
    queue_worker.stop()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Enterprise AI answer sheet evaluation platform with multi-tenant RBAC, Notion aesthetic, and multi-key quota management.",
    lifespan=lifespan
)

# CORS configuration for Next.js PWA, Vercel deployments, and Admin console
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Type", "Content-Length"],
)

# Startup: include v1 routers
app.include_router(auth.router)
app.include_router(tenancy.router)
app.include_router(windows.router)
app.include_router(storage.router)
app.include_router(exams.router, prefix="/api/v1/exams")
app.include_router(exams.router, prefix="/api/exams")
app.include_router(submissions.router, prefix="/api/v1/submissions")
app.include_router(submissions.router, prefix="/api/submissions")
app.include_router(revaluation.router)
app.include_router(notifications.router)
app.include_router(students.router)

# Include legacy/core routers for backward compatibility
app.include_router(grading.router)
app.include_router(analytics.router)
app.include_router(exports.router)

@app.get("/api/batches")
def get_batches_shortcut(branch_id: Optional[str] = None):
    with get_db() as conn:
        cursor = conn.cursor()
        if branch_id:
            cursor.execute("SELECT * FROM batches WHERE branch_id = ? ORDER BY created_at DESC", (branch_id,))
        else:
            cursor.execute("SELECT * FROM batches ORDER BY created_at DESC")
        return [dict(r) for r in cursor.fetchall()]

@app.get("/api/batches/{batch_id}")
def get_batch_by_id(batch_id: str):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM batches WHERE id = ?", (batch_id,))
        row = cursor.fetchone()
        if not row:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Batch not found")
        batch_d = dict(row)
        cursor.execute("SELECT * FROM submissions WHERE batch_id = ? ORDER BY roll_number ASC", (batch_id,))
        batch_d["submissions"] = [dict(s) for s in cursor.fetchall()]
        return batch_d

@app.get("/")
def root():
    return {
        "status": "online",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "message": "PaperGrade AI Backend API is running successfully.",
        "docs": "/docs",
        "status_check": "/api/status"
    }

@app.get("/api/health")
def health_check():
    from backend.app.services.storage import get_storage_service
    storage = get_storage_service()
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "gemini_live": settings.is_gemini_configured,
        "model": settings.GEMINI_MODEL,
        "storage": type(storage).__name__
    }

@app.get("/api/status")
def system_status():
    def _val(row):
        if not row:
            return 0
        if isinstance(row, dict):
            return list(row.values())[0]
        try:
            return row[0]
        except Exception:
            return 0

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) AS cnt FROM exams")
        exam_count = _val(cursor.fetchone())
        cursor.execute("SELECT COUNT(*) AS cnt FROM submissions")
        sub_count = _val(cursor.fetchone())
        cursor.execute("SELECT COUNT(*) AS cnt FROM submissions WHERE status = 'QUEUED'")
        queued_count = _val(cursor.fetchone())
        cursor.execute("SELECT COUNT(*) AS cnt FROM api_usage_events")
        api_events_count = _val(cursor.fetchone())

    return {
        "gemini_configured": settings.is_gemini_configured,
        "active_api_keys": len(settings.configured_api_keys),
        "model": settings.GEMINI_MODEL,
        "mode": "LIVE_GEMINI" if settings.is_gemini_configured else "DEMO_MOCK",
        "total_exams": exam_count,
        "total_submissions": sub_count,
        "queued_jobs": queued_count,
        "total_api_calls_recorded": api_events_count,
        "storage_dirs": {
            "uploads": str(settings.UPLOADS_DIR),
            "renders": str(settings.RENDERS_DIR),
            "exports": str(settings.EXPORTS_DIR)
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
