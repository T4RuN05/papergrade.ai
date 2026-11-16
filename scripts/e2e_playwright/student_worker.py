"""
Single-student Playwright worker for mobile portal end-to-end automation.
Executes 3-phase real-world conduction lifecycle:
- Phase 1: Authentication & pre-exam standby polling (/student/portal)
- Phase 2: Concurrent submission ingestion (canvas assembly + direct cloud / multipart upload)
- Phase 3: Post-upload behavioral divergence (screen-on watchers, script inspection, or exit)
"""

import asyncio
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any
from playwright.async_api import Browser, BrowserContext, Page, Request, Response

from .config import (
    MOBILE_VIEWPORT,
    MOBILE_USER_AGENT,
    DEVICE_SCALE_FACTOR,
    IS_MOBILE,
    HAS_TOUCH,
    NAVIGATION_TIMEOUT_MS,
    ACTION_TIMEOUT_MS,
    SUBMISSION_TIMEOUT_MS,
    SCREENSHOTS_DIR,
    TRACES_DIR
)
from .scheduler import ScheduledStudentTask
from .metrics import StudentSessionMetrics


async def simulate_student_session(
    browser: Browser,
    task: ScheduledStudentTask,
    frontend_base_url: str,
    target_exam_id: Optional[str] = None,
    save_traces_on_success: bool = False
) -> StudentSessionMetrics:
    """
    Simulates a single student on a smartphone through the full 3-phase exam lifecycle:
    1. Scheduled offset dispatch.
    2. Opens isolated mobile BrowserContext.
    3. Authenticates via /auth/login.
    4. Phase 1: Pre-exam standby & portal polling.
    5. Phase 2: Injects 5 camera photos, measures client canvas assembly & direct cloud upload.
    6. Phase 3: Executes assigned post-upload behavior (Group A/B/C).
    7. Records all telemetry, forensic traces, and assertions.
    """
    metrics = StudentSessionMetrics(
        student_index=task.student_index,
        roll_number=task.roll_number,
        student_name=task.student_name,
        scheduled_offset=task.offset_seconds,
        actual_start_offset=0.0,
        group_behavior=task.group_behavior
    )

    # 1. Scheduled Offset Wait
    if task.offset_seconds > 0:
        await asyncio.sleep(task.offset_seconds)

    sim_start_time = time.perf_counter()
    metrics.actual_start_offset = round(sim_start_time, 2)
    timestamp_str = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp_str}] [DISPATCH] Student #{task.student_index:02d} {task.roll_number} ({task.student_name}) launching mobile session (Group {task.group_behavior}: {task.behavior_description})...")

    context: Optional[BrowserContext] = None
    page: Optional[Page] = None

    # Track upload network request state
    current_phase = 1
    submit_clicked_time: Optional[float] = None
    request_dispatched_time: Optional[float] = None
    upload_response_received_time: Optional[float] = None

    try:
        # 2. Create isolated mobile browser context (simulating smartphone)
        context = await browser.new_context(
            viewport=MOBILE_VIEWPORT,
            user_agent=MOBILE_USER_AGENT,
            device_scale_factor=DEVICE_SCALE_FACTOR,
            is_mobile=IS_MOBILE,
            has_touch=HAS_TOUCH
        )
        context.set_default_navigation_timeout(NAVIGATION_TIMEOUT_MS)
        context.set_default_timeout(ACTION_TIMEOUT_MS)

        # Enable Playwright Tracing
        await context.tracing.start(screenshots=True, snapshots=True, sources=True)

        page = await context.new_page()

        # Suppress mobile PWA install banner to avoid UI occlusion during tests
        await page.add_init_script("""
            try {
                sessionStorage.setItem("ios_install_banner_dismissed", "true");
            } catch (e) {}
        """)

        # Telemetry listeners
        page.on("console", lambda msg: metrics.console_errors.append(f"[{msg.type}] {msg.text}") if msg.type in ("error", "warning") else None)
        page.on("requestfailed", lambda req: metrics.failed_requests.append(f"{req.method} {req.url}: {req.failure}"))

        def on_request(request: Request):
            nonlocal request_dispatched_time
            req_url = request.url
            if "/upload-single" in req_url or "/request-upload" in req_url:
                request_dispatched_time = time.perf_counter()
                post_bytes = request.post_data_buffer
                if post_bytes and "/upload-single" in req_url:
                    metrics.generated_pdf_size_bytes = len(post_bytes)
            elif "cloudinary.com" in req_url or "cloudflarestorage.com" in req_url:
                metrics.phase2_direct_cloud = True
                post_bytes = request.post_data_buffer
                if post_bytes and not metrics.generated_pdf_size_bytes:
                    metrics.generated_pdf_size_bytes = len(post_bytes)

        def on_response(response: Response):
            res_url = response.url
            status = response.status
            if "/student/portal-summary" in res_url:
                if current_phase == 1:
                    metrics.phase1_polls_count += 1
                    if status == 304:
                        metrics.phase1_304_count += 1
                    elif status == 200:
                        metrics.phase1_200_count += 1
                elif current_phase == 3:
                    metrics.phase3_polls_count += 1
                    if status == 304:
                        metrics.phase3_304_count += 1

        page.on("request", on_request)
        page.on("response", on_response)

        # 3. STEP: AUTHENTICATION / RESTORE SESSION
        login_start = time.perf_counter()
        if task.auth_data:
            auth_token = task.auth_data.get("token") or task.auth_data.get("access_token")
            user_info = task.auth_data.get("user") or {}
            branch_id = user_info.get("branch_id") or ""
            inst_id = user_info.get("institute_id") or ""

            await page.add_init_script(f"""
                try {{
                    localStorage.setItem("papergrade_jwt", "{auth_token}");
                    localStorage.setItem("papergrade_user", JSON.stringify({json.dumps(user_info)}));
                    if ("{branch_id}") {{
                        localStorage.setItem("papergrade_selected_branch_id", "{branch_id}");
                    }}
                    if ("{inst_id}") {{
                        localStorage.setItem("papergrade_selected_institute_id", "{inst_id}");
                    }}
                    sessionStorage.setItem("ios_install_banner_dismissed", "true");
                }} catch (e) {{}}
            """)

            portal_url = f"{frontend_base_url}/student/portal"
            await page.goto(portal_url, wait_until="domcontentloaded")
            metrics.login_duration_secs = round(time.perf_counter() - login_start, 3)
            metrics.stage_reached = "LOGIN_OK"
            print(f"[{datetime.now().strftime('%H:%M:%S')}] [SESSION RESTORED] {task.roll_number} ({task.student_name}) entered portal with active token in {metrics.login_duration_secs:.2f}s")
        else:
            login_url = f"{frontend_base_url}/auth/login?role=student"
            await page.goto(login_url, wait_until="domcontentloaded")

            student_tab = page.locator("#tab-role-student")
            if await student_tab.is_visible():
                await student_tab.click()

            await page.fill("#login-identifier-input", task.roll_number)
            await page.fill("#login-password-input", task.password)

            login_submit_btn = page.locator("#btn-login-submit")
            await login_submit_btn.click()

            # Wait for redirect to student portal
            await page.wait_for_url("**/student/portal*", timeout=NAVIGATION_TIMEOUT_MS)
            metrics.login_duration_secs = round(time.perf_counter() - login_start, 3)
            metrics.stage_reached = "LOGIN_OK"
            print(f"[{datetime.now().strftime('%H:%M:%S')}] [LOGIN OK] {task.roll_number} authenticated in {metrics.login_duration_secs:.2f}s")

        # 4. PHASE 1: PRE-EXAM STANDBY & POLLING
        current_phase = 1
        p1_start = time.perf_counter()
        if task.phase1_wait_secs > 0:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] [PHASE 1 STANDBY] {task.roll_number} idling on portal for {task.phase1_wait_secs:.1f}s while exam window is prepared...")
            await asyncio.sleep(task.phase1_wait_secs)

        metrics.phase1_duration_secs = round(time.perf_counter() - p1_start, 2)
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [PHASE 1 COMPLETE] {task.roll_number} polled {metrics.phase1_polls_count} times ({metrics.phase1_304_count} HTTP 304s)")

        # 5. PHASE 2: EXAM LOADING & SUBMISSION INGESTION
        current_phase = 2
        metrics.stage_reached = "EXAM_LOADING"
        exam_load_start = time.perf_counter()

        file_input = page.locator('input[type="file"][multiple]').first
        replace_btn = page.locator('button:has-text("Replace Answer Sheet"), button:has-text("Replace"), button:has-text("Re-upload")').first

        ready_locator = file_input.or_(replace_btn)
        await ready_locator.wait_for(state="attached", timeout=ACTION_TIMEOUT_MS)

        try:
            if await replace_btn.is_visible():
                await replace_btn.click()
                print(f"[{datetime.now().strftime('%H:%M:%S')}] [REPLACE CLICKED] {task.roll_number} replacing previous answer sheet.")
        except Exception:
            pass

        await file_input.wait_for(state="attached", timeout=ACTION_TIMEOUT_MS)
        metrics.exam_loading_duration_secs = round(time.perf_counter() - exam_load_start, 3)
        metrics.stage_reached = "EXAM_LOADED"

        # Inject sample images into camera input
        image_paths = [str(p.resolve()) for p in task.sample_images]
        await file_input.set_input_files(image_paths)

        submit_btn = page.locator('button[type="submit"]:has-text("Submit Answer Sheet")').first
        await submit_btn.wait_for(state="visible", timeout=ACTION_TIMEOUT_MS)
        metrics.stage_reached = "IMAGES_INJECTED"
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [PAGES INJECTED] {task.roll_number} staged {len(image_paths)} pages. Starting client assembly...")

        # Trigger client assembly & upload
        submit_clicked_time = time.perf_counter()

        async with page.expect_response(
            lambda res: ("/confirm-upload" in res.url or "/upload-single" in res.url),
            timeout=SUBMISSION_TIMEOUT_MS
        ) as response_info:
            await submit_btn.click()

        upload_response: Response = await response_info.value
        upload_response_received_time = time.perf_counter()
        metrics.http_status = upload_response.status

        if "/confirm-upload" in upload_response.url:
            metrics.phase2_direct_cloud = True

        if request_dispatched_time and submit_clicked_time:
            metrics.pdf_generation_duration_secs = round(request_dispatched_time - submit_clicked_time, 3)

        if request_dispatched_time and upload_response_received_time:
            metrics.upload_duration_secs = round(upload_response_received_time - request_dispatched_time, 3)
        elif submit_clicked_time and upload_response_received_time:
            metrics.upload_duration_secs = round(upload_response_received_time - submit_clicked_time, 3)

        metrics.stage_reached = "UPLOAD"

        if upload_response.status == 200:
            res_data = await upload_response.json()
            metrics.submission_id = res_data.get("submission_id")
            if res_data.get("file_size_bytes"):
                metrics.generated_pdf_size_bytes = int(res_data.get("file_size_bytes"))
            page_count = res_data.get("page_count", len(image_paths))
            pdf_size_kb = f"{(metrics.generated_pdf_size_bytes or 0)/1024:.1f} KB" if metrics.generated_pdf_size_bytes else "N/A"
            method_str = "Direct Cloud (CDN)" if metrics.phase2_direct_cloud else "Server Multipart"
            print(f"[{datetime.now().strftime('%H:%M:%S')}] [UPLOAD OK] {task.roll_number} -> HTTP 200 via {method_str} in {metrics.upload_duration_secs:.2f}s | Assembled in {metrics.pdf_generation_duration_secs or 0:.2f}s | Size: {pdf_size_kb} | Pages: {page_count} | Sub ID: {metrics.submission_id}")
        else:
            err_text = await upload_response.text()
            raise RuntimeError(f"Server returned HTTP {upload_response.status}: {err_text[:200]}")

        # Assert UI confirmation banner
        confirm_locator = page.locator('text=/Answer sheet (uploaded|replaced) successfully!/').or_(page.locator('text=Submission Received')).or_(page.locator('.bg-green-50'))
        await confirm_locator.first.wait_for(state="visible", timeout=ACTION_TIMEOUT_MS)
        metrics.submission_confirmed = True
        metrics.stage_reached = "CONFIRMED"

        # 6. PHASE 3: POST-UPLOAD BEHAVIORAL DIVERGENCE
        current_phase = 3
        p3_start = time.perf_counter()

        if task.group_behavior == "A":
            # Group A: Screen-ON Watcher (Stays on portal, polls continuously)
            stay_duration = min(task.post_upload_stay_secs, 120.0)  # capped for reasonable test cycle
            print(f"[{datetime.now().strftime('%H:%M:%S')}] [PHASE 3 GROUP A] {task.roll_number} keeping screen on / portal active for {stay_duration:.0f}s...")
            await asyncio.sleep(stay_duration)

        elif task.group_behavior == "B":
            # Group B: Script Inspector (Navigates to /student/submissions/[id], checks PDF canvas viewer)
            if metrics.submission_id:
                sub_url = f"{frontend_base_url}/student/submissions/{metrics.submission_id}"
                print(f"[{datetime.now().strftime('%H:%M:%S')}] [PHASE 3 GROUP B] {task.roll_number} navigating to script viewer: {sub_url}...")
                v_start = time.perf_counter()
                await page.goto(sub_url, wait_until="domcontentloaded")

                # Wait for DocumentViewer or canvas to mount
                canvas_locator = page.locator("canvas").first
                await canvas_locator.wait_for(state="visible", timeout=ACTION_TIMEOUT_MS)
                metrics.phase3_viewer_latency_secs = round(time.perf_counter() - v_start, 2)
                metrics.phase3_viewer_success = True
                print(f"[{datetime.now().strftime('%H:%M:%S')}] [VIEWER OK] {task.roll_number} rendered PDF canvas in {metrics.phase3_viewer_latency_secs:.2f}s!")

                # Idle on viewer page for a few moments
                await asyncio.sleep(min(task.post_upload_stay_secs, 30.0))

        elif task.group_behavior == "C":
            # Group C: Browser & Exiter (Clicks past exams tab, waits 15-30s, then exits)
            print(f"[{datetime.now().strftime('%H:%M:%S')}] [PHASE 3 GROUP C] {task.roll_number} browsing portal tabs and exiting...")
            try:
                past_exams_tab = page.locator('button:has-text("Past Exams"), a:has-text("Past Exams")').first
                if await past_exams_tab.is_visible():
                    await past_exams_tab.click()
            except Exception:
                pass
            await asyncio.sleep(min(task.post_upload_stay_secs, 20.0))

        metrics.phase3_duration_secs = round(time.perf_counter() - p3_start, 2)
        metrics.success = True
        metrics.stage_reached = "COMPLETED"

        total_elapsed = time.perf_counter() - sim_start_time
        metrics.total_e2e_duration_secs = round(total_elapsed, 3)
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [SUCCESS] {task.roll_number} completed full 3-phase flow in {metrics.total_e2e_duration_secs:.2f}s!")

        if save_traces_on_success:
            trace_path = TRACES_DIR / f"{task.roll_number}_success_trace.zip"
            await context.tracing.stop(path=str(trace_path))
            metrics.trace_path = str(trace_path)
        else:
            await context.tracing.stop()

    except Exception as e:
        total_elapsed = time.perf_counter() - sim_start_time
        metrics.total_e2e_duration_secs = round(total_elapsed, 3)
        metrics.success = False
        metrics.error_message = str(e)
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [FAILED] {task.roll_number} failed at stage '{metrics.stage_reached}': {e}")

        if page:
            try:
                screenshot_path = SCREENSHOTS_DIR / f"{task.roll_number}_failure.png"
                await page.screenshot(path=str(screenshot_path), full_page=True)
                metrics.screenshot_path = str(screenshot_path)
                print(f"    --> Saved failure screenshot: {screenshot_path}")
            except Exception as ss_err:
                print(f"    --> Failed to capture screenshot: {ss_err}")

        if context:
            try:
                trace_path = TRACES_DIR / f"{task.roll_number}_trace.zip"
                await context.tracing.stop(path=str(trace_path))
                metrics.trace_path = str(trace_path)
                print(f"    --> Saved failure trace: {trace_path}")
            except Exception as tr_err:
                print(f"    --> Failed to capture trace: {tr_err}")

    finally:
        if context:
            try:
                await context.close()
            except Exception:
                pass

    return metrics
