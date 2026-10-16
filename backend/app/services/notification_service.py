import uuid
from typing import Optional, List, Dict, Any
from backend.app.database import get_db, get_iso_now

def send_notification(
    cursor,
    user_id: str,
    notif_type: str,
    title: str,
    message: str,
    link_url: Optional[str] = None
) -> str:
    """Insert a single notification into notifications table using active cursor."""
    if not user_id:
        return ""
    notif_id = f"notif_{uuid.uuid4().hex[:12]}"
    now = get_iso_now()
    cursor.execute("""
        INSERT INTO notifications (id, user_id, type, title, message, link_url, is_read, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    """, (notif_id, user_id, notif_type, title, message, link_url, now))
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
    exam_id: Optional[str] = None
) -> int:
    """
    Dispatch notifications strictly to students enrolled in a specific branch or exam.
    If branch_id is None and exam_id is None, dispatches to all active students (global scope).
    """
    if branch_id or exam_id:
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
    count = 0
    for r in rows:
        uid = r["user_id"]
        if uid:
            send_notification(cursor, uid, notif_type, title, message, link_url)
            count += 1
    return count

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
    Dispatch notifications to branch managers of a branch.
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
    count = 0
    for r in rows:
        uid = r["id"]
        if uid and uid != exclude_user_id:
            send_notification(cursor, uid, notif_type, title, message, link_url)
            count += 1
    return count

def notify_root_admins(
    cursor,
    notif_type: str,
    title: str,
    message: str,
    link_url: Optional[str] = None,
    exclude_user_id: Optional[str] = None
) -> int:
    """
    Dispatch notifications to all active Root Admins.
    """
    cursor.execute("""
        SELECT id FROM users 
        WHERE role = 'ROOT_ADMIN' AND is_active = 1
    """)
    rows = cursor.fetchall()
    count = 0
    for r in rows:
        uid = r["id"]
        if uid and uid != exclude_user_id:
            send_notification(cursor, uid, notif_type, title, message, link_url)
            count += 1
    return count

def get_branch_name(cursor, branch_id: Optional[str]) -> str:
    """Fetch human readable branch name or 'Main Campus' default."""
    if not branch_id:
        return "All Branches"
    cursor.execute("SELECT name FROM branches WHERE id = ?", (branch_id,))
    row = cursor.fetchone()
    return row["name"] if row and row["name"] else "Branch"
