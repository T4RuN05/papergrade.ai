from pathlib import Path
from typing import Any, Dict, List, Optional
import uuid
import fitz
from PIL import Image
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.config import settings
from backend.app.database import init_db
from backend.app.db.session import get_session
from backend.app.db.base import get_iso_now
from backend.app.db.models import Exam, Batch, Branch, Submission, Answer, AnswerRegion
from sqlalchemy import select, delete
from backend.app.services.auth import create_access_token
from backend.app.services.retention_service import RetentionService
from backend.app.services.grading_service import GradingService, _export_dirty, _export_dirty_lock
from backend.app.services.storage import (
    StorageService,
    LocalStorageService,
    CloudinaryStorageService,
    build_remote_redirect_response,
)
import backend.app.routers.storage as storage_router
import backend.app.routers.exams as exams_router
import backend.app.routers.grading as grading_router
import backend.app.routers.exports as exports_router
import backend.app.services.grading_service as grading_service_mod
import backend.app.services.export_service as export_service_mod
import backend.app.services.pdf_service as pdf_service_mod
import backend.app.services.retention_service as retention_service_mod


class MockRemoteStorage(StorageService):
    """In-memory fake remote object storage (simulating R2/Cloudinary) that never serves bytes through backend."""

    def __init__(self, signed_urls: bool = True):
        self.objects: Dict[str, bytes] = {}
        self.signed_urls = signed_urls
        self.download_calls: List[str] = []
        self.deleted_keys: List[str] = []
        self.deleted_prefixes: List[str] = []
        self.fail_zip_upload: bool = False

    def upload_file(self, file_content: bytes | str | Path, key: str, content_type: str = "application/pdf") -> str:
        clean = key.replace("\\", "/").lstrip("/")
        if self.fail_zip_upload and clean.endswith(".zip"):
            raise RuntimeError("File size too large (10MB raw limit)")
        if isinstance(file_content, (str, Path)):
            data = Path(file_content).read_bytes()
        else:
            data = file_content
        self.objects[clean] = data
        return clean

    def download_file(self, key: str) -> bytes:
        clean = key.replace("\\", "/").lstrip("/")
        self.download_calls.append(clean)
        if clean not in self.objects:
            raise FileNotFoundError(clean)
        return self.objects[clean]

    def generate_presigned_upload_url(self, key: str, content_type: str = "application/pdf", expires_in: int = 300) -> Dict[str, Any]:
        return {"url": f"https://cdn.example.test/upload/{key}", "method": "PUT", "key": key, "is_direct_cloud": True}

    def generate_presigned_download_url(
        self,
        key: str,
        expires_in: int = 900,
        filename: Optional[str] = None,
        attachment: bool = False,
    ) -> str:
        clean = key.replace("\\", "/").lstrip("/")
        if self.signed_urls or clean.endswith((".pdf", ".zip")):
            att = "1" if attachment else "0"
            fn = f"&filename={filename}" if filename else ""
            return f"https://cdn.example.test/raw/{clean}?expires_at=9999999999&attachment={att}{fn}"
        return f"https://cdn.example.test/img/{clean}"

    def delete_file(self, key: str) -> bool:
        clean = key.replace("\\", "/").lstrip("/")
        self.deleted_keys.append(clean)
        return self.objects.pop(clean, None) is not None

    def delete_prefix(self, prefix: str) -> int:
        clean_prefix = prefix.replace("\\", "/").lstrip("/")
        self.deleted_prefixes.append(clean_prefix)
        to_del = [k for k in self.objects if k.startswith(clean_prefix)]
        for k in to_del:
            del self.objects[k]
        return len(to_del)

    def file_exists(self, key: str) -> bool:
        clean = key.replace("\\", "/").lstrip("/")
        return clean in self.objects

    def get_local_path_or_download(self, key: str) -> Path:
        raise AssertionError(f"get_local_path_or_download should not be called when offloading {key}")


def _make_pdf_bytes(text: str) -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=400, height=600)
    page.insert_text((40, 60), text, fontsize=14)
    data = doc.tobytes()
    doc.close()
    return data


def _make_png_bytes(tmp_path: Path, name: str = "sample.png") -> bytes:
    p = tmp_path / name
    img = Image.new("RGB", (120, 80), color=(240, 240, 240))
    img.save(p, format="PNG")
    return p.read_bytes()


def _patch_storage(monkeypatch, mock_storage: StorageService):
    for mod in (
        storage_router,
        exams_router,
        grading_router,
        exports_router,
        grading_service_mod,
        export_service_mod,
        pdf_service_mod,
        retention_service_mod,
    ):
        if hasattr(mod, "get_storage_service"):
            monkeypatch.setattr(mod, "get_storage_service", lambda: mock_storage)


def _admin_headers() -> Dict[str, str]:
    token = create_access_token({"sub": "usr_test_offload", "role": "ROOT_ADMIN", "email": "admin@papergrade.ai"})
    return {"Authorization": f"Bearer {token}"}


