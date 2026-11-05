import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Depends, status, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import select, func, or_

from backend.app.db.session import get_db
from backend.app.db.base import get_iso_now
from backend.app.db.models import (
    User,
    Student,
    Batch,
    Branch,
    Institute,
    PasswordResetRequest,
    SubmissionWindow,
    Exam,
    Notification,
)
from backend.app.services.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    require_root_admin,
    require_branch_manager,
)
from backend.app.services.notification_service import (
    send_notification,
    notify_branch_managers,
)

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication & RBAC"])


class ForgotPasswordRequest(BaseModel):
    identifier: str


class ResetPasswordSubmission(BaseModel):
    request_id: str
    reset_token: str
    new_password: str


class LoginRequest(BaseModel):
    email: Optional[str] = None
    username: Optional[str] = None
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]


class ClaimAccountRequest(BaseModel):
    student_id_num: str
    roll_number: str
    password: str
    email: Optional[str] = None


class CreateUserRequest(BaseModel):
    email: str
    password: str
    full_name: str
    role: str  # "ROOT_ADMIN" or "BRANCH_MANAGER"
    institute_id: Optional[str] = None
    branch_id: Optional[str] = None


@router.post("/login", response_model=LoginResponse)
async def login(request: Request, db: Session = Depends(get_db)):
    """Authenticate user with email/username and password via JSON or Form Data."""
    content_type = request.headers.get("content-type", "")
    email_val = ""
    password_val = ""

    if "application/json" in content_type:
        try:
            body = await request.json()
            email_val = (body.get("email") or body.get("username") or "").strip()
            password_val = body.get("password") or ""
        except Exception:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload")
    else:
        try:
            form = await request.form()
            email_val = (form.get("email") or form.get("username") or "").strip()
            password_val = form.get("password") or ""
        except Exception:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid form payload")

    if not email_val or not password_val:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email and password are required"
        )

    clean_email = email_val.lower()
    clean_identifier = email_val.strip()

    # 1. Look up user by email
    user = db.scalar(
        select(User).where(func.lower(User.email) == clean_email, User.is_active == 1)
    )

    # 2. If not found by email, check if student logging in with Roll Number or Student ID
    if not user:
        user = db.scalar(
            select(User)
            .join(Student, Student.user_id == User.id)
            .where(
                or_(
                    func.upper(Student.roll_number) == clean_identifier.upper(),
                    Student.student_id_num == clean_identifier,
                ),
                User.is_active == 1
            )
            .limit(1)
        )

    if not user or not verify_password(password_val, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Use your registered email, roll number, or student ID."
        )

    now = get_iso_now()
    user.last_login_at = now
    db.commit()

    student_info = None
    if user.role == "STUDENT":
        student_info = db.scalar(
            select(Student).where(Student.user_id == user.id).order_by(Student.claimed_at.desc()).limit(1)
        )

    token_payload = {
        "sub": user.id,
        "role": user.role,
        "email": user.email,
        "full_name": user.full_name,
        "institute_id": user.institute_id,
        "branch_id": user.branch_id,
    }
    user_response = {
        "id": user.id,
        "role": user.role,
        "email": user.email,
        "full_name": user.full_name,
        "institute_id": user.institute_id,
        "branch_id": user.branch_id,
    }

    if student_info:
        token_payload["student_id"] = student_info.id
        token_payload["roll_number"] = student_info.roll_number
        token_payload["student_id_num"] = student_info.student_id_num
        user_response["student_id"] = student_info.id
        user_response["roll_number"] = student_info.roll_number
        user_response["student_id_num"] = student_info.student_id_num

    token = create_access_token(token_payload)

    return LoginResponse(
        access_token=token,
        user=user_response
    )


