"""
PaperGrade AI — Transactional Email Service (Brevo REST API Gateway)
Handles high-speed automated Notion-styled HTML email delivery for:
1. 6-digit cryptographic OTPs (Password resets & verification)
2. Immediate administrative alerts for user-reported technical/evaluation issues
3. Technical issue resolution confirmations to reporters
4. Account security confirmations (Google Sign-In / Google Drive BYOS link)
5. Coaching institute Pilot Integration inquiries & auto-acknowledgements

Invariants:
- Zero blocking: Uses asynchronous httpx client or threaded dispatches.
- Strict quota ceiling: Enforces safety checks to remain comfortably within Brevo's 300/day free limit.
- Result publication emails are strictly forbidden (results remain WebPush + In-App only).
- Test isolation: In test/pytest runtime, calls are mocked without network side effects.
"""

import os
import re
import html
import time
import logging
import threading
from typing import Optional, List, Dict, Any, Tuple
import httpx

from backend.app.config import settings

logger = logging.getLogger(__name__)

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"
_DAILY_SEND_COUNTER = 0
_LAST_RESET_DATE = time.strftime("%Y-%m-%d")
_MAX_DAILY_SAFETY_CEILING = 280  # Safety cushion below 300 limit
_QUOTA_LOCK = threading.Lock()

EMAIL_EXTRACT_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")


def _is_test_runtime() -> bool:
    """Return True if executing under pytest or test environment."""
    return bool(os.environ.get("PYTEST_CURRENT_TEST")) or getattr(settings, "ENVIRONMENT", "").lower() == "test"


def is_valid_real_email(email: Optional[str]) -> bool:
    """Return True if address looks like a deliverable external email (not blank or .local)."""
    if not email:
        return False
    clean = email.strip().lower()
    if "@" not in clean or clean.endswith(".local"):
        return False
    return bool(EMAIL_EXTRACT_RE.fullmatch(clean))


def extract_email_from_contact(contact_info: Optional[str]) -> Optional[str]:
    """Extract first deliverable email found inside a mixed email/phone contact field."""
    if not contact_info:
        return None
    match = EMAIL_EXTRACT_RE.search(contact_info.strip())
    if not match:
        return None
    candidate = match.group(0).strip().lower()
    return None if candidate.endswith(".local") else candidate


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


def _build_brevo_request(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None,
    to_name: Optional[str] = None,
    sender_name: Optional[str] = None,
    sender_email: Optional[str] = None,
    reply_to_email: Optional[str] = None,
    reply_to_name: Optional[str] = None,
) -> Optional[Tuple[Dict[str, Any], Dict[str, str], str]]:
    clean_to = (to_email or "").strip()
    if not clean_to or "@" not in clean_to:
        logger.warning("Invalid recipient email: %s", to_email)
        return None

    if _is_test_runtime():
        logger.info("[MOCK EMAIL TEST] Would send to: %s | Subject: %s", clean_to, subject)
        return None

    api_key = getattr(settings, "BREVO_API_KEY", "").strip()
    if not api_key:
        logger.warning("BREVO_API_KEY not configured. Email to %s skipped.", clean_to)
        return None

    if not _check_and_increment_quota():
        return None

    from_addr = sender_email or getattr(settings, "EMAIL_FROM_ADDRESS", "noreply@papergradeai.in")
    from_name = sender_name or getattr(settings, "EMAIL_FROM_NAME", "PaperGrade AI")

    payload: Dict[str, Any] = {
        "sender": {"name": from_name, "email": from_addr},
        "to": [{"email": clean_to, "name": to_name or clean_to}],
        "subject": subject,
        "htmlContent": html_content,
    }
    if text_content:
        payload["textContent"] = text_content
    if reply_to_email and is_valid_real_email(reply_to_email):
        payload["replyTo"] = {
            "email": reply_to_email.strip(),
            "name": (reply_to_name or reply_to_email).strip(),
        }

    headers = {
        "api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    return payload, headers, clean_to


async def send_transactional_email(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None,
    to_name: Optional[str] = None,
    sender_name: Optional[str] = None,
    sender_email: Optional[str] = None,
    reply_to_email: Optional[str] = None,
    reply_to_name: Optional[str] = None,
) -> bool:
    """Send a single transactional email via Brevo REST API v3."""
    if _is_test_runtime():
        logger.info("[MOCK EMAIL TEST] Would send to: %s | Subject: %s", to_email, subject)
        return bool(to_email and "@" in to_email)

    req = _build_brevo_request(
        to_email=to_email,
        subject=subject,
        html_content=html_content,
        text_content=text_content,
        to_name=to_name,
        sender_name=sender_name,
        sender_email=sender_email,
        reply_to_email=reply_to_email,
        reply_to_name=reply_to_name,
    )
    if not req:
        return False
    payload, headers, clean_to = req

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(BREVO_API_URL, json=payload, headers=headers)
            if resp.status_code in (200, 201, 202):
                logger.info("Successfully dispatched email to %s via Brevo (status: %d)", clean_to, resp.status_code)
                return True
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
    reply_to_email: Optional[str] = None,
    reply_to_name: Optional[str] = None,
) -> bool:
    """Synchronous wrapper for background thread contexts."""
    if _is_test_runtime():
        logger.info("[MOCK EMAIL SYNC] To: %s | Subject: %s", to_email, subject)
        return bool(to_email and "@" in to_email)

    req = _build_brevo_request(
        to_email=to_email,
        subject=subject,
        html_content=html_content,
        text_content=text_content,
        to_name=to_name,
        sender_name=sender_name,
        sender_email=sender_email,
        reply_to_email=reply_to_email,
        reply_to_name=reply_to_name,
    )
    if not req:
        return False
    payload, headers, clean_to = req

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(BREVO_API_URL, json=payload, headers=headers)
            if resp.status_code in (200, 201, 202):
                logger.info("Sync dispatched email to %s via Brevo (%d)", clean_to, resp.status_code)
                return True
            logger.error("Brevo sync error %d: %s", resp.status_code, resp.text)
            return False
    except Exception as exc:
        logger.error("Exception during Brevo sync email dispatch: %s", exc)
        return False


