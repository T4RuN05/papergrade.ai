import time
import json
import threading
from pathlib import Path
from typing import Optional, List
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
from backend.app.gemini.client import gemini_client, AllGeminiKeysExhaustedError
from backend.app.services.notification_service import notify_branch_managers, notify_root_admins


class PersistentQueueWorker:
    def __init__(self, poll_interval_sec: float = 3.0, max_workers: Optional[int] = None):
        self.poll_interval_sec = poll_interval_sec
        configured_keys = len(settings.configured_api_keys)
        default_workers = getattr(settings, "MAX_EVALUATION_WORKERS", 3)
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
                    time.sleep(1.5)
                else:
                    time.sleep(self.poll_interval_sec)
            except Exception as e:
                print(f"[QueueWorker-{worker_id}] Unexpected loop error: {e}")
                time.sleep(self.poll_interval_sec)

    def process_next_job(self, worker_id: int = 0) -> bool:
        """
        Atomically fetches the oldest QUEUED submission using row locking,
        locks it as PROCESSING, and runs the Gemini grading workflow for worker_id.
        Returns True if a job was found and processed, False if queue is empty.
        """
        job = None
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
                    return False

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

                session.commit()

        # Execute grading
        submission_id = job["id"]
        exam_id = job["exam_id"]
        batch_id = job["batch_id"]
        raw_pdf_path = job["canonical_pdf_path"]
        page_count = job["page_count"]
        retry_count = job["retry_count"]

        try:
            pdf_path = Path(raw_pdf_path) if raw_pdf_path else None
            if not pdf_path or not pdf_path.is_file() or not pdf_path.exists():
                storage = get_storage_service()
                try:
                    pdf_path = storage.get_local_path_or_download(raw_pdf_path)
                except Exception as dl_err:
                    raise FileNotFoundError(f"Could not locate or download student PDF for key '{raw_pdf_path}': {dl_err}")

            # 1. Fetch approved rubric
            with get_session() as session:
                r_row = session.scalar(
                    select(RubricVersion)
                    .where(RubricVersion.exam_id == exam_id, RubricVersion.is_approved == 1)
                    .order_by(RubricVersion.version_num.desc())
                    .limit(1)
                )
                if not r_row or not r_row.rubric_data:
                    raise ValueError(f"No approved rubric found for exam {exam_id}. Cannot grade submission.")
                rubric_data = json.loads(r_row.rubric_data)

            # 2. Call Gemini grading client (single multimodal pass) with worker_id for dedicated key allocation
            grading_result, usage_event_id = gemini_client.grade_student_submission(
                exam_id=exam_id,
                batch_id=batch_id,
                submission_id=submission_id,
                student_pdf_path=pdf_path,
                rubric_json=rubric_data,
                page_count=page_count,
                worker_id=worker_id
            )

            # 3. Enforce invariants, save answers, compute totals
            grading_service.enforce_invariants_and_save(
                submission_id=submission_id,
                exam_id=exam_id,
                grading_result=grading_result,
                rubric_data=rubric_data
            )

            # 4. Mark queue item as completed
            now = get_iso_now()
            with get_session() as session:
                session.execute(
                    update(EvaluationQueue)
                    .where(EvaluationQueue.submission_id == submission_id)
                    .values(status='COMPLETED', updated_at=now)
                )
                session.commit()

            # 5. Update batch counts
            if batch_id:
                self._update_batch_progress(batch_id)

            # 6. Update exam evaluation status if all jobs finished
            self._update_exam_evaluation_status(exam_id)

            print(f"[QueueWorker-{worker_id}] Successfully processed submission {submission_id}.")
            return True

        except AllGeminiKeysExhaustedError as e:
            err_msg = str(e)
            print(f"[QueueWorker-{worker_id}] QUOTA LIMIT REACHED across all keys: {err_msg}")
            now = get_iso_now()
            with get_session() as session:
                session.execute(
                    update(Submission)
                    .where(Submission.id == submission_id)
                    .values(
                        status='QUEUED',
                        error_message=f"Quota Paused: {err_msg[:200]}",
                        updated_at=now
                    )
                )
                session.execute(
                    update(EvaluationQueue)
                    .where(EvaluationQueue.submission_id == submission_id)
                    .values(
                        status='QUEUED',
                        last_error=f"Quota Paused: {err_msg[:200]}",
                        updated_at=now
                    )
                )
                if batch_id:
                    session.execute(
                        update(Batch)
                        .where(Batch.id == batch_id)
                        .values(status='PAUSED_QUOTA', updated_at=now)
                    )
                session.commit()

            print(f"[QueueWorker-{worker_id}] Pausing worker loop for 30s cooldown to allow quota reset...")
            time.sleep(30.0)
            return False

        except Exception as e:
            err_msg = str(e)
            print(f"[QueueWorker-{worker_id}] Error grading submission {submission_id}: {err_msg}")
            new_retries = retry_count + 1
            max_job_retries = 3
            now = get_iso_now()

            for attempt in range(5):
                try:
                    with get_session() as session:
                        ans_cnt = session.scalar(
                            select(func.count(Answer.id)).where(Answer.submission_id == submission_id)
                        ) or 0

                        if ans_cnt > 0:
                            print(f"[QueueWorker-{worker_id}] Submission {submission_id} has {ans_cnt} evaluated answers in DB. Preserving evaluated state despite post-grading error: {err_msg[:100]}")
                            session.execute(
                                update(Submission)
                                .where(Submission.id == submission_id)
                                .values(
                                    status='NEEDS_REVIEW',
                                    error_message=f"Graded with post-process warning: {err_msg[:150]}",
                                    updated_at=now
                                )
                            )
                            session.execute(
                                update(EvaluationQueue)
                                .where(EvaluationQueue.submission_id == submission_id)
                                .values(
                                    status='COMPLETED',
                                    last_error=err_msg[:200],
                                    updated_at=now
                                )
                            )
                        elif new_retries < max_job_retries:
                            session.execute(
                                update(Submission)
                                .where(Submission.id == submission_id)
                                .values(
                                    status='QUEUED',
                                    retry_count=new_retries,
                                    error_message=f"Retry {new_retries}: {err_msg[:200]}",
                                    updated_at=now
                                )
                            )
                            session.execute(
                                update(EvaluationQueue)
                                .where(EvaluationQueue.submission_id == submission_id)
                                .values(
                                    status='QUEUED',
                                    attempt_count=new_retries,
                                    last_error=err_msg[:200],
                                    updated_at=now
                                )
                            )
                        else:
                            session.execute(
                                update(Submission)
                                .where(Submission.id == submission_id)
                                .values(
                                    status='FAILED',
                                    retry_count=new_retries,
                                    error_message=f"Failed: {err_msg[:300]}",
                                    updated_at=now
                                )
                            )
                            session.execute(
                                update(EvaluationQueue)
                                .where(EvaluationQueue.submission_id == submission_id)
                                .values(
                                    status='FAILED',
                                    attempt_count=new_retries,
                                    last_error=err_msg[:300],
                                    updated_at=now
                                )
                            )
                        session.commit()
                        break
                except Exception as db_err:
                    if attempt == 4:
                        print(f"[QueueWorker-{worker_id}] CRITICAL: Could not persist failure state for {submission_id} after 5 DB retries: {db_err}")
                    time.sleep(0.2 * (attempt + 1) + random.uniform(0.05, 0.15))

            try:
                if batch_id:
                    self._update_batch_progress(batch_id)
                self._update_exam_evaluation_status(exam_id)
            except Exception:
                pass
            return True

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

            prev_status = batch_rec.status
            if queued == 0 and processing == 0:
                batch_status = "COMPLETED" if failed == 0 else "PARTIALLY_FAILED"
            else:
                batch_status = "PROCESSING"

            batch_rec.completed_submissions = completed
            batch_rec.failed_submissions = failed
            batch_rec.status = batch_status
            batch_rec.updated_at = now

            session.commit()

            # Dispatch notification if batch transitioned into COMPLETED
            if queued == 0 and processing == 0 and prev_status != "COMPLETED":
                b_name = batch_rec.name or "Batch"
                b_branch = batch_rec.branch_id

                notify_branch_managers(
                    cursor=session,
                    branch_id=b_branch,
                    notif_type="GRADING_COMPLETED",
                    title="AI Grading Completed",
                    message=f"Evaluation complete for '{b_name}'. Papers are ready for faculty verification.",
                    link_url="/batches"
                )
                notify_root_admins(
                    cursor=session,
                    notif_type="GRADING_COMPLETED",
                    title="Batch Grading Complete",
                    message=f"Batch '{b_name}' grading finished ({completed} graded, {failed} failed).",
                    link_url="/marks"
                )
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
