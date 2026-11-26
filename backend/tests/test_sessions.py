import uuid
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.db.session import get_session
from backend.app.db.base import get_iso_now
from backend.app.db.models import User, UserSession
from backend.app.services.auth import hash_password, create_access_token
from backend.app.services.session_service import parse_device_label, mask_ip_address
from sqlalchemy import select, delete


client = TestClient(app)


def _create_test_user(prefix: str = "usr_test_sess") -> tuple[str, str, str]:
    uid = f"{prefix}_{uuid.uuid4().hex[:10]}"
    email = f"{uid}@test.papergrade.local"
    pwd = "TestSessionPwd123!"
    now = get_iso_now()
    with get_session() as db:
        u = User(
            id=uid,
            email=email,
            role="BRANCH_MANAGER",
            password_hash=hash_password(pwd),
            full_name="Test Session User",
            institute_id="inst_test_institute",
            is_active=1,
            has_changed_password=1,
            token_version=1,
            created_at=now,
        )
        db.add(u)
        db.commit()
    return uid, email, pwd


def _cleanup_user(uid: str):
    with get_session() as db:
        db.execute(delete(UserSession).where(UserSession.user_id == uid))
        db.execute(delete(User).where(User.id == uid))
        db.commit()


def test_device_label_and_ip_masking_helpers():
    assert parse_device_label(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36"
    ) == "Chrome on Windows"
    assert parse_device_label(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
    ) == "Safari on iPhone (iOS)"
    assert parse_device_label(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 EdgA/130.0"
    ) == "Edge on Android"
    assert mask_ip_address("103.21.44.89") == "103.21.xxx.89"


def test_multi_device_sessions_list_revoke_and_logout():
    uid, email, pwd = _create_test_user()
    other_uid, _, _ = _create_test_user("usr_test_other")
    try:
        # 1. Login from Device A (Windows Chrome)
        res_a = client.post(
            "/api/auth/login",
            json={"email": email, "password": pwd},
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36",
                "X-Forwarded-For": "103.21.10.42",
            },
        )
        assert res_a.status_code == 200
        tok_a = res_a.json()["access_token"]
        hdr_a = {"Authorization": f"Bearer {tok_a}"}

        # 2. Login from Device B (iPhone Safari)
        res_b = client.post(
            "/api/auth/login",
            json={"email": email, "password": pwd},
            headers={
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1",
                "X-Forwarded-For": "49.36.88.15",
            },
        )
        assert res_b.status_code == 200
        tok_b = res_b.json()["access_token"]
        hdr_b = {"Authorization": f"Bearer {tok_b}"}

        # 3. Device A lists active sessions -> sees both, only Device A marked is_current
        sess_res = client.get("/api/auth/sessions", headers=hdr_a)
        assert sess_res.status_code == 200
        sessions = sess_res.json()["sessions"]
        assert len(sessions) == 2

        current_sess = next(s for s in sessions if s["is_current"])
        other_sess = next(s for s in sessions if not s["is_current"])
        assert current_sess["device_label"] == "Chrome on Windows"
        assert current_sess["ip_address"] == "103.21.xxx.42"
        assert other_sess["device_label"] == "Safari on iPhone (iOS)"

        # 4. Cross-user isolation: another user cannot revoke Device B's session
        other_tok = create_access_token({"sub": other_uid, "role": "BRANCH_MANAGER", "token_version": 1})
        cross_del = client.delete(
            f"/api/auth/sessions/{other_sess['id']}",
            headers={"Authorization": f"Bearer {other_tok}"},
        )
        assert cross_del.status_code == 404

        # 5. Device A revokes Device B -> Device B gets immediate 401 while Device A remains 200
        rev = client.delete(f"/api/auth/sessions/{other_sess['id']}", headers=hdr_a)
        assert rev.status_code == 200
        assert client.get("/api/auth/me", headers=hdr_b).status_code == 401
        assert client.get("/api/auth/me", headers=hdr_a).status_code == 200

        # 6. Sign out Device A via POST /api/auth/logout -> Device A token immediately fails 401
        lo = client.post("/api/auth/logout", headers=hdr_a)
        assert lo.status_code == 200
        assert lo.json()["revoked"] is True
        assert client.get("/api/auth/me", headers=hdr_a).status_code == 401
    finally:
        _cleanup_user(uid)
        _cleanup_user(other_uid)


def test_session_concurrency_cap_and_sign_out_other_devices():
    uid, email, pwd = _create_test_user("usr_test_cap")
    try:
        tokens = []
        for i in range(12):
            r = client.post(
                "/api/auth/login",
                json={"email": email, "password": pwd},
                headers={"User-Agent": f"Mozilla/5.0 Chrome/{120+i}.0 Safari/537.36"},
            )
            assert r.status_code == 200
            tokens.append(r.json()["access_token"])

        newest_hdr = {"Authorization": f"Bearer {tokens[-1]}"}
        oldest_hdr = {"Authorization": f"Bearer {tokens[0]}"}

        # Cap = 10 active sessions: oldest token must already be revoked, newest shows 10 sessions
        assert client.get("/api/auth/me", headers=oldest_hdr).status_code == 401
        list_res = client.get("/api/auth/sessions", headers=newest_hdr)
        assert list_res.status_code == 200
        assert len(list_res.json()["sessions"]) == 10

        # Revoke all other devices except newest
        bulk_res = client.delete("/api/auth/sessions?keep_current=true", headers=newest_hdr)
        assert bulk_res.status_code == 200
        assert bulk_res.json()["revoked_count"] == 9
        assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {tokens[-2]}"}).status_code == 401
        assert client.get("/api/auth/me", headers=newest_hdr).status_code == 200
    finally:
        _cleanup_user(uid)


def test_legacy_token_without_sid_remains_compatible():
    uid, _, _ = _create_test_user("usr_test_leg")
    try:
        legacy_tok = create_access_token({"sub": uid, "role": "BRANCH_MANAGER", "token_version": 1})
        res = client.get("/api/auth/sessions", headers={"Authorization": f"Bearer {legacy_tok}"})
        assert res.status_code == 200
        assert res.json()["current_session_id"] is None
    finally:
        _cleanup_user(uid)
