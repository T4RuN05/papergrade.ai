import uuid
from typing import Optional, List
from sqlalchemy import String, Text, Integer, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.app.db.base import Base, TimestampMixin, get_iso_now


class User(Base, TimestampMixin):
    """User account entity covering ROOT_ADMIN, INSTITUTE_DIRECTOR, BRANCH_MANAGER, and STUDENT personas."""
    __tablename__ = "users"
    __table_args__ = (
        Index("idx_users_email", "email"),
        Index("idx_users_role", "role"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: f"usr_{uuid.uuid4().hex[:12]}")
    institute_id: Mapped[Optional[str]] = mapped_column(Text, ForeignKey("institutes.id", ondelete="SET NULL"), nullable=True)
    branch_id: Mapped[Optional[str]] = mapped_column(Text, ForeignKey("branches.id", ondelete="SET NULL"), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(Text, unique=True, nullable=True)
    role: Mapped[str] = mapped_column(Text, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    full_name: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    has_changed_password: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_login_at: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    institute: Mapped[Optional["Institute"]] = relationship("Institute", back_populates="users")
    branch: Mapped[Optional["Branch"]] = relationship("Branch", back_populates="users")
    notifications: Mapped[List["Notification"]] = relationship("Notification", back_populates="user", cascade="all, delete-orphan")
    push_subscriptions: Mapped[List["PushSubscription"]] = relationship("PushSubscription", back_populates="user", cascade="all, delete-orphan")


class PasswordResetRequest(Base, TimestampMixin):
    """Student password reset request requiring Branch Manager approval flow."""
    __tablename__ = "password_reset_requests"
    __table_args__ = (
        Index("idx_pwd_reset_user", "user_id"),
        Index("idx_pwd_reset_branch", "branch_id"),
        Index("idx_pwd_reset_status", "status"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: f"prr_{uuid.uuid4().hex[:12]}")
    user_id: Mapped[str] = mapped_column(Text, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    student_id: Mapped[Optional[str]] = mapped_column(Text, ForeignKey("students.id", ondelete="SET NULL"), nullable=True)
    branch_id: Mapped[Optional[str]] = mapped_column(Text, ForeignKey("branches.id", ondelete="SET NULL"), nullable=True)
    roll_number: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    student_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    student_email: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="PENDING")
    reset_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    approved_by: Mapped[Optional[str]] = mapped_column(Text, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    completed_at: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    expires_at: Mapped[str] = mapped_column(Text, nullable=False)

    # Relationships
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    approver: Mapped[Optional["User"]] = relationship("User", foreign_keys=[approved_by])

