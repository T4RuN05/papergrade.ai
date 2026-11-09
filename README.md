# PaperGrade AI — Enterprise Autonomous Evaluation & Assessment Integrity Platform

> **The Definitive Technical Bible & Comprehensive Architectural Specification**  
> *Version 2.0.0-PROD | Revision 2026.10 | Engineering Reference Manual*  
> PaperGrade AI is an enterprise-grade, multi-tenant automated examination evaluation platform. It leverages Google Gemini's multimodal reasoning to perform cursive handwriting transcription, question-to-answer mapping, spatial bounding-box localization, criteria-based rubric grading, and evidence quotation in a single multimodal pass—guaranteed by deterministic backend invariant mathematical enforcement, vector-annotated PDF exports via PyMuPDF, and multi-key quota management.

---

## 📑 Master Table of Contents
1. [Executive Product Overview & Core Philosophy](#1-executive-product-overview--core-philosophy)
2. [Global System Architecture & Distributed Block Diagram](#2-global-system-architecture--distributed-block-diagram)
3. [Multi-Tenant Hierarchy & Strict RBAC Security Matrix](#3-multi-tenant-hierarchy--strict-rbac-security-matrix)
4. [End-to-End Operational Lifecycle & Flowcharts](#4-end-to-end-operational-lifecycle--flowcharts)
   - 4.1 Exam Setup & Agentic Rubric Extraction
   - 4.2 Timed Submission Windows, Hard-Close Workflow & Published Exam Lifecycle Locks
   - 4.3 Student Ingestion, EXIF Auto-Orientation & Canonical PDF Assembly
   - 4.4 Autonomous Queue Worker Execution & Fallback Ring
   - 4.5 Teacher Audit, Manual Overrides & Spatial Bounding Box Adjustment
   - 4.6 Student Revaluation & Dispute Lifecycle
   - 4.7 15-Day Storage Retention (TTL) & Cloud Purge Lifecycle
5. [Database Architecture & The Dual-Dialect Engine](#5-database-architecture--the-dual-dialect-engine)
   - 5.1 Rationale: Dual-Dialect (PostgreSQL + SQLite WAL)
   - 5.2 The `PostgresCursorWrapper` & Parameter Sanitization Engine
   - 5.3 The PostgreSQL NUL Byte (`0x00`) Sanitizer (`UntranslatableCharacter` Fix)
   - 5.4 Complete Data Dictionary & Schema Specification (24 Tables Across 5 Domains)
   - 5.5 Master Entity-Relationship (ER) Diagram
6. [The AI Engine & Google Gemini Multimodal Pipeline](#6-the-ai-engine--google-gemini-multimodal-pipeline)
   - 6.1 Multimodal Vision vs OCR Chaining Tradeoff
   - 6.2 The Multi-Key Failover Ring (4-Key Round Robin)
   - 6.3 3-Tier Full-Flash Model Cascade (3.8 -> 3.6 -> 3.5)
   - 6.4 The 8,192 vs 65,536 Output Token Ceiling Forensic Analysis
   - 6.5 The Self-Healing JSON Stream Buffer (`_repair_truncated_json`)
   - 6.6 Prompt Engineering & Pedagogical Invariants
     - Requirement-First Rubric Decomposition
     - The Discrete 0.5-Mark Step Rule
     - The MCQ Single-Criterion Invariant
     - Normalized Bounding Box Coordinate Mapping ($[0, 1000] \to [0, 1]$)
   - 6.7 Telemetry Architecture & Post-Validation Logging
7. [Autonomous Persistent Background Worker Engine](#7-autonomous-persistent-background-worker-engine)
   - 7.1 Architecture & Multi-Threaded Daemon Pool
   - 7.2 Atomic Row Locking & Roll-Number FIFO Claim Strategy
   - 7.3 The 5-Minute Watchdog Thread (Stale Job Rescue)
   - 7.4 429 Quota Exhaustion & 30-Second Backoff Cooldown
   - 7.5 Non-Quota Error Retry Circuit Breaker (Max 3 Retries $\to$ `FAILED`)
8. [Deterministic Grading & Invariants Engine](#8-deterministic-grading--invariants-engine)
   - 8.1 Philosophy: Trust, but Deterministically Verify
   - 8.2 Score Clamping & Bottom-Up Criterion Summation
   - 8.3 The "Best-of-N" Section Option Limit Algorithm
   - 8.4 Vector PDF Overlays via PyMuPDF (`fitz`)
   - 8.5 150 DPI Answer Region Extraction & Image Crop Pipeline
   - 8.6 Immutable Teacher Audit Trail Engine
9. [Unified Hybrid Storage Tier & 15-Day TTL Lifecycle](#9-unified-hybrid-storage-tier--15-day-ttl-lifecycle)
   - 9.1 Storage Abstraction (`StorageService` Hierarchy: Local, Cloudinary, R2/S3)
   - 9.2 Mobile Photo EXIF Normalization & Multi-Image PDF Assembly
   - 9.3 15-Day Retention Policy (TTL) & Privacy Compliance (FERPA/GDPR)
   - 9.4 Cascade Exam Deletion & CDN Purge Engine
10. [Web Push Notification & Real-Time Alert Engine](#10-web-push-notification--real-time-alert-engine)
    - 10.1 W3C Standard Web Push via VAPID Cryptographic Keys
    - 10.2 Closed-App PWA Background Delivery
    - 10.3 In-App Notification Center, Context-Appropriate Icon Taxonomy & Audio Chimes
11. [Exhaustive Backend API Router Catalog](#11-exhaustive-backend-api-router-catalog)
    - Complete Reference of All 13 Routers & 32+ Endpoints
12. [Frontend Architecture & Next.js 14 App Router](#12-frontend-architecture--nextjs-14-app-router)
    - 12.1 Directory Structure & Layout Hierarchy
    - 12.2 Client-Side Context Mesh
    - 12.3 Role-Based Dynamic Routing & Zero-Flicker SSR Auth Check
    - 12.4 Spatial Document Viewer Canvas (`DocumentViewer.tsx`)
    - 12.5 One-Click Verification & Override Studio (`GradingModal.tsx`)
    - 12.6 TanStack React Query Caching Tier (`@tanstack/react-query`)
    - 12.7 Apple-Style Curved-Glass Micro-Tactility Design System
    - 12.8 Student PWA Mobile Portal Architecture & Past Exams Subsystem
13. [Observability, Telemetry & Quota Feasibility](#13-observability-telemetry--quota-feasibility)
    - 13.1 Real-Time Token Telemetry & Paid-Equivalent Cost Tracking
    - 13.2 Latency Percentiles ($P_{50}, P_{95}$)
    - 13.3 Quota Feasibility Modeling (40 & 50 Paper Batches)
14. [DevOps, Deployment & Operations Runbook](#14-devops-deployment--operations-runbook)
    - 14.1 Environment Configuration Matrix (`.env`)
    - 14.2 Production Deployment Setup (Render + Vercel + Supabase)
    - 14.3 Emergency Troubleshooting Playbooks
15. [Master Data Architecture & Business Intelligence (BI) Retention Specification](#15-master-data-architecture--business-intelligence-bi-retention-specification)
    - 15.1 Storage Tier Partitioning & Structural Invariants
    - 15.2 15-Day TTL Cascade Purge Engine Mechanics
    - 15.3 Historical Grade & Analytics Retention for Academic BI
    - 15.4 Multi-Tenant Data Isolation & Compliance Guarantees

---

## 1. Executive Product Overview & Core Philosophy

### 1.1 The Fundamental Problem of Physical & OMR Grading
Traditional examination grading across educational boards, universities, and coaching institutes presents severe operational bottlenecks:
1. **High Operational Latency**: Grading thousands of physical examination scripts takes weeks, delaying academic feedback loops and scorecard releases.
2. **Human Grader Fatigue & Subjectivity**: Evaluators experience cognitive fatigue when grading hundreds of repetitive subjective answers, resulting in inconsistent marking standards between morning and evening grading sessions.
3. **OMR Limitations**: Optical Mark Recognition (OMR) can only evaluate simple bubble multiple-choice sheets. It cannot read mathematical derivations, cursive handwriting, circuit diagrams, physics formulas, or step-by-step logic.
4. **Traditional OCR Failure Modes**: Generic OCR pipelines (e.g., Tesseract, standard Vision OCR) split an image into raw text chunks. When presented with cursive student handwriting, crossed-out lines, fraction bars, superscripts/subscripts, and margin notes, traditional OCR introduces catastrophic transcription errors that garble formulas before an evaluation algorithm ever sees them.

```mermaid
flowchart LR
    subgraph Traditional["Traditional Fragile Pipeline"]
        direction LR
        P_Scan["Handwritten Scan"] --> P_OCR["Generic OCR Engine"]
        P_OCR -->|"Garbled Math & Cursive"| P_LLM["Text-Only LLM Prompt"]
        P_LLM -->|"Hallucinated Sums"| P_Score["Faulty Total Score"]
    end

    subgraph PaperGrade["PaperGrade AI Single-Pass Multimodal Pipeline"]
        direction LR
        PG_Scan["High-Res Scanned PDF"] --> PG_Gemini["Gemini Multimodal Reasoning"]
        PG_Gemini -->|"Transcriptions, BBoxes & Evidence"| PG_Invariants["Backend Invariants Engine"]
        PG_Invariants -->|"Deterministic Bounding & Best-of-N"| PG_Final["Verified Score & Vector PDF"]
    end
```

### 1.2 The Zero-OCR, Single-Pass Multimodal Paradigm
PaperGrade AI abandons the fragile OCR-to-text pipeline entirely. Instead, it utilizes **Single-Pass Multimodal Evaluation**:
- High-resolution multi-page PDF scans of student answer sheets are fed directly into **Google Gemini Multimodal Vision Models** alongside the official Question Paper and Approved Rubric.
- In a **single multimodal inference pass**, the model simultaneously:
  1. Transcribes cursive handwriting and mathematical derivations with visual context.
  2. Disregards crossed-out scratch work and reads margin annotations accurately.
  3. Maps answer content directly to question IDs and sub-questions.
  4. Localizes work using normalized $[0, 1]$ bounding box coordinates $(x, y, w, h)$.
  5. Evaluates work against atomic rubric criteria and quotes verbatim text evidence for every awarded mark.
  6. Flags grading uncertainty or illegible handwriting for human review.

### 1.3 Core Architectural Tenets
1. **LLMs Are Evaluators, Never Calculators**: Language models must never be trusted to calculate arithmetic totals, sum sub-scores, or enforce section attempt limits. The backend Python invariants engine deterministically calculates all totals from validated criteria sub-scores and clamps marks within strict $[0, \text{max}]$ ranges.
2. **Zero-Trust Role Isolation**: Academic integrity requires physical separation of duties. Branch Managers can upload student scans and trigger grading, but they **cannot view or upload official answer keys**. Answer keys and rubric approvals are restricted exclusively to Root Administrators.
3. **Audit Trail Immutability**: Any modification made by a human teacher—whether adjusting a criterion mark, correcting transcription text, or dragging a bounding box—is logged with the user ID, timestamp, prior value, and explicit justification in an immutable audit table.
4. **Resilience Over Perfection**: Evaluation must never crash due to network drops, transient 429 quota exhaustion, or malformed JSON. The system features a multi-key round-robin ring (up to 4 active free-tier keys or Vertex AI paid service account), a 3-tier full-Flash model cascade (3.8 -> 3.6 -> 3.5), self-healing stream repair, and a persistent watchdog background worker pool.

---

## 2. Global System Architecture & Distributed Block Diagram

```mermaid
flowchart TB
    subgraph ClientTier["Client Tier (Next.js 14 App Router / React 18 / Tailwind CSS)"]
        direction TB
        AdminApp["Root Admin Dashboard\n(/admin/tenancy, /admin/reports)"]
        ManagerApp["Branch Workspace\n(/exams, /batches, /grading)"]
        StudentApp["Student PWA Portal\n(/student/portal, /student/exams)"]
        CanvasApp["Spatial Document Canvas\n(/grading/[id], /student/submissions/[id])"]
    end

    subgraph EdgeCDN["Storage & Edge Delivery Tier"]
        Cloudinary["Cloudinary CDN / R2 / S3 Storage\n(Signed Canonical PDFs, 150 DPI Crops, Annotated Vectors)"]
        VAPID["W3C Web Push Gateway\n(Google FCM / Apple APNs / Mozilla)"]
    end

    subgraph APITier["FastAPI Backend Application Cluster (:8000)"]
        direction TB
        MW_CORS["CORS & Request Profiling Middleware"]
        MW_Auth["JWT & Role Authorization Guard"]
        
        subgraph Routers["FastAPI Routers (13 Dedicated Domains)"]
            R_Auth["auth.py (JWT, Account Claim, Password Resets)"]
            R_Tenancy["tenancy.py (Institutes, Branches, Subjects, Batches)"]
            R_Exams["exams.py (Exams, Key Upload, Rubric Approval, Publishing)"]
            R_Subs["submissions.py (Uploads, Single Ingestion, Purge Expired)"]
            R_Grading["grading.py (Teacher Overrides, Bbox Edits, Reevaluations)"]
            R_Reval["revaluation.py (7-Day Student Disputes & Resolution)"]
            R_Windows["windows.py (Timed Windows, Hard-Close & Grace)"]
            R_Reports["reports.py (Issue Tickets & Screenshots)"]
            R_Exports["exports.py (CSV, Vector Graded PDF, Batch ZIP)"]
            R_Notifs["notifications.py (Push & In-App Drawer)"]
            R_Students["students.py (Unified Portal State & Past Submissions)"]
            R_Analytics["analytics.py (Telemetry, Quotas & Feasibility)"]
            R_Storage["storage.py (Signed Upload/Download URLs)"]
        end
    end

    subgraph ServiceTier["Core Business Logic & Service Domain"]
        direction TB
        S_Grading["GradingService\n(Invariants, Best-of-N, Audit Trail)"]
        S_Exam["ExamService\n(Lifecycle State Machine & Cascade Delete)"]
        S_PDF["PDFService\n(EXIF Auto-Orientation, PyMuPDF Vector Overlays, 150 DPI)"]
        S_Storage["StorageService\n(LocalStorageService, Cloudinary, Cloudflare R2)"]
        S_Retention["RetentionService\n(15-Day TTL Post-Grading Purge Engine)"]
        S_Notif["NotificationService\n(VAPID Encrypted Push & Web Audio Chimes)"]
        S_Usage["UsageService\n(P50/P95 Latency & Cost Analytics)"]
    end

    subgraph WorkerPool["Autonomous Persistent Worker Pool"]
        direction TB
        PW_Master["PersistentQueueWorker Pool\n(N Worker Daemon Threads)"]
        PW_Lock["Atomic DB Row-Level Claiming\n(ORDER BY roll_number ASC)"]
        PW_Watchdog["Watchdog Thread (60s Sweep)\n(5-Minute Stale Job Rescue)"]
        PW_Cooldown["Quota Backoff Manager\n(30s Sleep on 429 Exhaustion)"]
    end

    subgraph AIEngine["AI Inference Cluster (Google GenAI Python SDK)"]
        direction TB
        GeminiClient["GeminiGradingClient\n(4-Key Round-Robin Ring & GCP Vertex AI)"]
        PrimaryModel["gemini-3.8-flash (Primary, 65,536 Output Tokens)"]
        Fallback1["gemini-3.6-flash (Tier 1 Fallback)"]
        Fallback2["gemini-3.5-flash (Tier 2 Fallback)"]
        ReevalModel["gemini-3.5-flash-lite (Targeted Single-Answer Re-eval)"]
        StreamHealer["_repair_truncated_json\n(Bracket/Quote Recovery Engine)"]
    end

    subgraph DataTier["Database Tier (Dual-Dialect Engine)"]
        PG_Pool["Supabase Transaction Pooler (:6543)\nThreadedConnectionPool (max 25 conn)"]
        SQLite_WAL["SQLite 3 (WAL Mode + Foreign Keys)\n(Local Development & Offline Testing)"]
        CursorWrapper["PostgresCursorWrapper\n(? to %s Rewriter + NUL 0x00 Byte Filter)"]
        Tables[("24 Normalized Tables across 5 Domains:\ninstitutes, branches, subjects, users, batches,\nstudents, exams, exam_batches, submission_windows,\nrubric_versions, submissions, answers, answer_regions,\ncriterion_scores, evaluation_queue, revaluation_requests,\nnotifications, push_subscriptions, password_reset_requests,\ntechnical_reports, audit_logs, api_usage_events,\nuser_quota_settings, experiment_benchmarks")]
    end

    %% Client Interactions
    ClientTier <-->|REST API / HTTPS / Bearer JWT| APITier
    ClientTier <-->|Direct Asset Retrieval| EdgeCDN
    APITier --> ServiceTier
    ServiceTier --> DataTier
    ServiceTier <--> EdgeCDN
    
    %% Worker & AI Interactions
    WorkerPool --> ServiceTier
    WorkerPool --> GeminiClient
    GeminiClient --> PrimaryModel
    PrimaryModel -.->|429 Resource Exhausted| Fallback1
    Fallback1 -.-> Fallback2
    GeminiClient --> StreamHealer

    %% Database Connections
    CursorWrapper --> PG_Pool
    CursorWrapper --> SQLite_WAL
    PG_Pool --> Tables
    SQLite_WAL --> Tables

    %% Web Push & Storage
    S_Notif --> VAPID
    S_Storage <--> Cloudinary
```

---

## 3. Multi-Tenant Hierarchy & Strict RBAC Security Matrix

### 3.1 Four-Tier Tenancy Model
PaperGrade AI enforces strict logical data isolation across a four-tier educational hierarchy:
$$\text{Institutes} \longrightarrow \text{Branches} \longrightarrow \text{Batches} \longrightarrow \text{Students}$$

```mermaid
graph TD
    Inst["Institute: Apex Educational Entity"]
    Inst --> BranchA["Branch 1: North Campus"]
    Inst --> BranchB["Branch 2: South Campus"]
    BranchA --> BatchA1["Batch: Grade 12 - Science A"]
    BranchA --> BatchA2["Batch: Grade 12 - Science B"]
    BatchA1 --> Student1["Student 101"]
    BatchA1 --> Student2["Student 102"]
```

1. **Institutes**: The top-level customer organization (e.g., *"Apex Academy of Science"*).
2. **Branches**: Physical campuses or franchise locations (e.g., *"North Campus"*). Each branch has its own managers, students, and operational exam schedules.
3. **Batches**: Academic cohorts grouped by year and curriculum (e.g., *"Grade 12 Physics - Batch A 2026"*).
4. **Students**: Enrolled learners associated with roll numbers, student identification numbers, and individual submission histories.

### 3.2 Role Separation Matrix
Academic assessment integrity requires strict operational separation:
- **ROOT_ADMIN**: Global system administrators and academic board leads. They possess exclusive authority to upload official answer keys, trigger agentic rubric extraction, lock/unlock rubric versions, and perform cascade deletions.
- **BRANCH_MANAGER**: Operational campus heads. They schedule exams, open submission windows, upload batches of student answer scripts, monitor live grading queues, review flagged papers, and publish finalized results. **Branch Managers cannot view or upload official answer keys**, preventing advance question-key leaks.
- **STUDENT**: End learners. They access a mobile-optimized PWA portal to track exam submission windows with real-time countdown timers, upload handwritten answer sheets, view vector-annotated graded PDFs (only after official publication), and file revaluation disputes within a 7-day statutory window.

### 3.3 Authorization & Access Control Matrix

| System Domain / Action | Root Admin | Branch Manager | Student | Enforcement Mechanism |
| :--- | :---: | :---: | :---: | :--- |
| **Provision Institutes & Branches** |  | ❌ | ❌ | `require_root_admin` dependency |
| **Upload Question Papers** |  |  | ❌ | Branch-scoped query validation |
| **Upload Official Answer Keys** |  | ❌ | ❌ | Restricted endpoint (`/api/v1/exams/{exam_id}/answer-key`) |
| **Approve / Unlock Rubrics** |  | ❌ | ❌ | Enforces immutable evaluation contract |
| **Open / Reopen Submission Windows** |  |  | ❌ | `require_branch_manager` dependency |
| **Batch Upload Student Papers** |  |  | ❌ | File format & EXIF orientation pipeline |
| **Student Self-Upload (Windowed)** | ❌ | ❌ |  | Timed check against `submission_windows` |
| **Trigger Batch AI Evaluation** |  |  | ❌ | Requires approved rubric (`is_approved = 1`) |
| **Manual Teacher Override** |  |  | ❌ | Mandatory audit trail logging |
| **Publish Exam Results** |  |  | ❌ | Toggles `is_published = 1` |
| **Download Vector Graded PDF** |  |  |  | Blocked for students until exam published |
| **File 7-Day Revaluation Dispute** | ❌ | ❌ |  | Validates `now <= requested_at + 7 days` |
| **Approve / Reject Revaluation** |  |  | ❌ | Manual review requirement |
| **Trigger 15-Day Storage Purge** |  | ❌ | ❌ | Automated background service (`/api/v1/submissions/purge-expired`) |
| **Permanent Cascade Exam Deletion** |  | ❌ | ❌ | Purges DB records & Cloudinary CDN assets |

---

## 4. End-to-End Operational Lifecycle & Flowcharts

### 4.1 Flow 1: Exam Provisioning & Agentic Rubric Extraction
The official rubric defines the immutable contract against which every student paper is evaluated. The rubric extraction process converts raw unstructured PDFs (question paper + answer key) into a structured Pydantic schema using Gemini Multimodal reasoning.

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Root Admin
    participant UI as Next.js Exam Studio
    participant API as FastAPI Backend
    participant Storage as StorageService (Disk/CDN)
    participant AI as Gemini Multimodal Client
    participant DB as Dual-Dialect Database

    Admin->>UI: Uploads Question Paper PDF & Official Answer Key PDF
    UI->>API: POST /api/v1/exams (multipart/form-data)
    API->>Storage: Store Question Paper (calculate SHA256)
    API->>DB: INSERT INTO exams (status='DRAFT', lifecycle_status='DRAFT')
    API-->>UI: Exam Created (ID generated)

    Admin->>UI: Triggers "Extract Rubric"
    UI->>API: POST /api/v1/exams/{id}/answer-key
    API->>Storage: Store Official Answer Key
    UI->>API: POST /api/v1/exams/{id}/generate-rubric
    API->>AI: extract_exam_rubric(question_pdf, key_pdf, notes)
    Note over AI: Multi-key ring routes to gemini-3.8-flash<br/>max_output_tokens=65536<br/>Enforces MCQ Single-Criterion & 0.5-step rules
    AI-->>API: Returns ExamRubricExtractionResult JSON
    API->>DB: INSERT INTO rubric_versions (version_num=1, is_approved=0, rubric_data)
    API-->>UI: Draft Rubric Ready for Human Review

    Admin->>UI: Inspects criteria points, edits descriptions, adjusts weights
    Admin->>UI: Clicks "Approve & Lock Rubric"
    UI->>API: POST /api/v1/exams/{id}/rubric/approve
    API->>DB: UPDATE rubric_versions SET is_approved=1
    API->>DB: UPDATE exams SET status='RUBRIC_APPROVED'
    API-->>UI: Rubric Immutable & Locked
```

---

### 4.2 Flow 2: Timed Submission Windows, Hard-Close Workflow & Published Exam Lifecycle Locks
To simulate real-world testing environments, PaperGrade AI provides synchronized, timed submission windows with a strict deadline, automated grace periods, instant administrative cutoff controls, and strict post-publication lifecycle locking.

```mermaid
flowchart TD
    Manager(["Branch Manager"]) --> CheckPub{"Is Exam Published?<br/>(is_published == 1)"}
    CheckPub -->|"Yes (Finalized)"| LockUI["Suppress 'Open Window'<br/>Render Permanent 'Finalized' Badge<br/>Window Ingestion Permanently Locked"]
    CheckPub -->|"No (Open Lifecycle)"| OpenWin["POST /api/v1/windows/open<br/>Duration: 30 mins, Grace: 2 mins"]
    OpenWin --> DB_Win["INSERT INTO submission_windows<br/>status='OPEN', deadline_at, grace_deadline_at"]
    DB_Win --> NotifDispatch["NotificationService.notify_branch_students"]
    NotifDispatch --> WebPush["VAPID Encrypted Web Push to Phones"]
    
    subgraph StudentApp["Student PWA Client"]
        PortalState["GET /api/v1/student/portal-state<br/>(Cached via TanStack Query)"] --> TimerCalc{"Check Window Timestamps"}
        TimerCalc -->|"Within Deadline (Active)"| ActiveState["Display Green Countdown Timer<br/>Submissions Allowed"]
        TimerCalc -->|"Grace Period (2 mins)"| GraceState["Display Amber Grace Period Timer<br/>Submissions Allowed with Warning"]
        TimerCalc -->|"Window Expired"| ExpiredState["Display Closed State<br/>Upload Blocked with 403 Forbidden"]
    end

    ActiveState --> UploadReq["Student Submits Answer PDF"]
    GraceState --> UploadReq

    subgraph AdminCutoff["Administrative Hard-Close Workflow"]
        ManagerOverride(["Branch Manager Trigger"]) --> ForceClose["POST /api/v1/windows/{exam_id}/close"]
        ForceClose --> CloseDB["UPDATE submission_windows<br/>status='CLOSED', closed_at=NOW()"]
        CloseDB --> DropGrace["Immediate Grace Invalidation<br/>Instant 403 Block on In-Flight Uploads"]
    end
```

#### Administrative Hard-Close Workflow
In proctored or unannounced testing environments, branch managers require the capability to abort or prematurely terminate an active submission window. Calling `POST /api/v1/windows/{exam_id}/close`:
1. Sets `submission_windows.status = 'CLOSED'` and stamps `closed_at = NOW()`.
2. Truncates all remaining grace periods to zero milliseconds.
3. Immediately invalidates client upload tokens; any in-flight multipart PDF uploads reaching the server after the cutoff timestamp are rejected with `403 Forbidden ("Submission window has been closed by proctor")`.
4. Emits a real-time notification to active student PWA clients to update their UI to the closed state.

#### Published Exam Lifecycle Window Lock (`isExamPublished` Invariant)
Once an examination has been evaluated, audited by instructors, and officially published (`exams.is_published = 1`):
- **Integrity Invariant**: No further student submissions, window extensions, or re-evaluations can be scheduled for that exam. Allowing a submission window to reopen on a published exam would corrupt class rankings, tamper with finalized scorecards, and create un-evaluated orphan submissions.
- **UI Guardrail**: The exam dashboard dynamically inspects `isExamPublished`:
  ```tsx
  const isExamPublished = exam.is_published === 1 || exam.is_published === true;
  // If published, suppress the interactive "Open Window" button and render a static "Finalized" badge
  {isExamPublished ? (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-xs font-medium text-neutral-400 cursor-not-allowed">
      <Lock className="w-3.5 h-3.5 text-neutral-500" />
      Finalized
    </span>
  ) : (
    <button onClick={handleOpenWindow} className="btn-glass-primary h-8 px-3 text-xs">
      <Clock className="w-3.5 h-3.5" />
      Open Window
    </button>
  )}
  ```
- **Backend Rejection**: The submission window creation endpoint verifies `exams.is_published == 0`; if true, it aborts with `HTTP 409 Conflict ("Cannot open submission window for an exam whose results are published")`.

---

### 4.3 Flow 3: Student Ingestion, EXIF Auto-Orientation & Canonical PDF Assembly
Students frequently upload photos of exam papers taken via mobile cameras. These images often suffer from incorrect EXIF orientation tags (e.g., portrait photos showing sideways) or are submitted as separate image files. The [`PDFService`](file:///c:/Users/tarun/Desktop/Github%20Repo/PaperGrade%20AI/backend/app/services/pdf_service.py) normalizes every upload into a single upright multi-page PDF.

```mermaid
flowchart TD
    Upload(["Student / Manager Uploads Files"]) --> TypeCheck{"File Types?"}
    TypeCheck -->|"Single PDF"| VerifySize["Validate Size max 7MB and Pages max 15"]
    TypeCheck -->|"Multiple Images / Scans"| TransposeLoop["Iterate Images: ImageOps.exif_transpose"]
    
    TransposeLoop --> ConvertRGB["Convert RGBA/P to RGB"]
    TransposeLoop --> RenderPDFBytes["Convert to 150 DPI PDF Page Streams"]
    RenderPDFBytes --> AssembleDoc["PyMuPDF: doc.insert_pdf"]
    AssembleDoc --> SaveCanonical["Save Canonical Multi-Page PDF"]
    VerifySize --> SaveCanonical
    
    SaveCanonical --> CalcHash["Calculate SHA256 & Page Count"]
    CalcHash --> LocalCache["Write to backend/data/uploads/"]
    LocalCache --> CloudBackup["Async Upload to Cloudinary CDN / R2"]
    CloudBackup --> DB_Sub["INSERT INTO submissions<br/>status='QUEUED', submission_status='SUBMITTED'"]
```

---

### 4.4 Flow 4: Autonomous Queue Worker Execution & Fallback Ring
Grading is executed asynchronously by a multi-threaded daemon worker pool. The worker guarantees atomic job claims, pacing against API rate limits, and watchdog recovery of orphaned tasks.

```mermaid
flowchart TD
    Boot(["Worker Pool Initialized"]) --> LaunchWatchdog["Spawn 60s Watchdog Thread"]
    Boot --> LaunchWorkers["Spawn Worker Threads 0..N-1"]

    subgraph WorkerLoop["Worker Thread Loop"]
        ClaimLock["Acquire Claim Mutex"] --> AtomicQuery["SELECT * FROM evaluation_queue<br/>WHERE status='QUEUED'<br/>ORDER BY roll_number ASC LIMIT 1"]
        AtomicQuery --> JobFound{"Job Exists?"}
        JobFound -->|"No"| SleepPoll["Sleep poll_interval: 3s"] --> ClaimLock
        JobFound -->|"Yes"| LockRecord["UPDATE submissions SET status='PROCESSING'<br/>UPDATE evaluation_queue SET status='PROCESSING'"]
        LockRecord --> ReleaseLock["Release Claim Mutex"]
        
        ReleaseLock --> FetchRubric["Fetch Approved Rubric JSON from DB"]
        FetchRubric --> ResolveDoc["Resolve Canonical PDF from Disk or Cloudinary"]
        ResolveDoc --> AICall["Execute gemini_client.grade_student_submission"]
        
        AICall --> EvalOutcome{"Inference Result?"}
        
        EvalOutcome -->|"Success"| ApplyInvariants["GradingService.enforce_invariants_and_save<br/>1. Bounds marks: 0 to max<br/>2. Applies Best-of-N rules<br/>3. Strips NUL 0x00 bytes<br/>4. Generates crops & vector PDF"]
        ApplyInvariants --> CompleteJob["UPDATE submissions SET status='COMPLETED'<br/>UPDATE evaluation_queue SET status='COMPLETED'"]
        CompleteJob --> Pacing["Pacing Delay: 1.5s"] --> ClaimLock

        EvalOutcome -->|"429 Quota Exhausted"| Backoff["UPDATE submissions SET status='QUEUED', retry_count=0<br/>Sleep 30s Quota Cooldown"] --> ClaimLock

        EvalOutcome -->|"Schema / Parse Error"| CheckAttempts{"retry_count &lt; 3?"}
        CheckAttempts -->|"Yes"| ReQueue["UPDATE submissions SET status='QUEUED', retry_count++<br/>Exponential Jitter Backoff"] --> ClaimLock
        CheckAttempts -->|"No"| FailJob["UPDATE submissions SET status='FAILED', error_message"] --> ClaimLock
    end

    subgraph WatchdogLoop["Watchdog Rescue Thread (Every 60s)"]
        W_Sleep["Sleep 60s"] --> W_Find["SELECT * FROM submissions<br/>WHERE status='PROCESSING'<br/>AND updated_at &lt; now - 5 mins"]
        W_Find --> W_Reset["UPDATE submissions SET status='QUEUED', retry_count++<br/>UPDATE evaluation_queue SET status='QUEUED'"]
        W_Reset --> W_Sleep
    end
```

---

### 4.5 Flow 5: Teacher Audit, Manual Overrides & Spatial BBox Adjustment
Evaluated papers display confidence flags and review triggers. Teachers can inspect evidence, adjust marks, and drag bounding boxes directly on the spatial document canvas.

```mermaid
sequenceDiagram
    autonumber
    actor Teacher as Teacher / Evaluator
    participant Canvas as Spatial Canvas (DocumentViewer)
    participant Modal as GradingModal Studio
    participant API as FastAPI Backend
    participant Invariants as GradingService
    participant DB as Dual-Dialect Database

    Teacher->>Canvas: Clicks Bounding Box or Question Card
    Canvas->>Modal: Opens Question Verification Studio
    Note over Modal: Displays transcribed text, rubric criteria,<br/>awarded marks, and evidence quote
    Teacher->>Modal: Adjusts Criterion Marks & Enters Edit Reason
    Modal->>API: POST /api/v1/grading/override (question_id, marks, reason)
    API->>Invariants: recalculate_submission_scores(submission_id)
    Invariants->>DB: INSERT INTO audit_logs (old_marks, new_marks, reason, edited_by)
    Invariants->>DB: UPDATE criterion_scores & answers
    Invariants->>DB: UPDATE submissions (recomputed total_awarded_marks & percentage)
    API-->>Modal: 200 OK (Updated Score Record)
    Modal-->>Canvas: Re-renders with Violet/Green Override Badge
```

---

### 4.6 Flow 6: Student Revaluation & Dispute Lifecycle
To ensure transparency and academic fairness, students can file disputes on specific graded questions within 7 days of result publication.

```mermaid
stateDiagram-v2
    [*] --> DRAFT : Exam Created
    DRAFT --> EVALUATING : Evaluation Triggered
    EVALUATING --> EVALUATED : All Submissions Graded
    EVALUATED --> PUBLISHED : Results Released to Students
    
    state PUBLISHED {
        [*] --> ViewMarks : Vector Graded PDF Visible
        ViewMarks --> DisputeFiled : Student Files 7-Day Revaluation
        DisputeFiled --> TeacherReview : Under Evaluator Review
        TeacherReview --> DisputeApproved : Marks Adjusted & Audited
        TeacherReview --> DisputeRejected : Original Marks Upheld
    }
```

---

### 4.7 Flow 7: 15-Day Storage Retention (TTL) & Cloud Purge Lifecycle
To minimize cloud storage expenditure and comply with student data privacy standards (FERPA/GDPR), original scanned PDFs and vector exports are automatically purged after 15 days, while numerical marks and audit logs are preserved permanently.

```mermaid
flowchart TD
    Graded(["Submission Graded"]) --> StampTTL["Stamp retention_expires_at = graded_at + 15 days<br/>is_document_purged = 0"]
    StampTTL --> ActiveWindow["15-Day Retrieval Window<br/>Full PDF Downloads Allowed"]
    
    ActiveWindow --> PurgeSweep["Nightly Cron / API: POST /api/v1/submissions/purge-expired"]
    PurgeSweep --> ScanDB["SELECT * FROM submissions<br/>WHERE now &gt; retention_expires_at<br/>AND is_document_purged = 0"]
    
    ScanDB --> CloudPurge["Cloudinary Admin API: Delete Raw & Annotated PDFs"]
    ScanDB --> DiskPurge["Local Disk: Unlink uploads/ and exports/ PDFs"]
    
    CloudPurge --> UpdateDB["UPDATE submissions SET is_document_purged=1, purged_at=now()<br/>Keep all answers, criterion_scores, and totals intact"]
    DiskPurge --> UpdateDB
    
    UpdateDB --> FutureReq["Student Later Requests PDF Download"]
    FutureReq --> Return410["HTTP 410 Gone:<br/>Document purged per 15-day TTL policy.<br/>Numerical marks permanently retained."]
```

---

## 5. Database Architecture & The Dual-Dialect Engine

PaperGrade AI features an enterprise **Dual-Dialect Database Abstraction Layer** ([`backend/app/database.py`](file:///c:/Users/tarun/Desktop/Github%20Repo/PaperGrade%20AI/backend/app/database.py)) that provides zero-overhead interoperability across:
1. **Local Development / Offline Testing**: SQLite with Write-Ahead Logging (`PRAGMA journal_mode=WAL`) and foreign keys (`PRAGMA foreign_keys=ON`).
2. **Production High-Concurrency**: Supabase / PostgreSQL over connection pooling in **Transaction Mode (:6543)** via `psycopg2.pool.ThreadedConnectionPool`.

### 5.1 Rationale: Dual-Dialect Design
- **Eliminating ORM Latency**: Traditional heavyweight ORMs (e.g. SQLAlchemy, Tortoise) introduce 15–35% serialization latency and complex session management that interferes with high-throughput multi-threaded worker pools.
- **Identical SQL Codebase**: By implementing a lightweight dialect wrapper, identical SQL queries execute seamlessly on local developer laptops without requiring a running Docker PostgreSQL container, while running at maximum throughput on Supabase in production.

### 5.2 The `PostgresCursorWrapper` Engine
The `PostgresCursorWrapper` intercepts raw database calls and performs real-time SQL and parameter translation:
- **Parameter Marker Rewriting**: Automatically converts SQLite standard `?` positional parameters into PostgreSQL `%s` markers at runtime.
- **Timestamp Rewriting**: Rewrites SQLite `datetime('now')` expressions into ANSI PostgreSQL `TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`.
- **Dict-Like Row Access (`RowDict`)**: Wraps psycopg2 tuple results in a dictionary interface supporting both key lookups (`row["roll_number"]`) and case-insensitive index access, mirroring SQLite's `sqlite3.Row`.

### 5.3 The PostgreSQL NUL Byte (`0x00`) Sanitizer
A critical failure mode in LLM-assisted multimodal evaluation is the spontaneous generation of C-style null bytes (`\x00` or `\u0000`). When Gemini extracts complex mathematical expressions (e.g., integrals, Greek letters, physics formulas), these characters occasionally leak into transcription or rationale text fields.
- While SQLite permits raw `\x00` characters in text columns, **PostgreSQL strictly rejects them**, raising `psycopg2.errors.UntranslatableCharacter: unsupported Unicode escape sequence`.
- The `PostgresCursorWrapper._sanitize_params` algorithm intercepts all query parameters recursively:
  ```python
  def _sanitize_params(params):
      if isinstance(params, str):
          return params.replace("\x00", "")
      elif isinstance(params, (list, tuple)):
          return type(params)(_sanitize_params(v) for v in params)
      elif isinstance(params, dict):
          return {k: _sanitize_params(v) for k, v in params.items()}
      return params
  ```
- This permanently eliminates `UntranslatableCharacter` crashes across the entire platform.

---

### 5.4 Complete Data Dictionary & Schema Specification (24 Tables Across 5 Domains)

#### 1. `institutes`
The root tenant organization.
- `id` (TEXT, PK): Unique institute identifier (e.g., `inst_01j7...`).
- `name` (TEXT, NOT NULL): Full legal institution name.
- `code` (TEXT, NOT NULL, UNIQUE): Alphanumeric code (e.g., `APEX_ACADEMY`).
- `created_at` (TEXT, NOT NULL): ISO 8601 UTC creation timestamp.

#### 2. `branches`
Physical campus or operating division under an institute.
- `id` (TEXT, PK): Unique branch identifier (`branch_01j7...`).
- `institute_id` (TEXT, NOT NULL, FK $\to$ `institutes.id` ON DELETE CASCADE).
- `name` (TEXT, NOT NULL): Branch campus name (e.g., *"North Campus"*).
- `code` (TEXT, NOT NULL): Unique branch code within institute.
- `city` (TEXT, NOT NULL): Geographical city.
- `created_at` (TEXT, NOT NULL): ISO 8601 UTC timestamp.

#### 3. `subjects`
Academic course and subject definitions scoped to an institutional campus.
- `id` (TEXT, PK): Unique subject identifier (`sub_01j7...`).
- `branch_id` (TEXT, FK $\to$ `branches.id` ON DELETE CASCADE).
- `name` (TEXT, NOT NULL): Subject name (e.g., *"Physics"*).
- `code` (TEXT): Subject code (e.g., `"PHY-101"`).
- `description` (TEXT): Syllabus summary or description.
- `created_at` (TEXT, NOT NULL): ISO 8601 UTC timestamp.

#### 4. `users`
System user accounts for Root Admins, Branch Managers, and Students.
- `id` (TEXT, PK): User identifier (`usr_01j7...`).
- `institute_id` (TEXT, FK $\to$ `institutes.id` ON DELETE SET NULL).
- `branch_id` (TEXT, FK $\to$ `branches.id` ON DELETE SET NULL).
- `email` (TEXT, UNIQUE): Login email address.
- `role` (TEXT, NOT NULL): Role enum (`ROOT_ADMIN`, `BRANCH_MANAGER`, `STUDENT`). Evaluator and grading workflows are executed under `BRANCH_MANAGER` / `ROOT_ADMIN` access levels.
- `password_hash` (TEXT, NOT NULL): Bcrypt hashed credentials.
- `full_name` (TEXT, NOT NULL): Display name.
- `is_active` (INTEGER, DEFAULT 1): Account status flag.
- `last_login_at` (TEXT): Last successful login timestamp.
- `created_at` (TEXT, NOT NULL): ISO 8601 UTC timestamp.

#### 5. `batches`
Academic cohort grouping within a branch.
- `id` (TEXT, PK): Batch identifier (`batch_01j7...`).
- `branch_id` (TEXT, FK $\to$ `branches.id` ON DELETE CASCADE).
- `exam_id` (TEXT): Associated exam identifier.
- `name` (TEXT, NOT NULL): Cohort title (e.g., *"Grade 12 Science A"*).
- `academic_year` (TEXT, DEFAULT '2026').
- `status` (TEXT, DEFAULT 'QUEUED'): Operational state enum.
- `total_submissions` (INTEGER, DEFAULT 0).
- `completed_submissions` (INTEGER, DEFAULT 0).
- `failed_submissions` (INTEGER, DEFAULT 0).

#### 6. `students`
Student demographic profiles and account claim state.
- `id` (TEXT, PK): Unique student record ID (`stu_01j7...`).
- `batch_id` (TEXT, FK $\to$ `batches.id` ON DELETE CASCADE).
- `user_id` (TEXT, FK $\to$ `users.id` ON DELETE SET NULL): Linked auth user account.
- `student_id_num` (TEXT, NOT NULL, UNIQUE): Official institutional roll/ID number.
- `roll_number` (TEXT, NOT NULL): Exam desk roll identifier.
- `full_name` (TEXT, NOT NULL): Full legal student name.
- `email` (TEXT): Contact email.
- `account_claimed` (INTEGER, DEFAULT 0): Whether student has activated login.

#### 7. `exams`
The central examination definition entity.
- `id` (TEXT, PK): Exam identifier (`exam_01j7...`).
- `institute_id` (TEXT, FK $\to$ `institutes.id`).
- `branch_id` (TEXT, FK $\to$ `branches.id`).
- `title` (TEXT, NOT NULL): Exam title (e.g., *"Midterm Physics 2026"*).
- `subject` (TEXT, NOT NULL): Subject area.
- `total_marks` (REAL, DEFAULT 0.0): Calculated sum of required question marks.
- `question_paper_path` (TEXT): Canonical path to question paper PDF.
- `answer_key_path` (TEXT): Canonical path to official answer key PDF.
- `current_rubric_version_id` (TEXT): Pointer to active locked rubric.
- `lifecycle_status` (TEXT, DEFAULT 'DRAFT'): `DRAFT`, `RUBRIC_APPROVED`, `EVALUATING`, `EVALUATED`, `PUBLISHED`.
- `is_published` (INTEGER, DEFAULT 0): Visibility flag for student portal.
- `published_at` (TEXT): Publication timestamp.

#### 8. `exam_batches`
Many-to-many relationship mapping examinations to assigned student cohort batches.
- `exam_id` (TEXT, PK, FK $\to$ `exams.id` ON DELETE CASCADE).
- `batch_id` (TEXT, PK, FK $\to$ `batches.id` ON DELETE CASCADE).

#### 9. `submission_windows`
Timed submission windows with deadline and grace period.
- `id` (TEXT, PK): Window ID (`win_01j7...`).
- `exam_id` (TEXT, FK $\to$ `exams.id` ON DELETE CASCADE).
- `branch_id` (TEXT, FK $\to$ `branches.id`).
- `window_number` (INTEGER, DEFAULT 1): Reopen sequence index.
- `opened_at` (TEXT, NOT NULL): Window start timestamp.
- `deadline_at` (TEXT, NOT NULL): Official submission deadline.
- `grace_deadline_at` (TEXT, NOT NULL): Grace period expiration (+2 mins).
- `status` (TEXT, DEFAULT 'OPEN'): `OPEN` or `CLOSED`.
- `reopen_reason` (TEXT): Justification if window was reopened.
- `reopen_scope` (TEXT, DEFAULT 'UNSUBMITTED_ONLY').

#### 10. `rubric_versions`
Historical revisions of grading rubrics with approval locking.
- `id` (TEXT, PK): Rubric version ID (`rub_01j7...`).
- `exam_id` (TEXT, FK $\to$ `exams.id` ON DELETE CASCADE).
- `version_num` (INTEGER, NOT NULL): Sequential version index.
- `is_approved` (INTEGER, DEFAULT 0): Immutable lock flag (1 = Approved).
- `approved_by` (TEXT): User ID of Root Admin who signed off.
- `approved_at` (TEXT): Approval timestamp.
- `rubric_data` (TEXT, NOT NULL): JSON serialized `ExamRubricExtractionResult`.

#### 11. `submissions`
Individual student answer script records.
- `id` (TEXT, PK): Submission identifier (`sub_01j7...`).
- `exam_id` (TEXT, FK $\to$ `exams.id` ON DELETE CASCADE).
- `batch_id` (TEXT, FK $\to$ `batches.id`).
- `student_id` (TEXT, FK $\to$ `students.id`).
- `student_name` (TEXT, NOT NULL): Name extracted or provided.
- `roll_number` (TEXT, NOT NULL): Student roll number.
- `canonical_pdf_path` (TEXT, NOT NULL): Normalized multi-page PDF path.
- `annotated_pdf_path` (TEXT): Vector PyMuPDF annotated PDF path.
- `page_count` (INTEGER, DEFAULT 1): Number of evaluated pages.
- `status` (TEXT, DEFAULT 'QUEUED'): `QUEUED`, `PROCESSING`, `COMPLETED`, `NEEDS_REVIEW`, `FAILED`.
- `total_awarded_marks` (REAL, DEFAULT 0.0): Recalculated total score.
- `max_marks` (REAL, DEFAULT 0.0): Maximum obtainable marks.
- `percentage` (REAL, DEFAULT 0.0): Percentage score $[0.0, 100.0]$.
- `is_manual_override` (INTEGER, DEFAULT 0): Teacher modification flag.
- `retry_count` (INTEGER, DEFAULT 0): Worker retry attempts.
- `ttl_days` (INTEGER, DEFAULT 15): Document retention lifecycle duration.
- `graded_at` (TEXT): Timestamp when AI evaluation completed (starts 15-day TTL).
- `retention_expires_at` (TEXT): Purge timestamp ($t_{\text{graded}} + 15\text{d}$).
- `is_document_purged` (INTEGER, DEFAULT 0): Purge status flag.

#### 12. `answers`
Evaluated answers mapped to questions.
- `id` (TEXT, PK): Answer identifier (`ans_01j7...`).
- `submission_id` (TEXT, FK $\to$ `submissions.id` ON DELETE CASCADE).
- `question_id` (TEXT, NOT NULL): Question number/code (e.g., `"Q1"`).
- `subquestion_id` (TEXT): Sub-part identifier (e.g., `"Q1.a"`).
- `section_id` (TEXT): Section identifier (e.g., `"Section B"`).
- `is_extra_attempt` (INTEGER, DEFAULT 0): Best-of-N exclusion flag.
- `page_number` (INTEGER, NOT NULL): Primary page where work appears.
- `extracted_text` (TEXT, NOT NULL): Transcribed student handwriting.
- `max_marks` (REAL, NOT NULL): Maximum marks for this question.
- `awarded_marks` (REAL, NOT NULL): Clamped awarded marks.
- `grading_rationale` (TEXT, NOT NULL): Pedagogical justification.
- `needs_review` (INTEGER, DEFAULT 0): Low-confidence human review flag.
- `is_manual_override` (INTEGER, DEFAULT 0): Teacher edit indicator.

#### 13. `answer_regions`
Normalized spatial bounding boxes for visual localization.
- `id` (TEXT, PK): Region identifier (`reg_01j7...`).
- `answer_id` (TEXT, FK $\to$ `answers.id` ON DELETE CASCADE).
- `page_number` (INTEGER, NOT NULL): 1-indexed page index.
- `x` (REAL, NOT NULL): Left coordinate $\in [0.0, 1.0]$.
- `y` (REAL, NOT NULL): Top coordinate $\in [0.0, 1.0]$.
- `width` (REAL, NOT NULL): Box width $\in [0.0, 1.0]$.
- `height` (REAL, NOT NULL): Box height $\in [0.0, 1.0]$.
- `is_manual_override` (INTEGER, DEFAULT 0): Flag if box was dragged by teacher.

#### 14. `criterion_scores`
Atomic sub-criteria breakdowns for each evaluated question.
- `id` (TEXT, PK): Criterion score ID (`crit_01j7...`).
- `answer_id` (TEXT, FK $\to$ `answers.id` ON DELETE CASCADE).
- `criterion_id` (TEXT, NOT NULL): Rubric criterion key.
- `description` (TEXT, NOT NULL): Criterion description.
- `max_marks` (REAL, NOT NULL): Criterion point value.
- `awarded_marks` (REAL, NOT NULL): Awarded points $\in [0, \text{max}]$.
- `evidence` (TEXT, NOT NULL): Verbatim textual quote from student work.
- `is_manual_override` (INTEGER, DEFAULT 0).

#### 15. `evaluation_queue`
FIFO queue supporting atomic row-level claiming for background workers.
- `id` (TEXT, PK): Queue item ID (`q_01j7...`).
- `submission_id` (TEXT, FK $\to$ `submissions.id` ON DELETE CASCADE).
- `exam_id` (TEXT, FK $\to$ `exams.id` ON DELETE CASCADE).
- `priority` (INTEGER, DEFAULT 100): Lower number = higher priority.
- `status` (TEXT, DEFAULT 'QUEUED'): `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`.
- `attempt_count` (INTEGER, DEFAULT 0).
- `claimed_by_worker` (TEXT): Worker thread identifier.
- `claimed_at` (TEXT): Claim lease timestamp.

#### 16. `revaluation_requests`
Formal student grade disputes.
- `id` (TEXT, PK): Revaluation ID (`rev_01j7...`).
- `submission_id` (TEXT, FK $\to$ `submissions.id` ON DELETE CASCADE).
- `student_id` (TEXT, FK $\to$ `students.id` ON DELETE CASCADE).
- `exam_id` (TEXT, FK $\to$ `exams.id` ON DELETE CASCADE).
- `status` (TEXT, DEFAULT 'SUBMITTED'): `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`.
- `question_ids_json` (TEXT, NOT NULL): Array of disputed question IDs.
- `student_reason` (TEXT, NOT NULL): Student rationale.
- `reviewer_notes` (TEXT): Evaluator comments.
- `expires_at` (TEXT, NOT NULL): Statutory 7-day expiration timestamp.

#### 17. `notifications`
In-app user notifications.
- `id` (TEXT, PK): Notification ID (`notif_01j7...`).
- `user_id` (TEXT, FK $\to$ `users.id` ON DELETE CASCADE).
- `type` (TEXT, NOT NULL): Notification category.
- `title` (TEXT, NOT NULL): Notification heading.
- `message` (TEXT, NOT NULL): Notification body.
- `link_url` (TEXT): Navigation route.
- `is_read` (INTEGER, DEFAULT 0): Read receipt flag.

#### 18. `push_subscriptions`
VAPID Web Push client device subscriptions.
- `id` (TEXT, PK): Subscription ID (`psub_01j7...`).
- `user_id` (TEXT, FK $\to$ `users.id` ON DELETE CASCADE).
- `endpoint` (TEXT, NOT NULL, UNIQUE): Browser push gateway URL.
- `p256dh` (TEXT, NOT NULL): Client public cryptographic key.
- `auth` (TEXT, NOT NULL): Shared auth secret.
- `user_agent` (TEXT): Device metadata.

#### 19. `password_reset_requests`
Two-tier password reset approval workflow for students.
- `id` (TEXT, PK): Request ID (`pwd_01j7...`).
- `user_id` (TEXT, FK $\to$ `users.id` ON DELETE CASCADE).
- `student_id` (TEXT, FK $\to$ `students.id`).
- `branch_id` (TEXT, FK $\to`branches.id`).
- `status` (TEXT, DEFAULT 'PENDING'): `PENDING`, `APPROVED`, `COMPLETED`, `EXPIRED`.
- `reset_token` (TEXT): Cryptographic reset token.
- `approved_by` (TEXT): Branch manager who authorized reset.

#### 20. `technical_reports`
In-app bug and technical issue ticket management.
- `id` (TEXT, PK): Report ID (`rep_01j7...`).
- `user_id` (TEXT, FK $\to$ `users.id` ON DELETE CASCADE).
- `category` (TEXT, NOT NULL): `BUG`, `UI_ISSUE`, `ACCURACY`, `OTHER`.
- `subject` (TEXT, NOT NULL): Ticket title.
- `description` (TEXT, NOT NULL): Issue details (max 1,000 chars).
- `screenshots_json` (TEXT, DEFAULT '[]'): Array of Cloudinary/storage URLs.
- `status` (TEXT, DEFAULT 'OPEN'): `OPEN`, `IN_PROGRESS`, `RESOLVED`.
- `admin_notes` (TEXT): Root Admin resolution notes.

#### 21. `audit_logs`
Immutable compliance audit trail for all human teacher adjustments.
- `id` (TEXT, PK): Log entry ID (`aud_01j7...`).
- `user_id` (TEXT): Actor who initiated action.
- `submission_id` (TEXT): Target submission.
- `answer_id` (TEXT): Target answer.
- `field_name` (TEXT): Modified field (e.g., `"awarded_marks"`).
- `old_value` (TEXT): Pre-edit value.
- `new_value` (TEXT): Post-edit value.
- `reason` (TEXT): Mandatory teacher explanation.
- `action` (TEXT, DEFAULT 'MANUAL_EDIT').
- `created_at` (TEXT, NOT NULL): Immutable timestamp.

#### 22. `api_usage_events`
Detailed telemetry for every Google Gemini API call.
- `id` (TEXT, PK): Event ID (`evt_01j7...`).
- `timestamp` (TEXT, NOT NULL): Request start timestamp.
- `exam_id` (TEXT): Associated exam.
- `submission_id` (TEXT): Evaluated submission.
- `request_purpose` (TEXT, NOT NULL): `"RUBRIC_EXTRACTION"` or `"STUDENT_GRADING"`.
- `model_name` (TEXT, NOT NULL): Model ID (e.g., `"gemini-3.8-flash"`).
- `input_tokens` (INTEGER): Prompt tokens.
- `output_tokens` (INTEGER): Response tokens.
- `thinking_tokens` (INTEGER): Reasoning tokens.
- `cached_tokens` (INTEGER): Context cache tokens.
- `duration_ms` (INTEGER, NOT NULL): Inference round-trip latency.
- `success` (INTEGER, NOT NULL): 1 = Success, 0 = Failed.
- `http_status` (INTEGER): HTTP status code (200, 429, 500).

#### 23. `user_quota_settings`
Custom user/admin Google AI Studio rate-limit allocations and custom quotas.
- `user_id` (TEXT, PK, FK $\to$ `users.id` ON DELETE CASCADE).
- `custom_rpm` (INTEGER): Custom requests per minute limit.
- `custom_tpm` (INTEGER): Custom tokens per minute limit.
- `custom_rpd` (INTEGER): Custom requests per day limit.
- `updated_at` (TEXT, NOT NULL): Last quota update timestamp.

#### 24. `experiment_benchmarks`
In-app benchmarking records evaluating accuracy, latency, and token consumption across model versions.
- `id` (TEXT, PK): Benchmark identifier (`bmk_01j7...`).
- `exam_id` (TEXT, FK $\to$ `exams.id` ON DELETE CASCADE).
- `model_name` (TEXT, NOT NULL): Evaluated model (e.g., `"gemini-3.8-flash"`).
- `paper_count` (INTEGER, NOT NULL): Number of test papers graded.
- `avg_duration_sec` (REAL, NOT NULL): Average latency per paper.
- `total_cost` (REAL, NOT NULL): Paid-equivalent API cost in USD.
- `accuracy_score` (REAL): Benchmark score against ground-truth rubrics.
- `created_at` (TEXT, NOT NULL): Benchmark execution timestamp.

---

### 5.5 Master Entity-Relationship (ER) Diagram

```mermaid
erDiagram
    institutes ||--o{ branches : "operates"
    branches ||--o{ subjects : "offers"
    branches ||--o{ users : "employs"
    branches ||--o{ batches : "manages"
    batches ||--o{ students : "enrolls"
    users ||--o| students : "claims identity"
    users ||--o| user_quota_settings : "configures"
    branches ||--o{ exams : "schedules"
    exams ||--o{ exam_batches : "maps"
    batches ||--o{ exam_batches : "assigned"
    exams ||--o{ rubric_versions : "revises"
    exams ||--o{ submission_windows : "defines"
    exams ||--o{ submissions : "receives"
    exams ||--o{ evaluation_queue : "enqueues"
    exams ||--o{ experiment_benchmarks : "benchmarks"
    submissions ||--o{ answers : "contains"
    answers ||--o{ criterion_scores : "evaluates"
    answers ||--o{ answer_regions : "localizes"
    submissions ||--o{ revaluation_requests : "contested by"
    users ||--o{ notifications : "receives"
    users ||--o{ push_subscriptions : "registers"
    users ||--o{ password_reset_requests : "submits"
    users ||--o{ technical_reports : "files"
    users ||--o{ audit_logs : "records"
    exams ||--o{ api_usage_events : "tracks"
    answers ||--o{ criterion_scores : "evaluates"
    answers ||--o{ answer_regions : "localizes"
    submissions ||--o{ revaluation_requests : "contested by"
    users ||--o{ notifications : "receives"
    users ||--o{ push_subscriptions : "registers"
    users ||--o{ password_reset_requests : "submits"
    users ||--o{ technical_reports : "files"
    users ||--o{ audit_logs : "records"
    exams ||--o{ api_usage_events : "tracks"

    institutes {
        string id PK
        string name
        string code UK
    }

    branches {
        string id PK
        string institute_id FK
        string name
        string code
        string city
    }

    users {
        string id PK
        string institute_id FK
        string branch_id FK
        string email UK
        string role
        string password_hash
    }

    exams {
        string id PK
        string branch_id FK
        string title
        string subject
        float total_marks
        string lifecycle_status
        boolean is_published
    }

    submission_windows {
        string id PK
        string exam_id FK
        string status
        timestamp deadline_at
        timestamp grace_deadline_at
    }

    rubric_versions {
        string id PK
        string exam_id FK
        int version_num
        boolean is_approved
        json rubric_data
    }

    submissions {
        string id PK
        string exam_id FK
        string student_id FK
        string roll_number
        string status
        float total_awarded_marks
        timestamp retention_expires_at
        boolean is_document_purged
    }

    answers {
        string id PK
        string submission_id FK
        string question_id
        float awarded_marks
        float max_marks
        string extracted_text
        boolean needs_review
    }

    criterion_scores {
        string id PK
        string answer_id FK
        string criterion_id
        float awarded_marks
        float max_marks
        string evidence
    }

    answer_regions {
        string id PK
        string answer_id FK
        int page_number
        float x
        float y
        float width
        float height
    }

    evaluation_queue {
        string id PK
        string submission_id FK
        string status
        int attempt_count
        timestamp claimed_at
    }
```

---

## 6. The AI Engine & Google Gemini Multimodal Pipeline

PaperGrade AI interfaces directly with Google's latest multimodal models using the official Google GenAI Python SDK (`google-genai`).

### 6.1 Multimodal Vision vs OCR Chaining Tradeoff
Traditional architectures pass images through an OCR library, convert the output to text, and pass that text to an LLM. This causes severe information loss:
- **Spatial Relationship Destruction**: Handwriting written adjacent to a diagram or formula is severed from its visual anchor.
- **Math Symbol Corruption**: Square roots, summations, fraction bars, and exponents are frequently garbled into meaningless ASCII characters.
- **Strikethrough Confusion**: Students cross out incorrect attempts. OCR transcribes both the crossed-out work and the real answer as valid text, confusing the grading prompt.
- **Multimodal Advantage**: By passing the raw image/PDF directly to Gemini, the neural network evaluates the full visual context simultaneously—detecting crossed-out work, reading margin derivations, and understanding geometry/physics sketches.

### 6.2 The Multi-Key Failover Ring
Google AI Studio enforces Requests Per Minute (RPM) and Requests Per Day (RPD) ceilings on free and Tier-1 developer accounts. To provide continuous enterprise grading throughput, the [`GeminiGradingClient`](file:///c:/Users/tarun/Desktop/Github%20Repo/PaperGrade%20AI/backend/app/gemini/client.py) implements a **Rotating Multi-Key Ring**:
- API keys are supplied via environment variables: `GEMINI_API_KEY`, `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3`, `GEMINI_API_KEY_4`.
- On every outgoing call, keys rotate round-robin:
  $$\text{key\_index} = (\text{key\_index} + 1) \pmod{N}$$
- If an HTTP `429 RESOURCE_EXHAUSTED` error is encountered, the client immediately switches to the next key in the ring, applying jittered exponential backoff:
  $$t_{\text{sleep}} = 1.5^{\text{attempt}} + \text{Uniform}(0.1, 0.5)$$

### 6.3 3-Tier Full-Flash Model Cascade (3.8 -> 3.6 -> 3.5)
If all configured keys exhaust their quota on the primary model, the client cascades gracefully down a 3-tier full-Flash hierarchy:
$$\text{gemini-3.8-flash (Primary)} \longrightarrow \text{gemini-3.6-flash (Tier 1 Fallback)} \longrightarrow \text{gemini-3.5-flash (Tier 2 Fallback)}$$

- **Strict Exclusion of Lite/1.5 Models for Answer Sheet Grading**: In earlier iterations, lightweight models (`gemini-3.5-flash-lite`, `gemini-1.5-flash`) were tested as fallbacks. However, forensic analysis revealed that lite models suffered severe cursive handwriting transcription errors, hallucinated mathematical signs, and enforced hard 8,192 token output ceilings. In [`backend/app/gemini/client.py`](file:///c:/Users/tarun/Desktop/Github%20Repo/PaperGrade%20AI/backend/app/gemini/client.py#L61), all `-lite` and `1.5` models are strictly filtered out of the full grading cascade.
- **Targeted Single-Answer Re-Evaluation**: For re-evaluating an isolated disputed question crop (`POST /api/grading/answers/{sub_id}/{ans_id}/reevaluate`), where the payload is small and focused, the client utilizes `GEMINI_REEVAL_MODEL = "gemini-3.5-flash-lite"` (with fallback to `gemini-3.5-flash`) with a compact `max_output_tokens = 8192`.

---

### 6.4 The 8,192 vs 65,536 Output Token Ceiling Forensic Analysis
During large-scale production testing on complex board examinations (e.g., 16 questions, ~50 criteria evaluated across 7–10 handwritten pages), evaluations repeatedly experienced a critical failure mode:
1. **The 8,192 Token Barrier**: Standard LLM generation configs default `max_output_tokens=8192`.
2. **Token Inflation Under Vision Reasoning**: When Gemini processes multiple high-resolution PDF pages with `thinking_budget=4096`, transcribes full student handwriting, quotes evidence for 50 criteria, and generates 4 floating-point coordinates for each bounding box, the required JSON response payload reaches **9,000 to 14,000 output tokens**.
3. **The Silent Truncation Trap**: At token 8,192, Google's API terminates the output stream cleanly with `finish_reason='MAX_TOKENS'`. The stream ends abruptly mid-JSON (typically around question 12 or 13), causing Pydantic schema validation to fail with `ValidationError: EOF while parsing a value at line 742 column 15`.
4. **The Resolution**: In [`backend/app/gemini/client.py`](file:///c:/Users/tarun/Desktop/Github%20Repo/PaperGrade%20AI/backend/app/gemini/client.py#L694), the student grading configuration enforces:
   ```python
   config = types.GenerateContentConfig(
       max_output_tokens=65536,
       temperature=0.0,
       response_mime_type="application/json",
       response_schema=StudentGradingExtractionResult,
       thinking_config=types.ThinkingConfig(thinking_budget=settings.GEMINI_THINKING_BUDGET),
   )
   ```
   Expanding to 65,536 tokens provides ample runway for even the most extensive 20-page examination answer scripts, while `temperature=0.0` guarantees deterministic evaluation repeatability.

---

### 6.5 The Self-Healing JSON Stream Buffer (`_repair_truncated_json`)
In the event of an unavoidable network interruption or edge truncation, the client executes an automated structural repair algorithm before attempting schema deserialization:
```python
def _repair_truncated_json(json_str: str) -> str:
    """
    Repairs structurally truncated JSON by tracking quotation states
    and auto-closing open brackets and braces.
    """
    json_str = json_str.strip()
    in_string = False
    escape = False
    stack = []
    
    for char in json_str:
        if char == '"' and not escape:
            in_string = not in_string
        elif char == '\\' and in_string:
            escape = not escape
            continue
        elif not in_string:
            if char in '{[':
                stack.append('}' if char == '{' else ']')
            elif char in '}]':
                if stack and stack[-1] == char:
                    stack.pop()
        escape = False

    if in_string:
        json_str += '"'
    while stack:
        json_str += stack.pop()
    return json_str
```
This self-healing buffer prevents discarding already-evaluated questions if a network hiccup truncates the closing braces of a response.

---

### 6.6 Prompt Engineering & Pedagogical Invariants
In [`backend/app/gemini/prompts.py`](file:///c:/Users/tarun/Desktop/Github%20Repo/PaperGrade%20AI/backend/app/gemini/prompts.py), rubric extraction and grading are governed by four strict pedagogical rules:

#### 1. Requirement-First Rubric Decomposition
Rubrics are generated by breaking each question down into atomic, objective components:
- Formula definition & state assumptions
- Numerical substitution & unit conversion
- Step-by-step intermediate algebraic derivation
- Diagram clarity, labels, and axes
- Final numerical value with correct SI units

#### 2. The Discrete 0.5-Mark Step Rule
Criteria mark allocations must strictly follow **clean increments of 0.5**:
$$\text{Criterion Marks} \in \{0.5, \; 1.0, \; 1.5, \; 2.0, \; 2.5, \; 3.0, \; \dots\}$$
Arbitrary decimal values such as $0.25, 0.33, 0.75$ are explicitly prohibited by prompt rules. This ensures that a 3-mark question decomposes naturally into two 1.5-mark criteria or three 1.0-mark criteria, avoiding grading friction and rounding anomalies.

#### 3. The MCQ Single-Criterion Invariant
For Multiple Choice Questions (MCQs), intermediate solving steps or scratchpad derivations are **never graded**. Students frequently solve MCQs mentally or on rough scratch sheets not submitted with the paper.
- The prompt enforces: *"For Multiple Choice Questions (MCQs), generate exactly ONE criterion worth full marks: 'Correct option selection'. Do NOT generate criteria for solving steps."*
- This prevents the model from deducting marks when a student writes only *"Option (C)"* without intermediate algebra.

#### 4. Normalized Bounding Box Coordinate Mapping ($[0, 1000] \to [0, 1]$)
Gemini vision models perform spatial localization using an integer coordinate space $[0, 1000]$. The client automatically normalizes these into floating-point ratios $[0.0, 1.0]$:
$$x = \frac{\text{box}[1]}{1000.0}, \quad y = \frac{\text{box}[0]}{1000.0}, \quad w = \frac{\text{box}[3] - \text{box}[1]}{1000.0}, \quad h = \frac{\text{box}[2] - \text{box}[0]}{1000.0}$$
These normalized coordinates are resolution-independent and map directly to CSS percentage overlays in the browser and 72 DPI points in PyMuPDF.

---

### 6.7 Telemetry Architecture & Post-Validation Logging
Telemetry records are written to `api_usage_events`. To ensure operational metrics reflect reality:
- Telemetry events log `success=True` **only after Pydantic schema validation succeeds**.
- If Gemini returns HTTP 200 but the response payload fails Pydantic deserialization, the event is recorded with `success=False` and the specific validation error. This prevents false-positive "100% success" metrics in observability dashboards when papers are failing validation downstream.

---

## 7. Autonomous Persistent Background Worker Engine

Grading is executed by a multi-threaded daemon worker engine ([`backend/app/worker/queue_worker.py`](file:///c:/Users/tarun/Desktop/Github%20Repo/PaperGrade%20AI/backend/app/worker/queue_worker.py)).

### 7.1 Architecture & Multi-Threaded Daemon Pool
- Upon backend startup (FastAPI lifespan), the `PersistentQueueWorker` spawns $N$ worker daemon threads (configurable via `MAX_EVALUATION_WORKERS`, default 3).
- Daemon threads operate autonomously in an infinite execution loop, querying the database for jobs with `status = 'QUEUED'`.

### 7.2 Atomic Row Locking & Roll-Number FIFO Claim Strategy
To prevent race conditions where multiple workers grab the same student paper:
1. Workers acquire a thread-level mutex lock before querying the queue.
2. In PostgreSQL, the claim executes:
   ```sql
   SELECT id, submission_id FROM evaluation_queue
   WHERE status = 'QUEUED'
   ORDER BY priority ASC, created_at ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;
   ```
3. In SQLite, the worker immediately updates the status to `PROCESSING` within an active transaction before releasing the claim lock:
   ```sql
   UPDATE evaluation_queue SET status = 'PROCESSING', claimed_at = ? WHERE id = ?;
   UPDATE submissions SET status = 'PROCESSING' WHERE id = ?;
   ```
4. Papers are processed in **strict roll-number order** within each exam batch, ensuring that alphabetical/numerical rosters grade sequentially.

### 7.3 The 5-Minute Watchdog Thread (Stale Job Rescue)
If a backend container restarts, crashes, or is redeployed while a worker thread is evaluating a paper, the submission would remain stranded in `status = 'PROCESSING'` forever.
- A dedicated daemon **Watchdog Thread** wakes up every 60 seconds.
- The watchdog scans for jobs stuck in `PROCESSING` whose `updated_at` timestamp is older than 5 minutes:
  ```sql
  SELECT submission_id FROM evaluation_queue
  WHERE status = 'PROCESSING' AND updated_at < datetime('now', '-5 minutes');
  ```
- Any stranded jobs are automatically recovered back to `QUEUED`, and their `retry_count` is incremented.

### 7.4 429 Quota Exhaustion & Dynamic Backoff
When Google AI Studio returns HTTP 429 across all keys:
- The worker does **not** fail the job.
- The submission status is reset to `QUEUED` with `retry_count = 0`.
- The worker thread pauses for a **30-second cooldown period** before resuming polling. This allows the API quota window to reset without burning through retry allowances.

### 7.5 Non-Quota Error Retry Circuit Breaker
For non-quota errors (e.g., corrupt PDF stream, repeated Pydantic parsing failures):
- The worker increments `retry_count`.
- If `retry_count < 3`, the paper is requeued with exponential jittered delay.
- If `retry_count >= 3`, the submission is marked `FAILED` with a descriptive `error_message`, and the worker immediately moves on to the next student in the queue. This prevents a single corrupt document from deadlocking the entire campus grading pipeline.

---

## 8. Deterministic Grading & Invariants Engine

The [`GradingService`](file:///c:/Users/tarun/Desktop/Github%20Repo/PaperGrade%20AI/backend/app/services/grading_service.py) enforces absolute mathematical and pedagogical invariants.

### 8.1 Philosophy: Trust, but Deterministically Verify
Large language models are probabilistic text generators. They frequently make basic arithmetic errors when summing decimal values. **PaperGrade AI never uses the model's self-reported question or exam totals.**

### 8.2 Score Clamping & Bottom-Up Criterion Summation
Scores are computed deterministically from the bottom up:
1. Every individual criterion mark is clamped strictly to its defined range:
   $$\text{awarded\_crit}_i = \max(0.0, \; \min(\text{crit}_i.\text{awarded}, \; \text{crit}_i.\text{max}))$$
2. The question score is computed by summing the validated criteria:
   $$\text{raw\_question\_score} = \sum_{i=1}^{M} \text{awarded\_crit}_i$$
3. The question score is clamped against the question's maximum allowed marks:
   $$\text{final\_question\_score} = \min(\text{raw\_question\_score}, \; \text{question}.\text{max\_marks})$$

---

### 8.3 The "Best-of-N" Section Option Limit Algorithm
Many examinations provide optional choices (e.g., *"Section B: Attempt any 4 out of 6 questions, 5 marks each"*). If an ambitious student attempts all 6 questions, standard academic policy dictates evaluating all attempts but counting only the **highest-scoring questions** toward the total:

```mermaid
flowchart TD
    Start(["Section B: Attempt Any 4 of 6"]) --> GradeAll["Evaluate All 6 Attempted Questions"]
    GradeAll --> SortDesc["Sort Answers Descending by Score: score desc, confidence desc"]
    
    SortDesc --> SplitTop{"Index &le; 4?"}
    SplitTop -->|"Yes (Top 4 Highest Scores)"| MarkValid["Set is_extra_attempt = 0<br/>Count toward Total Marks"]
    SplitTop -->|"No (Excess 2 Lower Scores)"| MarkExtra["Set is_extra_attempt = 1<br/>Exclude from Total Marks<br/>Rationale: 'Optional choice: Best-of-N selected top score'"]
    
    MarkValid --> RecomputeExamTotal["Recompute Exam Total Score"]
    MarkExtra --> RecomputeExamTotal
```

1. All questions in the section are graded independently.
2. Questions are sorted descending: $\text{score} \downarrow$, then $\text{confidence} \downarrow$.
3. The top $K$ questions (where $K = \text{section}.\text{attempt\_limit}$) are flagged `is_extra_attempt = 0` and included in the total.
4. The remaining excess attempts are flagged `is_extra_attempt = 1` and excluded from the total, with an explanatory note displayed on the student's report card.

---

### 8.4 Vector PDF Overlays via PyMuPDF (`fitz`)
Rather than converting PDF pages into raster images, drawing on them, and re-encoding (which inflates file sizes by 10x and degrades text sharpness), PaperGrade AI uses **PyMuPDF vector annotations**:
- Coordinates $[0, 1]$ are mapped to PDF point units ($1 \text{ point} = \frac{1}{72} \text{ inch}$):
  $$\text{rect} = \text{fitz.Rect}(x \cdot W, \; y \cdot H, \; (x + w) \cdot W, \; (y + h) \cdot H)$$
- Rectangles are drawn as native vector shapes with semantic color coding:
  - 🟢 **Full Marks**: Green (`#10B981`)
  - 🟡 **Partial Marks**: Amber (`#F59E0B`)
  - 🔴 **Zero Marks**: Rose (`#EF4444`)
  - 🟣 **Needs Review**: Violet (`#8B5CF6`)
- Score badges (e.g., `[Q3: 4.5/5.0]`) and official verification stamps are injected into the vector layer without altering the underlying student handwriting.

### 8.5 150 DPI Answer Region Extraction & Image Crop Pipeline
To power the side-by-side inspection studio in the frontend:
- For every identified answer region, PyMuPDF extracts a **150 DPI PNG crop** of the specific bounding box.
- Crops are saved to `backend/data/page_renders/{submission_id}/crops/{question_id}_crop.png` or uploaded to Cloudinary.
- In the frontend audit modal, teachers can inspect the exact snippet of handwriting without panning through a 10-page document.

### 8.6 Immutable Teacher Audit Trail Engine
Whenever a teacher adjusts marks or edits transcription text:
- The backend writes an immutable entry into `audit_logs` capturing:
  $$\{\text{user\_id}, \; \text{submission\_id}, \; \text{question\_id}, \; \text{old\_value}, \; \text{new\_value}, \; \text{reason}, \; \text{timestamp}\}$$
- The submission's `is_manual_override` flag is set to `1`.
- The exam total and percentage are recomputed deterministically.

---

## 9. Unified Hybrid Storage Tier & 15-Day TTL Lifecycle

The storage subsystem ([`backend/app/services/storage.py`](file:///c:/Users/tarun/Desktop/Github%20Repo/PaperGrade%20AI/backend/app/services/storage.py)) provides a resilient hybrid storage tier.

### 9.1 Storage Abstraction (`StorageService` Hierarchy)
The storage subsystem exposes an abstract interface [`StorageService`](file:///c:/Users/tarun/Desktop/Github%20Repo/PaperGrade%20AI/backend/app/services/storage.py#L9) with runtime implementations resolved via `get_storage_service()`:
- **`LocalStorageService`**: Files uploaded or generated are stored locally under `backend/data/` for local development and offline environments.
- **`CloudinaryStorageService`**: In production cloud deployments (Render/Vercel), assets are synced to Cloudinary under structured folders (`papergrade/submissions/{exam_id}/{roll_number}/`).
- **`CloudflareR2StorageService`**: High-throughput S3-compatible object storage configured via `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`.

### 9.2 Mobile Photo EXIF Normalization
When mobile cameras capture answer sheets, EXIF orientation metadata often causes raw image bytes to display rotated $90^\circ$ or $180^\circ$.
- [`PDFService._image_to_upright_pdf_bytes`](file:///c:/Users/tarun/Desktop/Github%20Repo/PaperGrade%20AI/backend/app/services/pdf_service.py#L25) applies `PIL.ImageOps.exif_transpose` to physically rotate pixel arrays upright before conversion to PDF.
- Multiple images uploaded by a student are seamlessly merged into a single upright canonical PDF.

### 9.3 15-Day Retention Policy (TTL) Architecture
To comply with student privacy policies (FERPA/GDPR) and keep cloud storage costs near zero:
- Submissions are stamped with `retention_expires_at = graded_at + 15 days` (the retention clock starts strictly when grading completes; un-evaluated submissions waiting in queue do not decay).
- The scheduled retention purge engine (`POST /api/v1/submissions/purge-expired`) scans for expired submissions where `is_document_purged = 0`.
- The engine unlinks the raw scanned PDF and annotated PDF from disk and deletes them from Cloudinary / R2 via Admin API credentials.
- Rendered page images, crop previews, and bounding box coordinates (`answer_regions`) are deleted to conserve disk and database space.
- `is_document_purged` is set to `1`, and path columns are nulled.
- **All numerical marks, question-by-question criteria breakdowns, and teacher audit logs are permanently preserved** in the database.

---

## 10. Web Push Notification & Real-Time Alert Engine

PaperGrade AI integrates an enterprise W3C-standard **Web Push Notification Engine** ([`backend/app/services/notification_service.py`](file:///c:/Users/tarun/Desktop/Github%20Repo/PaperGrade%20AI/backend/app/services/notification_service.py)) that delivers alerts directly to student and teacher mobile devices even when the PWA is completely closed.

### 10.1 W3C Standard Web Push via VAPID Cryptographic Keys
- Uses Voluntary Application Server Identification (VAPID) with elliptic curve P-256 keys (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`).
- When a student installs the PWA and grants notification permissions, the browser generates an endpoint URL and cryptographic auth secret stored in `push_subscriptions`.
- Alerts are encrypted using ECDH and dispatched directly to Google FCM, Apple APNs, or Mozilla push gateways without third-party subscription fees.

### 10.2 Closed-App PWA Background Delivery
- When a submission window opens, a deadline approaches (5-minute warning), or results are officially published, the backend dispatches Web Push packets asynchronously via background daemon threads.
- The service worker (`ServiceWorkerRegister.tsx`) intercepts the push event, waking the operating system notification center on Android and iOS devices.

### 10.3 In-App Notification Center, Context-Appropriate Icon Taxonomy & Audio Chimes
Beyond external OS push notifications, PaperGrade AI provides an interactive In-App Notification Drawer ([`frontend/src/components/NotificationDrawer.tsx`](file:///c:/Users/tarun/Desktop/Github%20Repo/PaperGrade%20AI/frontend/src/components/NotificationDrawer.tsx)) supporting real-time visual, badge, and audible feedback for active users.

#### Context-Appropriate Semantic Icon Taxonomy
Earlier notification systems frequently used ambiguous icons (such as generic sparkles or identical bell symbols) across completely disparate events. PaperGrade AI enforces a strict, domain-specific icon taxonomy that immediately communicates the nature, urgency, and domain of each notification:

| Notification Category | Event Type / Key | Semantic Icon | Visual Accent | Contextual Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Evaluations & Grades** | `evaluation_completed`, `paper_graded` | `CheckCircle2` / `Sparkles` | Emerald / Green | Confirms successful automated AI grading or scorecard release. |
| **Rubric Actions** | `rubric_generated`, `rubric_approved` | `Scroll` / `FileCheck` | Blue / Indigo | Signals rubric extraction readiness or supervisor approval. |
| **Timed Windows** | `window_opened`, `window_closing_soon` | `Clock` / `Timer` | Sky / Cyan | Informs students that submission portal is live or countdown is active. |
| **Grace Periods** | `window_grace_period` | `Hourglass` / `AlertCircle` | Amber / Rose | Warns student that standard deadline passed and final grace countdown is ticking. |
| **Disputes & Revaluation** | `revaluation_requested`, `dispute_resolved` | `Scale` / `MessageSquare` | Purple / Violet | Alerts teachers to student grade challenges or informs student of outcome. |
| **Deletions & Purge** | `exam_deleted`, `document_purged` | `Trash2` / `Archive` | Red / Slate | Confirms destructive purge of underlying PDF binaries under 15-day TTL. |
| **System & Security** | `password_reset`, `auth_warning` | `ShieldAlert` / `KeyRound` | Orange | Security tokens and administrative reset approvals. |

#### Synthesized Web Audio Chimes Engine
To alert active users without bundling heavy audio asset files (MP3/WAV) or triggering network latency, the platform features a zero-dependency Web Audio API harmonic chime synthesizer:
- **Zero Asset Overhead**: Waveforms are synthesized on the client via `window.AudioContext` or `window.webkitAudioContext`.
- **Harmonic Sine-Wave Envelope**: Synthesizes a subtle, pleasant two-tone chord (frequency progression $F_1 = 587.33\,\text{Hz}\;[D_5] \to F_2 = 880.00\,\text{Hz}\;[A_5]$) with an exponential decay gain envelope ($T_{\text{decay}} = 0.4\text{s}$) to avoid acoustic distortion or harsh transients.
- **User Preference Persistence**: Users can toggle notification audio on or off via the drawer header switch. The boolean preference is persisted in `localStorage` under key `pg_notifications_sound` and respected across all tabs and routes.
- **Autoplay Compliance**: The `AudioContext` initializes lazily on first user interaction, complying with modern browser autoplay safety policies.

---

## 11. Exhaustive Backend API Router Catalog

The backend exposes 50+ endpoints across 13 dedicated routers plus root utility routes:

| Router | Method | Endpoint Path | Access Level | Description & Architectural Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **Auth** | `POST` | `/api/v1/auth/login` | Public | Authenticates root admins, branch managers, and students; returns signed JWT. |
| | `POST` | `/api/v1/auth/claim-account` | Public | Student claims pre-seeded roster account using roll-number and PIN. |
| | `GET` | `/api/v1/auth/me` | Authenticated | Fetches current user profile, branch affiliation, and role permissions. |
| | `POST` | `/api/v1/auth/forgot-password/request`| Public | Initiates student password reset request for branch manager review. |
| | `GET` | `/api/v1/auth/password-resets` | Branch Manager | Lists pending student password reset requests within manager's branch. |
| | `POST` | `/api/v1/auth/password-resets/{id}/approve` | Branch Manager | Approves reset request and generates one-time cryptographic token. |
| | `POST` | `/api/v1/auth/password-resets/{id}/reject` | Branch Manager | Rejects reset request with audit comment. |
| | `POST` | `/api/v1/auth/create-user` | Root Admin | Manually provisions a new administrative or manager account. |
| | `GET` | `/api/v1/auth/users` | Root/Manager | Lists registered users filtered by branch and role. |
| **Tenancy** | `GET` | `/api/v1/tenancy/institutes` | Root Admin | Lists all enrolled educational institutions. |
| | `POST` | `/api/v1/tenancy/institutes` | Root Admin | Provisions a new institutional tenant. |
| | `GET` | `/api/v1/tenancy/branches` | Authenticated | Lists campuses (scoped by institute or user permissions). |
| | `POST` | `/api/v1/tenancy/branches` | Root Admin | Provisions a new campus with unique code and geographical location. |
| | `GET` | `/api/v1/tenancy/subjects` | Authenticated | Lists academic courses and subjects scoped to branch. |
| | `POST` | `/api/v1/tenancy/institutes/{id}/subjects` | Root Admin | Adds an official course/subject definition. |
| | `GET` | `/api/v1/tenancy/batches` | Manager/Admin | Lists academic student batches. |
| | `POST` | `/api/v1/tenancy/batches` | Branch Manager | Provisions an academic cohort/batch within a branch. |
| | `GET` | `/api/v1/tenancy/batches/{id}/students` | Manager/Admin | Roster lookup of enrolled students in a cohort. |
| | `POST` | `/api/v1/tenancy/batches/{id}/students` | Branch Manager | Enrolls a student with official roll-number and PIN. |
| | `POST` | `/api/v1/tenancy/batches/{id}/import-students`| Branch Manager | Bulk CSV ingestion of class rosters with roll-number deduplication. |
| **Exams** | `GET` | `/api/v1/exams` | Manager/Admin | Lists exams scoped to user branch; batch-loads window status in 1 query. |
| | `POST` | `/api/v1/exams` | Manager/Admin | Creates exam record; uploads question paper. |
| | `GET` | `/api/v1/exams/{id}` | Manager/Admin | Fetches exam details, rubric versions, section rules, and evaluation stats. |
| | `DELETE`| `/api/v1/exams/{id}` | Root Admin | **Cascade Deletion**: Permanently purges exam, rubrics, submissions, and CDN assets. |
| | `POST` | `/api/v1/exams/{id}/answer-key` | Root Admin | Uploads official answer key PDF. |
| | `POST` | `/api/v1/exams/{id}/question-paper` | Manager/Admin | Uploads or replaces master question paper PDF. |
| | `POST` | `/api/v1/exams/{id}/generate-rubric` | Root Admin | Executes agentic Gemini multimodal rubric extraction. |
| | `POST` | `/api/v1/exams/{id}/rubric/approve` | Root Admin | Locks approved rubric version as immutable evaluation contract. |
| | `POST` | `/api/v1/exams/{id}/rubric/unlock` | Root Admin | Unlocks rubric back to draft state for modifications. |
| | `POST` | `/api/v1/exams/{id}/start-evaluation` | Manager/Admin | Enqueues all active submissions into the background evaluation queue. |
| | `POST` | `/api/v1/exams/{id}/publish` | Manager/Admin | Publishes finalized results to student portal. |
| | `GET` | `/api/v1/exams/{id}/evaluation-status` | Manager/Admin | High-speed (<5ms) polling endpoint for real-time evaluation progress bar. |
| | `GET` | `/api/v1/exams/{id}/rankings` | Manager/Admin | Calculates and returns class rankings and score distribution. |
| **Submissions** | `GET` | `/api/v1/submissions` | Authenticated | Lists submissions with role-based filtering (students see only own records). |
| | `POST` | `/api/v1/submissions/{exam_id}/upload-single` | Authenticated | Ingests student answer sheet (single PDF or multiple images); merges upright. |
| | `POST` | `/api/v1/submissions/{exam_id}/request-upload` | Authenticated | Initiates chunked/presigned upload session for heavy PDFs. |
| | `POST` | `/api/v1/submissions/{exam_id}/confirm-upload` | Authenticated | Verifies uploaded asset and creates queued submission. |
| | `GET` | `/api/v1/submissions/{id}` | Authenticated | Returns detailed evaluation breakdown with criteria, bboxes, and transcripts. |
| | `GET` | `/api/v1/submissions/exam/{exam_id}` | Manager/Admin | Lists all student submissions enrolled under an exam. |
| | `POST` | `/api/v1/submissions/purge-expired` | Root Admin | Triggers scheduled or manual sweep of the 15-day storage retention purge engine. |
| **Grading** | `POST` | `/api/grading/answers/{sub_id}/{ans_id}/edit` | Teacher/Admin | Records manual teacher override, updates scores, and logs immutable audit trail. |
| | `POST` | `/api/grading/answers/{sub_id}/{ans_id}/reevaluate` | Teacher/Admin | Targeted second-opinion re-evaluation of an answer crop via Gemini Flash-Lite. |
| | `POST` | `/api/grading/regions/{sub_id}/{reg_id}/edit` | Teacher/Admin | Updates bounding box coordinates after instructor drags handles on canvas. |
| | `POST` | `/api/grading/regions/{sub_id}/add` | Teacher/Admin | Manually draws and registers a new answer region bounding box. |
| | `DELETE`| `/api/grading/regions/{sub_id}/{reg_id}` | Teacher/Admin | Deletes an invalid or false-positive bounding box region. |
| | `GET` | `/api/grading/crop/{sub_id}/{ans_id}` | Authenticated | Serves 150 DPI cropped image of student handwriting for side-by-side modal. |
| | `GET` | `/api/grading/page-image/{sub_id}/{page_num}`| Authenticated | Serves full 150 DPI raster image of a student answer page. |
| **Windows** | `POST` | `/api/v1/windows/{exam_id}/open` | Branch Manager | Opens timed submission window with defined duration (e.g. 30m) and grace period. |
| | `GET` | `/api/v1/windows/{exam_id}/status` | Authenticated | Returns exact seconds remaining for real-time PWA countdown timers. |
| | `POST` | `/api/v1/windows/{exam_id}/close` | Branch Manager | Administratively hard-closes active window, cutting off student uploads. |
| | `POST` | `/api/v1/windows/{exam_id}/reopen` | Branch Manager | Reopens window for unsubmitted students with audit justification. |
| **Revaluation** | `POST` | `/api/v1/revaluation/{sub_id}/request` | Student | Files 7-day student revaluation dispute on specific questions with rationale. |
| | `GET` | `/api/v1/revaluation/my-requests` | Student | Lists student's own filed revaluation disputes and statuses. |
| | `GET` | `/api/v1/revaluation/requests` | Manager/Admin | Lists pending revaluation requests across campus for teacher review. |
| | `POST` | `/api/v1/revaluation/{request_id}/resolve` | Manager/Admin | Approves or rejects dispute, adjusting awarded marks and notifying student. |
| **Exports** | `GET` | `/api/exports/pdf/{sub_id}` | Authenticated | Streams PyMuPDF vector-annotated PDF (blocked for students until published; 410 if purged). |
| | `GET` | `/api/exports/marks-csv/{exam_id}` | Manager/Admin | Generates and streams complete class scorecard in CSV format. |
| | `GET` | `/api/exports/batch-zip/{batch_id}` | Manager/Admin | Compiles all graded PDFs for an entire batch into a downloadable ZIP archive. |
| **Notifications**| `GET` | `/api/v1/notifications` | Authenticated | Fetches user in-app notifications. |
| | `POST` | `/api/v1/notifications/push-subscription` | Authenticated | Registers client device VAPID push token for browser push delivery. |
| | `POST` | `/api/v1/notifications/push-unsubscribe` | Authenticated | Revokes registered browser push subscription. |
| | `GET` | `/api/v1/notifications/vapid-public-key` | Authenticated | Returns VAPID public key for browser push registration. |
| | `POST` | `/api/v1/notifications/{id}/read` | Authenticated | Marks a single notification as read. |
| | `POST` | `/api/v1/notifications/read-all` | Authenticated | Marks all user notifications as read in one batch. |
| **Reports** | `POST` | `/api/v1/reports` | Authenticated | Submits technical issue report with up to 3 screenshots (max 500KB each). |
| | `GET` | `/api/v1/reports/my` | Authenticated | Lists issues submitted by current user. |
| | `GET` | `/api/v1/reports` | Root Admin | Administrative ticket triage queue across all tenants. |
| | `PATCH` | `/api/v1/reports/{report_id}` | Root Admin | Updates ticket status (`IN_PROGRESS`, `RESOLVED`) with admin notes. |
| **Students** | `GET` | `/api/v1/student/portal-state` | Student | Unified high-performance endpoint with 4-second in-memory caching. |
| | `GET` | `/api/v1/student/past-submissions` | Student | Paginated past exams endpoint for student portal infinite scrolling. |
| **Analytics** | `GET` | `/api/v1/analytics/telemetry` | Root Admin | Real-time token consumption, latency percentiles ($P_{50}, P_{95}$), and costs. |
| | `POST` | `/api/v1/analytics/quota-settings` | Root Admin | Updates custom RPM, TPM, and RPD limits per user. |
| | `POST` | `/api/v1/analytics/benchmark` | Root Admin | Triggers model benchmarking run on test exams. |
| **Storage** | `GET` | `/api/v1/storage/download` | Authenticated | Generates pre-signed GET URL for direct-from-storage asset retrieval. |
| | `PUT` | `/api/v1/storage/upload` | Authenticated | Direct pre-signed upload handler for large binary objects. |

---

## 12. Frontend Architecture & Next.js 14 App Router

The frontend is engineered with **Next.js 14 (App Router)**, **TypeScript**, **Tailwind CSS**, and **Lucide Icons**.

### 12.1 Directory Structure & Layout Hierarchy
```
frontend/src/
├── app/
│   ├── layout.tsx                 # Root layout with font, theme & global context providers
│   ├── page.tsx                   # Interactive landing page with role-based auto-redirect
│   ├── admin/
│   │   ├── tenancy/               # Tenancy & campus infrastructure manager (institutes, branches, subjects)
│   │   └── reports/               # Technical issue reports and triage dashboard
│   ├── auth/
│   │   ├── login/                 # Unified credentials login portal
│   │   └── claim/                 # Student roll-number & PIN account claim
│   ├── batches/                   # Academic cohort management & CSV roster enrollment
│   │   └── [id]/                  # Batch detail & student roster table
│   ├── branch/batches/            # Campus-scoped batch workspaces
│   ├── exams/                     # Exam creation wizard & management hub
│   │   ├── new/                   # Multi-step exam creation flow
│   │   └── [id]/                  # Exam overview, key upload, window controls & submissions
│   │       └── rubric/            # Interactive rubric studio & version approval
│   ├── grading/                   # Teacher inspection hub
│   │   └── [id]/                  # Spatial Document Canvas & inspection studio (by submission ID)
│   ├── marks/                     # Class scorecards & export studio
│   ├── results/[id]/              # Published exam rankings & student performance distributions
│   ├── student/
│   │   ├── portal/                # Mobile-optimized PWA student dashboard & past exams
│   │   ├── exams/                 # Active student exam listing
│   │   └── submissions/[id]/      # Student view of evaluated paper & dispute filing
│   ├── revaluation/               # Revaluation dispute management interface
│   ├── notifications/             # Full-page notification history
│   └── analytics/                 # Telemetry dashboards, token charts, cost calculators
├── components/
│   ├── DocumentViewer.tsx         # 1,480-line Spatial Document Canvas with 8-handle bbox resize
│   ├── GradingModal.tsx           # Teacher verification, rubric breakdown & override studio
│   ├── RubricEditor.tsx           # Interactive rubric point editor & approval controls
│   ├── MarksTable.tsx             # Sortable student scorecard table with review badges
│   ├── NotificationDrawer.tsx     # Sliding notification center with Web Audio chime engine
│   ├── ExamRankedTable.tsx        # Published exam class rankings table
│   ├── ReportIssueModal.tsx       # Multi-screenshot technical issue reporter
│   ├── ServiceWorkerRegister.tsx  # PWA service worker & closed-app push interceptor
│   └── ui/
│       ├── AppleSelect.tsx        # Viewport-aware portal dropdown with Apple ease physics
│       ├── AppleNumberStepper.tsx # Accelerated micro-stepper with tactile scaling & direct input
│       └── Skeleton.tsx           # Atomic skeletons (PastExamsCardsSkeleton, TableSkeleton)
└── lib/
    ├── api.ts                     # 50KB Exhaustive typed API client
    ├── queryKeys.ts               # Centralized TanStack React Query key factory
    ├── QueryProvider.tsx          # Hydration boundary & query client provider
    ├── TenantContext.tsx          # Multi-tenant branch scoping state
    ├── NotificationContext.tsx    # Unread counter, drawer state & push sync
    ├── ThemeContext.tsx           # Theme switcher state
    ├── ConfirmContext.tsx         # Enterprise confirmation dialog provider
    ├── ToastContext.tsx           # Action-linked toast notifications
    └── types.ts                   # Unified TypeScript interfaces matching backend Pydantic models
```

### 12.2 Client-Side Context Mesh
- **`TenantContext`**: Maintains active branch selection across sessions, automatically appending branch filters to all dashboard queries.
- **`ToastContext`**: Provides feedback toasts with custom icons, progress timers, and undo action hooks.
- **`ConfirmContext`**: Prevents accidental destructive actions (e.g., cascade exam deletion, closing submission windows) via modal dialogs.
- **`BreadcrumbContext`**: Maintains synchronized breadcrumb trails, shortening long UUIDs to 8 characters during loading states to prevent layout overflow.
- **`NotificationContext`**: Coordinates in-app alert badges, unread counts, audio chime playback, and push subscription synchronizations.
- **`ThemeContext`**: Manages responsive system and dark-mode styling across all client components.

### 12.3 Zero-Flicker SSR Auth Verification
To prevent the jarring "logged-out redirect flicker" on page refresh:
- Next.js root layout reads auth cookies synchronously before rendering client children.
- If a student accesses the root `/` URL, the layout performs an immediate client redirect to `/student/portal` before rendering the marketing landing page.

---

### 12.4 Spatial Document Viewer Canvas (`DocumentViewer.tsx`)
The interactive document canvas ([`frontend/src/components/DocumentViewer.tsx`](file:///c:/Users/tarun/Desktop/Github%20Repo/PaperGrade%20AI/frontend/src/components/DocumentViewer.tsx)) is a 1,480-line component providing spatial document interaction:
- **Interactive Bounding Box Resizing**: Evaluated answer regions feature **8 draggable resize handles** (`move`, `nw`, `n`, `ne`, `e`, `se`, `s`, `sw`, `w`). Teachers can adjust bounding box boundaries directly on the canvas, saving updated coordinates back to the backend.
- **Hybrid Rendering Engine**: Features client-side PDF.js canvas rendering with automatic fallback to high-resolution pre-rendered 150 DPI raster images.
- **LRU Document Memory Caching**: Maintains an in-memory client cache of loaded PDF documents (`pdfDocMemoryCache`), preventing repeated network fetches when switching between pages.
- **Semantic Border Overlays**: Green for full marks, amber for partial marks, red for zero marks, violet for review flags.

### 12.5 One-Click Verification & Override Studio (`GradingModal.tsx`)
Clicking any bounding box on the canvas opens the inspection studio ([`frontend/src/components/GradingModal.tsx`](file:///c:/Users/tarun/Desktop/Github%20Repo/PaperGrade%20AI/frontend/src/components/GradingModal.tsx)):
- **Side-by-Side Crop & Evidence**: Displays the 150 DPI handwriting crop alongside the transcribed text and verbatim rubric evidence quote.
- **Criterion-by-Criterion Stepper**: Teachers can increment or decrement marks on individual criteria; the modal automatically recalculates the question total clamped to `max_marks`.
- **Mandatory Audit Logging**: Requires an explicit reason before enabling the save button, preventing unaccountable grade inflation.

---

### 12.6 TanStack React Query Caching Tier (`@tanstack/react-query`)
To replace naive `cache: "no-store"` HTTP fetches—which generated repetitive round-trips, layout thrashing, and unnecessary load on the backend database—the frontend incorporates **TanStack React Query v5** ([`frontend/src/lib/QueryProvider.tsx`](file:///c:/Users/tarun/Desktop/Github%20Repo/PaperGrade%20AI/frontend/src/lib/QueryProvider.tsx)).

#### Centralized Query Key Taxonomy
All query cache operations are governed by a strictly typed key factory ([`frontend/src/lib/queryKeys.ts`](file:///c:/Users/tarun/Desktop/Github%20Repo/PaperGrade%20AI/frontend/src/lib/queryKeys.ts)), preventing string typo collisions and enabling surgical cache invalidation:
```typescript
export const queryKeys = {
  auth: {
    me: () => ['auth', 'me'] as const,
  },
  exams: {
    all: () => ['exams'] as const,
    list: (branchId?: string) => ['exams', 'list', { branchId }] as const,
    detail: (id: string) => ['exams', 'detail', id] as const,
    rubric: (examId: string) => ['exams', 'rubric', examId] as const,
    evaluationStatus: (examId: string) => ['exams', 'eval-status', examId] as const,
    windowStatus: (examId: string) => ['exams', 'window-status', examId] as const,
  },
  submissions: {
    byExam: (examId: string) => ['submissions', 'by-exam', examId] as const,
    detail: (id: string) => ['submissions', 'detail', id] as const,
  },
  student: {
    portalState: () => ['student', 'portal-state'] as const,
    pastExams: (filters?: Record<string, any>) => ['student', 'past-exams', filters] as const,
  },
  analytics: {
    telemetry: (range: string) => ['analytics', 'telemetry', range] as const,
    feasibility: (params: any) => ['analytics', 'feasibility', params] as const,
  },
};
```

#### Core Benefits & Architectural Guarantees
- **Stale-While-Revalidate**: Screens render instantly from memory cache while fresh data is revalidated silently in the background, cutting perceived screen transition latency to 0ms.
- **Request Deduplication**: If multiple sibling components mount simultaneously and request the active user profile or branch state, TanStack Query coalesces them into a single in-flight network request.
- **Configurable Stale Times**: Static configurations and past exam catalogs utilize a 60-second `staleTime`, while active submission window countdowns use short or reactive poll intervals.
- **Surgical Mutation Invalidation**: When an instructor updates marks in `GradingModal.tsx`, only the specific `queryKeys.submissions.detail(id)` and `queryKeys.exams.detail(examId)` query keys are invalidated and refetched.

---

### 12.7 Apple-Style Curved-Glass Micro-Tactility Design System
The platform features an Apple-inspired dark-mode design system founded on physical micro-tactility, pure specular edge refraction, and strict geometric consistency.

#### Rectangular Geometry Standard (No Pill Shapes)
To maintain structural visual discipline, all action triggers, filters, and buttons strictly avoid pill (`rounded-full`) geometries, adhering uniformly to standard rectangular `rounded-md` bounding boxes with defined height tiers:
- **`h-8` (32px)**: Compact action triggers, card utility buttons, table action links.
- **`h-9` (36px)**: Standard interactive buttons, dropdown triggers, and modal actions.
- **`h-11` (44px)**: Primary submission triggers and prominent portal action buttons.

#### Curved-Glass Specular Physics
The CSS utility system (`globals.css`) defines high-polish glassmorphism classes simulating curved optical surfaces:
- **`.btn-glass-primary`**: Electric blue specular finish featuring a subtle top-edge internal specular highlight (`box-shadow: inset 0 1px 0 rgba(255,255,255,0.25)`), dynamic linear gradient fill (`from-blue-500/20 to-blue-600/30`), and interactive micro-press compression (`active:scale-[0.98]`).
- **`.btn-glass-utility`**: Neutral frosted glass dark surface (`bg-white/[0.04]`), ultra-subtle perimeter border (`border-white/[0.08]`), and gentle hover luminescence.
- **`.btn-glass-danger-utility`**: Dark crimson translucent glass for secondary destructive actions.
- **`.btn-glass-danger`**: High-visibility ruby glass for irreversible actions (e.g., cascade exam purge).

#### High-Polish Interactive Primitives
1. **Accelerated Micro-Stepper ([`AppleNumberStepper.tsx`](file:///c:/Users/tarun/Desktop/Github%20Repo/PaperGrade%20AI/frontend/src/components/ui/AppleNumberStepper.tsx))**:
   - **Micro-Press Scaling**: Stepper decrement and increment triggers feature physical scale feedback (`active:scale-90`).
   - **Press-and-Hold Progressive Acceleration**: Holding down a stepper button initiates an auto-repeat cycle after 350ms, dynamically reducing the step interval down to 50ms for rapid value adjustments.
   - **Sliding Number Animation**: Digits transition using GPU-accelerated directional translateY slide keyframes (`@keyframes appleNumberUp` / `appleNumberDown`).
   - **Direct Numerical Input**: Clicking the displayed number instantly converts the component into an inline HTML input with auto-select and discrete step clamping ($0.5$ step increments).
2. **Viewport-Aware Portal Dropdown ([`AppleSelect.tsx`](file:///c:/Users/tarun/Desktop/Github%20Repo/PaperGrade%20AI/frontend/src/components/ui/AppleSelect.tsx))**:
   - **Body Portal Rendering**: Renders the menu directly into `document.body` via React `createPortal`, completely eliminating clipping or z-index stacking issues inside modal dialogs or table containers.
   - **Collision Detection & Auto-Flip**: Continuously calculates bounding client rects. If the trigger is within 240px of the viewport bottom, the dropdown opens upwards automatically.
   - **Apple Easing Curves**: Uses spring-calibrated cubic-bezier transitions (`cubic-bezier(0.16, 1, 0.3, 1)`) for natural menu expansion.

---

### 12.8 Student PWA Mobile Portal Architecture & Past Exams Subsystem
The student mobile portal ([`frontend/src/app/student/portal/page.tsx`](file:///c:/Users/tarun/Desktop/Github%20Repo/PaperGrade%20AI/frontend/src/app/student/portal/page.tsx)) is built as an installable Progressive Web App (PWA) tailored for high-latency mobile conditions.

#### Decoupled Static Search & Filter Architecture
In earlier revisions, selecting a filter tab (e.g. switching from *All* to *Evaluated*) unmounted the entire container, causing the search bar, filter tabs, and exam lists to flash skeleton screens simultaneously.
- **Permanent Component Mounting**: The search input, clear button, and filter tab controls remain permanently mounted and interactive.
- **Isolated Cards-Only Skeleton (`PastExamsCardsSkeleton`)**: During network refetches or filter shifts, only the exam cards container transitions into a card skeleton with zero layout shift; search input focus is never interrupted.
- **Zero Pill Skeletons**: Eliminates awkward pill badge placeholders in favor of crisp rectangular card skeletons matching exact production card geometries.

#### Touch Gesture Navigation & Fluid Transitions
- **Horizontal Touch Swipe Navigation**: The student dashboard tracks touch start and end coordinates (`handlePortalTouchStart`, `handlePortalTouchEnd`). Swiping left or right with sufficient velocity toggles seamlessly between the **Dashboard** and **Past Exams** views without requiring thumb reach to the top navigation bar.
- **Dynamic Time-Aware Greetings**: Welcomes students with contextual greetings matched to their local time of day (`Good Morning`, `Good Afternoon`, `Good Evening`, `Good Night`, `Late Night Study Session`), combined with user name interpolation and an entrance fade animation.
- **Clean Mobile Document Canvas**: On mobile viewports ($<768\text{px}$), redundant manual zoom buttons are hidden to maximize document viewable area, giving students native two-finger pinch-to-zoom and pan gestures.
- **Missing Question Paper Fallback**: When an instructor has not uploaded a question paper PDF, the portal displays an informative "Question paper not uploaded" notice rather than failing or injecting placeholder test papers.

---

## 13. Observability, Telemetry & Quota Feasibility

### 13.1 Real-Time Token Telemetry & Cost Tracking
Every multimodal inference call logs fine-grained token usage into `api_usage_events`:
- **Input Tokens**: Prompt instructions + Question Paper PDF tokens + Student Answer PDF tokens.
- **Output Tokens**: Generated JSON characters and reasoning structure.
- **Thinking Tokens**: Deep reasoning tokens generated by Gemini models.
- **Cached Tokens**: Context cache hits when reusing identical Question Paper rubrics across multiple student papers.
- **Paid-Equivalent Cost Calculation**: Uses published Google AI Studio pricing ([`backend/app/gemini/pricing.py`](file:///c:/Users/tarun/Desktop/Github%20Repo/PaperGrade%20AI/backend/app/gemini/pricing.py)):
  $$\text{Cost} = \left(\frac{\text{Input} - \text{Cached}}{10^6} \times \$0.075\right) + \left(\frac{\text{Cached}}{10^6} \times \$0.01875\right) + \left(\frac{\text{Output} + \text{Thinking}}{10^6} \times \$0.300\right)$$

### 13.2 Latency Percentiles ($P_{50}, P_{95}$)
The analytics dashboard calculates running latency percentiles across evaluation requests:
- $P_{50}$ (Median Latency): Typically 12.5 seconds for a 5-page student answer script.
- $P_{95}$ (Tail Latency): ~28.0 seconds for a complex 10-page exam paper evaluated with 65,536 token capacity.

### 13.3 Quota Feasibility Modeling (40 & 50 Paper Batches)
The `/api/v1/analytics/feasibility` endpoint projects whether an upcoming exam batch will exceed Google AI Studio rate limits:
- Evaluates estimated token consumption ($40 \text{ papers} \times \sim 18,000 \text{ tokens/paper} \approx 720,000 \text{ tokens}$).
- Compares against TPM (Tokens Per Minute) and RPM ceilings.
- Recommends optimal worker concurrency and pacing delays to complete the batch without triggering 429 quota exhaustion.

---

## 14. DevOps, Deployment & Operations Runbook

### 14.1 Environment Configuration Matrix (`.env`)

```ini
# ==============================================================================
# SERVER CONFIGURATION
# ==============================================================================
APP_NAME=PaperGrade AI
APP_VERSION=2.0.0-PROD
DEBUG=False
HOST=0.0.0.0
PORT=8000

# ==============================================================================
# DATABASE (SUPABASE POSTGRESQL TRANSACTION POOLER :6543)
# ==============================================================================
DATABASE_URL=postgresql://postgres.xxx:xxx@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require

# ==============================================================================
# GOOGLE GEMINI MULTI-KEY FAILOVER RING & VERTEX AI
# ==============================================================================
GEMINI_API_KEY=AIzaSyA_PrimaryKey...
GEMINI_API_KEY_2=AIzaSyB_SecondaryKey...
GEMINI_API_KEY_3=AIzaSyC_TertiaryKey...
GEMINI_API_KEY_4=AIzaSyD_QuaternaryKey...
MAX_ACTIVE_GEMINI_KEYS=4
GEMINI_MODEL=gemini-3.8-flash
GEMINI_FALLBACK_MODEL_1=gemini-3.6-flash
GEMINI_FALLBACK_MODEL_2=gemini-3.5-flash
GEMINI_REEVAL_MODEL=gemini-3.5-flash-lite
GEMINI_THINKING_BUDGET=4096

# Optional: Google Cloud Paid Vertex AI Service Account
GCP_PROJECT_ID=your_gcp_project_id
GCP_LOCATION=us-central1
GCP_SERVICE_ACCOUNT_PATH=backend/credentials/gcp_service_account.json

# ==============================================================================
# WORKER POOL & STORAGE LIFECYCLE
# ==============================================================================
MAX_EVALUATION_WORKERS=2
SUBMISSION_RETENTION_DAYS=15
WINDOW_DURATION_MINUTES=30
GRACE_PERIOD_MINUTES=2

# ==============================================================================
# OBJECT STORAGE BACKENDS (CLOUDINARY / CLOUDFLARE R2 / LOCAL)
# ==============================================================================
STORAGE_BACKEND=cloudinary

# Cloudinary CDN Credentials
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# Cloudflare R2 / S3 Credentials (Alternative to Cloudinary)
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=papergrade-bucket
R2_PUBLIC_URL=https://pub-xxx.r2.dev

# ==============================================================================
# W3C BROWSER WEB PUSH (VAPID KEYS)
# ==============================================================================
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_CLAIMS_EMAIL=mailto:notifications@papergrade.ai

# ==============================================================================
# SECURITY & JWT
# ==============================================================================
JWT_SECRET=super_secret_enterprise_signing_key_replace_in_production
ACCESS_TOKEN_EXPIRE_MINUTES=10080
```

---

### 14.2 Production Deployment Setup

#### Backend (Render / Docker)
- **Runtime**: Python 3.11+
- **Build Command**: `pip install -r backend/requirements.txt`
- **Start Command**: `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT --workers 1`
- *Note*: Run with 1 Uvicorn worker process so that internal worker threads share memory and pacing locks without database lock contention.

#### Frontend (Vercel)
- **Framework Preset**: Next.js 14
- **Root Directory**: `frontend`
- **Build Command**: `npm run build`
- **Environment Variables**:
  - `NEXT_PUBLIC_API_URL=https://your-backend-service.onrender.com`
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_vapid_public_key`

---

### 14.3 Emergency Troubleshooting Playbooks

#### Playbook 1: Worker Queue Deadlock / Frozen Submissions
- **Symptom**: Papers remain in `status = 'PROCESSING'` or `QUEUED` without progressing.
- **Root Cause**: An unhandled exception or 8,192-token truncation crashed a worker thread without releasing the queue claim.
- **Resolution**:
  1. Inspect submission status via scratch script or SQL:
     ```sql
     SELECT id, roll_number, status, retry_count, error_message FROM submissions WHERE status = 'PROCESSING';
     ```
  2. The automated watchdog recovers jobs older than 5 minutes. To force immediate recovery:
     ```sql
     UPDATE submissions SET status = 'QUEUED' WHERE status = 'PROCESSING';
     UPDATE evaluation_queue SET status = 'QUEUED' WHERE status = 'PROCESSING';
     ```
  3. Verify that `max_output_tokens` is configured to `65536` in `backend/app/gemini/client.py`.

#### Playbook 2: PostgreSQL NUL Byte Crash (`UntranslatableCharacter`)
- **Symptom**: Logs show `psycopg2.errors.UntranslatableCharacter: unsupported Unicode escape sequence \u0000`.
- **Root Cause**: LLM generated a C-style null byte in a mathematical formula.
- **Resolution**:
  1. Ensure all database executions pass through `PostgresCursorWrapper`.
  2. Verify that `_sanitize_params` in `backend/app/database.py` is stripping `\x00` characters across tuples, dictionaries, and lists.

#### Playbook 3: Google AI Studio 429 Quota Exhaustion
- **Symptom**: Worker logs report `ResourceExhausted: 429 Resource has been exhausted`.
- **Root Cause**: High batch concurrency exceeded the per-minute quota of the primary API key.
- **Resolution**:
  1. Add additional API keys to the `GEMINI_API_KEYS` comma-separated list in `.env`.
  2. The multi-key ring will automatically expand its round-robin cycle.
  3. The worker pool will sleep for 30 seconds automatically without dropping queued student jobs.

---

## 15. Master Data Architecture & Business Intelligence (BI) Retention Specification

### 15.1 Storage Tier Partitioning & Structural Invariants
PaperGrade AI divides platform data across three distinct storage tiers to achieve high query performance, low cost, and strict compliance:

```mermaid
flowchart TD
    subgraph Tier1["Tier 1: Relational State (PostgreSQL / SQLite WAL)"]
        direction TB
        T1_Meta["24 Normalized Tables across 5 Domains<br/>Institutes, Branches, Subjects, Users, Batches, Exams"]
        T1_Scores["Granular Score Data<br/>Criteria Breakdown, Section Sums, Audit Trail"]
        T1_Invar["Permanent Retention Invariant<br/>Preserved Indefinitely for Historical BI"]
    end

    subgraph Tier2["Tier 2: Local Processing Cache (SSD Buffer)"]
        direction TB
        T2_Uploads["backend/data/uploads/<br/>Raw Image Scans & Multipart Uploads"]
        T2_Proc["PyMuPDF Vector Burning & EXIF Normalization"]
        T2_Evict["Ephemeral Lifecycle<br/>Flushed Upon CDN Sync"]
    end

    subgraph Tier3["Tier 3: Cloud Object Storage (Cloudinary / R2 / S3)"]
        direction TB
        T3_Canonical["Canonical Upright Student PDFs"]
        T3_Extracts["150 DPI Answer Region Crops"]
        T3_Annotated["PyMuPDF Graded Vector Overlays"]
        T3_TTL["15-Day Strict TTL Expiration Window"]
    end

    Tier2 -->|"Async Ingestion"| Tier3
    Tier2 -->|"Extract Structured Grades"| Tier1
    Tier3 -.->|"15-Day TTL Cascade Purge"| PurgeEngine["Scheduled Purge Worker<br/>(Binary Documents Expunged)"]
    Tier1 -.->|"Permanent BI Analytics"| BI["Cohort Progression, NAAC/ABET Reports,<br/>Item Difficulty & Discrimination Curves"]
```

1. **Relational Tier (PostgreSQL 15+ / SQLite 3 WAL)**:
   - Houses all system state across 24 normalized tables (`institutes`, `branches`, `subjects`, `users`, `batches`, `students`, `exams`, `exam_batches`, `submission_windows`, `rubric_versions`, `submissions`, `answers`, `answer_regions`, `criterion_scores`, `evaluation_queue`, `revaluation_requests`, `notifications`, `push_subscriptions`, `password_reset_requests`, `technical_reports`, `audit_logs`, `api_usage_events`, `user_quota_settings`, `experiment_benchmarks`).
   - Handles ACID transactions, row-level concurrency claims (`FOR UPDATE SKIP LOCKED`), and structured criteria score breakdowns.
2. **Local SSD Processing Buffer (`backend/data/uploads/`)**:
   - High-throughput scratchpad for EXIF transposition, multi-image merging, 150 DPI page rendering, and PyMuPDF vector drawing.
   - Cleared automatically or synchronized with cloud storage.
3. **Cloud CDN & Object Tier (Cloudinary / Cloudflare R2 / AWS S3)**:
   - Stores binary PDF payloads: raw canonical uploads, vector-annotated review PDFs, and 150 DPI handwriting crops.
   - Governed by the automated 15-day time-to-live lifecycle.

---

### 15.2 15-Day TTL Cascade Purge Engine Mechanics
To satisfy educational data privacy regulations (FERPA, GDPR) and eliminate unbounded cloud storage costs, the platform implements an automated document purge lifecycle:

$$\text{retention\_expires\_at} = t_{\text{graded}} + 15 \times 86400\,\text{seconds}$$

```mermaid
sequenceDiagram
    autonumber
    participant Cron as Scheduled Purge Daemon
    participant API as Submissions Router (POST /api/v1/submissions/purge-expired)
    participant DB as Relational Database
    participant CDN as Cloudinary / R2 CDN
    participant Disk as Local File Storage

    Cron->>API: Trigger Expired Purge Sweep
    API->>DB: SELECT id, canonical_pdf_path, annotated_pdf_path FROM submissions WHERE retention_expires_at <= NOW() AND is_document_purged = 0
    DB-->>API: Return Expired Submissions List
    loop For Each Expired Submission
        API->>Disk: os.remove(local_pdf_path) (if cached)
        API->>CDN: uploader.destroy(public_id, resource_type='raw')
        API->>DB: DELETE FROM answer_regions WHERE answer_id IN (SELECT id FROM answers WHERE submission_id = :id)
        API->>DB: UPDATE submissions SET is_document_purged = 1, canonical_pdf_path = NULL, annotated_pdf_path = NULL WHERE id = :id
    end
    API-->>Cron: Purge Summary (Total Reclaimed Bytes, Purged Records)
```

- **Physical Media Deletion**: Both the raw student scan PDF and the vector-annotated PDF are unlinked from local disk and destroyed in the cloud CDN via Admin API credentials.
- **Database Tombstone**: The `is_document_purged` flag is set to `1`, path columns are set to `NULL`, and coordinate bounding boxes in `answer_regions` are dropped to conserve database space.
- **Student Portal UX**: If a student accesses an expired exam paper in the portal, the spatial viewer displays an informative *"Document archived under 15-day retention policy"* banner while still rendering their complete numerical score and question-by-question performance breakdown.

---

### 15.3 Historical Grade & Analytics Retention for Academic BI
A core architectural guarantee of PaperGrade AI is that **document purge does not equal data loss**:

| Data Entity | Storage Location | Retention Lifespan | Academic & BI Purpose |
| :--- | :--- | :--- | :--- |
| **Raw Scanned PDF** | Cloudinary / Local Disk | **15 Days (TTL)** | Temporary grading evidence & immediate student review. |
| **Annotated Graded PDF** | Cloudinary / Local Disk | **15 Days (TTL)** | Downloadable vector report card during verification window. |
| **Final Marks & Percentages** | Relational DB (`submissions`) | **Permanent ($\infty$)** | Official student academic records, GPA calculation, transcripts. |
| **Question-by-Question Breakdown** | Relational DB (`answers`) | **Permanent ($\infty$)** | Item difficulty analysis, curriculum defect identification. |
| **Criteria-Level Marks & Rubrics** | Relational DB (`criterion_scores`)| **Permanent ($\infty$)** | Pedagogical scoring distribution, rubric fairness auditing. |
| **Teacher Override Trail** | Relational DB (`audit_logs`) | **Permanent ($\infty$)** | Immutable accountability audit logs for institutional compliance. |
| **LLM Inference Telemetry** | Relational DB (`api_usage_events`) | **Permanent ($\infty$)** | Historical cost tracking, latency percentiles, quota planning. |

#### Continuous Business Intelligence Capabilities
Because structured performance records are preserved permanently, academic institutions can execute longitudinal analytics across decades without storing petabytes of raw PDF scans:
- **Longitudinal Cohort Tracking**: Measure learning outcome progression across multi-year academic cohorts.
- **Curriculum & Item Difficulty Indexing**: Compute classical test theory metrics ($P$-value facility indices and item discrimination coefficients) to isolate flawed examination questions.
- **Accreditation Evidence**: Instantly export structured compliance matrices required by international accreditation boards (e.g., ABET, NAAC, NBA).

---

### 15.4 Multi-Tenant Data Isolation & Compliance Guarantees
1. **Hierarchical Row Scoping**:
   - Every administrative query strictly filters across `institute_id` and `branch_id`.
   - Foreign key constraints with `ON DELETE CASCADE` guarantee that deleting an institutional branch automatically scrubs all associated exams, rubrics, and student records without leaving orphan rows.
2. **Student Privacy (Zero PII Ingestion to AI)**:
   - Student identities (names, emails, demographic data) are never transmitted to Google Gemini inference endpoints.
   - Evaluation prompts receive only the isolated question paper text and anonymized student handwriting pixel buffers labeled by synthetic roll-number identifiers.
3. **FERPA & GDPR Compliance**:
   - Right to erasure and data minimization are structurally enforced via the 15-day TTL purge engine.
   - Comprehensive teacher audit logging ensures full transparency and defensibility for every grade awarded or modified.

---

**© 2026 PaperGrade AI Systems Inc. All rights reserved. Assessment Integrity Platform.**
