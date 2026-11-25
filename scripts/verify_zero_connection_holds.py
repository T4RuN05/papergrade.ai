"""
PaperGrade AI — Static Route Hygiene & Zero-Hold Invariant AST Auditor.

Uses Python's `ast` module to inspect all FastAPI routers and service modules to verify:
1. No `with get_session()` or `with SessionLocal()` block invokes WAN storage calls,
   Gemini / LLM generation calls, `time.sleep`, or nested `get_session()`/`SessionLocal()`.
2. No FastAPI route accepting `Depends(get_db)` calls WAN storage/Gemini I/O, nested
   service methods that open `get_session()`, or synchronous/async file/PDF processing
   while the request-scoped DB connection is held open.
"""

import ast
import sys
from pathlib import Path
from typing import List, Tuple

ROUTER_DIR = Path("backend/app/routers")
SERVICES_DIR = Path("backend/app/services")
WORKER_DIR = Path("backend/app/worker")
GEMINI_DIR = Path("backend/app/gemini")

STORAGE_CALL_ATTRS = {
    "upload_file",
    "download_file",
    "get_local_path_or_download",
    "delete_file",
    "delete_prefix",
    "file_exists",
    "sync_file_to_remote_storage",
}

BLOCKED_SESSION_SUBCALL_PREFIXES = (
    "gemini_client.",
    "genai.",
    "webpush(",
)

BLOCKED_ROUTE_SERVICE_CALLS = {
    ("grading_service", "bulk_clear_exam_reviews"),
    ("grading_service", "clear_all_review_flags"),
    ("grading_service", "manual_edit_answer"),
    ("grading_service", "reevaluate_answer"),
    ("grading_service", "manual_edit_region"),
    ("grading_service", "delete_region"),
    ("grading_service", "get_submission_details"),
    ("usage_service", "get_usage_metrics"),
    ("usage_service", "update_quota_settings"),
    ("export_service", "get_submission_pdf_path"),
    ("export_service", "create_batch_zip"),
    ("export_service", "generate_exam_marks_csv"),
    ("exam_service", "get_exam"),
}


def _dotted_name(node: ast.AST) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        parent = _dotted_name(node.value)
        return f"{parent}.{node.attr}" if parent else node.attr
    return ""


def _is_session_context_call(withitem: ast.withitem) -> bool:
    expr = withitem.context_expr
    if isinstance(expr, ast.Call):
        name = _dotted_name(expr.func)
        return name in {"get_session", "SessionLocal"} or name.endswith((".get_session", ".SessionLocal"))
    return False


def _has_depends_get_db(func_node: ast.FunctionDef | ast.AsyncFunctionDef) -> bool:
    for default in list(func_node.args.defaults) + [d for d in func_node.args.kw_defaults if d is not None]:
        if isinstance(default, ast.Call) and _dotted_name(default.func) == "Depends":
            if default.args and _dotted_name(default.args[0]) == "get_db":
                return True
    return False


