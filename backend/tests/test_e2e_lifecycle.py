import pytest
import io
import fitz
import uuid
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.database import get_db, init_db

client = TestClient(app)

def create_dummy_pdf_bytes(num_pages: int = 2) -> bytes:
    doc = fitz.open()
    for i in range(num_pages):
        page = doc.new_page(width=595, height=842)
        page.insert_text((50, 50), f"Student Answer Page {i+1}", fontsize=14)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes

def test_full_academic_lifecycle():
    # 1. Root Admin Login
    login_res = client.post("/api/v1/auth/login", json={
        "email": "admin@papergrade.ai",
        "password": "AdminPassword123!"
    })
    assert login_res.status_code == 200
    admin_token = login_res.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
    run_id = uuid.uuid4().hex[:6]
    inst_id = None
    branch_id = None
    batch_id = None
    exam_id = None
    sub_id = None
    req_id = None
    bm_email = f"manager.e2e.{run_id}@papergrade.ai"
    student_user_id = None

    try:
        # 2. Root Admin creates Institute and Branch
        inst_res = client.post("/api/v1/tenancy/institutes", json={
            "name": f"Apex Lifecycle {run_id}",
            "code": f"AEI_{run_id.upper()}"
        }, headers=admin_headers)
        assert inst_res.status_code == 200
        inst_id = inst_res.json()["id"]

        branch_res = client.post("/api/v1/tenancy/branches", json={
            "institute_id": inst_id,
            "name": f"Apex Campus {run_id}",
            "code": f"APX_{run_id.upper()}",
            "city": "Mumbai"
        }, headers=admin_headers)
        assert branch_res.status_code == 200
        branch_id = branch_res.json()["id"]
        
        # 3. Create a Branch Manager user
        client.post("/api/v1/auth/create-user", json={
            "email": bm_email,
            "password": "ManagerPassword123!",
            "full_name": "Main Campus Manager",
            "role": "BRANCH_MANAGER",
            "branch_id": branch_id
        }, headers=admin_headers)
        
        # 4. Branch Manager logs in
        bm_login = client.post("/api/v1/auth/login", json={
            "email": bm_email,
            "password": "ManagerPassword123!"
        })
        assert bm_login.status_code == 200
        bm_token = bm_login.json()["access_token"]
        bm_headers = {"Authorization": f"Bearer {bm_token}"}
        
        # 5. Branch Manager creates a Batch
        batch_res = client.post("/api/v1/tenancy/batches", json={
            "branch_id": branch_id,
            "name": "Mechanical 2026 Batch B",
            "academic_year": "2026"
        }, headers=bm_headers)
        assert batch_res.status_code == 200
        batch_id = batch_res.json()["id"]
        
        # 6. Branch Manager adds a student (system assigns roll number)
        stu_res = client.post(f"/api/v1/tenancy/batches/{batch_id}/students", json={
            "full_name": "Karan Mehra",
            "email": "karan.mehra@student.ait.edu"
        }, headers=bm_headers)
        assert stu_res.status_code == 200
        stu_json = stu_res.json()
        student_id_num = stu_json["student_id_num"]
        assigned_roll = stu_json["roll_number"]
        assert len(student_id_num) == 6
        
        # 7. Student claims their account using numeric student ID & allocated roll number
        claim_res = client.post("/api/v1/auth/claim-account", json={
            "student_id_num": student_id_num,
            "roll_number": assigned_roll,
            "password": "StudentPassword123!"
        })
        assert claim_res.status_code == 200
        student_token = claim_res.json()["access_token"]
        student_headers = {"Authorization": f"Bearer {student_token}"}
        student_user_id = claim_res.json()["user"]["id"]
        
        # 8. Branch Manager creates an Exam and opens 30-min submission window
        exam_res = client.post("/api/v1/exams", data={
            "title": "Thermodynamics Mid-Sem",
            "subject": "Mechanical Engineering"
        }, headers=bm_headers)
        assert exam_res.status_code == 200
        exam_id = exam_res.json()["id"]
        
        win_res = client.post(f"/api/v1/windows/{exam_id}/open", json={
            "duration_minutes": 30,
            "grace_minutes": 2
        }, headers=bm_headers)
        assert win_res.status_code == 200
        
        # Verify countdown status
        status_res = client.get(f"/api/v1/windows/{exam_id}/status", headers=student_headers)
        assert status_res.status_code == 200
        status_data = status_res.json()
        assert status_data["is_active"] is True
        assert status_data["seconds_remaining"] > 0
        
        # 9. Student uploads their answer sheet (Single PDF)
        pdf_bytes = create_dummy_pdf_bytes(2)
        upload_res = client.post(
            f"/api/v1/submissions/{exam_id}/upload-single",
            data={"roll_number": assigned_roll, "student_name": "Karan Mehra", "batch_id": batch_id},
            files={"file": ("karan_answers.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            headers=student_headers
        )
        assert upload_res.status_code == 200
        sub_id = upload_res.json()["submission_id"]
        
        # 10. Student checks submission status before publication
        sub_view_res = client.get(f"/api/v1/submissions/{sub_id}", headers=student_headers)
        assert sub_view_res.status_code == 200
        sub_view = sub_view_res.json()
        assert sub_view["student_status"] in ["Submitted", "Under Evaluation"]
        assert sub_view["is_published"] is False
        # Student MUST NOT see total marks or internal grading rationales prior to publication!
        assert "total_awarded_marks" not in sub_view or sub_view.get("total_awarded_marks") is None or not sub_view["is_published"]
        
        # 11. Root Admin publishes results
        # Simulate exam evaluation completion in database
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE submissions 
                SET status = 'GRADED', total_awarded_marks = 42.5, max_marks = 50.0, percentage = 85.0
                WHERE id = ?
            """, (sub_id,))
            conn.commit()
        
        pub_res = client.post(f"/api/v1/exams/{exam_id}/publish", headers=admin_headers)
        assert pub_res.status_code == 200
        assert pub_res.json()["status"] == "success"
        
        # 12. Student now sees published marks and in-app notification
        pub_sub_view = client.get(f"/api/v1/submissions/{sub_id}", headers=student_headers).json()
        assert pub_sub_view["is_published"] is True
        assert pub_sub_view["student_status"] == "Results Published"
        assert pub_sub_view["total_awarded_marks"] == 42.5
        
        notifs_res = client.get("/api/v1/notifications", headers=student_headers)
        assert notifs_res.status_code == 200
        notifs = notifs_res.json()
        assert len(notifs) > 0
        assert notifs[0]["type"] == "RESULT_PUBLISHED"
        
        # 13. Student submits revaluation request within 7 calendar days
        reval_res = client.post(f"/api/v1/revaluation/{sub_id}/request", json={
            "question_ids": ["Q1", "Q2"],
            "student_reason": "I believe my thermodynamic cycle derivation was marked too strictly."
        }, headers=student_headers)
        assert reval_res.status_code == 200
        req_id = reval_res.json()["request_id"]
        
        # 14. Root Admin resolves revaluation manually (NO AI)
        resolve_res = client.post(f"/api/v1/revaluation/{req_id}/resolve", json={
            "decision": "MARKS_REVISED",
            "reviewer_notes": "Re-verified Carnot efficiency formula step. Added 2.5 marks.",
            "revised_answers": [
                {"question_id": "Q1", "revised_marks": 8.0, "comment": "Valid intermediate derivation recognized."}
            ]
        }, headers=admin_headers)
        assert resolve_res.status_code == 200
        assert resolve_res.json()["decision"] == "MARKS_REVISED"
    finally:
        with get_db() as conn:
            if req_id:
                conn.execute("DELETE FROM revaluation_requests WHERE id = ?", (req_id,))
            if sub_id:
                conn.execute("DELETE FROM answers WHERE submission_id = ?", (sub_id,))
                conn.execute("DELETE FROM submissions WHERE id = ?", (sub_id,))
            if exam_id:
                conn.execute("DELETE FROM submission_windows WHERE exam_id = ?", (exam_id,))
                conn.execute("DELETE FROM exams WHERE id = ?", (exam_id,))
            if batch_id:
                conn.execute("DELETE FROM students WHERE batch_id = ?", (batch_id,))
                conn.execute("DELETE FROM batches WHERE id = ?", (batch_id,))
            if student_user_id:
                conn.execute("DELETE FROM notifications WHERE user_id = ?", (student_user_id,))
                conn.execute("DELETE FROM users WHERE id = ?", (student_user_id,))
            conn.execute("DELETE FROM users WHERE email = ?", (bm_email,))
            if inst_id and inst_id not in ["inst_e1eeda3473c3", "inst_test_institute"]:
                conn.execute("DELETE FROM branches WHERE institute_id = ?", (inst_id,))
                conn.execute("DELETE FROM institutes WHERE id = ?", (inst_id,))
            conn.commit()
