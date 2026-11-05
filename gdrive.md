# PaperGrade AI — BYOS Google Drive Archive Architecture

**Status:** Planned implementation specification\
**Feature:** Student-owned Google Drive archive (Bring Your Own Storage / BYOS)\
**Prepared:** 5 November 2026\
**Audience:** Coding agents and engineers\
**Scope:** Architecture and implementation plan. This document does not claim that the feature is already implemented.

---

# 0. Read This Before Implementing

This document defines the intended product behaviour. Agents must first inspect the existing repository and map these decisions onto the actual implementation.

Do not assume that suggested filenames, routes, table names, or service boundaries already exist.

## Non-negotiable decisions

1. Cloudinary remains temporary working storage. It continues to store submitted scans and generated PDFs required by evaluation, teacher review and short-term retrieval.
2. Google Drive is an optional, student-owned archive. It stores only officially published graded answer-sheet PDFs by default.
3. PaperGrade's database remains the source of truth for marks, grading JSON, criterion scores, audit logs, publication state, document versions and archive status.
4. A published PDF is immutable. An approved and published revaluation creates a new PDF version; it never silently overwrites the previous published version.
5. Drive exports happen only after publication. Draft or unpublished results must never be exported to a student's Drive.
6. The 15-day Cloudinary retention period is separate from the lifetime of a Drive archive. Purging Cloudinary must never delete student Drive copies.
7. Google OAuth must request least-privilege access. The planned Drive scope is `https://www.googleapis.com/auth/drive.file`.
8. The Drive connection is optional. A student without Google Drive must still be able to submit papers, receive marks, view evaluation data and use PaperGrade normally.
9. Drive failures must not block result publication.
10. A Drive file ID or `webViewLink` is not proof that the file still exists. Students can delete files, revoke access or disconnect their accounts.

## Important Google OAuth production-policy correction

`drive.file` is classified by Google's Drive API documentation as a **non-sensitive** scope. It is designed for files created by the application or files explicitly opened/shared with the application.

However, non-sensitive scope classification does **not** waive Google's general OAuth production requirements.

Google's current OAuth policy requires a production application to have a publicly accessible homepage on a verified domain under the developer's ownership. The homepage must describe the application and link to its privacy policy and terms. Production branding/domain requirements are separate from sensitive/restricted scope verification.

A shared `*.vercel.app` deployment URL is not a domain PaperGrade owns.

Therefore:

- Agents may build the integration and test it using a separate OAuth Testing project.
- Do not assume that `drive.file` makes a Vercel-only deployment eligible for a compliant public production OAuth launch.
- Do not attempt to bypass Google's domain or branding requirements.
- Before public rollout, the owner must provide a domain PaperGrade controls, publish the required public pages, verify domain ownership and complete the applicable brand steps in Google Cloud Console.
- `drive.file` avoids the sensitive/restricted Drive-scope review and associated restricted-scope security-assessment path. It does not waive general production policy requirements.
- The 100-new-user cap is associated with applications that present the unverified-app screen, notably those using unapproved sensitive/restricted scopes. Do not hard-code a cap assumption. Confirm the Cloud Console scope classification, verification state and user-cap status before launch.

Google recommends separate Cloud projects for development/testing and production. Testing-mode refresh tokens for scopes such as `drive.file` expire after seven days. Testing mode must not be treated as a durable production archive configuration.

Official references are in Section 15.

---

# 1. Existing PaperGrade Baseline

The existing PaperGrade architecture describes:

- Next.js student/admin frontend.
- FastAPI backend.
- PostgreSQL in production and SQLite/WAL for local development through the current database abstraction.
- Cloudinary as the active cloud document store, with an existing storage abstraction and direction for local and S3-compatible providers.
- AI evaluation, deterministic score validation, teacher review/corrections, annotated PDF generation, publication controls and revaluation.
- Original uploads and generated PDFs covered by a 15-day document purge lifecycle.
- Marks, criterion scores, evaluation records and audit logs preserved in the database after document purge.
- Student access to graded PDFs gated by publication.

The current README describes the TTL as being stamped when grading completes.

**This plan intentionally changes the proposed retention anchor to publication time**, because the student should receive the stated retrieval period after results become accessible.

Before changing implementation, agents must inspect the actual repository and confirm current behaviour. The README is architectural context, not proof that every described feature or route exists exactly as written.

---

# 2. Product Behaviour

## 2.1 What goes into Google Drive?

Default archive contents:

- Final, officially published, annotated/graded PDF for each submission.
- A separate PDF for every subsequently published revision.

Do not upload by default:

- Raw/ungraded scans.
- Official question papers.
- Official answer keys.
- Internal grading JSON.
- Teacher audit logs.
- Rubrics or internal review artifacts.
- Draft or unpublished graded PDFs.

The archived PDF is the student-facing graded answer sheet generated by the existing PaperGrade PDF pipeline.

## 2.2 Drive folder structure

Create a private root folder in the student's My Drive:

```text
My Drive/
└── PaperGrade AI/
    └── 2026/
        └── November/
            └── Physics Test 01/
                ├── Physics_Test_01_Graded_v1.pdf
                └── Physics_Test_01_Graded_v2.pdf
```

