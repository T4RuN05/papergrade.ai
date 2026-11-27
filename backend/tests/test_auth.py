import pytest
from datetime import timedelta
from fastapi import HTTPException
from backend.app.services.auth import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
)

def test_password_hashing():
    raw_pass = "SecurePass123!"
    hashed = hash_password(raw_pass)
    assert hashed != raw_pass
    assert verify_password(raw_pass, hashed) is True
    assert verify_password("WrongPass", hashed) is False

def test_jwt_lifecycle():
    data = {"sub": "user_123", "role": "ROOT_ADMIN", "institute_id": "inst_1"}
    token = create_access_token(data, expires_delta=timedelta(minutes=5))
    assert isinstance(token, str)
    
    payload = decode_access_token(token)
    assert payload["sub"] == "user_123"
    assert payload["role"] == "ROOT_ADMIN"
    assert payload["institute_id"] == "inst_1"

def test_jwt_expired():
    data = {"sub": "user_expired", "role": "STUDENT"}
    # Token expired 1 minute ago
    token = create_access_token(data, expires_delta=timedelta(minutes=-1))
    with pytest.raises(HTTPException) as exc_info:
        decode_access_token(token)
    assert exc_info.value.status_code == 401
    assert "expired" in exc_info.value.detail.lower()


def test_list_users_includes_google_picture_metadata():
    from types import SimpleNamespace
    from backend.app.routers.auth import list_users

    fake_user = SimpleNamespace(
        id="usr_mgr_1",
        institute_id="inst_test_institute",
        branch_id="br_test_1",
        email="mgr@example.com",
        role="BRANCH_MANAGER",
        full_name="Test Manager",
        is_active=1,
        created_at="2026-01-01T00:00:00Z",
        last_login_at="2026-01-02T00:00:00Z",
        google_email="mgr@gmail.com",
        google_picture="https://lh3.googleusercontent.com/a/test-avatar",
        google_linked_at="2026-01-01T12:00:00Z",
    )

    class _FakeScalars:
        def all(self):
            return [fake_user]

    class _FakeDB:
        def scalars(self, _stmt):
            return _FakeScalars()

    rows = list_users(
        role="BRANCH_MANAGER",
        current_user={"sub": "usr_root", "role": "ROOT_ADMIN"},
        db=_FakeDB(),
    )
    assert len(rows) == 1
    assert rows[0]["google_picture"] == "https://lh3.googleusercontent.com/a/test-avatar"
    assert rows[0]["google_email"] == "mgr@gmail.com"
    assert rows[0]["google_linked_at"] == "2026-01-01T12:00:00Z"
