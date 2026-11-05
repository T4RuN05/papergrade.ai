"""
Single-student Playwright worker for mobile portal end-to-end automation.
Executes login, exam loading, camera image injection, client-side PDF assembly tracking,
multipart upload interception, confirmation assertion, and forensic trace capture.
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
    Simulates a single student on a mobile phone:
    1. Waits for their scheduled dispatch offset.
    2. Opens a dedicated isolated mobile BrowserContext.
    3. Authenticates via /auth/login.
    4. Navigates to /student/portal and loads the active exam card.
    5. Injects sample handwritten page images into the camera file input.
    6. Triggers and measures client-side PDF compilation (pdf-lib / canvas).
    7. Measures upload latency, response status, and UI confirmation banner.
    8. Records console logs, failed requests, screenshots, and Playwright traces on error.
    """
    metrics = StudentSessionMetrics(
        student_index=task.student_index,
        roll_number=task.roll_number,
        student_name=task.student_name,
        scheduled_offset=task.offset_seconds,
        actual_start_offset=0.0
    )

    # 1. Scheduled Offset Wait
    if task.offset_seconds > 0:
        await asyncio.sleep(task.offset_seconds)

    sim_start_time = time.perf_counter()
    metrics.actual_start_offset = round(sim_start_time, 2)
    timestamp_str = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp_str}] [DISPATCH] Student #{task.student_index:02d} {task.roll_number} ({task.student_name}) launching mobile session after {task.offset_seconds:.1f}s offset...")

    context: Optional[BrowserContext] = None
    page: Optional[Page] = None

    # Track upload network request state
    request_dispatched_time: Optional[float] = None
    submit_clicked_time: Optional[float] = None
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

        # Telemetry listeners
        page.on("console", lambda msg: metrics.console_errors.append(f"[{msg.type}] {msg.text}") if msg.type in ("error", "warning") else None)
        page.on("requestfailed", lambda req: metrics.failed_requests.append(f"{req.method} {req.url}: {req.failure}"))

        # Intercept outgoing multipart upload request
        def on_request(request: Request):
            nonlocal request_dispatched_time
            if "/upload-single" in request.url:
                request_dispatched_time = time.perf_counter()
                post_bytes = request.post_data_buffer
                if post_bytes:
                    metrics.generated_pdf_size_bytes = len(post_bytes)

        page.on("request", on_request)

        # 3. STEP: LOGIN
        login_url = f"{frontend_base_url}/auth/login?role=student"
        await page.goto(login_url, wait_until="domcontentloaded")

        # Ensure student role tab is active
        student_tab = page.locator("#tab-role-student")
        if await student_tab.is_visible():
            await student_tab.click()

        # Fill credentials
        await page.fill("#login-identifier-input", task.roll_number)
        await page.fill("#login-password-input", task.password)

        # Measure login submit latency
        login_submit_btn = page.locator("#btn-login-submit")
        login_start = time.perf_counter()
        await login_submit_btn.click()

        # Wait for redirect to student portal
        await page.wait_for_url("**/student/portal*", timeout=NAVIGATION_TIMEOUT_MS)
        metrics.login_duration_secs = round(time.perf_counter() - login_start, 3)
        metrics.stage_reached = "LOGIN_OK"
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [LOGIN OK] {task.roll_number} authenticated in {metrics.login_duration_secs:.2f}s")

        # 4. STEP: EXAM & SUBMISSION WINDOW LOADING
        metrics.stage_reached = "EXAM_LOADING"
        exam_load_start = time.perf_counter()

        # Wait for the exam card to mount in the DOM
        card_header = page.locator('text=KTG PROD TEST').or_(page.locator('text=Submission Window Open')).or_(page.locator('text=TIME REMAINING'))
        await card_header.first.wait_for(state="visible", timeout=ACTION_TIMEOUT_MS)

        # If multiple exam windows are open and target_exam_id is specified, select that exam
        if target_exam_id:
            exam_btn = page.locator(f'button:has-text("{target_exam_id}")')
            if await exam_btn.is_visible():
                await exam_btn.click()

        # If student has a previous submission, click 'Replace Answer Sheet' to reveal file upload form
        replace_btn = page.locator('button:has-text("Replace Answer Sheet"), button:has-text("Replace"), button:has-text("Re-upload")')
        try:
            if await replace_btn.first.is_visible():
                await replace_btn.first.click()
            else:
                await replace_btn.first.wait_for(state="visible", timeout=2500)
                await replace_btn.first.click()
        except Exception:
            pass

        # Wait for either file input or active window card in DOM
        file_input_selector = 'input[type="file"][multiple], input[type="file"]'
        await page.wait_for_selector(file_input_selector, state="attached", timeout=ACTION_TIMEOUT_MS)
        metrics.exam_loading_duration_secs = round(time.perf_counter() - exam_load_start, 3)
        metrics.stage_reached = "EXAM_LOADED"
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [EXAM LOADED] {task.roll_number} active window ready in {metrics.exam_loading_duration_secs:.2f}s")

        # 5. STEP: CAMERA MOCK VIA SAMPLE IMAGE INJECTION
        image_paths = [str(p.resolve()) for p in task.sample_images]
        file_input = page.locator('input[type="file"][multiple]').first

        # Inject sample images
        await file_input.set_input_files(image_paths)

        # Wait for scanned pages list to render in the DOM
        # Frontend shows: button[type="submit"]:has-text("Submit Answer Sheet")
        submit_btn = page.locator('button[type="submit"]:has-text("Submit Answer Sheet")')
        await submit_btn.wait_for(state="visible", timeout=ACTION_TIMEOUT_MS)
        metrics.stage_reached = "IMAGES_INJECTED"
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [PAGES INJECTED] {task.roll_number} staged {len(image_paths)} pages.")

        # 6. STEP: CLIENT PDF ASSEMBLY & MULTIPART UPLOAD
        submit_clicked_time = time.perf_counter()

        # Wait for the upload response to complete
        async with page.expect_response(
            lambda res: "/upload-single" in res.url,
            timeout=SUBMISSION_TIMEOUT_MS
        ) as response_info:
            await submit_btn.click()

        upload_response: Response = await response_info.value
        upload_response_received_time = time.perf_counter()

        metrics.http_status = upload_response.status

        # Calculate Assembly and Upload Latencies
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
            page_count = res_data.get("page_count", len(image_paths))
            print(f"[{datetime.now().strftime('%H:%M:%S')}] [UPLOAD OK] {task.roll_number} -> HTTP 200 in {metrics.upload_duration_secs:.2f}s | Assembled in {metrics.pdf_generation_duration_secs or 0:.2f}s | Pages: {page_count} | Sub ID: {metrics.submission_id}")
        else:
            err_text = await upload_response.text()
            raise RuntimeError(f"Server returned HTTP {upload_response.status}: {err_text[:200]}")

        # 7. STEP: SUBMISSION CONFIRMATION IN UI
        # Wait for "Answer sheet uploaded/replaced successfully!" success banner or toast
        confirm_locator = page.locator('text=/Answer sheet (uploaded|replaced) successfully!/').or_(page.locator('text=Submission Received')).or_(page.locator('.bg-green-50'))
        await confirm_locator.first.wait_for(state="visible", timeout=ACTION_TIMEOUT_MS)
        metrics.submission_confirmed = True
        metrics.stage_reached = "CONFIRMED"
        metrics.success = True

        total_elapsed = time.perf_counter() - sim_start_time
        metrics.total_e2e_duration_secs = round(total_elapsed, 3)
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [SUCCESS] {task.roll_number} finished complete mobile flow in {metrics.total_e2e_duration_secs:.2f}s!")

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

        # Save Screenshot on failure
        if page:
            try:
                screenshot_path = SCREENSHOTS_DIR / f"{task.roll_number}_failure.png"
                await page.screenshot(path=str(screenshot_path), full_page=True)
                metrics.screenshot_path = str(screenshot_path)
                print(f"    --> Saved failure screenshot: {screenshot_path}")
            except Exception as ss_err:
                print(f"    --> Failed to capture screenshot: {ss_err}")

        # Save Playwright Trace on failure
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