def test_cloudinary_resource_types_and_signed_download_url(monkeypatch):
    monkeypatch.setattr(settings, "CLOUDINARY_URL", "")
    monkeypatch.setattr(settings, "CLOUDINARY_CLOUD_NAME", "demo")
    monkeypatch.setattr(settings, "CLOUDINARY_API_KEY", "123456")
    monkeypatch.setattr(settings, "CLOUDINARY_API_SECRET", "secret_key")

    svc = CloudinaryStorageService()
    assert svc._resource_type("exams/e1/question_paper.pdf") == "raw"
    assert svc._resource_type("exports/batch_1_graded_pdfs.zip") == "raw"
    assert svc._resource_type("renders/sub_1/page_1.png") == "image"

    pdf_url = svc.generate_presigned_download_url(
        "exports/sub_1_annotated.pdf", expires_in=900, filename="graded.pdf", attachment=True
    )
    assert "expires_at=" in pdf_url
    assert "attachment=1" in pdf_url

    zip_url = svc.generate_presigned_download_url(
        "exports/batch_1_graded_pdfs.zip", expires_in=900, filename="Batch.zip", attachment=True
    )
    assert "raw/download" in zip_url
    assert "attachment=1" in zip_url

    img_url = svc.generate_presigned_download_url("renders/sub_1/page_1.png")
    assert "res.cloudinary.com" in img_url


def test_build_remote_redirect_response_respects_signed_urls(tmp_path):
    local = LocalStorageService(base_dir=tmp_path)
    assert build_remote_redirect_response(local, "foo/bar.pdf") is None

    remote_signed = MockRemoteStorage(signed_urls=True)
    resp_signed = build_remote_redirect_response(remote_signed, "renders/s1/crop.png", cache_buster="v123")
    assert resp_signed is not None
    assert resp_signed.status_code == 307
    assert "renders/s1/crop.png" in resp_signed.headers["location"]

    remote_unsigned = MockRemoteStorage(signed_urls=False)
    resp_img = build_remote_redirect_response(remote_unsigned, "renders/s1/crop.png", cache_buster="v123")
    assert resp_img is not None
    assert resp_img.status_code == 307
    assert resp_img.headers["location"] == "https://cdn.example.test/img/renders/s1/crop.png?v=v123"


