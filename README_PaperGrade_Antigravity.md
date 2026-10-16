# PaperGrade --- Product & Engineering Specification

> **Purpose:** Implementation brief for Antigravity. This document
> consolidates the product decisions agreed so far for PaperGrade. It is
> the product/behavior source of truth for the pilot; inspect the
> existing repository and `ARCHITECTURE.md` before modifying code.
>
> **Deployment intentionally excluded.** Do not choose, migrate, or
> implement a deployment provider as part of this work. Keep
> environment-specific infrastructure behind configuration/interfaces
> where practical.

## 1. Product summary

PaperGrade is an AI-assisted answer-sheet evaluation portal for a
coaching institute operating multiple branches. Students upload one PDF
of their handwritten answer sheet. An authorized Root Admin configures
the answer key and approves a rubric, starts AI evaluation, reviews
flagged papers, corrects marks/annotations when necessary, and
explicitly publishes results. Students see only a simple
submission/result status and can request manual revaluation after
publication.

The pilot should remain operationally simple. Prefer a modular monolith
with clear domain/service boundaries and a separately managed background
worker process/interface. Do not introduce microservices or large
infrastructure dependencies without a demonstrated need.

### Workload assumptions for planning

-   Five branches in one coaching institute for the initial commercial
    target.
-   Around 1,000 submitted papers/week (roughly 4,333/month on a 52-week
    annualized average).
-   These are planning numbers, not hard-coded product limits.
-   The product must support multiple branches, batches, exams, and
    concurrent submissions safely.

## 2. Roles, tenancy, and permissions

There are exactly three application roles in the pilot:

1.  **Root Admin** --- PaperGrade creator/operator with global access.
2.  **Branch Manager** --- manages the assigned branch only.
3.  **Student** --- can access only their own submissions and published
    results.

There is no separate institute-admin or teacher role in the pilot. Do
not silently introduce one.

### Organization hierarchy

`Institute → Branch → Batch → Student enrollment / Exam`

-   One institute may have multiple physical branches.
-   Each branch may have multiple batches. Examples: `11th`, `12th`,
    `JEE 12th`, `11th CET-1`, `11th CET-2`.
-   Students are associated with a branch and may be enrolled in one or
    more batches. Most students will have one batch, but the database
    must support many-to-many enrollment.
-   Exams explicitly target one or more batches. Access must not leak
    across branches or batches.
-   Root Admin can view and intervene in all branches and exams.
-   Branch Manager can only view/manage resources belonging to their
    assigned branch.
-   Students can only access their own records and files; never trust a
    client-supplied student, branch, exam, submission, or file ID
    without checking authorization server-side.

### Permission matrix

  ---------------------------------------------------------------------------------------
  Action                                 Root Admin     Branch Manager            Student
                                                          (own branch) 
  ------------------------------ ------------------ ------------------ ------------------
  Create/manage institute and                   Yes                 No                 No
  branches                                                             

  Create/manage branch managers                 Yes                 No                 No

  Import students from Excel                    Yes                Yes                 No

  Manage batches/enrollments                    Yes                Yes                 No

  Create exam, upload question                  Yes                Yes                 No
  paper                                                                

  Select exam target batches                    Yes                Yes                 No

  Open initial submission window                Yes                Yes                 No

  Reopen submission window                      Yes                Yes                 No

  Upload/replace answer key                     Yes                 No                 No

  Generate/review/edit/approve                  Yes                 No                 No
  rubric                                                               

  Start evaluation                              Yes                 No                 No

  View/manage global AI queue                   Yes                 No                 No
  and quota                                                            

  Review flagged grade and                      Yes                 No                 No
  correct marks                                                        

  Edit answer annotation boxes                  Yes                 No                 No

  Publish/re-publish results                    Yes                 No                 No

  Request revaluation                            No                 No Yes, own published
                                                                                   result

  Decide revaluation and revise                 Yes                 No                 No
  grade                                                                

  View published result and                     Yes   Own-branch admin    Own result only
  annotated PDF                                              access as 
                                                             permitted 
  ---------------------------------------------------------------------------------------

**Future option, not pilot scope:** Branch-level evaluation permissions
may be added later, but the current implementation must not grant them
implicitly.

## 3. Authentication and student onboarding

### Student import

-   Branch Manager or Root Admin imports students through an Excel file.
-   Required column: student name.
-   Optional column: email.
-   Branch is derived from the authorized import context; never trust an
    arbitrary branch ID in the spreadsheet.
-   The operator selects the batch or batches to enroll the imported
    students into.
-   Generate a unique random numerical student login ID. IDs must be
    globally unique and database-constrained; do not rely only on a
    pre-insert check.
-   Provide an import preview before committing.
-   Validate rows and show row-specific errors.
-   Warn about likely duplicates. Name-only duplicates are ambiguous and
    must be resolved by the operator; do not automatically merge two
    students solely because their names match.
-   Re-imports should be idempotent where a reliable identity key
    exists. Do not create duplicate students on a repeated upload of the
    same import.
-   Report created, updated, skipped, and failed rows.

### Claiming accounts

-   No activation code in the pilot.
-   Student claims their pre-created account using their assigned
    numerical ID and sets a password.
-   Claiming is one-time; a claimed account cannot be claimed again
    through the same flow.
-   The Root Admin can reset a student's password/access.
-   This onboarding method is a known security trade-off. Mitigate it
    with rate limits, one-time claim state, secure password hashing,
    generic error messages, and audit logging. Do not display passwords
    in admin tables or logs.
-   Student login IDs are globally unique. Login attempts must be
    rate-limited and suspicious repeated failures handled safely.
