import pytest
from backend.app.db.session import get_session
from backend.app.db.models import Branch, Exam, Student, User
from sqlalchemy import select, delete
from backend.app.routers.tenancy import (
    create_batch,
    CreateBatchRequest,
    add_single_student,
    CreateStudentRequest,
)
from backend.app.routers.auth import claim_account, ClaimAccountRequest
from fastapi import HTTPException


def test_claim_account_roll_number_only():
    """Verify students can claim accounts with roll number + password alone, and backwards compat."""
    with get_session() as session:
        branch = session.scalar(select(Branch).limit(1))
        assert branch is not None, "Branch required"
        branch_id = branch.id

        ex = session.scalar(select(Exam).limit(1))
        assert ex is not None, "Exam required"
        exam_id = ex.id

    admin_user = {"sub": "usr_test_admin", "role": "ROOT_ADMIN"}

    with get_session() as session:
        # Create a dedicated test batch
        batch_res = create_batch(
            CreateBatchRequest(
                branch_id=branch_id,
                exam_id=exam_id,
                name="Roll Only Test Batch",
                code="RO_TEST",
            ),
            current_user=admin_user,
            db=session,
        )
        batch_id = batch_res["id"]

        # Add two test students
        stu1 = add_single_student(
            batch_id,
            CreateStudentRequest(roll_number="ROLL_NOCLAIM_1", full_name="Student One"),
            current_user=admin_user,
            db=session,
        )
        stu2 = add_single_student(
            batch_id,
            CreateStudentRequest(roll_number="ROLL_NOCLAIM_2", full_name="Student Two"),
            current_user=admin_user,
            db=session,
        )
        assert stu1["status"] == "success"
        assert stu2["status"] == "success"

        # 1. Claim Student One using ONLY roll number and password
        claim1 = claim_account(
            ClaimAccountRequest(
                roll_number="ROLL_NOCLAIM_1",
                password="SecurePassword123!",
            ),
            db=session,
        )
        assert claim1.access_token is not None
        assert claim1.user["role"] == "STUDENT"
        assert claim1.user["full_name"] == "Student One"
        assert claim1.user["roll_number"] == "ROLL_NOCLAIM_1"

        # 2. Student One claiming again should fail
        with pytest.raises(HTTPException) as exc_info:
            claim_account(
                ClaimAccountRequest(
                    roll_number="ROLL_NOCLAIM_1",
                    password="SecurePassword123!",
                ),
                db=session,
            )
        assert exc_info.value.status_code == 400
        assert "already been claimed" in exc_info.value.detail

        # 3. Claiming non-existent roll number should return 404
        with pytest.raises(HTTPException) as exc_404:
            claim_account(
                ClaimAccountRequest(
                    roll_number="NON_EXISTENT_ROLL_XYZ",
                    password="SecurePassword123!",
                ),
                db=session,
            )
        assert exc_404.value.status_code == 404

        # 4. Backward compatibility: Student Two claiming with roll number + student_id_num
        claim2 = claim_account(
            ClaimAccountRequest(
                roll_number="ROLL_NOCLAIM_2",
                password="SecurePassword456!",
                student_id_num=stu2["student_id_num"],
            ),
            db=session,
        )
        assert claim2.access_token is not None
        assert claim2.user["full_name"] == "Student Two"

        # Cleanup
        session.execute(delete(User).where(User.id.in_([claim1.user["id"], claim2.user["id"]])))
        session.execute(delete(Student).where(Student.batch_id == batch_id))
        session.commit()

