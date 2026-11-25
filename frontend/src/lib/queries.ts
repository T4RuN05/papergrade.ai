"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api, type WindowStatus } from "@/lib/api";
import type { Exam, Submission, Batch } from "@/lib/types";
import { queryKeys } from "@/lib/queryKeys";

// ============================================================================
// 1. AUTHENTICATION & IDENTITY QUERIES
// ============================================================================

// ============================================================================
// 2. TENANCY QUERIES
// Stale-while-revalidate caching for instant tenancy selector rendering.
// ============================================================================

export function useTenancyInstitutes(forceRefresh = false) {
  return useQuery({
    queryKey: queryKeys.tenancy.institutes(),
    queryFn: () => api.listInstitutes(forceRefresh),
    staleTime: 60 * 1000,
  });
}

export function useTenancyBranches(instituteId?: string, forceRefresh = false) {
  return useQuery({
    queryKey: queryKeys.tenancy.branches(instituteId),
    queryFn: () => api.listBranches(instituteId, forceRefresh),
    staleTime: 60 * 1000,
  });
}

export function useTenancyBatches(branchId?: string, forceRefresh = false) {
  return useQuery({
    queryKey: queryKeys.tenancy.batches(branchId),
    queryFn: () => api.listBatches(branchId, forceRefresh),
    staleTime: 30 * 1000,
  });
}

// ============================================================================
// 3. EXAMS & CONDUCTION QUERIES
// ============================================================================

export function useExamsList(branchId?: string) {
  return useQuery<Exam[]>({
    queryKey: queryKeys.exams.list(branchId),
    queryFn: () => api.listExams(branchId),
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  });
}

export function useExamDetail(examId: string, forceRefresh = false) {
  return useQuery<Exam>({
    queryKey: queryKeys.exams.detail(examId),
    queryFn: () => api.getExam(examId, forceRefresh),
    enabled: Boolean(examId),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

export function useSubmissionsForExam(examId?: string) {
  return useQuery<Submission[]>({
    queryKey: queryKeys.submissions.forExam(examId),
    queryFn: () => (examId ? api.getSubmissionsForExam(examId) : Promise.resolve([])),
    enabled: Boolean(examId),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

/**
 * Real-time Evaluation Progress Poller
 * Polls status every 3 seconds only while grading queue is actively processing.
 */
export function useExamEvaluationStatus(examId: string, isEvalActive: boolean) {
  return useQuery({
    queryKey: queryKeys.exams.evaluationStatus(examId),
    queryFn: () => api.getExamEvaluationStatus(examId),
    enabled: Boolean(examId) && isEvalActive,
    refetchInterval: () => (isEvalActive ? Math.round(2500 + Math.random() * 1000) : false),
    staleTime: 1000,
  });
}

/**
 * Submission Window Status with Gated Server Background Sync
 * Only polls periodically when the exam is unpublished and the window is currently open.
 */
export function useWindowStatus(examId: string, isPublished = false) {
  return useQuery<WindowStatus>({
    queryKey: queryKeys.windows.status(examId),
    queryFn: () => api.getWindowStatus(examId),
    enabled: Boolean(examId),
    refetchInterval: (query) => {
      if (isPublished) return false;
      return query.state.data?.is_active ? Math.round(8500 + Math.random() * 3000) : false;
    },
    refetchOnWindowFocus: !isPublished,
    staleTime: 5 * 1000,
  });
}

// ============================================================================
// 4. SUBMISSIONS QUERIES (Shared across Student & Faculty)
// ============================================================================

export function useSubmissionsList(examId?: string, forceRefresh = false) {
  return useQuery<Submission[]>({
    queryKey: queryKeys.submissions.list(examId),
    queryFn: () => api.listSubmissions(examId, forceRefresh),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

export function useSubmissionDetail(submissionId: string, forceRefresh = false) {
  return useQuery<Submission>({
    queryKey: queryKeys.submissions.detail(submissionId),
    queryFn: () => api.getSubmission(submissionId, forceRefresh),
    enabled: Boolean(submissionId),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

/**
 * Consolidated Student Portal State Query
 * Leverages weak ETag W/"g-b-u-bucket" caching for sub-0.2ms 304 fast paths.
 */
export function useStudentPortalState() {
  return useQuery({
    queryKey: queryKeys.submissions.studentPortalState(),
    queryFn: () => api.getStudentPortalState(),
    placeholderData: keepPreviousData,
    staleTime: 15 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: () => Math.round(17000 + Math.random() * 6000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

// ============================================================================
// 5. BATCHES & STUDENT ROSTER QUERIES
// ============================================================================

export function useBatchDetail(batchId: string) {
  return useQuery<Batch>({
    queryKey: queryKeys.batches.detail(batchId),
    queryFn: () => api.getBatch(batchId),
    enabled: Boolean(batchId),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

export function useBatchStudents(batchId: string) {
  return useQuery({
    queryKey: queryKeys.batches.students(batchId),
    queryFn: () => api.listStudentsInBatch(batchId),
    enabled: Boolean(batchId),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

export function usePasswordResets(statusFilter = "PENDING", targetType: "staff" | "student" = "student") {
  return useQuery({
    queryKey: queryKeys.batches.passwordResets(targetType),
    queryFn: () => api.listPasswordResets(statusFilter, targetType),
    placeholderData: keepPreviousData,
    staleTime: 15 * 1000,
    refetchInterval: 45 * 1000,
  });
}

// ============================================================================
// 6. GRIEVANCES & REVALUATIONS QUERIES
// ============================================================================

export function useRevaluationsList(examId?: string, branchId?: string) {
  return useQuery({
    queryKey: queryKeys.revaluations.list(branchId),
    queryFn: () => api.listRevaluations(examId, branchId),
    placeholderData: keepPreviousData,
    staleTime: 20 * 1000,
  });
}

export function useMyAppeals() {
  return useQuery({
    queryKey: queryKeys.revaluations.myAppeals(),
    queryFn: () => api.getMyRevaluations(),
    placeholderData: keepPreviousData,
    staleTime: 20 * 1000,
  });
}

// ============================================================================
// 7. TECHNICAL REPORTS QUERY
// ============================================================================

export function useTechnicalReports(statusFilter?: string, roleFilter?: string, branchId?: string) {
  return useQuery({
    queryKey: queryKeys.reports.technical(statusFilter, roleFilter, branchId),
    queryFn: () => api.listTechnicalReports(statusFilter, roleFilter, branchId),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

// ============================================================================
// 8. TELEMETRY & SYSTEM HEALTH QUERIES
// ============================================================================

export function useTelemetryMetrics() {
  return useQuery({
    queryKey: queryKeys.telemetry.usage(),
    queryFn: () => api.getUsageMetrics(),
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  });
}

export function useSystemStatus() {
  return useQuery({
    queryKey: queryKeys.telemetry.systemStatus(),
    queryFn: () => api.getStatus(),
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  });
}

export function useBenchmarks(examId: string) {
  return useQuery({
    queryKey: queryKeys.telemetry.benchmarks(examId),
    queryFn: () => api.getBenchmarks(examId),
    enabled: Boolean(examId),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}
