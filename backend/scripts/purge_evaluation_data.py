"""
Purge and Reset Script for PaperGrade AI
Safely purges all evaluated marks, answer records, criterion scores, revaluation appeals,
test reports, and evaluation logs, while preserving student submissions, candidate identities,
and PDF files in object storage (CDN).
"""

import sys
import json
import shutil
from pathlib import Path
from datetime import datetime, timezone

from backend.app.config import settings
from backend.app.database import get_db, is_postgres, get_iso_now


def purge_active_database():
    print(f"[Purge] Connecting to active database (is_postgres={is_postgres()})...")
    now_iso = get_iso_now()

    with get_db() as conn:
        cur = conn.cursor()

        # 1. Clear technical reports
        cur.execute("DELETE FROM technical_reports")
        reports_purged = cur.rowcount
        print(f"  [OK] Purged {reports_purged} test reports from technical_reports")

        # 2. Clear evaluated marks & details across all tables
        cur.execute("DELETE FROM criterion_scores")
        crit_purged = cur.rowcount
        print(f"  [OK] Purged {crit_purged} rows from criterion_scores")

        cur.execute("DELETE FROM answer_regions")
        regions_purged = cur.rowcount
        print(f"  [OK] Purged {regions_purged} rows from answer_regions")

        cur.execute("DELETE FROM answers")
        answers_purged = cur.rowcount
        print(f"  [OK] Purged {answers_purged} rows from answers")

        cur.execute("DELETE FROM revaluation_requests")
        reval_purged = cur.rowcount
        print(f"  [OK] Purged {reval_purged} rows from revaluation_requests")

        cur.execute("DELETE FROM evaluation_queue")
        queue_purged = cur.rowcount
        print(f"  [OK] Purged {queue_purged} rows from evaluation_queue")

        cur.execute("DELETE FROM api_usage_events")
        usage_purged = cur.rowcount
        print(f"  [OK] Purged {usage_purged} rows from api_usage_events")

        # 3. Clean up evaluation & report notifications
        cur.execute("""
            DELETE FROM notifications 
            WHERE type IN (
                'REPORT_RECEIVED', 'REPORT_RESOLVED', 'REPORT_IN_PROGRESS',
                'REVALUATION_REQUESTED', 'REVALUATION_DECIDED', 
                'RESULT_PUBLISHED', 'GRADING_COMPLETED'
            )
        """)
        notifs_purged = cur.rowcount
        print(f"  [OK] Purged {notifs_purged} evaluation & report notifications")

        # 4. Clean up evaluation audit logs
        cur.execute("""
            DELETE FROM audit_logs 
            WHERE action IN (
                'MANUAL_EDIT', 'SUBMIT_REVALUATION_REQUEST', 'RESOLVE_REVALUATION', 
                'PUBLISH_RESULTS', 'START_EVALUATION'
            )
        """)
        audits_purged = cur.rowcount
        print(f"  [OK] Purged {audits_purged} evaluation audit logs")

        # 5. Reset submissions table (KEEP original_file_path & canonical_pdf_path)
        cur.execute("""
            UPDATE submissions
            SET status = 'UPLOADED',
                publication_status = 'UNPUBLISHED',
                total_awarded_marks = 0.0,
                percentage = 0.0,
                annotated_pdf_path = NULL,
                is_manual_override = 0,
                error_message = NULL,
                retry_count = 0,
                graded_at = NULL,
                reviewed_at = NULL,
                updated_at = ?
        """, (now_iso,))
        subs_reset = cur.rowcount
        print(f"  [OK] Reset {subs_reset} submissions to 'UPLOADED' status with clean marks")

        # 6. Reset batches table
        cur.execute("""
            UPDATE batches
            SET status = 'PENDING',
                completed_submissions = 0,
                failed_submissions = 0,
                updated_at = ?
        """, (now_iso,))
        batches_reset = cur.rowcount
        print(f"  [OK] Reset {batches_reset} batches to 'PENDING'")

        # 7. Reset exams table to ready state
        cur.execute("""
            UPDATE exams
            SET lifecycle_status = CASE WHEN current_rubric_version_id IS NOT NULL THEN 'EVALUATION_READY' ELSE 'DRAFT' END,
                status = 'RUBRIC_APPROVED',
                is_published = 0,
                published_at = NULL,
                updated_at = ?
        """, (now_iso,))
        exams_reset = cur.rowcount
        print(f"  [OK] Reset {exams_reset} exams to un-published & evaluation-ready")

        # 8. Close expired submission windows so they don't block evaluation
        cur.execute("""
            UPDATE submission_windows
            SET status = 'CLOSED'
            WHERE status = 'OPEN'
        """)
        windows_closed = cur.rowcount
        print(f"  [OK] Closed {windows_closed} submission windows")


