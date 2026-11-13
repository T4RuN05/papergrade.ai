"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Plus,
  Upload,
  Clock,
  RotateCcw,
  CheckCircle2,
  FileSpreadsheet,
  AlertCircle,
  RefreshCw,
  Trash2,
  Search,
  Building2,
  ShieldCheck,
  UserCheck,
  KeyRound,
  Check,
  X,
} from "lucide-react";
import { api, getAuthToken } from "@/lib/api";
import { useTenant } from "@/lib/TenantContext";
import { useToast } from "@/lib/ToastContext";
import {
  ButtonPrimary,
  ButtonUtility,
  FeatureCard,
  BadgePill,
  StatusWell,
  ModalCard,
  FormInput,
  BatchesRosterSkeleton,
  Skeleton,
  useConfirm,
} from "@/components/ui";

export default function BranchBatchesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const { selectedBranch, selectedInstitute, currentUser, refreshTenancy, loading: tenantLoading } = useTenant();

  const [batches, setBatches] = useState<any[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [loadingStudents, setLoadingStudents] = useState<boolean>(false);
  const [loadingBatches, setLoadingBatches] = useState<boolean>(true);
  const [studentSearch, setStudentSearch] = useState<string>("");

  // Modals
  const [createBatchOpen, setCreateBatchOpen] = useState(false);
  const [newBatchName, setNewBatchName] = useState("");
  const [newBatchCode, setNewBatchCode] = useState("");
  const [newBatchYear, setNewBatchYear] = useState("2026");

  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [stuRoll, setStuRoll] = useState("");
  const [stuName, setStuName] = useState("");
  const [stuEmail, setStuEmail] = useState("");
  const [addedStudentIdNum, setAddedStudentIdNum] = useState<string | null>(null);

  const [importRosterOpen, setImportRosterOpen] = useState(false);
  const [rosterFile, setRosterFile] = useState<File | null>(null);
  const [importStats, setImportStats] = useState<any>(null);

  // Student Password Reset Requests state
  const [passwordResets, setPasswordResets] = useState<any[]>([]);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadPasswordResets = async () => {
    try {
      const data = await api.listPasswordResets();
      setPasswordResets(data || []);
    } catch (err) {
      console.warn("Failed to load password resets", err);
    }
  };

  useEffect(() => {
    loadPasswordResets();
    const interval = setInterval(loadPasswordResets, 6000);
    return () => clearInterval(interval);
  }, [selectedBranch?.id]);

  const pendingResets = useMemo(() => {
    return passwordResets.filter((r) => r.status === "PENDING");
  }, [passwordResets]);

  const handleApproveReset = async (id: string, name: string) => {
    setActionLoadingId(id);
    try {
      await api.approvePasswordReset(id);
      toast.success(`Password reset approved for ${name}. The student can now enter their new password!`, {
        title: "Request Approved",
        duration: 5000,
      });
      await loadPasswordResets();
    } catch (err: any) {
      toast.error(err.message || "Failed to approve request", { title: "Approval Error" });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectReset = async (id: string, name: string) => {
    setActionLoadingId(id);
    try {
      await api.rejectPasswordReset(id);
      toast.info(`Password reset request rejected for ${name}.`, { title: "Request Rejected" });
      await loadPasswordResets();
    } catch (err: any) {
      toast.error(err.message || "Failed to reject request", { title: "Rejection Error" });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Load batches whenever active branch changes
  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.replace("/auth/login?role=staff&redirect=/branch/batches");
      return;
    }

    // Determine effective branch id across context, currentUser, or storage
    const effectiveBranchId =
      selectedBranch?.id ||
      currentUser?.branch_id ||
      (typeof window !== "undefined" ? localStorage.getItem("papergrade_selected_branch_id") : null);

    if (tenantLoading && !effectiveBranchId) return;

    if (!effectiveBranchId) {
      if (!tenantLoading && !selectedBranch?.id) {
        refreshTenancy().catch(() => {});
      }
      setBatches([]);
      setSelectedBatch(null);
      setStudents([]);
      setLoadingBatches(false);
      return;
    }

    loadBatchesForBranch(effectiveBranchId);
  }, [selectedBranch?.id, currentUser?.branch_id, tenantLoading, router, refreshTenancy]);

  const loadBatchesForBranch = async (branchId: string, force = false) => {
    setLoadingBatches(true);
    try {
      const batchList = await api.listBatches(branchId, force);
      setBatches(batchList);
      if (batchList.length > 0) {
        // Keep current selected if it still exists in this branch, else pick first
        setSelectedBatch((prev: any) => {
          const match = batchList.find((b: any) => b.id === prev?.id);
          return match || batchList[0];
        });
      } else {
        setSelectedBatch(null);
        setStudents([]);
      }
    } catch (err: any) {
      console.error("Failed to load batches:", err);
      toast.error(err.message || "Failed to load batches", { title: "Load Error" });
    } finally {
      setLoadingBatches(false);
    }
  };

  // Load students when selectedBatch changes
  useEffect(() => {
    if (!selectedBatch) {
      setStudents([]);
      return;
    }

    setLoadingStudents(true);
    api
      .listStudentsInBatch(selectedBatch.id)
      .then((data) => setStudents(data))
      .catch((err) => {
        console.error("Failed to load students:", err);
        setStudents([]);
      })
      .finally(() => setLoadingStudents(false));
  }, [selectedBatch]);

  // Create Batch
  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranch?.id || !newBatchName.trim()) return;

    const bName = newBatchName.trim();
    const bCode = (newBatchCode || newBatchName.slice(0, 4)).trim().toUpperCase();
    const bYear = newBatchYear.trim() || "2026";
    try {
      const res = await api.createBatch({
        branch_id: selectedBranch.id,
        name: bName,
        code: bCode,
        academic_year: bYear,
      });
      setCreateBatchOpen(false);
      setNewBatchName("");
      setNewBatchCode("");
      toast.success(`Batch "${bName}" created successfully!`, { title: "Batch Created" });

      // Optimistically add and select the new batch immediately
      const newBatchObj = {
        id: res?.id || `batch_${Date.now()}`,
        branch_id: selectedBranch.id,
        name: res?.name || bName,
        code: res?.code || bCode,
        academic_year: bYear,
        total_submissions: 0,
        created_at: new Date().toISOString(),
      };
      setBatches((prev) => [newBatchObj, ...prev.filter((b) => b.id !== newBatchObj.id)]);
      setSelectedBatch(newBatchObj);

      // Fresh sync from backend
      await loadBatchesForBranch(selectedBranch.id, true);
    } catch (err: any) {
      const msg = err.message || "Failed to create batch.";
      toast.error(msg, { title: "Creation Failed" });
    }
  };

  // Add Single Student
  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatch || !stuRoll.trim() || !stuName.trim()) return;

    const sName = stuName.trim();
    try {
      const res = await api.addStudent(selectedBatch.id, {
        roll_number: stuRoll.trim().toUpperCase(),
        full_name: sName,
        email: stuEmail.trim() || undefined,
      });
      setAddedStudentIdNum(res.student_id_num);
      setStuRoll("");
      setStuName("");
      setStuEmail("");
      toast.success(`Student "${sName}" enrolled. Claim ID: ${res.student_id_num}`, { title: "Student Enrolled" });
      // Reload students & sync batch card counts
      const [updated] = await Promise.all([
        api.listStudentsInBatch(selectedBatch.id),
        selectedBranch?.id ? loadBatchesForBranch(selectedBranch.id, true) : Promise.resolve(),
      ]);
      setStudents(updated);
    } catch (err: any) {
      const msg = err.message || "Failed to add student.";
      toast.error(msg, { title: "Enrollment Failed" });
    }
  };

  // Import Excel Roster
  const handleImportRoster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatch || !rosterFile) return;

    try {
      const res = await api.importRoster(selectedBatch.id, rosterFile);
      setImportStats(res);
      const count = res.imported_count || res.students_imported || "students";
      toast.success(`Imported ${count} students into "${selectedBatch.name}" roster!`, { title: "Roster Imported" });
      const [updated] = await Promise.all([
        api.listStudentsInBatch(selectedBatch.id),
        selectedBranch?.id ? loadBatchesForBranch(selectedBranch.id, true) : Promise.resolve(),
      ]);
      setStudents(updated);
    } catch (err: any) {
      const msg = err.message || "Excel import failed.";
      toast.error(msg, { title: "Import Failed" });
    }
  };

  // Delete Batch
  const handleDeleteBatch = async (batchId: string, batchName: string) => {
    const ok = await confirm({
      title: "Delete Batch",
      message: `Are you sure you want to delete batch "${batchName}" and remove all its enrolled students? This action cannot be undone.`,
      confirmText: "Delete Batch",
      variant: "danger",
    });
    if (!ok) return;

    try {
      await api.deleteBatch(batchId);
      toast.success(`Batch "${batchName}" deleted.`, { title: "Batch Removed" });

      // Optimistically remove batch from UI immediately
      setBatches((prev) => {
        const remaining = prev.filter((b) => b.id !== batchId);
        if (selectedBatch?.id === batchId) {
          const nextSelected = remaining.length > 0 ? remaining[0] : null;
          setSelectedBatch(nextSelected);
          if (!nextSelected) setStudents([]);
        }
        return remaining;
      });

      if (selectedBranch) {
        await loadBatchesForBranch(selectedBranch.id, true);
      }
    } catch (err: any) {
      const msg = err.message || "Failed to delete batch.";
      toast.error(msg, { title: "Delete Failed" });
    }
  };

  // Delete Single Student
  const handleDeleteStudent = async (studentId: string, studentName: string) => {
    if (!selectedBatch) return;
    const ok = await confirm({
      title: "Remove Student",
      message: `Are you sure you want to remove student "${studentName}" from this batch roster?`,
      confirmText: "Remove Student",
      variant: "danger",
    });
    if (!ok) return;

    try {
      await api.deleteStudent(selectedBatch.id, studentId);
      setStudents((prev) => prev.filter((s) => s.id !== studentId));
      toast.success(`Student "${studentName}" removed from roster.`, { title: "Student Removed" });
      if (selectedBranch?.id) {
        loadBatchesForBranch(selectedBranch.id, true);
      }
    } catch (err: any) {
      const msg = err.message || "Failed to delete student.";
      toast.error(msg, { title: "Removal Failed" });
    }
  };

  // Filtered students by search
  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return students;
    const q = studentSearch.toLowerCase();
    return students.filter(
      (s) =>
        s.student_name?.toLowerCase().includes(q) ||
        s.full_name?.toLowerCase().includes(q) ||
        s.roll_number?.toLowerCase().includes(q) ||
        s.student_id_num?.includes(q)
    );
  }, [students, studentSearch]);

  const claimedCount = useMemo(() => {
    return students.filter((s) => s.account_claimed).length;
  }, [students]);

  const hasToken = typeof window !== "undefined" && Boolean(getAuthToken());
  if ((loadingBatches && batches.length === 0) || !hasToken) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto pb-16">
        <BatchesRosterSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6 max-w-7xl mx-auto pb-16 px-1 sm:px-0 cascade-group">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-2 border-b border-hairline">
        <div>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <BadgePill label="Academic Operations" color="purple" />
            {selectedBranch && (
              <span className="text-xs font-semibold text-ink-secondary bg-canvas-soft border border-hairline px-2 py-0.5 rounded-md truncate max-w-[200px] sm:max-w-none">
                {selectedBranch.name} • {selectedBranch.city}
              </span>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink mt-1.5">
            Batches & Student Roster
          </h1>
          <p className="text-xs sm:text-sm text-ink-muted mt-0.5 leading-relaxed">
            Manage student batches, onboarding claim IDs, and roster enrollments for{" "}
            <span className="font-semibold text-ink">{selectedBranch?.name || "Active Branch"}</span>.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
          <ButtonUtility
            onClick={() => setResetModalOpen(true)}
            size="sm"
            className="w-full sm:w-auto justify-center relative truncate"
          >
            <KeyRound className="h-3.5 w-3.5 mr-1.5 shrink-0" />
            <span className="truncate">Password Resets</span>
            {pendingResets.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white animate-pulse shrink-0">
                {pendingResets.length}
              </span>
            )}
          </ButtonUtility>

          <ButtonPrimary onClick={() => setCreateBatchOpen(true)} size="sm" className="w-full sm:w-auto justify-center truncate">
            <Plus className="h-3.5 w-3.5 mr-1.5 shrink-0" />
            <span className="truncate">Create Batch</span>
          </ButtonPrimary>
        </div>
      </div>

      {/* Pending Reset Requests Status Well */}
      {pendingResets.length > 0 && (
        <StatusWell
          variant="amber"
          icon={<KeyRound className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
          title={
            <div className="flex items-center gap-2 flex-wrap">
              <span>{pendingResets.length} Student Password Reset Request{pendingResets.length > 1 ? "s" : ""} Pending Approval</span>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
            </div>
          }
          description="Students are currently waiting live on their login screens for verification."
          badge={
            <button
              type="button"
              onClick={() => setResetModalOpen(true)}
              className="btn-glass-amber px-3.5 py-1.5 rounded-md text-xs font-semibold shrink-0 cursor-pointer"
            >
              Review &amp; Approve
            </button>
          }
        />
      )}



      {/* 3. Branch Overview Stats (Responsive 3-Column Strip) */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 cascade-fast">
        <FeatureCard className="p-3 sm:p-4 space-y-1">
          <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-ink-muted truncate">
            Active Batches
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-ink">{batches.length}</div>
          <p className="hidden sm:block text-[11px] text-ink-faint truncate">
            Academic batches in {selectedBranch?.name || "branch"}
          </p>
        </FeatureCard>

        <FeatureCard className="p-3 sm:p-4 space-y-1">
          <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-ink-muted truncate">
            Enrolled Students
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-ink">{students.length}</div>
          <p className="hidden sm:block text-[11px] text-ink-faint truncate">
            In currently selected batch
          </p>
        </FeatureCard>

        <FeatureCard className="p-3 sm:p-4 space-y-1">
          <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-ink-muted truncate">
            PWA Claim Rate
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-600">
            {students.length > 0 ? `${Math.round((claimedCount / students.length) * 100)}%` : "0%"}
          </div>
          <p className="hidden sm:block text-[11px] text-ink-faint truncate">
            {claimedCount} of {students.length} claimed
          </p>
        </FeatureCard>
      </div>

      {/* 4. Main Two-Column Roster Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 items-start">
        {/* Left Column: Batches List */}
        <div className="space-y-2.5 sm:space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
              <span>Batches</span>
              <span className="font-mono bg-canvas-soft border border-hairline px-1.5 py-0.2 rounded text-[10px] text-ink">
                {batches.length}
              </span>
            </h2>
            <button
              onClick={() => selectedBranch && loadBatchesForBranch(selectedBranch.id, true)}
              className="p-1 rounded text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors cursor-pointer"
              title="Refresh Batches"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Batches Container: horizontal scroll on mobile (< md), vertical stack on desktop (md+) */}
          <div className="flex md:flex-col gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-none -mx-1 px-1">
            {loadingBatches ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="min-w-[170px] md:min-w-0 md:w-full shrink-0 md:shrink p-3 rounded-lg bg-surface border border-hairline space-y-2">
                  <Skeleton className="h-4 w-28 sm:w-32" />
                  <Skeleton className="h-3 w-36 sm:w-40" />
                </div>
              ))
            ) : batches.length === 0 ? (
              <div className="w-full p-6 rounded-lg bg-surface border border-hairline text-center text-xs text-ink-muted space-y-2">
                <Users className="h-6 w-6 text-ink-faint mx-auto" />
                <p className="font-semibold text-ink">No batches in this branch.</p>
                <p className="text-[11px]">Click &quot;Create Batch&quot; above to initialize a new student batch.</p>
              </div>
            ) : (
              batches.map((b) => (
                <div
                  key={b.id}
                  className={`group flex items-center justify-between p-3 sm:p-3.5 rounded-lg border transition-all cursor-pointer min-w-[180px] xs:min-w-[200px] md:min-w-0 md:w-full shrink-0 md:shrink ${
                    selectedBatch?.id === b.id
                      ? "bg-surface border-primary shadow-xs ring-1 ring-primary/20"
                      : "bg-surface border-hairline hover:border-[#d0d0d0]"
                  }`}
                  onClick={() => setSelectedBatch(b)}
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="text-xs font-bold text-ink truncate flex items-center gap-1.5">
                      <span>{b.name}</span>
                      {selectedBatch?.id === b.id && (
                        <span className="md:hidden h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                      )}
                    </div>
                    <div className="text-[11px] text-ink-muted mt-0.5 truncate">
                      Code: <span className="font-mono font-semibold">{b.code}</span> • {b.academic_year || "2026"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-canvas-soft border border-hairline text-ink-muted">
                      {b.total_submissions || 0}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteBatch(b.id, b.name);
                      }}
                      className="p-1 rounded text-ink-faint hover:text-red-600 hover:bg-red-50 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                      title="Delete Batch"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Selected Batch Roster Table */}
        <div className="md:col-span-2 space-y-4">
          {selectedBatch ? (
            <FeatureCard className="p-4 sm:p-6 space-y-4">
              {/* Batch Action Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-hairline">
                <div>
                  <h3 className="text-base font-bold text-ink flex items-center gap-2">
                    <span>{selectedBatch.name}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-semibold">
                      {selectedBatch.code}
                    </span>
                  </h3>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Academic Year: <span className="font-semibold text-ink">{selectedBatch.academic_year || "2026"}</span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <ButtonUtility size="sm" onClick={() => setAddStudentOpen(true)} className="flex-1 sm:flex-initial justify-center whitespace-nowrap" title="Add Student">
                    <Users className="h-3.5 w-3.5 shrink-0" />
                    <Plus className="h-3 w-3 ml-0.5 shrink-0 sm:hidden" aria-hidden="true" />
                    <span className="hidden sm:inline ml-1">Add Student</span>
                  </ButtonUtility>
                  <ButtonUtility size="sm" onClick={() => setImportRosterOpen(true)} className="flex-1 sm:flex-initial justify-center whitespace-nowrap" title="Import Excel Roster">
                    <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
                    <span className="ml-1 sm:hidden">Import</span>
                    <span className="hidden sm:inline ml-1">Import Excel</span>
                  </ButtonUtility>
                  <ButtonUtility
                    size="sm"
                    variant="danger"
                    onClick={() => handleDeleteBatch(selectedBatch.id, selectedBatch.name)}
                    title="Delete batch"
                    className="shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </ButtonUtility>
                </div>
              </div>

              {/* Roster Onboarding Notice */}
              <div className="p-3 sm:p-3.5 rounded-lg bg-canvas-soft border border-hairline text-xs text-ink-secondary space-y-1.5">
                <div className="font-semibold text-ink flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                  <span>One-Time Student Onboarding Claim Workflow</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Each enrolled student receives a permanent 6-digit Claim ID. Students claim their PWA account at{" "}
                  <code className="font-mono font-semibold text-ink bg-surface px-1.5 py-0.5 rounded border border-hairline">
                    /auth/claim
                  </code>{" "}
                  using their Claim ID and Roll Number to set their password.
                </p>
              </div>

              {/* Table Controls (Search & Stats) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
                <div className="relative flex-1 w-full sm:max-w-sm">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-ink-muted" />
                  <input
                    type="text"
                    placeholder="Search name, roll no, or claim ID..."
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    className="w-full rounded-md border border-hairline bg-surface pl-9 pr-3 py-1.5 text-xs text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none shadow-2xs"
                  />
                  {studentSearch && (
                    <button
                      type="button"
                      onClick={() => setStudentSearch("")}
                      className="absolute right-2.5 top-2 text-[10px] text-ink-muted hover:text-ink bg-canvas-soft px-1 rounded"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2 text-xs text-ink-muted font-medium">
                  <span>
                    {filteredStudents.length} {filteredStudents.length === 1 ? "student" : "students"}
                  </span>
                  <span className="sm:hidden text-ink-faint">•</span>
                  <span className="sm:hidden text-[11px] text-emerald-600 font-medium">
                    {claimedCount} claimed
                  </span>
                </div>
              </div>

              {/* Student Roster Table & Mobile Card View */}
              <div className="rounded-lg border border-hairline overflow-hidden shadow-2xs bg-surface">
                {/* Mobile View (< sm): Touch-friendly student cards */}
                <div className="sm:hidden divide-y divide-hairline max-h-[480px] overflow-y-auto">
                  {loadingStudents ? (
                    [1, 2, 3, 4].map((i) => (
                      <div key={i} className="p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <Skeleton className="h-3.5 w-24" />
                          <Skeleton className="h-5 w-16 rounded" />
                        </div>
                        <Skeleton className="h-3 w-40" />
                      </div>
                    ))
                  ) : filteredStudents.length === 0 ? (
                    <div className="px-4 py-10 text-center text-ink-muted space-y-1">
                      <p className="font-semibold text-ink">No students found.</p>
                      <p className="text-[11px]">
                        {studentSearch ? "No matches for your search query." : "Add students manually or import an Excel roster."}
                      </p>
                    </div>
                  ) : (
                    filteredStudents.map((stu) => {
                      const isClaimed = Boolean(stu.account_claimed);
                      const claimId = stu.student_id_num || stu.claim_id || "—";
                      return (
                        <div key={stu.id} className="p-3 hover:bg-canvas-soft/60 transition-colors flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-ink">
                                {stu.roll_number}
                              </span>
                              <span className="font-medium text-xs text-ink truncate">
                                {stu.full_name || stu.student_name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-primary bg-primary/10 border border-primary/20">
                                ID: {claimId}
                              </span>
                              <BadgePill
                                label={isClaimed ? "Claimed" : "Unclaimed"}
                                color={isClaimed ? "green" : "gray"}
                                className="text-[10px] px-2 py-0"
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteStudent(stu.id, stu.full_name || stu.student_name)}
                            className="p-1.5 rounded-md text-ink-faint hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                            title="Remove student from batch"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Desktop View (sm+): Full Wide Table */}
                <div className="hidden sm:block max-h-[460px] overflow-y-auto overflow-x-auto relative">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 z-10 bg-canvas-soft border-b border-hairline shadow-2xs">
                      <tr className="border-b border-hairline bg-canvas-soft text-[11px] font-bold text-ink-secondary uppercase tracking-wider">
                        <th className="px-4 py-3 bg-canvas-soft">Roll Number</th>
                        <th className="px-4 py-3 bg-canvas-soft">Student Name</th>
                        <th className="px-4 py-3 bg-canvas-soft">6-Digit Claim ID</th>
                        <th className="px-4 py-3 bg-canvas-soft">PWA Status</th>
                        <th className="px-4 py-3 text-right bg-canvas-soft">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {loadingStudents ? (
                        [1, 2, 3, 4].map((i) => (
                          <tr key={i} className="h-12">
                            <td className="px-4 py-3"><Skeleton className="h-3.5 w-16" /></td>
                            <td className="px-4 py-3"><Skeleton className="h-3.5 w-36" /></td>
                            <td className="px-4 py-3"><Skeleton className="h-4 w-20 rounded" /></td>
                            <td className="px-4 py-3"><Skeleton className="h-5 w-24 rounded-full" /></td>
                            <td className="px-4 py-3 text-right"><Skeleton className="h-6 w-12 rounded ml-auto" /></td>
                          </tr>
                        ))
                      ) : filteredStudents.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-12 text-center text-ink-muted space-y-1">
                            <p className="font-semibold text-ink">No students found.</p>
                            <p className="text-[11px]">
                              {studentSearch ? "No matches for your search query." : "Add students manually or import an Excel roster."}
                            </p>
                          </td>
                        </tr>
                      ) : (
                        filteredStudents.map((stu) => {
                          const isClaimed = Boolean(stu.account_claimed);
                          const claimId = stu.student_id_num || stu.claim_id || "—";
                          return (
                            <tr key={stu.id} className="hover:bg-canvas-soft/60 transition-colors">
                              <td className="px-4 py-3 font-mono font-semibold text-ink">
                                {stu.roll_number}
                              </td>
                              <td className="px-4 py-3 font-medium text-ink">
                                {stu.full_name || stu.student_name}
                              </td>
                              <td className="px-4 py-3 font-mono">
                                <span className="inline-flex items-center px-2 py-0.5 rounded font-bold text-primary bg-primary/10 border border-primary/20">
                                  {claimId}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <BadgePill
                                  label={isClaimed ? "Claimed" : "Unclaimed"}
                                  color={isClaimed ? "green" : "gray"}
                                />
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteStudent(stu.id, stu.full_name || stu.student_name)}
                                  className="p-1 rounded text-ink-faint hover:text-red-600 hover:bg-red-50 transition-colors"
                                  title="Remove student from batch"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {filteredStudents.length > 5 && (
                  <div className="px-3.5 py-2 bg-canvas-soft/70 border-t border-hairline flex items-center justify-between text-[11px] text-ink-muted">
                    <span>Total {filteredStudents.length} enrolled students</span>
                    <span className="font-medium text-emerald-700">
                      {claimedCount} / {filteredStudents.length} claimed
                    </span>
                  </div>
                )}
              </div>
            </FeatureCard>
          ) : (
            <FeatureCard className="p-8 sm:p-12 text-center text-xs text-ink-muted space-y-2">
              <Users className="h-8 w-8 text-ink-faint mx-auto" />
              <p className="font-semibold text-ink">Select a batch from the list to view and manage its student roster.</p>
              <p className="text-[11px]">Or create a new batch to get started.</p>
            </FeatureCard>
          )}
        </div>
      </div>

      {/* MODAL: Create Batch */}
      <ModalCard
        isOpen={createBatchOpen}
        title="Create New Academic Batch"
        onClose={() => setCreateBatchOpen(false)}
      >
        <form onSubmit={handleCreateBatch} className="space-y-4">
          <FormInput
            label="Batch Name"
            placeholder="e.g. KTG 12th Batch, JEE Morning 2026"
            value={newBatchName}
            onChange={(e) => setNewBatchName(e.target.value)}
            required
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormInput
              label="Batch Code"
              placeholder="e.g. KTG_2026"
              value={newBatchCode}
              onChange={(e) => setNewBatchCode(e.target.value)}
              required
            />
            <FormInput
              label="Academic Year"
              placeholder="2026"
              value={newBatchYear}
              onChange={(e) => setNewBatchYear(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
            <ButtonUtility type="button" onClick={() => setCreateBatchOpen(false)} className="w-full sm:w-auto justify-center">
              Cancel
            </ButtonUtility>
            <ButtonPrimary type="submit" className="w-full sm:w-auto justify-center">
              Create Batch
            </ButtonPrimary>
          </div>
        </form>
      </ModalCard>

      {/* MODAL: Add Student */}
      <ModalCard
        isOpen={addStudentOpen}
        title={`Add Student to ${selectedBatch?.name}`}
        onClose={() => {
          setAddStudentOpen(false);
          setAddedStudentIdNum(null);
        }}
      >
        {addedStudentIdNum ? (
          <div className="text-center py-4 space-y-4">
            <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-ink">Student Enrolled Successfully</h4>
              <p className="text-xs text-ink-muted">Share this one-time 6-digit claim ID with the student:</p>
              <div className="text-2xl font-mono font-bold tracking-widest text-primary pt-1">
                {addedStudentIdNum}
              </div>
            </div>
            <ButtonPrimary
              onClick={() => {
                setAddedStudentIdNum(null);
                setAddStudentOpen(false);
              }}
              className="w-full sm:w-auto justify-center"
            >
              Done
            </ButtonPrimary>
          </div>
        ) : (
          <form onSubmit={handleAddStudent} className="space-y-4">
            <FormInput
              label="Roll Number"
              placeholder="e.g. ROLL-101"
              value={stuRoll}
              onChange={(e) => setStuRoll(e.target.value)}
              required
            />
            <FormInput
              label="Full Name"
              placeholder="e.g. Aarav Sharma"
              value={stuName}
              onChange={(e) => setStuName(e.target.value)}
              required
            />
            <FormInput
              label="Email (Optional)"
              type="email"
              placeholder="student@example.com"
              value={stuEmail}
              onChange={(e) => setStuEmail(e.target.value)}
            />
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
              <ButtonUtility type="button" onClick={() => setAddStudentOpen(false)} className="w-full sm:w-auto justify-center">
                Cancel
              </ButtonUtility>
              <ButtonPrimary type="submit" className="w-full sm:w-auto justify-center">
                Enroll Student
              </ButtonPrimary>
            </div>
          </form>
        )}
      </ModalCard>

      {/* MODAL: Import Excel Roster */}
      <ModalCard
        isOpen={importRosterOpen}
        title={`Import Student Roster (${selectedBatch?.name})`}
        onClose={() => {
          setImportRosterOpen(false);
          setImportStats(null);
          setRosterFile(null);
        }}
      >
          {importStats ? (
            <div className="text-center py-4 space-y-4">
              <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-ink">Excel Roster Processed</h4>
                <p className="text-xs text-ink-muted">
                  Successfully imported{" "}
                  <span className="font-bold text-ink">
                    {importStats.imported_count || importStats.students_imported || 0}
                  </span>{" "}
                  students with generated 6-digit claim IDs.
                </p>
                {importStats.duplicates_skipped > 0 && (
                  <p className="text-[11px] text-amber-700">
                    Skipped {importStats.duplicates_skipped} duplicates already enrolled.
                  </p>
                )}
              </div>
              <ButtonPrimary
                onClick={() => {
                  setImportRosterOpen(false);
                  setImportStats(null);
                  setRosterFile(null);
                }}
                className="w-full sm:w-auto justify-center"
              >
                Done
              </ButtonPrimary>
            </div>
          ) : (
            <form onSubmit={handleImportRoster} className="space-y-4">
              <p className="text-xs text-ink-muted leading-relaxed">
                Upload an Excel spreadsheet (<code className="font-mono text-ink">.xlsx</code>). Columns required:{" "}
                <span className="font-semibold text-ink">Roll Number</span> and{" "}
                <span className="font-semibold text-ink">Student Name</span>. Email is optional.
              </p>
              <div className="border-2 border-dashed border-hairline rounded-lg p-6 text-center hover:border-primary transition-colors cursor-pointer bg-canvas-soft">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setRosterFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="excel-roster-input"
                />
                <label htmlFor="excel-roster-input" className="cursor-pointer space-y-2 block">
                  <FileSpreadsheet className="h-8 w-8 text-primary mx-auto" />
                  <div className="text-xs font-semibold text-ink">
                    {rosterFile ? rosterFile.name : "Click to select Excel file"}
                  </div>
                  <div className="text-[11px] text-ink-muted">Supports .xlsx spreadsheets</div>
                </label>
              </div>
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
                <ButtonUtility type="button" onClick={() => setImportRosterOpen(false)} className="w-full sm:w-auto justify-center">
                  Cancel
                </ButtonUtility>
                <ButtonPrimary type="submit" disabled={!rosterFile} className="w-full sm:w-auto justify-center">
                  Process Import
                </ButtonPrimary>
              </div>
            </form>
          )}
        </ModalCard>

      {/* PASSWORD RESET APPROVAL MODAL */}
      <ModalCard
        isOpen={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        title={`Student Password Reset Requests • ${selectedBranch?.name || "Branch"}`}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-ink-muted">
            <span className="leading-relaxed">
              Review requests from students who forgot their passwords. Approving allows the student to immediately set a new password on their live screen.
            </span>
            <span className="font-mono font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[11px] shrink-0 self-start sm:self-auto">
              {pendingResets.length} Pending
            </span>
          </div>

          {passwordResets.length === 0 ? (
            <div className="py-8 text-center text-ink-muted">
              No password reset requests submitted for this branch.
            </div>
          ) : (
            <div className="divide-y divide-hairline border border-hairline rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
              {passwordResets.map((req) => {
                const isPending = req.status === "PENDING";
                const isApproved = req.status === "APPROVED";
                const isCompleted = req.status === "COMPLETED";

                return (
                  <div key={req.id} className="p-3 sm:p-3.5 bg-surface hover:bg-canvas-soft/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0 w-full sm:w-auto">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-ink truncate max-w-[200px] sm:max-w-none">
                          {req.student_name || "Enrolled Student"}
                        </span>
                        <span className="font-mono text-xs text-ink-muted bg-canvas-soft border border-hairline px-2 py-0.5 rounded shrink-0">
                          {req.roll_number}
                        </span>
                        <BadgePill
                          label={req.status}
                          color={
                            isPending
                              ? "orange"
                              : isApproved
                              ? "teal"
                              : isCompleted
                              ? "green"
                              : "gray"
                          }
                        />
                      </div>
                      <div className="text-[11px] text-ink-muted flex items-center gap-1.5 sm:gap-3 flex-wrap">
                        {req.student_email && <span className="truncate max-w-[180px] sm:max-w-none">{req.student_email}</span>}
                        <span>• Requested {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {req.approved_at && (
                          <span>• Approved {new Date(req.approved_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-hairline/60">
                      {isPending ? (
                        <>
                          <button
                            type="button"
                            disabled={actionLoadingId === req.id}
                            onClick={() => handleRejectReset(req.id, req.student_name || req.roll_number)}
                            className="flex-1 sm:flex-none px-3 py-1.5 text-xs font-semibold rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors cursor-pointer text-center"
                          >
                            Reject
                          </button>
                          <ButtonPrimary
                            size="sm"
                            className="flex-1 sm:flex-none justify-center"
                            isLoading={actionLoadingId === req.id}
                            onClick={() => handleApproveReset(req.id, req.student_name || req.roll_number)}
                          >
                            <Check className="h-3.5 w-3.5 mr-1" />
                            Approve
                          </ButtonPrimary>
                        </>
                      ) : isApproved ? (
                        <span className="w-full sm:w-auto text-center text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-md">
                          Approved • Waiting on Student
                        </span>
                      ) : isCompleted ? (
                        <span className="w-full sm:w-auto text-center text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                          Password Reset Completed
                        </span>
                      ) : (
                        <span className="w-full sm:w-auto text-center text-[11px] text-ink-faint">
                          Rejected
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end pt-2 border-t border-hairline">
            <ButtonUtility onClick={() => setResetModalOpen(false)}>
              Close
            </ButtonUtility>
          </div>
        </div>
      </ModalCard>
    </div>
  );
}
