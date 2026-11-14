import uuid
import random
import io
import json
import shutil
import logging
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, status, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select, func, delete, update, or_
import openpyxl

from backend.app.config import settings
from backend.app.db.session import get_db
from backend.app.db.base import get_iso_now
from backend.app.db.models import (
    Institute,
    Branch,
    Subject,
    Batch,
    Student,
    User,
    Exam,
    ExamBatch,
    SubmissionWindow,
    RubricVersion,
    Submission,
    Answer,
    AnswerRegion,
    CriterionScore,
    EvaluationQueue,
    RevaluationRequest,
    Notification,
    PushSubscription,
    TechnicalReport,
    AuditLog,
    ApiUsageEvent,
    ExperimentBenchmark,
)
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


def generate_unique_student_id_num(db: Session) -> str:
    """Generate a 6-to-8 digit unique numeric student ID for onboarding claims."""
    while True:
        candidate = str(random.randint(100000, 999999))
        exists = db.scalar(select(Student.id).where(Student.student_id_num == candidate))
        if not exists:
            return candidate


def _format_institute_dict(inst: Institute) -> Dict[str, Any]:
    """Helper to convert Institute ORM instance to client-expected dictionary."""
    subs = []
    if inst.subjects:
        try:
            subs = json.loads(inst.subjects)
        except Exception:
            subs = [s.strip() for s in inst.subjects.split(",") if s.strip()]

    is_del = getattr(inst, "is_deleted", 0) == 1
    del_at = getattr(inst, "deleted_at", None)
    recovery_days_left = None
    if is_del and del_at:
        try:
            from datetime import datetime, timezone, timedelta
            del_dt = datetime.fromisoformat(del_at.replace("Z", "+00:00"))
            exp_dt = del_dt + timedelta(days=7)
            diff_days = (exp_dt - datetime.now(timezone.utc)).total_seconds() / 86400.0
            recovery_days_left = max(0.0, round(diff_days, 1))
        except Exception:
            pass

    return {
        "id": inst.id,
        "name": inst.name,
        "code": inst.code,
        "subjects": subs,
        "is_deleted": 1 if is_del else 0,
        "deleted_at": del_at,
        "recovery_days_left": recovery_days_left,
        "created_at": inst.created_at,
    }


def _format_branch_dict(branch: Branch) -> Dict[str, Any]:
    """Helper to convert Branch ORM instance to client-expected dictionary."""
    subs = None
    if branch.subjects:
        try:
            subs = json.loads(branch.subjects)
        except Exception:
            subs = [s.strip() for s in branch.subjects.split(",") if s.strip()]
    return {
        "id": branch.id,
        "institute_id": branch.institute_id,
        "name": branch.name,
        "code": branch.code,
        "city": branch.city,
        "subjects": subs,
        "created_at": branch.created_at,
    }


def _format_batch_dict(batch: Batch) -> Dict[str, Any]:
    """Helper to convert Batch ORM instance to client-expected dictionary."""
    return {
        "id": batch.id,
        "branch_id": batch.branch_id,
        "exam_id": batch.exam_id,
        "name": batch.name,
        "code": batch.code,
        "academic_year": batch.academic_year,
        "status": batch.status,
        "total_submissions": batch.total_submissions,
        "completed_submissions": batch.completed_submissions,
        "failed_submissions": batch.failed_submissions,
        "created_at": batch.created_at,
        "updated_at": batch.updated_at,
    }


def _format_student_dict(student: Student) -> Dict[str, Any]:
    """Helper to convert Student ORM instance to client-expected dictionary."""
    result = {
        "id": student.id,
        "batch_id": student.batch_id,
        "user_id": student.user_id,
        "roll_number": student.roll_number,
        "full_name": student.full_name,
        "email": student.email,
        "phone": student.phone,
        "account_claimed": student.account_claimed,
        "claimed_at": student.claimed_at,
        "created_at": student.created_at,
    }
    if not student.account_claimed:
        result["student_id_num"] = student.student_id_num
    return result


