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

## 2. Infrastructure Keep-Alive Directive (Active from Day 1)
* **24/7 External Uptime Bot**:
  * The backend (`https://papergrade-ai-al1w.onrender.com`) is monitored and pinged 24/7 continuously by an external uptime bot (UptimeRobot).
  * The backend container **never spins down due to inactivity**.
  * Cold start latency is effectively 0 in production; assume the backend is permanently warm and background daemons (`PersistentQueueWorker`, notification pruning) remain alive.

## 3. Pre-Authenticated Conduction Protocol
* **7-Day Session Persistence**:
  * JWT tokens are valid for 7 full days (`ACCESS_TOKEN_EXPIRE_MINUTES = 10080`) and persisted in `localStorage`.
  * Operational policy requires students to be pre-logged in before the exam window opens (at home or upon entering the classroom).
  * Eliminates concurrent `bcrypt` CPU hashing storms during exam submission time. When the window opens, requests only perform microsecond JWT signature verifications.

## 4. Tenancy & Testing Boundaries
* **CATCH 25 Institute (`inst_e1eeda3473c3`, `br_c25_acbdd4d8`)**:
  * Production institute data is strictly read-only for inspection and **100% excluded** from synthetic tests, load tests, or automated scripts.
  * All automated tests, mock submissions, and load tests must target `TEST INSTITUTE` (`inst_test_institute`) only.