class ZeroHoldASTVisitor(ast.NodeVisitor):
    """Inspects AST scopes for DB session hold violations."""

    def __init__(self, filename: str):
        self.filename = filename
        self.violations: List[Tuple[str, int, str, str]] = []
        self._session_depth = 0
        self._in_depends_get_db_route = False

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self._visit_func(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self._visit_func(node)

    def _visit_func(self, node: ast.FunctionDef | ast.AsyncFunctionDef) -> None:
        prev_route = self._in_depends_get_db_route
        prev_depth = self._session_depth
        self._in_depends_get_db_route = _has_depends_get_db(node)
        self._session_depth = 0
        self.generic_visit(node)
        self._in_depends_get_db_route = prev_route
        self._session_depth = prev_depth

    def visit_With(self, node: ast.With) -> None:
        self._visit_with(node)

    def visit_AsyncWith(self, node: ast.AsyncWith) -> None:
        self._visit_with(node)

    def _visit_with(self, node: ast.With | ast.AsyncWith) -> None:
        entered_session = any(_is_session_context_call(item) for item in node.items)
        if entered_session:
            if self._session_depth > 0 or self._in_depends_get_db_route:
                self.violations.append(
                    (self.filename, node.lineno, "Nested DB session opened inside active DB session/Depends(get_db)", "with get_session()")
                )
            self._session_depth += 1
        try:
            for stmt in node.body:
                self.visit(stmt)
        finally:
            if entered_session:
                self._session_depth -= 1

    def visit_Call(self, node: ast.Call) -> None:
        call_name = _dotted_name(node.func)
        in_db_hold = self._session_depth > 0 or self._in_depends_get_db_route

        if in_db_hold:
            attr = call_name.rsplit(".", 1)[-1] if "." in call_name else call_name

            # 1. Storage I/O inside DB hold (except purge_institute_cascade / intentionally decoupled paths)
            if attr in STORAGE_CALL_ATTRS or call_name.startswith("sync_file_to_remote_storage"):
                self.violations.append(
                    (self.filename, node.lineno, f"Storage/WAN operation '{call_name}' inside held DB session", call_name)
                )

            # 2. Gemini / AI calls inside DB hold
            if (
                any(call_name.startswith(p.rstrip("(")) for p in BLOCKED_SESSION_SUBCALL_PREFIXES)
                or attr in {"generate_content", "extract_exam_rubric", "grade_student_submission", "reevaluate_single_answer"}
            ):
                self.violations.append(
                    (self.filename, node.lineno, f"LLM/External call '{call_name}' inside held DB session", call_name)
                )

            # 3. time.sleep inside DB hold (allowed in worker retry loops if outside session)
            if call_name == "time.sleep":
                self.violations.append(
                    (self.filename, node.lineno, "Blocking time.sleep() inside held DB session", call_name)
                )

            # 4. Nested service calls inside Depends(get_db) route
            if self._in_depends_get_db_route and "." in call_name:
                obj, method = call_name.rsplit(".", 1)
                if (obj, method) in BLOCKED_ROUTE_SERVICE_CALLS:
                    self.violations.append(
                        (
                            self.filename,
                            node.lineno,
                            f"Depends(get_db) route calls '{call_name}' which opens its own session / WAN I/O",
                            call_name,
                        )
                    )

            # 5. Blocking PDF rasterization inside Depends(get_db) or session
            if attr in {"files_to_canonical_pdf", "render_pdf_pages_to_images"}:
                self.violations.append(
                    (self.filename, node.lineno, f"Heavy PDF/CPU work '{call_name}' inside held DB session", call_name)
                )

        self.generic_visit(node)


def audit_zero_holds() -> None:
    print("=" * 80)
    print("      PAPERGRADE AI — AST ZERO-HOLD CONNECTION INVARIANT AUDITOR")
    print("=" * 80)

    violations: List[Tuple[str, int, str, str]] = []
    scanned_files = 0

    targets = sorted(
        list(ROUTER_DIR.glob("*.py"))
        + list(SERVICES_DIR.glob("*.py"))
        + list(WORKER_DIR.glob("*.py"))
        + list(GEMINI_DIR.glob("*.py"))
    )
    for py_file in targets:
        scanned_files += 1
        source = py_file.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(py_file))
        visitor = ZeroHoldASTVisitor(py_file.name)
        visitor.visit(tree)
        violations.extend(visitor.violations)

    print(f"Scanned {scanned_files} Python source files in routers and services via AST.")

    if violations:
        print(f"\n[FAIL] Found {len(violations)} Zero-Hold Invariant violation(s):")
        for fname, lno, reason, snippet in violations:
            print(f"  - {fname}:{lno} -> {reason} ({snippet})")
        sys.exit(1)
    else:
        print("\n[PASS] 0 Zero-Hold Invariant violations detected.")


if __name__ == "__main__":
    audit_zero_holds()