-   Passwords must be hashed with a modern password hashing algorithm
    (e.g. Argon2id or bcrypt with appropriate parameters); never store
    plaintext or reversible passwords.
-   Sessions/cookies must be secure in production configuration, with
    server-side authorization on every protected operation. Never treat
    frontend route hiding as authorization.

### Password reset

-   Root Admin can initiate a reset. Do not reveal existing passwords.
-   If a temporary password mechanism is used, force change on next
    login and never log the secret.
-   Audit the reset action without recording credentials.

## 4. Exam creation and submission-window lifecycle

### Exam creation

Branch Manager or Root Admin may: 1. Create an exam with title, subject,
optional description/instructions, and total marks if known. 2. Upload
the question paper. 3. Select one or more target batches from the same
branch. 4. Set optional informational exam start/end date/time. 5. Open
the PaperGrade submission window.

The actual exam start/end schedule is metadata only. It does **not**
automatically open or close PaperGrade uploads. The explicit PaperGrade
submission-window action controls upload eligibility.

Question paper is distinct from the answer key. A student may submit
even when no answer key has been uploaded yet.

### Submission window rules

-   When the operator opens the window, the server sets the deadline to
    exactly **30 minutes after opening**.
-   Server time is authoritative; client clocks are not trusted.
-   A two-minute upload grace period applies only to uploads whose
    server-authorized upload session began before the deadline.
-   A new upload or replacement must not begin after the normal
    deadline.
-   An upload session started before the deadline may finish until
    deadline + 2 minutes. After that, it is rejected/expired.
-   Do not let a browser manipulate timestamps to bypass the window.
-   The upload-start authorization must be created and persisted
    server-side. A client-side "upload started" timestamp is not
    sufficient.
-   If a student has no accepted submission, show the upload action only
    while eligible.
-   If a student already has an accepted submission, they may replace it
    during the active window.
-   The upload window state and each upload session state must be
    explicit and auditable.

### Submission file constraints

-   One combined PDF per student per exam.
-   Proposed pilot maximum: **15 MB** and **10 pages** per submission.
    Keep these as configuration values, not scattered constants.
-   Validate actual file bytes, PDF signature/structure, size, and page
    count on the backend. MIME type and filename alone are insufficient.
-   Reject encrypted/password-protected, corrupt, empty, unsupported, or
    over-limit PDFs with a clear user-facing reason.
-   Never accept a path from the client and open it directly.
-   A scan can contain multiple pages; it must remain one combined PDF.
-   Preserve handwriting readability. Do not reduce DPI or recompress
    aggressively if it damages text, equations, diagrams, or
    annotations.

### Atomic replacement behavior

When replacing a student's current accepted PDF: 1. Receive and validate
the new upload into temporary/quarantine storage. 2. Verify the file and
page count; calculate checksum/hash and metadata. 3. Only after
successful validation, atomically make it the current accepted
submission. 4. Failed/aborted uploads must not delete or invalidate the
previous accepted PDF. 5. Store only one current accepted student PDF in
the normal submission record. Do not retain all prior PDF versions as a
feature in the pilot. 6. Metadata such as replacement count, last
replacement time, and checksum may be retained for audit/diagnostics. 7.
Clean up abandoned temporary uploads safely.

Use idempotency protection so retries of the same upload request do not
create duplicate submissions or trigger multiple grading jobs.

### Reopening a submission window

-   Root Admin or the Branch Manager of that branch can reopen a closed
    window.
-   Reopening requires a reason, explicit new deadline, and an explicit
    scope.
-   Default scope: allow submissions only from students who do not have
    an accepted submission.
-   Optional override: allow replacements from all students, including
    those who submitted previously. This must be explicitly selected and
    confirmed.
-   Use a configurable duration (e.g. 5 or 15 minutes), not a hard-coded
    reopening duration.
-   Audit who reopened it, when, reason, previous deadline, new
    deadline, and scope.
-   By default, reopening is blocked after evaluation has started. If an
    exceptional reopening is ever allowed, affected jobs must first be
    safely resolved/cancelled and the behavior must be explicit; never
    silently change the PDF while a grading job is reading it.
-   A closed window should not be reopened accidentally by a page
    refresh, duplicate request, or stale browser tab.

## 5. Answer key and rubric workflow

### Authority

Only Root Admin can upload/replace the answer key, generate a draft
rubric, edit/review/approve it, and start evaluation.

### Workflow

1.  Branch Manager creates the exam, uploads question paper, selects
    batches, and opens submissions.
2.  Students may submit while the answer key is missing.
3.  If no answer key exists, accepted submissions remain stored and
    evaluation is blocked in an `AWAITING_KEY` condition.
4.  Root Admin uploads the answer key.
5.  System uses the configured AI model to generate a **draft rubric**
    from question paper + answer key. This is not final approval and
    must not automatically start grading.
6.  Root Admin reviews and edits questions, subquestions, official
    answers, accepted alternatives, marking criteria, numerical
    tolerances, section instructions, total marks, and attempt limits.
7.  Root Admin explicitly approves/locks the rubric.
8.  Root Admin explicitly starts evaluation.

### Rubric versioning and immutability

-   Every rubric edit creates a new version or draft revision; do not
    silently mutate a version already used by a grading run.
-   Approved rubric versions are immutable for historical runs.
-   Every grading run stores the exact approved rubric version ID/hash
    it used.
-   If a rubric is changed after a run, create a new version and require
    an explicit new evaluation action for any affected papers. Never
    automatically regrade all papers after a rubric edit.
-   Prevent duplicate evaluation starts from double clicks, browser
    retries, or duplicate API requests.
