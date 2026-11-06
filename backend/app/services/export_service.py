import io
import csv
import zipfile
import json
from pathlib import Path
from typing import Optional, Dict, List, Any
from sqlalchemy.orm import Session
from sqlalchemy import select

from backend.app.config import settings
from backend.app.db.session import get_session
from backend.app.db.models import Submission, RubricVersion, Answer
from backend.app.services.grading_service import grading_service


class ExportService:
    @staticmethod
    def get_submission_pdf_path(submission_id: str) -> Optional[Path]:
        annotated_path = settings.EXPORTS_DIR / f"{submission_id}_annotated.pdf"
        if not annotated_path.exists():
            grading_service.generate_export_pdf_for_submission(submission_id)
        if annotated_path.exists():
            return annotated_path
        return None

    @staticmethod
    def create_batch_zip(batch_id: str) -> Optional[Path]:
        """
        Creates a ZIP archive containing all annotated PDFs for the batch.
        """
        zip_path = settings.EXPORTS_DIR / f"batch_{batch_id}_graded_pdfs.zip"
        with get_session() as session:
            submissions = session.scalars(
                select(Submission).where(
                    Submission.batch_id == batch_id,
                    Submission.submission_status == 'SUBMITTED'
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

        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for sub in sub_records:
                sub_id = sub["id"]
                roll = sub["roll"]
                name = sub["name"]
                pdf_path = ExportService.get_submission_pdf_path(sub_id)
                if pdf_path and pdf_path.exists():
                    arc_name = f"{roll}_{name}_graded.pdf"
                    zip_file.write(pdf_path, arcname=arc_name)

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
            headers = ["Roll Number", "Student Name"] + questions + ["Total Marks", "Max Marks", "Percentage (%)", "Status", "Needs Review"]
            writer.writerow(headers)

            for sub in submissions:
                ans_map = answers_by_sub.get(sub.id, {})
                has_review = has_review_by_sub.get(sub.id, False)

                row = [
                    sub.roll_number,
                    sub.student_name
                ]
                for q in questions:
                    row.append(ans_map.get(q, "N/A"))

                total_awarded = round(sub.total_awarded_marks or 0.0, 2)
                max_m = round(sub.max_marks or 0.0, 2)
                pct = f"{sub.percentage:.1f}%" if sub.percentage is not None else "0.0%"
                row.extend([
                    total_awarded,
                    max_m,
                    pct,
                    sub.status,
                    "YES" if has_review or sub.status == "NEEDS_REVIEW" else "NO"
                ])
                writer.writerow(row)

            return output.getvalue()


export_service = ExportService()
