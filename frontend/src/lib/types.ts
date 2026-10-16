export interface RubricCriterion {
  criterion_id: string;
  description: string;
  marks: number;
}

export interface ExamSection {
  section_id: string;
  title: string;
  instructions?: string;
  total_questions?: number;
  attempt_limit?: number;
  max_marks: number;
  question_ids?: string[];
}

export interface RubricQuestion {
  question_id: string;
  subquestion_id?: string;
  section_id?: string;
  question_text: string;
  max_marks: number;
  official_answer: string;
  accepted_alternatives?: string[];
  criteria: RubricCriterion[];
  numerical_tolerances?: string;
  grading_notes?: string;
}

export interface ExamRubric {
  exam_title: string;
  subject: string;
  total_marks: number;
  sections?: ExamSection[];
  questions: RubricQuestion[];
}

export interface Exam {
  id: string;
  title: string;
  subject: string;
  total_marks: number;
  question_paper_path?: string;
  answer_key_path?: string;
  status: "DRAFT" | "RUBRIC_APPROVED" | string;
  lifecycle_status?: string;
  is_published?: boolean | number;
  published_at?: string;
  institute_id?: string;
  institute_name?: string;
  institute_code?: string;
  branch_id?: string;
  branch_name?: string;
  branch_code?: string;
  branch_city?: string;
  current_rubric_version_id?: string;
  created_at: string;
  updated_at: string;
  has_approved_rubric?: boolean;
  is_rubric_approved?: boolean | number;
  rubric_version?: {
    id: string;
    version_num: number;
    is_approved: boolean;
    rubric_data: ExamRubric;
    created_at: string;
    approved_at?: string;
  };
}

export interface AnswerRegion {
  id?: string;
  page_number: number;
  x: number; // 0.0 to 1.0
  y: number; // 0.0 to 1.0
  width: number;
  height: number;
  is_manual_override?: boolean;
  crop_url?: string;
  _lastUpdated?: number;
}

export interface CriterionScore {
  id?: string;
  criterion_id: string;
  description: string;
  max_marks: number;
  awarded_marks: number;
  evidence: string;
  is_manual_override?: boolean;
}

export interface GradedAnswer {
  id: string;
  submission_id: string;
  question_id: string;
  subquestion_id?: string;
  section_id?: string;
  is_extra_attempt?: boolean;
  page_number: number;
  extracted_text: string;
  max_marks: number;
  awarded_marks: number;
  grading_rationale: string;
  transcription_uncertainty: number;
  grading_uncertainty: number;
  needs_review: boolean;
  review_reason?: string;
  is_missing: boolean;
  is_manual_override: boolean;
  official_answer?: string;
  question_text?: string;
  rubric_criteria?: RubricCriterion[];
  regions: AnswerRegion[];
  criterion_scores: CriterionScore[];
  has_crop?: boolean;
  crop_url?: string;
  feedback?: string;
  override_reason?: string;
  updated_at?: string;
  _lastUpdated?: number;
  revaluation?: {
    id: string;
    status: "SUBMITTED" | "UNDER_REVIEW" | "RESOLVED" | string;
    decision?: "MARKS_REVISED" | "MARKS_UPHELD" | string | null;
    student_reason?: string;
    reviewer_notes?: string | null;
    requested_at?: string;
    resolved_at?: string | null;
  } | null;
}

export interface AuditLog {
  id: string;
  submission_id: string;
  answer_id?: string;
  field_name: string;
  old_value: string;
  new_value: string;
  reason: string;
  edited_by: string;
  created_at: string;
}

export interface Submission {
  id: string;
  batch_id?: string;
  exam_id: string;
  student_name: string;
  roll_number: string;
  page_count: number;
  status: "UPLOADED" | "QUEUED" | "PROCESSING" | "NEEDS_REVIEW" | "COMPLETED" | "FAILED";
  error_message?: string;
  retry_count: number;
  total_awarded_marks: number;
  max_marks: number;
  percentage: number;
  is_manual_override: boolean;
  reviewed_at?: string;
  publication_status?: string;
  is_published?: boolean;
  graded_at?: string;
  ttl_days?: number;
  retention_expires_at?: string;
  is_document_purged?: boolean;
  purged_at?: string;
  days_remaining?: number;
  seconds_remaining?: number;
  revaluation_days_remaining?: number;
  revaluation_window_open?: boolean;
  storage_notice?: string;
  annotated_pdf_url?: string | null;
  created_at: string;
  updated_at: string;
  answers?: GradedAnswer[];
  missing_answers?: GradedAnswer[];
  audit_logs?: AuditLog[];
  exam?: {
    id: string;
    title: string;
    subject: string;
    total_marks: number;
  };
  rubric?: ExamRubric;
}

export interface Batch {
  id: string;
  exam_id?: string;
  branch_id?: string;
  name: string;
  code?: string;
  academic_year?: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "PARTIALLY_FAILED" | "PAUSED_QUOTA" | string;
  total_submissions: number;
  completed_submissions: number;
  failed_submissions: number;
  created_at: string;
  updated_at: string;
  submissions: {
    id: string;
    student_name: string;
    roll_number: string;
    page_count: number;
    status: string;
    total_awarded_marks: number;
    max_marks: number;
    percentage: number;
    error_message?: string;
    updated_at: string;
  }[];
}

export interface QuotaSettings {
  id: string;
  rpm_limit: number;
  tpm_limit: number;
  rpd_limit: number;
  updated_at: string;
}

export interface BatchProjection {
  batch_size: number;
  total_calls_including_retries: number;
  estimated_retries: number;
  average_case: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost_usd: number;
  };
  conservative_case: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost_usd: number;
  };
  feasibility: {
    status: "FEASIBLE" | "EXCEEDS_DAILY_LIMIT" | "PACING_REQUIRED";
    min_pacing_minutes: number;
    recommended_delay_sec: number;
    daily_quota_consumed_pct: number;
    bottlenecks: string[];
  };
}

export interface UsageMetrics {
  summary: {
    total_requests: number;
    successful_requests: number;
    failed_requests: number;
    retry_count: number;
    retry_rate_pct: number;
    failure_rate_pct: number;
    total_estimated_cost_usd: number;
    pricing_version: string;
  };
  latency: {
    average_ms: number;
    median_ms: number;
    p95_ms: number;
  };
  per_paper_metrics: {
    sample_count: number;
    avg_input_tokens: number;
    median_input_tokens: number;
    avg_output_tokens: number;
    median_output_tokens: number;
    avg_total_tokens: number;
    median_total_tokens: number;
    avg_cost_usd: number;
    p90_cost_usd: number;
  };
  quota_settings: QuotaSettings;
  projections: {
    batch_40: BatchProjection;
    batch_50: BatchProjection;
  };
  recent_events: {
    id: string;
    timestamp: string;
    request_purpose: string;
    model_name: string;
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    duration_ms: number;
    success: number;
    http_status?: number;
    error_code?: string;
    retry_attempt: number;
    estimated_cost_usd?: number;
    is_mock: number;
  }[];
}

export interface BenchmarkSummary {
  sample_size: number;
  transcription_accuracy_pct: number;
  question_mapping_accuracy_pct: number;
  localization_acceptance_pct: number;
  exact_score_agreement_pct: number;
  explanation_sufficiency_pct: number;
  manual_intervention_rate_pct: number;
  records: any[];
}
