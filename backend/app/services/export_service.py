import io
import csv
import zipfile
import json
from pathlib import Path
from typing import Optional
from backend.app.config import settings
from backend.app.database import get_db
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
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, roll_number, student_name FROM submissions WHERE batch_id = ?", (batch_id,))
            submissions = cursor.fetchall()

        if not submissions:
            return None

        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for sub in submissions:
                sub_id = sub["id"]
                roll = sub["roll_number"] or "unknown"
                name = (sub["student_name"] or "student").replace(" ", "_")
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
        with get_db() as conn:
            cursor = conn.cursor()

            # Get approved rubric questions
            cursor.execute("""
            SELECT rubric_data FROM rubric_versions
            WHERE exam_id = ? AND is_approved = 1
            ORDER BY version_num DESC LIMIT 1
            """, (exam_id,))
            rub_row = cursor.fetchone()
            questions = []
            if rub_row:
                rub_data = json.loads(rub_row["rubric_data"])
                questions = [q["question_id"] for q in rub_data.get("questions", [])]

            # Get all submissions for exam
            cursor.execute("""
            SELECT id, student_name, roll_number, total_awarded_marks, max_marks,
                   percentage, status, is_manual_override
            FROM submissions
            WHERE exam_id = ?
            ORDER BY roll_number ASC
            """, (exam_id,))
            submissions = cursor.fetchall()

            output = io.StringIO()
            writer = csv.writer(output)

            # CSV Headers
            headers = ["Roll Number", "Student Name"] + questions + ["Total Marks", "Max Marks", "Percentage (%)", "Status", "Needs Review"]
            writer.writerow(headers)

            for sub in submissions:
                sub_id = sub["id"]
                # Get answer scores
                cursor.execute("SELECT question_id, awarded_marks, needs_review FROM answers WHERE submission_id = ?", (sub_id,))
                ans_map = {}
                has_review = False
                for a in cursor.fetchall():
                    ans_map[a["question_id"]] = a["awarded_marks"]
                    if a["needs_review"]:
                        has_review = True

                row = [
                    sub["roll_number"],
                    sub["student_name"]
                ]
                for q in questions:
                    row.append(ans_map.get(q, "N/A"))

                row.extend([
                    round(sub["total_awarded_marks"], 2),
                    round(sub["max_marks"], 2),
                    f"{sub['percentage']:.1f}%",
                    sub["status"],
                    "YES" if has_review or sub["status"] == "NEEDS_REVIEW" else "NO"
                ])
                writer.writerow(row)

            return output.getvalue()

export_service = ExportService()
