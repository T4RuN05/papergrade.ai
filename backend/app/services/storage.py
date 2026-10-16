import os
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Dict, Any, Optional
import mimetypes

from backend.app.config import settings

class StorageService(ABC):
    """Abstract interface for object storage (Cloudflare R2 or Local Disk)."""

    @abstractmethod
    def upload_file(self, file_content: bytes | str | Path, key: str, content_type: str = "application/pdf") -> str:
        """Upload file bytes or local file to the storage key. Returns the canonical key."""
        pass

    @abstractmethod
    def download_file(self, key: str) -> bytes:
        """Download file bytes by key."""
        pass

    @abstractmethod
    def generate_presigned_upload_url(
        self, key: str, content_type: str = "application/pdf", expires_in: int = 300
    ) -> Dict[str, Any]:
        """Generate a direct-to-storage pre-signed PUT or POST URL for client upload."""
        pass

    @abstractmethod
    def generate_presigned_download_url(self, key: str, expires_in: int = 900) -> str:
        """Generate a time-limited pre-signed GET URL for downloading private assets."""
        pass

    @abstractmethod
    def delete_file(self, key: str) -> bool:
        """Delete an object by key."""
        pass

    @abstractmethod
    def file_exists(self, key: str) -> bool:
        """Check if an object exists by key."""
        pass

    @abstractmethod
    def get_local_path_or_download(self, key: str) -> Path:
        """Returns a local Path to the file, downloading it to a cache folder if remote."""
        pass


class LocalStorageService(StorageService):
    """Local disk storage implementation for offline development and testing."""

    def __init__(self, base_dir: Optional[Path] = None):
        self.base_dir = base_dir or settings.DATA_DIR
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _resolve_path(self, key: str) -> Path:
        # Sanitize key against directory traversal
        clean_key = key.replace("\\", "/").lstrip("/")
        parts = [p for p in clean_key.split("/") if p and p != ".."]
        return self.base_dir.joinpath(*parts)

    def upload_file(self, file_content: bytes | str | Path, key: str, content_type: str = "application/pdf") -> str:
        dest_path = self._resolve_path(key)
        dest_path.parent.mkdir(parents=True, exist_ok=True)

        if isinstance(file_content, (str, Path)):
            src_path = Path(file_content)
            with open(src_path, "rb") as f_src, open(dest_path, "wb") as f_dst:
                f_dst.write(f_src.read())
        else:
            with open(dest_path, "wb") as f_dst:
                f_dst.write(file_content)

        return key

    def download_file(self, key: str) -> bytes:
        file_path = self._resolve_path(key)
        if not file_path.exists():
            raise FileNotFoundError(f"File key '{key}' not found at {file_path}")
        with open(file_path, "rb") as f:
            return f.read()

    def generate_presigned_upload_url(
        self, key: str, content_type: str = "application/pdf", expires_in: int = 300
    ) -> Dict[str, Any]:
        # For local development, point to the local backend proxy upload route
        endpoint = f"/api/v1/storage/upload?key={key}"
        return {
            "url": endpoint,
            "method": "PUT",
            "key": key,
            "headers": {"Content-Type": content_type},
            "expires_in": expires_in,
            "is_direct_cloud": False,
        }

    def generate_presigned_download_url(self, key: str, expires_in: int = 900) -> str:
        # For local development, point to the local backend proxy download route
        return f"/api/v1/storage/download?key={key}"

    def delete_file(self, key: str) -> bool:
        file_path = self._resolve_path(key)
        if file_path.exists():
            file_path.unlink()
            return True
        return False

    def file_exists(self, key: str) -> bool:
        return self._resolve_path(key).exists()

    def get_local_path_or_download(self, key: str) -> Path:
        return self._resolve_path(key)


