import uuid
import random
import io
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, status
from pydantic import BaseModel
import openpyxl

from backend.app.database import get_db, get_iso_now, is_postgres
from backend.app.services.auth import (
    get_current_user,
    require_root_admin,
    require_branch_manager,
)

router = APIRouter(prefix="/api/v1/tenancy", tags=["Tenancy & Student Onboarding"])

class CreateInstituteRequest(BaseModel):
    name: str
    code: str

class CreateBranchRequest(BaseModel):
    institute_id: str
    name: str
    code: str
    city: str

class CreateBatchRequest(BaseModel):
    branch_id: str
    name: str
    code: str
    academic_year: str = "2026"
    exam_id: Optional[str] = "general"

class CreateStudentRequest(BaseModel):
    roll_number: str
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None

def generate_unique_student_id_num(cursor) -> str:
    """Generate a 6-to-8 digit unique numeric student ID for onboarding claims."""
    param = "%s" if is_postgres() else "?"
    while True:
        candidate = str(random.randint(100000, 999999))
        cursor.execute(f"SELECT id FROM students WHERE student_id_num = {param}", (candidate,))
        if not cursor.fetchone():
            return candidate

@router.get("/institutes")
def list_institutes(current_user: Dict[str, Any] = Depends(get_current_user)):
    user_role = current_user.get("role")
    param = "%s" if is_postgres() else "?"
    with get_db() as conn:
        cursor = conn.cursor()
        if user_role == "ROOT_ADMIN":
            cursor.execute("SELECT * FROM institutes ORDER BY created_at DESC")
        elif user_role == "BRANCH_MANAGER":
            inst_id = current_user.get("institute_id")
            if not inst_id and current_user.get("branch_id"):
                cursor.execute(f"SELECT institute_id FROM branches WHERE id = {param}", (current_user["branch_id"],))
                b_row = cursor.fetchone()
                if b_row:
                    inst_id = b_row["institute_id"]
            cursor.execute(f"SELECT * FROM institutes WHERE id = {param}", (inst_id,))
        else:
            return []
        return [dict(r) for r in cursor.fetchall()]