Folder names should be deterministic and safe. Avoid unnecessary personal information in names.

Use stable internal identifiers in Drive `appProperties` so folder creation and file exports can be reconciled after network failures.

Store the root folder ID on the student's Google storage connection.

Files must remain private in the student's Drive.

**Never create an `anyone` or public-link permission.**

A `webViewLink` is a navigation URL, not a public access grant.

## 2.3 Student-facing experience

Add a storage area under Student Settings/Profile.

- Not connected: `Connect Google Drive`.
- Connected: show connected Google account email and `Disconnect`.
- Export pending: `Saving to Google Drive`.
- Export successful: `Saved to Google Drive` and `Open in Drive`.
- Reconnection required: `Reconnect Google Drive`.
- Export failed: show a human-readable reason and retry action where possible.
- File missing/deleted: show `This Drive copy is no longer available`.

On a published result page:

- Show the latest published graded PDF as the primary version.
- Show previous published versions in version history.
- For a version still in Cloudinary, use the existing in-app viewer/download path.
- For a version whose temporary Cloudinary copy has been purged, use its Drive archive link if the export exists.
- If neither copy exists, show a clear expired/unavailable state.

The student must be able to use PaperGrade without connecting Drive.

Explain that Drive is an optional personal archive and that files in Drive are controlled by the student's Google account.

---

# 3. Revaluation and Document Versioning

## 3.1 Immutable published versions

A published graded document must never be overwritten.

Example:

1. Initial evaluation is reviewed and published: create **v1**.
2. Student requests revaluation.
3. Teacher reviews and approves a correction.
4. PaperGrade generates a new PDF draft.
5. Authorized publisher explicitly publishes the revision.
6. Create **v2** and enqueue a new Drive export.
7. Keep v1 in history; mark v2 as the current published version.

This applies even when marks do not change but a published bounding box, annotation, transcription or visible explanation changes.

| Event                                                           | New published PDF?            |
| --------------------------------------------------------------- | ----------------------------- |
| Initial result publication                                      | Yes, v1                       |
| Revaluation approved and marks change                           | Yes, v2                       |
| Revaluation approved and only bounding boxes/annotations change | Yes, v2                       |
| Revaluation rejected                                            | No                            |
| Internal edits before first publication                         | No separate published version |
| A later approved revision is published                          | Yes, v3, etc.                 |

A revaluation draft must not be visible to the student or uploaded to Drive until publication.

## 3.2 Version record

Each published document version should capture an immutable snapshot/reference to:

- Submission ID.
- Version number.
- Grading/evaluation revision that produced it.
- Reason (`initial_publication`, `revaluation`, `annotation_correction`, etc.).
- Generated PDF SHA-256.
- Creation timestamp.
- Publication timestamp.
- Publisher ID.
- Previous document-version ID, if any.
- Current/superseded state.

PaperGrade's database defines version identity and ordering. Drive stores the corresponding physical PDF.

## 3.3 Current-version pointer

Use a single database pointer such as:

`submissions.current_published_document_version_id`

Adapt the name to existing conventions.

Update this pointer in the same database transaction that publishes the new version.

Avoid relying on loosely synchronized `is_current` flags. If the existing schema uses flags, enforce one current published version per submission transactionally.

## 3.4 Revaluation eligibility

Preserve existing PaperGrade revaluation rules unless the product owner explicitly changes them.

The existing architecture notes describe a seven-calendar-day student revaluation period after initial publication and manual review rather than automatic AI regrading.

Do not silently reset or extend the seven-day eligibility window as part of the Drive feature.

A Drive export is not a revaluation event.

---

# 4. Google OAuth and Drive API Design

## 4.1 Intended OAuth scopes

Request only:

```python
GOOGLE_OAUTH_SCOPES = [
    "openid",
    "email",
    "https://www.googleapis.com/auth/drive.file",
]
```

If product code genuinely needs another OpenID scope, document why before adding it. Do not add `profile` by habit.

Do not request these scopes:

```text
https://www.googleapis.com/auth/drive
https://www.googleapis.com/auth/drive.readonly
https://www.googleapis.com/auth/drive.metadata.readonly
https://www.googleapis.com/auth/drive.activity
```

These broader permissions are not required for the planned archive.

### Important `drive.file` boundary

PaperGrade can manage files it creates and files explicitly opened/shared with it through supported mechanisms.

It cannot browse the student's entire Drive or freely access unrelated existing files.

The feature must not depend on listing or reading unrelated Drive content.

Google Picker is not required in the first release because PaperGrade creates and manages its own folder tree and PDFs. If a later feature allows students to choose an existing folder or file, assess Google Picker and its additional configuration separately.

## 4.2 OAuth flow

Use a backend-controlled OAuth authorization-code flow suitable for a confidential web application.

