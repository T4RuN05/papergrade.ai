from datetime import datetime, timezone, timedelta
from pathlib import Path
import fitz
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.config import settings
from backend.app.database import get_db, init_db
from backend.app.services.auth import create_access_token
from backend.app.services.retention_service import RetentionService

client = TestClient(app)

def create_test_pdf_bytes(title: str, num_pages: int = 2) -> bytes:
    doc = fitz.open()
    for i in range(num_pages):
        page = doc.new_page(width=595, height=842)
        page.insert_text((50, 50), f"{title} - Page {i+1}", fontsize=14)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes

def test_exam_question_paper_and_answer_key_lifecycle_and_retention():
    """
    Validates complete lifecycle:
    1. Teacher creates exam and attaches Question Paper and Answer Key.
    2. Before publication, enrolled students receive 403 Forbidden on QP & Answer Key.
    3. Results are published -> 15-day retention deadline is assigned to the exam.
    4. Enrolled students can now view/download Question Paper and Answer Key (200 OK).
    5. After 15 days, retention service purges the exam documents -> endpoints return 410 Gone.
    """
    init_db()

    # 1. Admin login & token
    admin_login = client.post("/api/v1/auth/login", json={
        "email": "admin@papergrade.ai",
        "password": "AdminPassword123!"
    })
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 2. Get active branch
    branches = client.get("/api/v1/tenancy/branches", headers=admin_headers).json()
    branch_id = branches[0]["id"]

    # 3. Create exam
    exam_res = client.post("/api/v1/exams", data={
        "title": "Quantum Mechanics Final",
        "subject": "Physics",
        "branch_id": branch_id
    }, headers=admin_headers)
    assert exam_res.status_code == 200
    exam_id = exam_res.json()["id"]

    # 4. Attach Question Paper & Official Answer Key files
    qp_bytes = create_test_pdf_bytes("Quantum Mechanics Question Paper", 2)
    ak_bytes = create_test_pdf_bytes("Quantum Mechanics Official Answer Key", 3)

    exam_uploads_dir = settings.UPLOADS_DIR / f"exam_{exam_id}"
    exam_uploads_dir.mkdir(parents=True, exist_ok=True)
    qp_pdf = exam_uploads_dir / "question_paper.pdf"
    qp_pdf.write_bytes(qp_bytes)
    ak_pdf = exam_uploads_dir / "answer_key.pdf"
    ak_pdf.write_bytes(ak_bytes)

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE exams 
            SET question_paper_path = ?, answer_key_path = ?
            WHERE id = ?
        """, (str(qp_pdf), str(ak_pdf), exam_id))

    # 5. Generate Student Token directly
    stu_token = create_access_token({
        "sub": "stu_user_retention_test",
        "role": "STUDENT",
        "roll_number": "ROLL-RET-999"
    })
    stu_headers = {"Authorization": f"Bearer {stu_token}"}

    # 6. Verify: BEFORE results publication, student receives 403 Forbidden
    stu_qp_pre = client.get(f"/api/v1/exams/{exam_id}/question-paper", headers=stu_headers)
    assert stu_qp_pre.status_code == 403
    assert "published" in stu_qp_pre.json()["detail"].lower()

    stu_ak_pre = client.get(f"/api/v1/exams/{exam_id}/answer-key", headers=stu_headers)
    assert stu_ak_pre.status_code == 403
    assert "confidential" in stu_ak_pre.json()["detail"].lower() or "published" in stu_ak_pre.json()["detail"].lower()

    stu_meta_pre = client.get(f"/api/v1/exams/{exam_id}/answer-key/meta", headers=stu_headers)
    assert stu_meta_pre.status_code == 403

    # Teacher / Admin can access before publication
    adm_qp = client.get(f"/api/v1/exams/{exam_id}/question-paper", headers=admin_headers)
    assert adm_qp.status_code == 200
    assert adm_qp.headers["content-type"] == "application/pdf"

    # 7. Publish Results
    pub_res = client.post(f"/api/v1/exams/{exam_id}/publish", headers=admin_headers)
    assert pub_res.status_code == 200

    # Verify: retention_expires_at is assigned (15 days post-publication)
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT is_published, retention_expires_at, is_document_purged FROM exams WHERE id = ?", (exam_id,))
        exam_row = cursor.fetchone()
        assert exam_row["is_published"] == 1
        assert exam_row["retention_expires_at"] is not None
        assert exam_row["is_document_purged"] == 0

    # 8. Verify: AFTER results publication, student can access Question Paper and Answer Key
    stu_qp_post = client.get(f"/api/v1/exams/{exam_id}/question-paper", headers=stu_headers)
    assert stu_qp_post.status_code == 200
    assert stu_qp_post.headers["content-type"] == "application/pdf"

    stu_ak_post = client.get(f"/api/v1/exams/{exam_id}/answer-key", headers=stu_headers)
    assert stu_ak_post.status_code == 200
    assert stu_ak_post.headers["content-type"] == "application/pdf"

    stu_meta_post = client.get(f"/api/v1/exams/{exam_id}/answer-key/meta", headers=stu_headers)
    assert stu_meta_post.status_code == 200
    assert stu_meta_post.json()["has_document"] is True
    assert stu_meta_post.json()["is_purged"] is False

    # Page rendering endpoint works for students
    stu_page_post = client.get(f"/api/v1/exams/{exam_id}/answer-key/pages/1", headers=stu_headers)
    assert stu_page_post.status_code == 200
    assert stu_page_post.headers["content-type"] in ["image/png", "image/jpeg"]

    # 9. Simulate 16 days passing (retention expired)
    now = datetime.now(timezone.utc)
    past_expiry = (now - timedelta(days=1)).isoformat()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE exams SET retention_expires_at = ? WHERE id = ?", (past_expiry, exam_id))

    # Trigger automatic background purge scan
    purge_summary = RetentionService.check_and_purge_expired_submissions()
    assert purge_summary.get("purged_exams_count", 0) >= 1

    # 10. Verify: Endpoints now return 410 Gone
    stu_qp_purged = client.get(f"/api/v1/exams/{exam_id}/question-paper", headers=stu_headers)
    assert stu_qp_purged.status_code == 410
    assert "retention policy" in stu_qp_purged.json()["detail"].lower()

    stu_ak_purged = client.get(f"/api/v1/exams/{exam_id}/answer-key", headers=stu_headers)
    assert stu_ak_purged.status_code == 410
    assert "retention policy" in stu_ak_purged.json()["detail"].lower()

    # Meta returns is_purged: True, has_document: False
    stu_meta_purged = client.get(f"/api/v1/exams/{exam_id}/answer-key/meta", headers=stu_headers)
    assert stu_meta_purged.status_code == 200
    assert stu_meta_purged.json()["is_purged"] is True
    assert stu_meta_purged.json()["has_document"] is False

    # Page rendering endpoint also returns 410 Gone
    stu_page_purged = client.get(f"/api/v1/exams/{exam_id}/answer-key/pages/1", headers=stu_headers)
    assert stu_page_purged.status_code == 410
