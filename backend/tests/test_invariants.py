import uuid
import pytest
from pydantic import ValidationError
from sqlalchemy import delete
from backend.app.db.session import get_session
from backend.app.db.base import get_iso_now
from backend.app.db.models import Answer, AnswerRegion, Exam, Submission
from backend.app.schemas import (
    StudentGradingExtractionResult,
    GradedAnswerItem,
    AnswerRegionItem,
    CriterionScoreItem,
    ManualEditAnswerRequest
)
from backend.app.services.grading_service import grading_service

# Database is already initialized in production / test environments
@pytest.fixture(scope="session", autouse=True)
def setup_database():
    pass

def test_grading_invariants_and_backend_total():
    exam_id = str(uuid.uuid4())
    sub_id = str(uuid.uuid4())
    now = get_iso_now()

    with get_session() as session:
        session.add(Exam(id=exam_id, title="Test Exam", subject="Math", total_marks=10.0, status="RUBRIC_APPROVED", created_at=now, updated_at=now))
        session.add(Submission(id=sub_id, exam_id=exam_id, student_name="John Doe", roll_number="R1", original_file_path="dummy.pdf", canonical_pdf_path="dummy.pdf", max_marks=10.0, status="PROCESSING", created_at=now, updated_at=now))
        session.commit()

    rubric_data = {
        "questions": [
            {"question_id": "Q1", "max_marks": 5.0},
            {"question_id": "Q2", "max_marks": 5.0}
        ]
    }

    # Model returns 8.0 for Q1 (exceeds max of 5.0), and 0.0 for Q2
    mock_result = StudentGradingExtractionResult(
        answers=[
            GradedAnswerItem(
                question_id="Q1",
                page_number=1,
                extracted_student_answer="Ans 1",
                regions=[AnswerRegionItem(page_number=1, x=0.1, y=0.1, width=0.5, height=0.2)],
                max_marks=5.0,
                awarded_marks=8.0,  # invalid: greater than question max
                grading_rationale="Over-awarded by model",
                needs_review=False
            ),
            GradedAnswerItem(
                question_id="Q2",
                page_number=1,
                extracted_student_answer="Ans 2",
                regions=[AnswerRegionItem(page_number=1, x=0.1, y=0.4, width=0.5, height=0.2)],
                max_marks=5.0,
                awarded_marks=0.0,
                grading_rationale="Not attempted",
                needs_review=True,
                review_reason="Check marks"
            )
        ]
    )

    try:
        details = grading_service.enforce_invariants_and_save(sub_id, exam_id, mock_result, rubric_data)

        answers = {a["question_id"]: a for a in details["answers"]}

        # Invariant 1: Q1 awarded marks clamped to max_marks (5.0)
        assert answers["Q1"]["awarded_marks"] == 5.0
        # Invariant 2: Q2 awarded marks is 0.0
        assert answers["Q2"]["awarded_marks"] == 0.0

        # Invariant 3: Backend recalculated submission total is 5.0 + 0.0 = 5.0
        assert details["total_awarded_marks"] == 5.0
        assert details["percentage"] == 50.0

        # Invariant 4: Negative mark is caught by Pydantic schema
        with pytest.raises(ValidationError):
            GradedAnswerItem(
                question_id="Q3",
                page_number=1,
                extracted_student_answer="Ans 3",
                max_marks=5.0,
                awarded_marks=-1.0,
                grading_rationale="Negative"
            )
    finally:
        with get_session() as session:
            session.execute(delete(AnswerRegion).where(AnswerRegion.answer_id.in_(
                session.query(Answer.id).filter(Answer.submission_id == sub_id)
            )))
            session.execute(delete(Answer).where(Answer.submission_id == sub_id))
            session.execute(delete(Submission).where(Submission.id == sub_id))
            session.execute(delete(Exam).where(Exam.id == exam_id))
            session.commit()

