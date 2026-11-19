"use client";

import { useQuery, useInfiniteQuery, keepPreviousData } from "@tanstack/react-query";
import { api, type WindowStatus } from "@/lib/api";
import type { Exam, Submission, Batch } from "@/lib/types";
import { queryKeys } from "@/lib/queryKeys";

// ============================================================================
// 1. STATIC CONFIGURATION QUERIES
// ============================================================================

/**
 * Static configuration (e.g. VAPID public key) never changes during runtime.
 * staleTime: Infinity ensures it is fetched at most once and cached permanently.
 */
export function useVapidPublicKey() {
  return useQuery({
    queryKey: queryKeys.config.vapidKey(),
    queryFn: () => api.getVapidPublicKey(),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

// ============================================================================
// 2. AUTHENTICATION & IDENTITY QUERIES
// ============================================================================

export function useCurrentUser(forceRefresh = false) {
  return useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: () => api.getMe(forceRefresh),
    staleTime: 60 * 1000,
  });
}

export function useBranchUsers(branchId?: string) {
  return useQuery({
    queryKey: queryKeys.auth.users(branchId),
    queryFn: () => api.listUsers(branchId),
    enabled: Boolean(branchId),
    staleTime: 30 * 1000,
  });
}

// ============================================================================
// 3. TENANCY QUERIES
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

export function useTenancySubjects(branchId?: string, instituteId?: string, forceRefresh = false) {
  return useQuery({
    queryKey: queryKeys.tenancy.subjects(branchId, instituteId),
    queryFn: () => api.listSubjects(branchId, instituteId, forceRefresh),
    staleTime: 60 * 1000,
  });
}

// ============================================================================
// 4. EXAMS & CONDUCTION QUERIES
// ============================================================================

export function useExamsList(branchId?: string) {
  return useQuery({
    queryKey: queryKeys.exams.list(branchId),
    queryFn: () => api.listExams(branchId),
    staleTime: 30 * 1000,
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
    queryKey: ["submissions", "for-exam", examId || "none"],
    queryFn: () => (examId ? api.getSubmissionsForExam(examId) : Promise.resolve([])),
    enabled: Boolean(examId),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

export function useExamRankings(examId: string) {
  return useQuery({
    queryKey: queryKeys.exams.rankings(examId),
    queryFn: () => api.getExamRankings(examId),
    enabled: Boolean(examId),
    staleTime: 15 * 1000,
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
    refetchInterval: isEvalActive ? 3000 : false,
    staleTime: 1000,
  });
}

/**
 * Submission Window Status with 10s Server Background Sync
 */
export function useWindowStatus(examId: string, isActive = true) {
  return useQuery<WindowStatus>({
    queryKey: queryKeys.windows.status(examId),
    queryFn: () => api.getWindowStatus(examId),
    enabled: Boolean(examId),
    refetchInterval: isActive ? 10 * 1000 : false,
    staleTime: 5 * 1000,
  });
}

// ============================================================================
// 5. SUBMISSIONS QUERIES (Shared across Student & Faculty)
// ============================================================================

export function useSubmissionsList(examId?: string, forceRefresh = false) {
  return useQuery<Submission[]>({
    queryKey: queryKeys.submissions.list(examId),
    queryFn: () => api.listSubmissions(examId, forceRefresh),
    staleTime: 15 * 1000,
  });
}

export function useSubmissionDetail(submissionId: string, forceRefresh = false) {
  return useQuery<Submission>({
    queryKey: queryKeys.submissions.detail(submissionId),
    queryFn: () => api.getSubmission(submissionId, forceRefresh),
    enabled: Boolean(submissionId),
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
    staleTime: 15 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 20 * 1000,
    refetchIntervalInBackground: false, // Automatically sleeps polling when tab is hidden
    refetchOnWindowFocus: true, // Immediate ETag revalidation when student returns
  });
}

/**
 * Infinite Query for Student Past Submissions
 * Replaces manual scroll event listeners with declarative cursor pagination.
 */
export function useStudentPastSubmissionsInfinite(filters: {
  search?: string;
  subject?: string;
  status?: string;
}) {
  return useInfiniteQuery({
    queryKey: queryKeys.submissions.studentPastSubmissions(filters),
    queryFn: ({ pageParam = 1 }) =>
      api.getStudentPastSubmissions({
        page: pageParam,
        limit: 5,
        search: filters.search,
        subject: filters.subject,
        status: filters.status,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage: any) => (lastPage?.has_more ? (lastPage.page || 1) + 1 : undefined),
    staleTime: 30 * 1000,
  });
}

// ============================================================================
// 6. BATCHES & STUDENT ROSTER QUERIES
// ============================================================================

export function useBatchDetail(batchId: string) {
  return useQuery<Batch>({
    queryKey: queryKeys.batches.detail(batchId),
    queryFn: () => api.getBatch(batchId),
    enabled: Boolean(batchId),
    staleTime: 30 * 1000,
  });
}

export function useBatchStudents(batchId: string) {
  return useQuery({
    queryKey: queryKeys.batches.students(batchId),
    queryFn: () => api.listStudentsInBatch(batchId),
    enabled: Boolean(batchId),
    staleTime: 30 * 1000,
  });
}

export function usePasswordResets(statusFilter = "PENDING", targetType: "staff" | "student" = "student") {
  return useQuery({
    queryKey: queryKeys.batches.passwordResets(targetType),
    queryFn: () => api.listPasswordResets(statusFilter, targetType),
    staleTime: 15 * 1000,
    refetchInterval: 45 * 1000,
  });
}

// ============================================================================
// 7. GRIEVANCES & REVALUATIONS QUERIES
// ============================================================================

export function useRevaluationsList(examId?: string, branchId?: string) {
  return useQuery({
    queryKey: queryKeys.revaluations.list(branchId),
    queryFn: () => api.listRevaluations(examId, branchId),
    staleTime: 20 * 1000,
  });
}

export function useMyAppeals() {
  return useQuery({
    queryKey: queryKeys.revaluations.myAppeals(),
    queryFn: () => api.getMyRevaluations(),
    staleTime: 20 * 1000,
  });
}

// ============================================================================
// 8. REAL-TIME NOTIFICATIONS QUERY
// ============================================================================

export function useNotificationsQuery() {
  return useQuery({
    queryKey: queryKeys.notifications.list(),
    queryFn: () => api.listNotifications(),
    staleTime: 10 * 1000,
    refetchInterval: 30 * 1000,
  });
}
