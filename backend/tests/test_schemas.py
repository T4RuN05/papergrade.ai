import pytest
from backend.app.schemas import (
    AnswerRegionItem,
    CriterionScoreItem,
    GradedAnswerItem,
    StudentGradingExtractionResult,
    RubricCriterion,
    RubricQuestion,
    ExamRubricExtractionResult
)

def test_answer_region_clamping():
    # Valid box
    r = AnswerRegionItem(page_number=1, x=0.1, y=0.2, width=0.5, height=0.3)
    assert r.x == 0.1
    assert r.y == 0.2
    assert r.width == 0.5
    assert r.height == 0.3

    # Box with x + width > 1.0 clamped
    r2 = AnswerRegionItem(page_number=1, x=0.8, y=0.5, width=0.4, height=0.2)
    assert r2.x + r2.width <= 1.01

def test_criterion_and_graded_answer_schema():
    crit = CriterionScoreItem(
        criterion_id="C1",
        description="Formula stated",
        max_marks=2.0,
        awarded_marks=2.0,
        evidence="Wrote F = ma"
    )
    ans = GradedAnswerItem(
        question_id="Q1",
        page_number=1,
        extracted_student_answer="F = ma",
        regions=[AnswerRegionItem(page_number=1, x=0.1, y=0.1, width=0.8, height=0.2)],
        max_marks=4.0,
        awarded_marks=4.0,
        criterion_scores=[crit],
        grading_rationale="Correct",
        transcription_uncertainty=0.05,
        grading_uncertainty=0.0,
        needs_review=False
    )
    result = StudentGradingExtractionResult(
        submission_identifier="sub_1",
        answers=[ans]
    )
    assert len(result.answers) == 1
    assert result.answers[0].awarded_marks == 4.0

def test_rubric_extraction_schema():
    rub = ExamRubricExtractionResult(
        exam_title="Test Exam",
        subject="Physics",
        total_marks=10.0,
        questions=[
            RubricQuestion(
                question_id="Q1",
                question_text="Define Force",
                max_marks=5.0,
                official_answer="Mass times acceleration",
                criteria=[
                    RubricCriterion(criterion_id="C1", description="Definition", marks=5.0)
                ]
            )
        ]
    )
    assert rub.total_marks == 10.0
    assert len(rub.questions) == 1
