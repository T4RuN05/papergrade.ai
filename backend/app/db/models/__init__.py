"""SQLAlchemy 2.0 ORM Declarative Models for PaperGrade AI.

Exports all domain models for tenancy, auth, academics, grading, and telemetry.
"""

from backend.app.db.base import Base, TimestampMixin, UpdatedTimestampMixin, UUIDPrimaryKeyMixin, get_iso_now

# Tenancy Domain
from backend.app.db.models.tenancy import (
    Institute,
    Branch,
    Subject,
    Batch,
    Student,
)

# Auth Domain
from backend.app.db.models.auth import (
    User,
    PasswordResetRequest,
)

# Academic Domain
from backend.app.db.models.academic import (
    Exam,
    ExamBatch,
    SubmissionWindow,
    RubricVersion,
)

# Grading Domain
from backend.app.db.models.grading import (
    Submission,
    Answer,
    AnswerRegion,
    CriterionScore,
    EvaluationQueue,
    RevaluationRequest,
)

# Telemetry Domain
from backend.app.db.models.telemetry import (
    Notification,
    PushSubscription,
    TechnicalReport,
    AuditLog,
    ApiUsageEvent,
    UserQuotaSetting,
    ExperimentBenchmark,
)

__all__ = [
    "Base",
    "TimestampMixin",
    "UpdatedTimestampMixin",
    "UUIDPrimaryKeyMixin",
    "get_iso_now",
    # Tenancy
    "Institute",
    "Branch",
    "Subject",
    "Batch",
    "Student",
    # Auth
    "User",
    "PasswordResetRequest",
    # Academic
    "Exam",
    "ExamBatch",
    "SubmissionWindow",
    "RubricVersion",
    # Grading
    "Submission",
    "Answer",
    "AnswerRegion",
    "CriterionScore",
    "EvaluationQueue",
    "RevaluationRequest",
    # Telemetry
    "Notification",
    "PushSubscription",
    "TechnicalReport",
    "AuditLog",
    "ApiUsageEvent",
    "UserQuotaSetting",
    "ExperimentBenchmark",
]

