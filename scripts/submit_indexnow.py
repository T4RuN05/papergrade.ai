"""Submit PaperGrade AI URLs to IndexNow (Bing, Yandex, Seznam, Naver).

IndexNow lets a site notify participating search engines immediately after
content changes instead of waiting for the next crawl. This script:

  1. Verifies the IndexNow key file is live at the expected URL.
  2. Collects URLs from the production sitemap (or --url arguments).
  3. POSTs them to the IndexNow endpoint in batches.

Safe by default: prints the plan without submitting unless --apply is passed.

Setup:
    The key file is served from frontend/public/<key>.txt, so it is available at
    https://www.papergradeai.in/<key>.txt once the frontend is deployed.

Usage:
    python scripts/submit_indexnow.py
    python scripts/submit_indexnow.py --apply
    python scripts/submit_indexnow.py --apply --url https://www.papergradeai.in/about
    python scripts/submit_indexnow.py --apply --sitemap https://www.papergradeai.in/sitemap.xml

Notes:
    * IndexNow accepts up to 10,000 URLs per request; larger sets are chunked.
    * 200 and 202 responses both mean the URLs were accepted.
    * Re-submitting a URL is harmless; engines treat it as a freshness signal.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from typing import Iterable, List, Optional, Sequence, Tuple

DEFAULT_HOST = "www.papergradeai.in"
DEFAULT_KEY = "2da2a6e0a8cf4c67bb9221e86d1e064e"
DEFAULT_KEY_LOCATION = f"https://{DEFAULT_HOST}/{DEFAULT_KEY}.txt"
DEFAULT_SITEMAP = f"https://{DEFAULT_HOST}/sitemap.xml"
INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow"
BATCH_SIZE = 10_000
REQUEST_ATTEMPTS = 3
USER_AGENT = "PaperGradeAI-IndexNow/1.0 (+https://www.papergradeai.in)"


class IndexNowError(RuntimeError):
    pass


def _get(url: str, timeout: float) -> Tuple[int, bytes]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read()
    except urllib.error.URLError as exc:
        raise IndexNowError(f"Could not reach {url}: {exc.reason}") from exc


def check_key(key: str, key_location: str, timeout: float) -> bool:
    """Confirm the key file is live and contains the key."""
    try:
        status, body = _get(key_location, timeout)
    except IndexNowError as exc:
        print(f"  [WARN] {exc}")
        return False

    text = body.decode("utf-8", errors="replace").strip()
    if status != 200:
        print(f"  [WARN] Key file returned HTTP {status}: {key_location}")
        return False
    if key not in text:
        print(f"  [WARN] Key file is live but does not contain the key: {key_location}")
        return False

    print(f"  [OK] Key file verified: {key_location}")
    return True


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def parse_sitemap(xml_bytes: bytes, depth: int = 0) -> Tuple[List[str], List[str]]:
    """Return (page_urls, child_sitemaps) from a urlset or sitemapindex."""
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as exc:
        raise IndexNowError(f"Could not parse sitemap XML: {exc}") from exc

    urls: List[str] = []
    sitemaps: List[str] = []
    for element in root:
        name = _local_name(element.tag)
        if name == "url":
            for child in element:
                if _local_name(child.tag) == "loc" and child.text:
                    urls.append(child.text.strip())
        elif name == "sitemap":
            for child in element:
                if _local_name(child.tag) == "loc" and child.text:
                    sitemaps.append(child.text.strip())
    return urls, sitemaps


def collect_sitemap_urls(sitemap_url: str, timeout: float, depth: int = 0) -> List[str]:
    if depth > 3:
        raise IndexNowError("Sitemap nesting is too deep (max 3 levels).")

    status, body = _get(sitemap_url, timeout)
    if status != 200:
        raise IndexNowError(f"Sitemap returned HTTP {status}: {sitemap_url}")

    urls, children = parse_sitemap(body, depth)
    for child in children:
        print(f"  Reading child sitemap: {child}")
        urls.extend(collect_sitemap_urls(child, timeout, depth + 1))
    return urls


def normalize_urls(urls: Iterable[str], host: str) -> List[str]:
    normalized = []
    seen = set()
    for raw in urls:
        url = raw.strip()
        if not url or url in seen:
            continue
        if not url.startswith(("http://", "https://")):
            continue
        # Only submit URLs for the verified host; IndexNow rejects mixed hosts.
        url_host = url.split("://", 1)[1].split("/", 1)[0].lower()
        if url_host != host.lower():
            continue
        seen.add(url)
        normalized.append(url)
    return sorted(normalized)


def submit_batch(
    urls: Sequence[str],
    host: str,
    key: str,
    key_location: str,
    timeout: float,
) -> Tuple[int, str]:
    payload = {
        "host": host,
        "key": key,
        "keyLocation": key_location,
        "urlList": list(urls),
    }
    data = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": USER_AGENT,
    }

    last_error: Optional[str] = None
    for attempt in range(REQUEST_ATTEMPTS):
        request = urllib.request.Request(
            INDEXNOW_ENDPOINT, data=data, headers=headers, method="POST"
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.status, response.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            last_error = f"HTTP {exc.code}: {body[:500]}"
            if exc.code == 429 or 500 <= exc.code < 600:
                if attempt < REQUEST_ATTEMPTS - 1:
                    time.sleep(2 ** attempt)
                    continue
            return exc.code, body
        except urllib.error.URLError as exc:
            last_error = f"Connection error: {exc.reason}"
            if attempt < REQUEST_ATTEMPTS - 1:
                time.sleep(2 ** attempt)
                continue
            break

    raise IndexNowError(last_error or "IndexNow request failed without a response")


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Submit to IndexNow (default is a dry-run that only lists URLs).",
    )
    parser.add_argument(
        "--url",
        action="append",
        default=[],
        help="Submit this URL (repeatable). Combined with sitemap URLs.",
    )
    parser.add_argument(
        "--sitemap",
        default=DEFAULT_SITEMAP,
        help=f"Sitemap to read URLs from (default: {DEFAULT_SITEMAP}).",
    )
    parser.add_argument(
        "--skip-sitemap",
        action="store_true",
        help="Only submit URLs passed with --url.",
    )
    parser.add_argument("--host", default=DEFAULT_HOST, help=f"Host (default: {DEFAULT_HOST}).")
    parser.add_argument("--key", default=DEFAULT_KEY, help="IndexNow key.")
    parser.add_argument(
        "--key-location",
        default=DEFAULT_KEY_LOCATION,
        help=f"Public key file URL (default: {DEFAULT_KEY_LOCATION}).",
    )
    parser.add_argument("--timeout", type=float, default=30.0, help="Request timeout in seconds.")
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"IndexNow submission - {mode}")
    print(f"Host: {args.host}")

    key_ok = check_key(args.key, args.key_location, args.timeout)
    if not key_ok and args.apply:
        print("\nAborting: deploy the key file before submitting.")
        print(f"Expected file: https://{args.host}/{args.key}.txt")
        return 1

    urls: List[str] = list(args.url)
    if not args.skip_sitemap:
        print(f"Reading sitemap: {args.sitemap}")
        try:
            urls.extend(collect_sitemap_urls(args.sitemap, args.timeout))
        except IndexNowError as exc:
            print(f"  [ERROR] {exc}")
            if not args.url:
                return 1

    urls = normalize_urls(urls, args.host)
    if not urls:
        print("No URLs to submit.")
        return 1

    print(f"URLs to submit: {len(urls)}")
    if not args.apply:
        for url in urls:
            print(f"  [DRY] {url}")
        print("\nThis was a dry-run. Re-run with --apply to submit.")
        return 0

    submitted = 0
    failures = 0
    for start in range(0, len(urls), BATCH_SIZE):
        batch = urls[start:start + BATCH_SIZE]
        print(f"\nSubmitting batch {start // BATCH_SIZE + 1} ({len(batch)} URLs)...")
        try:
            status, body = submit_batch(
                batch, args.host, args.key, args.key_location, args.timeout
            )
        except IndexNowError as exc:
            failures += len(batch)
            print(f"  [ERROR] {exc}")
            continue

        if status in (200, 202):
            submitted += len(batch)
            print(f"  [OK] HTTP {status}: accepted")
        else:
            failures += len(batch)
            reason = {
                400: "Bad request (invalid format)",
                403: "Forbidden (key not valid)",
                422: "Unprocessable (key not found or host mismatch)",
                429: "Too many requests",
            }.get(status, "Unexpected response")
            print(f"  [ERROR] HTTP {status}: {reason}")
            if body:
                print(f"  Response: {body[:500]}")

    print("\nSummary")
    print(f"  Accepted: {submitted}")
    print(f"  Failed:   {failures}")
    return 0 if failures == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
