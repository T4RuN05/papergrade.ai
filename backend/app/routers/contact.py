import time
import logging
import threading
from typing import Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from backend.app.services.email_service import send_pilot_inquiry_emails

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/contact", tags=["Public Contact & Pilot"])

_RATE_LOCK = threading.Lock()
_IP_TIMESTAMPS: dict[str, list[float]] = {}
_RATE_WINDOW_SECONDS = 3600.0
_MAX_SUBMISSIONS_PER_WINDOW = 5


class PilotInquiryRequest(BaseModel):
    institute_name: str = Field(..., min_length=2, max_length=120)
    city: Optional[str] = Field("", max_length=80)
    contact_info: str = Field(..., min_length=4, max_length=140)
    batch_size: str = Field("50–150 students", max_length=60)
    notes: Optional[str] = Field("", max_length=600)


def _check_rate_limit(client_ip: str) -> None:
    now = time.time()
    with _RATE_LOCK:
        stamps = [ts for ts in _IP_TIMESTAMPS.get(client_ip, []) if now - ts < _RATE_WINDOW_SECONDS]
        if len(stamps) >= _MAX_SUBMISSIONS_PER_WINDOW:
            raise HTTPException(
                status_code=429,
                detail="Too many pilot requests submitted recently. Please try again in an hour or email support@papergradeai.in directly.",
            )
        stamps.append(now)
        _IP_TIMESTAMPS[client_ip] = stamps


@router.post("/pilot")
def submit_pilot_inquiry(
    req: PilotInquiryRequest,
    request: Request,
    background_tasks: BackgroundTasks,
):
    """
    Public coaching institute pilot request endpoint.
    Dispatches Notion-styled pilot brief to support@papergradeai.in (and confirmation receipt if email provided).
    """
    client_ip = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )
    _check_rate_limit(client_ip)

    inst = req.institute_name.strip()
    contact = req.contact_info.strip()
    if len(inst) < 2 or len(contact) < 4:
        raise HTTPException(status_code=400, detail="Institute name and contact details are required.")

    background_tasks.add_task(
        send_pilot_inquiry_emails,
        institute_name=inst,
        city=(req.city or "").strip(),
        contact_info=contact,
        batch_size=(req.batch_size or "50–150 students").strip(),
        notes=(req.notes or "").strip(),
    )

    return {
        "status": "success",
        "message": "Pilot walkthrough request received! Check your inbox for confirmation if you provided an email address.",
    }
