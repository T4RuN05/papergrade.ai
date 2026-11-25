"""Centralized fail-closed tenancy, RBAC ownership, and UTC timestamp utilities."""

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db.models import Batch, Exam, Submission

PROD_INSTITUTE_ID = "inst_e1eeda3473c3"
PROD_BRANCH_ID = "br_c25_acbdd4d8"


def parse_iso_utc(dt_str: Optional[str]) -> Optional[datetime]:
    """Parse an ISO-8601 string into an aware UTC datetime, returning None if empty/invalid."""
    if not dt_str:
        return None
    try:
        clean = str(dt_str).strip()
        if clean.endswith("Z"):
            clean = clean[:-1] + "+00:00"
        dt = datetime.fromisoformat(clean)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def is_exam_published(exam: Any) -> bool:
    """Return True when an Exam ORM object or dict is officially published."""
    if exam is None:
        return False
    if isinstance(exam, dict):
        return bool(
            exam.get("is_published") == 1
            or exam.get("status") == "PUBLISHED"
            or exam.get("lifecycle_status") == "PUBLISHED"
        )
    return bool(
        getattr(exam, "is_published", 0) == 1
        or getattr(exam, "status", None) == "PUBLISHED"
        or getattr(exam, "lifecycle_status", None) == "PUBLISHED"
    )


def verify_staff_exam_scope(
    current_user: Dict[str, Any],
    exam_inst_id: Optional[str],
    exam_branch_id: Optional[str],
    *,
    exam_id: Optional[str] = None,
    allow_sample_read: bool = False,
) -> None:
    """Fail-closed staff tenancy check across ROOT_ADMIN, INSTITUTE_DIRECTOR, BRANCH_MANAGER, and TEACHER."""
    user_role = current_user.get("role")
    if user_role == "ROOT_ADMIN":
        return

    if allow_sample_read and exam_id and str(exam_id).startswith("exam_sample"):
        return

    if user_role == "BRANCH_MANAGER":
        user_branch = current_user.get("branch_id")
        user_inst = current_user.get("institute_id")
        if not user_branch:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Branch assignment missing from credentials.",
            )
        if exam_branch_id != user_branch:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Resource belongs to another branch.",
            )
        if user_inst and exam_inst_id != user_inst:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Resource belongs to another institute.",
            )
        return

    if user_role == "TEACHER":
        user_inst = current_user.get("institute_id")
        user_branch = current_user.get("branch_id")
        if not user_inst and not user_branch:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Institute or branch assignment missing from credentials.",
            )
        if user_inst and exam_inst_id != user_inst:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Resource belongs to another institute.",
            )
        if user_branch and exam_branch_id != user_branch:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Resource belongs to another branch.",
            )
        return

    if user_role == "INSTITUTE_DIRECTOR":
        user_inst = current_user.get("institute_id")
        if not user_inst:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Institute assignment missing from credentials.",
            )
        if exam_inst_id != user_inst:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Resource belongs to another institute.",
            )
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Forbidden: Insufficient role permissions.",
    )


def verify_exam_tenancy(
    exam_id: str,
    current_user: Dict[str, Any],
    db: Session,
    *,
    allow_sample_read: bool = False,
) -> Exam:
    """Load Exam and enforce strict fail-closed tenancy boundaries."""
    exam = db.scalar(select(Exam).where(Exam.id == exam_id))
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found.")

    verify_staff_exam_scope(
        current_user,
        exam.institute_id,
        exam.branch_id,
        exam_id=exam.id,
        allow_sample_read=allow_sample_read,
    )
    return exam


def verify_submission_tenancy(
    submission_id: str,
    current_user: Dict[str, Any],
    db: Session,
) -> str:
    """Enforce compound fail-closed tenancy on submission access/mutations and return parent exam_id."""
    user_role = current_user.get("role")

    row = db.execute(
        select(Submission.id, Submission.exam_id, Exam.institute_id, Exam.branch_id, Batch.branch_id)
        .join(Exam, Submission.exam_id == Exam.id)
        .outerjoin(Batch, Submission.batch_id == Batch.id)
        .where(Submission.id == submission_id)
    ).first()

    if not row:
        raise HTTPException(status_code=404, detail="Submission not found.")

    _, exam_id, exam_inst_id, exam_branch_id, batch_branch_id = row
    if user_role == "ROOT_ADMIN":
        return exam_id

    effective_branch = batch_branch_id or exam_branch_id
    verify_staff_exam_scope(
        current_user,
        exam_inst_id,
        effective_branch,
        exam_id=exam_id,
    )
    return exam_id


def student_owns_submission(
    current_user: Dict[str, Any],
    sub_student_id: Optional[str],
    sub_roll_number: Optional[str],
    db_student_id: Optional[str] = None,
) -> bool:
    """Safely verify student ownership without false positives from None/empty IDs."""
    user_id = str(current_user.get("sub") or "").strip()
    claim_stu_id = str(db_student_id or current_user.get("student_id") or "").strip()
    user_roll = str(current_user.get("roll_number") or "").strip().upper()
    target_roll = str(sub_roll_number or "").strip().upper()
    target_stu = str(sub_student_id or "").strip()

    if user_roll and target_roll and user_roll == target_roll:
        return True
    if target_stu and claim_stu_id and target_stu == claim_stu_id:
        return True
    if target_stu and user_id and target_stu == user_id:
        return True
    return False
