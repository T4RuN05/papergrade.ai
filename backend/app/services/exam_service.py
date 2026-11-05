import uuid
import json
from pathlib import Path
from typing import Optional, Dict, Any, List
from sqlalchemy import select, func, update, and_, or_
from sqlalchemy.orm import Session

from backend.app.config import settings
from backend.app.db.session import get_session
from backend.app.db.base import get_iso_now
from backend.app.db.models import (
    Exam,
    ExamBatch,
    Batch,
    Branch,
    Institute,
    RubricVersion,
)
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

        with get_session() as session:
            exam = Exam(
                id=exam_id,
                title=title,
                subject=subject,
                total_marks=0.0,
                question_paper_path=str(question_paper_path) if question_paper_path else None,
                answer_key_path=str(answer_key_path) if answer_key_path else None,
                lifecycle_status="DRAFT",
                status="DRAFT",
                created_at=now,
                updated_at=now,
            )
            session.add(exam)

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

        with get_session() as session:
            max_ver = session.scalar(
                select(func.max(RubricVersion.version_num)).where(RubricVersion.exam_id == exam_id)
            )
            next_ver = (max_ver or 0) + 1

            rubric_row = RubricVersion(
                id=version_id,
                exam_id=exam_id,
                version_num=next_ver,
                is_approved=1 if is_approved else 0,
                rubric_data=rubric.model_dump_json(),
                created_at=now,
                approved_at=now if is_approved else None,
            )
            session.add(rubric_row)

            if is_approved:
                total_m = float(rubric.total_marks) if rubric.total_marks and rubric.total_marks > 0 else sum(q.max_marks for q in rubric.questions)
                exam = session.scalar(select(Exam).where(Exam.id == exam_id))
                if exam:
                    exam.status = "RUBRIC_APPROVED"
                    exam.lifecycle_status = "APPROVED"
                    exam.total_marks = total_m
                    exam.current_rubric_version_id = version_id
                    exam.updated_at = now

        return version_id

    @staticmethod
    def approve_rubric(exam_id: str, rubric: ExamRubricExtractionResult) -> Dict[str, Any]:
        """Approves a teacher-reviewed rubric and marks the exam ready for grading."""
        ExamService.save_rubric_version(exam_id, rubric, is_approved=True)
        return ExamService.get_exam(exam_id)

    @staticmethod
    def unlock_rubric(exam_id: str) -> Dict[str, Any]:
        """Unlocks an approved rubric back to draft state so the teacher can modify sections/questions."""
        now = get_iso_now()
        with get_session() as session:
            session.execute(
                update(RubricVersion).where(RubricVersion.exam_id == exam_id).values(is_approved=0)
            )
            exam = session.scalar(select(Exam).where(Exam.id == exam_id))
            if exam:
                exam.status = "RUBRIC_DRAFT"
                exam.lifecycle_status = "SETUP"
                exam.updated_at = now

        return ExamService.get_exam(exam_id)

    @staticmethod
    def get_exam(exam_id: str) -> Optional[Dict[str, Any]]:
        with get_session() as session:
            stmt = (
                select(
                    Exam,
                    Branch.name.label("branch_name"),
                    Branch.code.label("branch_code"),
                    Branch.city.label("branch_city"),
                    Branch.institute_id.label("branch_inst_id"),
                    Institute.name.label("inst_name"),
                    Institute.code.label("inst_code"),
                )
                .outerjoin(Branch, Exam.branch_id == Branch.id)
                .outerjoin(Institute, Exam.institute_id == Institute.id)
                .where(Exam.id == exam_id)
            )
            res = session.execute(stmt).first()
            if not res:
                return None

            exam, b_name, b_code, b_city, b_inst_id, i_name, i_code = res

            eff_inst_id = exam.institute_id or b_inst_id
            inst_name = i_name
            inst_code = i_code
            if not inst_name and eff_inst_id:
                inst_obj = session.scalar(select(Institute).where(Institute.id == eff_inst_id))
                if inst_obj:
                    inst_name = inst_obj.name
                    inst_code = inst_obj.code

            exam_dict = {
                "id": exam.id,
                "institute_id": eff_inst_id,
                "institute_name": inst_name,
                "institute_code": inst_code,
                "branch_id": exam.branch_id,
                "branch_name": b_name,
                "branch_code": b_code,
                "branch_city": b_city,
                "title": exam.title,
                "subject": exam.subject,
                "total_marks": exam.total_marks,
                "question_paper_path": exam.question_paper_path,
                "answer_key_path": exam.answer_key_path,
                "current_rubric_version_id": exam.current_rubric_version_id,
                "lifecycle_status": exam.lifecycle_status,
                "is_published": exam.is_published,
                "published_at": exam.published_at,
                "retention_expires_at": exam.retention_expires_at,
                "is_document_purged": exam.is_document_purged,
                "purged_at": exam.purged_at,
                "created_by": exam.created_by,
                "batch_scope": exam.batch_scope,
                "batch_ids": exam.batch_ids,
                "status": exam.status,
                "created_at": exam.created_at,
                "updated_at": exam.updated_at,
            }

            # Get approved or latest rubric
            rubric = session.scalar(
                select(RubricVersion)
                .where(RubricVersion.exam_id == exam_id)
                .order_by(RubricVersion.is_approved.desc(), RubricVersion.version_num.desc())
                .limit(1)
            )
            if rubric:
                exam_dict["rubric_version"] = {
                    "id": rubric.id,
                    "version_num": rubric.version_num,
                    "is_approved": bool(rubric.is_approved),
                    "rubric_data": json.loads(rubric.rubric_data),
                    "created_at": rubric.created_at,
                    "approved_at": rubric.approved_at,
                }
                exam_dict["is_rubric_approved"] = bool(rubric.is_approved)
                exam_dict["has_approved_rubric"] = bool(rubric.is_approved)
            else:
                exam_dict["rubric_version"] = None
                exam_dict["is_rubric_approved"] = False
                exam_dict["has_approved_rubric"] = False

            # Attach scoped batches if specific batch scope
            if exam_dict.get("batch_scope") in ("SPECIFIC", "BATCHES"):
                batches = session.execute(
                    select(Batch.id, Batch.name, Batch.code, Batch.academic_year)
                    .join(ExamBatch, ExamBatch.batch_id == Batch.id)
                    .where(ExamBatch.exam_id == exam_id)
                    .order_by(Batch.name.asc())
                ).all()
                exam_dict["scoped_batches"] = [
                    {"id": b[0], "name": b[1], "code": b[2], "academic_year": b[3]} for b in batches
                ]
            else:
                exam_dict["scoped_batches"] = []

            return exam_dict

    @staticmethod
    def list_exams() -> List[Dict[str, Any]]:
        with get_session() as session:
            stmt = (
                select(
                    Exam,
                    Branch.name.label("branch_name"),
                    Branch.code.label("branch_code"),
                    Branch.city.label("branch_city"),
                    Branch.institute_id.label("branch_inst_id"),
                    Institute.name.label("inst_name"),
                    Institute.code.label("inst_code"),
                )
                .outerjoin(Branch, Exam.branch_id == Branch.id)
                .outerjoin(Institute, Exam.institute_id == Institute.id)
                .order_by(Exam.created_at.desc())
            )
            rows = session.execute(stmt).all()

            # Pre-fetch all exam-batch mappings in one query
            eb_rows = session.execute(
                select(ExamBatch.exam_id, Batch.id, Batch.name, Batch.code, Batch.academic_year)
                .join(Batch, ExamBatch.batch_id == Batch.id)
                .order_by(Batch.name.asc())
            ).all()

            scoped_map: Dict[str, List[Dict[str, Any]]] = {}
            for ex_id, b_id, b_name, b_code, b_year in eb_rows:
                if ex_id not in scoped_map:
                    scoped_map[ex_id] = []
                scoped_map[ex_id].append({
                    "id": b_id,
                    "name": b_name,
                    "code": b_code,
                    "academic_year": b_year,
                })

            # Pre-fetch latest rubric versions for all exams in one query
            rv_rows = session.scalars(
                select(RubricVersion).order_by(RubricVersion.is_approved.desc(), RubricVersion.version_num.desc())
            ).all()
            rv_map: Dict[str, bool] = {}
            for rv in rv_rows:
                if rv.exam_id not in rv_map:
                    rv_map[rv.exam_id] = bool(rv.is_approved)

            exams = []
            for exam, b_name, b_code, b_city, b_inst_id, i_name, i_code in rows:
                has_approved = rv_map.get(exam.id, False)
                exams.append({
                    "id": exam.id,
                    "institute_id": exam.institute_id or b_inst_id,
                    "institute_name": i_name,
                    "institute_code": i_code,
                    "branch_id": exam.branch_id,
                    "branch_name": b_name,
                    "branch_code": b_code,
                    "branch_city": b_city,
                    "title": exam.title,
                    "subject": exam.subject,
                    "total_marks": exam.total_marks,
                    "question_paper_path": exam.question_paper_path,
                    "answer_key_path": exam.answer_key_path,
                    "current_rubric_version_id": exam.current_rubric_version_id,
                    "lifecycle_status": exam.lifecycle_status,
                    "is_published": exam.is_published,
                    "published_at": exam.published_at,
                    "retention_expires_at": exam.retention_expires_at,
                    "is_document_purged": exam.is_document_purged,
                    "purged_at": exam.purged_at,
                    "created_by": exam.created_by,
                    "batch_scope": exam.batch_scope,
                    "batch_ids": exam.batch_ids,
                    "status": exam.status,
                    "created_at": exam.created_at,
                    "updated_at": exam.updated_at,
                    "has_approved_rubric": has_approved,
                    "is_rubric_approved": has_approved,
                    "scoped_batches": scoped_map.get(exam.id, []),
                })
            return exams


exam_service = ExamService()
