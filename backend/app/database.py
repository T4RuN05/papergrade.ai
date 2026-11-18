"""
[DEPRECATED] Legacy database module retained for backward compatibility.
All core application routers and services have been migrated to:
    from backend.app.db.session import engine, get_db, get_session, is_postgres
    from backend.app.db.base import Base, get_iso_now
    from backend.app.db.models import *
"""

import sqlite3
import json
import uuid
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
import logging

from backend.app.config import settings
from backend.app.db.session import engine, get_session, is_postgres
from backend.app.db.base import get_iso_now

logger = logging.getLogger(__name__)


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


class PostgresConnectionWrapper:
    """Wraps DBAPI connection from engine.raw_connection() to mimic sqlite3 connection API."""
    def __init__(self, raw_conn):
        self._conn = raw_conn
        self._closed = False

    def cursor(self):
        from psycopg2.extras import RealDictCursor
        return PostgresCursorWrapper(self._conn.cursor(cursor_factory=RealDictCursor))

    def execute(self, sql: str, params=None):
        cur = self.cursor()
        cur.execute(sql, params)
        return cur

    def commit(self):
        if self._conn and not getattr(self._conn, "closed", False):
            return self._conn.commit()

    def rollback(self):
        if self._conn and not getattr(self._conn, "closed", False):
            try:
                return self._conn.rollback()
            except Exception:
                pass

    def close(self):
        if self._closed:
            return
        self._closed = True
        if self._conn:
            try:
                self._conn.close()
            except Exception:
                pass

    def __getattr__(self, name):
        return getattr(self._conn, name)


def get_db_connection():
    """Acquire a raw DBAPI connection backed by SQLAlchemy engine pool or SQLite file."""
    if is_postgres():
        raw_conn = engine.raw_connection()
        return PostgresConnectionWrapper(raw_conn)
    else:
        conn = sqlite3.connect(settings.DATABASE_PATH, timeout=30.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        return conn


@contextmanager
def get_db():
    """
    [DEPRECATED] Legacy raw SQL database connection context manager.
    Prefer using SQLAlchemy 2.0 ORM sessions via:
        from backend.app.db.session import get_db, get_session
    """
    conn = get_db_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _seed_defaults():
    """Seed initial defaults (quota settings, admin user, borivali subjects) via ORM."""
    from backend.app.db.models import (
        UserQuotaSetting,
        User,
        Institute,
        Branch,
        Subject,
        Exam,
    )
    from backend.app.services.auth import hash_password
    from sqlalchemy import select, func

    try:
        with get_session() as session:
            # 1. Default Quota Setting
            quota = session.scalar(select(UserQuotaSetting).where(UserQuotaSetting.id == "default"))
            if not quota:
                session.add(UserQuotaSetting(
                    id="default",
                    rpm_limit=settings.DEFAULT_RPM_LIMIT,
                    tpm_limit=settings.DEFAULT_TPM_LIMIT,
                    rpd_limit=settings.DEFAULT_RPD_LIMIT,
                    updated_at=get_iso_now()
                ))

            # 2. Seed Default Root Admin if no users exist
            user_cnt = session.scalar(select(func.count(User.id)))
            if user_cnt == 0:
                now = get_iso_now()
                admin_id = f"usr_{uuid.uuid4().hex[:12]}"
                inst_id = f"inst_{uuid.uuid4().hex[:12]}"
                branch_id = f"br_{uuid.uuid4().hex[:12]}"

                inst = Institute(id=inst_id, name="Apex Engineering Institute", code="AEI", created_at=now)
                branch = Branch(id=branch_id, institute_id=inst_id, name="Main Campus", code="AEI_MAIN", city="Mumbai", created_at=now)
                admin_email = os.getenv("DEFAULT_ADMIN_EMAIL", "admin@papergrade.ai")
                admin_pass = os.getenv("DEFAULT_ADMIN_PASSWORD", "AdminPassword123!")
                hashed_pass = hash_password(admin_pass)
                admin_user = User(
                    id=admin_id,
                    institute_id=inst_id,
                    branch_id=branch_id,
                    email=admin_email,
                    role="ROOT_ADMIN",
                    password_hash=hashed_pass,
                    full_name="System Administrator",
                    is_active=1,
                    created_at=now
                )
                session.add_all([inst, branch, admin_user])

            # 3. Seed Borivali default subjects if applicable
            borivali_branches = session.scalars(
                select(Branch).where(
                    (Branch.id == "br_28c2a5dfe193") | (func.lower(Branch.name).like("%borivali%"))
                )
            ).all()
            default_subjects = ["Physics", "Chemistry", "Maths", "Biology"]
            subjects_json = json.dumps(default_subjects)
            now = get_iso_now()

            for b in borivali_branches:
                if not b.subjects:
                    b.subjects = subjects_json
                for s_name in default_subjects:
                    existing = session.scalar(
                        select(Subject).where(
                            Subject.branch_id == b.id,
                            func.lower(Subject.name) == s_name.lower()
                        )
                    )
                    if not existing:
                        session.add(Subject(
                            id=f"sub_{uuid.uuid4().hex[:12]}",
                            institute_id=b.institute_id,
                            branch_id=b.id,
                            name=s_name,
                            code=s_name[:4].upper(),
                            created_at=now
                        ))

            # Catch 25 institute subjects if not set
            c25_insts = session.scalars(
                select(Institute).where(
                    (Institute.id == "inst_e1eeda3473c3") | (func.upper(Institute.code) == "C25")
                )
            ).all()
            for c in c25_insts:
                if not c.subjects:
                    c.subjects = subjects_json

            # Assign KTG exams to Physics
            ktg_exams = session.scalars(
                select(Exam).where(func.upper(Exam.title).like("%KTG%"))
            ).all()
            for ex in ktg_exams:
                if not ex.subject or ex.subject != "Physics":
                    ex.subject = "Physics"

            session.commit()
    except Exception as e:
        logger.warning(f"Notice during default database seeding: {e}")


def init_db():
    """Initialize database tables, indexes, and initial admin seed via SQLAlchemy ORM."""
    settings.ensure_directories()
    from backend.app.db.base import Base
    import backend.app.db.models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _seed_defaults()


if __name__ == "__main__":
    init_db()
    print("Database initialized and verified successfully.")
