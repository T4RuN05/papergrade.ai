import uuid
import json
import logging
import threading
from typing import Optional, List, Dict, Any
from backend.app.database import get_db, get_iso_now
from backend.app.config import settings

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
                with get_db() as conn:
                    cursor = conn.cursor()
                    cursor.execute("DELETE FROM push_subscriptions WHERE id = ?", (sub_id,))
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
            with get_db() as conn:
                cursor = conn.cursor()
                placeholders = ",".join(["?"] * len(clean_uids))
                cursor.execute(
                    f"SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN ({placeholders})",
                    tuple(clean_uids),
                )
                subs = [dict(r) for r in cursor.fetchall()]

            if not subs:
                return

            payload = json.dumps({
                "title": title,
                "body": message,
                "url": link_url or "/student/portal",
            })

            # Process subscriptions sequentially in a single lightweight thread (reusing TLS, ~0 extra RAM)
            for s in subs:
                _send_single_webpush(
                    sub_id=s["id"],
                    endpoint=s["endpoint"],
                    p256dh=s["p256dh"],
                    auth=s["auth"],
                    payload_str=payload,
                )
        except Exception as err:
            logger.debug("Failed in dispatch_webpush_for_users: %s", err)

    threading.Thread(target=_worker, daemon=True).start()

def dispatch_webpush_for_user(user_id: str, title: str, message: str, link_url: Optional[str] = None):
    """Trigger webpush for a single user."""
    if user_id:
        dispatch_webpush_for_users([user_id], title, message, link_url)

