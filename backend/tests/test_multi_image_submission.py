import io
from PIL import Image
import fitz
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.database import init_db

client = TestClient(app)

def create_dummy_image_bytes(color=(255, 255, 255)) -> bytes:
    buf = io.BytesIO()
    img = Image.new("RGB", (300, 400), color=color)
    img.save(buf, format="JPEG")
    return buf.getvalue()

def test_multi_image_submission_assembly():
    init_db()

    # 1. Login as admin
    login_res = client.post("/api/v1/auth/login", json={
        "email": "admin@papergrade.ai",
        "password": "AdminPassword123!"
    })
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Get active branch
    branches = client.get("/api/v1/tenancy/branches", headers=headers).json()
    branch_id = branches[0]["id"]

    # 3. Create exam & open window
    exam_res = client.post("/api/v1/exams", data={
        "title": "Camera Scan Multi-Page Test",
        "subject": "Physics",
        "branch_id": branch_id
    }, headers=headers)
    assert exam_res.status_code == 200
    exam_id = exam_res.json()["id"]

    win_res = client.post(f"/api/v1/windows/{exam_id}/open", json={
        "duration_minutes": 30,
        "grace_minutes": 2
    }, headers=headers)
    assert win_res.status_code == 200

    # 4. Upload 3 photographed pages via 'files' parameter (simulating camera scan)
    img1 = create_dummy_image_bytes((255, 200, 200))
    img2 = create_dummy_image_bytes((200, 255, 200))
    img3 = create_dummy_image_bytes((200, 200, 255))

    files = [
        ("files", ("17924817560012701911000158391796.jpg", io.BytesIO(img1), "image/jpeg")),
        ("files", ("page_2.jpg", io.BytesIO(img2), "image/jpeg")),
        ("files", ("page_3.jpg", io.BytesIO(img3), "image/jpeg")),
    ]

    upload_res = client.post(
        f"/api/v1/submissions/{exam_id}/upload-single",
        data={"roll_number": "SCAN-001", "student_name": "Scanner Student"},
        files=files,
        headers=headers
    )
    assert upload_res.status_code == 200
    data = upload_res.json()
    assert data["status"] == "success"
    assert data["page_count"] == 3
    assert data["roll_number"] == "SCAN-001"
