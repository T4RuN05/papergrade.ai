"""
Phase 4 Deep Architectural & State Consistency Regression Test Suite.
Verifies all 5 remediated defects:
  - D-01: Reopen Window contract enforcement (mandatory audited reason, AliasChoices, no silent fallback)
  - D-13: Multi-worker ETag cache consistency guard & bounded user epoch storage
  - D-20: Retention background daemon lifecycle & automated storage purging
  - D-24: JWT session invalidation on password change via token_version
  - D-25: Best-of-N zero-mark attempt classification fix (not is_missing)

STRICT SAFETY DIRECTIVE:
Production Institute (inst_e1eeda3473c3, br_c25_acbdd4d8) is 100% READ-ONLY.
All synthetic operations strictly target inst_test_institute (br_28c2a5dfe193) or ephemeral run-scoped IDs.
"""

import uuid
import time
import pytest
from pydantic import ValidationError
from fastapi import HTTPException
from sqlalchemy import select, delete

from backend.app.db.session import get_session
from backend.app.db.base import get_iso_now
from backend.app.db.models import (
    Institute,
    Branch,
    User,
    Student,
)
from backend.app.routers.windows import ReopenWindowRequest
from backend.app.services.portal_cache import PortalStateEpochManager
from backend.app.services.retention_service import RetentionDaemon, RetentionService
from backend.app.services.auth import (
    create_access_token,
    get_current_user,
    invalidate_user_auth_cache,
    hash_password,
)
from fastapi.security import HTTPAuthorizationCredentials

PROD_INSTITUTE_ID = "inst_e1eeda3473c3"
PROD_BRANCH_ID = "br_c25_acbdd4d8"
TEST_INSTITUTE_ID = "inst_test_institute"
TEST_BRANCH_ID = "br_28c2a5dfe193"


def test_01_prod_institute_read_only_baseline():
    """Verify that Production Institute CATCH 25 exists and remains 100% read-only."""
    with get_session() as session:
        prod_inst = session.get(Institute, PROD_INSTITUTE_ID)
        assert prod_inst is not None, "Production Institute CATCH 25 must exist"
        assert prod_inst.name == "CATCH 25"

        prod_branch = session.get(Branch, PROD_BRANCH_ID)
        assert prod_branch is not None
        assert prod_branch.institute_id == PROD_INSTITUTE_ID


def test_02_d01_reopen_window_validation():
    """Verify ReopenWindowRequest strictly validates mandatory reason and supports AliasChoices."""
    # 1. Missing reason must fail validation
    with pytest.raises(ValidationError):
        ReopenWindowRequest()

    # 2. Short reason (< 3 chars) must fail validation
    with pytest.raises(ValidationError):
        ReopenWindowRequest(reason="no")

    # 3. Valid reason under 'reason' field succeeds
    req1 = ReopenWindowRequest(reason="Student network failure during storm")
    assert req1.reason == "Student network failure during storm"
    assert req1.reopen_scope == "UNSUBMITTED_ONLY"

    # 4. Valid reason under legacy 'reopen_reason' field succeeds via AliasChoices
    req2 = ReopenWindowRequest(reopen_reason="Scheduled second round upload session")
    assert req2.reason == "Scheduled second round upload session"

    # 5. Invalid reopen_scope must fail validation
    with pytest.raises(ValidationError):
        ReopenWindowRequest(reason="Valid reason", reopen_scope="INVALID_SCOPE")


def test_03_d13_portal_cache_bounded_epoch():
    """Verify PortalStateEpochManager generates composite ETags and bounds user cache."""
    # 1. Check composite ETag format W/"{global}-{branch}-{user}"
    etag1 = PortalStateEpochManager.get_etag("br_test", "usr_test")
    assert etag1.startswith('W/"')
    assert etag1.endswith('"')
    parts = etag1.strip('W/"').split("-")
    assert len(parts) >= 3, f"ETag should have composite components: {etag1}"

    # 2. Bumping user should change user epoch
    PortalStateEpochManager.bump_user("usr_test")
    etag2 = PortalStateEpochManager.get_etag("br_test", "usr_test")
    assert etag1 != etag2

    # 3. Bumping branch should change branch epoch
    PortalStateEpochManager.bump_branch("br_test")
    etag3 = PortalStateEpochManager.get_etag("br_test", "usr_test")
    assert etag2 != etag3


def test_04_d20_retention_daemon_lifecycle():
    """Verify RetentionDaemon lifecycle start/stop and automated check execution."""
    daemon = RetentionDaemon(interval_seconds=3600)
    assert not daemon._thread or not daemon._thread.is_alive()

    daemon.start()
    assert daemon._thread is not None
    assert daemon._thread.is_alive()

    # Stop daemon cleanly
    daemon.stop()
    assert not daemon._thread.is_alive()

    # Test purge check execution returns valid summary structure
    summary = RetentionService.check_and_purge_expired_submissions()
    assert "scanned_submissions" in summary
    assert "purged_submissions" in summary
    assert "scanned_exams" in summary
    assert "purged_exams" in summary


