import time
import json
import threading
import concurrent.futures
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
from backend.app.schemas import (
    Stage1BlindExtractionResult,
    Stage2StudentEvaluationItem,
)
from backend.app.services.storage import get_storage_service
from backend.app.services.grading_service import grading_service
from backend.app.gemini.client import (
    gemini_client,
    AllGeminiKeysExhaustedError,
    merge_stage1_and_stage2,
)
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
                processed = self.process_next_batch(worker_id=worker_id)
                if processed:
                    time.sleep(1.5)
                else:
                    time.sleep(self.poll_interval_sec)
            except Exception as e:
                print(f"[QueueWorker-{worker_id}] Unexpected loop error: {e}")
                time.sleep(self.poll_interval_sec)

    def _claim_next_batch(self, worker_id: int = 0) -> List[Dict[str, Any]]:
        batch_size = max(1, getattr(settings, "GRADING_BATCH_SIZE", 4))
        now = get_iso_now()
        jobs: List[Dict[str, Any]] = []

        with self._claim_lock:
            with get_session() as session:
                anchor = session.scalar(
                    select(Submission)
                    .where(Submission.status == 'QUEUED')
                    .order_by(Submission.roll_number.asc(), Submission.created_at.asc())
                    .with_for_update(skip_locked=True)
                    .limit(1)
                )
                if not anchor:
                    return []

                target_exam_id = anchor.exam_id

                subs = session.scalars(
                    select(Submission)
                    .where(
                        Submission.status == 'QUEUED',
                        Submission.exam_id == target_exam_id
                    )
                    .order_by(Submission.roll_number.asc(), Submission.created_at.asc())
                    .with_for_update(skip_locked=True)
                    .limit(batch_size)
                ).all()

                sub_ids = [s.id for s in subs]
                for s in subs:
                    jobs.append({
                        "id": s.id,
                        "exam_id": s.exam_id,
                        "batch_id": s.batch_id,
                        "canonical_pdf_path": s.canonical_pdf_path,
                        "page_count": s.page_count,
                        "retry_count": s.retry_count or 0,
                        "roll_number": s.roll_number,
                        "stage1_extraction_json": s.stage1_extraction_json,
                    })
                    s.status = 'PROCESSING'
                    s.updated_at = now

                    if s.batch_id:
                        batch = session.scalar(select(Batch).where(Batch.id == s.batch_id))
                        if batch and batch.status in ('QUEUED', 'PAUSED_QUOTA'):
                            batch.status = 'PROCESSING'
                            batch.updated_at = now

                session.execute(
                    update(EvaluationQueue)
                    .where(EvaluationQueue.submission_id.in_(sub_ids))
                    .values(
                        status='PROCESSING',
                        claimed_by_worker=f"worker-{worker_id}",
                        claimed_at=now,
                        updated_at=now
                    )
                )
                session.commit()

        return jobs

    def process_next_batch(self, worker_id: int = 0) -> bool:
        """
        Process a batch of up to GRADING_BATCH_SIZE submissions for the same exam
        using the Two-Stage Quota Architecture:
        1. Stage 1 (Blind OCR & BBox): gemini-3.5-flash-lite across 4 keys in parallel.
           Persisted to DB (submissions.stage1_extraction_json).
        2. Stage 2 (Batched Audit): gemini-3.8-flash pure-text grading in ONE API call.
        """
        jobs = self._claim_next_batch(worker_id=worker_id)
        if not jobs:
            return False

        exam_id = jobs[0]["exam_id"]
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
                err_msg = f"No approved rubric found for exam {exam_id}. Cannot grade batch."
                print(f"[QueueWorker-{worker_id}] ERROR: {err_msg}")
                with get_session() as sess:
                    for j in jobs:
                        sess.execute(update(Submission).where(Submission.id == j["id"]).values(status='FAILED', error_message=err_msg, updated_at=now))
                        sess.execute(update(EvaluationQueue).where(EvaluationQueue.submission_id == j["id"]).values(status='FAILED', last_error=err_msg, updated_at=now))
                    sess.commit()
                return True

            rubric_data = json.loads(r_row.rubric_data)

        # STAGE 1: Blind Forensic OCR & BBox Localization
        stage1_results: Dict[str, Stage1BlindExtractionResult] = {}
        jobs_needing_stage1 = []

        for job in jobs:
            sub_id = job["id"]
            if job["stage1_extraction_json"]:
                try:
                    s1_cached = Stage1BlindExtractionResult.model_validate_json(job["stage1_extraction_json"])
                    stage1_results[sub_id] = s1_cached
                    print(f"[QueueWorker-{worker_id}] Loaded Stage 1 OCR from DB cache for {sub_id} (0 API calls!).")
                    continue
                except Exception as e:
                    print(f"[QueueWorker-{worker_id}] Warning: Failed deserializing cached Stage 1 JSON for {sub_id}: {e}. Re-extracting.")
            jobs_needing_stage1.append(job)

        if jobs_needing_stage1:
            def _extract_single_sub(j_item, worker_idx):
                s_id = j_item["id"]
                raw_pdf = j_item["canonical_pdf_path"]
                pdf_path = Path(raw_pdf) if raw_pdf else None
                if not pdf_path or not pdf_path.is_file() or not pdf_path.exists():
                    storage = get_storage_service()
                    pdf_path = storage.get_local_path_or_download(raw_pdf)

                s1_res, event_id = gemini_client.extract_student_submission_blind(
                    exam_id=exam_id,
                    submission_id=s_id,
                    student_pdf_path=pdf_path,
                    rubric_dict=rubric_data,
                    page_count=j_item["page_count"],
                    worker_id=worker_idx
                )
                now_str = get_iso_now()
                with get_session() as sess:
                    sess.execute(
                        update(Submission)
                        .where(Submission.id == s_id)
                        .values(
                            stage1_extraction_json=s1_res.model_dump_json(),
                            updated_at=now_str
                        )
                    )
                    sess.commit()
                return s_id, s1_res

            max_threads = min(len(jobs_needing_stage1), 4)
            keys_count = max(1, len(settings.configured_api_keys))

            with concurrent.futures.ThreadPoolExecutor(max_workers=max_threads) as executor:
                futures = {
                    executor.submit(_extract_single_sub, j_item, (worker_id + idx) % keys_count): j_item
                    for idx, j_item in enumerate(jobs_needing_stage1)
                }
                for fut in concurrent.futures.as_completed(futures):
                    j_item = futures[fut]
                    s_id = j_item["id"]
                    try:
                        _, s1_res = fut.result()
                        stage1_results[s_id] = s1_res
                    except AllGeminiKeysExhaustedError as quota_err:
                        err_msg = str(quota_err)
                        print(f"[QueueWorker-{worker_id}] Stage 1 Quota Paused for {s_id}: {err_msg}")
                        now_str = get_iso_now()
                        with get_session() as sess:
                            sess.execute(update(Submission).where(Submission.id == s_id).values(status='QUEUED', error_message=f"Quota Paused (Stage 1): {err_msg[:200]}", updated_at=now_str))
                            sess.execute(update(EvaluationQueue).where(EvaluationQueue.submission_id == s_id).values(status='QUEUED', last_error=f"Quota Paused: {err_msg[:200]}", updated_at=now_str))
                            sess.commit()
                    except Exception as err:
                        err_msg = str(err)
                        print(f"[QueueWorker-{worker_id}] Stage 1 failed for {s_id}: {err_msg}")
                        now_str = get_iso_now()
                        new_retries = (j_item.get("retry_count") or 0) + 1
                        with get_session() as sess:
                            if new_retries < 3:
                                sess.execute(update(Submission).where(Submission.id == s_id).values(status='QUEUED', retry_count=new_retries, error_message=f"Retry {new_retries}: {err_msg[:200]}", updated_at=now_str))
                                sess.execute(update(EvaluationQueue).where(EvaluationQueue.submission_id == s_id).values(status='QUEUED', attempt_count=new_retries, last_error=err_msg[:200], updated_at=now_str))
                            else:
                                sess.execute(update(Submission).where(Submission.id == s_id).values(status='FAILED', retry_count=new_retries, error_message=f"Stage 1 Failed: {err_msg[:300]}", updated_at=now_str))
                                sess.execute(update(EvaluationQueue).where(EvaluationQueue.submission_id == s_id).values(status='FAILED', attempt_count=new_retries, last_error=err_msg[:300], updated_at=now_str))
                            sess.commit()

        # If no submissions successfully completed Stage 1, stop here
        ready_jobs = [j for j in jobs if j["id"] in stage1_results]
        if not ready_jobs:
            return True

        # STAGE 2: Multi-Student Batched Rubric Evaluation (gemini-3.8-flash)
        batch_payloads = []
        for j in ready_jobs:
            s_id = j["id"]
            s1_res = stage1_results[s_id]
            batch_payloads.append({
                "submission_id": s_id,
                "answers": [
                    {
                        "question_id": a.question_id,
                        "subquestion_id": a.subquestion_id,
                        "extracted_student_answer": a.extracted_student_answer,
                        "is_missing": a.is_missing,
                    }
                    for a in s1_res.answers
                ]
            })

        try:
            s2_batch_result, usage_event_id = gemini_client.grade_extracted_batch(
                exam_id=exam_id,
                rubric_dict=rubric_data,
                batch_payloads=batch_payloads,
                worker_id=worker_id
            )
        except AllGeminiKeysExhaustedError as quota_err:
            err_msg = str(quota_err)
            print(f"[QueueWorker-{worker_id}] Stage 2 QUOTA LIMIT REACHED across all keys: {err_msg}")
            now_str = get_iso_now()
            with get_session() as sess:
                for j in ready_jobs:
                    s_id = j["id"]
                    sess.execute(
                        update(Submission)
                        .where(Submission.id == s_id)
                        .values(
                            status='QUEUED',
                            retry_count=0,
                            error_message=f"Quota Paused (Stage 1 cached): {err_msg[:200]}",
                            updated_at=now_str
                        )
                    )
                    sess.execute(
                        update(EvaluationQueue)
                        .where(EvaluationQueue.submission_id == s_id)
                        .values(
                            status='QUEUED',
                            last_error=f"Quota Paused: {err_msg[:200]}",
                            updated_at=now_str
                        )
                    )
                    if j.get("batch_id"):
                        sess.execute(
                            update(Batch)
                            .where(Batch.id == j["batch_id"])
                            .values(status='PAUSED_QUOTA', updated_at=now_str)
                        )
                sess.commit()

            print(f"[QueueWorker-{worker_id}] Pausing worker loop for 30s cooldown to allow Stage 2 quota reset...")
            time.sleep(30.0)
            return False

        except Exception as stage2_err:
            err_msg = str(stage2_err)
            print(f"[QueueWorker-{worker_id}] Stage 2 grading batch error: {err_msg}")
            now_str = get_iso_now()
            with get_session() as sess:
                for j in ready_jobs:
                    s_id = j["id"]
                    new_retries = (j.get("retry_count") or 0) + 1
                    sess.execute(
                        update(Submission)
                        .where(Submission.id == s_id)
                        .values(status='QUEUED', retry_count=new_retries, error_message=f"Stage 2 Retry {new_retries}: {err_msg[:200]}", updated_at=now_str)
                    )
                    sess.execute(
                        update(EvaluationQueue)
                        .where(EvaluationQueue.submission_id == s_id)
                        .values(status='QUEUED', attempt_count=new_retries, last_error=err_msg[:200], updated_at=now_str)
                    )
                sess.commit()
            return True

        # MERGE STAGE 1 + STAGE 2 AND PERSIST
        s2_lookup = {r.submission_id: r for r in s2_batch_result.results}

        for j in ready_jobs:
            s_id = j["id"]
            b_id = j["batch_id"]
            s1_res = stage1_results[s_id]
            s2_student = s2_lookup.get(s_id) or Stage2StudentEvaluationItem(submission_id=s_id, evaluated_answers=[])

            merged_result = merge_stage1_and_stage2(s1_res, s2_student, rubric_dict=rubric_data)

            grading_service.enforce_invariants_and_save(
                submission_id=s_id,
                exam_id=exam_id,
                grading_result=merged_result,
                rubric_data=rubric_data
            )

            now_str = get_iso_now()
            with get_session() as sess:
                sess.execute(
                    update(EvaluationQueue)
                    .where(EvaluationQueue.submission_id == s_id)
                    .values(status='COMPLETED', updated_at=now_str)
                )
                sess.commit()

            if b_id:
                self._update_batch_progress(b_id)

        self._update_exam_evaluation_status(exam_id)
        print(f"[QueueWorker-{worker_id}] Successfully evaluated batch of {len(ready_jobs)} submissions for exam {exam_id}.")
        return True

    def process_next_job(self, worker_id: int = 0) -> bool:
        """Alias for backward compatibility."""
        return self.process_next_batch(worker_id=worker_id)

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