def test_all_endpoints_offload_to_remote_storage_without_proxying(monkeypatch, tmp_path):
    init_db()
    client = TestClient(app)
    headers = _admin_headers()
    mock_storage = MockRemoteStorage(signed_urls=False)
    _patch_storage(monkeypatch, mock_storage)

    uid = uuid.uuid4().hex[:8]
    exam_id = f"exam_off_{uid}"
    batch_id = f"batch_off_{uid}"
    sub_id = f"sub_off_{uid}"
    ans_id = f"ans_off_{uid}"
    reg_id = f"reg_off_{uid}"
    now = get_iso_now()

    pdf_bytes = _make_pdf_bytes("Offload Test Document")
    png_bytes = _make_png_bytes(tmp_path)

    # Seed remote object storage entries directly (nothing on local disk!)
    mock_storage.upload_file(pdf_bytes, f"exams/{exam_id}/question_paper.pdf", "application/pdf")
    mock_storage.upload_file(pdf_bytes, f"exams/{exam_id}/answer_key.pdf", "application/pdf")
    mock_storage.upload_file(png_bytes, f"renders/exam_{exam_id}_question-paper/page_1.png", "image/png")
    mock_storage.upload_file(png_bytes, f"renders/{sub_id}/page_1.png", "image/png")
    mock_storage.upload_file(png_bytes, f"renders/{sub_id}/crops/crop_{ans_id}_{reg_id}.png", "image/png")
    mock_storage.upload_file(pdf_bytes, f"exports/{sub_id}_annotated.pdf", "application/pdf")

    with get_session() as session:
        branch_id = session.scalar(select(Branch.id).limit(1))
        assert branch_id is not None

        session.add(Exam(
            id=exam_id,
            title="Offload Physics",
            subject="Physics",
            branch_id=branch_id,
            question_paper_path=f"exams/{exam_id}/question_paper.pdf",
            answer_key_path=f"exams/{exam_id}/answer_key.pdf",
            is_published=1,
            created_at=now,
            updated_at=now,
        ))
        session.add(Batch(
            id=batch_id,
            name="Offload Batch",
            branch_id=branch_id,
            exam_id=exam_id,
            created_at=now,
            updated_at=now,
        ))
        session.add(Submission(
            id=sub_id,
            exam_id=exam_id,
            batch_id=batch_id,
            student_name="Test Student",
            roll_number="ROLL-OFF-1",
            original_file_path=f"submissions/{sub_id}/original.pdf",
            canonical_pdf_path=f"submissions/{sub_id}/canonical.pdf",
            annotated_pdf_path=f"exports/{sub_id}_annotated.pdf",
            status="COMPLETED",
            submission_status="SUBMITTED",
            publication_status="PUBLISHED",
            total_awarded_marks=8.0,
            max_marks=10.0,
            percentage=80.0,
            created_at=now,
            updated_at=now,
        ))
        session.add(Answer(
            id=ans_id,
            submission_id=sub_id,
            question_id="Q1",
            max_marks=10.0,
            awarded_marks=8.0,
            page_number=1,
            created_at=now,
            updated_at=now,
        ))
        session.add(AnswerRegion(
            id=reg_id,
            answer_id=ans_id,
            page_number=1,
            x=0.1,
            y=0.1,
            width=0.5,
            height=0.3,
        ))
        session.commit()

    try:
        # 1. /api/v1/storage/download -> 307 redirect
        r = client.get(f"/api/v1/storage/download?key=exams/{exam_id}/question_paper.pdf", headers=headers, follow_redirects=False)
        assert r.status_code == 307
        assert "cdn.example.test/raw/" in r.headers["location"]

        # 2. /api/v1/exams/{exam_id}/question-paper & answer-key -> 307 redirect without download
        r = client.get(f"/api/v1/exams/{exam_id}/question-paper?download=1", headers=headers, follow_redirects=False)
        assert r.status_code == 307
        assert "attachment=1" in r.headers["location"]

        r = client.get(f"/api/v1/exams/{exam_id}/answer-key", headers=headers, follow_redirects=False)
        assert r.status_code == 307
        assert "attachment=0" in r.headers["location"]

        # 3. /api/v1/exams/{exam_id}/question-paper/pages/1 -> 307 CDN image redirect
        r = client.get(f"/api/v1/exams/{exam_id}/question-paper/pages/1", headers=headers, follow_redirects=False)
        assert r.status_code == 307
        assert r.headers["location"] == f"https://cdn.example.test/img/renders/exam_{exam_id}_question-paper/page_1.png"

        # 4. /api/grading/page-image & /api/grading/crop -> 307 CDN image redirect
        r = client.get(f"/api/grading/page-image/{sub_id}/1", headers=headers, follow_redirects=False)
        assert r.status_code == 307
        assert r.headers["location"] == f"https://cdn.example.test/img/renders/{sub_id}/page_1.png"

        r = client.get(f"/api/grading/crop/{sub_id}/{ans_id}?region_id={reg_id}&v=42", headers=headers, follow_redirects=False)
        assert r.status_code == 307
        assert r.headers["location"] == f"https://cdn.example.test/img/renders/{sub_id}/crops/crop_{ans_id}_{reg_id}.png?v=42"

        # 5. /api/exports/pdf/{sub_id} -> 307 attachment redirect
        r = client.get(f"/api/exports/pdf/{sub_id}/Custom_Graded.pdf", headers=headers, follow_redirects=False)
        assert r.status_code == 307
        assert "attachment=1" in r.headers["location"]
        assert "filename=Custom_Graded.pdf" in r.headers["location"]

        # Verify zero backend byte downloads occurred across all 7 requests!
        assert mock_storage.download_calls == []

        # 6. /api/exports/batch-zip -> downloads individual annotated PDF to assemble ZIP, then offloads ZIP via 307
        zip_local_pdf = tmp_path / f"{sub_id}_cached.pdf"
        zip_local_pdf.write_bytes(pdf_bytes)
        monkeypatch.setattr(mock_storage, "get_local_path_or_download", lambda k: zip_local_pdf)

        r = client.get(f"/api/exports/batch-zip/{batch_id}", headers=headers, follow_redirects=False)
        assert r.status_code == 307
        assert f"exports/batch_{batch_id}_graded_pdfs.zip" in r.headers["location"]

        local_zip = settings.EXPORTS_DIR / f"batch_{batch_id}_graded_pdfs.zip"
        if local_zip.exists():
            local_zip.unlink()

        # 7. Graceful fallback when remote ZIP upload fails (e.g. >10MB raw limit on Cloudinary)
        mock_storage.fail_zip_upload = True
        r = client.get(f"/api/exports/batch-zip/{batch_id}", headers=headers, follow_redirects=False)
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/zip"

        if local_zip.exists():
            local_zip.unlink()

        # 8. Retention purge cleans up remote renders/ prefixes as well as PDFs
        RetentionService.purge_submission_documents(sub_id)
        assert f"renders/{sub_id}/" in mock_storage.deleted_prefixes
        assert f"exports/{sub_id}_annotated.pdf" in mock_storage.deleted_keys

        RetentionService.purge_exam_documents(exam_id)
        assert f"renders/exam_{exam_id}_" in mock_storage.deleted_prefixes
    finally:
        with get_session() as session:
            session.execute(delete(AnswerRegion).where(AnswerRegion.answer_id == ans_id))
            session.execute(delete(Answer).where(Answer.id == ans_id))
            session.execute(delete(Submission).where(Submission.id == sub_id))
            session.execute(delete(Batch).where(Batch.id == batch_id))
            session.execute(delete(Exam).where(Exam.id == exam_id))
            session.commit()

