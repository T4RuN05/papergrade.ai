from backend.app.db.session import get_session
from backend.app.db.models.tenancy import Student
from backend.app.db.models.grading import Submission

def run():
    test_batch_id = 'batch_097bce23a72e'
    with get_session() as session:
        # 1. Fetch all students in test batch
        students = session.query(Student).filter(Student.batch_id == test_batch_id).all()
        student_by_suffix = {}
        for s in students:
            try:
                suffix = int(s.roll_number.split("-")[-1])
                student_by_suffix[suffix] = s
            except Exception:
                pass

        print(f"Loaded {len(student_by_suffix)} students for test batch {test_batch_id}")

        # 2. Fetch submissions for this test batch
        subs = session.query(Submission).filter(Submission.batch_id == test_batch_id).all()
        print(f"Loaded {len(subs)} submissions for test batch")

        updated = 0
        for sub in subs:
            try:
                suffix = int(sub.roll_number.split("-")[-1])
                if suffix in student_by_suffix:
                    st = student_by_suffix[suffix]
                    sub.roll_number = st.roll_number
                    sub.student_id = st.id
                    sub.student_name = st.full_name
                    updated += 1
            except Exception:
                pass

        session.commit()
        print(f"Successfully linked {updated} submissions to test students in Postgres.")

if __name__ == "__main__":
    run()
