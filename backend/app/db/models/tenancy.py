import uuid
from typing import Optional, List
from sqlalchemy import String, Text, Integer, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.app.db.base import Base, TimestampMixin, UpdatedTimestampMixin, get_iso_now


class Institute(Base, TimestampMixin):
    """Educational institution multi-tenant top-level boundary."""
    __tablename__ = "institutes"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: f"inst_{uuid.uuid4().hex[:12]}")
    name: Mapped[str] = mapped_column(Text, nullable=False)
    code: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    subjects: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    branches: Mapped[List["Branch"]] = relationship("Branch", back_populates="institute", cascade="all, delete-orphan")
    subjects_rel: Mapped[List["Subject"]] = relationship("Subject", back_populates="institute", cascade="all, delete-orphan")
    users: Mapped[List["User"]] = relationship("User", back_populates="institute")


class Branch(Base, TimestampMixin):
    """Campus branch under an educational institute."""
    __tablename__ = "branches"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: f"br_{uuid.uuid4().hex[:12]}")
    institute_id: Mapped[str] = mapped_column(Text, ForeignKey("institutes.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    city: Mapped[str] = mapped_column(Text, nullable=False)
    subjects: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    institute: Mapped["Institute"] = relationship("Institute", back_populates="branches")
    batches: Mapped[List["Batch"]] = relationship("Batch", back_populates="branch", cascade="all, delete-orphan")
    subjects_rel: Mapped[List["Subject"]] = relationship("Subject", back_populates="branch", cascade="all, delete-orphan")
    users: Mapped[List["User"]] = relationship("User", back_populates="branch")


class Subject(Base, TimestampMixin):
    """Subject/Course catalog item belonging to an institute or branch."""
    __tablename__ = "subjects"
    __table_args__ = (
        Index("idx_subjects_inst", "institute_id"),
        Index("idx_subjects_branch", "branch_id"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: f"sub_{uuid.uuid4().hex[:12]}")
    institute_id: Mapped[Optional[str]] = mapped_column(Text, ForeignKey("institutes.id", ondelete="CASCADE"), nullable=True)
    branch_id: Mapped[Optional[str]] = mapped_column(Text, ForeignKey("branches.id", ondelete="CASCADE"), nullable=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    code: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # Relationships
    institute: Mapped[Optional["Institute"]] = relationship("Institute", back_populates="subjects_rel")
    branch: Mapped[Optional["Branch"]] = relationship("Branch", back_populates="subjects_rel")


class Batch(Base, UpdatedTimestampMixin):
    """Student cohort or test administration batch."""
    __tablename__ = "batches"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: f"batch_{uuid.uuid4().hex[:12]}")
    branch_id: Mapped[Optional[str]] = mapped_column(Text, ForeignKey("branches.id", ondelete="CASCADE"), nullable=True)
    exam_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    code: Mapped[str] = mapped_column(Text, nullable=False, default="")
    academic_year: Mapped[str] = mapped_column(Text, nullable=False, default="2026")
    status: Mapped[str] = mapped_column(Text, nullable=False, default="QUEUED")
    total_submissions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_submissions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_submissions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Relationships
    branch: Mapped[Optional["Branch"]] = relationship("Branch", back_populates="batches")
    students: Mapped[List["Student"]] = relationship("Student", back_populates="batch", cascade="all, delete-orphan")


class Student(Base, TimestampMixin):
    """Student identity record with numeric student ID for self-service claim."""
    __tablename__ = "students"
    __table_args__ = (
        Index("idx_students_num", "student_id_num"),
        Index("idx_students_batch", "batch_id"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: f"stu_{uuid.uuid4().hex[:12]}")
    batch_id: Mapped[str] = mapped_column(Text, ForeignKey("batches.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[Optional[str]] = mapped_column(Text, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    student_id_num: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    roll_number: Mapped[str] = mapped_column(Text, nullable=False)
    full_name: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    account_claimed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    claimed_at: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    batch: Mapped["Batch"] = relationship("Batch", back_populates="students")
    user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[user_id])

