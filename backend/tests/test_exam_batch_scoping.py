import io
import json
import uuid
import fitz
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.database import get_db, init_db, get_iso_now
from backend.app.services.auth import create_access_token

client = TestClient(app)

def create_dummy_pdf(title: str = "Test PDF") -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((50, 50), title, fontsize=16)
    b = doc.tobytes()
    doc.close()
    return b

def test_exam_batch_scoping_lifecycle():
    init_db()

    # 1. Admin login
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

    # 3. Create three distinct batches in this branch
    batch_a_res = client.post("/api/v1/tenancy/batches", json={
        "branch_id": branch_id,
        "name": "Batch Alpha 2026",
        "code": "B-ALPHA",
        "academic_year": "2026"
    }, headers=admin_headers)
    assert batch_a_res.status_code == 200
    batch_a_id = batch_a_res.json()["id"]

    batch_b_res = client.post("/api/v1/tenancy/batches", json={
        "branch_id": branch_id,
        "name": "Batch Beta 2026",
        "code": "B-BETA",
        "academic_year": "2026"
    }, headers=admin_headers)
    assert batch_b_res.status_code == 200
    batch_b_id = batch_b_res.json()["id"]

    batch_c_res = client.post("/api/v1/tenancy/batches", json={
        "branch_id": branch_id,
        "name": "Batch Gamma 2026",
        "code": "B-GAMMA",
        "academic_year": "2026"
    }, headers=admin_headers)
    assert batch_c_res.status_code == 200
    batch_c_id = batch_c_res.json()["id"]

    # 4. Create student users linked to batches
    now = get_iso_now()
    user_a_id = f"user_stu_a_{uuid.uuid4().hex[:8]}"
    user_b_id = f"user_stu_b_{uuid.uuid4().hex[:8]}"
    user_c_id = f"user_stu_c_{uuid.uuid4().hex[:8]}"

    with get_db() as conn:
        cursor = conn.cursor()
        for uid, uname in [(user_a_id, "Student Alpha"), (user_b_id, "Student Beta"), (user_c_id, "Student Gamma")]:
            cursor.execute("""
                INSERT INTO users (id, institute_id, branch_id, full_name, email, password_hash, role, is_active, created_at)
                VALUES (?, NULL, ?, ?, ?, 'hash', 'STUDENT', 1, ?)
            """, (uid, branch_id, uname, f"{uid}@test.edu", now))

        sid_a = f"SIDA_{uuid.uuid4().hex[:6]}"
        sid_b = f"SIDB_{uuid.uuid4().hex[:6]}"
        sid_c = f"SIDC_{uuid.uuid4().hex[:6]}"
        roll_a = f"ROLL_A_{uuid.uuid4().hex[:6]}"
        roll_b = f"ROLL_B_{uuid.uuid4().hex[:6]}"
        roll_c = f"ROLL_C_{uuid.uuid4().hex[:6]}"

        # Insert student enrollment records
        cursor.execute("""
            INSERT INTO students (id, batch_id, user_id, student_id_num, roll_number, full_name, created_at)
            VALUES (?, ?, ?, ?, ?, 'Student Alpha', ?)
        """, (f"st_{uuid.uuid4().hex[:8]}", batch_a_id, user_a_id, sid_a, roll_a, now))

        cursor.execute("""
            INSERT INTO students (id, batch_id, user_id, student_id_num, roll_number, full_name, created_at)
            VALUES (?, ?, ?, ?, ?, 'Student Beta', ?)
        """, (f"st_{uuid.uuid4().hex[:8]}", batch_b_id, user_b_id, sid_b, roll_b, now))

        cursor.execute("""
            INSERT INTO students (id, batch_id, user_id, student_id_num, roll_number, full_name, created_at)
            VALUES (?, ?, ?, ?, ?, 'Student Gamma', ?)
        """, (f"st_{uuid.uuid4().hex[:8]}", batch_c_id, user_c_id, sid_c, roll_c, now))

    headers_a = {"Authorization": f"Bearer {create_access_token({'sub': user_a_id, 'role': 'STUDENT', 'roll_number': roll_a})}"}
    headers_b = {"Authorization": f"Bearer {create_access_token({'sub': user_b_id, 'role': 'STUDENT', 'roll_number': roll_b})}"}
    headers_c = {"Authorization": f"Bearer {create_access_token({'sub': user_c_id, 'role': 'STUDENT', 'roll_number': roll_c})}"}

    # 5. Create Exam 1: Scoped to Whole Branch ("ALL")
    ex1_res = client.post("/api/v1/exams", data={
        "title": "Whole Branch Physics",
        "subject": "Physics",
        "branch_id": branch_id,
        "batch_scope": "ALL"
    }, headers=admin_headers)
    assert ex1_res.status_code == 200
    ex1 = ex1_res.json()
    assert ex1["batch_scope"] == "ALL"

    # All students should see Exam 1 in portal state
    portal_a = client.get("/api/v1/student/portal-state", headers=headers_a).json()
    portal_b = client.get("/api/v1/student/portal-state", headers=headers_b).json()
    portal_c = client.get("/api/v1/student/portal-state", headers=headers_c).json()

    assert any(e["id"] == ex1["id"] for e in portal_a["exams"])
    assert any(e["id"] == ex1["id"] for e in portal_b["exams"])
    assert any(e["id"] == ex1["id"] for e in portal_c["exams"])

    # 6. Create Exam 2: Scoped to Single Batch (Batch Alpha only)
    ex2_res = client.post("/api/v1/exams", data={
        "title": "Batch Alpha Specialized Math",
        "subject": "Mathematics",
        "branch_id": branch_id,
        "batch_scope": "SPECIFIC",
        "batch_ids": json.dumps([batch_a_id])
    }, headers=admin_headers)
    assert ex2_res.status_code == 200
    ex2 = ex2_res.json()
    assert ex2["batch_scope"] == "SPECIFIC"
    assert len(ex2.get("scoped_batches", [])) == 1
    assert ex2["scoped_batches"][0]["id"] == batch_a_id

    # Verify: Student Alpha sees Exam 2; Beta and Gamma DO NOT
    portal_a = client.get("/api/v1/student/portal-state", headers=headers_a).json()
    portal_b = client.get("/api/v1/student/portal-state", headers=headers_b).json()
    portal_c = client.get("/api/v1/student/portal-state", headers=headers_c).json()

    assert any(e["id"] == ex2["id"] for e in portal_a["exams"])
    assert not any(e["id"] == ex2["id"] for e in portal_b["exams"])
    assert not any(e["id"] == ex2["id"] for e in portal_c["exams"])

    # 7. Open submission window on Exam 2
    win2_res = client.post(f"/api/v1/windows/{ex2['id']}/open", json={
        "duration_minutes": 30,
        "grace_minutes": 2
    }, headers=admin_headers)
    assert win2_res.status_code == 200

    # Student Alpha's active window includes Exam 2
    portal_a = client.get("/api/v1/student/portal-state", headers=headers_a).json()
    assert any(w["exam"]["id"] == ex2["id"] for w in portal_a.get("active_windows", []))

    # Student Beta's active window DOES NOT include Exam 2
    portal_b = client.get("/api/v1/student/portal-state", headers=headers_b).json()
    assert not any(w["exam"]["id"] == ex2["id"] for w in portal_b.get("active_windows", []))

    # 8. Attempt submission: Student Beta (unauthorized batch) gets 403 Forbidden
    upload_beta_res = client.post(
        f"/api/v1/submissions/{ex2['id']}/request-upload",
        json={"roll_number": roll_b, "batch_id": batch_b_id},
        headers=headers_b
    )
    assert upload_beta_res.status_code == 403
    assert "restricted to specific batches" in upload_beta_res.json()["detail"].lower()

    # Student Alpha (authorized batch) successfully requests upload
    upload_alpha_res = client.post(
        f"/api/v1/submissions/{ex2['id']}/request-upload",
        json={"roll_number": roll_a, "batch_id": batch_a_id},
        headers=headers_a
    )
    assert upload_alpha_res.status_code == 200
    assert upload_alpha_res.json()["status"] == "authorized"

    # 9. Create Exam 3: Scoped to Multiple Batches (Alpha and Beta, but not Gamma)
    ex3_res = client.post("/api/v1/exams", data={
        "title": "Alpha & Beta Combined Chemistry",
        "subject": "Chemistry",
        "branch_id": branch_id,
        "batch_scope": "SPECIFIC",
        "batch_ids": json.dumps([batch_a_id, batch_b_id])
    }, headers=admin_headers)
    assert ex3_res.status_code == 200
    ex3 = ex3_res.json()
    assert ex3["batch_scope"] == "SPECIFIC"
    assert len(ex3.get("scoped_batches", [])) == 2

    # Check visibility: Alpha and Beta can see Exam 3, Gamma CANNOT
    portal_a = client.get("/api/v1/student/portal-state", headers=headers_a).json()
    portal_b = client.get("/api/v1/student/portal-state", headers=headers_b).json()
    portal_c = client.get("/api/v1/student/portal-state", headers=headers_c).json()

    assert any(e["id"] == ex3["id"] for e in portal_a["exams"])
    assert any(e["id"] == ex3["id"] for e in portal_b["exams"])
    assert not any(e["id"] == ex3["id"] for e in portal_c["exams"])

    # 10. Check list_exams returned scoped_batches
    exams_list = client.get("/api/v1/exams", headers=admin_headers).json()
    ex2_in_list = next((e for e in exams_list if e["id"] == ex2["id"]), None)
    assert ex2_in_list is not None
    assert ex2_in_list["batch_scope"] == "SPECIFIC"
    assert len(ex2_in_list.get("scoped_batches", [])) == 1

    ex3_in_list = next((e for e in exams_list if e["id"] == ex3["id"]), None)
    assert ex3_in_list is not None
    assert ex3_in_list["batch_scope"] == "SPECIFIC"
    assert len(ex3_in_list.get("scoped_batches", [])) == 2
