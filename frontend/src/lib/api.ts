import {
  Exam,
  ExamRubric,
  Submission,
  Batch,
  UsageMetrics,
  BenchmarkSummary,
  GradedAnswer
} from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Auth token storage in browser localStorage
export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("papergrade_jwt");
}

export function setAuthToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("papergrade_jwt", token);
}

export function removeAuthToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("papergrade_jwt");
  clearApiCache();
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();
const inFlightRequests = new Map<string, Promise<any>>();

export function getCached<T>(key: string, ttlMs: number = 30000): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttlMs) {
    memoryCache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCached<T>(key: string, data: T): void {
  memoryCache.set(key, { data, timestamp: Date.now() });
}

export function clearApiCache(keyPrefix?: string): void {
  if (!keyPrefix) {
    memoryCache.clear();
    inFlightRequests.clear();
  } else {
    for (const k of Array.from(memoryCache.keys())) {
      if (k.startsWith(keyPrefix)) {
        memoryCache.delete(k);
      }
    }
    for (const k of Array.from(inFlightRequests.keys())) {
      if (k.startsWith(keyPrefix)) {
        inFlightRequests.delete(k);
      }
    }
  }
}

export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = 30000
): Promise<T> {
  const cached = getCached<T>(key, ttlMs);
  if (cached !== null) {
    return cached;
  }

  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key) as Promise<T>;
  }

  const promise = fetcher()
    .then((data) => {
      setCached(key, data);
      inFlightRequests.delete(key);
      return data;
    })
    .catch((err) => {
      inFlightRequests.delete(key);
      throw err;
    });

  inFlightRequests.set(key, promise);
  return promise;
}

export function getStoredUserPayload(): any | null {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const parsed = JSON.parse(jsonPayload);
    return {
      id: parsed.sub,
      role: parsed.role,
      email: parsed.email,
      full_name: parsed.full_name,
      institute_id: parsed.institute_id,
      branch_id: parsed.branch_id,
    };
  } catch {
    return null;
  }
}

