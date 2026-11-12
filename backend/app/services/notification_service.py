import uuid
import json
import logging
import threading
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import select, or_, func

from backend.app.config import settings
from backend.app.db.session import get_session
from backend.app.db.base import get_iso_now
from backend.app.db.models import (
    Notification,
    PushSubscription,
    User,
    Student,
    Batch,
    Branch,
    Exam,
    ExamBatch,
    Submission,
)

logger = logging.getLogger(__name__)


def _send_single_webpush(sub_id: str, endpoint: str, p256dh: str, auth: str, payload_str: str):
    """Deliver a Web Push encrypted packet to Google FCM / Apple APNs / Mozilla push servers."""
    try:
        from pywebpush import webpush, WebPushException
        webpush(
            subscription_info={
                "endpoint": endpoint,
                "keys": {
                    "p256dh": p256dh,
                    "auth": auth,
                },
            },
            data=payload_str,
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={
                "sub": settings.VAPID_CLAIMS_EMAIL,
            },
            ttl=86400,  # 24 hours delivery window if device is currently offline
        )
    except Exception as ex:
        # Check if subscription has expired or unsubscribed (HTTP 404 or 410 Gone)
        response = getattr(ex, "response", None)
        status_code = getattr(response, "status_code", None)
        if status_code in (404, 410):
            try:
                with get_session() as session:
                    sub = session.scalar(select(PushSubscription).where(PushSubscription.id == sub_id))
                    if sub:
                        session.delete(sub)
            except Exception:
                pass
        else:
            logger.debug("WebPush delivery notice: %s", ex)


def dispatch_webpush_for_users(user_ids: List[str], title: str, message: str, link_url: Optional[str] = None):
    """Batch-fetch push subscriptions in 1 single DB query and dispatch in background with bounded concurrency."""
    if not settings.VAPID_PRIVATE_KEY or not user_ids:
        return

    clean_uids = list({str(u).strip() for u in user_ids if u and str(u).strip()})
    if not clean_uids:
        return

    def _worker():
        try:
            with get_session() as session:
                subs = session.scalars(
                    select(PushSubscription).where(PushSubscription.user_id.in_(clean_uids))
                ).all()

                if not subs:
                    return

                payload = json.dumps({
                    "title": title,
                    "body": message,
                    "url": link_url or "/overview",
                })

                for s in subs:
                    _send_single_webpush(
                        sub_id=s.id,
                        endpoint=s.endpoint,
                        p256dh=s.p256dh,
                        auth=s.auth,
                        payload_str=payload,
                    )
        except Exception as err:
            logger.debug("Failed in dispatch_webpush_for_users: %s", err)

    threading.Thread(target=_worker, daemon=True).start()


def dispatch_webpush_for_user(user_id: str, title: str, message: str, link_url: Optional[str] = None):
    """Trigger webpush for a single user."""
    if user_id:
        dispatch_webpush_for_users([user_id], title, message, link_url)


def prune_user_notifications(cursor_or_session, user_id: str, keep_limit: int = 50) -> int:
    """Ensure a user retains at most keep_limit latest notifications, deleting older ones."""
    if not user_id:
        return 0
    try:
        from sqlalchemy import text
        prune_sql = """
            DELETE FROM notifications
            WHERE id IN (
                SELECT id FROM (
                    SELECT id, ROW_NUMBER() OVER (
                        PARTITION BY user_id ORDER BY created_at DESC, id DESC
                    ) AS rn
                    FROM notifications
                    WHERE user_id = :user_id
                ) ranked
                WHERE ranked.rn > :keep_limit
            )
        """
        if isinstance(cursor_or_session, Session):
            res = cursor_or_session.execute(text(prune_sql), {"user_id": user_id, "keep_limit": keep_limit})
            return res.rowcount if res and res.rowcount else 0
        else:
            from backend.app.database import is_postgres
            param = "%s" if is_postgres() else "?"
            sql = f"""
                DELETE FROM notifications
                WHERE id IN (
                    SELECT id FROM (
                        SELECT id, ROW_NUMBER() OVER (
                            PARTITION BY user_id ORDER BY created_at DESC, id DESC
                        ) AS rn
                        FROM notifications
                        WHERE user_id = {param}
                    ) ranked
                    WHERE ranked.rn > {param}
                )
            """
            cursor_or_session.execute(sql, (user_id, keep_limit))
            return getattr(cursor_or_session, "rowcount", 0)
    except Exception as e:
        logger.warning(f"Failed to prune notifications for user {user_id}: {e}")
        return 0