-   Unlocking/editing an approved rubric must not erase the prior
    approved version or its audit trail.
-   Check consistency: question maxima, criterion maxima, section
    totals, exam total, and attempt limits must be validated. Warn on
    mismatch; require an explicit resolution before approval where the
    mismatch changes scoring.
-   Support optional sections and instructions such as "attempt any X
    out of Y."

## 6. Grading engine requirements

### Core principles

-   Use the approved rubric as the grading source of truth.
-   AI output is untrusted structured input. Validate it against server
    schemas and grading invariants before saving.
-   Store model/provider name, model version, prompt version, rubric
    version, run ID, token usage, latency, retries, and result metadata
    for every attempt where available.
-   Keep the original submission PDF immutable after acceptance; grading
    and annotation must never modify it.
-   Preserve all human corrections and never overwrite a human override
    with a later automatic result.
-   Avoid logging student answer-sheet contents, credentials, or
    sensitive data unnecessarily.

### Per-answer data

For each question/subquestion, support: - Question/subquestion/section
identifiers. - Extracted handwritten answer text. - Maximum marks and
awarded marks. - Criterion-level scores, criterion descriptions,
maximum/awarded marks, and evidence snippets. - Grading rationale tied
to the rubric and visible answer evidence. - Transcription and grading
uncertainty/confidence indicators. - Missing/unattempted state. -
Review-required flag and reason. - One or more answer regions/bounding
boxes, including multiple boxes across pages. - Manual override markers
and timestamps.

### Invariants

-   Awarded marks must be within `[0, max_marks]`.
-   Criterion scores must be within each criterion's bounds.
-   Validate criterion sum against awarded marks according to the rubric
    policy. If mismatch is permitted by a rubric, represent that
    explicitly; otherwise flag or reject inconsistent output.
-   Question/subquestion IDs must match the approved rubric, except an
    explicitly recorded unmatched/uncertain answer that requires review.
-   Clamp normalized bounding-box coordinates to valid bounds and reject
    zero/negative-size or off-page invalid boxes.
-   Never trust model-reported total marks. Recompute totals
    server-side.
-   Recompute section totals and attempt limits deterministically.
-   Detect missing answers; do not treat unreadable/uncertain answers as
    blank automatically.
-   Detect duplicate mappings, impossible marks, malformed JSON/schema,
    missing rubric questions, and unexpected question IDs.
-   Do not silently "fix" a serious model inconsistency by assigning
    marks; flag it for review.

### Optional/extra attempts (Best-of-N)

-   If the rubric says "attempt any X out of Y," apply the policy
    deterministically.
-   Sort eligible attempted answers by awarded score descending, retain
    the best X according to rubric policy, and mark excess attempts as
    excluded (`is_extra_attempt`/equivalent).
-   Make tie-breaking deterministic (e.g. rubric question order).
-   Missing/unattempted questions should not beat attempted questions
    just because of defaults.
-   Excluded extra attempts remain visible to Root Admin for
    transparency but do not contribute to final total.
-   Make it clear in the admin UI which attempts count and why.
-   Recompute totals whenever marks, missing state, attempt policy, or
    relevant answer data changes.

### Confidence/review policy

-   Low transcription confidence, low grading confidence, ambiguous
    question mapping, malformed output, missing evidence,
    overlapping/implausible boxes, suspicious marks, or high-risk
    discrepancy should set `NEEDS_REVIEW`.
-   Thresholds should be configurable and calibrated using benchmark
    data; do not invent false precision.
-   A flagged paper must not be published automatically. It stays held
    for Root Admin review.
-   Review flags must have human-readable reasons, not just a boolean.
-   Model self-reported confidence alone is insufficient; combine it
    with deterministic validation and benchmarked signals.

## 7. Global evaluation queue and quota manager

There is **one global FIFO evaluation queue** across all branches. Do
not create isolated per-branch queues in the pilot.

### Ordering and eligibility

-   Queue ordering is based on eligibility/enqueue time, with a stable
    tie-breaker such as submission ID.
-   A paper becomes eligible only after the submission window is closed,
    an answer key exists, an approved rubric exists, and Root Admin
    explicitly starts evaluation.
-   Preserve FIFO order of job starts/attempts. Quota delays pause
    processing but do not reorder eligible work.
-   A single exam/run should not create duplicate jobs for the same
    submission and rubric version.
-   Re-evaluation, if ever explicitly requested by Root Admin, must be
    represented as a new grading run with a reason, not as an invisible
    reset of history.
-   Student revaluation is separate and must never create AI jobs.

### Job states

Use explicit internal job states such as: `BLOCKED`, `QUEUED`,
`PROCESSING`, `RETRY_WAIT`, `PAUSED_QUOTA`, `NEEDS_REVIEW`, `GRADED`,
`FAILED`, `CANCELLED`.

Keep these separate from the simplified student-facing status described
later.

### Crash recovery and idempotency

-   Persist job state before work starts.
-   Atomically claim a job so two workers cannot grade it
    simultaneously.
-   Record lease/heartbeat or processing start metadata so stale
    processing jobs can be identified.
-   On worker restart, recover stale jobs safely and retry from durable
    state.
-   Never lose completed jobs when a worker restarts.
-   Make result persistence idempotent; if the model call succeeded but
    the worker crashed before saving, a retry must not duplicate answers
    or totals.
-   Keep attempts and errors in job history.
-   Use bounded retries with exponential backoff/jitter for transient
    failures.
-   Do not retry permanent validation errors indefinitely.
-   Maximum retry policy should be configurable. Existing POC uses up to
    three generic retries; preserve or improve only after inspecting
    current behavior.