# ============================================================================
# Shared Notion Warm-Paper Light Email Design System
# ============================================================================

_BADGE_STYLES: Dict[str, Tuple[str, str, str]] = {
    # (background, border, text)
    "blue": ("#f0f7ff", "#cce4fb", "#005bab"),
    "green": ("#ecfdf5", "#bcebd7", "#066e46"),
    "amber": ("#fff7ed", "#f8d8b4", "#9a4a00"),
    "red": ("#fef2f2", "#f6cccc", "#b42318"),
    "neutral": ("#f6f5f4", "#e6e6e6", "#31302e"),
}


def _render_badge(label: str, tone: str = "blue") -> str:
    bg, border, text = _BADGE_STYLES.get(tone, _BADGE_STYLES["blue"])
    return (
        f'<span style="display:inline-block; background-color:{bg}; border:1px solid {border}; '
        f'color:{text}; font-size:10px; font-weight:700; letter-spacing:0.6px; '
        f'text-transform:uppercase; padding:4px 9px; border-radius:999px; '
        f"font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;\">"
        f"{html.escape(label)}</span>"
    )


def _render_kv_table(rows: List[Tuple[str, str, bool]]) -> str:
    """
    Render Notion-style page properties table.
    Each row is (label, raw_value_or_html, escape_value).
    """
    row_html = []
    for idx, (label, val, should_escape) in enumerate(rows):
        display_val = html.escape(val) if should_escape else val
        border_css = "" if idx == len(rows) - 1 else "border-bottom:1px solid #f0f0f0;"
        row_html.append(
            f'<tr>'
            f'<td width="34%" valign="top" style="padding:9px 10px 9px 0; {border_css} '
            f'font-size:12px; color:#615d59; font-weight:500;">{html.escape(label)}</td>'
            f'<td valign="top" style="padding:9px 0; {border_css} '
            f'font-size:13px; color:#000000; font-weight:500;">{display_val}</td>'
            f'</tr>'
        )
    return (
        '<table width="100%" border="0" cellspacing="0" cellpadding="0" '
        'style="margin:18px 0 20px 0; border-top:1px solid #e6e6e6; border-bottom:1px solid #e6e6e6;">'
        + "".join(row_html)
        + "</table>"
    )


def _render_callout(title: str, body_html: str, accent_color: str = "#0075de") -> str:
    return (
        '<table width="100%" border="0" cellspacing="0" cellpadding="0" '
        f'style="margin:16px 0; background-color:#f6f5f4; border:1px solid #e6e6e6; '
        f'border-left:3px solid {accent_color}; border-radius:6px;">'
        "<tr>"
        '<td style="padding:14px 16px;">'
        f'<div style="font-size:11px; font-weight:700; text-transform:uppercase; '
        f'letter-spacing:0.5px; color:#615d59; margin-bottom:6px; '
        f"font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;\">{html.escape(title)}</div>"
        f'<div style="font-size:13.5px; line-height:1.65; color:#191919;">{body_html}</div>'
        "</td>"
        "</tr>"
        "</table>"
    )