1. Authenticated student clicks `Connect Google Drive`.
2. Backend creates a cryptographically random, single-use `state` value bound to the current PaperGrade user and session.
3. Use PKCE where supported by the selected OAuth library/client flow. Validate `state` on callback regardless.
4. Redirect the browser to Google's authorization endpoint.
5. Request the exact scopes above and offline access.
6. On first connection, request consent as needed to obtain a refresh token. Do not force a fresh consent prompt on every normal reconnection.
7. Google redirects to the exact registered backend callback URI.
8. Backend validates state, exchanges the authorization code, validates the ID token (signature, issuer, audience, expiry and nonce if used), and obtains the stable Google `sub`.
9. Backend encrypts and stores the refresh token.
10. Backend creates or resolves the PaperGrade root folder in that Google account.
11. Backend marks the connection active and returns only safe connection metadata to the frontend.

The frontend must never receive or store Google's refresh token or client secret.

## 4.3 Account identity

Use the OpenID Connect `sub` claim as the stable Google account identifier.

Email is display metadata and may change; do not use email as the sole identity key.

Store the connected account email for the Settings UI, but associate the connection primarily with:

- PaperGrade user ID.
- Provider (`google_drive`).
- Google OIDC subject (`sub`).

Do not allow a client-supplied student ID to decide which PaperGrade account receives the OAuth connection.

Bind OAuth `state` to the authenticated server-side session.

## 4.4 Token handling

- Store refresh tokens only on the backend.
- Encrypt refresh tokens at rest using a managed key or a strong application encryption key held outside the database.
- Never commit OAuth client secrets or token-encryption keys.
- Never put tokens in logs, API responses, analytics or browser storage.
- Use short-lived access tokens in memory for Drive API calls.
- If the token endpoint does not return a new refresh token, do not overwrite an existing valid refresh token with null.
- Handle `invalid_grant`, revocation and expired authorization as `REAUTH_REQUIRED`.
- On disconnect, revoke the token when possible and permanently delete the stored token.
- Do not delete files from the student's Drive on disconnect.
- Existing Drive files remain in the student's account after PaperGrade is disconnected. PaperGrade simply loses API authority to manage them.
- A refresh token may stop working at any time; the export worker and UI must recover gracefully.

## 4.5 OAuth environment configuration

Use separate Google Cloud projects for development/testing and production.

Suggested backend environment variables:

```env
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=
GOOGLE_OAUTH_SCOPES=openid,email,https://www.googleapis.com/auth/drive.file
GOOGLE_TOKEN_ENCRYPTION_KEY=
GOOGLE_DRIVE_ENABLED=false
```

Do not put `GOOGLE_OAUTH_CLIENT_SECRET` or `GOOGLE_TOKEN_ENCRYPTION_KEY` in `NEXT_PUBLIC_*` variables or frontend build-time configuration.

## 4.6 Deployment policy gate

Until PaperGrade has a verified domain it controls and the required public pages, keep the integration in development/testing mode with explicitly managed test users.

The existing Vercel-provided `*.vercel.app` hostname is not a domain PaperGrade owns.

Before public production launch:

- Obtain/control a custom domain.
- Publish a public homepage that describes PaperGrade.
- Publish Terms of Service and a Privacy Policy on the same owned domain.
- Link both from the homepage and Google OAuth configuration.
- Verify domain ownership in Google Search Console using an account associated with the Cloud project.
- Configure authorized domains and exact HTTPS origins/redirect URIs.
- Complete the applicable Google brand verification process.
- Confirm Data Access shows only the intended non-sensitive scope(s).
- Confirm the Cloud Console OAuth user-cap/verification status before rollout.

Do not confuse:

- **Brand verification:** application identity, name/logo, URLs and domain ownership.
- **Sensitive/restricted scope verification:** additional review for sensitive/restricted scopes.
- **Restricted-scope security assessment:** additional assessment where applicable if restricted data is stored/transmitted by the server.

The `drive.file` design avoids requesting the restricted full-Drive scope and therefore avoids that restricted-scope security-assessment path. It does not remove general production homepage/domain/branding requirements.

Testing-mode refresh tokens for Drive scopes expire after seven days. Do not treat Testing mode as the durable production archive configuration.

---

# 5. Storage Architecture and Responsibilities

## 5.1 Provider responsibilities

| Provider            | Responsibility                                                                           | Retention                      |
| ------------------- | ---------------------------------------------------------------------------------------- | ------------------------------ |
| Local storage       | Development/test only                                                                    | Existing dev lifecycle         |
| Cloudinary          | Temporary original scans, grading inputs, generated graded PDFs and review artifacts     | 15-day policy with safeguards  |
| Google Drive        | Student-owned archive of published graded PDFs and revisions                             | Until student deletes them     |
| PaperGrade database | Results, grading evidence, audit history, version records, provider IDs and export state | Existing database/audit policy |

Google Drive is not a replacement for Cloudinary during grading.

Evaluation, PDF generation, teacher review and annotation correction continue to use the existing PaperGrade pipeline.

## 5.2 Provider abstraction

Inspect and extend the existing `UnifiedStorageService`/storage abstraction rather than creating a parallel duplicated storage architecture.

Keep two distinct storage roles:

