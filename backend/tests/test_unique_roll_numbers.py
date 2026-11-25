import pytest
from sqlalchemy import select, text
from backend.app.db.session import get_session
from backend.app.db.models import Institute, Branch, Batch, Student, User
from backend.app.routers.tenancy import allocate_next_roll_numbers

def test_atomic_roll_allocation():
    with get_session() as session:
        # Find Catch 25 Borivali branch
        c25_branch = session.scalar(
            select(Branch)
            .join(Institute, Branch.institute_id == Institute.id)
            .where(Institute.code == "C25")
        )
        assert c25_branch is not None
        initial_seq = c25_branch.last_roll_sequence

        # Allocate 3 roll numbers
        allocated = allocate_next_roll_numbers(session, c25_branch.id, count=3)
        assert len(allocated) == 3
        assert allocated[0] == f"C25-BVI-{initial_seq + 1:03d}"
        assert allocated[1] == f"C25-BVI-{initial_seq + 2:03d}"
        assert allocated[2] == f"C25-BVI-{initial_seq + 3:03d}"
        assert c25_branch.last_roll_sequence == initial_seq + 3

        # Restore sequence so we don't pollute the sequence for production
        c25_branch.last_roll_sequence = initial_seq
        session.commit()

def test_unique_roll_numbers_across_database():
    with get_session() as session:
        # Assert no duplicate roll numbers exist anywhere in the database
        rows = session.execute(
            text("SELECT roll_number, count(*) FROM students GROUP BY roll_number HAVING count(*) > 1;")
        ).fetchall()
        assert len(rows) == 0, f"Found duplicate roll numbers: {rows}"

        # Assert TEST INSTITUTE students have TEST_INST prefix
        test_students = session.scalars(
            select(Student)
            .join(Batch, Student.batch_id == Batch.id)
            .join(Branch, Batch.branch_id == Branch.id)
            .join(Institute, Branch.institute_id == Institute.id)
            .where(Institute.code == "TEST_INST")
        ).all()
        for s in test_students:
            assert s.roll_number.startswith("TEST_INST-TEST_BVI")

        # Assert CATCH 25 students have C25 prefix
        c25_students = session.scalars(
            select(Student)
            .join(Batch, Student.batch_id == Batch.id)
            .join(Branch, Batch.branch_id == Branch.id)
            .join(Institute, Branch.institute_id == Institute.id)
            .where(Institute.code == "C25")
        ).all()
        for s in c25_students:
            assert s.roll_number.startswith("C25-BVI-")

