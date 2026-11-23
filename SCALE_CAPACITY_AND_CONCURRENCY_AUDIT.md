# PaperGrade AI — Scale, Capacity & Concurrency Audit

**File classification:** Engineering decision record (committed to VCS)
**Audit date:** 23 November 2026
**Auditor stance:** Adversarial. Assumes the next exam is the one that breaks it.
**Code baseline:** `7441638` (`main`), clean working tree
**Prior art:** `ARCHITECTURAL_AUDIT_AND_DIARY.md` (Parts 1–3, D-01…D-32, Nov 19 dual-cohort retrospective) — read in full before this document was written.

---

## 0. Verdict first

> **The system will not run out of RAM at 1,000 students. It will run out of *time*, *disk*, *connection handshakes*, and *free-tier quota* — in that order.**

Three questions, answered directly:

| Question | Answer |
|---|---|
| Can the current pilot serve **1,000+ total students** with ease? | **No.** It can serve **~250–300 total students** with ease (≈80–120 concurrently active), or **~400–600** after the free Phase 0 fixes. It will not OOM at 1,000 — it will return 3–15 s latencies, miss same-day results, and exhaust free tiers. |
| How many students can it handle **right now without an OOM crash**? | **~250–300 total** comfortably. **~500** if exams are staggered by branch/day and you accept p95 > 3 s. **1,000** is reachable only after Phase 0 + Phase 1 in §7. |
| What breaks first at 1,000? | **(1)** The 15-second auth cache × 457 ms `NullPool` handshake → thread-pool starvation. **(2)** Single-worker grading at 30–60 s/submission → 8–25 h for 1,000 papers. **(3)** 15–18 GB of PNG page renders per 1,000-student cohort. **(4)** Supabase free 500 MB DB / 5 GB egress. **(5)** 25 Cloudinary credits. |

Two corrections to the public argument, stated up front:

1. **The Nov 18 `QueuePool` crash was a long-hold bug, not a pooling bug.** `confirm-upload` held a pooled connection while downloading a PDF from Cloudinary for 20.5 s; 40 slots × 20 s holds + a default 30 s timeout = HTTP 500. The fix is to **never hold a session across storage I/O**, not to abandon pooling. `NullPool` hides the same bug inside Supavisor instead of fixing it.
2. **"Keep `NullPool` forever" is overfitting to a 56-student test.** It is a defensible *stopgap* — and the immediate Phase 0 plan keeps it — but at 300–1,000 concurrent requests every one pays a 457 ms TLS handshake on one vCPU and consumes a pooler client slot. The permanent answer is **short holds + a bounded pool**, decided by the A/B test in §8, not by either intuition.

The current design is **correct for one branch and one cohort**. It is **not correct for six branches**, and the reason is not CPU — it is that connection reuse was rejected for an incomplete diagnosis, and the auth cache re-reads rows it read 15 seconds ago. §2.1 dismantles both with the diary's own measurements.

---

## 1. Scope and load model

### 1.1 The load the business actually creates

Do not model "1,000 concurrent users". Nobody runs 1,000 tabs. Model the **weekend theory-test day**:

| Parameter | Value | Source |
|---|---|---|
| Branches | 5–6 (Mumbai) | product brief |
| Students per branch | ~100 (12th) + ~100 (11th) = 200 | product brief |
| **Total students** | **1,000–1,200** | derived |
| Exams per student per year | ~6 | product assumption |
| Test scheduling | theory tests concentrated on weekends | product brief |
| Per-branch test window | 2 h, all 200 students of that branch at once | product assumption |
| Pages per script | up to 15 (enforced) | `config.py:107-108` |
| PDF size | ≤ 7 MB (enforced); typical 1.2–2.5 MB | `submissions.py:832-845` |

**Peak concurrency is a fraction of total students, not equal to it:**

| Load class | 1,200 total students | Derivation |
|---|---|---|
| Students logged in simultaneously (peak weekend) | **250–400** | one branch test (200) + other branches browsing (50–200) |
| Logins in the 10 min before a window | **200–350** | one or two branches arriving early |
| Uploads in the final 15 min of a window | **150–250** | late-submitters cluster |
| Portal-state polls | 12–20 req/s | 250–400 sessions ÷ 20 s |
| Notifications polls | 8–13 req/s | 250–400 ÷ 30 s |
| Staff dashboards | 5–15 staff × 1 req/30 s | branch managers + directors |
| **Submissions to grade after one weekend** | **400–800** | two branches testing, or one full institute mock |

That last row is the one that matters operationally. **The hard problem is not accepting 1,200 uploads. It is grading 1,200 scripts before Monday.**

### 1.2 Pilot infrastructure assumed

| Tier | Spec | Binding limit |
|---|---|---|
| Backend VPS | Giganode AMD EPYC Nano — 1 vCPU, 2 GB RAM, 2 TB/mo | CPU + thread pool; not RAM |
| Database | Supabase Postgres free — 500 MB, ~5 GB egress, shared CPU | DB size + egress + connection behavior |
| Object storage | Cloudinary free — 25 credits/mo | storage + delivery credits |
| Frontend | Vercel | effectively unbounded for this traffic |
| Deployment | `backend/Dockerfile:30`, `--workers ${WEB_CONCURRENCY:-1}` | one process for web **and** grading |

> **Deployment drift warning:** `render.yaml:7-8` still declares `plan: free` and `region: oregon`. If that blueprint is ever the live path, (a) the free plan spins down after inactivity and **grading stops**, and (b) every DB call crosses the Atlantic. The stated Giganode pilot must be treated as the source of truth; `render.yaml` should be corrected or deleted so nobody redeploys the wrong topology.

### 1.3 Evidence quality

Numbers in this document are labelled:

- **[M]** measured in this repo or in the diary's Nov 19 benchmark.
- **[D]** derived from code and the measurements.
- **[E]** estimate from vendor documentation / typical hardware; must be validated by the load test in §8.

The single most important measurement is **[M]** from `ARCHITECTURAL_AUDIT_AND_DIARY.md:1257`: a bare `SELECT 1` through `NullPool` from the VPS to Supabase Mumbai is **457 ms**, versus **~35 ms** on a persistent connection. That 422 ms delta is charged **per database connection**, and the app opens **more than one per request**.

---

## 2. Pattern ledger

Verdict legend: **KEEP** (correct, leave it), **TUNE** (correct idea, wrong constant), **REDESIGN** (structure is wrong), **RETIRE** (remove), **ADD** (missing and required).

### 2.1 Load-bearing patterns — the ones that decide capacity

#### P-01 · Per-request database connection (`NullPool`) — **REDESIGN (acceptable stopgap until Phase 0 lands)**

**Where:** `backend/app/db/session.py:35-55`

```python
engine_kwargs["poolclass"] = NullPool
engine_kwargs["pool_pre_ping"] = True
```

**Why it exists:** commit `9a90f4d1` removed `QueuePool(pool_size=15, max_overflow=25)` after a 56-student burst produced `QueuePool limit of size 15 overflow 25 reached`. The Nov 19 retrospective declared `NullPool` "permanently sealed". The intent — never let a client-side pool become a bottleneck in front of PgBouncer — is **correct**. The diagnosis is **incomplete**, and the conclusion "never pool again" overfits to one 56-student test.

**What actually happened on Nov 18 (the part both sides must agree on):**

`confirm-upload` used to call `storage.get_local_path_or_download()` **inside the request's DB session**. That call synchronously downloaded the PDF back from Cloudinary and stalled for **20,554 ms [M]** ([diary §4.2](ARCHITECTURAL_AUDIT_AND_DIARY.md)). The stress test drove 28 uploads and 28 browsing requests (56 concurrent) against 15+25 = 40 slots. Every upload pinned its slot for 20+ s while doing network I/O, so the excess requests sat in the pool queue until SQLAlchemy's **default 30 s `pool_timeout`** (it was never configured) fired: HTTP 500.

That is a **long-hold bug**, not a pooling bug:

> **Rule: a database connection must never be held across object-storage, Gemini, PDF-render, or webhook I/O.**

The bug survives `NullPool` — it just moves the queue from Python into Supavisor, where you cannot see it, bound it, or shed it. And it is **still present in reduced form today**: `confirm-upload` checks out a session at `get_exam_and_active_window` (`submissions.py:779`), then performs the Cloudinary HEAD at `:787` (3 s timeout) before any commit or close. The hold is now ~270 ms instead of 20 s, but it is the same shape.

**The physics (unchanged):**