- **Temporary object storage provider:** Cloudinary/local/S3-compatible provider used by the evaluation pipeline.
- **Student archive provider:** Google Drive provider that stores published artifacts in a user's Drive.

Suggested interface (adapt to existing class patterns):

```python
class StudentArchiveProvider:
    def create_root_folder(self, connection): ...
    def ensure_folder(self, connection, parent_id, folder_key, folder_name): ...
    def upload_published_pdf(self, connection, parent_id, file_bytes, metadata): ...
    def get_file_metadata(self, connection, file_id): ...
    def download_file(self, connection, file_id): ...
    def delete_app_file(self, connection, file_id): ...
```

The first release does not need a generic multi-provider archive UI. Keep the provider boundary narrow enough that another archive provider can be added later.

---

# 6. Database Design

Agents must inspect the existing schema and migration conventions before writing migrations. Preserve compatibility with current SQLite development and PostgreSQL production support.

These are logical table designs, not a demand to copy names verbatim if equivalent structures already exist.

## 6.1 `storage_connections`

One connection record per Google account authorization.

| Column                     | Type / notes                                            |
| -------------------------- | ------------------------------------------------------- |
| `id`                       | Primary key                                             |
| `user_id`                  | FK to PaperGrade student/user                           |
| `provider`                 | `google_drive`                                          |
| `provider_account_id`      | Google OIDC `sub`                                       |
| `provider_email`           | Display email                                           |
| `encrypted_refresh_token`  | Encrypted backend-only secret                           |
| `granted_scopes`           | Actual granted scope list                               |
| `root_folder_id`           | PaperGrade root folder ID in Drive                      |
| `status`                   | `CONNECTED`, `REAUTH_REQUIRED`, `DISCONNECTED`, `ERROR` |
| `connected_at`             | Timestamp                                               |
| `last_verified_at`         | Timestamp                                               |
| `disconnected_at`          | Nullable timestamp                                      |
| `created_at`, `updated_at` | Timestamps                                              |

Requirements:

- One active Google Drive connection per PaperGrade student by default.
- Preserve old connection records as disconnected if a student connects another Google account, so historical export records remain attributable to the account that received them.
- Enforce active-connection uniqueness in a way compatible with the repository's SQLite/PostgreSQL support.
- Never return encrypted token fields through normal serializers or APIs.

## 6.2 `submission_document_versions`

Represents immutable student-facing graded PDF versions.

| Column                        | Type / notes                                                          |
| ----------------------------- | --------------------------------------------------------------------- |
| `id`                          | Primary key / UUID                                                    |
| `submission_id`               | FK                                                                    |
| `version_number`              | Integer starting at 1                                                 |
| `document_type`               | `graded_pdf`                                                          |
| `change_reason`               | Initial publication / revaluation / annotation correction             |
| `status`                      | `DRAFT`, `PUBLISHED`, `SUPERSEDED` as appropriate                     |
| `sha256`                      | Hash of final generated PDF                                           |
| `temporary_storage_provider`  | Usually `cloudinary`                                                  |
| `temporary_storage_public_id` | Cloudinary/object identifier                                          |
| `temporary_storage_url`       | If existing implementation stores it; prefer provider ID for deletion |
| `created_by`                  | Actor who initiated/created revision                                  |
| `created_at`                  | Timestamp                                                             |
| `published_by`                | Publisher                                                             |
| `published_at`                | Nullable until published                                              |
| `supersedes_version_id`       | Nullable previous version                                             |
| `purge_after`                 | Temporary copy expiry                                                 |
| `purged_at`                   | Nullable                                                              |
| `is_purged`                   | Temporary copy purged state                                           |

Requirements:

- Published version rows are immutable except for operational metadata such as purge/export state.
- A new approved revision creates a new row.
- Preserve a link to the evaluation/revaluation revision that produced the PDF.
- Store a stable internal version ID for Drive idempotency.
- A document version is not the same thing as a Drive file. One version may have zero, one, or multiple physical archive exports if providers are added later.

## 6.3 `storage_exports`

Tracks the copy of a document version stored in a student's Google Drive.

| Column                     | Type / notes                                 |
| -------------------------- | -------------------------------------------- |
| `id`                       | Primary key                                  |
| `document_version_id`      | FK to `submission_document_versions`         |
| `connection_id`            | FK to `storage_connections`                  |
| `provider`                 | `google_drive`                               |
| `provider_file_id`         | Drive file ID                                |
| `provider_folder_id`       | Destination folder ID                        |
| `web_view_link`            | Drive viewing URL returned by API            |
| `sha256`                   | Hash of exported PDF                         |
| `status`                   | See lifecycle below                          |
| `idempotency_key`          | Stable key derived from version + connection |
| `attempt_count`            | Integer                                      |
| `next_attempt_at`          | Retry schedule                               |
| `last_error_code`          | Sanitized provider error                     |
| `last_error_message`       | Sanitized non-secret diagnostic              |
| `created_at`, `updated_at` | Timestamps                                   |
| `exported_at`              | Successful upload time                       |
| `verified_at`              | Last successful metadata check               |
| `deleted_at`               | Set when known missing/deleted               |

