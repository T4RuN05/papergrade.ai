"""
Reset and purge all mock data, student submissions, exams, and logs from the database and storage.
Leaves the database schema completely fresh and ready for live real student evaluation.
"""

import os
import shutil
import sqlite3
from pathlib import Path

from backend.app.config import settings
from backend.app.database import init_db

def reset_database():
    print("[*] Purging all mock data and resetting database...")

    # 1. Truncate all SQLite tables
    if settings.DATABASE_PATH.exists():
        conn = sqlite3.connect(settings.DATABASE_PATH)
        cursor = conn.cursor()
        
        tables = [
            "experiment_benchmarks",
            "audit_logs",
            "criterion_scores",
            "answer_regions",
            "answers",
            "submissions",
            "batches",
            "rubric_versions",
            "exams",
            "api_usage_events",
            "user_quota_settings"
        ]
        
        cursor.execute("PRAGMA foreign_keys = OFF;")
        for table in tables:
            try:
                cursor.execute(f"DELETE FROM {table};")
                cursor.execute(f"DELETE FROM sqlite_sequence WHERE name='{table}';")
            except sqlite3.OperationalError:
                pass
        
        cursor.execute("PRAGMA foreign_keys = ON;")
        conn.commit()
        conn.close()
        print("  -> All database tables truncated.")

    # 2. Re-initialize database schema and default settings
    init_db()
    print("  -> Fresh database schema and default quota settings initialized.")

    # 3. Clean uploads, page_renders, exports directories
    for dir_path in [settings.UPLOADS_DIR, settings.RENDERS_DIR, settings.EXPORTS_DIR]:
        if dir_path.exists():
            for item in dir_path.iterdir():
                if item.name == ".gitkeep":
                    continue
                if item.is_dir():
                    shutil.rmtree(item, ignore_errors=True)
                elif item.is_file():
                    item.unlink(missing_ok=True)
            print(f"  -> Cleaned {dir_path.name}/")

    print("[+] Database and local storage reset successfully! Ready for real grading.")

if __name__ == "__main__":
    reset_database()
