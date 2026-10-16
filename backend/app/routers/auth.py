import uuid
import asyncio
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, status, Request
from pydantic import BaseModel, EmailStr

from backend.app.database import get_db, get_iso_now, is_postgres
from backend.app.services.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    require_root_admin,
)
from backend.app.services.notification_service import send_notification

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication & RBAC"])

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