Add a uniqueness constraint for `(document_version_id, connection_id, provider)` so retries do not create multiple export records for the same artifact and connected account.

If a student disconnects and reconnects a different Google account, the new connection gets its own export records.

## 6.4 Export statuses

Use a small explicit state machine:

- `PENDING` — export is queued.
- `UPLOADING` — a worker has claimed the job.
- `EXPORTED` — Drive returned a file ID and the result was persisted.
- `RETRYABLE_FAILED` — transient network, 429 or 5xx failure.
- `REAUTH_REQUIRED` — refresh token revoked/expired or consent is no longer valid.
- `PERMANENT_FAILED` — unrecoverable metadata/file/permission issue requiring intervention.
- `MISSING` — previously exported file is no longer accessible or was deleted.
- `SOURCE_EXPIRED` — export could not be completed before the temporary source was purged.

Do not treat `PENDING` or `UPLOADING` as success. Do not show `Saved to Google Drive` until a successful file ID is stored.

---

# 7. Export Worker and Idempotency

## 7.1 Export trigger

On publication of a document version:

1. Generate and validate the final PDF.
2. Save the immutable `submission_document_versions` record.
3. Publish the version and update the submission's current published version pointer.
4. In the same database transaction, create a `storage_exports` row in `PENDING` if the student has an active Drive connection.
5. Commit publication.
6. A background worker claims the export row and uploads the PDF.

If no Drive connection exists, publication still succeeds. Show the student an optional Drive connection/archive prompt.

Do not perform a long Drive upload in the HTTP publication request.

## 7.2 Worker claiming

Use existing durable database-backed job/worker patterns if possible. Do not introduce an in-memory-only queue.

Workers must:

- Claim jobs atomically.
- Use a lease/heartbeat or equivalent safe claim mechanism.
- Recover stale `UPLOADING` jobs.
- Avoid two workers exporting the same document simultaneously.
- Retry transient failures with exponential backoff and jitter.
- Stop retrying `REAUTH_REQUIRED` until the student reconnects.
- Record safe diagnostics and attempt counts.

## 7.3 Idempotent Drive upload

The worker must not create duplicate PDFs when an upload succeeds remotely but the worker crashes before committing the returned file ID to the database.

Recommended approach:

- Derive a stable `idempotency_key` from the internal `document_version_id` and `connection_id`.
- Include an app-private Drive `appProperties` marker containing the PaperGrade artifact/version identifier and connection/export identifier.
- If a previous attempt has an ambiguous outcome, look for the app-created file using the stored marker before creating another file.
- Persist the returned Drive file ID immediately after successful creation.
- If a file with the marker already exists, reconcile it into the existing export row rather than uploading again.

Use Google's Drive API v3 `files.create` with metadata and file bytes (multipart or resumable upload as appropriate).

Use `application/pdf` as the MIME type.

## 7.4 Retry classifications

| Failure                                 | Action                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Network timeout / connection reset      | Retry with backoff; first reconcile by idempotency marker                                        |
| HTTP 429                                | Retry with backoff; respect retry guidance                                                       |
| HTTP 5xx                                | Retry with backoff                                                                               |
| Expired access token                    | Refresh once and retry                                                                           |
| `invalid_grant` / revoked refresh token | Mark connection `REAUTH_REQUIRED`; pause exports                                                 |
| Student Drive quota/storage full        | Mark retryable or user-action-required; notify student                                           |
| Missing/invalid parent folder           | Reconcile/recreate PaperGrade folder if safely possible                                          |
| File deleted by student                 | Mark export `MISSING`; do not silently recreate unless product policy says to re-archive         |
| Invalid PDF or permanent request error  | Mark `PERMANENT_FAILED`; retain source until retention rules permit purge                        |
| Student disconnects                     | Stop API calls; retain existing file references and mark pending jobs as blocked/reauth-required |

Never log OAuth tokens, authorization codes, raw PDFs or sensitive student data.

---

# 8. Connection, Disconnect, Reconnect and Account Changes

## 8.1 Connect

- Require an authenticated PaperGrade student.
- Bind OAuth state to that student.
- Validate OIDC identity.
- Create or resolve the PaperGrade root folder.
- Persist the connection and encrypted refresh token.
- Queue eligible backfill exports.

## 8.2 Disconnect

When a student disconnects:

- Revoke the refresh token if possible.
- Delete the encrypted refresh token from PaperGrade.
- Mark the connection `DISCONNECTED`.
- Stop new exports and cancel/park pending jobs for that connection.
- Do not delete files already stored in Drive.
- Keep non-secret export metadata and last-known file links for history.

## 8.3 Reconnect to the same account

If Google `sub` matches an existing connection:

- Update/reactivate the connection safely.
- Replace the refresh token only when a new token is returned.
- Preserve existing root folder ID and export records.
- Reconcile pending exports.

## 8.4 Connect a different account

If Google `sub` differs:

- Create a new connection record.
- Do not associate old Drive file IDs with the new connection.
- Existing files remain in the previous Google account.
- Ask the student to confirm that the archive destination is changing.
- New exports go to the newly connected account.