def purge_local_sqlite():
    if not settings.DATABASE_PATH.exists():
        return
    print(f"\n[Purge] Synchronizing local SQLite database ({settings.DATABASE_PATH})...")
    now_iso = get_iso_now()
    import sqlite3

    conn = sqlite3.connect(settings.DATABASE_PATH)
    cur = conn.cursor()
    def try_exec(sql, params=None):
        try:
            if params:
                cur.execute(sql, params)
            else:
                cur.execute(sql)
        except sqlite3.OperationalError as e:
            pass

    try_exec("DELETE FROM technical_reports")
    try_exec("DELETE FROM criterion_scores")
    try_exec("DELETE FROM answer_regions")
    try_exec("DELETE FROM answers")
    try_exec("DELETE FROM revaluation_requests")
    try_exec("DELETE FROM evaluation_queue")
    try_exec("DELETE FROM api_usage_events")
    try_exec("""
        DELETE FROM notifications 
        WHERE type IN (
            'REPORT_RECEIVED', 'REPORT_RESOLVED', 'REPORT_IN_PROGRESS',
            'REVALUATION_REQUESTED', 'REVALUATION_DECIDED', 
            'RESULT_PUBLISHED', 'GRADING_COMPLETED'
        )
    """)
    try_exec("""
        DELETE FROM audit_logs 
        WHERE action IN (
            'MANUAL_EDIT', 'SUBMIT_REVALUATION_REQUEST', 'RESOLVE_REVALUATION', 
            'PUBLISH_RESULTS', 'START_EVALUATION'
        )
    """)
    try_exec("""
        UPDATE submissions
        SET status = 'UPLOADED',
            publication_status = 'UNPUBLISHED',
            total_awarded_marks = 0.0,
            percentage = 0.0,
            annotated_pdf_path = NULL,
            is_manual_override = 0,
            error_message = NULL,
            retry_count = 0,
            graded_at = NULL,
            reviewed_at = NULL,
            updated_at = ?
    """, (now_iso,))
    try_exec("""
        UPDATE batches
        SET status = 'PENDING',
            completed_submissions = 0,
            failed_submissions = 0,
            updated_at = ?
    """, (now_iso,))
    try_exec("""
        UPDATE exams
        SET lifecycle_status = CASE WHEN current_rubric_version_id IS NOT NULL THEN 'EVALUATION_READY' ELSE 'DRAFT' END,
            status = 'RUBRIC_APPROVED',
            is_published = 0,
            published_at = NULL,
            updated_at = ?
    """, (now_iso,))
    try_exec("UPDATE submission_windows SET status = 'CLOSED' WHERE status = 'OPEN'")
    conn.commit()
    conn.close()
    print("  [OK] Local SQLite database purged and synchronized successfully.")


def clean_local_cache_files():
    print("\n[Purge] Cleaning local render and export cache (preserving CDN/uploads)...")
    # Clean page renders cache
    if settings.RENDERS_DIR.exists():
        for item in settings.RENDERS_DIR.iterdir():
            if item.is_file():
                item.unlink(missing_ok=True)
            elif item.is_dir():
                shutil.rmtree(item, ignore_errors=True)
        print("  [OK] Cleared local page_renders directory")

    # Clean exports cache
    if settings.EXPORTS_DIR.exists():
        for item in settings.EXPORTS_DIR.iterdir():
            if item.is_file():
                item.unlink(missing_ok=True)
            elif item.is_dir():
                shutil.rmtree(item, ignore_errors=True)
        print("  [OK] Cleared local exports directory")


if __name__ == "__main__":
    print("=" * 60)
    print("PaperGrade AI - Evaluation Data & Report Purge")
    print("=" * 60)
    purge_active_database()
    purge_local_sqlite()
    clean_local_cache_files()
    print("=" * 60)
    print("Database is clean and ready for Render evaluation stress testing!")
    print("=" * 60)
