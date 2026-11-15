import uuid
import openpyxl
from datetime import datetime, timezone
from backend.app.db.session import get_session
from backend.app.db.models import Institute, Branch, Batch, Student, User, Subject
from backend.app.services.auth import hash_password
from sqlalchemy import select, delete, text

def get_iso_now():
    return datetime.now(timezone.utc).isoformat()

def restore_canonical_seed():
    now = get_iso_now()
    default_pass = hash_password("Student@123")

    with get_session() as session:
        print("1. Bulk cleaning leaked test entities via SQL...")
        # Clean notifications for test users (strictly exclude canonical seed users)
        session.execute(text("""
            DELETE FROM notifications WHERE user_id IN (
                SELECT id FROM users WHERE (
                    email LIKE 'user_stu_%' OR 
                    email LIKE 'student_%@papergrade.local' OR 
                    email LIKE 'mgr.%@papergrade.ai' OR 
                    email LIKE 'manager.%@papergrade.ai'
                ) AND email != 'admin@papergrade.ai' 
                  AND id != 'usr_admin_root' 
                  AND id NOT LIKE 'usr_test_bvi_%'
            );
        """))
        session.execute(text("""
            DELETE FROM password_reset_requests WHERE user_id IN (
                SELECT id FROM users WHERE (
                    email LIKE 'user_stu_%' OR 
                    email LIKE 'student_%@papergrade.local' OR 
                    email LIKE 'mgr.%@papergrade.ai' OR 
                    email LIKE 'manager.%@papergrade.ai'
                ) AND email != 'admin@papergrade.ai' 
                  AND id != 'usr_admin_root' 
                  AND id NOT LIKE 'usr_test_bvi_%'
            );
        """))
        res_u = session.execute(text("""
            DELETE FROM users WHERE (
                email LIKE 'user_stu_%' OR 
                email LIKE 'student_%@papergrade.local' OR 
                email LIKE 'mgr.%@papergrade.ai' OR 
                email LIKE 'manager.%@papergrade.ai'
            ) AND email != 'admin@papergrade.ai' 
              AND id != 'usr_admin_root' 
              AND id NOT LIKE 'usr_test_bvi_%';
        """))
        session.commit()
        print(f"Purged leaked ephemeral test users.")

        print("2. Restoring CATCH 25 Institute & Borivali Branch...")
        c25 = session.scalar(select(Institute).where(Institute.code == "C25"))
        if not c25:
            c25 = Institute(
                id="inst_e1eeda3473c3",
                name="CATCH 25",
                code="C25",
                subjects='["Physics", "Chemistry", "Maths", "Biology"]',
                is_deleted=0,
                created_at=now
            )
            session.add(c25)
            session.commit()

        c25_branch = session.scalar(select(Branch).where(Branch.institute_id == c25.id))
        if not c25_branch:
            c25_branch = Branch(
                id="br_c25_acbdd4d8",
                institute_id=c25.id,
                name="Borivali",
                code="BVI",
                city="Mumbai",
                subjects='["Physics", "Chemistry", "Maths", "Biology"]',
                last_roll_sequence=41,
                created_at=now
            )
            session.add(c25_branch)
            session.commit()
        else:
            c25_branch.last_roll_sequence = 41
            session.commit()

        # Batches for CATCH 25
        b1 = session.scalar(select(Batch).where(Batch.branch_id == c25_branch.id, Batch.name == "12th CET-1"))
        if not b1:
            b1 = Batch(
                id="batch_c25_12cet1",
                branch_id=c25_branch.id,
                name="12th CET-1",
                academic_year="2026",
                status="ACTIVE",
                total_submissions=0,
                created_at=now,
                updated_at=now
            )
            session.add(b1)
            session.commit()

        b2 = session.scalar(select(Batch).where(Batch.branch_id == c25_branch.id, Batch.name == "12th CET-2"))
        if not b2:
            b2 = Batch(
                id="batch_c25_12cet2",
                branch_id=c25_branch.id,
                name="12th CET-2",
                academic_year="2026",
                status="ACTIVE",
                total_submissions=0,
                created_at=now,
                updated_at=now
            )
            session.add(b2)
            session.commit()

        # Load 41 students for 12th CET-1
        wb = openpyxl.load_workbook(r"outputs\student-credentials-catch25-borivali-12th-cet1\student-credentials.xlsx")
        ws = wb.active
        existing_rolls = set(session.scalars(select(Student.roll_number)).all())
        added_count = 0

        for i in range(6, ws.max_row + 1):
            row = [cell.value for cell in ws[i]]
            if not row or row[0] is None:
                continue
            seq_num = int(row[0])
            name = str(row[1]).strip()
            roll = str(row[2]).strip()
            student_id_num = f"25{seq_num:04d}"  # 6-digit claim ID e.g. 250001 - 250041

            if roll not in existing_rolls:
                stu = Student(
                    id=f"stu_c25_{seq_num:03d}",
                    batch_id=b1.id,
                    student_id_num=student_id_num,
                    roll_number=roll,
                    full_name=name,
                    account_claimed=0,
                    created_at=now
                )
                session.add(stu)
                existing_rolls.add(roll)
                added_count += 1

        b1.total_submissions = 41
        session.commit()
        print(f"Added {added_count} students to CATCH 25 12th CET-1.")

        print("3. Restoring TEST INSTITUTE & Test Branch...")
        test_inst = session.scalar(select(Institute).where(Institute.code == "TEST_INST"))
        if not test_inst:
            test_inst = Institute(
                id="inst_test_institute",
                name="TEST INSTITUTE",
                code="TEST_INST",
                subjects='["Physics", "Chemistry", "Maths", "Biology"]',
                is_deleted=0,
                created_at=now
            )
            session.add(test_inst)
            session.commit()

        test_branch = session.scalar(select(Branch).where(Branch.id == "br_28c2a5dfe193"))
        if not test_branch:
            test_branch = Branch(
                id="br_28c2a5dfe193",
                institute_id=test_inst.id,
                name="Test Branch - Borivali",
                code="TEST_BVI",
                city="Mumbai",
                subjects='["Physics", "Chemistry", "Maths", "Biology"]',
                last_roll_sequence=28,
                created_at=now
            )
            session.add(test_branch)
            session.commit()
        else:
            test_branch.institute_id = test_inst.id
            test_branch.last_roll_sequence = 28
            session.commit()

        test_batch = session.scalar(select(Batch).where(Batch.branch_id == test_branch.id))
        if not test_batch:
            test_batch = Batch(
                id="batch_097bce23a72e",
                branch_id=test_branch.id,
                name="CET - 1",
                academic_year="2026",
                status="ACTIVE",
                total_submissions=28,
                created_at=now,
                updated_at=now
            )
            session.add(test_batch)
            session.commit()

        # 28 students for TEST INSTITUTE
        from scripts.seed_catch25_borivali_students import STUDENT_DATA
        test_added = 0
        for idx in range(1, 29):
            roll = f"TEST_INST-TEST_BVI-{idx:03d}"
            if roll not in existing_rolls:
                if idx - 1 < len(STUDENT_DATA):
                    base_data = STUDENT_DATA[idx - 1]
                    s_name = base_data["name"]
                    email = base_data["email"].replace("catch25.edu.in", "test.edu")
                else:
                    s_name = f"Test Student {idx}"
                    email = f"student_{idx}@test.edu"

                student_id_num = f"99{idx:04d}"
                # Create user for claimed students
                u_id = f"usr_test_bvi_{idx:03d}"
                user = session.scalar(select(User).where(User.id == u_id))
                if not user:
                    user = User(
                        id=u_id,
                        institute_id=test_inst.id,
                        branch_id=test_branch.id,
                        email=email,
                        role="STUDENT",
                        password_hash=default_pass,
                        full_name=s_name,
                        is_active=1,
                        has_changed_password=1,
                        created_at=now
                    )
                    session.add(user)
                    session.flush()

                stu = Student(
                    id=f"stu_test_{idx:03d}",
                    batch_id=test_batch.id,
                    user_id=user.id,
                    student_id_num=student_id_num,
                    roll_number=roll,
                    full_name=s_name,
                    email=email,
                    account_claimed=1,
                    claimed_at=now,
                    created_at=now
                )
                session.add(stu)
                existing_rolls.add(roll)
                test_added += 1

        session.commit()
        print(f"Added {test_added} students to TEST INSTITUTE CET - 1.")

        # Ensure subjects exist
        for inst_obj, br_obj in [(c25, c25_branch), (test_inst, test_branch)]:
            for sub_name, sub_code in [("Physics", "PHY"), ("Chemistry", "CHEM"), ("Maths", "MATH"), ("Biology", "BIO")]:
                existing_sub = session.scalar(
                    select(Subject).where(
                        Subject.institute_id == inst_obj.id,
                        Subject.branch_id == br_obj.id,
                        Subject.name == sub_name
                    )
                )
                if not existing_sub:
                    session.add(Subject(
                        id=f"sub_{uuid.uuid4().hex[:10]}",
                        institute_id=inst_obj.id,
                        branch_id=br_obj.id,
                        name=sub_name,
                        code=sub_code,
                        created_at=now
                    ))
        session.commit()

        # Ensure all existing exams, windows, and submissions remain linked to Test Branch
        session.execute(
            text("UPDATE exams SET branch_id = :br_id, institute_id = :inst_id WHERE branch_id IS NULL"),
            {"br_id": test_branch.id, "inst_id": test_inst.id}
        )
        session.execute(
            text("UPDATE submission_windows SET branch_id = :br_id WHERE branch_id IS NULL"),
            {"br_id": test_branch.id}
        )
        session.execute(
            text("UPDATE submissions SET batch_id = :b_id WHERE batch_id IS NULL"),
            {"b_id": test_batch.id}
        )
        session.commit()

        print("4. Final Verification:")
        inst_count = len(session.scalars(select(Institute)).all())
        branch_count = len(session.scalars(select(Branch)).all())
        batch_count = len(session.scalars(select(Batch)).all())
        student_count = len(session.scalars(select(Student)).all())
        print(f"Institutes: {inst_count}, Branches: {branch_count}, Batches: {batch_count}, Students: {student_count}")
        assert student_count == 69, f"Expected 69 students, found {student_count}"
        print("SEED RESTORATION 100% COMPLETE AND VERIFIED!")

if __name__ == "__main__":
    restore_canonical_seed()
