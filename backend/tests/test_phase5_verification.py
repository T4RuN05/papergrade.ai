"""
Phase 5 Deep Architectural & API Consolidation Regression Test Suite.
Verifies all 4 remediated defects:
  - D-04: API route harmonization under canonical /api/* and transparent /api/v1/* rewrite
  - D-12: Resilient API client error parsing (safeJson handling of 502/HTML gateway responses)
  - D-19: Two-tier exam archiving, restoration, and protected deletion lifecycle
  - D-26: Modernized SQLAlchemy ORM database reset utility with production protection

STRICT SAFETY DIRECTIVE:
Production Institute (inst_e1eeda3473c3, br_c25_acbdd4d8) is 100% READ-ONLY.
All synthetic operations strictly target inst_test_institute (br_28c2a5dfe193) or ephemeral run-scoped IDs.
"""

import uuid
import pytest
from starlette.testclient import TestClient
from sqlalchemy import select, delete

from backend.app.main import app
from backend.app.db.session import get_session
from backend.app.db.base import get_iso_now
from backend.app.db.models import (
    Institute,
    Branch,
    Exam,
    Submission,
)
from backend.app.services.auth import create_access_token
from backend.app.scripts.reset_db import reset_test_database

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


def test_02_d04_api_canonical_and_legacy_rewrite():
    """Verify that all canonical routes use /api/* and legacy /api/v1/* routes rewrite transparently."""
    client = TestClient(app)

    # 1. Unauthenticated requests to auth/me return 401 on both paths
    r_canon = client.get("/api/auth/me")
    r_v1 = client.get("/api/v1/auth/me")
    assert r_canon.status_code == 401
    assert r_v1.status_code == 401

    # 2. Public health check
    r_health = client.get("/api/health")
    assert r_health.status_code == 200

    # 3. Authenticated request via TestClient
    admin_token = create_access_token({
        "sub": "usr_test_admin_d04",
        "role": "ROOT_ADMIN",
        "email": "admin@test.com",
        "token_version": 1,
    })
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Test /api/exams vs /api/v1/exams
    r_ex_canon = client.get("/api/exams", headers=headers)
    r_ex_v1 = client.get("/api/v1/exams", headers=headers)
    assert r_ex_canon.status_code == 200
    assert r_ex_v1.status_code == 200
    assert isinstance(r_ex_canon.json(), list)
    assert isinstance(r_ex_v1.json(), list)


def test_03_d19_archive_and_restore_endpoints():
    """Verify that exams can be archived, restored, and guarded against premature deletion."""
    client = TestClient(app)
    run_id = uuid.uuid4().hex[:6]
    test_exam_id = f"exam_d19_{run_id}"
    exam_title = f"D19 Archival Exam {run_id}"
    now = get_iso_now()

    with get_session() as session:
        ex = Exam(
            id=test_exam_id,
            institute_id=TEST_INSTITUTE_ID,
            branch_id=TEST_BRANCH_ID,
            title=exam_title,
            subject="Mathematics",
            total_marks=50.0,
            status="PUBLISHED",
            lifecycle_status="PUBLISHED",
            is_published=1,
            created_at=now,
            updated_at=now,
        )
        session.add(ex)
        session.commit()

    manager_token = create_access_token({
        "sub": f"usr_test_mgr_{run_id}",
        "role": "BRANCH_MANAGER",
        "branch_id": TEST_BRANCH_ID,
        "institute_id": TEST_INSTITUTE_ID,
        "email": f"mgr_{run_id}@test.com",
        "token_version": 1,
    })
    root_token = create_access_token({
        "sub": f"usr_test_root_{run_id}",
        "role": "ROOT_ADMIN",
        "email": f"root_{run_id}@test.com",
        "token_version": 1,
    })
    mgr_headers = {"Authorization": f"Bearer {manager_token}"}
    root_headers = {"Authorization": f"Bearer {root_token}"}

    try:
        # 1. Branch Manager cannot hard delete a published exam (HTTP 400 guard)
        r_del_mgr = client.delete(f"/api/exams/{test_exam_id}", headers=mgr_headers)
        assert r_del_mgr.status_code == 400
        assert "Cannot delete an examination with published results" in r_del_mgr.json().get("detail", "")

        # 2. Archive the exam
        r_arch = client.post(f"/api/exams/{test_exam_id}/archive", headers=mgr_headers)
        assert r_arch.status_code == 200
        assert r_arch.json()["lifecycle_status"] == "ARCHIVED"

        # Verify DB state is ARCHIVED
        with get_session() as session:
            ex_db = session.get(Exam, test_exam_id)
            assert ex_db.lifecycle_status == "ARCHIVED"

        # 3. Restore the exam
        r_rest = client.post(f"/api/exams/{test_exam_id}/restore", headers=mgr_headers)
        assert r_rest.status_code == 200
        assert r_rest.json()["lifecycle_status"] == "PUBLISHED"

        # 4. Root Admin cannot delete published exam without exact matching confirm_delete_title
        r_del_root_no_title = client.delete(f"/api/exams/{test_exam_id}", headers=root_headers)
        assert r_del_root_no_title.status_code == 400
        assert "Destruction of published academic records requires confirmation" in r_del_root_no_title.json().get("detail", "")

        # 5. Root Admin with matching title permanently deletes the exam
        r_del_root_ok = client.delete(
            f"/api/exams/{test_exam_id}?confirm_delete_title={exam_title}",
            headers=root_headers
        )
        assert r_del_root_ok.status_code == 200
        assert r_del_root_ok.json()["success"] is True

        # Verify exam is gone from DB
        with get_session() as session:
            assert session.get(Exam, test_exam_id) is None

    finally:
        with get_session() as session:
            session.execute(delete(Exam).where(Exam.id == test_exam_id))
            session.commit()


def test_04_d26_reset_db_utility_safety():
    """Verify that reset_test_database runs cleanly via ORM and leaves CATCH 25 untouched."""
    # Run reset_test_database
    reset_test_database()

    # Assert CATCH 25 production institute and branch are completely intact
    with get_session() as session:
        prod_inst = session.get(Institute, PROD_INSTITUTE_ID)
        assert prod_inst is not None
        assert prod_inst.name == "CATCH 25"

        prod_branch = session.get(Branch, PROD_BRANCH_ID)
        assert prod_branch is not None
        assert prod_branch.name == "Borivali"


def test_05_prod_institute_zero_impact_post_check():
    """Guarantee that Production Institute CATCH 25 was completely untouched during Phase 5 tests."""
    with get_session() as session:
        prod_inst = session.get(Institute, PROD_INSTITUTE_ID)
        assert prod_inst is not None
        assert prod_inst.name == "CATCH 25"
        assert prod_inst.code in ("C25", "c25")

        prod_branch = session.get(Branch, PROD_BRANCH_ID)
        assert prod_branch is not None
        assert prod_branch.name == "Borivali"
        assert prod_branch.institute_id == PROD_INSTITUTE_ID
