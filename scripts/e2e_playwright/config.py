"""
Configuration constants and environment settings for the Playwright E2E Load Test.
"""

import os
from pathlib import Path
from typing import List, Dict, Any

# Root workspace directory
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# Base URLs
DEFAULT_FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000").rstrip("/")
DEFAULT_API_URL = os.environ.get("API_BASE_URL", "http://localhost:8000").rstrip("/")

# Authentication
DEFAULT_STUDENT_PASSWORD = os.environ.get("STUDENT_DEFAULT_PASSWORD", "Student@123")

# Mobile Viewport & Device Emulation (Phone Proportions: iPhone 14/15 format)
MOBILE_VIEWPORT = {
    "width": 390,
    "height": 844
}
MOBILE_USER_AGENT = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
)
DEVICE_SCALE_FACTOR = 2
IS_MOBILE = True
HAS_TOUCH = True

# Sample Image Assets for Camera Injection
DEFAULT_SAMPLE_PAGES_DIR = PROJECT_ROOT / "backend" / "data" / "page_renders" / "3eb3a827-1b44-4105-a7ae-f136607e0eab"
DEFAULT_PAGES_PER_STUDENT = 5

# Test Schedule & Concurrency Defaults
TOTAL_STUDENTS = 22
TOTAL_DURATION_SECONDS = 300  # 5 minutes
RANDOM_SEED = 42

# Timeouts (in milliseconds)
NAVIGATION_TIMEOUT_MS = 60000
ACTION_TIMEOUT_MS = 30000
SUBMISSION_TIMEOUT_MS = 120000  # accommodates client-side PDF assembly + network upload

# Output & Reporting Directories
REPORTS_DIR = PROJECT_ROOT / "reports" / "playwright_load_test"
SCREENSHOTS_DIR = REPORTS_DIR / "screenshots"
TRACES_DIR = REPORTS_DIR / "traces"

# Ensure directories exist
for directory in (REPORTS_DIR, SCREENSHOTS_DIR, TRACES_DIR):
    directory.mkdir(parents=True, exist_ok=True)

# 22 Seeded Catch 25 Borivali Students
C25_BORIVALI_STUDENTS: List[Dict[str, str]] = [
    {"name": "Aarav Mehta", "roll": "C25-BVI-001", "claim_id": "251001", "email": "aarav.mehta@catch25.edu.in"},
    {"name": "Diya Sharma", "roll": "C25-BVI-002", "claim_id": "251002", "email": "diya.sharma@catch25.edu.in"},
    {"name": "Rohan Iyer", "roll": "C25-BVI-003", "claim_id": "251003", "email": "rohan.iyer@catch25.edu.in"},
    {"name": "Ananya Joshi", "roll": "C25-BVI-004", "claim_id": "251004", "email": "ananya.joshi@catch25.edu.in"},
    {"name": "Aditya Kulkarni", "roll": "C25-BVI-005", "claim_id": "251005", "email": "aditya.kulkarni@catch25.edu.in"},
    {"name": "Priya Deshmukh", "roll": "C25-BVI-006", "claim_id": "251006", "email": "priya.deshmukh@catch25.edu.in"},
    {"name": "Siddharth Patel", "roll": "C25-BVI-007", "claim_id": "251007", "email": "siddharth.patel@catch25.edu.in"},
    {"name": "Neha Varma", "roll": "C25-BVI-008", "claim_id": "251008", "email": "neha.varma@catch25.edu.in"},
    {"name": "Kabir Shah", "roll": "C25-BVI-009", "claim_id": "251009", "email": "kabir.shah@catch25.edu.in"},
    {"name": "Ishaan Rao", "roll": "C25-BVI-010", "claim_id": "251010", "email": "ishaan.rao@catch25.edu.in"},
    {"name": "Riya Nair", "roll": "C25-BVI-011", "claim_id": "251011", "email": "riya.nair@catch25.edu.in"},
    {"name": "Varun Bhatia", "roll": "C25-BVI-012", "claim_id": "251012", "email": "varun.bhatia@catch25.edu.in"},
    {"name": "Tanvi Sawant", "roll": "C25-BVI-013", "claim_id": "251013", "email": "tanvi.sawant@catch25.edu.in"},
    {"name": "Atharva More", "roll": "C25-BVI-014", "claim_id": "251014", "email": "atharva.more@catch25.edu.in"},
    {"name": "Pooja Chawla", "roll": "C25-BVI-015", "claim_id": "251015", "email": "pooja.chawla@catch25.edu.in"},
    {"name": "Manav Malhotra", "roll": "C25-BVI-016", "claim_id": "251016", "email": "manav.malhotra@catch25.edu.in"},
    {"name": "Sneha Gokhale", "roll": "C25-BVI-017", "claim_id": "251017", "email": "sneha.gokhale@catch25.edu.in"},
    {"name": "Yash Shinde", "roll": "C25-BVI-018", "claim_id": "251018", "email": "yash.shinde@catch25.edu.in"},
    {"name": "Shreya Agarwal", "roll": "C25-BVI-019", "claim_id": "251019", "email": "shreya.agarwal@catch25.edu.in"},
    {"name": "Devendra Parab", "roll": "C25-BVI-020", "claim_id": "251020", "email": "devendra.parab@catch25.edu.in"},
    {"name": "Kirti Solanki", "roll": "C25-BVI-021", "claim_id": "251021", "email": "kirti.solanki@catch25.edu.in"},
    {"name": "Aryan Tendulkar", "roll": "C25-BVI-022", "claim_id": "251022", "email": "aryan.tendulkar@catch25.edu.in"},
]