def _render_notion_email(
    *,
    doc_title: str,
    preheader: str,
    badge_label: str,
    badge_tone: str,
    eyebrow: str,
    heading: str,
    intro_html: str,
    body_html: str,
    cta_label: Optional[str] = None,
    cta_url: Optional[str] = None,
    footer_note: str = "PaperGrade AI • High-Integrity Academic Evaluation",
) -> str:
    base_url = getattr(settings, "FRONTEND_URL", "https://www.papergradeai.in").rstrip("/") or "https://www.papergradeai.in"
    logo_url = f"{base_url}/logo-icon.png"
    badge_html = _render_badge(badge_label, badge_tone)

    cta_block = ""
    if cta_label and cta_url:
        safe_url = html.escape(cta_url, quote=True)
        safe_cta = html.escape(cta_label)
        cta_block = f"""
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:24px 0 8px 0;">
                <tr>
                  <td align="left">
                    <a href="{safe_url}" target="_blank" style="display:inline-block; background-color:#0075de; color:#ffffff; font-size:13.5px; font-weight:600; padding:11px 22px; border-radius:8px; text-decoration:none; letter-spacing:-0.01em;">
                      {safe_cta}
                    </a>
                  </td>
                </tr>
              </table>"""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>{html.escape(doc_title)}</title>
</head>
<body style="margin:0; padding:0; background-color:#f6f5f4; font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#000000; -webkit-font-smoothing:antialiased;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">{html.escape(preheader)}</div>
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f6f5f4; padding:32px 14px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:560px; background-color:#ffffff; border:1px solid #e6e6e6; border-radius:12px; overflow:hidden; box-shadow:0 4px 16px rgba(0,0,0,0.04);">
          <!-- Top Brand Bar -->
          <tr>
            <td style="padding:20px 28px; border-bottom:1px solid #f0f0f0; background-color:#ffffff;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td valign="middle">
                    <table border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td valign="middle" style="padding-right:8px;">
                          <img src="{html.escape(logo_url, quote=True)}" width="22" height="22" alt="PaperGrade AI" style="display:block; border:0; border-radius:5px;" />
                        </td>
                        <td valign="middle">
                          <span style="font-size:15px; font-weight:700; color:#000000; letter-spacing:-0.02em;">PaperGrade</span>
                          <span style="font-size:15px; font-weight:700; color:#0075de; letter-spacing:-0.02em;"> AI</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" valign="middle">
                    {badge_html}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Document Body -->
          <tr>
            <td style="padding:28px 28px 26px 28px;">
              <div style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.6px; color:#0075de; margin-bottom:6px; font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;">
                {html.escape(eyebrow)}
              </div>
              <h1 style="margin:0 0 12px 0; font-size:21px; font-weight:700; line-height:1.25; letter-spacing:-0.025em; color:#000000;">
                {html.escape(heading)}
              </h1>
              <p style="margin:0 0 18px 0; font-size:14px; line-height:1.65; color:#31302e;">
                {intro_html}
              </p>

              {body_html}
              {cta_block}
            </td>
          </tr>

          <!-- Notion Warm Paper Footer -->
          <tr>
            <td style="padding:18px 28px; background-color:#f6f5f4; border-top:1px solid #e6e6e6; font-size:11.5px; line-height:1.6; color:#615d59;">
              <div style="font-weight:600; color:#31302e; margin-bottom:4px;">{html.escape(footer_note)}</div>
              <div>
                <a href="{html.escape(base_url, quote=True)}" style="color:#0075de; text-decoration:none;">papergradeai.in</a>
                &nbsp;·&nbsp;
                <a href="{html.escape(base_url + '/help', quote=True)}" style="color:#615d59; text-decoration:none;">User Manual</a>
                &nbsp;·&nbsp;
                <a href="{html.escape(base_url + '/privacy', quote=True)}" style="color:#615d59; text-decoration:none;">Privacy</a>
                &nbsp;·&nbsp;
                <a href="mailto:support@papergradeai.in" style="color:#615d59; text-decoration:none;">support@papergradeai.in</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


