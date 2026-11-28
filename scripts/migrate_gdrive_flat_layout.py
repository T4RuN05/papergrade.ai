"""Flatten legacy Google Drive archives for already-linked BYOS accounts.

Legacy layout (before 2026-11-26):
    PaperGrade AI / <Year> / <Month> / <Exam Title> / <roll>_<title>_Graded[_v1].pdf

Current layout:
    PaperGrade AI / <Subject> / <roll>_<title>_<exam-id-suffix>_Graded.pdf

The script uses each student's stored refresh token, maps every app-created PDF
under their PaperGrade AI folder to the exam subject via
published_document_archives -> submissions -> exams, moves the file directly
into PaperGrade AI/<Subject>/, and removes legacy folders that become empty.

Safe by default: nothing is changed unless --apply is passed.

Usage:
    python scripts/migrate_gdrive_flat_layout.py
    python scripts/migrate_gdrive_flat_layout.py --apply
    python scripts/migrate_gdrive_flat_layout.py --apply --email student@example.com
    python scripts/migrate_gdrive_flat_layout.py --apply --connection-id gconn_abc123

Notes:
    * Files without a PublishedDocumentArchive mapping are left untouched and
      reported, so they can be reviewed manually.
    * Empty legacy folders are moved to Google Drive trash (recoverable), not
      permanently deleted. Pass --keep-empty-folders to skip that step.
    * Re-running the script is safe; files already in the correct subject
      folder are skipped.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import httpx
from sqlalchemy import select

# Allow direct invocation: python scripts/migrate_gdrive_flat_layout.py
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.app.db.models import (
    Exam,
    GoogleStorageConnection,
    PublishedDocumentArchive,
    Student,
    Submission,
)
from backend.app.db.session import get_session
from backend.app.services.google_drive_service import (
    GOOGLE_DRIVE_API_BASE,
    _escape_drive_query,
    refresh_google_access_token,
)

FOLDER_MIME = "application/vnd.google-apps.folder"
ROOT_FOLDER_NAME = "PaperGrade AI"
PAGE_SIZE = 1000
MAX_FOLDERS = 5000
MAX_DEPTH = 10
RETRY_STATUSES = {429, 500, 502, 503, 504}
REQUEST_ATTEMPTS = 4


@dataclass
class ConnectionInfo:
    id: str
    user_id: str
    email: str
    encrypted_refresh_token: str
    root_folder_id: Optional[str]


@dataclass
class FolderInfo:
    id: str
    name: str
    parent_id: Optional[str]
    depth: int


@dataclass
class FileInfo:
    id: str
    name: str
    parent_id: Optional[str]


@dataclass
class FileTarget:
    subject: str
    exam_title: str
    exam_id: str
    roll_number: Optional[str]


@dataclass
class Stats:
    connections: int = 0
    connections_skipped: int = 0
    files_seen: int = 0
    moved: int = 0
    already_flat: int = 0
    unmapped: int = 0
    folders_trashed: int = 0
    errors: int = 0


class DriveApiError(RuntimeError):
    def __init__(self, action: str, response: httpx.Response):
        self.status_code = response.status_code
        self.body = (response.text or "")[:500]
        super().__init__(f"{action} failed ({response.status_code}): {self.body}")


def sanitize_folder_name(value: Optional[str], fallback: str) -> str:
    """Match the sanitization used by google_drive_service.sync_published_submission_to_google_drive."""
    cleaned = "".join(c for c in (value or "") if c.isalnum() or c in (" ", "-", "_")).strip()
    return cleaned or fallback


def build_filename(roll_number: Optional[str], exam_title: Optional[str], exam_id: Optional[str]) -> str:
    """Current naming used by google_drive_service."""
    roll_clean = (roll_number or "Student").replace("/", "-")
    clean_title = sanitize_folder_name(exam_title, "Examination")
    exam_suffix = (exam_id or "")[-6:]
    if exam_suffix:
        return f"{roll_clean}_{clean_title}_{exam_suffix}_Graded.pdf"
    return f"{roll_clean}_{clean_title}_Graded.pdf"


def _chunks(items: List[str], size: int = 500):
    for start in range(0, len(items), size):
        yield items[start:start + size]


def load_connections(email: Optional[str], connection_id: Optional[str]) -> List[ConnectionInfo]:
    with get_session() as db:
        stmt = select(GoogleStorageConnection).where(GoogleStorageConnection.is_active == 1)
        if connection_id:
            stmt = stmt.where(GoogleStorageConnection.id == connection_id)
        rows = db.scalars(stmt).all()
        connections = [
            ConnectionInfo(
                id=row.id,
                user_id=row.user_id,
                email=row.google_email,
                encrypted_refresh_token=row.encrypted_refresh_token,
                root_folder_id=row.root_folder_id,
            )
            for row in rows
        ]

    if email:
        email_lower = email.strip().lower()
        connections = [c for c in connections if (c.email or "").strip().lower() == email_lower]
    return connections


def load_file_targets(file_ids: List[str], user_id: str) -> Dict[str, FileTarget]:
    """Map Drive file IDs to their exam subject using the archive table."""
    targets: Dict[str, FileTarget] = {}
    if not file_ids:
        return targets

    with get_session() as db:
        for chunk in _chunks(sorted(set(file_ids))):
            rows = db.execute(
                select(
                    PublishedDocumentArchive.drive_file_id.label("drive_file_id"),
                    Exam.subject.label("subject"),
                    Exam.title.label("exam_title"),
                    Exam.id.label("exam_id"),
                    Student.roll_number.label("roll_number"),
                    Student.user_id.label("student_user_id"),
                )
                .join(Submission, PublishedDocumentArchive.submission_id == Submission.id)
                .join(Exam, Submission.exam_id == Exam.id)
                .outerjoin(Student, Submission.student_id == Student.id)
                .where(PublishedDocumentArchive.drive_file_id.in_(chunk))
            ).all()

            for row in rows:
                if not row.drive_file_id:
                    continue
                if row.student_user_id and row.student_user_id != user_id:
                    # A file mapped to another account is not ours to move.
                    continue
                targets.setdefault(
                    row.drive_file_id,
                    FileTarget(
                        subject=row.subject or "General",
                        exam_title=row.exam_title or "Examination",
                        exam_id=row.exam_id or "",
                        roll_number=row.roll_number,
                    ),
                )
    return targets


async def _request(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    *,
    headers: Dict[str, str],
    **kwargs,
) -> httpx.Response:
    """Drive request with retry for transient and rate-limit failures."""
    last_error: Optional[Exception] = None
    for attempt in range(REQUEST_ATTEMPTS):
        try:
            response = await client.request(method, url, headers=headers, **kwargs)
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            last_error = exc
            if attempt == REQUEST_ATTEMPTS - 1:
                raise
            await asyncio.sleep(2 ** attempt)
            continue

        if response.status_code in RETRY_STATUSES and attempt < REQUEST_ATTEMPTS - 1:
            await asyncio.sleep(2 ** attempt)
            continue
        if (
            response.status_code == 403
            and attempt < REQUEST_ATTEMPTS - 1
            and "rateLimitExceeded" in (response.text or "")
        ):
            await asyncio.sleep(2 ** attempt)
            continue
        return response

    if last_error:
        raise last_error
    raise RuntimeError("Drive request failed without a response")


async def list_children(
    client: httpx.AsyncClient,
    headers: Dict[str, str],
    folder_id: str,
) -> List[Dict]:
    children: List[Dict] = []
    page_token: Optional[str] = None
    for _ in range(50):
        params = {
            "q": f"'{_escape_drive_query(folder_id)}' in parents and trashed = false",
            "fields": "nextPageToken,files(id,name,mimeType,parents,webViewLink)",
            "pageSize": PAGE_SIZE,
        }
        if page_token:
            params["pageToken"] = page_token
        response = await _request(
            client, "GET", f"{GOOGLE_DRIVE_API_BASE}/files", headers=headers, params=params
        )
        if response.status_code != 200:
            raise DriveApiError(f"Listing folder {folder_id}", response)
        payload = response.json()
        children.extend(payload.get("files", []))
        page_token = payload.get("nextPageToken")
        if not page_token:
            break
    return children


async def find_root_folder(
    client: httpx.AsyncClient,
    headers: Dict[str, str],
    connection: ConnectionInfo,
) -> Optional[str]:
    if connection.root_folder_id:
        response = await _request(
            client,
            "GET",
            f"{GOOGLE_DRIVE_API_BASE}/files/{connection.root_folder_id}",
            headers=headers,
            params={"fields": "id,name,mimeType,trashed"},
        )
        if response.status_code == 200:
            data = response.json()
            if data.get("mimeType") == FOLDER_MIME and not data.get("trashed"):
                return connection.root_folder_id

    query = (
        f"mimeType = '{FOLDER_MIME}' and name = '{ROOT_FOLDER_NAME}' "
        "and 'root' in parents and trashed = false"
    )
    response = await _request(
        client,
        "GET",
        f"{GOOGLE_DRIVE_API_BASE}/files",
        headers=headers,
        params={"q": query, "fields": "files(id,name)"},
    )
    if response.status_code != 200:
        raise DriveApiError("Finding the PaperGrade AI root folder", response)
    matches = response.json().get("files", [])
    if not matches:
        return None
    if len(matches) > 1:
        print(f"  [WARN] {len(matches)} root folders named '{ROOT_FOLDER_NAME}' found; using {matches[0]['id']}")
    return matches[0]["id"]


async def enumerate_tree(
    client: httpx.AsyncClient,
    headers: Dict[str, str],
    root_id: str,
) -> Tuple[Dict[str, FolderInfo], Dict[str, FileInfo]]:
    folders: Dict[str, FolderInfo] = {}
    files: Dict[str, FileInfo] = {}
    queue = deque([(root_id, 0)])
    seen = {root_id}

    while queue:
        folder_id, depth = queue.popleft()
        for child in await list_children(client, headers, folder_id):
            child_id = child.get("id")
            if not child_id:
                continue
            if child.get("mimeType") == FOLDER_MIME:
                if child_id in seen or depth >= MAX_DEPTH:
                    continue
                seen.add(child_id)
                if len(folders) >= MAX_FOLDERS:
                    print(f"  [WARN] Folder cap ({MAX_FOLDERS}) reached; stopping traversal.")
                    return folders, files
                folders[child_id] = FolderInfo(
                    id=child_id,
                    name=child.get("name") or "",
                    parent_id=folder_id,
                    depth=depth + 1,
                )
                queue.append((child_id, depth + 1))
            else:
                files[child_id] = FileInfo(
                    id=child_id,
                    name=child.get("name") or "",
                    parent_id=folder_id,
                )
    return folders, files


async def ensure_subject_folder(
    client: httpx.AsyncClient,
    headers: Dict[str, str],
    root_id: str,
    folder_name: str,
    known: Dict[str, str],
) -> str:
    if folder_name in known:
        return known[folder_name]

    response = await _request(
        client,
        "POST",
        f"{GOOGLE_DRIVE_API_BASE}/files",
        headers=headers,
        params={"fields": "id,name"},
        json={"name": folder_name, "mimeType": FOLDER_MIME, "parents": [root_id]},
    )
    if response.status_code not in (200, 201):
        raise DriveApiError(f"Creating subject folder '{folder_name}'", response)
    folder_id = response.json()["id"]
    known[folder_name] = folder_id
    print(f"  [MKDIR] {ROOT_FOLDER_NAME}/{folder_name}")
    return folder_id


async def move_file(
    client: httpx.AsyncClient,
    headers: Dict[str, str],
    file: FileInfo,
    target_folder_id: str,
) -> None:
    if not file.parent_id:
        raise ValueError(f"File {file.id} has no parent folder")
    response = await _request(
        client,
        "PATCH",
        f"{GOOGLE_DRIVE_API_BASE}/files/{file.id}",
        headers=headers,
        params={
            "addParents": target_folder_id,
            "removeParents": file.parent_id,
            "fields": "id,name,parents",
        },
        json={},
    )
    if response.status_code != 200:
        raise DriveApiError(f"Moving '{file.name}'", response)


async def trash_empty_folders(
    client: httpx.AsyncClient,
    headers: Dict[str, str],
    root_id: str,
    folders: Dict[str, FolderInfo],
    protected_ids: set,
) -> int:
    deleted = 0
    for folder in sorted(folders.values(), key=lambda f: f.depth, reverse=True):
        if folder.id == root_id or folder.id in protected_ids:
            continue
        try:
            children = await list_children(client, headers, folder.id)
        except DriveApiError as exc:
            print(f"  [WARN] Could not inspect folder '{folder.name}': {exc}")
            continue
        if children:
            continue

        response = await _request(
            client,
            "DELETE",
            f"{GOOGLE_DRIVE_API_BASE}/files/{folder.id}",
            headers=headers,
        )
        if response.status_code in (200, 204):
            print(f"  [TRASH] {ROOT_FOLDER_NAME}/{folder.name}")
            deleted += 1
        else:
            print(f"  [WARN] Could not trash folder '{folder.name}': {response.status_code} {response.text[:200]}")
    return deleted


def _legacy_path_hint(folders: Dict[str, FolderInfo], file: FileInfo) -> str:
    names = []
    parent_id = file.parent_id
    while parent_id:
        folder = folders.get(parent_id)
        if not folder:
            break
        names.append(folder.name)
        parent_id = folder.parent_id
    return " / ".join(reversed(names)) or "(root)"


def _report_dry_run_cleanup(
    folders: Dict[str, FolderInfo],
    files: Dict[str, FileInfo],
    planned: List[Tuple[FileInfo, str, FileTarget]],
    root_id: str,
    protected_ids: set,
) -> int:
    """Predict which legacy folders would become empty after the planned moves."""
    child_counts: Dict[str, int] = {}
    for file in files.values():
        if file.parent_id:
            child_counts[file.parent_id] = child_counts.get(file.parent_id, 0) + 1
    for folder in folders.values():
        if folder.parent_id:
            child_counts[folder.parent_id] = child_counts.get(folder.parent_id, 0) + 1

    for file, _desired, _target in planned:
        if file.parent_id:
            child_counts[file.parent_id] = max(0, child_counts.get(file.parent_id, 0) - 1)

    predicted = 0
    for folder in sorted(folders.values(), key=lambda f: f.depth, reverse=True):
        if folder.id == root_id or folder.id in protected_ids:
            continue
        if child_counts.get(folder.id, 0) == 0:
            print(f"  [DRY] trash empty folder {ROOT_FOLDER_NAME}/{folder.name}")
            predicted += 1
            if folder.parent_id:
                child_counts[folder.parent_id] = max(0, child_counts.get(folder.parent_id, 0) - 1)
    return predicted


async def migrate_connection(
    connection: ConnectionInfo,
    apply_changes: bool,
    delay: float,
    keep_empty_folders: bool,
    verbose: bool,
    stats: Stats,
) -> None:
    print(f"\n[{connection.email}] connecting to Google Drive...")
    access_token = await refresh_google_access_token(connection.encrypted_refresh_token)
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        root_id = await find_root_folder(client, headers, connection)
        if not root_id:
            print(f"[SKIP] {connection.email}: no '{ROOT_FOLDER_NAME}' folder in Drive.")
            stats.connections_skipped += 1
            return

        folders, files = await enumerate_tree(client, headers, root_id)
        stats.files_seen += len(files)
        print(f"  Found {len(folders)} folder(s) and {len(files)} file(s) under {ROOT_FOLDER_NAME}.")

        targets = load_file_targets(list(files.keys()), connection.user_id)

        subject_folders: Dict[str, str] = {}
        desired_subjects = {
            sanitize_folder_name(target.subject, "General") for target in targets.values()
        }
        for folder in folders.values():
            if folder.parent_id == root_id and folder.name in desired_subjects:
                subject_folders.setdefault(folder.name, folder.id)

        planned: List[Tuple[FileInfo, str, FileTarget]] = []
        unmapped: List[FileInfo] = []

        for file in sorted(files.values(), key=lambda f: (f.parent_id or "", f.name)):
            target = targets.get(file.id)
            if not target:
                unmapped.append(file)
                continue

            desired_folder = sanitize_folder_name(target.subject, "General")
            parent = folders.get(file.parent_id) if file.parent_id else None
            if parent and parent.parent_id == root_id and parent.name == desired_folder:
                stats.already_flat += 1
                if verbose:
                    print(f"  [OK] {desired_folder}/{file.name}")
                continue
            planned.append((file, desired_folder, target))

        stats.unmapped += len(unmapped)
        stats.already_flat += sum(
            1
            for file in unmapped
            if (folders.get(file.parent_id) is not None and folders[file.parent_id].parent_id == root_id)
        )

        if planned:
            mode = "MOVE" if apply_changes else "DRY-MOVE"
            for file, desired_folder, target in planned:
                old_path = _legacy_path_hint(folders, file)
                new_name = build_filename(target.roll_number, target.exam_title, target.exam_id)
                rename_note = f" (current name would be {new_name})" if new_name != file.name else ""
                print(f"  [{mode}] {old_path}/{file.name} -> {ROOT_FOLDER_NAME}/{desired_folder}/{rename_note}".rstrip())

        if unmapped:
            print(f"  [REVIEW] {len(unmapped)} file(s) have no archive mapping and will not be moved:")
            for file in unmapped[:20]:
                print(f"    - {_legacy_path_hint(folders, file)}/{file.name}")
            if len(unmapped) > 20:
                print(f"    ... and {len(unmapped) - 20} more")

        if not apply_changes:
            if not keep_empty_folders:
                stats.folders_trashed += _report_dry_run_cleanup(
                    folders, files, planned, root_id, set(subject_folders.values())
                )
            return

        protected_ids = set(subject_folders.values())
        for file, desired_folder, _target in planned:
            try:
                folder_id = await ensure_subject_folder(
                    client, headers, root_id, desired_folder, subject_folders
                )
                protected_ids.add(folder_id)
                await move_file(client, headers, file, folder_id)
                file.parent_id = folder_id
                stats.moved += 1
                print(f"  [DONE] {file.name} -> {desired_folder}/")
                if delay > 0:
                    await asyncio.sleep(delay)
            except Exception as exc:
                stats.errors += 1
                print(f"  [ERROR] Could not move '{file.name}': {exc}")

        if not keep_empty_folders:
            stats.folders_trashed += await trash_empty_folders(
                client, headers, root_id, folders, protected_ids
            )

        # Persist the discovered root ID for future operations (harmless if unused).
        if connection.root_folder_id != root_id:
            try:
                with get_session() as db:
                    row = db.scalar(
                        select(GoogleStorageConnection).where(
                            GoogleStorageConnection.id == connection.id
                        )
                    )
                    if row:
                        row.root_folder_id = root_id
            except Exception as exc:
                print(f"  [WARN] Could not store root folder ID: {exc}")


async def async_main(args: argparse.Namespace) -> int:
    connections = load_connections(args.email, args.connection_id)
    if not connections:
        print("No active Google Drive connections matched the filters.")
        return 1

    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"PaperGrade AI Drive migration — {mode}")
    print(f"Accounts to process: {len(connections)}")
    if not args.apply:
        print("No changes will be made. Pass --apply to execute.")

    stats = Stats(connections=len(connections))
    for connection in connections:
        try:
            await migrate_connection(
                connection,
                apply_changes=args.apply,
                delay=args.delay,
                keep_empty_folders=args.keep_empty_folders,
                verbose=args.verbose,
                stats=stats,
            )
        except Exception as exc:
            stats.errors += 1
            print(f"[ERROR] {connection.email}: {exc}")

    print("\nSummary")
    print(f"  Accounts:             {stats.connections} ({stats.connections_skipped} skipped)")
    print(f"  Drive files seen:     {stats.files_seen}")
    print(f"  Already flat:         {stats.already_flat}")
    print(f"  Moved:                {stats.moved}")
    print(f"  Unmapped (left):      {stats.unmapped}")
    print(f"  Empty folders trashed:{stats.folders_trashed}")
    print(f"  Errors:               {stats.errors}")
    if not args.apply:
        print("\nThis was a dry-run. Re-run with --apply to perform the moves.")
    return 0 if stats.errors == 0 else 2


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="Execute changes (default is dry-run).")
    parser.add_argument("--email", help="Only migrate this Google account email.")
    parser.add_argument("--connection-id", help="Only migrate this google_storage_connections.id.")
    parser.add_argument("--delay", type=float, default=0.1, help="Seconds to sleep between moves (default: 0.1).")
    parser.add_argument(
        "--keep-empty-folders",
        action="store_true",
        help="Do not trash legacy folders after their files are moved.",
    )
    parser.add_argument("--verbose", action="store_true", help="Print files that are already correctly placed.")
    return parser.parse_args(argv)


def main() -> int:
    try:
        return asyncio.run(async_main(parse_args()))
    except KeyboardInterrupt:
        print("\nInterrupted.")
        return 130


if __name__ == "__main__":
    sys.exit(main())
