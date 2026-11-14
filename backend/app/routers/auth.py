import uuid
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Depends, status, Request, BackgroundTasks
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import select, func, or_, and_, update, delete

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
    notify_root_admins,
)

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication & RBAC"])


class ForgotPasswordRequest(BaseModel):
    identifier: str


class ResetPasswordSubmission(BaseModel):
    request_id: str
    reset_token: str
    new_password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
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
    roll_number: str
    password: str
    student_id_num: Optional[str] = None
    email: Optional[str] = None


class CreateUserRequest(BaseModel):
    email: str
    password: str
    full_name: str
    role: str  # "ROOT_ADMIN", "INSTITUTE_DIRECTOR", or "BRANCH_MANAGER"
    institute_id: Optional[str] = None
    branch_id: Optional[str] = None


class UpdateUserRequest(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    full_name: Optional[str] = None
    branch_id: Optional[str] = None
    institute_id: Optional[str] = None
    is_active: Optional[int] = None


def _record_last_login(user_id: str):
    """Background task to record login timestamp without holding up the HTTP response."""
    try:
        from backend.app.db.session import get_session
        with get_session() as session:
            u = session.scalar(select(User).where(User.id == user_id))
            if u:
                u.last_login_at = get_iso_now()
                session.commit()
    except Exception:
        pass


@router.post("/login", response_model=LoginResponse)
async def login(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
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

    is_email = "@" in email_val
    user = None
    student_info = None

    # 1. Smart lookup: claim IDs are single-use onboarding credentials.
    if is_email:
        user = db.scalar(
            select(User).where(func.lower(User.email) == clean_email, User.is_active == 1)
        )
    else:
        # Single-query join: fetches User and Student info simultaneously
        result = db.execute(
            select(User, Student)
            .join(Student, Student.user_id == User.id)
            .where(
                or_(
                    func.upper(Student.roll_number) == clean_identifier.upper(),
                    and_(Student.student_id_num == clean_identifier, Student.account_claimed == 0),
                ),
                User.is_active == 1
            )
            .limit(1)
        ).first()
        if result:
            user, student_info = result

    # Fallback: if not found via primary path, check other path
    if not user:
        if is_email:
            result = db.execute(
                select(User, Student)
                .join(Student, Student.user_id == User.id)
                .where(
                    or_(
                        func.upper(Student.roll_number) == clean_identifier.upper(),
                        and_(Student.student_id_num == clean_identifier, Student.account_claimed == 0),
                    ),
                    User.is_active == 1
                )
                .limit(1)
            ).first()
            if result:
                user, student_info = result
        else:
            user = db.scalar(
                select(User).where(func.lower(User.email) == clean_email, User.is_active == 1)
            )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Use your registered email, roll number, or student ID."
        )

    # 2. Non-blocking bcrypt verification in worker threadpool (prevents event loop freezing)
    is_password_valid = await asyncio.to_thread(verify_password, password_val, user.password_hash)
    if not is_password_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Use your registered email, roll number, or student ID."
        )

    # 3. Offload login timestamp update to background task (zero HTTP response latency)
    background_tasks.add_task(_record_last_login, user.id)

    # 4. If logged in via email and user is student, fetch student record
    if user.role == "STUDENT" and not student_info:
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
        user_response["student_id"] = student_info.id
        user_response["roll_number"] = student_info.roll_number

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
                "roll_number": st.roll_number,
                "batch_id": st.batch_id,
            }
            profile["roll_number"] = st.roll_number
            profile["student_id"] = st.id

    return profile