-   Quota exhaustion is not a failed paper. Return/keep the job queued
    or paused, record the reason and resume when capacity returns.
-   A job stuck in processing must not be reset while another live
    worker is still working on it.

### Model/API quota handling

-   Treat RPM, TPM, RPD, model quotas, and provider-wide/project-level
    quotas separately.
-   Multiple API keys in the same Google project do **not** create
    independent project-level quota pools. Do not assume key rotation
    increases project-wide daily quota.
-   Rotate keys only for applicable key-level failures; use
    model/provider quota state to avoid repeatedly hitting an exhausted
    project/model.
-   Support configurable approved model fallback chain. Record the
    actual model used for every attempt.
-   On quota exhaustion, put the exhausted model/provider into a
    cooldown until a known reset time or conservative retry time. Do not
    retry it on every paper.
-   If all configured model options are exhausted, pause safely, expose
    queue/quota state to Root Admin, and resume automatically when
    capacity returns.
-   A quota event must never mark queued papers failed or publish
    partial results.
-   Use measured usage, pricing version, input/output/thinking/cached
    tokens where available, request size, page count, duration, HTTP
    status, error code, retries, and estimated paid-equivalent cost.
-   Pricing must be configuration/versioned data; do not hard-code stale
    model prices or assume free-tier behavior is stable.
-   Root Admin can see global queue, queue age,
    queued/processing/review/failed counts, model health, key
    configuration status, quota resets/cooldowns, retry rates, per-paper
    cost, and projections.
-   Never expose API keys or secrets to the browser.
-   If a hybrid model provider is configured in the future, provider
    fallback must be explicit and benchmarked. Do not silently change
    model mid-run without recording it.

### Concurrency

-   Start with conservative concurrency aligned to provider limits.
-   If increasing concurrency later, preserve FIFO start order, prevent
    duplicate claims, enforce RPM/TPM/RPD centrally, and bound memory
    usage for PDF renders.
-   Queue performance must not depend on a process-local in-memory list
    as the source of truth.

## 8. Results and publication

### Separate evaluation and publication states

Do not use one status field for both grading progress and student
visibility.

**Internal evaluation state** may include: `AWAITING_KEY`,
`AWAITING_RUBRIC_APPROVAL`, `BLOCKED`, `QUEUED`, `PROCESSING`,
`RETRY_WAIT`, `PAUSED_QUOTA`, `NEEDS_REVIEW`, `GRADED`, `FAILED`.

**Publication state**: `NOT_READY`, `UNPUBLISHED`, `PUBLISHED`.

-   A successfully graded paper without review flags becomes `GRADED`
    and `UNPUBLISHED`.
-   A paper flagged for review remains held until Root Admin reviews it.
    After review it may become `GRADED` and `UNPUBLISHED`.
-   No grade is visible to a student until Root Admin explicitly
    publishes the result.
-   Root Admin can publish a set of ready results after checking counts
    and scope; publication must be explicit and auditable.
-   Re-publication of a revised result must be explicit.

### Student-visible statuses (exactly three primary states)

The student UI must expose only: 1. **Submitted** --- accepted PDF is on
record and waiting for the evaluation lifecycle to become visible. 2.
**Under Evaluation** --- includes waiting for answer key, waiting for
rubric approval, queued, processing, quota-paused, held for admin
review, and graded but not yet published. 3. **Results Published** ---
marks, question-level explanations, and read-only annotated PDF are
available.

Do not expose quota errors, internal queue details, AI model names,
intermediate marks, or admin review notes to students. For failed upload
attempts, show a clear upload error; do not falsely show an accepted
submission.

### Publication behavior

-   Root Admin alone publishes.
-   Backend must enforce publication checks on every marks, rationale,
    answer-detail, and PDF endpoint.
-   Hiding a frontend component is not sufficient.
-   Before publication, no API response, URL, cached payload, export, or
    predictable file path may leak grades.
-   Once published, students can view their marks and explanations and
    download a read-only annotated PDF.
-   Student endpoints must verify the authenticated student's ownership
    of the submission.
-   A student must not be able to access another student's PDF by
    changing an ID in a URL.

### Notifications

Mandatory/authoritative channel: **in-app notification inbox**.
Optional: best-effort Web Push. Email is not required in the pilot.

Send notifications only for meaningful events: - Submission accepted
(confirmation). - Initial results published. - Revised result published
after revaluation.

Do not notify students about rubric creation, queueing, processing,
quota pauses, internal review, or intermediate grading events. - Store
notification state durably; page refresh must not lose notifications. -
Use idempotency keys to avoid duplicate notifications on retried publish
requests. - Notification content must not expose marks until the
publication action has committed. - Push delivery failure must not undo
result publication; inbox remains authoritative.

## 9. Manual review and annotation editor

Root Admin needs a reusable grading workspace for inspecting original
pages, AI transcription, rationale, criterion scores, regions, flags,
and audit history.

### Answer correction

-   Root Admin can change awarded marks, criterion scores, extracted
    transcription, rationale/explanation, and review state.
-   A mark edit must validate bounds and recompute answer/section/paper
    totals and Best-of-N selection.
-   Require a reason for material grade changes.
-   Record old value, new value, field, actor, timestamp, reason,
    affected submission, and grading run/revision in an immutable audit
    record.
-   Never delete the original AI result when a human corrects it.
    Preserve AI output and represent human overrides/revisions
    separately or in a fully auditable history.
-   Human corrections must not be overwritten by retries or future model
    calls.

### Bounding-box editor

