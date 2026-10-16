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
    DEBUG: bool = True
    HOST: str = "127.0.0.1"
    PORT: int = 8000

    # Gemini API settings
    GEMINI_API_KEY: str = (os.getenv("GEMINI_API_KEY") or os.getenv("GEMINI_API_KEY_1") or "").strip("\"'")
    GEMINI_API_KEY_2: str = os.getenv("GEMINI_API_KEY_2", "").strip("\"'")
    GEMINI_API_KEY_3: str = os.getenv("GEMINI_API_KEY_3", "").strip("\"'")
    GEMINI_API_KEY_4: str = os.getenv("GEMINI_API_KEY_4", "").strip("\"'")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
    GEMINI_THINKING_BUDGET: int = int(os.getenv("GEMINI_THINKING_BUDGET", "1024"))
    MAX_EVALUATION_WORKERS: int = int(os.getenv("MAX_EVALUATION_WORKERS", "3"))

    # Data & Storage
    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    DATA_DIR: Path = BASE_DIR / "data"
    UPLOADS_DIR: Path = DATA_DIR / "uploads"
    RENDERS_DIR: Path = DATA_DIR / "page_renders"
    EXPORTS_DIR: Path = DATA_DIR / "exports"
    # Database (Supabase PostgreSQL or local SQLite)
    _raw_db: str = (os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL") or "").strip()
    DATABASE_URL: str = _raw_db.replace("pooler.supabase.com:5432", "pooler.supabase.com:6543") if "pooler.supabase.com:5432" in _raw_db else _raw_db
    DATABASE_PATH: Path = DATA_DIR / "papergrade.db"

    # Cloudflare R2 / S3 Object Storage Settings
    STORAGE_BACKEND: str = (os.getenv("STORAGE_BACKEND") or os.getenv("STORAGE_PROVIDER") or "auto").strip().lower() # "auto", "cloudinary", "r2", "local"
    R2_ACCOUNT_ID: str = os.getenv("R2_ACCOUNT_ID", "").strip()
    R2_ACCESS_KEY_ID: str = os.getenv("R2_ACCESS_KEY_ID", "").strip()
    R2_SECRET_ACCESS_KEY: str = os.getenv("R2_SECRET_ACCESS_KEY", "").strip()
    R2_BUCKET_NAME: str = os.getenv("R2_BUCKET_NAME", "papergrade-bucket").strip()
    R2_PUBLIC_URL: str = os.getenv("R2_PUBLIC_URL", "").strip() # Optional custom domain / r2.dev URL

    # Cloudinary Storage Settings (Free tier zero-billing alternative)
    CLOUDINARY_URL: str = os.getenv("CLOUDINARY_URL", "").strip()
    CLOUDINARY_CLOUD_NAME: str = os.getenv("CLOUDINARY_CLOUD_NAME", "dijssimbb").strip()
    CLOUDINARY_API_KEY: str = os.getenv("CLOUDINARY_API_KEY", "").strip()
    CLOUDINARY_API_SECRET: str = os.getenv("CLOUDINARY_API_SECRET", "BeE8QrnuIuIPw4xhI79FRE5tKNs").strip()

    # Supabase Settings
    SUPABASE_URL: str = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "https://wxslwjwlutrcucieossv.supabase.co").strip()
    SUPABASE_KEY: str = os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_BTrPRAq5lUFULfPZ8JSWjQ_g_aktYKe").strip()
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_jatcjAgcn3ccVgdY3JpcBw_gfBFLUHY").strip()

    # Authentication & Security
    JWT_SECRET: str = os.getenv("JWT_SECRET", "pg_dev_jwt_secret_antigravity_replace_in_prod_key_92817").strip()
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24 * 7))) # 7 days

    # Submission & Evaluation Lifecycle Constraints
    WINDOW_DURATION_MINUTES: int = int(os.getenv("WINDOW_DURATION_MINUTES", "30"))
    GRACE_PERIOD_MINUTES: int = int(os.getenv("GRACE_PERIOD_MINUTES", "2"))
    MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "15"))
    MAX_PAGE_COUNT: int = int(os.getenv("MAX_PAGE_COUNT", "10"))
    REVALUATION_WINDOW_DAYS: int = int(os.getenv("REVALUATION_WINDOW_DAYS", "7"))
    SUBMISSION_RETENTION_DAYS: int = int(os.getenv("SUBMISSION_RETENTION_DAYS", "15"))

    # User configured AI Studio limits (defaults)
    DEFAULT_RPM_LIMIT: int = int(os.getenv("USER_RPM_LIMIT", "15"))
    DEFAULT_TPM_LIMIT: int = int(os.getenv("USER_TPM_LIMIT", "1000000"))
    DEFAULT_RPD_LIMIT: int = int(os.getenv("USER_RPD_LIMIT", "1500"))

    # Pricing table version
    PRICING_VERSION: str = "2026-03-gemini-flash"

    def ensure_directories(self):
        for directory in [self.DATA_DIR, self.UPLOADS_DIR, self.RENDERS_DIR, self.EXPORTS_DIR]:
            directory.mkdir(parents=True, exist_ok=True)

    @property
    def configured_api_keys(self) -> list:
        keys = []
        for k in [self.GEMINI_API_KEY, self.GEMINI_API_KEY_2, self.GEMINI_API_KEY_3, self.GEMINI_API_KEY_4]:
            if k and k.strip() and k.strip() != "your_gemini_api_key_here":
                keys.append(k.strip())
        return keys

    @property
    def is_gemini_configured(self) -> bool:
        return len(self.configured_api_keys) > 0

settings = Settings()
settings.ensure_directories()
