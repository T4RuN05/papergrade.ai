import uuid
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Depends, status, Request
from pydantic import BaseModel, EmailStr

from backend.app.database import get_db, get_iso_now, is_postgres
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
    role: str # "ROOT_ADMIN" or "BRANCH_MANAGER"
    institute_id: Optional[str] = None
    branch_id: Optional[str] = None

@router.post("/login", response_model=LoginResponse)
async def login(request: Request):
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

    def _authenticate_sync():
        param = "%s" if is_postgres() else "?"
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                f"SELECT * FROM users WHERE LOWER(email) = {param} AND is_active = 1",
                (clean_email,)
            )
            u = cursor.fetchone()

            # If not found by email, check if this is a student logging in with Roll Number or Student ID
            if not u:
                cursor.execute(
                    f"""
                    SELECT u.* FROM users u
                    JOIN students s ON s.user_id = u.id
                    WHERE (UPPER(s.roll_number) = {param} OR s.student_id_num = {param})
                      AND u.is_active = 1
                    LIMIT 1
                    """,
                    (clean_identifier.upper(), clean_identifier)
                )
                u = cursor.fetchone()
            
            if not u or not verify_password(password_val, u["password_hash"]):
                return None, None
            
            now = get_iso_now()
            cursor.execute(f"UPDATE users SET last_login_at = {param} WHERE id = {param}", (now, u["id"]))

            s_info = None
            if u["role"] == "STUDENT":
                cursor.execute(
                    f"SELECT * FROM students WHERE user_id = {param} ORDER BY claimed_at DESC LIMIT 1",
                    (u["id"],)
                )
                s_info = cursor.fetchone()

            return dict(u), dict(s_info) if s_info else None

    user, student_info = await asyncio.to_thread(_authenticate_sync)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Use your registered email, roll number, or student ID."
        )
        
    token_payload = {
        "sub": user["id"],
        "role": user["role"],
        "email": user["email"],
        "full_name": user["full_name"],
        "institute_id": user["institute_id"],
        "branch_id": user["branch_id"]
    }
    user_response = {
        "id": user["id"],
        "role": user["role"],
        "email": user["email"],
        "full_name": user["full_name"],
        "institute_id": user["institute_id"],
        "branch_id": user["branch_id"]
    }
    if student_info:
        token_payload["student_id"] = student_info["id"]
        token_payload["roll_number"] = student_info["roll_number"]
        token_payload["student_id_num"] = student_info["student_id_num"]
        user_response["student_id"] = student_info["id"]
        user_response["roll_number"] = student_info["roll_number"]
        user_response["student_id_num"] = student_info["student_id_num"]

    token = create_access_token(token_payload)
    
    return LoginResponse(
        access_token=token,
        user=user_response
    )

