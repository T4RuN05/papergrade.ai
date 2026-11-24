import time
import json
import threading
from enum import Enum
from pathlib import Path
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
import random
from sqlalchemy.orm import Session
from sqlalchemy import select, update, func, or_

from backend.app.config import settings
from backend.app.db.session import get_session
from backend.app.db.base import get_iso_now
from backend.app.db.models import (
    Submission,
    EvaluationQueue,
    RubricVersion,
    Batch,
    Exam,
    Answer,
)
from backend.app.services.storage import get_storage_service
from backend.app.services.grading_service import grading_service
from backend.app.gemini.client import (
    gemini_client,
    AllGeminiKeysExhaustedError,
)
from backend.app.services.notification_service import notify_branch_managers, notify_root_admins


class WorkerState(str, Enum):
    DORMANT = "DORMANT"       # Zero worker threads. Zero DB queries.
    STARTING = "STARTING"     # Transitioning, recovering stale jobs.
    ACTIVE = "ACTIVE"         # Actively pulling & processing evaluation jobs.
    DRAINING = "DRAINING"     # No QUEUED jobs left; awaiting in-flight jobs to complete.


class PersistentQueueWorker:
    def __init__(self, poll_interval_sec: float = 3.0, max_workers: Optional[int] = None):
        self.poll_interval_sec = poll_interval_sec
        configured_keys = len(settings.configured_api_keys)
        default_workers = getattr(settings, "MAX_EVALUATION_WORKERS", 1)
        self.num_workers = max(1, min(default_workers, max(1, configured_keys))) if max_workers is None else max(1, max_workers)
        
        self.state: WorkerState = WorkerState.DORMANT
        self._threads: List[threading.Thread] = []
        self._claim_lock = threading.Lock()
        self._lifecycle_lock = threading.Lock()
        self._wake_event = threading.Event()

        # Guarantee B: Background Safety Net Heartbeat (Runs every 30 minutes, < 0.5 MB/mo)
        self._heartbeat_thread: Optional[threading.Thread] = None
        self._heartbeat_stop = threading.Event()

    @property
    def running(self) -> bool:
        return self.state in (WorkerState.ACTIVE, WorkerState.DRAINING, WorkerState.STARTING)

    @running.setter
    def running(self, value: bool):
        if not value:
            self.state = WorkerState.DORMANT
        elif self.state == WorkerState.DORMANT:
            self.state = WorkerState.ACTIVE

    def has_pending_jobs(self) -> bool:
        """Checks if any submissions are currently in QUEUED, PROCESSING, or PAUSED_QUOTA state."""
        try:
            with get_session() as session:
                count = session.scalar(
                    select(func.count(Submission.id))
                    .where(Submission.status.in_(('QUEUED', 'PROCESSING', 'PAUSED_QUOTA')))
                )
                return bool(count and count > 0)
        except Exception as e:
            print(f"[QueueWorker] Error checking pending jobs: {e}")
            return False

    def wake_up(self):
        """
        Wakes up the worker pool on-demand when an evaluation batch starts.
        Thread-safe, idempotent, and guarantees zero duplicate threads.
        """
        with self._lifecycle_lock:
            # If in DRAINING state, resume active workers immediately
            if self.state == WorkerState.DRAINING:
                self.state = WorkerState.ACTIVE
                self._wake_event.set()
                print("[QueueWorker] New batch arrived while draining. Resumed to ACTIVE state.")
                return

            # If already active, trigger wake_event to interrupt any idle sleep
            if self.state in (WorkerState.ACTIVE, WorkerState.STARTING):
                self._wake_event.set()
                print("[QueueWorker] Worker pool is already active; triggered immediate wake event.")
                return

            print("[QueueWorker] Waking up worker pool on-demand for evaluation batch...")
            self._start_locked()

    def start(self):
        """Backward-compatible entry point for explicit worker start."""
        with self._lifecycle_lock:
            if self.running:
                return
            self._start_locked()

    def _start_locked(self):
        """Internal helper to start threads while holding _lifecycle_lock."""
        # 1. Clean up and join any lingering dead threads
        for t in self._threads:
            if t.is_alive():
                t.join(timeout=2.0)
        self._threads = []

        self.state = WorkerState.STARTING
        self._wake_event.clear()

        # Stale-only recovery: only reclaim jobs abandoned for > 15 min
        try:
            self.recover_stalled_jobs(stale_only=True, max_stale_minutes=15)
        except Exception as e:
            print(f"[QueueWorker] Error during stale job recovery on wake: {e}")

        self.state = WorkerState.ACTIVE
        for i in range(self.num_workers):
            t = threading.Thread(target=self._run_worker_loop, args=(i,), daemon=True, name=f"QueueWorker-{i}")
            t.start()
            self._threads.append(t)

        watchdog = threading.Thread(target=self._run_watchdog_loop, daemon=True, name="QueueWorker-Watchdog")
        watchdog.start()
        self._threads.append(watchdog)

        print(f"[QueueWorker] Worker pool ACTIVE with {self.num_workers} parallel worker(s) and 1 watchdog.")

    def stop(self):
        with self._lifecycle_lock:
            self.state = WorkerState.DORMANT
            self._wake_event.set()
            for t in self._threads:
                if t.is_alive():
                    t.join(timeout=3.0)
            self._threads = []
            print("[QueueWorker] Background worker pool stopped (DORMANT).")

    def start_safety_heartbeat(self):
        """Starts the ultra-low-frequency 30-minute safety net daemon."""
        if self._heartbeat_thread and self._heartbeat_thread.is_alive():
            return
        self._heartbeat_stop.clear()
        self._heartbeat_thread = threading.Thread(
            target=self._run_safety_heartbeat_loop,
            daemon=True,
            name="QueueWorker-SafetyHeartbeat"
        )
        self._heartbeat_thread.start()
        print("[QueueWorker] Safety net heartbeat started (runs every 30m to catch orphaned jobs).")

    def stop_safety_heartbeat(self):
        """Stops the safety net heartbeat."""
        self._heartbeat_stop.set()
        if self._heartbeat_thread and self._heartbeat_thread.is_alive():
            self._heartbeat_thread.join(timeout=2.0)
        self._heartbeat_thread = None

    def _run_safety_heartbeat_loop(self):
        """
        Runs once every 30 minutes (only 48 checks/day = ~0.45 MB/month egress).
        If the worker is DORMANT but orphan QUEUED jobs exist, it self-heals by waking up.
        """
        # Initial 60-second grace period after server boot
        if self._heartbeat_stop.wait(60.0):
            return

        while not self._heartbeat_stop.is_set():
            try:
                # Only check if currently dormant (if active, normal worker is already grading)
                if self.state == WorkerState.DORMANT:
                    if self.has_pending_jobs():
                        print("[QueueWorker-SafetyHeartbeat] Detected orphan jobs while DORMANT. Self-healing: waking worker pool...")
                        self.wake_up()
            except Exception as e:
                print(f"[QueueWorker-SafetyHeartbeat] Heartbeat check failed: {e}")

            # Wait 30 minutes (1800 seconds)
            if self._heartbeat_stop.wait(1800.0):
                break

    def recover_stalled_jobs(self, stale_only: bool = False, max_stale_minutes: int = 15):
        """
        On worker startup or periodic watchdog, reset jobs stuck in 'PROCESSING'
        back to 'QUEUED' so they are not abandoned.
        When stale_only=True, only resets jobs older than max_stale_minutes.
        Caps retry attempts at 3 to prevent infinite crash loops.
        """
        now = get_iso_now()
        with get_session() as session:
            if stale_only:
                cutoff = (datetime.now(timezone.utc) - timedelta(minutes=max_stale_minutes)).isoformat()
                
                # 1. Fail jobs that exceeded retry cap (>= 3 attempts)
                fail_stmt = (
                    update(Submission)
                    .where(
                        Submission.status == 'PROCESSING',
                        or_(Submission.updated_at.is_(None), Submission.updated_at < cutoff),
                        Submission.retry_count >= 3
                    )
                    .values(
                        status='FAILED',
                        error_message='Evaluation timed out / stalled after 3 retries',
                        updated_at=now
                    )
                )
                fail_res = session.execute(fail_stmt)
                if fail_res.rowcount > 0:
                    session.execute(
                        update(EvaluationQueue)
                        .where(
                            EvaluationQueue.status == 'PROCESSING',
                            or_(EvaluationQueue.updated_at.is_(None), EvaluationQueue.updated_at < cutoff),
                            EvaluationQueue.attempt_count >= 3
                        )
                        .values(
                            status='FAILED',
                            last_error='Evaluation timed out / stalled after 3 retries',
                            updated_at=now
                        )
                    )
                    print(f"[QueueWorker] Watchdog marked {fail_res.rowcount} exhausted job(s) as FAILED.")

                # 2. Requeue recoverable jobs (< 3 attempts)
                stmt = (
                    update(Submission)
                    .where(
                        Submission.status == 'PROCESSING',
                        or_(Submission.updated_at.is_(None), Submission.updated_at < cutoff),
                        Submission.retry_count < 3
                    )
                    .values(
                        status='QUEUED',
                        retry_count=Submission.retry_count + 1,
                        updated_at=now
                    )
                )
                res = session.execute(stmt)
                sub_count = res.rowcount
                if sub_count > 0:
                    session.execute(
                        update(EvaluationQueue)
                        .where(
                            EvaluationQueue.status == 'PROCESSING',
                            or_(EvaluationQueue.updated_at.is_(None), EvaluationQueue.updated_at < cutoff),
                            EvaluationQueue.attempt_count < 3
                        )
                        .values(
                            status='QUEUED',
                            attempt_count=EvaluationQueue.attempt_count + 1,
                            updated_at=now
                        )
                    )
                    print(f"[QueueWorker] Watchdog recovered {sub_count} stalled job(s) back to QUEUED.")
            else:
                stmt = (
                    update(Submission)
                    .where(Submission.status == 'PROCESSING')
                    .values(status='QUEUED', updated_at=now)
                )
                res = session.execute(stmt)
                sub_count = res.rowcount
                if sub_count > 0:
                    session.execute(
                        update(EvaluationQueue)
                        .where(EvaluationQueue.status == 'PROCESSING')
                        .values(status='QUEUED', updated_at=now)
                    )
                    print(f"[QueueWorker] Recovered {sub_count} stalled job(s) back to QUEUED.")

            batch_res = session.execute(
                update(Batch)
                .where(Batch.status == 'PAUSED_QUOTA')
                .values(status='PROCESSING', updated_at=now)
            )
            batch_count = batch_res.rowcount
            if batch_count > 0:
                print(f"[QueueWorker] Resumed {batch_count} quota-paused batch(es) back to PROCESSING.")

            session.commit()

    def _run_watchdog_loop(self):
        """Runs every 60 seconds while worker is active to detect and recover stuck jobs in PROCESSING."""
        while self.state in (WorkerState.ACTIVE, WorkerState.DRAINING):
            time.sleep(60.0)
            if self.state not in (WorkerState.ACTIVE, WorkerState.DRAINING):
                break
            try:
                self.recover_stalled_jobs(stale_only=True, max_stale_minutes=15)
            except Exception as e:
                print(f"[QueueWorker-Watchdog] Error in watchdog loop: {e}")

    def _run_worker_loop(self, worker_id: int):
        time.sleep(worker_id * 0.75)
        while self.state in (WorkerState.ACTIVE, WorkerState.DRAINING):
            try:
                processed = self.process_next_job(worker_id=worker_id)
                if processed:
                    # Enforce guaranteed 4.12s inter-request spacing to stay strictly within Gemini Free 15 RPM limit
                    time.sleep(4.12)
                else:
                    # No job claimed by this worker. Check if all queued and processing jobs are completely finished.
                    with self._lifecycle_lock:
                        if self.state in (WorkerState.ACTIVE, WorkerState.DRAINING):
                            if not self.has_pending_jobs():
                                self.state = WorkerState.DORMANT
                                self._wake_event.set()
                                print(
                                    f"[QueueWorker-{worker_id}] Evaluation queue empty (0 QUEUED/PROCESSING). "
                                    f"Worker entering dormant sleep (0 DB queries)."
                                )
                                break
                            else:
                                self.state = WorkerState.DRAINING

                    # If other workers are still processing jobs, sleep briefly or wait for wake event
                    self._wake_event.wait(timeout=self.poll_interval_sec)
                    self._wake_event.clear()
            except Exception as e:
                print(f"[QueueWorker-{worker_id}] Unexpected loop error: {e}")
                time.sleep(self.poll_interval_sec)

    def _claim_next_job(self, worker_id: int = 0) -> Optional[Dict[str, Any]]:
        """Claims a single submission using FIFO ordering (Roll number, created_at)."""
        now = get_iso_now()
        with self._claim_lock:
            with get_session() as session:
                sub = session.scalar(
                    select(Submission)
                    .where(Submission.status == 'QUEUED')
                    .order_by(Submission.roll_number.asc(), Submission.created_at.asc())
                    .with_for_update(skip_locked=True)
                    .limit(1)
                )
                if not sub:
                    return None

                job = {
                    "id": sub.id,
                    "exam_id": sub.exam_id,
                    "batch_id": sub.batch_id,
                    "canonical_pdf_path": sub.canonical_pdf_path,
                    "page_count": sub.page_count,
                    "retry_count": sub.retry_count or 0,
                    "roll_number": sub.roll_number,
                }
                sub.status = 'PROCESSING'
                sub.updated_at = now

                if sub.batch_id:
                    batch = session.scalar(select(Batch).where(Batch.id == sub.batch_id))
                    if batch and batch.status in ('QUEUED', 'PAUSED_QUOTA'):
                        batch.status = 'PROCESSING'
                        batch.updated_at = now

                session.execute(
                    update(EvaluationQueue)
                    .where(EvaluationQueue.submission_id == sub.id)
                    .values(
                        status='PROCESSING',
                        claimed_by_worker=f"worker-{worker_id}",
                        claimed_at=now,
                        updated_at=now
                    )
                )
                session.commit()
                return job

    def process_next_job(self, worker_id: int = 0) -> bool:
        """
        Processes 1 submission end-to-end via Single-Pass Multimodal Grading:
        Student PDF + Approved Rubric JSON -> 1 Gemini API call per student.
        """
        job = self._claim_next_job(worker_id=worker_id)
        if not job:
            return False

        submission_id = job["id"]
        exam_id = job["exam_id"]
        batch_id = job["batch_id"]
        now = get_iso_now()

        # 1. Fetch approved rubric for this exam
        with get_session() as session:
            r_row = session.scalar(
                select(RubricVersion)
                .where(RubricVersion.exam_id == exam_id, RubricVersion.is_approved == 1)
                .order_by(RubricVersion.version_num.desc())
                .limit(1)
            )
            if not r_row or not r_row.rubric_data:
                err_msg = f"No approved rubric found for exam {exam_id}. Cannot grade."
                print(f"[QueueWorker-{worker_id}] ERROR: {err_msg}")
                with get_session() as sess:
                    sess.execute(update(Submission).where(Submission.id == submission_id).values(status='FAILED', error_message=err_msg, updated_at=now))
                    sess.execute(update(EvaluationQueue).where(EvaluationQueue.submission_id == submission_id).values(status='FAILED', last_error=err_msg, updated_at=now))
                    sess.commit()
                if batch_id:
                    self._update_batch_progress(batch_id)
                self._update_exam_evaluation_status(exam_id)
                return True

            rubric_data = json.loads(r_row.rubric_data)

        # 2. Get local PDF path
        raw_pdf = job["canonical_pdf_path"]
        pdf_path = Path(raw_pdf) if raw_pdf else None
        if not pdf_path or not pdf_path.is_file() or not pdf_path.exists():
            storage = get_storage_service()
            pdf_path = storage.get_local_path_or_download(raw_pdf)

        if not pdf_path or not Path(pdf_path).exists():
            err_msg = f"Canonical PDF missing or unreadable at {raw_pdf}."
            print(f"[QueueWorker-{worker_id}] ERROR: {err_msg}")
            with get_session() as sess:
                sess.execute(update(Submission).where(Submission.id == submission_id).values(status='FAILED', error_message=err_msg, updated_at=now))
                sess.execute(update(EvaluationQueue).where(EvaluationQueue.submission_id == submission_id).values(status='FAILED', last_error=err_msg, updated_at=now))
                sess.commit()
            if batch_id:
                self._update_batch_progress(batch_id)
            self._update_exam_evaluation_status(exam_id)
            return True

        # 3. Single-Pass Multimodal Grading Call & Invariant Enforcement
        try:
            # Heartbeat: touch updated_at right before calling model so watchdog recognizes active processing
            active_now = get_iso_now()
            with get_session() as sess:
                sess.execute(update(Submission).where(Submission.id == submission_id).values(updated_at=active_now))
                sess.execute(update(EvaluationQueue).where(EvaluationQueue.submission_id == submission_id).values(updated_at=active_now))
                sess.commit()

            grading_result, usage_event_id = gemini_client.grade_student_submission(
                exam_id=exam_id,
                batch_id=batch_id,
                submission_id=submission_id,
                student_pdf_path=pdf_path,
                rubric_json=rubric_data,
                page_count=job.get("page_count", 1),
                worker_id=worker_id,
            )

            # 4. Enforce Invariants and Save within the same safe execution boundary
            grading_service.enforce_invariants_and_save(
                submission_id=submission_id,
                exam_id=exam_id,
                grading_result=grading_result,
                rubric_data=rubric_data,
            )

            now_str = get_iso_now()
            with get_session() as sess:
                sess.execute(
                    update(EvaluationQueue)
                    .where(EvaluationQueue.submission_id == submission_id)
                    .values(status='COMPLETED', updated_at=now_str)
                )
                sess.commit()

            if batch_id:
                self._update_batch_progress(batch_id)

            self._update_exam_evaluation_status(exam_id)
            print(f"[QueueWorker-{worker_id}] Successfully evaluated submission {submission_id} (Roll: {job.get('roll_number')}).")
            return True
        except AllGeminiKeysExhaustedError as quota_err:
            err_msg = str(quota_err)
            print(f"[QueueWorker-{worker_id}] QUOTA LIMIT REACHED across all keys: {err_msg}")
            now_str = get_iso_now()
            with get_session() as sess:
                sess.execute(
                    update(Submission)
                    .where(Submission.id == submission_id)
                    .values(
                        status='QUEUED',
                        retry_count=0,
                        error_message=f"Quota Paused: {err_msg[:200]}",
                        updated_at=now_str
                    )
                )
                sess.execute(
                    update(EvaluationQueue)
                    .where(EvaluationQueue.submission_id == submission_id)
                    .values(
                        status='QUEUED',
                        last_error=f"Quota Paused: {err_msg[:200]}",
                        updated_at=now_str
                    )
                )
                if batch_id:
                    sess.execute(
                        update(Batch)
                        .where(Batch.id == batch_id)
                        .values(status='PAUSED_QUOTA', updated_at=now_str)
                    )
                sess.commit()

            print(f"[QueueWorker-{worker_id}] Pausing worker loop for 30s cooldown to allow quota reset...")
            time.sleep(30.0)
            return False

        except Exception as grading_err:
            err_msg = str(grading_err)
            print(f"[QueueWorker-{worker_id}] Grading error for {submission_id}: {err_msg}")
            now_str = get_iso_now()
            new_retries = (job.get("retry_count") or 0) + 1
            with get_session() as sess:
                if new_retries < 3:
                    sess.execute(
                        update(Submission)
                        .where(Submission.id == submission_id)
                        .values(status='QUEUED', retry_count=new_retries, error_message=f"Retry {new_retries}: {err_msg[:200]}", updated_at=now_str)
                    )
                    sess.execute(
                        update(EvaluationQueue)
                        .where(EvaluationQueue.submission_id == submission_id)
                        .values(status='QUEUED', attempt_count=new_retries, last_error=err_msg[:200], updated_at=now_str)
                    )
                else:
                    sess.execute(
                        update(Submission)
                        .where(Submission.id == submission_id)
                        .values(status='FAILED', retry_count=new_retries, error_message=f"Grading Failed: {err_msg[:300]}", updated_at=now_str)
                    )
                    sess.execute(
                        update(EvaluationQueue)
                        .where(EvaluationQueue.submission_id == submission_id)
                        .values(status='FAILED', attempt_count=new_retries, last_error=err_msg[:300], updated_at=now_str)
                    )
                sess.commit()
            if new_retries >= 3:
                if batch_id:
                    self._update_batch_progress(batch_id)
                self._update_exam_evaluation_status(exam_id)
            return True

    def process_next_batch(self, worker_id: int = 0) -> bool:
        """Alias for backward compatibility with single-pass architecture."""
        return self.process_next_job(worker_id=worker_id)

    def _update_exam_evaluation_status(self, exam_id: str):
        if not exam_id:
            return
        now = get_iso_now()
        with get_session() as session:
            rows = session.execute(
                select(Submission.status, func.count(Submission.id))
                .where(Submission.exam_id == exam_id)
                .group_by(Submission.status)
            ).all()
            counts = {status: cnt for status, cnt in rows}
            queued = counts.get("QUEUED", 0)
            processing = counts.get("PROCESSING", 0)

            if queued == 0 and processing == 0:
                ex = session.scalar(select(Exam).where(Exam.id == exam_id))
                if ex and ex.status == "EVALUATING":
                    is_pub = ex.is_published == 1
                    target_status = "PUBLISHED" if is_pub else "EVALUATED"
                    ex.status = target_status
                    ex.lifecycle_status = "PUBLISHED" if is_pub else "EVALUATED"
                    ex.updated_at = now

                    exam_completed = counts.get("COMPLETED", 0) + counts.get("NEEDS_REVIEW", 0)
                    exam_failed = counts.get("FAILED", 0)
                    ex_title = ex.title or "Exam"
                    ex_branch = ex.branch_id

                    # Notify Branch Managers of this exam's branch
                    notify_branch_managers(
                        cursor=session,
                        branch_id=ex_branch,
                        notif_type="GRADING_COMPLETED",
                        title="AI Grading Completed",
                        message=f"Evaluation complete for '{ex_title}' ({exam_completed} graded, {exam_failed} failed). Papers are ready for faculty verification.",
                        link_url=f"/exams/{exam_id}"
                    )
                    # Notify Root Admins
                    notify_root_admins(
                        cursor=session,
                        notif_type="GRADING_COMPLETED",
                        title="AI Grading Completed",
                        message=f"Evaluation complete for '{ex_title}' ({exam_completed} graded, {exam_failed} failed).",
                        link_url=f"/exams/{exam_id}"
                    )

                    session.commit()

    def _update_batch_progress(self, batch_id: str):
        now = get_iso_now()
        with get_session() as session:
            rows = session.execute(
                select(Submission.status, func.count(Submission.id))
                .where(Submission.batch_id == batch_id)
                .group_by(Submission.status)
            ).all()
            counts = {status: cnt for status, cnt in rows}

            completed = counts.get("COMPLETED", 0) + counts.get("NEEDS_REVIEW", 0)
            failed = counts.get("FAILED", 0)
            queued = counts.get("QUEUED", 0)
            processing = counts.get("PROCESSING", 0)

            batch_rec = session.scalar(select(Batch).where(Batch.id == batch_id))
            if not batch_rec:
                return

            if queued == 0 and processing == 0:
                batch_status = "COMPLETED" if failed == 0 else "PARTIALLY_FAILED"
            else:
                batch_status = "PROCESSING"

            batch_rec.completed_submissions = completed
            batch_rec.failed_submissions = failed
            batch_rec.status = batch_status
            batch_rec.updated_at = now

            session.commit()


queue_worker = PersistentQueueWorker()

if __name__ == "__main__":
    print("[QueueWorker] Starting standalone worker...")
    queue_worker.recover_stalled_jobs()
    queue_worker.start()
    try:
        while True:
            time.sleep(1.0)
    except KeyboardInterrupt:
        queue_worker.stop()