The current POC's region backend may exist, but frontend interaction is
incomplete. Implement end-to-end: - Create a new bounding box on a
page. - Select and drag/reposition an existing box. - Resize a box using
visible handles. - Change its page when explicitly supported; otherwise
delete/recreate on the target page. - Support multiple regions for one
logical answer, including regions on different pages. - Link each region
to the correct question/answer ID. - Save to the backend durably; edits
must survive refresh, logout/login, and reload. - Use normalized page
coordinates (`x`, `y`, `width`, `height` each relative to page
dimensions) so placement survives zoom and viewport changes. - Validate
and clamp coordinates server-side, while rejecting unusable
dimensions. - Correctly transform pointer coordinates from screen/zoomed
viewer space into normalized page coordinates. - Provide
save-in-progress, saved, and error states. Do not show success until
persistence succeeds. - Avoid accidental edits while scrolling or
zooming; support clear selection and cancel/undo before save where
practical. - After create/move/resize, regenerate the crop preview and
annotated PDF. - Region-only edits must **not** change marks or invoke
the AI model. - Mark changes are a separate explicit action with
separate audit records. - Annotation edits must not modify the original
uploaded PDF.

### Annotated PDF

-   Generate vector annotations over the original accepted PDF where
    possible; preserve the original page image quality.
-   Include question labels, marks, and appropriate overall summary
    without obscuring handwriting.
-   Rebuild the annotated PDF after relevant mark/region changes.
-   PDF generation failure must not discard grade data. Mark the export
    as pending/failed and allow retry/regeneration.
-   Only expose the annotated PDF to students after publication.
-   A student's published PDF is read-only from their side.

## 10. Manual revaluation

Revaluation is **manual only** in the pilot. Do not call Gemini or any
other grading model during a student revaluation request or decision.

### Eligibility and limits

-   Student may request revaluation at question level or for the whole
    paper.
-   Request window is **7 calendar days from initial publication
    timestamp**.
-   Server clock determines eligibility.
-   One request may include a question ID/subquestion or whole-paper
    scope, plus a student comment.
-   Validate that requested question belongs to that student's published
    submission.
-   Define and enforce a duplicate-request policy (recommended: prevent
    multiple open requests for the same submission/question; allow a new
    request only after prior resolution if still eligible).
-   Expired request attempts must be rejected with a clear explanation.
-   Do not allow revaluation before first publication.
-   Student-visible result remains **Results Published** while a
    revaluation request is pending.

### Revaluation lifecycle

`SUBMITTED → UNDER_REVIEW → RESOLVED`

Root Admin can: - Review original answer image/regions, approved rubric
version used, original AI transcription/rationale, original grade,
student comment, and audit trail. - Leave marks unchanged or manually
correct marks and explanation. - Correct annotation regions using the
same annotation editor. - Record decision, reason, reviewer, and
timestamp. - Regenerate the annotated PDF. - Preserve the original
published result and create a revision record. - Explicitly publish the
revised result when ready.

Do not update student-visible marks/PDF merely because the admin has
edited a draft revision. The revised grade remains unpublished until the
explicit publish action commits. - Notify the student only when the
revised result is published. - No AI regrading, hidden background AI
call, or automatic rubric change is allowed during revaluation.

## 11. Data model and persistence guidance

The current POC uses SQLite in WAL mode and contains concepts such as
exams, rubric versions, batches, submissions, answers, answer regions,
criterion scores, audit logs, API usage events, quota settings, and
benchmark records. Inspect and preserve useful existing logic rather
than replacing it blindly.

The production domain needs to add or formalize: - institutes -
branches - branch managers / user accounts / role assignments -
students - batches - student-batch enrollments - exams and exam-batch
assignments - submission windows and reopening audit events - accepted
submissions and upload sessions/idempotency records - answer keys and
immutable rubric versions - grading runs and persistent queue
jobs/attempts - answers, criterion scores, answer regions -
evaluation/publication states - result revisions/publication events -
revaluation requests/decisions - in-app notifications - audit logs - API
usage/quota/pricing events - benchmark/ground-truth records

Use foreign keys and database constraints for identity, tenancy, and
duplicate prevention. Add indexes for common filters and queue
operations. Use UTC timestamps in storage and display local times
appropriately in the UI. Store file references/object keys, not absolute
machine-specific filesystem paths as the durable domain identity. Do not
store PDF bytes inside relational rows.

### Data integrity requirements

-   Tenant ownership is enforced in service/query layer, not merely in
    UI.
-   Unique constraints for login IDs, enrollment pairs, one current
    accepted submission per student/exam, rubric version number per
    exam, and one active grading job per submission/rubric version.
-   Transactions for replacement, grade edit + totals recomputation,
    result publication + notification creation, and revaluation revision
    changes.
-   Audit records should be append-only to ordinary application flows.
-   Soft deletion/archiving is preferable for exams/students with
    historical results; do not cascade-delete published academic history
    by accident.
-   Deleting or archiving a student must not make another student able
    to claim the same login ID without an explicit controlled process.
-   Retention/cleanup policy for temporary files and derived renders
    must never delete the current original, published graded PDF, answer
    key, question paper, rubric versions, or audit history.

## 12. Telemetry, quality, and cost observability

Maintain a Root Admin-only analytics area for: - Total papers, queue
counts and oldest queue age. - Counts by branch/exam/batch and status. -
Success/failure/retry rate. - API request count and success rate. -
Provider/model used per attempt. - Input/output/thinking/cached token
usage where available. - File size, page count, latency and
percentiles. - Estimated API cost using a versioned pricing schedule. -
Average and P90/P95 cost per successfully graded paper. - Queue
throughput and rough projections for 40/50-paper groups and larger real
workloads. - Quota usage, cooldown, rate-limit failures and
model/provider fallback events. - Review rate and human intervention
rate. - Accuracy benchmarks for transcription, question mapping, box
localization, marking agreement, explanation sufficiency. -
Human-ground-truth score comparison where available.

