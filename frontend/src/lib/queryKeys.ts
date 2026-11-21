/**
 * Consolidated Enterprise Query Key Factory for PaperGrade AI
 * Single source of truth across Student, Faculty, Academic Ops, and Tenancy domains.
 */
export const queryKeys = {
  // 1. Static Configuration
  config: {
    all: () => ["config"] as const,
    vapidKey: () => ["config", "vapidKey"] as const,
  },

  // 2. Authentication & Identity
  auth: {
    all: () => ["auth"] as const,
    me: () => ["auth", "me"] as const,
    users: (branchId?: string) => ["auth", "users", branchId || "all"] as const,
    staffResets: () => ["auth", "resets", "staff"] as const,
  },

  // 3. Tenancy & Institutional Structure
  tenancy: {
    all: () => ["tenancy"] as const,
    institutes: () => ["tenancy", "institutes"] as const,
    branches: (instituteId?: string) => ["tenancy", "branches", instituteId || "all"] as const,
    batches: (branchId?: string) => ["tenancy", "batches", branchId || "all"] as const,
    subjects: (branchId?: string, instituteId?: string) =>
      ["tenancy", "subjects", branchId || "all", instituteId || "all"] as const,
  },

  // 4. Exams & Conduction
  exams: {
    all: () => ["exams"] as const,
    list: (branchId?: string) => ["exams", "list", branchId || "all"] as const,
    detail: (id: string) => ["exams", "detail", id] as const,
    rubric: (id: string) => ["exams", "rubric", id] as const,
    rankings: (id: string) => ["exams", "rankings", id] as const,
    evaluationStatus: (id: string) => ["exams", "evaluationStatus", id] as const,
    artifactMeta: (id: string, type: "QUESTION_PAPER" | "ANSWER_KEY" | string) =>
      ["exams", "artifactMeta", id, type] as const,
  },

  // 5. Submission Windows
  windows: {
    all: () => ["windows"] as const,
    status: (examId: string) => ["windows", "status", examId] as const,
  },

  // 6. Submissions & Student Evaluations (Shared across Student & Faculty)
  submissions: {
    all: () => ["submissions"] as const,
    list: (examId?: string) => ["submissions", "list", examId || "all"] as const,
    forExam: (examId?: string) => ["submissions", "for-exam", examId || "all"] as const,
    detail: (id: string) => ["submissions", "detail", id] as const,
    studentPortalState: () => ["submissions", "student-portal-state"] as const,
    studentPastSubmissions: (filters: { search?: string; subject?: string; status?: string }) =>
      [
        "submissions",
        "student-past",
        filters.search || "",
        filters.subject || "ALL",
        filters.status || "ALL",
      ] as const,
  },

  // 7. Academic Batches & Student Roster
  batches: {
    all: () => ["batches"] as const,
    list: (branchId?: string) => ["batches", "list", branchId || "all"] as const,
    detail: (id: string) => ["batches", "detail", id] as const,
    students: (batchId: string) => ["batches", "students", batchId] as const,
    passwordResets: (branchId?: string) => ["batches", "passwordResets", branchId || "all"] as const,
  },

  // 8. Grievances & Revaluation Desks
  revaluations: {
    all: () => ["revaluations"] as const,
    list: (branchId?: string) => ["revaluations", "list", branchId || "all"] as const,
    detail: (id: string) => ["revaluations", "detail", id] as const,
    myAppeals: () => ["revaluations", "my-appeals"] as const,
  },

  // 9. Real-Time In-App & WebPush Notifications
  notifications: {
    all: () => ["notifications"] as const,
    list: () => ["notifications", "list"] as const,
  },

  // 10. System Health & Telemetry Metrics
  telemetry: {
    all: () => ["telemetry"] as const,
    systemStatus: () => ["telemetry", "system-status"] as const,
    usage: () => ["telemetry", "usage"] as const,
    benchmarks: (examId: string) => ["telemetry", "benchmarks", examId] as const,
  },

  // 11. Technical Issue Reports & Support
  reports: {
    all: () => ["reports"] as const,
    technical: (statusFilter?: string, roleFilter?: string, branchId?: string) =>
      ["reports", "technical", statusFilter || "ALL", roleFilter || "ALL", branchId || "all"] as const,
  },
} as const;
