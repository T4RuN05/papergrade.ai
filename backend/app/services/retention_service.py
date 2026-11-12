import shutil
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import select, delete, update

from backend.app.config import settings
from backend.app.db.session import get_session
from backend.app.db.base import get_iso_now
from backend.app.db.models import Submission, Exam, Answer, AnswerRegion, Institute
from backend.app.services.storage import get_storage_service


class RetentionService:
    """
    Manages the 15-day storage retention lifecycle for student submissions.
    
    POLICY:
    - Default TTL of 15 calendar days starts immediately after the student answer sheet is graded.
    - Until graded, there is NO TTL.
    - Re-evaluation requests remain open for 7 calendar days after marks are released.
    - Once 15 days elapse post-grading:
        1. Raw submission PDFs, canonical PDFs, and annotated PDFs are deleted from Cloudinary / R2 / local storage.
        2. Rendered page images and crop previews are deleted from local disk cache.
        3. Bounding box coordinates (answer_regions table) are purged from the database to conserve space.
        4. ONLY question-by-question marks, max marks, totals, and faculty review decisions remain permanently archived.
    """

    @staticmethod
    def calculate_retention_expiry(graded_at_iso: str, ttl_days: int = 15) -> str:
        try:
            graded_dt = datetime.fromisoformat(graded_at_iso.replace("Z", "+00:00"))
        except Exception:
            graded_dt = datetime.now(timezone.utc)
        expiry_dt = graded_dt + timedelta(days=ttl_days)
        return expiry_dt.isoformat()

    @staticmethod
    def mark_submission_graded(
        cursor,
        submission_id: str,
        graded_at_iso: Optional[str] = None,
        ttl_days: Optional[int] = None
    ) -> Dict[str, str]:
        """
        Records the grading timestamp and sets the 15-day expiration deadline.
        Supports both SQLAlchemy Session and legacy DBAPI cursor.
        """
        now = get_iso_now()
        actual_graded_at = graded_at_iso or now
        actual_ttl = ttl_days if ttl_days is not None else settings.SUBMISSION_RETENTION_DAYS
        expires_at = RetentionService.calculate_retention_expiry(actual_graded_at, actual_ttl)

        if isinstance(cursor, Session):
            sub = cursor.scalar(select(Submission).where(Submission.id == submission_id))
            if sub:
                if not sub.graded_at:
                    sub.graded_at = actual_graded_at
                sub.ttl_days = actual_ttl
                if not sub.retention_expires_at:
                    sub.retention_expires_at = expires_at
                sub.updated_at = now
        else:
            cursor.execute("""
                UPDATE submissions
                SET graded_at = COALESCE(graded_at, ?),
                    ttl_days = ?,
                    retention_expires_at = COALESCE(retention_expires_at, ?),
                    updated_at = ?
                WHERE id = ?
            """, (actual_graded_at, actual_ttl, expires_at, now, submission_id))

        return {
            "graded_at": actual_graded_at,
            "ttl_days": str(actual_ttl),
            "retention_expires_at": expires_at
        }

    @staticmethod
    def get_retention_info(sub: Any) -> Dict[str, Any]:
        """
        Calculates time remaining and purge state for a submission.
        Supports both dictionary records and SQLAlchemy ORM Submission models.
        """
        def _get(key: str, default: Any = None) -> Any:
            if isinstance(sub, dict):
                return sub.get(key, default)
            return getattr(sub, key, default)

        is_purged = bool(_get("is_document_purged"))
        graded_at = _get("graded_at")
        expires_at = _get("retention_expires_at")
        purged_at = _get("purged_at")
        ttl_days = _get("ttl_days") or settings.SUBMISSION_RETENTION_DAYS

        if not expires_at and graded_at:
            expires_at = RetentionService.calculate_retention_expiry(graded_at, ttl_days)

        now_dt = datetime.now(timezone.utc)
        days_remaining = None
        seconds_remaining = 0
        is_expired = False

        if expires_at:
            try:
                exp_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                diff = exp_dt - now_dt
                sec = int(diff.total_seconds())
                if sec <= 0:
                    is_expired = True
                    seconds_remaining = 0
                    days_remaining = 0.0
                else:
                    seconds_remaining = sec
                    days_remaining = round(sec / 86400.0, 1)
            except Exception:
                is_expired = False

        if is_purged:
            is_expired = True
            days_remaining = 0.0
            seconds_remaining = 0

        # Also calculate revaluation days remaining (7-day window from publication/grading)
        pub_iso = _get("published_at") or graded_at or _get("created_at")
        reval_days_left = 0.0
        reval_open = False
        if pub_iso:
            try:
                pub_dt = datetime.fromisoformat(pub_iso.replace("Z", "+00:00"))
                reval_exp = pub_dt + timedelta(days=settings.REVALUATION_WINDOW_DAYS)
                reval_sec = int((reval_exp - now_dt).total_seconds())
                if reval_sec > 0:
                    reval_open = True
                    reval_days_left = round(reval_sec / 86400.0, 1)
            except Exception:
                pass

        return {
            "is_document_purged": is_purged or is_expired,
            "purged_at": purged_at,
            "graded_at": graded_at,
            "ttl_days": ttl_days,
            "retention_expires_at": expires_at,
            "days_remaining": days_remaining,
            "seconds_remaining": seconds_remaining,
            "is_expired": is_expired,
            "revaluation_days_remaining": reval_days_left,
            "revaluation_window_open": reval_open,
            "storage_notice": (
                "Document permanently purged after 15-day retention policy. Question marks and scores are permanently archived."
                if (is_purged or is_expired)
                else f"Graded PDF document will be permanently deleted {days_remaining} days post-evaluation to optimize storage. Download your copy to avoid losing access."
            )
        }

    @staticmethod
    def purge_submission_documents(submission_id: str) -> Dict[str, Any]:
        """
        Permanently deletes storage files, local renders, and database bounding box coordinates,
        preserving only marks per question and scores.
        """
        now = get_iso_now()
        storage = get_storage_service()

        with get_session() as session:
            sub = session.scalar(select(Submission).where(Submission.id == submission_id))

            if not sub:
                return {"status": "not_found", "submission_id": submission_id}

            if sub.is_document_purged:
                return {"status": "already_purged", "submission_id": submission_id}

            # 1. Delete files from object storage (Cloudinary / R2 / local)
            for path_key in [
                sub.original_file_path,
                sub.canonical_pdf_path,
                sub.annotated_pdf_path,
                f"exports/{submission_id}_annotated.pdf",
            ]:
                if path_key and path_key not in ["", "PURGED"]:
                    try:
                        storage.delete_file(path_key)
                    except Exception:
                        pass

            try:
                storage.delete_prefix(f"renders/{submission_id}/")
            except Exception:
                pass

            # 2. Delete local rendered page images and crop folders
            renders_sub_dir = settings.RENDERS_DIR / submission_id
            if renders_sub_dir.exists():
                shutil.rmtree(renders_sub_dir, ignore_errors=True)

            # 3. Delete local annotated export PDF if cached
            annotated_pdf = settings.EXPORTS_DIR / f"{submission_id}_annotated.pdf"
            if annotated_pdf.exists():
                try:
                    annotated_pdf.unlink()
                except Exception:
                    pass

            # 4. Delete bounding box coordinates from database (answer_regions table)
            ans_ids_stmt = select(Answer.id).where(Answer.submission_id == submission_id)
            del_result = session.execute(
                delete(AnswerRegion).where(AnswerRegion.answer_id.in_(ans_ids_stmt))
            )
            deleted_regions = del_result.rowcount

            # 5. Update submission record: mark purged, clear document paths
            sub.is_document_purged = 1
            sub.purged_at = now
            sub.original_file_path = ''
            sub.canonical_pdf_path = ''
            sub.annotated_pdf_path = None
            sub.updated_at = now

            session.commit()

        return {
            "status": "purged",
            "submission_id": submission_id,
            "purged_at": now,
            "deleted_bounding_boxes": deleted_regions
        }

    @staticmethod
    def purge_exam_documents(exam_id: str) -> Dict[str, Any]:
        """
        Permanently deletes Question Paper and Answer Key documents and rendered caches
        associated with an exam after the 15-day retention TTL expires post-publication.
        Scores and question-level evaluation marks remain permanently archived.
        """
        now = get_iso_now()
        storage = get_storage_service()

        with get_session() as session:
            exam = session.scalar(select(Exam).where(Exam.id == exam_id))

            if not exam:
                return {"status": "not_found", "exam_id": exam_id}

            if exam.is_document_purged:
                return {"status": "already_purged", "exam_id": exam_id}

            # 1. Delete files from object storage (Cloudinary / R2 / local)
            for path_key in [
                exam.question_paper_path,
                exam.answer_key_path,
                f"exams/{exam_id}/question_paper.pdf",
                f"exams/{exam_id}/answer_key.pdf",
            ]:
                if path_key and path_key not in ["", "PURGED"]:
                    try:
                        storage.delete_file(path_key)
                    except Exception:
                        pass

            try:
                storage.delete_prefix(f"renders/exam_{exam_id}_")
            except Exception:
                pass

            # 2. Delete local exam uploads directory
            exam_uploads_dir = settings.UPLOADS_DIR / f"exam_{exam_id}"
            if exam_uploads_dir.exists():
                shutil.rmtree(exam_uploads_dir, ignore_errors=True)

            # 3. Delete pre-rendered page images in renders directory
            for art in ["question-paper", "answer-key", "question_paper", "answer_key"]:
                render_dir = settings.RENDERS_DIR / f"exam_{exam_id}_{art}"
                if render_dir.exists():
                    shutil.rmtree(render_dir, ignore_errors=True)

            # 4. Mark exam documents as purged in database
            exam.is_document_purged = 1
            exam.purged_at = now
            exam.question_paper_path = ''
            exam.answer_key_path = ''
            exam.updated_at = now

            session.commit()

        return {
            "status": "purged",
            "exam_id": exam_id,
            "purged_at": now
        }

    @staticmethod
    def purge_expired_institutes(grace_days: int = 7) -> List[Dict[str, Any]]:
        """
        Permanently purges institutes that have remained in soft-delete status
        beyond the 7-day recovery grace period.
        """
        now_dt = datetime.now(timezone.utc)
        cutoff = (now_dt - timedelta(days=grace_days)).isoformat()
        purged = []

        from backend.app.routers.tenancy import purge_institute_cascade

        with get_session() as session:
            expired_insts = session.scalars(
                select(Institute).where(
                    Institute.is_deleted == 1,
                    Institute.deleted_at.isnot(None),
                    Institute.deleted_at <= cutoff
                )
            ).all()
            candidates = [(i.id, i.name, i.code, i.deleted_at) for i in expired_insts]

        for inst_id, name, code, del_at in candidates:
            try:
                with get_session() as session:
                    res = purge_institute_cascade(session, inst_id, caller_email="RetentionDaemon/AutoPurge")
                    purged.append({
                        "id": inst_id,
                        "name": name,
                        "code": code,
                        "deleted_at": del_at,
                        "details": res
                    })
            except Exception as e:
                import logging
                logging.getLogger(__name__).error(f"Failed to auto-purge expired institute {inst_id}: {e}")

        return purged

    @staticmethod
    def purge_expired_password_resets() -> int:
        """Purge expired password reset requests to keep auth tables lean."""
        now_iso = get_iso_now()
        with get_session() as session:
            from backend.app.db.models.auth import PasswordResetRequest
            res = session.execute(
                delete(PasswordResetRequest).where(
                    PasswordResetRequest.expires_at.isnot(None),
                    PasswordResetRequest.expires_at < now_iso
                )
            )
            session.commit()
            return res.rowcount if res and res.rowcount else 0

    @staticmethod
    def check_and_purge_expired_submissions() -> Dict[str, Any]:
        """
        Comprehensive automated maintenance sweep:
        1. Purges student submission PDFs & bounding regions after 15-day TTL post-grading.
        2. Purges exam PDFs & page renders after 15-day TTL post-publication.
        3. Permanently deletes soft-deleted institutes past their 7-day recovery grace period.
        4. Prunes stale user notifications, strictly keeping only the 50 latest per user.
        5. Purges expired password reset tokens.
        """
        now_dt = datetime.now(timezone.utc)
        purged_sub_ids = []
        purged_exam_ids = []

        with get_session() as session:
            # 1. Scan submissions
            subs = session.scalars(
                select(Submission).where(
                    Submission.is_document_purged == 0,
                    Submission.retention_expires_at.isnot(None),
                    Submission.retention_expires_at != '',
                    Submission.status.in_(['COMPLETED', 'NEEDS_REVIEW', 'GRADED'])
                )
            ).all()
            sub_candidates = [(s.id, s.retention_expires_at) for s in subs]

            # 2. Scan published exams
            exams = session.scalars(
                select(Exam).where(
                    Exam.is_published == 1,
                    Exam.is_document_purged == 0,
                    Exam.retention_expires_at.isnot(None),
                    Exam.retention_expires_at != ''
                )
            ).all()
            exam_candidates = [(e.id, e.retention_expires_at) for e in exams]

        for sub_id, exp_iso in sub_candidates:
            try:
                exp_dt = datetime.fromisoformat(exp_iso.replace("Z", "+00:00"))
                if now_dt >= exp_dt:
                    RetentionService.purge_submission_documents(sub_id)
                    purged_sub_ids.append(sub_id)
            except Exception:
                continue

        for ex_id, exp_iso in exam_candidates:
            try:
                exp_dt = datetime.fromisoformat(exp_iso.replace("Z", "+00:00"))
                if now_dt >= exp_dt:
                    RetentionService.purge_exam_documents(ex_id)
                    purged_exam_ids.append(ex_id)
            except Exception:
                continue

        # 3. Purge soft-deleted institutes past 7-day recovery grace period
        purged_institutes = RetentionService.purge_expired_institutes(grace_days=7)

        # 4. Prune notifications older than 50 per user
        pruned_notifs_count = 0
        try:
            from backend.app.services.notification_service import prune_all_notifications
            pruned_notifs_count = prune_all_notifications(keep_limit=50)
        except Exception:
            pass

        # 5. Purge expired password resets
        purged_resets_count = 0
        try:
            purged_resets_count = RetentionService.purge_expired_password_resets()
        except Exception:
            pass

        return {
            "scanned_submissions": len(sub_candidates),
            "purged_submissions": len(purged_sub_ids),
            "purged_submissions_count": len(purged_sub_ids),
            "purged_submission_ids": purged_sub_ids,
            "scanned_exams": len(exam_candidates),
            "purged_exams": len(purged_exam_ids),
            "purged_exams_count": len(purged_exam_ids),
            "purged_exam_ids": purged_exam_ids,
            "purged_institutes_count": len(purged_institutes),
            "purged_institutes": purged_institutes,
            "pruned_notifications_count": pruned_notifs_count,
            "purged_password_resets_count": purged_resets_count,
        }

retention_service = RetentionService()