Telemetry must distinguish: - successful model request vs successful
complete grading job; - transient request failure vs permanent grading
failure; - free-tier measured usage vs paid-equivalent estimated cost; -
AI original output vs human-corrected final result.

Do not rely on provider dashboard screenshots or hard-coded old prices
as the only cost record. Persist a `pricing_version` and enough raw
usage data to recalculate estimates later. Do not store API secrets in
telemetry.

## 13. UI and navigation requirements

Keep the interface role-specific and avoid exposing the current POC's
internal teacher-centric navigation to students.

### Root Admin

Suggested main areas: - Global dashboard. - Institutes/branches/branch
managers. - Students/imports/batches. - Exams and submission windows. -
Answer key and rubric editor. - Global evaluation queue and quota/usage
telemetry. - Review queue and grading workspace. -
Results-ready/unpublished and published result management. - Revaluation
queue. - Audit history and system settings.

### Branch Manager

-   Own branch dashboard.
-   Student Excel import and batch/enrollment management.
-   Create exam and upload question paper.
-   Select target batches.
-   Open/close window status and reopen window with
    reason/deadline/scope.
-   View submissions and simplified status for their branch.
-   They cannot access answer key/rubric approval, AI queue controls,
    marks corrections, result publication, or revaluation decisions in
    the pilot.

### Student

-   Claim account / login / password reset flow as supported.
-   List own exams and submissions.
-   Upload or replace one PDF while eligible.
-   Show accepted submission confirmation.
-   Show only `Submitted`, `Under Evaluation`, or `Results Published` as
    the three primary submission statuses.
-   View published marks, per-question explanation and annotated PDF
    download.
-   Request question-level or whole-paper revaluation during the 7-day
    window.
-   View in-app notification inbox.
-   Never show unpublished marks or internal processing/review states.

### UX behaviors

-   Show clear loading, success, validation, and error states.
-   Disable duplicate submission actions while a request is in flight,
    but enforce idempotency on the backend too.
-   Do not lose unsaved rubric edits or annotation edits silently.
-   Confirm destructive or scope-expanding actions such as replacing all
    students' submissions on a reopened window, approving a rubric,
    starting evaluation, and publishing results.
-   Use pagination/search/filtering for large student/submission lists;
    do not load thousands of PDFs or rows at once.
-   Show timestamps/deadlines in a consistent local timezone while
    sending UTC timestamps to the API.

## 14. Security, privacy, and operational edge cases

-   Every protected endpoint must enforce role + branch/student
    ownership server-side.
-   Prevent insecure direct object references for PDFs, crops, marks,
    notifications, and revaluation requests.
-   Restrict CORS to configured frontend origins.
-   Rate-limit login, account claim, password reset, upload-session
    creation, and other abuse-prone endpoints.
-   Validate filenames, content, PDF structure, size, page count, and
    image/PDF conversion output.
-   Protect against path traversal, arbitrary file reads, ZIP bombs (if
    ZIP export is used), malformed PDF resource exhaustion, and
    unbounded image dimensions.
-   Bound memory and processing time per PDF. Fail gracefully without
    losing the original accepted file.
-   Do not serve private files from guessable public paths.
-   Never return secrets, raw stack traces, local file paths, API keys,
    or sensitive internal provider messages to clients.
-   Use structured logs with request/job correlation IDs; redact
    credentials and unnecessary student content.
-   Preserve auditability for access-sensitive actions: account
    claim/reset, student import, window open/reopen, PDF replacement,
    answer-key changes, rubric approval, evaluation start, grade/region
    edit, result publication, revaluation decision.
-   Handle browser refresh, double-click, request timeout, network
    retry, stale tabs, and concurrent admin sessions safely.
-   If a result publish request is retried, it must not create duplicate
    notifications or revisions.
-   If file upload succeeds but DB commit fails, clean up the orphaned
    file safely; if DB commit succeeds but response is lost, idempotency
    must return the existing accepted submission.
-   If PDF export fails after grading, preserve the grade and allow
    export retry.
-   If notification/push fails after publication, publication remains
    committed and in-app inbox delivery should still be durable.
-   If an AI provider times out after possibly processing a request,
    record uncertainty/attempt ID where possible and avoid duplicate
    result persistence.

## 15. State machines and transition guards

### Exam lifecycle (conceptual)

`DRAFT → SUBMISSION_OPEN → SUBMISSION_CLOSED → EVALUATION_READY → EVALUATING → RESULTS_READY → PARTIALLY_PUBLISHED/PUBLISHED`
Use separate fields/entities where needed; do not force every dimension
into one overloaded status. Reopening is an audited window event and
should not erase the prior window history.

### Submission lifecycle

-   No accepted file → `NOT_SUBMITTED`
-   Accepted upload → `SUBMITTED`
-   Window closed, missing key → `AWAITING_KEY`
-   Key present, no approved rubric → `AWAITING_RUBRIC_APPROVAL`
-   Explicit evaluation start → `QUEUED`
-   Worker claims job → `PROCESSING`
-   Temporary failure → `RETRY_WAIT` or `QUEUED`
-   Provider quota exhausted → `PAUSED_QUOTA`/queued
-   Human attention needed → `NEEDS_REVIEW`
-   Valid completed grade → `GRADED` and unpublished
-   Permanent error after bounded retries → `FAILED` for Root Admin
    intervention
