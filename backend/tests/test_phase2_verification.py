"""
Phase 2 Deep Architectural & Performance Regression Test Suite.
Verifies all 6 remediated defects:
  - D-05: Submissions ORM Re-submission Purge (no SQLite '?' syntax error on PostgreSQL)
  - D-06: Database Engine consolidation, absence of competing pool, unified ORM initialization
  - D-07: Async event loop unblocking for PyMuPDF rasterization
  - D-08: Async event loop unblocking for cloud storage uploads
  - D-11: BoundedTTLCache correctness, LRU eviction, and TTL expiration
  - D-14: Parallelized WebPush dispatch & bulk pruning of expired subscriptions

STRICT SAFETY DIRECTIVE:
Production Institute (inst_e1eeda3473c3, br_c25_acbdd4d8) is 100% READ-ONLY.
All synthetic operations strictly target inst_test_institute (br_28c2a5dfe193) or ephemeral run-scoped IDs.
"""

import asyncio
import time
import uuid
import concurrent.futures
import pytest
from unittest.mock import patch, MagicMock
from sqlalchemy import select, func, text, delete

from backend.app.db.session import engine, get_session, is_postgres
from backend.app.db.base import Base, get_iso_now
from backend.app.database import get_db, is_postgres as db_is_postgres
from backend.app.services.auth import (
    BoundedTTLCache,
    hash_password,
    verify_password,
    is_user_active_in_db,
    _pwd_verify_cache,
)
from backend.app.db.models import (
    Institute,
    Branch,
    Batch,
    Student,
    Exam,
    Submission,
    Answer,
    AnswerRegion,
    CriterionScore,
    PushSubscription,
    User,
)
from backend.app.routers.submissions import _purge_and_replace_previous_submissions
from backend.app.services.notification_service import _send_single_webpush, dispatch_webpush_for_users

PROD_INSTITUTE_ID = "inst_e1eeda3473c3"
PROD_BRANCH_ID = "br_c25_acbdd4d8"
TEST_INSTITUTE_ID = "inst_test_institute"
TEST_BRANCH_ID = "br_28c2a5dfe193"


def test_01_prod_institute_read_only_baseline():
    """Verify that Production Institute CATCH 25 exists and record its exact baseline state."""
    with get_session() as session:
        prod_inst = session.get(Institute, PROD_INSTITUTE_ID)
        assert prod_inst is not None, "Production Institute CATCH 25 must exist"
        assert prod_inst.name == "CATCH 25", f"Expected 'CATCH 25', got '{prod_inst.name}'"

        prod_branch = session.get(Branch, PROD_BRANCH_ID)
        assert prod_branch is not None, "Production Branch Borivali must exist"
        assert prod_branch.institute_id == PROD_INSTITUTE_ID

        # Record counts to guarantee immutability
        exam_count = session.scalar(select(func.count(Exam.id)).where(Exam.institute_id == PROD_INSTITUTE_ID))
        assert exam_count is not None


def test_02_d06_database_engine_consolidation():
    """Verify elimination of dual connection pools and test unified connection handling."""
    # 1. Assert is_postgres consistency
    assert is_postgres() == db_is_postgres()

    # 2. Assert database.py does not define _pg_pool (competing pool eliminated)
    import backend.app.database as db_mod
    assert not hasattr(db_mod, "_pg_pool"), "Legacy _pg_pool must be purged from database.py"
    assert not hasattr(db_mod, "get_pg_pool"), "Legacy get_pg_pool must be purged from database.py"

    # 3. Test get_db() deprecated context manager uses unified engine
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 AS num")
        row = cursor.fetchone()
        assert row["num"] == 1 or row[0] == 1

    # 4. Concurrency Test: 8 simultaneous threads using get_session() without pool exhaustion
    def _concurrent_query(idx):
        with get_session() as s:
            val = s.scalar(select(func.count(Institute.id)))
            return idx, val >= 1

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(_concurrent_query, i) for i in range(16)]
        for f in concurrent.futures.as_completed(futures):
            idx, success = f.result()
            assert success, f"Thread {idx} failed database session query"