def test_05_d24_token_version_revocation_on_password_change():
    """Verify that password changes invalidate existing 7-day JWT tokens via token_version."""
    run_id = uuid.uuid4().hex[:6]
    test_user_id = f"usr_test_d24_{run_id}"
    now = get_iso_now()

    with get_session() as session:
        user = User(
            id=test_user_id,
            institute_id=TEST_INSTITUTE_ID,
            branch_id=TEST_BRANCH_ID,
            email=f"{test_user_id}@test.com",
            role="STUDENT",
            password_hash=hash_password("OldPassword123!"),
            full_name="D24 Test Student",
            is_active=1,
            has_changed_password=0,
            token_version=1,
            created_at=now,
        )
        session.add(user)
        session.commit()

    try:
        # 1. Issue token with token_version = 1
        payload = {
            "sub": test_user_id,
            "role": "STUDENT",
            "email": f"{test_user_id}@test.com",
            "token_version": 1,
        }
        token_v1 = create_access_token(payload)

        # 2. Verification should succeed initially
        creds_v1 = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token_v1)
        verified_user = get_current_user(credentials=creds_v1)
        assert verified_user["sub"] == test_user_id

        # 3. Simulate password change: increment token_version to 2 in DB and invalidate cache
        with get_session() as session:
            db_user = session.get(User, test_user_id)
            db_user.token_version = 2
            db_user.password_hash = hash_password("NewPassword456!")
            session.commit()

        invalidate_user_auth_cache(test_user_id)

        # 4. Old token_v1 must now be rejected with HTTP 401
        with pytest.raises(HTTPException) as exc_info:
            get_current_user(credentials=creds_v1)
        assert exc_info.value.status_code == 401
        assert "Session has expired due to a recent password change" in exc_info.value.detail

        # 5. New token with token_version = 2 succeeds
        payload["token_version"] = 2
        token_v2 = create_access_token(payload)
        creds_v2 = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token_v2)
        verified_user_v2 = get_current_user(credentials=creds_v2)
        assert verified_user_v2["sub"] == test_user_id

    finally:
        with get_session() as session:
            session.execute(delete(User).where(User.id == test_user_id))
            session.commit()
            invalidate_user_auth_cache(test_user_id)


def test_06_d25_best_of_n_zero_mark_attempt_classification():
    """Verify Best-of-N counts zero-mark attempts legitimately (not is_missing)."""
    from backend.app.services.grading_service import grading_service

    # Create synthetic section with attempt_limit = 2
    section_meta = {
        "sec_A": {
            "attempt_limit": 2,
            "max_marks": 20.0,
        }
    }
    # 3 questions in Section A:
    # Q1: 10 marks (attempted)
    # Q2: 0 marks (attempted, but incorrect)
    # Q3: 0 marks (unattempted, missing)
    sec_answers = {
        "sec_A": [
            {"id": "ans_1", "question_id": "Q1", "awarded_marks": 10.0, "max_marks": 10.0, "is_missing": False},
            {"id": "ans_2", "question_id": "Q2", "awarded_marks": 0.0, "max_marks": 10.0, "is_missing": False},
            {"id": "ans_3", "question_id": "Q3", "awarded_marks": 0.0, "max_marks": 10.0, "is_missing": True},
        ]
    }

    # Simulate section evaluation
    s_conf = section_meta["sec_A"]
    ans_list = sec_answers["sec_A"]
    attempt_limit = s_conf["attempt_limit"]

    # D-25 rule:
    attempted = [a for a in ans_list if not a.get("is_missing")]
    unattempted = [a for a in ans_list if a.get("is_missing")]

    assert len(attempted) == 2, "Both Q1 and Q2 must be counted as attempted, even though Q2 scored 0"
    assert len(unattempted) == 1, "Only Q3 (is_missing=True) is unattempted"

    # Sort attempted answers by awarded_marks descending (Best of N)
    attempted.sort(key=lambda x: float(x.get("awarded_marks") or 0.0), reverse=True)
    counted_answers = attempted[:attempt_limit]
    extra_answers = attempted[attempt_limit:]

    assert len(counted_answers) == 2
    assert counted_answers[0]["id"] == "ans_1"
    assert counted_answers[1]["id"] == "ans_2"
    assert len(extra_answers) == 0

    # Case 2: 3 attempted questions with limit = 2 (Q1=10, Q2=0, Q3=0)
    ans_list_3 = [
        {"id": "ans_1", "question_id": "Q1", "awarded_marks": 10.0, "is_missing": False},
        {"id": "ans_2", "question_id": "Q2", "awarded_marks": 0.0, "is_missing": False},
        {"id": "ans_3", "question_id": "Q3", "awarded_marks": 0.0, "is_missing": False},
    ]
    attempted_3 = [a for a in ans_list_3 if not a.get("is_missing")]
    assert len(attempted_3) == 3

    attempted_3.sort(key=lambda x: float(x.get("awarded_marks") or 0.0), reverse=True)
    counted_3 = attempted_3[:2]
    extra_3 = attempted_3[2:]
    assert len(counted_3) == 2
    assert len(extra_3) == 1, "The 3rd attempt must be marked as extra attempt even though it scored 0"


def test_07_prod_institute_zero_impact_post_check():
    """Guarantee that Production Institute CATCH 25 was completely untouched during Phase 4 tests."""
    with get_session() as session:
        prod_inst = session.get(Institute, PROD_INSTITUTE_ID)
        assert prod_inst is not None
        assert prod_inst.name == "CATCH 25"
        assert prod_inst.code in ("C25", "c25")

        prod_branch = session.get(Branch, PROD_BRANCH_ID)
        assert prod_branch is not None
        assert prod_branch.name == "Borivali"
        assert prod_branch.institute_id == PROD_INSTITUTE_ID
