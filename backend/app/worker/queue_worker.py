import time
import json
import threading
from pathlib import Path
from typing import Optional, List
from backend.app.config import settings
from backend.app.database import get_db, get_iso_now
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
        print(f"[QueueWorker] Background worker pool started with {self.num_workers} parallel workers.")

    def stop(self):
        self.running = False
        for t in self._threads:
            t.join(timeout=3.0)
        self._threads = []
        print("[QueueWorker] Background worker pool stopped.")

    def recover_stalled_jobs(self):
        """
        On worker startup or restart, reset any jobs stuck in 'PROCESSING'
        back to 'QUEUED' so they are not abandoned. Also resume any batches
        that were paused due to quota.
        """
        now = get_iso_now()
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            UPDATE submissions
            SET status = 'QUEUED', updated_at = ?
            WHERE status = 'PROCESSING'
            """, (now,))
            sub_count = cursor.rowcount
            if sub_count > 0:
                print(f"[QueueWorker] Recovered {sub_count} stalled job(s) from previous run back to QUEUED.")

            cursor.execute("""
            UPDATE batches
            SET status = 'PROCESSING', updated_at = ?
            WHERE status = 'PAUSED_QUOTA'
            """, (now,))
            batch_count = cursor.rowcount
            if batch_count > 0:
                print(f"[QueueWorker] Resumed {batch_count} quota-paused batch(es) back to PROCESSING.")

    def _run_worker_loop(self, worker_id: int):
        # Stagger startup slightly so workers don't query simultaneously on startup
        time.sleep(worker_id * 0.75)
        while self.running:
            try:
                processed = self.process_next_job(worker_id=worker_id)
                if processed:
                    # Light worker-specific delay to avoid hammering the same key
                    time.sleep(1.5)
                else:
                    time.sleep(self.poll_interval_sec)
            except Exception as e:
                print(f"[QueueWorker-{worker_id}] Unexpected loop error: {e}")
                time.sleep(self.poll_interval_sec)

    def process_next_job(self, worker_id: int = 0) -> bool:
        """
        Atomically fetches the oldest QUEUED submission in roll_number ASC order,
        locks it as PROCESSING, and runs the Gemini grading workflow for worker_id.
        Returns True if a job was found and processed, False if queue is empty.
        """
        job = None
        now = get_iso_now()

        with self._claim_lock:
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                SELECT s.id, s.exam_id, s.batch_id, s.canonical_pdf_path, s.page_count, s.retry_count, s.roll_number
                FROM submissions s
                WHERE s.status = 'QUEUED'
                ORDER BY s.roll_number ASC, s.created_at ASC
                LIMIT 1
                """)
                row = cursor.fetchone()
                if not row:
                    return False

                job = dict(row)
                # Transition status: QUEUED -> PROCESSING
                cursor.execute("""
                UPDATE submissions
                SET status = 'PROCESSING', updated_at = ?
                WHERE id = ?
                """, (now, job["id"]))

                # Update batch status if applicable
                if job["batch_id"]:
                    cursor.execute("""
                    UPDATE batches
                    SET status = 'PROCESSING', updated_at = ?
                    WHERE id = ? AND status IN ('QUEUED', 'PAUSED_QUOTA')
                    """, (now, job["batch_id"]))

        # Execute grading
        submission_id = job["id"]
        exam_id = job["exam_id"]
        batch_id = job["batch_id"]
        raw_pdf_path = job["canonical_pdf_path"]
        page_count = job["page_count"]
        retry_count = job["retry_count"]

        # Resolve local PDF path: check local disk, then fallback to unified storage service (Cloudinary/R2/cache)
        pdf_path = Path(raw_pdf_path)
        if not pdf_path.is_file() or not pdf_path.exists():
            storage = get_storage_service()
            try:
                pdf_path = storage.get_local_path_or_download(raw_pdf_path)
            except Exception as dl_err:
                raise FileNotFoundError(f"Could not locate or download student PDF for key '{raw_pdf_path}': {dl_err}")

        try:
            # 1. Fetch approved rubric
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                SELECT rubric_data FROM rubric_versions
                WHERE exam_id = ? AND is_approved = 1
                ORDER BY version_num DESC LIMIT 1
                """, (exam_id,))
                r_row = cursor.fetchone()
                if not r_row:
                    raise ValueError(f"No approved rubric found for exam {exam_id}. Cannot grade submission.")
                rubric_data = json.loads(r_row["rubric_data"])

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

            # 4. Update batch counts
            if batch_id:
                self._update_batch_progress(batch_id)

            # 5. Update exam evaluation status if all jobs finished
            self._update_exam_evaluation_status(exam_id)

            print(f"[QueueWorker-{worker_id}] Successfully processed submission {submission_id}.")
            return True

        except AllGeminiKeysExhaustedError as e:
            err_msg = str(e)
            print(f"[QueueWorker-{worker_id}] QUOTA LIMIT REACHED across all keys: {err_msg}")
            now = get_iso_now()
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                UPDATE submissions
                SET status = 'QUEUED', error_message = ?, updated_at = ?
                WHERE id = ?
                """, (f"Quota Paused: {err_msg[:200]}", now, submission_id))

                if batch_id:
                    cursor.execute("""
                    UPDATE batches
                    SET status = 'PAUSED_QUOTA', updated_at = ?
                    WHERE id = ?
                    """, (now, batch_id))

            print(f"[QueueWorker-{worker_id}] Pausing worker loop for 60s cooldown to allow quota reset...")
            time.sleep(60.0)
            return False

        except Exception as e:
            err_msg = str(e)
            print(f"[QueueWorker-{worker_id}] Error grading submission {submission_id}: {err_msg}")
            new_retries = retry_count + 1
            max_job_retries = 3

            now = get_iso_now()
            with get_db() as conn:
                cursor = conn.cursor()
                if new_retries < max_job_retries:
                    # Retry after backoff
                    cursor.execute("""
                    UPDATE submissions
                    SET status = 'QUEUED', retry_count = ?, error_message = ?, updated_at = ?
                    WHERE id = ?
                    """, (new_retries, f"Retry {new_retries}: {err_msg[:200]}", now, submission_id))
                else:
                    # Mark FAILED
                    cursor.execute("""
                    UPDATE submissions
                    SET status = 'FAILED', retry_count = ?, error_message = ?, updated_at = ?
                    WHERE id = ?
                    """, (new_retries, f"Failed: {err_msg[:300]}", now, submission_id))

            if batch_id:
                self._update_batch_progress(batch_id)
            self._update_exam_evaluation_status(exam_id)
            return True

    def _update_exam_evaluation_status(self, exam_id: str):
        if not exam_id:
            return
        now = get_iso_now()
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT status, COUNT(*) as cnt 
                FROM submissions 
                WHERE exam_id = ? 
                GROUP BY status
            """, (exam_id,))
            counts = {row["status"]: row["cnt"] for row in cursor.fetchall()}
            queued = counts.get("QUEUED", 0)
            processing = counts.get("PROCESSING", 0)

            if queued == 0 and processing == 0:
                cursor.execute("SELECT status, lifecycle_status, is_published FROM exams WHERE id = ?", (exam_id,))
                ex = cursor.fetchone()
                if ex and ex["status"] == "EVALUATING":
                    is_pub = ex.get("is_published") == 1
                    target_status = "PUBLISHED" if is_pub else "EVALUATED"
                    cursor.execute("""
                        UPDATE exams
                        SET status = ?,
                            lifecycle_status = CASE WHEN is_published = 1 THEN 'PUBLISHED' ELSE 'EVALUATED' END,
                            updated_at = ?
                        WHERE id = ? AND status = 'EVALUATING'
                    """, (target_status, now, exam_id))

    def _update_batch_progress(self, batch_id: str):
        now = get_iso_now()
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT status, COUNT(*) as cnt FROM submissions WHERE batch_id = ? GROUP BY status", (batch_id,))
            counts = {row["status"]: row["cnt"] for row in cursor.fetchall()}

            completed = counts.get("COMPLETED", 0) + counts.get("NEEDS_REVIEW", 0)
            failed = counts.get("FAILED", 0)
            queued = counts.get("QUEUED", 0)
            processing = counts.get("PROCESSING", 0)

            # Check previous batch record
            cursor.execute("SELECT name, branch_id, status FROM batches WHERE id = ?", (batch_id,))
            batch_rec = cursor.fetchone()

            if queued == 0 and processing == 0:
                batch_status = "COMPLETED" if failed == 0 else "PARTIALLY_FAILED"
            else:
                batch_status = "PROCESSING"

            cursor.execute("""
            UPDATE batches
            SET completed_submissions = ?, failed_submissions = ?, status = ?, updated_at = ?
            WHERE id = ?
            """, (completed, failed, batch_status, now, batch_id))

            # Dispatch notification if batch transitioned into COMPLETED
            if queued == 0 and processing == 0 and batch_rec and batch_rec["status"] != "COMPLETED":
                b_name = batch_rec["name"] or "Batch"
                b_branch = batch_rec.get("branch_id")
                
                notify_branch_managers(
                    cursor=cursor,
                    branch_id=b_branch,
                    notif_type="GRADING_COMPLETED",
                    title="AI Grading Completed",
                    message=f"Evaluation complete for '{b_name}'. Papers are ready for faculty verification.",
                    link_url="/batches"
                )
                notify_root_admins(
                    cursor=cursor,
                    notif_type="GRADING_COMPLETED",
                    title="Batch Grading Complete",
                    message=f"Batch '{b_name}' grading finished ({completed} graded, {failed} failed).",
                    link_url="/grading"
                )

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
