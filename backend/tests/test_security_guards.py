import pytest
import uuid
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.auth import create_access_token
from backend.app.db.session import get_session
from backend.app.db.models import PasswordResetRequest, User, Submission, Exam
from backend.app.db.base import get_iso_now
from sqlalchemy import select

client = TestClient(app)

def test_owasp_security_headers():
    """Verify that all standard OWASP security headers are returned on API responses."""
    resp = client.get("/api/health")
    assert resp.status_code == 200
    headers = resp.headers
    assert headers.get("X-Content-Type-Options") == "nosniff"
    assert headers.get("X-Frame-Options") == "DENY"
    assert headers.get("X-XSS-Protection") == "1; mode=block"
    assert headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    assert "max-age=31536000" in headers.get("Strict-Transport-Security", "")
    assert "geolocation=()" in headers.get("Permissions-Policy", "")

def test_cors_restrictions():
    """Verify that untrusted origins are blocked and trusted origins are permitted."""
    # Evil origin check
    evil_resp = client.get(
        "/api/health",
        headers={"Origin": "https://evil-attacker.com"}
    )
    assert evil_resp.headers.get("access-control-allow-origin") != "https://evil-attacker.com"

    # Permitted origin check (Localhost)
    local_resp = client.get(
        "/api/health",
        headers={"Origin": "http://localhost:3000"}
    )
    assert local_resp.headers.get("access-control-allow-origin") == "http://localhost:3000"

    # Permitted Vercel production check
    vercel_resp = client.get(
        "/api/health",
        headers={"Origin": "https://papergrade-ai.vercel.app"}
    )
    assert vercel_resp.headers.get("access-control-allow-origin") == "https://papergrade-ai.vercel.app"

def test_unauthenticated_endpoints_rejected():
    """Verify that sensitive API endpoints reject unauthenticated requests with HTTP 401."""
    protected_get_routes = [
        "/api/v1/submissions",
        "/api/v1/submissions/sub_nonexistent/pdf",
        "/api/v1/exams",
        "/api/exports/batch-zip/batch_dummy",
        "/api/exports/marks-csv/exam_dummy",
        "/api/exports/pdf/sub_dummy",
        "/api/analytics/usage",
        "/api/v1/storage/download?key=test.pdf",
    ]

    for route in protected_get_routes:
        resp = client.get(route)
        assert resp.status_code == 401, f"Route {route} failed to reject unauthenticated request: {resp.status_code}"

    # Storage upload (PUT)
    upload_resp = client.put(
        "/api/v1/storage/upload?key=test.pdf",
        content=b"%PDF-1.4 dummy",
        headers={"Content-Type": "application/pdf"}
    )
    assert upload_resp.status_code == 401

def test_student_role_authorization_and_bola_isolation():
    """Verify that student tokens cannot access branch manager endpoints or modify other students' submissions."""
    student_token = create_access_token({
        "sub": "user_student_101",
        "role": "STUDENT",
        "student_id": "STU101",
        "roll_number": "ROLL101"
    })
    headers = {"Authorization": f"Bearer {student_token}"}

    # Students cannot download whole batch zip
    resp = client.get("/api/exports/batch-zip/batch_dummy", headers=headers)
    assert resp.status_code == 403

    # Students cannot download marks CSV
    resp = client.get("/api/exports/marks-csv/exam_dummy", headers=headers)
    assert resp.status_code == 403

    # Students cannot clear exam reviews
    resp = client.post("/api/grading/exams/exam_dummy/clear-all-reviews", headers=headers)
    assert resp.status_code == 403

    # Students cannot view usage analytics
    resp = client.get("/api/analytics/usage", headers=headers)
    assert resp.status_code == 403

    # Student cannot request presigned upload for another student's roll number
    resp = client.post(
        "/api/v1/submissions/exam_1/request-upload",
        json={"roll_number": "OTHER_STUDENT_ROLL", "filename": "ans.pdf"},
        headers=headers
    )
    assert resp.status_code == 403

    # Student cannot confirm upload for another student's roll number
    resp = client.post(
        "/api/v1/submissions/exam_1/confirm-upload",
        json={
            "upload_session_id": "sess_123",
            "storage_key": "submissions/exam_1/OTHER_STUDENT_ROLL/ans.pdf",
            "roll_number": "OTHER_STUDENT_ROLL"
        },
        headers=headers
    )
    assert resp.status_code == 403

    # Student cannot confirm upload with an arbitrary path outside submissions/{exam_id}/
    resp = client.post(
        "/api/v1/submissions/exam_1/confirm-upload",
        json={
            "upload_session_id": "sess_123",
            "storage_key": "arbitrary_dir/ans.pdf",
            "roll_number": "ROLL101"
        },
        headers=headers
    )
    assert resp.status_code == 400

    # Student cannot access another student's page image (BOLA isolation)
    with get_session() as session:
        exam = session.scalar(select(Exam).where(Exam.id == "exam_sec_test"))
        if not exam:
            session.add(Exam(
                id="exam_sec_test",
                title="Security Test Exam",
                subject="Test",
                total_marks=10.0,
                status="RUBRIC_APPROVED",
                created_at="2026-11-08T00:00:00",
                updated_at="2026-11-08T00:00:00"
            ))
            session.flush()

        sub_other = session.scalar(select(Submission).where(Submission.id == "sub_other_1"))
        if not sub_other:
            session.add(Submission(
                id="sub_other_1",
                exam_id="exam_sec_test",
                student_name="Other Student",
                roll_number="ROLL_OTHER_999",
                original_file_path="dummy.pdf",
                canonical_pdf_path="dummy.pdf",
                max_marks=10.0,
                status="PROCESSING",
                publication_status="PENDING",
                created_at="2026-11-08T00:00:00",
                updated_at="2026-11-08T00:00:00"
            ))
            session.commit()

    resp = client.get("/api/grading/page-image/sub_other_1/1", headers=headers)
    assert resp.status_code == 403