@router.get("/institutes")
def list_institutes(
    include_deleted: bool = Query(False, description="Whether to include soft-deleted institutes in trash (Root Admin only)"),
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_role = current_user.get("role")
    if user_role == "ROOT_ADMIN":
        stmt = select(Institute).order_by(Institute.created_at.desc())
        if not include_deleted:
            stmt = stmt.where(Institute.is_deleted == 0)
        institutes = db.scalars(stmt).all()
    elif user_role in ["BRANCH_MANAGER", "INSTITUTE_DIRECTOR"]:
        inst_id = current_user.get("institute_id")
        if not inst_id and current_user.get("branch_id"):
            branch = db.scalar(select(Branch).where(Branch.id == current_user["branch_id"]))
            if branch:
                inst_id = branch.institute_id
        if inst_id:
            institutes = db.scalars(select(Institute).where(Institute.id == inst_id, Institute.is_deleted == 0)).all()
        else:
            institutes = []
    else:
        return []

    return [_format_institute_dict(inst) for inst in institutes]


@router.post("/institutes")
def create_institute(
    req: CreateInstituteRequest,
    current_user: Dict[str, Any] = Depends(require_root_admin),
    db: Session = Depends(get_db)
):
    clean_code = req.code.strip().upper()
    existing = db.scalar(select(Institute.id).where(func.upper(Institute.code) == clean_code))
    if existing:
        raise HTTPException(status_code=400, detail="Institute code already exists.")

    inst_id = f"inst_{uuid.uuid4().hex[:12]}"
    now = get_iso_now()

    clean_subjects = [s.strip() for s in (req.subjects or []) if s.strip()]
    if not clean_subjects:
        clean_subjects = ["Physics", "Chemistry", "Maths", "Biology"]
    subjects_json = json.dumps(clean_subjects)

    inst = Institute(
        id=inst_id,
        name=req.name.strip(),
        code=clean_code,
        subjects=subjects_json,
        created_at=now,
    )
    db.add(inst)

    for s_name in clean_subjects:
        s_id = f"sub_{uuid.uuid4().hex[:12]}"
        subj = Subject(
            id=s_id,
            institute_id=inst_id,
            branch_id=None,
            name=s_name,
            code=s_name[:4].upper(),
            created_at=now,
        )
        db.add(subj)

    db.commit()

    return {
        "status": "success",
        "id": inst_id,
        "name": req.name,
        "code": clean_code,
        "subjects": clean_subjects,
    }


@router.get("/subjects")
def list_subjects(
    branch_id: Optional[str] = None,
    institute_id: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    eff_branch = branch_id or current_user.get("branch_id")
    eff_inst = institute_id or current_user.get("institute_id")

    if eff_branch and not eff_inst:
        br = db.scalar(select(Branch).where(Branch.id == eff_branch))
        if br and br.institute_id:
            eff_inst = br.institute_id

    subjects_set = set()
    subjects_ordered = []

    def add_subject(s: str):
        clean = s.strip()
        if clean and clean.lower() not in subjects_set:
            subjects_set.add(clean.lower())
            subjects_ordered.append(clean)

    # 1. Query branches.subjects
    if eff_branch:
        br = db.scalar(select(Branch).where(Branch.id == eff_branch))
        if br and br.subjects:
            try:
                for s in json.loads(br.subjects):
                    add_subject(str(s))
            except Exception:
                for s in str(br.subjects).split(","):
                    add_subject(s)

    # 2. Query institutes.subjects
    if eff_inst:
        inst = db.scalar(select(Institute).where(Institute.id == eff_inst))
        if inst and inst.subjects:
            try:
                for s in json.loads(inst.subjects):
                    add_subject(str(s))
            except Exception:
                for s in str(inst.subjects).split(","):
                    add_subject(s)

    # 3. Query subjects table
    if eff_branch or eff_inst:
        conds = []
        if eff_branch:
            conds.append(Subject.branch_id == eff_branch)
        if eff_inst:
            conds.append(Subject.institute_id == eff_inst)
        rows = db.scalars(select(Subject.name).where(or_(*conds)).order_by(Subject.name.asc())).all()
        for r_name in rows:
            add_subject(r_name)

    # 4. Check exams table
    if eff_branch or eff_inst:
        exam_stmt = select(Exam.subject).where(Exam.subject.isnot(None))
        if eff_branch:
            exam_stmt = exam_stmt.where(Exam.branch_id == eff_branch)
        else:
            exam_stmt = exam_stmt.where(Exam.institute_id == eff_inst)
        exam_subjects = db.scalars(exam_stmt).all()
        for ex_subj in exam_subjects:
            if ex_subj:
                add_subject(ex_subj)

    # Fallback if none found
    if not subjects_ordered:
        for d in ["Physics", "Chemistry", "Maths", "Biology"]:
            add_subject(d)

    return subjects_ordered


@router.post("/institutes/{institute_id}/subjects")
def add_institute_subjects(
    institute_id: str,
    req: AddSubjectsRequest,
    current_user: Dict[str, Any] = Depends(require_root_admin),
    db: Session = Depends(get_db)
):
    inst = db.scalar(select(Institute).where(Institute.id == institute_id))
    if not inst:
        raise HTTPException(status_code=404, detail="Institute not found")

    current_subs: List[str] = []
    if inst.subjects:
        try:
            current_subs = json.loads(inst.subjects)
        except Exception:
            current_subs = [s.strip() for s in inst.subjects.split(",") if s.strip()]

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
            db.add(Subject(
                id=s_id,
                institute_id=institute_id,
                branch_id=None,
                name=clean,
                code=clean[:4].upper(),
                created_at=now,
            ))

    new_json = json.dumps(current_subs)
    inst.subjects = new_json

    # Propagate to branches under this institute that don't have subjects
    branches = db.scalars(select(Branch).where(Branch.institute_id == institute_id)).all()
    for b in branches:
        if not b.subjects or b.subjects == "[]":
            b.subjects = new_json

    db.commit()
    return {"status": "success", "subjects": current_subs, "added": added}


def _verify_branch_access(db: Session, current_user: Dict[str, Any], branch_id: Optional[str]) -> bool:
    """Check whether current_user is authorized to operate on branch_id."""
    if not branch_id:
        return True
    role = current_user.get("role")
    if role == "ROOT_ADMIN":
        return True
    if role == "BRANCH_MANAGER":
        return current_user.get("branch_id") == branch_id
    if role == "INSTITUTE_DIRECTOR":
        inst_id = current_user.get("institute_id")
        br = db.scalar(select(Branch).where(Branch.id == branch_id))
        return bool(br and br.institute_id == inst_id)
    return False

def _verify_batch_access(db: Session, current_user: Dict[str, Any], batch: Optional[Batch]) -> bool:
    """Check whether current_user is authorized to operate on batch."""
    if not batch:
        return False
    return _verify_branch_access(db, current_user, batch.branch_id)


@router.get("/branches")
def list_branches(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_role = current_user["role"]
    if user_role == "ROOT_ADMIN":
        branches = db.scalars(select(Branch).order_by(Branch.name.asc())).all()
    elif user_role == "INSTITUTE_DIRECTOR":
        inst_id = current_user.get("institute_id")
        branches = db.scalars(
            select(Branch).where(Branch.institute_id == inst_id).order_by(Branch.name.asc())
        ).all()
    else:
        branch_id = current_user.get("branch_id")
        branches = db.scalars(select(Branch).where(Branch.id == branch_id)).all()

    return [_format_branch_dict(b) for b in branches]


@router.post("/branches")
def create_branch(
    req: CreateBranchRequest,
    current_user: Dict[str, Any] = Depends(require_root_admin),
    db: Session = Depends(get_db)
):
    clean_code = req.code.strip().upper()
    branch_id = f"br_{uuid.uuid4().hex[:12]}"
    now = get_iso_now()

    branch = Branch(
        id=branch_id,
        institute_id=req.institute_id,
        name=req.name.strip(),
        code=clean_code,
        city=req.city.strip(),
        created_at=now,
    )
    db.add(branch)
    db.commit()

    return {"status": "success", "id": branch_id, "name": req.name, "code": clean_code}


@router.get("/batches")
def list_batches(
    branch_id: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_role = current_user["role"]
    if user_role == "BRANCH_MANAGER":
        user_branch = current_user.get("branch_id")
        batches = db.scalars(
            select(Batch).where(Batch.branch_id == user_branch).order_by(Batch.created_at.desc())
        ).all()
    elif user_role == "INSTITUTE_DIRECTOR":
        inst_id = current_user.get("institute_id")
        inst_branches = select(Branch.id).where(Branch.institute_id == inst_id)
        stmt = select(Batch).where(Batch.branch_id.in_(inst_branches))
        if branch_id:
            stmt = stmt.where(Batch.branch_id == branch_id)
        batches = db.scalars(stmt.order_by(Batch.created_at.desc())).all()
    else:
        stmt = select(Batch)
        if branch_id:
            stmt = stmt.where(Batch.branch_id == branch_id)
        batches = db.scalars(stmt.order_by(Batch.created_at.desc())).all()

    return [_format_batch_dict(b) for b in batches]


@router.post("/batches")
def create_batch(
    req: CreateBatchRequest,
    current_user: Dict[str, Any] = Depends(require_branch_manager),
    db: Session = Depends(get_db)
):
    # Check tenant isolation
    if not _verify_branch_access(db, current_user, req.branch_id):
        raise HTTPException(status_code=403, detail="Cannot create batches outside your branch/institute scope.")

    batch_id = f"batch_{uuid.uuid4().hex[:12]}"
    now = get_iso_now()

    batch = Batch(
        id=batch_id,
        branch_id=req.branch_id,
        exam_id=req.exam_id or None,
        name=req.name.strip(),
        code=req.code.strip().upper(),
        academic_year=req.academic_year,
        created_at=now,
        updated_at=now,
    )
    db.add(batch)
    db.commit()

    return {"status": "success", "id": batch_id, "name": req.name, "code": req.code}


@router.get("/batches/{batch_id}/students")
def list_students_in_batch(
    batch_id: str,
    current_user: Dict[str, Any] = Depends(require_branch_manager),
    db: Session = Depends(get_db)
):
    # Verify branch/institute scope
    b = db.scalar(select(Batch).where(Batch.id == batch_id))
    if not b:
        raise HTTPException(status_code=404, detail="Batch not found")
    if not _verify_batch_access(db, current_user, b):
        raise HTTPException(status_code=403, detail="Forbidden: batch belongs to another branch/institute.")

    students = db.scalars(
        select(Student).where(Student.batch_id == batch_id).order_by(Student.roll_number.asc())
    ).all()
    return [_format_student_dict(s) for s in students]


@router.post("/batches/{batch_id}/students")
def add_single_student(
    batch_id: str,
    req: CreateStudentRequest,
    current_user: Dict[str, Any] = Depends(require_branch_manager),
    db: Session = Depends(get_db)
):
    clean_roll = req.roll_number.strip().upper()

    # Verify batch exists and branch access
    batch = db.scalar(select(Batch).where(Batch.id == batch_id))
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if not _verify_batch_access(db, current_user, batch):
        raise HTTPException(status_code=403, detail="Forbidden: batch belongs to another branch/institute.")

    # Check duplicate roll number in batch
    existing = db.scalar(
        select(Student.id).where(Student.batch_id == batch_id, func.upper(Student.roll_number) == clean_roll)
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Student with roll number '{clean_roll}' already exists in this batch."
        )

    student_id = f"stu_{uuid.uuid4().hex[:12]}"
    student_id_num = generate_unique_student_id_num(db)
    now = get_iso_now()

    student = Student(
        id=student_id,
        batch_id=batch_id,
        student_id_num=student_id_num,
        roll_number=clean_roll,
        full_name=req.full_name.strip(),
        email=req.email,
        phone=req.phone,
        account_claimed=0,
        created_at=now,
    )
    db.add(student)

    # Increment batch total
    batch.total_submissions = (batch.total_submissions or 0) + 1
    batch.updated_at = now

    db.commit()

    return {
        "status": "success",
        "id": student_id,
        "student_id_num": student_id_num,
        "roll_number": clean_roll,
        "full_name": req.full_name,
    }


@router.post("/batches/{batch_id}/import-students")
async def import_students_excel(
    batch_id: str,
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(require_branch_manager),
    db: Session = Depends(get_db)
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

    batch = db.scalar(select(Batch).where(Batch.id == batch_id))
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if not _verify_batch_access(db, current_user, batch):
        raise HTTPException(status_code=403, detail="Forbidden: batch belongs to another branch/institute.")

    rows = list(sheet.iter_rows(values_only=True))
    if len(rows) < 2:
        raise HTTPException(status_code=400, detail="Excel file is empty or has no data rows.")

    header = [str(c).strip().lower() for c in rows[0] if c is not None]

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
        exists = db.scalar(
            select(Student.id).where(Student.batch_id == batch_id, func.upper(Student.roll_number) == roll_number)
        )
        if exists:
            skipped_duplicates.append(roll_number)
            continue

        student_id = f"stu_{uuid.uuid4().hex[:12]}"
        student_id_num = generate_unique_student_id_num(db)

        student = Student(
            id=student_id,
            batch_id=batch_id,
            student_id_num=student_id_num,
            roll_number=roll_number,
            full_name=full_name,
            email=email,
            phone=phone,
            account_claimed=0,
            created_at=now,
        )
        db.add(student)

        imported_students.append({
            "student_id": student_id,
            "student_id_num": student_id_num,
            "roll_number": roll_number,
            "full_name": full_name,
        })

    # Update batch total count
    batch.total_submissions = (batch.total_submissions or 0) + len(imported_students)
    batch.updated_at = now

    db.commit()

    return {
        "status": "success",
        "batch_id": batch_id,
        "imported_count": len(imported_students),
        "skipped_duplicates_count": len(skipped_duplicates),
        "skipped_duplicates": skipped_duplicates,
        "students": imported_students,
    }


@router.delete("/batches/{batch_id}")
def delete_batch(
    batch_id: str,
    current_user: Dict[str, Any] = Depends(require_branch_manager),
    db: Session = Depends(get_db)
):
    batch = db.scalar(select(Batch).where(Batch.id == batch_id))
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if not _verify_batch_access(db, current_user, batch):
        raise HTTPException(status_code=403, detail="Forbidden: batch belongs to another branch/institute.")

    db.delete(batch)
    db.commit()
    return {"status": "success", "message": "Batch deleted successfully"}


@router.delete("/batches/{batch_id}/students/{student_id}")
def delete_student_from_batch(
    batch_id: str,
    student_id: str,
    current_user: Dict[str, Any] = Depends(require_branch_manager),
    db: Session = Depends(get_db)
):
    batch = db.scalar(select(Batch).where(Batch.id == batch_id))
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if not _verify_batch_access(db, current_user, batch):
        raise HTTPException(status_code=403, detail="Forbidden: batch belongs to another branch/institute.")

    student = db.scalar(select(Student).where(Student.id == student_id, Student.batch_id == batch_id))
    if student:
        db.delete(student)
        db.commit()

    return {"status": "success", "message": "Student removed successfully"}


def _chunked_delete_orm(db: Session, model, column, ids: List[str], chunk_size: int = 500):
    """Helper to safely execute DELETE queries in chunks."""
    if not ids:
        return
    for i in range(0, len(ids), chunk_size):
        chunk = ids[i : i + chunk_size]
        db.execute(delete(model).where(column.in_(chunk)))


def purge_institute_cascade(
    db: Session,
    institute_id: str,
    caller_email: Optional[str] = None
) -> Dict[str, Any]:
    """
    Permanently delete an entire coaching institute and cascade delete everything under it:
    - Branches and Subjects
    - Batches and Students
    - Staff/Branch Manager and Student user accounts (strictly excludes ROOT_ADMIN)
    - Exams, Exam Batches, Submission Windows, Rubrics
    - Submissions, Answers, Criterion Scores, Answer Regions, Evaluation Queue, Revaluations
    - Cloudinary and Object Storage assets
    """
    storage = get_storage_service()

    # 1. Verify institute exists
    inst = db.scalar(select(Institute).where(Institute.id == institute_id))
    if not inst:
        raise HTTPException(status_code=404, detail="Institute not found")
    inst_name = inst.name
    inst_code = inst.code

    # 2. Collect Branch IDs
    branch_ids = db.scalars(select(Branch.id).where(Branch.institute_id == institute_id)).all()

    # 3. Collect Batch IDs
    batch_ids = []
    if branch_ids:
        batch_ids = db.scalars(select(Batch.id).where(Batch.branch_id.in_(branch_ids))).all()

    # 4. Collect Exams
    exam_ids_set = set()
    exams_list = []

    inst_exams = db.scalars(select(Exam).where(Exam.institute_id == institute_id)).all()
    for ex in inst_exams:
        exam_ids_set.add(ex.id)
        exams_list.append({
            "id": ex.id,
            "title": ex.title,
            "question_paper_path": ex.question_paper_path,
            "answer_key_path": ex.answer_key_path,
        })

    if branch_ids:
        br_exams = db.scalars(select(Exam).where(Exam.branch_id.in_(branch_ids))).all()
        for ex in br_exams:
            if ex.id not in exam_ids_set:
                exam_ids_set.add(ex.id)
                exams_list.append({
                    "id": ex.id,
                    "title": ex.title,
                    "question_paper_path": ex.question_paper_path,
                    "answer_key_path": ex.answer_key_path,
                })

    if batch_ids:
        linked_exam_ids = db.scalars(
            select(ExamBatch.exam_id).where(ExamBatch.batch_id.in_(batch_ids)).distinct()
        ).all()
        new_linked = [eid for eid in linked_exam_ids if eid not in exam_ids_set]
        if new_linked:
            additional_exams = db.scalars(select(Exam).where(Exam.id.in_(new_linked))).all()
            for ex in additional_exams:
                if ex.id not in exam_ids_set:
                    exam_ids_set.add(ex.id)
                    exams_list.append({
                        "id": ex.id,
                        "title": ex.title,
                        "question_paper_path": ex.question_paper_path,
                        "answer_key_path": ex.answer_key_path,
                    })

    exam_ids_list = list(exam_ids_set)

    # 5. Collect Students & user IDs
    student_ids = []
    student_user_ids = []
    if batch_ids:
        stu_records = db.execute(
            select(Student.id, Student.user_id).where(Student.batch_id.in_(batch_ids))
        ).all()
        for s_id, u_id in stu_records:
            student_ids.append(s_id)
            if u_id:
                student_user_ids.append(u_id)

    # 6. Collect Submissions
    sub_ids_set = set()
    subs_list = []

    def _add_submissions(submissions_query_res):
        for sub in submissions_query_res:
            if sub.id not in sub_ids_set:
                sub_ids_set.add(sub.id)
                subs_list.append({
                    "id": sub.id,
                    "exam_id": sub.exam_id,
                    "original_file_path": sub.original_file_path,
                    "canonical_pdf_path": sub.canonical_pdf_path,
                    "annotated_pdf_path": sub.annotated_pdf_path,
                })

    if exam_ids_list:
        _add_submissions(db.scalars(select(Submission).where(Submission.exam_id.in_(exam_ids_list))).all())

    if batch_ids:
        _add_submissions(db.scalars(select(Submission).where(Submission.batch_id.in_(batch_ids))).all())

    if student_ids:
        _add_submissions(db.scalars(select(Submission).where(Submission.student_id.in_(student_ids))).all())

    sub_ids_list = list(sub_ids_set)

    # 7. Collect User Accounts to delete (STRICTLY exclude ROOT_ADMIN)
    user_ids_to_delete = set()
    for u in db.scalars(select(User).where(User.institute_id == institute_id)).all():
        if u.role != "ROOT_ADMIN":
            user_ids_to_delete.add(u.id)

    if branch_ids:
        for u in db.scalars(select(User).where(User.branch_id.in_(branch_ids))).all():
            if u.role != "ROOT_ADMIN":
                user_ids_to_delete.add(u.id)

    for u_id in student_user_ids:
        u = db.scalar(select(User).where(User.id == u_id))
        if u and u.role != "ROOT_ADMIN":
            user_ids_to_delete.add(u.id)

    user_ids_list = list(user_ids_to_delete)

    # 8. Technical report screenshots
    report_files_to_delete = []
    tr_conds = []
    if user_ids_list:
        tr_conds.append(TechnicalReport.user_id.in_(user_ids_list))
    if branch_ids:
        tr_conds.append(TechnicalReport.branch_id.in_(branch_ids))
    if tr_conds:
        for tr in db.scalars(select(TechnicalReport).where(or_(*tr_conds))).all():
            if tr.screenshots_json:
                try:
                    shots = json.loads(tr.screenshots_json)
                    for s_file in shots:
                        report_files_to_delete.append((tr.id, s_file))
                except Exception:
                    pass

    # Delete storage assets outside DB transaction
    deleted_files_count = 0
    for sub in subs_list:
        s_id = sub["id"]
        for path_key in [sub.get("original_file_path"), sub.get("canonical_pdf_path"), sub.get("annotated_pdf_path")]:
            if path_key:
                try:
                    storage.delete_file(path_key)
                    deleted_files_count += 1
                except Exception as e:
                    logger.warning(f"Failed to delete submission cloud file {path_key}: {e}")

        local_sub_dir = settings.DATA_DIR / "uploads" / "submissions" / s_id
        if local_sub_dir.exists():
            shutil.rmtree(local_sub_dir, ignore_errors=True)
        render_sub_dir = settings.RENDERS_DIR / f"sub_{s_id}"
        if render_sub_dir.exists():
            shutil.rmtree(render_sub_dir, ignore_errors=True)
        annotated_pdf = settings.EXPORTS_DIR / f"{s_id}_annotated.pdf"
        if annotated_pdf.exists():
            try:
                annotated_pdf.unlink()
            except Exception:
                pass

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

        local_exam_dir = settings.UPLOADS_DIR / f"exam_{ex_id}"
        if local_exam_dir.exists():
            shutil.rmtree(local_exam_dir, ignore_errors=True)
        for clean_art in ["question-paper", "answer-key"]:
            r_dir = settings.RENDERS_DIR / f"exam_{ex_id}_{clean_art}"
            if r_dir.exists():
                shutil.rmtree(r_dir, ignore_errors=True)

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

    # Atomic bottom-up cascade deletion via ORM
    if sub_ids_list:
        ans_ids = db.scalars(select(Answer.id).where(Answer.submission_id.in_(sub_ids_list))).all()
        if ans_ids:
            _chunked_delete_orm(db, CriterionScore, CriterionScore.answer_id, ans_ids)
            _chunked_delete_orm(db, AnswerRegion, AnswerRegion.answer_id, ans_ids)
        _chunked_delete_orm(db, Answer, Answer.submission_id, sub_ids_list)

    if sub_ids_list:
        _chunked_delete_orm(db, EvaluationQueue, EvaluationQueue.submission_id, sub_ids_list)
        _chunked_delete_orm(db, RevaluationRequest, RevaluationRequest.submission_id, sub_ids_list)
        _chunked_delete_orm(db, ExperimentBenchmark, ExperimentBenchmark.submission_id, sub_ids_list)
        _chunked_delete_orm(db, ApiUsageEvent, ApiUsageEvent.submission_id, sub_ids_list)
        _chunked_delete_orm(db, Submission, Submission.id, sub_ids_list)

    if exam_ids_list:
        _chunked_delete_orm(db, EvaluationQueue, EvaluationQueue.exam_id, exam_ids_list)
        _chunked_delete_orm(db, RevaluationRequest, RevaluationRequest.exam_id, exam_ids_list)
        _chunked_delete_orm(db, ExperimentBenchmark, ExperimentBenchmark.exam_id, exam_ids_list)
        _chunked_delete_orm(db, ApiUsageEvent, ApiUsageEvent.exam_id, exam_ids_list)
        _chunked_delete_orm(db, Submission, Submission.exam_id, exam_ids_list)
        _chunked_delete_orm(db, RubricVersion, RubricVersion.exam_id, exam_ids_list)
        _chunked_delete_orm(db, SubmissionWindow, SubmissionWindow.exam_id, exam_ids_list)
        _chunked_delete_orm(db, ExamBatch, ExamBatch.exam_id, exam_ids_list)
        _chunked_delete_orm(db, Exam, Exam.id, exam_ids_list)

    if branch_ids:
        _chunked_delete_orm(db, SubmissionWindow, SubmissionWindow.branch_id, branch_ids)
        _chunked_delete_orm(db, Exam, Exam.branch_id, branch_ids)

    if batch_ids:
        _chunked_delete_orm(db, ExamBatch, ExamBatch.batch_id, batch_ids)
        _chunked_delete_orm(db, ApiUsageEvent, ApiUsageEvent.batch_id, batch_ids)
        _chunked_delete_orm(db, Student, Student.batch_id, batch_ids)
        _chunked_delete_orm(db, Batch, Batch.id, batch_ids)

    if student_ids:
        _chunked_delete_orm(db, RevaluationRequest, RevaluationRequest.student_id, student_ids)
        _chunked_delete_orm(db, Student, Student.id, student_ids)

    if user_ids_list:
        from backend.app.db.models.auth import PasswordResetRequest
        _chunked_delete_orm(db, PasswordResetRequest, PasswordResetRequest.user_id, user_ids_list)
        _chunked_delete_orm(db, PushSubscription, PushSubscription.user_id, user_ids_list)
        _chunked_delete_orm(db, Notification, Notification.user_id, user_ids_list)
        _chunked_delete_orm(db, TechnicalReport, TechnicalReport.user_id, user_ids_list)
        _chunked_delete_orm(db, AuditLog, AuditLog.user_id, user_ids_list)

    if branch_ids:
        _chunked_delete_orm(db, TechnicalReport, TechnicalReport.branch_id, branch_ids)

    # Detach ROOT_ADMIN references if tied to institute/branch
    db.execute(
        update(User)
        .where(User.institute_id == institute_id, User.role == "ROOT_ADMIN")
        .values(institute_id=None, branch_id=None)
    )
    if branch_ids:
        db.execute(
            update(User)
            .where(User.branch_id.in_(branch_ids), User.role == "ROOT_ADMIN")
            .values(institute_id=None, branch_id=None)
        )

    # Delete non-root users
    if user_ids_list:
        _chunked_delete_orm(db, User, User.id, user_ids_list)

    # Delete subjects, branches, and institute
    db.execute(delete(Subject).where(Subject.institute_id == institute_id))
    if branch_ids:
        db.execute(delete(Subject).where(Subject.branch_id.in_(branch_ids)))
        db.execute(delete(Branch).where(Branch.id.in_(branch_ids)))

    db.delete(inst)
    db.commit()

    by_who = caller_email or "System/RetentionDaemon"
    logger.info(
        f"Institute '{inst_name}' ({institute_id}) and all cascaded entities permanently deleted by {by_who}."
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


@router.delete("/institutes/{institute_id}")
def delete_institute(
    institute_id: str,
    permanent: bool = Query(False, description="Set to true to permanently delete immediately, bypassing 7-day recovery grace period"),
    current_user: Dict[str, Any] = Depends(require_root_admin),
    db: Session = Depends(get_db)
):
    """
    Delete an institute.
    By default (permanent=False), soft-deletes the institute for 7 days.
    If permanent=True, permanently purges the institute and all its cascaded entities.
    """
    inst = db.scalar(select(Institute).where(Institute.id == institute_id))
    if not inst:
        raise HTTPException(status_code=404, detail="Institute not found")

    if permanent:
        return purge_institute_cascade(db, institute_id, caller_email=current_user.get("email"))

    now = get_iso_now()
    inst.is_deleted = 1
    inst.deleted_at = now
    db.commit()

    logger.info(f"Institute '{inst.name}' ({institute_id}) soft-deleted by {current_user.get('email')} (7-day recovery grace period).")
    return {
        "status": "soft_deleted",
        "message": f"Institute '{inst.name}' ({inst.code}) has been soft-deleted. It can be recovered within 7 days, after which it will be permanently deleted.",
        "institute_id": institute_id,
        "deleted_at": now,
        "recovery_window_days": 7
    }


@router.post("/institutes/{institute_id}/restore")
def restore_institute(
    institute_id: str,
    current_user: Dict[str, Any] = Depends(require_root_admin),
    db: Session = Depends(get_db)
):
    """Restore a soft-deleted institute within the 7-day recovery grace period."""
    inst = db.scalar(select(Institute).where(Institute.id == institute_id))
    if not inst:
        raise HTTPException(status_code=404, detail="Institute not found")

    if not inst.is_deleted:
        return {
            "status": "already_active",
            "message": f"Institute '{inst.name}' is already active.",
            "institute": _format_institute_dict(inst)
        }

    inst.is_deleted = 0
    inst.deleted_at = None
    db.commit()

    logger.info(f"Institute '{inst.name}' ({institute_id}) restored by {current_user.get('email')}.")
    return {
        "status": "restored",
        "message": f"Institute '{inst.name}' ({inst.code}) has been restored successfully.",
        "institute": _format_institute_dict(inst)
    }
