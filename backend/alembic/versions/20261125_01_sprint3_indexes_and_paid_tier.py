"""sprint3_indexes_and_paid_tier

Revision ID: 20261125_01
Revises: 85a071db2e8b
Create Date: 2026-11-25 11:20:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20261125_01"
down_revision: Union[str, Sequence[str], None] = "85a071db2e8b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add api_usage_events.is_paid_tier and hot-path composite/partial indexes idempotently."""
    bind = op.get_bind()
    dialect = bind.dialect.name
    inspector = sa.inspect(bind)

    # 1. Add api_usage_events.is_paid_tier column if missing
    existing_cols = {c["name"] for c in inspector.get_columns("api_usage_events")}
    if "is_paid_tier" not in existing_cols:
        if dialect == "postgresql":
            op.execute("ALTER TABLE api_usage_events ADD COLUMN IF NOT EXISTS is_paid_tier INTEGER NOT NULL DEFAULT 0")
        else:
            op.add_column(
                "api_usage_events",
                sa.Column("is_paid_tier", sa.Integer(), nullable=False, server_default="0"),
            )

    # 2. Create 7 B-Tree indexes idempotently across Postgres & SQLite
    btree_indexes = [
        ("idx_submissions_exam_roll", "submissions", "exam_id, roll_number"),
        ("idx_exams_branch", "exams", "branch_id"),
        ("idx_branches_inst", "branches", "institute_id"),
        ("idx_batches_branch", "batches", "branch_id"),
        ("idx_users_branch_inst", "users", "branch_id, institute_id"),
        ("idx_queue_exam", "evaluation_queue", "exam_id"),
        ("idx_reval_student", "revaluation_requests", "student_id"),
    ]
    for idx_name, tbl_name, cols_sql in btree_indexes:
        op.execute(f"CREATE INDEX IF NOT EXISTS {idx_name} ON {tbl_name} ({cols_sql})")

    # 3. Partial active-queue index
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_submissions_active_queue "
        "ON submissions (roll_number, created_at) "
        "WHERE status IN ('QUEUED', 'PAUSED_QUOTA')"
    )


def downgrade() -> None:
    """Revert Sprint 3 indexes and is_paid_tier column."""
    for idx_name in (
        "idx_submissions_active_queue",
        "idx_reval_student",
        "idx_queue_exam",
        "idx_users_branch_inst",
        "idx_batches_branch",
        "idx_branches_inst",
        "idx_exams_branch",
        "idx_submissions_exam_roll",
    ):
        op.execute(f"DROP INDEX IF EXISTS {idx_name}")

    bind = op.get_bind()
    existing_cols = {c["name"] for c in sa.inspect(bind).get_columns("api_usage_events")}
    if "is_paid_tier" in existing_cols:
        op.drop_column("api_usage_events", "is_paid_tier")
