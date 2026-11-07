from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, field_validator, model_validator

# ====================================================================
# Rubric Extraction Schemas (Gemini Structured Output)
# ====================================================================

class RubricCriterion(BaseModel):
    criterion_id: str = Field(description="Unique identifier for criterion, e.g. C1, C2")
    description: str = Field(description="Rubric condition or step, e.g. 'Stated correct formula'")
    marks: float = Field(ge=0.0, description="Marks assigned to this criterion")

class ExamSection(BaseModel):
    section_id: str = Field(description="Section identifier, e.g. 'Section A', 'Section B'")
    title: str = Field(default="", description="Section title or description, e.g. 'Short Answer Questions'")
    instructions: Optional[str] = Field(None, description="e.g. 'Attempt any 3 out of 4 questions'")
    total_questions: int = Field(default=0, description="Total questions available in this section")
    attempt_limit: Optional[int] = Field(None, description="Max questions counted toward total. None means all compulsory.")
    max_marks: float = Field(default=0.0, description="Total maximum marks possible from this section")
    question_ids: List[str] = Field(default_factory=list, description="Question identifiers belonging to this section")

class RubricQuestion(BaseModel):
    question_id: str = Field(description="Main question identifier, e.g. Q1, Q2")
    subquestion_id: Optional[str] = Field(None, description="Subquestion if applicable, e.g. a, b, 1(a)")
    section_id: Optional[str] = Field(None, description="Section ID if this question belongs to a section")
    question_text: str = Field(default="", description="Text of the question")
    max_marks: float = Field(default=0.0, ge=0.0, description="Maximum marks for this question")
    official_answer: str = Field(default="", description="Official model answer or solution key")
    accepted_alternatives: List[str] = Field(default_factory=list, description="Accepted alternative methods/answers")
    criteria: List[RubricCriterion] = Field(default_factory=list, description="List of grading criteria breakdown")
    numerical_tolerances: Optional[str] = Field(None, description="Numerical margin of error, units required, or tolerances")
    grading_notes: Optional[str] = Field(None, description="General guidelines or instructions for graders")

class ExamRubricExtractionResult(BaseModel):
    exam_title: str = Field(default="Examination", description="Title or header of the exam")
    subject: str = Field(default="General", description="Subject name")
    total_marks: float = Field(ge=0.0, description="Total maximum marks for the exam")
    sections: List[ExamSection] = Field(default_factory=list, description="Exam sections with optional attempt limits")
    questions: List[RubricQuestion] = Field(description="List of all questions with rubrics")

    @property
    def total_exam_marks(self) -> float:
        return self.total_marks

# ====================================================================
# Student Grading Schemas (Gemini Structured Output)
# ====================================================================

class AnswerRegionItem(BaseModel):
    page_number: int = Field(ge=1, description="1-indexed page number where the answer is written")
    x: float = Field(ge=0.0, le=1.0, description="Normalized X coordinate of top-left corner (0.0 to 1.0)")
    y: float = Field(ge=0.0, le=1.0, description="Normalized Y coordinate of top-left corner (0.0 to 1.0)")
    width: float = Field(ge=0.0, le=1.0, description="Normalized width (0.0 to 1.0)")
    height: float = Field(ge=0.0, le=1.0, description="Normalized height (0.0 to 1.0)")

    @model_validator(mode="after")
    def clamp_and_validate(self):
        # Ensure bounding box does not exceed page bounds
        if self.x + self.width > 1.01:
            self.width = max(0.01, 1.0 - self.x)
        if self.y + self.height > 1.01:
            self.height = max(0.01, 1.0 - self.y)
        return self