- Transaction-mode Supavisor (`:6543`) multiplexes *server* connections. It does **not** remove the cost of establishing a *client* connection. `NullPool` pays TCP + TLS + PgBouncer auth on every checkout: **457 ms [M]**.
- A typical authenticated request opens **two** sessions: one in `get_user_auth_state` (`services/auth.py:78`) and one in the endpoint (`get_db`). On an auth-cache miss that is **~914 ms of connection setup per request**.
- Starlette runs sync endpoints and `asyncio.to_thread` work on a **40-token AnyIO limiter** [R7]. Throughput ceiling = `40 / request_duration`. At ~0.9–1.1 s per cold request that is **36–44 req/s for the entire backend**.

**The burst argument — where the `NullPool` defence is right:**

At 56–100 simultaneous requests, a pool *can* be slower than unbounded parallel connections, because 100 independent TLS handshakes overlap in the network while a 40-slot pool serves them in waves. That is not imaginary. With a 30 s timeout it is also how the old crash manifested.

But that advantage is an artifact of **long connection holds**. If a request holds a connection for ~1 s, a 40-slot pool serves 40 req/s and a 100-request burst becomes 3 waves. If it holds for ~50 ms (2–4 quick queries), the same 40 slots serve ~800 req/s and a 100-request burst queues for **< 0.2 s**. The wave disappears — *without* abandoning connection reuse.

At 300–1,000 requests the `NullPool` trade turns into a liability: every request performs a TLS handshake on **one vCPU** (~5–10 ms CPU each), and every open client socket counts against Supavisor's client cap. `NullPool` does not remove that cap; it removes your ability to stay under it gracefully. When the cap is hit, the error comes from the pooler, not from a queue you control.

**Correct design — neither extreme:** keep a bounded pool, but make sessions **query-scoped**:

```python
engine_kwargs = {
    "pool_size": 20,
    "max_overflow": 20,          # 40 = AnyIO thread limiter
    "pool_timeout": 5,           # fail fast; never 30 s
    "pool_recycle": 900,
    "pool_use_lifo": True,       # keep the hottest connections warm
    "pool_pre_ping": False,      # PgBouncer + TCP keepalives already cover this
    "connect_args": {...},       # existing keepalives
}
```

and, in `confirm-upload`, commit/close the read session **before** `storage.file_exists`, then open a fresh short session for the insert (or run the HEAD before the DB work and delete the asset on window rejection). In `_process_submission_sync`, the storage upload already happens *before* `get_session()` (`submissions.py:1004-1023`) — preserve that ordering; it is the correct pattern.

Why pooling is safe with transaction mode: psycopg2 uses unnamed prepared statements, and the app's `SELECT … FOR UPDATE` runs inside one transaction on one client connection — both are supported by PgBouncer transaction pooling [R3][R4]. Keep client connections ≤ the pooler's max client connections; verify the dashboard value before raising `pool_size`.

**Expected gain [D]:** per-request DB setup 457 ms → ~0 ms after warm-up; request duration ~0.9 s → ~0.2 s **only after holds are short**; web tier ceiling **~40 req/s → ~200 req/s**. This is still the highest-leverage change in the document, but the session-scope fix is a prerequisite, not an optional extra.

**If you are not ready to refactor session scope:** keep `NullPool` as an explicit **stopgap**, ship the free fixes in Phase 0, and accept a ceiling of ~400–600 total students. Do not call it permanent. Set a measured trigger: **> 400 total students, or p95 > 1.5 s with Phase 0 applied** → do the session-scope refactor and the A/B test below.

**Decisive experiment (settles the argument):** run L1–L4 from §8 at 100 / 300 / 500 concurrent against (a) `NullPool`, (b) pool 40 / timeout 5 s, with holds short. Measure p95/p99, 5xx, `pg_stat_activity` client count, and CPU. A 56-student test cannot decide 1,000; this can. Until it runs, both "pooling caused the crash" and "pooling is free" are hypotheses.

**Alternative, not a substitute:** co-locate the VPS in Mumbai. It cuts the *query* RTT (~35–40 ms) to ~2–5 ms and improves every round-trip, but it does not remove per-request TLS. Do both.

---

#### P-02 · 15-second auth-state TTL — **TUNE (this is the hidden amplifier)**

**Where:** `backend/app/services/auth.py:58-60`, `:67-101`, `:180`

Every authenticated request calls `get_user_auth_state(user_id)`, which hits the DB on a 15 s cache miss. This is a second connection, separate from the endpoint's session.

**Load math at 1,000 active students [D]:**

```
1,000 users ÷ 15 s TTL            = 66.7 auth DB reads/s
66.7 × 457 ms handshake           = 30.5 threads permanently occupied
```

That consumes **76 % of the 40-thread pool before the request does any real work.** At 300 active users it still burns ~9 threads (23 %). The 15 s TTL was chosen to bound revocation latency; the app already has explicit `invalidate_user_auth_cache()` on password change/role update (`services/auth.py:62-65`). A 5-minute TTL with explicit invalidation gives the same practical revocation guarantee at **1/20th the DB load**.

**Fix:** TTL 15 s → 300 s; keep explicit invalidation; keep `token_version` in the JWT for the fast path. Expected: auth DB reads 66.7/s → 3.3/s at 1,000 students.

---

#### P-03 · Portal ETag / 304 fast path — **KEEP, TUNE the bucket**

**Where:** `backend/app/services/portal_cache.py`, `backend/app/routers/students.py:507-515`

This is the best pattern in the codebase. A validated poll costs **< 2 ms and zero queries [M]**, which is what makes 20 s client polling affordable at all. The in-RAM epoch manager is the right call for a single process.

**The flaw:** `get_etag` appends `now_bucket = int(time.time() // 60)` (`portal_cache.py:35-40`). The stated reason is multi-worker desynchronization. Consequences:

1. The ETag **changes every 60 s even when nothing changed**, so each student is forced into a cold full fetch once per minute. The "95 % 304" claim is therefore capped at **~66 %** for a 20 s poll interval. At 1,000 students that is **16.7 cold fetches/s** — roughly 10–11 threads permanently busy, on top of P-01/P-02.
2. It does not actually make multi-worker safe. If you run two workers, one worker's bump is invisible to the other for up to 60 s; the bucket only *bounds* staleness, it does not synchronize invalidation.

**Fix (single worker, current deployment):** remove the time bucket (`PORTAL_ETAG_BUCKET_SECONDS=0`). Epochs are already process-local and correct. This eliminates **~17 cold portal fetches/s** at 1,000 students — about a 35 % cut in total DB work.

**Fix (multi-worker, Phase 2):** move epochs to Redis and publish `bump_branch` / `bump_user` on a channel; subscribe in each worker. Then ETags are globally consistent and the bucket disappears entirely. Do not scale `--workers` before this is done.

**Also add:** ±20 % jitter to the client `refetchInterval` (`frontend/src/lib/queries.ts:186`), and keep `refetchIntervalInBackground: false` (already correct).

---

#### P-04 · Grading worker embedded in the web process — **REDESIGN (split it)**

**Where:** `backend/app/main.py:31-40`, `backend/app/worker/queue_worker.py:32-55`, `backend/Dockerfile:30`

`lifespan` starts the queue worker and retention daemon inside the API process, and the container runs `uvicorn --workers 1`. This works today for one process but is a **landmine for every future scaling step**:

1. **Boot resets in-flight work.** `start()` calls `recover_stalled_jobs()` with `stale_only=False` (`queue_worker.py:44`, `:138-152`), which sets **every** `PROCESSING` submission back to `QUEUED` regardless of age. If a second web process (or a rolling deploy) starts while the first is grading, the job is reset and **graded twice** — double Gemini spend, duplicate write races.
2. **Retention daemon runs per process.** Two processes means two daemons deleting/annotating the same rows.
3. **A web deploy kills grading mid-submission.** No graceful drain beyond `join(timeout=3.0)`.
4. **The web tier and the grader compete for one vCPU** — acceptable now because Gemini calls are I/O-bound, but not once you raise worker count.

**Fix:** separate the worker from the API.
- `RUN_EMBEDDED_WORKER=false` on the web process; a second systemd unit/container runs the worker loop only.
- Make boot recovery `stale_only=True` by default; require an explicit `ALLOW_BOOT_RESET=true` for the "I know the box crashed" case.
- Use a Postgres advisory lock (`pg_try_advisory_lock`) or a `worker_leader` row so only one retention daemon can run.

This is a prerequisite for P-01/P-05 and for any horizontal scaling. It is also **safe to do today** and does not change user-facing behaviour.

---

#### P-05 · Postgres-as-queue with `FOR UPDATE SKIP LOCKED` — **KEEP**

**Where:** `backend/app/worker/queue_worker.py:191-198`

```python
select(Submission).where(status == 'QUEUED')
  .order_by(roll_number.asc(), created_at.asc())
  .with_for_update(skip_locked=True).limit(1)
```

