import sqlite3
import json
import uuid
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any, List

from backend.app.config import settings

def get_iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()

def is_postgres() -> bool:
    return bool(settings.DATABASE_URL and settings.DATABASE_URL.startswith(("postgresql://", "postgres://")))

class RowDict(dict):
    """Dictionary that also allows integer index access, matching sqlite3.Row behavior."""
    def __getitem__(self, key):
        if isinstance(key, int):
            try:
                return list(self.values())[key]
            except IndexError:
                raise IndexError(f"Row index out of range: {key}")
        return super().__getitem__(key)

    def __contains__(self, key):
        if isinstance(key, int):
            return 0 <= key < len(self)
        return super().__contains__(key)

class PostgresCursorWrapper:
    """Wraps psycopg2 cursor to support both %s and ? placeholders and SQLite dialect helpers seamlessly."""
    def __init__(self, raw_cursor):
        self._cursor = raw_cursor

    def _normalize_sql(self, sql: str, params) -> str:
        if params is not None and "?" in sql:
            sql = sql.replace("?", "%s")
        if "datetime('now')" in sql:
            sql = sql.replace("datetime('now')", "TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')")
        return sql

    def _sanitize_param(self, val):
        if isinstance(val, str) and "\x00" in val:
            return val.replace("\x00", "")
        return val

    def _sanitize_params(self, params):
        if params is None:
            return None
        if isinstance(params, (list, tuple)):
            return tuple(self._sanitize_param(p) for p in params)
        if isinstance(params, dict):
            return {k: self._sanitize_param(v) for k, v in params.items()}
        return params

    def execute(self, sql: str, params=None):
        clean_sql = self._normalize_sql(sql, params)
        if params is not None:
            clean_params = self._sanitize_params(params)
            return self._cursor.execute(clean_sql, clean_params)
        return self._cursor.execute(clean_sql)

    def executemany(self, sql: str, seq_of_params):
        clean_sql = self._normalize_sql(sql, seq_of_params)
        if seq_of_params is not None:
            clean_seq = [self._sanitize_params(p) for p in seq_of_params]
            return self._cursor.executemany(clean_sql, clean_seq)
        return self._cursor.executemany(clean_sql, seq_of_params)

    def fetchone(self):
        row = self._cursor.fetchone()
        if row is None:
            return None
        return RowDict(row)

    def fetchall(self):
        rows = self._cursor.fetchall()
        if rows is None:
            return []
        return [RowDict(r) for r in rows]

    def fetchmany(self, size=None):
        rows = self._cursor.fetchmany(size) if size is not None else self._cursor.fetchmany()
        if rows is None:
            return []
        return [RowDict(r) for r in rows]

    def __getattr__(self, name):
        return getattr(self._cursor, name)

    def __iter__(self):
        for row in self._cursor:
            yield RowDict(row) if row is not None else None

import threading

_pool_lock = threading.Lock()
_pg_pool = None

def get_pg_pool():
    global _pg_pool
    if _pg_pool is None:
        with _pool_lock:
            if _pg_pool is None:
                import psycopg2
                from psycopg2.pool import ThreadedConnectionPool
                from psycopg2.extras import RealDictCursor

                dsn = settings.DATABASE_URL
                # Supabase session mode (:5432) has a strict limit of 15 connections.
                # Transaction mode (:6543) scales to thousands of concurrent requests.
                if "pooler.supabase.com:5432" in dsn:
                    dsn = dsn.replace("pooler.supabase.com:5432", "pooler.supabase.com:6543")

                _pg_pool = ThreadedConnectionPool(
                    minconn=1,
                    maxconn=25,
                    dsn=dsn,
                    cursor_factory=RealDictCursor
                )
    return _pg_pool