export function getAuthHeaders(): HeadersInit {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function parseErrorDetail(err: any, fallback: string = "Request failed"): string {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  if (typeof err.detail === "string") return err.detail;
  if (Array.isArray(err.detail)) {
    return err.detail
      .map((e: any) => {
        if (typeof e === "string") return e;
        if (e && typeof e === "object") {
          const loc = e.loc ? e.loc.filter((l: any) => l !== "body").join(".") : "";
          const msg = e.msg || e.detail || JSON.stringify(e);
          return loc ? `${loc}: ${msg}` : msg;
        }
        return String(e);
      })
      .join("; ");
  }
  if (err.detail && typeof err.detail === "object") {
    return err.detail.message || err.detail.msg || JSON.stringify(err.detail);
  }
  if (err.message && typeof err.message === "string") return err.message;
  return fallback;
}

export const api = {
  API_BASE,

  // -------------------------------------------------------------
  // Authentication & Identity
  // -------------------------------------------------------------
  async login(credentials: { email?: string; username?: string; password: string } | FormData): Promise<{
    access_token: string;
    token_type: string;
    role: string;
    user_id: string;
    full_name: string;
    user?: any;
  }> {
    let body: any;
    let headers: HeadersInit = {};

    if (credentials instanceof FormData) {
      const email = (credentials.get("email") || credentials.get("username") || "") as string;
      const password = (credentials.get("password") || "") as string;
      body = JSON.stringify({ email, password });
      headers = { "Content-Type": "application/json" };
    } else {
      body = JSON.stringify({
        email: credentials.email || credentials.username,
        password: credentials.password,
      });
      headers = { "Content-Type": "application/json" };
    }

    const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: "POST",
      headers,
      body,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Login failed" }));
      throw new Error(parseErrorDetail(err, "Invalid email or password"));
    }
    const data = await res.json();
    setAuthToken(data.access_token);
    clearApiCache();
    return {
      access_token: data.access_token,
      token_type: data.token_type || "bearer",
      role: data.user?.role || data.role,
      user_id: data.user?.id || data.user_id,
      full_name: data.user?.full_name || data.full_name,
      user: data.user,
    };
  },

  async claimAccount(data: { student_id_num: string; roll_number: string; password: string }): Promise<{ access_token: string; role: string; user_id: string; full_name: string }> {
    const res = await fetch(`${API_BASE}/api/v1/auth/claim-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Claim account failed" }));
      throw new Error(parseErrorDetail(err, "Failed to claim account"));
    }
    const resData = await res.json();
    setAuthToken(resData.access_token);
    return resData;
  },

  async getMe(): Promise<{ id: string; email: string; role: string; full_name: string; roll_number?: string; student_id?: string; branch_id?: string; institute_id?: string }> {
    return fetchWithCache("auth:me", async () => {
      const res = await fetch(`${API_BASE}/api/v1/auth/me`, {
        headers: { ...getAuthHeaders() },
        cache: "no-store",
      });
      if (!res.ok) {
        removeAuthToken();
        throw new Error("Unauthorized");
      }
      return res.json();
    }, 45000); // 45s cache
  },

  logout(): void {
    removeAuthToken();
    clearApiCache();
  },

  // -------------------------------------------------------------
  // Tenancy & Onboarding (Institutes, Branches, Staff, Batches)
  // -------------------------------------------------------------
  async listInstitutes(): Promise<any[]> {
    return fetchWithCache("tenancy:institutes", async () => {
      const res = await fetch(`${API_BASE}/api/v1/tenancy/institutes`, {
        headers: { ...getAuthHeaders() },
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to list institutes");
      return res.json();
    }, 60000); // 60s cache
  },

  async createInstitute(data: { name: string; code: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/tenancy/institutes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to create institute" }));
      throw new Error(parseErrorDetail(err, "Failed to create institute"));
    }
    clearApiCache("tenancy:institutes");
    return res.json();
  },

  async listBranches(instituteId?: string): Promise<any[]> {
    const key = `tenancy:branches:${instituteId || "all"}`;
    return fetchWithCache(key, async () => {
      const url = instituteId
        ? `${API_BASE}/api/v1/tenancy/branches?institute_id=${instituteId}`
        : `${API_BASE}/api/v1/tenancy/branches`;
      const res = await fetch(url, { headers: { ...getAuthHeaders() }, cache: "no-store" });
      if (!res.ok) throw new Error("Failed to list branches");
      return res.json();
    }, 60000); // 60s cache
  },

  async createBranch(data: { institute_id: string; name: string; code: string; city: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/tenancy/branches`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to create branch" }));
      throw new Error(parseErrorDetail(err, "Failed to create branch"));
    }
    clearApiCache("tenancy:branches");
    return res.json();
  },

  async listUsers(role?: string, branchId?: string): Promise<any[]> {
    let url = `${API_BASE}/api/v1/auth/users`;
    const params = new URLSearchParams();
    if (role) params.append("role", role);
    if (branchId) params.append("branch_id", branchId);
    if (params.toString()) url += `?${params.toString()}`;

    const res = await fetch(url, { headers: { ...getAuthHeaders() }, cache: "no-store" });
    if (!res.ok) return [];
    return res.json();
  },

  async createUser(data: {
    email: string;
    password: string;
    full_name: string;
    role: "ROOT_ADMIN" | "BRANCH_MANAGER";
    institute_id?: string;
    branch_id?: string;
  }): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/auth/create-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to create user" }));
      throw new Error(parseErrorDetail(err, "Failed to create user"));
    }
    return res.json();
  },

  async listBatches(branchId?: string): Promise<any[]> {
    const url = branchId
      ? `${API_BASE}/api/v1/tenancy/batches?branch_id=${branchId}`
      : `${API_BASE}/api/v1/tenancy/batches`;
    const res = await fetch(url, { headers: { ...getAuthHeaders() }, cache: "no-store" });
    if (!res.ok) throw new Error("Failed to list batches");
    return res.json();
  },

  async createBatch(data: { branch_id: string; name: string; code: string; academic_year: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/tenancy/batches`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to create batch" }));
      throw new Error(err.detail || "Failed to create batch");
    }
    return res.json();
  },

  async addStudent(batchId: string, data: { roll_number: string; full_name: string; email?: string; phone?: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/tenancy/batches/${batchId}/students`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to add student" }));
      throw new Error(err.detail || "Failed to add student");
    }
    return res.json();
  },

  async importRoster(batchId: string, file: File): Promise<any> {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/api/v1/tenancy/batches/${batchId}/students/import-roster`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to import roster" }));
      throw new Error(err.detail || "Failed to import roster");
    }
    return res.json();
  },

  async deleteBatch(batchId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/tenancy/batches/${batchId}`, {
      method: "DELETE",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to delete batch" }));
      throw new Error(err.detail || "Failed to delete batch");
    }
    return res.json();
  },

  async deleteStudent(batchId: string, studentId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/tenancy/batches/${batchId}/students/${studentId}`, {
      method: "DELETE",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to delete student" }));
      throw new Error(err.detail || "Failed to delete student");
    }
    return res.json();
  },

  async listStudentsInBatch(batchId: string): Promise<any[]> {
    const res = await fetch(`${API_BASE}/api/v1/tenancy/batches/${batchId}/students`, {
      headers: { ...getAuthHeaders() },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return res.json();
  },

  // -------------------------------------------------------------
  // Submission Windows (30-min window, 2-min grace)
  // -------------------------------------------------------------
  async openWindow(examId: string, durationMinutes = 30, graceMinutes = 2): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/windows/${examId}/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ duration_minutes: durationMinutes, grace_minutes: graceMinutes }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to open window" }));
      throw new Error(err.detail || "Failed to open window");
    }
    return res.json();
  },

  async getWindowStatus(examId: string): Promise<{
    exam_id: string;
    is_active: boolean;
    is_in_grace: boolean;
    seconds_remaining: number;
    grace_seconds_remaining: number;
    opened_at: string | null;
    deadline_at: string | null;
    grace_deadline_at: string | null;
    reopen_count: number;
  }> {
    const res = await fetch(`${API_BASE}/api/v1/windows/${examId}/status`, {
      headers: { ...getAuthHeaders() },
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Failed to fetch window status");
    return res.json();
  },

  async reopenWindow(examId: string, data: { duration_minutes: number; reason: string; reopen_scope?: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/windows/${examId}/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to reopen window" }));
      throw new Error(err.detail || "Failed to reopen window");
    }
    return res.json();
  },

  // -------------------------------------------------------------
  // Student Portal State (Consolidated High-Performance Endpoint)
  // -------------------------------------------------------------
  async getStudentPortalState(): Promise<{
    user: any;
    active_exam: any;
    window_status: any;
    exams: any[];
    submissions: any[];
  }> {
    const res = await fetch(`${API_BASE}/api/v1/student/portal-state`, {
      headers: { ...getAuthHeaders() },
      cache: "no-store",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to fetch student portal state" }));
      throw new Error(err.detail || "Failed to fetch student portal state");
    }
    return res.json();
  },

  // -------------------------------------------------------------
  // Submissions & Uploads (Single PDF, Atomic Replacement)
  // -------------------------------------------------------------
  async uploadSingleMultipart(examId: string, formData: FormData): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/submissions/${examId}/upload-single`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to upload answer sheet" }));
      throw new Error(err.detail || "Failed to upload answer sheet");
    }
    return res.json();
  },

  async uploadSubmissions(formData: FormData): Promise<{
    batch_id: string;
    submissions_queued: number;
    submissions: any[];
  }> {
    const res = await fetch(`${API_BASE}/api/submissions/upload`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to upload submissions" }));
      throw new Error(err.detail || "Failed to upload submissions");
    }
    return res.json();
  },

  async getSubmission(id: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/submissions/${id}`, {
      headers: { ...getAuthHeaders() },
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Failed to fetch submission");
    return res.json();
  },

  async listSubmissions(examId?: string): Promise<any[]> {
    const url = examId
      ? `${API_BASE}/api/submissions?exam_id=${examId}`
      : `${API_BASE}/api/submissions`;
    const res = await fetch(url, { headers: { ...getAuthHeaders() }, cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch submissions");
    return res.json();
  },

  // -------------------------------------------------------------
  // Exams & Rubrics
  // -------------------------------------------------------------
  async listExams(branchId?: string): Promise<Exam[]> {
    const query = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : "";
    try {
      const res = await fetch(`${API_BASE}/api/v1/exams${query}`, { headers: { ...getAuthHeaders() }, cache: "no-store" });
      if (res.ok) return await res.json();
      // Fallback to legacy path if needed
      const fallback = await fetch(`${API_BASE}/api/exams${query}`, { headers: { ...getAuthHeaders() }, cache: "no-store" });
      if (fallback.ok) return await fallback.json();
      return [];
    } catch {
      return [];
    }
  },

  async getExam(id: string): Promise<Exam> {
    const res = await fetch(`${API_BASE}/api/v1/exams/${id}`, { headers: { ...getAuthHeaders() }, cache: "no-store" });
    if (!res.ok) {
      const fallback = await fetch(`${API_BASE}/api/exams/${id}`, { headers: { ...getAuthHeaders() }, cache: "no-store" });
      if (!fallback.ok) throw new Error("Failed to fetch exam");
      return fallback.json();
    }
    return res.json();
  },

  async createExam(formData: FormData): Promise<Exam> {
    const res = await fetch(`${API_BASE}/api/v1/exams`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to create exam" }));
      throw new Error(err.detail || "Failed to create exam");
    }
    return res.json();
  },

  async uploadQuestionPaper(examId: string, formData: FormData): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/exams/${examId}/question-paper`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to upload question paper" }));
      throw new Error(err.detail || "Failed to upload question paper");
    }
    return res.json();
  },

  async uploadAnswerKey(examId: string, formData: FormData): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/exams/${examId}/answer-key`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to upload answer key" }));
      throw new Error(err.detail || "Failed to upload answer key");
    }
    return res.json();
  },

  async generateRubric(examId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/exams/${examId}/generate-rubric`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to generate rubric" }));
      throw new Error(err.detail || "Failed to generate rubric");
    }
    return res.json();
  },

  async approveRubric(examId: string, rubricData: ExamRubric): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/exams/${examId}/rubric/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ rubric_data: rubricData }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to approve rubric" }));
      throw new Error(err.detail || "Failed to approve rubric");
    }
    return res.json();
  },

  async unlockRubric(examId: string): Promise<Exam> {
    const res = await fetch(`${API_BASE}/api/exams/${examId}/rubric/unlock`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error("Failed to unlock rubric");
    return res.json();
  },

  async loadSampleExam(): Promise<{ exam_id: string; batch_id: string; message: string }> {
    const res = await fetch(`${API_BASE}/api/exams/load-sample`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error("Failed to load sample exam");
    return res.json();
  },

  async regradeSubmission(submissionId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/grading/regrade/${submissionId}`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error("Failed to regrade submission");
    return res.json();
  },

  async startEvaluation(examId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/exams/${examId}/start-evaluation`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to start evaluation" }));
      throw new Error(err.detail || "Failed to start evaluation");
    }
    return res.json();
  },

  async publishResults(examId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/exams/${examId}/publish-results`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to publish results" }));
      throw new Error(err.detail || "Failed to publish results");
    }
    return res.json();
  },

  // -------------------------------------------------------------
  // Manual Revaluation Desk (100% Human, ZERO AI)
  // -------------------------------------------------------------
  async requestRevaluation(submissionId: string, data: { question_ids: string[]; student_reason: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/revaluation/${submissionId}/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to submit revaluation request" }));
      throw new Error(err.detail || "Failed to submit revaluation request");
    }
    return res.json();
  },

  async getMyRevaluations(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/api/v1/revaluation/my-requests`, {
      headers: { ...getAuthHeaders() },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return res.json();
  },

  async listRevaluations(examId?: string, branchId?: string): Promise<any[]> {
    const params = new URLSearchParams();
    if (examId) params.append("exam_id", examId);
    if (branchId) params.append("branch_id", branchId);
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${API_BASE}/api/v1/revaluation/requests${query}`, {
      headers: { ...getAuthHeaders() },
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Failed to fetch revaluations");
    return res.json();
  },

  async resolveRevaluation(requestId: string, data: {
    decision: "MARKS_REVISED" | "MARKS_UPHELD";
    reviewer_notes: string;
    revised_answers?: Array<{ question_id: string; revised_marks: number; comment: string }>;
  }): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/revaluation/${requestId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to resolve revaluation" }));
      throw new Error(err.detail || "Failed to resolve revaluation");
    }
    return res.json();
  },

  // -------------------------------------------------------------
  // In-App Notifications
  // -------------------------------------------------------------
  async listNotifications(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/api/v1/notifications`, {
      headers: { ...getAuthHeaders() },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return res.json();
  },

  async markNotificationRead(notifId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/notifications/${notifId}/read`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error("Failed to mark notification read");
    return res.json();
  },

  async markAllNotificationsRead(): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/notifications/read-all`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error("Failed to mark all notifications read");
    return res.json();
  },

  // -------------------------------------------------------------
  // System Health & Legacy POC APIs
  // -------------------------------------------------------------
  async getStatus(): Promise<{
    gemini_configured: boolean;
    model: string;
    mode: string;
    total_exams: number;
    total_submissions: number;
    queued_jobs: number;
    total_api_calls_recorded: number;
  }> {
    const res = await fetch(`${API_BASE}/api/status`, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch system status");
    return res.json();
  },

  async getBatch(id: string): Promise<Batch> {
    const res = await fetch(`${API_BASE}/api/batches/${id}`, {
      headers: { ...getAuthHeaders() },
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Failed to fetch batch");
    return res.json();
  },

  async getGradingDetails(submissionId: string): Promise<{
    submission: Submission;
    exam: Exam;
    answers: GradedAnswer[];
    audit_logs: any[];
  }> {
    const res = await fetch(`${API_BASE}/api/grading/${submissionId}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch grading details");
    return res.json();
  },

  async manualEditAnswer(
    submissionId: string,
    answerId: string,
    data: {
      awarded_marks?: number;
      extracted_text?: string;
      grading_rationale?: string;
      question_id?: string;
      subquestion_id?: string;
      needs_review?: boolean;
      reason: string;
      criterion_scores?: Array<{
        criterion_id: string;
        awarded_marks: number;
        evidence?: string;
      }>;
    }
  ): Promise<any> {
    const res = await fetch(`${API_BASE}/api/grading/${submissionId}/answers/${answerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to save manual edit");
    return res.json();
  },

  async editAnswer(submissionId: string, answerId: string, data: any): Promise<any> {
    return this.manualEditAnswer(submissionId, answerId, data);
  },

  async clearSubmissionReview(submissionId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/grading/${submissionId}/clear-review`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to clear review flag" }));
      throw new Error(err.detail || "Failed to clear review flag");
    }
    return res.json();
  },

  async clearExamReviews(examId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/grading/exams/${examId}/clear-all-reviews`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to bulk clear exam review flags" }));
      throw new Error(err.detail || "Failed to bulk clear exam review flags");
    }
    return res.json();
  },

  async editRegion(
    submissionId: string,
    regionId: string,
    data: {
      page_number: number;
      x: number;
      y: number;
      width: number;
      height: number;
      reason?: string;
    }
  ): Promise<any> {
    const res = await fetch(`${API_BASE}/api/grading/regions/${submissionId}/${regionId}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({
        page_number: data.page_number,
        x: data.x,
        y: data.y,
        width: data.width,
        height: data.height,
        reason: data.reason || "Teacher adjusted bounding box",
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to update bounding box region" }));
      throw new Error(err.detail || "Failed to update bounding box region");
    }
    return res.json();
  },

  async getUsageMetrics(examId?: string): Promise<UsageMetrics> {
    const url = examId
      ? `${API_BASE}/api/analytics/usage?exam_id=${examId}`
      : `${API_BASE}/api/analytics/usage`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch usage metrics");
    return res.json();
  },

  async updateQuotaSettings(data: {
    rpm_limit?: number;
    tpm_limit?: number;
    rpd_limit?: number;
  }): Promise<any> {
    const res = await fetch(`${API_BASE}/api/analytics/quota-settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to update quota settings");
    return res.json();
  },

  async recordBenchmark(data: {
    submission_id: string;
    exam_id: string;
    ground_truth_marks: number;
    transcription_accepted: boolean;
    mapping_correct: boolean;
    box_accepted: boolean;
    marks_matched: boolean;
    explanation_sufficient: boolean;
    manual_intervention_required: boolean;
    notes?: string;
  }): Promise<any> {
    const res = await fetch(`${API_BASE}/api/analytics/benchmark`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to record benchmark");
    return res.json();
  },

  async getBenchmarks(examId: string): Promise<BenchmarkSummary> {
    const res = await fetch(`${API_BASE}/api/analytics/benchmarks/${examId}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Failed to fetch benchmarks");
    return res.json();
  },

  // Export URLs
  getAnnotatedPdfUrl(submissionId: string, filename?: string) {
    const clean = submissionId.replace(/\.pdf$/i, "");
    if (filename) {
      const cleanName = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
      return `${API_BASE}/api/exports/pdf/${clean}/${encodeURIComponent(cleanName)}`;
    }
    return `${API_BASE}/api/exports/pdf/${clean}`;
  },

  getBatchZipUrl(batchId: string, filename?: string) {
    const clean = batchId.replace(/\.zip$/i, "");
    if (filename) {
      const cleanName = filename.endsWith(".zip") ? filename : `${filename}.zip`;
      return `${API_BASE}/api/exports/batch-zip/${clean}/${encodeURIComponent(cleanName)}`;
    }
    return `${API_BASE}/api/exports/batch-zip/${clean}`;
  },

  getMarksCsvUrl(examId: string, filename?: string) {
    const clean = examId.replace(/\.csv$/i, "");
    if (filename) {
      const cleanName = filename.endsWith(".csv") ? filename : `${filename}.csv`;
      return `${API_BASE}/api/exports/marks-csv/${clean}/${encodeURIComponent(cleanName)}`;
    }
    return `${API_BASE}/api/exports/marks-csv/${clean}`;
  },

  getPageImageUrl(submissionId: string, pageNum: number) {
    return `${API_BASE}/api/grading/page-image/${submissionId}/${pageNum}`;
  },

  getCropImageUrl(
    submissionId: string,
    answerId: string,
    regionId?: string,
    version?: string | number
  ) {
    const params = new URLSearchParams();
    if (regionId) params.set("region_id", regionId);
    if (version !== undefined && version !== null && version !== "") params.set("v", String(version));
    const qs = params.toString();
    return `${API_BASE}/api/grading/crop/${submissionId}/${answerId}${qs ? `?${qs}` : ""}`;
  },

  getAnswerCropUrl(
    submissionId: string,
    answer?: {
      id: string;
      crop_url?: string | null;
      updated_at?: string;
      _lastUpdated?: number | string;
      regions?: Array<{ id?: string; page_number?: number; x?: number; y?: number; width?: number; height?: number }>;
    } | null,
    regionId?: string
  ): string {
    if (!answer || !submissionId) return "";
    const regList = answer.regions || [];
    const targetReg = regionId ? regList.find((r) => r.id === regionId) || regList[0] : regList[0];
    const coordStr = targetReg
      ? `${targetReg.page_number || 1}_${typeof targetReg.x === "number" ? targetReg.x.toFixed(4) : targetReg.x}_${typeof targetReg.y === "number" ? targetReg.y.toFixed(4) : targetReg.y}_${typeof targetReg.width === "number" ? targetReg.width.toFixed(4) : targetReg.width}_${typeof targetReg.height === "number" ? targetReg.height.toFixed(4) : targetReg.height}`
      : "";
    const v = [
      answer._lastUpdated || "",
      answer.updated_at || "",
      coordStr,
    ].filter(Boolean).join("_");

    let base = answer.crop_url;
    if (base) {
      if (!base.startsWith("http")) {
        base = `${API_BASE}${base}`;
      }
    } else {
      base = `${API_BASE}/api/grading/crop/${submissionId}/${answer.id}`;
    }

    try {
      const urlObj = new URL(base);
      if (regionId && !urlObj.searchParams.has("region_id")) {
        urlObj.searchParams.set("region_id", regionId);
      }
      if (v) {
        urlObj.searchParams.set("v", v);
      }
      return urlObj.toString();
    } catch {
      const delimiter = base.includes("?") ? "&" : "?";
      const regParam = regionId && !base.includes("region_id=") ? `region_id=${encodeURIComponent(regionId)}&` : "";
      return `${base}${delimiter}${regParam}${v ? `v=${encodeURIComponent(v)}` : ""}`;
    }
  },

  async purgeExpiredSubmissions(): Promise<{ scanned_count: number; purged_count: number; purged_submission_ids: string[] }> {
    const res = await fetch(`${API_BASE}/api/v1/submissions/purge-expired`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to purge expired submissions" }));
      throw new Error(parseErrorDetail(err, "Failed to purge expired submissions"));
    }
    return res.json();
  },
};
