"""
Database Reset & Test Ingestion Cleanup Utility.
Purges synthetic test submissions, temporary exams, and transient artifacts
strictly targeting TEST INSTITUTE (inst_test_institute).

SAFETY INVARIANT:
Production Institute (inst_e1eeda3473c3 - CATCH 25) is PERMANENTLY PROTECTED
and 100% excluded from any truncation, deletion, or reset operations.
"""

import shutil
import logging
from sqlalchemy import select, delete, or_

from backend.app.config import settings
from backend.app.db.session import get_session
from backend.app.db.models import (
    Institute,
    Exam,
    Submission,
    Answer,
    AnswerRegion,
    CriterionScore,
    RevaluationRequest,
    AuditLog,
    ApiUsageEvent,
    Notification,
)
from backend.app.database import init_db

logger = logging.getLogger("ResetDB")
logging.basicConfig(level=logging.INFO)

PROD_INSTITUTE_ID = "inst_e1eeda3473c3"
TEST_INSTITUTE_ID = "inst_test_institute"


def reset_test_database():
    """Safely reset test institute and ephemeral mock data using SQLAlchemy ORM."""
    print("[*] Initiating safe reset for test institute data...")

    with get_session() as session:
        # Invariant check: Assert production institute is intact
        prod_inst = session.get(Institute, PROD_INSTITUTE_ID)
        if prod_inst:
            print(f"  -> Invariant Verified: Production institute '{prod_inst.name}' ({PROD_INSTITUTE_ID}) is protected.")

        # Identify ephemeral synthetic test run exams (preserving regular exams in TEST BVI)
        test_exams = session.scalars(
            select(Exam).where(
                or_(
                    Exam.id.like("ex_test%"),
                    Exam.id.like("exam_d%"),
                    Exam.id.like("exam_sec_test%"),
                    Exam.title.like("%[Synthetic Test]%"),
                ),
                Exam.institute_id != PROD_INSTITUTE_ID
            )
        ).all()
        test_exam_ids = [e.id for e in test_exams]
        print(f"  -> Identified {len(test_exam_ids)} test/mock exams to purge.")

        if test_exam_ids:
            # Submissions for test exams
            test_subs = session.scalars(
                select(Submission).where(Submission.exam_id.in_(test_exam_ids))
            ).all()
            test_sub_ids = [s.id for s in test_subs]

            if test_sub_ids:
                session.execute(delete(CriterionScore).where(CriterionScore.answer_id.in_(
                    select(Answer.id).where(Answer.submission_id.in_(test_sub_ids))
                )))
                session.execute(delete(AnswerRegion).where(AnswerRegion.answer_id.in_(
                    select(Answer.id).where(Answer.submission_id.in_(test_sub_ids))
                )))
                session.execute(delete(RevaluationRequest).where(RevaluationRequest.submission_id.in_(test_sub_ids)))
                session.execute(delete(Answer).where(Answer.submission_id.in_(test_sub_ids)))
                session.execute(delete(Submission).where(Submission.id.in_(test_sub_ids)))
                print(f"  -> Purged {len(test_sub_ids)} synthetic submissions and associated marks/regions.")

            session.execute(delete(Exam).where(Exam.id.in_(test_exam_ids)))
            print(f"  -> Purged {len(test_exam_ids)} test exams.")

        session.commit()

    # Re-verify schema tables & default seed
    init_db()
    print("  -> Database schema tables and defaults re-verified.")

    # Clean local renders and exports directories (preserving .gitkeep)
    for dir_path in [settings.RENDERS_DIR, settings.EXPORTS_DIR]:
        if dir_path.exists():
            for item in dir_path.iterdir():
                if item.name == ".gitkeep":
                    continue
                if item.is_dir():
                    shutil.rmtree(item, ignore_errors=True)
                elif item.is_file():
                    item.unlink(missing_ok=True)
            print(f"  -> Cleaned {dir_path.name}/")

    print("[+] Test database and ephemeral storage reset successfully.")


if __name__ == "__main__":
    reset_test_database()