This is textbook and correct [R16]. `_claim_lock` additionally serializes claimers inside one process, and the row lock handles multiple processes. FIFO by roll number is a deliberate fairness choice and is fine.

**One risk:** `recover_stalled_jobs` (P-04) undermines it. Fix that and this pattern scales to several workers unchanged.

**Tune:** the claim query orders by `roll_number, created_at` with no index support. Add `CREATE INDEX CONCURRENTLY idx_submissions_queue ON submissions (status, roll_number, created_at) WHERE status = 'QUEUED';` — see F-09.

---

#### P-06 · Single-pass multimodal grading — **KEEP**

**Where:** `backend/app/gemini/client.py:675-690`, `queue_worker.py:298`

One Gemini request carries the whole 15-page PDF + rubric, instead of one request per question. This is the right architecture: 1 request/submission instead of 15–20, lower token overhead, fewer quota failures, simpler retries.

**It also sets the throughput wall.** One request ≈ **30–60 s [E]** end-to-end. With `MAX_EVALUATION_WORKERS` default `1` (`config.py:30`) and the pool capped at `min(configured_keys, MAX_EVALUATION_WORKERS)`, grading is strictly sequential:

```
1,000 submissions × 45 s = 12.5 hours
100 submissions  × 45 s = 1.25 hours   (today's reality — acceptable)
```

**The lever is worker count, not a code rewrite.** With 5 keys and 5 workers: **~2.5 h for 1,000**. Each worker holds ~40–70 MB transient (7 MB PDF → ~9.3 MB base64 plus SDK copies), so 5 workers add ~200–350 MB — comfortably inside 2 GB. Raise `MAX_EVALUATION_WORKERS` to 4–5 **only after** P-04 (separate process) and after measuring RSS and Gemini RPM.

Do **not** add the 8:00 PM time gate. The diary records an explicit user mandate against it (`ARCHITECTURAL_AUDIT_AND_DIARY.md:12-17`).

---

#### P-07 · Direct-to-Cloudinary signed upload — **KEEP, close the trust hole**

**Where:** `backend/app/services/storage.py:459-506`, `submissions.py:646-668`, `:745-845`

The browser uploads straight to Cloudinary with a server-signed ticket; the VPS never buffers the 7 MB. `confirm-upload` then does a HEAD probe instead of downloading. This is exactly right and is why 28 concurrent uploads succeeded with zero errors [M, diary §4.5].

**The hole:** for direct uploads, `confirm-upload` trusts **client-asserted** `file_size_bytes` and `page_count` (`submissions.py:811-845`). The server can be told "1 page, 200 KB" for a 100 MB / 60-page file. That is an **unrestricted-resource-consumption** issue [R9, API4] and a direct Cloudinary credit-abuse vector: the file is already stored, and the server only discovers the truth when the worker renders it.

**Fix:** keep the zero-download path, but treat the confirmation as `pending_validation`: enforce generous hard caps on the asserted values (`page_count ≤ 15`, `file_size ≤ 7 MB`) *before* accepting, then have the worker re-validate and mark `FAILED`/`NEEDS_REVIEW` on mismatch. Optionally add `Content-Length`/`ETag` to the signed upload and verify via HEAD. Never let an unvalidated file reach the grading spend.

---

#### P-08 · Local PNG page renders at 150 DPI — **REDESIGN the storage format**

**Where:** `backend/app/services/storage.py:328-353` (400 MB cache), `pdf_service.py:100-123`, `grading.py:260-307`

Renders never go to Cloudinary — they live on the VPS and are served by `FileResponse`. That keeps Cloudinary bandwidth low (good) but creates a **disk cliff**:

```
15 pages × ~1.2 MB PNG (150 DPI, A4) = ~18 MB per student
1,000 students                         = ~18 GB per cohort
11th + 12th cohorts overlapping        = ~36 GB
Retention window                       = 15 days
```

A 2 GB Nano VPS typically ships 30–50 GB of SSD. One full 1,000-student cohort plus OS, images, logs, and the 400 MB Cloudinary cache is already at or past the limit. The failure mode is not graceful: `ENOSPC` breaks uploads, the DB, and the worker at once.

**Fix:**
1. Render **lazily** — only pages actually opened by a grader/student, not all 15 at submission time. Most scripts are never fully reviewed.
2. Encode **WebP or JPEG q≈80** instead of PNG: ~120–250 KB/page, a **6–8× reduction** → 2.5–3 GB per cohort.
3. Consider 110–120 DPI for *display* renders (PNG text stays legible; crops for grading can re-render at higher DPI on demand).
4. Keep the high/low watermark pruning, but base it on bytes and add a **disk free-space guard** that fails the render with a clear 503 rather than letting the filesystem fill.

---

#### P-09 · Retention daemon (15 days) — **KEEP**

**Where:** `backend/app/services/retention_service.py`, `main.py:36`

Deleting PDFs, renders, crops, and `answer_regions` after 15 days is a sensible privacy-and-cost control and aligns with data-minimisation principles. Two conditions: (a) only one instance may run (P-04), (b) the daemon must log and alert on deletion failures — a silent `except: pass` in a cleanup path is how disks fill.

---

#### P-10 · Bounded TTL/LRU caches — **KEEP**

**Where:** `backend/app/services/auth.py:16-55`

Bounded size, TTL, `threading.Lock`, `move_to_end` on hit. Correct. Two notes:
- The password-verify cache key is `sha256(password + ":" + hash)` and stores only `True`. It holds a derivative of plaintext passwords in RAM for 5 minutes. That is acceptable but unnecessary; prefer caching `True` under `sha256(hash + ":" + password)` only if you accept it. Better: drop the cache and rely on login rate limiting — bcrypt cost is the real defence.
- `len()` under lock is O(n); it is only used for diagnostics, so fine.

---

#### P-11 · bcrypt cost 12 + semaphore 3 — **TUNE, and add rate limiting**

**Where:** `backend/app/routers/auth.py:107`, `:198-200`, `services/auth.py:107-110`

`bcrypt(rounds=12)` is ~**250–350 ms on one modern core [E]**. `asyncio.Semaphore(3)` prevents unbounded thread explosion, but on **1 vCPU** three concurrent bcrypt calls do not increase throughput — they just share one core. Effective login throughput ≈ **3–4/s**.

```
350 logins in the 10 min before a window = fine (0.6/s)
350 logins in the final 2 min            = ~90 s, core saturated
1,000 logins in 5 min                    = ~5 min of 100 % CPU
```

The diary already keeps 7-day sessions specifically to avoid login storms [diary:1587]. That is the right mitigation; the remaining gap is the **cold-start morning**.

**Fix:** (a) OWASP accepts bcrypt cost ≥ 10 [R10]; drop to **11** (~120–150 ms) and re-hash on next login, or keep 12 and accept the burst; (b) add per-IP and per-account rate limits on `/auth/login` and `/auth/claim-account` (e.g. 10/min/IP, 5/min/account) [R9, API4]; (c) pre-warm nothing — just make sure clients log in ≥ 10 min early via the exam reminder notification, which already exists.

---

#### P-12 · Client polling (20 s portal, 30 s notifications, 3 s evaluation) — **TUNE**

**Where:** `frontend/src/lib/queries.ts:129-137`, `:179-189`, `:323-329`

| Poller | Interval | At 400 online | Verdict |
|---|---|---|---|
| Portal state | 20 s | 20 req/s | Fine **because** of 304s; add jitter |
| Notifications | 30 s | 13 req/s | Fine |
| Window status | 10 s | 40 req/s if all on exam page | TUNE — 10 s is aggressive for a 2 h window |
| Evaluation status | **3 s** | 133 req/s at 400 | **REDESIGN** — see F-03 |

`refetchIntervalInBackground: false` is correct and already saves the tab-hidden majority.

**Fix:** evaluate only on the staff grading screen, at 5 s, with aggregate payloads; students should get evaluation progress from the 20 s portal poll (or push). Add ±20 % jitter to every interval so a branch that opens the portal together does not synchronize.

---

#### P-13 · Excel roster import (bulk, single commit) — **KEEP**

**Where:** `backend/app/routers/tenancy.py:648-826`, `:88-135`

This is genuinely well built: parse off the event loop, bulk duplicate check, atomic `UPDATE … RETURNING` roll allocation, `add_all`, one commit. The roll allocator is race-safe because the increment happens in a single `UPDATE … RETURNING` (`:122-134`). A 200-row import is 3–4 queries total. No changes needed.

Minor: the seeding branch (`:106-120`) reads existing rolls outside the atomic update. Two concurrent imports on a fresh branch can both seed the same value, but the atomic increment still hands out disjoint ranges, so no collision. Fine.

