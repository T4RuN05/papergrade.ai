"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

/**
 * 1. STATIC CONFIG QUERIES
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

/**
 * 2. TENANCY QUERIES
 * Stale-while-revalidate for fast tenancy selector rendering.
 */
export function useTenancyInstitutes() {
  return useQuery({
    queryKey: queryKeys.tenancy.institutes(),
    queryFn: () => api.listInstitutes(),
    staleTime: 60 * 1000,
  });
}

export function useTenancyBranches(instituteId?: string) {
  return useQuery({
    queryKey: queryKeys.tenancy.branches(instituteId),
    queryFn: () => api.listBranches(instituteId),
    staleTime: 60 * 1000,
  });
}

export function useTenancyBatches(branchId?: string) {
  return useQuery({
    queryKey: queryKeys.tenancy.batches(branchId),
    queryFn: () => api.listBatches(branchId),
    staleTime: 30 * 1000,
  });
}

export function useTenancySubjects(branchId?: string, instituteId?: string) {
  return useQuery({
    queryKey: queryKeys.tenancy.subjects(branchId, instituteId),
    queryFn: () => api.listSubjects(branchId, instituteId),
    staleTime: 60 * 1000,
  });
}

/**
 * 3. EXAMS QUERIES
 * Instant rendering from cache with background freshness checks.
 */
export function useExamsList(branchId?: string) {
  return useQuery({
    queryKey: queryKeys.exams.list(branchId),
    queryFn: () => api.listExams(branchId),
    staleTime: 30 * 1000,
  });
}

export function useExamDetail(examId: string) {
  return useQuery({
    queryKey: queryKeys.exams.detail(examId),
    queryFn: () => api.getExam(examId),
    enabled: Boolean(examId),
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
 * 4. SUBMISSIONS QUERIES
 */
export function useSubmissionsList(examId?: string) {
  return useQuery({
    queryKey: queryKeys.submissions.list(examId),
    queryFn: () => api.listSubmissions(examId),
    staleTime: 15 * 1000,
  });
}

export function useSubmissionDetail(submissionId: string) {
  return useQuery({
    queryKey: queryKeys.submissions.detail(submissionId),
    queryFn: () => api.getSubmission(submissionId),
    enabled: Boolean(submissionId),
    staleTime: 30 * 1000,
  });
}

/**
 * 5. IN-APP NOTIFICATIONS QUERY
 */
export function useNotificationsQuery() {
  return useQuery({
    queryKey: queryKeys.notifications.list(),
    queryFn: () => api.listNotifications(),
    staleTime: 10 * 1000,
    refetchInterval: 30 * 1000,
  });
}
