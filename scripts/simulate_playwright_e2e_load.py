"""
Main CLI Orchestrator: PaperGrade AI End-to-End Playwright Mobile Load Test.
Simulates 28 students from TEST INSTITUTE BVI Branch (batch_097bce23a72e)
submitting answer sheets through the mobile frontend across a 15-minute 3-phase lifecycle.
ZERO TOUCH OF PRODUCTION CATCH 25 INSTITUTE.

Usage Examples:
  # Validate schedule, sample images, and test institute accounts without launching browser:
  python scripts/simulate_playwright_e2e_load.py --dry-run

  # Run full 28-student mobile load test against local frontend:
  python scripts/simulate_playwright_e2e_load.py --frontend-url http://localhost:3000

  # Run against remote/staging frontend and backend with Render telemetry:
  python scripts/simulate_playwright_e2e_load.py \
    --frontend-url https://papergrade-ai.vercel.app \
    --api-url https://papergrade-ai-backend.onrender.com \
    --render-api-key $RENDER_API_KEY \
    --render-service-id srv-xxxx
"""

import os
import sys
import argparse
import asyncio
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any
from playwright.async_api import async_playwright

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

from scripts.e2e_playwright.config import (
    DEFAULT_FRONTEND_URL,
    DEFAULT_API_URL,
    DEFAULT_SAMPLE_PAGES_DIR,
    DEFAULT_PAGES_PER_STUDENT,
    TOTAL_STUDENTS,
    TOTAL_DURATION_SECONDS,
    REPORTS_DIR,
    TARGET_INSTITUTE_CODE,
    TARGET_BRANCH_ID,
    TARGET_BRANCH_CODE,
    TARGET_BATCH_ID,
    DEFAULT_STUDENTS
)
from scripts.e2e_playwright.scheduler import (
    build_dispatch_schedule,
    print_dispatch_schedule_table,
    ScheduledStudentTask
)
from scripts.e2e_playwright.metrics import (
    LoadTestReportAggregator,
    StudentSessionMetrics
)
from scripts.e2e_playwright.student_worker import simulate_student_session
from scripts.e2e_playwright.render_telemetry import RenderTelemetryMonitor


def auto_detect_active_exam(api_url: str) -> Dict[str, Any]:
    """Auto-detect active exam and submission window restricted strictly to TEST INSTITUTE BVI branch."""
    try:
        from backend.app.db.session import get_session
        from backend.app.db.models import Exam, SubmissionWindow
        from sqlalchemy import select

        with get_session() as session:
            # Look for active OPEN submission window in TEST INSTITUTE BVI branch
            stmt = (
                select(Exam, SubmissionWindow)
                .join(SubmissionWindow, Exam.id == SubmissionWindow.exam_id)
                .where(Exam.branch_id == TARGET_BRANCH_ID, SubmissionWindow.status == "OPEN")
                .order_by(SubmissionWindow.created_at.desc())
                .limit(1)
            )
            res = session.execute(stmt).first()
            if res:
                ex, win = res
                return {
                    "id": ex.id,
                    "title": ex.title,
                    "window_id": win.id,
                    "deadline_at": str(win.deadline_at),
                    "grace_deadline_at": str(win.grace_deadline_at),
                }

            # If no open window, find the latest exam for TEST INSTITUTE BVI branch
            latest_ex = session.scalar(
                select(Exam)
                .where(Exam.branch_id == TARGET_BRANCH_ID)
                .order_by(Exam.created_at.desc())
                .limit(1)
            )
            if latest_ex:
                return {
                    "id": latest_ex.id,
                    "title": latest_ex.title,
                    "window_id": "auto",
                    "deadline_at": "active",
                    "grace_deadline_at": "active"
                }
    except Exception as e:
        print(f"[!] Database window lookup notice: {e}")

    # Fallback default test exam in TEST INSTITUTE BVI branch
    return {
        "id": "a2ffa699-4dd1-4fe6-b418-37b356799d5f",
        "title": "KTG PROD TEST",
        "window_id": "win_default",
        "deadline_at": "active",
        "grace_deadline_at": "active"
    }


