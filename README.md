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
   - 4.2 Timed Submission Windows & Real-Time PWA Countdown
   - 4.3 Student Ingestion, EXIF Auto-Orientation & Canonical PDF Assembly
   - 4.4 Autonomous Queue Worker Execution & Fallback Ring
   - 4.5 Teacher Audit, Manual Overrides & Spatial Bounding Box Adjustment
   - 4.6 Student Revaluation & Dispute Lifecycle
   - 4.7 15-Day Storage Retention (TTL) & Cloud Purge Lifecycle
5. [Database Architecture & The Dual-Dialect Engine](#5-database-architecture--the-dual-dialect-engine)
   - 5.1 Rationale: Dual-Dialect (PostgreSQL + SQLite WAL)
   - 5.2 The `PostgresCursorWrapper` & Parameter Sanitization Engine
   - 5.3 The PostgreSQL NUL Byte (`0x00`) Sanitizer (`UntranslatableCharacter` Fix)
   - 5.4 Complete Data Dictionary & Schema Specification (20 Core Tables)
   - 5.5 Master Entity-Relationship (ER) Diagram
6. [The AI Engine & Google Gemini Multimodal Pipeline](#6-the-ai-engine--google-gemini-multimodal-pipeline)
   - 6.1 Multimodal Vision vs OCR Chaining Tradeoff
   - 6.2 The Multi-Key Failover Ring (4-Key Round Robin)
   - 6.3 4-Tier Model Fallback Cascade
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
   - 9.1 Storage Abstraction (`UnifiedStorageService`: Local, Cloudinary, R2/S3)
   - 9.2 Mobile Photo EXIF Normalization & Multi-Image PDF Assembly
   - 9.3 15-Day Retention Policy (TTL) & Privacy Compliance (FERPA/GDPR)
   - 9.4 Cascade Exam Deletion & CDN Purge Engine
10. [Web Push Notification & Real-Time Alert Engine](#10-web-push-notification--real-time-alert-engine)
    - 10.1 W3C Standard Web Push via VAPID Cryptographic Keys
    - 10.2 Closed-App PWA Background Delivery
    - 10.3 In-App Notification Center
11. [Exhaustive Backend API Router Catalog](#11-exhaustive-backend-api-router-catalog)
    - Complete Reference of All 13 Routers & 32+ Endpoints
12. [Frontend Architecture & Next.js 14 App Router](#12-frontend-architecture--nextjs-14-app-router)
    - 12.1 Directory Structure & Layout Hierarchy
    - 12.2 Client-Side Context Mesh
    - 12.3 Role-Based Dynamic Routing & Zero-Flicker SSR Auth Check
    - 12.4 Spatial Document Viewer Canvas (`DocumentViewer.tsx`)
    - 12.5 One-Click Verification & Override Studio (`GradingModal.tsx`)
13. [Observability, Telemetry & Quota Feasibility](#13-observability-telemetry--quota-feasibility)
    - 13.1 Real-Time Token Telemetry & Paid-Equivalent Cost Tracking
    - 13.2 Latency Percentiles ($P_{50}, P_{95}$)
    - 13.3 Quota Feasibility Modeling (40 & 50 Paper Batches)
14. [DevOps, Deployment & Operations Runbook](#14-devops-deployment--operations-runbook)
    - 14.1 Environment Configuration Matrix (`.env`)
    - 14.2 Production Deployment Setup (Render + Vercel + Supabase)
    - 14.3 Emergency Troubleshooting Playbooks

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
4. **Resilience Over Perfection**: Evaluation must never crash due to network drops, transient 429 quota exhaustion, or malformed JSON. The system features a 4-key round-robin ring, a 4-tier model fallback cascade, self-healing stream repair, and a persistent watchdog background worker pool.

---

## 2. Global System Architecture & Distributed Block Diagram

```mermaid
flowchart TB
    subgraph ClientTier["Client Tier (Next.js 14 App Router / React 18 / Tailwind CSS)"]
        direction TB
        AdminApp["Root Admin Dashboard\n(/admin, /branches)"]
        ManagerApp["Branch Workspace\n(/exams, /batches)"]
        StudentApp["Student PWA Portal\n(/student/portal, /revaluation)"]
        CanvasApp["Spatial Document Canvas\n(/exams/{id}/submissions/{subId})"]
    end

    subgraph EdgeCDN["Storage & Edge Delivery Tier"]
        Cloudinary["Cloudinary CDN / S3 Object Storage\n(Signed Canonical PDFs, 150 DPI Crops, Annotated Vectors)"]
        VAPID["W3C Web Push Gateway\n(Google FCM / Apple APNs / Mozilla)"]
    end

    subgraph APITier["FastAPI Backend Application Cluster (:8000)"]
        direction TB
        MW_CORS["CORS & Request Profiling Middleware"]
        MW_Auth["JWT & Role Authorization Guard"]
        
        subgraph Routers["FastAPI Routers (13 Dedicated Domains)"]
            R_Auth["auth.py (JWT, Student PIN)"]
            R_Tenancy["tenancy.py (Institutes & Branches)"]
            R_Exams["exams.py (Exams & Rubric Approval)"]
            R_Subs["submissions.py (Batch & Single Uploads)"]
            R_Grading["grading.py (Teacher Overrides)"]
            R_Reval["revaluation.py (7-Day Student Disputes)"]
            R_Windows["windows.py (Timed Windows & Grace)"]
            R_Reports["reports.py (Issue Tickets & Screenshots)"]
            R_Exports["exports.py (CSV & PDF Streamers)"]
            R_Notifs["notifications.py (Push & In-App)"]
            R_Students["students.py (Unified Portal State)"]
            R_Analytics["analytics.py (Telemetry & Feasibility)"]
            R_Storage["storage.py (File Delivery & TTL Purge)"]
        end
    end

    subgraph ServiceTier["Core Business Logic & Service Domain"]
        direction TB
        S_Grading["GradingService\n(Invariants, Best-of-N, PyMuPDF Overlays)"]
        S_Exam["ExamService\n(Lifecycle State Machine & Cascade Delete)"]
        S_PDF["PDFService\n(EXIF Auto-Orientation, DPI Image Renders)"]
        S_Storage["UnifiedStorageService\n(Local Disk Cache + Cloudinary Client)"]
        S_Retention["RetentionService\n(15-Day TTL Automated Purge Engine)"]
        S_Notif["NotificationService\n(VAPID Encrypted Push Dispatcher)"]
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
        GeminiClient["GeminiGradingClient\n(4-Key Round-Robin Ring)"]
        PrimaryModel["gemini-3.8-flash (Primary, 64k Output Tokens)"]
        Fallback1["gemini-3.5-flash-lite (Tier 1 Fallback)"]
        Fallback2["gemini-flash-lite-latest (Tier 2 Fallback)"]
        Fallback3["gemini-1.5-flash (Emergency Fallback)"]
        StreamHealer["_repair_truncated_json\n(Bracket/Quote Recovery Engine)"]
    end

    subgraph DataTier["Database Tier (Dual-Dialect Engine)"]
        PG_Pool["Supabase Transaction Pooler (:6543)\nThreadedConnectionPool (max 25 conn)"]
        SQLite_WAL["SQLite 3 (WAL Mode + Foreign Keys)\n(Local Development & Offline Testing)"]
        CursorWrapper["PostgresCursorWrapper\n(? to %s Rewriter + NUL 0x00 Byte Filter)"]
        Tables[("20 Core Tables:\ninstitutes, branches, users, exams, batches,\nstudents, submission_windows, rubric_versions,\nsubmissions, answers, answer_regions, criterion_scores,\nevaluation_queue, revaluation_requests, notifications,\npush_subscriptions, password_reset_requests,\ntechnical_reports, audit_logs, api_usage_events")]
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
    Fallback2 -.-> Fallback3
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
| **Upload Official Answer Keys** |  | ❌ | ❌ | Restricted endpoint (`/api/v1/exams/{id}/upload-key`) |
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
| **Trigger 15-Day Storage Purge** |  | ❌ | ❌ | Automated background service / admin API |
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
    participant Storage as Unified Storage (Disk/CDN)
    participant AI as Gemini Multimodal Client
    participant DB as Dual-Dialect Database

    Admin->>UI: Uploads Question Paper PDF & Official Answer Key PDF
    UI->>API: POST /api/v1/exams (multipart/form-data)
    API->>Storage: Store Question Paper (calculate SHA256)
    API->>DB: INSERT INTO exams (status='DRAFT', lifecycle_status='DRAFT')
    API-->>UI: Exam Created (ID generated)

    Admin->>UI: Triggers "Extract Rubric"
    UI->>API: POST /api/v1/exams/{id}/upload-key
    API->>Storage: Store Official Answer Key
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

### 4.2 Flow 2: Timed Submission Windows & Real-Time PWA Countdown
To simulate real-world testing environments, PaperGrade AI provides synchronized, timed submission windows with a strict deadline and automated grace period.

```mermaid
flowchart TD
    Manager(["Branch Manager"]) --> OpenWin["POST /api/v1/windows/open<br/>Duration: 30 mins, Grace: 2 mins"]
    OpenWin --> DB_Win["INSERT INTO submission_windows<br/>status='OPEN', deadline_at, grace_deadline_at"]
    DB_Win --> NotifDispatch["NotificationService.notify_branch_students"]
    NotifDispatch --> WebPush["VAPID Encrypted Web Push to Phones"]
    
    subgraph StudentApp["Student PWA Client"]
        PortalState["GET /api/v1/student/portal-state<br/>(Cached 4s in-memory)"] --> TimerCalc{"Check Window Timestamps"}
        TimerCalc -->|"Within Deadline (Active)"| ActiveState["Display Green Countdown Timer<br/>Submissions Allowed"]
        TimerCalc -->|"Grace Period (2 mins)"| GraceState["Display Amber Grace Period Timer<br/>Submissions Allowed with Warning"]
        TimerCalc -->|"Window Expired"| ExpiredState["Display Closed State<br/>Upload Blocked with 403 Forbidden"]
    end

    ActiveState --> UploadReq["Student Submits Answer PDF"]
    GraceState --> UploadReq
```

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
    Graded(["Submission Graded"]) --> StampTTL["Stamp retention_expires_at = now + 15 days<br/>is_document_purged = 0"]
    StampTTL --> ActiveWindow["15-Day Retrieval Window<br/>Full PDF Downloads Allowed"]
    
    ActiveWindow --> PurgeSweep["Nightly Cron / API: POST /api/v1/storage/purge-expired"]
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

### 5.4 Complete Data Dictionary & Schema Specification (20 Core Tables)

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

#### 3. `users`
System user accounts for Root Admins, Branch Managers, Teachers, and Students.
- `id` (TEXT, PK): User identifier (`usr_01j7...`).
- `institute_id` (TEXT, FK $\to$ `institutes.id` ON DELETE SET NULL).
- `branch_id` (TEXT, FK $\to$ `branches.id` ON DELETE SET NULL).
- `email` (TEXT, UNIQUE): Login email address.
- `role` (TEXT, NOT NULL): Role enum (`ROOT_ADMIN`, `BRANCH_MANAGER`, `TEACHER`, `STUDENT`).
- `password_hash` (TEXT, NOT NULL): Bcrypt hashed credentials.
- `full_name` (TEXT, NOT NULL): Display name.
- `is_active` (INTEGER, DEFAULT 1): Account status flag.
- `last_login_at` (TEXT): Last successful login timestamp.
- `created_at` (TEXT, NOT NULL): ISO 8601 UTC timestamp.

#### 4. `batches`
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

#### 5. `students`
Student demographic profiles and account claim state.
- `id` (TEXT, PK): Unique student record ID (`stu_01j7...`).
- `batch_id` (TEXT, FK $\to$ `batches.id` ON DELETE CASCADE).
- `user_id` (TEXT, FK $\to$ `users.id` ON DELETE SET NULL): Linked auth user account.
- `student_id_num` (TEXT, NOT NULL, UNIQUE): Official institutional roll/ID number.
- `roll_number` (TEXT, NOT NULL): Exam desk roll identifier.
- `full_name` (TEXT, NOT NULL): Full legal student name.
- `email` (TEXT): Contact email.
- `account_claimed` (INTEGER, DEFAULT 0): Whether student has activated login.

#### 6. `exams`
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

#### 7. `submission_windows`
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

#### 8. `rubric_versions`
Historical revisions of grading rubrics with approval locking.
- `id` (TEXT, PK): Rubric version ID (`rub_01j7...`).
- `exam_id` (TEXT, FK $\to$ `exams.id` ON DELETE CASCADE).
- `version_num` (INTEGER, NOT NULL): Sequential version index.
- `is_approved` (INTEGER, DEFAULT 0): Immutable lock flag (1 = Approved).
- `approved_by` (TEXT): User ID of Root Admin who signed off.
- `approved_at` (TEXT): Approval timestamp.
- `rubric_data` (TEXT, NOT NULL): JSON serialized `ExamRubricExtractionResult`.

#### 9. `submissions`
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
- `retention_expires_at` (TEXT): Purge timestamp ($t_{\text{graded}} + 15\text{d}$).
- `is_document_purged` (INTEGER, DEFAULT 0): Purge status flag.

#### 10. `answers`
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

#### 11. `answer_regions`
Normalized spatial bounding boxes for visual localization.
- `id` (TEXT, PK): Region identifier (`reg_01j7...`).
- `answer_id` (TEXT, FK $\to$ `answers.id` ON DELETE CASCADE).
- `page_number` (INTEGER, NOT NULL): 1-indexed page index.
- `x` (REAL, NOT NULL): Left coordinate $\in [0.0, 1.0]$.
- `y` (REAL, NOT NULL): Top coordinate $\in [0.0, 1.0]$.
- `width` (REAL, NOT NULL): Box width $\in [0.0, 1.0]$.
- `height` (REAL, NOT NULL): Box height $\in [0.0, 1.0]$.
- `is_manual_override` (INTEGER, DEFAULT 0): Flag if box was dragged by teacher.

#### 12. `criterion_scores`
Atomic sub-criteria breakdowns for each evaluated question.
- `id` (TEXT, PK): Criterion score ID (`crit_01j7...`).
- `answer_id` (TEXT, FK $\to$ `answers.id` ON DELETE CASCADE).
- `criterion_id` (TEXT, NOT NULL): Rubric criterion key.
- `description` (TEXT, NOT NULL): Criterion description.
- `max_marks` (REAL, NOT NULL): Criterion point value.
- `awarded_marks` (REAL, NOT NULL): Awarded points $\in [0, \text{max}]$.
- `evidence` (TEXT, NOT NULL): Verbatim textual quote from student work.
- `is_manual_override` (INTEGER, DEFAULT 0).

#### 13. `evaluation_queue`
FIFO queue supporting atomic row-level claiming for background workers.
- `id` (TEXT, PK): Queue item ID (`q_01j7...`).
- `submission_id` (TEXT, FK $\to$ `submissions.id` ON DELETE CASCADE).
- `exam_id` (TEXT, FK $\to$ `exams.id` ON DELETE CASCADE).
- `priority` (INTEGER, DEFAULT 100): Lower number = higher priority.
- `status` (TEXT, DEFAULT 'QUEUED'): `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`.
- `attempt_count` (INTEGER, DEFAULT 0).
- `claimed_by_worker` (TEXT): Worker thread identifier.
- `claimed_at` (TEXT): Claim lease timestamp.

#### 14. `revaluation_requests`
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

#### 15. `notifications`
In-app user notifications.
- `id` (TEXT, PK): Notification ID (`notif_01j7...`).
- `user_id` (TEXT, FK $\to$ `users.id` ON DELETE CASCADE).
- `type` (TEXT, NOT NULL): Notification category.
- `title` (TEXT, NOT NULL): Notification heading.
- `message` (TEXT, NOT NULL): Notification body.
- `link_url` (TEXT): Navigation route.
- `is_read` (INTEGER, DEFAULT 0): Read receipt flag.

#### 16. `push_subscriptions`
VAPID Web Push client device subscriptions.
- `id` (TEXT, PK): Subscription ID (`psub_01j7...`).
- `user_id` (TEXT, FK $\to$ `users.id` ON DELETE CASCADE).
- `endpoint` (TEXT, NOT NULL, UNIQUE): Browser push gateway URL.
- `p256dh` (TEXT, NOT NULL): Client public cryptographic key.
- `auth` (TEXT, NOT NULL): Shared auth secret.
- `user_agent` (TEXT): Device metadata.

#### 17. `password_reset_requests`
Two-tier password reset approval workflow for students.
- `id` (TEXT, PK): Request ID (`pwd_01j7...`).
- `user_id` (TEXT, FK $\to$ `users.id` ON DELETE CASCADE).
- `student_id` (TEXT, FK $\to$ `students.id`).
- `branch_id` (TEXT, FK $\to`branches.id`).
- `status` (TEXT, DEFAULT 'PENDING'): `PENDING`, `APPROVED`, `COMPLETED`, `EXPIRED`.
- `reset_token` (TEXT): Cryptographic reset token.
- `approved_by` (TEXT): Branch manager who authorized reset.

#### 18. `technical_reports`
In-app bug and technical issue ticket management.
- `id` (TEXT, PK): Report ID (`rep_01j7...`).
- `user_id` (TEXT, FK $\to$ `users.id` ON DELETE CASCADE).
- `category` (TEXT, NOT NULL): `BUG`, `UI_ISSUE`, `ACCURACY`, `OTHER`.
- `subject` (TEXT, NOT NULL): Ticket title.
- `description` (TEXT, NOT NULL): Issue details (max 1,000 chars).
- `screenshots_json` (TEXT, DEFAULT '[]'): Array of Cloudinary/storage URLs.
- `status` (TEXT, DEFAULT 'OPEN'): `OPEN`, `IN_PROGRESS`, `RESOLVED`.
- `admin_notes` (TEXT): Root Admin resolution notes.

#### 19. `audit_logs`
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

#### 20. `api_usage_events`
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

---

### 5.5 Master Entity-Relationship (ER) Diagram

```mermaid
erDiagram
    institutes ||--o{ branches : "operates"
    branches ||--o{ users : "employs"
    branches ||--o{ batches : "manages"
    batches ||--o{ students : "enrolls"
    users ||--o| students : "claims identity"
    branches ||--o{ exams : "schedules"
    exams ||--o{ rubric_versions : "revises"
    exams ||--o{ submission_windows : "defines"
    exams ||--o{ submissions : "receives"
    exams ||--o{ evaluation_queue : "enqueues"
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

### 6.3 4-Tier Model Fallback Cascade
If all configured keys exhaust their quota on the primary model, the client cascades gracefully down a 4-tier model hierarchy:
$$\text{gemini-3.8-flash (Primary)} \longrightarrow \text{gemini-3.5-flash-lite} \longrightarrow \text{gemini-flash-lite-latest} \longrightarrow \text{gemini-1.5-flash}$$
This guarantees that student grading queues never halt completely during unexpected campus upload surges.

---

### 6.4 The 8,192 vs 65,536 Output Token Ceiling Forensic Analysis
During large-scale production testing on complex board examinations (e.g., 16 questions, ~50 criteria evaluated across 7–10 handwritten pages), evaluations repeatedly experienced a critical failure mode:
1. **The 8,192 Token Barrier**: Standard LLM generation configs default `max_output_tokens=8192`.
2. **Token Inflation Under Vision Reasoning**: When Gemini processes multiple high-resolution PDF pages with `thinking_budget=1024`, transcribes full student handwriting, quotes evidence for 50 criteria, and generates 4 floating-point coordinates for each bounding box, the required JSON response payload reaches **9,000 to 14,000 output tokens**.
3. **The Silent Truncation Trap**: At token 8,192, Google's API terminates the output stream cleanly with `finish_reason='MAX_TOKENS'`. The stream ends abruptly mid-JSON (typically around question 12 or 13), causing Pydantic schema validation to fail with `ValidationError: EOF while parsing a value at line 742 column 15`.
4. **The Resolution**: In [`backend/app/gemini/client.py`](file:///c:/Users/tarun/Desktop/Github%20Repo/PaperGrade%20AI/backend/app/gemini/client.py#L509), the token ceiling was explicitly raised to:
   ```python
   config = types.GenerateContentConfig(
       max_output_tokens=65536,
       temperature=0.1,
       response_mime_type="application/json",
       response_schema=StudentGradingExtractionResult,
   )
   ```
   Expanding to 65,536 tokens provides ample runway for even the most extensive 20-page examination answer scripts.

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

### 9.1 Storage Abstraction (`UnifiedStorageService`)
The service supports multiple backends configured via `STORAGE_BACKEND`:
- **Local Cache First**: Files uploaded or generated are cached under `backend/data/`.
- **Cloudinary CDN**: In cloud deployments (Render/Vercel), assets are automatically synced to Cloudinary under structured folders (`papergrade/submissions/{exam_id}/{roll_number}/`).
- **Cloudflare R2 / S3**: High-throughput object storage using standard S3 API credentials.

### 9.2 Mobile Photo EXIF Normalization
When mobile cameras capture answer sheets, EXIF orientation metadata often causes raw image bytes to display rotated $90^\circ$ or $180^\circ$.
- [`PDFService._image_to_upright_pdf_bytes`](file:///c:/Users/tarun/Desktop/Github%20Repo/PaperGrade%20AI/backend/app/services/pdf_service.py#L25) applies `PIL.ImageOps.exif_transpose` to physically rotate pixel arrays upright before conversion to PDF.
- Multiple images uploaded by a student are seamlessly merged into a single upright canonical PDF.

### 9.3 15-Day Retention Policy (TTL) Architecture
To comply with student privacy policies (FERPA/GDPR) and keep cloud storage costs near zero:
- Submissions are stamped with `retention_expires_at = now() + 15 days`.
- The scheduled retention purge engine (`POST /api/v1/storage/purge-expired`) scans for expired submissions where `is_document_purged = 0`.
- The engine unlinks the raw scanned PDF and annotated PDF from disk and deletes them from Cloudinary CDN via the Admin API.
- `is_document_purged` is set to `1`.
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

---

## 11. Exhaustive Backend API Router Catalog

The backend exposes 32+ endpoints across 13 dedicated routers:

| Router | Method | Endpoint Path | Access Level | Description & Architectural Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **Auth** | `POST` | `/api/v1/auth/login` | Public | Authenticates root admins, branch managers, and teachers; returns signed JWT. |
| | `POST` | `/api/v1/auth/student-login` | Public | Student roll-number and PIN authentication for direct portal access. |
| | `GET` | `/api/v1/auth/me` | Authenticated | Fetches current user profile, branch affiliation, and role permissions. |
| | `POST` | `/api/v1/auth/request-password-reset` | Student | Submits student password reset request for branch manager approval. |
| | `GET` | `/api/v1/auth/password-reset-requests` | Branch Manager | Lists pending student password reset requests within the manager's branch. |
| | `POST` | `/api/v1/auth/approve-password-reset` | Branch Manager | Approves reset request and generates one-time cryptographic reset token. |
| **Tenancy** | `GET` | `/api/v1/tenancy/institutes` | Root Admin | Lists all enrolled educational institutions. |
| | `GET` | `/api/v1/tenancy/branches` | Root Admin | Lists all campuses across all institutions. |
| | `POST` | `/api/v1/tenancy/branches` | Root Admin | Provisions a new campus with unique code and geographical location. |
| **Exams** | `GET` | `/api/v1/exams` | Manager/Admin | Lists exams scoped to user branch; batch-loads window status in 1 query. |
| | `POST` | `/api/v1/exams` | Manager/Admin | Creates exam record; uploads question paper. |
| | `GET` | `/api/v1/exams/{id}` | Manager/Admin | Fetches exam details, rubric versions, section rules, and evaluation stats. |
| | `DELETE`| `/api/v1/exams/{id}` | Root Admin | **Cascade Deletion**: Permanently purges exam, rubrics, submissions, and CDN assets. |
| | `POST` | `/api/v1/exams/{id}/upload-key` | Root Admin | Uploads official answer key; executes agentic Gemini rubric extraction. |
| | `POST` | `/api/v1/exams/{id}/rubric/approve` | Root Admin | Locks approved rubric version as immutable evaluation contract. |
| | `POST` | `/api/v1/exams/{id}/rubric/unlock` | Root Admin | Unlocks rubric back to draft state for modifications. |
| | `POST` | `/api/v1/exams/{id}/evaluate` | Manager/Admin | Enqueues all active submissions into the background evaluation queue. |
| | `POST` | `/api/v1/exams/{id}/publish` | Manager/Admin | Publishes finalized results to student portal. |
| | `GET` | `/api/v1/exams/{id}/evaluation-status` | Manager/Admin | High-speed (<5ms) polling endpoint for real-time evaluation progress bar. |
| **Submissions** | `GET` | `/api/v1/submissions` | Authenticated | Lists submissions with role-based filtering (students see only own records). |
| | `POST` | `/api/v1/submissions/upload` | Manager/Admin | Multipart upload of student answer sheets; normalizes EXIF and merges PDFs. |
| | `GET` | `/api/v1/submissions/{id}` | Authenticated | Returns detailed evaluation breakdown with criteria, bboxes, and transcripts. |
| **Grading** | `POST` | `/api/v1/grading/override` | Teacher/Admin | Records manual teacher override, updates scores, and logs immutable audit trail. |
| **Windows** | `POST` | `/api/v1/windows/open` | Branch Manager | Opens timed submission window with defined duration (e.g. 30m) and grace period. |
| | `GET` | `/api/v1/windows/{exam_id}/status` | Authenticated | Returns exact seconds remaining for real-time PWA countdown timers. |
| | `POST` | `/api/v1/windows/{exam_id}/close` | Branch Manager | Manually closes active submission window with logged reason. |
| | `POST` | `/api/v1/windows/{exam_id}/reopen` | Branch Manager | Reopens window for unsubmitted students with audit justification. |
| **Revaluation** | `POST` | `/api/v1/revaluation/requests` | Student | Files 7-day student revaluation dispute on specific questions with rationale. |
| | `GET` | `/api/v1/revaluation/requests` | Manager/Admin | Lists pending revaluation requests for teacher review. |
| | `PUT` | `/api/v1/revaluation/requests/{id}/resolve`| Manager/Admin | Approves or rejects dispute, adjusting awarded marks and notifying student. |
| **Exports** | `GET` | `/api/exports/pdf/{sub_id}` | Authenticated | Streams PyMuPDF vector-annotated PDF (blocked for students until published). |
| | `GET` | `/api/exports/marks-csv/{exam_id}` | Manager/Admin | Generates and streams complete class scorecard in CSV format. |
| | `GET` | `/api/exports/batch-zip/{batch_id}` | Manager/Admin | Compiles all graded PDFs for an entire batch into a downloadable ZIP archive. |
| **Notifications** | `GET` | `/api/v1/notifications` | Authenticated | Fetches user in-app notifications. |
| | `POST` | `/api/v1/notifications/push-subscription` | Authenticated | Registers client device VAPID push token for browser push delivery. |
| **Reports** | `POST` | `/api/v1/reports` | Authenticated | Submits technical issue report with up to 3 screenshots (max 500KB each). |
| **Students** | `GET` | `/api/v1/student/portal-state` | Student | Unified high-performance endpoint with 4-second in-memory caching. |
| **Analytics** | `GET` | `/api/v1/analytics/telemetry` | Root Admin | Real-time token consumption, latency percentiles ($P_{50}, P_{95}$), and costs. |
| | `GET` | `/api/v1/analytics/feasibility` | Root Admin | Cost and rate-limit feasibility projections for 40 and 50 paper batches. |
| **Storage** | `POST` | `/api/v1/storage/purge-expired` | Root Admin | Triggers manual sweep of the 15-day storage retention purge engine. |

---

## 12. Frontend Architecture & Next.js 14 App Router

The frontend is engineered with **Next.js 14 (App Router)**, **TypeScript**, **Tailwind CSS**, and **Lucide Icons**.

### 12.1 Directory Structure & Layout Hierarchy
```
frontend/src/
├── app/
│   ├── layout.tsx                 # Root layout with font, theme & global context providers
│   ├── page.tsx                   # Interactive landing page with role-based auto-redirect
│   ├── admin/                     # Root Admin console (institutes, branches, global metrics)
│   ├── exams/                     # Exam management hub & creation wizards
│   │   └── [id]/                  # Exam detail, rubric studio, submissions table
│   │       └── submissions/[subId]# Spatial Document Canvas & inspection studio
│   ├── student/                   # Student PWA portal with window countdown timers
│   ├── revaluation/               # Revaluation dispute management interface
│   └── analytics/                 # Telemetry dashboards, token charts, cost calculators
├── components/
│   ├── DocumentViewer.tsx         # 1,480-line Spatial Document Canvas with 8-handle bbox resize
│   ├── GradingModal.tsx           # Teacher verification, rubric breakdown & override studio
│   ├── RubricEditor.tsx           # Interactive rubric point editor & approval controls
│   ├── MarksTable.tsx             # Sortable student scorecard table with review badges
│   └── NotificationDrawer.tsx     # Sliding notification center with Web Push toggle
└── lib/
    ├── api.ts                     # 50KB Exhaustive typed API client
    ├── TenantContext.tsx          # Multi-tenant branch scoping state
    ├── ConfirmContext.tsx         # Enterprise confirmation dialog provider
    ├── ToastContext.tsx           # Action-linked toast notifications
    └── types.ts                   # Unified TypeScript interfaces matching backend Pydantic models
```

### 12.2 Client-Side Context Mesh
- **`TenantContext`**: Maintains active branch selection across sessions, automatically appending branch filters to all dashboard queries.
- **`ToastContext`**: Provides feedback toasts with custom icons, progress timers, and undo action hooks.
- **`ConfirmContext`**: Prevents accidental destructive actions (e.g., cascade exam deletion, closing submission windows) via modal dialogs.
- **`BreadcrumbContext`**: Maintains synchronized breadcrumb trails, shortening long UUIDs to 8 characters during loading states to prevent layout overflow.

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
# GOOGLE GEMINI MULTI-KEY FAILOVER RING
# ==============================================================================
GEMINI_API_KEY=AIzaSyA_PrimaryKey...
GEMINI_API_KEY_2=AIzaSyB_SecondaryKey...
GEMINI_API_KEY_3=AIzaSyC_TertiaryKey...
GEMINI_API_KEY_4=AIzaSyD_QuaternaryKey...
GEMINI_MODEL=gemini-3.8-flash
GEMINI_THINKING_BUDGET=1024

# ==============================================================================
# WORKER POOL & STORAGE LIFECYCLE
# ==============================================================================
MAX_EVALUATION_WORKERS=3
SUBMISSION_RETENTION_DAYS=15
WINDOW_DURATION_MINUTES=30
GRACE_PERIOD_MINUTES=2

# ==============================================================================
# CLOUDINARY CDN (OBJECT STORAGE)
# ==============================================================================
STORAGE_BACKEND=cloudinary
CLOUDINARY_CLOUD_NAME=dijssimbb
CLOUDINARY_API_KEY=499744465829232
CLOUDINARY_API_SECRET=BeE8QrnuIuIPw4xhI79FRE5tKNs

# ==============================================================================
# W3C BROWSER WEB PUSH (VAPID KEYS)
# ==============================================================================
VAPID_PUBLIC_KEY=BI1I5SnHVzzA1xq19X5M56EdzidtReiFM40_u9MTepwcZPy_H1G45nswZCVjVJCZpzFO7R5trsMlT2_i_kmbmDk
VAPID_PRIVATE_KEY=uO96ke6CeqAprAJgxrVs45c4i2X9Y5E516QGGVfKim8
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

**© 2026 PaperGrade AI Systems Inc. All rights reserved. Assessment Integrity Platform.**
