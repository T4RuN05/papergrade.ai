"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, KeyRound } from "lucide-react";
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
  ButtonPrimary,
  ButtonUtility,
  FeatureCard,
  BadgePill,
  StatusWell,
  BatchesRosterSkeleton,
  MetricValue,
  Skeleton,
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
  const { selectedBranch, currentUser, refreshTenancy, loading: tenantLoading } = useTenant();

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

  // Determine effective branch id across context, currentUser, or localStorage
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
            Batches &amp; Student Roster
          </h1>
          <p className="text-xs sm:text-sm text-ink-muted mt-0.5 leading-relaxed">
            Manage student batches and roster enrollments for{" "}
            <span className="font-semibold text-ink">
              {selectedBranch?.name || "Active Branch"}
            </span>.
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

          <ButtonPrimary
            onClick={() => setCreateBatchOpen(true)}
            size="sm"
            className="w-full sm:w-auto justify-center truncate"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5 shrink-0" />
            <span className="truncate">Create Batch</span>
          </ButtonPrimary>
        </div>
      </div>

      {/* 2. Pending Reset Requests Status Well */}
      {pendingResets.length > 0 && (
        <StatusWell
          variant="amber"
          icon={<KeyRound className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
          title={
            <div className="flex items-center gap-2 flex-wrap">
              <span>
                {pendingResets.length} Student Password Reset Request
                {pendingResets.length > 1 ? "s" : ""} Pending Approval
              </span>
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
          <MetricValue
            isLoading={loadingBatches}
            value={batchesData.length}
            className="text-xl sm:text-2xl font-bold font-mono text-ink"
            width="w-10"
          />
          <p className="hidden sm:block text-[11px] text-ink-faint truncate">
            Academic batches in {selectedBranch?.name || "branch"}
          </p>
        </FeatureCard>

        <FeatureCard className="p-3 sm:p-4 space-y-1">
          <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-ink-muted truncate">
            Enrolled Students
          </div>
          <MetricValue
            isLoading={loadingStudents}
            value={students.length}
            className="text-xl sm:text-2xl font-bold font-mono text-ink"
            width="w-10"
          />
          <p className="hidden sm:block text-[11px] text-ink-faint truncate">
            In currently selected batch
          </p>
        </FeatureCard>

        <FeatureCard className="p-3 sm:p-4 space-y-1">
          <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-ink-muted truncate">
            PWA Claim Rate
          </div>
          <MetricValue
            isLoading={loadingStudents}
            value={
              students.length > 0
                ? `${Math.round((claimedCount / students.length) * 100)}%`
                : "0%"
            }
            className="text-xl sm:text-2xl font-bold font-mono text-emerald-600"
            width="w-12"
          />
          <p className="hidden sm:block text-[11px] text-ink-faint truncate">
            {claimedCount} of {students.length} claimed
          </p>
        </FeatureCard>
      </div>

      {/* 4. Main Two-Column Roster Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 items-start">
        {/* Left Column: Batches List */}
        <BatchSidebarList
          batches={batchesData}
          selectedBatch={selectedBatch}
          loadingBatches={loadingBatches}
          onSelectBatch={(b) => setSelectedBatchId(b.id)}
          onDeleteBatch={handleDeleteBatch}
          onRefresh={() => refetchBatches()}
        />

        {/* Right Column: Selected Batch Roster Table */}
        <div className="md:col-span-2 space-y-4">
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