-   Published → publication state `PUBLISHED`; evaluation state remains
    separately recorded.

A submission that is `FAILED` must not be presented as published or
silently skipped. Root Admin needs retry/recovery controls and visible
failure reasons.

### Revaluation lifecycle

`SUBMITTED → UNDER_REVIEW → RESOLVED`, with result revision separately
tracked as draft/unpublished/published.

### Upload session lifecycle

`AUTHORIZED → RECEIVING → VALIDATING → ACCEPTED/REJECTED/EXPIRED`;
replacement must be atomic. An upload authorized before deadline may
finish within the two-minute grace; new authorization after deadline is
forbidden.

## 16. Acceptance criteria / test scenarios

Antigravity should implement and test at least the following. Add
automated tests where practical.

### Roles and tenant isolation

-   Root Admin sees all branches; Branch Manager cannot query another
    branch by changing URL or request payload.
-   Student A cannot view Student B's submission, marks, PDF, crop,
    notifications or revaluation request.
-   Student cannot call admin APIs directly.
-   Branch Manager cannot upload answer key, approve rubric, start
    evaluation, edit marks, or publish results.
-   Unknown/disabled user and unclaimed student account cannot access
    protected pages/APIs.

### Import and account claim

-   Valid Excel creates students and enrollments with globally unique
    numeric IDs.
-   Duplicate import does not silently duplicate students where stable
    identity exists.
-   Duplicate names are flagged for human resolution.
-   Invalid rows report errors without corrupting valid rows.
-   Two simultaneous claims for the same ID result in only one
    successful claim.
-   Claimed ID cannot be claimed a second time.
-   Repeated login failures are rate-limited.
-   Password reset does not reveal the old password or leak secrets into
    logs.

### Submission windows and uploads

-   Opening window sets deadline exactly 30 minutes after server-side
    opening timestamp.
-   A new upload started after the deadline is rejected.
-   Upload authorized before deadline may finish before deadline + 2
    minutes.
-   Upload not completed by grace expiry is rejected.
-   Client clock manipulation does not change eligibility.
-   Invalid, encrypted, corrupt, oversized, or over-page-limit PDF is
    rejected.
-   Failed replacement leaves the previous accepted PDF available.
-   Successful replacement atomically becomes the current file and
    creates no duplicate grading job.
-   Reopening requires reason, new deadline, and scope; audit record is
    complete.
-   Default reopening permits only students without a submission;
    replacement override affects everyone only when explicitly selected.
-   Reopening after evaluation begins is blocked by default.
-   Concurrent replacement and worker claim cannot cause grading of a
    stale or partially replaced file.

### Rubric and evaluation

-   Submission is accepted without answer key; it remains awaiting key.
-   Uploading answer key generates a draft rubric only; it does not
    auto-approve or auto-grade.
-   Only Root Admin can approve rubric and start evaluation.
-   Rubric edit creates a new version; existing run remains linked to
    old version.
-   Duplicate start request does not create duplicate jobs.
-   Evaluation is not eligible before window closure, answer key,
    approved rubric and explicit start.
-   FIFO start order is stable across branches.
-   Queue persists after process restart and stale jobs recover without
    duplicate results.
-   Quota exhaustion pauses safely and does not mark papers failed.
-   Model/provider fallback is recorded; repeated 429 requests are not
    sent to an exhausted quota.
-   Bounded retries eventually expose permanent failures to Root Admin.
-   AI marks outside bounds, invalid IDs, inconsistent totals and
    invalid boxes are rejected or flagged; totals are recalculated
    server-side.
-   Best-of-N attempt policy is deterministic and excess attempts remain
    visible but excluded.

### Review and annotation

-   Flagged paper cannot be published before Root Admin review.
-   Grade correction creates audit history and recomputes totals.
-   Human override survives a retry/restart and is not overwritten by
    model output.
-   Create, drag, resize and save annotation region works on different
    pages and zoom levels.
-   Normalized boxes remain aligned after zoom/viewport changes.
-   Region-only edit does not alter marks or invoke AI.
-   Annotation edits persist after refresh and regenerate crop/PDF.
-   PDF regeneration failure does not discard grade data and can be
    retried.

### Publication and student visibility

-   Graded but unpublished paper remains `Under Evaluation` to student.
-   Student APIs never return unpublished marks, rationales,
    annotations, or downloadable graded PDFs.
-   Root Admin explicitly publishes; publication event is audited.
-   Result and notification creation are transactionally/idempotently
    coordinated.
-   Push failure does not roll back publication.
-   Student sees `Results Published` only after publication.
-   Student can download only their own published annotated PDF.
-   Intermediate queue/quota/rubric/review notifications are not sent.

### Revaluation

-   Request before publication is rejected.
-   Request inside seven calendar days is accepted; after expiry it is
    rejected using server time.
-   Question-level request must reference a question in the student's
    own paper.
-   Duplicate open requests follow the defined duplicate-request policy.
-   Revaluation never invokes an AI provider.
-   Pending revaluation leaves student result status
    `Results Published`.
-   Admin's changed grade/PDF remains unpublished until explicit
    revision publication.
-   Original publication and prior marks remain auditable.
-   Student is notified only when revised result is published.

### Cost, quality and recovery

-   API usage events record model, pricing version, token usage where
    available, latency, retries, errors and estimated cost.
-   Dashboard distinguishes model-call success from successful completed
    paper.
-   Benchmark records compare AI result against human ground truth.
-   Storage cleanup does not delete current originals, published PDFs,
    rubrics or audit records.