def _get_pooled_pg_connection():
    pool = get_pg_pool()
    import psycopg2
    from psycopg2.pool import PoolError
    import time
    import random

    # Resilient acquire with retry loop to survive temporary traffic bursts
    raw = None
    max_acquire_attempts = 10
    for attempt in range(max_acquire_attempts):
        try:
            raw = pool.getconn()
            break
        except PoolError as pe:
            if attempt == max_acquire_attempts - 1:
                raise PoolError(f"connection pool exhausted after {max_acquire_attempts} retries: {pe}")
            time.sleep(0.05 * (attempt + 1) + random.uniform(0.01, 0.05))

    try:
        if raw.closed != 0:
            raise psycopg2.OperationalError("Closed")
        if raw.get_transaction_status() != psycopg2.extensions.TRANSACTION_STATUS_IDLE:
            raw.rollback()
    except Exception:
        try:
            pool.putconn(raw, close=True)
        except Exception:
            pass
        raw = pool.getconn()
    raw.autocommit = False
    return raw

def _return_pooled_pg_connection(raw):
    pool = get_pg_pool()
    import psycopg2
    try:
        if raw.closed == 0:
            if raw.get_transaction_status() != psycopg2.extensions.TRANSACTION_STATUS_IDLE:
                raw.rollback()
        pool.putconn(raw)
    except Exception:
        try:
            pool.putconn(raw, close=True)
        except Exception:
            pass

class PostgresConnectionWrapper:
    """Wraps psycopg2 connection to mimic sqlite3 connection API (conn.execute)."""
    def __init__(self, raw_conn, is_pooled: bool = False):
        self._conn = raw_conn
        self._is_pooled = is_pooled
        self._closed = False

    def cursor(self):
        return PostgresCursorWrapper(self._conn.cursor())

    def execute(self, sql: str, params=None):
        cur = self.cursor()
        cur.execute(sql, params)
        return cur

    def commit(self):
        if self._conn and self._conn.closed == 0:
            return self._conn.commit()

    def rollback(self):
        if self._conn and self._conn.closed == 0:
            try:
                return self._conn.rollback()
            except Exception:
                pass

    def close(self):
        if self._closed:
            return
        self._closed = True
        if self._is_pooled:
            _return_pooled_pg_connection(self._conn)
        else:
            self._conn.close()

    def __getattr__(self, name):
        return getattr(self._conn, name)

