#!/usr/bin/env python3
"""
Physical Answer Sheet Ingestion Tool (Zero-Notification Backfill).

Ingests scanned physical answer sheets into an examination without dispatching
any push notifications or emails to student devices.
"""

import sys
import os
import uuid
import hashlib
import argparse
from pathlib import Path
from datetime import datetime, timezone

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from sqlalchemy import select, func, or_
from backend.app.config import settings
from backend.app.db.session import SessionLocal
from backend.app.db.models import Exam, Student, Submission, User, Batch
from backend.app.services.storage import get_storage_service

# Roster of known failed students from the 15th Nov trial
KNOWN_FAILURES = {
    "C25-BVI-001": "Kavya Dixit",
    "C25-BVI-002": "Prajyod",
    "C25-BVI-003": "Rehaan",
    "C25-BVI-004": "Mubashir",
    "C25-BVI-005": "Vedant",
    "C25-BVI-007": "Archit",
    "C25-BVI-012": "Soham V",
    "C25-BVI-017": "Atharva",
    "C25-BVI-018": "Shaumik",
    "C25-BVI-020": "Piyush Pathi",
    "C25-BVI-028": "Sanskriti Suthar",
    "C25-BVI-039": "Vanshika",
}

def ingest_physical_paper(
    exam_id: str,
    pdf_path: str,
    roll_number: str,
    dry_run: bool = True
) -> dict:
    pdf_file = Path(pdf_path).resolve()
    if not pdf_file.exists():
        raise FileNotFoundError(f"File not found: {pdf_file}")

    clean_roll = roll_number.strip().upper()
    file_bytes = pdf_file.read_bytes()
    file_size = len(file_bytes)
    sha256 = hashlib.sha256(file_bytes).hexdigest()

    # Determine page count via fitz
    import fitz
    doc = fitz.open(str(pdf_file))
    page_count = len(doc)
    doc.close()

    storage = get_storage_service()
    now_iso = datetime.now(timezone.utc).isoformat()
    sub_id = f"sub_{uuid.uuid4().hex[:12]}"
    dest_key = f"submissions/{exam_id}/{clean_roll}/original_{sub_id}.pdf"

    with SessionLocal() as session:
        exam = session.scalar(select(Exam).where(Exam.id == exam_id))
        if not exam:
            raise ValueError(f"Exam '{exam_id}' not found.")

        # Find student record
        student = session.scalar(
            select(Student).where(func.upper(Student.roll_number) == clean_roll)
        )
        if not student:
            # Try finding by name in known failures
            known_name = KNOWN_FAILURES.get(clean_roll, "")
            if known_name:
                student = session.scalar(
                    select(Student).where(Student.full_name.ilike(f"%{known_name}%"))
                )

        student_name = student.full_name if student else KNOWN_FAILURES.get(clean_roll, f"Student {clean_roll}")
        student_id = student.id if student else None
        batch_id = student.batch_id if student else None

        # Check existing submission
        existing = session.scalar(
            select(Submission).where(
                Submission.exam_id == exam_id,
                func.upper(Submission.roll_number) == clean_roll
            )
        )

        print(f"\n[Student Match] Roll: {clean_roll} | Name: {student_name} | ID: {student_id or 'Auto-assign'}")
        print(f"  File: {pdf_file.name} ({page_count} pages, {file_size / 1024:.1f} KB)")
        print(f"  Destination Storage Key: {dest_key}")
        print(f"  Existing Submission: {existing.id if existing else 'None'}")
        print("  NOTIFICATION POLICY: SILENCED (Zero push alerts will be dispatched)")

        if dry_run:
            return {
                "status": "dry_run_ready",
                "roll_number": clean_roll,
                "student_name": student_name,
                "page_count": page_count,
                "file_size": file_size
            }

        # 1. Upload to Cloudinary
        storage.upload_file(file_bytes, dest_key, content_type="application/pdf")
        print(f"  -> Uploaded successfully to storage: {dest_key}")

        # 2. If replacement, mark previous superseded
        if existing:
            existing.status = "SUPERSEDED"
            existing.submission_status = "SUPERSEDED"
            existing.updated_at = now_iso

        # 3. Create Submission record (CRITICAL: Do NOT call send_notification or notify_branch_managers)
        new_sub = Submission(
            id=sub_id,
            batch_id=batch_id,
            exam_id=exam_id,
            student_id=student_id,
            student_name=student_name,
            roll_number=clean_roll,
            original_file_path=dest_key,
            canonical_pdf_path=dest_key,
            page_count=page_count,
            file_size_bytes=file_size,
            sha256_hash=sha256,
            submission_status="SUBMITTED",
            status="UPLOADED",
            publication_status="UNPUBLISHED",
            max_marks=exam.total_marks or 0.0,
            submitted_at=now_iso,
            created_at=now_iso,
            updated_at=now_iso,
        )
        session.add(new_sub)
        session.commit()
        print(f"  -> Saved Submission record '{sub_id}' to database (Zero notifications sent).")

        return {
            "status": "ingested",
            "submission_id": sub_id,
            "roll_number": clean_roll,
            "student_name": student_name,
            "page_count": page_count,
            "file_size": file_size
        }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest physical answer sheet with zero notifications.")
    parser.add_argument("--exam-id", default="exam_2921de155844", help="Target examination ID.")
    parser.add_argument("--pdf", required=True, help="Path to scanned PDF file.")
    parser.add_argument("--roll", required=True, help="Student roll number (e.g. C25-BVI-001).")
    parser.add_argument("--apply", action="store_true", help="Execute database ingestion (default is dry-run).")

    args = parser.parse_args()
    ingest_physical_paper(
        exam_id=args.exam_id,
        pdf_path=args.pdf,
        roll_number=args.roll,
        dry_run=not args.apply
    )
