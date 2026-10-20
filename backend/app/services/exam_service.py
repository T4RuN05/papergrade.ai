import uuid
import json
from pathlib import Path
from typing import Optional, Dict, Any, List
from backend.app.config import settings
from backend.app.database import get_db, get_iso_now
from backend.app.schemas import ExamRubricExtractionResult, RubricQuestion
from backend.app.gemini.client import gemini_client

class ExamService:
    @staticmethod
    def create_exam(
        title: str,
        subject: str,
        question_paper_path: Optional[Path] = None,
        answer_key_path: Optional[Path] = None,
        extra_notes: str = ""
    ) -> Dict[str, Any]:
        exam_id = str(uuid.uuid4())
        now = get_iso_now()

        with get_db() as conn:
            conn.execute("""
            INSERT INTO exams (
                id, title, subject, total_marks, question_paper_path,
                answer_key_path, status, created_at, updated_at
            ) VALUES (?, ?, ?, 0.0, ?, ?, 'DRAFT', ?, ?)
            """, (
                exam_id, title, subject,
                str(question_paper_path) if question_paper_path else None,
                str(answer_key_path) if answer_key_path else None,
                now, now
            ))

        # If documents are supplied, extract draft rubric
        if question_paper_path and answer_key_path and question_paper_path.exists() and answer_key_path.exists():
            rubric_res, _ = gemini_client.extract_exam_rubric(
                exam_id=exam_id,
                question_paper_path=question_paper_path,
                answer_key_path=answer_key_path,
                extra_notes=extra_notes
            )
            ExamService.save_rubric_version(exam_id, rubric_res, is_approved=False)

        return ExamService.get_exam(exam_id)

    @staticmethod
    def save_rubric_version(
        exam_id: str,
        rubric: ExamRubricExtractionResult,
        is_approved: bool = False
    ) -> str:
        version_id = str(uuid.uuid4())
        now = get_iso_now()
        with get_db() as conn:
            # Get latest version number
            cursor = conn.cursor()
            cursor.execute("SELECT MAX(version_num) FROM rubric_versions WHERE exam_id = ?", (exam_id,))
            row = cursor.fetchone()
            next_ver = (row[0] or 0) + 1

            conn.execute("""
            INSERT INTO rubric_versions (
                id, exam_id, version_num, is_approved, rubric_data, created_at, approved_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                version_id, exam_id, next_ver, 1 if is_approved else 0,
                rubric.model_dump_json(), now, now if is_approved else None
            ))

            if is_approved:
                # Use rubric.total_marks if set (supports optional choices / sections), else sum questions
                total_m = float(rubric.total_marks) if rubric.total_marks and rubric.total_marks > 0 else sum(q.max_marks for q in rubric.questions)
                conn.execute("""
                UPDATE exams
                SET status = 'RUBRIC_APPROVED', total_marks = ?, updated_at = ?
                WHERE id = ?
                """, (total_m, now, exam_id))

        return version_id

    @staticmethod
    def approve_rubric(exam_id: str, rubric: ExamRubricExtractionResult) -> Dict[str, Any]:
        """
        Approves a teacher-reviewed rubric and marks the exam ready for grading.
        """
        ExamService.save_rubric_version(exam_id, rubric, is_approved=True)
        return ExamService.get_exam(exam_id)

    @staticmethod
    def unlock_rubric(exam_id: str) -> Dict[str, Any]:
        """
        Unlocks an approved rubric back to draft state so the teacher can modify sections/questions.
        """
        now = get_iso_now()
        with get_db() as conn:
            conn.execute("""
            UPDATE rubric_versions
            SET is_approved = 0
            WHERE exam_id = ?
            """, (exam_id,))
            conn.execute("""
            UPDATE exams
            SET status = 'RUBRIC_DRAFT', lifecycle_status = 'SETUP', updated_at = ?
            WHERE id = ?
            """, (now, exam_id))
        return ExamService.get_exam(exam_id)

    @staticmethod
    def get_exam(exam_id: str) -> Optional[Dict[str, Any]]:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT e.*, 
                       COALESCE(i.id, b.institute_id) as institute_id,
                       COALESCE(i.name, ib.name) as institute_name,
                       COALESCE(i.code, ib.code) as institute_code,
                       b.name as branch_name, 
                       b.code as branch_code, 
                       b.city as branch_city
                FROM exams e
                LEFT JOIN branches b ON e.branch_id = b.id
                LEFT JOIN institutes i ON e.institute_id = i.id
                LEFT JOIN institutes ib ON b.institute_id = ib.id
                WHERE e.id = ?
            """, (exam_id,))
            row = cursor.fetchone()
            if not row:
                return None
            exam_dict = dict(row)

            # Get approved or latest rubric
            cursor.execute("""
            SELECT * FROM rubric_versions
            WHERE exam_id = ?
            ORDER BY is_approved DESC, version_num DESC
            LIMIT 1
            """, (exam_id,))
            r_row = cursor.fetchone()
            if r_row:
                exam_dict["rubric_version"] = {
                    "id": r_row["id"],
                    "version_num": r_row["version_num"],
                    "is_approved": bool(r_row["is_approved"]),
                    "rubric_data": json.loads(r_row["rubric_data"]),
                    "created_at": r_row["created_at"],
                    "approved_at": r_row["approved_at"]
                }
                exam_dict["is_rubric_approved"] = bool(r_row["is_approved"])
                exam_dict["has_approved_rubric"] = bool(r_row["is_approved"])
            else:
                exam_dict["rubric_version"] = None
                exam_dict["is_rubric_approved"] = False
                exam_dict["has_approved_rubric"] = False

            # Attach scoped batches if specific batch scope
            if exam_dict.get("batch_scope") in ("SPECIFIC", "BATCHES"):
                cursor.execute("""
                    SELECT b.id, b.name, b.code, b.academic_year
                    FROM exam_batches eb
                    JOIN batches b ON eb.batch_id = b.id
                    WHERE eb.exam_id = ?
                    ORDER BY b.name ASC
                """, (exam_id,))
                exam_dict["scoped_batches"] = [dict(b) for b in cursor.fetchall()]
            else:
                exam_dict["scoped_batches"] = []

            return exam_dict

    @staticmethod
    def list_exams() -> List[Dict[str, Any]]:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT e.*, 
                       COALESCE(i.id, b.institute_id) as institute_id,
                       COALESCE(i.name, ib.name) as institute_name,
                       COALESCE(i.code, ib.code) as institute_code,
                       b.name as branch_name, 
                       b.code as branch_code, 
                       b.city as branch_city
                FROM exams e
                LEFT JOIN branches b ON e.branch_id = b.id
                LEFT JOIN institutes i ON e.institute_id = i.id
                LEFT JOIN institutes ib ON b.institute_id = ib.id
                ORDER BY e.created_at DESC
            """)
            raw_exams = [dict(r) for r in cursor.fetchall()]

            # Fetch all exam-batch mappings in one query
            cursor.execute("""
                SELECT eb.exam_id, b.id, b.name, b.code, b.academic_year
                FROM exam_batches eb
                JOIN batches b ON eb.batch_id = b.id
                ORDER BY b.name ASC
            """)
            scoped_map: Dict[str, List[Dict[str, Any]]] = {}
            for row in cursor.fetchall():
                r = dict(row)
                ex_id = r["exam_id"]
                if ex_id not in scoped_map:
                    scoped_map[ex_id] = []
                scoped_map[ex_id].append({
                    "id": r["id"],
                    "name": r["name"],
                    "code": r["code"],
                    "academic_year": r["academic_year"]
                })

            exams = []
            for e in raw_exams:
                cursor.execute("""
                SELECT is_approved, version_num FROM rubric_versions
                WHERE exam_id = ?
                ORDER BY is_approved DESC, version_num DESC LIMIT 1
                """, (e["id"],))
                r = cursor.fetchone()
                e["has_approved_rubric"] = bool(r["is_approved"]) if r else False
                e["is_rubric_approved"] = bool(r["is_approved"]) if r else False
                e["scoped_batches"] = scoped_map.get(e["id"], [])
                exams.append(e)
            return exams

exam_service = ExamService()