async def run_playwright_load_test(
    frontend_url: str,
    api_url: str,
    exam_id: Optional[str] = None,
    exam_title: Optional[str] = None,
    total_duration_secs: int = TOTAL_DURATION_SECONDS,
    burst: bool = False,
    num_students: int = TOTAL_STUDENTS,
    num_pages: int = DEFAULT_PAGES_PER_STUDENT,
    sample_dir: Path = DEFAULT_SAMPLE_PAGES_DIR,
    headed: bool = False,
    render_api_key: Optional[str] = None,
    render_service_id: Optional[str] = None,
    save_traces: bool = False,
    dry_run: bool = False
):
    print("=" * 105)
    print("PAPERGRADE AI — 28-STUDENT MOBILE E2E LOAD TEST (TEST INSTITUTE BVI)")
    print("=" * 105)

    # 1. Detect target exam & active submission window (restricted to TEST INSTITUTE BVI)
    exam_info = auto_detect_active_exam(api_url)
    target_exam_id = exam_id or exam_info["id"]
    target_exam_title = exam_title or exam_info["title"]

    print(f"[*] Target Institute   : {TARGET_INSTITUTE_CODE} (Test Environment)")
    print(f"[*] Target Branch      : {TARGET_BRANCH_CODE} (ID: {TARGET_BRANCH_ID})")
    print(f"[*] Target Batch       : CET - 1 (ID: {TARGET_BATCH_ID})")
    print(f"[*] Safety Boundary    : CATCH 25 Institute is 100% EXCLUDED and UNTOUCHED")
    print(f"[*] Target Exam        : '{target_exam_title}' (ID: {target_exam_id})")
    print(f"[*] Frontend Web URL   : {frontend_url}")
    print(f"[*] Backend API URL    : {api_url}")
    print(f"[*] Simulation Mode    : {'BURST (all concurrent)' if burst else f'STAGGERED ({total_duration_secs}s / {total_duration_secs/60:.1f}m - 3-Phase Real Lifecycle)'}")
    print(f"[*] Student Cohort     : {num_students} students (TEST_INST-TEST_BVI-001 to {num_students:03d})")
    print(f"[*] Pages per Student  : {num_pages} pages from '{sample_dir.name}'")
    print(f"[*] Browser Headless   : {not headed}")

    # 2. Build Staggered Dispatch Plan
    cohort = DEFAULT_STUDENTS[:num_students]
    scheduled_tasks = build_dispatch_schedule(
        students=cohort,
        sample_dir=sample_dir,
        pages_per_student=num_pages,
        total_duration_secs=total_duration_secs,
        burst=burst
    )

    print_dispatch_schedule_table(scheduled_tasks, total_duration_secs)

    if dry_run:
        print("[+] DRY-RUN COMPLETE: Schedule, sample assets, and TEST INSTITUTE cohort verified successfully.")
        print("[!] Safety Check Passed: CATCH 25 institute was not accessed.")
        print("[!] No browser instances launched. Ready for live test on command.")
        return

    # 2.5 Pre-authenticate student cohort to mirror active classroom mobile phone sessions
    auth_cache_file = REPORTS_DIR / ".auth_cache.json"
    auth_cache = {}
    if auth_cache_file.exists():
        try:
            with open(auth_cache_file, "r", encoding="utf-8") as f:
                cached_data = json.load(f)
                if time.time() - cached_data.get("_saved_at", 0) < 86400 * 3:  # 3 days
                    auth_cache = cached_data.get("tokens", {})
                    print(f"[*] Loaded {len(auth_cache)} pre-authenticated student sessions from disk cache.")
        except Exception:
            auth_cache = {}

    missing_tasks = [t for t in scheduled_tasks if t.roll_number not in auth_cache]
    if missing_tasks:
        print(f"[*] Pre-authenticating {len(missing_tasks)} student sessions sequentially to mirror active mobile phones...")
        import requests
        for t in missing_tasks:
            try:
                res = requests.post(
                    f"{api_url}/api/v1/auth/login",
                    json={"username": t.roll_number, "password": t.password},
                    timeout=25
                )
                if res.status_code == 200:
                    d = res.json()
                    auth_cache[t.roll_number] = {
                        "token": d.get("access_token"),
                        "user": d.get("user") or {
                            "id": d.get("user_id"),
                            "role": d.get("role", "STUDENT"),
                            "full_name": d.get("full_name"),
                            "institute_id": d.get("institute_id"),
                            "branch_id": d.get("branch_id"),
                        }
                    }
                    print(f"    [+] Pre-authenticated {t.roll_number} ({t.student_name})")
                else:
                    print(f"    [-] Failed to pre-auth {t.roll_number}: HTTP {res.status_code}")
            except Exception as e:
                print(f"    [-] Error pre-authenticating {t.roll_number}: {e}")
            await asyncio.sleep(0.4)

        try:
            with open(auth_cache_file, "w", encoding="utf-8") as f:
                json.dump({"_saved_at": time.time(), "tokens": auth_cache}, f, indent=2)
        except Exception:
            pass

    for task in scheduled_tasks:
        task.auth_data = auth_cache.get(task.roll_number)

    # 3. Initialize Telemetry & Metrics Aggregator
    telemetry_monitor = RenderTelemetryMonitor(
        api_key=render_api_key,
        service_id=render_service_id,
        backend_url=api_url
    )
    aggregator = LoadTestReportAggregator(
        target_exam_title=target_exam_title,
        target_exam_id=target_exam_id,
        total_duration_secs=total_duration_secs
    )

    print("[*] Starting backend and infrastructure telemetry monitoring...")
    telemetry_monitor.start_monitoring()

    # 4. Launch Playwright and Execute Student Sessions
    print(f"[*] Launching Chromium browser (Phone Viewport: 390x844, Scale: 2x)...")
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=not headed,
            args=[
                "--disable-dev-shm-usage",
                "--no-sandbox",
                "--disable-gpu",
                "--disable-background-timer-throttling",
                "--window-size=420,890"
            ]
        )

        print(f"[*] Starting {len(scheduled_tasks)} mobile student sessions across {total_duration_secs} seconds...\n")

        worker_coroutines = [
            simulate_student_session(
                browser=browser,
                task=task,
                frontend_base_url=frontend_url,
                target_exam_id=target_exam_id,
                save_traces_on_success=save_traces
            )
            for task in scheduled_tasks
        ]

        results: List[StudentSessionMetrics] = await asyncio.gather(*worker_coroutines)
        await browser.close()

    # 5. Stop Telemetry Monitoring
    print("\n[*] Stopping backend telemetry monitoring and compiling results...")
    telemetry_data = telemetry_monitor.stop_monitoring()
    aggregator.set_telemetry(telemetry_data)

    for r in results:
        aggregator.add_result(r)

    aggregator.finalize()

    # 6. Print Report & Export Artifacts
    aggregator.print_summary_report()

    timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    csv_path = REPORTS_DIR / f"load_test_results_{timestamp_str}.csv"
    json_path = REPORTS_DIR / f"load_test_results_{timestamp_str}.json"

    aggregator.export_csv(csv_path)
    aggregator.export_json(json_path)

    print("\n" + "=" * 95)
    print(f"[+] CSV Report Exported  : {csv_path}")
    print(f"[+] JSON Report Exported : {json_path}")
    print("=" * 95 + "\n")


