"""user_sessions_multi_device_tracking

Revision ID: 20261126_04
Revises: 20261125_03
Create Date: 2026-11-26 21:10:00

"""
from typing import Sequence, Union
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "20261126_04"
down_revision: Union[str, Sequence[str], None] = "20261125_03"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS user_sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_version INTEGER NOT NULL DEFAULT 1,
            auth_method TEXT NOT NULL DEFAULT 'PASSWORD',
            device_label TEXT NOT NULL DEFAULT 'Unknown Device',
            user_agent TEXT NULL,
            ip_address TEXT NULL,
            is_revoked INTEGER NOT NULL DEFAULT 0,
            revoked_at TEXT NULL,
            last_active_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active "
        "ON user_sessions (user_id, is_revoked, expires_at);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_sessions_last_active "
        "ON user_sessions (last_active_at);"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_user_sessions_last_active;")
    op.execute("DROP INDEX IF EXISTS idx_user_sessions_user_active;")
    op.execute("DROP TABLE IF EXISTS user_sessions CASCADE;")
