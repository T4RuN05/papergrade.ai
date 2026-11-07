import uuid
from typing import Optional, List
from sqlalchemy import String, Text, Integer, Float, ForeignKey, Index, REAL
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.app.db.base import Base, TimestampMixin, UpdatedTimestampMixin, get_iso_now


class Submission(Base, UpdatedTimestampMixin):
    """Candidate single-document answer script submission with evaluation lifecycle tracking."""
    __tablename__ = "submissions"
    __table_args__ = (
        Index("idx_submissions_exam", "exam_id"),
        Index("idx_submissions_student", "student_id"),
        Index("idx_submissions_status", "status"),
        Index("idx_submissions_retention", "is_document_purged", "retention_expires_at"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: f"sub_{uuid.uuid4().hex[:12]}")
    exam_id: Mapped[str] = mapped_column(Text, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False)
    batch_id: Mapped[Optional[str]] = mapped_column(Text, ForeignKey("batches.id", ondelete="SET NULL"), nullable=True)
    student_id: Mapped[Optional[str]] = mapped_column(Text, ForeignKey("students.id", ondelete="SET NULL"), nullable=True)
    student_name: Mapped[str] = mapped_column(Text, nullable=False)
    roll_number: Mapped[str] = mapped_column(Text, nullable=False)
    original_file_path: Mapped[str] = mapped_column(Text, nullable=False)
    canonical_pdf_path: Mapped[str] = mapped_column(Text, nullable=False)
    annotated_pdf_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    page_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sha256_hash: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    upload_session_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    submission_status: Mapped[str] = mapped_column(Text, nullable=False, default="SUBMITTED")
    status: Mapped[str] = mapped_column(Text, nullable=False, default="UPLOADED")
    publication_status: Mapped[str] = mapped_column(Text, nullable=False, default="UNPUBLISHED")
    total_awarded_marks: Mapped[float] = mapped_column(REAL, nullable=False, default=0.0)
    max_marks: Mapped[float] = mapped_column(REAL, nullable=False, default=0.0)
    percentage: Mapped[float] = mapped_column(REAL, nullable=False, default=0.0)
    is_manual_override: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    submitted_at: Mapped[str] = mapped_column(Text, nullable=False, default="")
    reviewed_at: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    graded_at: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    stage1_extraction_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ttl_days: Mapped[int] = mapped_column(Integer, nullable=False, default=15)
    retention_expires_at: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_document_purged: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    purged_at: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    exam: Mapped["Exam"] = relationship("Exam", back_populates="submissions")
    student: Mapped[Optional["Student"]] = relationship("Student")
    answers: Mapped[List["Answer"]] = relationship("Answer", back_populates="submission", cascade="all, delete-orphan")
    revaluation_requests: Mapped[List["RevaluationRequest"]] = relationship("RevaluationRequest", back_populates="submission", cascade="all, delete-orphan")


class Answer(Base, UpdatedTimestampMixin):
    """Evaluated question response unit with confidence scores and rationale."""
    __tablename__ = "answers"
    __table_args__ = (
        Index("idx_answers_sub", "submission_id"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: f"ans_{uuid.uuid4().hex[:12]}")
    submission_id: Mapped[str] = mapped_column(Text, ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False)
    question_id: Mapped[str] = mapped_column(Text, nullable=False)
    subquestion_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    section_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_extra_attempt: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    page_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    extracted_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    max_marks: Mapped[float] = mapped_column(REAL, nullable=False, default=0.0)
    awarded_marks: Mapped[float] = mapped_column(REAL, nullable=False, default=0.0)
    grading_rationale: Mapped[str] = mapped_column(Text, nullable=False, default="")
    transcription_uncertainty: Mapped[float] = mapped_column(REAL, nullable=False, default=0.0)
    grading_uncertainty: Mapped[float] = mapped_column(REAL, nullable=False, default=0.0)
    needs_review: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    review_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_missing: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_manual_override: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    override_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    submission: Mapped["Submission"] = relationship("Submission", back_populates="answers")
    regions: Mapped[List["AnswerRegion"]] = relationship("AnswerRegion", back_populates="answer", cascade="all, delete-orphan")
    criterion_scores: Mapped[List["CriterionScore"]] = relationship("CriterionScore", back_populates="answer", cascade="all, delete-orphan")


class AnswerRegion(Base, TimestampMixin):
    """Bounding box coordinate overlay mapped to a page in the canonical PDF."""
    __tablename__ = "answer_regions"
    __table_args__ = (
        Index("idx_regions_ans", "answer_id"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: f"reg_{uuid.uuid4().hex[:12]}")
    answer_id: Mapped[str] = mapped_column(Text, ForeignKey("answers.id", ondelete="CASCADE"), nullable=False)
    page_number: Mapped[int] = mapped_column(Integer, nullable=False)
    x: Mapped[float] = mapped_column(REAL, nullable=False)
    y: Mapped[float] = mapped_column(REAL, nullable=False)
    width: Mapped[float] = mapped_column(REAL, nullable=False)
    height: Mapped[float] = mapped_column(REAL, nullable=False)
    is_manual_override: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Relationships
    answer: Mapped["Answer"] = relationship("Answer", back_populates="regions")


class CriterionScore(Base, TimestampMixin):
    """Discrete sub-criterion score item verifying rubric alignment."""
    __tablename__ = "criterion_scores"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: f"cs_{uuid.uuid4().hex[:12]}")
    answer_id: Mapped[str] = mapped_column(Text, ForeignKey("answers.id", ondelete="CASCADE"), nullable=False)
    criterion_id: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    max_marks: Mapped[float] = mapped_column(REAL, nullable=False, default=0.0)
    awarded_marks: Mapped[float] = mapped_column(REAL, nullable=False, default=0.0)
    evidence: Mapped[str] = mapped_column(Text, nullable=False, default="")
    is_manual_override: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Relationships
    answer: Mapped["Answer"] = relationship("Answer", back_populates="criterion_scores")


class EvaluationQueue(Base, UpdatedTimestampMixin):
    """Row-level locked evaluation queue for asynchronous batch processing."""
    __tablename__ = "evaluation_queue"
    __table_args__ = (
        Index("idx_queue_status", "status"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: f"eq_{uuid.uuid4().hex[:12]}")
    submission_id: Mapped[str] = mapped_column(Text, ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False)
    exam_id: Mapped[str] = mapped_column(Text, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="QUEUED")
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    claimed_by_worker: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    claimed_at: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class RevaluationRequest(Base):
    """Student appeal for manual re-evaluation restricted to 7-day post-publication window."""
    __tablename__ = "revaluation_requests"
    __table_args__ = (
        Index("idx_reval_sub", "submission_id"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: f"reval_{uuid.uuid4().hex[:12]}")
    submission_id: Mapped[str] = mapped_column(Text, ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False)
    student_id: Mapped[str] = mapped_column(Text, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    exam_id: Mapped[str] = mapped_column(Text, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="SUBMITTED")
    question_ids_json: Mapped[str] = mapped_column(Text, nullable=False)
    student_reason: Mapped[str] = mapped_column(Text, nullable=False)
    decision: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewer_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resolved_by: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    requested_at: Mapped[str] = mapped_column(Text, nullable=False, default=get_iso_now)
    resolved_at: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    expires_at: Mapped[str] = mapped_column(Text, nullable=False)

    # Relationships
    submission: Mapped["Submission"] = relationship("Submission", back_populates="revaluation_requests")
    student: Mapped["Student"] = relationship("Student")
    exam: Mapped["Exam"] = relationship("Exam")
