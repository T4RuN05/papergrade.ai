from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Optional
from sqlalchemy import Text, Integer, ForeignKey, Index, REAL
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.app.db.base import Base, TimestampMixin, UpdatedTimestampMixin, get_iso_now

if TYPE_CHECKING:
    from backend.app.db.models.auth import User
    from backend.app.db.models.tenancy import Branch
    from backend.app.db.models.academic import Exam
    from backend.app.db.models.grading import Submission


class Notification(Base, TimestampMixin):
    """In-app alert notification dispatched to target user."""
    __tablename__ = "notifications"
    __table_args__ = (
        Index("idx_notif_user", "user_id"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: f"notif_{uuid.uuid4().hex[:12]}")
    user_id: Mapped[str] = mapped_column(Text, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    link_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_read: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="notifications")


class PushSubscription(Base, TimestampMixin):
    """Browser VAPID web push subscription registration."""
    __tablename__ = "push_subscriptions"
    __table_args__ = (
        Index("idx_push_subs_user", "user_id"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: f"sub_{uuid.uuid4().hex[:12]}")
    user_id: Mapped[str] = mapped_column(Text, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    endpoint: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    p256dh: Mapped[str] = mapped_column(Text, nullable=False)
    auth: Mapped[str] = mapped_column(Text, nullable=False)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="push_subscriptions")


class TechnicalReport(Base, UpdatedTimestampMixin):
    """System issue or bug report filed by students or teachers."""
    __tablename__ = "technical_reports"
    __table_args__ = (
        Index("idx_tech_rep_user", "user_id"),
        Index("idx_tech_rep_branch", "branch_id"),
        Index("idx_tech_rep_status", "status"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: f"tr_{uuid.uuid4().hex[:12]}")
    user_id: Mapped[str] = mapped_column(Text, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    user_role: Mapped[str] = mapped_column(Text, nullable=False)
    user_name: Mapped[str] = mapped_column(Text, nullable=False)
    user_email: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    user_roll: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    branch_id: Mapped[Optional[str]] = mapped_column(Text, ForeignKey("branches.id", ondelete="SET NULL"), nullable=True)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    subject: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    screenshots_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    status: Mapped[str] = mapped_column(Text, nullable=False, default="OPEN")
    admin_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resolved_by: Mapped[Optional[str]] = mapped_column(Text, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolved_at: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    resolver: Mapped[Optional["User"]] = relationship("User", foreign_keys=[resolved_by])
    branch: Mapped[Optional["Branch"]] = relationship("Branch")


class AuditLog(Base):
    """Immutable audit trail for manual score corrections and policy overrides."""
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("idx_audit_resource", "resource_type", "resource_id"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: f"audit_{uuid.uuid4().hex[:12]}")
    user_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    submission_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    answer_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    field_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    old_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    new_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    edited_by: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    action: Mapped[Optional[str]] = mapped_column(Text, default="MANUAL_EDIT")
    resource_type: Mapped[Optional[str]] = mapped_column(Text, default="ANSWER")
    resource_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    details_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(Text, nullable=False, default=get_iso_now)


class ApiUsageEvent(Base):
    """Telemetry instrumentation recording token count and costs per Gemini inference call."""
    __tablename__ = "api_usage_events"
    __table_args__ = (
        Index("idx_api_usage_exam", "exam_id"),
        Index("idx_api_usage_batch", "batch_id"),
        Index("idx_api_usage_timestamp", "timestamp"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: f"use_{uuid.uuid4().hex[:12]}")
    timestamp: Mapped[str] = mapped_column(Text, nullable=False, default=get_iso_now)
    exam_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    batch_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    submission_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    request_purpose: Mapped[str] = mapped_column(Text, nullable=False)
    model_name: Mapped[str] = mapped_column(Text, nullable=False)
    api_key_masked: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    input_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    thinking_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cached_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    page_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    success: Mapped[int] = mapped_column(Integer, nullable=False)
    http_status: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    error_code: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    retry_attempt: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    estimated_cost_usd: Mapped[Optional[float]] = mapped_column(REAL, nullable=True)
    pricing_version: Mapped[str] = mapped_column(Text, nullable=False)
    is_mock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class UserQuotaSetting(Base):
    """Dynamic rate limit configuration controlling Gemini request rates."""
    __tablename__ = "user_quota_settings"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default="default")
    rpm_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=15)
    tpm_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=1000000)
    rpd_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=1500)
    updated_at: Mapped[str] = mapped_column(Text, nullable=False, default=get_iso_now)


class ExperimentBenchmark(Base, TimestampMixin):
    """Ground truth evaluation benchmark records for accuracy evaluation."""
    __tablename__ = "experiment_benchmarks"
    __table_args__ = (
        Index("idx_exp_bench_exam", "exam_id"),
        Index("idx_exp_bench_sub", "submission_id"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: f"bm_{uuid.uuid4().hex[:12]}")
    exam_id: Mapped[str] = mapped_column(Text, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False)
    submission_id: Mapped[str] = mapped_column(Text, ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False)
    ground_truth_marks: Mapped[Optional[float]] = mapped_column(REAL, nullable=True)
    ground_truth_answers_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    transcription_accepted: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=1)
    mapping_correct: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=1)
    box_accepted: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=1)
    marks_matched: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=1)
    explanation_sufficient: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=1)
    manual_intervention_required: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=0)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


__all__ = [
    "Notification",
    "PushSubscription",
    "TechnicalReport",
    "AuditLog",
    "ApiUsageEvent",
    "UserQuotaSetting",
    "ExperimentBenchmark",
]
