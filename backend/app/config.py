import os
from pathlib import Path
from dotenv import load_dotenv

# Locate project root and load .env if present
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(ROOT_DIR / ".env")
load_dotenv()  # fallback to current working directory

class Settings:
    APP_NAME: str = "PaperGrade AI"
    APP_VERSION: str = "1.0.0-phase1-poc"
    DEBUG: bool = os.getenv("DEBUG", "false").lower() in ("true", "1", "yes")
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "https://papergrade-ai.vercel.app").strip()

    # Gemini API settings (Single-Pass Flash-Only Architecture: 3.8 -> 3.6 -> 3.5)
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.8-flash").strip()
    GEMINI_FALLBACK_MODEL_1: str = os.getenv("GEMINI_FALLBACK_MODEL_1", "gemini-3.6-flash").strip()
    GEMINI_FALLBACK_MODEL_2: str = os.getenv("GEMINI_FALLBACK_MODEL_2", "gemini-3.5-flash").strip()
    GEMINI_FALLBACK_MODEL: str = os.getenv("GEMINI_FALLBACK_MODEL", "gemini-3.6-flash").strip()
    GEMINI_REEVAL_MODEL: str = os.getenv("GEMINI_REEVAL_MODEL", "gemini-3.5-flash-lite").strip()
    GEMINI_REEVAL_FALLBACK: str = os.getenv("GEMINI_REEVAL_FALLBACK", "gemini-3.5-flash").strip()
    GEMINI_THINKING_BUDGET: int = int(os.getenv("GEMINI_THINKING_BUDGET", "4096"))
    ENABLE_TWO_STAGE_PIPELINE: bool = False
    GRADING_BATCH_SIZE: int = 1
    MAX_EVALUATION_WORKERS: int = int(os.getenv("MAX_EVALUATION_WORKERS", "2"))

    # Google Cloud Vertex AI Paid Account Settings
    GCP_PROJECT_ID: str = os.getenv("GCP_PROJECT_ID", "project-fe04c36f-bda1-4c99-86b").strip()
    GCP_LOCATION: str = os.getenv("GCP_LOCATION", "us-central1").strip()
    GCP_SERVICE_ACCOUNT_EMAIL: str = os.getenv("GCP_SERVICE_ACCOUNT_EMAIL", "1040007059825-compute@developer.gserviceaccount.com").strip()
    GCP_SERVICE_ACCOUNT_PATH: Path = Path(os.getenv("GCP_SERVICE_ACCOUNT_PATH", str(Path(__file__).resolve().parent.parent / "credentials" / "gcp_service_account.json")))
    GCP_SERVICE_ACCOUNT_JSON: str = os.getenv("GCP_SERVICE_ACCOUNT_JSON", "").strip()

    # Data & Storage
    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    DATA_DIR: Path = BASE_DIR / "data"
    UPLOADS_DIR: Path = DATA_DIR / "uploads"
    RENDERS_DIR: Path = DATA_DIR / "page_renders"
    EXPORTS_DIR: Path = DATA_DIR / "exports"
    REPORTS_DIR: Path = DATA_DIR / "reports"
    # Database (Supabase PostgreSQL or local SQLite)
    _raw_db: str = (os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL") or "").strip()
    DATABASE_URL: str = _raw_db.replace("pooler.supabase.com:5432", "pooler.supabase.com:6543") if "pooler.supabase.com:5432" in _raw_db else _raw_db
    DATABASE_PATH: Path = DATA_DIR / "papergrade.db"

    # Cloudflare R2 / S3 Object Storage Settings
    STORAGE_BACKEND: str = (os.getenv("STORAGE_BACKEND") or os.getenv("STORAGE_PROVIDER") or "cloudinary").strip().lower() # "auto", "cloudinary", "r2", "local"
    R2_ACCOUNT_ID: str = os.getenv("R2_ACCOUNT_ID", "").strip()
    R2_ACCESS_KEY_ID: str = os.getenv("R2_ACCESS_KEY_ID", "").strip()
    R2_SECRET_ACCESS_KEY: str = os.getenv("R2_SECRET_ACCESS_KEY", "").strip()
    R2_BUCKET_NAME: str = os.getenv("R2_BUCKET_NAME", "papergrade-bucket").strip()
    R2_PUBLIC_URL: str = os.getenv("R2_PUBLIC_URL", "").strip() # Optional custom domain / r2.dev URL

    # Cloudinary Storage Settings (Free tier zero-billing alternative)
    CLOUDINARY_CLOUD_NAME: str = os.getenv("CLOUDINARY_CLOUD_NAME", "").strip()
    CLOUDINARY_API_KEY: str = os.getenv("CLOUDINARY_API_KEY", "").strip()
    CLOUDINARY_API_SECRET: str = os.getenv("CLOUDINARY_API_SECRET", "").strip()
    CLOUDINARY_URL: str = os.getenv("CLOUDINARY_URL", "").strip()

    # Supabase Settings
    SUPABASE_URL: str = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").strip()
    SUPABASE_KEY: str = os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "").strip()
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

    # Authentication & Security
    JWT_SECRET: str = os.getenv("JWT_SECRET", "pg_dev_jwt_secret_change_in_production").strip()
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24 * 7))) # 7 days

    # Web Push / VAPID Settings (100% Free W3C Browser Push)
    VAPID_PUBLIC_KEY: str = os.getenv("VAPID_PUBLIC_KEY", "").strip("\"' ")
    VAPID_PRIVATE_KEY: str = os.getenv("VAPID_PRIVATE_KEY", "").strip("\"' ")
    VAPID_CLAIMS_EMAIL: str = os.getenv("VAPID_CLAIMS_EMAIL", "mailto:notifications@papergrade.ai").strip("\"' ")

    # Submission & Evaluation Lifecycle Constraints
    WINDOW_DURATION_MINUTES: int = int(os.getenv("WINDOW_DURATION_MINUTES", "30"))
    GRACE_PERIOD_MINUTES: int = int(os.getenv("GRACE_PERIOD_MINUTES", "2"))
    MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "7"))
    MAX_PAGE_COUNT: int = int(os.getenv("MAX_PAGE_COUNT", "15"))
    REVALUATION_WINDOW_DAYS: int = int(os.getenv("REVALUATION_WINDOW_DAYS", "7"))
    SUBMISSION_RETENTION_DAYS: int = int(os.getenv("SUBMISSION_RETENTION_DAYS", "15"))

    # User configured AI Studio limits (defaults)
    DEFAULT_RPM_LIMIT: int = int(os.getenv("USER_RPM_LIMIT", "15"))
    DEFAULT_TPM_LIMIT: int = int(os.getenv("USER_TPM_LIMIT", "1000000"))
    DEFAULT_RPD_LIMIT: int = int(os.getenv("USER_RPD_LIMIT", "1500"))

    # Pricing table version
    PRICING_VERSION: str = "2026-03-gemini-flash"

    def ensure_directories(self):
        for directory in [self.DATA_DIR, self.UPLOADS_DIR, self.RENDERS_DIR, self.EXPORTS_DIR, self.REPORTS_DIR]:
            directory.mkdir(parents=True, exist_ok=True)

    @property
    def configured_api_keys(self) -> list[str]:
        raw_candidates: list[str] = []
        # 1. Support comma-separated list in GEMINI_API_KEYS
        csv_keys = os.getenv("GEMINI_API_KEYS", "")
        if csv_keys:
            raw_candidates.extend(csv_keys.split(","))

        # 2. Support GEMINI_API_KEY and GEMINI_API_KEY_1 .. GEMINI_API_KEY_100
        if os.getenv("GEMINI_API_KEY"):
            raw_candidates.append(os.getenv("GEMINI_API_KEY", ""))
        for i in range(1, 101):
            val = os.getenv(f"GEMINI_API_KEY_{i}", "")
            if val:
                raw_candidates.append(val)

        # Deduplicate while preserving order
        seen = set()
        valid_keys = []
        for k in raw_candidates:
            clean = k.strip().strip("\"'")
            if clean and clean != "your_gemini_api_key_here" and clean not in seen:
                seen.add(clean)
                valid_keys.append(clean)

        # Temporary safeguard: cap active free-tier pool to initial keys (default 4)
        # to avoid Google multi-project account-level anti-abuse quota clamps.
        max_pool = int(os.getenv("MAX_ACTIVE_GEMINI_KEYS", "4"))
        return valid_keys[:max_pool]

    @property
    def is_gemini_configured(self) -> bool:
        return len(self.configured_api_keys) > 0

    @property
    def is_gcp_paid_configured(self) -> bool:
        if bool(self.GCP_SERVICE_ACCOUNT_JSON):
            return True
        try:
            return self.GCP_SERVICE_ACCOUNT_PATH.exists()
        except Exception:
            return False

settings = Settings()
settings.ensure_directories()
