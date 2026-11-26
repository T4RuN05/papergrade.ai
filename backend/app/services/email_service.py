"""
PaperGrade AI — Transactional Email Service (Brevo REST API Gateway)
Handles high-speed automated email delivery for:
1. 6-digit cryptographic OTPs (Password resets, account claim verification)
2. Immediate administrative alerts for user-reported technical/evaluation issues
3. Account linking & security confirmations

Invariants:
- Zero blocking: Uses asynchronous httpx client or threaded dispatches.
- Strict quota ceiling: Enforces safety checks to remain comfortably within Brevo's 300/day free limit.
- Result publication emails are strictly forbidden (results remain WebPush + In-App only).
- Test isolation: In test/pytest runtime, calls are mocked without network side effects.
"""

import os
import html
import time
import logging
import threading
from typing import Optional, List, Dict, Any
import httpx

from backend.app.config import settings

logger = logging.getLogger(__name__)

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"
_DAILY_SEND_COUNTER = 0
_LAST_RESET_DATE = time.strftime("%Y-%m-%d")
_MAX_DAILY_SAFETY_CEILING = 280  # Safety cushion below 300 limit
_QUOTA_LOCK = threading.Lock()


def _is_test_runtime() -> bool:
    """Return True if executing under pytest or test environment."""
    return bool(os.environ.get("PYTEST_CURRENT_TEST")) or getattr(settings, "ENVIRONMENT", "").lower() == "test"


def _check_and_increment_quota() -> bool:
    """Thread-safe daily safety ceiling enforcement."""
    global _DAILY_SEND_COUNTER, _LAST_RESET_DATE
    with _QUOTA_LOCK:
        today = time.strftime("%Y-%m-%d")
        if today != _LAST_RESET_DATE:
            _DAILY_SEND_COUNTER = 0
            _LAST_RESET_DATE = today

        if _DAILY_SEND_COUNTER >= _MAX_DAILY_SAFETY_CEILING:
            logger.error(
                "Brevo daily email safety ceiling (%d) reached for %s. Dropping email to preserve quota.",
                _MAX_DAILY_SAFETY_CEILING,
                today,
            )
            return False

        _DAILY_SEND_COUNTER += 1
        return True