class CloudflareR2StorageService(StorageService):
    """Cloudflare R2 Object Storage implementation using S3 API (Zero Egress Cost)."""

    def __init__(self):
        import boto3
        from botocore.config import Config

        self.bucket_name = settings.R2_BUCKET_NAME
        self.account_id = settings.R2_ACCOUNT_ID
        self.endpoint_url = f"https://{self.account_id}.r2.cloudflarestorage.com"

        self.s3_client = boto3.client(
            service_name="s3",
            endpoint_url=self.endpoint_url,
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            region_name="auto",
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )

        self.cache_dir = settings.DATA_DIR / "r2_cache"
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def upload_file(self, file_content: bytes | str | Path, key: str, content_type: str = "application/pdf") -> str:
        clean_key = key.replace("\\", "/").lstrip("/")

        if isinstance(file_content, (str, Path)):
            with open(file_content, "rb") as f:
                data = f.read()
        else:
            data = file_content

        self.s3_client.put_object(
            Bucket=self.bucket_name,
            Key=clean_key,
            Body=data,
            ContentType=content_type,
        )
        return clean_key

    def download_file(self, key: str) -> bytes:
        clean_key = key.replace("\\", "/").lstrip("/")
        response = self.s3_client.get_object(Bucket=self.bucket_name, Key=clean_key)
        return response["Body"].read()

    def generate_presigned_upload_url(
        self, key: str, content_type: str = "application/pdf", expires_in: int = 300
    ) -> Dict[str, Any]:
        clean_key = key.replace("\\", "/").lstrip("/")
        url = self.s3_client.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": self.bucket_name,
                "Key": clean_key,
                "ContentType": content_type,
            },
            ExpiresIn=expires_in,
        )
        return {
            "url": url,
            "method": "PUT",
            "key": clean_key,
            "headers": {"Content-Type": content_type},
            "expires_in": expires_in,
            "is_direct_cloud": True,
        }

    def generate_presigned_download_url(self, key: str, expires_in: int = 900) -> str:
        clean_key = key.replace("\\", "/").lstrip("/")
        if settings.R2_PUBLIC_URL:
            # Custom public domain if configured
            return f"{settings.R2_PUBLIC_URL.rstrip('/')}/{clean_key}"

        return self.s3_client.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": self.bucket_name, "Key": clean_key},
            ExpiresIn=expires_in,
        )

    def delete_file(self, key: str) -> bool:
        clean_key = key.replace("\\", "/").lstrip("/")
        try:
            self.s3_client.delete_object(Bucket=self.bucket_name, Key=clean_key)
            return True
        except Exception:
            return False

    def file_exists(self, key: str) -> bool:
        clean_key = key.replace("\\", "/").lstrip("/")
        try:
            self.s3_client.head_object(Bucket=self.bucket_name, Key=clean_key)
            return True
        except Exception:
            return False

    def get_local_path_or_download(self, key: str) -> Path:
        clean_key = key.replace("\\", "/").lstrip("/")
        cached_path = self.cache_dir / clean_key
        if not cached_path.exists():
            cached_path.parent.mkdir(parents=True, exist_ok=True)
            data = self.download_file(clean_key)
            with open(cached_path, "wb") as f:
                f.write(data)
        return cached_path


