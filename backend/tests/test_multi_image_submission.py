import io
from PIL import Image
import fitz
from fastapi.testclient import TestClient

from sqlalchemy import delete
from backend.app.main import app
from backend.app.db.session import get_session
from backend.app.db.models import Answer, AnswerRegion, Exam, Submission, SubmissionWindow

client = TestClient(app)

def create_dummy_image_bytes(color=(255, 255, 255)) -> bytes:
    buf = io.BytesIO()
    img = Image.new("RGB", (300, 400), color=color)
    img.save(buf, format="JPEG")
    return buf.getvalue()

def test_multi_image_submission_assembly():
    exam_id = None
    sub_id = None
    try:
        # 1. Login as admin
        login_res = client.post("/api/v1/auth/login", json={
            "email": "admin@papergrade.ai",
            "password": "AdminPassword123!"
        })
        assert login_res.status_code == 200
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Get active test branch (never production CATCH 25)
        branches = client.get("/api/v1/tenancy/branches", headers=headers).json()
        test_branch = next((b for b in branches if b.get("institute_id") == "inst_test_institute"), None)
        assert test_branch is not None, "TEST INSTITUTE branch must exist"
        branch_id = test_branch["id"]

        # 3. Create exam & open window
        exam_res = client.post("/api/v1/exams", data={
            "title": "Camera Scan Multi-Page Test",
            "subject": "Physics",
            "branch_id": branch_id
        }, headers=headers)
        assert exam_res.status_code == 200
        exam_id = exam_res.json()["id"]

        win_res = client.post(f"/api/v1/windows/{exam_id}/open", json={
            "duration_minutes": 30,
            "grace_minutes": 2
        }, headers=headers)
        assert win_res.status_code == 200

        # 4. Upload raw uncompressed photos directly to API (simulating rogue/legacy client)
        # Should be rejected with 400 Bad Request to protect 0.1 vCPU server from CPU exhaustion
        img1 = create_dummy_image_bytes((255, 200, 200))
        img2 = create_dummy_image_bytes((200, 255, 200))
        img3 = create_dummy_image_bytes((200, 200, 255))

        files = [
            ("files", ("17924817560012701911000158391796.jpg", io.BytesIO(img1), "image/jpeg")),
            ("files", ("page_2.jpg", io.BytesIO(img2), "image/jpeg")),
            ("files", ("page_3.jpg", io.BytesIO(img3), "image/jpeg")),
        ]

        rejected_res = client.post(
            f"/api/v1/submissions/{exam_id}/upload-single",
            data={"roll_number": "SCAN-001", "student_name": "Scanner Student"},
            files=files,
            headers=headers
        )
        assert rejected_res.status_code == 400
        assert "single canonical PDF" in rejected_res.json()["detail"]

        # 5. Upload client-assembled canonical PDF
        doc = fitz.open()
        for img_bytes in [img1, img2, img3]:
            img_doc = fitz.open(stream=img_bytes, filetype="jpeg")
            rect = img_doc[0].rect
            page = doc.new_page(width=rect.width, height=rect.height)
            page.insert_image(rect, stream=img_bytes)
        pdf_bytes = doc.write()
        doc.close()

        upload_res = client.post(
            f"/api/v1/submissions/{exam_id}/upload-single",
            data={"roll_number": "SCAN-001", "student_name": "Scanner Student"},
            files={"file": ("canonical_answers.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            headers=headers
        )
        assert upload_res.status_code == 200
        data = upload_res.json()
        assert data["status"] == "success"
        assert data["page_count"] == 3
        assert data["roll_number"] == "SCAN-001"
        sub_id = data.get("submission_id")
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
                session.execute(delete(Submission).where(Submission.exam_id == exam_id))
                session.execute(delete(Exam).where(Exam.id == exam_id))
            session.commit()