@router.post("/claim-account", response_model=LoginResponse)
def claim_account(req: ClaimAccountRequest, db: Session = Depends(get_db)):
    """
    One-time onboarding account claim for students using their assigned roll number.
    Validates identity, hashes new password, links user record, and logs student in.
    """
    clean_roll = req.roll_number.strip().upper()
    clean_id_num = req.student_id_num.strip() if req.student_id_num else None

    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long.")

    # 1. Verify student record exists by roll number
    students = db.scalars(
        select(Student).where(func.upper(Student.roll_number) == clean_roll)
    ).all()

    student = None
    if students:
        # Prioritize unclaimed student records
        unclaimed = [s for s in students if s.account_claimed == 0]
        if unclaimed:
            if clean_id_num:
                matching = [s for s in unclaimed if s.student_id_num == clean_id_num]
                student = matching[0] if matching else unclaimed[0]
            else:
                student = unclaimed[0]
        else:
            raise HTTPException(
                status_code=400,
                detail="This student account has already been claimed. Please log in directly."
            )
    elif clean_id_num:
        # Fallback to student_id_num if roll number wasn't found directly
        student = db.scalar(
            select(Student).where(Student.student_id_num == clean_id_num)
        )

    if not student:
        raise HTTPException(
            status_code=404,
            detail=f"No student record found with roll number '{clean_roll}'."
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
    student_num_tag = student.student_id_num or clean_roll.replace("-", "_").lower()
    student_email = req.email.strip().lower() if req.email else f"student_{student_num_tag}@papergrade.local"

    # Check if email is already used
    email_taken = db.scalar(select(User.id).where(User.email == student_email))
    if email_taken:
        student_email = f"student_{student_num_tag}_{uuid.uuid4().hex[:4]}@papergrade.local"

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
        }
    )


