# PaperGrade AI — Operational & Architecture Directives

## 1. Strict Two-Phase Time-Decoupled Evaluation Window Rule (Permanent Core Invariant)
* **First Half of the Day (< 8:00 PM IST) — Exam & Ingestion Window**:
  * All classes, exam sessions, student uploads, and portal browsing operate exclusively in this period.
  * **Evaluation / AI grading is strictly forbidden during this window.**
  * The server's CPU, memory, and database connections are 100% dedicated to servicing student submissions, Cloud CDN signed upload signatures, authentication, and portal queries.
  * Under no circumstances may AI grading workers run concurrently with live exam submissions.

* **Second Half of the Day (>= 8:00 PM IST) — Batch Processing & Evaluation Window**:
  * All student exams and classes are finished for the day.
  * The background grading queue (`PersistentQueueWorker`) processes all queued answer scripts overnight.
  * Client Commitment SLA: Results are published **next day or next-to-next day** (never instant same-day results).
  * 100% of the server's CPU, memory, and Gemini API quotas are dedicated exclusively to batch grading without any competition from student HTTP traffic.

## 2. Dedicated Paid VPS Infrastructure Specs (Permanent Core Invariant)
* **Dedicated High-Performance VPS (GigaNodes)**:
  * **Provider**: GigaNodes VPS
  * **CPU**: 1.0 Dedicated AMD EPYC Core
  * **RAM**: 2,048 MB (2 GB) RAM
  * **Bandwidth**: 2 TB / month high-speed transit
  * **Runtime**: Linux systemd service (`papergrade-backend`), running persistent Python FastAPI process with Uvicorn.
  * **Always-On, Never Sleeps**: This is a dedicated, paid, permanently active virtual private server. It **NEVER spins down or sleeps due to inactivity** (not serverless, not a free container). Cold start latency is 0 ms.
  * **Automated CI/CD**: Pushes to `main` deploy directly to the GigaNodes VPS via GitHub Actions SSH (`.github/workflows/deploy.yml`).

## 3. Pre-Authenticated Conduction Protocol
* **7-Day Session Persistence**:
  * JWT tokens are valid for 7 full days (`ACCESS_TOKEN_EXPIRE_MINUTES = 10080`) and persisted in `localStorage`.
  * Operational policy requires students to be pre-logged in before the exam window opens (at home or upon entering the classroom).
  * Eliminates concurrent `bcrypt` CPU hashing storms during exam submission time. When the window opens, requests only perform microsecond JWT signature verifications.

## 4. Tenancy & Testing Boundaries
* **CATCH 25 Institute (`inst_e1eeda3473c3`, `br_c25_acbdd4d8`)**:
  * Production institute data is strictly read-only for inspection and **100% excluded** from synthetic tests, load tests, or automated scripts.
  * All automated tests, mock submissions, and load tests must target `TEST INSTITUTE` (`inst_test_institute`) only.

## 5. On-Demand Dormant Evaluation Worker Lifecycle (Zero-Egress Protocol)
* **Dormant by Default**: `PersistentQueueWorker` MUST NOT poll or ping Supabase in a loop when there are no jobs to evaluate. Idle polling of the database is strictly forbidden.
* **On-Demand Wakeup**: The worker pool only wakes up when Root Admin explicitly triggers evaluation (`POST /api/exams/{id}/start-evaluation`) or if unfinished jobs exist on server startup.
* **Auto-Dormancy**: As soon as all submissions in the queue reach a terminal state (zero `QUEUED`, `PROCESSING`, or `PAUSED_QUOTA` jobs remaining), all worker and watchdog threads automatically terminate and return to a deep, zero-query dormant state.