## 8.5 Late connection / backfill

When a student connects Drive after already having published results:

- Queue published document versions whose temporary PDFs still exist in Cloudinary.
- Do not reconstruct a PDF from marks/JSON alone after its source PDF and generated artifact have been purged.
- Mark older versions already past retention and no longer available as `SOURCE_EXPIRED` or equivalent.
- Apply worker rate limits.
- Do not export unpublished or draft documents.

---

# 9. Document Retrieval After Cloudinary Purge

Retrieval must be driven by the database's document-version and export state.

Suggested resolution order:

1. Authorize the current PaperGrade user against the submission.
2. Verify that the requested document version is published and visible to that user.
3. If the temporary Cloudinary object exists and is not purged, use the existing in-app viewer/download path.
4. Otherwise, if an `EXPORTED` Drive record exists, return its `web_view_link` and file metadata.
5. Otherwise, return an explicit unavailable/expired state.

The initial release should provide **Open in Google Drive** after Cloudinary purge.

This avoids downloading the file back from Drive into Cloudinary.

An in-app Drive-backed streaming viewer can be added later if needed. If implemented:

- The backend must authorize the PaperGrade user and published version on every request.
- Use the stored connection and refresh token to retrieve the app-created file by ID.
- Stream the PDF; do not persist another long-lived copy.
- If the connection is revoked, show the Drive-open action or ask the student to reconnect.
- Do not make the Drive file public to simplify the viewer.

Remember: `webViewLink` is not proof of existence, access or public availability. A student may delete the file or use another Google account in the browser.

---

# 10. Revised 15-Day Retention and Purge Lifecycle

## 10.1 Retention anchor

The existing architecture notes describe the TTL as being stamped when a submission is graded.

This plan changes the intended rule:

**For each published graded PDF version:**

`purge_after = published_at + 15 days`

This makes the retrieval window begin when the student can actually access the result.

For the original uploaded scan (the source needed for review/revaluation), keep its own retention metadata. It must not be deleted while an active teacher review or revaluation depends on it.

## 10.2 Per-artifact retention

Avoid relying only on one `is_document_purged` flag on `submissions` once multiple published PDF versions exist.

Track temporary artifacts individually:

- Original submitted PDF.
- Each generated published graded PDF version.
- Any other temporary review artifact that requires retention.

At minimum, each artifact needs provider ID, creation/publication timestamp, expiry timestamp, purge state and any retention-hold reason.

## 10.3 Purge eligibility

A temporary artifact may be purged only when all are true:

- Its retention deadline has passed.
- It is not required by an active teacher review or pending revaluation.
- No export worker is actively reading it.
- If a connected student's export is pending, the configured bounded archive-recovery grace period has expired.

Suggested initial policy:

- Normal temporary retention: 15 days from publication for a graded version.
- Active review/revaluation: hold required source and relevant PDF artifacts until the case is resolved.
- Pending archive failure: allow a configurable, bounded recovery grace period (suggested default: seven additional days), then mark the archive outcome and purge.
- No Drive connection: normal 15-day temporary retention still applies.

These values must be configuration-backed, not scattered literals.

## 10.4 What purge must and must not do

Purge worker must:

- Delete only the temporary Cloudinary/local object associated with the expired artifact.
- Confirm provider deletion or record a retryable deletion failure.
- Mark that specific artifact purged with a timestamp.
- Preserve the document-version row and export metadata.
- Preserve marks, grading JSON, criterion scores and audit records according to existing retention policy.

Purge worker must **never**:

- Delete the corresponding student's Google Drive file.
- Delete a published document-version record.
- Delete grades or audit records as a side effect of document expiry.
- Mark a Drive export successful because Cloudinary deletion succeeded.

The normal Cloudinary purge path and the student Drive deletion/disconnect path must be separate services and separate permissions.

---

# 11. Suggested API Surface

Inspect existing route naming before implementation and reuse existing conventions. These are suggested contracts, not mandatory literal paths.

| Method   | Endpoint                                     | Purpose                                                   |
| -------- | -------------------------------------------- | --------------------------------------------------------- |
| `POST`   | `/api/v1/student/storage/google/connect`     | Start OAuth; return/redirect to Google authorization URL  |
| `GET`    | `/api/v1/storage/google/callback`            | Validate state, exchange code, persist connection         |
| `GET`    | `/api/v1/student/storage/connections`        | Return safe provider connection status                    |
| `DELETE` | `/api/v1/student/storage/google`             | Disconnect/revoke token; leave Drive files intact         |
| `GET`    | `/api/v1/student/submissions/{id}/documents` | List published versions and availability                  |
| `GET`    | `/api/v1/student/storage/exports/{id}`       | Return export status for an authorized student's artifact |
| `POST`   | `/api/v1/student/storage/exports/{id}/retry` | Retry where source exists and failure is retryable        |

Security rules:

- Every student endpoint must scope data to the authenticated student's own records.
- Do not trust a client-supplied `user_id`, Google email, Drive file ID or submission ownership claim.
- Branch managers/root admins must not receive students' OAuth tokens.
- Use CSRF/state protection on OAuth and disconnect actions.
- Rate-limit connect/disconnect/retry endpoints.
- Do not expose token material in JSON schemas or logs.