def prune_all_notifications(cursor_or_session=None, keep_limit: int = 50) -> int:
    """
    Deletes all notifications older than keep_limit latest for each user across the entire database.
    Operates seamlessly across PostgreSQL and SQLite.
    """
    prune_sql = """
        DELETE FROM notifications
        WHERE id IN (
            SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER (
                    PARTITION BY user_id ORDER BY created_at DESC, id DESC
                ) AS rn
                FROM notifications
            ) ranked
            WHERE ranked.rn > :keep_limit
        )
    """
    try:
        if cursor_or_session is None:
            with get_session() as session:
                from sqlalchemy import text
                res = session.execute(text(prune_sql), {"keep_limit": keep_limit})
                session.commit()
                deleted = res.rowcount if res and res.rowcount else 0
                if deleted > 0:
                    logger.info(f"Pruned {deleted} old notifications across all users (limit={keep_limit}).")
                return deleted
        elif isinstance(cursor_or_session, Session):
            from sqlalchemy import text
            res = cursor_or_session.execute(text(prune_sql), {"keep_limit": keep_limit})
            deleted = res.rowcount if res and res.rowcount else 0
            return deleted
        else:
            from backend.app.database import is_postgres
            param = "%s" if is_postgres() else "?"
            sql = f"""
                DELETE FROM notifications
                WHERE id IN (
                    SELECT id FROM (
                        SELECT id, ROW_NUMBER() OVER (
                            PARTITION BY user_id ORDER BY created_at DESC, id DESC
                        ) AS rn
                        FROM notifications
                    ) ranked
                    WHERE ranked.rn > {param}
                )
            """
            cursor_or_session.execute(sql, (keep_limit,))
            return getattr(cursor_or_session, "rowcount", 0)
    except Exception as e:
        logger.warning(f"Failed to prune all notifications: {e}")
        return 0


def send_notification(
    cursor,
    user_id: str,
    notif_type: str,
    title: str,
    message: str,
    link_url: Optional[str] = None
) -> str:
    """Insert a single notification into notifications table using active cursor or ORM session and dispatch WebPush."""
    if not user_id:
        return ""
    notif_id = f"notif_{uuid.uuid4().hex[:12]}"
    now = get_iso_now()
    if isinstance(cursor, Session):
        notif = Notification(
            id=notif_id,
            user_id=user_id,
            type=notif_type,
            title=title,
            message=message,
            link_url=link_url,
            is_read=0,
            created_at=now,
        )
        cursor.add(notif)
    else:
        cursor.execute("""
            INSERT INTO notifications (id, user_id, type, title, message, link_url, is_read, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?)
        """, (notif_id, user_id, notif_type, title, message, link_url, now))

    # Keep only the latest 50 notifications for this user
    prune_user_notifications(cursor, user_id, keep_limit=50)

    dispatch_webpush_for_user(user_id, title, message, link_url)
    return notif_id


def notify_user_direct(
    user_id: str,
    notif_type: str,
    title: str,
    message: str,
    link_url: Optional[str] = None
) -> str:
    """Send a notification in an isolated DB connection."""
    with get_session() as session:
        notif_id = send_notification(session, user_id, notif_type, title, message, link_url)
        session.commit()
        return notif_id


