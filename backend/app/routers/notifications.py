import uuid
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends, Header
from backend.app.database import get_db, get_iso_now
from backend.app.services.auth import get_current_user
from backend.app.config import settings
from backend.app.services.notification_service import dispatch_webpush_for_user

router = APIRouter(prefix="/api/v1/notifications", tags=["In-App Notifications"])

class PushSubscriptionKeys(BaseModel):
    p256dh: str
    auth: str

class PushSubscriptionPayload(BaseModel):
    endpoint: str
    keys: PushSubscriptionKeys
    user_agent: Optional[str] = None

class PushUnsubscribePayload(BaseModel):
    endpoint: str

@router.get("/vapid-public-key")
def get_vapid_public_key():
    """Expose the server's VAPID public key so client PWAs can subscribe to browser push."""
    return {"public_key": settings.VAPID_PUBLIC_KEY}

@router.post("/push-subscription")
def save_push_subscription(
    payload: PushSubscriptionPayload,
    current_user: Dict[str, Any] = Depends(get_current_user),
    user_agent: Optional[str] = Header(None)
):
    """Store or refresh client device push subscription token for background WebPush delivery."""
    user_id = current_user["sub"]
    ua = ""
    if isinstance(payload.user_agent, str) and payload.user_agent:
        ua = payload.user_agent
    elif isinstance(user_agent, str) and user_agent:
        ua = user_agent
    now = get_iso_now()

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM push_subscriptions WHERE endpoint = ?", (payload.endpoint,))
        existing = cursor.fetchone()

        if existing:
            cursor.execute("""
                UPDATE push_subscriptions
                SET user_id = ?, p256dh = ?, auth = ?, user_agent = ?, created_at = ?
                WHERE endpoint = ?
            """, (user_id, payload.keys.p256dh, payload.keys.auth, ua, now, payload.endpoint))
        else:
            sub_id = f"sub_{uuid.uuid4().hex[:12]}"
            cursor.execute("""
                INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (sub_id, user_id, payload.endpoint, payload.keys.p256dh, payload.keys.auth, ua, now))
    return {"status": "subscribed"}

@router.post("/push-unsubscribe")
def remove_push_subscription(
    payload: PushUnsubscribePayload,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Remove a device push subscription upon logout or permission revoke."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (payload.endpoint,))
    return {"status": "unsubscribed"}

@router.post("/test-closed-app-push")
def test_closed_app_push(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Dispatch an actual cloud-gateway WebPush to test delivery to the student's phone."""
    user_id = current_user["sub"]
    dispatch_webpush_for_user(
        user_id,
        "PaperGrade AI Cloud Push",
        "Success! Web Push delivered via Google/Apple cloud servers directly to your device.",
        "/student/portal"
    )
    return {"status": "dispatched"}

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
