from typing import Dict, Any, List
from fastapi import APIRouter, HTTPException, Depends
from backend.app.database import get_db
from backend.app.services.auth import get_current_user

router = APIRouter(prefix="/api/v1/notifications", tags=["In-App Notifications"])

@router.get("")
def list_my_notifications(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Fetch all in-app notifications for the authenticated user."""
    user_id = current_user["sub"]
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
            (user_id,)
        )
        return [dict(r) for r in cursor.fetchall()]

@router.post("/{notification_id}/read")
def mark_notification_read(notification_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    user_id = current_user["sub"]
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
            (notification_id, user_id)
        )
        return {"status": "success", "id": notification_id}

@router.post("/read-all")
def mark_all_read(current_user: Dict[str, Any] = Depends(get_current_user)):
    user_id = current_user["sub"]
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE notifications SET is_read = 1 WHERE user_id = ?",
            (user_id,)
        )
        return {"status": "success"}
