"""
Simulation Script: 22 Concurrent Student Answer Sheet Uploads to KTG Exam.

Simulates 22 students (seeded for Catch 25 Borivali) logging into their accounts
and uploading sample answer sheet PDFs from C:\\Users\\tarun\\Desktop\\Github Repo\\script\\KTG
staggered randomly across a 5-minute (300-second) submission window.

Tracks and reports:
- Lowest, Highest, and Average upload latency
- Median and P95 latency
- Individual upload status, payload size, and server response
- Atomic submission replacement verification
"""

import sys
import os
import time
import random
import argparse
import json
from pathlib import Path
from datetime import datetime, timezone
import concurrent.futures
import requests

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Line buffering for real-time progress logging
try:
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
except Exception:
    pass

from backend.app.database import get_db, is_postgres

SAMPLE_PDF_DIR = Path(r"C:\Users\tarun\Desktop\Github Repo\script\KTG")
API_BASE = os.environ.get("API_BASE_URL", "https://papergrade-ai-backend.onrender.com")
DEFAULT_PASSWORD = "Student@123"
DEFAULT_EXAM_ID = "a2ffa699-4dd1-4fe6-b418-37b356799d5f"

def get_target_exam_and_window(exam_id: str = None, exam_title: str = None):
    target_id = exam_id or (DEFAULT_EXAM_ID if not exam_title else None)
    with get_db() as conn:
        cursor = conn.cursor()
        if target_id:
            cursor.execute("""
                SELECT e.id, e.title, e.branch_id, sw.id as window_id, sw.deadline_at, sw.grace_deadline_at, sw.status as window_status
                FROM exams e
                JOIN submission_windows sw ON sw.exam_id = e.id
                WHERE e.id = ? AND sw.status = 'OPEN'
                ORDER BY sw.created_at DESC
                LIMIT 1
            """, (target_id,))
            row = cursor.fetchone()
            if not row:
                raise RuntimeError(f"No active OPEN submission window found for exam ID: '{target_id}'. Please open the submission window on the portal first.")
            return dict(row)
        elif exam_title:
            cursor.execute("""
                SELECT e.id, e.title, e.branch_id, sw.id as window_id, sw.deadline_at, sw.grace_deadline_at, sw.status as window_status
                FROM exams e
                JOIN submission_windows sw ON sw.exam_id = e.id
                WHERE UPPER(e.title) LIKE ? AND sw.status = 'OPEN'
                ORDER BY sw.created_at DESC
                LIMIT 1
            """, (f"%{exam_title.upper()}%",))
            row = cursor.fetchone()
            if not row:
                raise RuntimeError(f"No active OPEN submission window found for exam matching title: '{exam_title}'.")
            return dict(row)
        else:
            # Auto-detect latest active OPEN window
            cursor.execute("""
                SELECT e.id, e.title, e.branch_id, sw.id as window_id, sw.deadline_at, sw.grace_deadline_at, sw.status as window_status
                FROM exams e
                JOIN submission_windows sw ON sw.exam_id = e.id
                WHERE sw.status = 'OPEN'
                ORDER BY sw.created_at DESC
                LIMIT 1
            """)
            row = cursor.fetchone()
            if not row:
                raise RuntimeError("No active OPEN submission window found in database. Please open a submission window first.")
            return dict(row)

