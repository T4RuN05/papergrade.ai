"""sync_preexisting_orm_indexes

Revision ID: 20261125_02
Revises: 20261125_01
Create Date: 2026-11-25 11:40:00

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "20261125_02"
down_revision: Union[str, Sequence[str], None] = "20261125_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_MISSING_INDEXES = [
    ("idx_api_usage_batch", "api_usage_events", "batch_id"),
    ("idx_api_usage_exam", "api_usage_events", "exam_id"),
    ("idx_api_usage_timestamp", "api_usage_events", "timestamp"),
    ("ix_criterion_scores_answer_id", "criterion_scores", "answer_id"),
    ("idx_queue_submission", "evaluation_queue", "submission_id"),
    ("ix_exam_batches_exam_id", "exam_batches", "exam_id"),
    ("idx_exp_bench_exam", "experiment_benchmarks", "exam_id"),
    ("idx_exp_bench_sub", "experiment_benchmarks", "submission_id"),
    ("idx_reval_exam", "revaluation_requests", "exam_id"),
    ("ix_rubric_versions_exam_id", "rubric_versions", "exam_id"),
    ("idx_students_user_id", "students", "user_id"),
    ("ix_submission_windows_exam_id", "submission_windows", "exam_id"),
    ("idx_submissions_batch", "submissions", "batch_id"),
]


def upgrade() -> None:
    """Create pre-existing ORM-declared indexes that were absent from the live DB."""
    for idx_name, tbl_name, cols_sql in _MISSING_INDEXES:
        op.execute(f"CREATE INDEX IF NOT EXISTS {idx_name} ON {tbl_name} ({cols_sql})")


def downgrade() -> None:
    """Drop synced ORM indexes."""
    for idx_name, _, _ in reversed(_MISSING_INDEXES):
        op.execute(f"DROP INDEX IF EXISTS {idx_name}")
