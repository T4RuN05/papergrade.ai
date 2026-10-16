"""
Seed Script: Inject 22 Claimed & Verified Students for Catch 25 Borivali Branch.

This script:
1. Locates or validates the 'CATCH 25' institute and 'Borivali' branch (br_28c2a5dfe193).
2. Uses or provisions the batch 'CET - 1' (code: CET1).
3. Injects exactly 22 realistic dummy students with:
   - Full names and roll numbers (C25-BVI-001 to C25-BVI-022)
   - Unique 6-digit Student Claim IDs (251001 to 251022)
   - Linked user accounts with hashed bcrypt passwords ('Student@123')
   - Full 'STUDENT' role in RBAC
   - account_claimed = 1 and verified claimed_at timestamps
   - Active status for immediate login via PWA using email, roll number, or claim ID.
"""

import sys
import uuid
from pathlib import Path
from datetime import datetime, timezone

# Ensure project root is on sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.database import get_db, get_iso_now, is_postgres
from backend.app.services.auth import hash_password

STUDENT_DATA = [
    {"name": "Aarav Mehta", "roll": "C25-BVI-001", "claim_id": "251001", "phone": "+91 98200 10001", "email": "aarav.mehta@catch25.edu.in"},
    {"name": "Diya Sharma", "roll": "C25-BVI-002", "claim_id": "251002", "phone": "+91 98200 10002", "email": "diya.sharma@catch25.edu.in"},
    {"name": "Rohan Iyer", "roll": "C25-BVI-003", "claim_id": "251003", "phone": "+91 98200 10003", "email": "rohan.iyer@catch25.edu.in"},
    {"name": "Ananya Joshi", "roll": "C25-BVI-004", "claim_id": "251004", "phone": "+91 98200 10004", "email": "ananya.joshi@catch25.edu.in"},
    {"name": "Aditya Kulkarni", "roll": "C25-BVI-005", "claim_id": "251005", "phone": "+91 98200 10005", "email": "aditya.kulkarni@catch25.edu.in"},
    {"name": "Priya Deshmukh", "roll": "C25-BVI-006", "claim_id": "251006", "phone": "+91 98200 10006", "email": "priya.deshmukh@catch25.edu.in"},
    {"name": "Siddharth Patel", "roll": "C25-BVI-007", "claim_id": "251007", "phone": "+91 98200 10007", "email": "siddharth.patel@catch25.edu.in"},
    {"name": "Neha Varma", "roll": "C25-BVI-008", "claim_id": "251008", "phone": "+91 98200 10008", "email": "neha.varma@catch25.edu.in"},
    {"name": "Kabir Shah", "roll": "C25-BVI-009", "claim_id": "251009", "phone": "+91 98200 10009", "email": "kabir.shah@catch25.edu.in"},
    {"name": "Ishaan Rao", "roll": "C25-BVI-010", "claim_id": "251010", "phone": "+91 98200 10010", "email": "ishaan.rao@catch25.edu.in"},
    {"name": "Riya Nair", "roll": "C25-BVI-011", "claim_id": "251011", "phone": "+91 98200 10011", "email": "riya.nair@catch25.edu.in"},
    {"name": "Varun Bhatia", "roll": "C25-BVI-012", "claim_id": "251012", "phone": "+91 98200 10012", "email": "varun.bhatia@catch25.edu.in"},
    {"name": "Tanvi Sawant", "roll": "C25-BVI-013", "claim_id": "251013", "phone": "+91 98200 10013", "email": "tanvi.sawant@catch25.edu.in"},
    {"name": "Atharva More", "roll": "C25-BVI-014", "claim_id": "251014", "phone": "+91 98200 10014", "email": "atharva.more@catch25.edu.in"},
    {"name": "Pooja Chawla", "roll": "C25-BVI-015", "claim_id": "251015", "phone": "+91 98200 10015", "email": "pooja.chawla@catch25.edu.in"},
    {"name": "Manav Malhotra", "roll": "C25-BVI-016", "claim_id": "251016", "phone": "+91 98200 10016", "email": "manav.malhotra@catch25.edu.in"},
    {"name": "Sneha Gokhale", "roll": "C25-BVI-017", "claim_id": "251017", "phone": "+91 98200 10017", "email": "sneha.gokhale@catch25.edu.in"},
    {"name": "Yash Shinde", "roll": "C25-BVI-018", "claim_id": "251018", "phone": "+91 98200 10018", "email": "yash.shinde@catch25.edu.in"},
    {"name": "Shreya Agarwal", "roll": "C25-BVI-019", "claim_id": "251019", "phone": "+91 98200 10019", "email": "shreya.agarwal@catch25.edu.in"},
    {"name": "Devendra Parab", "roll": "C25-BVI-020", "claim_id": "251020", "phone": "+91 98200 10020", "email": "devendra.parab@catch25.edu.in"},
    {"name": "Kirti Solanki", "roll": "C25-BVI-021", "claim_id": "251021", "phone": "+91 98200 10021", "email": "kirti.solanki@catch25.edu.in"},
    {"name": "Aryan Tendulkar", "roll": "C25-BVI-022", "claim_id": "251022", "phone": "+91 98200 10022", "email": "aryan.tendulkar@catch25.edu.in"},
]