class CriterionScoreItem(BaseModel):
    criterion_id: str
    description: str
    max_marks: float = Field(ge=0.0)
    # CRITICAL: `evidence` MUST precede `awarded_marks` so the LLM audits before scoring!
    evidence: str = Field(
        default="",
        description=(
            "Audit format: "
            "(1) If correct: 'PASS | QUOTE: \"<exact verbatim substring from student answer>\"' "
            "(2) If flawed/inverted/wrong unit or magnitude: 'FAIL: <short flaw> | QUOTE: \"<exact verbatim substring>\"' "
            "(3) If omitted: 'MISSING'"
        ),
    )
    awarded_marks: float = Field(
        ge=0.0,
        description="MUST be 0.0 if evidence starts with 'FAIL' or 'MISSING'. Discrete 0.5 increments only.",
    )

class GradedAnswerItem(BaseModel):
    question_id: str = Field(description="Question identifier corresponding to approved rubric, e.g. Q1")
    subquestion_id: Optional[str] = Field(None, description="Subquestion if applicable, e.g. a, b")
    section_id: Optional[str] = Field(None, description="Section ID if question belongs to a section")
    is_extra_attempt: bool = Field(default=False, description="True if answer is an extra attempt beyond the section limit, excluded from total score")
    page_number: int = Field(default=1, ge=1, description="Primary page number for this answer")
    is_missing: bool = Field(default=False, description="True if student did not attempt or answer cannot be found")
    extracted_student_answer: str = Field(
        default="",
        description="Literal character-for-character transcription of student work without summarizing or autocorrecting errors.",
    )
    regions: List[AnswerRegionItem] = Field(default_factory=list, description="Normalized bounding boxes enclosing this answer")
    max_marks: float = Field(ge=0.0, description="Max marks configured for this question")
    # CRITICAL: `criterion_scores` and `grading_rationale` MUST precede `awarded_marks`!
    criterion_scores: List[CriterionScoreItem] = Field(default_factory=list)
    grading_rationale: str = Field(description="Concise 1-2 sentence audit summary of criteria met vs missed")
    awarded_marks: float = Field(ge=0.0, description="Sum of awarded_marks from criterion_scores, clamped to max_marks")
    transcription_uncertainty: float = Field(default=0.0, ge=0.0, le=1.0, description="Heuristic uncertainty indicator for handwriting transcription (0=clear, 1=unreadable)")
    grading_uncertainty: float = Field(default=0.0, ge=0.0, le=1.0, description="Heuristic uncertainty indicator for marking decision")
    needs_review: bool = Field(default=False, description="Whether human teacher inspection is recommended")
    review_reason: Optional[str] = Field(None, description="Reason why review was flagged")

class StudentGradingExtractionResult(BaseModel):
    submission_identifier: Optional[str] = Field(None, description="Identifier of the paper")
    student_name_detected: Optional[str] = Field(None, description="Student name if visible on page header")
    roll_number_detected: Optional[str] = Field(None, description="Roll number if visible on page header")
    answers: List[GradedAnswerItem] = Field(description="Evaluated answers for all rubric questions")

# ====================================================================
# Two-Stage Pipeline Schemas (Stage 1 Blind OCR + Stage 2 Batch Audit)
# ====================================================================

class BlindExtractedAnswerItem(BaseModel):
    question_id: str = Field(description="Question ID from question paper skeleton, e.g. Q1, Q1.1, Q2.2")
    subquestion_id: Optional[str] = Field(None, description="Subquestion ID if applicable, e.g. a, b, 1(a), 1, 2")
    section_id: Optional[str] = Field(None)
    page_number: int = Field(default=1, ge=1, description="Primary 1-indexed page number")
    is_missing: bool = Field(
        default=False,
        description=(
            "True ONLY if question is completely unattempted anywhere on the script. "
            "For MCQs/Objective items: Check cluttered lines, stacked lists, Roman numerals (i, ii, iii), "
            "and margins. If attempted in a clustered list, is_missing MUST be False."
        ),
    )
    extracted_student_answer: str = Field(
        default="",
        description=(
            "Literal, character-for-character transcription of student work. "
            "For MCQs/Objective questions: Transcribe BOTH the option letter/symbol AND any accompanying words, "
            "formulas, or values verbatim (e.g. '(B) Short range order' or '(D) 12'). If handwritten letter is "
            "ambiguous between B/D or A/C, transcribe '(B/D) <text>'. If student wrote only the option text "
            "without a letter, transcribe the text verbatim. NEVER fix student mistakes."
        ),
    )
    regions: List[AnswerRegionItem] = Field(
        default_factory=list,
        description="Mandatory normalized [0,1] bounding boxes. For clustered MCQs, provide a tight box around that specific item's line.",
    )
    transcription_uncertainty: float = Field(default=0.0, ge=0.0, le=1.0)