---

#### P-14 · Tenant scoping by row predicates — **KEEP, with one hole**

**Where:** `submissions.py:512-518`, `:465-475`, `exams.py:299-304`, `students.py:131-186`

Branch/institute checks are explicit and repeated at each handler. Explicit is good (no magic middleware), but it is easy to miss one. It was missed in `/exams/{id}/evaluation-status` — see **F-01**, which is a cross-tenant/cross-student data leak.

**Fix:** centralise into a `assert_exam_access(exam, user)` helper and call it from every route that takes an exam id. Add a test that enumerates all routes with `{exam_id}` and asserts a foreign-branch user gets 403.

---

#### P-15 · Multi-key Gemini rotation with cooldown/backoff — **KEEP**

**Where:** `backend/app/gemini/client.py:297-320`, `:508-613`

Round-robin keys, quarantine on revoked keys, exponential backoff with jitter on 429/503, model fallback chain. This is the right shape [R2][R13]. Two cautions: the fallback loop can retry up to `max(2, num_keys)` attempts per model **per submission**, which can turn a 45 s job into 10+ minutes and hold a worker; add a hard per-submission deadline (e.g. 180 s) and mark `NEEDS_REVIEW` when exceeded. That is also the correct failure mode for a weekend batch.

---

#### P-16 · In-process background threads for notifications/retention — **TUNE**

Fire-and-forget threads (e.g. `dispatch_async_prune_all`, WebPush batches) are bounded now (8 workers) but still spawn `get_session()` per task, each paying the 457 ms handshake **and** consuming a thread outside the AnyIO limiter. The diary already fixed the 80-connection fan-out (D-30); keep an eye on it. With P-01 pooling, these become cheap automatically. Add a global cap (e.g. 4) on background DB threads.

---

#### P-17 · Backward-compatible `/api/v1` rewrite middleware — **KEEP**

**Where:** `backend/app/main.py:82-87`

Transparent path rewrite, zero allocation, no DB. Fine. It does mean every legacy client silently uses the rewrite path, so removing it later requires telemetry. Add a counter before removal.

---

#### P-18 · Security headers + strict CORS — **KEEP, tighten regex**

`main.py:60-80` sets HSTS, `X-Frame-Options`, `nosniff`, referrer policy, permissions policy. Good. `allow_origin_regex=r"^https://.*\.vercel\.app$"` allows **any** Vercel deployment, including an attacker's. Because auth is a Bearer token in `localStorage` (not a cookie), the practical risk is low, but narrow it to the production domain + a preview suffix. Also add `Content-Security-Policy` — currently absent, and the app stores a 7-day JWT in `localStorage`, so XSS is the highest-impact attack.

---

#### P-19 · Compression — **ADD (missing)**

`main.py` registers CORS and custom middleware but **no `GZipMiddleware`**. The staff marks ledger and evaluation status return hundreds of KB to megabytes of JSON **uncompressed** (`submissions.py:542-568`). On a Mumbai mobile connection that is seconds of transfer and wasted Supabase egress.

**Fix:** `app.add_middleware(GZipMiddleware, minimum_size=1024)` (or Brotli at the reverse proxy). Expected 5–10× reduction on JSON. One line.

---

#### P-20 · Rate limiting / load shedding — **ADD (missing)**

There is no limiter anywhere (`main.py`, all routers). Any authenticated student can hammer `/portal-state` or `/evaluation-status`; any unauthenticated client can hammer `/auth/login` (bcrypt CPU) or `/auth/claim-account`. At 1 vCPU this is a one-request-per-connection denial of service [R1][R9].

**Fix:** token-bucket per user + per IP at the edge (nginx `limit_req`) for auth/upload, and an in-process limiter for read endpoints. Shed with 429 + `Retry-After`, not 500. Make limits configurable so the load test can prove them.

---

#### P-21 · Singleton storage client with a requests pool — **KEEP**

`storage.py:323-326` uses one `requests.Session` with `pool_connections=15, pool_maxsize=30`. Correct. Note this pool is **separate** from the DB pool and is the right place for Cloudinary HEAD/download concurrency.

---

#### P-22 · `init_db()` on every boot — **TUNE**

`main.py:34` creates tables at startup. Fine for a pilot; risky once migrations exist. Move to explicit Alembic migrations and keep `init_db()` behind `ENVIRONMENT=test|dev`. Two processes booting concurrently can race DDL in Postgres.

---

### 2.2 Pattern scorecard

| # | Pattern | Verdict | Capacity impact |
|---|---|---|---|
| P-01 | `NullPool` per-request | **REDESIGN** (stopgap OK) | **5× web throughput** after session-scope fix |
| P-02 | 15 s auth TTL | **TUNE** | removes 30 threads @1k users |
| P-03 | ETag 304 + 60 s bucket | **TUNE** | removes 35 % cold fetches |
| P-04 | Worker inside web process | **REDESIGN** | prerequisite for all scaling |
| P-05 | `SKIP LOCKED` queue | **KEEP** | scales with workers |
| P-06 | Single-pass grading | **KEEP** | worker count is the lever |
| P-07 | Direct-to-cloud upload | **KEEP** | close trust hole |
| P-08 | PNG renders 150 DPI | **REDESIGN** | **6–8× less disk** |
| P-09 | 15-day retention | **KEEP** | cost/privacy control |
| P-10 | Bounded TTL caches | **KEEP** | prevents leaks |
| P-11 | bcrypt 12 + sem 3 | **TUNE** | login burst |
| P-12 | Client polling | **TUNE** | 3 s eval poll is the spike |
| P-13 | Bulk Excel import | **KEEP** | already optimal |
| P-14 | Row-level tenant scoping | **KEEP** | fix F-01 |
| P-15 | Key rotation/backoff | **KEEP** | add deadline |
| P-16 | Fire-and-forget threads | **TUNE** | bound them |
| P-17 | `/api/v1` rewrite | **KEEP** | zero cost |
| P-18 | Security headers | **KEEP** | add CSP |
| P-19 | Compression | **ADD** | 5–10× payload |
| P-20 | Rate limiting | **ADD** | availability |
| P-21 | Storage session pool | **KEEP** | correct isolation |
| P-22 | `init_db()` at boot | **TUNE** | migrations |

---

## 3. Concurrency control inventory

### 3.1 What is guarded, and how

| Resource | Mechanism | Location | Assessment |
|---|---|---|---|
| Student account claim | `UPDATE … WHERE account_claimed = 0` + rowcount | `auth.py:352-382` | **Correct.** User row now flushed first (commit `7441638`), so the Postgres FK is satisfied; `rollback()` on a lost race avoids an orphan user. |
| Roll number allocation | `UPDATE branch SET last_roll_sequence = last_roll_sequence + count RETURNING` | `tenancy.py:122-134` | **Correct.** Atomic, no read-modify-write window. |
| Grading job claim | `SELECT … FOR UPDATE SKIP LOCKED` + in-process lock | `queue_worker.py:191-198` | **Correct** in principle, undermined by boot reset (P-04). |
| Upload confirmation race | `if (uploading) return` client guard + atomic supersede | `ActiveExamSubmissionCard.tsx`, `submissions.py:55-150` | Adequate for humans; not a security boundary. |
| Portal epoch state | `threading.Lock` around dict/OrderedDict | `portal_cache.py:22-68` | Correct single-process. Not cross-process. |
| Auth/password caches | `threading.Lock` per cache | `services/auth.py:16-55` | Correct. |
| Export/annotated PDF generation | `_export_dirty_lock` | `grading_service.py:38` | Correct in-process. Check it covers the export route too. |
| Retention cleanup | Daemon thread in `lifespan` | `main.py:36` | **Wrong multiplicity** — one per process (P-04). |
| Notifications prune | Async daemon thread | `submission` path (D-30) | Adequate; bound the thread count. |

### 3.2 Races that exist today