def get_seeded_students():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT s.id as student_id, s.roll_number, s.full_name, s.student_id_num, u.email, u.id as user_id
            FROM students s
            JOIN users u ON s.user_id = u.id
            WHERE s.roll_number LIKE 'C25-BVI-%'
            ORDER BY s.roll_number ASC
        """)
        students = [dict(r) for r in cursor.fetchall()]
        if len(students) < 22:
            raise RuntimeError(f"Expected at least 22 seeded students in Catch 25 Borivali, found {len(students)}.")
        return students[:22]

def get_sample_pdfs():
    if not SAMPLE_PDF_DIR.exists():
        raise FileNotFoundError(f"Directory not found: {SAMPLE_PDF_DIR}")
    pdfs = sorted([p for p in SAMPLE_PDF_DIR.glob("*.pdf")])
    if len(pdfs) < 22:
        raise RuntimeError(f"Expected 22 PDF files in {SAMPLE_PDF_DIR}, found {len(pdfs)}.")
    return pdfs[:22]

def upload_single_student(student_item, pdf_file, exam_id, start_delay_secs):
    """
    Simulates a student:
    1. Sleeping until their randomized scheduled dispatch offset.
    2. Authenticating via /api/v1/auth/login.
    3. Uploading their PDF answer sheet to /api/v1/submissions/{exam_id}/upload-single.
    4. Measuring precise upload round-trip latency.
    """
    roll = student_item["roll_number"]
    name = student_item["full_name"]
    email = student_item["email"]

    if start_delay_secs > 0:
        time.sleep(start_delay_secs)

    dispatch_time_str = datetime.now().strftime("%H:%M:%S")
    file_bytes = pdf_file.read_bytes()
    file_size_kb = len(file_bytes) / 1024.0

    print(f"[{dispatch_time_str}] [START] {roll} ({name}) initiating upload of '{pdf_file.name}' ({file_size_kb:.1f} KB) after {start_delay_secs:.1f}s offset...")

    session = requests.Session()
    token = None
    last_err = ""
    for attempt in range(1, 4):
        try:
            login_res = session.post(
                f"{API_BASE}/api/v1/auth/login",
                json={"email": email, "password": DEFAULT_PASSWORD},
                timeout=30.0
            )
            if login_res.status_code == 200:
                token = login_res.json()["access_token"]
                break
            elif login_res.status_code in (502, 503, 504) and attempt < 3:
                time.sleep(3.0)
                continue
            else:
                last_err = f"HTTP {login_res.status_code}: {login_res.text[:100]}"
                login_res.raise_for_status()
        except Exception as e:
            last_err = str(e)
            if attempt < 3:
                time.sleep(3.0)
                continue

    if not token:
        err_msg = f"Login failed for {roll}: {last_err}"
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [ERROR] {err_msg}")
        return {
            "roll": roll,
            "name": name,
            "pdf_name": pdf_file.name,
            "size_kb": file_size_kb,
            "scheduled_offset": start_delay_secs,
            "success": False,
            "upload_duration": None,
            "status_code": getattr(login_res, 'status_code', 0) if 'login_res' in locals() else 0,
            "error": err_msg
        }

    # Prepare multipart upload
    files = {
        "file": (pdf_file.name, file_bytes, "application/pdf")
    }
    data = {
        "roll_number": roll,
        "student_name": name
    }
    headers = {
        "Authorization": f"Bearer {token}"
    }

    upload_res = None
    upload_duration = None
    for attempt in range(1, 4):
        upload_start = time.perf_counter()
        try:
            upload_res = session.post(
                f"{API_BASE}/api/v1/submissions/{exam_id}/upload-single",
                data=data,
                files=files,
                headers=headers,
                timeout=120.0
            )
            upload_duration = time.perf_counter() - upload_start
            status_code = upload_res.status_code

            if status_code == 200:
                res_json = upload_res.json()
                sub_id = res_json.get("submission_id", "N/A")
                pages = res_json.get("page_count", 0)
                is_rep = res_json.get("is_replacement", False)
                rep_label = " (Replaced)" if is_rep else ""
                print(f"[{datetime.now().strftime('%H:%M:%S')}] [SUCCESS] {roll} ({name}) -> HTTP 200 in {upload_duration:.2f}s | Pages: {pages} | Sub ID: {sub_id}{rep_label}")
                return {
                    "roll": roll,
                    "name": name,
                    "pdf_name": pdf_file.name,
                    "size_kb": file_size_kb,
                    "scheduled_offset": start_delay_secs,
                    "success": True,
                    "upload_duration": upload_duration,
                    "status_code": status_code,
                    "submission_id": sub_id,
                    "pages": pages,
                    "is_replacement": is_rep
                }
            elif status_code in (502, 503, 504) and attempt < 3:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] [RETRY] {roll} hit {status_code}, retrying in 3s (attempt {attempt+1}/3)...")
                time.sleep(3.0)
                continue
            else:
                err_text = upload_res.text[:200]
                print(f"[{datetime.now().strftime('%H:%M:%S')}] [FAILED] {roll} ({name}) -> HTTP {status_code} in {upload_duration:.2f}s: {err_text}")
                return {
                    "roll": roll,
                    "name": name,
                    "pdf_name": pdf_file.name,
                    "size_kb": file_size_kb,
                    "scheduled_offset": start_delay_secs,
                    "success": False,
                    "upload_duration": upload_duration,
                    "status_code": status_code,
                    "error": err_text
                }
        except Exception as e:
            upload_duration = time.perf_counter() - upload_start
            if attempt < 3:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] [RETRY] {roll} network exception ({e}), retrying in 3s...")
                time.sleep(3.0)
                continue
            err_msg = f"Upload network error for {roll}: {str(e)}"
            print(f"[{datetime.now().strftime('%H:%M:%S')}] [EXCEPTION] {err_msg}")
            return {
                "roll": roll,
                "name": name,
                "pdf_name": pdf_file.name,
                "size_kb": file_size_kb,
                "scheduled_offset": start_delay_secs,
                "success": False,
                "upload_duration": upload_duration,
                "status_code": 0,
                "error": err_msg
            }

def run_simulation(duration_seconds: int = 300, exam_id: str = None, exam_title: str = None, api_base: str = None, burst: bool = False):
    global API_BASE
    if api_base:
        API_BASE = api_base.rstrip("/")

    print("=" * 80)
    print("PAPERGRADE AI - STUDENT CONCURRENT UPLOAD LOAD TEST")
    print("=" * 80)

    exam_info = get_target_exam_and_window(exam_id=exam_id, exam_title=exam_title)
    target_exam_id = exam_info["id"]
    print(f"[*] Target Exam: '{exam_info['title']}' (ID: {target_exam_id})")
    print(f"[*] Submission Window: {exam_info['window_id']} | Status: {exam_info['window_status']}")
    print(f"[*] Window Deadline: {exam_info['deadline_at']} (Grace: {exam_info['grace_deadline_at']})")
    print(f"[*] Target API URL: {API_BASE}")
    print(f"[*] Mode: {'BURST (all concurrent at once)' if burst else f'STAGGERED across {duration_seconds}s ({duration_seconds/60:.1f}m)'}")

    students = get_seeded_students()
    pdfs = get_sample_pdfs()
    print(f"[*] Loaded {len(students)} student accounts and {len(pdfs)} sample answer sheet PDFs.")

    # Generate random dispatch offsets uniformly across the window duration (buffer 15s before end)
    max_offset = max(1, duration_seconds - 15) if not burst else 0
    random.seed(42)  # reproducible pseudo-random sequence
    scheduled_tasks = []

    for i in range(len(students)):
        offset = 0.0 if burst else round(random.uniform(0.5, max_offset), 2)
        scheduled_tasks.append((students[i], pdfs[i], offset))

    # Sort tasks by scheduled offset for cleaner progress visualization
    scheduled_tasks.sort(key=lambda x: x[2])

    print("\nScheduled Dispatch Plan:")
    print(f"{'#':<3} | {'Scheduled Time':<15} | {'Roll Number':<12} | {'Student Name':<20} | {'PDF File'}")
    print("-" * 80)
    for idx, (s, p, offset) in enumerate(scheduled_tasks, 1):
        mins = int(offset // 60)
        secs = int(offset % 60)
        print(f"{idx:<3} | T+{mins:02d}m {secs:02d}s ({offset:5.1f}s) | {s['roll_number']:<12} | {s['full_name']:<20} | {p.name}")
    print("-" * 80)

    print(f"\n[*] Starting simulation threads across {duration_seconds} seconds...\n")
    sim_start_time = time.perf_counter()

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(students)) as executor:
        future_map = {
            executor.submit(upload_single_student, s, p, target_exam_id, offset): s["roll_number"]
            for (s, p, offset) in scheduled_tasks
        }
        for future in concurrent.futures.as_completed(future_map):
            res = future.result()
            results.append(res)

    total_wall_clock = time.perf_counter() - sim_start_time

    # Sort results by roll number for final table
    results.sort(key=lambda r: r["roll"])

    # Analyze upload times
    successful = [r for r in results if r["success"] and r["upload_duration"] is not None]
    failed = [r for r in results if not r["success"]]
    durations = [r["upload_duration"] for r in successful]

    print("\n" + "=" * 90)
    print("LOAD TEST EXECUTION COMPLETE - PERFORMANCE REPORT")
    print("=" * 90)
    print(f"Total Students Simulated : {len(results)}")
    print(f"Successful Uploads       : {len(successful)} / {len(results)} ({len(successful)/len(results)*100:.1f}%)")
    print(f"Failed Uploads           : {len(failed)}")
    print(f"Total Simulation Elapsed : {total_wall_clock:.2f} seconds ({total_wall_clock/60:.2f} mins)")

    if durations:
        lowest_time = min(durations)
        highest_time = max(durations)
        avg_time = sum(durations) / len(durations)
        sorted_d = sorted(durations)
        median_time = sorted_d[len(sorted_d) // 2]
        p95_idx = int(len(sorted_d) * 0.95)
        p95_time = sorted_d[min(p95_idx, len(sorted_d) - 1)]

        print("-" * 90)
        print(f"[*] LOWEST Upload Latency  : {lowest_time:.2f} seconds ({lowest_time*1000:.0f} ms)")
        print(f"[*] HIGHEST Upload Latency : {highest_time:.2f} seconds ({highest_time*1000:.0f} ms)")
        print(f"[*] AVERAGE Upload Latency : {avg_time:.2f} seconds ({avg_time*1000:.0f} ms)")
        print(f"[*] Median Upload Latency  : {median_time:.2f} seconds ({median_time*1000:.0f} ms)")
        print(f"[*] 95th Percentile (P95)  : {p95_time:.2f} seconds ({p95_time*1000:.0f} ms)")
        print("-" * 90)

    print(f"\n{'Roll Number':<12} | {'Student Name':<18} | {'PDF File':<27} | {'Size':<9} | {'Offset':<8} | {'Upload Time':<12} | {'Status'}")
    print("-" * 105)
    for r in results:
        t_str = f"{r['upload_duration']:.2f}s" if r.get("upload_duration") else "N/A"
        sz_str = f"{r['size_kb']:.1f} KB"
        off_str = f"+{r['scheduled_offset']:.1f}s"
        status_str = "SUCCESS" if r["success"] else f"FAILED ({r.get('error', '')[:20]})"
        print(f"{r['roll']:<12} | {r['name']:<18} | {r['pdf_name']:<27} | {sz_str:<9} | {off_str:<8} | {t_str:<12} | {status_str}")
    print("=" * 105)

    # Save results to json
    out_dir = PROJECT_ROOT / "scratch"
    out_dir.mkdir(exist_ok=True)
    report_path = out_dir / "upload_benchmark_results.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump({
            "exam_id": target_exam_id,
            "exam_title": exam_info["title"],
            "total_students": len(results),
            "successful_count": len(successful),
            "failed_count": len(failed),
            "lowest_time_seconds": lowest_time if durations else None,
            "highest_time_seconds": highest_time if durations else None,
            "average_time_seconds": avg_time if durations else None,
            "median_time_seconds": median_time if durations else None,
            "p95_time_seconds": p95_time if durations else None,
            "total_elapsed_seconds": total_wall_clock,
            "results": results
        }, f, indent=2)
    print(f"[*] Benchmark report saved to: {report_path}")

    return {
        "lowest": lowest_time if durations else None,
        "highest": highest_time if durations else None,
        "average": avg_time if durations else None,
        "success_count": len(successful),
        "total_count": len(results)
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Simulate student answer sheet uploads during open submission window")
    parser.add_argument("--exam-id", type=str, default=DEFAULT_EXAM_ID, help=f"Target exam ID (default: {DEFAULT_EXAM_ID})")
    parser.add_argument("--exam-title", type=str, default=None, help="Target exam title keyword (e.g. KTG)")
    parser.add_argument("--api-url", type=str, default=API_BASE, help=f"API base URL (default: {API_BASE})")
    parser.add_argument("--duration", type=int, default=300, help="Total window simulation duration in seconds (default: 300 for 5m, use 1800 for 30m)")
    parser.add_argument("--burst", action="store_true", help="Fire all uploads concurrently at once without staggering (stress test)")
    args = parser.parse_args()

    run_simulation(
        duration_seconds=args.duration,
        exam_id=args.exam_id,
        exam_title=args.exam_title,
        api_base=args.api_url,
        burst=args.burst
    )
