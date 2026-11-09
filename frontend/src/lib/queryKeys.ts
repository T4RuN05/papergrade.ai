/**
 * Query Key Factory for TanStack React Query
 * Provides strongly-typed, consistent cache keys across the entire application.
 */
export const queryKeys = {
  config: {
    all: () => ["config"] as const,
    vapidKey: () => ["config", "vapidKey"] as const,
  },
  auth: {
    me: () => ["auth", "me"] as const,
  },
  tenancy: {
    all: () => ["tenancy"] as const,
    institutes: () => ["tenancy", "institutes"] as const,
    branches: (instituteId?: string) => ["tenancy", "branches", instituteId || "all"] as const,
    batches: (branchId?: string) => ["tenancy", "batches", branchId || "all"] as const,
    subjects: (branchId?: string, instituteId?: string) =>
      ["tenancy", "subjects", branchId || "all", instituteId || "all"] as const,
  },
  exams: {
    all: () => ["exams"] as const,
    list: (branchId?: string) => ["exams", "list", branchId || "all"] as const,
    detail: (id: string) => ["exams", "detail", id] as const,
    rankings: (id: string) => ["exams", "rankings", id] as const,
    artifactMeta: (id: string, type: string) => ["exams", "artifactMeta", id, type] as const,
  },
  submissions: {
    all: () => ["submissions"] as const,
    list: (examId?: string) => ["submissions", "list", examId || "all"] as const,
    detail: (id: string) => ["submissions", "detail", id] as const,
  },
  notifications: {
    all: () => ["notifications"] as const,
    list: () => ["notifications", "list"] as const,
  },
} as const;