| ID | Race | Trigger | Consequence | Fix |
|---|---|---|---|---|
| **F-04** | Boot reset vs in-flight grading | second process, rolling deploy, or crash-restart while jobs are `PROCESSING` | same submission graded twice (double spend), duplicate answer rows | `stale_only=True` on boot; single-worker leader lock (P-04) |
| **F-05** | Dual sessions per request | auth cache miss | 2× 457 ms handshake, 2 connections per request | pool (P-01) + longer auth TTL (P-02) |
| **F-06** | ETag bucket boundary | every 60 s | synchronized-ish burst of full portal fetches; 66 % max 304 rate | remove bucket / Redis epochs (P-03) |
| **F-07** | Evaluation poll stampede | many clients on the exam page | 3 s × N requests, each serializing every submission | aggregate endpoint + staff-only + 5 s (F-03) |
| **F-08** | Cloudinary credit burn via forged bounds | client asserts 1 page / 200 KB | storage + grading cost for an arbitrary upload | server-side validate after HEAD; hard caps pre-accept (P-07) |
| **F-09** | Queue claim without index | 1,000 queued rows | `ORDER BY roll_number, created_at` sorts the queue every claim | partial index (P-05) |
| **F-10** | Login burst | 200–350 logins in 10 min | 1 core at 100 % for ~1 min; p95 spikes for everyone | bcrypt 11, rate limit, communicate early login (P-11) |
| **F-11** | Export generation to a shared path | two concurrent downloads | both write the same annotated PDF | in-process lock only; add file lock or write-temp-then-rename |
| **F-12** | Grace-period mismatch | client starts assembling at T-1:30 | `request-upload` rejects after deadline though UI shows the form | hide form in grace **or** allow grace on request-upload |

---

## 4. New defects found in this audit

Severity uses a simple blast-radius × likelihood judgement. These are **new** (not in D-01…D-32).

> **F-01 is the only one that must ship before the next live exam.**

### F-01 · IDOR / cross-tenant leak in `GET /exams/{exam_id}/evaluation-status` — **CRITICAL**

**Evidence:** `backend/app/routers/exams.py:224-285`

```python
def get_exam_evaluation_status(
    exam_id: str,
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    ...
    subs = db.scalars(select(Submission).where(Submission.exam_id == exam_id, ...)).all()
    ...
    "submissions": submissions_list   # id, roll_number, student_name, marks, status
```

- There is **no role check, no branch check, no institute check, and no ownership check**.
- `get_current_user_optional` only decodes the JWT; it does not even verify `is_active`/`token_version` (`services/auth.py:197-211`).
- Any authenticated user — including any student, from any branch — can enumerate **every student's name, roll number, awarded marks, and evaluation errors** for any exam id they can guess or observe.

This is OWASP API1:2023 Broken Object Level Authorization [R9], the most common API vulnerability class. For a coaching institute, leaking an entire branch's marks before publication is a business-ending event, not a bug.

**Fix:**
1. Require `require_branch_manager` (or `require_role(["BRANCH_MANAGER","INSTITUTE_DIRECTOR","ROOT_ADMIN","TEACHER"])`).
2. Apply the same branch/institute checks used in `get_submissions_for_exam` (`submissions.py:512-518`).
3. Default to aggregate counts only; expose `submissions[]` behind `?include=submissions` for staff.
4. Add a regression test: student token + foreign exam → **403**, and the payload must not contain other students' names.

### F-02 · Evaluation-status returns every submission on every poll — **HIGH (cost/latency)**

**Evidence:** `exams.py:238-285`; client polls every 3 s (`queries.ts:129-137`).

The docstring says "single-query … < 5 ms". In reality it loads **all** `Submission` ORM objects, builds a dict per row, and serializes the list. At 1,000 submissions the payload is **~300–400 KB [D]**.

```
50 staff/students polling at 3 s = 16.7 req/s
16.7 × 350 KB                    ≈ 5.8 MB/s ≈ 47 Mbps sustained
serialization ~10–20 ms each     = 17–33 % of one core
```

Add the client-to-origin path and this is the single largest avoidable bandwidth and CPU cost in the system. It compounds with F-01: the leaked data is also the expensive data.

**Fix:** return `{summary, progress_percent, updated_at}` by default; full list only with `?include=submissions` and a cursor. Cache the summary for 1–2 s server-side (a 3 s poll does not need per-millisecond freshness). Restrict to staff.

### F-03 · The staff marks ledger fetches every answer for every submission — **HIGH (egress)**

**Evidence:** `submissions.py:501-568`

Loads all submissions **and** all `Answer` rows (`15,000` rows at 1,000 students), then nests them. Payload ≈ **3–4 MB [D]**. No pagination. Supabase free egress is ~5 GB/month [R5].

```
10 staff × 20 refreshes/day × 3.7 MB × 30 days ≈ 22 GB/month from one screen
```

That is 4× the free egress allowance before a single student loads a script.

**Fix:** omit `answers` from the list endpoint (the UI already fetches details on demand for the portal, per D-28); paginate at 50–100; add `GZipMiddleware`. Expected 90 % payload reduction.

### F-04 · Boot recovery resets all in-flight grading — **HIGH (data/spend)**

Covered in P-04: `queue_worker.py:44` calls `recover_stalled_jobs()` with `stale_only=False`, which requeues **every** `PROCESSING` row (`:138-152`). Today, with one process, it only runs at boot; once you add a second process or a rolling restart, it duplicates work and can write duplicate answer rows.

**Fix:** `stale_only=True` by default; explicit env flag for forced recovery; leader lock.

### F-05 · Two DB sessions per authenticated request — **HIGH (throughput)**

`get_current_user` → `get_user_auth_state` opens `get_session()` (`services/auth.py:78`), and the endpoint opens `get_db()`. With `NullPool`, a cache miss costs **2 × 457 ms** of connection setup. At 1,000 users with a 15 s TTL this is ~67 extra connections/s.

**Fix:** P-01 + P-02. Optionally pass a single session into auth resolution.

### F-06 · Disk exhaustion from PNG renders — **HIGH at 1,000**

Covered in P-08. ~18 GB per 1,000-student cohort; two cohorts overlap inside the 15-day retention window.

### F-07 · Uncompressed multi-megabyte JSON — **MEDIUM**

No `GZipMiddleware` (`main.py`). One line fixes 5–10× of transfer cost.

### F-08 · No rate limiting anywhere — **MEDIUM–HIGH**

Covered in P-20. Login and upload are the expensive endpoints; both are unauthenticated/cheap to spam.

### F-09 · Queue claim has no supporting index — **MEDIUM**

`ORDER BY roll_number, created_at WHERE status='QUEUED'` will sort at claim time. At 1,000 queued rows the sort is small, but it runs once per claim (once per 45 s per worker) — negligible today, but the index is free and prevents a surprise later.

### F-10 · `page_count` / `file_size` trusted from the client — **MEDIUM–HIGH (cost)**

Covered in P-07. The file is already in Cloudinary before validation.

### F-11 · Grace-period UX contradicts the API — **LOW**

`request-upload` uses `allow_grace=False` (`submissions.py:668`); `confirm-upload` uses `True` (`:779`); the card shows the upload form during grace (`ActiveExamSubmissionCard.tsx:563`). A student who starts assembling at T-1:30 gets a 400 despite the banner. Fix by hiding the form in grace (finish-only), or allow grace on request-upload too. Decide the policy once and encode it in one place.

### F-12 · Deactivated users can reach optional-auth endpoints — **LOW–MEDIUM**

`get_current_user_optional` skips `is_active`/`token_version` checks. Combined with F-01 it widens the leak. Fix as part of F-01.

---

## 5. Capacity model

### 5.1 Memory budget — why 2 GB does not OOM

| Component | Steady RSS | Peak | Basis |
|---|---|---|---|
| Python + FastAPI + SQLAlchemy + pydantic + fitz + SDKs | 220–280 MB | 320 MB | [E] typical for this dependency set |
| Grading worker (1) | — | 40–70 MB | 7 MB PDF + ~9.3 MB base64 + SDK copies |
| Grading payload × 4 extra workers (Phase 1) | — | +160–280 MB | same per worker |
| Cloudinary cache | 0 (disk) | 400 MB **disk** | `storage.py:328` |
| 40 concurrent small JSON requests | 20–40 MB | 80 MB | request/response buffers |
| 40 concurrent 7 MB multipart fallbacks (worst case) | — | 280 MB | should never happen on the direct path |
| Portal payloads (400 sessions) | 10–20 MB | 40 MB | 30–50 KB each |
| **Total current** | **~300–350 MB** | **~500 MB** | leaves >1.5 GB free |
| **Total with 5 grading workers** | **~350–450 MB** | **~800 MB** | still safe on 2 GB |

**Conclusion:** RAM is not the constraint. Even at 1,000 students and 5 grading workers the box will sit under 1 GB. The failure modes are latency, thread starvation, disk, and quotas — all of which are recoverable without a reboot if you add the guards.

**The one way to OOM this box:** raise `WEB_CONCURRENCY` to 4 **and** `MAX_EVALUATION_WORKERS` to 5 without splitting the worker. Four processes × (280 MB base + 70 MB grading) + in-process duplication ≈ 1.4 GB plus request spikes, and every process would start its own queue worker and retention daemon. Don't.

### 5.2 Web-tier throughput — the real ceiling today

Starlette's AnyIO limiter is **40 threads** [R7]. Sync endpoints and `asyncio.to_thread` share it.

