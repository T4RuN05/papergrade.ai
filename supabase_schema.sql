-- ====================================================================
-- PaperGrade AI - Supabase PostgreSQL Production Schema
-- Project: wxslwjwlutrcucieossv
-- Execute in: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ====================================================================

-- 1. Institutes Table
CREATE TABLE IF NOT EXISTS institutes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
);

-- 2. Branches Table
CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    institute_id TEXT NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    city TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- 3. Users Table (RBAC: ROOT_ADMIN, BRANCH_MANAGER, STUDENT)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    institute_id TEXT REFERENCES institutes(id) ON DELETE SET NULL,
    branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
    email TEXT UNIQUE,
    role TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    last_login_at TEXT,
    created_at TEXT NOT NULL
);

-- 4. Batches Table
CREATE TABLE IF NOT EXISTS batches (
    id TEXT PRIMARY KEY,
    branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
    exam_id TEXT,
    name TEXT NOT NULL,
    code TEXT NOT NULL DEFAULT '',
    academic_year TEXT NOT NULL DEFAULT '2026',
    status TEXT NOT NULL DEFAULT 'QUEUED',
    total_submissions INTEGER NOT NULL DEFAULT 0,
    completed_submissions INTEGER NOT NULL DEFAULT 0,
    failed_submissions INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 5. Students Table (6-digit ID for account claim)
CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    student_id_num TEXT NOT NULL UNIQUE,
    roll_number TEXT NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    account_claimed INTEGER NOT NULL DEFAULT 0,
    claimed_at TEXT,
    created_at TEXT NOT NULL
);