class Stage1BlindExtractionResult(BaseModel):
    submission_identifier: Optional[str] = None
    student_name_detected: Optional[str] = None
    roll_number_detected: Optional[str] = None
    answers: List[BlindExtractedAnswerItem]

class Stage2CriterionEvalItem(BaseModel):
    criterion_id: str
    evidence: str = Field(
        default="",
        description="Format: 'PASS | QUOTE: \"<exact verbatim substring>\"' or 'FAIL: <short flaw> | QUOTE: \"<exact verbatim substring>\"' or 'MISSING'",
    )
    awarded_marks: float = Field(
        ge=0.0,
        description="MUST be 0.0 if evidence starts with 'FAIL' or 'MISSING'. Discrete 0.5 increments only.",
    )

class Stage2EvaluatedQuestionItem(BaseModel):
    question_id: str
    subquestion_id: Optional[str] = None
    criterion_scores: List[Stage2CriterionEvalItem] = Field(default_factory=list)
    grading_rationale: str
    awarded_marks: float = Field(ge=0.0)
    grading_uncertainty: float = Field(default=0.0, ge=0.0, le=1.0)
    needs_review: bool = Field(default=False)
    review_reason: Optional[str] = None

class Stage2StudentEvaluationItem(BaseModel):
    submission_id: str = Field(description="Exact submission_id from the input batch")
    evaluated_answers: List[Stage2EvaluatedQuestionItem]

class Stage2BatchedGradingResult(BaseModel):
    results: List[Stage2StudentEvaluationItem]

# ====================================================================
# API Request & Response Schemas
# ====================================================================

class ExamCreateRequest(BaseModel):
    title: str
    subject: str

class ExamResponse(BaseModel):
    id: str
    title: str
    subject: str
    total_marks: float
    question_paper_path: Optional[str]
    answer_key_path: Optional[str]
    status: str
    created_at: str
    updated_at: str
    rubric: Optional[Dict[str, Any]] = None

class RubricApproveRequest(BaseModel):
    rubric_data: ExamRubricExtractionResult

class BatchCreateRequest(BaseModel):
    exam_id: str
    name: str

class ManualEditAnswerRequest(BaseModel):
    awarded_marks: Optional[float] = None
    extracted_text: Optional[str] = None
    grading_rationale: Optional[str] = None
    question_id: Optional[str] = None
    subquestion_id: Optional[str] = None
    needs_review: Optional[bool] = None
    reason: str = Field(default="Teacher manual correction")
    criterion_scores: Optional[List[CriterionScoreItem]] = None

class ManualEditRegionRequest(BaseModel):
    page_number: int
    x: float
    y: float
    width: float
    height: float
    reason: str = Field(default="Teacher adjusted bounding box")
    answer_id: Optional[str] = None

class QuotaSettingsUpdateRequest(BaseModel):
    rpm_limit: int = Field(gt=0)
    tpm_limit: int = Field(gt=0)
    rpd_limit: int = Field(gt=0)

class BenchmarkRecordRequest(BaseModel):
    submission_id: str
    exam_id: str
    ground_truth_marks: float
    ground_truth_answers_json: Optional[str] = None
    transcription_accepted: bool = True
    mapping_correct: bool = True
    box_accepted: bool = True
    marks_matched: bool = True
    explanation_sufficient: bool = True
    manual_intervention_required: bool = False
    notes: Optional[str] = None