@router.post("/change-password")
def change_password(
    req: ChangePasswordRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Authenticated user changes their password (e.g. after receiving initial credentials from Root Admin).
    Verifies current password, enforces minimum length of 8 chars, and updates password hash.
    """
    user_id = current_user.get("sub")
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User account not found.")

    if not verify_password(req.current_password, user.password_hash):
        raise HTTPException(
            status_code=400,
            detail="Incorrect current password. Please verify and try again."
        )

    if len(req.new_password) < 8:
        raise HTTPException(
            status_code=400,
            detail="New password must be at least 8 characters long."
        )

    if req.current_password == req.new_password:
        raise HTTPException(
            status_code=400,
            detail="New password cannot be identical to your current password."
        )

    now = get_iso_now()
    user.password_hash = hash_password(req.new_password)
    user.updated_at = now

    send_notification(
        cursor=db,
        user_id=user.id,
        notif_type="PASSWORD_RESET_SUCCESS",
        title="Password Changed",
        message="Your account password was updated successfully.",
        link_url="/overview"
    )

    db.commit()

    return {
        "status": "success",
        "message": "Password changed successfully."
    }


@router.post("/create-user")
def create_user(
    req: CreateUserRequest,
    current_user: Dict[str, Any] = Depends(require_root_admin),
    db: Session = Depends(get_db)
):
    """Root Admin endpoint to provision Institute Directors, Branch Managers, or other staff."""
    if req.role not in ["ROOT_ADMIN", "INSTITUTE_DIRECTOR", "BRANCH_MANAGER"]:
        raise HTTPException(status_code=400, detail="Invalid role specified.")

    if req.role == "INSTITUTE_DIRECTOR":
        if not req.institute_id:
            raise HTTPException(status_code=400, detail="Institute ID is required for Institute Director.")
        inst = db.scalar(select(Institute).where(Institute.id == req.institute_id))
        if not inst:
            raise HTTPException(status_code=404, detail="Specified institute does not exist.")

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
    institute_id: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(require_root_admin),
    db: Session = Depends(get_db)
):
    """List staff users / managers for tenancy management."""
    stmt = select(User)
    if role:
        stmt = stmt.where(User.role == role)
    if branch_id:
        stmt = stmt.where(User.branch_id == branch_id)
    if institute_id:
        stmt = stmt.where(User.institute_id == institute_id)
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


@router.patch("/users/{user_id}")
def update_user(
    user_id: str,
    req: UpdateUserRequest,
    current_user: Dict[str, Any] = Depends(require_root_admin),
    db: Session = Depends(get_db)
):
    """Root Admin endpoint to update a staff user or branch manager."""
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if req.email is not None:
        clean_email = req.email.strip().lower()
        if clean_email != user.email:
            existing = db.scalar(
                select(User.id).where(func.lower(User.email) == clean_email, User.id != user_id)
            )
            if existing:
                raise HTTPException(status_code=400, detail="Another user with this email already exists.")
            user.email = clean_email

    if req.full_name is not None:
        clean_name = req.full_name.strip()
        if clean_name:
            user.full_name = clean_name

    if req.password is not None and req.password.strip():
        user.password_hash = hash_password(req.password.strip())

    if req.branch_id is not None:
        clean_bid = req.branch_id.strip() if req.branch_id else ""
        user.branch_id = clean_bid if clean_bid else None
        if user.branch_id:
            br = db.scalar(select(Branch).where(Branch.id == user.branch_id))
            if br:
                user.institute_id = br.institute_id

    if req.institute_id is not None:
        clean_iid = req.institute_id.strip() if req.institute_id else ""
        user.institute_id = clean_iid if clean_iid else None

    if req.is_active is not None:
        user.is_active = req.is_active

    db.commit()

    return {
        "status": "success",
        "user_id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "branch_id": user.branch_id,
        "institute_id": user.institute_id,
        "is_active": user.is_active,
    }


@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    current_user: Dict[str, Any] = Depends(require_root_admin),
    db: Session = Depends(get_db)
):
    """Root Admin endpoint to delete a staff user or branch manager."""
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == current_user.get("id"):
        raise HTTPException(status_code=400, detail="Cannot delete your own active administrator account.")

    if user.role == "ROOT_ADMIN":
        root_count = db.scalar(select(func.count(User.id)).where(User.role == "ROOT_ADMIN")) or 0
        if root_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the sole Root Administrator.")

    # Unlink any student claiming this user
    db.execute(
        update(Student)
        .where(Student.user_id == user_id)
        .values(user_id=None, account_claimed=0, claimed_at=None)
    )

    # Clean up dependent records
    from backend.app.db.models.telemetry import PushSubscription, TechnicalReport
    db.execute(delete(PasswordResetRequest).where(PasswordResetRequest.user_id == user_id))
    db.execute(delete(PushSubscription).where(PushSubscription.user_id == user_id))
    db.execute(delete(Notification).where(Notification.user_id == user_id))
    db.execute(delete(TechnicalReport).where(TechnicalReport.user_id == user_id))

    deleted_email = user.email
    deleted_role = user.role
    db.delete(user)
    db.commit()

    return {
        "status": "success",
        "message": f"{deleted_role} '{deleted_email}' has been permanently deleted.",
        "user_id": user_id,
    }


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
        # Check if clean_id matches a staff user (BRANCH_MANAGER, INSTITUTE_DIRECTOR, TEACHER, EVALUATOR, etc.)
        staff_user = db.scalar(
            select(User).where(
                or_(
                    func.lower(User.email) == clean_id.lower(),
                    User.id == clean_id,
                ),
                User.is_active == 1
            ).limit(1)
        )
        if not staff_user:
            raise HTTPException(
                status_code=404,
                detail="No account found matching this identifier. Please verify your email or roll number."
            )

        if staff_user.role == "ROOT_ADMIN":
            raise HTTPException(
                status_code=400,
                detail="Root Administrator passwords cannot be reset via delegation. Please consult your server environment administrator."
            )

        # Staff user flow (BRANCH_MANAGER, INSTITUTE_DIRECTOR, TEACHER, EVALUATOR)
        now = get_iso_now()
        now_dt = datetime.now(timezone.utc)
        expires_at = (now_dt + timedelta(minutes=45)).isoformat()

        # Check existing active request
        existing = db.scalar(
            select(PasswordResetRequest)
            .where(
                PasswordResetRequest.user_id == staff_user.id,
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
                "message": "A reset request is already active. Please wait for Root Administrator authorization.",
                "student_name": staff_user.full_name,
                "roll_number": staff_user.role,
                "is_staff": True,
            }

        session_secret = f"sec_{uuid.uuid4().hex}"
        req_id = f"pr_{uuid.uuid4().hex[:12]}"
        pr = PasswordResetRequest(
            id=req_id,
            user_id=staff_user.id,
            student_id=None,
            branch_id=staff_user.branch_id,
            roll_number=staff_user.role,
            student_name=staff_user.full_name,
            student_email=staff_user.email,
            status="PENDING",
            reset_token=session_secret,
            expires_at=expires_at,
            created_at=now,
        )
        db.add(pr)

        role_display = staff_user.role.replace("_", " ").title()
        notify_root_admins(
            cursor=db,
            notif_type="PASSWORD_RESET_REQUEST",
            title="Staff Password Reset Request",
            message=f"{role_display} '{staff_user.full_name}' ({staff_user.email}) has requested a password reset. Review and approve in Tenancy & Access Console.",
            link_url="/admin/tenancy",
        )

        db.commit()

        return {
            "status": "success",
            "request_id": req_id,
            "session_secret": session_secret,
            "request_status": "PENDING",
            "message": "Password reset request submitted. Awaiting authorization from Root Administrator.",
            "student_name": staff_user.full_name,
            "roll_number": staff_user.role,
            "is_staff": True,
        }

    user_id = user_match.id if user_match else (student_match.user_id if student_match else None)
    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="Your student account has not been claimed yet. Please activate your account first using your roll number."
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

    session_secret = f"sec_{uuid.uuid4().hex}"
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
        reset_token=session_secret,
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
        "session_secret": session_secret,
        "request_status": "PENDING",
        "message": "Password reset request submitted. Awaiting approval from your Branch Manager.",
        "student_name": student_name,
        "roll_number": roll_number,
    }


@router.get("/forgot-password/status/{request_id}")
def get_password_reset_status(
    request_id: str,
    session_secret: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Polled by student login form while in waiting state.
    Returns status: PENDING, APPROVED, REJECTED, COMPLETED, or EXPIRED.
    When APPROVED, returns the one-time reset_token ONLY if caller verifies session_secret.
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
        "is_staff": (req.student_id is None),
        "user_role": req.roll_number if req.student_id is None else "STUDENT",
        "requested_at": req.created_at,
        "approved_at": req.approved_at,
    }

    if current_status == "APPROVED":
        stored = req.reset_token or ""
        if ":" in stored:
            init_sec, actual_token = stored.split(":", 1)
            if session_secret and session_secret == init_sec:
                resp["reset_token"] = actual_token
            else:
                resp["reset_token"] = None
        else:
            resp["reset_token"] = stored

    return resp


@router.post("/forgot-password/reset")
def complete_password_reset(req: ResetPasswordSubmission, db: Session = Depends(get_db)):
    """
    Student submits new password after Branch Manager approves the request.
    Verifies reset_token and updates password hash.
    """
    if len(req.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters long.")

    pr = db.scalar(select(PasswordResetRequest).where(PasswordResetRequest.id == req.request_id))
    if not pr:
        raise HTTPException(status_code=404, detail="Invalid or expired reset request.")

    if pr.status != "APPROVED":
        raise HTTPException(status_code=400, detail=f"Request is not approved (Current status: {pr.status}).")

    stored = pr.reset_token or ""
    actual_token = stored.split(":", 1)[1] if ":" in stored else stored
    if not actual_token or actual_token != req.reset_token:
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
    target_type: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(require_branch_manager),
    db: Session = Depends(get_db)
):
    """
    Branch Manager & Root Admin endpoint to list password reset requests.
    - Root Admin can see all requests (students and staff) or filter by target_type ("staff" / "student").
    - Branch Managers and Institute Directors ONLY see student requests scoped to their branch/institute.
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

    is_root_admin = (current_user.get("role") == "ROOT_ADMIN")

    if not is_root_admin:
        # Branch Managers and Directors CANNOT see or approve staff requests
        stmt = stmt.where(PasswordResetRequest.student_id.isnot(None))

        if current_user.get("role") == "BRANCH_MANAGER" and current_user.get("branch_id"):
            stmt = stmt.where(
                or_(
                    PasswordResetRequest.branch_id == current_user["branch_id"],
                    PasswordResetRequest.branch_id.is_(None),
                )
            )
        elif current_user.get("role") == "INSTITUTE_DIRECTOR" and current_user.get("institute_id"):
            inst_id = current_user["institute_id"]
            inst_branches = select(Branch.id).where(Branch.institute_id == inst_id)
            stmt = stmt.where(
                or_(
                    PasswordResetRequest.branch_id.in_(inst_branches),
                    Branch.institute_id == inst_id,
                    PasswordResetRequest.branch_id.is_(None),
                )
            )
    else:
        # Root Admin can filter by target_type ("staff" or "student")
        if target_type == "staff":
            stmt = stmt.where(PasswordResetRequest.student_id.is_(None))
        elif target_type == "student":
            stmt = stmt.where(PasswordResetRequest.student_id.isnot(None))

    if status_filter:
        stmt = stmt.where(PasswordResetRequest.status == status_filter.upper())

    stmt = stmt.order_by(PasswordResetRequest.created_at.desc()).limit(50)
    results = db.execute(stmt).all()

    # Pre-fetch target users to attach actual role and details
    user_ids = [pr.user_id for pr, _, _ in results]
    user_map = {}
    if user_ids:
        users = db.scalars(select(User).where(User.id.in_(user_ids))).all()
        user_map = {u.id: u for u in users}

    items = []
    for pr, approved_by_name, branch_name in results:
        target_user = user_map.get(pr.user_id)
        role = target_user.role if target_user else ("STUDENT" if pr.student_id else (pr.roll_number or "STAFF"))
        items.append({
            "id": pr.id,
            "user_id": pr.user_id,
            "student_id": pr.student_id,
            "branch_id": pr.branch_id,
            "roll_number": pr.roll_number,
            "student_name": pr.student_name,
            "student_email": pr.student_email,
            "user_role": role,
            "is_staff": (pr.student_id is None),
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
    Approve password reset request.
    - Staff requests: ONLY Root Admin can approve.
    - Student requests: Branch Manager or Institute Director of that branch/institute.
    """
    req = db.scalar(select(PasswordResetRequest).where(PasswordResetRequest.id == request_id))
    if not req:
        raise HTTPException(status_code=404, detail="Password reset request not found.")

    if req.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Request is already {req.status}.")

    is_staff = (req.student_id is None)
    if is_staff:
        # ONLY Root Admin can approve staff password resets!
        if current_user.get("role") != "ROOT_ADMIN":
            raise HTTPException(
                status_code=403,
                detail="Forbidden: Only Root Administrators can authorize staff password reset requests."
            )
    else:
        # Check branch/institute ownership for student resets
        if current_user.get("role") == "BRANCH_MANAGER" and current_user.get("branch_id"):
            if req.branch_id and req.branch_id != current_user["branch_id"]:
                raise HTTPException(status_code=403, detail="Forbidden: You can only approve requests for your assigned branch.")
        elif current_user.get("role") == "INSTITUTE_DIRECTOR" and current_user.get("institute_id"):
            if req.branch_id:
                br = db.scalar(select(Branch).where(Branch.id == req.branch_id))
                if br and br.institute_id != current_user["institute_id"]:
                    raise HTTPException(status_code=403, detail="Forbidden: You can only approve requests for your assigned institute.")

    reset_token = f"rst_{uuid.uuid4().hex}"
    now = get_iso_now()

    req.status = "APPROVED"
    req.reset_token = f"{req.reset_token or ''}:{reset_token}"
    req.approved_by = current_user["sub"]
    req.approved_at = now

    approver_title = "Root Administrator" if is_staff else "Branch Manager"
    send_notification(
        cursor=db,
        user_id=req.user_id,
        notif_type="PASSWORD_RESET_APPROVED",
        title="Password Reset Request Approved",
        message=f"{approver_title} has approved your password reset request. Please complete setting your new password.",
        link_url="/auth/login",
    )

    db.commit()

    return {
        "status": "success",
        "message": f"Password reset request for {req.student_name or 'user'} approved.",
        "request_id": request_id,
    }


@router.post("/password-resets/{request_id}/reject")
def reject_password_reset(
    request_id: str,
    current_user: Dict[str, Any] = Depends(require_branch_manager),
    db: Session = Depends(get_db)
):
    """
    Reject password reset request.
    - Staff requests: ONLY Root Admin can reject.
    - Student requests: Branch Manager or Institute Director of that branch/institute.
    """
    req = db.scalar(select(PasswordResetRequest).where(PasswordResetRequest.id == request_id))
    if not req:
        raise HTTPException(status_code=404, detail="Password reset request not found.")

    if req.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Request is already {req.status}.")

    is_staff = (req.student_id is None)
    if is_staff:
        if current_user.get("role") != "ROOT_ADMIN":
            raise HTTPException(
                status_code=403,
                detail="Forbidden: Only Root Administrators can reject staff password reset requests."
            )
    else:
        if current_user.get("role") == "BRANCH_MANAGER" and current_user.get("branch_id"):
            if req.branch_id and req.branch_id != current_user["branch_id"]:
                raise HTTPException(status_code=403, detail="Forbidden: You can only reject requests for your assigned branch.")
        elif current_user.get("role") == "INSTITUTE_DIRECTOR" and current_user.get("institute_id"):
            if req.branch_id:
                br = db.scalar(select(Branch).where(Branch.id == req.branch_id))
                if br and br.institute_id != current_user["institute_id"]:
                    raise HTTPException(status_code=403, detail="Forbidden: You can only reject requests for your assigned institute.")

    now = get_iso_now()
    req.status = "REJECTED"
    req.approved_by = current_user["sub"]
    req.approved_at = now
    db.commit()

    return {
        "status": "success",
        "message": f"Password reset request for {req.student_name or 'user'} rejected.",
        "request_id": request_id,
    }
