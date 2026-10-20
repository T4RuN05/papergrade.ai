import uuid
import random
import io
import json
import shutil
import logging
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, status
from pydantic import BaseModel
import openpyxl

from backend.app.config import settings
from backend.app.database import get_db, get_iso_now, is_postgres
from backend.app.services.auth import (
    get_current_user,
    require_root_admin,
    require_branch_manager,
)
from backend.app.services.storage import get_storage_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/tenancy", tags=["Tenancy & Student Onboarding"])

class CreateInstituteRequest(BaseModel):
    name: str
    code: str
    subjects: Optional[List[str]] = None

class AddSubjectsRequest(BaseModel):
    subjects: List[str]

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
        
        insts = [dict(r) for r in cursor.fetchall()]
        for inst in insts:
            sub = inst.get("subjects")
            if isinstance(sub, str):
                try:
                    inst["subjects"] = json.loads(sub)
                except Exception:
                    inst["subjects"] = [s.strip() for s in sub.split(",") if s.strip()]
            elif not sub:
                inst["subjects"] = []
        return insts

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
        
        clean_subjects = [s.strip() for s in (req.subjects or []) if s.strip()]
        if not clean_subjects:
            clean_subjects = ["Physics", "Chemistry", "Maths", "Biology"]
        subjects_json = json.dumps(clean_subjects)
        
        cursor.execute(f"""
            INSERT INTO institutes (id, name, code, subjects, created_at)
            VALUES ({param}, {param}, {param}, {param}, {param})
        """, (inst_id, req.name.strip(), clean_code, subjects_json, now))
        
        for s_name in clean_subjects:
            s_id = f"sub_{uuid.uuid4().hex[:12]}"
            cursor.execute(f"""
                INSERT INTO subjects (id, institute_id, branch_id, name, code, created_at)
                VALUES ({param}, {param}, NULL, {param}, {param}, {param})
            """, (s_id, inst_id, s_name, s_name[:4].upper(), now))
            
        return {
            "status": "success",
            "id": inst_id,
            "name": req.name,
            "code": clean_code,
            "subjects": clean_subjects
        }