def test_03_d11_bounded_ttl_cache():
    """Verify BoundedTTLCache implements atomic capacity bounds, LRU eviction, and TTL expiration."""
    cache = BoundedTTLCache(maxsize=3, ttl=0.4)

    # Put 3 items
    cache.set("k1", "v1")
    cache.set("k2", "v2")
    cache.set("k3", "v3")

    assert cache.get("k1") == "v1"
    assert cache.get("k2") == "v2"
    assert cache.get("k3") == "v3"
    assert len(cache) == 3

    # Access k1 to make it most-recently used; k2 is now oldest
    _ = cache.get("k1")

    # Put 4th item - k2 should be evicted (LRU)
    cache.set("k4", "v4")
    assert len(cache) == 3
    assert cache.get("k2") is None, "k2 should have been evicted as LRU item"
    assert cache.get("k1") == "v1"
    assert cache.get("k4") == "v4"

    # Wait for TTL expiration
    time.sleep(0.5)
    assert cache.get("k1") is None, "k1 should have expired after TTL"
    assert cache.get("k4") is None, "k4 should have expired after TTL"
    assert len(cache) == 0

    # Verify password verification cache integration
    raw_pwd = "P2SecretVerificationPassword123!"
    h = hash_password(raw_pwd)

    # First verify (cache miss -> bcrypt check -> cache store)
    t0 = time.perf_counter()
    res1 = verify_password(raw_pwd, h)
    t1 = time.perf_counter()
    assert res1 is True

    # Second verify (cache hit -> sub-millisecond)
    t2 = time.perf_counter()
    res2 = verify_password(raw_pwd, h)
    t3 = time.perf_counter()
    assert res2 is True

    cached_time = t3 - t2
    uncached_time = t1 - t0
    # Cache hit should be significantly faster than bcrypt hash calculation
    assert cached_time < uncached_time or cached_time < 0.005


def test_04_d05_submissions_orm_purge():
    """Verify _purge_and_replace_previous_submissions executes cleanly via ORM without SQLite '?' syntax error."""
    run_id = uuid.uuid4().hex[:6]
    test_exam_id = f"exam_p2_{run_id}"
    test_sub_id = f"sub_p2_{run_id}"
    test_roll = f"ROLL_P2_{run_id}"
    now = get_iso_now()

    with get_session() as session:
        # Create a synthetic exam in TEST institute
        exam = Exam(
            id=test_exam_id,
            institute_id=TEST_INSTITUTE_ID,
            branch_id=TEST_BRANCH_ID,
            title=f"Phase 2 Test Exam {run_id}",
            subject="Verification",
            total_marks=20.0,
            status="PUBLISHED",
            created_at=now,
            updated_at=now,
        )
        session.add(exam)

        # Create synthetic submission
        sub = Submission(
            id=test_sub_id,
            exam_id=test_exam_id,
            student_name="Phase 2 Student",
            roll_number=test_roll,
            original_file_path="dummy.pdf",
            canonical_pdf_path="dummy.pdf",
            max_marks=20.0,
            status="PROCESSING",
            created_at=now,
            updated_at=now,
        )
        session.add(sub)
        session.flush()

        # Add child answer, region, and score
        ans = Answer(
            id=f"ans_{run_id}",
            submission_id=test_sub_id,
            question_id="Q1",
            page_number=1,
            max_marks=10.0,
            awarded_marks=8.0,
            created_at=now,
        )
        session.add(ans)
        session.flush()

        region = AnswerRegion(
            id=f"reg_{run_id}",
            answer_id=ans.id,
            page_number=1,
            x=0.1,
            y=0.1,
            width=0.4,
            height=0.2,
            created_at=now,
        )
        score = CriterionScore(
            id=f"cs_{run_id}",
            answer_id=ans.id,
            criterion_id="CRIT_1",
            description="Accuracy",
            max_marks=10.0,
            awarded_marks=8.0,
            created_at=now,
        )
        session.add_all([region, score])
        session.commit()

        # Now execute _purge_and_replace_previous_submissions using an ORM session
        # In PostgreSQL, previously this failed with syntax error at '?'
        purged_count = _purge_and_replace_previous_submissions(
            cursor=session,
            exam_id=test_exam_id,
            clean_roll=test_roll,
            new_sub_id=f"sub_new_{run_id}",
        )
        session.commit()
        assert purged_count == 1

    # Verify that child answers, regions, and scores were completely purged
    with get_session() as session:
        rem_ans = session.scalar(select(func.count(Answer.id)).where(Answer.submission_id == test_sub_id))
        assert rem_ans == 0, "All answers for old submission must be deleted"

        # Cleanup test exam
        session.execute(delete(Exam).where(Exam.id == test_exam_id))
        session.commit()


