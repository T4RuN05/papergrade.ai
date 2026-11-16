from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.portal_cache import PortalStateEpochManager

client = TestClient(app)

def test_portal_state_etag_fast_path():
    # 1. Login as student (or admin to check endpoint)
    login_res = client.post("/api/v1/auth/login", json={
        "email": "admin@papergrade.ai",
        "password": "AdminPassword123!"
    })
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. First request: Should return 200 OK and ETag header
    res1 = client.get("/api/v1/student/portal-state", headers=headers)
    assert res1.status_code == 200
    etag = res1.headers.get("etag")
    assert etag is not None
    assert etag.startswith('W/"')

    # 3. Second request with If-None-Match: Should return 304 Not Modified
    headers_with_etag = {**headers, "If-None-Match": etag}
    res2 = client.get("/api/v1/student/portal-state", headers=headers_with_etag)
    assert res2.status_code == 304
    assert res2.text == ""

    # 4. Bump epoch (simulating window event or results published)
    PortalStateEpochManager.bump_all()

    # 5. Third request with old ETag: Should return 200 OK with fresh ETag
    res3 = client.get("/api/v1/student/portal-state", headers=headers_with_etag)
    assert res3.status_code == 200
    new_etag = res3.headers.get("etag")
    assert new_etag is not None
    assert new_etag != etag
