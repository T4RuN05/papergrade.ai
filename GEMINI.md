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

## 2. Tenancy & Testing Boundaries
* **CATCH 25 Institute (`inst_e1eeda3473c3`, `br_c25_acbdd4d8`)**:
  * Production institute data is strictly read-only for inspection and **100% excluded** from synthetic tests, load tests, or automated scripts.
  * All automated tests, mock submissions, and load tests must target `TEST INSTITUTE` (`inst_test_institute`) only.
