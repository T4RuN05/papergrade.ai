# PaperGrade AI — Enterprise Autonomous Evaluation & Assessment Integrity Platform

> **The Definitive Technical Bible & Comprehensive Architectural Specification**  
> *Version 2.5.0-PROD | Revision 2026.11 | Engineering Reference Manual*  
> PaperGrade AI is an enterprise-grade, multi-tenant automated examination evaluation and assessment integrity platform. Engineered for coaching institutes, universities, and academic boards, it harnesses Google Gemini's multimodal reasoning to perform cursive handwriting transcription, question-to-answer mapping, spatial bounding-box localization, criteria-based rubric grading, and verbatim evidence extraction in a single multimodal pass. The platform guarantees pedagogical fairness through deterministic backend mathematical invariants, vector-annotated PDF exports, client-side canvas streaming, direct-to-CDN signed ingestion, a 100-key failover ring, and a time-decoupled batch grading daemon.

---

## 📑 Master Table of Contents

1. [Permanent Operational Directives & Core Invariants](#1-permanent-operational-directives--core-invariants)
   - 1.1 Invariant 1: Strict Two-Phase Time-Decoupled Evaluation Window
   - 1.2 Invariant 2: 24/7 External Keep-Alive Infrastructure Directive
   - 1.3 Invariant 3: Pre-Authenticated Conduction Protocol
   - 1.4 Invariant 4: Tenancy & Production Safety Boundaries
2. [Global System Architecture & Distributed Block Diagram](#2-global-system-architecture--distributed-block-diagram)
   - 2.1 Macro Topology Overview
   - 2.2 Distributed Block Diagram
   - 2.3 System Component Matrix
3. [Multi-Tenant Hierarchy & Strict RBAC Security Matrix](#3-multi-tenant-hierarchy--strict-rbac-security-matrix)
   - 3.1 Four-Tier Tenancy Scoping (`Institute` $\to$ `Branch` $\to$ `Batch` $\to$ `Student`)
   - 3.2 Role Separation Matrix & Responsibilities
   - 3.3 Institute Director & Multi-Branch Campus Switching
   - 3.4 Exhaustive Access Control Matrix
4. [Client-Side Ingestion & Direct Cloud CDN Signed Upload Pipeline](#4-client-side-ingestion--direct-cloud-cdn-signed-upload-pipeline)
   - 4.1 Mobile Photo Capture & Web Worker Document Pipeline
   - 4.2 Adaptive 1920px Canvas Downscaling & Explicit GPU Texture Reclamation
   - 4.3 Canonical PDF Assembly via `pdf-lib` (Zero-Copy Buffer Transfers)
   - 4.4 The 3-Step Direct Cloud CDN Signed Upload Protocol (HMAC-SHA Handshake)
   - 4.5 Server OOM Elimination & Mathematical Memory Proofs
   - 4.6 Fallback Multipart Ingestion Path
5. [Pattern B: Client-Side PDF.js Canvas Streaming & Dynamic CSS Clipping](#5-pattern-b-client-side-pdfjs-canvas-streaming--dynamic-css-clipping)
   - 5.1 Zero-RAM PDF Delivery via HTTP 307 Temporary Redirects
   - 5.2 High-DPI Canvas Rendering Pipeline & Retina Display Scaling
   - 5.3 Bounded LRU Document & Page Canvas Cache (`pdfCache.ts`)
   - 5.4 Client-Side Question Crop Rendering (`ClippedAnswerCrop.tsx`)
6. [Sub-Millisecond ETag 304 Fast-Path & Realtime Architecture](#6-sub-millisecond-etag-304-fast-path--realtime-architecture)
   - 6.1 The Polling Load Challenge & Connection Starvation
   - 6.2 `PortalStateEpochManager` RAM Version Vectors & Weak ETags
   - 6.3 Sub-0.2ms Conditional Evaluation Flow
   - 6.4 Supabase Realtime Logical Replication WebSockets
   - 6.5 Page Visibility Adaptive Polling & W3C WebPush Integration
7. [Autonomous Persistent Background Worker Engine](#7-autonomous-persistent-background-worker-engine)
   - 7.1 Multi-Threaded Daemon Architecture (`PersistentQueueWorker`)
   - 7.2 Atomic Row Locking via PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED`
   - 7.3 The 60-Second Watchdog Thread (Stale Job Auto-Recovery)
   - 7.4 429 Quota Exhaustion Circuit Breaker & Exponential Backoff
   - 7.5 Lifespan Management & Memory Bounds (Render vs. VPS Sizing)
   - 7.6 Asynchronous Background Notification & Audit Pruning
8. [The AI Engine & Google Gemini Multimodal Pipeline](#8-the-ai-engine--google-gemini-multimodal-pipeline)
   - 8.1 Zero-OCR Multimodal Vision Paradigm
   - 8.2 The 100-Key Scanning Failover Ring & Active Pool Rotation
   - 8.3 3-Tier Full-Flash Model Cascade (3.8 $\to$ 3.6 $\to$ 3.5)
   - 8.4 The 65,536 Output Token Ceiling & Thinking Budget Allocation
   - 8.5 The Self-Healing JSON Stream Buffer (`_repair_truncated_json`)
   - 8.6 Anti-Parametric Invariant & Prompt Engineering Standards
   - 8.7 Deterministic Evidence Kill-Switch & Discrete 0.5-Mark Allocation Rule
9. [Deterministic Grading & Invariants Engine](#9-deterministic-grading--invariants-engine)
   - 9.1 Score Clamping & Bottom-Up Criterion Summation
   - 9.2 The "Best-of-N" Section Option Limit Algorithm
   - 9.3 PyMuPDF Vector Annotation Overlay Engine
   - 9.4 Immutable Teacher Audit Trail Engine
   - 9.5 7-Day Revaluation Dispute Lifecycle (100% Zero-AI Human Resolution)
10. [Unified Hybrid Storage Tier & 15-Day TTL Lifecycle](#10-unified-hybrid-storage-tier--15-day-ttl-lifecycle)
    - 10.1 Storage Abstraction Hierarchy (`LocalStorage`, `Cloudinary`, `Cloudflare R2`)
    - 10.2 15-Day Retention Policy (TTL) Architecture & FERPA/GDPR Compliance
    - 10.3 Scheduled Storage Purge Daemon Mechanics
    - 10.4 Permanent Academic Grade & Longitudinal BI Archiving
11. [Database Architecture & Schema Specification](#11-database-architecture--schema-specification)
    - 11.1 Supabase PostgreSQL 15 & PgBouncer Transaction Mode (`:6543`)
    - 11.2 SQLAlchemy 2.0 ORM Configuration & Health Verification
    - 11.3 Atomic Sequence Roll Number Generation (`C25-BVI-001`)
    - 11.4 Complete Schema Inventory (24 Verified Database Tables)
    - 11.5 Performance Index Inventory & N+1 Query Elimination
    - 11.6 Master Entity-Relationship (ER) Diagram
12. [Exhaustive Backend API Router Catalog](#12-exhaustive-backend-api-router-catalog)
    - Complete Reference of All 13 Routers & 50+ Endpoints
13. [Frontend Architecture & Next.js 14 App Router](#13-frontend-architecture--nextjs-14-app-router)
    - 13.1 Directory Topology & Layout Hierarchy
    - 13.2 Client-Side Context Mesh
    - 13.3 Notion-Grade Design System & Apple Micro-Tactility
    - 13.4 Spatial Document Canvas (`DocumentViewer.tsx`) & Verification Studio
    - 13.5 Student Mobile PWA & iOS Safari Banner Integration
    - 13.6 Academic Grace-Mark 404 Experience
14. [Observability, Telemetry & Quota Feasibility](#14-observability-telemetry--quota-feasibility)
    - 14.1 Real-Time Token Telemetry & Paid-Equivalent Cost Tracking
    - 14.2 Latency Percentiles ($P_{50}, P_{95}$)
    - 14.3 Mathematical Batch Concurrency & Capacity Modeling
15. [DevOps, Deployment & Operations Runbook](#15-devops-deployment--operations-runbook)
    - 15.1 Environment Configuration Matrix (`.env`)
    - 15.2 Production Deployment Setup (Render + Vercel + Supabase)
    - 15.3 Emergency Troubleshooting Playbooks

---

## 1. Permanent Operational Directives & Core Invariants

The following operational directives are permanently codified into the PaperGrade AI architecture. They govern all runtime execution, infrastructure configuration, and testing boundaries.

### 1.1 Invariant 1: Strict Two-Phase Time-Decoupled Evaluation Window
PaperGrade AI strictly decouples the high-concurrency student ingestion window from the computationally intensive AI grading window:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                  24-HOUR OPERATIONAL CYCLE                             │
├──────────────────────────────────────────┬─────────────────────────────────────────────┤
│   PHASE 1: DAYTIME (< 8:00 PM IST)       │     PHASE 2: OVERNIGHT (>= 8:00 PM IST)     │
│   EXAM INGESTION & PORTAL BROWSING ONLY  │     BATCH EVALUATION & AI GRADING ONLY      │
├──────────────────────────────────────────┼─────────────────────────────────────────────┤
│ • Classes, tests, and student uploads.   │ • Classes finished; portal traffic near 0.  │
│ • Cloud CDN direct PDF uploads.          │ • Background daemon grades queued scripts.  │
│ • AI grading is STRICTLY FORBIDDEN.      │ • 100% CPU, RAM, & API quota dedicated.     │
│ • 100% server CPU dedicated to HTTP/auth.│ • SLA: Results published next/next-to-next day│
└──────────────────────────────────────────┴─────────────────────────────────────────────┘
```

- **Daytime Window (< 8:00 PM IST):** All student exams, scanning, pre-signed upload handshakes, and portal queries execute during this period. Background AI grading workers are suspended. Server CPU, memory, and database connection pools are dedicated entirely to servicing student submissions without resource contention.
- **Overnight Window ($\ge$ 8:00 PM IST):** Background grading daemons (`PersistentQueueWorker`) activate to process all queued answer sheets in batch mode overnight.
- **Client Commitment SLA:** Results are officially published the **next day or next-to-next day** (never instant same-day results). This eliminates pressure on daytime API quotas and ensures thorough human audit capability.

### 1.2 Invariant 2: 24/7 External Keep-Alive Infrastructure Directive
- **Continuous External Monitoring:** The production backend API is continuously monitored and pinged 24/7 by an external uptime monitoring bot (UptimeRobot) at 5-minute intervals.
- **Zero Cold-Start Latency:** The production application container remains permanently warm. Memory buffers, database connection pools, and background daemons (`PersistentQueueWorker`, notification pruners, stale-job watchdogs) remain continuously active in RAM.

### 1.3 Invariant 3: Pre-Authenticated Conduction Protocol
- **7-Day Persistent Sessions:** Authentication tokens utilize 7-day expiration windows (`ACCESS_TOKEN_EXPIRE_MINUTES = 10080`) persisted in client browser `localStorage`.
- **Pre-Exam Login Policy:** Students log in prior to arriving at the examination hall or upon entering the classroom.
- **Bcrypt Storm Elimination:** By enforcing pre-authentication, concurrent 12-round bcrypt password hashing operations are eliminated when the submission window opens. Incoming requests only perform microsecond JWT cryptographic signature verifications, preventing CPU throttling during burst uploads.

### 1.4 Invariant 4: Tenancy & Production Safety Boundaries
- **CATCH 25 Institute (`inst_e1eeda3473c3`, `br_c25_acbdd4d8`):** Real-world coaching institute production data is strictly read-only for system inspection. It is **100% excluded** from synthetic tests, mock scripts, automated end-to-end runs, or load testing pipelines.
- **Synthetic Test Boundary:** All synthetic tests, automated stress runs, mock student submissions, and load simulations must target `TEST INSTITUTE` (`inst_test_institute`, `br_test_bvi`, `usr_test_bvi_001`) exclusively.

---

## 2. Global System Architecture & Distributed Block Diagram

### 2.1 Macro Topology Overview
PaperGrade AI separates concerns across three primary network tiers:
1. **Client Tier (Vercel Edge):** Next.js 14 App Router, Web Workers for client-side PDF downscaling and assembly, PDF.js HTML5 Canvas streaming, and Supabase Realtime WebSocket listeners.
2. **Application & Ingestion Tier (Render Cloud):** FastAPI running on Python 3.11, orchestrating HMAC pre-signed direct upload handshakes, sub-millisecond ETag conditional caching, PyMuPDF structural bounds validation, and background worker threads.
3. **Data & Storage Tier (Supabase & Cloudflare R2 / Cloudinary):** PostgreSQL 15 accessed via PgBouncer transaction pooling (:6543) for relational state; Cloud CDN object storage for zero-RAM binary PDF and vector asset delivery.

### 2.2 Distributed Block Diagram

```mermaid
flowchart TB
    subgraph ClientTier["Client Tier (Next.js 14 App Router / Vercel Edge)"]
        direction TB
        AdminApp["Root Admin Dashboard\n(/admin/tenancy, /admin/reports)"]
        ManagerApp["Branch Workspace & Studio\n(/exams, /batches, /grading)"]
        StudentApp["Student PWA Mobile Portal\n(/student/portal, /student/exams)"]
        CanvasApp["Spatial Document Canvas\n(Pattern B Canvas Streaming & CSS Clipping)"]
        WebWorker["Web Worker PDF Pipeline\n(Adaptive 1920px Canvas Downscaling)"]
    end

    subgraph EdgeCDN["Edge & Direct-to-Cloud Storage Tier"]
        Cloudinary["Cloudinary CDN / Cloudflare R2\n(Direct HMAC-SHA Ingestion & Signed Streaming)"]
        SupabaseRT["Supabase Realtime Cluster\n(Logical Replication WebSockets :443)"]
        VAPID["W3C Web Push Gateway\n(Google FCM / Apple APNs / Mozilla)"]
    end

    subgraph APITier["FastAPI Application Cluster (:8000)"]
        direction TB
        MW_CORS["CORS & Request Profiling Middleware"]
        MW_Auth["JWT & Role Authorization Guard (7-Day Sessions)"]
        
        subgraph Routers["FastAPI Routers (13 Dedicated Domains)"]
            R_Auth["auth.py (JWT, Account Claim, Password Resets)"]
            R_Tenancy["tenancy.py (Institutes, Branches, Subjects, Batches)"]
            R_Exams["exams.py (Exams, Key Upload, Rubric Approval, Publishing)"]
            R_Subs["submissions.py (Direct CDN Upload, Validation, Purge)"]
            R_Grading["grading.py (Overrides, Bbox Edits, Re-evaluations)"]
            R_Reval["revaluation.py (7-Day Disputes & Zero-AI Resolution)"]
            R_Windows["windows.py (Timed Windows, Hard-Close, Grace)"]
            R_Reports["reports.py (Issue Tickets & Screenshots)"]
            R_Exports["exports.py (CSV, Vector Graded PDF, Batch ZIP)"]
            R_Notifs["notifications.py (Push & In-App Center)"]
            R_Students["students.py (Unified ETag 304 Portal State)"]
            R_Analytics["analytics.py (Telemetry, Quotas, Feasibility)"]
            R_Storage["storage.py (Pre-Signed GET/PUT URLs & 307 Redirects)"]
        end
    end

    subgraph ServiceTier["Core Business Logic Domain"]
        direction TB
        S_Grading["GradingService (Invariants, Best-of-N, Audit Trail)"]
        S_Exam["ExamService (Lifecycle State Machine & Cascade Delete)"]
        S_PDF["PDFService (PyMuPDF Vector Overlays, Bounds Check)"]
        S_Storage["StorageService (Cloudinary, Cloudflare R2, Local)"]
        S_Retention["RetentionService (15-Day TTL Post-Grading Purge Engine)"]
        S_Notif["NotificationService (WebPush, In-App Drawer, Daemon Pruning)"]
        S_Portal["PortalStateEpochManager (Sub-0.2ms RAM Version Vectors)"]
    end

    subgraph WorkerPool["Autonomous Persistent Daemon Pool"]
        direction TB
        PW_Master["PersistentQueueWorker (Daemon Thread Pool)"]
        PW_Lock["Atomic DB Row-Level Claiming (SKIP LOCKED)"]
        PW_Watchdog["60s Watchdog Thread (5-Minute Stale Job Recovery)"]
        PW_Cooldown["Quota Backoff Manager (30s Cooldown on 429)"]
        PW_TimeGate["Two-Phase Time Gate (Grades only >= 8:00 PM IST)"]
    end

    subgraph AIEngine["AI Inference Cluster (Google GenAI Python SDK)"]
        direction TB
        GeminiClient["GeminiGradingClient (100-Key Scanning Failover Ring)"]
        PrimaryModel["gemini-3.8-flash (Primary, 65,536 Output Tokens)"]
        Fallback1["gemini-3.6-flash (Tier 1 Fallback)"]
        Fallback2["gemini-3.5-flash (Tier 2 Fallback)"]
        ReevalModel["gemini-3.5-flash-lite (Targeted Single-Answer Re-eval)"]
        StreamHealer["_repair_truncated_json (Structural Buffer Repair)"]
    end

    subgraph DataTier["Database Tier (Supabase PostgreSQL 15)"]
        PG_Pooler["Supavisor / PgBouncer Transaction Pooler (:6543)\n(ThreadedConnectionPool, max 40 connections)"]
        Tables[("24 Normalized Tables Across 5 Domains:\ninstitutes, branches, subjects, users, batches,\nstudents, exams, exam_batches, submission_windows,\nrubric_versions, submissions, answers, answer_regions,\ncriterion_scores, evaluation_queue, revaluation_requests,\nnotifications, push_subscriptions, password_reset_requests,\ntechnical_reports, audit_logs, api_usage_events,\nuser_quota_settings, experiment_benchmarks")]
    end

    %% Client Interactions
    ClientTier <-->|REST API / HTTPS / Bearer JWT| APITier
    StudentApp -->|Direct Pre-Signed Multipart POST (0 Server RAM)| Cloudinary
    CanvasApp <-->|HTTP 307 Redirects to Pre-Signed CDN URLs| Cloudinary
    ClientTier <-->|WebSocket Realtime Events| SupabaseRT
    
    %% API & Services
    APITier --> ServiceTier
    ServiceTier --> DataTier
    ServiceTier <--> EdgeCDN
    
    %% Workers & AI Engine
    WorkerPool --> PW_TimeGate
    PW_TimeGate --> ServiceTier
    PW_TimeGate --> GeminiClient
    GeminiClient --> PrimaryModel
    PrimaryModel -.->|429 Resource Exhausted| Fallback1
    Fallback1 -.-> Fallback2
    GeminiClient --> StreamHealer

    %% Database Connections
    PG_Pooler --> Tables
    ServiceTier --> PG_Pooler
```

### 2.3 System Component Matrix

| Subsystem | Primary Technologies | Operational Mandate |
| :--- | :--- | :--- |
| **Frontend UI** | Next.js 14 (App Router), React 18, Tailwind CSS, Lucide Icons | Responsive spatial inspection canvas, mobile PWA student portal, Notion-grade warm/obsidian theme context. |
| **Document Engine** | Web Worker, `OffscreenCanvas`, `pdf-lib`, PDF.js, PyMuPDF (`fitz`) | Client-side 1920px image downscaling, upright PDF compilation, client-side canvas streaming, vector annotations. |
| **Backend API** | Python 3.11, FastAPI, Pydantic v2, Uvicorn | High-throughput async REST endpoints, HMAC-SHA upload signing, role authorization, ETag 304 fast paths. |
| **Database** | PostgreSQL 15 (Supabase), PgBouncer (:6543), SQLAlchemy 2.0 | Transaction connection pooling, atomic roll numbers via row locks, composite B-tree indexing, 24 normalized tables. |
| **Background Daemons**| Python `threading.Thread`, daemon pools, watchdog timer | Two-phase time-decoupled batch evaluation, 60s stale job recovery, async notification and audit table pruning. |
| **AI Inference** | Google GenAI SDK (`google-genai`), Gemini 3.8/3.6/3.5 Flash | Single-pass multimodal grading, 100-key failover ring, 65,536 output token buffer, anti-parametric verification. |
| **Storage Tier** | Cloudinary CDN, Cloudflare R2, Local SSD buffer | Pre-signed upload/download streaming, zero-server-RAM document delivery, automated 15-day TTL purge engine. |

---

## 3. Multi-Tenant Hierarchy & Strict RBAC Security Matrix

### 3.1 Four-Tier Tenancy Scoping
PaperGrade AI enforces strict logical data isolation across an enterprise educational hierarchy:
$$\text{Institutes} \longrightarrow \text{Branches} \longrightarrow \text{Batches} \longrightarrow \text{Students}$$

```mermaid
graph TD
    Inst["Institute (Root Tenant)\ne.g. Apex Coaching Institute"]
    Inst --> BranchA["Branch: North Campus (BVI)"]
    Inst --> BranchB["Branch: South Campus (THN)"]
    BranchA --> BatchA1["Batch: 12th CET - Engineering"]
    BranchA --> BatchA2["Batch: 12th JEE - Advanced"]
    BranchB --> BatchB1["Batch: 11th Foundation"]
    BatchA1 --> Student1["Student: C25-BVI-001"]
    BatchA1 --> Student2["Student: C25-BVI-002"]
```

1. **Institutes (`institutes`):** The top-level institutional customer entity (e.g. *"CATCH 25"*). Scopes all branches, curricula, staff, and student accounts.
2. **Branches (`branches`):** Physical campuses or regional centers. Each campus maintains isolated classrooms, physical roll sequence numbers, and localized manager accounts.
3. **Batches (`batches`):** Academic cohorts grouped by year and target examination (e.g. *"12th CET-1"*).
4. **Students (`students`):** Enrolled learners with system-generated atomic roll numbers, unique 6-digit claim IDs, and individual submission histories.

### 3.2 Role Separation Matrix & Responsibilities

| Role Key | Real-World Identity | Operational Scope | Core Responsibilities |
| :--- | :--- | :--- | :--- |
| **`ROOT_ADMIN`** | System Architect / Board Director | Global (All Tenants) | Provisions institutes, uploads official answer keys, approves immutable rubrics, manages global Gemini API keys, triggers cascade purges. |
| **`INSTITUTE_DIRECTOR`** | Academic Managing Director | Institute-Wide | Exercises administrative oversight across all branches under their institute. Uses the dynamic Branch Switcher to inspect campus performance without cross-tenant leakage. |
| **`BRANCH_MANAGER`** | Campus Principal / Head Proctor | Branch-Scoped | Schedules local exams, opens timed submission windows, monitors batch queues, reviews flagged papers, performs manual score overrides, resolves revaluation appeals. **Strictly forbidden from viewing or uploading official answer keys.** |
| **`STUDENT`** | Enrolled Learner | Personal Records Only | Tracks exam windows via real-time PWA countdown timers, captures and submits answer sheets directly to CDN, views vector-annotated graded PDFs post-publication, files 7-day revaluation appeals. |

### 3.3 Institute Director & Multi-Branch Campus Switching
In enterprise coaching networks, educational directors oversee multiple physical branches. 
- **Compound Scoping:** In `backend/app/routers/tenancy.py` and `backend/app/routers/exams.py`, user authentication tokens verify both `institute_id` and `branch_id`.
- **Dynamic Context Switching:** An `INSTITUTE_DIRECTOR` possesses an explicit `institute_id` with an optional `branch_id`. The frontend header renders a high-speed branch switcher (`TenantContext.tsx`). Directors can switch between campuses seamlessly; the backend verifies that the requested campus belongs to their authorized `institute_id` before yielding data.

### 3.4 Exhaustive Access Control Matrix

| System Domain / Action | Root Admin | Institute Director | Branch Manager | Student | Backend Enforcement Dependency |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Provision Institutes & Branches** |  | ❌ | ❌ | ❌ | `require_root_admin` |
| **Switch Active Branch Context** |  |  | ❌ | ❌ | Validates `branch.institute_id == user.institute_id` |
| **Upload Question Papers** |  |  |  | ❌ | Branch-scoped query validation |
| **Upload Official Answer Keys** |  | ❌ | ❌ | ❌ | Restricted endpoint (`require_root_admin`) |
| **Approve / Unlock Rubrics** |  | ❌ | ❌ | ❌ | Immutable evaluation lock (`require_root_admin`) |
| **Open / Close Submission Windows** |  |  |  | ❌ | `require_branch_manager` |
| **Direct CDN Student Ingestion** | ❌ | ❌ | ❌ |  | Timed check against active window & BOLA roll validation |
| **Trigger Batch AI Grading** |  |  |  | ❌ | Requires approved rubric (`is_approved = 1`) |
| **Execute Manual Teacher Override** |  |  |  | ❌ | Mandatory immutable entry in `audit_logs` |
| **Publish Exam Results** |  |  |  | ❌ | Toggles `is_published = 1`, triggers notifications |
| **View Graded Vector PDF** |  |  |  |  | Blocked for students until `is_published == 1` |
| **File 7-Day Revaluation Appeal** | ❌ | ❌ | ❌ |  | Validates `now <= published_at + 7 days` |
| **Resolve Revaluation Dispute** |  |  |  | ❌ | Zero-AI human teacher review requirement |
| **Trigger 15-Day Storage Purge** |  | ❌ | ❌ | ❌ | Automated background service (`retention_service.py`) |
| **Cascade Tenant Deletion** |  | ❌ | ❌ | ❌ | Multi-table cascade scrub with 7-day recovery grace |

---

## 4. Client-Side Ingestion & Direct Cloud CDN Signed Upload Pipeline

### 4.1 Mobile Photo Capture & Web Worker Document Pipeline
Students frequently capture handwritten answer scripts using mobile cameras under poor lighting or varying angles. In `frontend/src/app/student/portal/page.tsx`:
- **Fast Path:** If a student selects a single pre-existing PDF, compilation is bypassed entirely, and the document is prepared for immediate upload.
- **Multi-Page Image Path:** When students capture 2 to 15 camera photos, processing is offloaded to a dedicated background Web Worker (`frontend/src/workers/pdfWorker.ts`) via `assembleFilesToCanonicalPdf()`.
- **Zero-Copy Memory Transfer:** Files are converted into `ArrayBuffer` objects and passed via the postMessage transfer list:
  ```typescript
  const transferables = files.map((f) => f.buffer);
  worker.postMessage({ type: "ASSEMBLE", payload: { files, options } }, transferables);
  ```
  Transferring buffer ownership guarantees zero memory duplication on the main JavaScript thread, keeping the UI at 60 FPS and preventing timer freezes.

### 4.2 Adaptive 1920px Canvas Downscaling & Explicit GPU Texture Reclamation
Raw smartphone camera photos range from 12MP to 48MP (6MB–12MB each). Uploading 5 uncompressed photos requires 30MB–60MB of mobile data.
In `pdfWorker.ts` (`compressImageInWorker`):
1. **Asynchronous Decoding:** `createImageBitmap(blob)` rapidly decodes raw image bytes off the main thread.
2. **Proportional Resizing:** Constrains dimensions so that neither width nor height exceeds `maxDimension = 1920px`:
   $$\text{scale} = \min\left(1.0, \; \frac{1920}{\max(\text{width}, \text{height})}\right)$$
   *Pedagogical Rationale:* A 1920px vertical height corresponds to ~200 DPI for standard A4 answer sheets—sufficient for intricate handwriting strokes, subscript/superscript recognition, and diagram grading, while shrinking raw file size by 85–95%.
3. **OffscreenCanvas JPEG Blit:** An `OffscreenCanvas` is filled with pure white (`#ffffff`) to prevent black alpha-channel artifacts, and the bitmap is drawn scaled. Encoded via `canvas.convertToBlob({ type: "image/jpeg", quality: 0.80 })`.
4. **Explicit GPU Buffer Reclamation:** Unmanaged textures are freed immediately:
   ```typescript
   canvas.width = 0;
   canvas.height = 0;
   bitmap.close();
   ```
   This prevents mobile Safari and Android WebViews from exceeding browser tab memory allocations.

### 4.3 Canonical PDF Assembly via `pdf-lib`
In `pdfWorker.ts`:
- A new document is initialized via `PDFDocument.create()`.
- Downscaled JPEG byte streams are embedded via `pdfDoc.embedJpg(jpegBytes)` and attached to pages matching the exact image aspect ratio.
- Object streams are packed via `pdfDoc.save({ useObjectStreams: true })`, producing a canonical PDF between 1.1MB and 1.6MB for a typical 5-page submission.
- The compiled buffer is transferred back to the main thread via zero-copy transfer.

### 4.4 The 3-Step Direct Cloud CDN Signed Upload Protocol

```
+---------------+              +--------------------+              +------------------------+
| Student Client|              |  FastAPI Backend   |              | Cloudinary CDN / R2    |
+---------------+              +--------------------+              +------------------------+
        |                                |                                     |
        | 1. POST /request-upload        |                                     |
        |------------------------------->| (Validate window, BOLA, batch)      |
        |                                | (Generate HMAC-SHA signature)       |
        | 2. Signed upload ticket        |                                     |
        |<-------------------------------|                                     |
        |                                                                      |
        | 3. Direct Multipart POST (File binary + HMAC parameters)             |
        |--------------------------------------------------------------------->|
        | 4. 200 OK Response (Public ID, ETag, Asset URL)                      |
        |<---------------------------------------------------------------------|
        |                                |                                     |
        | 5. POST /confirm-upload        |                                     |
        |------------------------------->| (Verify asset via HEAD request)     |
        |                                | (PyMuPDF bounds: <=15p, <=7MB)      |
        |                                | (Atomic supersede & bump epoch)     |
        | 6. Confirmation & 200 OK       |                                     |
        |<-------------------------------|                                     |
```

#### Step 1: Pre-Authorization & HMAC Signature Handshake
- **Route:** `POST /api/v1/submissions/{exam_id}/request-upload` (`backend/app/routers/submissions.py`).
- **Enforcements:**
  1. **BOLA Check:** Verifies student role ownership (`clean_roll == current_user.roll_number`).
  2. **Active Window Check:** Verifies submission window is currently `OPEN` and not expired.
  3. **Batch Restriction:** Confirms student enrollment in assigned batches when `batch_scope != 'ALL'`.
- **HMAC Signature Generation (`storage.py`):**
  Generates an authorization payload signed with the cloud storage API secret:
  ```python
  params_to_sign = {"public_id": destination_key, "timestamp": timestamp}
  signature = cloudinary.utils.api_sign_request(params_to_sign, api_secret)
  ```
  Returns the signed endpoint URL, public ID, API key, and HMAC signature (`is_direct_cloud: True`).

#### Step 2: Direct Client POST to Cloud CDN (Zero Server RAM)
- The browser constructs a `FormData` object containing the HMAC parameters and the compiled canonical PDF.
- The browser dispatches the binary payload directly to `https://api.cloudinary.com/v1_1/{cloud_name}/raw/upload` (or directly via S3v4 signed PUT to Cloudflare R2).
- **RAM Impact:** **0 bytes** of binary stream pass through the FastAPI backend process.

#### Step 3: Registration & PyMuPDF Structural Validation
- **Route:** `POST /api/v1/submissions/{exam_id}/confirm-upload` (`backend/app/routers/submissions.py`).
- **Validation Pipeline:**
  1. Probes cloud storage via an HTTP `HEAD` request (`storage.file_exists(storage_key)`).
  2. Downloads the file header to verify size ($\le 7\text{ MB}$).
  3. Validates document integrity via PyMuPDF (`fitz.open()`) and verifies page count ($\le 15\text{ pages}$).
  4. **Atomic Replacement (`_purge_and_replace_previous_submissions`):** If a student re-submits within the window, previous raw and annotated PDFs are deleted from cloud storage, older database records are superseded, and the new record is marked `UPLOADED`.
  5. Bumps user epoch via `PortalStateEpochManager.bump_user(student_id)`.

### 4.5 Server OOM Elimination & Mathematical Memory Proofs

```
TRADITIONAL PROXY ARCHITECTURE (Catastrophic Server OOM Crash):
250 concurrent uploads * 12 MB raw photos = 3,000 MB buffer in FastAPI RAM
Result: Linux kernel OOM killer terminates backend process (SIGKILL 137).

PAPERGRADE AI DIRECT CDN ARCHITECTURE (Guaranteed Stability):
250 concurrent uploads * 0 bytes in server RAM = 0 MB buffer in FastAPI RAM
Result: Backend processes only two 1 KB JSON handshake tickets. RAM remains flat (< 180 MB).
```

$$\text{Traditional Memory Consumption} = N \times S_{\text{upload}} \times M_{\text{buffer}}$$
- With $N = 250$ students uploading 12MB scans with multipart chunk buffering ($M = 2$), required server memory is:
  $$250 \times 12\text{ MB} \times 2 = 6,000\text{ MB (6 GB RAM)}$$
  On a 512MB–1GB cloud container, this causes an immediate OS Out-Of-Memory kill (`SIGKILL 137`).
- **PaperGrade AI Architecture:**
  $$250 \times 0\text{ bytes} = 0\text{ MB}$$
  The backend handles only lightweight JSON metadata requests ($< 1\text{ KB}$ each). Server memory stays constant at steady-state baseline (~178MB), completely eliminating OOM risks.

### 4.6 Fallback Multipart Ingestion Path
If an adblocker, strict firewall, or network proxy blocks direct CDN uploads, the client automatically falls back to `POST /api/v1/submissions/{exam_id}/upload-single`. The backend validates that the payload is a pre-compiled canonical PDF ($\le 15$ pages, $\le 7$MB) and processes it safely through the local SSD buffer.

---

## 5. Pattern B: Client-Side PDF.js Canvas Streaming & Dynamic CSS Clipping

### 5.1 Zero-RAM PDF Delivery via HTTP 307 Temporary Redirects
When viewing graded scripts or answer sheets in the spatial document viewer:
- The client requests `GET /api/v1/submissions/{id}/pdf`.
- The backend verifies role permissions and document retention status.
- Instead of downloading the PDF into backend RAM and streaming bytes to the client, the backend returns an **HTTP 307 Temporary Redirect** pointing directly to a signed Cloud CDN URL:
  ```python
  return RedirectResponse(url=presigned_cdn_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
  ```
- The client browser streams the PDF directly from CDN edge caches. Zero PDF bytes buffer in server memory.

### 5.2 High-DPI Canvas Rendering Pipeline
In `frontend/src/components/PdfPageView.tsx`:
1. **Document Loading:** `pdfCache.getDocument(key, url)` loads the document using PDF.js.
2. **Device Pixel Ratio Scaling:** Calculates high-resolution dimensions for crisp retina text:
   ```typescript
   const pixelRatio = window.devicePixelRatio || 1;
   const renderWidth = Math.max(800, targetWidth) * Math.min(2, pixelRatio);
   const scale = renderWidth / unscaledViewport.width;
   const viewport = page.getViewport({ scale });
   ```
   Internal canvas pixels match the physical screen display, while CSS styles scale responsively (`w-full h-full`), ensuring crystal-clear cursive handwriting rendering.
3. **Cancellation Safety:** Rapid page flipping cancels active render tasks via `currentRenderTask.cancel()`, cleanly suppressing `RenderingCancelledException` to avoid GPU memory leaks.

### 5.3 Bounded LRU Document & Page Canvas Cache (`pdfCache.ts`)
- **Document Cache Limit:** Caches a maximum of 2 documents (`MAX_DOCS = 2`). Opening a third evicts the oldest via `doc.destroy()`.
- **Page Canvas Cache Limit:** Caches a maximum of 6 rendered canvases (`MAX_PAGE_CANVASES = 6`).
- **Explicit Memory Zeroing:** Evicted canvases have their dimensions set to 0 (`canvas.width = 0; canvas.height = 0;`), forcing browser rendering engines (WebKit/Blink) to immediately drop backing GPU raster buffers.

### 5.4 Client-Side Question Crop Rendering (`ClippedAnswerCrop.tsx`)
Rather than slicing answer bounding boxes on the server with PyMuPDF, saving PNG crops to disk, and uploading thousands of crop files to Cloudinary (which caused the Nov 15 OOM crash):
- **Pattern B Execution:** Zero crop files are generated on the server.
- **Client Canvas Blit:** For any evaluated question with normalized bounding box $\{x, y, w, h\} \in [0.0, 1.0]$:
  ```typescript
  const s_x = Math.floor(x * pageCanvas.width);
  const s_y = Math.floor(y * pageCanvas.height);
  const s_w = Math.floor(w * pageCanvas.width);
  const s_h = Math.floor(h * pageCanvas.height);
  destCanvas.width = s_w;
  destCanvas.height = s_h;
  ctx.drawImage(pageCanvas, s_x, s_y, s_w, s_h, 0, 0, s_w, s_h);
  ```
- **Performance:** **0 ms network latency**, 0 bytes cloud storage, 0 server CPU.
- **CSS Clipping Fallback:** If canvas extraction is unsupported, the component renders the parent page inside an overflow-hidden container with negative CSS margins, letting the browser GPU clip to the exact bounding box.

---

## 6. Sub-Millisecond ETag 304 Fast-Path & Realtime Architecture

### 6.1 The Polling Load Challenge & Connection Starvation
During live exams, 300+ students on the portal poll for window status updates every 20 seconds. In standard architectures, 900 queries per minute executing multi-table joins quickly exhaust database connection pools.

### 6.2 `PortalStateEpochManager` RAM Version Vectors & Weak ETags
In `backend/app/services/portal_cache.py`, the backend maintains thread-safe in-memory version vectors:
- `_global_epoch`: Incremented on system-wide updates.
- `_branch_epochs: Dict[str, int]`: Incremented whenever an exam is created, published, or a window opens/closes in a specific branch.
- `_user_epochs: Dict[str, int]`: Incremented when an individual student submits or appeals.
- **Weak ETag Format:**
  $$\text{ETag} = W/"\{global\}-\{branch\}-\{user\}"$$

### 6.3 Sub-0.2ms Conditional Evaluation Flow
1. Client polls `GET /api/v1/student/portal-state` with `If-None-Match: W/"..."`.
2. In `backend/app/routers/students.py`:
   ```python
   current_etag = PortalStateEpochManager.get_etag(branch_id=branch_id, user_id=user_id)
   if if_none_match and if_none_match.strip() == current_etag:
       return Response(status_code=status.HTTP_304_NOT_MODIFIED)
   ```
3. **Performance:** Returns HTTP 304 in **$< 0.2\text{ ms}$** without querying the database or checking out a connection pool slot.
4. **Client Zero-Parse Return:** When receiving HTTP 304, `frontend/src/lib/api.ts` immediately returns its in-memory cached state object, bypassing JSON parsing and redundant React re-renders.

### 6.4 Supabase Realtime Logical Replication WebSockets
For instantaneous alert delivery without polling latency:
- In `supabase_schema.sql`, the `notifications` table is registered in the Supabase logical replication publication:
  ```sql
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  ALTER TABLE notifications REPLICA IDENTITY FULL;
  ```
- The frontend client (`NotificationContext.tsx`) establishes a persistent WebSocket connection to `@supabase/supabase-js`, listening on channel `notifs_{userId}`.
- Alerts (window openings, grade releases) arrive over WebSockets in **$< 50\text{ ms}$**.

### 6.5 Page Visibility Adaptive Polling & W3C WebPush Integration
- **Adaptive Heartbeat:** When the WebSocket is active, HTTP polling interval relaxes to a 60-second gentle heartbeat. If the WebSocket drops, it adapts to 30 seconds.
- **Page Visibility API:** If the user minimizes the browser tab or locks their phone screen (`document.visibilityState === 'hidden'`), polling pauses completely, reducing background server requests by ~84%.
- **W3C Web Push (Closed-App Alerts):** Dispatches VAPID-encrypted push packets via `pywebpush` directly to Google FCM, Apple APNs, or Mozilla gateways, waking mobile PWA devices even when the browser is completely closed.

---

## 7. Autonomous Persistent Background Worker Engine

### 7.1 Multi-Threaded Daemon Architecture (`PersistentQueueWorker`)
The grading engine operates as an autonomous daemon pool in `backend/app/worker/queue_worker.py`:
- Spawns $N$ worker daemon threads (`MAX_EVALUATION_WORKERS`, default 1 on Render 512MB, up to 4–6 on 2GB+ VPS).
- Runs in an infinite execution loop, continuously querying `evaluation_queue` for jobs with `status = 'QUEUED'`.
- Enforces the **Two-Phase Time-Decoupled Rule**: worker threads sleep during daytime hours (< 8:00 PM IST) and activate automatically at 8:00 PM IST for overnight batch grading.

### 7.2 Atomic Row Locking via PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED`
To prevent race conditions where multiple worker threads claim the same student paper:
```sql
SELECT id, submission_id, exam_id 
FROM evaluation_queue 
WHERE status = 'QUEUED' 
ORDER BY priority ASC, created_at ASC 
LIMIT 1 
FOR UPDATE SKIP LOCKED;
```
Concurrent worker threads immediately skip rows locked by sibling workers, guaranteeing zero lock contention and strict FIFO order.

### 7.3 The 60-Second Watchdog Thread (Stale Job Auto-Recovery)
If a container restarts, crashes, or deploys while an evaluation is in progress:
- A dedicated daemon watchdog thread wakes every 60 seconds.
- Scans for jobs stuck in `PROCESSING` whose `updated_at` timestamp is older than 5 minutes:
  ```sql
  SELECT submission_id FROM evaluation_queue 
  WHERE status = 'PROCESSING' AND updated_at < NOW() - INTERVAL '5 minutes';
  ```
- Recovers stranded jobs back to `QUEUED`, increments `retry_count`, and logs an administrative alert.

### 7.4 429 Quota Exhaustion Circuit Breaker & Exponential Backoff
When Google Gemini returns HTTP 429 across all configured API keys:
- The worker does **not** fail the job.
- Resets submission status to `QUEUED` with `retry_count = 0`.
- Enforces a mandatory **30-second cooldown period** before resuming polling, allowing remote API rate-limit windows to reset without burning retry allowances.

### 7.5 Lifespan Management & Memory Bounds (Render vs. VPS Sizing)

| Deployment Environment | RAM Allocation | CPU Allocation | Max Worker Threads | Concurrency Ceiling | Operational Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Render Free / Starter** | 512 MB | 0.1–0.5 vCPU | **1 Worker** | ~30 Concurrent Students | Base memory ~178MB. Single PyMuPDF rasterization adds ~120MB. Safe from OOM with 1 worker thread. |
| **GigaNodes EPYC VPS** | 2,048 MB (2 GB) | 1.0 Dedicated EPYC | **4 Workers** | 100+ Concurrent Students | Ample RAM runway. 4 parallel workers grade ~60–80 papers/hour overnight. |
| **Dedicated Node** | 4,096 MB (4 GB) | 2.0 Dedicated EPYC | **6 Workers** | 250+ Concurrent Students | Enterprise campus capacity. Simultaneous batch evaluation across multiple exams. |

### 7.6 Asynchronous Background Notification & Audit Pruning
- **Table Size Maintenance:** Whenever notifications are generated, an asynchronous background thread runs `prune_all_notifications(keep_limit=50)`.
- Using SQL window functions, it deletes notifications older than the top 50 per user, preventing bloated auth tables.
- Expired password reset tokens and 7-day soft-deleted institutes past recovery windows are swept and purged automatically.

---

## 8. The AI Engine & Google Gemini Multimodal Pipeline

### 8.1 Zero-OCR Multimodal Vision Paradigm
Traditional evaluation architectures run images through OCR engines (Tesseract, cloud vision APIs) and send extracted raw text to an LLM. This leads to severe errors: cursive handwriting is garbled, mathematical formulas ($x^2, \int, \frac{a}{b}$) lose formatting, diagrams are lost, and crossed-out work is treated as valid text.
- **PaperGrade AI Paradigm:** The raw multi-page scanned PDF is passed directly to Google Gemini's multimodal vision encoder alongside the official Question Paper and Approved Rubric.
- The model evaluates handwriting, crossed-out attempts, margin calculations, and circuit/geometry diagrams simultaneously with full visual context.

### 8.2 The 100-Key Scanning Failover Ring & Active Pool Rotation
Google AI Studio free and Tier-1 developer tiers enforce strict RPM and RPD limits. To ensure uninterrupted batch grading:
- **100-Key Scanning:** At startup, `backend/app/gemini/client.py` scans environment variables for up to 100 API keys:
  `GEMINI_API_KEY`, `GEMINI_API_KEY_2`, ..., `GEMINI_API_KEY_100`, plus comma-separated `GEMINI_API_KEYS`.
- **5-Key Active Pool:** Populates an active pool of up to 5 concurrent keys.
- **Pacing Delay:** Enforces a minimum **4.12-second inter-request delay** between calls on the same key to respect per-minute quotas.
- **Two-Tier Cooldown Tracking:**
  1. *Key-Model Cooldown (120 seconds):* If Key A hits 429 on `gemini-3.8-flash`, it enters a 120s cooldown for that specific model while remaining eligible for fallback models.
  2. *Global Model Cooldown (180 seconds):* If all active keys hit 429 on a model, that model enters a 180s global backoff.
- **GCP Paid Service Account Cascade:** If configured, enterprise service account credentials (`GOOGLE_APPLICATION_CREDENTIALS`) act as the final failover tier.

### 8.3 3-Tier Full-Flash Model Cascade (3.8 $\to$ 3.6 $\to$ 3.5)
If the primary model exhausts quota across all keys, evaluation cascades down a strict 3-tier full-Flash hierarchy:
$$\text{gemini-3.8-flash (Primary)} \longrightarrow \text{gemini-3.6-flash (Tier 1 Fallback)} \longrightarrow \text{gemini-3.5-flash (Tier 2 Fallback)}$$

- **Strict Exclusion of Lite/1.5 Models for Primary Grading:** Lightweight models (`gemini-3.5-flash-lite`, `gemini-1.5-flash`) are **strictly prohibited** from full paper evaluation. Empirical tests proved they suffer from hallucinated arithmetic, missed cursive derivations, and 8,192 token truncation.
- **Targeted Single-Answer Re-eval:** For isolated question re-evaluations (`POST /api/grading/answers/{sub_id}/{ans_id}/reevaluate`), where the payload is small, the client uses `gemini-3.5-flash-lite` (falling back to `gemini-3.5-flash`) with `max_output_tokens = 8192`.

### 8.4 The 65,536 Output Token Ceiling & Thinking Budget Allocation
- **Thinking Budget:** Configured with `thinking_budget = 2048` tokens (`GEMINI_THINKING_BUDGET`), providing sufficient reasoning capacity for multi-step physics and mathematics derivations without exhausting token windows.
- **The 65,536 Token Ceiling:** Full-paper multimodal evaluations evaluating 15–20 questions across 8–10 pages require 9,000 to 14,000 output tokens. Standard 8,192 token ceilings cause silent mid-JSON truncation. The grading engine enforces `max_output_tokens = 65536` with `temperature = 0.0`.

### 8.5 The Self-Healing JSON Stream Buffer (`_repair_truncated_json`)
If a network interruption truncates a JSON response stream, the client repairs it before Pydantic parsing:
```python
def _repair_truncated_json(json_str: str) -> str:
    # Tracks quotation marks, ignores escaped quotes, auto-closes unclosed brackets and braces
```
This self-healing buffer prevents discarding already-evaluated questions if a network drop clips trailing closing braces.

### 8.6 Anti-Parametric Invariant & Prompt Engineering Standards
In `backend/app/gemini/prompts.py`:
- **Anti-Parametric Rule:** The AI is strictly forbidden from completing equations, balancing chemical reactions, or quoting literature from its pre-trained parametric memory. Every mark awarded must be explicitly grounded in the student's physical handwriting.
- **Diagram Serialization:** Diagrams are transcribed into structured semantic tags:
  `[DIAGRAM: TITLE | SKETCH_QUALITY | COMPONENTS_DRAWN | LABELS_PRESENT]`
- **Cursive Disambiguation:** Ambiguous characters (e.g. $v$ vs. $\nu$, $u$ vs. $\mu$, $5$ vs. $S$) are resolved using surrounding dimensional analysis and context.

### 8.7 Deterministic Evidence Kill-Switch & Discrete 0.5-Mark Allocation Rule
- **Deterministic Evidence Kill-Switch:** If the model outputs an ungrounded evidence quote or prefixes an evaluation with `FAIL:`, the backend invariants engine automatically overrides awarded marks to **0.0**, regardless of LLM rationale.
- **Discrete 0.5-Mark Step Rule:** Criteria marks must strictly follow clean 0.5 increments:
  $$\text{Criterion Marks} \in \{0.5, \; 1.0, \; 1.5, \; 2.0, \; 2.5, \; \dots\}$$
  Arbitrary decimals ($0.33, 0.75$) are prohibited.
- **MCQ Single-Criterion Rule:** Multiple Choice Questions evaluate exactly ONE criterion worth full marks: *"Correct option selection"*. Intermediate solving steps are never graded for MCQs, protecting students who solve mentally.

---

## 9. Deterministic Grading & Invariants Engine

### 9.1 Score Clamping & Bottom-Up Criterion Summation
Large language models must never be trusted to calculate arithmetic totals. The [`GradingService`](file:///c:/Users/tarun/Desktop/Github%20Repo/PaperGrade%20AI/backend/app/services/grading_service.py) enforces absolute mathematical determinism:
1. Every individual criterion score is clamped:
   $$\text{awarded\_crit}_i = \max(0.0, \; \min(\text{crit}_i.\text{awarded}, \; \text{crit}_i.\text{max}))$$
2. The question score is summed bottom-up from validated criteria:
   $$\text{raw\_question\_score} = \sum_{i=1}^{M} \text{awarded\_crit}_i$$
3. The question score is clamped against question maximum marks:
   $$\text{final\_question\_score} = \min(\text{raw\_question\_score}, \; \text{question}.\text{max\_marks})$$
4. The exam total is computed strictly by summing validated, non-extra question scores.

### 9.2 The "Best-of-N" Section Option Limit Algorithm
When exams offer optional questions (e.g. *"Section B: Attempt any 4 out of 6 questions"*):

```mermaid
flowchart TD
    Start(["Section B: Attempt Any 4 of 6 Questions"]) --> GradeAll["Evaluate All 6 Attempted Questions"]
    GradeAll --> SortDesc["Sort Answers Descending by Score: score DESC, confidence DESC"]
    SortDesc --> SplitTop{"Rank &le; 4?"}
    SplitTop -->|"Yes (Top 4 Scores)"| KeepValid["Set is_extra_attempt = 0<br/>Count toward Total Exam Marks"]
    SplitTop -->|"No (Excess 2 Lower Scores)"| FlagExtra["Set is_extra_attempt = 1<br/>Exclude from Total Exam Marks<br/>Tag: 'Optional choice: Best-of-N selected top score'"]
    KeepValid --> SumTotals["Deterministically Recompute Exam Total"]
    FlagExtra --> SumTotals
```

1. All attempted questions in the section are graded independently.
2. Answers are sorted descending by awarded score, then by grading confidence.
3. The top $K$ questions ($K = \text{section.attempt\_limit}$) are flagged `is_extra_attempt = 0` and included in the total.
4. Excess lower-scoring attempts are flagged `is_extra_attempt = 1` and excluded from the total, with explanatory notes displayed on the student report card.

### 9.3 PyMuPDF Vector Annotation Overlay Engine
Rather than rasterizing PDF pages into images and drawing pixels (which balloons file sizes and blurs text), PaperGrade AI applies native **vector annotations**:
- Coordinates $[0, 1]$ are scaled to PDF 72 DPI point dimensions:
  $$\text{rect} = \text{fitz.Rect}(x \cdot W, \; y \cdot H, \; (x + w) \cdot W, \; (y + h) \cdot H)$$
- Vector bounding rectangles are drawn with semantic color coding:
  - 🟢 **Full Marks:** Emerald (`#10B981`)
  - 🟡 **Partial Marks:** Amber (`#F59E0B`)
  - 🔴 **Zero Marks:** Rose (`#EF4444`)
  - 🟣 **Needs Review:** Violet (`#8B5CF6`)
- Vector score badges (e.g. `[Q3: 4.5/5.0]`) and verification stamps are injected directly into the PDF vector layer.

### 9.4 Immutable Teacher Audit Trail Engine
Whenever a teacher modifies marks or adjusts bounding box coordinates:
- The backend writes an immutable entry into `audit_logs` recording:
  $$\{\text{user\_id}, \; \text{submission\_id}, \; \text{question\_id}, \; \text{old\_value}, \; \text{new\_value}, \; \text{reason}, \; \text{timestamp}\}$$
- Sets `submissions.is_manual_override = 1`.
- Total marks and percentages are recomputed deterministically.

### 9.5 7-Day Revaluation Dispute Lifecycle (100% Zero-AI Human Resolution)
- **7-Day Window:** Students can file revaluation disputes on specific questions within 7 calendar days of results publication (`now <= published_at + 7 days`).
- **100% Zero-AI Human Resolution:** Revaluation appeals are resolved exclusively by human teachers and branch managers. AI models are strictly prohibited from resolving student disputes, ensuring pedagogical fairness and accountability.

---

## 10. Unified Hybrid Storage Tier & 15-Day TTL Lifecycle

### 10.1 Storage Abstraction Hierarchy (`storage.py`)
Exposes an abstract interface `StorageService` with runtime implementations:
- **`LocalStorageService`:** Saves assets to `backend/data/` for local development and offline environments.
- **`CloudinaryStorageService`:** Production CDN for direct HMAC signed uploads, asset storage, and pre-signed download streaming.
- **`CloudflareR2StorageService`:** High-throughput S3-compatible object storage via Cloudflare R2 credentials.

### 10.2 15-Day Retention Policy (TTL) Architecture & FERPA/GDPR Compliance
To comply with student privacy policies (FERPA/GDPR) and keep cloud storage expenditure near zero:
- **Retention Clock:** `retention_expires_at = graded_at + 15 days`. Unassessed submissions in queue do not decay.
- **Purge Scope:** After 15 days post-grading, raw scanned PDFs, canonical PDFs, and vector-annotated PDFs are unlinked from disk and permanently destroyed in Cloudinary / R2 via Admin APIs.
- **Database Space Recovery:** Bounding box coordinates in `answer_regions` are deleted.
- **Tombstone Flag:** `submissions.is_document_purged` is set to `1`, and path columns are nulled.

### 10.3 Scheduled Storage Purge Daemon Mechanics

```mermaid
sequenceDiagram
    autonumber
    participant Daemon as Scheduled Purge Daemon
    participant API as POST /api/v1/submissions/purge-expired
    participant DB as Supabase PostgreSQL (:6543)
    participant CDN as Cloudinary / Cloudflare R2
    participant Disk as Local SSD Buffer

    Daemon->>API: Trigger Expired Purge Sweep
    API->>DB: SELECT id, canonical_pdf_path, annotated_pdf_path FROM submissions WHERE retention_expires_at <= NOW() AND is_document_purged = 0
    DB-->>API: Return Expired Submissions List
    loop For Each Expired Submission
        API->>Disk: os.remove(cached_pdf)
        API->>CDN: uploader.destroy(public_id, resource_type='raw')
        API->>DB: DELETE FROM answer_regions WHERE answer_id IN (SELECT id FROM answers WHERE submission_id = sub.id)
        API->>DB: UPDATE submissions SET is_document_purged = 1, canonical_pdf_path = NULL, annotated_pdf_path = NULL WHERE id = sub.id
    end
    API-->>Daemon: Return Purge Summary (Purged Submissions, Reclaimed Bytes)
```

### 10.4 Permanent Academic Grade & Longitudinal BI Archiving
Document purge does **not** equal data loss. Numerical scores, criteria breakdowns, and audit trails remain permanently archived:

| Data Entity | Storage Tier | Retention Lifespan | Academic & BI Purpose |
| :--- | :--- | :--- | :--- |
| **Raw Scanned PDF** | Cloudinary / Local Disk | **15 Days (TTL)** | Temporary grading evidence & student review. |
| **Annotated Graded PDF** | Cloudinary / Local Disk | **15 Days (TTL)** | Downloadable vector report card during verification window. |
| **Numerical Marks & Totals** | PostgreSQL (`submissions`) | **Permanent ($\infty$)** | Official student academic records, GPA calculation, transcripts. |
| **Question-by-Question Breakdown**| PostgreSQL (`answers`) | **Permanent ($\infty$)** | Item difficulty analysis, curriculum defect identification. |
| **Criteria Breakdown & Rubrics** | PostgreSQL (`criterion_scores`)| **Permanent ($\infty$)** | Pedagogical scoring distribution, rubric fairness auditing. |
| **Teacher Override Trail** | PostgreSQL (`audit_logs`) | **Permanent ($\infty$)** | Immutable accountability audit logs for institutional compliance. |
| **LLM Inference Telemetry** | PostgreSQL (`api_usage_events`)| **Permanent ($\infty$)** | Historical cost tracking, latency percentiles, quota planning. |

---

## 11. Database Architecture & Schema Specification

### 11.1 Supabase PostgreSQL 15 & PgBouncer Transaction Mode (`:6543`)
PaperGrade AI runs on Supabase PostgreSQL 15 accessed via PgBouncer / Supavisor connection pooling in **Transaction Mode (:6543)**:
- **Port Rewriting:** Connection strings pointing to port `:5432` are automatically rewritten to `:6543` in `config.py` and `session.py`.
- **Transaction Mode Rationale:** Physical database connections are held only for the microsecond duration of an active transaction, preventing connection pool exhaustion during concurrent student traffic bursts.

### 11.2 SQLAlchemy 2.0 ORM Configuration & Health Verification
In `backend/app/db/session.py`:
```python
engine_kwargs = {
    "pool_pre_ping": True,         # Heartbeat query before checkout prevents stale connection errors
    "pool_recycle": 300,          # Recycles connections every 5 minutes to prevent remote drops
    "pool_size": 15,              # Base steady-state connection pool
    "max_overflow": 25,           # Burst capacity up to 40 concurrent checked-out connections
    "pool_reset_on_return": "rollback",  # Guarantees no connections linger in idle in transaction
}
```

### 11.3 Atomic Sequence Roll Number Generation (`C25-BVI-001`)
Roll numbers follow an immutable institutional format:
$$\text{Roll Number} = \{\text{INSTITUTE\_CODE}\}-\{\text{BRANCH\_CODE}\}-\{\text{SEQUENCE:03d}\}$$
- **Row-Lock Allocation:** In `backend/app/routers/tenancy.py`, sequences are allocated using PostgreSQL row locks (`SELECT ... FOR UPDATE` on `branches`).
- **Batch Code Deprecation:** The redundant manual `code` column was removed from `batches` via migration, eliminating human entry errors.

### 11.4 Complete Schema Inventory (24 Verified Database Tables)

```mermaid
erDiagram
    institutes ||--o{ branches : "operates"
    institutes ||--o{ subjects : "defines"
    branches ||--o{ batches : "manages"
    branches ||--o{ users : "employs"
    batches ||--o{ students : "enrolls"
    users ||--o| students : "claims identity"
    branches ||--o{ exams : "schedules"
    exams ||--o{ exam_batches : "scopes"
    batches ||--o{ exam_batches : "assigned"
    exams ||--o{ submission_windows : "opens"
    exams ||--o{ rubric_versions : "revises"
    exams ||--o{ submissions : "receives"
    submissions ||--o{ answers : "contains"
    answers ||--o{ criterion_scores : "evaluates"
    answers ||--o{ answer_regions : "localizes"
    submissions ||--o{ evaluation_queue : "enqueues"
    submissions ||--o{ revaluation_requests : "appeals"
    users ||--o{ notifications : "receives"
    users ||--o{ push_subscriptions : "registers"
    users ||--o{ password_reset_requests : "submits"
    users ||--o{ technical_reports : "files"
    users ||--o{ audit_logs : "records"
    exams ||--o{ api_usage_events : "tracks"
    users ||--o| user_quota_settings : "configures"
    exams ||--o{ experiment_benchmarks : "benchmarks"

    institutes {
        string id PK
        string name
        string code UK
        json subjects
        int is_deleted
    }
    branches {
        string id PK
        string institute_id FK
        string name
        string code
        int last_roll_sequence
    }
    users {
        string id PK
        string institute_id FK
        string branch_id FK
        string email UK
        string role
        string password_hash
    }
    students {
        string id PK
        string batch_id FK
        string user_id FK
        string student_id_num UK
        string roll_number UK
        int account_claimed
    }
    exams {
        string id PK
        string institute_id FK
        string branch_id FK
        string title
        string subject
        float total_marks
        string lifecycle_status
        int is_published
        timestamp retention_expires_at
    }
    submissions {
        string id PK
        string exam_id FK
        string student_id FK
        string roll_number
        string status
        float total_awarded_marks
        int is_document_purged
        timestamp retention_expires_at
    }
    answers {
        string id PK
        string submission_id FK
        string question_id
        float awarded_marks
        float max_marks
        int is_extra_attempt
    }
    criterion_scores {
        string id PK
        string answer_id FK
        string criterion_id
        float awarded_marks
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
```

### 11.5 Performance Index Inventory & N+1 Query Elimination

#### Index Master Reference Table

| Index Identifier | Target Table | Target Columns | Optimized Query Pattern |
| :--- | :--- | :--- | :--- |
| `idx_notif_user_unread` | `notifications` | `user_id, is_read` | Realtime unread badge counts (`WHERE user_id = :u AND is_read = 0`) |
| `idx_notif_user_created` | `notifications` | `user_id, created_at` | Notification drawer chronological sorting (`ORDER BY created_at DESC`) |
| `idx_audit_resource` | `audit_logs` | `resource_type, resource_id` | Audit trail lookup on human grading overrides |
| `idx_submissions_retention`| `submissions` | `is_document_purged, retention_expires_at` | Retention daemon scans for expired submissions |
| `idx_exams_retention` | `exams` | `is_document_purged, retention_expires_at` | Retention daemon scans for expired exam papers |
| `idx_queue_status` | `evaluation_queue` | `status` | Worker FIFO claim query (`WHERE status = 'QUEUED'`) |
| `idx_submissions_exam` | `submissions` | `exam_id` | Marks Ledger batch retrieval (`WHERE exam_id = :e`) |
| `idx_answers_sub` | `answers` | `submission_id` | Fetching all evaluated questions for a paper |
| `idx_regions_ans` | `answer_regions` | `answer_id` | Fetching page coordinate bounding boxes |
| `idx_students_roll_unique`| `students` | `roll_number` (UNIQUE) | Roll number lookup and claim verification |
| `idx_students_batch` | `students` | `batch_id` | Roster queries within a specific batch |
| `idx_pwd_reset_status` | `password_reset_requests` | `status` | Branch Manager pending reset requests |
| `idx_pwd_reset_branch` | `password_reset_requests` | `branch_id` | Filtering resets by campus |
| `idx_tech_rep_status` | `technical_reports` | `status` | Open bug reports dashboard |

#### N+1 Query Elimination in Marks Ledger
In `backend/app/routers/submissions.py` and `backend/app/routers/exams.py`, N+1 queries were replaced with batch array lookups:
```python
sub_ids = [s.id for s in submissions]
if include_answers and sub_ids:
    answers = db.scalars(
        select(Answer).where(Answer.submission_id.in_(sub_ids)).order_by(Answer.question_id.asc())
    ).all()
```
Reduces database round-trips from $N + 1$ queries down to **2 queries for $N$ submissions**.

---

## 12. Exhaustive Backend API Router Catalog

The backend exposes 50+ endpoints across 13 dedicated routers plus root routes:

| Router | Method | Endpoint Path | Access Level | Description & Architectural Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **Auth** | `POST` | `/api/v1/auth/login` | Public | Authenticates root admins, directors, managers, students; returns signed 7-day JWT. |
| | `POST` | `/api/v1/auth/claim-account` | Public | Student claims roster account using roll-number and PIN. |
| | `GET` | `/api/v1/auth/me` | Authenticated | Fetches user profile, branch affiliation, and role permissions. |
| | `POST` | `/api/v1/auth/forgot-password/request`| Public | Initiates student password reset request for manager review. |
| | `GET` | `/api/v1/auth/password-resets` | Manager/Director| Lists pending student password reset requests within branch. |
| | `POST` | `/api/v1/auth/password-resets/{id}/approve` | Manager/Director| Approves reset request and generates one-time cryptographic token. |
| | `POST` | `/api/v1/auth/password-resets/{id}/reject` | Manager/Director| Rejects reset request with audit comment. |
| | `POST` | `/api/v1/auth/create-user` | Root Admin | Provisions staff or director account. |
| | `GET` | `/api/v1/auth/users` | Admin/Director | Lists registered users filtered by branch and role. |
| **Tenancy** | `GET` | `/api/v1/tenancy/institutes` | Root Admin | Lists all enrolled educational institutions. |
| | `POST` | `/api/v1/tenancy/institutes` | Root Admin | Provisions a new institutional tenant. |
| | `DELETE`| `/api/v1/tenancy/institutes/{id}` | Root Admin | Soft-deletes institute with 7-day recovery grace period. |
| | `POST` | `/api/v1/tenancy/institutes/{id}/restore` | Root Admin | Restores soft-deleted institute within 7-day grace window. |
| | `GET` | `/api/v1/tenancy/branches` | Authenticated | Lists campuses (scoped by institute or user permissions). |
| | `POST` | `/api/v1/tenancy/branches` | Root Admin | Provisions a new campus with unique code and geographical city. |
| | `GET` | `/api/v1/tenancy/subjects` | Authenticated | Lists academic courses and subjects scoped to branch. |
| | `POST` | `/api/v1/tenancy/institutes/{id}/subjects` | Root Admin | Adds an official course/subject definition. |
| | `GET` | `/api/v1/tenancy/batches` | Manager/Director| Lists academic student cohorts within branch. |
| | `POST` | `/api/v1/tenancy/batches` | Branch Manager | Provisions an academic cohort/batch within a branch. |
| | `DELETE`| `/api/v1/tenancy/batches/{id}` | Branch Manager | Deletes academic batch. |
| | `GET` | `/api/v1/tenancy/batches/{id}/students` | Manager/Director| Roster lookup of enrolled students in a cohort. |
| | `POST` | `/api/v1/tenancy/batches/{id}/students` | Branch Manager | Enrolls a student with atomic roll sequence. |
| | `POST` | `/api/v1/tenancy/batches/{id}/import-students`| Branch Manager | Bulk Excel roster ingestion with atomic row-locked sequence allocation. |
| **Exams** | `GET` | `/api/v1/exams` | Manager/Director| Lists exams scoped to user branch; batch-loads window status. |
| | `POST` | `/api/v1/exams` | Manager/Director| Creates exam record; uploads question paper. |
| | `GET` | `/api/v1/exams/{id}` | Manager/Director| Fetches exam details, rubric versions, and evaluation stats. |
| | `DELETE`| `/api/v1/exams/{id}` | Root Admin | **Cascade Deletion:** Permanently purges exam, rubrics, submissions, and CDN assets. |
| | `POST` | `/api/v1/exams/{id}/answer-key` | Root Admin | Uploads official answer key PDF. |
| | `POST` | `/api/v1/exams/{id}/question-paper` | Manager/Director| Replaces master question paper PDF. |
| | `POST` | `/api/v1/exams/{id}/generate-rubric` | Root Admin | Executes agentic Gemini multimodal rubric extraction. |
| | `POST` | `/api/v1/exams/{id}/rubric/approve` | Root Admin | Locks approved rubric version as immutable evaluation contract. |
| | `POST` | `/api/v1/exams/{id}/rubric/unlock` | Root Admin | Unlocks rubric back to draft state for modifications. |
| | `POST` | `/api/v1/exams/{id}/start-evaluation` | Manager/Director| Enqueues submissions for batch grading (enforces window closed & approved rubric). |
| | `POST` | `/api/v1/exams/{id}/publish` | Manager/Director| Publishes finalized results to student portal. |
| | `GET` | `/api/v1/exams/{id}/evaluation-status` | Manager/Director| High-speed (<5ms) polling endpoint for real-time progress bar. |
| | `GET` | `/api/v1/exams/{id}/rankings` | Manager/Director| Calculates and returns class rankings and score distribution. |
| **Submissions** | `GET` | `/api/v1/submissions` | Authenticated | Lists submissions with role-based filtering. |
| | `POST` | `/api/v1/submissions/{exam_id}/request-upload` | Student | Step 1 of direct upload: verifies window, returns HMAC signed CDN ticket. |
| | `POST` | `/api/v1/submissions/{exam_id}/confirm-upload` | Student | Step 3 of direct upload: validates PDF bounds via PyMuPDF, registers submission. |
| | `POST` | `/api/v1/submissions/{exam_id}/upload-single` | Authenticated | Fallback multipart upload path for restricted firewalls. |
| | `GET` | `/api/v1/submissions/{id}` | Authenticated | Returns detailed evaluation breakdown with criteria, bboxes, and transcripts. |
| | `GET` | `/api/v1/submissions/{id}/pdf` | Authenticated | Returns HTTP 307 redirect to pre-signed CDN download URL (0 server RAM). |
| | `GET` | `/api/v1/submissions/exam/{exam_id}` | Manager/Director| Lists all student submissions enrolled under an exam. |
| | `POST` | `/api/v1/submissions/purge-expired` | Root Admin | Triggers scheduled sweep of the 15-day storage retention purge engine. |
| **Grading** | `POST` | `/api/grading/answers/{sub_id}/{ans_id}/edit` | Teacher/Manager | Records manual override, updates scores, and logs immutable audit trail. |
| | `POST` | `/api/grading/answers/{sub_id}/{ans_id}/reevaluate` | Teacher/Manager | Targeted second-opinion re-evaluation of answer crop via Gemini Flash-Lite. |
| | `POST` | `/api/grading/regions/{sub_id}/{reg_id}/edit` | Teacher/Manager | Updates bounding box coordinates after dragging handles on canvas. |
| | `POST` | `/api/grading/regions/{sub_id}/add` | Teacher/Manager | Manually registers a new answer bounding box. |
| | `DELETE`| `/api/grading/regions/{sub_id}/{reg_id}` | Teacher/Manager | Deletes an invalid bounding box region. |
| | `GET` | `/api/grading/page-image/{sub_id}/{page_num}`| Authenticated | Serves full 150 DPI raster image of a student answer page. |
| **Windows** | `POST` | `/api/v1/windows/{exam_id}/open` | Branch Manager | Opens timed submission window with defined duration and grace period. |
| | `GET` | `/api/v1/windows/{exam_id}/status` | Authenticated | Returns exact seconds remaining for real-time PWA countdown timers. |
| | `POST` | `/api/v1/windows/{exam_id}/close` | Branch Manager | Administratively hard-closes window, cutting off student uploads. |
| | `POST` | `/api/v1/windows/{exam_id}/reopen` | Branch Manager | Reopens window for unsubmitted students with audit justification. |
| **Revaluation** | `POST` | `/api/v1/revaluation/{sub_id}/request` | Student | Files 7-day student revaluation dispute on specific questions. |
| | `GET` | `/api/v1/revaluation/my-requests` | Student | Lists student's own filed revaluation disputes and statuses. |
| | `GET` | `/api/v1/revaluation/requests` | Manager/Director| Lists pending revaluation requests across campus. |
| | `POST` | `/api/v1/revaluation/{request_id}/resolve` | Manager/Director| Resolves dispute (100% Zero-AI human decision). |
| **Exports** | `GET` | `/api/exports/pdf/{sub_id}` | Authenticated | Streams PyMuPDF vector-annotated PDF (blocked for students until published). |
| | `GET` | `/api/exports/marks-csv/{exam_id}` | Manager/Director| Generates complete class scorecard in CSV format. |
| | `GET` | `/api/exports/batch-zip/{batch_id}` | Manager/Director| Compiles all graded PDFs for an entire batch into a downloadable ZIP archive. |
| **Notifications**| `GET` | `/api/v1/notifications` | Authenticated | Fetches user in-app notifications. |
| | `POST` | `/api/v1/notifications/push-subscription` | Authenticated | Registers client device VAPID push token for browser push delivery. |
| | `POST` | `/api/v1/notifications/push-unsubscribe` | Authenticated | Revokes registered browser push subscription. |
| | `GET` | `/api/v1/notifications/vapid-public-key` | Authenticated | Returns VAPID public key for browser push registration. |
| | `POST` | `/api/v1/notifications/{id}/read` | Authenticated | Marks a single notification as read. |
| | `POST` | `/api/v1/notifications/read-all` | Authenticated | Marks all user notifications as read in one batch. |
| **Reports** | `POST` | `/api/v1/reports` | Authenticated | Submits technical issue report with up to 3 screenshots. |
| | `GET` | `/api/v1/reports/my` | Authenticated | Lists issues submitted by current user. |
| | `GET` | `/api/v1/reports` | Root Admin | Administrative ticket triage queue across all tenants. |
| | `PATCH` | `/api/v1/reports/{report_id}` | Root Admin | Updates ticket status (`IN_PROGRESS`, `RESOLVED`) with admin notes. |
| **Students** | `GET` | `/api/v1/student/portal-state` | Student | Unified high-performance endpoint with sub-0.2ms ETag 304 fast path. |
| | `GET` | `/api/v1/student/past-submissions` | Student | Paginated past exams endpoint for student portal infinite scrolling. |
| **Analytics** | `GET` | `/api/v1/analytics/telemetry` | Root Admin | Real-time token consumption, latency percentiles ($P_{50}, P_{95}$), and costs. |
| | `POST` | `/api/v1/analytics/quota-settings` | Root Admin | Updates custom RPM, TPM, and RPD limits per user. |
| | `POST` | `/api/v1/analytics/benchmark` | Root Admin | Triggers model benchmarking run on test exams. |
| **Storage** | `GET` | `/api/v1/storage/download` | Authenticated | Generates pre-signed GET URL for direct-from-storage asset retrieval. |
| | `PUT` | `/api/v1/storage/upload` | Authenticated | Direct pre-signed upload handler for large binary objects. |

---

## 13. Frontend Architecture & Next.js 14 App Router

### 13.1 Directory Topology & Layout Hierarchy
```
frontend/src/
├── app/
│   ├── layout.tsx                 # Root layout with font, theme & global context mesh
│   ├── not-found.tsx              # Custom Grace-Mark 404 experience ("No Negative Marking Here")
│   ├── page.tsx                   # Interactive landing page with role-based auto-redirect
│   ├── admin/
│   │   ├── tenancy/               # Tenancy infrastructure manager (institutes, branches, subjects)
│   │   └── reports/               # Technical issue reports and triage dashboard
│   ├── auth/
│   │   ├── login/                 # Unified credentials login portal (7-day persistent JWT)
│   │   └── claim/                 # Student roll-number & PIN account claim
│   ├── batches/                   # Academic cohort management & Excel roster enrollment
│   ├── exams/                     # Exam creation wizard & management hub
│   │   ├── new/                   # Multi-step exam creation flow
│   │   └── [id]/                  # Exam overview, key upload, window controls & submissions
│   │       └── rubric/            # Interactive rubric studio & version approval
│   ├── grading/                   # Teacher inspection hub
│   │   └── [id]/                  # Spatial Document Canvas & inspection studio (by submission ID)
│   ├── marks/                     # Class scorecards & export studio
│   ├── results/[id]/              # Published exam rankings & student performance distributions
│   ├── student/
│   │   ├── portal/                # Mobile-optimized PWA student dashboard & live countdown timers
│   │   ├── exams/                 # Active student exam listing
│   │   └── submissions/[id]/      # Student view of evaluated paper & 7-day dispute filing
│   ├── revaluation/               # Revaluation dispute management interface
│   ├── notifications/             # Full-page notification history
│   └── analytics/                 # Telemetry dashboards, token charts, cost calculators
├── components/
│   ├── DocumentViewer.tsx         # Spatial Document Canvas with 8-handle bbox resize
│   ├── ClippedAnswerCrop.tsx      # Zero-network client-side question cropping via canvas/CSS
│   ├── PdfPageView.tsx            # High-DPI canvas streaming with LRU cache integration
│   ├── GradingModal.tsx           # Teacher verification, rubric breakdown & override studio
│   ├── RubricEditor.tsx           # Interactive rubric point editor & approval controls
│   ├── MarksTable.tsx             # Sortable student scorecard table with review badges
│   ├── NotificationDrawer.tsx     # Sliding notification center with Web Audio chime engine
│   ├── ExamRankedTable.tsx        # Published exam class rankings table
│   ├── ReportIssueModal.tsx       # Multi-screenshot technical issue reporter
│   ├── ServiceWorkerRegister.tsx  # PWA service worker & closed-app push interceptor
│   └── ui/                        # Apple-style micro-steppers, selects, and atomic skeletons
├── lib/
│   ├── api.ts                     # 50KB Exhaustive typed API client
│   ├── pdfAssembler.ts            # Client-side document downscaling and canonical PDF assembly
│   ├── pdfCache.ts                # Bounded LRU PDF document and page canvas cache
│   ├── queryKeys.ts               # Centralized TanStack React Query key factory
│   ├── QueryProvider.tsx          # Hydration boundary & query client provider
│   ├── TenantContext.tsx          # Multi-branch switching context for directors
│   ├── ThemeContext.tsx           # Notion-grade Warm Paper / Obsidian Paper theme provider
│   └── supabase.ts                # Supabase Realtime client initialization
└── workers/
    └── pdfWorker.ts               # Background Web Worker for 1920px image compression & assembly
```

### 13.2 Client-Side Context Mesh
The application mounts a unified context hierarchy wrapping the Next.js App Router:
- **`QueryProvider` (`@tanstack/react-query`):** Manages server-state caching with `staleTime = 30000` (30 seconds), deduplicating in-flight requests.
- **`TenantContext`:** Tracks current `instituteId` and `branchId`, providing the Director campus switcher.
- **`NotificationContext`:** Coordinates Supabase Realtime WebSockets, Page Visibility adaptive polling, and VAPID push subscriptions.
- **`ThemeContext`:** Persists dark/light preferences.

### 13.3 Notion-Grade Design System & Apple Micro-Tactility
- **Notion-Grade Warm/Obsidian Aesthetic:**
  - *Warm Paper Mode (`#f6f5f4`):* Soft, editorial background reducing glare during prolonged grading sessions.
  - *Obsidian Paper Mode (`#191919`):* Deep neutral dark mode preserving contrast without harsh blue light.
- **Apple-Style Curved-Glass Tactility:** Interactive components (`AppleSelect.tsx`, `AppleNumberStepper.tsx`) feature accelerated micro-stepping, spring physics transitions, and subtle borders (`border-black/[0.08]` / `border-white/[0.08]`).

### 13.4 Spatial Document Canvas (`DocumentViewer.tsx`) & Verification Studio
- **Multi-Touch Pinch-to-Zoom:** Supports 1.0x to 3.5x smooth zoom scaling on touch devices.
- **8-Handle Bounding Box Resize:** Evaluators can drag corners or edges (`nw`, `n`, `ne`, `e`, `se`, `s`, `sw`, `w`) to adjust answer bounding box coordinates directly on the canvas.
- **Real-Time Score Recalculation:** Adjusting a criterion mark in `GradingModal.tsx` immediately updates the teacher score stamp and recalculates total marks deterministically.

### 13.5 Student Mobile PWA & iOS Safari Banner Integration
- **Closed-App PWA:** Configured via `manifest.json` and service worker (`sw.js`) for full home-screen installation on Android and iOS.
- **iOS Safari Install Banner:** Detects non-standalone iOS Safari sessions (`navigator.standalone === false`) and displays step-by-step instructions (*"Tap Share $\to$ Add to Home Screen"*).

### 13.6 Academic Grace-Mark 404 Experience (`not-found.tsx`)
A custom branded 404 experience featuring academic Easter eggs:
- *"No Negative Marking Here (404 — Question Not in Syllabus)"*
- Displays a mock answer sheet with a teacher's red-ink stamp awarding `+0.5 / 0 Grace Marks` for exploring uncharted routes, with a one-click button returning students to their exam portal.

---

## 14. Observability, Telemetry & Quota Feasibility

### 14.1 Real-Time Token Telemetry & Paid-Equivalent Cost Tracking
Every multimodal Gemini call writes an immutable record to `api_usage_events`:
- **Logged Fields:** `model_name`, `input_tokens`, `output_tokens`, `thinking_tokens`, `cached_tokens`, `duration_ms`, `http_status`, `success`, `estimated_cost_usd`.
- **Post-Validation Logging:** Telemetry logs `success = True` **only after Pydantic schema validation succeeds**. If the API returns HTTP 200 but deserialization fails, it is recorded as `success = False` to prevent false observability metrics.
- **Cost Formulation (Gemini 3.8 Flash Pricing):**
  $$\text{Cost} = \frac{\text{Input Tokens}}{10^6} \times \$0.10 + \frac{\text{Output Tokens}}{10^6} \times \$0.40$$

### 14.2 Latency Percentiles ($P_{50}, P_{95}$)
Based on 500+ production evaluations across 5–10 page handwritten answer scripts:
- **$P_{50}$ Latency:** **14.2 seconds** per submission (including visual analysis, handwriting transcription, bounding box localization, and criterion evaluation).
- **$P_{95}$ Latency:** **26.8 seconds** per submission (observed on dense 10-page papers with multiple diagrams and derivations).

### 14.3 Mathematical Batch Concurrency & Capacity Modeling

#### 41-Student Single Batch Analysis (Borivali Campus `br_c25_acbdd4d8`)
- **Ingestion Window (< 8:00 PM IST):**
  - All 41 students pre-authenticated via 7-day JWT tokens (0 bcrypt hashing operations).
  - All 41 canonical PDFs uploaded directly to Cloud CDN edge (0 bytes server RAM).
  - Backend processes 41 `request-upload` and 41 `confirm-upload` calls over a 3-minute window (~0.45 req/sec).
  - Result: **0% server CPU spike, 0 MB memory buffer, 100% submission success.**
- **Overnight Batch Grading ($\ge$ 8:00 PM IST):**
  - 41 papers graded sequentially by `PersistentQueueWorker`.
  - Pacing delay: 4.12s between calls. Average paper grading duration: ~18 seconds.
  - Total batch grading duration:
    $$41 \times (18\text{s} + 4.12\text{s}) \approx 907\text{ seconds (15.1 minutes)}$$
  - Result: Complete batch graded before 8:30 PM IST with zero 429 quota exhaustion.

---

## 15. DevOps, Deployment & Operations Runbook

### 15.1 Environment Configuration Matrix (`.env`)

```ini
# ==============================================================================
# ENVIRONMENT & GENERAL
# ==============================================================================
ENVIRONMENT=production
DEBUG=False
SECRET_KEY=generate_a_64_char_cryptographically_secure_random_key

# ==============================================================================
# DATABASE (SUPABASE POSTGRESQL TRANSACTION POOLER :6543)
# ==============================================================================
# Must use transaction pooler port 6543, not session port 5432
DATABASE_URL=postgresql://postgres.xxx:password@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
DB_POOL_SIZE=15
DB_MAX_OVERFLOW=25
DB_POOL_RECYCLE=300

# ==============================================================================
# GOOGLE GEMINI MULTI-KEY FAILOVER RING (UP TO 100 KEYS)
# ==============================================================================
GEMINI_API_KEY=AIzaSy...key1
GEMINI_API_KEY_2=AIzaSy...key2
GEMINI_API_KEY_3=AIzaSy...key3
GEMINI_API_KEY_4=AIzaSy...key4
GEMINI_API_KEY_5=AIzaSy...key5
# Or comma-separated list:
# GEMINI_API_KEYS=key1,key2,key3,key4,key5

GEMINI_PRIMARY_MODEL=gemini-3.8-flash
GEMINI_FALLBACK_MODELS=gemini-3.6-flash,gemini-3.5-flash
GEMINI_REEVAL_MODEL=gemini-3.5-flash-lite
GEMINI_THINKING_BUDGET=2048
GEMINI_MAX_OUTPUT_TOKENS=65536
MAX_EVALUATION_WORKERS=1

# ==============================================================================
# CLOUD OBJECT STORAGE (CLOUDINARY / CLOUDFLARE R2)
# ==============================================================================
STORAGE_BACKEND=cloudinary

# Cloudinary CDN Configuration
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Cloudflare R2 Alternative Configuration
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=papergrade-assets
R2_PUBLIC_URL=https://pub-xxx.r2.dev

# ==============================================================================
# SUBMISSION WINDOWS & RETENTION POLICY
# ==============================================================================
MAX_UPLOAD_SIZE_MB=7
MAX_PAGE_COUNT=15
WINDOW_DURATION_MINUTES=30
GRACE_PERIOD_MINUTES=2
REVALUATION_WINDOW_DAYS=7
SUBMISSION_RETENTION_DAYS=15

# ==============================================================================
# W3C WEB PUSH (VAPID CRYPTOGRAPHIC KEYS)
# ==============================================================================
VAPID_PUBLIC_KEY=your_p256_public_key
VAPID_PRIVATE_KEY=your_p256_private_key
VAPID_CLAIMS_EMAIL=mailto:admin@papergrade.ai

# ==============================================================================
# SECURITY & JWT (7-DAY EXPIRATION)
# ==============================================================================
JWT_SECRET=super_secret_jwt_signing_key_replace_in_production
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# ==============================================================================
# FRONTEND PUBLIC ENVIRONMENT VARIABLES
# ==============================================================================
NEXT_PUBLIC_API_URL=https://papergrade-ai-al1w.onrender.com
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_p256_public_key
```

### 15.2 Production Deployment Setup

#### Backend (Render Cloud / Docker)
- **Runtime:** Python 3.11+
- **Build Command:** `pip install -r backend/requirements.txt`
- **Start Command:** `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT --workers 1`
  *(Note: Run with 1 Uvicorn worker process so internal threads share the in-memory rate-limiter and claim mutexes without lock contention).*
- **Keep-Alive Monitor:** Ping `https://papergrade-ai-al1w.onrender.com/api/v1/exams` every 5 minutes via UptimeRobot to maintain zero cold starts.

#### Frontend (Vercel Edge)
- **Framework Preset:** Next.js 14 (App Router)
- **Root Directory:** `frontend`
- **Build Command:** `npm run build`

---

### 15.3 Emergency Troubleshooting Playbooks

#### Playbook 1: Submission Window Upload Failure / Network Block
- **Symptom:** Students encounter upload network errors when submitting answer sheets.
- **Root Cause:** College Wi-Fi firewall blocks `api.cloudinary.com` direct uploads.
- **Resolution:**
  1. The client automatically falls back to `POST /api/v1/submissions/{exam_id}/upload-single`.
  2. If client remains blocked, verify student is on an active cellular network.
  3. Ensure active submission window has not expired or been administratively hard-closed.

#### Playbook 2: Google Gemini 429 Quota Exhaustion
- **Symptom:** Worker logs report `429 ResourceExhausted` during batch evaluation.
- **Root Cause:** Consecutive heavy multimodal queries exceeded per-minute quota on active keys.
- **Resolution:**
  1. No manual intervention required: the failover ring automatically rotates to the next active key.
  2. If all keys exhaust quota, the worker sleeps for a 30-second cooldown without failing jobs.
  3. To expand throughput, append additional API keys to `GEMINI_API_KEYS` in `.env`.

#### Playbook 3: Stuck Jobs in Evaluation Queue
- **Symptom:** Submissions remain in `status = 'PROCESSING'` after a server redeploy.
- **Root Cause:** Backend process restarted while a worker thread held an active claim.
- **Resolution:**
  1. The automated 60-second watchdog thread automatically recovers jobs older than 5 minutes back to `QUEUED`.
  2. To force immediate recovery via SQL:
     ```sql
     UPDATE submissions SET status = 'QUEUED' WHERE status = 'PROCESSING';
     UPDATE evaluation_queue SET status = 'QUEUED' WHERE status = 'PROCESSING';
     ```

#### Playbook 4: 15-Day Storage Retention Manual Sweep
- **Symptom:** Cloudinary storage usage approaches account limits.
- **Resolution:**
  1. Trigger an immediate manual purge sweep:
     ```bash
     curl -X POST https://papergrade-ai-al1w.onrender.com/api/v1/submissions/purge-expired \
          -H "Authorization: Bearer <ROOT_ADMIN_JWT>"
     ```
  2. The purge daemon unlinks expired PDFs from Cloudinary and deletes `answer_regions` coordinates while keeping numerical scores permanently intact.

---

**© 2026 PaperGrade AI Systems Inc. All rights reserved. Enterprise Assessment Integrity Platform.**
