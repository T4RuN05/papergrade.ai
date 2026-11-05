from datetime import datetime, timezone
import uuid
from typing import Optional
from sqlalchemy import String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def get_iso_now() -> str:
    """Return current UTC timestamp in ISO 8601 format."""
    return datetime.now(timezone.utc).isoformat()


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy 2.0 declarative ORM models."""
    pass


class TimestampMixin:
    """Standard UTC ISO-8601 string timestamp tracking matching existing schema."""
    created_at: Mapped[str] = mapped_column(
        Text,
        default=get_iso_now,
        nullable=False
    )


class UpdatedTimestampMixin(TimestampMixin):
    """Standard UTC ISO-8601 string timestamp tracking with auto-updating updated_at."""
    updated_at: Mapped[str] = mapped_column(
        Text,
        default=get_iso_now,
        onupdate=get_iso_now,
        nullable=False
    )


class UUIDPrimaryKeyMixin:
    """Explicit string-based unique identifier preserving existing PaperGrade ID conventions."""
    id: Mapped[str] = mapped_column(
        String(64),
        primary_key=True,
        default=lambda: f"pg_{uuid.uuid4().hex[:12]}",
        nullable=False
    )