---

# 12. Frontend Behaviour

## Student Settings

Provide:

- Google Drive connection status.
- Connected Google email.
- Connect / Disconnect action.
- Plain-language explanation of requested permission.
- Statement that PaperGrade creates and manages only its own archive files, not unrelated Drive content.
- Statement that disconnecting does not delete existing Drive files.

## Result detail page

For each published version:

- Version label (`v1`, `v2`, ...).
- Publication timestamp.
- Current/latest marker.
- Archive status.
- `Open in PaperGrade` while Cloudinary copy exists.
- `Open in Google Drive` when exported.
- Clear unavailable state if neither provider has the file.

The latest version should be the default view, but previous versions remain accessible as long as their Drive copies exist.

## Notifications

Notify only on meaningful state transitions:

- Published graded paper saved successfully to Drive.
- Drive needs reconnection.
- Drive storage is full / export needs user action.
- Revised graded PDF published and archived.

Avoid notifications for every retry attempt.

---

# 13. Implementation Phases for Coding Agents

## Phase 0 — Repository discovery (mandatory)

Before editing:

1. Read the current project README and architecture documents.
2. Inspect the actual storage abstraction and Cloudinary implementation.
3. Inspect upload, evaluation, PDF generation, publication and revaluation paths.
4. Inspect the current purge job and exact columns it updates.
5. Inspect authentication/session handling and current Google OAuth code, if any.
6. Inspect DB abstraction/migration conventions for SQLite and PostgreSQL.
7. Report the concrete files/functions/tables that will be changed.

Do not begin by rewriting the storage subsystem.

## Phase 1 — Data model and provider boundary

- Add migrations for storage connections, document versions and storage exports (or map to existing equivalents).
- Add version records for newly published graded PDFs.
- Add a current-published-version pointer.
- Implement Google Drive archive provider behind a narrow service boundary.
- Add feature flag `GOOGLE_DRIVE_ENABLED=false` by default.
- Ensure existing Cloudinary upload, grading, review, publication and purge paths still work when the feature is disabled.

## Phase 2 — OAuth connect/disconnect

- Implement server-side authorization-code flow.
- Enforce exact scope allowlist.
- Validate state, ID token and account subject.
- Encrypt refresh tokens at rest.
- Create root folder idempotently.
- Implement disconnect/revocation and reconnection handling.
- Add unit tests for token persistence and account switching.

## Phase 3 — Publish-time versioning and export outbox

- Create immutable document version records.
- On explicit publication, create an export job in the same database transaction.
- Implement durable worker claiming and retry states.
- Upload to Drive with stable metadata/idempotency marker.
- Persist Drive file ID and `webViewLink`.
- Ensure repeated workers/publication calls do not duplicate a published version's Drive file.

## Phase 4 — Student UI and retrieval

- Add Settings connection UI.
- Add archive/export status.
- Add version history.
- Add Open in Drive action.
- Implement retrieval fallback after temporary Cloudinary purge.
- Add clear disconnected/deleted/expired states.

## Phase 5 — Purge integration

- Move temporary graded PDF TTL anchor to each version's `published_at`.
- Introduce per-artifact purge state as needed.
- Add active review/revaluation holds.
- Add bounded export-recovery grace period.
- Explicitly ensure Cloudinary purge never deletes Drive files.
- Preserve current database grading/audit records.

## Phase 6 — Staging test and production readiness

- Use a separate Google Cloud project for testing.
- Test with several controlled Google Accounts.
- Confirm exact scopes in Cloud Console and runtime requests.
- Test revocation and refresh-token behaviour.
- Complete custom-domain and policy requirements before broad public production launch.
- Do not remove the feature flag until all acceptance criteria pass.

---

# 14. Acceptance Criteria

The feature is not complete until these cases are tested.

## OAuth and security

- [ ] OAuth request contains exactly the approved allowlist (`openid`, `email`, `drive.file`).
- [ ] No full-Drive or metadata-wide scope is requested.
- [ ] State is single-use and bound to authenticated PaperGrade user.
- [ ] ID token is validated; account is linked by Google `sub`.
- [ ] Refresh token is encrypted at rest and never sent to frontend.
- [ ] Missing refresh token in a later response does not erase a valid stored token.
- [ ] Revocation/`invalid_grant` moves the connection to `REAUTH_REQUIRED`.
- [ ] Disconnect revokes/deletes token and leaves existing Drive files intact.
- [ ] Student A cannot read/manage Student B's connection, export or documents.
- [ ] No Drive file is made public.

## Folder and file creation

- [ ] First connection creates exactly one PaperGrade root folder.
- [ ] Repeated callbacks do not create duplicate root folders.
- [ ] Published PDF is uploaded as `application/pdf`.
- [ ] File is placed under the expected student root/academic folder.
- [ ] Only published graded PDFs are uploaded.
- [ ] Raw scans, answer keys, grading JSON and draft PDFs are not uploaded.
- [ ] `provider_file_id`, folder ID, hash and `web_view_link` are persisted.
- [ ] Retry after an ambiguous upload does not create duplicate files.

