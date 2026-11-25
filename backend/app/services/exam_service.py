import json
from typing import Optional, Dict, Any, List
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db.session import get_session
from backend.app.db.models import (
    Exam,
    ExamBatch,
    Batch,
    Branch,
    Institute,
    RubricVersion,
)


class ExamService:
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
                parsed_rubric_data = {}
                try:
                    parsed_rubric_data = json.loads(rubric.rubric_data) if isinstance(rubric.rubric_data, str) else (rubric.rubric_data or {})
                except Exception:
                    parsed_rubric_data = {}

                # Defensive normalization: ensure questions always have criteria and question_text
                if isinstance(parsed_rubric_data, dict) and "questions" in parsed_rubric_data:
                    for q in parsed_rubric_data.get("questions", []):
                        if isinstance(q, dict):
                            if "criteria" not in q or q["criteria"] is None:
                                q["criteria"] = []
                            if "question_text" not in q or not q["question_text"]:
                                q["question_text"] = q.get("title", "")

                exam_dict["rubric_version"] = {
                    "id": rubric.id,
                    "version_num": rubric.version_num,
                    "is_approved": bool(rubric.is_approved),
                    "rubric_data": parsed_rubric_data,
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
                    select(Batch.id, Batch.name, Batch.academic_year)
                    .join(ExamBatch, ExamBatch.batch_id == Batch.id)
                    .where(ExamBatch.exam_id == exam_id)
                    .order_by(Batch.name.asc())
                ).all()
                exam_dict["scoped_batches"] = [
                    {"id": b[0], "name": b[1], "academic_year": b[2]} for b in batches
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
                select(ExamBatch.exam_id, Batch.id, Batch.name, Batch.academic_year)
                .join(Batch, ExamBatch.batch_id == Batch.id)
                .order_by(Batch.name.asc())
            ).all()

            scoped_map: Dict[str, List[Dict[str, Any]]] = {}
            for ex_id, b_id, b_name, b_year in eb_rows:
                if ex_id not in scoped_map:
                    scoped_map[ex_id] = []
                scoped_map[ex_id].append({
                    "id": b_id,
                    "name": b_name,
                    "academic_year": b_year,
                })

            # Pre-fetch latest rubric versions via light column projection (no rubric_data JSON blob)
            rv_rows = session.execute(
                select(RubricVersion.exam_id, RubricVersion.is_approved)
                .order_by(RubricVersion.is_approved.desc(), RubricVersion.version_num.desc())
            ).all()
            rv_map: Dict[str, bool] = {}
            for rv_exam_id, rv_is_approved in rv_rows:
                if rv_exam_id not in rv_map:
                    rv_map[rv_exam_id] = bool(rv_is_approved)

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