def get_db_connection():
    if is_postgres():
        raw_conn = _get_pooled_pg_connection()
        return PostgresConnectionWrapper(raw_conn, is_pooled=True)
    else:
        conn = sqlite3.connect(settings.DATABASE_PATH, timeout=30.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        return conn


@contextmanager
def get_db():
    conn = get_db_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_db():
    """Initialize database tables, indexes, and initial admin seed."""
    settings.ensure_directories()
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Dialect adjustments
        pk_auto = "SERIAL PRIMARY KEY" if is_postgres() else "INTEGER PRIMARY KEY AUTOINCREMENT"
        text_type = "TEXT"
        real_type = "REAL"
        int_type = "INTEGER"
        
        # 1. Institutes Table
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS institutes (
            id {text_type} PRIMARY KEY,
            name {text_type} NOT NULL,
            code {text_type} NOT NULL UNIQUE,
            created_at {text_type} NOT NULL
        );
        """)

        # 2. Branches Table
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS branches (
            id {text_type} PRIMARY KEY,
            institute_id {text_type} NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
            name {text_type} NOT NULL,
            code {text_type} NOT NULL,
            city {text_type} NOT NULL,
            created_at {text_type} NOT NULL
        );
        """)

        # 3. Users Table (RBAC: ROOT_ADMIN, BRANCH_MANAGER, STUDENT)
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS users (
            id {text_type} PRIMARY KEY,
            institute_id {text_type} REFERENCES institutes(id) ON DELETE SET NULL,
            branch_id {text_type} REFERENCES branches(id) ON DELETE SET NULL,
            email {text_type} UNIQUE,
            role {text_type} NOT NULL,
            password_hash {text_type} NOT NULL,
            full_name {text_type} NOT NULL,
            is_active {int_type} NOT NULL DEFAULT 1,
            last_login_at {text_type},
            created_at {text_type} NOT NULL
        );
        """)

        # 4. Batches Table
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS batches (
            id {text_type} PRIMARY KEY,
            branch_id {text_type} REFERENCES branches(id) ON DELETE CASCADE,
            exam_id {text_type},
            name {text_type} NOT NULL,
            code {text_type} NOT NULL DEFAULT '',
            academic_year {text_type} NOT NULL DEFAULT '2026',
            status {text_type} NOT NULL DEFAULT 'QUEUED',
            total_submissions {int_type} NOT NULL DEFAULT 0,
            completed_submissions {int_type} NOT NULL DEFAULT 0,
            failed_submissions {int_type} NOT NULL DEFAULT 0,
            created_at {text_type} NOT NULL,
            updated_at {text_type} NOT NULL
        );
        """)

        # 5. Students Table (with numeric Student ID for account claim)
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS students (
            id {text_type} PRIMARY KEY,
            batch_id {text_type} NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
            user_id {text_type} REFERENCES users(id) ON DELETE SET NULL,
            student_id_num {text_type} NOT NULL UNIQUE,
            roll_number {text_type} NOT NULL,
            full_name {text_type} NOT NULL,
            email {text_type},
            phone {text_type},
            account_claimed {int_type} NOT NULL DEFAULT 0,
            claimed_at {text_type},
            created_at {text_type} NOT NULL
        );
        """)

        # 6. Exams Table
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS exams (
            id {text_type} PRIMARY KEY,
            institute_id {text_type} REFERENCES institutes(id) ON DELETE SET NULL,
            branch_id {text_type} REFERENCES branches(id) ON DELETE SET NULL,
            title {text_type} NOT NULL,
            subject {text_type} NOT NULL,
            total_marks {real_type} NOT NULL DEFAULT 0.0,
            question_paper_path {text_type},
            answer_key_path {text_type},
            current_rubric_version_id {text_type},
            lifecycle_status {text_type} NOT NULL DEFAULT 'DRAFT',
            is_published {int_type} NOT NULL DEFAULT 0,
            published_at {text_type},
            created_by {text_type},
            status {text_type} NOT NULL DEFAULT 'DRAFT',
            created_at {text_type} NOT NULL,
            updated_at {text_type} NOT NULL
        );
        """)

        # 7. Submission Windows Table (30-min window + 2-min grace)
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS submission_windows (
            id {text_type} PRIMARY KEY,
            exam_id {text_type} NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
            branch_id {text_type} REFERENCES branches(id) ON DELETE SET NULL,
            window_number {int_type} NOT NULL DEFAULT 1,
            opened_at {text_type} NOT NULL,
            deadline_at {text_type} NOT NULL,
            grace_deadline_at {text_type} NOT NULL,
            status {text_type} NOT NULL DEFAULT 'OPEN',
            reopen_reason {text_type},
            reopen_scope {text_type} DEFAULT 'UNSUBMITTED_ONLY',
            created_by {text_type},
            created_at {text_type} NOT NULL
        );
        """)

        # 8. Rubric Versions Table (Draft -> Approved lock)
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS rubric_versions (
            id {text_type} PRIMARY KEY,
            exam_id {text_type} NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
            version_num {int_type} NOT NULL,
            is_approved {int_type} NOT NULL DEFAULT 0,
            approved_by {text_type},
            approved_at {text_type},
            rubric_data {text_type} NOT NULL,
            created_at {text_type} NOT NULL
        );
        """)

        # 9. Submissions Table (Single combined PDF per student)
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS submissions (
            id {text_type} PRIMARY KEY,
            exam_id {text_type} NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
            batch_id {text_type} REFERENCES batches(id) ON DELETE SET NULL,
            student_id {text_type} REFERENCES students(id) ON DELETE SET NULL,
            student_name {text_type} NOT NULL,
            roll_number {text_type} NOT NULL,
            original_file_path {text_type} NOT NULL,
            canonical_pdf_path {text_type} NOT NULL,
            annotated_pdf_path {text_type},
            page_count {int_type} NOT NULL DEFAULT 1,
            file_size_bytes {int_type} NOT NULL DEFAULT 0,
            sha256_hash {text_type},
            upload_session_id {text_type},
            submission_status {text_type} NOT NULL DEFAULT 'SUBMITTED',
            status {text_type} NOT NULL DEFAULT 'UPLOADED',
            publication_status {text_type} NOT NULL DEFAULT 'UNPUBLISHED',
            total_awarded_marks {real_type} NOT NULL DEFAULT 0.0,
            max_marks {real_type} NOT NULL DEFAULT 0.0,
            percentage {real_type} NOT NULL DEFAULT 0.0,
            is_manual_override {int_type} NOT NULL DEFAULT 0,
            error_message {text_type},
            retry_count {int_type} NOT NULL DEFAULT 0,
            submitted_at {text_type} NOT NULL DEFAULT '',
            reviewed_at {text_type},
            graded_at {text_type},
            ttl_days {int_type} NOT NULL DEFAULT 15,
            retention_expires_at {text_type},
            is_document_purged {int_type} NOT NULL DEFAULT 0,
            purged_at {text_type},
            created_at {text_type} NOT NULL,
            updated_at {text_type} NOT NULL
        );
        """)

        # 10. Answers Table
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS answers (
            id {text_type} PRIMARY KEY,
            submission_id {text_type} NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
            question_id {text_type} NOT NULL,
            subquestion_id {text_type},
            section_id {text_type},
            is_extra_attempt {int_type} NOT NULL DEFAULT 0,
            page_number {int_type} NOT NULL DEFAULT 1,
            extracted_text {text_type} NOT NULL DEFAULT '',
            max_marks {real_type} NOT NULL DEFAULT 0.0,
            awarded_marks {real_type} NOT NULL DEFAULT 0.0,
            grading_rationale {text_type} NOT NULL DEFAULT '',
            transcription_uncertainty {real_type} NOT NULL DEFAULT 0.0,
            grading_uncertainty {real_type} NOT NULL DEFAULT 0.0,
            needs_review {int_type} NOT NULL DEFAULT 0,
            review_reason {text_type},
            is_missing {int_type} NOT NULL DEFAULT 0,
            is_manual_override {int_type} NOT NULL DEFAULT 0,
            override_reason {text_type},
            created_at {text_type} NOT NULL,
            updated_at {text_type} NOT NULL
        );
        """)

        # 11. Answer Regions Table (Bounding box annotations)
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS answer_regions (
            id {text_type} PRIMARY KEY,
            answer_id {text_type} NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
            page_number {int_type} NOT NULL,
            x {real_type} NOT NULL,
            y {real_type} NOT NULL,
            width {real_type} NOT NULL,
            height {real_type} NOT NULL,
            is_manual_override {int_type} NOT NULL DEFAULT 0,
            created_at {text_type} NOT NULL
        );
        """)

        # 12. Criterion Scores Table
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS criterion_scores (
            id {text_type} PRIMARY KEY,
            answer_id {text_type} NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
            criterion_id {text_type} NOT NULL,
            description {text_type} NOT NULL,
            max_marks {real_type} NOT NULL DEFAULT 0.0,
            awarded_marks {real_type} NOT NULL DEFAULT 0.0,
            evidence {text_type} NOT NULL DEFAULT '',
            is_manual_override {int_type} NOT NULL DEFAULT 0,
            created_at {text_type} NOT NULL
        );
        """)

        # 13. Evaluation Queue Table (Row-level locked FIFO)
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS evaluation_queue (
            id {text_type} PRIMARY KEY,
            submission_id {text_type} NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
            exam_id {text_type} NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
            priority {int_type} NOT NULL DEFAULT 100,
            status {text_type} NOT NULL DEFAULT 'QUEUED',
            attempt_count {int_type} NOT NULL DEFAULT 0,
            claimed_by_worker {text_type},
            claimed_at {text_type},
            last_error {text_type},
            created_at {text_type} NOT NULL,
            updated_at {text_type} NOT NULL
        );
        """)

        # 14. Revaluation Requests Table (Strictly manual 7-day revaluation)
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS revaluation_requests (
            id {text_type} PRIMARY KEY,
            submission_id {text_type} NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
            student_id {text_type} NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            exam_id {text_type} NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
            status {text_type} NOT NULL DEFAULT 'SUBMITTED',
            question_ids_json {text_type} NOT NULL,
            student_reason {text_type} NOT NULL,
            decision {text_type},
            reviewer_notes {text_type},
            resolved_by {text_type},
            requested_at {text_type} NOT NULL,
            resolved_at {text_type},
            expires_at {text_type} NOT NULL
        );
        """)

        # 15. In-App Notifications Table
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS notifications (
            id {text_type} PRIMARY KEY,
            user_id {text_type} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            type {text_type} NOT NULL,
            title {text_type} NOT NULL,
            message {text_type} NOT NULL,
            link_url {text_type},
            is_read {int_type} NOT NULL DEFAULT 0,
            created_at {text_type} NOT NULL
        );
        """)

        # 15b. Web Push Subscriptions Table (VAPID for background & closed-app mobile push)
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id {text_type} PRIMARY KEY,
            user_id {text_type} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            endpoint {text_type} NOT NULL UNIQUE,
            p256dh {text_type} NOT NULL,
            auth {text_type} NOT NULL,
            user_agent {text_type},
            created_at {text_type} NOT NULL
        );
        """)

        # 15c. Student Password Reset Requests Table (Branch Manager Approval Flow)
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS password_reset_requests (
            id {text_type} PRIMARY KEY,
            user_id {text_type} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            student_id {text_type} REFERENCES students(id) ON DELETE SET NULL,
            branch_id {text_type} REFERENCES branches(id) ON DELETE SET NULL,
            roll_number {text_type},
            student_name {text_type},
            student_email {text_type},
            status {text_type} NOT NULL DEFAULT 'PENDING',
            reset_token {text_type},
            approved_by {text_type} REFERENCES users(id) ON DELETE SET NULL,
            approved_at {text_type},
            completed_at {text_type},
            expires_at {text_type} NOT NULL,
            created_at {text_type} NOT NULL
        );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_pwd_reset_user ON password_reset_requests(user_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_pwd_reset_branch ON password_reset_requests(branch_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_pwd_reset_status ON password_reset_requests(status);")

        # 15d. Technical Issue Reports Table
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS technical_reports (
            id {text_type} PRIMARY KEY,
            user_id {text_type} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            user_role {text_type} NOT NULL,
            user_name {text_type} NOT NULL,
            user_email {text_type},
            user_roll {text_type},
            branch_id {text_type} REFERENCES branches(id) ON DELETE SET NULL,
            category {text_type} NOT NULL,
            subject {text_type} NOT NULL,
            description {text_type} NOT NULL,
            screenshots_json {text_type} NOT NULL DEFAULT '[]',
            status {text_type} NOT NULL DEFAULT 'OPEN',
            admin_notes {text_type},
            resolved_by {text_type} REFERENCES users(id) ON DELETE SET NULL,
            resolved_at {text_type},
            created_at {text_type} NOT NULL,
            updated_at {text_type} NOT NULL
        );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_tech_rep_user ON technical_reports(user_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_tech_rep_branch ON technical_reports(branch_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_tech_rep_status ON technical_reports(status);")

        # 16. Audit Logs Table
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id {text_type} PRIMARY KEY,
            user_id {text_type},
            submission_id {text_type},
            answer_id {text_type},
            field_name {text_type},
            old_value {text_type},
            new_value {text_type},
            reason {text_type},
            edited_by {text_type},
            action {text_type} DEFAULT 'MANUAL_EDIT',
            resource_type {text_type} DEFAULT 'ANSWER',
            resource_id {text_type},
            details_json {text_type},
            ip_address {text_type},
            created_at {text_type} NOT NULL
        );
        """)

        # 17. API Usage Events Table (Telemetry & Cost)
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS api_usage_events (
            id {text_type} PRIMARY KEY,
            timestamp {text_type} NOT NULL,
            exam_id {text_type},
            batch_id {text_type},
            submission_id {text_type},
            request_purpose {text_type} NOT NULL,
            model_name {text_type} NOT NULL,
            input_tokens {int_type},
            output_tokens {int_type},
            total_tokens {int_type},
            thinking_tokens {int_type},
            cached_tokens {int_type},
            duration_ms {int_type} NOT NULL,
            page_count {int_type},
            file_size_bytes {int_type},
            success {int_type} NOT NULL,
            http_status {int_type},
            error_code {text_type},
            retry_attempt {int_type} NOT NULL DEFAULT 0,
            estimated_cost_usd {real_type},
            pricing_version {text_type} NOT NULL,
            is_mock {int_type} NOT NULL DEFAULT 0
        );
        """)

        # 18. User Quota Settings Table
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS user_quota_settings (
            id {text_type} PRIMARY KEY,
            rpm_limit {int_type} NOT NULL DEFAULT 15,
            tpm_limit {int_type} NOT NULL DEFAULT 1000000,
            rpd_limit {int_type} NOT NULL DEFAULT 1500,
            updated_at {text_type} NOT NULL
        );
        """)

        # 19. Experiment Benchmarks Table
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS experiment_benchmarks (
            id {text_type} PRIMARY KEY,
            exam_id {text_type} NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
            submission_id {text_type} NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
            ground_truth_marks {real_type},
            ground_truth_answers_json {text_type},
            transcription_accepted {int_type} DEFAULT 1,
            mapping_correct {int_type} DEFAULT 1,
            box_accepted {int_type} DEFAULT 1,
            marks_matched {int_type} DEFAULT 1,
            explanation_sufficient {int_type} DEFAULT 1,
            manual_intervention_required {int_type} DEFAULT 0,
            notes {text_type},
            created_at {text_type} NOT NULL
        );
        """)

        # Migrate missing columns if SQLite database had older schema
        if not is_postgres():
            cursor.execute("PRAGMA table_info(submissions)")
            cols = [row[1] for row in cursor.fetchall()]
            if "student_id" not in cols:
                cursor.execute("ALTER TABLE submissions ADD COLUMN student_id TEXT")
            if "publication_status" not in cols:
                cursor.execute("ALTER TABLE submissions ADD COLUMN publication_status TEXT NOT NULL DEFAULT 'UNPUBLISHED'")
            if "submission_status" not in cols:
                cursor.execute("ALTER TABLE submissions ADD COLUMN submission_status TEXT NOT NULL DEFAULT 'SUBMITTED'")
            if "annotated_pdf_path" not in cols:
                cursor.execute("ALTER TABLE submissions ADD COLUMN annotated_pdf_path TEXT")
            if "sha256_hash" not in cols:
                cursor.execute("ALTER TABLE submissions ADD COLUMN sha256_hash TEXT")
            if "submitted_at" not in cols:
                cursor.execute("ALTER TABLE submissions ADD COLUMN submitted_at TEXT NOT NULL DEFAULT ''")
            if "file_size_bytes" not in cols:
                cursor.execute("ALTER TABLE submissions ADD COLUMN file_size_bytes INTEGER NOT NULL DEFAULT 0")
            if "upload_session_id" not in cols:
                cursor.execute("ALTER TABLE submissions ADD COLUMN upload_session_id TEXT")
            if "graded_at" not in cols:
                cursor.execute("ALTER TABLE submissions ADD COLUMN graded_at TEXT")
            if "ttl_days" not in cols:
                cursor.execute("ALTER TABLE submissions ADD COLUMN ttl_days INTEGER NOT NULL DEFAULT 15")
            if "retention_expires_at" not in cols:
                cursor.execute("ALTER TABLE submissions ADD COLUMN retention_expires_at TEXT")
            if "is_document_purged" not in cols:
                cursor.execute("ALTER TABLE submissions ADD COLUMN is_document_purged INTEGER NOT NULL DEFAULT 0")
            if "purged_at" not in cols:
                cursor.execute("ALTER TABLE submissions ADD COLUMN purged_at TEXT")

            cursor.execute("PRAGMA table_info(exams)")
            exam_cols = [row[1] for row in cursor.fetchall()]
            if "institute_id" not in exam_cols:
                cursor.execute("ALTER TABLE exams ADD COLUMN institute_id TEXT")
            if "branch_id" not in exam_cols:
                cursor.execute("ALTER TABLE exams ADD COLUMN branch_id TEXT")
            if "lifecycle_status" not in exam_cols:
                cursor.execute("ALTER TABLE exams ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'DRAFT'")
            if "is_published" not in exam_cols:
                cursor.execute("ALTER TABLE exams ADD COLUMN is_published INTEGER NOT NULL DEFAULT 0")
            if "published_at" not in exam_cols:
                cursor.execute("ALTER TABLE exams ADD COLUMN published_at TEXT")
            if "created_by" not in exam_cols:
                cursor.execute("ALTER TABLE exams ADD COLUMN created_by TEXT")

            cursor.execute("PRAGMA table_info(batches)")
            batch_info = cursor.fetchall()
            exam_id_col = next((row for row in batch_info if row[1] == "exam_id"), None)
            if exam_id_col and exam_id_col[3] == 1: # notnull == 1
                cursor.execute("PRAGMA foreign_keys = OFF;")
                cursor.execute("ALTER TABLE batches RENAME TO batches_old;")
                cursor.execute("""
                CREATE TABLE batches (
                    id TEXT PRIMARY KEY,
                    branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
                    exam_id TEXT,
                    name TEXT NOT NULL,
                    code TEXT NOT NULL DEFAULT '',
                    academic_year TEXT NOT NULL DEFAULT '2026',
                    status TEXT NOT NULL DEFAULT 'QUEUED',
                    total_submissions INTEGER NOT NULL DEFAULT 0,
                    completed_submissions INTEGER NOT NULL DEFAULT 0,
                    failed_submissions INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """)
                cursor.execute("""
                INSERT INTO batches (id, branch_id, exam_id, name, code, academic_year, status, total_submissions, completed_submissions, failed_submissions, created_at, updated_at)
                SELECT id, branch_id, exam_id, name, code, academic_year, status, total_submissions, completed_submissions, failed_submissions, created_at, updated_at FROM batches_old;
                """)
                cursor.execute("DROP TABLE batches_old;")
                cursor.execute("PRAGMA foreign_keys = ON;")

            cursor.execute("PRAGMA table_info(answers)")
            ans_cols = [row[1] for row in cursor.fetchall()]
            if "is_extra_attempt" not in ans_cols:
                cursor.execute("ALTER TABLE answers ADD COLUMN is_extra_attempt INTEGER NOT NULL DEFAULT 0")
            if "section_id" not in ans_cols:
                cursor.execute("ALTER TABLE answers ADD COLUMN section_id TEXT")
            if "override_reason" not in ans_cols:
                cursor.execute("ALTER TABLE answers ADD COLUMN override_reason TEXT")

            cursor.execute("PRAGMA table_info(audit_logs)")
            audit_cols = [row[1] for row in cursor.fetchall()]
            if "answer_id" not in audit_cols:
                cursor.execute("ALTER TABLE audit_logs ADD COLUMN answer_id TEXT")
            if "field_name" not in audit_cols:
                cursor.execute("ALTER TABLE audit_logs ADD COLUMN field_name TEXT")
            if "old_value" not in audit_cols:
                cursor.execute("ALTER TABLE audit_logs ADD COLUMN old_value TEXT")
            if "new_value" not in audit_cols:
                cursor.execute("ALTER TABLE audit_logs ADD COLUMN new_value TEXT")
            if "reason" not in audit_cols:
                cursor.execute("ALTER TABLE audit_logs ADD COLUMN reason TEXT")
            if "edited_by" not in audit_cols:
                cursor.execute("ALTER TABLE audit_logs ADD COLUMN edited_by TEXT")
            if "user_id" not in audit_cols:
                cursor.execute("ALTER TABLE audit_logs ADD COLUMN user_id TEXT")
            if "action" not in audit_cols:
                cursor.execute("ALTER TABLE audit_logs ADD COLUMN action TEXT NOT NULL DEFAULT ''")
            if "resource_type" not in audit_cols:
                cursor.execute("ALTER TABLE audit_logs ADD COLUMN resource_type TEXT NOT NULL DEFAULT ''")
            if "resource_id" not in audit_cols:
                cursor.execute("ALTER TABLE audit_logs ADD COLUMN resource_id TEXT")
            if "details_json" not in audit_cols:
                cursor.execute("ALTER TABLE audit_logs ADD COLUMN details_json TEXT")
            if "ip_address" not in audit_cols:
                cursor.execute("ALTER TABLE audit_logs ADD COLUMN ip_address TEXT")
        else:
            try:
                cursor.execute("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS graded_at TEXT;")
                cursor.execute("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS ttl_days INTEGER NOT NULL DEFAULT 15;")
                cursor.execute("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS retention_expires_at TEXT;")
                cursor.execute("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS is_document_purged INTEGER NOT NULL DEFAULT 0;")
                cursor.execute("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS purged_at TEXT;")
                conn.commit()
            except Exception:
                conn.rollback()

        # Create Indexes
        indexes = [
            ("idx_users_email", "users", "email"),
            ("idx_users_role", "users", "role"),
            ("idx_students_num", "students", "student_id_num"),
            ("idx_students_batch", "students", "batch_id"),
            ("idx_exams_inst", "exams", "institute_id"),
            ("idx_submissions_exam", "submissions", "exam_id"),
            ("idx_submissions_student", "submissions", "student_id"),
            ("idx_submissions_status", "submissions", "status"),
            ("idx_submissions_retention", "submissions", "is_document_purged, retention_expires_at"),
            ("idx_answers_sub", "answers", "submission_id"),
            ("idx_regions_ans", "answer_regions", "answer_id"),
            ("idx_queue_status", "evaluation_queue", "status"),
            ("idx_reval_sub", "revaluation_requests", "submission_id"),
            ("idx_notif_user", "notifications", "user_id"),
            ("idx_push_subs_user", "push_subscriptions", "user_id"),
            ("idx_tech_rep_user", "technical_reports", "user_id"),
            ("idx_tech_rep_status", "technical_reports", "status"),
            ("idx_tech_rep_branch", "technical_reports", "branch_id"),
            ("idx_audit_resource", "audit_logs", "resource_type, resource_id"),
        ]
        for idx_name, tbl, cols in indexes:
            try:
                cursor.execute(f"CREATE INDEX IF NOT EXISTS {idx_name} ON {tbl}({cols});")
                if is_postgres():
                    conn.commit()
            except Exception:
                if is_postgres():
                    conn.rollback()

        # Seed default user quota settings if empty
        cursor.execute("SELECT id FROM user_quota_settings WHERE id = 'default'")
        if not cursor.fetchone():
            param_placeholder = "%s" if is_postgres() else "?"
            cursor.execute(f"""
            INSERT INTO user_quota_settings (id, rpm_limit, tpm_limit, rpd_limit, updated_at)
            VALUES ('default', {param_placeholder}, {param_placeholder}, {param_placeholder}, {param_placeholder})
            """, (settings.DEFAULT_RPM_LIMIT, settings.DEFAULT_TPM_LIMIT, settings.DEFAULT_RPD_LIMIT, get_iso_now()))

        # Seed Root Admin if no users exist
        seed_default_admin(cursor)

def seed_default_admin(cursor):
    """Seed initial Root Admin account if users table is empty."""
    from backend.app.services.auth import hash_password
    
    cursor.execute("SELECT COUNT(*) as cnt FROM users")
    row = cursor.fetchone()
    count = row["cnt"] if isinstance(row, dict) or hasattr(row, "__getitem__") else row[0]
    
    if count == 0:
        admin_id = f"usr_{uuid.uuid4().hex[:12]}"
        inst_id = f"inst_{uuid.uuid4().hex[:12]}"
        branch_id = f"br_{uuid.uuid4().hex[:12]}"
        now = get_iso_now()
        
        param = "%s" if is_postgres() else "?"
        
        # Create default institute and branch
        cursor.execute(f"""
        INSERT INTO institutes (id, name, code, created_at)
        VALUES ({param}, {param}, {param}, {param})
        """, (inst_id, "Apex Engineering Institute", "AEI", now))
        
        cursor.execute(f"""
        INSERT INTO branches (id, institute_id, name, code, city, created_at)
        VALUES ({param}, {param}, {param}, {param}, {param}, {param})
        """, (branch_id, inst_id, "Main Campus", "AEI_MAIN", "Mumbai", now))
        
        # Create Root Admin user
        admin_email = os.getenv("DEFAULT_ADMIN_EMAIL", "admin@papergrade.ai")
        admin_pass = os.getenv("DEFAULT_ADMIN_PASSWORD", "AdminPassword123!")
        hashed_pass = hash_password(admin_pass)
        
        cursor.execute(f"""
        INSERT INTO users (id, institute_id, branch_id, email, role, password_hash, full_name, is_active, created_at)
        VALUES ({param}, {param}, {param}, {param}, {param}, {param}, {param}, 1, {param})
        """, (admin_id, inst_id, branch_id, admin_email, "ROOT_ADMIN", hashed_pass, "System Administrator", now))

if __name__ == "__main__":
    init_db()
    print("Database initialized and verified successfully.")