| Route | Duration today [D] | Thread held | Throughput if only this route |
|---|---|---|---|
| Portal 304 | ~1–2 ms [M] | 0 (event loop) | unbounded by pool |
| Portal cold | ~0.65–1.0 s | 0.65 s | ~60 req/s |
| `request-upload` | ~0.835 s [M] | 0.835 s | ~48 req/s |
| `confirm-upload` | ~1.11 s [M] | 1.11 s | ~36 req/s |
| Login | ~0.5–0.9 s | 0.5 s | ~3–4 logins/s (bcrypt-bound) |
| `evaluation-status` | ~0.6 s + 350 KB | 0.6 s | ~66 req/s (plus bandwidth) |
| Marks ledger | ~1.2–2.0 s + 3.7 MB | 1.2 s | ~33 req/s (plus egress) |
| Page image | ~5–20 ms | 0 (FileResponse) | disk/network-bound |

**Mixed-load ceiling:** ~35–50 DB-backed req/s before p95 crosses 2 s. That is the number that matters, and it is set by **P-01 × P-02**, not by the VPS's raw CPU.

At 1,000 total students / 300–400 online:

```
portal 300/20 s            = 15 req/s   (2/3 are 304 → cheap)
notifications 300/30 s     = 10 req/s
auth TTL churn 300/15 s    = 20 req/s   ← pure overhead
cold portal 300/60 s       =  5 req/s   ← 35 % amp from the ETag bucket
staff dashboards           =  0.5–2 req/s
------------------------------------------------
≈ 50–52 req/s               → at or above the current ceiling
```

That is the direct answer: **~300 active students saturate the current backend.** Not because of CPU, but because 20 of those 50 req/s are the auth cache re-reading rows it already read 15 seconds ago, each paying a 457 ms handshake.

**With P-01 + P-02 + P-03 [D]:**

```
request duration 0.9 s → 0.2 s
40 threads / 0.2 s      = 200 req/s
auth churn 300/300 s    = 1 req/s
cold portal (no bucket) = ~1 req/min/student → 5 req/s
```

→ **~200 req/s**, i.e. 4–5× headroom over the 50 req/s that 1,000 students generate. Add `GZip` and the payload fixes and the *bandwidth* ceiling moves too.

### 5.3 Disk budget

| Item | 1 cohort (1,000) | With WebP/lazy (P-08) |
|---|---|---|
| Page renders | ~18 GB | ~2.5–3 GB |
| PDFs in Cloudinary cache | ≤ 400 MB | ≤ 400 MB |
| Exports/annotated | 1–3 GB | 1–3 GB |
| Logs | 0.2–1 GB | 0.2–1 GB |
| **Total** | **~20 GB** | **~5 GB** |

At 1,000 students with two cohorts (11th + 12th) inside the 15-day window, the current design needs **~36–40 GB**; a typical Nano volume is 30–50 GB. This is the most likely *hard* failure at 1,000 and it happens silently until `ENOSPC`.

### 5.4 Database budget (Supabase free 500 MB, ~5 GB egress)

Rows per submission [D]:

| Table | Rows | Bytes/row | Total |
|---|---|---|---|
| `submissions` | 1 | ~2 KB | 2 KB |
| `answers` | 15 | ~1.5 KB | 22 KB |
| `answer_regions` | 15 | ~0.5 KB | 7 KB |
| `usage_events` | 1–3 | ~0.5 KB | 1.5 KB |
| notifications/audit | 1–2 | ~0.5 KB | 1 KB |
| **per submission** | | | **~34 KB** |

```
1,000 students × 6 exams = 6,000 submissions × 34 KB ≈ 200 MB
+ indexes (~30 %)                                     ≈ 260 MB
+ usage/audit/revaluation history                     ≈ 300–450 MB
```

**Free tier is exhausted in roughly one academic year**, sooner if the branch runs more than 6 exams or many revaluations. Note that `answer_regions` are purged after 15 days (good), but `answers` and `usage_events` are not.

**Egress** is worse than size: the marks ledger alone can burn ~22 GB/month (§F-03), and page renders are served from the VPS, not Supabase, so the DB egress is almost entirely JSON. With F-03 fixed and gzip on, DB egress drops to a few hundred MB/month.

**Verdict:** Supabase Pro (8 GB, 250 GB egress, no pause, backups) is **required** before 1,000 students, not optional. Budget it with Phase 1.

### 5.5 Cloudinary credits (25/month)

Cloudinary's credit model charges storage, delivery bandwidth, and transformations against one pool [R11]. Here:

| Flow | Volume at 1,000 students | Credits [D] |
|---|---|---|
| Store PDFs (`raw`, no transformation) | ~1.5 GB per cohort | ~1.5 |
| Grading worker downloads each PDF once | ~1.5 GB | ~1.5 |
| Students/faculty view full PDFs (2×) | ~3 GB | ~3 |
| Page renders | **0** — served from VPS | 0 |
| **Per cohort** | | **~6** |
| **Per month (two cohorts + re-views)** | | **~10–14** |

So 25 credits is **~2× headroom**, not an immediate wall — *provided* renders stay local and PDFs stay `raw`. The wall is abuse (F-10) and repeat viewing. Note that every Cloudinary delivery also has its own rate limits and occasional throttling; the diary measured a 20.5 s download stall before D-27, which is exactly why the direct-upload/HEAD-probe design exists.

**Better long-term default: Cloudflare R2.** 10 GB free storage and **zero egress** [R12], and `CloudflareR2StorageService` already exists (`storage.py:163-299`). Switch `STORAGE_BACKEND=r2` for PDFs before 1,000 students; keep Cloudinary only if you need transformations. This removes both the credit and the throttling risk and makes faculty review bandwidth free.

### 5.6 Grading throughput

| Workers | Per-submission [E] | 100 papers | 400 papers | 1,000 papers |
|---|---|---|---|---|
| 1 (today) | 30–60 s | 0.8–1.7 h | 3.3–6.7 h | **8.3–16.7 h** |
| 3 | 30–60 s | 0.3–0.6 h | 1.1–2.2 h | 2.8–5.6 h |
| 5 | 30–60 s | 0.2–0.3 h | 0.7–1.3 h | **1.7–3.3 h** |

Assumes one Gemini call per submission and no retry storm. A retry storm can double or triple this — hence the per-submission deadline in P-15. This table, not the web tier, is why "1,000 students" is currently a Monday-morning problem.

---

## 6. Capacity verdict: current vs optimised

### 6.1 Current pilot (1 vCPU / 2 GB, `NullPool`, 15 s auth TTL, 1 grading worker, PNG renders, free tiers)

| Dimension | Comfortable | Degraded but alive | Fails |
|---|---|---|---|
| Active students browsing | **80–120** | 120–300 | >300 |
| Total students supported | **250–300** | 300–500 (staggered exams) | >500 |
| Logins in 10 min | 200 | 350 | >500 in 10 min |
| Uploads in 15 min | 200 | 400 | >500 |
| Submissions graded per day | 100–150 | 250 | >300 same-day |
| Concurrent staff dashboards | 3–5 | 8 | >10 |
| Page renders on disk | 1 cohort (~18 GB) | 1.5 cohorts | 2 cohorts |

**Bottom line: ~250–300 total students with ease. No OOM at 1,000, but SLO failure.**

### 6.1b After Phase 0 only (still `NullPool`, same 1 vCPU, free tiers; auth TTL, ETag bucket, payload, gzip and worker fixes applied)

| Dimension | Comfortable | Degraded | Fails |
|---|---|---|---|
| Active students browsing | **150–250** | 250–400 | >400 |
| Total students supported | **400–600** | 600–800 | >800 |
| Logins in 10 min | 300 | 500 | >700 |
| Uploads in 15 min | 300 | 500 | >700 |
| Submissions graded per day | 100–150 (grading unchanged) | 250 | >300 same-day |
| Concurrent staff dashboards | 5–8 | 12 | >15 |

**This is the recommended immediate state:** it removes the self-inflicted connection churn without touching the engine. Grading remains the wall until Phase 1 raises worker count.

### 6.2 After Phase 0 + Phase 1 (session-scoped pool, auth TTL, ETag fix, payload fixes, gzip, worker split, 2 vCPU / 4 GB, 5 grading workers, R2, Supabase Pro, WebP renders)

| Dimension | Comfortable | Degraded | Fails |
|---|---|---|---|
| Active students browsing | **600–1,000** | 1,000–1,500 | >1,500 |
| Total students supported | **1,500–2,500** | 2,500–3,500 | >3,500 |
| Logins in 10 min | 800 | 1,500 | >2,000 |
| Uploads in 15 min | 600 | 1,000 | >1,500 |
| Submissions graded per day | 1,000–1,500 (≤4 h) | 2,000 (≤8 h) | >2,500 |
| Concurrent staff dashboards | 15–20 | 30 | >40 |
| Page renders on disk | 2 cohorts (~6 GB) | 4 cohorts | >5 cohorts |

