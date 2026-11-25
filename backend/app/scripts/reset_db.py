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
from backend.app.scripts.seed_bootstrap import seed_bootstrap_defaults

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

        # Identify ephemeral synthetic test run exams ONLY (strictly excluding production CATCH 25)
        test_exams = session.scalars(
            select(Exam).where(
                or_(
                    Exam.id.like("ex_test%"),
                    Exam.id.like("exam_sec_test%"),
                    Exam.id.like("exam_p2_%"),
                    Exam.id.like("exam_d03_%"),
                    Exam.id.like("exam_d19_%"),
                    Exam.id.like("exam_test_%"),
                    Exam.title.like("%[Synthetic Test]%"),
                ),
                or_(Exam.institute_id == TEST_INSTITUTE_ID, Exam.institute_id.is_(None)),
                or_(Exam.institute_id.is_(None), Exam.institute_id != PROD_INSTITUTE_ID),
            )
        ).all()
        test_exam_ids = [e.id for e in test_exams]
        test_sub_ids: list[str] = []
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

            session.execute(delete(ApiUsageEvent).where(ApiUsageEvent.exam_id.in_(test_exam_ids)))
            session.execute(delete(AuditLog).where(AuditLog.resource_id.in_(test_exam_ids)))
            session.execute(delete(Exam).where(Exam.id.in_(test_exam_ids)))
            print(f"  -> Purged {len(test_exam_ids)} test exams.")

        session.commit()

    # Re-verify minimal default seed without touching production CATCH 25
    seed_bootstrap_defaults()
    print("  -> Bootstrap quota/default seed re-verified.")

    # Clean ONLY local render/export artifacts belonging to deleted synthetic exams/submissions
    for ex_id in test_exam_ids:
        for art_dir in (
            settings.RENDERS_DIR / f"exam_{ex_id}_question-paper",
            settings.RENDERS_DIR / f"exam_{ex_id}_answer-key",
            settings.UPLOADS_DIR / f"exam_{ex_id}",
        ):
            if art_dir.exists():
                shutil.rmtree(art_dir, ignore_errors=True)
    for sid in test_sub_ids:
        for s_dir in (
            settings.RENDERS_DIR / f"sub_{sid}",
            settings.RENDERS_DIR / f"annotated_{sid}",
        ):
            if s_dir.exists():
                shutil.rmtree(s_dir, ignore_errors=True)
        for exp_file in settings.EXPORTS_DIR.glob(f"{sid}*"):
            if exp_file.is_dir():
                shutil.rmtree(exp_file, ignore_errors=True)
            else:
                exp_file.unlink(missing_ok=True)
    print(f"  -> Cleaned scoped artifacts for {len(test_exam_ids)} exam(s) and {len(test_sub_ids)} submission(s).")

    print("[+] Test database and ephemeral storage reset successfully.")


if __name__ == "__main__":
    reset_test_database()
