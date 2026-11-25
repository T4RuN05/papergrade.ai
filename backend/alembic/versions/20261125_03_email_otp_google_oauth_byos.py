"""email_otp_google_oauth_byos

Revision ID: 20261125_03
Revises: 20261125_02
Create Date: 2026-11-25 23:50:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20261125_03"
down_revision: Union[str, Sequence[str], None] = "20261125_02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Extend password_reset_requests for 6-digit email OTP
    op.execute("""
        ALTER TABLE password_reset_requests 
        ADD COLUMN IF NOT EXISTS otp_code_hash TEXT NULL,
        ADD COLUMN IF NOT EXISTS otp_expires_at TEXT NULL,
        ADD COLUMN IF NOT EXISTS otp_attempts INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS verification_method TEXT NOT NULL DEFAULT 'EMAIL_OTP';
    """)

    # 2. Extend users for Google OAuth 2.0 identity
    op.execute("""
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS google_sub TEXT NULL,
        ADD COLUMN IF NOT EXISTS google_email TEXT NULL,
        ADD COLUMN IF NOT EXISTS google_picture TEXT NULL,
        ADD COLUMN IF NOT EXISTS google_linked_at TEXT NULL;
    """)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users (google_sub);")

    # 3. Create google_storage_connections table for BYOS
    op.execute("""
        CREATE TABLE IF NOT EXISTS google_storage_connections (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            google_sub TEXT NOT NULL,
            google_email TEXT NOT NULL,
            encrypted_refresh_token TEXT NOT NULL,
            root_folder_id TEXT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            last_sync_at TEXT NULL,
            error_state TEXT NULL,
            created_at TEXT NOT NULL
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_gconn_user ON google_storage_connections (user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_gconn_sub ON google_storage_connections (google_sub);")

    # 4. Create published_document_archives table
    op.execute("""
        CREATE TABLE IF NOT EXISTS published_document_archives (
            id TEXT PRIMARY KEY,
            submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
            version_number INTEGER NOT NULL DEFAULT 1,
            drive_file_id TEXT NULL,
            drive_web_view_link TEXT NULL,
            pdf_sha256 TEXT NOT NULL,
            archive_status TEXT NOT NULL DEFAULT 'PENDING',
            exported_at TEXT NULL,
            created_at TEXT NOT NULL
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_pdoc_submission ON published_document_archives (submission_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_pdoc_status ON published_document_archives (archive_status);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS published_document_archives CASCADE;")
    op.execute("DROP TABLE IF EXISTS google_storage_connections CASCADE;")

    op.execute("DROP INDEX IF EXISTS idx_users_google_sub;")
    op.execute("""
        ALTER TABLE users
        DROP COLUMN IF EXISTS google_sub,
        DROP COLUMN IF EXISTS google_email,
        DROP COLUMN IF EXISTS google_picture,
        DROP COLUMN IF EXISTS google_linked_at;
    """)

    op.execute("""
        ALTER TABLE password_reset_requests
        DROP COLUMN IF EXISTS otp_code_hash,
        DROP COLUMN IF EXISTS otp_expires_at,
        DROP COLUMN IF EXISTS otp_attempts,
        DROP COLUMN IF EXISTS verification_method;
    """)