## Publication and revaluation

- [ ] Initial publication creates v1.
- [ ] Export begins only after publication.
- [ ] Drive failure does not roll back publication.
- [ ] Revaluation draft does not appear in Drive.
- [ ] Approved and published revaluation creates v2, not an overwrite of v1.
- [ ] Bounding-box-only published correction creates a new version.
- [ ] Rejected revaluation does not create a new published PDF.
- [ ] Current-version pointer changes atomically to the newly published version.
- [ ] Student can access previous published versions in version history.

## Retention and recovery

- [ ] Each published version receives `purge_after = published_at + configured TTL`.
- [ ] Pending reviews/revaluations hold required temporary artifacts.
- [ ] Temporary Cloudinary purge deletes only the temporary provider object.
- [ ] Drive copies remain after Cloudinary purge.
- [ ] Student can open an archived Drive PDF after Cloudinary expiry.
- [ ] No-Drive students continue using the normal 15-day temporary retrieval window.
- [ ] Late Drive connection backfills only versions whose temporary artifact still exists.
- [ ] Expired source artifacts are not falsely reported as archived.
- [ ] Export recovery grace is bounded and configuration-backed.

## Reliability and observability

- [ ] Worker claims are atomic and stale jobs recover.
- [ ] 429/5xx/network failures use backoff.
- [ ] Reauth-required jobs pause until reconnect.
- [ ] Full Drive storage produces a clear student-facing state.
- [ ] Deleted Drive files are marked missing when detected.
- [ ] Logs contain no tokens, authorization codes, raw answer-sheet contents or unnecessary student PII.
- [ ] Metrics exist for pending exports, success rate, retry count, export latency and failures by error class.

---

# 15. References and Policy Notes

Official Google documentation checked on **5 November 2026**:

1. [Choose Google Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) — scope sensitivity classification; `drive.file` is non-sensitive and designed for per-file access.
2. [Create and manage files in Google Drive](https://developers.google.com/workspace/drive/api/guides/create-file) — Drive API file/folder creation and uploads.
3. [Submit for brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification) — app identity, branding, homepage, privacy policy, authorized domains and verification workflow.
4. [Google OAuth 2.0 Policies](https://developers.google.com/identity/protocols/oauth2/policies) — production app requirements, domain ownership, homepage requirements, token security and minimum-scope requirements.
5. [Manage OAuth App Branding](https://support.google.com/cloud/answer/15549049) — external production app homepage and privacy-policy requirements; domain and branding configuration.
6. [Unverified apps](https://support.google.com/cloud/answer/7454865) — unverified app warnings and user cap.
7. [When verification is not needed](https://support.google.com/cloud/answer/13464323) — non-sensitive scopes and development/testing exceptions.
8. [Using OAuth 2.0 to Access Google APIs](https://developers.google.com/identity/protocols/oauth2) — authorization-code flow, refresh-token storage and expiration.
9. [Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification) — restricted-scope review and security assessment requirements.

## Policy interpretation for this design

- `drive.file` is the intended least-privilege Drive scope for PaperGrade's app-created archive files.
- Do not request `drive`, `drive.readonly` or `drive.metadata.readonly`.
- Scope classification does not waive general OAuth production obligations.
- A public production app needs a publicly accessible homepage on a verified domain under the developer's ownership, plus privacy and terms links.
- A Vercel-provided shared subdomain is not a domain PaperGrade owns. Continue implementation/testing there, but do not treat it as satisfying the public production domain requirement.
- The 100-new-user cap is tied to apps that present the unverified-app screen; confirm actual Console status and requested scopes rather than relying on a blanket statement.
- Testing-mode Drive refresh tokens expire after seven days. Use Testing mode only for controlled development/pilot work.
- Re-check Google's current Console requirements at launch; Google may update policies or classifications.

---

# 16. Agent Execution Instructions

When implementing this specification:

1. **Inspect before changing.** Identify the real files, functions, routes and schema in the current branch.
2. **Produce a short change map first.** List the concrete implementation files and migrations you intend to touch.
3. **Implement incrementally.** Keep Cloudinary and grading behaviour working after each phase.
4. **Do not make Drive mandatory.** A disconnected student must retain the full core PaperGrade experience.
5. **Do not overreach OAuth permissions.** Any scope addition requires a written justification and policy review.
6. **Do not overwrite published PDFs.** Use immutable versions.
7. **Do not make files public.** Keep student archives private in the connected account.
8. **Do not let a Drive outage block grading or publication.**
9. **Do not silently change the revaluation deadline or retention policy.** Implement the decisions in this document and flag any conflict with the live code for review.
10. **Do not claim Google production readiness until the owned-domain and Cloud Console requirements have been completed and verified.**

**Definition of done:** A student can optionally connect a Google account, PaperGrade can reliably archive each published graded PDF version in that student's private Drive, a revaluation produces a new version without overwriting history, and Cloudinary can purge temporary artifacts without breaking access to successfully archived documents or deleting academic records.
