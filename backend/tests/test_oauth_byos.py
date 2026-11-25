import pytest
import uuid
from backend.app.services.google_drive_service import (
    encrypt_token,
    decrypt_token,
    get_google_auth_url,
    DEFAULT_SCOPES,
)
from backend.app.routers.oauth import (
    _generate_oauth_state,
    _verify_oauth_state,
    authorize_google,
    get_google_connection_status,
    disconnect_google_connection,
)
from backend.app.db.session import get_session
from backend.app.db.models import User
from backend.app.db.models.byos import GoogleStorageConnection
from sqlalchemy import select, delete
from fastapi import HTTPException


def test_token_encryption_and_decryption():
    """Verify AES Fernet encryption and decryption of refresh tokens."""
    raw_token = "1//04e_sample_google_refresh_token_xyz123"
    enc = encrypt_token(raw_token)
    assert enc != raw_token
    dec = decrypt_token(enc)
    assert dec == raw_token


def test_oauth_state_signing_and_tamper_detection():
    """Verify HMAC-SHA256 signature and tamper resistance of OAuth state."""
    state = _generate_oauth_state(mode="login", user_id="usr_test_123")
    parsed = _verify_oauth_state(state)
    assert parsed["mode"] == "login"
    assert parsed["uid"] == "usr_test_123"

    # Tampered state must fail verification
    tampered = state[:-4] + "AAAA"
    with pytest.raises(HTTPException) as exc:
        _verify_oauth_state(tampered)
    assert exc.value.status_code == 400


def test_google_auth_url_construction():
    """Verify that Google OAuth URL requests the required least-privilege drive.file scope."""
    url = get_google_auth_url(state="test_state_123")
    assert "accounts.google.com/o/oauth2/v2/auth" in url
    assert "https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.file" in url or "drive.file" in url
    assert "access_type=offline" in url
    assert "state=test_state_123" in url


def test_google_byos_status_and_disconnect_lifecycle():
    """Verify checking connection status and disconnecting Google Drive."""
    now_str = "2026-11-25T12:00:00Z"
    test_user_id = f"usr_oauth_{uuid.uuid4().hex[:8]}"
    test_email = f"oauth_user_{uuid.uuid4().hex[:6]}@test.edu"
    test_google_email = f"student_{uuid.uuid4().hex[:6]}@gmail.com"

    with get_session() as session:
        user = User(
            id=test_user_id,
            email=test_email,
            role="STUDENT",
            password_hash="dummy_hash",
            full_name="BYOS Test Student",
            is_active=1,
            google_sub="goog_sub_123456",
            google_email=test_google_email,
            google_linked_at=now_str,
            created_at=now_str,
        )
        conn = GoogleStorageConnection(
            id=f"gconn_{uuid.uuid4().hex[:8]}",
            user_id=test_user_id,
            google_sub="goog_sub_123456",
            google_email=test_google_email,
            encrypted_refresh_token=encrypt_token("dummy_refresh_token"),
            is_active=1,
            created_at=now_str,
        )
        session.add(user)
        session.add(conn)
        session.commit()

    current_user_token = {
        "sub": test_user_id,
        "role": "STUDENT",
        "email": test_email,
    }

    try:
        with get_session() as session:
            # 1. Check status when connected
            status_res = get_google_connection_status(
                current_user=current_user_token,
                db=session,
            )
            assert status_res["is_connected"] is True
            assert status_res["google_email"] == test_google_email

            # 2. Disconnect
            disc_res = disconnect_google_connection(
                current_user=current_user_token,
                db=session,
            )
            assert disc_res["status"] == "success"

            # 3. Check status after disconnect
            status_after = get_google_connection_status(
                current_user=current_user_token,
                db=session,
            )
            assert status_after["is_connected"] is False

    finally:
        with get_session() as session:
            session.execute(delete(GoogleStorageConnection).where(GoogleStorageConnection.user_id == test_user_id))
            session.execute(delete(User).where(User.id == test_user_id))
            session.commit()
