import uuid
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.database import init_db, get_iso_now
from backend.app.db.session import SessionLocal
from backend.app.db.models import Exam, SubmissionWindow

client = TestClient(app)


def test_reopen_submission_window_via_api():
    """
    Validates that:
    1. Reopening with 'reason' (frontend format) succeeds with 200 OK.
    2. Reopening with 'reopen_reason' (backend format) succeeds with 200 OK.
    3. Old window is closed upon reopening.
    4. Reopening is blocked if evaluation has already started (400).
    """
    init_db()

    # 1. Admin login to get test tokens and branch
    admin_login = client.post("/api/v1/auth/login", json={
        "email": "admin@papergrade.ai",
        "password": "AdminPassword123!"
    })
    assert admin_login.status_code == 200, f"Admin login failed: {admin_login.text}"
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Fetch test branch
    branches_res = client.get("/api/v1/tenancy/branches", headers=admin_headers)
    assert branches_res.status_code == 200
    branches = branches_res.json()
    assert len(branches) > 0, "No branches found for test institute"

    test_branch = next((b for b in branches if b.get("institute_id") == "inst_test_institute"), None)
    assert test_branch is not None, "TEST INSTITUTE branch must exist"
    branch_id = test_branch["id"]
    institute_id = test_branch["institute_id"]

    exam_id = f"exam_test_{uuid.uuid4().hex[:8]}"
    now = get_iso_now()

    try:
        with SessionLocal() as db:
            exam = Exam(
                id=exam_id,
                title="Test Reopen Exam",
                subject="Physics",
                total_marks=50.0,
                institute_id=institute_id,
                branch_id=branch_id,
                status="WINDOW_CLOSED",
                lifecycle_status="WINDOW_CLOSED",
                created_at=now,
                updated_at=now,
            )
            db.add(exam)
            db.commit()

        # Step 1: Open initial window
        open_res = client.post(
            f"/api/v1/windows/{exam_id}/open",
            headers=admin_headers,
            json={"duration_minutes": 30, "grace_minutes": 2}
        )
        assert open_res.status_code == 200, f"Open window failed: {open_res.text}"

        # Step 2: Reopen using 'reason' (frontend payload format that previously threw 422)
        reopen_res1 = client.post(
            f"/api/v1/windows/{exam_id}/reopen",
            headers=admin_headers,
            json={
                "duration_minutes": 5,
                "reason": "Reopened by administrator for late submissions",
                "reopen_scope": "ALL_STUDENTS"
            }
        )
        assert reopen_res1.status_code == 200, f"Reopen with 'reason' failed (HTTP {reopen_res1.status_code}): {reopen_res1.text}"
        data1 = reopen_res1.json()
        assert data1["status"] == "success"
        assert data1["reopen_reason"] == "Reopened by administrator for late submissions"
        assert data1["reopen_scope"] == "ALL_STUDENTS"
        assert data1["duration_minutes"] == 5

        # Check DB to verify prior window is marked CLOSED and new one is OPEN
        with SessionLocal() as db:
            wins = db.query(SubmissionWindow).where(SubmissionWindow.exam_id == exam_id).all()
            assert len(wins) == 2
            closed_wins = [w for w in wins if w.status == "CLOSED"]
            open_wins = [w for w in wins if w.status == "OPEN"]
            assert len(closed_wins) == 1
            assert len(open_wins) == 1
            assert open_wins[0].id == data1["window_id"]

        # Step 3: Reopen using 'reopen_reason' (backend direct format)
        reopen_res2 = client.post(
            f"/api/v1/windows/{exam_id}/reopen",
            headers=admin_headers,
            json={
                "duration_minutes": 10,
                "reopen_reason": "Reopened with backend param",
                "reopen_scope": "UNSUBMITTED_ONLY"
            }
        )
        assert reopen_res2.status_code == 200, f"Reopen with 'reopen_reason' failed: {reopen_res2.text}"
        data2 = reopen_res2.json()
        assert data2["status"] == "success"
        assert data2["reopen_reason"] == "Reopened with backend param"

        # Step 4: Verify evaluation blocking
        with SessionLocal() as db:
            exam_ref = db.query(Exam).filter(Exam.id == exam_id).first()
            exam_ref.lifecycle_status = "EVALUATING"
            db.commit()

        reopen_res3 = client.post(
            f"/api/v1/windows/{exam_id}/reopen",
            headers=admin_headers,
            json={"reason": "Should fail"}
        )
        assert reopen_res3.status_code == 400
        assert "evaluation has already commenced" in reopen_res3.json()["detail"]

    finally:
        with SessionLocal() as db:
            db.query(SubmissionWindow).filter(SubmissionWindow.exam_id == exam_id).delete()
            db.query(Exam).filter(Exam.id == exam_id).delete()
            db.commit()