@router.get("/subjects")
def list_subjects(
    branch_id: Optional[str] = None,
    institute_id: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    param = "%s" if is_postgres() else "?"
    with get_db() as conn:
        cursor = conn.cursor()
        eff_branch = branch_id or current_user.get("branch_id")
        eff_inst = institute_id or current_user.get("institute_id")
        
        if eff_branch and not eff_inst:
            cursor.execute(f"SELECT institute_id FROM branches WHERE id = {param}", (eff_branch,))
            b_row = cursor.fetchone()
            if b_row and b_row["institute_id"]:
                eff_inst = b_row["institute_id"]

        subjects_set = set()
        subjects_ordered = []

        def add_subject(s: str):
            clean = s.strip()
            if clean and clean.lower() not in subjects_set:
                subjects_set.add(clean.lower())
                subjects_ordered.append(clean)

        # 1. Query branches.subjects
        if eff_branch:
            cursor.execute(f"SELECT subjects FROM branches WHERE id = {param}", (eff_branch,))
            row = cursor.fetchone()
            if row and row["subjects"]:
                try:
                    for s in json.loads(row["subjects"]):
                        add_subject(str(s))
                except Exception:
                    for s in str(row["subjects"]).split(","):
                        add_subject(s)

        # 2. Query institutes.subjects
        if eff_inst:
            cursor.execute(f"SELECT subjects FROM institutes WHERE id = {param}", (eff_inst,))
            row = cursor.fetchone()
            if row and row["subjects"]:
                try:
                    for s in json.loads(row["subjects"]):
                        add_subject(str(s))
                except Exception:
                    for s in str(row["subjects"]).split(","):
                        add_subject(s)

        # 3. Query subjects table
        if eff_branch or eff_inst:
            conditions = []
            params = []
            if eff_branch:
                conditions.append(f"branch_id = {param}")
                params.append(eff_branch)
            if eff_inst:
                conditions.append(f"institute_id = {param}")
                params.append(eff_inst)
            cond_str = " OR ".join(conditions)
            cursor.execute(f"SELECT DISTINCT name FROM subjects WHERE {cond_str} ORDER BY name ASC", tuple(params))
            for r in cursor.fetchall():
                add_subject(r["name"])

        # 4. Check exams table
        if eff_branch or eff_inst:
            ex_cond = f"branch_id = {param}" if eff_branch else f"institute_id = {param}"
            ex_arg = eff_branch if eff_branch else eff_inst
            cursor.execute(f"SELECT DISTINCT subject FROM exams WHERE {ex_cond} AND subject IS NOT NULL", (ex_arg,))
            for r in cursor.fetchall():
                if r["subject"]:
                    add_subject(r["subject"])

        # Fallback if none found
        if not subjects_ordered:
            for d in ["Physics", "Chemistry", "Maths", "Biology"]:
                add_subject(d)

        return subjects_ordered

@router.post("/institutes/{institute_id}/subjects")
def add_institute_subjects(
    institute_id: str,
    req: AddSubjectsRequest,
    current_user: Dict[str, Any] = Depends(require_root_admin)
):
    param = "%s" if is_postgres() else "?"
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(f"SELECT id, subjects FROM institutes WHERE id = {param}", (institute_id,))
        inst = cursor.fetchone()
        if not inst:
            raise HTTPException(status_code=404, detail="Institute not found")

        current_subs: List[str] = []
        if inst["subjects"]:
            try:
                current_subs = json.loads(inst["subjects"])
            except Exception:
                current_subs = [s.strip() for s in inst["subjects"].split(",") if s.strip()]

        existing_lower = {s.lower() for s in current_subs}
        added = []
        now = get_iso_now()

        for s in req.subjects:
            clean = s.strip()
            if clean and clean.lower() not in existing_lower:
                current_subs.append(clean)
                existing_lower.add(clean.lower())
                added.append(clean)
                s_id = f"sub_{uuid.uuid4().hex[:12]}"
                cursor.execute(f"""
                    INSERT INTO subjects (id, institute_id, branch_id, name, code, created_at)
                    VALUES ({param}, {param}, NULL, {param}, {param}, {param})
                """, (s_id, institute_id, clean, clean[:4].upper(), now))

        new_json = json.dumps(current_subs)
        cursor.execute(f"UPDATE institutes SET subjects = {param} WHERE id = {param}", (new_json, institute_id))
        
        # Propagate to branches under this institute that don't have subjects
        cursor.execute(f"SELECT id, subjects FROM branches WHERE institute_id = {param}", (institute_id,))
        for b in cursor.fetchall():
            b_subs = b.get("subjects")
            if not b_subs or b_subs == "[]":
                cursor.execute(f"UPDATE branches SET subjects = {param} WHERE id = {param}", (new_json, b["id"]))

        return {"status": "success", "subjects": current_subs, "added": added}

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


def _chunked_delete(cursor, table: str, column: str, ids: List[str], chunk_size: int = 500):
    """Helper to safely execute DELETE queries in chunks to avoid variable parameter limits."""
    if not ids:
        return
    for i in range(0, len(ids), chunk_size):
        chunk = ids[i : i + chunk_size]
        ph = ",".join(["?"] * len(chunk))
        cursor.execute(f"DELETE FROM {table} WHERE {column} IN ({ph})", tuple(chunk))


@router.delete("/institutes/{institute_id}")
def delete_institute(institute_id: str, current_user: Dict[str, Any] = Depends(require_root_admin)):
    """
    Permanently delete an entire coaching institute and cascade delete everything under it:
    - Branches and Subjects
    - Batches and Students
    - Staff/Branch Manager and Student user accounts (strictly excludes ROOT_ADMIN)
    - Exams, Exam Batches, Submission Windows, Rubrics
    - Submissions, Answers, Criterion Scores, Answer Regions, Evaluation Queue, Revaluations
    - Cloudinary and Object Storage assets (answer sheets, canonical PDFs, annotated PDFs, question papers, answer keys, reports)
    - Local renders, uploads, and cached files
    """
    storage = get_storage_service()

    with get_db() as conn:
        cursor = conn.cursor()

        # 1. Verify institute exists
        cursor.execute("SELECT id, name, code FROM institutes WHERE id = ?", (institute_id,))
        inst = cursor.fetchone()
        if not inst:
            raise HTTPException(status_code=404, detail="Institute not found")
        inst_name = inst["name"]
        inst_code = inst["code"]

        # 2. Collect Branch IDs
        cursor.execute("SELECT id FROM branches WHERE institute_id = ?", (institute_id,))
        branch_ids = [r["id"] for r in cursor.fetchall()]

        # 3. Collect Batch IDs
        batch_ids = []
        if branch_ids:
            ph = ",".join(["?"] * len(branch_ids))
            cursor.execute(f"SELECT id FROM batches WHERE branch_id IN ({ph})", tuple(branch_ids))
            batch_ids = [r["id"] for r in cursor.fetchall()]

        # 4. Collect Exams (belonging to institute directly, or its branches, or linked via exam_batches)
        exam_ids_set = set()
        exams_list = []

        cursor.execute("SELECT id, title, question_paper_path, answer_key_path FROM exams WHERE institute_id = ?", (institute_id,))
        for r in cursor.fetchall():
            exam_ids_set.add(r["id"])
            exams_list.append(dict(r))

        if branch_ids:
            ph = ",".join(["?"] * len(branch_ids))
            cursor.execute(f"SELECT id, title, question_paper_path, answer_key_path FROM exams WHERE branch_id IN ({ph})", tuple(branch_ids))
            for r in cursor.fetchall():
                if r["id"] not in exam_ids_set:
                    exam_ids_set.add(r["id"])
                    exams_list.append(dict(r))

        if batch_ids:
            ph = ",".join(["?"] * len(batch_ids))
            cursor.execute(f"SELECT DISTINCT exam_id FROM exam_batches WHERE batch_id IN ({ph})", tuple(batch_ids))
            linked_exam_ids = [r["exam_id"] for r in cursor.fetchall() if r["exam_id"] not in exam_ids_set]
            if linked_exam_ids:
                ph_e = ",".join(["?"] * len(linked_exam_ids))
                cursor.execute(f"SELECT id, title, question_paper_path, answer_key_path FROM exams WHERE id IN ({ph_e})", tuple(linked_exam_ids))
                for r in cursor.fetchall():
                    if r["id"] not in exam_ids_set:
                        exam_ids_set.add(r["id"])
                        exams_list.append(dict(r))

        exam_ids_list = list(exam_ids_set)

        # 5. Collect Students & their user accounts
        student_ids = []
        student_user_ids = []
        if batch_ids:
            ph = ",".join(["?"] * len(batch_ids))
            cursor.execute(f"SELECT id, user_id FROM students WHERE batch_id IN ({ph})", tuple(batch_ids))
            for r in cursor.fetchall():
                student_ids.append(r["id"])
                if r["user_id"]:
                    student_user_ids.append(r["user_id"])

        # 6. Collect Submissions
        sub_ids_set = set()
        subs_list = []

        def _add_submissions(query_sql: str, params: tuple):
            cursor.execute(query_sql, params)
            for r in cursor.fetchall():
                if r["id"] not in sub_ids_set:
                    sub_ids_set.add(r["id"])
                    subs_list.append(dict(r))

        if exam_ids_list:
            for i in range(0, len(exam_ids_list), 500):
                chunk = exam_ids_list[i : i + 500]
                ph = ",".join(["?"] * len(chunk))
                _add_submissions(
                    f"SELECT id, exam_id, original_file_path, canonical_pdf_path, annotated_pdf_path FROM submissions WHERE exam_id IN ({ph})",
                    tuple(chunk)
                )

        if batch_ids:
            for i in range(0, len(batch_ids), 500):
                chunk = batch_ids[i : i + 500]
                ph = ",".join(["?"] * len(chunk))
                _add_submissions(
                    f"SELECT id, exam_id, original_file_path, canonical_pdf_path, annotated_pdf_path FROM submissions WHERE batch_id IN ({ph})",
                    tuple(chunk)
                )

        if student_ids:
            for i in range(0, len(student_ids), 500):
                chunk = student_ids[i : i + 500]
                ph = ",".join(["?"] * len(chunk))
                _add_submissions(
                    f"SELECT id, exam_id, original_file_path, canonical_pdf_path, annotated_pdf_path FROM submissions WHERE student_id IN ({ph})",
                    tuple(chunk)
                )

        sub_ids_list = list(sub_ids_set)

        # 7. Collect User Accounts to delete (STRICTLY exclude ROOT_ADMIN)
        user_ids_to_delete = set()

        cursor.execute("SELECT id, role FROM users WHERE institute_id = ?", (institute_id,))
        for r in cursor.fetchall():
            if r["role"] != "ROOT_ADMIN":
                user_ids_to_delete.add(r["id"])

        if branch_ids:
            ph = ",".join(["?"] * len(branch_ids))
            cursor.execute(f"SELECT id, role FROM users WHERE branch_id IN ({ph})", tuple(branch_ids))
            for r in cursor.fetchall():
                if r["role"] != "ROOT_ADMIN":
                    user_ids_to_delete.add(r["id"])

        for u_id in student_user_ids:
            cursor.execute("SELECT id, role FROM users WHERE id = ?", (u_id,))
            u_row = cursor.fetchone()
            if u_row and u_row["role"] != "ROOT_ADMIN":
                user_ids_to_delete.add(u_row["id"])

        user_ids_list = list(user_ids_to_delete)

        # 8. Collect Technical Report Screenshots
        report_files_to_delete = []
        if user_ids_list or branch_ids:
            conds = []
            c_params = []
            if user_ids_list:
                ph_u = ",".join(["?"] * len(user_ids_list))
                conds.append(f"user_id IN ({ph_u})")
                c_params.extend(user_ids_list)
            if branch_ids:
                ph_b = ",".join(["?"] * len(branch_ids))
                conds.append(f"branch_id IN ({ph_b})")
                c_params.extend(branch_ids)
            cursor.execute(f"SELECT id, screenshots_json FROM technical_reports WHERE {' OR '.join(conds)}", tuple(c_params))
            for tr in cursor.fetchall():
                if tr["screenshots_json"]:
                    try:
                        shots = json.loads(tr["screenshots_json"])
                        for s_file in shots:
                            report_files_to_delete.append((tr["id"], s_file))
                    except Exception:
                        pass

    # Outside DB lock: Delete Cloudinary & Object Storage & Local Files
    deleted_files_count = 0

    # A. Submissions Cloudinary files and local folders
    for sub in subs_list:
        s_id = sub["id"]
        for path_key in [sub.get("original_file_path"), sub.get("canonical_pdf_path"), sub.get("annotated_pdf_path")]:
            if path_key:
                try:
                    storage.delete_file(path_key)
                    deleted_files_count += 1
                except Exception as e:
                    logger.warning(f"Failed to delete submission cloud file {path_key}: {e}")

        # Local submission directory
        local_sub_dir = settings.DATA_DIR / "uploads" / "submissions" / s_id
        if local_sub_dir.exists():
            try:
                shutil.rmtree(local_sub_dir, ignore_errors=True)
            except Exception:
                pass

        # Local submission render cache
        render_sub_dir = settings.RENDERS_DIR / f"sub_{s_id}"
        if render_sub_dir.exists():
            try:
                shutil.rmtree(render_sub_dir, ignore_errors=True)
            except Exception:
                pass

        # Local annotated PDF export
        annotated_pdf = settings.EXPORTS_DIR / f"{s_id}_annotated.pdf"
        if annotated_pdf.exists():
            try:
                annotated_pdf.unlink()
            except Exception:
                pass

    # B. Exam Question Papers & Answer Keys
    for ex in exams_list:
        ex_id = ex["id"]
        for art_key in [
            ex.get("question_paper_path"),
            ex.get("answer_key_path"),
            f"exams/{ex_id}/question_paper.pdf",
            f"exams/{ex_id}/answer_key.pdf",
        ]:
            if art_key:
                try:
                    storage.delete_file(art_key)
                    deleted_files_count += 1
                except Exception as e:
                    logger.warning(f"Failed to delete exam cloud file {art_key}: {e}")

        # Local exam directory
        local_exam_dir = settings.UPLOADS_DIR / f"exam_{ex_id}"
        if local_exam_dir.exists():
            try:
                shutil.rmtree(local_exam_dir, ignore_errors=True)
            except Exception:
                pass

        # Local exam renders
        for clean_art in ["question-paper", "answer-key"]:
            r_dir = settings.RENDERS_DIR / f"exam_{ex_id}_{clean_art}"
            if r_dir.exists():
                try:
                    shutil.rmtree(r_dir, ignore_errors=True)
                except Exception:
                    pass

    # C. Technical Report Screenshots
    for rep_id, filename in report_files_to_delete:
        try:
            storage.delete_file(f"reports/{rep_id}/{filename}")
            deleted_files_count += 1
        except Exception:
            pass
        local_rep_file = settings.REPORTS_DIR / filename
        if local_rep_file.exists():
            try:
                local_rep_file.unlink()
            except Exception:
                pass

    # Inside DB lock: Atomic Bottom-Up Cascade Deletion
    with get_db() as conn:
        cursor = conn.cursor()

        # 1. Criterion scores & Answer regions
        if sub_ids_list:
            for i in range(0, len(sub_ids_list), 500):
                chunk = sub_ids_list[i : i + 500]
                ph = ",".join(["?"] * len(chunk))
                cursor.execute(f"""
                    DELETE FROM criterion_scores WHERE answer_id IN (
                        SELECT id FROM answers WHERE submission_id IN ({ph})
                    )
                """, tuple(chunk))
                cursor.execute(f"""
                    DELETE FROM answer_regions WHERE answer_id IN (
                        SELECT id FROM answers WHERE submission_id IN ({ph})
                    )
                """, tuple(chunk))

        # 2. Answers
        _chunked_delete(cursor, "answers", "submission_id", sub_ids_list)

        # 3. Evaluation Queue & Revaluations & Benchmarks
        _chunked_delete(cursor, "evaluation_queue", "submission_id", sub_ids_list)
        _chunked_delete(cursor, "evaluation_queue", "exam_id", exam_ids_list)

        _chunked_delete(cursor, "revaluation_requests", "submission_id", sub_ids_list)
        _chunked_delete(cursor, "revaluation_requests", "exam_id", exam_ids_list)
        _chunked_delete(cursor, "revaluation_requests", "student_id", student_ids)

        _chunked_delete(cursor, "experiment_benchmarks", "submission_id", sub_ids_list)
        _chunked_delete(cursor, "experiment_benchmarks", "exam_id", exam_ids_list)

        # 4. Submissions
        _chunked_delete(cursor, "submissions", "id", sub_ids_list)
        _chunked_delete(cursor, "submissions", "exam_id", exam_ids_list)

        # 5. Rubrics, Windows, Batches association, Telemetry
        _chunked_delete(cursor, "rubric_versions", "exam_id", exam_ids_list)
        _chunked_delete(cursor, "submission_windows", "exam_id", exam_ids_list)
        _chunked_delete(cursor, "submission_windows", "branch_id", branch_ids)

        _chunked_delete(cursor, "exam_batches", "exam_id", exam_ids_list)
        _chunked_delete(cursor, "exam_batches", "batch_id", batch_ids)

        _chunked_delete(cursor, "api_usage_events", "submission_id", sub_ids_list)
        _chunked_delete(cursor, "api_usage_events", "exam_id", exam_ids_list)
        _chunked_delete(cursor, "api_usage_events", "batch_id", batch_ids)

        # 6. Exams
        _chunked_delete(cursor, "exams", "id", exam_ids_list)
        cursor.execute("DELETE FROM exams WHERE institute_id = ?", (institute_id,))
        if branch_ids:
            _chunked_delete(cursor, "exams", "branch_id", branch_ids)

        # 7. Password reset requests & Students & Batches
        _chunked_delete(cursor, "password_reset_requests", "user_id", user_ids_list)
        _chunked_delete(cursor, "password_reset_requests", "student_id", student_ids)
        _chunked_delete(cursor, "password_reset_requests", "branch_id", branch_ids)

        _chunked_delete(cursor, "students", "id", student_ids)
        _chunked_delete(cursor, "students", "batch_id", batch_ids)

        _chunked_delete(cursor, "batches", "id", batch_ids)
        _chunked_delete(cursor, "batches", "branch_id", branch_ids)

        # 8. Push subscriptions, Notifications, Technical reports, Audit logs
        _chunked_delete(cursor, "push_subscriptions", "user_id", user_ids_list)
        _chunked_delete(cursor, "notifications", "user_id", user_ids_list)
        cursor.execute("DELETE FROM notifications WHERE link_url LIKE ?", (f"%{institute_id}%",))
        for ex_id in exam_ids_list:
            cursor.execute("DELETE FROM notifications WHERE link_url LIKE ?", (f"%{ex_id}%",))

        _chunked_delete(cursor, "technical_reports", "user_id", user_ids_list)
        _chunked_delete(cursor, "technical_reports", "branch_id", branch_ids)

        _chunked_delete(cursor, "audit_logs", "user_id", user_ids_list)
        _chunked_delete(cursor, "audit_logs", "submission_id", sub_ids_list)
        _chunked_delete(cursor, "audit_logs", "resource_id", exam_ids_list + branch_ids + [institute_id])

        # 9. Clean ROOT_ADMIN references if any were tied to this institute/branch
        cursor.execute("UPDATE users SET institute_id = NULL, branch_id = NULL WHERE institute_id = ? AND role = 'ROOT_ADMIN'", (institute_id,))
        if branch_ids:
            for b_id in branch_ids:
                cursor.execute("UPDATE users SET institute_id = NULL, branch_id = NULL WHERE branch_id = ? AND role = 'ROOT_ADMIN'", (b_id,))

        # 10. Delete non-ROOT_ADMIN user accounts
        _chunked_delete(cursor, "users", "id", user_ids_list)

        # 11. Subjects, Branches, Institute
        cursor.execute("DELETE FROM subjects WHERE institute_id = ?", (institute_id,))
        _chunked_delete(cursor, "subjects", "branch_id", branch_ids)

        cursor.execute("DELETE FROM branches WHERE institute_id = ?", (institute_id,))
        cursor.execute("DELETE FROM institutes WHERE id = ?", (institute_id,))

    logger.info(
        f"Institute '{inst_name}' ({institute_id}) and all cascaded entities permanently deleted by {current_user.get('email')}."
    )

    return {
        "status": "success",
        "message": f"Institute '{inst_name}' ({inst_code}) and all associated branches, batches, exams, submissions, evaluation scores, and cloud files have been permanently deleted.",
        "institute_id": institute_id,
        "deleted_branches_count": len(branch_ids),
        "deleted_batches_count": len(batch_ids),
        "deleted_exams_count": len(exam_ids_list),
        "deleted_submissions_count": len(subs_list),
        "deleted_students_count": len(student_ids),
        "deleted_users_count": len(user_ids_list),
        "deleted_files_count": deleted_files_count,
    }