DEFAULT_PASSWORD = "Student@123"

def seed_catch25_borivali_students():
    print("=" * 70)
    print("SEEDING CLAIMED & VERIFIED STUDENTS FOR CATCH 25 BORIVALI")
    print("=" * 70)

    now = get_iso_now()
    param = "%s" if is_postgres() else "?"

    with get_db() as conn:
        cursor = conn.cursor()

        # 1. Find Catch 25 institute
        cursor.execute(f"SELECT id, name, code FROM institutes WHERE UPPER(code) = {param} OR UPPER(name) LIKE {param}", ('C25', '%CATCH 25%'))
        inst = cursor.fetchone()
        if not inst:
            # Create if not existing
            inst_id = f"inst_{uuid.uuid4().hex[:12]}"
            cursor.execute(f"INSERT INTO institutes (id, name, code, created_at) VALUES ({param}, {param}, {param}, {param})",
                           (inst_id, "CATCH 25", "C25", now))
            print(f"[+] Created institute: CATCH 25 (id: {inst_id})")
        else:
            inst_id = inst["id"]
            print(f"[*] Found institute: {inst['name']} (id: {inst_id})")

        # 2. Find Borivali branch
        cursor.execute(f"SELECT id, name, code, institute_id FROM branches WHERE (UPPER(code) = {param} OR UPPER(name) LIKE {param}) AND institute_id = {param}",
                       ('BVI', '%BORIVALI%', inst_id))
        branch = cursor.fetchone()
        if not branch:
            # Create if not existing
            branch_id = f"br_{uuid.uuid4().hex[:12]}"
            cursor.execute(f"INSERT INTO branches (id, institute_id, name, code, city, created_at) VALUES ({param}, {param}, {param}, {param}, {param}, {param})",
                           (branch_id, inst_id, "Borivali", "BVI", "Mumbai", now))
            print(f"[+] Created branch: Borivali (id: {branch_id})")
        else:
            branch_id = branch["id"]
            print(f"[*] Found branch: {branch['name']} (id: {branch_id})")

        # 3. Find or Create Batch 'CET - 1'
        cursor.execute(f"SELECT id, name, code FROM batches WHERE branch_id = {param} ORDER BY created_at ASC LIMIT 1", (branch_id,))
        batch = cursor.fetchone()
        if not batch:
            batch_id = f"batch_{uuid.uuid4().hex[:12]}"
            cursor.execute(f"""
                INSERT INTO batches (id, branch_id, exam_id, name, code, academic_year, status, total_submissions, completed_submissions, failed_submissions, created_at, updated_at)
                VALUES ({param}, {param}, 'general', 'CET - 1', 'CET1', '2026', 'ACTIVE', 0, 0, 0, {param}, {param})
            """, (batch_id, branch_id, now, now))
            print(f"[+] Created batch: CET - 1 (id: {batch_id})")
        else:
            batch_id = batch["id"]
            print(f"[*] Target batch: {batch['name']} [Code: {batch.get('code')}] (id: {batch_id})")

        # Pre-hash standard password once to save execution cycles
        print(f"[*] Hashing default password '{DEFAULT_PASSWORD}' with bcrypt...")
        hashed_pwd = hash_password(DEFAULT_PASSWORD)

        injected_records = []

        for idx, item in enumerate(STUDENT_DATA, start=1):
            roll = item["roll"]
            name = item["name"]
            claim_id = item["claim_id"]
            email = item["email"]
            phone = item["phone"]

            # Check if user already exists
            cursor.execute(f"SELECT id FROM users WHERE LOWER(email) = {param}", (email.lower(),))
            user_row = cursor.fetchone()

            if user_row:
                user_id = user_row["id"]
                # Update user details if needed
                cursor.execute(f"""
                    UPDATE users
                    SET full_name = {param}, role = 'STUDENT', institute_id = {param}, branch_id = {param}, is_active = 1, password_hash = {param}
                    WHERE id = {param}
                """, (name, inst_id, branch_id, hashed_pwd, user_id))
            else:
                user_id = f"usr_{uuid.uuid4().hex[:12]}"
                cursor.execute(f"""
                    INSERT INTO users (id, institute_id, branch_id, email, role, password_hash, full_name, is_active, last_login_at, created_at)
                    VALUES ({param}, {param}, {param}, {param}, 'STUDENT', {param}, {param}, 1, {param}, {param})
                """, (user_id, inst_id, branch_id, email.lower(), hashed_pwd, name, now, now))

            # Check if student record already exists by roll or claim_id
            cursor.execute(f"SELECT id FROM students WHERE batch_id = {param} AND (UPPER(roll_number) = {param} OR student_id_num = {param})",
                           (batch_id, roll.upper(), claim_id))
            stu_row = cursor.fetchone()

            if stu_row:
                stu_id = stu_row["id"]
                cursor.execute(f"""
                    UPDATE students
                    SET user_id = {param}, student_id_num = {param}, roll_number = {param},
                        full_name = {param}, email = {param}, phone = {param},
                        account_claimed = 1, claimed_at = {param}
                    WHERE id = {param}
                """, (user_id, claim_id, roll, name, email, phone, now, stu_id))
            else:
                stu_id = f"stu_{uuid.uuid4().hex[:12]}"
                cursor.execute(f"""
                    INSERT INTO students (id, batch_id, user_id, student_id_num, roll_number, full_name, email, phone, account_claimed, claimed_at, created_at)
                    VALUES ({param}, {param}, {param}, {param}, {param}, {param}, {param}, {param}, 1, {param}, {param})
                """, (stu_id, batch_id, user_id, claim_id, roll, name, email, phone, now, now))

            injected_records.append({
                "index": idx,
                "roll": roll,
                "name": name,
                "claim_id": claim_id,
                "email": email,
                "password": DEFAULT_PASSWORD,
                "user_id": user_id,
                "student_id": stu_id
            })

        # Update batch updated_at
        cursor.execute(f"UPDATE batches SET updated_at = {param} WHERE id = {param}", (now, batch_id))

    print("\n" + "=" * 90)
    print(f"SUCCESS: Successfully injected {len(injected_records)} Claimed & Verified Students into Catch 25 Borivali!")
    print("=" * 90)
    print(f"{'#':<3} | {'Roll Number':<12} | {'Name':<20} | {'Claim ID':<8} | {'Email':<30} | {'Status'}")
    print("-" * 90)
    for s in injected_records:
        print(f"{s['index']:<3} | {s['roll']:<12} | {s['name']:<20} | {s['claim_id']:<8} | {s['email']:<30} | Claimed & Verified")
    print("-" * 90)
    print(f"[*] Default Password for all accounts: {DEFAULT_PASSWORD}")
    print(f"[*] Login identifiers accepted: Email, Roll Number, or 6-digit Claim ID")
    print("=" * 90)
    return injected_records

if __name__ == "__main__":
    seed_catch25_borivali_students()
