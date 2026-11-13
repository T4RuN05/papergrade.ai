import os
import time
import shutil
import logging
import urllib.parse
import urllib.request
import urllib.error
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Dict, Any, Optional
import mimetypes
from fastapi.responses import RedirectResponse

from backend.app.config import settings

logger = logging.getLogger(__name__)

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
    def generate_presigned_download_url(
        self,
        key: str,
        expires_in: int = 900,
        filename: Optional[str] = None,
        attachment: bool = False,
    ) -> str:
        """Generate a time-limited pre-signed GET URL for downloading private assets."""
        pass

    @abstractmethod
    def delete_file(self, key: str) -> bool:
        """Delete an object by key."""
        pass

    def delete_prefix(self, prefix: str) -> int:
        """Delete all objects under a storage key prefix. Returns number deleted where known."""
        return 0

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

    def generate_presigned_download_url(
        self,
        key: str,
        expires_in: int = 900,
        filename: Optional[str] = None,
        attachment: bool = False,
    ) -> str:
        # For local development, point to the local backend proxy download route
        return f"/api/v1/storage/download?key={key}"

    def delete_file(self, key: str) -> bool:
        file_path = self._resolve_path(key)
        if file_path.exists():
            file_path.unlink()
            return True
        return False

    def delete_prefix(self, prefix: str) -> int:
        clean_prefix = prefix.replace("\\", "/").lstrip("/").rstrip("/")
        if not clean_prefix:
            return 0
        target = self._resolve_path(clean_prefix)
        deleted = 0
        if target.exists() and target.is_dir():
            shutil.rmtree(target, ignore_errors=True)
            deleted += 1
        elif target.parent.exists() and target.parent.is_dir():
            name_prefix = target.name
            for entry in target.parent.iterdir():
                if entry.name.startswith(name_prefix):
                    if entry.is_dir():
                        shutil.rmtree(entry, ignore_errors=True)
                    else:
                        entry.unlink(missing_ok=True)
                    deleted += 1
        return deleted

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

    def generate_presigned_download_url(
        self,
        key: str,
        expires_in: int = 900,
        filename: Optional[str] = None,
        attachment: bool = False,
    ) -> str:
        clean_key = key.replace("\\", "/").lstrip("/")
        if settings.R2_PUBLIC_URL and not attachment:
            # Custom public domain if configured (inline viewing / CDN assets)
            return f"{settings.R2_PUBLIC_URL.rstrip('/')}/{clean_key}"

        params: Dict[str, Any] = {"Bucket": self.bucket_name, "Key": clean_key}
        if attachment or filename:
            disp = "attachment" if attachment else "inline"
            safe_fn = filename or Path(clean_key).name or "download"
            params["ResponseContentDisposition"] = f'{disp}; filename="{safe_fn}"'

        return self.s3_client.generate_presigned_url(
            ClientMethod="get_object",
            Params=params,
            ExpiresIn=expires_in,
        )

    def delete_file(self, key: str) -> bool:
        clean_key = key.replace("\\", "/").lstrip("/")
        try:
            self.s3_client.delete_object(Bucket=self.bucket_name, Key=clean_key)
            return True
        except Exception:
            return False

    def delete_prefix(self, prefix: str) -> int:
        clean_prefix = prefix.replace("\\", "/").lstrip("/")
        if not clean_prefix:
            return 0
        deleted = 0
        try:
            paginator = self.s3_client.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=self.bucket_name, Prefix=clean_prefix):
                objs = [{"Key": obj["Key"]} for obj in page.get("Contents", [])]
                if objs:
                    self.s3_client.delete_objects(
                        Bucket=self.bucket_name,
                        Delete={"Objects": objs, "Quiet": True},
                    )
                    deleted += len(objs)
        except Exception as exc:
            logger.warning("R2 delete_prefix failed for %s: %s", clean_prefix, exc)
        return deleted

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

        cfg = settings.parsed_cloudinary_config
        if settings.CLOUDINARY_URL:
            os.environ["CLOUDINARY_URL"] = settings.CLOUDINARY_URL

        cloudinary.reset_config()
        cloudinary.config(
            cloud_name=cfg.get("cloud_name") or settings.CLOUDINARY_CLOUD_NAME,
            api_key=cfg.get("api_key") or settings.CLOUDINARY_API_KEY,
            api_secret=cfg.get("api_secret") or settings.CLOUDINARY_API_SECRET,
            secure=True,
        )

        self.cache_dir = settings.DATA_DIR / "cloudinary_cache"
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def _clean_public_id(self, key: str) -> str:
        k = str(key).replace("\\", "/").strip().lstrip("/")
        # If absolute path or contains marker folders, extract relative storage key
        for marker in ["/exams/", "/submissions/", "/uploads/", "/data/"]:
            if marker in k:
                k = k[k.index(marker) + len(marker):]
                break
        # Strip Windows drive letters (e.g. C:/...)
        if len(k) > 1 and k[1] == ":":
            k = k[2:].lstrip("/")
        return k

    def _cloudinary_public_id(self, clean_key: str, res_type: str) -> str:
        """For image assets in Cloudinary, public_id should not contain the extension."""
        if res_type == "image":
            for ext in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"):
                if clean_key.lower().endswith(ext):
                    return clean_key[:-len(ext)]
        return clean_key

    @staticmethod
    def _resource_type(clean_key: str, content_type: str = "") -> str:
        lower_key = clean_key.lower()
        lower_ct = (content_type or "").lower()
        if lower_key.endswith((".pdf", ".zip", ".csv", ".json")) or any(
            t in lower_ct for t in ("pdf", "zip", "csv", "octet-stream")
        ):
            return "raw"
        return "image"

    def upload_file(self, file_content: bytes | str | Path, key: str, content_type: str = "application/pdf") -> str:
        import cloudinary.uploader
        clean_key = self._clean_public_id(key)
        res_type = self._resource_type(clean_key, content_type)
        pub_id = self._cloudinary_public_id(clean_key, res_type)

        if isinstance(file_content, (str, Path)):
            src = str(file_content)
            cloudinary.uploader.upload(
                src,
                public_id=pub_id,
                resource_type=res_type,
                overwrite=True,
                invalidate=True,
            )
        else:
            import io
            cloudinary.uploader.upload(
                io.BytesIO(file_content),
                public_id=pub_id,
                resource_type=res_type,
                overwrite=True,
                invalidate=True,
            )

        # Cache locally
        cached_path = self.cache_dir / clean_key
        cached_path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(file_content, (str, Path)):
            src_path = Path(file_content).resolve()
            if src_path != cached_path.resolve():
                with open(src_path, "rb") as f_src, open(cached_path, "wb") as f_dst:
                    f_dst.write(f_src.read())
        else:
            with open(cached_path, "wb") as f_dst:
                f_dst.write(file_content)

        return clean_key

    def download_file(self, key: str) -> bytes:
        clean_key = self._clean_public_id(key)
        cached_path = self.cache_dir / clean_key
        if cached_path.exists() and cached_path.stat().st_size > 0:
            with open(cached_path, "rb") as f:
                return f.read()

        import cloudinary.utils

        res_type = self._resource_type(clean_key)
        if res_type == "raw":
            ext = clean_key.rsplit(".", 1)[1] if "." in clean_key else "pdf"
            url = cloudinary.utils.private_download_url(
                clean_key,
                ext,
                resource_type="raw",
                type="upload",
                expires_at=int(time.time()) + 300,
            )
        else:
            pub_id = self._cloudinary_public_id(clean_key, res_type)
            fmt = clean_key.rsplit(".", 1)[1].lower() if "." in clean_key else None
            url, _ = cloudinary.utils.cloudinary_url(pub_id, format=fmt, resource_type="image", secure=True)

        req = urllib.request.Request(url, headers={"User-Agent": "PaperGrade-AI/1.0"})
        with urllib.request.urlopen(req) as resp:
            data = resp.read()

        if data:
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

    def generate_presigned_download_url(
        self,
        key: str,
        expires_in: int = 900,
        filename: Optional[str] = None,
        attachment: bool = False,
    ) -> str:
        import cloudinary.utils
        clean_key = self._clean_public_id(key)
        res_type = self._resource_type(clean_key)
        if res_type == "raw":
            ext = clean_key.rsplit(".", 1)[1] if "." in clean_key else "pdf"
            return cloudinary.utils.private_download_url(
                clean_key,
                ext,
                resource_type="raw",
                type="upload",
                expires_at=int(time.time()) + max(60, expires_in),
                attachment=attachment,
            )
        url_opts: Dict[str, Any] = {"resource_type": "image", "secure": True}
        if attachment:
            safe_stem = Path(filename).stem if filename else ""
            url_opts["flags"] = f"attachment:{safe_stem}" if safe_stem else "attachment"
        pub_id = self._cloudinary_public_id(clean_key, res_type)
        fmt = clean_key.rsplit(".", 1)[1].lower() if "." in clean_key else None
        if fmt:
            url_opts["format"] = fmt
        url, _ = cloudinary.utils.cloudinary_url(pub_id, **url_opts)
        if "/image/upload/v1/" in url:
            url = url.replace("/image/upload/v1/", "/image/upload/")
        return url

    def delete_file(self, key: str) -> bool:
        import cloudinary.uploader
        clean_key = self._clean_public_id(key)
        res_type = self._resource_type(clean_key)
        pub_id = self._cloudinary_public_id(clean_key, res_type)
        try:
            cloudinary.uploader.destroy(pub_id, resource_type=res_type, invalidate=True)
            if pub_id != clean_key:
                try:
                    cloudinary.uploader.destroy(clean_key, resource_type=res_type, invalidate=True)
                except Exception:
                    pass
            cached_path = self.cache_dir / clean_key
            if cached_path.exists():
                cached_path.unlink()
            return True
        except Exception:
            return False

    def delete_prefix(self, prefix: str) -> int:
        import cloudinary.api
        clean_prefix = self._clean_public_id(prefix).rstrip("/")
        if not clean_prefix:
            return 0
        deleted = 0
        for res_type in ("image", "raw"):
            try:
                res = cloudinary.api.delete_resources_by_prefix(clean_prefix, resource_type=res_type, invalidate=True)
                deleted += len(res.get("deleted", {}))
            except Exception:
                pass
        cached_target = self.cache_dir / clean_prefix
        if cached_target.exists():
            if cached_target.is_dir():
                shutil.rmtree(cached_target, ignore_errors=True)
            else:
                cached_target.unlink(missing_ok=True)
        return deleted

    def file_exists(self, key: str) -> bool:
        clean_key = self._clean_public_id(key)
        res_type = self._resource_type(clean_key)

        # 1. Fast HTTP HEAD probe for images (CDN endpoint)
        if res_type == "image":
            try:
                import cloudinary.utils
                pub_id = self._cloudinary_public_id(clean_key, res_type)
                fmt = clean_key.rsplit(".", 1)[1].lower() if "." in clean_key else None
                cdn_url, _ = cloudinary.utils.cloudinary_url(pub_id, format=fmt, resource_type="image", secure=True)
                if "/image/upload/v1/" in cdn_url:
                    cdn_url = cdn_url.replace("/image/upload/v1/", "/image/upload/")
                req = urllib.request.Request(cdn_url, method="HEAD", headers={"User-Agent": "PaperGrade-AI/1.0"})
                with urllib.request.urlopen(req, timeout=3) as resp:
                    if 200 <= resp.status < 300:
                        return True
            except urllib.error.HTTPError as http_err:
                if http_err.code == 404:
                    return False
            except Exception:
                pass

        # 2. Fast HTTP HEAD probe for raw files (e.g. PDFs)
        if res_type == "raw":
            try:
                import cloudinary.utils
                ext = clean_key.rsplit(".", 1)[1] if "." in clean_key else "pdf"
                raw_url = cloudinary.utils.private_download_url(
                    clean_key,
                    ext,
                    resource_type="raw",
                    type="upload",
                    expires_at=int(time.time()) + 120,
                )
                req = urllib.request.Request(raw_url, method="HEAD", headers={"User-Agent": "PaperGrade-AI/1.0"})
                with urllib.request.urlopen(req, timeout=3) as resp:
                    if 200 <= resp.status < 300:
                        return True
            except urllib.error.HTTPError as http_err:
                if http_err.code == 404:
                    return False
            except Exception:
                pass

        # 3. Fallback to Admin API only if network/HEAD probe didn't resolve and not a 404
        try:
            import cloudinary.api
            pub_id = self._cloudinary_public_id(clean_key, res_type)
            cloudinary.api.resource(pub_id, resource_type=res_type)
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
        cfg = settings.parsed_cloudinary_config
        has_cloudinary = bool(
            cfg.get("cloud_name") and cfg.get("api_key") and cfg.get("api_secret")
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


def is_remote_storage(storage: Optional[StorageService] = None) -> bool:
    """Return True when active object storage is remote (R2 / Cloudinary), not local disk."""
    svc = storage or get_storage_service()
    return not isinstance(svc, LocalStorageService)


def sync_file_to_remote_storage(
    local_path: Path,
    key: str,
    content_type: str = "application/octet-stream",
    storage: Optional[StorageService] = None,
) -> bool:
    """Upload a local file to remote object storage if a remote backend is configured."""
    svc = storage or get_storage_service()
    if not is_remote_storage(svc) or not local_path or not local_path.exists():
        return False
    try:
        svc.upload_file(local_path, key, content_type=content_type)
        return True
    except Exception as exc:
        logger.warning("Remote storage sync failed for key '%s': %s", key, exc)
        return False


def build_remote_redirect_response(
    storage: StorageService,
    key: str,
    *,
    filename: Optional[str] = None,
    attachment: bool = False,
    cache_buster: Optional[str] = None,
    headers: Optional[Dict[str, str]] = None,
    expires_in: int = 900,
) -> Optional[RedirectResponse]:
    """Build a 307 RedirectResponse to object storage when storage generates an http(s) URL."""
    if not is_remote_storage(storage) or not key:
        return None
    try:
        try:
            url = storage.generate_presigned_download_url(
                key,
                expires_in=expires_in,
                filename=filename,
                attachment=attachment,
            )
        except TypeError:
            url = storage.generate_presigned_download_url(key)

        if url and (url.startswith("http://") or url.startswith("https://")):
            # Only append cache-buster on unsigned URLs so SigV4 / HMAC query signatures never break
            if cache_buster and "?" not in url:
                url = f"{url}?v={urllib.parse.quote(str(cache_buster))}"
            return RedirectResponse(url=url, status_code=307, headers=headers)
    except Exception as exc:
        logger.warning("Presigned redirect generation failed for key '%s': %s", key, exc)
    return None