-   All endpoints enforce file ownership and tenant scope.
-   Logs do not include API keys, passwords, or unnecessary full student
    answer content.

## 17. Implementation guidance for Antigravity

1.  **Inspect before editing.** Read the existing `ARCHITECTURE.md`,
    repository tree, database schema/migrations, current API routes,
    worker, grading services, frontend pages, and tests. Map existing
    functionality to this specification.
2.  **Do not rewrite working grading logic wholesale.** Preserve useful
    existing POC capabilities: rubric versioning, schema validation,
    answer-region records, criterion scoring, best-of-N logic,
    telemetry, persistent queue recovery, manual grade edits, PDF crops
    and vector annotations.
3.  **Identify conflicts explicitly.** The existing POC is
    teacher-centric and local-first. The product now requires
    institute/branch tenancy, roles, student onboarding, submission
    windows, answer-key separation, explicit evaluation start, result
    publication, notifications and manual revaluation. Do not let legacy
    POC flows bypass the new rules.
4.  **Plan schema migrations first.** Back up existing development data
    before destructive migrations. Add migrations incrementally; do not
    drop the database or erase old test data as a convenience.
5.  **Implement in vertical slices** in this order:
    -   Domain model, migrations, auth, role/tenant authorization.
    -   Institute/branch/batch/student import and one-time account
        claim.
    -   Exam creation and submission windows/reopening audit.
    -   Single-PDF upload, validation, atomic replacement,
        upload-session deadline/grace.
    -   Answer-key management, rubric version/review/approval.
    -   Global persistent FIFO queue, quota manager, explicit evaluation
        start and crash recovery.
    -   Grading invariants, review queue, durable manual mark edits.
    -   Annotation create/drag/resize and annotated PDF regeneration.
    -   Explicit result publication and student visibility enforcement.
    -   In-app notifications.
    -   Manual revaluation and result revision publication.
    -   Analytics, benchmarks, hardening and acceptance tests.
6.  **Keep deployment out of scope.** Do not add a deployment provider,
    deployment configuration, CI/CD migration, or hosting-specific code
    as part of this README's implementation work. Do not make
    assumptions about the final hosting stack.
7.  **No fake success.** UI must reflect persisted backend results. A
    successful toast must only appear after the backend confirms the
    change.
8.  **No silent policy changes.** If a requirement is technically
    ambiguous, document the ambiguity and ask before changing the agreed
    product behavior. Use the defaults and constraints stated here.
9.  **Update docs alongside code.** Keep schema/state/permission
    documentation synchronized with actual implementation.
10. **Finish each slice with tests and a concise report**: files
    changed, migration added, behaviors implemented, tests run/passed,
    known gaps, and next slice. Do not claim a test passed unless it was
    run.

## 18. Explicitly out of scope / deferred decisions

-   Deployment provider, hosting architecture, and production deployment
    costs.
-   Separate institute-admin/teacher roles.
-   Branch Manager permission to approve rubrics, run grading, edit
    grades, or publish results.
-   AI-powered student revaluation or automatic regrading during
    revaluation.
-   Mandatory email notifications.
-   Activation codes for student onboarding.
-   Storing historical versions of every replaced student PDF.
-   Automatic result publication.
-   Automatic evaluation immediately when an answer key is uploaded.
-   Unbounded/automatic retries, unbounded AI concurrency, or reliance
    on API keys to bypass project-level quotas.
-   Silent regrading when a rubric changes.
-   Public/guessable student PDF URLs.
-   Treating deployment or hosting decisions as finalized.

## 19. Decisions to confirm later (do not block core implementation unless necessary)

-   Final retention period for original student PDFs, rendered page
    images/crops, and annotated exports.
-   Whether the seven-day revaluation window should be calendar-day
    based in the institute timezone or UTC; current product rule is
    seven calendar days from publication, enforced server-side.
-   Exact duplicate revaluation policy after a prior request is
    resolved.
-   Final confidence thresholds for automatic review flags, calibrated
    from a human-verified benchmark.
-   Exact maximum upload size/page count after pilot testing; initial
    target is 15 MB / 10 pages and must be configurable.
-   Final AI provider/model chain and production pricing; model names,
    quotas and pricing must remain configurable and telemetry-driven.
-   Whether Branch Managers may ever receive a limited evaluation/review
    permission in a later version.
-   Whether partial result publication by exam/batch is required;
    default is explicit Root Admin publication of the intended ready
    set.
-   Final backup/retention/deletion policy and jurisdiction-specific
    student-data requirements.

------------------------------------------------------------------------

## Golden rules (quick reference)

1.  Root Admin alone controls answer keys, approved rubrics, evaluation
    start, AI queue, grade corrections, and result publication.
2.  Branch Manager operates only within their branch and handles exam
    setup, batches/students, and submission windows.
3.  Students see only their own records and published results.
4.  Submission window opens for 30 minutes; a two-minute grace is only
    for upload sessions authorized before the deadline.
5.  One current combined PDF per student/exam; replacement is validated
    first and atomic.
6.  Evaluation starts only after window closure + answer key + approved
    rubric + explicit Root Admin action.
7.  One global persistent FIFO queue; quota exhaustion pauses, it does
    not fail or reorder papers.
8.  No student sees any marks or graded PDF before explicit publication.
9.  Student-facing statuses are exactly `Submitted`, `Under Evaluation`,
    `Results Published`.
10. Revaluation is available for seven calendar days and is manual
    only---never AI-regraded.
11. Every material admin action, grade correction, region edit, window
    reopening and publication is auditable.
12. Deployment is intentionally deferred.
