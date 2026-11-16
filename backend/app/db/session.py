import os
from contextlib import contextmanager
from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from backend.app.config import settings

def get_database_url() -> str:
    """Resolve and format the database URL for SQLAlchemy 2.0 with psycopg2 driver."""
    url = (settings.DATABASE_URL or "").strip()
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg2://", 1)
    elif url.startswith("postgresql://") and not url.startswith("postgresql+"):
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
    
    # Supabase session mode (:5432) has a strict limit of 15 connections.
    # Transaction mode (:6543) scales to thousands of concurrent requests through PgBouncer.
    if "pooler.supabase.com:5432" in url:
        url = url.replace("pooler.supabase.com:5432", "pooler.supabase.com:6543")

    if not url:
        # Fallback to local SQLite data directory
        sqlite_path = settings.DATA_DIR / "papergrade.db"
        sqlite_path.parent.mkdir(parents=True, exist_ok=True)
        url = f"sqlite:///{sqlite_path.as_posix()}"
    return url

DATABASE_URL = get_database_url()
is_sqlite = DATABASE_URL.startswith("sqlite")

engine_kwargs = {
    "pool_pre_ping": True,  # Liveness check prevents stale SSL/timeout socket drops
}

if is_sqlite:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    # Production Postgres / Supabase PgBouncer transaction pooler tuning
    engine_kwargs["pool_recycle"] = 300
    engine_kwargs["pool_size"] = 15
    engine_kwargs["max_overflow"] = 25
    engine_kwargs["pool_reset_on_return"] = "rollback"  # Ensures connections never linger in 'idle in transaction'

engine = create_engine(DATABASE_URL, **engine_kwargs)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    expire_on_commit=False
)

def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency for scoped request session management."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@contextmanager
def get_session() -> Generator[Session, None, None]:
    """Context manager for standalone scripts, background workers, and thread dispatchers."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
