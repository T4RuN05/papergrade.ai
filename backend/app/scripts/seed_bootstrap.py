"""
Minimal first-run bootstrap seed utility (no CATCH 25 / Borivali hardcoding).
Run manually on a fresh database:
    python -m backend.app.scripts.seed_bootstrap
"""

import os
import uuid
import logging
from sqlalchemy import select, func

from backend.app.config import settings
from backend.app.db.base import Base, get_iso_now
from backend.app.db.session import engine, get_session, is_postgres
import backend.app.db.models  # noqa: F401
from backend.app.db.models import UserQuotaSetting, User, Institute, Branch
from backend.app.services.auth import hash_password

logger = logging.getLogger("SeedBootstrap")


def init_test_schema() -> None:
    """Create ORM tables strictly for local SQLite or test environments."""
    if not is_postgres() or settings.ENVIRONMENT == "test":
        settings.ensure_directories()
        Base.metadata.create_all(bind=engine)


def seed_bootstrap_defaults() -> None:
    """
    Idempotently seed minimal bootstrap records on a brand-new empty database:
    - Default quota row (`UserQuotaSetting` id='default')
    - Default ROOT_ADMIN account when zero users exist
    Never modifies existing production institutes or exams.
    """
    with get_session() as session:
        quota = session.scalar(select(UserQuotaSetting).where(UserQuotaSetting.id == "default"))
        if not quota:
            session.add(
                UserQuotaSetting(
                    id="default",
                    rpm_limit=settings.DEFAULT_RPM_LIMIT,
                    tpm_limit=settings.DEFAULT_TPM_LIMIT,
                    rpd_limit=settings.DEFAULT_RPD_LIMIT,
                    updated_at=get_iso_now(),
                )
            )

        user_cnt = session.scalar(select(func.count(User.id))) or 0
        if user_cnt == 0:
            now = get_iso_now()
            inst_id = f"inst_{uuid.uuid4().hex[:12]}"
            branch_id = f"br_{uuid.uuid4().hex[:12]}"
            admin_id = f"usr_{uuid.uuid4().hex[:12]}"

            inst = Institute(id=inst_id, name="PaperGrade Bootstrap Institute", code="PGB", created_at=now)
            branch = Branch(
                id=branch_id,
                institute_id=inst_id,
                name="Main Campus",
                code="PGB_MAIN",
                city="Mumbai",
                created_at=now,
            )
            admin_email = os.getenv("DEFAULT_ADMIN_EMAIL", "admin@papergrade.ai")
            admin_pass = os.getenv("DEFAULT_ADMIN_PASSWORD", "AdminPassword123!")
            admin_user = User(
                id=admin_id,
                institute_id=inst_id,
                branch_id=branch_id,
                email=admin_email,
                role="ROOT_ADMIN",
                password_hash=hash_password(admin_pass),
                full_name="System Administrator",
                is_active=1,
                created_at=now,
            )
            session.add_all([inst, branch, admin_user])

        session.commit()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    settings.ensure_directories()
    seed_bootstrap_defaults()
    logger.info("Bootstrap seed completed successfully.")
