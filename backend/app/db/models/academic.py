import uuid
from typing import Optional, List
from sqlalchemy import String, Text, Integer, Float, ForeignKey, Index, REAL
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.app.db.base import Base, TimestampMixin, UpdatedTimestampMixin, get_iso_now


class Exam(Base, UpdatedTimestampMixin):
    """Central examination specification with multi-batch scoping and retention rules."""
    __tablename__ = "exams"
    __table_args__ = (
        Index("idx_exams_inst", "institute_id"),
        Index("idx_exams_retention", "is_document_purged", "retention_expires_at"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: f"exam_{uuid.uuid4().hex[:12]}")
    institute_id: Mapped[Optional[str]] = mapped_column(Text, ForeignKey("institutes.id", ondelete="SET NULL"), nullable=True)
    branch_id: Mapped[Optional[str]] = mapped_column(Text, ForeignKey("branches.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    subject: Mapped[str] = mapped_column(Text, nullable=False)
    total_marks: Mapped[float] = mapped_column(REAL, nullable=False, default=0.0)
    question_paper_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    answer_key_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    current_rubric_version_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    lifecycle_status: Mapped[str] = mapped_column(Text, nullable=False, default="DRAFT")
    is_published: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    published_at: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    retention_expires_at: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_document_purged: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    purged_at: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    batch_scope: Mapped[str] = mapped_column(Text, nullable=False, default="ALL")
    batch_ids: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="DRAFT")

    # Relationships
    institute: Mapped[Optional["Institute"]] = relationship("Institute")
    branch: Mapped[Optional["Branch"]] = relationship("Branch")
    exam_batches: Mapped[List["ExamBatch"]] = relationship("ExamBatch", back_populates="exam", cascade="all, delete-orphan")
    submission_windows: Mapped[List["SubmissionWindow"]] = relationship("SubmissionWindow", back_populates="exam", cascade="all, delete-orphan")
    rubric_versions: Mapped[List["RubricVersion"]] = relationship("RubricVersion", back_populates="exam", cascade="all, delete-orphan")
    submissions: Mapped[List["Submission"]] = relationship("Submission", back_populates="exam", cascade="all, delete-orphan")


class ExamBatch(Base, TimestampMixin):
    """Many-to-many scoping linking exams to eligible student batches."""
    __tablename__ = "exam_batches"
    __table_args__ = (
        Index("idx_exam_batches_exam", "exam_id"),
        Index("idx_exam_batches_batch", "batch_id"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: f"eb_{uuid.uuid4().hex[:12]}")
    exam_id: Mapped[str] = mapped_column(Text, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False)
    batch_id: Mapped[str] = mapped_column(Text, ForeignKey("batches.id", ondelete="CASCADE"), nullable=False)

    # Relationships
    exam: Mapped["Exam"] = relationship("Exam", back_populates="exam_batches")
    batch: Mapped["Batch"] = relationship("Batch")


class SubmissionWindow(Base, TimestampMixin):
    """Timed submission window (e.g. 30-min window + 2-min grace period) with reopening support."""
    __tablename__ = "submission_windows"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: f"win_{uuid.uuid4().hex[:12]}")
    exam_id: Mapped[str] = mapped_column(Text, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False)
    branch_id: Mapped[Optional[str]] = mapped_column(Text, ForeignKey("branches.id", ondelete="SET NULL"), nullable=True)
    window_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    opened_at: Mapped[str] = mapped_column(Text, nullable=False)
    deadline_at: Mapped[str] = mapped_column(Text, nullable=False)
    grace_deadline_at: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="OPEN")
    reopen_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reopen_scope: Mapped[Optional[str]] = mapped_column(Text, default="UNSUBMITTED_ONLY")
    created_by: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    exam: Mapped["Exam"] = relationship("Exam", back_populates="submission_windows")


class RubricVersion(Base, TimestampMixin):
    """Discrete criteria rubric versioning with immutable approved lock."""
    __tablename__ = "rubric_versions"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: f"rub_{uuid.uuid4().hex[:12]}")
    exam_id: Mapped[str] = mapped_column(Text, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False)
    version_num: Mapped[int] = mapped_column(Integer, nullable=False)
    is_approved: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    approved_by: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    approved_at: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rubric_data: Mapped[str] = mapped_column(Text, nullable=False)

    # Relationships
    exam: Mapped["Exam"] = relationship("Exam", back_populates="rubric_versions")
