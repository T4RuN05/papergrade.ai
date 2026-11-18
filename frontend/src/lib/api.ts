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

export function setAuthToken(token: string, user?: any): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("papergrade_jwt", token);
  if (user) {
    setStoredUser(user);
  }
}

export function setStoredUser(user: any): void {
  if (typeof window === "undefined" || !user) return;
  try {
    localStorage.setItem("papergrade_user", JSON.stringify(user));
  } catch {}
}

export function getStoredUser(): any | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("papergrade_user");
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}
  return getStoredUserPayload();
}

export function removeAuthToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("papergrade_jwt");
  localStorage.removeItem("papergrade_user");
  clearApiCache();
  clearPortalStateCache();
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();
const inFlightRequests = new Map<string, Promise<any>>();
let _cachedVapidPublicKey: string | null = null;
let _cachedPortalEtag: string | null = null;
let _cachedPortalState: any = null;

export function clearPortalStateCache(): void {
  _cachedPortalEtag = null;
  _cachedPortalState = null;
}

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
  ttlMs: number = 30000,
  timeoutMs: number = 10000
): Promise<T> {
  const cached = getCached<T>(key, ttlMs);
  if (cached !== null) {
    return cached;
  }

  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key) as Promise<T>;
  }

  // Hard safety timeout so an in-flight request can NEVER freeze the client indefinitely
  let timerId: any = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      inFlightRequests.delete(key);
      reject(new Error(`Request timed out after ${timeoutMs}ms: ${key}`));
    }, timeoutMs);
  });

  const promise = Promise.race([fetcher(), timeoutPromise])
    .then((data) => {
      if (timerId) clearTimeout(timerId);
      setCached(key, data);
      inFlightRequests.delete(key);
      return data;
    })
    .catch((err) => {
      if (timerId) clearTimeout(timerId);
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

export async function safeJson<T = any>(res: Response, fallbackDetail = "Request failed"): Promise<T> {
  let text = "";
  try {
    text = await res.text();
  } catch (err: any) {
    if (!res.ok) {
      throw new Error(`Server returned HTTP ${res.status}: ${res.statusText || fallbackDetail}`);
    }
    throw new Error(`Failed to read response: ${err.message}`);
  }

  if (!text || !text.trim()) {
    if (!res.ok) {
      throw new Error(`Server returned HTTP ${res.status}: ${res.statusText || fallbackDetail}`);
    }
    return {} as T;
  }

  try {
    const data = JSON.parse(text);
    if (!res.ok) {
      throw new Error(parseErrorDetail(data, `Server returned HTTP ${res.status}: ${res.statusText || fallbackDetail}`));
    }
    return data as T;
  } catch (parseErr: any) {
    if (!res.ok) {
      const cleanSnippet = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);
      throw new Error(`Server returned HTTP ${res.status}: ${cleanSnippet || res.statusText || fallbackDetail}`);
    }
    throw new Error(`Invalid JSON received from server: ${parseErr.message}`);
  }
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

    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers,
      body,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Login failed" }));
      throw new Error(parseErrorDetail(err, "Invalid email or password"));
    }
    const data = await res.json();
    const userPayload = data.user || {
      id: data.user_id,
      role: data.role,
      full_name: data.full_name,
      institute_id: data.institute_id,
      branch_id: data.branch_id,
    };
    setAuthToken(data.access_token, userPayload);
    clearApiCache();
    return {
      access_token: data.access_token,
      token_type: data.token_type || "bearer",
      role: data.user?.role || data.role,
      user_id: data.user?.id || data.user_id,
      id: data.user?.id || data.user_id,
      full_name: data.user?.full_name || data.full_name,
      institute_id: data.user?.institute_id || data.institute_id,
      branch_id: data.user?.branch_id || data.branch_id,
      user: data.user,
      ...(data.user || {}),
    };
  },

  async claimAccount(data: { roll_number: string; password: string; student_id_num?: string }): Promise<{ access_token: string; role: string; user_id: string; full_name: string }> {
    const res = await fetch(`${API_BASE}/api/auth/claim-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Claim account failed" }));
      throw new Error(parseErrorDetail(err, "Failed to claim account"));
    }
    const resData = await res.json();
    setAuthToken(resData.access_token, {
      id: resData.user_id,
      role: resData.role,
      full_name: resData.full_name,
    });
    return resData;
  },

  async getMe(): Promise<{ id: string; email: string; role: string; full_name: string; roll_number?: string; student_id?: string; branch_id?: string; institute_id?: string; has_changed_password?: number }> {
    return fetchWithCache("auth:me", async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/me`, {
          headers: { ...getAuthHeaders() },
          cache: "no-store",
        });
        if (res.status === 401) {
          removeAuthToken();
          throw new Error("Unauthorized");
        }
        if (!res.ok) {
          // Do not wipe token on 502/503/504 or temporary backend restarts!
          const existing = getStoredUser();
          if (existing) return existing;
          throw new Error(`Server temporarily unavailable (${res.status})`);
        }
        const meData = await res.json();
        setStoredUser(meData);
        return meData;
      } catch (err: any) {
        if (err.message === "Unauthorized") throw err;
        const existing = getStoredUser();
        if (existing) return existing;
        throw err;
      }
    }, 45000); // 45s cache
  },

  logout(): void {
    removeAuthToken();
    clearApiCache();
  },

  // -------------------------------------------------------------
  // Student Password Reset Flow (Branch Manager Approval)
  // -------------------------------------------------------------
  async requestPasswordReset(identifier: string): Promise<{
    status: string;
    request_id: string;
    session_secret?: string;
    request_status: string;
    message: string;
    student_name?: string;
    roll_number?: string;
    is_staff?: boolean;
    user_role?: string;
  }> {
    const res = await fetch(`${API_BASE}/api/auth/forgot-password/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to submit reset request" }));
      throw new Error(parseErrorDetail(err, "Failed to submit reset request"));
    }
    return res.json();
  },

  async getPasswordResetStatus(requestId: string, sessionSecret?: string | null): Promise<{
    request_id: string;
    status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED" | "EXPIRED";
    student_name?: string;
    roll_number?: string;
    is_staff?: boolean;
    user_role?: string;
    requested_at?: string;
    approved_at?: string;
    reset_token?: string;
  }> {
    const query = sessionSecret ? `?session_secret=${encodeURIComponent(sessionSecret)}` : "";
    const res = await fetch(`${API_BASE}/api/auth/forgot-password/status/${requestId}${query}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to check reset status" }));
      throw new Error(parseErrorDetail(err, "Failed to check reset status"));
    }
    return res.json();
  },

  async completePasswordReset(data: {
    request_id: string;
    reset_token: string;
    new_password: string;
  }): Promise<{ status: string; message: string }> {
    const res = await fetch(`${API_BASE}/api/auth/forgot-password/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to complete password reset" }));
      throw new Error(parseErrorDetail(err, "Failed to complete password reset"));
    }
    return res.json();
  },

  async changePassword(data: { current_password: string; new_password: string }): Promise<{ status: string; message: string }> {
    const res = await fetch(`${API_BASE}/api/auth/change-password`, {
      method: "POST",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to change password" }));
      throw new Error(parseErrorDetail(err, "Failed to change password"));
    }
    return res.json();
  },

  async listPasswordResets(statusFilter?: string, targetType?: "staff" | "student"): Promise<any[]> {
    const params = new URLSearchParams();
    if (statusFilter) params.append("status_filter", statusFilter);
    if (targetType) params.append("target_type", targetType);
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${API_BASE}/api/auth/password-resets${query}`, {
      headers: { ...getAuthHeaders() },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return res.json();
  },

  async approvePasswordReset(requestId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/auth/password-resets/${requestId}/approve`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to approve password reset" }));
      throw new Error(parseErrorDetail(err, "Failed to approve password reset"));
    }
    return res.json();
  },

  async rejectPasswordReset(requestId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/auth/password-resets/${requestId}/reject`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to reject password reset" }));
      throw new Error(parseErrorDetail(err, "Failed to reject password reset"));
    }
    return res.json();
  },

  // -------------------------------------------------------------
  // Tenancy & Onboarding (Institutes, Branches, Staff, Batches)
  // -------------------------------------------------------------
  async listInstitutes(): Promise<any[]> {
    return fetchWithCache("tenancy:institutes", async () => {
      const res = await fetch(`${API_BASE}/api/tenancy/institutes`, {
        headers: { ...getAuthHeaders() },
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to list institutes");
      return res.json();
    }, 60000); // 60s cache
  },

  async createInstitute(data: { name: string; code: string; subjects?: string[] }): Promise<any> {
    const res = await fetch(`${API_BASE}/api/tenancy/institutes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to create institute" }));
      throw new Error(parseErrorDetail(err, "Failed to create institute"));
    }
    clearApiCache("tenancy:institutes");
    clearApiCache("tenancy:subjects");
    return res.json();
  },

  async listSubjects(branchId?: string, instituteId?: string): Promise<string[]> {
    const params = new URLSearchParams();
    if (branchId) params.append("branch_id", branchId);
    if (instituteId) params.append("institute_id", instituteId);
    const query = params.toString() ? `?${params.toString()}` : "";
    const key = `tenancy:subjects:${branchId || ""}:${instituteId || ""}`;
    return fetchWithCache(key, async () => {
      const res = await fetch(`${API_BASE}/api/tenancy/subjects${query}`, {
        headers: { ...getAuthHeaders() },
        cache: "no-store",
      });
      if (!res.ok) return ["Physics", "Chemistry", "Maths", "Biology"];
      const data = await res.json();
      return Array.isArray(data) ? data : ["Physics", "Chemistry", "Maths", "Biology"];
    }, 30000);
  },

  async addInstituteSubjects(instituteId: string, subjects: string[]): Promise<any> {
    const res = await fetch(`${API_BASE}/api/tenancy/institutes/${instituteId}/subjects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ subjects }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to add subjects" }));
      throw new Error(parseErrorDetail(err, "Failed to add subjects"));
    }
    clearApiCache("tenancy:institutes");
    clearApiCache("tenancy:subjects");
    return res.json();
  },

  async deleteInstitute(instituteId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/tenancy/institutes/${instituteId}`, {
      method: "DELETE",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to delete institute" }));
      throw new Error(parseErrorDetail(err, "Failed to delete institute"));
    }
    clearApiCache("tenancy:institutes");
    clearApiCache("tenancy:branches");
    clearApiCache("tenancy:batches");
    clearApiCache("tenancy:subjects");
    clearApiCache("exams:list");
    return res.json();
  },

  async listBranches(instituteId?: string): Promise<any[]> {
    const key = `tenancy:branches:${instituteId || "all"}`;
    return fetchWithCache(key, async () => {
      const url = instituteId
        ? `${API_BASE}/api/tenancy/branches?institute_id=${instituteId}`
        : `${API_BASE}/api/tenancy/branches`;
      const res = await fetch(url, { headers: { ...getAuthHeaders() }, cache: "no-store" });
      if (!res.ok) throw new Error("Failed to list branches");
      return res.json();
    }, 60000); // 60s cache
  },

  async createBranch(data: { institute_id: string; name: string; code: string; city: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/api/tenancy/branches`, {
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
    let url = `${API_BASE}/api/auth/users`;
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
    role: "ROOT_ADMIN" | "INSTITUTE_DIRECTOR" | "BRANCH_MANAGER";
    institute_id?: string;
    branch_id?: string;
  }): Promise<any> {
    const res = await fetch(`${API_BASE}/api/auth/create-user`, {
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

  async updateUser(userId: string, data: {
    email?: string;
    password?: string;
    full_name?: string;
    branch_id?: string;
    institute_id?: string;
    is_active?: number;
  }): Promise<any> {
    const res = await fetch(`${API_BASE}/api/auth/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to update user" }));
      throw new Error(parseErrorDetail(err, "Failed to update user"));
    }
    return res.json();
  },

  async deleteUser(userId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/auth/users/${userId}`, {
      method: "DELETE",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to delete user" }));
      throw new Error(parseErrorDetail(err, "Failed to delete user"));
    }
    return res.json();
  },

  async listBatches(branchId?: string, forceRefresh = false): Promise<any[]> {
    const key = `tenancy:batches:${branchId || "all"}`;
    if (forceRefresh) clearApiCache("tenancy:batches");
    return fetchWithCache(key, async () => {
      const url = branchId
        ? `${API_BASE}/api/tenancy/batches?branch_id=${branchId}`
        : `${API_BASE}/api/tenancy/batches`;
      const res = await fetch(url, { headers: { ...getAuthHeaders() }, cache: "no-store" });
      if (!res.ok) throw new Error("Failed to list batches");
      return res.json();
    }, 30000); // 30s cache with auto-invalidation on create/delete/update
  },

  async createBatch(data: { branch_id: string; name: string; academic_year: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/api/tenancy/batches`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to create batch" }));
      throw new Error(parseErrorDetail(err, "Failed to create batch"));
    }
    clearApiCache("tenancy:batches");
    return res.json();
  },

  async addStudent(batchId: string, data: { roll_number?: string; full_name: string; email?: string; phone?: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/api/tenancy/batches/${batchId}/students`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to add student" }));
      throw new Error(parseErrorDetail(err, "Failed to add student"));
    }
    clearApiCache("tenancy:batches");
    return res.json();
  },

  async importRoster(batchId: string, file: File): Promise<any> {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/api/tenancy/batches/${batchId}/import-students`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to import roster" }));
      throw new Error(parseErrorDetail(err, "Failed to import roster"));
    }
    clearApiCache("tenancy:batches");
    return res.json();
  },

  async deleteBatch(batchId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/tenancy/batches/${batchId}`, {
      method: "DELETE",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to delete batch" }));
      throw new Error(parseErrorDetail(err, "Failed to delete batch"));
    }
    clearApiCache("tenancy:batches");
    return res.json();
  },

  async deleteStudent(batchId: string, studentId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/tenancy/batches/${batchId}/students/${studentId}`, {
      method: "DELETE",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to delete student" }));
      throw new Error(parseErrorDetail(err, "Failed to delete student"));
    }
    clearApiCache("tenancy:batches");
    return res.json();
  },

  async listStudentsInBatch(batchId: string): Promise<any[]> {
    const res = await fetch(`${API_BASE}/api/tenancy/batches/${batchId}/students`, {
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
    const res = await fetch(`${API_BASE}/api/windows/${examId}/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ duration_minutes: Number(durationMinutes), grace_minutes: Number(graceMinutes) }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to open window" }));
      throw new Error(parseErrorDetail(err, "Failed to open window"));
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
    reopen_count?: number;
    closed_at?: string | null;
    seconds_since_closed?: number | null;
    seconds_until_card_expires?: number;
    should_display?: boolean;
    [key: string]: any;
  }> {
    const res = await fetch(`${API_BASE}/api/windows/${examId}/status`, {
      headers: { ...getAuthHeaders() },
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Failed to fetch window status");
    return res.json();
  },

  async reopenWindow(examId: string, data: { duration_minutes?: number; reason?: string; reopen_reason?: string; reopen_scope?: string }): Promise<any> {
    const reasonText = (data.reopen_reason || data.reason || "").trim() || "Reopened by administrator";
    const payload = {
      duration_minutes: data.duration_minutes ? Number(data.duration_minutes) : 30,
      reopen_reason: reasonText,
      reason: reasonText,
      reopen_scope: data.reopen_scope || "UNSUBMITTED_ONLY",
    };
    const res = await fetch(`${API_BASE}/api/windows/${examId}/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to reopen window" }));
      throw new Error(parseErrorDetail(err, "Failed to reopen window"));
    }
    return res.json();
  },

  async extendWindow(examId: string, additionalMinutes: number = 15, reason?: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/windows/${examId}/extend`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ additional_minutes: Number(additionalMinutes), reason: reason || "Extended by teacher" }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to extend window" }));
      throw new Error(parseErrorDetail(err, "Failed to extend window"));
    }
    return res.json();
  },

  async closeWindow(examId: string, reason?: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/windows/${examId}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ reason: reason || "Manually closed by administrator" }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to close window" }));
      throw new Error(parseErrorDetail(err, "Failed to close window"));
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
    active_windows?: Array<{ exam: any; window_status: any }>;
    exams: any[];
    submissions: any[];
  }> {
    const headers = new Headers(getAuthHeaders());
    if (_cachedPortalEtag) {
      headers.set("If-None-Match", _cachedPortalEtag);
    }

    const res = await fetch(`${API_BASE}/api/student/portal-state`, {
      headers,
      cache: "no-store",
    });

    if (res.status === 304 && _cachedPortalState) {
      return _cachedPortalState;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to fetch student portal state" }));
      throw new Error(parseErrorDetail(err, "Failed to fetch student portal state"));
    }

    const etag = res.headers.get("ETag");
    if (etag) {
      _cachedPortalEtag = etag;
    }
    const data = await res.json();
    _cachedPortalState = data;
    return data;
  },

  async getStudentPastSubmissions(params?: {
    page?: number;
    limit?: number;
    search?: string;
    subject?: string;
    status?: string;
  }): Promise<{
    items: any[];
    total: number;
    page: number;
    limit: number;
    has_more: boolean;
  }> {
    const sp = new URLSearchParams();
    if (params?.page) sp.set("page", String(params.page));
    if (params?.limit) sp.set("limit", String(params.limit));
    if (params?.search && params.search.trim()) sp.set("search", params.search.trim());
    if (params?.subject && params.subject !== "ALL") sp.set("subject", params.subject);
    if (params?.status && params.status !== "ALL") sp.set("status", params.status);

    const qs = sp.toString() ? `?${sp.toString()}` : "";
    const res = await fetch(`${API_BASE}/api/student/past-submissions${qs}`, {
      headers: { ...getAuthHeaders() },
      cache: "no-store",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to fetch past exam submissions" }));
      throw new Error(parseErrorDetail(err, "Failed to fetch past exam submissions"));
    }
    return res.json();
  },

  // -------------------------------------------------------------
  // Submissions & Uploads (Direct Cloud Storage & Multi-tenant)
  // -------------------------------------------------------------
  async requestPresignedUpload(
    examId: string,
    body: {
      roll_number: string;
      student_name?: string;
      student_id?: string;
      batch_id?: string;
    }
  ): Promise<{
    status: string;
    upload_session_id: string;
    destination_key: string;
    upload_url: string;
    method: string;
    fields?: Record<string, string>;
    headers?: Record<string, string>;
    is_direct_cloud: boolean;
  }> {
    const res = await fetch(`${API_BASE}/api/submissions/${examId}/request-upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to request upload authorization" }));
      throw new Error(parseErrorDetail(err, "Failed to request upload authorization"));
    }
    return res.json();
  },

  async confirmPresignedUpload(
    examId: string,
    body: {
      roll_number: string;
      student_name?: string;
      student_id?: string;
      batch_id?: string;
      storage_key: string;
      upload_session_id?: string;
      sha256_hash?: string;
    }
  ): Promise<{
    status: string;
    submission_id: string;
    student_name: string;
    roll_number: string;
    page_count: number;
    file_size_bytes: number;
    is_replacement: boolean;
    submitted_at: string;
    student_status: string;
  }> {
    const res = await fetch(`${API_BASE}/api/submissions/${examId}/confirm-upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to confirm upload" }));
      throw new Error(parseErrorDetail(err, "Failed to confirm upload"));
    }
    return res.json();
  },

  async uploadSingleMultipart(examId: string, formData: FormData): Promise<any> {
    const res = await fetch(`${API_BASE}/api/submissions/${examId}/upload-single`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to upload answer sheet" }));
      throw new Error(parseErrorDetail(err, "Failed to upload answer sheet"));
    }
    return res.json();
  },

  async getSubmissionsForExam(examId: string): Promise<any[]> {
    const res = await fetch(`${API_BASE}/api/submissions/exam/${examId}`, {
      headers: { ...getAuthHeaders() },
      cache: "no-store",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to fetch exam submissions" }));
      throw new Error(parseErrorDetail(err, "Failed to fetch exam submissions"));
    }
    return res.json();
  },

  async getSubmission(id: string, forceRefresh: boolean = false): Promise<any> {
    const cacheKey = `submissions:detail:${id}`;
    if (forceRefresh) clearApiCache(cacheKey);
    return fetchWithCache(cacheKey, async () => {
      const res = await fetch(`${API_BASE}/api/submissions/${id}`, {
        headers: { ...getAuthHeaders() },
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch submission");
      return res.json();
    }, 60000); // 60s client cache for instant repeat opens
  },

  getSubmissionPdfUrl(submissionId: string): string {
    const token = getAuthToken();
    return `${API_BASE}/api/submissions/${submissionId}/pdf${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  },

  async listSubmissions(examId?: string, forceRefresh: boolean = false): Promise<any[]> {
    const cacheKey = `submissions:list:${examId || "all"}`;
    if (forceRefresh) clearApiCache(cacheKey);
    return fetchWithCache(cacheKey, async () => {
      const url = examId
        ? `${API_BASE}/api/submissions?exam_id=${examId}`
        : `${API_BASE}/api/submissions`;
      const res = await fetch(url, { headers: { ...getAuthHeaders() }, cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch submissions");
      return res.json();
    }, 30000); // 30s cache for fast back-and-forth navigation
  },

  // -------------------------------------------------------------
  // Exams & Rubrics
  // -------------------------------------------------------------
  async listExams(branchId?: string): Promise<Exam[]> {
    const query = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : "";
    try {
      const res = await fetch(`${API_BASE}/api/exams${query}`, { headers: { ...getAuthHeaders() }, cache: "no-store" });
      if (res.ok) return await res.json();
      // Fallback to legacy path if needed
      const fallback = await fetch(`${API_BASE}/api/exams${query}`, { headers: { ...getAuthHeaders() }, cache: "no-store" });
      if (fallback.ok) return await fallback.json();
      return [];
    } catch {
      return [];
    }
  },

  async getExam(id: string, forceRefresh: boolean = false): Promise<Exam> {
    const cacheKey = `exams:detail:${id}`;
    if (forceRefresh) clearApiCache(cacheKey);
    return fetchWithCache(cacheKey, async () => {
      const res = await fetch(`${API_BASE}/api/exams/${id}`, { headers: { ...getAuthHeaders() }, cache: "no-store" });
      if (!res.ok) {
        const fallback = await fetch(`${API_BASE}/api/exams/${id}`, { headers: { ...getAuthHeaders() }, cache: "no-store" });
        if (!fallback.ok) throw new Error("Failed to fetch exam");
        return fallback.json();
      }
      return res.json();
    }, 45000); // 45s cache for fast back-and-forth navigation
  },

  async getExamEvaluationStatus(id: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/exams/${id}/evaluation-status`, {
      headers: { ...getAuthHeaders() },
      cache: "no-store",
    });
    if (!res.ok) {
      const fallback = await fetch(`${API_BASE}/api/exams/${id}/evaluation-status`, {
        headers: { ...getAuthHeaders() },
        cache: "no-store",
      });
      if (!fallback.ok) throw new Error("Failed to fetch exam evaluation status");
      return fallback.json();
    }
    return res.json();
  },

  async getExamRankings(id: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/exams/${id}/rankings`, {
      headers: { ...getAuthHeaders() },
      cache: "no-store",
    });
    if (!res.ok) {
      const fallback = await fetch(`${API_BASE}/api/exams/${id}/rankings`, {
        headers: { ...getAuthHeaders() },
        cache: "no-store",
      });
      if (!fallback.ok) {
        const err = await fallback.json().catch(() => ({}));
        throw new Error(parseErrorDetail(err, "Failed to fetch exam standings"));
      }
      return fallback.json();
    }
    return res.json();
  },

  async createExam(formData: FormData): Promise<Exam> {
    const res = await fetch(`${API_BASE}/api/exams`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to create exam" }));
      throw new Error(parseErrorDetail(err, "Failed to create exam"));
    }
    return res.json();
  },

  async uploadQuestionPaper(examId: string, formData: FormData): Promise<any> {
    const res = await fetch(`${API_BASE}/api/exams/${examId}/question-paper`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to upload question paper" }));
      throw new Error(parseErrorDetail(err, "Failed to upload question paper"));
    }
    clearApiCache("exams:");
    return res.json();
  },

  async uploadAnswerKey(examId: string, formData: FormData): Promise<any> {
    const res = await fetch(`${API_BASE}/api/exams/${examId}/answer-key`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to upload answer key" }));
      throw new Error(parseErrorDetail(err, "Failed to upload answer key"));
    }
    clearApiCache("exams:");
    clearApiCache("submissions:");
    return res.json();
  },

  async getExamArtifactMeta(
    examId: string,
    artifactType: "question-paper" | "answer-key"
  ): Promise<{
    exam_id: string;
    artifact_type: string;
    has_document: boolean;
    is_purged?: boolean;
    page_count: number;
    title: string;
    subject?: string;
    notice?: string;
  }> {
    const token = getAuthToken();
    const res = await fetch(
      `${API_BASE}/api/exams/${examId}/${artifactType}/meta${token ? `?token=${encodeURIComponent(token)}` : ""}`,
      {
        headers: getAuthHeaders(),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to fetch document metadata" }));
      throw new Error(parseErrorDetail(err, "Failed to fetch document metadata"));
    }
    return res.json();
  },

  getExamArtifactPageUrl(
    examId: string,
    artifactType: "question-paper" | "answer-key",
    pageNum: number
  ): string {
    const token = getAuthToken();
    return `${API_BASE}/api/exams/${examId}/${artifactType}/pages/${pageNum}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  },

  getExamArtifactPdfUrl(
    examId: string,
    artifactType: "question-paper" | "answer-key",
    download = false
  ): string {
    const params = new URLSearchParams();
    if (download) params.set("download", "1");
    const token = getAuthToken();
    if (token) params.set("token", token);
    const qs = params.toString();
    return `${API_BASE}/api/exams/${examId}/${artifactType}${qs ? `?${qs}` : ""}`;
  },

  getQuestionPaperPdfUrl(examId: string): string {
    return this.getExamArtifactPdfUrl(examId, "question-paper");
  },

  getAnswerKeyPdfUrl(examId: string): string {
    return this.getExamArtifactPdfUrl(examId, "answer-key");
  },

  async generateRubric(examId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/exams/${examId}/generate-rubric`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to generate rubric" }));
      throw new Error(parseErrorDetail(err, "Failed to generate rubric"));
    }
    clearApiCache("exams:");
    return res.json();
  },

  async approveRubric(examId: string, rubricData: ExamRubric): Promise<any> {
    const res = await fetch(`${API_BASE}/api/exams/${examId}/rubric/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ rubric_data: rubricData }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to approve rubric" }));
      throw new Error(parseErrorDetail(err, "Failed to approve rubric"));
    }
    clearApiCache("exams:");
    return res.json();
  },

  async unlockRubric(examId: string): Promise<Exam> {
    let res = await fetch(`${API_BASE}/api/exams/${examId}/rubric/unlock`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      res = await fetch(`${API_BASE}/api/exams/${examId}/rubric/unlock`, {
        method: "POST",
        headers: { ...getAuthHeaders() },
      });
    }
    if (!res.ok) throw new Error("Failed to unlock rubric");
    clearApiCache("exams:");
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
    const res = await fetch(`${API_BASE}/api/exams/${examId}/start-evaluation`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to start evaluation" }));
      throw new Error(parseErrorDetail(err, "Failed to start evaluation"));
    }
    const data = await res.json();
    clearApiCache(`exams:detail:${examId}`);
    clearApiCache(`submissions:list:${examId}`);
    clearApiCache(`submissions:list:all`);
    clearApiCache(`exams:list:`);
    return data;
  },

  async publishResults(examId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/exams/${examId}/publish-results`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to publish results" }));
      throw new Error(parseErrorDetail(err, "Failed to publish results"));
    }
    const data = await res.json();
    clearApiCache(`exams:detail:${examId}`);
    clearApiCache(`submissions:list:${examId}`);
    clearApiCache(`submissions:list:all`);
    clearApiCache(`exams:list:`);
    return data;
  },

  // -------------------------------------------------------------
  // Manual Revaluation Desk (100% Human, ZERO AI)
  // -------------------------------------------------------------
  async requestRevaluation(submissionId: string, data: { question_ids: string[]; student_reason: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/api/revaluation/${submissionId}/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to submit revaluation request" }));
      throw new Error(parseErrorDetail(err, "Failed to submit revaluation request"));
    }
    return res.json();
  },

  async getMyRevaluations(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/api/revaluation/my-requests`, {
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
    const res = await fetch(`${API_BASE}/api/revaluation/requests${query}`, {
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
    const res = await fetch(`${API_BASE}/api/revaluation/${requestId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to resolve revaluation" }));
      throw new Error(parseErrorDetail(err, "Failed to resolve revaluation"));
    }
    return res.json();
  },

  // -------------------------------------------------------------
  // In-App Notifications
  // -------------------------------------------------------------
  async listNotifications(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/api/notifications`, {
      headers: { ...getAuthHeaders() },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return res.json();
  },

  async markNotificationRead(notifId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/notifications/${notifId}/read`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error("Failed to mark notification read");
    return res.json();
  },

  async markAllNotificationsRead(): Promise<any> {
    const res = await fetch(`${API_BASE}/api/notifications/read-all`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error("Failed to mark all notifications read");
    return res.json();
  },

  async getVapidPublicKey(): Promise<string | null> {
    if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
      return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    }
    if (_cachedVapidPublicKey) {
      return _cachedVapidPublicKey;
    }
    try {
      const res = await fetch(`${API_BASE}/api/notifications/vapid-public-key`);
      if (!res.ok) return null;
      const data = await res.json();
      _cachedVapidPublicKey = data.public_key || null;
      return _cachedVapidPublicKey;
    } catch {
      return null;
    }
  },

  async savePushSubscription(sub: any): Promise<any> {
    const res = await fetch(`${API_BASE}/api/notifications/push-subscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(sub),
    });
    if (!res.ok) throw new Error("Failed to save push subscription");
    return res.json();
  },

  async removePushSubscription(endpoint: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/notifications/push-unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ endpoint }),
    });
    if (!res.ok) throw new Error("Failed to remove push subscription");
    return res.json();
  },

  async testClosedAppPush(): Promise<any> {
    const res = await fetch(`${API_BASE}/api/notifications/test-closed-app-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error("Failed to dispatch cloud push test");
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
    const res = await fetch(`${API_BASE}/api/grading/${submissionId}`, {
      headers: { ...getAuthHeaders() },
      cache: "no-store",
    });
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
    const resData = await res.json();
    clearApiCache(`submissions:detail:${submissionId}`);
    clearApiCache(`submissions:list:`);
    return resData;
  },

  async editAnswer(submissionId: string, answerId: string, data: any): Promise<any> {
    return this.manualEditAnswer(submissionId, answerId, data);
  },

  async reevaluateAnswer(
    submissionId: string,
    answerId: string,
    payload: { teacher_prompt?: string; region_id?: string }
  ): Promise<any> {
    const res = await fetch(`${API_BASE}/api/grading/${submissionId}/answers/${answerId}/reevaluate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to re-evaluate answer" }));
      throw new Error(parseErrorDetail(err, "Failed to re-evaluate answer"));
    }
    return await res.json();
  },

  async clearSubmissionReview(submissionId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/grading/${submissionId}/clear-review`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to clear review flag" }));
      throw new Error(parseErrorDetail(err, "Failed to clear review flag"));
    }
    const resData = await res.json();
    clearApiCache(`submissions:detail:${submissionId}`);
    clearApiCache(`submissions:list:`);
    return resData;
  },

  async clearExamReviews(examId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/grading/exams/${examId}/clear-all-reviews`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to bulk clear exam review flags" }));
      throw new Error(parseErrorDetail(err, "Failed to bulk clear exam review flags"));
    }
    const resData = await res.json();
    clearApiCache(`submissions:list:${examId}`);
    clearApiCache(`submissions:list:all`);
    return resData;
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
        answer_id:
          (data as any).answer_id ||
          (() => {
            if (regionId.startsWith("draft-add-")) {
              const m = regionId.match(/^draft-add-(.+)-(\d+)$/);
              return m ? m[1] : regionId.replace("draft-add-", "");
            }
            if (regionId.startsWith("draft-new-")) return regionId.replace("draft-new-", "");
            if (regionId.startsWith("new-")) return regionId.replace("new-", "");
            return undefined;
          })(),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to update bounding box region" }));
      throw new Error(parseErrorDetail(err, "Failed to update bounding box region"));
    }
    const resData = await res.json();
    clearApiCache(`submissions:detail:${submissionId}`);
    clearApiCache(`submissions:list:`);
    return resData;
  },

  async deleteRegion(submissionId: string, regionId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/grading/regions/${submissionId}/${regionId}`, {
      method: "DELETE",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to delete bounding box region" }));
      throw new Error(parseErrorDetail(err, "Failed to delete bounding box region"));
    }
    const resData = await res.json();
    clearApiCache(`submissions:detail:${submissionId}`);
    clearApiCache(`submissions:list:`);
    return resData;
  },

  async getUsageMetrics(examId?: string): Promise<UsageMetrics> {
    const url = examId
      ? `${API_BASE}/api/analytics/usage?exam_id=${examId}`
      : `${API_BASE}/api/analytics/usage`;
    const res = await fetch(url, {
      headers: { ...getAuthHeaders() },
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Failed to fetch usage metrics");
    return res.json();
  },

  async updateQuotaSettings(data: {
    rpm_limit?: number;
    tpm_limit?: number;
    rpd_limit?: number;
  }): Promise<any> {
    const res = await fetch(`${API_BASE}/api/analytics/quota`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to update quota settings");
    return res.json();
  },

  async testGcpPaidConnection(): Promise<{
    success: boolean;
    error_code?: string;
    http_status?: number;
    message: string;
    duration_ms: number;
    input_tokens?: number;
    output_tokens?: number;
    event_id: string;
  }> {
    const res = await fetch(`${API_BASE}/api/analytics/test-gcp-paid`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "GCP connection test failed" }));
      throw new Error(parseErrorDetail(err, "GCP connection test failed"));
    }
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
      headers: { ...getAuthHeaders() },
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Failed to fetch benchmarks");
    return res.json();
  },

  // Export URLs
  getAnnotatedPdfUrl(submissionId: string, filename?: string) {
    const clean = submissionId.replace(/\.pdf$/i, "");
    const token = getAuthToken();
    const qs = token ? `?token=${encodeURIComponent(token)}` : "";
    if (filename) {
      const cleanName = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
      return `${API_BASE}/api/exports/pdf/${clean}/${encodeURIComponent(cleanName)}${qs}`;
    }
    return `${API_BASE}/api/exports/pdf/${clean}${qs}`;
  },

  getBatchZipUrl(batchId: string, filename?: string) {
    const clean = batchId.replace(/\.zip$/i, "");
    const token = getAuthToken();
    const qs = token ? `?token=${encodeURIComponent(token)}` : "";
    if (filename) {
      const cleanName = filename.endsWith(".zip") ? filename : `${filename}.zip`;
      return `${API_BASE}/api/exports/batch-zip/${clean}/${encodeURIComponent(cleanName)}${qs}`;
    }
    return `${API_BASE}/api/exports/batch-zip/${clean}${qs}`;
  },

  getMarksCsvUrl(examId: string, filename?: string) {
    const clean = examId.replace(/\.csv$/i, "");
    const token = getAuthToken();
    const qs = token ? `?token=${encodeURIComponent(token)}` : "";
    if (filename) {
      const cleanName = filename.endsWith(".csv") ? filename : `${filename}.csv`;
      return `${API_BASE}/api/exports/marks-csv/${clean}/${encodeURIComponent(cleanName)}${qs}`;
    }
    return `${API_BASE}/api/exports/marks-csv/${clean}${qs}`;
  },

  getPageImageUrl(submissionId: string, pageNum: number, width?: number, version?: number) {
    const token = getAuthToken();
    const params = new URLSearchParams();
    if (width) params.set("w", String(Math.round(width)));
    if (version) params.set("v", String(version));
    if (token) params.set("token", token);
    const qs = params.toString();
    return `${API_BASE}/api/grading/page-image/${submissionId}/${pageNum}${qs ? `?${qs}` : ""}`;
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
    const token = getAuthToken();
    if (token) params.set("token", token);
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
      const token = getAuthToken();
      if (token && !urlObj.searchParams.has("token")) {
        urlObj.searchParams.set("token", token);
      }
      return urlObj.toString();
    } catch {
      const delimiter = base.includes("?") ? "&" : "?";
      const token = getAuthToken();
      const tokenParam = token && !base.includes("token=") ? `token=${encodeURIComponent(token)}&` : "";
      const regParam = regionId && !base.includes("region_id=") ? `region_id=${encodeURIComponent(regionId)}&` : "";
      return `${base}${delimiter}${tokenParam}${regParam}${v ? `v=${encodeURIComponent(v)}` : ""}`;
    }
  },

  async purgeExpiredSubmissions(): Promise<{ scanned_count: number; purged_count: number; purged_submission_ids: string[] }> {
    const res = await fetch(`${API_BASE}/api/submissions/purge-expired`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to purge expired submissions" }));
      throw new Error(parseErrorDetail(err, "Failed to purge expired submissions"));
    }
    return res.json();
  },

  // -------------------------------------------------------------
  // Technical Issue Reports & Support
  // -------------------------------------------------------------
  async submitTechnicalReport(formData: FormData): Promise<{ success: boolean; report_id: string; message: string }> {
    const res = await fetch(`${API_BASE}/api/reports`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to submit technical report" }));
      throw new Error(parseErrorDetail(err, "Failed to submit technical report"));
    }
    return res.json();
  },

  async getMyTechnicalReports(): Promise<{ reports: any[] }> {
    const res = await fetch(`${API_BASE}/api/reports/my`, {
      headers: { ...getAuthHeaders() },
      cache: "no-store",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to load reports" }));
      throw new Error(parseErrorDetail(err, "Failed to load reports"));
    }
    return res.json();
  },

  async listTechnicalReports(status?: string, role?: string, branchId?: string): Promise<{
    stats: { total: number; open: number; in_progress: number; resolved: number };
    reports: any[];
  }> {
    const params = new URLSearchParams();
    if (status && status !== "ALL") params.append("status", status);
    if (role && role !== "ALL") params.append("role", role);
    if (branchId && branchId !== "ALL") params.append("branch_id", branchId);

    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${API_BASE}/api/reports${query}`, {
      headers: { ...getAuthHeaders() },
      cache: "no-store",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to list technical reports" }));
      throw new Error(parseErrorDetail(err, "Failed to list technical reports"));
    }
    return res.json();
  },

  async updateTechnicalReport(
    reportId: string,
    data: { status: string; admin_notes?: string }
  ): Promise<{ success: boolean; report: any; message: string }> {
    const res = await fetch(`${API_BASE}/api/reports/${reportId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to update report status" }));
      throw new Error(parseErrorDetail(err, "Failed to update report status"));
    }
    return res.json();
  },

  getReportImageUrl(reportId: string, filename: string): string {
    return `${API_BASE}/api/reports/${reportId}/images/${encodeURIComponent(filename)}`;
  },

  async deleteExam(examId: string, confirmTitle?: string): Promise<{ success: boolean; message: string; deleted_submissions_count?: number }> {
    clearApiCache();
    const query = confirmTitle ? `?confirm_delete_title=${encodeURIComponent(confirmTitle)}` : "";
    const res = await fetch(`${API_BASE}/api/exams/${examId}${query}`, {
      method: "DELETE",
      headers: { ...getAuthHeaders() },
    });
    return safeJson(res, "Failed to delete examination");
  },

  async archiveExam(examId: string): Promise<{ success: boolean; message: string; exam_id: string; lifecycle_status: string }> {
    clearApiCache();
    const res = await fetch(`${API_BASE}/api/exams/${examId}/archive`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    return safeJson(res, "Failed to archive examination");
  },

  async restoreExam(examId: string): Promise<{ success: boolean; message: string; exam_id: string; lifecycle_status: string }> {
    clearApiCache();
    const res = await fetch(`${API_BASE}/api/exams/${examId}/restore`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    return safeJson(res, "Failed to restore examination");
  },
};