def test_storage_proxy_security():
    """Verify path traversal blocking, key restriction, and magic byte validation in storage proxy."""
    student_token = create_access_token({
        "sub": "user_student_102",
        "role": "STUDENT",
        "student_id": "STU102",
        "roll_number": "ROLL102"
    })
    headers = {"Authorization": f"Bearer {student_token}"}

    # Path traversal in download
    resp = client.get("/api/v1/storage/download?key=../../etc/passwd", headers=headers)
    assert resp.status_code == 400

    # Student accessing outside submissions or artifacts directory
    resp = client.get("/api/v1/storage/download?key=system/secrets.json", headers=headers)
    assert resp.status_code == 403

    # Path traversal in upload
    resp = client.put(
        "/api/v1/storage/upload?key=submissions/exam_1/ROLL102/../../traversal.pdf",
        content=b"%PDF-1.4 dummy",
        headers={**headers, "Content-Type": "application/pdf"}
    )
    assert resp.status_code == 400

    # Upload non-whitelisted path (student trying to write outside their own roll folder)
    resp = client.put(
        "/api/v1/storage/upload?key=submissions/exam_1/OTHER_STUDENT/paper.pdf",
        content=b"%PDF-1.4 dummy",
        headers={**headers, "Content-Type": "application/pdf"}
    )
    assert resp.status_code == 403

    # Upload spoofed extension (.pdf) with invalid magic bytes
    resp = client.put(
        "/api/v1/storage/upload?key=submissions/exam_1/ROLL102/fake.pdf",
        content=b"NOT_A_REAL_PDF_FILE_HEADER",
        headers={**headers, "Content-Type": "application/pdf"}
    )
    assert resp.status_code == 400
    assert "magic bytes" in resp.json().get("detail", "").lower()

def test_password_security_and_reset_protection():
    """Verify password length requirement (>=8 chars) and reset session secret protection."""
    # Create a mock approved reset request with a secret
    test_req_id = f"pr_{uuid.uuid4().hex[:12]}"
    secret = "secret_session_token_123"
    token = "rst_actual_token_abc"
    now = get_iso_now()

    with get_session() as session:
        user = session.scalar(select(User).limit(1))
        assert user is not None, "Test requires at least one user in DB"
        user_id = user.id

        pr = PasswordResetRequest(
            id=test_req_id,
            user_id=user_id,
            status="APPROVED",
            reset_token=f"{secret}:{token}",
            created_at=now,
            expires_at="2099-01-01T00:00:00Z"
        )
        session.add(pr)
        session.commit()

    try:
        # Polling status without secret -> reset_token is NOT exposed
        resp = client.get(f"/api/v1/auth/forgot-password/status/{test_req_id}")
        assert resp.status_code == 200
        assert resp.json().get("reset_token") is None

        # Polling status with wrong secret -> reset_token is NOT exposed
        resp = client.get(f"/api/v1/auth/forgot-password/status/{test_req_id}?session_secret=wrong_secret")
        assert resp.status_code == 200
        assert resp.json().get("reset_token") is None

        # Polling status with valid secret -> reset_token IS released
        resp = client.get(f"/api/v1/auth/forgot-password/status/{test_req_id}?session_secret={secret}")
        assert resp.status_code == 200
        assert resp.json().get("reset_token") == token

        # Completing reset with password shorter than 8 chars -> 400
        resp = client.post(
            "/api/v1/auth/forgot-password/reset",
            json={
                "request_id": test_req_id,
                "reset_token": token,
                "new_password": "short"
            }
        )
        assert resp.status_code == 400
        assert "8 characters" in resp.json().get("detail", "")
    finally:
        with get_session() as session:
            db_pr = session.get(PasswordResetRequest, test_req_id)
            if db_pr:
                session.delete(db_pr)
                session.commit()
