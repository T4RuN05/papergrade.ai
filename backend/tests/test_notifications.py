import uuid
import io
import fitz
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.database import get_db, init_db
from backend.app.db.session import get_session
from backend.app.db.models import Institute, Branch, Batch, Student, User, Exam, Submission, Answer, RevaluationRequest, Notification, PasswordResetRequest
from sqlalchemy import delete

client = TestClient(app)

def create_dummy_pdf():
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((50, 50), "Test Answer Script Page", fontsize=12)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes

def test_role_scoped_notification_lifecycle():
    init_db()
    run_id = uuid.uuid4().hex[:6]

    # 1. Root Admin Login
    admin_login = client.post("/api/v1/auth/login", json={
        "email": "admin@papergrade.ai",
        "password": "AdminPassword123!"
    })
    assert admin_login.status_code == 200
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}
    inst_id = None

    try:
        # 2. Setup Institute and Two Distinct Branches
        inst_res = client.post("/api/v1/tenancy/institutes", json={
            "name": f"University {run_id}",
            "code": f"UNIV_{run_id}"
        }, headers=admin_headers)
        inst_id = inst_res.json().get("id")
        if not inst_id:
            insts = client.get("/api/v1/tenancy/institutes", headers=admin_headers).json()
            inst_id = insts[0]["id"]
    
        # Create Branch North
        b_north_res = client.post("/api/v1/tenancy/branches", json={
            "institute_id": inst_id,
            "name": f"North Campus {run_id}",
            "code": f"BN_{run_id}",
            "city": "Delhi"
        }, headers=admin_headers)
        assert b_north_res.status_code == 200
        branch_north_id = b_north_res.json()["id"]
    
        # Create Branch South
        b_south_res = client.post("/api/v1/tenancy/branches", json={
            "institute_id": inst_id,
            "name": f"South Campus {run_id}",
            "code": f"BS_{run_id}",
            "city": "Bengaluru"
        }, headers=admin_headers)
        assert b_south_res.status_code == 200
        branch_south_id = b_south_res.json()["id"]
    
        # 3. Create Managers for North and South
        bm_north_email = f"mgr.north.{run_id}@papergrade.ai"
        client.post("/api/v1/auth/create-user", json={
            "email": bm_north_email,
            "password": "ManagerPassword123!",
            "full_name": "North Branch Manager",
            "role": "BRANCH_MANAGER",
            "branch_id": branch_north_id
        }, headers=admin_headers)
        bm_north_login = client.post("/api/v1/auth/login", json={"email": bm_north_email, "password": "ManagerPassword123!"})
        bm_north_headers = {"Authorization": f"Bearer {bm_north_login.json()['access_token']}"}
    
        bm_south_email = f"mgr.south.{run_id}@papergrade.ai"
        client.post("/api/v1/auth/create-user", json={
            "email": bm_south_email,
            "password": "ManagerPassword123!",
            "full_name": "South Branch Manager",
            "role": "BRANCH_MANAGER",
            "branch_id": branch_south_id
        }, headers=admin_headers)
        bm_south_login = client.post("/api/v1/auth/login", json={"email": bm_south_email, "password": "ManagerPassword123!"})
        bm_south_headers = {"Authorization": f"Bearer {bm_south_login.json()['access_token']}"}
    
        # 4. Create Batches in North & South
        batch_north_res = client.post("/api/v1/tenancy/batches", json={
            "branch_id": branch_north_id,
            "name": f"North Batch {run_id}",
            "code": f"NB_{run_id}",
            "academic_year": "2026"
        }, headers=bm_north_headers)
        assert batch_north_res.status_code == 200
        batch_north_id = batch_north_res.json()["id"]
    
        batch_south_res = client.post("/api/v1/tenancy/batches", json={
            "branch_id": branch_south_id,
            "name": f"South Batch {run_id}",
            "code": f"SB_{run_id}",
            "academic_year": "2026"
        }, headers=bm_south_headers)
        assert batch_south_res.status_code == 200
        batch_south_id = batch_south_res.json()["id"]
    
        # 5. Add Student A in North, Student B in South, and claim their accounts
        roll_a = f"N{run_id}".upper()
        stu_a_res = client.post(f"/api/v1/tenancy/batches/{batch_north_id}/students", json={
            "roll_number": roll_a,
            "full_name": f"Aarav {run_id}",
            "email": f"aarav.{run_id}@ait.edu"
        }, headers=bm_north_headers)
        assert stu_a_res.status_code == 200
        stu_a_num = stu_a_res.json()["student_id_num"]
    
        claim_a = client.post("/api/v1/auth/claim-account", json={
            "student_id_num": stu_a_num,
            "roll_number": roll_a,
            "password": "StudentPassword123!"
        })
        assert claim_a.status_code == 200
        stu_a_headers = {"Authorization": f"Bearer {claim_a.json()['access_token']}"}
    
        roll_b = f"S{run_id}".upper()
        stu_b_res = client.post(f"/api/v1/tenancy/batches/{batch_south_id}/students", json={
            "roll_number": roll_b,
            "full_name": f"Bhavya {run_id}",
            "email": f"bhavya.{run_id}@ait.edu"
        }, headers=bm_south_headers)
        assert stu_b_res.status_code == 200
        stu_b_num = stu_b_res.json()["student_id_num"]
    
        claim_b = client.post("/api/v1/auth/claim-account", json={
            "student_id_num": stu_b_num,
            "roll_number": roll_b,
            "password": "StudentPassword123!"
        })
        assert claim_b.status_code == 200
        stu_b_headers = {"Authorization": f"Bearer {claim_b.json()['access_token']}"}
    
        # 6. Branch Manager North creates an Exam in North Branch
        exam_res = client.post("/api/v1/exams", data={
            "title": f"Heat Transfer {run_id}",
            "subject": "Thermodynamics"
        }, headers=bm_north_headers)
        assert exam_res.status_code == 200
        exam_id = exam_res.json()["id"]
    
        # Verify: Student A (North) gets EXAM_CREATED notification
        notifs_a = client.get("/api/v1/notifications", headers=stu_a_headers).json()
        assert any(n["type"] == "EXAM_CREATED" and run_id in n["message"] for n in notifs_a)
    
        # Verify: Student B (South) MUST NOT receive any notification from North exam!
        notifs_b = client.get("/api/v1/notifications", headers=stu_b_headers).json()
        assert not any(n["type"] == "EXAM_CREATED" and run_id in n["message"] for n in notifs_b)
    
        # Verify: Root Admin receives EXAM_CREATED alert from Branch North
        notifs_admin = client.get("/api/v1/notifications", headers=admin_headers).json()
        assert any(n["type"] == "EXAM_CREATED" and run_id in n["message"] for n in notifs_admin)
    
        # 7. Open submission window for North Exam
        client.post(f"/api/v1/windows/{exam_id}/open", json={"duration_minutes": 30, "grace_minutes": 2}, headers=bm_north_headers)
    
        # Student A receives WINDOW_OPENED; Student B does NOT
        notifs_a = client.get("/api/v1/notifications", headers=stu_a_headers).json()
        assert any(n["type"] == "WINDOW_OPENED" for n in notifs_a)
    
        notifs_b = client.get("/api/v1/notifications", headers=stu_b_headers).json()
        assert not any(n["type"] == "WINDOW_OPENED" and run_id in n["message"] for n in notifs_b)
    
        # 8. Student A uploads answer sheet
        pdf_bytes = create_dummy_pdf()
        upload_res = client.post(
            f"/api/v1/submissions/{exam_id}/upload-single",
            data={"roll_number": roll_a, "student_name": f"Aarav {run_id}", "batch_id": batch_north_id},
            files={"file": ("aarav_answers.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            headers=stu_a_headers
        )
        assert upload_res.status_code == 200
        sub_id = upload_res.json()["submission_id"]
    
        # Student A receives SUBMISSION_CONFIRMED
        notifs_a = client.get("/api/v1/notifications", headers=stu_a_headers).json()
        assert any(n["type"] == "SUBMISSION_CONFIRMED" for n in notifs_a)
    
        # Manager North receives SUBMISSION_RECEIVED; Manager South does NOT
        notifs_mgr_north = client.get("/api/v1/notifications", headers=bm_north_headers).json()
        assert any(n["type"] == "SUBMISSION_RECEIVED" and roll_a in n["message"] for n in notifs_mgr_north)
    
        notifs_mgr_south = client.get("/api/v1/notifications", headers=bm_south_headers).json()
        assert not any(n["type"] == "SUBMISSION_RECEIVED" and roll_a in n["message"] for n in notifs_mgr_south)
    
        # 9. Simulate Grading & Publication
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE submissions 
                SET status = 'GRADED', total_awarded_marks = 35.0, max_marks = 50.0, percentage = 70.0
                WHERE id = ?
            """, (sub_id,))
    
        pub_res = client.post(f"/api/v1/exams/{exam_id}/publish", headers=admin_headers)
        assert pub_res.status_code == 200
    
        # Student A receives RESULT_PUBLISHED with link to /student/submissions/{sub_id}
        notifs_a = client.get("/api/v1/notifications", headers=stu_a_headers).json()
        pub_notif = next(n for n in notifs_a if n["type"] == "RESULT_PUBLISHED")
        assert f"/student/submissions/{sub_id}" in pub_notif["link_url"]
    
        # 10. Student A requests Revaluation on Q1 and Q2
        reval_res = client.post(f"/api/v1/revaluation/{sub_id}/request", json={
            "question_ids": ["Q1", "Q2"],
            "student_reason": "Heat flux boundary condition was simplified properly."
        }, headers=stu_a_headers)
        assert reval_res.status_code == 200
        req_id = reval_res.json()["request_id"]
    
        # Student A gets REVALUATION_REQUESTED confirmation
        notifs_a = client.get("/api/v1/notifications", headers=stu_a_headers).json()
        assert any(n["type"] == "REVALUATION_REQUESTED" for n in notifs_a)
    
        # Branch Manager North receives REVALUATION_REQUESTED; Manager South does NOT
        notifs_mgr_north = client.get("/api/v1/notifications", headers=bm_north_headers).json()
        assert any(n["type"] == "REVALUATION_REQUESTED" and roll_a in n["message"] for n in notifs_mgr_north)
    
        notifs_mgr_south = client.get("/api/v1/notifications", headers=bm_south_headers).json()
        assert not any(n["type"] == "REVALUATION_REQUESTED" and roll_a in n["message"] for n in notifs_mgr_south)
    
        # Root Admin receives REVALUATION_REQUESTED
        notifs_admin = client.get("/api/v1/notifications", headers=admin_headers).json()
        assert any(n["type"] == "REVALUATION_REQUESTED" and roll_a in n["message"] for n in notifs_admin)
    
        # 11. Root Admin resolves the Revaluation request
        resolve_res = client.post(f"/api/v1/revaluation/{req_id}/resolve", json={
            "decision": "MARKS_REVISED",
            "reviewer_notes": "Added 3 marks for radiation correction.",
            "revised_answers": [{"question_id": "Q1", "revised_marks": 8.0, "comment": "Valid correction."}]
        }, headers=admin_headers)
        assert resolve_res.status_code == 200
    
        # Student A receives REVALUATION_DECIDED
        notifs_a = client.get("/api/v1/notifications", headers=stu_a_headers).json()
        assert any(n["type"] == "REVALUATION_DECIDED" for n in notifs_a)
    
        # Branch Manager North receives REVALUATION_DECIDED
        notifs_mgr_north = client.get("/api/v1/notifications", headers=bm_north_headers).json()
        assert any(n["type"] == "REVALUATION_DECIDED" and roll_a in n["message"] for n in notifs_mgr_north)
    
        # 12. Mark notifications as read and read-all
        unread_before = len([n for n in notifs_a if not n["is_read"]])
        assert unread_before > 0
        first_notif_id = notifs_a[0]["id"]
        client.post(f"/api/v1/notifications/{first_notif_id}/read", headers=stu_a_headers)
    
        client.post("/api/v1/notifications/read-all", headers=stu_a_headers)
        notifs_a_after = client.get("/api/v1/notifications", headers=stu_a_headers).json()
        assert all(n["is_read"] == 1 for n in notifs_a_after)
    finally:
        if inst_id:
            with get_session() as s:
                b_ids = [b.id for b in s.query(Branch).filter(Branch.institute_id == inst_id).all()]
                e_ids = [e.id for e in s.query(Exam).filter(Exam.institute_id == inst_id).all()]
                if e_ids:
                    subs = s.query(Submission).filter(Submission.exam_id.in_(e_ids)).all()
                    sub_ids = [sub.id for sub in subs]
                    if sub_ids:
                        s.execute(delete(Answer).where(Answer.submission_id.in_(sub_ids)))
                        s.execute(delete(RevaluationRequest).where(RevaluationRequest.submission_id.in_(sub_ids)))
                        s.execute(delete(Submission).where(Submission.id.in_(sub_ids)))
                    s.execute(delete(Exam).where(Exam.id.in_(e_ids)))
                if b_ids:
                    batch_ids = [batch.id for batch in s.query(Batch).filter(Batch.branch_id.in_(b_ids)).all()]
                    if batch_ids:
                        s.execute(delete(Student).where(Student.batch_id.in_(batch_ids)))
                        s.execute(delete(Batch).where(Batch.id.in_(batch_ids)))
                target_uids = [u.id for u in s.query(User).filter((User.institute_id == inst_id) | (User.branch_id.in_(b_ids))).all()]
                if target_uids:
                    s.execute(delete(Notification).where(Notification.user_id.in_(target_uids)))
                    s.execute(delete(PasswordResetRequest).where(PasswordResetRequest.user_id.in_(target_uids)))
                    s.execute(delete(User).where(User.id.in_(target_uids)))
                if b_ids:
                    s.execute(delete(Branch).where(Branch.id.in_(b_ids)))
                s.execute(delete(Institute).where(Institute.id == inst_id))
                s.commit()