def notify_branch_students(
    cursor,
    branch_id: Optional[str],
    notif_type: str,
    title: str,
    message: str,
    link_url: Optional[str] = None,
    exam_id: Optional[str] = None,
    batch_ids: Optional[List[str]] = None
) -> int:
    """
    Dispatch notifications strictly to students enrolled in a specific branch, exam, or batch(es).
    Supports both SQLAlchemy Session and DBAPI cursor.
    """
    scoped_batch_ids: List[str] = []
    if batch_ids:
        scoped_batch_ids = [str(b).strip() for b in batch_ids if str(b).strip()]

    if isinstance(cursor, Session):
        if not scoped_batch_ids and exam_id:
            ex = cursor.scalar(select(Exam).where(Exam.id == exam_id))
            if ex and ex.batch_scope in ("SPECIFIC", "BATCHES"):
                scoped_batch_ids = cursor.scalars(
                    select(ExamBatch.batch_id).where(ExamBatch.exam_id == exam_id)
                ).all()
                if not scoped_batch_ids and ex.batch_ids:
                    try:
                        parsed = json.loads(ex.batch_ids)
                        if isinstance(parsed, list):
                            scoped_batch_ids = [str(x).strip() for x in parsed if str(x).strip()]
                    except Exception:
                        scoped_batch_ids = [b.strip() for b in ex.batch_ids.split(",") if b.strip()]

        uids = []
        if scoped_batch_ids:
            uids = cursor.scalars(
                select(Student.user_id)
                .where(Student.batch_id.in_(scoped_batch_ids), Student.user_id.isnot(None))
                .distinct()
            ).all()
        elif branch_id or exam_id:
            student_conds = []
            if branch_id:
                student_conds.append(Batch.branch_id == branch_id)
            if exam_id:
                student_conds.append(Batch.exam_id == exam_id)

            stu_uids = cursor.scalars(
                select(Student.user_id)
                .join(Batch, Student.batch_id == Batch.id)
                .where(or_(*student_conds), Student.user_id.isnot(None))
                .distinct()
            ).all()

            user_stmt = select(User.id).where(User.role == "STUDENT", User.is_active == 1)
            if branch_id:
                user_stmt = user_stmt.where(User.branch_id == branch_id)
            branch_uids = cursor.scalars(user_stmt).all()

            uids = list(set(stu_uids) | set(branch_uids))
        else:
            uids = cursor.scalars(
                select(User.id).where(User.role == "STUDENT", User.is_active == 1)
            ).all()

        uids = [uid for uid in uids if uid]
        if not uids:
            return 0

        now = get_iso_now()
        for uid in uids:
            cursor.add(Notification(
                id=f"notif_{uuid.uuid4().hex[:12]}",
                user_id=uid,
                type=notif_type,
                title=title,
                message=message,
                link_url=link_url,
                is_read=0,
                created_at=now,
            ))

        prune_all_notifications(cursor, keep_limit=50)
        prune_all_notifications(cursor, keep_limit=50)
        dispatch_webpush_for_users(uids, title, message, link_url)
        return len(uids)

    # Legacy raw cursor fallback
    if not scoped_batch_ids and exam_id:
        try:
            cursor.execute("SELECT batch_scope, batch_ids FROM exams WHERE id = ?", (exam_id,))
            ex_row = cursor.fetchone()
            if ex_row and ex_row["batch_scope"] in ("SPECIFIC", "BATCHES"):
                cursor.execute("SELECT batch_id FROM exam_batches WHERE exam_id = ?", (exam_id,))
                scoped_batch_ids = [r["batch_id"] for r in cursor.fetchall() if r["batch_id"]]
                if not scoped_batch_ids and ex_row["batch_ids"]:
                    try:
                        parsed = json.loads(ex_row["batch_ids"])
                        if isinstance(parsed, list):
                            scoped_batch_ids = [str(x).strip() for x in parsed if str(x).strip()]
                    except Exception:
                        scoped_batch_ids = [b.strip() for b in ex_row["batch_ids"].split(",") if b.strip()]
        except Exception as e:
            logger.warning(f"Failed to check exam batch scope in notify_branch_students: {e}")

    if scoped_batch_ids:
        placeholders = ",".join(["?"] * len(scoped_batch_ids))
        cursor.execute(f"""
            SELECT DISTINCT s.user_id 
            FROM students s 
            WHERE s.batch_id IN ({placeholders}) AND s.user_id IS NOT NULL
        """, tuple(scoped_batch_ids))
    elif branch_id or exam_id:
        conditions = []
        params = []
        if branch_id:
            conditions.append("b.branch_id = ?")
            params.append(branch_id)
        if exam_id:
            conditions.append("b.exam_id = ?")
            params.append(exam_id)
        batch_cond = " OR ".join(conditions)

        user_cond = "branch_id = ?" if branch_id else "1=1"
        user_params = [branch_id] if branch_id else []

        cursor.execute(f"""
            SELECT DISTINCT user_id FROM (
                SELECT s.user_id 
                FROM students s 
                JOIN batches b ON s.batch_id = b.id 
                WHERE ({batch_cond}) AND s.user_id IS NOT NULL
                UNION
                SELECT id as user_id 
                FROM users 
                WHERE role = 'STUDENT' AND {user_cond} AND is_active = 1
            )
        """, tuple(params + user_params))
    else:
        cursor.execute("SELECT id as user_id FROM users WHERE role = 'STUDENT' AND is_active = 1")

    rows = cursor.fetchall()
    uids = list({r["user_id"] for r in rows if r and r["user_id"]})
    if not uids:
        return 0

    now = get_iso_now()
    records = [
        (f"notif_{uuid.uuid4().hex[:12]}", uid, notif_type, title, message, link_url, 0, now)
        for uid in uids
    ]
    cursor.executemany("""
        INSERT INTO notifications (id, user_id, type, title, message, link_url, is_read, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, records)

    prune_all_notifications(cursor, keep_limit=50)
    dispatch_webpush_for_users(uids, title, message, link_url)
    return len(uids)


def notify_branch_managers(
    cursor,
    branch_id: Optional[str],
    notif_type: str,
    title: str,
    message: str,
    link_url: Optional[str] = None,
    exclude_user_id: Optional[str] = None
) -> int:
    """Dispatch notifications to branch managers using bulk SQL insertion or ORM session."""
    now = get_iso_now()
    if isinstance(cursor, Session):
        stmt = select(User.id).where(User.role == "BRANCH_MANAGER", User.is_active == 1)
        if branch_id:
            stmt = stmt.where(User.branch_id == branch_id)
        uids = [uid for uid in cursor.scalars(stmt).all() if uid and uid != exclude_user_id]
        if not uids:
            return 0
        for uid in uids:
            cursor.add(Notification(
                id=f"notif_{uuid.uuid4().hex[:12]}",
                user_id=uid,
                type=notif_type,
                title=title,
                message=message,
                link_url=link_url,
                is_read=0,
                created_at=now,
            ))
        prune_all_notifications(cursor, keep_limit=50)
        prune_all_notifications(cursor, keep_limit=50)
        dispatch_webpush_for_users(uids, title, message, link_url)
        return len(uids)

    if branch_id:
        cursor.execute("""
            SELECT id FROM users 
            WHERE role = 'BRANCH_MANAGER' AND branch_id = ? AND is_active = 1
        """, (branch_id,))
    else:
        cursor.execute("""
            SELECT id FROM users 
            WHERE role = 'BRANCH_MANAGER' AND is_active = 1
        """)

    rows = cursor.fetchall()
    uids = [r["id"] for r in rows if r["id"] and r["id"] != exclude_user_id]
    if not uids:
        return 0

    records = [
        (f"notif_{uuid.uuid4().hex[:12]}", uid, notif_type, title, message, link_url, 0, now)
        for uid in uids
    ]
    cursor.executemany("""
        INSERT INTO notifications (id, user_id, type, title, message, link_url, is_read, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, records)

    dispatch_webpush_for_users(uids, title, message, link_url)
    return len(uids)


def notify_root_admins(
    cursor,
    notif_type: str,
    title: str,
    message: str,
    link_url: Optional[str] = None,
    exclude_user_id: Optional[str] = None
) -> int:
    """Dispatch notifications to all active Root Admins."""
    now = get_iso_now()
    if isinstance(cursor, Session):
        stmt = select(User.id).where(User.role == "ROOT_ADMIN", User.is_active == 1)
        uids = [uid for uid in cursor.scalars(stmt).all() if uid and uid != exclude_user_id]
        if not uids:
            return 0
        for uid in uids:
            cursor.add(Notification(
                id=f"notif_{uuid.uuid4().hex[:12]}",
                user_id=uid,
                type=notif_type,
                title=title,
                message=message,
                link_url=link_url,
                is_read=0,
                created_at=now,
            ))
        prune_all_notifications(cursor, keep_limit=50)
        dispatch_webpush_for_users(uids, title, message, link_url)
        return len(uids)

    cursor.execute("""
        SELECT id FROM users 
        WHERE role = 'ROOT_ADMIN' AND is_active = 1
    """)
    rows = cursor.fetchall()
    uids = [r["id"] for r in rows if r["id"] and r["id"] != exclude_user_id]
    if not uids:
        return 0

    records = [
        (f"notif_{uuid.uuid4().hex[:12]}", uid, notif_type, title, message, link_url, 0, now)
        for uid in uids
    ]
    cursor.executemany("""
        INSERT INTO notifications (id, user_id, type, title, message, link_url, is_read, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, records)

    dispatch_webpush_for_users(uids, title, message, link_url)
    return len(uids)


def get_branch_name(cursor, branch_id: Optional[str]) -> str:
    """Fetch human readable branch name or 'Main Campus' default."""
    if not branch_id:
        return "All Branches"
    if isinstance(cursor, Session):
        br = cursor.scalar(select(Branch).where(Branch.id == branch_id))
        return br.name if br and br.name else "Branch"

    cursor.execute("SELECT name FROM branches WHERE id = ?", (branch_id,))
    row = cursor.fetchone()
    return row["name"] if row and row["name"] else "Branch"


def background_dispatch_exam_created(
    exam_id: str,
    title: str,
    subject: str,
    branch_id: Optional[str],
    batch_scope: str,
    batch_ids: Optional[List[str]],
    creator_id: str,
    creator_role: str
):
    """
    FastAPI BackgroundTask: Asynchronously notifies students, branch managers,
    and root admins after the exam creation HTTP response has already returned.
    """
    try:
        with get_session() as session:
            scope_msg = "your batch" if batch_scope == "SPECIFIC" else "your branch"
            notify_branch_students(
                cursor=session,
                branch_id=branch_id,
                notif_type="EXAM_CREATED",
                title="New Exam Scheduled",
                message=f"A new examination '{title}' ({subject}) has been scheduled for {scope_msg}.",
                link_url="/student/portal",
                exam_id=exam_id,
                batch_ids=batch_ids if batch_scope == "SPECIFIC" else None
            )

            if creator_role == "BRANCH_MANAGER" and branch_id:
                branch_name = get_branch_name(session, branch_id)
                notify_root_admins(
                    cursor=session,
                    notif_type="EXAM_CREATED",
                    title="Branch Exam Created",
                    message=f"Branch '{branch_name}' created exam '{title}' ({subject}). Awaiting answer key upload.",
                    link_url=f"/exams/{exam_id}",
                    exclude_user_id=creator_id
                )
            elif creator_role == "ROOT_ADMIN" and branch_id:
                notify_branch_managers(
                    cursor=session,
                    branch_id=branch_id,
                    notif_type="EXAM_CREATED",
                    title="New Exam Scheduled",
                    message=f"Exam '{title}' ({subject}) was created for your branch by Root Admin.",
                    link_url=f"/exams/{exam_id}"
                )
    except Exception as e:
        logger.error(f"Failed in background_dispatch_exam_created: {e}", exc_info=True)


def background_dispatch_window_event(
    exam_id: str,
    exam_title: str,
    branch_id: Optional[str],
    duration: int,
    opened_by_role: str,
    opened_by_id: str,
    action: str = "OPEN",
    reason: Optional[str] = None
):
    """FastAPI BackgroundTask: Dispatches submission window open/reopen/close alerts asynchronously."""
    try:
        with get_session() as session:
            clean_reason = (reason or "").strip()
            reason_part = f" Reason: {clean_reason}." if clean_reason else ""

            if action == "REOPEN":
                notif_type = "WINDOW_REOPENED"
                title = "Submission Window Reopened"
                student_msg = f"The submission window for '{exam_title}' has been reopened for {duration} min.{reason_part}"
                manager_title = "Submission Window Reopened"
                manager_msg = f"Submission window for '{exam_title}' was reopened by Root Admin ({duration} min).{reason_part}"
                manager_link = f"/exams/{exam_id}"
            elif action == "CLOSE":
                notif_type = "WINDOW_CLOSED"
                title = "Submission Window Closed"
                student_msg = f"The submission window for '{exam_title}' has been closed.{reason_part}"
                manager_title = "Submission Window Closed Early"
                manager_msg = f"Submission window for '{exam_title}' was closed early by Root Admin.{reason_part}"
                manager_link = f"/exams/{exam_id}"
            else:  # OPEN
                notif_type = "WINDOW_OPENED"
                title = "Submission Window Open"
                student_msg = f"The {duration}-minute submission window for '{exam_title}' is now open! Upload your answer sheet before the deadline."
                manager_title = "Submission Window Activated"
                manager_msg = f"Submission window for '{exam_title}' was opened by Root Administration ({duration} min)."
                manager_link = f"/exams/{exam_id}"

            notify_branch_students(
                cursor=session,
                branch_id=branch_id,
                notif_type=notif_type,
                title=title,
                message=student_msg,
                link_url="/student/portal",
                exam_id=exam_id
            )

            if opened_by_role == "ROOT_ADMIN" and branch_id:
                notify_branch_managers(
                    cursor=session,
                    branch_id=branch_id,
                    notif_type=notif_type,
                    title=manager_title,
                    message=manager_msg,
                    link_url=manager_link,
                    exclude_user_id=opened_by_id
                )
    except Exception as e:
        logger.error(f"Failed in background_dispatch_window_event ({action}): {e}", exc_info=True)


def background_dispatch_window_opened(
    exam_id: str,
    exam_title: str,
    branch_id: Optional[str],
    duration: int,
    opened_by_role: str,
    opened_by_id: str
):
    """Backwards-compatible wrapper for opening a window."""
    background_dispatch_window_event(
        exam_id=exam_id,
        exam_title=exam_title,
        branch_id=branch_id,
        duration=duration,
        opened_by_role=opened_by_role,
        opened_by_id=opened_by_id,
        action="OPEN"
    )


def background_dispatch_results_published(
    exam_id: str,
    exam_title: str,
    branch_id: Optional[str],
    published_subs_count: int,
    publisher_role: str,
    publisher_id: str
):
    """FastAPI BackgroundTask: Dispatches RESULT_PUBLISHED notifications using ORM."""
    try:
        with get_session() as session:
            stmt = (
                select(Submission.id.label("submission_id"), Student.user_id)
                .join(
                    Student,
                    or_(
                        Submission.student_id == Student.id,
                        func.upper(Submission.roll_number) == func.upper(Student.roll_number)
                    )
                )
                .where(
                    Submission.exam_id == exam_id,
                    Student.user_id.isnot(None),
                    Submission.publication_status == "PUBLISHED"
                )
                .distinct()
            )
            students_to_notify = session.execute(stmt).all()

            if students_to_notify:
                now = get_iso_now()
                notif_msg = f"Results for '{exam_title}' have been officially published. Tap to view your score breakdown."
                for sub_id, u_id in students_to_notify:
                    if not u_id:
                        continue
                    session.add(Notification(
                        id=f"notif_{uuid.uuid4().hex[:12]}",
                        user_id=u_id,
                        type="RESULT_PUBLISHED",
                        title="Results Published",
                        message=notif_msg,
                        link_url=f"/student/submissions/{sub_id}",
                        is_read=0,
                        created_at=now,
                    ))
                    dispatch_webpush_for_user(
                        user_id=u_id,
                        title="Results Published",
                        message=notif_msg,
                        link_url=f"/student/submissions/{sub_id}",
                    )

            # Notify Root Admin and Branch Manager
            branch_name = get_branch_name(session, branch_id)
            if branch_id and publisher_role == "ROOT_ADMIN":
                notify_branch_managers(
                    cursor=session,
                    branch_id=branch_id,
                    notif_type="RESULT_PUBLISHED",
                    title="Results Published",
                    message=f"Results for '{exam_title}' ({branch_name}) were officially published by Root Admin ({published_subs_count} papers).",
                    link_url=f"/exams/{exam_id}"
                )
            elif branch_id and publisher_role == "BRANCH_MANAGER":
                notify_root_admins(
                    cursor=session,
                    notif_type="RESULT_PUBLISHED",
                    title="Branch Results Published",
                    message=f"Branch '{branch_name}' published results for '{exam_title}' ({published_subs_count} papers).",
                    link_url=f"/exams/{exam_id}",
                    exclude_user_id=publisher_id
                )
    except Exception as e:
        logger.error(f"Failed in background_dispatch_results_published: {e}", exc_info=True)
