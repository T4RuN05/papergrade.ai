import pytest
import uuid
from backend.app.db.session import get_session
from backend.app.db.models import User, Branch, PasswordResetRequest
from sqlalchemy import select, delete
from backend.app.services.auth import hash_password, create_access_token
from backend.app.routers.auth import (
    change_password,
    ChangePasswordRequest,
    request_password_reset,
    ForgotPasswordRequest,
    get_password_reset_status,
    complete_password_reset,
    ResetPasswordSubmission,
    list_password_resets,
    approve_password_reset,
    reject_password_reset,
)
from fastapi import HTTPException


def test_staff_change_password_when_logged_in():
    """Verify logged-in staff can change their initial password."""
    now_str = "2026-11-14T12:00:00Z"
    test_user_id = f"usr_test_{uuid.uuid4().hex[:8]}"
    test_email = f"manager_{uuid.uuid4().hex[:6]}@test.edu"
    initial_pass = "InitialPass123!"

    with get_session() as session:
        user = User(
            id=test_user_id,
            email=test_email,
            role="BRANCH_MANAGER",
            password_hash=hash_password(initial_pass),
            full_name="Test Branch Manager",
            is_active=1,
            created_at=now_str,
        )
        session.add(user)
        session.commit()

    current_user_token_payload = {
        "sub": test_user_id,
        "role": "BRANCH_MANAGER",
        "email": test_email,
    }

    with get_session() as session:
        # 1. Wrong current password -> 400
        with pytest.raises(HTTPException) as exc_wrong:
            change_password(
                ChangePasswordRequest(
                    current_password="WrongPassword123!",
                    new_password="BrandNewPass456!",
                ),
                current_user=current_user_token_payload,
                db=session,
            )
        assert exc_wrong.value.status_code == 400

        # 2. New password too short -> 400
        with pytest.raises(HTTPException) as exc_short:
            change_password(
                ChangePasswordRequest(
                    current_password=initial_pass,
                    new_password="short",
                ),
                current_user=current_user_token_payload,
                db=session,
            )
        assert exc_short.value.status_code == 400

        # 3. New password identical to current password -> 400
        with pytest.raises(HTTPException) as exc_same:
            change_password(
                ChangePasswordRequest(
                    current_password=initial_pass,
                    new_password=initial_pass,
                ),
                current_user=current_user_token_payload,
                db=session,
            )
        assert exc_same.value.status_code == 400

        # 4. Successful initial password change
        new_pass = "BrandNewPass789!"
        res = change_password(
            ChangePasswordRequest(
                current_password=initial_pass,
                new_password=new_pass,
            ),
            current_user=current_user_token_payload,
            db=session,
        )
        assert res["status"] == "success"

        # Check has_changed_password is now 1
        updated_user = session.scalar(select(User).where(User.id == test_user_id))
        assert updated_user.has_changed_password == 1

        # 5. Subsequent password change attempt via modal is strictly rejected (one-time only)
        with pytest.raises(HTTPException) as exc_already_changed:
            change_password(
                ChangePasswordRequest(
                    current_password=new_pass,
                    new_password="YetAnotherPass999!",
                ),
                current_user=current_user_token_payload,
                db=session,
            )
        assert exc_already_changed.value.status_code == 400
        assert "Initial password has already been changed" in exc_already_changed.value.detail

        # 6. Clean up
        session.execute(delete(User).where(User.id == test_user_id))
        session.commit()


def test_staff_forgot_password_root_admin_approval_lifecycle():
    """Verify staff forgot password requests can only be approved by Root Admin."""
    now_str = "2026-11-14T12:00:00Z"
    test_user_id = f"usr_dir_{uuid.uuid4().hex[:8]}"
    test_email = f"director_{uuid.uuid4().hex[:6]}@test.edu"
    initial_pass = "DirectorPass123!"

    with get_session() as session:
        # Fetch or create Root Admin user for foreign key relation
        admin = session.scalar(select(User).where(User.role == "ROOT_ADMIN").limit(1))
        if not admin:
            admin_id = f"usr_admin_{uuid.uuid4().hex[:8]}"
            admin = User(
                id=admin_id,
                email="admin_test@test.edu",
                role="ROOT_ADMIN",
                password_hash=hash_password("AdminPass123!"),
                full_name="Root Admin",
                is_active=1,
                created_at=now_str,
            )
            session.add(admin)
            session.commit()
        root_admin_id = admin.id

        user = User(
            id=test_user_id,
            email=test_email,
            role="INSTITUTE_DIRECTOR",
            password_hash=hash_password(initial_pass),
            full_name="Prof. Sharma",
            is_active=1,
            created_at=now_str,
        )
        session.add(user)
        session.commit()

    with get_session() as session:
        # 1. Staff requests password reset using their email
        req_res = request_password_reset(
            ForgotPasswordRequest(identifier=test_email),
            db=session,
        )
        assert req_res["status"] == "success"
        assert req_res["is_staff"] is True
        assert req_res["request_status"] == "PENDING"
        request_id = req_res["request_id"]
        session_secret = req_res["session_secret"]

        # 2. Branch Manager attempts to approve staff reset -> MUST BE 403 FORBIDDEN
        bm_caller = {"sub": "usr_fake_bm", "role": "BRANCH_MANAGER", "branch_id": "br_1"}
        with pytest.raises(HTTPException) as exc_bm:
            approve_password_reset(
                request_id=request_id,
                current_user=bm_caller,
                db=session,
            )
        assert exc_bm.value.status_code == 403
        assert "Only Root Administrators" in exc_bm.value.detail

        # 3. Root Admin lists staff resets
        root_admin_caller = {"sub": root_admin_id, "role": "ROOT_ADMIN"}
        staff_resets = list_password_resets(
            target_type="staff",
            current_user=root_admin_caller,
            db=session,
        )
        target_pr = next((p for p in staff_resets if p["id"] == request_id), None)
        assert target_pr is not None
        assert target_pr["is_staff"] is True
        assert target_pr["student_name"] == "Prof. Sharma"

        # 4. Root Admin approves staff reset
        approve_res = approve_password_reset(
            request_id=request_id,
            current_user=root_admin_caller,
            db=session,
        )
        assert approve_res["status"] == "success"

        # 5. Polling status returns APPROVED and valid reset_token
        status_res = get_password_reset_status(
            request_id=request_id,
            session_secret=session_secret,
            db=session,
        )
        assert status_res["status"] == "APPROVED"
        assert status_res["reset_token"] is not None
        reset_token = status_res["reset_token"]

        # 6. Staff completes reset with their new password
        final_new_pass = "DirectorSecurePass999!"
        complete_res = complete_password_reset(
            ResetPasswordSubmission(
                request_id=request_id,
                reset_token=reset_token,
                new_password=final_new_pass,
            ),
            db=session,
        )
        assert complete_res["status"] == "success"

        # 7. Clean up
        session.execute(delete(PasswordResetRequest).where(PasswordResetRequest.id == request_id))
        session.execute(delete(User).where(User.id == test_user_id))
        session.commit()

