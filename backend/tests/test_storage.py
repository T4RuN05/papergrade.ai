import pytest
from pathlib import Path
from backend.app.services.storage import LocalStorageService, get_storage_service

def test_local_storage_lifecycle(tmp_path):
    storage = LocalStorageService(base_dir=tmp_path)
    
    # 1. Upload bytes
    test_key = "exams/exam-123/question_paper.pdf"
    content = b"%PDF-1.4 test dummy content"
    returned_key = storage.upload_file(content, test_key)
    assert returned_key == test_key
    assert storage.file_exists(test_key)
    
    # 2. Download bytes
    downloaded = storage.download_file(test_key)
    assert downloaded == content
    
    # 3. Presigned URLs
    presigned_upload = storage.generate_presigned_upload_url("submissions/sub-1/paper.pdf")
    assert "url" in presigned_upload
    assert presigned_upload["method"] == "PUT"
    assert "sub-1/paper.pdf" in presigned_upload["url"]
    
    presigned_download = storage.generate_presigned_download_url(test_key)
    assert "download" in presigned_download
    assert test_key in presigned_download
    
    # 4. Path traversal protection
    traversal_key = "../../secret.txt"
    storage.upload_file(b"safe", traversal_key)
    assert not (tmp_path.parent / "secret.txt").exists()
    assert (tmp_path / "secret.txt").exists()
    
    # 5. Delete file
    assert storage.delete_file(test_key) is True
    assert storage.file_exists(test_key) is False

def test_storage_service_factory():
    service = get_storage_service()
    assert service is not None