def main():
    parser = argparse.ArgumentParser(
        description="PaperGrade AI End-to-End Playwright Mobile Load Test (28 Students - TEST INSTITUTE BVI)"
    )
    parser.add_argument("--frontend-url", default=DEFAULT_FRONTEND_URL, help="Frontend application base URL")
    parser.add_argument("--api-url", default=DEFAULT_API_URL, help="Backend API base URL")
    parser.add_argument("--exam-id", default=None, help="Specific exam ID to submit to")
    parser.add_argument("--exam-title", default=None, help="Exam title search keyword")
    parser.add_argument("--duration", type=int, default=TOTAL_DURATION_SECONDS, help="Total window duration in seconds (default: 900)")
    parser.add_argument("--burst", action="store_true", help="Launch all students simultaneously (no staggering)")
    parser.add_argument("--students", type=int, default=TOTAL_STUDENTS, help="Number of students to simulate (default: 28)")
    parser.add_argument("--pages", type=int, default=DEFAULT_PAGES_PER_STUDENT, help="Number of pages per student (default: 5)")
    parser.add_argument("--sample-dir", type=Path, default=DEFAULT_SAMPLE_PAGES_DIR, help="Path to directory containing sample answer sheet page images")
    parser.add_argument("--headed", action="store_true", help="Run browser with visible UI (headed mode)")
    parser.add_argument("--render-api-key", default=None, help="Render API key for service telemetry")
    parser.add_argument("--render-service-id", default=None, help="Render service ID (e.g. srv-xxxx)")
    parser.add_argument("--save-traces", action="store_true", help="Save Playwright traces even for successful sessions")
    parser.add_argument("--dry-run", action="store_true", help="Validate setup, dispatch plan, and assets without launching browser")

    args = parser.parse_args()

    asyncio.run(
        run_playwright_load_test(
            frontend_url=args.frontend_url,
            api_url=args.api_url,
            exam_id=args.exam_id,
            exam_title=args.exam_title,
            total_duration_secs=args.duration,
            burst=args.burst,
            num_students=args.students,
            num_pages=args.pages,
            sample_dir=args.sample_dir,
            headed=args.headed,
            render_api_key=args.render_api_key,
            render_service_id=args.render_service_id,
            save_traces=args.save_traces,
            dry_run=args.dry_run
        )
    )


if __name__ == "__main__":
    main()
