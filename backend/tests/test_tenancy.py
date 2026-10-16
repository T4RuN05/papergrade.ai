import pytest
import io
import openpyxl
from backend.app.database import get_db
from backend.app.routers.tenancy import (
    create_batch,
    CreateBatchRequest,
    add_single_student,
    CreateStudentRequest,
    generate_unique_student_id_num,
)
from backend.app.routers.auth import claim_account, ClaimAccountRequest

def test_student_creation_and_account_claim():
    # 1. Setup branch and test exam
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM branches LIMIT 1")
        branch = cursor.fetchone()
        branch_id = branch["id"]
        
        # Ensure a test exam exists
        cursor.execute("SELECT id FROM exams LIMIT 1")
        ex = cursor.fetchone()
        if not ex:
            cursor.execute(
                "INSERT INTO exams (id, title, subject, total_marks, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
                ("exam_test_1", "Midterm Physics", "Physics", 50.0, "DRAFT")
            )
            exam_id = "exam_test_1"
        else:
            exam_id = ex["id"]

    admin_user = {"sub": "usr_test_admin", "role": "ROOT_ADMIN"}
    
    batch_res = create_batch(
        CreateBatchRequest(branch_id=branch_id, exam_id=exam_id, name="Grade 10 - Section A", code="G10A"),
        current_user=admin_user
    )
    batch_id = batch_res["id"]
    
    # 2. Add single student
    stu_res = add_single_student(
        batch_id,
        CreateStudentRequest(roll_number="A101", full_name="Alice Wonder"),
        current_user=admin_user
    )
    assert stu_res["status"] == "success"
    student_id_num = stu_res["student_id_num"]
    assert len(student_id_num) == 6
    
    # 3. Claim account
    claim_res = claim_account(
        ClaimAccountRequest(
            student_id_num=student_id_num,
            roll_number="A101",
            password="MySecretPassword123"
        )
    )
    assert claim_res.access_token is not None
    assert claim_res.user["role"] == "STUDENT"
    assert claim_res.user["full_name"] == "Alice Wonder"
    
    # 4. Attempt to claim again - must fail
    with pytest.raises(Exception):
        claim_account(
            ClaimAccountRequest(
                student_id_num=student_id_num,
                roll_number="A101",
                password="AnotherPassword"
            )
        )
