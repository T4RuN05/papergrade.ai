"""
Provision a fresh, unpublished examination with an active OPEN submission window
for Catch 25 Borivali (C25-BVI) students.
"""

import uuid
import json
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.db.session import get_session
from backend.app.db.models.academic import Exam, SubmissionWindow, RubricVersion
from backend.app.db.models.tenancy import Institute, Branch


def create_fresh_exam(title: str = "Rotational Dynamics Mock Exam"):
    now = datetime.now(timezone.utc)
    deadline = now + timedelta(minutes=90)
    grace = deadline + timedelta(minutes=10)

    with get_session() as session:
        inst = session.query(Institute).filter(Institute.code == "C25").first()
        branch = session.query(Branch).filter(Branch.id == "br_28c2a5dfe193").first()

        exam_id = f"exam_{uuid.uuid4().hex[:12]}"

        # Close any prior open windows in Borivali to make this fresh exam the sole primary active exam
        session.query(SubmissionWindow).filter(
            SubmissionWindow.branch_id == "br_28c2a5dfe193",
            SubmissionWindow.status == "OPEN"
        ).update({"status": "CLOSED"})

        new_exam = Exam(
            id=exam_id,
            institute_id=inst.id if inst else "inst_c25",
            branch_id="br_28c2a5dfe193",
            title=title,
            subject="Physics",
            total_marks=50.0,
            status="SCHEDULED",
            lifecycle_status="IN_PROGRESS",
            is_published=0,
            batch_scope="ALL",
            created_at=now.isoformat()
        )
        session.add(new_exam)

        # Rubric
        rubric_payload = {
            "questions": [
                {"question_id": "1", "max_marks": 10.0, "title": "Moment of Inertia Derivation"},
                {"question_id": "2", "max_marks": 10.0, "title": "Torque and Angular Acceleration"},
                {"question_id": "3", "max_marks": 10.0, "title": "Rolling Motion on Incline"},
                {"question_id": "4", "max_marks": 10.0, "title": "Angular Momentum Conservation"},
                {"question_id": "5", "max_marks": 10.0, "title": "Gyroscopic Precession"}
            ]
        }

        rubric = RubricVersion(
            id=f"rub_{uuid.uuid4().hex[:12]}",
            exam_id=exam_id,
            version_num=1,
            is_approved=1,
            rubric_data=json.dumps(rubric_payload),
            created_at=now.isoformat()
        )
        session.add(rubric)

        # Active Submission Window (90 minutes)
        window = SubmissionWindow(
            id=f"win_{uuid.uuid4().hex[:12]}",
            exam_id=exam_id,
            branch_id="br_28c2a5dfe193",
            window_number=1,
            opened_at=now.isoformat(),
            deadline_at=deadline.isoformat(),
            grace_deadline_at=grace.isoformat(),
            status="OPEN",
            reopen_scope="UNSUBMITTED_ONLY",
            created_at=now.isoformat()
        )
        session.add(window)
        session.commit()

        print("=" * 80)
        print("PROVISIONED FRESH EXAM FOR CATCH 25 BORIVALI")
        print("=" * 80)
        print(f"Exam ID       : {exam_id}")
        print(f"Exam Title    : {title}")
        print(f"Branch ID     : br_28c2a5dfe193 (Catch 25 Borivali)")
        print(f"Scope         : ALL batches (CET - 1 included)")
        print(f"Window ID     : {window.id}")
        print(f"Window Status : OPEN")
        print(f"Opened At     : {now.isoformat()}")
        print(f"Deadline At   : {deadline.isoformat()} (Grace: {grace.isoformat()})")
        print("=" * 80)

        return exam_id, title


if __name__ == "__main__":
    create_fresh_exam()
