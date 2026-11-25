import uuid
from typing import Optional
from sqlalchemy import Text, Integer, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.app.db.base import Base, TimestampMixin, get_iso_now


class GoogleStorageConnection(Base, TimestampMixin):
    """Stores user Google Drive OAuth tokens and root storage folder for BYOS."""
    __tablename__ = "google_storage_connections"
    __table_args__ = (
        Index("idx_gconn_user", "user_id"),
        Index("idx_gconn_sub", "google_sub"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: f"gconn_{uuid.uuid4().hex[:12]}")
    user_id: Mapped[str] = mapped_column(Text, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    google_sub: Mapped[str] = mapped_column(Text, nullable=False)
    google_email: Mapped[str] = mapped_column(Text, nullable=False)
    encrypted_refresh_token: Mapped[str] = mapped_column(Text, nullable=False)
    root_folder_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # My Drive/PaperGrade AI folder ID
    is_active: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    last_sync_at: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_state: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])


class PublishedDocumentArchive(Base, TimestampMixin):
    """Tracks published immutable result PDFs synced to student Google Drive."""
    __tablename__ = "published_document_archives"
    __table_args__ = (
        Index("idx_pdoc_submission", "submission_id"),
        Index("idx_pdoc_status", "archive_status"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: f"pdoc_{uuid.uuid4().hex[:12]}")
    submission_id: Mapped[str] = mapped_column(Text, ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    drive_file_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    drive_web_view_link: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pdf_sha256: Mapped[str] = mapped_column(Text, nullable=False)
    archive_status: Mapped[str] = mapped_column(Text, default="PENDING", nullable=False)  # PENDING, EXPORTED, FAILED, NOT_LINKED
    exported_at: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    submission: Mapped["Submission"] = relationship("Submission", foreign_keys=[submission_id])
