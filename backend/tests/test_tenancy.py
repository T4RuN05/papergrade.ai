import pytest
import io
import openpyxl
from backend.app.db.session import get_session
from backend.app.db.models import Branch, Exam, Batch, Student, User
from sqlalchemy import select, delete
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
    with get_session() as session:
        branch = session.scalar(select(Branch).limit(1))
        assert branch is not None, "Branch required"
        branch_id = branch.id
        
        # Ensure a test exam exists
        ex = session.scalar(select(Exam).limit(1))
        assert ex is not None, "Exam required"
        exam_id = ex.id

    admin_user = {"sub": "usr_test_admin", "role": "ROOT_ADMIN"}
    
    with get_session() as session:
        batch_res = create_batch(
            CreateBatchRequest(branch_id=branch_id, exam_id=exam_id, name="Grade 10 - Section A", code="G10A"),
            current_user=admin_user,
            db=session
        )
        batch_id = batch_res["id"]
        
        # 2. Add single student
        stu_res = add_single_student(
            batch_id,
            CreateStudentRequest(roll_number="A101_TEST", full_name="Alice Wonder"),
            current_user=admin_user,
            db=session
        )
        assert stu_res["status"] == "success"
        student_id_num = stu_res["student_id_num"]
        assert len(student_id_num) == 6
        
        # 3. Claim account
        claim_res = claim_account(
            ClaimAccountRequest(
                student_id_num=student_id_num,
                roll_number="A101_TEST",
                password="MySecretPassword123"
            ),
            db=session
        )
        assert claim_res.access_token is not None
        assert claim_res.user["role"] == "STUDENT"
        assert claim_res.user["full_name"] == "Alice Wonder"
        
        # 4. Attempt to claim again - must fail
        with pytest.raises(Exception):
            claim_account(
                ClaimAccountRequest(
                    student_id_num=student_id_num,
                    roll_number="A101_TEST",
                    password="AnotherPassword"
                ),
                db=session
            )

        # Cleanup
        claimed_user_id = claim_res.user["id"]
        session.execute(delete(User).where(User.id == claimed_user_id))
        session.execute(delete(Student).where(Student.student_id_num == student_id_num))
        session.execute(delete(Batch).where(Batch.id == batch_id))
        session.commit()