-- 6. Exams Table
CREATE TABLE IF NOT EXISTS exams (
    id TEXT PRIMARY KEY,
    institute_id TEXT REFERENCES institutes(id) ON DELETE SET NULL,
    branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    total_marks REAL NOT NULL DEFAULT 0.0,
    question_paper_path TEXT,
    answer_key_path TEXT,
    current_rubric_version_id TEXT,
    lifecycle_status TEXT NOT NULL DEFAULT 'DRAFT',
    is_published INTEGER NOT NULL DEFAULT 0,
    published_at TEXT,
    created_by TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 7. Submission Windows Table (30-min window + 2-min grace)
CREATE TABLE IF NOT EXISTS submission_windows (
    id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
    window_number INTEGER NOT NULL DEFAULT 1,
    opened_at TEXT NOT NULL,
    deadline_at TEXT NOT NULL,
    grace_deadline_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    reopen_reason TEXT,
    reopen_scope TEXT DEFAULT 'UNSUBMITTED_ONLY',
    created_by TEXT,
    created_at TEXT NOT NULL
);

-- 8. Rubric Versions Table
CREATE TABLE IF NOT EXISTS rubric_versions (
    id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    version_num INTEGER NOT NULL,
    is_approved INTEGER NOT NULL DEFAULT 0,
    approved_by TEXT,
    approved_at TEXT,
    rubric_data TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- 9. Submissions Table (Single combined PDF per student)
CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    batch_id TEXT REFERENCES batches(id) ON DELETE SET NULL,
    student_id TEXT REFERENCES students(id) ON DELETE SET NULL,
    student_name TEXT NOT NULL,
    roll_number TEXT NOT NULL,
    original_file_path TEXT NOT NULL,
    canonical_pdf_path TEXT NOT NULL,
    annotated_pdf_path TEXT,
    page_count INTEGER NOT NULL DEFAULT 1,
    file_size_bytes INTEGER NOT NULL DEFAULT 0,
    sha256_hash TEXT,
    upload_session_id TEXT,
    submission_status TEXT NOT NULL DEFAULT 'SUBMITTED',
    status TEXT NOT NULL DEFAULT 'UPLOADED',
    publication_status TEXT NOT NULL DEFAULT 'UNPUBLISHED',
    total_awarded_marks REAL NOT NULL DEFAULT 0.0,
    max_marks REAL NOT NULL DEFAULT 0.0,
    percentage REAL NOT NULL DEFAULT 0.0,
    is_manual_override INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    submitted_at TEXT NOT NULL DEFAULT '',
    reviewed_at TEXT,
    graded_at TEXT,
    ttl_days INTEGER NOT NULL DEFAULT 15,
    retention_expires_at TEXT,
    is_document_purged INTEGER NOT NULL DEFAULT 0,
    purged_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 10. Answers Table
CREATE TABLE IF NOT EXISTS answers (
    id TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL,
    subquestion_id TEXT,
    section_id TEXT,
    is_extra_attempt INTEGER NOT NULL DEFAULT 0,
    page_number INTEGER NOT NULL DEFAULT 1,
    extracted_text TEXT NOT NULL DEFAULT '',
    max_marks REAL NOT NULL DEFAULT 0.0,
    awarded_marks REAL NOT NULL DEFAULT 0.0,
    grading_rationale TEXT NOT NULL DEFAULT '',
    transcription_uncertainty REAL NOT NULL DEFAULT 0.0,
    grading_uncertainty REAL NOT NULL DEFAULT 0.0,
    needs_review INTEGER NOT NULL DEFAULT 0,
    review_reason TEXT,
    is_missing INTEGER NOT NULL DEFAULT 0,
    is_manual_override INTEGER NOT NULL DEFAULT 0,
    override_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 11. Answer Regions Table (Bounding box annotations)
CREATE TABLE IF NOT EXISTS answer_regions (
    id TEXT PRIMARY KEY,
    answer_id TEXT NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    width REAL NOT NULL,
    height REAL NOT NULL,
    is_manual_override INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

-- 12. Criterion Scores Table
CREATE TABLE IF NOT EXISTS criterion_scores (
    id TEXT PRIMARY KEY,
    answer_id TEXT NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
    criterion_id TEXT NOT NULL,
    description TEXT NOT NULL,
    max_marks REAL NOT NULL DEFAULT 0.0,
    awarded_marks REAL NOT NULL DEFAULT 0.0,
    evidence TEXT NOT NULL DEFAULT '',
    is_manual_override INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

-- 13. Evaluation Queue Table
CREATE TABLE IF NOT EXISTS evaluation_queue (
    id TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    priority INTEGER NOT NULL DEFAULT 100,
    status TEXT NOT NULL DEFAULT 'QUEUED',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    claimed_by_worker TEXT,
    claimed_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 14. Revaluation Requests Table (Strictly manual 7-day revaluation)
CREATE TABLE IF NOT EXISTS revaluation_requests (
    id TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'SUBMITTED',
    question_ids_json TEXT NOT NULL,
    student_reason TEXT NOT NULL,
    decision TEXT,
    reviewer_notes TEXT,
    resolved_by TEXT,
    requested_at TEXT NOT NULL,
    resolved_at TEXT,
    expires_at TEXT NOT NULL
);

-- 15. In-App Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link_url TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

-- 16. Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    submission_id TEXT,
    answer_id TEXT,
    field_name TEXT,
    old_value TEXT,
    new_value TEXT,
    reason TEXT,
    edited_by TEXT,
    action TEXT DEFAULT 'MANUAL_EDIT',
    resource_type TEXT DEFAULT 'ANSWER',
    resource_id TEXT,
    details_json TEXT,
    ip_address TEXT,
    created_at TEXT NOT NULL
);

-- 17. API Usage Events Table (Telemetry & Cost)
CREATE TABLE IF NOT EXISTS api_usage_events (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    exam_id TEXT,
    batch_id TEXT,
    submission_id TEXT,
    request_purpose TEXT NOT NULL,
    model_name TEXT NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    total_tokens INTEGER,
    thinking_tokens INTEGER,
    cached_tokens INTEGER,
    duration_ms INTEGER NOT NULL,
    page_count INTEGER,
    file_size_bytes INTEGER,
    success INTEGER NOT NULL,
    http_status INTEGER,
    error_code TEXT,
    retry_attempt INTEGER NOT NULL DEFAULT 0,
    estimated_cost_usd REAL,
    pricing_version TEXT NOT NULL,
    is_mock INTEGER NOT NULL DEFAULT 0
);

-- 18. User Quota Settings Table
CREATE TABLE IF NOT EXISTS user_quota_settings (
    id TEXT PRIMARY KEY,
    rpm_limit INTEGER NOT NULL DEFAULT 15,
    tpm_limit INTEGER NOT NULL DEFAULT 1000000,
    rpd_limit INTEGER NOT NULL DEFAULT 1500,
    updated_at TEXT NOT NULL
);

-- 19. Experiment Benchmarks Table
CREATE TABLE IF NOT EXISTS experiment_benchmarks (
    id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    ground_truth_marks REAL,
    ground_truth_answers_json TEXT,
    transcription_accepted INTEGER DEFAULT 1,
    mapping_correct INTEGER DEFAULT 1,
    box_accepted INTEGER DEFAULT 1,
    marks_matched INTEGER DEFAULT 1,
    explanation_sufficient INTEGER DEFAULT 1,
    manual_intervention_required INTEGER DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_students_num ON students(student_id_num);
CREATE INDEX IF NOT EXISTS idx_students_batch ON students(batch_id);
CREATE INDEX IF NOT EXISTS idx_exams_inst ON exams(institute_id);
CREATE INDEX IF NOT EXISTS idx_submissions_exam ON submissions(exam_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_answers_sub ON answers(submission_id);
CREATE INDEX IF NOT EXISTS idx_regions_ans ON answer_regions(answer_id);
CREATE INDEX IF NOT EXISTS idx_queue_status ON evaluation_queue(status);
CREATE INDEX IF NOT EXISTS idx_reval_sub ON revaluation_requests(submission_id);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_type, resource_id);

-- Default Quota Row
INSERT INTO user_quota_settings (id, rpm_limit, tpm_limit, rpd_limit, updated_at)
VALUES ('default', 15, 1000000, 1500, '2026-03-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- Initial Seed: Default Institute, Branch & Root Admin
INSERT INTO institutes (id, name, code, created_at)
VALUES ('inst_default', 'Apex Institute of Technology', 'AIT', '2026-03-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO branches (id, institute_id, name, code, city, created_at)
VALUES ('br_default', 'inst_default', 'Main Campus', 'MAIN', 'Central City', '2026-03-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- Default Root Admin (admin@papergrade.ai / AdminPassword123!)
-- PBKDF2 SHA256 hashed password matching backend/app/services/auth.py
INSERT INTO users (id, institute_id, branch_id, email, role, password_hash, full_name, is_active, created_at)
VALUES (
    'usr_admin_root',
    'inst_default',
    'br_default',
    'admin@papergrade.ai',
    'ROOT_ADMIN',
    '$2b$12$m3gT5VIMxuow6EL51mz/xO7VjfmYfy4zL1t0km3W9NoXtLETFW7OO',
    'System Administrator',
    1,
    '2026-03-01T00:00:00Z'
)
ON CONFLICT (email) DO NOTHING;