### 6.3 After Phase 2 + Phase 3 (Redis epochs/limits, stateless web replicas, worker autoscaling, partitioned DB, CDN for renders)

| Dimension | Comfortable |
|---|---|
| Total students | **5,000–10,000** |
| Active students | 2,000–3,000 |
| Branches | 20+ |
| Grading | queue-depth-driven autoscaling; 1,000 in <2 h |

### 6.4 Per-branch reality check (the number to quote to the client)

| Scenario | Current | Optimised |
|---|---|---|
| 1 branch, 12th only (~100) | comfortable, same-day results | trivial |
| 1 branch, 11th + 12th (~200) | comfortable if exams staggered | trivial |
| 2 branches same Saturday (~400) | degraded; grading runs into Sunday | comfortable |
| All 6 branches same Saturday (~1,200) | **fails** — 8–25 h grading, disk/quota risk | comfortable, same-day |

---

## 7. Optimisation plan

Sequenced by **risk removed per unit of effort**. Phase 0 is free and can ship this week; do not buy hardware to compensate for a 457 ms handshake.

### Phase 0 — Correctness and free capacity (1–2 days, no infra change)

| # | Change | File(s) | Expected effect | Acceptance |
|---|---|---|---|---|
| 0.1 | **Fix F-01**: staff-only + tenant checks on `evaluation-status`; aggregate by default | `routers/exams.py` | closes critical data leak; −90 % payload | student token on foreign exam → 403; payload has no names/rolls |
| 0.2 | **Auth TTL 15 s → 300 s**, keep explicit invalidation | `services/auth.py:58-60` | −20 req/s at 300 online; removes ~30 threads at 1k | password change still revokes within 1 request (existing test) |
| 0.3 | **Drop the 60 s ETag bucket** (`PORTAL_ETAG_BUCKET_SECONDS=0`) | `services/portal_cache.py:35-40` | −35 % portal DB work | `test_portal_etag` passes; 304 rate > 95 % on unchanged state |
| 0.4 | **Split the worker** from the API (`RUN_EMBEDDED_WORKER=false` + separate unit) and make boot recovery `stale_only=True` | `main.py`, `worker/queue_worker.py:44` | removes duplicate-grading landmine | restart web during grading → job continues; no status regression |
| 0.5 | **Trim payloads**: `submissions/exam` omits `answers` by default; add `?include=answers`; paginate | `routers/submissions.py:501-568` | 3.7 MB → ~400 KB | ledger screen renders from summary; detail fetch still works |
| 0.6 | **Add `GZipMiddleware`** (or nginx brotli) | `main.py` | 5–10× smaller JSON | `Content-Encoding: gzip` on ledger/eval responses |
| 0.7 | **Render discipline**: WebP/JPEG q80 at 110–120 DPI, lazy render on first view, disk-free guard | `services/pdf_service.py`, `routers/grading.py` | 18 GB → 2.5–3 GB per cohort | 1,000-page render job keeps disk < 70 % |
| 0.8 | **Validate asserted upload bounds** before accepting; mark `pending_validation` | `routers/submissions.py:811-845` | closes cost-abuse vector | forged `page_count=1` on a 60-page file → rejected or flagged |
| 0.9 | **Rate limit** auth + upload + portal (per IP and per user) | `main.py` / nginx | protects 1 vCPU from trivial DoS | 11th login attempt in a minute → 429 + `Retry-After` |
| 0.10 | **Jitter** all client poll intervals ±20 %; eval poll 3 s → 5 s and staff-only | `frontend/src/lib/queries.ts` | removes synchronized spikes | no request bursts at interval boundaries in load test |
| 0.11 | **Grace policy**: hide the upload form during grace (or allow grace on `request-upload`) | `submissions.py`, `ActiveExamSubmissionCard.tsx` | removes a confusing 400 | upload started at T-1:30 either completes or is not offered |
| 0.12 | Partial index on the queue; `pool_pre_ping` removed | `db/migrations`, `db/session.py` | faster claims; removes a wasted liveness round-trip | `EXPLAIN` shows index scan on claim |
| 0.13 | **Never hold a session across network I/O**: in `confirm-upload`, commit/close the read session before `storage.file_exists`, then reopen for the insert (or HEAD before DB work and delete on rejection) | `routers/submissions.py:775-845` | removes the 270 ms–3 s hold that caused the original crash shape | a 100-concurrent confirm burst never exceeds 5 s pool checkout even if Cloudinary is slow |

**Phase 0 gate:** with the same 1 vCPU, 300 simulated students polling for 10 min → p95 < 1.5 s, 0 5xx, DB connections < 40. Grading restart during a live job does not duplicate it.

### Phase 1 — Buy the headroom that matters (~$25–60/mo, 1 week)

| # | Change | Expected effect | Acceptance |
|---|---|---|---|
| 1.1 | **A/B test, then adopt** a bounded pool (20 + 20 overflow, 5 s timeout, recycle 900, LIFO, no pre-ping) against `:6543` — **after 0.13** | 457 ms → ~0; 40 → ~200 req/s | A/B at 100/300/500 concurrent: pooled p95 ≤ NullPool p95, 0 pool timeouts, Supavisor clients ≤ 40 |
| 1.2 | **Co-locate** the VPS with Supabase (Mumbai) | query RTT 35–40 ms → 2–5 ms | `SELECT 1` p50 < 15 ms |
| 1.3 | **2 vCPU / 4 GB** | 2× headroom for web + 3–5 grading workers | 5 workers graded 1,000 PDFs in < 4 h |
| 1.4 | **Supabase Pro** (8 GB, 250 GB egress, backups, no pause) | removes the 500 MB/5 GB walls | 1,000 students × 6 exams fits with > 80 % headroom |
| 1.5 | **R2 for PDFs** (`STORAGE_BACKEND=r2`) | zero egress, 10 GB free, no throttling | student PDF download p95 < 500 ms; Cloudinary credits flat |
| 1.6 | **`MAX_EVALUATION_WORKERS=4–5`** in the separate worker process | 1,000 papers in 1.7–3.3 h | RSS < 1.2 GB; Gemini 429 rate handled by existing rotation |
| 1.7 | **Per-submission deadline** (180 s) and `NEEDS_REVIEW` on timeout | prevents retry storms from stalling the queue | a hung job never blocks the next paper > 3 min |

**Do not switch the pool on without 0.13 and the A/B.** If the A/B shows pooled is worse under your real burst shape, keep `NullPool` and cap the institution at ~600 students until Phase 2; that is a valid business decision, not a technical failure.

**Phase 1 gate:** full dress rehearsal — 1,200 synthetic students, 6 branch scopes, 6 exams, 1,200 uploads across 2 h, 1,000 grading jobs. Pass = 0 5xx, p95 upload-confirm < 1 s, p95 portal < 500 ms, all 1,000 graded < 4 h, disk < 70 %, **zero** free-tier overage.

### Phase 2 — Remove single-process assumptions (2–4 weeks)

| # | Change | Why |
|---|---|---|
| 2.1 | Redis for portal epochs (pub/sub invalidation) | lets you run 2–4 web workers without the 60 s bucket |
| 2.2 | Redis/distributed rate limiting + queue (ARQ/RQ) or keep Postgres queue with `SKIP LOCKED` | consistent limits across replicas |
| 2.3 | CDN in front of page renders (signed R2 URLs) | removes image bytes from the VPS; 2 TB bandwidth becomes irrelevant |
| 2.4 | DB indexes + partitioning for `usage_events`/`audit_logs`; archive submissions older than 1 year | keeps the working set small and queries predictable |
| 2.5 | Alembic migrations; retire `init_db()` in production | safe multi-instance boot |
| 2.6 | Observability: p50/p95/p99 per route, DB pool saturation, queue depth, Gemini error rate, disk free, Cloudinary credits | you cannot tune what you do not measure; add SLO alerts |
| 2.7 | Load shedding and adaptive concurrency limits [R1] | degrade polling before degrading uploads |

**Phase 2 gate:** two web replicas + two worker replicas under 1,000 concurrent simulated sessions; kill one replica mid-run; no 5xx, no duplicate grading, no stale portal state > 5 s.

### Phase 3 — Horizontal and multi-tenant at scale

