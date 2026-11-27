from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.services.email_service import (
    render_all_email_previews,
    is_valid_real_email,
    extract_email_from_contact,
    send_issue_resolved_email,
    send_security_link_email,
    send_pilot_inquiry_emails,
)


def test_email_validation_and_extraction():
    assert is_valid_real_email("papergradeai@gmail.com") is True
    assert is_valid_real_email("student@student.local") is False
    assert is_valid_real_email("papergradeai.gmail.com") is False
    assert extract_email_from_contact("Call +91 9876543210 or director@apex.in") == "director@apex.in"
    assert extract_email_from_contact("No email here") is None


def test_all_notion_light_email_templates_render_and_escape():
    previews = render_all_email_previews()
    assert len(previews) == 6
    for item in previews:
        html_out = item["html"]
        assert "#f6f5f4" in html_out
        assert "#ffffff" in html_out
        assert "#0075de" in html_out
        assert "PaperGrade" in html_out
        assert "<script>" not in html_out


def test_dispatchers_mock_cleanly_in_test_runtime():
    assert send_issue_resolved_email(
        to_email="student@example.edu",
        reporter_name="Ananya",
        reporter_role="STUDENT",
        report_id="rep_test123",
        category="GRADING",
        subject="Test Subject",
        admin_notes="Resolved note",
    ) is True
    assert send_issue_resolved_email(
        to_email="stu@student.local",
        reporter_name="Local",
        reporter_role="STUDENT",
        report_id="rep_test124",
        category="OTHER",
        subject="Local skip",
    ) is False
    assert send_security_link_email(
        to_email="user@example.edu",
        recipient_name="Tarun",
        linked_google_email="tarun@gmail.com",
        link_mode="byos",
    ) is True
    res = send_pilot_inquiry_emails(
        institute_name="Test Institute",
        city="Mumbai",
        contact_info="director@testinst.in",
        batch_size="50–150 students",
        notes="Weekly Physics tests",
    )
    assert res["admin_sent"] is True
    assert res["requester_ack_sent"] is True


def test_contact_pilot_endpoint_validation_and_success():
    client = TestClient(app)
    bad = client.post("/api/contact/pilot", json={"institute_name": "A", "contact_info": "x"})
    assert bad.status_code == 422

    ok = client.post(
        "/api/contact/pilot",
        json={
            "institute_name": "TEST INSTITUTE Academy",
            "city": "Pune",
            "contact_info": "director@testinst.in",
            "batch_size": "50–150 students",
            "notes": "Weekly JEE Physics papers",
        },
    )
    assert ok.status_code == 200
    assert ok.json()["status"] == "success"
