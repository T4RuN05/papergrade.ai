"""
Main CLI Orchestrator: PaperGrade AI End-to-End Playwright Mobile Load Test.
Simulates 22 Catch 25 Borivali students submitting answer sheets through the mobile frontend
staggered over a 5-minute front-heavy arrival schedule (Beta distribution).

Usage Examples:
  # Validate schedule, sample images, and accounts without running browser:
  python scripts/simulate_playwright_e2e_load.py --dry-run

  # Run full 22-student mobile load test against local frontend:
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
    C25_BORIVALI_STUDENTS
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
    """Auto-detect active exam and submission window via database or backend API."""
    try:
        from backend.app.db.session import get_session
        from backend.app.db.models.academic import Exam, SubmissionWindow

        with get_session() as session:
            # Look for active OPEN submission window
            window = (
                session.query(SubmissionWindow)
                .filter(SubmissionWindow.status == "OPEN")
                .order_by(SubmissionWindow.created_at.desc())
                .first()
            )
            if window:
                exam = session.query(Exam).filter(Exam.id == window.exam_id).first()
                if exam:
                    return {
                        "id": exam.id,
                        "title": exam.title,
                        "window_id": window.id,
                        "deadline_at": window.deadline_at,
                        "grace_deadline_at": window.grace_deadline_at,
                    }
    except Exception as e:
        print(f"[!] Database window lookup fallback: {e}")

    # Fallback to direct HTTP check
    import requests
    try:
        res = requests.get(f"{api_url}/api/v1/exams", timeout=5.0)
        if res.status_code == 200:
            exams = res.json()
            if exams:
                latest = exams[0]
                return {
                    "id": latest["id"],
                    "title": latest.get("title", "Active Examination"),
                    "window_id": "auto",
                    "deadline_at": "active",
                    "grace_deadline_at": "active"
                }
    except Exception:
        pass

    return {
        "id": "a2ffa699-4dd1-4fe6-b418-37b356799d5f",
        "title": "KTG Physics Exam",
        "window_id": "default",
        "deadline_at": "unknown",
        "grace_deadline_at": "unknown"
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
    print("=" * 90)
    print("PAPERGRADE AI — 22-STUDENT MOBILE E2E PLAYWRIGHT LOAD TEST")
    print("=" * 90)

    # 1. Detect target exam & active submission window
    exam_info = auto_detect_active_exam(api_url)
    target_exam_id = exam_id or exam_info["id"]
    target_exam_title = exam_title or exam_info["title"]

    print(f"[*] Target Exam        : '{target_exam_title}' (ID: {target_exam_id})")
    print(f"[*] Frontend Web URL   : {frontend_url}")
    print(f"[*] Backend API URL    : {api_url}")
    print(f"[*] Simulation Mode    : {'BURST (all concurrent)' if burst else f'STAGGERED ({total_duration_secs}s / {total_duration_secs/60:.1f}m - Front-heavy Beta Curve)'}")
    print(f"[*] Student Cohort     : {num_students} students from Catch 25 Borivali (C25-BVI-001 to C25-BVI-{num_students:03d})")
    print(f"[*] Pages per Student  : {num_pages} pages from '{sample_dir.name}'")
    print(f"[*] Browser Headless   : {not headed}")

    # 2. Build Staggered Dispatch Plan
    cohort = C25_BORIVALI_STUDENTS[:num_students]
    scheduled_tasks = build_dispatch_schedule(
        students=cohort,
        sample_dir=sample_dir,
        pages_per_student=num_pages,
        total_duration_secs=total_duration_secs,
        burst=burst
    )

    print_dispatch_schedule_table(scheduled_tasks, total_duration_secs)

    if dry_run:
        print("[+] DRY-RUN COMPLETE: Schedule, sample assets, and cohort verified successfully.")
        print("[!] No browser instances launched. Ready for live test on command.")
        return

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
                "--disable-background-timer-throttling"
            ]
        )

        print(f"[*] Starting {len(scheduled_tasks)} mobile student sessions across {total_duration_secs} seconds...\n")
        start_clock = time.perf_counter()

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
        description="PaperGrade AI End-to-End Playwright Mobile Load Test (22 Concurrent Students)"
    )
    parser.add_argument("--frontend-url", default=DEFAULT_FRONTEND_URL, help="Frontend application base URL")
    parser.add_argument("--api-url", default=DEFAULT_API_URL, help="Backend API base URL")
    parser.add_argument("--exam-id", default=None, help="Specific exam ID to submit to")
    parser.add_argument("--exam-title", default=None, help="Exam title search keyword")
    parser.add_argument("--duration", type=int, default=TOTAL_DURATION_SECONDS, help="Total window duration in seconds (default: 300)")
    parser.add_argument("--burst", action="store_true", help="Launch all students simultaneously (no staggering)")
    parser.add_argument("--students", type=int, default=TOTAL_STUDENTS, help="Number of students to simulate (default: 22)")
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

