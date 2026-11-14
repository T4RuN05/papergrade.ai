import os
import sys
from sqlalchemy import select, text
from backend.app.db.session import get_session
from backend.app.db.models import Institute, Branch, Batch, Student, User

def run_migration():
    with get_session() as session:
        print("1. Running DDL to add last_roll_sequence column if not exists...")
        session.execute(text("ALTER TABLE branches ADD COLUMN IF NOT EXISTS last_roll_sequence INTEGER NOT NULL DEFAULT 0;"))
        session.commit()

        print("2. Migrating TEST INSTITUTE students...")
        test_branch = session.scalar(
            select(Branch)
            .join(Institute, Branch.institute_id == Institute.id)
            .where(Institute.code == "TEST_INST")
        )
        if test_branch:
            test_batches = session.scalars(select(Batch.id).where(Batch.branch_id == test_branch.id)).all()
            test_students = session.scalars(select(Student).where(Student.batch_id.in_(test_batches))).all()
            print(f"Found {len(test_students)} students in TEST INSTITUTE.")
            for stu in test_students:
                old_roll = stu.roll_number
                try:
                    num = int(old_roll.split("-")[-1])
                except Exception:
                    num = 1
                new_roll = f"TEST_INST-TEST_BVI-{num:03d}"
                stu.roll_number = new_roll
                if stu.user_id:
                    user = session.scalar(select(User).where(User.id == stu.user_id))
                    if user and user.email and "student_c25_bvi_" in user.email:
                        user.email = user.email.replace("student_c25_bvi_", "student_test_inst_test_bvi_")
            test_branch.last_roll_sequence = len(test_students)
            session.commit()
            print(f"Updated TEST INSTITUTE students. Branch last_roll_sequence set to {test_branch.last_roll_sequence}.")

        print("3. Updating CATCH 25 branch sequence...")
        c25_branch = session.scalar(
            select(Branch)
            .join(Institute, Branch.institute_id == Institute.id)
            .where(Institute.code == "C25")
        )
        if c25_branch:
            c25_batches = session.scalars(select(Batch.id).where(Batch.branch_id == c25_branch.id)).all()
            c25_students = session.scalars(select(Student).where(Student.batch_id.in_(c25_batches))).all()
            max_seq = 0
            for stu in c25_students:
                try:
                    num = int(stu.roll_number.split("-")[-1])
                    if num > max_seq:
                        max_seq = num
                except Exception:
                    pass
            c25_branch.last_roll_sequence = max(max_seq, len(c25_students))
            session.commit()
            print(f"CATCH 25 branch last_roll_sequence set to {c25_branch.last_roll_sequence} (Total students: {len(c25_students)}).")

        print("4. Creating unique index on students.roll_number...")
        session.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS idx_students_roll_unique ON students (roll_number);"))
        session.commit()

        print("5. Verification check...")
        rows = session.execute(text("SELECT roll_number, count(*) FROM students GROUP BY roll_number HAVING count(*) > 1;")).fetchall()
        if rows:
            print(f"WARNING: Found duplicate roll numbers: {rows}")
        else:
            total = session.scalar(text("SELECT count(*) FROM students;"))
            print(f"SUCCESS: All {total} students have unique, non-overlapping roll numbers!")

if __name__ == "__main__":
    run_migration()

