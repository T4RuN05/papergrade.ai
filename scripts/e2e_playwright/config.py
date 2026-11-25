"""
Configuration constants and environment settings for the Playwright E2E Load Test.
Target Cohort: Exactly 28 Students belonging strictly to TEST INSTITUTE BVI Branch (batch_097bce23a72e).
Zero interaction with production CATCH 25 institute.
"""

import os
from pathlib import Path
from typing import List, Dict, Any

# Root workspace directory
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# Base URLs
DEFAULT_FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://127.0.0.1:3000").rstrip("/")
DEFAULT_API_URL = os.environ.get("API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")

# Target Branch & Batch Scope (TEST INSTITUTE ONLY)
TARGET_INSTITUTE_CODE = "TEST_INST"
TARGET_BRANCH_ID = "br_28c2a5dfe193"
TARGET_BRANCH_CODE = "TEST_BVI"
TARGET_BATCH_ID = "batch_097bce23a72e"

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

# Sample Image Assets for Camera Injection (5 high-res handwritten pages)
DEFAULT_SAMPLE_PAGES_DIR = PROJECT_ROOT / "backend" / "data" / "sample_pages"
DEFAULT_PAGES_PER_STUDENT = 5

# Test Schedule & Concurrency Defaults (15 Minutes Real-World Conduction)
TOTAL_STUDENTS = 28
TOTAL_DURATION_SECONDS = 900  # 15 minutes
PHASE1_PRE_EXAM_WAIT_SECS = 180  # 3 minutes pre-exam standby & polling
PHASE2_INGESTION_SPAN_SECS = 240  # 4 minutes concurrent ingestion window
PHASE3_POST_UPLOAD_SECS = 480    # 8 minutes post-upload activity
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

# 28 Seeded TEST INSTITUTE BVI Students (Batch: batch_097bce23a72e)
TEST_INST_BVI_STUDENTS: List[Dict[str, str]] = [
    {"name": "Aarav Mehta", "roll": "TEST_INST-TEST_BVI-001", "claim_id": "990001", "email": "aarav.mehta@test.edu"},
    {"name": "Diya Sharma", "roll": "TEST_INST-TEST_BVI-002", "claim_id": "990002", "email": "diya.sharma@test.edu"},
    {"name": "Rohan Iyer", "roll": "TEST_INST-TEST_BVI-003", "claim_id": "990003", "email": "rohan.iyer@test.edu"},
    {"name": "Ananya Joshi", "roll": "TEST_INST-TEST_BVI-004", "claim_id": "990004", "email": "ananya.joshi@test.edu"},
    {"name": "Aditya Kulkarni", "roll": "TEST_INST-TEST_BVI-005", "claim_id": "990005", "email": "aditya.kulkarni@test.edu"},
    {"name": "Priya Deshmukh", "roll": "TEST_INST-TEST_BVI-006", "claim_id": "990006", "email": "priya.deshmukh@test.edu"},
    {"name": "Siddharth Patel", "roll": "TEST_INST-TEST_BVI-007", "claim_id": "990007", "email": "siddharth.patel@test.edu"},
    {"name": "Neha Varma", "roll": "TEST_INST-TEST_BVI-008", "claim_id": "990008", "email": "neha.varma@test.edu"},
    {"name": "Kabir Shah", "roll": "TEST_INST-TEST_BVI-009", "claim_id": "990009", "email": "kabir.shah@test.edu"},
    {"name": "Ishaan Rao", "roll": "TEST_INST-TEST_BVI-010", "claim_id": "990010", "email": "ishaan.rao@test.edu"},
    {"name": "Riya Nair", "roll": "TEST_INST-TEST_BVI-011", "claim_id": "990011", "email": "riya.nair@test.edu"},
    {"name": "Varun Bhatia", "roll": "TEST_INST-TEST_BVI-012", "claim_id": "990012", "email": "varun.bhatia@test.edu"},
    {"name": "Tanvi Sawant", "roll": "TEST_INST-TEST_BVI-013", "claim_id": "990013", "email": "tanvi.sawant@test.edu"},
    {"name": "Atharva More", "roll": "TEST_INST-TEST_BVI-014", "claim_id": "990014", "email": "atharva.more@test.edu"},
    {"name": "Pooja Chawla", "roll": "TEST_INST-TEST_BVI-015", "claim_id": "990015", "email": "pooja.chawla@test.edu"},
    {"name": "Manav Malhotra", "roll": "TEST_INST-TEST_BVI-016", "claim_id": "990016", "email": "manav.malhotra@test.edu"},
    {"name": "Sneha Gokhale", "roll": "TEST_INST-TEST_BVI-017", "claim_id": "990017", "email": "sneha.gokhale@test.edu"},
    {"name": "Yash Shinde", "roll": "TEST_INST-TEST_BVI-018", "claim_id": "990018", "email": "yash.shinde@test.edu"},
    {"name": "Shreya Agarwal", "roll": "TEST_INST-TEST_BVI-019", "claim_id": "990019", "email": "shreya.agarwal@test.edu"},
    {"name": "Devendra Parab", "roll": "TEST_INST-TEST_BVI-020", "claim_id": "990020", "email": "devendra.parab@test.edu"},
    {"name": "Kirti Solanki", "roll": "TEST_INST-TEST_BVI-021", "claim_id": "990021", "email": "kirti.solanki@test.edu"},
    {"name": "Aryan Tendulkar", "roll": "TEST_INST-TEST_BVI-022", "claim_id": "990022", "email": "aryan.tendulkar@test.edu"},
    {"name": "Test Student 23", "roll": "TEST_INST-TEST_BVI-023", "claim_id": "990023", "email": "student_23@test.edu"},
    {"name": "Test Student 24", "roll": "TEST_INST-TEST_BVI-024", "claim_id": "990024", "email": "student_24@test.edu"},
    {"name": "Test Student 25", "roll": "TEST_INST-TEST_BVI-025", "claim_id": "990025", "email": "student_25@test.edu"},
    {"name": "Test Student 26", "roll": "TEST_INST-TEST_BVI-026", "claim_id": "990026", "email": "student_26@test.edu"},
    {"name": "Test Student 27", "roll": "TEST_INST-TEST_BVI-027", "claim_id": "990027", "email": "student_27@test.edu"},
    {"name": "Test Student 28", "roll": "TEST_INST-TEST_BVI-028", "claim_id": "990028", "email": "student_28@test.edu"},
]

# Primary Cohort for Simulation
DEFAULT_STUDENTS = TEST_INST_BVI_STUDENTS

# Legacy reference only — NEVER TARGETED DURING THIS LOAD TEST
C25_BORIVALI_STUDENTS: List[Dict[str, str]] = []