def test_manual_override_preservation_and_audit():
    exam_id = str(uuid.uuid4())
    sub_id = str(uuid.uuid4())
    now = get_iso_now()

    with get_session() as session:
        session.add(Exam(id=exam_id, title="Test", subject="Science", total_marks=10.0, status="RUBRIC_APPROVED", created_at=now, updated_at=now))
        session.add(Submission(id=sub_id, exam_id=exam_id, student_name="Jane Doe", roll_number="R2", original_file_path="dummy.pdf", canonical_pdf_path="dummy.pdf", max_marks=10.0, status="PROCESSING", created_at=now, updated_at=now))
        session.commit()

    rubric_data = {"questions": [{"question_id": "Q1", "max_marks": 10.0}]}
    try:
        initial_res = StudentGradingExtractionResult(
            answers=[
                GradedAnswerItem(
                    question_id="Q1",
                    page_number=1,
                    extracted_student_answer="Initial answer",
                    regions=[AnswerRegionItem(page_number=1, x=0.1, y=0.1, width=0.5, height=0.2)],
                    max_marks=10.0,
                    awarded_marks=6.0,
                    grading_rationale="Initial AI rationale"
                )
            ]
        )

        details = grading_service.enforce_invariants_and_save(sub_id, exam_id, initial_res, rubric_data)
        ans_id = details["answers"][0]["id"]

        # Teacher performs manual override: changes mark from 6.0 to 9.0
        edit_req = ManualEditAnswerRequest(
            awarded_marks=9.0,
            reason="Teacher verified alternative valid step"
        )
        updated = grading_service.manual_edit_answer(sub_id, ans_id, edit_req)

        assert updated["total_awarded_marks"] == 9.0
        assert updated["is_manual_override"] == 1
        assert len(updated["audit_logs"]) >= 1
        assert updated["audit_logs"][0]["field_name"] == "awarded_marks"
        assert updated["audit_logs"][0]["old_value"] == "6.0"
        assert updated["audit_logs"][0]["new_value"] == "9.0"

        # Now simulate a background retry or re-grade: manual override MUST NOT be erased
        retry_res = StudentGradingExtractionResult(
            answers=[
                GradedAnswerItem(
                    question_id="Q1",
                    page_number=1,
                    extracted_student_answer="Retry answer",
                    max_marks=10.0,
                    awarded_marks=4.0,
                    grading_rationale="Retry rationale"
                )
            ]
        )
        after_retry = grading_service.enforce_invariants_and_save(sub_id, exam_id, retry_res, rubric_data)
        q1_ans = [a for a in after_retry["answers"] if a["question_id"] == "Q1"][0]
        # Retains 9.0!
        assert q1_ans["awarded_marks"] == 9.0
    finally:
        with get_session() as session:
            session.execute(delete(AnswerRegion).where(AnswerRegion.answer_id.in_(
                session.query(Answer.id).filter(Answer.submission_id == sub_id)
            )))
            session.execute(delete(Answer).where(Answer.submission_id == sub_id))
            session.execute(delete(Submission).where(Submission.id == sub_id))
            session.execute(delete(Exam).where(Exam.id == exam_id))
            session.commit()

