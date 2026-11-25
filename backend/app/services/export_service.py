import io
import os
import csv
import shutil
import threading
import uuid
import zipfile
import json
from pathlib import Path
from typing import Optional, Dict, Any
from sqlalchemy import select

from backend.app.config import settings
from backend.app.db.session import get_session
from backend.app.db.models import Submission, RubricVersion, Answer
from backend.app.services.grading_service import grading_service
from backend.app.services.storage import get_storage_service, is_remote_storage

_export_locks_guard = threading.Lock()
_export_locks: Dict[str, threading.Lock] = {}
_CSV_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _get_batch_lock(batch_id: str) -> threading.Lock:
    with _export_locks_guard:
        lock = _export_locks.get(batch_id)
        if lock is None:
            lock = threading.Lock()
            _export_locks[batch_id] = lock
        return lock


def _sanitize_csv_cell(value: Any) -> Any:
    """Escape leading spreadsheet formula characters to neutralize CSV injection."""
    if value is None:
        return ""
    if isinstance(value, (int, float)):
        return value
    text = str(value)
    if text.startswith(_CSV_FORMULA_PREFIXES):
        return "'" + text
    return text


class ExportService:
    @staticmethod
    def get_submission_pdf_path(submission_id: str) -> Optional[Path]:
        annotated_path = settings.EXPORTS_DIR / f"{submission_id}_annotated.pdf"
        if not annotated_path.exists():
            storage = get_storage_service()
            remote_key = f"exports/{submission_id}_annotated.pdf"
            if (
                not grading_service.is_export_dirty(submission_id)
                and is_remote_storage(storage)
                and storage.file_exists(remote_key)
            ):
                try:
                    cached = storage.get_local_path_or_download(remote_key)
                    if cached and cached.exists():
                        annotated_path.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(cached, annotated_path)
                        return annotated_path
                except Exception:
                    pass
            grading_service.generate_export_pdf_for_submission(submission_id)
        if annotated_path.exists():
            return annotated_path
        return None

    @staticmethod
    def create_batch_zip(batch_id: str) -> Optional[Path]:
        """
        Creates an atomic ZIP archive containing annotated PDFs for graded, non-purged submissions in the batch.
        """
        zip_path = settings.EXPORTS_DIR / f"batch_{batch_id}_graded_pdfs.zip"
        with get_session() as session:
            submissions = session.scalars(
                select(Submission).where(
                    Submission.batch_id == batch_id,
                    Submission.submission_status == 'SUBMITTED',
                    Submission.is_document_purged == 0,
                    Submission.status.in_(["COMPLETED", "NEEDS_REVIEW", "GRADED"]),
                )
            ).all()

            if not submissions:
                return None

            sub_records = [
                {
                    "id": s.id,
                    "roll": s.roll_number or "unknown",
                    "name": (s.student_name or "student").replace(" ", "_")
                }
                for s in submissions
            ]

        lock = _get_batch_lock(batch_id)
        tmp_zip = settings.EXPORTS_DIR / f".batch_{batch_id}_graded_pdfs.{uuid.uuid4().hex}.tmp"
        with lock:
            try:
                settings.EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
                with zipfile.ZipFile(tmp_zip, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                    for sub in sub_records:
                        sub_id = sub["id"]
                        roll = sub["roll"]
                        name = sub["name"]
                        pdf_path = ExportService.get_submission_pdf_path(sub_id)
                        if pdf_path and pdf_path.exists():
                            arc_name = f"{roll}_{name}_graded.pdf"
                            zip_file.write(pdf_path, arcname=arc_name)
                os.replace(tmp_zip, zip_path)
            except Exception:
                if tmp_zip.exists():
                    try:
                        tmp_zip.unlink()
                    except OSError:
                        pass
                raise

        return zip_path

    @staticmethod
    def generate_exam_marks_csv(exam_id: str) -> str:
        """
        Generates CSV format string of class results.
        Columns: Roll Number, Student Name, [Questions...], Total Marks, Max Marks, Percentage, Status, Review Required.
        """
        with get_session() as session:
            # Get approved rubric questions
            rub_row = session.scalar(
                select(RubricVersion)
                .where(RubricVersion.exam_id == exam_id, RubricVersion.is_approved == 1)
                .order_by(RubricVersion.version_num.desc())
                .limit(1)
            )
            questions = []
            if rub_row and rub_row.rubric_data:
                rub_data = json.loads(rub_row.rubric_data)
                questions = [q["question_id"] for q in rub_data.get("questions", [])]

            # Get all submissions for exam
            submissions = session.scalars(
                select(Submission)
                .where(Submission.exam_id == exam_id, Submission.submission_status == 'SUBMITTED')
                .order_by(Submission.roll_number.asc())
            ).all()

            sub_ids = [s.id for s in submissions]

            # Batch load answers
            answers_by_sub: Dict[str, Dict[str, Any]] = {}
            has_review_by_sub: Dict[str, bool] = {}
            if sub_ids:
                answers = session.scalars(
                    select(Answer).where(Answer.submission_id.in_(sub_ids))
                ).all()
                for a in answers:
                    answers_by_sub.setdefault(a.submission_id, {})[a.question_id] = a.awarded_marks
                    if a.needs_review:
                        has_review_by_sub[a.submission_id] = True

            output = io.StringIO()
            writer = csv.writer(output)

            # CSV Headers
            headers = ["Roll Number", "Student Name"] + [_sanitize_csv_cell(q) for q in questions] + [
                "Total Marks", "Max Marks", "Percentage (%)", "Status", "Needs Review"
            ]
            writer.writerow(headers)

            for sub in submissions:
                ans_map = answers_by_sub.get(sub.id, {})
                has_review = has_review_by_sub.get(sub.id, False)

                row = [
                    _sanitize_csv_cell(sub.roll_number),
                    _sanitize_csv_cell(sub.student_name),
                ]
                for q in questions:
                    row.append(_sanitize_csv_cell(ans_map.get(q, "N/A")))

                total_awarded = round(sub.total_awarded_marks or 0.0, 2)
                max_m = round(sub.max_marks or 0.0, 2)
                pct = f"{sub.percentage:.1f}%" if sub.percentage is not None else "0.0%"
                row.extend([
                    total_awarded,
                    max_m,
                    pct,
                    _sanitize_csv_cell(sub.status),
                    "YES" if has_review or sub.status == "NEEDS_REVIEW" else "NO"
                ])
                writer.writerow(row)

            return output.getvalue()


export_service = ExportService()
