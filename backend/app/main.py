from typing import Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.app.config import settings
from backend.app.db.session import get_session
from backend.app.db.models import Batch, Submission, Exam, ApiUsageEvent
from sqlalchemy import select, func
from backend.app.database import init_db
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
    reports,
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
app.include_router(reports.router, prefix="/api/v1/reports")
app.include_router(reports.router, prefix="/api/reports")

# Include legacy/core routers for backward compatibility
app.include_router(grading.router)
app.include_router(analytics.router)
app.include_router(exports.router)

@app.get("/api/batches")
def get_batches_shortcut(branch_id: Optional[str] = None):
    with get_session() as session:
        stmt = select(Batch)
        if branch_id:
            stmt = stmt.where(Batch.branch_id == branch_id)
        stmt = stmt.order_by(Batch.created_at.desc())
        batches = session.scalars(stmt).all()
        return [
            {
                "id": b.id,
                "branch_id": b.branch_id,
                "name": b.name,
                "code": b.code,
                "academic_year": b.academic_year,
                "created_at": b.created_at,
                "updated_at": b.updated_at,
            }
            for b in batches
        ]

@app.get("/api/batches/{batch_id}")
def get_batch_by_id(batch_id: str):
    with get_session() as session:
        batch = session.scalar(select(Batch).where(Batch.id == batch_id))
        if not batch:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Batch not found")
        submissions = session.scalars(
            select(Submission).where(Submission.batch_id == batch_id).order_by(Submission.roll_number.asc())
        ).all()
        return {
            "id": batch.id,
            "branch_id": batch.branch_id,
            "name": batch.name,
            "code": batch.code,
            "academic_year": batch.academic_year,
            "created_at": batch.created_at,
            "updated_at": batch.updated_at,
            "submissions": [
                {
                    "id": s.id,
                    "roll_number": s.roll_number,
                    "student_name": s.student_name,
                    "submission_status": s.submission_status,
                    "status": s.status,
                    "total_awarded_marks": s.total_awarded_marks,
                    "max_marks": s.max_marks,
                    "percentage": s.percentage,
                    "created_at": s.created_at,
                }
                for s in submissions
            ]
        }

@app.api_route("/", methods=["GET", "HEAD"])
def root():
    return {
        "status": "online",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "message": "PaperGrade AI Backend API is running successfully.",
        "docs": "/docs",
        "status_check": "/api/status"
    }

@app.api_route("/api/health", methods=["GET", "HEAD"])
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

@app.api_route("/api/status", methods=["GET", "HEAD"])
def system_status():
    with get_session() as session:
        exam_count = session.scalar(select(func.count(Exam.id))) or 0
        sub_count = session.scalar(select(func.count(Submission.id))) or 0
        queued_count = session.scalar(select(func.count(Submission.id)).where(Submission.status == 'QUEUED')) or 0
        api_events_count = session.scalar(select(func.count(ApiUsageEvent.id))) or 0

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

@app.exception_handler(Exception)
async def generic_exception_handler(request, exc):
    import traceback
    import logging
    logging.getLogger("uvicorn.error").error(f"Unhandled server error on {request.method} {request.url}: {exc}\n{traceback.format_exc()}")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}"},
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