def send_notification(
    cursor,
    user_id: str,
    notif_type: str,
    title: str,
    message: str,
    link_url: Optional[str] = None
) -> str:
    """Insert a single notification into notifications table using active cursor and dispatch WebPush."""
    if not user_id:
        return ""
    notif_id = f"notif_{uuid.uuid4().hex[:12]}"
    now = get_iso_now()
    cursor.execute("""
        INSERT INTO notifications (id, user_id, type, title, message, link_url, is_read, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    """, (notif_id, user_id, notif_type, title, message, link_url, now))
    
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
    with get_db() as conn:
        cursor = conn.cursor()
        notif_id = send_notification(cursor, user_id, notif_type, title, message, link_url)
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
    Uses high-speed bulk SQL INSERT (1 network roundtrip) and bounded background push delivery.
    """
    scoped_batch_ids: List[str] = []
    if batch_ids:
        scoped_batch_ids = [str(b).strip() for b in batch_ids if str(b).strip()]
    elif exam_id:
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
        cursor.execute("""
            SELECT id as user_id FROM users WHERE role = 'STUDENT' AND is_active = 1
        """)
    
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
    """
    Dispatch notifications to branch managers using bulk SQL insertion.
    """
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

    now = get_iso_now()
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
    """
    Dispatch notifications to all active Root Admins using bulk SQL insertion.
    """
    cursor.execute("""
        SELECT id FROM users 
        WHERE role = 'ROOT_ADMIN' AND is_active = 1
    """)
    rows = cursor.fetchall()
    uids = [r["id"] for r in rows if r["id"] and r["id"] != exclude_user_id]
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

    dispatch_webpush_for_users(uids, title, message, link_url)
    return len(uids)

def get_branch_name(cursor, branch_id: Optional[str]) -> str:
    """Fetch human readable branch name or 'Main Campus' default."""
    if not branch_id:
        return "All Branches"
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
    and root admins after the exam creation HTTP response has already returned to the client.
    Uses zero extra RAM, avoids blocking UI, and batches all operations safely.
    """
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            scope_msg = "your batch" if batch_scope == "SPECIFIC" else "your branch"
            notify_branch_students(
                cursor=cursor,
                branch_id=branch_id,
                notif_type="EXAM_CREATED",
                title="New Exam Scheduled",
                message=f"A new examination '{title}' ({subject}) has been scheduled for {scope_msg}.",
                link_url="/student/portal",
                exam_id=exam_id,
                batch_ids=batch_ids if batch_scope == "SPECIFIC" else None
            )

            if creator_role == "BRANCH_MANAGER" and branch_id:
                branch_name = get_branch_name(cursor, branch_id)
                notify_root_admins(
                    cursor=cursor,
                    notif_type="EXAM_CREATED",
                    title="Branch Exam Created",
                    message=f"Branch '{branch_name}' created exam '{title}' ({subject}). Awaiting answer key upload.",
                    link_url="/exams",
                    exclude_user_id=creator_id
                )
            elif creator_role == "ROOT_ADMIN" and branch_id:
                notify_branch_managers(
                    cursor=cursor,
                    branch_id=branch_id,
                    notif_type="EXAM_CREATED",
                    title="New Exam Scheduled",
                    message=f"Exam '{title}' ({subject}) was created for your branch by Root Admin.",
                    link_url="/exams"
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
    """
    FastAPI BackgroundTask: Dispatches submission window open/reopen/close alerts asynchronously.
    """
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            clean_reason = (reason or "").strip()
            reason_part = f" Reason: {clean_reason}." if clean_reason else ""

            if action == "REOPEN":
                notif_type = "WINDOW_REOPENED"
                title = "Submission Window Reopened"
                student_msg = f"The submission window for '{exam_title}' has been reopened for {duration} min.{reason_part}"
                manager_title = "Submission Window Reopened"
                manager_msg = f"Submission window for '{exam_title}' was reopened by Root Admin ({duration} min).{reason_part}"
                manager_link = "/overview"
            elif action == "CLOSE":
                notif_type = "WINDOW_CLOSED"
                title = "Submission Window Closed"
                student_msg = f"The submission window for '{exam_title}' has been closed.{reason_part}"
                manager_title = "Submission Window Closed Early"
                manager_msg = f"Submission window for '{exam_title}' was closed early by Root Admin.{reason_part}"
                manager_link = "/overview"
            else:  # OPEN
                notif_type = "WINDOW_OPENED"
                title = "Submission Window Open"
                student_msg = f"The {duration}-minute submission window for '{exam_title}' is now open! Upload your answer sheet before the deadline."
                manager_title = "Submission Window Activated"
                manager_msg = f"Submission window for '{exam_title}' was opened by Root Administration ({duration} min)."
                manager_link = f"/exams/{exam_id}"

            notify_branch_students(
                cursor=cursor,
                branch_id=branch_id,
                notif_type=notif_type,
                title=title,
                message=student_msg,
                link_url="/student/portal",
                exam_id=exam_id
            )

            if opened_by_role == "ROOT_ADMIN" and branch_id:
                notify_branch_managers(
                    cursor=cursor,
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
    """
    FastAPI BackgroundTask: Dispatches RESULT_PUBLISHED notifications using bulk SQL insert and WebPush.
    Runs asynchronously after the results publication HTTP response has already returned.
    """
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT DISTINCT s.id as submission_id, st.user_id 
                FROM submissions s 
                JOIN students st ON s.student_id = st.id OR UPPER(s.roll_number) = UPPER(st.roll_number)
                WHERE s.exam_id = ? AND st.user_id IS NOT NULL AND s.publication_status = 'PUBLISHED'
            """, (exam_id,))
            students_to_notify = cursor.fetchall()

            if students_to_notify:
                now = get_iso_now()
                records = [
                    (
                        f"notif_{uuid.uuid4().hex[:12]}",
                        st["user_id"],
                        "RESULT_PUBLISHED",
                        "Results Published",
                        f"Results for '{exam_title}' have been officially published. Tap to view your score breakdown.",
                        f"/student/submissions/{st['submission_id']}",
                        0,
                        now
                    )
                    for st in students_to_notify
                ]
                cursor.executemany("""
                    INSERT INTO notifications (id, user_id, type, title, message, link_url, is_read, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, records)

                uids = [st["user_id"] for st in students_to_notify if st["user_id"]]
                dispatch_webpush_for_users(
                    uids,
                    "Results Published",
                    f"Results for '{exam_title}' have been officially published. Tap to view your score breakdown.",
                    "/student/portal"
                )

            # Scoped notification to Branch Manager
            notify_branch_managers(
                cursor=cursor,
                branch_id=branch_id,
                notif_type="RESULT_PUBLISHED",
                title="Results Published to Students",
                message=f"Results for '{exam_title}' ({published_subs_count} papers) have been officially published. 7-day revaluation window is active.",
                link_url="/exams",
                exclude_user_id=publisher_id
            )

            if publisher_role == "BRANCH_MANAGER" and branch_id:
                b_name = get_branch_name(cursor, branch_id)
                notify_root_admins(
                    cursor=cursor,
                    notif_type="RESULT_PUBLISHED",
                    title="Branch Results Published",
                    message=f"{b_name} published results for '{exam_title}' ({published_subs_count} papers).",
                    link_url="/exams",
                    exclude_user_id=publisher_id
                )
    except Exception as e:
        logger.error(f"Failed in background_dispatch_results_published: {e}", exc_info=True)