def test_section_attempt_limits_and_best_of_n():
    """
    Validates 'Attempt any X out of Y' and 'Best of N' rule:
    When a student attempts more questions than the section limit,
    only the highest scoring answers count towards the total.
    """
    exam_id = str(uuid.uuid4())
    sub_id = str(uuid.uuid4())
    now = get_iso_now()

    with get_session() as session:
        session.add(Exam(id=exam_id, title="Physics Board Test", subject="Physics", total_marks=10.0, status="RUBRIC_APPROVED", created_at=now, updated_at=now))
        session.add(Submission(id=sub_id, exam_id=exam_id, student_name="Student Extra", roll_number="R10", original_file_path="dummy.pdf", canonical_pdf_path="dummy.pdf", max_marks=10.0, status="PROCESSING", created_at=now, updated_at=now))
        session.commit()

    rubric_data = {
        "exam_title": "Physics Board Test",
        "total_marks": 10.0,
        "sections": [
            {
                "section_id": "Section A",
                "title": "Compulsory Section",
                "max_marks": 4.0,
                "attempt_limit": None,
                "question_ids": ["Q1"]
            },
            {
                "section_id": "Section B",
                "title": "Short Answer (Attempt any 2 of 3)",
                "max_marks": 6.0,
                "attempt_limit": 2,
                "question_ids": ["Q2", "Q3", "Q4"]
            }
        ],
        "questions": [
            {"question_id": "Q1", "max_marks": 4.0, "section_id": "Section A"},
            {"question_id": "Q2", "max_marks": 3.0, "section_id": "Section B"},
            {"question_id": "Q3", "max_marks": 3.0, "section_id": "Section B"},
            {"question_id": "Q4", "max_marks": 3.0, "section_id": "Section B"}
        ]
    }

    # Student attempts ALL 4 questions:
    # Q1 = 4.0
    # Q2 = 3.0
    # Q3 = 1.5 (lower score)
    # Q4 = 3.0 (higher score)
    grading_res = StudentGradingExtractionResult(
        answers=[
            GradedAnswerItem(question_id="Q1", max_marks=4.0, awarded_marks=4.0, grading_rationale="Correct", page_number=1),
            GradedAnswerItem(question_id="Q2", max_marks=3.0, awarded_marks=3.0, grading_rationale="Correct", page_number=1),
            GradedAnswerItem(question_id="Q3", max_marks=3.0, awarded_marks=1.5, grading_rationale="Partial", page_number=2),
            GradedAnswerItem(question_id="Q4", max_marks=3.0, awarded_marks=3.0, grading_rationale="Correct", page_number=2),
        ]
    )

    details = grading_service.enforce_invariants_and_save(sub_id, exam_id, grading_res, rubric_data)

    # Total must be 4.0 + (3.0 + 3.0 from Section B) = 10.0
    assert details["total_awarded_marks"] == 10.0
    assert details["max_marks"] == 10.0
    assert details["percentage"] == 100.0

    # Verify Q3 is flagged as extra attempt
    answers_by_q = {a["question_id"]: a for a in details["answers"]}
    assert answers_by_q["Q2"]["is_extra_attempt"] == 0
    assert answers_by_q["Q4"]["is_extra_attempt"] == 0
    assert answers_by_q["Q3"]["is_extra_attempt"] == 1

def test_delete_region_when_only_region_leaves_valid_page_number(monkeypatch):
    """
    Validates that deleting the only bounding box of an answer:
    1. Does NOT set page_number to None (violating NOT NULL database constraints).
    2. Flags answer as is_missing = 1.
    3. Categorizes answer in missing_answers list.
    """
    # Prevent background PDF generation call during unit test
    monkeypatch.setattr(grading_service, "trigger_background_export_pdf", lambda sub_id: None)

    exam_id = str(uuid.uuid4())
    sub_id = str(uuid.uuid4())
    now = get_iso_now()

    with get_session() as session:
        session.add(Exam(id=exam_id, title="Region Delete Test", subject="Physics", total_marks=5.0, status="RUBRIC_APPROVED", created_at=now, updated_at=now))
        session.add(Submission(id=sub_id, exam_id=exam_id, student_name="Student Delete", roll_number="R20", original_file_path="dummy.pdf", canonical_pdf_path="dummy.pdf", max_marks=5.0, status="PROCESSING", created_at=now, updated_at=now))
        session.commit()

    rubric_data = {"questions": [{"question_id": "Q1", "max_marks": 5.0}]}
    try:
        initial_res = StudentGradingExtractionResult(
            answers=[
                GradedAnswerItem(
                    question_id="Q1",
                    page_number=2,
                    extracted_student_answer="To be deleted",
                    regions=[AnswerRegionItem(page_number=2, x=0.1, y=0.1, width=0.5, height=0.2)],
                    max_marks=5.0,
                    awarded_marks=2.5,
                    grading_rationale="Initial"
                )
            ]
        )

        details = grading_service.enforce_invariants_and_save(sub_id, exam_id, initial_res, rubric_data)
        reg_id = details["answers"][0]["regions"][0]["id"]

        # Delete the only region
        updated = grading_service.delete_region(sub_id, reg_id)

        ans = updated["answers"][0]
        assert ans["page_number"] is not None
        assert ans["page_number"] == 2
        assert ans["is_missing"] is True
        assert len(ans["regions"]) == 0
        assert len(updated["missing_answers"]) == 1
        assert updated["missing_answers"][0]["id"] == ans["id"]
    finally:
        with get_session() as session:
            session.execute(delete(AnswerRegion).where(AnswerRegion.answer_id.in_(
                session.query(Answer.id).filter(Answer.submission_id == sub_id)
            )))
            session.execute(delete(Answer).where(Answer.submission_id == sub_id))
            session.execute(delete(Submission).where(Submission.id == sub_id))
            session.execute(delete(Exam).where(Exam.id == exam_id))
            session.commit()

