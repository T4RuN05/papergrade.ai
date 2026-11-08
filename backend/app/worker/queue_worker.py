import time
import json
import threading
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


class PersistentQueueWorker:
    def __init__(self, poll_interval_sec: float = 3.0, max_workers: Optional[int] = None):
        self.poll_interval_sec = poll_interval_sec
        configured_keys = len(settings.configured_api_keys)
        default_workers = getattr(settings, "MAX_EVALUATION_WORKERS", 2)
        self.num_workers = max(1, min(default_workers, max(1, configured_keys))) if max_workers is None else max(1, max_workers)
        self.running = False
        self._threads: List[threading.Thread] = []
        self._claim_lock = threading.Lock()

    def start(self):
        if self.running:
            return
        self.recover_stalled_jobs()
        self.running = True
        self._threads = []
        for i in range(self.num_workers):
            t = threading.Thread(target=self._run_worker_loop, args=(i,), daemon=True, name=f"QueueWorker-{i}")
            t.start()
            self._threads.append(t)
        # Background watchdog to prevent infinite stuck jobs
        watchdog = threading.Thread(target=self._run_watchdog_loop, daemon=True, name="QueueWorker-Watchdog")
        watchdog.start()
        self._threads.append(watchdog)
        print(f"[QueueWorker] Background worker pool started with {self.num_workers} parallel workers and 1 watchdog.")

    def stop(self):
        self.running = False
        for t in self._threads:
            t.join(timeout=3.0)
        self._threads = []
        print("[QueueWorker] Background worker pool stopped.")

    def recover_stalled_jobs(self, stale_only: bool = False, max_stale_minutes: int = 5):
        """
        On worker startup or periodic watchdog, reset jobs stuck in 'PROCESSING'
        back to 'QUEUED' so they are not abandoned.
        When stale_only=True, only resets jobs older than max_stale_minutes.
        """
        now = get_iso_now()
        with get_session() as session:
            if stale_only:
                cutoff = (datetime.now(timezone.utc) - timedelta(minutes=max_stale_minutes)).isoformat()
                stmt = (
                    update(Submission)
                    .where(
                        Submission.status == 'PROCESSING',
                        or_(Submission.updated_at.is_(None), Submission.updated_at < cutoff)
                    )
                    .values(
                        status='QUEUED',
                        retry_count=Submission.retry_count + 1,
                        updated_at=now
                    )
                )
            else:
                stmt = (
                    update(Submission)
                    .where(Submission.status == 'PROCESSING')
                    .values(status='QUEUED', updated_at=now)
                )

            res = session.execute(stmt)
            sub_count = res.rowcount
            if sub_count > 0:
                tag = "Watchdog recovered" if stale_only else "Recovered"
                print(f"[QueueWorker] {tag} {sub_count} stalled job(s) back to QUEUED.")

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
        """Runs every 60 seconds to detect and recover stuck jobs in PROCESSING."""
        while self.running:
            time.sleep(60.0)
            try:
                self.recover_stalled_jobs(stale_only=True, max_stale_minutes=5)
            except Exception as e:
                print(f"[QueueWorker-Watchdog] Error in watchdog loop: {e}")

    def _run_worker_loop(self, worker_id: int):
        time.sleep(worker_id * 0.75)
        while self.running:
            try:
                processed = self.process_next_job(worker_id=worker_id)
                if processed:
                    time.sleep(1.0)
                else:
                    time.sleep(self.poll_interval_sec)
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

        # 3. Single-Pass Multimodal Grading Call
        try:
            grading_result, usage_event_id = gemini_client.grade_student_submission(
                exam_id=exam_id,
                batch_id=batch_id,
                submission_id=submission_id,
                student_pdf_path=pdf_path,
                rubric_json=rubric_data,
                page_count=job.get("page_count", 1),
                worker_id=worker_id,
            )
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

        # 4. Enforce Invariants and Save
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