@router.get("/me")
def get_profile(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Fetch profile of currently authenticated user."""
    param = "%s" if is_postgres() else "?"
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(f"SELECT * FROM users WHERE id = {param}", (current_user["sub"],))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        profile = {
            "id": user["id"],
            "role": user["role"],
            "email": user["email"],
            "full_name": user["full_name"],
            "institute_id": user["institute_id"],
            "branch_id": user["branch_id"],
            "created_at": user["created_at"],
            "last_login_at": user["last_login_at"]
        }
        
        # If student, attach student details
        if user["role"] == "STUDENT":
            cursor.execute(f"SELECT * FROM students WHERE user_id = {param} ORDER BY claimed_at DESC LIMIT 1", (user["id"],))
            st = cursor.fetchone()
            if st:
                profile["student"] = {
                    "student_id": st["id"],
                    "student_id_num": st["student_id_num"],
                    "roll_number": st["roll_number"],
                    "batch_id": st["batch_id"]
                }
                profile["roll_number"] = st["roll_number"]
                profile["student_id_num"] = st["student_id_num"]
                profile["student_id"] = st["id"]
        return profile

@router.post("/claim-account", response_model=LoginResponse)
def claim_account(req: ClaimAccountRequest):
    """
    One-time onboarding account claim for students using their assigned numeric student ID.
    Validates identity, hashes new password, links user record, and logs student in.
    """
    clean_id_num = req.student_id_num.strip()
    clean_roll = req.roll_number.strip().upper()
    
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # 1. Verify student record exists
        cursor.execute(
            "SELECT * FROM students WHERE student_id_num = ? AND UPPER(roll_number) = ?",
            (clean_id_num, clean_roll)
        )
        student = cursor.fetchone()
        if not student:
            raise HTTPException(
                status_code=404,
                detail="No student record found with the given numeric ID and roll number."
            )
        
        # 2. Verify account is not already claimed
        if student["account_claimed"] == 1:
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
        cursor.execute("SELECT id FROM users WHERE email = ?", (student_email,))
        if cursor.fetchone():
            student_email = f"student_{clean_id_num}_{uuid.uuid4().hex[:4]}@papergrade.local"
        
        # Look up branch and institute via batch
        cursor.execute("""
            SELECT b.branch_id, br.institute_id 
            FROM batches b 
            LEFT JOIN branches br ON b.branch_id = br.id 
            WHERE b.id = ?
        """, (student["batch_id"],))
        batch_info = cursor.fetchone()
        branch_id = batch_info["branch_id"] if batch_info else None
        institute_id = batch_info["institute_id"] if batch_info else None
        
        cursor.execute("""
            INSERT INTO users (id, institute_id, branch_id, email, role, password_hash, full_name, is_active, last_login_at, created_at)
            VALUES (?, ?, ?, ?, 'STUDENT', ?, ?, 1, ?, ?)
        """, (new_user_id, institute_id, branch_id, student_email, hashed, student["full_name"], now, now))
        
        # 4. Link student to user and set account_claimed = 1
        cursor.execute("""
            UPDATE students 
            SET user_id = ?, account_claimed = 1, claimed_at = ?, email = COALESCE(?, email)
            WHERE id = ?
        """, (new_user_id, now, req.email, student["id"]))

        # 4b. Backfill notifications for any currently active submission windows in their batch or branch
        cursor.execute("""
            SELECT sw.id, sw.deadline_at, e.title, e.id as exam_id
            FROM submission_windows sw
            JOIN exams e ON sw.exam_id = e.id
            LEFT JOIN batches b ON b.id = ?
            WHERE (sw.branch_id = ? OR e.branch_id = ? OR b.exam_id = e.id) AND sw.status = 'OPEN'
        """, (student["batch_id"], branch_id, branch_id))
        for win in cursor.fetchall():
            send_notification(
                cursor=cursor,
                user_id=new_user_id,
                notif_type="WINDOW_OPENED",
                title="Submission Window Open",
                message=f"The submission window for '{win['title']}' is currently open! Upload your answer sheet before the deadline.",
                link_url="/student/portal"
            )
        
        # 5. Emit token
        token_payload = {
            "sub": new_user_id,
            "role": "STUDENT",
            "email": student_email,
            "full_name": student["full_name"],
            "institute_id": institute_id,
            "branch_id": branch_id,
            "student_id": student["id"],
            "roll_number": student["roll_number"],
            "student_id_num": student["student_id_num"]
        }
        token = create_access_token(token_payload)
        
        return LoginResponse(
            access_token=token,
            user={
                "id": new_user_id,
                "role": "STUDENT",
                "email": student_email,
                "full_name": student["full_name"],
                "institute_id": institute_id,
                "branch_id": branch_id,
                "student_id": student["id"],
                "roll_number": student["roll_number"],
                "student_id_num": student["student_id_num"]
            }
        )

@router.post("/create-user")
def create_user(req: CreateUserRequest, current_user: Dict[str, Any] = Depends(require_root_admin)):
    """Root Admin endpoint to provision Branch Managers or other staff."""
    if req.role not in ["ROOT_ADMIN", "BRANCH_MANAGER"]:
        raise HTTPException(status_code=400, detail="Invalid role specified.")
    
    param = "%s" if is_postgres() else "?"
    clean_email = req.email.strip().lower()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(f"SELECT id FROM users WHERE LOWER(email) = {param}", (clean_email,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="User with this email already exists.")
        
        new_id = f"usr_{uuid.uuid4().hex[:12]}"
        hashed = hash_password(req.password)
        now = get_iso_now()
        
        cursor.execute(f"""
            INSERT INTO users (id, institute_id, branch_id, email, role, password_hash, full_name, is_active, created_at)
            VALUES ({param}, {param}, {param}, {param}, {param}, {param}, {param}, 1, {param})
        """, (new_id, req.institute_id, req.branch_id, clean_email, req.role, hashed, req.full_name, now))
        
        return {
            "status": "success",
            "user_id": new_id,
            "email": clean_email,
            "role": req.role,
            "full_name": req.full_name
        }

@router.get("/users")
def list_users(
    role: Optional[str] = None,
    branch_id: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(require_root_admin)
):
    """List staff users / managers for tenancy management."""
    param = "%s" if is_postgres() else "?"
    with get_db() as conn:
        cursor = conn.cursor()
        query = "SELECT id, institute_id, branch_id, email, role, full_name, is_active, created_at, last_login_at FROM users WHERE 1=1"
        params = []
        if role:
            query += f" AND role = {param}"
            params.append(role)
        if branch_id:
            query += f" AND branch_id = {param}"
            params.append(branch_id)
        query += " ORDER BY created_at DESC"
        cursor.execute(query, tuple(params))
        return [dict(r) for r in cursor.fetchall()]

# -------------------------------------------------------------
# Student Forgot Password Flow (Branch Manager Approval)
# -------------------------------------------------------------

@router.post("/forgot-password/request")
def request_password_reset(req: ForgotPasswordRequest):
    """
    Student requests a password reset from the login screen.
    Finds student record & branch, creates a PENDING request,
    and alerts the assigned Branch Manager for authorization.
    """
    clean_id = req.identifier.strip()
    if not clean_id:
        raise HTTPException(status_code=400, detail="Roll number, student ID, or email is required.")
    
    param = "%s" if is_postgres() else "?"
    with get_db() as conn:
        cursor = conn.cursor()
        
        # 1. Lookup student and user record
        cursor.execute(f"""
            SELECT s.*, b.branch_id as batch_branch_id, u.id as user_id, u.email as user_email, u.full_name as user_name, u.branch_id as user_branch_id
            FROM students s
            LEFT JOIN batches b ON s.batch_id = b.id
            LEFT JOIN users u ON s.user_id = u.id
            WHERE (UPPER(s.roll_number) = {param} OR s.student_id_num = {param} OR LOWER(s.email) = {param})
            LIMIT 1
        """, (clean_id.upper(), clean_id, clean_id.lower()))
        student_match = cursor.fetchone()

        user_match = None
        if not student_match:
            cursor.execute(f"""
                SELECT u.* FROM users u
                WHERE LOWER(u.email) = {param} AND u.role = 'STUDENT'
                LIMIT 1
            """, (clean_id.lower(),))
            user_match = cursor.fetchone()
            if user_match:
                cursor.execute(f"""
                    SELECT s.*, b.branch_id as batch_branch_id
                    FROM students s
                    LEFT JOIN batches b ON s.batch_id = b.id
                    WHERE s.user_id = {param}
                    ORDER BY s.created_at DESC LIMIT 1
                """, (user_match["id"],))
                student_match = cursor.fetchone()
        
        if not student_match and not user_match:
            raise HTTPException(
                status_code=404,
                detail="No student account found for this roll number or ID. Please check your credentials."
            )
        
        user_id = (user_match["id"] if user_match else student_match.get("user_id"))
        if not user_id:
            raise HTTPException(
                status_code=400,
                detail="Your student account has not been claimed yet. Please claim your account with your admission ID."
            )

        student_id = student_match["id"] if student_match else None
        roll_number = student_match.get("roll_number") if student_match else clean_id.upper()
        student_name = (student_match.get("full_name") if student_match else user_match.get("full_name")) or "Student"
        student_email = (user_match.get("email") if user_match else student_match.get("email")) or ""
        branch_id = (student_match.get("batch_branch_id") if student_match else None) or (user_match.get("branch_id") if user_match else None)

        now = get_iso_now()
        now_dt = datetime.now(timezone.utc)
        expires_at = (now_dt + timedelta(minutes=45)).isoformat()

        # Check for existing PENDING or APPROVED request within active window
        cursor.execute(f"""
            SELECT * FROM password_reset_requests
            WHERE user_id = {param} AND status IN ('PENDING', 'APPROVED') AND expires_at > {param}
            ORDER BY created_at DESC LIMIT 1
        """, (user_id, now))
        existing = cursor.fetchone()
        if existing:
            return {
                "status": "success",
                "request_id": existing["id"],
                "request_status": existing["status"],
                "message": "A reset request is already active. Please wait for Branch Manager approval.",
                "student_name": student_name,
                "roll_number": roll_number
            }

        req_id = f"pr_{uuid.uuid4().hex[:12]}"
        cursor.execute(f"""
            INSERT INTO password_reset_requests (
                id, user_id, student_id, branch_id, roll_number, student_name, student_email,
                status, expires_at, created_at
            ) VALUES ({param}, {param}, {param}, {param}, {param}, {param}, {param}, 'PENDING', {param}, {param})
        """, (req_id, user_id, student_id, branch_id, roll_number, student_name, student_email, expires_at, now))

        # Notify branch managers for this branch
        notify_branch_managers(
            cursor=cursor,
            branch_id=branch_id,
            notif_type="PASSWORD_RESET_REQUEST",
            title="Password Reset Request",
            message=f"Student {student_name} ({roll_number}) has requested a password reset. Review and approve in Branch Management.",
            link_url="/branch/batches"
        )

        return {
            "status": "success",
            "request_id": req_id,
            "request_status": "PENDING",
            "message": "Password reset request submitted. Awaiting approval from your Branch Manager.",
            "student_name": student_name,
            "roll_number": roll_number
        }

@router.get("/forgot-password/status/{request_id}")
def get_password_reset_status(request_id: str):
    """
    Polled by student login form while in waiting state.
    Returns status: PENDING, APPROVED, REJECTED, COMPLETED, or EXPIRED.
    When APPROVED, returns the one-time reset_token to authorize password update.
    """
    param = "%s" if is_postgres() else "?"
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(f"SELECT * FROM password_reset_requests WHERE id = {param}", (request_id,))
        req = cursor.fetchone()
        if not req:
            raise HTTPException(status_code=404, detail="Password reset request not found.")

        now_dt = datetime.now(timezone.utc)
        expires_dt = datetime.fromisoformat(req["expires_at"].replace("Z", "+00:00"))
        
        current_status = req["status"]
        if current_status in ["PENDING", "APPROVED"] and now_dt > expires_dt:
            current_status = "EXPIRED"
            cursor.execute(f"UPDATE password_reset_requests SET status = 'EXPIRED' WHERE id = {param}", (request_id,))

        resp = {
            "request_id": req["id"],
            "status": current_status,
            "student_name": req.get("student_name"),
            "roll_number": req.get("roll_number"),
            "requested_at": req.get("created_at"),
            "approved_at": req.get("approved_at"),
        }

        # ONLY return reset_token if request is currently APPROVED
        if current_status == "APPROVED":
            resp["reset_token"] = req.get("reset_token")

        return resp

@router.post("/forgot-password/reset")
def complete_password_reset(req: ResetPasswordSubmission):
    """
    Student submits new password after Branch Manager approves the request.
    Verifies reset_token and updates password hash.
    """
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters long.")

    param = "%s" if is_postgres() else "?"
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(f"SELECT * FROM password_reset_requests WHERE id = {param}", (req.request_id,))
        pr = cursor.fetchone()
        if not pr:
            raise HTTPException(status_code=404, detail="Invalid or expired reset request.")

        if pr["status"] != "APPROVED":
            raise HTTPException(status_code=400, detail=f"Request is not approved (Current status: {pr['status']}).")

        if not pr.get("reset_token") or pr.get("reset_token") != req.reset_token:
            raise HTTPException(status_code=403, detail="Invalid or mismatched reset authorization token.")

        now_dt = datetime.now(timezone.utc)
        expires_dt = datetime.fromisoformat(pr["expires_at"].replace("Z", "+00:00"))
        if now_dt > expires_dt:
            cursor.execute(f"UPDATE password_reset_requests SET status = 'EXPIRED' WHERE id = {param}", (req.request_id,))
            raise HTTPException(status_code=400, detail="This reset authorization has expired. Please submit a new request.")

        new_hash = hash_password(req.new_password)
        now = get_iso_now()

        # Update user password
        cursor.execute(f"""
            UPDATE users SET password_hash = {param}
            WHERE id = {param}
        """, (new_hash, pr["user_id"]))

        # Mark request COMPLETED and clear reset token
        cursor.execute(f"""
            UPDATE password_reset_requests
            SET status = 'COMPLETED', completed_at = {param}, reset_token = NULL
            WHERE id = {param}
        """, (now, req.request_id))

        # Send confirmation notification
        send_notification(
            cursor=cursor,
            user_id=pr["user_id"],
            notif_type="PASSWORD_RESET_SUCCESS",
            title="Password Changed Successfully",
            message="Your account password was successfully reset. You can now log in.",
            link_url="/auth/login"
        )

        return {
            "status": "success",
            "message": "Password successfully reset! You can now log in with your new password."
        }

@router.get("/password-resets")
def list_password_resets(
    status_filter: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(require_branch_manager)
):
    """
    Branch Manager & Root Admin endpoint to list student password reset requests.
    Filtered by branch for Branch Managers.
    """
    param = "%s" if is_postgres() else "?"
    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT pr.*, u.full_name as approved_by_name, b.name as branch_name
            FROM password_reset_requests pr
            LEFT JOIN users u ON pr.approved_by = u.id
            LEFT JOIN branches b ON pr.branch_id = b.id
            WHERE 1=1
        """
        params = []
        if current_user.get("role") == "BRANCH_MANAGER" and current_user.get("branch_id"):
            query += f" AND (pr.branch_id = {param} OR pr.branch_id IS NULL)"
            params.append(current_user["branch_id"])

        if status_filter:
            query += f" AND pr.status = {param}"
            params.append(status_filter.upper())

        query += " ORDER BY pr.created_at DESC LIMIT 50"
        cursor.execute(query, tuple(params))
        return [dict(r) for r in cursor.fetchall()]

@router.post("/password-resets/{request_id}/approve")
def approve_password_reset(
    request_id: str,
    current_user: Dict[str, Any] = Depends(require_branch_manager)
):
    """
    Branch Manager approves student password reset request.
    Generates single-use reset_token for the waiting student form.
    """
    param = "%s" if is_postgres() else "?"
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(f"SELECT * FROM password_reset_requests WHERE id = {param}", (request_id,))
        req = cursor.fetchone()
        if not req:
            raise HTTPException(status_code=404, detail="Password reset request not found.")

        if req["status"] != "PENDING":
            raise HTTPException(status_code=400, detail=f"Request is already {req['status']}.")

        # Check branch ownership if branch manager
        if current_user.get("role") == "BRANCH_MANAGER" and current_user.get("branch_id"):
            if req.get("branch_id") and req["branch_id"] != current_user["branch_id"]:
                raise HTTPException(status_code=403, detail="Forbidden: You can only approve requests for your assigned branch.")

        reset_token = f"rst_{uuid.uuid4().hex}"
        now = get_iso_now()

        cursor.execute(f"""
            UPDATE password_reset_requests
            SET status = 'APPROVED', reset_token = {param}, approved_by = {param}, approved_at = {param}
            WHERE id = {param}
        """, (reset_token, current_user["sub"], now, request_id))

        # Notify student account if user_id exists
        send_notification(
            cursor=cursor,
            user_id=req["user_id"],
            notif_type="PASSWORD_RESET_APPROVED",
            title="Password Reset Request Approved",
            message=f"Branch Manager has approved your password reset request. Please complete setting your new password.",
            link_url="/auth/login"
        )

        return {
            "status": "success",
            "message": f"Password reset request for {req.get('student_name', 'student')} approved.",
            "request_id": request_id
        }

@router.post("/password-resets/{request_id}/reject")
def reject_password_reset(
    request_id: str,
    current_user: Dict[str, Any] = Depends(require_branch_manager)
):
    """
    Branch Manager rejects student password reset request.
    """
    param = "%s" if is_postgres() else "?"
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(f"SELECT * FROM password_reset_requests WHERE id = {param}", (request_id,))
        req = cursor.fetchone()
        if not req:
            raise HTTPException(status_code=404, detail="Password reset request not found.")

        if req["status"] != "PENDING":
            raise HTTPException(status_code=400, detail=f"Request is already {req['status']}.")

        # Check branch ownership if branch manager
        if current_user.get("role") == "BRANCH_MANAGER" and current_user.get("branch_id"):
            if req.get("branch_id") and req["branch_id"] != current_user["branch_id"]:
                raise HTTPException(status_code=403, detail="Forbidden: You can only reject requests for your assigned branch.")

        now = get_iso_now()
        cursor.execute(f"""
            UPDATE password_reset_requests
            SET status = 'REJECTED', approved_by = {param}, approved_at = {param}
            WHERE id = {param}
        """, (current_user["sub"], now, request_id))

        return {
            "status": "success",
            "message": f"Password reset request for {req.get('student_name', 'student')} rejected.",
            "request_id": request_id
        }