# ============================================================================
# 1. Verification OTP Email
# ============================================================================

def format_otp_email_html(recipient_name: str, otp_code: str, expires_in_minutes: int = 10) -> str:
    safe_name = html.escape(recipient_name or "User")
    safe_otp = html.escape(otp_code or "")
    body_html = f"""
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:20px 0;">
        <tr>
          <td align="center" style="background-color:#f6f5f4; border:1px dashed #cfccc7; border-radius:8px; padding:22px 16px;">
            <div style="font-size:32px; font-weight:700; letter-spacing:8px; color:#000000; font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;">
              {safe_otp}
            </div>
            <div style="font-size:12px; color:#615d59; margin-top:8px;">
              Valid for <strong>{expires_in_minutes} minutes</strong> &middot; Single use only
            </div>
          </td>
        </tr>
      </table>
      <p style="margin:0; font-size:12.5px; line-height:1.6; color:#615d59;">
        Never share this code with anyone. If you did not request a verification or password reset, you can safely ignore this message.
      </p>
    """
    return _render_notion_email(
        doc_title="Your PaperGrade AI Verification Code",
        preheader=f"Your verification code is {safe_otp} (valid for {expires_in_minutes} minutes).",
        badge_label="Verification",
        badge_tone="blue",
        eyebrow="Account Security",
        heading="Use this code to verify your account",
        intro_html=f"Hello <strong>{safe_name}</strong>, enter the 6-digit verification code below to finish resetting your password on PaperGrade AI.",
        body_html=body_html,
        footer_note="PaperGrade AI • Automated Security Verification",
    )


async def send_otp_email(
    to_email: str,
    recipient_name: str,
    otp_code: str,
    expires_in_minutes: int = 10,
) -> bool:
    subject = f"Your PaperGrade AI verification code is {otp_code}"
    html_body = format_otp_email_html(recipient_name, otp_code, expires_in_minutes)
    text = (
        f"Hello {recipient_name},\n\n"
        f"Your PaperGrade AI verification code is: {otp_code}\n\n"
        f"This code is valid for {expires_in_minutes} minutes. Please do not share it with anyone."
    )
    return await send_transactional_email(
        to_email=to_email,
        subject=subject,
        html_content=html_body,
        text_content=text,
        to_name=recipient_name,
    )


def send_otp_email_sync(
    to_email: str,
    recipient_name: str,
    otp_code: str,
    expires_in_minutes: int = 10,
) -> bool:
    subject = f"Your PaperGrade AI verification code is {otp_code}"
    html_body = format_otp_email_html(recipient_name, otp_code, expires_in_minutes)
    text = (
        f"Hello {recipient_name},\n\n"
        f"Your PaperGrade AI verification code is: {otp_code}\n\n"
        f"This code is valid for {expires_in_minutes} minutes. Please do not share it with anyone."
    )
    return send_transactional_email_sync(
        to_email=to_email,
        subject=subject,
        html_content=html_body,
        text_content=text,
        to_name=recipient_name,
    )


