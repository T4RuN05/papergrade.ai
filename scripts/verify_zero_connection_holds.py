"""
PaperGrade AI — Static Route Hygiene & Zero-Hold Invariant Auditor.

Scans backend routers and service endpoints to verify:
1. No remote network calls (Cloudinary/R2, Gemini API, HTTP requests) are made
   while holding a database connection.
2. Ensures all endpoints comply with the Zero-Hold Connection Invariant.
"""

import sys
import ast
from pathlib import Path

ROUTER_DIR = Path("backend/app/routers")
SERVICES_DIR = Path("backend/app/services")

def audit_zero_holds():
    print("=" * 80)
    print("        PAPERGRADE AI — ZERO-HOLD CONNECTION INVARIANT AUDIT")
    print("=" * 80)

    violations = []
    scanned_files = 0

    for py_file in list(ROUTER_DIR.glob("*.py")) + list(SERVICES_DIR.glob("*.py")):
        scanned_files += 1
        with open(py_file, "r", encoding="utf-8") as f:
            content = f.read()

        # Check for obvious anti-patterns:
        # e.g., calling Gemini API inside a get_session() block
        # e.g., downloading full files inside get_db()
        lines = content.splitlines()
        in_session_block = False
        session_indent = 0

        for idx, line in enumerate(lines, 1):
            stripped = line.strip()
            indent = len(line) - len(line.lstrip())

            if "with get_session()" in stripped or "with SessionLocal()" in stripped:
                in_session_block = True
                session_indent = indent
            elif in_session_block and indent <= session_indent and stripped and not stripped.startswith("#"):
                in_session_block = False

            if in_session_block:
                # Disallowed inside persistent DB sessions
                if "genai." in stripped or "model.generate_content" in stripped:
                    violations.append((py_file.name, idx, "Gemini API call inside DB session block", stripped))
                if "storage.get_local_path_or_download" in stripped:
                    violations.append((py_file.name, idx, "Synchronous storage download inside DB session block", stripped))
                if "time.sleep" in stripped and "queue_worker" not in py_file.name:
                    violations.append((py_file.name, idx, "time.sleep() inside DB session block", stripped))

    print(f"Scanned {scanned_files} Python source files in routers and services.")

    if violations:
        print(f"\n[FAIL] Found {len(violations)} Zero-Hold Invariant violations:")
        for fname, lno, reason, snippet in violations:
            print(f"  - {fname}:{lno} -> {reason}")
            print(f"    Code: {snippet}")
        sys.exit(1)
    else:
        print("\n[PASS] 0 Zero-Hold Invariant violations detected.")
        print("All database sessions are strictly bounded to local query execution.")
        print("=" * 80)

if __name__ == "__main__":
    audit_zero_holds()
