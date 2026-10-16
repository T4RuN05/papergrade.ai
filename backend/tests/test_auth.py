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
