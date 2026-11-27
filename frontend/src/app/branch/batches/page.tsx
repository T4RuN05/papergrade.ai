"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, KeyRound, Layers, Users, CheckCircle2 } from "lucide-react";
import { api, getAuthToken } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import {
  useTenancyBatches,
  useBatchStudents,
  usePasswordResets,
} from "@/lib/queries";
import { useTenant } from "@/lib/TenantContext";
import { useToast } from "@/lib/ToastContext";
import {
  BatchesRosterSkeleton,
  MetricValue,
  useConfirm,
} from "@/components/ui";

// Extracted Microcomponents
import { BatchSidebarList } from "@/components/batches/BatchSidebarList";
import { BatchRosterTable } from "@/components/batches/BatchRosterTable";
import { BatchCreateModal } from "@/components/batches/modals/BatchCreateModal";
import { StudentAddModal } from "@/components/batches/modals/StudentAddModal";
import { RosterCsvImportModal } from "@/components/batches/modals/RosterCsvImportModal";
import { PasswordResetRequestsModal } from "@/components/batches/modals/PasswordResetRequestsModal";

export default function BranchBatchesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const { selectedBranch, currentUser } = useTenant();

  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState<string>("");
  const [mounted, setMounted] = useState<boolean>(false);

  // Modals state
  const [createBatchOpen, setCreateBatchOpen] = useState(false);
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [isSubmittingStudent, setIsSubmittingStudent] = useState(false);
  const [importRosterOpen, setImportRosterOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const effectiveBranchId = useMemo(() => {
    return (
      selectedBranch?.id ||
      currentUser?.branch_id ||
      (typeof window !== "undefined"
        ? localStorage.getItem("papergrade_selected_branch_id")
        : null) ||
      undefined
    );
  }, [selectedBranch?.id, currentUser?.branch_id]);

  // Auth guard
  useEffect(() => {
    const token = getAuthToken();
    if (!token && mounted) {
      window.location.replace("/auth/login?role=staff&redirect=/branch/batches");
    }
  }, [mounted]);

  // TanStack Query: Batches for current branch
  const {
    data: batchesData = [],
    isLoading: loadingBatches,
    refetch: refetchBatches,
  } = useTenancyBatches(effectiveBranchId);

  // TanStack Query: Password reset requests (auto-polls every 45s, staleTime 15s)
  const {
    data: passwordResets = [],
    refetch: refetchResets,
  } = usePasswordResets(undefined, "student");

  // Keep selectedBatch in sync with batchesData
  const selectedBatch = useMemo(() => {
    if (!batchesData || batchesData.length === 0) return null;
    if (selectedBatchId) {
      const match = batchesData.find((b: any) => b.id === selectedBatchId);
      if (match) return match;
    }
    return batchesData[0] || null;
  }, [batchesData, selectedBatchId]);

  // TanStack Query: Students for selected batch
  const {
    data: students = [],
    isLoading: loadingStudents,
    refetch: refetchStudents,
  } = useBatchStudents(selectedBatch?.id || "");

  const pendingResets = useMemo(() => {
    return passwordResets.filter((r: any) => r.status === "PENDING");
  }, [passwordResets]);

  const claimedCount = useMemo(() => {
    return students.filter((s: any) => s.account_claimed).length;
  }, [students]);

  // Handlers
  const handleApproveReset = async (id: string, name: string) => {
    setActionLoadingId(id);
    try {
      await api.approvePasswordReset(id);
      toast.success(
        `Password reset approved for ${name}. The student can now enter their new password!`,
        { title: "Request Approved", duration: 5000 }
      );
      await refetchResets();
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
      await refetchResets();
    } catch (err: any) {
      toast.error(err.message || "Failed to reject request", { title: "Rejection Error" });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCreateBatch = async (data: { name: string; academic_year: string }) => {
    if (!effectiveBranchId) return;
    setIsSubmittingBatch(true);
    try {
      const res = await api.createBatch({
        branch_id: effectiveBranchId,
        name: data.name,
        academic_year: data.academic_year,
      });
      setCreateBatchOpen(false);
      toast.success(`Batch "${data.name}" created successfully!`, { title: "Batch Created" });

      if (res?.id) {
        setSelectedBatchId(res.id);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.tenancy.batches(effectiveBranchId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.batches.all() });
      await refetchBatches();
    } catch (err: any) {
      toast.error(err.message || "Failed to create batch.", { title: "Creation Failed" });
    } finally {
      setIsSubmittingBatch(false);
    }
  };

  const handleAddStudent = async (data: { full_name: string; email?: string }): Promise<string | null> => {
    if (!selectedBatch) return null;
    setIsSubmittingStudent(true);
    try {
      const res = await api.addStudent(selectedBatch.id, data);
      const assignedRoll = res?.roll_number || "Enrolled";
      toast.success(
        `Student "${data.full_name}" enrolled with Roll Number ${assignedRoll}.`,
        { title: "Student Enrolled" }
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.batches.students(selectedBatch.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tenancy.batches(effectiveBranchId) });
      await Promise.all([refetchStudents(), refetchBatches()]);
      return assignedRoll;
    } catch (err: any) {
      toast.error(err.message || "Failed to add student.", { title: "Enrollment Failed" });
      return null;
    } finally {
      setIsSubmittingStudent(false);
    }
  };

  const handleImportRoster = async (file: File) => {
    if (!selectedBatch) return null;
    try {
      const res = await api.importRoster(selectedBatch.id, file);
      const count = res.imported_count || res.students_imported || "students";
      toast.success(
        `Imported ${count} students into "${selectedBatch.name}" roster!`,
        { title: "Roster Imported" }
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.batches.students(selectedBatch.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tenancy.batches(effectiveBranchId) });
      await Promise.all([refetchStudents(), refetchBatches()]);
      return res;
    } catch (err: any) {
      toast.error(err.message || "Excel import failed.", { title: "Import Failed" });
      throw err;
    }
  };

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
      if (selectedBatchId === batchId) {
        setSelectedBatchId(null);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.tenancy.batches(effectiveBranchId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.batches.all() });
      await refetchBatches();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete batch.", { title: "Delete Failed" });
    }
  };

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
      toast.success(`Student "${studentName}" removed from roster.`, { title: "Student Removed" });
      queryClient.invalidateQueries({ queryKey: queryKeys.batches.students(selectedBatch.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tenancy.batches(effectiveBranchId) });
      await Promise.all([refetchStudents(), refetchBatches()]);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete student.", { title: "Removal Failed" });
    }
  };

  const hasToken = mounted ? Boolean(getAuthToken()) : true;
  if (!mounted || !hasToken) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto pb-16">
        <BatchesRosterSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16 cascade-group">
      {/* 1. Header */}
      <header className="pb-4 border-b border-hairline flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <span className="notion-eyebrow text-ink-secondary">Academic Operations</span>
            {selectedBranch && (
              <>
                <span className="text-ink-faint">•</span>
                <span className="font-medium text-ink-muted truncate max-w-[220px] sm:max-w-none">
                  {selectedBranch.name}
                  {selectedBranch.city ? ` (${selectedBranch.city})` : ""}
                </span>
              </>
            )}
          </div>
          <h1 className="notion-heading-2 text-2xl sm:text-[26px] text-ink">
            Batches &amp; Student Roster
          </h1>
          <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">
            Manage student batches and roster enrollments for{" "}
            <span className="font-medium text-ink">
              {selectedBranch?.name || "Active Branch"}
            </span>.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto shrink-0">
          <button
            type="button"
            onClick={() => setResetModalOpen(true)}
            className="notion-btn-utility w-full sm:w-auto justify-center"
          >
            <KeyRound className="h-3.5 w-3.5 text-ink-secondary shrink-0" />
            <span className="truncate">Password Resets</span>
            {pendingResets.length > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-canvas-soft border border-hairline text-ink tabular-nums shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <MetricValue value={pendingResets.length} animateOnMount={false} />
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setCreateBatchOpen(true)}
            className="notion-btn-primary w-full sm:w-auto justify-center"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Create Batch</span>
          </button>
        </div>
      </header>

      {/* 2. Pending Reset Requests Notice */}
      {pendingResets.length > 0 && (
        <div className="notion-card rounded-lg p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="h-8 w-8 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center shrink-0 relative">
              <KeyRound className="h-4 w-4 text-ink-secondary" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500 border border-surface" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-ink">
                {pendingResets.length} Student Password Reset Request{pendingResets.length > 1 ? "s" : ""} Pending Approval
              </div>
              <p className="text-xs text-ink-muted mt-0.5 leading-relaxed">
                Students are waiting on their login screens for verification.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setResetModalOpen(true)}
            className="notion-btn-utility w-full sm:w-auto justify-center shrink-0"
          >
            Review &amp; Approve
          </button>
        </div>
      )}

      {/* 3. Branch Overview Stats */}
      <section className="space-y-3">
        <div className="space-y-0.5">
          <h2 className="notion-section-title text-base sm:text-[18px] text-ink">
            Branch Snapshot
          </h2>
          <p className="text-xs sm:text-[13px] text-ink-muted">
            Cohort counts and student portal activation status.
          </p>
        </div>

        <div className="grid grid-cols-2 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2 sm:grid-cols-3 gap-3 cascade-fast">
          <div className="notion-card rounded-lg p-3.5 sm:p-4 flex flex-col justify-between min-h-[100px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-muted truncate">
                Active Batches
              </span>
              <span className="h-6 w-6 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-ink-secondary shrink-0">
                <Layers className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2">
              <MetricValue
                isLoading={loadingBatches}
                value={batchesData.length}
                className="notion-heading-3 text-[22px] text-ink tabular-nums"
                width="w-10"
              />
            </div>
            <div className="text-xs text-ink-muted mt-1 truncate">
              In {selectedBranch?.name || "branch"}
            </div>
          </div>

          <div className="notion-card rounded-lg p-3.5 sm:p-4 flex flex-col justify-between min-h-[100px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-muted truncate">
                Enrolled Students
              </span>
              <span className="h-6 w-6 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-ink-secondary shrink-0">
                <Users className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2">
              <MetricValue
                isLoading={loadingStudents}
                value={students.length}
                className="notion-heading-3 text-[22px] text-ink tabular-nums"
                width="w-10"
              />
            </div>
            <div className="text-xs text-ink-muted mt-1 truncate">
              Selected batch roster
            </div>
          </div>

          <div className="notion-card rounded-lg p-3.5 sm:p-4 flex flex-col justify-between min-h-[100px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-muted truncate">
                PWA Claim Rate
              </span>
              <span className="h-6 w-6 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-ink-secondary shrink-0">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2">
              <MetricValue
                isLoading={loadingStudents}
                value={
                  students.length > 0
                    ? `${Math.round((claimedCount / students.length) * 100)}%`
                    : "0%"
                }
                className="notion-heading-3 text-[22px] text-ink tabular-nums"
                width="w-12"
              />
            </div>
            <div className="text-xs text-ink-muted mt-1 truncate tabular-nums">
              {claimedCount} of {students.length} claimed
            </div>
          </div>
        </div>
      </section>

      {/* 4. Main Two-Column Roster Layout */}
      <section className="space-y-3">
        <div className="space-y-0.5">
          <h2 className="notion-section-title text-base sm:text-[18px] text-ink">
            Batch Directory &amp; Roster
          </h2>
          <p className="text-xs sm:text-[13px] text-ink-muted">
            Select a batch to manage enrolled students or import from Excel.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 items-start">
          {/* Left Column: Batches List */}
          <div className="min-w-0">
            <BatchSidebarList
              batches={batchesData}
              selectedBatch={selectedBatch}
              loadingBatches={loadingBatches}
              onSelectBatch={(b) => setSelectedBatchId(b.id)}
              onDeleteBatch={handleDeleteBatch}
              onRefresh={() => refetchBatches()}
            />
          </div>

          {/* Right Column: Selected Batch Roster Table */}
          <div className="md:col-span-2 min-w-0 space-y-4">
            <BatchRosterTable
              selectedBatch={
                selectedBatch ||
                (loadingBatches
                  ? { id: "loading", name: "Loading batch...", academic_year: "..." }
                  : null)
              }
              students={students}
              loadingStudents={loadingStudents}
              studentSearch={studentSearch}
              onSearchChange={setStudentSearch}
              onAddStudentClick={() => setAddStudentOpen(true)}
              onImportRosterClick={() => setImportRosterOpen(true)}
              onDeleteBatchClick={() => {
                if (selectedBatch) {
                  handleDeleteBatch(selectedBatch.id, selectedBatch.name);
                }
              }}
              onDeleteStudent={handleDeleteStudent}
            />
          </div>
        </div>
      </section>

      {/* Extracted Modular Modals */}
      <BatchCreateModal
        isOpen={createBatchOpen}
        onClose={() => setCreateBatchOpen(false)}
        onSubmit={handleCreateBatch}
        isSubmitting={isSubmittingBatch}
      />

      <StudentAddModal
        isOpen={addStudentOpen}
        onClose={() => setAddStudentOpen(false)}
        batchName={selectedBatch?.name}
        branchCode={selectedBranch?.code}
        onSubmit={handleAddStudent}
        isSubmitting={isSubmittingStudent}
      />

      <RosterCsvImportModal
        isOpen={importRosterOpen}
        onClose={() => setImportRosterOpen(false)}
        batchName={selectedBatch?.name}
        onSubmit={handleImportRoster}
      />

      <PasswordResetRequestsModal
        isOpen={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        branchName={selectedBranch?.name}
        resets={passwordResets}
        actionLoadingId={actionLoadingId}
        onApprove={handleApproveReset}
        onReject={handleRejectReset}
      />
    </div>
  );
}