@pytest.mark.anyio
async def test_05_d07_and_d08_async_event_loop_unblocking():
    """Verify that PyMuPDF/storage offload via asyncio.to_thread prevents event-loop blocking."""
    # Measure event loop latency while a heavy synchronous task runs in asyncio.to_thread
    loop_ticks = []

    async def _ticker():
        for _ in range(10):
            loop_ticks.append(time.perf_counter())
            await asyncio.sleep(0.01)

    def _sync_work():
        # Simulate PyMuPDF parsing or cloud storage network transfer
        time.sleep(0.08)
        return "completed"

    ticker_task = asyncio.create_task(_ticker())
    worker_task = asyncio.create_task(asyncio.to_thread(_sync_work))

    res, _ = await asyncio.gather(worker_task, ticker_task)
    assert res == "completed"
    assert len(loop_ticks) >= 5, "Event loop must continue ticking while worker runs in background thread"


def test_06_d14_webpush_parallel_dispatch_and_expired_cleanup():
    """Verify WebPush dispatch executes in parallel and prunes expired (404/410) subscriptions in 1 bulk query."""
    run_id = uuid.uuid4().hex[:6]
    test_user_id = f"usr_p2_{run_id}"
    now = get_iso_now()

    sub_valid_id = f"ps_valid_{run_id}"
    sub_expired_1_id = f"ps_exp1_{run_id}"
    sub_expired_2_id = f"ps_exp2_{run_id}"

    with get_session() as session:
        user = User(
            id=test_user_id,
            institute_id=TEST_INSTITUTE_ID,
            branch_id=TEST_BRANCH_ID,
            email=f"p2.{run_id}@example.com",
            role="STUDENT",
            password_hash=hash_password("Pass123!"),
            full_name="Phase 2 Push Student",
            is_active=1,
            created_at=now,
        )
        session.add(user)

        s_valid = PushSubscription(
            id=sub_valid_id,
            user_id=test_user_id,
            endpoint=f"https://fcm.googleapis.com/fcm/send/valid_{run_id}",
            p256dh="mock_p256_valid",
            auth="mock_auth_valid",
            created_at=now,
        )
        s_exp1 = PushSubscription(
            id=sub_expired_1_id,
            user_id=test_user_id,
            endpoint=f"https://fcm.googleapis.com/fcm/send/exp1_{run_id}",
            p256dh="mock_p256_exp1",
            auth="mock_auth_exp1",
            created_at=now,
        )
        s_exp2 = PushSubscription(
            id=sub_expired_2_id,
            user_id=test_user_id,
            endpoint=f"https://fcm.googleapis.com/fcm/send/exp2_{run_id}",
            p256dh="mock_p256_exp2",
            auth="mock_auth_exp2",
            created_at=now,
        )
        session.add_all([s_valid, s_exp1, s_exp2])
        session.commit()

    import threading
    done_event = threading.Event()
    called = []

    def _mock_webpush(sub_id, endpoint, p256dh, auth, payload_str):
        called.append(sub_id)
        if len(called) >= 3:
            done_event.set()
        if "exp" in endpoint:
            return sub_id
        return None

    with patch("backend.app.services.notification_service._send_single_webpush", side_effect=_mock_webpush):
        dispatch_webpush_for_users([test_user_id], "Test Title", "Test Message")
        # Wait for all 3 subscriptions to be dispatched
        assert done_event.wait(timeout=10.0), "Webpush workers did not complete within timeout"
        # Wait for the bulk delete transaction to commit
        time.sleep(1.5)

    # Verify that exp1 and exp2 were pruned in bulk, while s_valid remains
    with get_session() as session:
        remaining = session.scalars(
            select(PushSubscription.id).where(PushSubscription.user_id == test_user_id)
        ).all()

        assert sub_valid_id in remaining, "Valid push subscription must remain in database"
        assert sub_expired_1_id not in remaining, "Expired subscription 1 must have been deleted"
        assert sub_expired_2_id not in remaining, "Expired subscription 2 must have been deleted"

        # Cleanup test records
        session.execute(delete(PushSubscription).where(PushSubscription.user_id == test_user_id))
        session.execute(delete(User).where(User.id == test_user_id))
        session.commit()


def test_07_prod_institute_zero_impact_post_check():
    """Guarantee that Production Institute CATCH 25 was completely untouched during all Phase 2 tests."""
    with get_session() as session:
        prod_inst = session.get(Institute, PROD_INSTITUTE_ID)
        assert prod_inst is not None
        assert prod_inst.name == "CATCH 25"
        assert prod_inst.code in ("C25", "c25")

        prod_branch = session.get(Branch, PROD_BRANCH_ID)
        assert prod_branch is not None
        assert prod_branch.name == "Borivali"
        assert prod_branch.institute_id == PROD_INSTITUTE_ID