- Stateless web tier behind a load balancer; sticky sessions not required (JWT).
- Worker autoscaling on `QUEUED` depth, per-branch fairness (weighted queues) so one branch's 200 papers cannot starve another's.
- Read replica for dashboards/reporting; primary for writes.
- R2 lifecycle rules + per-tenant storage quotas.
- Chaos drills: DB failover, Cloudinary/R2 outage, Gemini total quota exhaustion. The correct behaviour is **accept and queue**, never lose a submission. Uploads are the one thing that must be durable at all costs.

---

## 8. Load-test plan (the numbers above are models until this runs)

Use k6 or Locust against a staging stack that mirrors the pilot (same region, same pooler, same free-tier limits). Scenarios, in order:

| # | Scenario | Shape | Pass criteria |
|---|---|---|---|
| L1 | **Portal steady state** | 400 VUs, 20 s poll with ETag, 20 min | p95 < 500 ms, 304 rate > 90 %, 0 5xx |
| L2 | **Login cold start** | 300 logins over 10 min, then 100 over 2 min | p95 < 2 s, no 5xx; CPU < 90 % sustained |
| L3 | **Window open** | 200 students: login → request-upload → direct PUT (stub) → confirm, over 15 min | p95 confirm < 1.5 s; 100 % recorded |
| L4 | **Late burst** | 200 uploads in the final 2 min | 0 lost; queue drains < 5 min |
| L5 | **Evaluation watch** | 100 staff polling eval-status at 3 s + 300 students on portal | p95 < 1 s, egress < 10 MB/s |
| L6 | **Ledger** | 10 staff refreshing the marks screen | p95 < 2 s, payload < 500 KB with gzip |
| L7 | **Grading soak** | 1,000 queued PDFs, 5 workers | all terminal < 4 h; RSS < 1.2 GB; no duplicate `answers` |
| L8 | **Chaos** | restart web during L7; kill a worker; DB connection drop | no duplicate grading; no lost submissions; recovery < 2 min |

Instrument: `pg_stat_activity` count, pool checkout wait, AnyIO thread saturation (via `anyio.to_thread.current_default_thread_limiter()`), RSS, disk free, Cloudinary usage API, Gemini 429 rate, and per-route latency histograms.

**Do not tune by feel again.** The Nov 19 conclusions were drawn from 56 students and one 28-upload burst; that is enough to prove correctness, not capacity. L1–L8 at 1,000+ is what proves 1,000+.

---

## 9. What not to change

The audit is deliberately harsh, so be equally clear about what is right:

- **`SKIP LOCKED` queue** — correct, scales, keep.
- **Single-pass multimodal grading** — correct; fix throughput with workers, not more API calls.
- **Direct-to-cloud uploads with HEAD confirmation** — correct; the 20.5 s download trap is genuinely gone.
- **ETag/304 with in-RAM epochs** — the highest-value optimisation in the codebase; keep the idea, remove the bucket.
- **Bulk Excel import with atomic roll allocation** — better than most production code.
- **15-day retention with derived-artifact purge** — right for privacy and cost.
- **Explicit tenant predicates** — verbose but auditable; centralise, don't hide.
- **7-day sessions to avoid login storms** — right call; the remaining risk is the 10-minute cold start.
- **No 8:00 PM gate** — respect the operational mandate; solve throughput with workers.

---

## 10. References

- **[R1]** Google SRE Book — *Handling Overload*, *Addressing Cascading Failures*. https://sre.google/sre-book/handling-overload/
- **[R2]** AWS Builders' Library — *Timeouts, retries, and backoff with jitter*. https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/
- **[R3]** PgBouncer — *Features / transaction pooling caveats*. https://www.pgbouncer.org/features.html
- **[R4]** Supabase — *Connection pooling (Supavisor), transaction mode*. https://supabase.com/docs/guides/database/connecting-to-postgres
- **[R5]** Supabase — *Pricing and free-tier limits*. https://supabase.com/pricing
- **[R6]** SQLAlchemy 2.0 — *Connection Pooling*. https://docs.sqlalchemy.org/en/20/core/pooling.html
- **[R7]** Starlette — *Threadpool / AnyIO limiter (40 tokens)*. https://www.starlette.io/threadpool/
- **[R8]** FastAPI — *Concurrency and async/await*. https://fastapi.tiangolo.com/async/
- **[R9]** OWASP API Security Top 10 (2023) — *API1 BOLA*, *API4 Unrestricted Resource Consumption*. https://owasp.org/API-Security/editions/2023/en/0x11-t10/
- **[R10]** OWASP ASVS v4.0.3 — *V2 Authentication* (bcrypt cost ≥ 10). https://owasp.org/www-project-application-security-verification-standard/
- **[R11]** Cloudinary — *Pricing / credit model*. https://cloudinary.com/pricing
- **[R12]** Cloudflare R2 — *Pricing (zero egress)*. https://developers.cloudflare.com/r2/pricing/
- **[R13]** Google — *Gemini API rate limits*. https://ai.google.dev/gemini-api/docs/rate-limits
- **[R14]** M. Nygard — *Release It!* (circuit breakers, bulkheads, timeouts).
- **[R15]** M. Kleppmann — *Designing Data-Intensive Applications* (queues, partitioning, backpressure).
- **[R16]** PostgreSQL — *SELECT … FOR UPDATE SKIP LOCKED*. https://www.postgresql.org/docs/current/sql-select.html

---

## Appendix A — Evidence index (file:line)

| Ref | Location | What it shows |
|---|---|---|
| A1 | `backend/app/db/session.py:35-55` | `NullPool`, `pool_pre_ping=True`, no pooling |
| A2 | `backend/app/services/auth.py:58-60,67-101,180` | 15 s auth TTL; DB read per request on miss |
| A3 | `backend/app/services/portal_cache.py:35-40` | 60 s ETag bucket |
| A4 | `backend/app/routers/students.py:507-515` | ETag 304 path + `to_thread` full fetch |
| A5 | `backend/app/routers/exams.py:224-285` | F-01/F-02: no authz, full submission list |
| A6 | `backend/app/routers/submissions.py:501-568` | F-03: all submissions + all answers |
| A7 | `backend/app/routers/submissions.py:646-668,745-845` | Upload gates, zero-download confirm, client-asserted bounds |
| A8 | `backend/app/routers/submissions.py:950-1182` | `to_thread` processing, multipart fallback |
| A9 | `backend/app/worker/queue_worker.py:32-55,44,64-163,191-198` | Worker count, boot reset, `SKIP LOCKED` |
| A10 | `backend/app/services/pdf_service.py:100-123` | 150 DPI PNG renders |
| A11 | `backend/app/services/storage.py:323-353,459-506,580-628` | Storage session pool, signed upload, HEAD probe, cache prune |
| A12 | `backend/app/routers/tenancy.py:88-135,648-826` | Atomic roll allocation, bulk import |
| A13 | `backend/app/main.py:31-40,60-87` | In-process daemons, headers, `/api/v1` rewrite, no gzip/limiter |
| A14 | `backend/app/routers/auth.py:107,198-200` | bcrypt semaphore(3) |
| A15 | `frontend/src/lib/queries.ts:129-137,179-189` | 3 s eval poll, 20 s portal poll |
| A16 | `backend/Dockerfile:30`, `render.yaml:7-8` | single worker; stale free/oregon blueprint |
| A17 | `ARCHITECTURAL_AUDIT_AND_DIARY.md:1257,1250-1265` | 457 ms `SELECT 1`; 56-student benchmark |

## Appendix B — One-page action list

**This week (free):** F-01 authz · auth TTL 300 s · remove ETag bucket · split worker + stale-only boot · trim ledger/eval payloads · gzip · WebP/lazy renders · upload bound validation · rate limits · poll jitter · **move Cloudinary HEAD out of the DB session**.

**Keep `NullPool` for this week.** It is the safe stopgap while Phase 0 lands. Do not revert to the old 15+25 pool with a 30 s timeout.

**Before the next 1,000-student weekend (budget):** A/B then adopt a session-scoped bounded pool (only after the HEAD is out of the session) · Mumbai co-location · 2 vCPU/4 GB · Supabase Pro · R2 · 4–5 grading workers · per-submission deadline.

**Decision trigger:** if the A/B at 300–500 concurrent shows pooled p95 ≤ `NullPool` p95 (expected once holds are short), switch. If it does not, keep `NullPool` and cap at ~600 students until Phase 2. Measure, don't argue from a 56-student sample.

**Before six branches:** Redis epochs/limits · CDN renders · DB indexes/partitioning · observability · load shedding · the L1–L8 test suite in CI.

---

*No application code was changed by this audit; this document is the only artefact. The two state-changing recommendations (pool sizing and worker split) require the acceptance tests in §7 and §8, not a production hotfix. The Nov 18 crash is re-diagnosed in P-01 as a long-held-session bug, not a vindication of `NullPool`.*
