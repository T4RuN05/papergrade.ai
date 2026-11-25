import pytest
import uuid
import hashlib
from backend.app.db.session import get_session
from backend.app.db.models import User, Branch, Batch, Student, PasswordResetRequest
from sqlalchemy import select, delete
from backend.app.services.auth import hash_password, verify_password
from backend.app.routers.auth import (
    request_password_reset,
    ForgotPasswordRequest,
    verify_password_reset_otp,
    VerifyOtpRequest,
    escalate_password_reset_to_admin,
    EscalateResetRequest,
    complete_password_reset,
    ResetPasswordSubmission,
    get_password_reset_status,
)
from fastapi import HTTPException


def test_email_otp_lifecycle_and_verification():
    """Verify full Email-First OTP generation, validation, wrong OTP lockout, and completion."""
    now_str = "2026-11-25T12:00:00Z"
    test_user_id = f"usr_stu_{uuid.uuid4().hex[:8]}"
    test_email = f"student_{uuid.uuid4().hex[:6]}@test.edu"
    test_roll = f"ROLL_{uuid.uuid4().hex[:4].upper()}"
    initial_pass = "InitialPass123!"

    with get_session() as session:
        batch_id = session.scalar(select(Batch.id).limit(1))
        if not batch_id:
            pytest.skip("No batches found in database to link student.")

        user = User(
            id=test_user_id,
            email=test_email,
            role="STUDENT",
            password_hash=hash_password(initial_pass),
            full_name="Ananya Sharma",
            is_active=1,
            created_at=now_str,
        )
        student = Student(
            id=f"stu_{uuid.uuid4().hex[:8]}",
            batch_id=batch_id,
            user_id=test_user_id,
            roll_number=test_roll,
            student_id_num=f"STU_{test_roll}",
            full_name="Ananya Sharma",
            email=test_email,
            account_claimed=1,
            claimed_at=now_str,
            created_at=now_str,
        )
        session.add(user)
        session.add(student)
        session.commit()

    request_id = None
    try:
        with get_session() as session:
            # 1. Request OTP via email identifier
            req_res = request_password_reset(
                ForgotPasswordRequest(identifier=test_email),
                db=session,
            )
            assert req_res["status"] == "success"
            assert req_res["request_status"] == "PENDING_OTP"
            assert req_res["verification_method"] == "EMAIL_OTP"
            assert req_res["can_escalate"] is True
            request_id = req_res["request_id"]
            session_secret = req_res["session_secret"]

            # 2. Check DB row
            pr = session.scalar(select(PasswordResetRequest).where(PasswordResetRequest.id == request_id))
            assert pr is not None
            assert pr.status == "PENDING_OTP"
            assert pr.verification_method == "EMAIL_OTP"
            assert pr.otp_attempts == 0
            assert pr.otp_code_hash is not None

            # 3. Test wrong OTP code -> 400 Bad Request
            with pytest.raises(HTTPException) as exc_wrong:
                verify_password_reset_otp(
                    VerifyOtpRequest(
                        request_id=request_id,
                        session_secret=session_secret,
                        otp_code="000000",
                    ),
                    db=session,
                )
            assert exc_wrong.value.status_code == 400
            assert "Invalid verification code" in exc_wrong.value.detail

            # 4. Inject a known OTP hash to test successful verification
            known_otp = "852963"
            known_hash = hashlib.sha256(f"{known_otp}:{session_secret}".encode()).hexdigest()
            pr.otp_code_hash = known_hash
            session.commit()

            # 5. Verify with correct OTP code -> 200 OK with reset_token
            verify_res = verify_password_reset_otp(
                VerifyOtpRequest(
                    request_id=request_id,
                    session_secret=session_secret,
                    otp_code=known_otp,
                ),
                db=session,
            )
            assert verify_res["status"] == "success"
            assert verify_res["reset_token"] is not None
            actual_reset_token = verify_res["reset_token"]

            # 6. Check status is now APPROVED
            status_res = get_password_reset_status(
                request_id=request_id,
                session_secret=session_secret,
                db=session,
            )
            assert status_res["status"] == "APPROVED"
            assert status_res["reset_token"] == actual_reset_token

            # 7. Complete password reset using token
            new_password = "BrandNewSecurePassword456!"
            complete_res = complete_password_reset(
                ResetPasswordSubmission(
                    request_id=request_id,
                    reset_token=actual_reset_token,
                    new_password=new_password,
                ),
                db=session,
            )
            assert complete_res["status"] == "success"

            # 8. Verify user password updated in database
            updated_user = session.scalar(select(User).where(User.id == test_user_id))
            assert verify_password(new_password, updated_user.password_hash) is True

    finally:
        with get_session() as session:
            if request_id:
                session.execute(delete(PasswordResetRequest).where(PasswordResetRequest.id == request_id))
            session.execute(delete(Student).where(Student.user_id == test_user_id))
            session.execute(delete(User).where(User.id == test_user_id))
            session.commit()


def test_email_otp_fallback_escalation_to_admin():
    """Verify fallback path: escalating from PENDING_OTP to ADMIN_APPROVAL."""
    now_str = "2026-11-25T12:00:00Z"
    test_user_id = f"usr_stu_{uuid.uuid4().hex[:8]}"
    test_email = f"student_esc_{uuid.uuid4().hex[:6]}@test.edu"
    test_roll = f"ROLL_{uuid.uuid4().hex[:4].upper()}"

    with get_session() as session:
        batch_id = session.scalar(select(Batch.id).limit(1))
        if not batch_id:
            pytest.skip("No batches found in database to link student.")

        user = User(
            id=test_user_id,
            email=test_email,
            role="STUDENT",
            password_hash=hash_password("Pass123!"),
            full_name="Karan Verma",
            is_active=1,
            created_at=now_str,
        )
        student = Student(
            id=f"stu_{uuid.uuid4().hex[:8]}",
            batch_id=batch_id,
            user_id=test_user_id,
            roll_number=test_roll,
            student_id_num=f"STU_{test_roll}",
            full_name="Karan Verma",
            email=test_email,
            account_claimed=1,
            claimed_at=now_str,
            created_at=now_str,
        )
        session.add(user)
        session.add(student)
        session.commit()

    request_id = None
    try:
        with get_session() as session:
            req_res = request_password_reset(
                ForgotPasswordRequest(identifier=test_roll),
                db=session,
            )
            assert req_res["request_status"] == "PENDING_OTP"
            request_id = req_res["request_id"]
            session_secret = req_res["session_secret"]

            # Escalate to administrator
            esc_res = escalate_password_reset_to_admin(
                EscalateResetRequest(request_id=request_id, session_secret=session_secret),
                db=session,
            )
            assert esc_res["status"] == "success"
            assert esc_res["request_status"] == "PENDING"
            assert esc_res["verification_method"] == "ADMIN_APPROVAL"

            # Verify in DB
            pr = session.scalar(select(PasswordResetRequest).where(PasswordResetRequest.id == request_id))
            assert pr.status == "PENDING"
            assert pr.verification_method == "ADMIN_APPROVAL"

    finally:
        with get_session() as session:
            if request_id:
                session.execute(delete(PasswordResetRequest).where(PasswordResetRequest.id == request_id))
            session.execute(delete(Student).where(Student.user_id == test_user_id))
            session.execute(delete(User).where(User.id == test_user_id))
            session.commit()
