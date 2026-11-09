import uuid
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends, Header
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import select, delete, update

from backend.app.config import settings
from backend.app.db.session import get_db
from backend.app.db.base import get_iso_now
from backend.app.db.models import Notification, PushSubscription
from backend.app.services.auth import get_current_user
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
    return JSONResponse(
        content={"public_key": settings.VAPID_PUBLIC_KEY},
        headers={
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        }
    )


@router.post("/push-subscription")
def save_push_subscription(
    payload: PushSubscriptionPayload,
    current_user: Dict[str, Any] = Depends(get_current_user),
    user_agent: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Store or refresh client device push subscription token for background WebPush delivery."""
    user_id = current_user["sub"]
    ua = ""
    if isinstance(payload.user_agent, str) and payload.user_agent:
        ua = payload.user_agent
    elif isinstance(user_agent, str) and user_agent:
        ua = user_agent
    now = get_iso_now()

    sub = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint))
    if sub:
        sub.user_id = user_id
        sub.p256dh = payload.keys.p256dh
        sub.auth = payload.keys.auth
        sub.user_agent = ua
        sub.created_at = now
    else:
        sub_id = f"sub_{uuid.uuid4().hex[:12]}"
        new_sub = PushSubscription(
            id=sub_id,
            user_id=user_id,
            endpoint=payload.endpoint,
            p256dh=payload.keys.p256dh,
            auth=payload.keys.auth,
            user_agent=ua,
            created_at=now,
        )
        db.add(new_sub)

    db.commit()
    return {"status": "subscribed"}


@router.post("/push-unsubscribe")
def remove_push_subscription(
    payload: PushUnsubscribePayload,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Remove a device push subscription upon logout or permission revoke."""
    db.execute(delete(PushSubscription).where(PushSubscription.endpoint == payload.endpoint))
    db.commit()
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
def list_my_notifications(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Fetch all in-app notifications for the authenticated user."""
    user_id = current_user["sub"]
    notifs = db.scalars(
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .limit(50)
    ).all()

    return [
        {
            "id": n.id,
            "user_id": n.user_id,
            "type": n.type,
            "title": n.title,
            "message": n.message,
            "link_url": n.link_url,
            "is_read": n.is_read,
            "created_at": n.created_at,
        }
        for n in notifs
    ]


@router.post("/{notification_id}/read")
def mark_notification_read(
    notification_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_id = current_user["sub"]
    db.execute(
        update(Notification)
        .where(Notification.id == notification_id, Notification.user_id == user_id)
        .values(is_read=1)
    )
    db.commit()
    return {"status": "success", "id": notification_id}


@router.post("/read-all")
def mark_all_read(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_id = current_user["sub"]
    db.execute(
        update(Notification)
        .where(Notification.user_id == user_id)
        .values(is_read=1)
    )
    db.commit()
    return {"status": "success"}
