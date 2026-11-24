import os
from contextlib import contextmanager
from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import NullPool, QueuePool
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

def is_postgres() -> bool:
    return not is_sqlite

engine_kwargs = {}

if is_sqlite:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
    engine_kwargs["pool_pre_ping"] = True
else:
    # Supabase Transaction Mode Pooler (:6543) / PgBouncer tuning:
    if settings.DB_POOL_TYPE == "null":
        # Fallback mode: Stateless connection checkout with no client-side pool limits.
        engine_kwargs["poolclass"] = NullPool
        engine_kwargs["pool_pre_ping"] = False
    else:
        # Phase 1: Industry-standard QueuePool with LIFO warm connection reuse.
        # Eliminates 457ms WAN TLS negotiation and ~10KB egress per checkout.
        # Bounded to 40 max connections matching AnyIO thread pool limiter.
        engine_kwargs["poolclass"] = QueuePool
        engine_kwargs["pool_size"] = settings.DB_POOL_SIZE
        engine_kwargs["max_overflow"] = settings.DB_POOL_MAX_OVERFLOW
        engine_kwargs["pool_timeout"] = settings.DB_POOL_TIMEOUT
        engine_kwargs["pool_recycle"] = settings.DB_POOL_RECYCLE
        engine_kwargs["pool_use_lifo"] = True
        engine_kwargs["pool_pre_ping"] = False

    engine_kwargs["connect_args"] = {
        "connect_timeout": 10,
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5,
    }

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
