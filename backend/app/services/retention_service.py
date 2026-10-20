import shutil
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List

from backend.app.config import settings
from backend.app.database import get_db, get_iso_now
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
        """
        now = get_iso_now()
        actual_graded_at = graded_at_iso or now
        actual_ttl = ttl_days if ttl_days is not None else settings.SUBMISSION_RETENTION_DAYS
        expires_at = RetentionService.calculate_retention_expiry(actual_graded_at, actual_ttl)

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
    def get_retention_info(sub: Dict[str, Any]) -> Dict[str, Any]:
        """
        Calculates time remaining and purge state for a submission.
        """
        is_purged = bool(sub.get("is_document_purged"))
        graded_at = sub.get("graded_at")
        expires_at = sub.get("retention_expires_at")
        purged_at = sub.get("purged_at")
        ttl_days = sub.get("ttl_days") or settings.SUBMISSION_RETENTION_DAYS

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
        pub_iso = sub.get("published_at") or graded_at or sub.get("created_at")
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

        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, original_file_path, canonical_pdf_path, annotated_pdf_path, is_document_purged
                FROM submissions
                WHERE id = ?
            """, (submission_id,))
            sub = cursor.fetchone()

            if not sub:
                return {"status": "not_found", "submission_id": submission_id}

            if sub["is_document_purged"]:
                return {"status": "already_purged", "submission_id": submission_id}

            # 1. Delete files from object storage (Cloudinary / R2 / local)
            for path_key in [sub["original_file_path"], sub["canonical_pdf_path"], sub["annotated_pdf_path"]]:
                if path_key and path_key not in ["", "PURGED"]:
                    try:
                        storage.delete_file(path_key)
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
            cursor.execute("""
                DELETE FROM answer_regions
                WHERE answer_id IN (SELECT id FROM answers WHERE submission_id = ?)
            """, (submission_id,))
            deleted_regions = cursor.rowcount

            # 5. Update submission record: mark purged, clear document paths
            cursor.execute("""
                UPDATE submissions
                SET is_document_purged = 1,
                    purged_at = ?,
                    original_file_path = '',
                    canonical_pdf_path = '',
                    annotated_pdf_path = NULL,
                    updated_at = ?
                WHERE id = ?
            """, (now, now, submission_id))

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

        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, question_paper_path, answer_key_path, is_document_purged
                FROM exams
                WHERE id = ?
            """, (exam_id,))
            exam = cursor.fetchone()

            if not exam:
                return {"status": "not_found", "exam_id": exam_id}

            if exam["is_document_purged"]:
                return {"status": "already_purged", "exam_id": exam_id}

            # 1. Delete files from object storage (Cloudinary / R2 / local)
            for path_key in [exam["question_paper_path"], exam["answer_key_path"]]:
                if path_key and path_key not in ["", "PURGED"]:
                    try:
                        storage.delete_file(path_key)
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
            cursor.execute("""
                UPDATE exams
                SET is_document_purged = 1,
                    purged_at = ?,
                    question_paper_path = '',
                    answer_key_path = '',
                    updated_at = ?
                WHERE id = ?
            """, (now, now, exam_id))

        return {
            "status": "purged",
            "exam_id": exam_id,
            "purged_at": now
        }

    @staticmethod
    def check_and_purge_expired_submissions() -> Dict[str, Any]:
        """
        Scans all graded/completed submissions and published exams,
        purging those whose 15-day TTL has expired.
        """
        now_dt = datetime.now(timezone.utc)
        now_iso = now_dt.isoformat()
        purged_sub_ids = []
        purged_exam_ids = []

        with get_db() as conn:
            cursor = conn.cursor()
            # 1. Scan submissions
            cursor.execute("""
                SELECT id, retention_expires_at
                FROM submissions
                WHERE (is_document_purged = 0 OR is_document_purged IS NULL)
                  AND retention_expires_at IS NOT NULL
                  AND retention_expires_at != ''
                  AND status IN ('COMPLETED', 'NEEDS_REVIEW', 'GRADED')
            """)
            sub_rows = cursor.fetchall()

            # 2. Scan published exams
            cursor.execute("""
                SELECT id, retention_expires_at
                FROM exams
                WHERE is_published = 1
                  AND (is_document_purged = 0 OR is_document_purged IS NULL)
                  AND retention_expires_at IS NOT NULL
                  AND retention_expires_at != ''
            """)
            exam_rows = cursor.fetchall()

        for r in sub_rows:
            sub_id = r["id"]
            exp_iso = r["retention_expires_at"]
            try:
                exp_dt = datetime.fromisoformat(exp_iso.replace("Z", "+00:00"))
                if now_dt >= exp_dt:
                    RetentionService.purge_submission_documents(sub_id)
                    purged_sub_ids.append(sub_id)
            except Exception:
                continue

        for r in exam_rows:
            ex_id = r["id"]
            exp_iso = r["retention_expires_at"]
            try:
                exp_dt = datetime.fromisoformat(exp_iso.replace("Z", "+00:00"))
                if now_dt >= exp_dt:
                    RetentionService.purge_exam_documents(ex_id)
                    purged_exam_ids.append(ex_id)
            except Exception:
                continue

        return {
            "scanned_submissions": len(sub_rows),
            "purged_submissions": len(purged_sub_ids),
            "purged_submissions_count": len(purged_sub_ids),
            "purged_submission_ids": purged_sub_ids,
            "scanned_exams": len(exam_rows),
            "purged_exams": len(purged_exam_ids),
            "purged_exams_count": len(purged_exam_ids),
            "purged_exam_ids": purged_exam_ids,
        }

retention_service = RetentionService()