class CloudinaryStorageService(StorageService):
    """Cloudinary Object Storage implementation for PDFs, Answer Sheets, and Page Renders."""

    def __init__(self):
        import cloudinary
        import cloudinary.uploader
        import cloudinary.api

        if settings.CLOUDINARY_URL:
            cloudinary.config(cloudinary_url=settings.CLOUDINARY_URL)
        else:
            cloudinary.config(
                cloud_name=settings.CLOUDINARY_CLOUD_NAME,
                api_key=settings.CLOUDINARY_API_KEY,
                api_secret=settings.CLOUDINARY_API_SECRET,
                secure=True,
            )

        self.cache_dir = settings.DATA_DIR / "cloudinary_cache"
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def _clean_public_id(self, key: str) -> str:
        return key.replace("\\", "/").lstrip("/")

    def upload_file(self, file_content: bytes | str | Path, key: str, content_type: str = "application/pdf") -> str:
        import cloudinary.uploader
        clean_key = self._clean_public_id(key)
        res_type = "raw" if (clean_key.endswith(".pdf") or "pdf" in content_type) else "auto"

        if isinstance(file_content, (str, Path)):
            src = str(file_content)
            cloudinary.uploader.upload(
                src,
                public_id=clean_key,
                resource_type=res_type,
                overwrite=True,
            )
        else:
            import io
            cloudinary.uploader.upload(
                io.BytesIO(file_content),
                public_id=clean_key,
                resource_type=res_type,
                overwrite=True,
            )

        # Cache locally
        cached_path = self.cache_dir / clean_key
        cached_path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(file_content, (str, Path)):
            with open(file_content, "rb") as f_src, open(cached_path, "wb") as f_dst:
                f_dst.write(f_src.read())
        else:
            with open(cached_path, "wb") as f_dst:
                f_dst.write(file_content)

        return clean_key

    def download_file(self, key: str) -> bytes:
        clean_key = self._clean_public_id(key)
        cached_path = self.cache_dir / clean_key
        if cached_path.exists():
            with open(cached_path, "rb") as f:
                return f.read()

        import urllib.request
        import cloudinary.utils

        res_type = "raw" if clean_key.endswith(".pdf") else "image"
        url, _ = cloudinary.utils.cloudinary_url(clean_key, resource_type=res_type, secure=True)

        req = urllib.request.Request(url, headers={"User-Agent": "PaperGrade-AI/1.0"})
        with urllib.request.urlopen(req) as resp:
            data = resp.read()

        cached_path.parent.mkdir(parents=True, exist_ok=True)
        with open(cached_path, "wb") as f:
            f.write(data)
        return data

    def generate_presigned_upload_url(
        self, key: str, content_type: str = "application/pdf", expires_in: int = 300
    ) -> Dict[str, Any]:
        endpoint = f"/api/v1/storage/upload?key={key}"
        return {
            "url": endpoint,
            "method": "PUT",
            "key": key,
            "headers": {"Content-Type": content_type},
            "expires_in": expires_in,
            "is_direct_cloud": False,
        }

    def generate_presigned_download_url(self, key: str, expires_in: int = 900) -> str:
        import cloudinary.utils
        clean_key = self._clean_public_id(key)
        res_type = "raw" if clean_key.endswith(".pdf") else "image"
        url, _ = cloudinary.utils.cloudinary_url(clean_key, resource_type=res_type, secure=True)
        return url

    def delete_file(self, key: str) -> bool:
        import cloudinary.uploader
        clean_key = self._clean_public_id(key)
        res_type = "raw" if clean_key.endswith(".pdf") else "image"
        try:
            cloudinary.uploader.destroy(clean_key, resource_type=res_type)
            cached_path = self.cache_dir / clean_key
            if cached_path.exists():
                cached_path.unlink()
            return True
        except Exception:
            return False

    def file_exists(self, key: str) -> bool:
        clean_key = self._clean_public_id(key)
        cached_path = self.cache_dir / clean_key
        if cached_path.exists():
            return True
        try:
            import cloudinary.api
            res_type = "raw" if clean_key.endswith(".pdf") else "image"
            cloudinary.api.resource(clean_key, resource_type=res_type)
            return True
        except Exception:
            return False

    def get_local_path_or_download(self, key: str) -> Path:
        clean_key = self._clean_public_id(key)
        cached_path = self.cache_dir / clean_key
        if not cached_path.exists():
            self.download_file(clean_key)
        return cached_path


# Global Singleton Storage Instance
_storage_instance: Optional[StorageService] = None

def get_storage_service() -> StorageService:
    global _storage_instance
    if _storage_instance is None:
        backend = settings.STORAGE_BACKEND.lower()
        has_cloudinary = bool(
            (settings.CLOUDINARY_URL and "<your_api_key>" not in settings.CLOUDINARY_URL and "<api_key>" not in settings.CLOUDINARY_URL)
            or (settings.CLOUDINARY_API_KEY and settings.CLOUDINARY_API_KEY.strip() and settings.CLOUDINARY_API_SECRET)
        )
        if (backend == "cloudinary" and has_cloudinary) or (backend == "auto" and has_cloudinary):
            _storage_instance = CloudinaryStorageService()
        elif backend == "r2" or (
            backend == "auto"
            and settings.R2_ACCOUNT_ID
            and settings.R2_ACCESS_KEY_ID
            and settings.R2_SECRET_ACCESS_KEY
        ):
            _storage_instance = CloudflareR2StorageService()
        else:
            _storage_instance = LocalStorageService()
    return _storage_instance