@router.get("/me")
def get_profile(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Fetch profile of currently authenticated user."""
    user = db.scalar(select(User).where(User.id == current_user["sub"]))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    profile = {
        "id": user.id,
        "role": user.role,
        "email": user.email,
        "full_name": user.full_name,
        "institute_id": user.institute_id,
        "branch_id": user.branch_id,
        "created_at": user.created_at,
        "last_login_at": user.last_login_at,
    }

    if user.role == "STUDENT":
        st = db.scalar(
            select(Student).where(Student.user_id == user.id).order_by(Student.claimed_at.desc()).limit(1)
        )
        if st:
            profile["student"] = {
                "student_id": st.id,
                "student_id_num": st.student_id_num,
                "roll_number": st.roll_number,
                "batch_id": st.batch_id,
            }
            profile["roll_number"] = st.roll_number
            profile["student_id_num"] = st.student_id_num
            profile["student_id"] = st.id

    return profile


@router.post("/claim-account", response_model=LoginResponse)
def claim_account(req: ClaimAccountRequest, db: Session = Depends(get_db)):
    """
    One-time onboarding account claim for students using their assigned numeric student ID.
    Validates identity, hashes new password, links user record, and logs student in.
    """
    clean_id_num = req.student_id_num.strip()
    clean_roll = req.roll_number.strip().upper()

    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    # 1. Verify student record exists
    student = db.scalar(
        select(Student).where(
            Student.student_id_num == clean_id_num,
            func.upper(Student.roll_number) == clean_roll
        )
    )
    if not student:
        raise HTTPException(
            status_code=404,
            detail="No student record found with the given numeric ID and roll number."
        )

    # 2. Verify account is not already claimed
    if student.account_claimed == 1:
        raise HTTPException(
            status_code=400,
            detail="This student account has already been claimed. Please log in directly."
        )

    # 3. Create user record
    new_user_id = f"usr_{uuid.uuid4().hex[:12]}"
    hashed = hash_password(req.password)
    now = get_iso_now()
    student_email = req.email.strip().lower() if req.email else f"student_{clean_id_num}@papergrade.local"

    # Check if email is already used
    email_taken = db.scalar(select(User.id).where(User.email == student_email))
    if email_taken:
        student_email = f"student_{clean_id_num}_{uuid.uuid4().hex[:4]}@papergrade.local"

    # Look up branch and institute via batch
    batch = db.scalar(select(Batch).where(Batch.id == student.batch_id))
    branch_id = batch.branch_id if batch else None
    institute_id = None
    if branch_id:
        br = db.scalar(select(Branch).where(Branch.id == branch_id))
        institute_id = br.institute_id if br else None

    user = User(
        id=new_user_id,
        institute_id=institute_id,
        branch_id=branch_id,
        email=student_email,
        role="STUDENT",
        password_hash=hashed,
        full_name=student.full_name,
        is_active=1,
        created_at=now,
        last_login_at=now,
    )
    db.add(user)

    # 4. Link student to user and set account_claimed = 1
    student.user_id = new_user_id
    student.account_claimed = 1
    student.claimed_at = now
    if req.email:
        student.email = req.email

    # 4b. Backfill notifications for any currently active submission windows in their batch or branch
    window_stmt = (
        select(SubmissionWindow, Exam.title)
        .join(Exam, SubmissionWindow.exam_id == Exam.id)
        .where(
            SubmissionWindow.status == "OPEN",
            or_(
                SubmissionWindow.branch_id == branch_id,
                Exam.branch_id == branch_id,
                Exam.id == (batch.exam_id if batch else None),
            )
        )
    )
    active_windows = db.execute(window_stmt).all()
    for win, ex_title in active_windows:
        send_notification(
            cursor=db,
            user_id=new_user_id,
            notif_type="WINDOW_OPENED",
            title="Submission Window Open",
            message=f"The submission window for '{ex_title}' is currently open! Upload your answer sheet before the deadline.",
            link_url="/student/portal"
        )

    db.commit()

    # 5. Emit token
    token_payload = {
        "sub": new_user_id,
        "role": "STUDENT",
        "email": student_email,
        "full_name": student.full_name,
        "institute_id": institute_id,
        "branch_id": branch_id,
        "student_id": student.id,
        "roll_number": student.roll_number,
        "student_id_num": student.student_id_num,
    }
    token = create_access_token(token_payload)

    return LoginResponse(
        access_token=token,
        user={
            "id": new_user_id,
            "role": "STUDENT",
            "email": student_email,
            "full_name": student.full_name,
            "institute_id": institute_id,
            "branch_id": branch_id,
            "student_id": student.id,
            "roll_number": student.roll_number,
            "student_id_num": student.student_id_num,
        }
    )


@router.post("/create-user")
def create_user(
    req: CreateUserRequest,
    current_user: Dict[str, Any] = Depends(require_root_admin),
    db: Session = Depends(get_db)
):
    """Root Admin endpoint to provision Branch Managers or other staff."""
    if req.role not in ["ROOT_ADMIN", "BRANCH_MANAGER"]:
        raise HTTPException(status_code=400, detail="Invalid role specified.")

    clean_email = req.email.strip().lower()
    existing = db.scalar(select(User.id).where(func.lower(User.email) == clean_email))
    if existing:
        raise HTTPException(status_code=400, detail="User with this email already exists.")

    new_id = f"usr_{uuid.uuid4().hex[:12]}"
    hashed = hash_password(req.password)
    now = get_iso_now()

    user = User(
        id=new_id,
        institute_id=req.institute_id,
        branch_id=req.branch_id,
        email=clean_email,
        role=req.role,
        password_hash=hashed,
        full_name=req.full_name,
        is_active=1,
        created_at=now,
    )
    db.add(user)
    db.commit()

    return {
        "status": "success",
        "user_id": new_id,
        "email": clean_email,
        "role": req.role,
        "full_name": req.full_name,
    }


@router.get("/users")
def list_users(
    role: Optional[str] = None,
    branch_id: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(require_root_admin),
    db: Session = Depends(get_db)
):
    """List staff users / managers for tenancy management."""
    stmt = select(User)
    if role:
        stmt = stmt.where(User.role == role)
    if branch_id:
        stmt = stmt.where(User.branch_id == branch_id)
    stmt = stmt.order_by(User.created_at.desc())

    users = db.scalars(stmt).all()
    return [
        {
            "id": u.id,
            "institute_id": u.institute_id,
            "branch_id": u.branch_id,
            "email": u.email,
            "role": u.role,
            "full_name": u.full_name,
            "is_active": u.is_active,
            "created_at": u.created_at,
            "last_login_at": u.last_login_at,
        }
        for u in users
    ]


# -------------------------------------------------------------
# Student Forgot Password Flow (Branch Manager Approval)
# -------------------------------------------------------------

@router.post("/forgot-password/request")
def request_password_reset(req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """
    Student requests a password reset from the login screen.
    Finds student record & branch, creates a PENDING request,
    and alerts the assigned Branch Manager for authorization.
    """
    clean_id = req.identifier.strip()
    if not clean_id:
        raise HTTPException(status_code=400, detail="Roll number, student ID, or email is required.")

    # 1. Lookup student
    student_match = db.scalar(
        select(Student).where(
            or_(
                func.upper(Student.roll_number) == clean_id.upper(),
                Student.student_id_num == clean_id,
                func.lower(Student.email) == clean_id.lower(),
            )
        ).limit(1)
    )

    user_match = None
    if not student_match:
        user_match = db.scalar(
            select(User).where(func.lower(User.email) == clean_id.lower(), User.role == "STUDENT").limit(1)
        )
        if user_match:
            student_match = db.scalar(
                select(Student).where(Student.user_id == user_match.id).order_by(Student.created_at.desc()).limit(1)
            )

    if not student_match and not user_match:
        raise HTTPException(
            status_code=404,
            detail="No student account found for this roll number or ID. Please check your credentials."
        )

    user_id = user_match.id if user_match else (student_match.user_id if student_match else None)
    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="Your student account has not been claimed yet. Please claim your account with your admission ID."
        )

    student_id = student_match.id if student_match else None
    roll_number = student_match.roll_number if student_match else clean_id.upper()
    student_name = (student_match.full_name if student_match else user_match.full_name) or "Student"
    student_email = (user_match.email if user_match else student_match.email) or ""

    # Determine branch_id
    branch_id = None
    if student_match and student_match.batch_id:
        b = db.scalar(select(Batch).where(Batch.id == student_match.batch_id))
        if b:
            branch_id = b.branch_id
    if not branch_id and user_match:
        branch_id = user_match.branch_id

    now = get_iso_now()
    now_dt = datetime.now(timezone.utc)
    expires_at = (now_dt + timedelta(minutes=45)).isoformat()

    # Check for existing PENDING or APPROVED request within active window
    existing = db.scalar(
        select(PasswordResetRequest)
        .where(
            PasswordResetRequest.user_id == user_id,
            PasswordResetRequest.status.in_(["PENDING", "APPROVED"]),
            PasswordResetRequest.expires_at > now,
        )
        .order_by(PasswordResetRequest.created_at.desc())
        .limit(1)
    )
    if existing:
        return {
            "status": "success",
            "request_id": existing.id,
            "request_status": existing.status,
            "message": "A reset request is already active. Please wait for Branch Manager approval.",
            "student_name": student_name,
            "roll_number": roll_number,
        }

    req_id = f"pr_{uuid.uuid4().hex[:12]}"
    pr = PasswordResetRequest(
        id=req_id,
        user_id=user_id,
        student_id=student_id,
        branch_id=branch_id,
        roll_number=roll_number,
        student_name=student_name,
        student_email=student_email,
        status="PENDING",
        expires_at=expires_at,
        created_at=now,
    )
    db.add(pr)

    # Notify branch managers for this branch
    notify_branch_managers(
        cursor=db,
        branch_id=branch_id,
        notif_type="PASSWORD_RESET_REQUEST",
        title="Password Reset Request",
        message=f"Student {student_name} ({roll_number}) has requested a password reset. Review and approve in Branch Management.",
        link_url="/branch/batches",
    )

    db.commit()

    return {
        "status": "success",
        "request_id": req_id,
        "request_status": "PENDING",
        "message": "Password reset request submitted. Awaiting approval from your Branch Manager.",
        "student_name": student_name,
        "roll_number": roll_number,
    }


@router.get("/forgot-password/status/{request_id}")
def get_password_reset_status(request_id: str, db: Session = Depends(get_db)):
    """
    Polled by student login form while in waiting state.
    Returns status: PENDING, APPROVED, REJECTED, COMPLETED, or EXPIRED.
    When APPROVED, returns the one-time reset_token to authorize password update.
    """
    req = db.scalar(select(PasswordResetRequest).where(PasswordResetRequest.id == request_id))
    if not req:
        raise HTTPException(status_code=404, detail="Password reset request not found.")

    now_dt = datetime.now(timezone.utc)
    expires_dt = datetime.fromisoformat(req.expires_at.replace("Z", "+00:00"))

    current_status = req.status
    if current_status in ["PENDING", "APPROVED"] and now_dt > expires_dt:
        current_status = "EXPIRED"
        req.status = "EXPIRED"
        db.commit()

    resp = {
        "request_id": req.id,
        "status": current_status,
        "student_name": req.student_name,
        "roll_number": req.roll_number,
        "requested_at": req.created_at,
        "approved_at": req.approved_at,
    }

    if current_status == "APPROVED":
        resp["reset_token"] = req.reset_token

    return resp


@router.post("/forgot-password/reset")
def complete_password_reset(req: ResetPasswordSubmission, db: Session = Depends(get_db)):
    """
    Student submits new password after Branch Manager approves the request.
    Verifies reset_token and updates password hash.
    """
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters long.")

    pr = db.scalar(select(PasswordResetRequest).where(PasswordResetRequest.id == req.request_id))
    if not pr:
        raise HTTPException(status_code=404, detail="Invalid or expired reset request.")

    if pr.status != "APPROVED":
        raise HTTPException(status_code=400, detail=f"Request is not approved (Current status: {pr.status}).")

    if not pr.reset_token or pr.reset_token != req.reset_token:
        raise HTTPException(status_code=403, detail="Invalid or mismatched reset authorization token.")

    now_dt = datetime.now(timezone.utc)
    expires_dt = datetime.fromisoformat(pr.expires_at.replace("Z", "+00:00"))
    if now_dt > expires_dt:
        pr.status = "EXPIRED"
        db.commit()
        raise HTTPException(status_code=400, detail="This reset authorization has expired. Please submit a new request.")

    new_hash = hash_password(req.new_password)
    now = get_iso_now()

    # Update user password
    user = db.scalar(select(User).where(User.id == pr.user_id))
    if user:
        user.password_hash = new_hash

    # Mark request COMPLETED and clear reset token
    pr.status = "COMPLETED"
    pr.completed_at = now
    pr.reset_token = None

    # Send confirmation notification
    send_notification(
        cursor=db,
        user_id=pr.user_id,
        notif_type="PASSWORD_RESET_SUCCESS",
        title="Password Changed Successfully",
        message="Your account password was successfully reset. You can now log in.",
        link_url="/auth/login",
    )

    db.commit()

    return {
        "status": "success",
        "message": "Password successfully reset! You can now log in with your new password.",
    }


@router.get("/password-resets")
def list_password_resets(
    status_filter: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(require_branch_manager),
    db: Session = Depends(get_db)
):
    """
    Branch Manager & Root Admin endpoint to list student password reset requests.
    Filtered by branch for Branch Managers.
    """
    stmt = (
        select(
            PasswordResetRequest,
            User.full_name.label("approved_by_name"),
            Branch.name.label("branch_name"),
        )
        .outerjoin(User, PasswordResetRequest.approved_by == User.id)
        .outerjoin(Branch, PasswordResetRequest.branch_id == Branch.id)
    )

    if current_user.get("role") == "BRANCH_MANAGER" and current_user.get("branch_id"):
        stmt = stmt.where(
            or_(
                PasswordResetRequest.branch_id == current_user["branch_id"],
                PasswordResetRequest.branch_id.is_(None),
            )
        )

    if status_filter:
        stmt = stmt.where(PasswordResetRequest.status == status_filter.upper())

    stmt = stmt.order_by(PasswordResetRequest.created_at.desc()).limit(50)
    results = db.execute(stmt).all()

    items = []
    for pr, approved_by_name, branch_name in results:
        items.append({
            "id": pr.id,
            "user_id": pr.user_id,
            "student_id": pr.student_id,
            "branch_id": pr.branch_id,
            "roll_number": pr.roll_number,
            "student_name": pr.student_name,
            "student_email": pr.student_email,
            "status": pr.status,
            "reset_token": pr.reset_token,
            "approved_by": pr.approved_by,
            "approved_at": pr.approved_at,
            "completed_at": pr.completed_at,
            "expires_at": pr.expires_at,
            "created_at": pr.created_at,
            "approved_by_name": approved_by_name,
            "branch_name": branch_name,
        })
    return items


@router.post("/password-resets/{request_id}/approve")
def approve_password_reset(
    request_id: str,
    current_user: Dict[str, Any] = Depends(require_branch_manager),
    db: Session = Depends(get_db)
):
    """
    Branch Manager approves student password reset request.
    Generates single-use reset_token for the waiting student form.
    """
    req = db.scalar(select(PasswordResetRequest).where(PasswordResetRequest.id == request_id))
    if not req:
        raise HTTPException(status_code=404, detail="Password reset request not found.")

    if req.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Request is already {req.status}.")

    # Check branch ownership if branch manager
    if current_user.get("role") == "BRANCH_MANAGER" and current_user.get("branch_id"):
        if req.branch_id and req.branch_id != current_user["branch_id"]:
            raise HTTPException(status_code=403, detail="Forbidden: You can only approve requests for your assigned branch.")

    reset_token = f"rst_{uuid.uuid4().hex}"
    now = get_iso_now()

    req.status = "APPROVED"
    req.reset_token = reset_token
    req.approved_by = current_user["sub"]
    req.approved_at = now

    send_notification(
        cursor=db,
        user_id=req.user_id,
        notif_type="PASSWORD_RESET_APPROVED",
        title="Password Reset Request Approved",
        message="Branch Manager has approved your password reset request. Please complete setting your new password.",
        link_url="/auth/login",
    )

    db.commit()

    return {
        "status": "success",
        "message": f"Password reset request for {req.student_name or 'student'} approved.",
        "request_id": request_id,
    }


@router.post("/password-resets/{request_id}/reject")
def reject_password_reset(
    request_id: str,
    current_user: Dict[str, Any] = Depends(require_branch_manager),
    db: Session = Depends(get_db)
):
    """Branch Manager rejects student password reset request."""
    req = db.scalar(select(PasswordResetRequest).where(PasswordResetRequest.id == request_id))
    if not req:
        raise HTTPException(status_code=404, detail="Password reset request not found.")

    if req.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Request is already {req.status}.")

    if current_user.get("role") == "BRANCH_MANAGER" and current_user.get("branch_id"):
        if req.branch_id and req.branch_id != current_user["branch_id"]:
            raise HTTPException(status_code=403, detail="Forbidden: You can only reject requests for your assigned branch.")

    now = get_iso_now()
    req.status = "REJECTED"
    req.approved_by = current_user["sub"]
    req.approved_at = now
    db.commit()

    return {
        "status": "success",
        "message": f"Password reset request for {req.student_name or 'student'} rejected.",
        "request_id": request_id,
    }