# ============================================================================
# 2. Admin Technical / Evaluation Issue Alert
# ============================================================================

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
    safe_id = html.escape(report_id or "")
    safe_subj = html.escape(subject or "")
    safe_desc = html.escape(description or "").replace("\n", "<br>")

    identity_parts = [reporter_name or "User", f"({reporter_role})"]
    if reporter_roll:
        identity_parts.append(f"· Roll {reporter_roll}")
    if branch_name:
        identity_parts.append(f"· {branch_name}")

    kv_rows: List[Tuple[str, str, bool]] = [
        ("Report ID", f'<code style="background:#f6f5f4;border:1px solid #e6e6e6;padding:2px 6px;border-radius:4px;font-size:12px;">#{safe_id}</code>', False),
        ("Reported By", " ".join(identity_parts), True),
        ("Reply Email", f'<a href="mailto:{html.escape(reporter_email or "", quote=True)}" style="color:#0075de;text-decoration:none;">{html.escape(reporter_email or "Not provided")}</a>', False),
        ("Category", _render_badge(category or "OTHER", "amber"), False),
    ]

    screenshots_html = ""
    if screenshot_urls:
        shots_items = "".join(
            f'<li style="margin-bottom:5px;"><a href="{html.escape(url, quote=True)}" target="_blank" style="color:#0075de;text-decoration:underline;">Screenshot #{i+1} &nearr;</a></li>'
            for i, url in enumerate(screenshot_urls)
        )
        screenshots_html = (
            '<div style="margin-top:16px;padding:12px 14px;background-color:#f6f5f4;border:1px solid #e6e6e6;border-radius:6px;">'
            f'<div style="font-size:11.5px;font-weight:700;color:#31302e;margin-bottom:6px;">Attached Screenshots ({len(screenshot_urls)})</div>'
            f'<ul style="margin:0;padding-left:18px;font-size:12.5px;line-height:1.6;">{shots_items}</ul>'
            '</div>'
        )

    body_html = (
        _render_kv_table(kv_rows)
        + _render_callout("Issue Description", safe_desc, accent_color="#dd5b00")
        + screenshots_html
    )

    base_url = getattr(settings, "FRONTEND_URL", "https://www.papergradeai.in").rstrip("/") or "https://www.papergradeai.in"
    deep_link = f"{base_url}/admin/reports?report_id={safe_id}"

    return _render_notion_email(
        doc_title=f"Issue #{safe_id}: {safe_subj}",
        preheader=f"[{category}] {subject} — reported by {reporter_name}",
        badge_label="Issue Alert",
        badge_tone="red",
        eyebrow="Support Queue",
        heading=subject or "New Technical Issue Reported",
        intro_html="A new technical or evaluation report was filed in PaperGrade AI and is ready for triage.",
        body_html=body_html,
        cta_label="Open Report in Admin Console →",
        cta_url=deep_link,
        footer_note="PaperGrade AI • Admin Operations Alert",
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
    admin_target = getattr(settings, "ADMIN_NOTIFICATION_EMAIL", "support@papergradeai.in")
    email_subject = f"[Issue #{report_id}] {category}: {subject}"
    html_body = format_admin_issue_html(
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
        html_content=html_body,
        text_content=text,
        to_name="PaperGrade Admin",
        reply_to_email=reporter_email if is_valid_real_email(reporter_email) else None,
        reply_to_name=reporter_name,
    )


# ============================================================================
# 3. Technical Issue Resolved Notification (Reporter)
# ============================================================================

def format_issue_resolved_html(
    report_id: str,
    reporter_name: str,
    reporter_role: str,
    category: str,
    subject: str,
    admin_notes: Optional[str],
    resolved_by_name: Optional[str],
) -> str:
    safe_id = html.escape(report_id or "")
    safe_name = html.escape(reporter_name or "User")
    note_text = (admin_notes or "").strip() or "Our support team reviewed and resolved your report. Please refresh your PaperGrade portal to see the update."
    safe_notes = html.escape(note_text).replace("\n", "<br>")

    kv_rows: List[Tuple[str, str, bool]] = [
        ("Ticket ID", f'<code style="background:#f6f5f4;border:1px solid #e6e6e6;padding:2px 6px;border-radius:4px;font-size:12px;">#{safe_id}</code>', False),
        ("Subject", subject or "Technical Issue", True),
        ("Category", category or "GENERAL", True),
        ("Status", _render_badge("Resolved", "green"), False),
    ]
    if resolved_by_name:
        kv_rows.append(("Reviewed By", resolved_by_name, True))

    body_html = (
        _render_kv_table(kv_rows)
        + _render_callout("Resolution Note", safe_notes, accent_color="#1aae39")
    )

    base_url = getattr(settings, "FRONTEND_URL", "https://www.papergradeai.in").rstrip("/") or "https://www.papergradeai.in"
    portal_path = "/student/portal" if reporter_role == "STUDENT" else "/overview"

    return _render_notion_email(
        doc_title=f"Resolved: {subject} (#{safe_id})",
        preheader=f"Your technical report #{safe_id} has been marked resolved.",
        badge_label="Resolved",
        badge_tone="green",
        eyebrow="Support Update",
        heading="Your reported issue has been resolved",
        intro_html=f"Hi <strong>{safe_name}</strong>, our team has completed reviewing your technical report and marked it resolved.",
        body_html=body_html,
        cta_label="Return to Your Portal →",
        cta_url=f"{base_url}{portal_path}",
        footer_note="PaperGrade AI • Support Resolution Notice",
    )


def send_issue_resolved_email(
    to_email: str,
    reporter_name: str,
    reporter_role: str,
    report_id: str,
    category: str,
    subject: str,
    admin_notes: Optional[str] = None,
    resolved_by_name: Optional[str] = None,
) -> bool:
    if not is_valid_real_email(to_email):
        return False
    email_subject = f"[Resolved #{report_id}] {subject}"
    html_body = format_issue_resolved_html(
        report_id=report_id,
        reporter_name=reporter_name,
        reporter_role=reporter_role,
        category=category,
        subject=subject,
        admin_notes=admin_notes,
        resolved_by_name=resolved_by_name,
    )
    note_line = (admin_notes or "").strip() or "Please refresh your portal to see the latest state."
    text = (
        f"Hi {reporter_name},\n\n"
        f"Your technical report #{report_id} ('{subject}') has been marked RESOLVED.\n\n"
        f"Resolution Note: {note_line}\n\n"
        f"Thank you for helping keep PaperGrade AI reliable."
    )
    return send_transactional_email_sync(
        to_email=to_email,
        subject=email_subject,
        html_content=html_body,
        text_content=text,
        to_name=reporter_name,
    )


# ============================================================================
# 4. Account Security: Google / BYOS Link Confirmation
# ============================================================================

def format_security_link_html(
    recipient_name: str,
    account_email: str,
    linked_google_email: str,
    link_mode: str,
    linked_at_label: str,
) -> str:
    safe_name = html.escape(recipient_name or "User")
    is_byos = link_mode == "byos"
    action_title = (
        "Google Drive archive & Sign-In connected"
        if is_byos
        else "Google Sign-In linked to your account"
    )
    scope_desc = (
        "1-Click Google Sign-In & Google Drive BYOS Archive"
        if is_byos
        else "1-Click Google Sign-In (Profile & Email)"
    )

    kv_rows: List[Tuple[str, str, bool]] = [
        ("Account Email", account_email, True),
        ("Linked Google ID", linked_google_email, True),
        ("Enabled Access", scope_desc, True),
        ("Timestamp", linked_at_label, True),
    ]
    callout = _render_callout(
        "Didn't Authorize This?",
        "Open <strong>Account &amp; Security Settings</strong> immediately to unlink Google access, revoke active sessions, or update your password.",
        accent_color="#0075de",
    )

    base_url = getattr(settings, "FRONTEND_URL", "https://www.papergradeai.in").rstrip("/") or "https://www.papergradeai.in"

    return _render_notion_email(
        doc_title=f"Security Notice: {action_title}",
        preheader=f"{linked_google_email} was linked to your PaperGrade AI account.",
        badge_label="Security Notice",
        badge_tone="blue",
        eyebrow="Identity & Storage",
        heading=action_title,
        intro_html=f"Hello <strong>{safe_name}</strong>, this is a confirmation that a Google account connection was added to your PaperGrade AI profile.",
        body_html=_render_kv_table(kv_rows) + callout,
        cta_label="Review Security Settings →",
        cta_url=f"{base_url}/settings",
        footer_note="PaperGrade AI • Automated Security Alert",
    )


def send_security_link_email(
    to_email: str,
    recipient_name: str,
    linked_google_email: str,
    link_mode: str = "link",
    linked_at_label: Optional[str] = None,
) -> bool:
    target = to_email if is_valid_real_email(to_email) else linked_google_email
    if not is_valid_real_email(target):
        return False

    ts_label = linked_at_label or time.strftime("%d %b %Y, %H:%M UTC", time.gmtime())
    action_short = "Google Drive Storage Connected" if link_mode == "byos" else "Google Sign-In Linked"
    email_subject = f"[Security] {action_short} — PaperGrade AI"
    html_body = format_security_link_html(
        recipient_name=recipient_name,
        account_email=to_email or linked_google_email,
        linked_google_email=linked_google_email,
        link_mode=link_mode,
        linked_at_label=ts_label,
    )
    text = (
        f"Hello {recipient_name},\n\n"
        f"{action_short}: {linked_google_email} was connected to your PaperGrade AI account at {ts_label}.\n"
        f"If this wasn't you, open https://www.papergradeai.in/settings to revoke access immediately."
    )
    return send_transactional_email_sync(
        to_email=target,
        subject=email_subject,
        html_content=html_body,
        text_content=text,
        to_name=recipient_name,
    )


# ============================================================================
# 5. Coaching Institute Pilot Integration Inquiry + Auto-Ack
# ============================================================================

def format_pilot_inquiry_html(
    institute_name: str,
    city: str,
    contact_info: str,
    batch_size: str,
    notes: Optional[str],
    submitted_at_label: str,
) -> str:
    safe_notes = html.escape((notes or "").strip() or "No additional cadence notes provided.").replace("\n", "<br>")
    kv_rows: List[Tuple[str, str, bool]] = [
        ("Institute Name", institute_name, True),
        ("City / Location", city or "Not specified", True),
        ("Contact", contact_info, True),
        ("Pilot Batch Size", batch_size, True),
        ("Received", submitted_at_label, True),
    ]
    body_html = _render_kv_table(kv_rows) + _render_callout("Subjects & Test Cadence", safe_notes, accent_color="#0075de")

    base_url = getattr(settings, "FRONTEND_URL", "https://www.papergradeai.in").rstrip("/") or "https://www.papergradeai.in"

    return _render_notion_email(
        doc_title=f"Pilot Inquiry: {institute_name}",
        preheader=f"New pilot request from {institute_name} ({batch_size}).",
        badge_label="Pilot Inquiry",
        badge_tone="blue",
        eyebrow="Institute Onboarding",
        heading=f"New Pilot Request: {institute_name}",
        intro_html="An institute submitted a live PaperGrade AI Pilot Integration request from the website.",
        body_html=body_html,
        cta_label="Open Tenancy Console →",
        cta_url=f"{base_url}/admin/tenancy",
        footer_note="PaperGrade AI • Pilot Onboarding Intake",
    )


def format_pilot_confirmation_html(
    institute_name: str,
    city: str,
    batch_size: str,
    notes: Optional[str],
) -> str:
    kv_rows: List[Tuple[str, str, bool]] = [
        ("Institute", institute_name, True),
        ("City", city or "Not specified", True),
        ("Initial Batch Size", batch_size, True),
    ]
    if notes and notes.strip():
        kv_rows.append(("Notes", notes.strip(), True))

    next_steps = _render_callout(
        "What Happens Next",
        "1. We align on your upcoming descriptive test paper and step-marking rubric.<br>"
        "2. We set up an isolated branch &amp; batch roster CSV for your students.<br>"
        "3. We co-monitor one test cycle from live scan upload through next-day review.",
        accent_color="#1aae39",
    )

    base_url = getattr(settings, "FRONTEND_URL", "https://www.papergradeai.in").rstrip("/") or "https://www.papergradeai.in"

    return _render_notion_email(
        doc_title="PaperGrade AI Pilot Request Received",
        preheader=f"Thanks for reaching out about piloting PaperGrade AI at {institute_name}.",
        badge_label="Request Received",
        badge_tone="green",
        eyebrow="Pilot Program",
        heading="We received your pilot walkthrough request",
        intro_html=f"Thanks for contacting PaperGrade AI regarding <strong>{html.escape(institute_name)}</strong>. Our team will reach out shortly to schedule your walkthrough.",
        body_html=_render_kv_table(kv_rows) + next_steps,
        cta_label="Explore User Manuals →",
        cta_url=f"{base_url}/help",
        footer_note="PaperGrade AI • Institute Pilot Team",
    )


def send_pilot_inquiry_emails(
    institute_name: str,
    city: str,
    contact_info: str,
    batch_size: str,
    notes: Optional[str] = None,
) -> Dict[str, bool]:
    admin_target = getattr(settings, "ADMIN_NOTIFICATION_EMAIL", "support@papergradeai.in")
    ts_label = time.strftime("%d %b %Y, %H:%M UTC", time.gmtime())
    requester_email = extract_email_from_contact(contact_info)

    admin_html = format_pilot_inquiry_html(
        institute_name=institute_name,
        city=city,
        contact_info=contact_info,
        batch_size=batch_size,
        notes=notes,
        submitted_at_label=ts_label,
    )
    admin_text = (
        f"New Pilot Inquiry: {institute_name}\n"
        f"City: {city or 'Not specified'}\n"
        f"Contact: {contact_info}\n"
        f"Batch Size: {batch_size}\n"
        f"Notes: {(notes or '').strip() or 'None'}\n"
    )
    admin_ok = send_transactional_email_sync(
        to_email=admin_target,
        subject=f"[Pilot Inquiry] {institute_name} ({batch_size})",
        html_content=admin_html,
        text_content=admin_text,
        to_name="PaperGrade Onboarding",
        reply_to_email=requester_email,
        reply_to_name=institute_name,
    )

    ack_ok = False
    if requester_email and requester_email != admin_target.lower():
        ack_html = format_pilot_confirmation_html(
            institute_name=institute_name,
            city=city,
            batch_size=batch_size,
            notes=notes,
        )
        ack_text = (
            f"Thank you for contacting PaperGrade AI regarding {institute_name}.\n\n"
            f"We have logged your pilot walkthrough request ({batch_size}) and will follow up shortly.\n"
            f"For immediate questions, reply directly or write to support@papergradeai.in."
        )
        ack_ok = send_transactional_email_sync(
            to_email=requester_email,
            subject=f"PaperGrade AI — Pilot Walkthrough Request Received ({institute_name})",
            html_content=ack_html,
            text_content=ack_text,
            to_name=institute_name,
            reply_to_email=admin_target,
            reply_to_name="PaperGrade AI Team",
        )

    return {"admin_sent": admin_ok, "requester_ack_sent": ack_ok}


def render_all_email_previews() -> List[Dict[str, str]]:
    """Build deterministic Notion light-mode previews for all transactional templates."""
    return [
        {
            "key": "otp_verification",
            "label": "1. Password Reset Verification OTP",
            "subject": "[Sample 1/6] PaperGrade AI — Verification Code (849201)",
            "html": format_otp_email_html("Aarav Sharma", "849201", expires_in_minutes=10),
        },
        {
            "key": "admin_issue_alert",
            "label": "2. Admin Technical Issue Alert",
            "subject": "[Sample 2/6] [Issue #rep_9f2a10c4] GRADING: Handwritten margin continuation cropped",
            "html": format_admin_issue_html(
                report_id="rep_9f2a10c4",
                reporter_name="Ananya Bhattacharya",
                reporter_role="STUDENT",
                reporter_email="ananya.b@example.edu",
                reporter_roll="BVI-C2-004",
                branch_name="Borivali East",
                category="GRADING",
                subject="Handwritten margin continuation cropped on Page 3",
                description="My final numerical conversion to kJ was written in the top right margin box on Page 3 and got partially clipped in the Q4 region overlay.",
                screenshot_urls=["https://www.papergradeai.in/help?role=student"],
            ),
        },
        {
            "key": "issue_resolved",
            "label": "3. Technical Issue Resolved (to Reporter)",
            "subject": "[Sample 3/6] [Resolved #rep_9f2a10c4] Handwritten margin continuation cropped",
            "html": format_issue_resolved_html(
                report_id="rep_9f2a10c4",
                reporter_name="Ananya Bhattacharya",
                reporter_role="STUDENT",
                category="GRADING",
                subject="Handwritten margin continuation cropped on Page 3",
                admin_notes="Verified the top-margin Joule conversion on Page 3, expanded the Q4 annotation bounding box, and updated your marks ledger by +1.0 mark.",
                resolved_by_name="Prof. R. Kulkarni",
            ),
        },
        {
            "key": "security_google_link",
            "label": "4. Security Confirmation (Google / BYOS Linked)",
            "subject": "[Sample 4/6] [Security] Google Drive Storage Connected — PaperGrade AI",
            "html": format_security_link_html(
                recipient_name="Tarun Sharma",
                account_email="director@apexacademy.in",
                linked_google_email="papergradeai@gmail.com",
                link_mode="byos",
                linked_at_label="27 Nov 2026, 11:15 UTC",
            ),
        },
        {
            "key": "pilot_inquiry_admin",
            "label": "5. Pilot Integration Brief (to Onboarding Inbox)",
            "subject": "[Sample 5/6] [Pilot Inquiry] Apex Science Academy (50–150 students)",
            "html": format_pilot_inquiry_html(
                institute_name="Apex Science Academy",
                city="Mumbai",
                contact_info="director@apexacademy.in",
                batch_size="50–150 students",
                notes="Weekly JEE Physics & Chemistry subjective mock tests (50 marks each).",
                submitted_at_label="27 Nov 2026, 11:18 UTC",
            ),
        },
        {
            "key": "pilot_confirmation_user",
            "label": "6. Pilot Request Auto-Acknowledgement (to Institute)",
            "subject": "[Sample 6/6] PaperGrade AI — Pilot Walkthrough Request Received (Apex Science Academy)",
            "html": format_pilot_confirmation_html(
                institute_name="Apex Science Academy",
                city="Mumbai",
                batch_size="50–150 students",
                notes="Weekly JEE Physics & Chemistry subjective mock tests (50 marks each).",
            ),
        },
    ]