@router.post("/institutes")
def create_institute(req: CreateInstituteRequest, current_user: Dict[str, Any] = Depends(require_root_admin)):
    clean_code = req.code.strip().upper()
    param = "%s" if is_postgres() else "?"
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(f"SELECT id FROM institutes WHERE UPPER(code) = {param}", (clean_code,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Institute code already exists.")
        
        inst_id = f"inst_{uuid.uuid4().hex[:12]}"
        now = get_iso_now()
        cursor.execute(f"""
            INSERT INTO institutes (id, name, code, created_at)
            VALUES ({param}, {param}, {param}, {param})
        """, (inst_id, req.name.strip(), clean_code, now))
        return {"status": "success", "id": inst_id, "name": req.name, "code": clean_code}

@router.get("/branches")
def list_branches(current_user: Dict[str, Any] = Depends(get_current_user)):
    user_role = current_user["role"]
    param = "%s" if is_postgres() else "?"
    with get_db() as conn:
        cursor = conn.cursor()
        if user_role == "ROOT_ADMIN":
            cursor.execute("SELECT * FROM branches ORDER BY name ASC")
        else:
            branch_id = current_user.get("branch_id")
            cursor.execute(f"SELECT * FROM branches WHERE id = {param}", (branch_id,))
        return [dict(r) for r in cursor.fetchall()]

@router.post("/branches")
def create_branch(req: CreateBranchRequest, current_user: Dict[str, Any] = Depends(require_root_admin)):
    clean_code = req.code.strip().upper()
    param = "%s" if is_postgres() else "?"
    with get_db() as conn:
        cursor = conn.cursor()
        branch_id = f"br_{uuid.uuid4().hex[:12]}"
        now = get_iso_now()
        cursor.execute(f"""
            INSERT INTO branches (id, institute_id, name, code, city, created_at)
            VALUES ({param}, {param}, {param}, {param}, {param}, {param})
        """, (branch_id, req.institute_id, req.name.strip(), clean_code, req.city.strip(), now))
        return {"status": "success", "id": branch_id, "name": req.name, "code": clean_code}

@router.get("/batches")
def list_batches(branch_id: Optional[str] = None, current_user: Dict[str, Any] = Depends(get_current_user)):
    user_role = current_user["role"]
    with get_db() as conn:
        cursor = conn.cursor()
        if user_role == "BRANCH_MANAGER":
            user_branch = current_user.get("branch_id")
            cursor.execute("SELECT * FROM batches WHERE branch_id = ? ORDER BY created_at DESC", (user_branch,))
        else:
            if branch_id:
                cursor.execute("SELECT * FROM batches WHERE branch_id = ? ORDER BY created_at DESC", (branch_id,))
            else:
                cursor.execute("SELECT * FROM batches ORDER BY created_at DESC")
        return [dict(r) for r in cursor.fetchall()]

@router.post("/batches")
def create_batch(req: CreateBatchRequest, current_user: Dict[str, Any] = Depends(require_branch_manager)):
    # Check tenant isolation
    if current_user["role"] == "BRANCH_MANAGER" and current_user.get("branch_id") != req.branch_id:
        raise HTTPException(status_code=403, detail="Cannot create batches in a different branch.")
    
    with get_db() as conn:
        cursor = conn.cursor()
        batch_id = f"batch_{uuid.uuid4().hex[:12]}"
        now = get_iso_now()
        cursor.execute(
            "INSERT INTO batches (id, branch_id, exam_id, name, code, academic_year, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (batch_id, req.branch_id, req.exam_id or None, req.name.strip(), req.code.strip().upper(), req.academic_year, now, now)
        )
        return {"status": "success", "id": batch_id, "name": req.name, "code": req.code}

@router.get("/batches/{batch_id}/students")
def list_students_in_batch(batch_id: str, current_user: Dict[str, Any] = Depends(require_branch_manager)):
    with get_db() as conn:
        cursor = conn.cursor()
        # Verify branch scope if branch manager
        if current_user["role"] == "BRANCH_MANAGER":
            cursor.execute("SELECT branch_id FROM batches WHERE id = ?", (batch_id,))
            b = cursor.fetchone()
            if not b or b["branch_id"] != current_user.get("branch_id"):
                raise HTTPException(status_code=403, detail="Forbidden: batch belongs to another branch.")
        
        cursor.execute("SELECT * FROM students WHERE batch_id = ? ORDER BY roll_number ASC", (batch_id,))
        return [dict(r) for r in cursor.fetchall()]

@router.post("/batches/{batch_id}/students")
def add_single_student(batch_id: str, req: CreateStudentRequest, current_user: Dict[str, Any] = Depends(require_branch_manager)):
    clean_roll = req.roll_number.strip().upper()
    with get_db() as conn:
        cursor = conn.cursor()
        # Verify batch exists and branch access
        cursor.execute("SELECT branch_id FROM batches WHERE id = ?", (batch_id,))
        batch = cursor.fetchone()
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
        if current_user["role"] == "BRANCH_MANAGER" and batch["branch_id"] != current_user.get("branch_id"):
            raise HTTPException(status_code=403, detail="Forbidden: batch belongs to another branch.")
        
        # Check duplicate roll number in batch
        cursor.execute("SELECT id FROM students WHERE batch_id = ? AND UPPER(roll_number) = ?", (batch_id, clean_roll))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail=f"Student with roll number '{clean_roll}' already exists in this batch.")
        
        student_id = f"stu_{uuid.uuid4().hex[:12]}"
        student_id_num = generate_unique_student_id_num(cursor)
        now = get_iso_now()
        
        cursor.execute("""
            INSERT INTO students (id, batch_id, student_id_num, roll_number, full_name, email, phone, account_claimed, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
        """, (student_id, batch_id, student_id_num, clean_roll, req.full_name.strip(), req.email, req.phone, now))
        
        # Increment batch total
        cursor.execute("UPDATE batches SET total_submissions = total_submissions + 1, updated_at = ? WHERE id = ?", (now, batch_id))
        
        return {
            "status": "success",
            "id": student_id,
            "student_id_num": student_id_num,
            "roll_number": clean_roll,
            "full_name": req.full_name
        }

@router.post("/batches/{batch_id}/import-students")
async def import_students_excel(
    batch_id: str,
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(require_branch_manager)
):
    """
    Import student roster from an Excel sheet (.xlsx).
    Expected columns: Roll Number, Full Name, Email (optional), Phone (optional).
    Generates numeric student ID for each imported student.
    """
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Invalid file format. Please upload an Excel file (.xlsx).")
    
    content = await file.read()
    try:
        workbook = openpyxl.load_workbook(io.BytesIO(content))
        sheet = workbook.active
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse Excel spreadsheet: {str(e)}")
    
    with get_db() as conn:
        cursor = conn.cursor()
        # Verify batch exists and access
        cursor.execute("SELECT branch_id FROM batches WHERE id = ?", (batch_id,))
        batch = cursor.fetchone()
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
        if current_user["role"] == "BRANCH_MANAGER" and batch["branch_id"] != current_user.get("branch_id"):
            raise HTTPException(status_code=403, detail="Forbidden: batch belongs to another branch.")
        
        rows = list(sheet.iter_rows(values_only=True))
        if len(rows) < 2:
            raise HTTPException(status_code=400, detail="Excel file is empty or has no data rows.")
        
        header = [str(c).strip().lower() for c in rows[0] if c is not None]
        
        # Map headers
        roll_idx = next((i for i, h in enumerate(header) if "roll" in h or "id" in h), 0)
        name_idx = next((i for i, h in enumerate(header) if "name" in h), 1)
        email_idx = next((i for i, h in enumerate(header) if "email" in h or "mail" in h), None)
        phone_idx = next((i for i, h in enumerate(header) if "phone" in h or "mobile" in h), None)
        
        imported_students = []
        skipped_duplicates = []
        now = get_iso_now()
        
        for row in rows[1:]:
            if not row or row[roll_idx] is None:
                continue
            roll_number = str(row[roll_idx]).strip().upper()
            full_name = str(row[name_idx]).strip() if name_idx < len(row) and row[name_idx] else f"Student {roll_number}"
            email = str(row[email_idx]).strip() if email_idx is not None and email_idx < len(row) and row[email_idx] else None
            phone = str(row[phone_idx]).strip() if phone_idx is not None and phone_idx < len(row) and row[phone_idx] else None
            
            # Check duplicate
            cursor.execute("SELECT id FROM students WHERE batch_id = ? AND UPPER(roll_number) = ?", (batch_id, roll_number))
            if cursor.fetchone():
                skipped_duplicates.append(roll_number)
                continue
            
            student_id = f"stu_{uuid.uuid4().hex[:12]}"
            student_id_num = generate_unique_student_id_num(cursor)
            
            cursor.execute("""
                INSERT INTO students (id, batch_id, student_id_num, roll_number, full_name, email, phone, account_claimed, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
            """, (student_id, batch_id, student_id_num, roll_number, full_name, email, phone, now))
            
            imported_students.append({
                "student_id": student_id,
                "student_id_num": student_id_num,
                "roll_number": roll_number,
                "full_name": full_name
            })
        
        # Update batch total count
        cursor.execute(
            "UPDATE batches SET total_submissions = total_submissions + ?, updated_at = ? WHERE id = ?",
            (len(imported_students), now, batch_id)
        )
        
        return {
            "status": "success",
            "batch_id": batch_id,
            "imported_count": len(imported_students),
            "skipped_duplicates_count": len(skipped_duplicates),
            "skipped_duplicates": skipped_duplicates,
            "students": imported_students
        }

@router.delete("/batches/{batch_id}")
def delete_batch(batch_id: str, current_user: Dict[str, Any] = Depends(require_branch_manager)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT branch_id FROM batches WHERE id = ?", (batch_id,))
        batch = cursor.fetchone()
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
        if current_user["role"] == "BRANCH_MANAGER" and batch["branch_id"] != current_user.get("branch_id"):
            raise HTTPException(status_code=403, detail="Forbidden: batch belongs to another branch.")
        
        cursor.execute("DELETE FROM batches WHERE id = ?", (batch_id,))
        return {"status": "success", "message": "Batch deleted successfully"}

@router.delete("/batches/{batch_id}/students/{student_id}")
def delete_student_from_batch(batch_id: str, student_id: str, current_user: Dict[str, Any] = Depends(require_branch_manager)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT branch_id FROM batches WHERE id = ?", (batch_id,))
        batch = cursor.fetchone()
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
        if current_user["role"] == "BRANCH_MANAGER" and batch["branch_id"] != current_user.get("branch_id"):
            raise HTTPException(status_code=403, detail="Forbidden: batch belongs to another branch.")
        
        cursor.execute("DELETE FROM students WHERE id = ? AND batch_id = ?", (student_id, batch_id))
        return {"status": "success", "message": "Student removed successfully"}