async def send_transactional_email(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None,
    to_name: Optional[str] = None,
    sender_name: Optional[str] = None,
    sender_email: Optional[str] = None,
) -> bool:
    """
    Send a single transactional email via Brevo REST API v3.
    """
    clean_to = to_email.strip()
    if not clean_to or "@" not in clean_to:
        logger.warning("Invalid recipient email: %s", to_email)
        return False

    if _is_test_runtime():
        logger.info("[MOCK EMAIL TEST] Would send to: %s | Subject: %s", clean_to, subject)
        return True

    api_key = getattr(settings, "BREVO_API_KEY", "").strip()
    if not api_key:
        logger.warning("BREVO_API_KEY not configured. Email to %s skipped.", clean_to)
        return False

    if not _check_and_increment_quota():
        return False

    from_addr = sender_email or getattr(settings, "EMAIL_FROM_ADDRESS", "noreply@papergradeai.in")
    from_name = sender_name or getattr(settings, "EMAIL_FROM_NAME", "Papergrade AI")

    payload: Dict[str, Any] = {
        "sender": {"name": from_name, "email": from_addr},
        "to": [{"email": clean_to, "name": to_name or clean_to}],
        "subject": subject,
        "htmlContent": html_content,
    }
    if text_content:
        payload["textContent"] = text_content

    headers = {
        "api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(BREVO_API_URL, json=payload, headers=headers)
            if resp.status_code in (200, 201, 202):
                logger.info("Successfully dispatched email to %s via Brevo (status: %d)", clean_to, resp.status_code)
                return True
            else:
                logger.error("Brevo API returned error %d for %s: %s", resp.status_code, clean_to, resp.text)
                return False
    except Exception as exc:
        logger.error("Exception during Brevo email dispatch to %s: %s", clean_to, exc)
        return False


def send_transactional_email_sync(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None,
    to_name: Optional[str] = None,
    sender_name: Optional[str] = None,
    sender_email: Optional[str] = None,
) -> bool:
    """Synchronous wrapper for background thread contexts."""
    clean_to = to_email.strip()
    if not clean_to or "@" not in clean_to:
        return False

    if _is_test_runtime():
        logger.info("[MOCK EMAIL SYNC] To: %s | Subject: %s", clean_to, subject)
        return True

    api_key = getattr(settings, "BREVO_API_KEY", "").strip()
    if not api_key:
        logger.warning("BREVO_API_KEY not configured. Email to %s skipped.", clean_to)
        return False

    if not _check_and_increment_quota():
        return False

    from_addr = sender_email or getattr(settings, "EMAIL_FROM_ADDRESS", "noreply@papergradeai.in")
    from_name = sender_name or getattr(settings, "EMAIL_FROM_NAME", "Papergrade AI")

    payload: Dict[str, Any] = {
        "sender": {"name": from_name, "email": from_addr},
        "to": [{"email": clean_to, "name": to_name or clean_to}],
        "subject": subject,
        "htmlContent": html_content,
    }
    if text_content:
        payload["textContent"] = text_content

    headers = {
        "api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(BREVO_API_URL, json=payload, headers=headers)
            if resp.status_code in (200, 201, 202):
                logger.info("Sync dispatched email to %s via Brevo (%d)", clean_to, resp.status_code)
                return True
            else:
                logger.error("Brevo sync error %d: %s", resp.status_code, resp.text)
                return False
    except Exception as exc:
        logger.error("Exception during Brevo sync email dispatch: %s", exc)
        return False


# ============================================================================
# High-Level Email Dispatches: OTP & Admin Reports
# ============================================================================

def format_otp_email_html(recipient_name: str, otp_code: str, expires_in_minutes: int = 10) -> str:
    """Render Notion-styled, high-deliverability HTML email for 6-digit OTP."""
    safe_name = html.escape(recipient_name or "User")
    safe_otp = html.escape(otp_code or "")
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your PaperGrade AI Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F7F7F5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #37352F;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F7F7F5; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="520" border="0" cellspacing="0" cellpadding="0" style="max-width: 520px; background-color: #FFFFFF; border: 1px solid #E9E9E7; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);">
          <!-- Header -->
          <tr>
            <td style="padding: 28px 32px 20px 32px; border-bottom: 1px solid #F1F1EF;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="font-size: 18px; font-weight: 700; color: #2383E2; letter-spacing: -0.3px;">PaperGrade AI</span>
                  </td>
                  <td align="right">
                    <span style="font-size: 11px; font-weight: 600; background-color: #F0F7FF; color: #2383E2; padding: 4px 8px; border-radius: 6px; text-transform: uppercase;">Security Verification</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px 32px 24px 32px;">
              <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 12px 0; color: #191919; letter-spacing: -0.2px;">Verification Code</h1>
              <p style="font-size: 14px; line-height: 1.6; color: #5A5A58; margin: 0 0 24px 0;">
                Hello <strong>{safe_name}</strong>, a request was made to verify your account or reset your password on PaperGrade AI.
              </p>
              
              <!-- OTP Box -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
                <tr>
                  <td align="center" style="background-color: #FBFBFA; border: 1px dashed #D3D3D0; border-radius: 8px; padding: 20px;">
                    <div style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #191919; font-family: 'SF Mono', Monaco, Consolas, monospace;">
                      {safe_otp}
                    </div>
                    <div style="font-size: 12px; color: #8F8E8B; margin-top: 8px;">
                      Valid for {expires_in_minutes} minutes • Single use only
                    </div>
                  </td>
                </tr>
              </table>

              <p style="font-size: 13px; line-height: 1.5; color: #787774; margin: 0 0 12px 0;">
                If you did not initiate this request, you can safely disregard this email. Your account remains completely secure.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #FAFAFA; border-top: 1px solid #F1F1EF; font-size: 12px; color: #9B9A97; text-align: center;">
              PaperGrade AI • Automated Academic Assessment Engine<br>
              <a href="https://www.papergradeai.in" style="color: #2383E2; text-decoration: none;">www.papergradeai.in</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def format_admin_issue_html(
    report_id: str,
    reporter_name: str,
    reporter_role: str,
    reporter_email: str,
    reporter_roll: Optional[str],
    branch_name: Optional[str],
    category: str,
    subject: str,
    description: str,
    screenshot_urls: List[str],
) -> str:
    """Render structured issue notification for the administrator."""
    safe_id = html.escape(report_id or "")
    safe_name = html.escape(reporter_name or "User")
    safe_role = html.escape(reporter_role or "")
    safe_email = html.escape(reporter_email or "")
    safe_cat = html.escape(category or "")
    safe_subj = html.escape(subject or "")
    safe_desc = html.escape(description or "")

    roll_text = f" • Roll: {html.escape(reporter_roll)}" if reporter_roll else ""
    branch_text = f" • Branch: {html.escape(branch_name)}" if branch_name else ""
    deep_link = f"https://www.papergradeai.in/admin/reports?report_id={safe_id}"

    screenshots_html = ""
    if screenshot_urls:
        shots_items = "".join(
            f'<li style="margin-bottom: 6px;"><a href="{html.escape(url, quote=True)}" target="_blank" style="color: #2383E2; text-decoration: underline;">Screenshot #{i+1} (View in Storage)</a></li>'
            for i, url in enumerate(screenshot_urls)
        )
        screenshots_html = f"""
        <div style="margin-top: 16px; padding: 12px; background-color: #F7F7F5; border-radius: 6px;">
          <strong style="font-size: 12px; color: #37352F;">Attached Evidence ({len(screenshot_urls)}):</strong>
          <ul style="margin: 6px 0 0 0; padding-left: 20px; font-size: 13px;">
            {shots_items}
          </ul>
        </div>
        """

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>New Technical Report: {safe_subj}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F7F7F5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #37352F;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F7F7F5; padding: 36px 16px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="580" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #FFFFFF; border: 1px solid #E9E9E7; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.04);">
          <!-- Header -->
          <tr>
            <td style="padding: 24px 28px; background-color: #FAFAFA; border-bottom: 1px solid #ECECEB;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="font-size: 13px; font-weight: 700; color: #EB5757; text-transform: uppercase; letter-spacing: 0.5px;">⚠️ Issue Report</span>
                    <h2 style="margin: 4px 0 0 0; font-size: 18px; font-weight: 600; color: #191919;">{safe_subj}</h2>
                  </td>
                  <td align="right" valign="top">
                    <span style="font-size: 11px; background-color: #F0F0EF; color: #5A5A58; padding: 4px 8px; border-radius: 4px; font-family: monospace;">#{safe_id}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 24px 28px;">
              <!-- Metadata Table -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 20px; font-size: 13px; line-height: 1.6;">
                <tr>
                  <td width="30%" style="color: #787774; padding-bottom: 6px;">Reported By:</td>
                  <td style="font-weight: 600; color: #191919; padding-bottom: 6px;">{safe_name} ({safe_role}{roll_text}{branch_text})</td>
                </tr>
                <tr>
                  <td style="color: #787774; padding-bottom: 6px;">User Email:</td>
                  <td style="color: #191919; padding-bottom: 6px;"><a href="mailto:{safe_email}" style="color: #2383E2; text-decoration: none;">{safe_email}</a></td>
                </tr>
                <tr>
                  <td style="color: #787774; padding-bottom: 6px;">Category:</td>
                  <td style="color: #191919; padding-bottom: 6px;"><span style="background-color: #FFF3D6; color: #8F6B00; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">{safe_cat}</span></td>
                </tr>
              </table>

              <!-- Description -->
              <div style="font-size: 13px; font-weight: 600; color: #787774; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.4px;">Issue Description:</div>
              <div style="background-color: #FBFBFA; border: 1px solid #ECECEB; border-left: 3px solid #2383E2; border-radius: 4px; padding: 14px; font-size: 14px; line-height: 1.6; color: #191919; white-space: pre-wrap;">{safe_desc}</div>

              {screenshots_html}

              <!-- Action Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 28px;">
                <tr>
                  <td align="center">
                    <a href="{deep_link}" target="_blank" style="display: inline-block; background-color: #2383E2; color: #FFFFFF; font-size: 14px; font-weight: 600; padding: 12px 28px; border-radius: 6px; text-decoration: none; box-shadow: 0 2px 6px rgba(35, 131, 226, 0.28);">
                      Open Report in Admin Console →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 16px 28px; background-color: #FAFAFA; border-top: 1px solid #ECECEB; font-size: 11px; color: #9B9A97; text-align: center;">
              PaperGrade AI Operational Telemetry • Direct Dispatch
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


async def send_otp_email(
    to_email: str,
    recipient_name: str,
    otp_code: str,
    expires_in_minutes: int = 10,
) -> bool:
    """Send formatted 6-digit verification OTP email to user."""
    subject = f"Your PaperGrade AI verification code is {otp_code}"
    html = format_otp_email_html(recipient_name, otp_code, expires_in_minutes)
    text = (
        f"Hello {recipient_name},\n\n"
        f"Your PaperGrade AI verification code is: {otp_code}\n\n"
        f"This code is valid for {expires_in_minutes} minutes. Please do not share it with anyone."
    )
    return await send_transactional_email(
        to_email=to_email,
        subject=subject,
        html_content=html,
        text_content=text,
        to_name=recipient_name,
    )


def send_otp_email_sync(
    to_email: str,
    recipient_name: str,
    otp_code: str,
    expires_in_minutes: int = 10,
) -> bool:
    """Synchronous OTP email dispatch for background task threads."""
    subject = f"Your PaperGrade AI verification code is {otp_code}"
    html = format_otp_email_html(recipient_name, otp_code, expires_in_minutes)
    text = (
        f"Hello {recipient_name},\n\n"
        f"Your PaperGrade AI verification code is: {otp_code}\n\n"
        f"This code is valid for {expires_in_minutes} minutes. Please do not share it with anyone."
    )
    return send_transactional_email_sync(
        to_email=to_email,
        subject=subject,
        html_content=html,
        text_content=text,
        to_name=recipient_name,
    )


async def send_admin_issue_email(
    report_id: str,
    reporter_name: str,
    reporter_role: str,
    reporter_email: str,
    reporter_roll: Optional[str],
    branch_name: Optional[str],
    category: str,
    subject: str,
    description: str,
    screenshot_urls: List[str],
) -> bool:
    """Dispatch technical issue report notification to administrator."""
    admin_target = getattr(settings, "ADMIN_NOTIFICATION_EMAIL", "support@papergradeai.in")
    email_subject = f"[Issue #{report_id}] {category}: {subject}"
    html = format_admin_issue_html(
        report_id=report_id,
        reporter_name=reporter_name,
        reporter_role=reporter_role,
        reporter_email=reporter_email,
        reporter_roll=reporter_roll,
        branch_name=branch_name,
        category=category,
        subject=subject,
        description=description,
        screenshot_urls=screenshot_urls,
    )
    text = (
        f"New Technical Issue #{report_id}\n"
        f"Subject: {subject}\n"
        f"Category: {category}\n"
        f"Reporter: {reporter_name} ({reporter_role})\n"
        f"Email: {reporter_email}\n\n"
        f"Description:\n{description}\n\n"
        f"Review in admin console: https://www.papergradeai.in/admin/reports?report_id={report_id}"
    )
    return await send_transactional_email(
        to_email=admin_target,
        subject=email_subject,
        html_content=html,
        text_content=text,
        to_name="PaperGrade Admin",
    )
