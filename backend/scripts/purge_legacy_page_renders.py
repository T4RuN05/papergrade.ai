#!/usr/bin/env python3
"""
Legacy Page Renders Purge Tool (Cloudinary & Local Ephemeral Cache).

Safely identifies and purges derived full-page PNGs, resolution variants, and
exam artifact page images under 'renders/' that are now 100% obsolete due to
Pattern B (client-side PDF.js canvas rendering).

INVARIANTS ENFORCED:
- Canonical PDFs in 'submissions/' and 'exams/' are NEVER touched.
- Database records are NEVER modified.
- Supports --dry-run (default) and --apply.
"""

import sys
import os
import argparse
import shutil
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.app.config import settings


def purge_legacy_page_renders(apply_changes: bool = False):
    print("=" * 70)
    print("   PAPERGRADE AI: LEGACY PAGE RENDERS PURGE & STORAGE RECLAMATION")
    print("=" * 70)
    print(f"Mode: {'APPLY (Permanent Deletion)' if apply_changes else 'DRY RUN (Preview Only)'}\n")

    cfg = settings.parsed_cloudinary_config
    cloud_name = cfg.get("cloud_name") or settings.CLOUDINARY_CLOUD_NAME
    print(f"Active Storage Cloud: {cloud_name or 'Local Disk'}\n")

    # 1. Local Disk Page Renders Cleanup
    local_renders_dir = settings.RENDERS_DIR
    local_deleted = 0
    if local_renders_dir.exists():
        local_files = [f for f in local_renders_dir.rglob("*") if f.is_file()]
        print(f"[Local Storage] Found {len(local_files)} cached render file(s) in {local_renders_dir}")
        if apply_changes:
            for sub_entry in local_renders_dir.iterdir():
                if sub_entry.is_dir():
                    shutil.rmtree(sub_entry, ignore_errors=True)
                elif sub_entry.is_file():
                    sub_entry.unlink(missing_ok=True)
            print(f"  -> Successfully wiped local page renders cache ({len(local_files)} files freed).")
    else:
        print("[Local Storage] No local page renders directory found.")

    # Also check local cloudinary_cache for renders/
    local_cache_renders = settings.DATA_DIR / "cloudinary_cache" / "renders"
    if local_cache_renders.exists():
        cache_files = [f for f in local_cache_renders.rglob("*") if f.is_file()]
        print(f"[Local Cache] Found {len(cache_files)} cached render file(s) under cloudinary_cache/renders/")
        if apply_changes:
            shutil.rmtree(local_cache_renders, ignore_errors=True)
            print(f"  -> Successfully wiped local cloudinary_cache/renders ({len(cache_files)} files freed).")

    # 2. Cloudinary Remote Page Renders Cleanup
    if cloud_name and settings.STORAGE_BACKEND in ("cloudinary", "auto"):
        try:
            import cloudinary
            import cloudinary.api

            cloudinary.config(
                cloud_name=cloud_name,
                api_key=cfg.get("api_key") or settings.CLOUDINARY_API_KEY,
                api_secret=cfg.get("api_secret") or settings.CLOUDINARY_API_SECRET,
                secure=True,
            )

            print(f"\n[Cloudinary] Querying resources under prefix 'renders/'...")
            next_cursor = None
            total_found = 0
            total_bytes = 0
            to_delete_ids = []

            while True:
                params = {"type": "upload", "prefix": "renders/", "max_results": 500}
                if next_cursor:
                    params["next_cursor"] = next_cursor

                res = cloudinary.api.resources(**params)
                resources = res.get("resources", [])
                if not resources:
                    break

                for r in resources:
                    pid = r["public_id"]
                    # Strict safety assertion: only delete keys starting with renders/
                    if pid.startswith("renders/"):
                        to_delete_ids.append(pid)
                        total_bytes += r.get("bytes", 0)
                        total_found += 1

                next_cursor = res.get("next_cursor")
                if not next_cursor:
                    break

            print(f"[Cloudinary] Total legacy page render assets identified: {total_found}")
            print(f"[Cloudinary] Total storage to reclaim: {total_bytes / (1024 * 1024):.2f} MB")

            if to_delete_ids:
                print("\nSample assets to be purged:")
                for pid in to_delete_ids[:10]:
                    print(f"  - {pid}")
                if len(to_delete_ids) > 10:
                    print(f"  ... and {len(to_delete_ids) - 10} more.")

            if apply_changes and to_delete_ids:
                print(f"\n[Cloudinary] Permanently deleting {len(to_delete_ids)} assets in batches of 100 with CDN invalidation...")
                deleted_count = 0
                for i in range(0, len(to_delete_ids), 100):
                    batch = to_delete_ids[i : i + 100]
                    del_res = cloudinary.api.delete_resources(batch, invalidate=True)
                    deleted_count += len(del_res.get("deleted", {}))
                    print(f"  -> Batch {i // 100 + 1}: Deleted {len(batch)} assets.")

                print(f"[Cloudinary] Successfully purged {deleted_count} legacy page render assets!")
                print(f"[Cloudinary] Reclaimed {total_bytes / (1024 * 1024):.2f} MB of Cloudinary storage.")
            elif not apply_changes and to_delete_ids:
                print("\n[Dry Run] No remote assets were deleted. Run with --apply to execute permanent purge.")
            else:
                print("[Cloudinary] No assets found under prefix 'renders/'. Clean state!")

        except Exception as e:
            print(f"[Cloudinary ERROR] Failed during remote purge: {e}")

    print("\n" + "=" * 70)
    print("   PURGE OPERATION COMPLETED")
    print("=" * 70)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Purge legacy page renders from storage.")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Execute permanent deletion of legacy page renders (default is dry-run preview).",
    )
    args = parser.parse_args()
    purge_legacy_page_renders(apply_changes=args.apply)
