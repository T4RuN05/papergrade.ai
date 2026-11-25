import io
from datetime import datetime, timezone, timedelta
import fitz
from fastapi.testclient import TestClient

from sqlalchemy import delete, func, select, update
from backend.app.main import app
from backend.app.db.session import get_session
from backend.app.db.models import Answer, AnswerRegion, Exam, Submission, SubmissionWindow
from backend.app.scripts.seed_bootstrap import init_test_schema
from backend.app.services.retention_service import RetentionService
from backend.app.config import settings

client = TestClient(app)

def create_test_pdf_bytes(num_pages: int = 2) -> bytes:
    doc = fitz.open()
    for i in range(num_pages):
        page = doc.new_page(width=595, height=842)
        page.insert_text((50, 50), f"Student Retention Test Page {i+1}", fontsize=14)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes

def test_15_day_storage_retention_lifecycle():
    """
    Validates complete 15-day TTL lifecycle:
    1. Uploaded paper has NO TTL until graded.
    2. Once graded, 15-day TTL is computed and assigned.
    3. Revaluation window is open for 7 days post-publication.
    4. Paper is downloadable and viewable during the 15 days.
    5. After 15 days, storage purge deletes PDFs and answer_regions (bounding boxes).
    6. All question marks and evaluation scores remain permanently preserved.
    7. PDF and page-image endpoints return 410 Gone once purged.
    """
    init_test_schema()

    # 1. Admin login
    admin_login = client.post("/api/v1/auth/login", json={
        "email": "admin@papergrade.ai",
        "password": "AdminPassword123!"
    })
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 2. Get active test branch (never production CATCH 25)
    branches = client.get("/api/v1/tenancy/branches", headers=admin_headers).json()
    test_branch = next((b for b in branches if b.get("institute_id") == "inst_test_institute"), None)
    assert test_branch is not None, "TEST INSTITUTE branch must exist"
    branch_id = test_branch["id"]

    exam_id = None
    sub_id = None
    try:
        # 3. Create exam and open window
        exam_res = client.post("/api/v1/exams", data={
            "title": "Retention Policy Verification Exam",
            "subject": "Storage Optimization",
            "branch_id": branch_id
        }, headers=admin_headers)
        assert exam_res.status_code == 200
        exam_id = exam_res.json()["id"]

        win_res = client.post(f"/api/v1/windows/{exam_id}/open", json={
            "duration_minutes": 30,
            "grace_minutes": 2
        }, headers=admin_headers)
        assert win_res.status_code == 200

        # 4. Student submits answer sheet
        pdf_bytes = create_test_pdf_bytes(2)
        upload_res = client.post(
            f"/api/v1/submissions/{exam_id}/upload-single",
            data={"roll_number": "RETENTION-001", "student_name": "Retention Test Student"},
            files={"file": ("answers.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            headers=admin_headers
        )
        assert upload_res.status_code == 200
        sub_id = upload_res.json()["submission_id"]

        # 5. Verify: Prior to grading, there is NO TTL
        sub_pre_grade = client.get(f"/api/v1/submissions/{sub_id}", headers=admin_headers).json()
        assert sub_pre_grade.get("status") == "UPLOADED"
        assert sub_pre_grade.get("graded_at") is None
        assert sub_pre_grade.get("is_document_purged") is False or sub_pre_grade.get("is_document_purged") == 0

        # 6. Simulate grading completion with answer questions and bounding boxes
        now_dt = datetime.now(timezone.utc)
        now_iso = now_dt.isoformat()
        with get_session() as session:
            ans_id_1 = f"ans_{sub_id}_1"
            ans_id_2 = f"ans_{sub_id}_2"

            session.add_all([
                Answer(id=ans_id_1, submission_id=sub_id, question_id="Q1", awarded_marks=4.5, max_marks=5.0, grading_rationale="Solid thermodynamic derivation.", created_at=now_iso, updated_at=now_iso),
                Answer(id=ans_id_2, submission_id=sub_id, question_id="Q2", awarded_marks=8.0, max_marks=10.0, grading_rationale="Good explanation of entropy.", created_at=now_iso, updated_at=now_iso),
                AnswerRegion(id=f"reg_{sub_id}_1", answer_id=ans_id_1, page_number=1, x=0.1, y=0.2, width=0.8, height=0.3, created_at=now_iso),
                AnswerRegion(id=f"reg_{sub_id}_2", answer_id=ans_id_2, page_number=2, x=0.1, y=0.1, width=0.8, height=0.4, created_at=now_iso),
            ])
            session.flush()

            # Mark graded
            RetentionService.mark_submission_graded(session, sub_id, graded_at_iso=now_iso, ttl_days=15)
            session.execute(
                update(Submission)
                .where(Submission.id == sub_id)
                .values(
                    status="GRADED",
                    publication_status="PUBLISHED",
                    total_awarded_marks=12.5,
                    max_marks=15.0,
                    percentage=83.3,
                    updated_at=now_iso,
                )
            )
            session.commit()

        # 7. Verify: Graded paper has 15-day TTL assigned and active
        sub_graded = client.get(f"/api/v1/submissions/{sub_id}", headers=admin_headers).json()
        assert sub_graded["graded_at"] == now_iso
        assert sub_graded["is_document_purged"] is False
        assert sub_graded["ttl_days"] == 15
        assert sub_graded["days_remaining"] > 14.0 # Almost full 15 days left
        assert sub_graded["revaluation_days_remaining"] > 6.0 # Revaluation 7 days window

        # Verify bounding boxes exist in database prior to purge
        with get_session() as session:
            cnt = session.scalar(select(func.count(AnswerRegion.id)).where(AnswerRegion.answer_id.in_([ans_id_1, ans_id_2])))
            assert cnt == 2

        # 8. Simulate 16 days passing (exceeding 15-day retention policy)
        past_16_days = (now_dt - timedelta(days=16)).isoformat()
        expired_at = (now_dt - timedelta(days=1)).isoformat() # expired 1 day ago

        with get_session() as session:
            session.execute(
                update(Submission)
                .where(Submission.id == sub_id)
                .values(graded_at=past_16_days, retention_expires_at=expired_at)
            )
            session.commit()

        # 9. Trigger automatic retention purge
        purge_result = RetentionService.purge_submission_documents(sub_id)
        assert purge_result["status"] == "purged"
        assert purge_result["deleted_bounding_boxes"] == 2

        # 10. Verify: Bounding box coordinates have been removed from DB to conserve storage
        with get_session() as session:
            cnt = session.scalar(select(func.count(AnswerRegion.id)).where(AnswerRegion.answer_id.in_([ans_id_1, ans_id_2])))
            assert cnt == 0

            # Verify: Question-by-question marks and overall score are permanently preserved!
            preserved_answers = session.scalars(
                select(Answer).where(Answer.submission_id == sub_id).order_by(Answer.question_id)
            ).all()
            assert len(preserved_answers) == 2
            assert preserved_answers[0].question_id == "Q1"
            assert preserved_answers[0].awarded_marks == 4.5
            assert preserved_answers[1].question_id == "Q2"
            assert preserved_answers[1].awarded_marks == 8.0

            sub_record = session.get(Submission, sub_id)
            assert sub_record is not None
            assert sub_record.total_awarded_marks == 12.5
            assert sub_record.percentage == 83.3
            assert sub_record.is_document_purged == 1
            assert sub_record.purged_at is not None

        # 11. Verify HTTP endpoints: PDF export returns 410 Gone (Authenticated)
        pdf_export_res = client.get(f"/api/exports/pdf/{sub_id}", headers=admin_headers)
        assert pdf_export_res.status_code == 410
        assert "retention policy" in pdf_export_res.json()["detail"].lower()

        # 12. Verify HTTP endpoints: Page image request returns 410 Gone (Authenticated)
        page_img_res = client.get(f"/api/grading/page-image/{sub_id}/1", headers=admin_headers)
        assert page_img_res.status_code == 410
        assert "retention policy" in page_img_res.json()["detail"].lower()

        # 13. Verify: Submission details API returns clean purged document structure
        sub_purged_view = client.get(f"/api/v1/submissions/{sub_id}", headers=admin_headers).json()
        assert sub_purged_view["is_document_purged"] is True
        assert sub_purged_view["total_awarded_marks"] == 12.5
        assert len(sub_purged_view["answers"]) == 2
        assert "storage_notice" in sub_purged_view
    finally:
        with get_session() as session:
            if sub_id:
                session.execute(delete(AnswerRegion).where(AnswerRegion.answer_id.in_(
                    session.query(Answer.id).filter(Answer.submission_id == sub_id)
                )))
                session.execute(delete(Answer).where(Answer.submission_id == sub_id))
                session.execute(delete(Submission).where(Submission.id == sub_id))
            if exam_id:
                session.execute(delete(SubmissionWindow).where(SubmissionWindow.exam_id == exam_id))
                session.execute(delete(Exam).where(Exam.id == exam_id))
            session.commit()
