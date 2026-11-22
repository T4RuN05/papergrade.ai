"use client";

import React, { useEffect, useState, useMemo } from "react";
import { Plus, Building2, KeyRound, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api, getAuthToken } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import {
  useTenancyInstitutes,
  useTenancyBranches,
  usePasswordResets,
} from "@/lib/queries";
import {
  ButtonPrimary,
  ButtonUtility,
  FeatureCard,
  BadgePill,
  TenancySkeleton,
} from "@/components/ui";
import { useTenant } from "@/lib/TenantContext";
import { useToast } from "@/lib/ToastContext";
import { InstituteCard } from "@/components/tenancy/InstituteCard";
import { CreateInstituteModal } from "@/components/tenancy/modals/CreateInstituteModal";
import { CreateBranchModal } from "@/components/tenancy/modals/CreateBranchModal";
import { AppointDirectorModal } from "@/components/tenancy/modals/AppointDirectorModal";
import { ProvisionManagerModal } from "@/components/tenancy/modals/ProvisionManagerModal";
import { AddCurriculumSubjectModal } from "@/components/tenancy/modals/AddCurriculumSubjectModal";
import { EditManagerModal } from "@/components/tenancy/modals/EditManagerModal";
import { DeleteManagerModal } from "@/components/tenancy/modals/DeleteManagerModal";
import { CascadeDeleteInstituteModal } from "@/components/tenancy/modals/CascadeDeleteInstituteModal";
import { StaffPasswordResetsModal } from "@/components/tenancy/modals/StaffPasswordResetsModal";

export default function TenancyManagementPage() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { setBranchId, refreshTenancy, isInstituteDirector, isBranchManager, isLoggingOut } = useTenant();

  // TanStack Query Data Layers
  const { data: institutes = [], isLoading: isLoadingInst } = useTenancyInstitutes();
  const { data: branches = [], isLoading: isLoadingBranches } = useTenancyBranches();
  const { data: staffResets = [], refetch: refetchStaffResets } = usePasswordResets(undefined, "staff");

  // Local Staff Lists (Managers & Directors)
  const [managers, setManagers] = useState<any[]>([]);
  const [directors, setDirectors] = useState<any[]>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(true);

  // Modal Visibility States
  const [isInstModalOpen, setIsInstModalOpen] = useState(false);
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [isDirectorModalOpen, setIsDirectorModalOpen] = useState(false);
  const [isManagerModalOpen, setIsManagerModalOpen] = useState(false);
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [isEditMgrModalOpen, setIsEditMgrModalOpen] = useState(false);
  const [isDeleteMgrModalOpen, setIsDeleteMgrModalOpen] = useState(false);
  const [isDeleteInstModalOpen, setIsDeleteInstModalOpen] = useState(false);
  const [isStaffResetsModalOpen, setIsStaffResetsModalOpen] = useState(false);

  // Modal Context / Target States
  const [targetInstId, setTargetInstId] = useState("");
  const [targetBranchId, setTargetBranchId] = useState("");
  const [editingMgr, setEditingMgr] = useState<any | null>(null);
  const [mgrToDelete, setMgrToDelete] = useState<any | null>(null);
  const [instToDelete, setInstToDelete] = useState<any | null>(null);

  // Action Status States
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletingInst, setIsDeletingInst] = useState(false);
  const [isDeletingMgr, setIsDeletingMgr] = useState(false);
  const [actingResetId, setActingResetId] = useState<string | null>(null);

  const loadStaffUsers = async () => {
    setIsLoadingStaff(true);
    try {
      const [mgrList, dirList] = await Promise.all([
        api.listUsers("BRANCH_MANAGER").catch(() => []),
        api.listUsers("INSTITUTE_DIRECTOR").catch(() => []),
      ]);
      setManagers(mgrList);
      setDirectors(dirList);
    } catch (e) {
      console.error("Failed to load staff users:", e);
    } finally {
      setIsLoadingStaff(false);
    }
  };

  useEffect(() => {
    if (isLoggingOut) return;
    const token = getAuthToken();
    if (!token) {
      window.location.replace("/auth/login?role=staff&redirect=/admin/tenancy");
      return;
    }
    if (isBranchManager || isInstituteDirector) {
      window.location.replace("/branch/batches");
      return;
    }
    loadStaffUsers();
  }, [isBranchManager, isInstituteDirector, isLoggingOut]);

  const pendingStaffResets = useMemo(() => {
    return (staffResets || []).filter((r: any) => r.status === "PENDING");
  }, [staffResets]);

  // Handlers: Staff Password Resets
  const handleApproveStaffReset = async (reqId: string, name: string) => {
    setActingResetId(reqId);
    try {
      await api.approvePasswordReset(reqId);
      toast.success(`Password reset approved for ${name}. They can now enter their new password!`, {
        title: "Request Authorized",
      });
      await refetchStaffResets();
    } catch (err: any) {
      toast.error(err.message || "Failed to approve request", { title: "Approval Failed" });
    } finally {
      setActingResetId(null);
    }
  };

  const handleRejectStaffReset = async (reqId: string, name: string) => {
    setActingResetId(reqId);
    try {
      await api.rejectPasswordReset(reqId);
      toast.info(`Password reset request rejected for ${name}.`, { title: "Request Rejected" });
      await refetchStaffResets();
    } catch (err: any) {
      toast.error(err.message || "Failed to reject request", { title: "Rejection Failed" });
    } finally {
      setActingResetId(null);
    }
  };

  // Handlers: Institute Operations
  const handleCreateInstitute = async (data: { name: string; code: string; subjects: string[] }) => {
    setActionError(null);
    setIsSubmitting(true);
    try {
      await api.createInstitute(data);
      setIsInstModalOpen(false);
      toast.success(`Institute "${data.name}" created successfully!`, { title: "Institute Created" });
      queryClient.invalidateQueries({ queryKey: queryKeys.tenancy.all() });
      await refreshTenancy();
    } catch (err: any) {
      const msg = err.message || "Failed to create institute";
      setActionError(msg);
      toast.error(msg, { title: "Creation Failed" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddSubject = async (subjectInput: string) => {
    if (!targetInstId) return;
    setActionError(null);
    setIsSubmitting(true);
    const subList = subjectInput
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await api.addInstituteSubjects(targetInstId, subList);
      setIsSubjectModalOpen(false);
      toast.success("Subject(s) added successfully!", { title: "Subjects Updated" });
      queryClient.invalidateQueries({ queryKey: queryKeys.tenancy.institutes() });
    } catch (err: any) {
      const msg = err.message || "Failed to add subjects";
      setActionError(msg);
      toast.error(msg, { title: "Update Failed" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteInstitute = async (instituteId: string) => {
    setIsDeletingInst(true);
    setActionError(null);
    try {
      const res = await api.deleteInstitute(instituteId);
      setIsDeleteInstModalOpen(false);
      setInstToDelete(null);
      toast.success(res.message || "Institute and all cascaded data were permanently deleted.", {
        title: "Institute Deleted",
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.tenancy.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.exams.all() });
      await refreshTenancy();
      await loadStaffUsers();
    } catch (err: any) {
      const msg = err.message || "Failed to delete institute";
      setActionError(msg);
      toast.error(msg, { title: "Deletion Failed" });
    } finally {
      setIsDeletingInst(false);
    }
  };

  // Handlers: Branch Operations
  const handleCreateBranch = async (data: { name: string; code: string; city: string }) => {
    setActionError(null);
    setIsSubmitting(true);
    try {
      await api.createBranch({
        institute_id: targetInstId,
        ...data,
      });
      setIsBranchModalOpen(false);
      toast.success(`Branch "${data.name}" (${data.city}) created successfully!`, {
        title: "Branch Created",
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.tenancy.branches() });
      await refreshTenancy();
    } catch (err: any) {
      const msg = err.message || "Failed to create branch";
      setActionError(msg);
      toast.error(msg, { title: "Creation Failed" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handlers: Staff Operations
  const handleAssignManager = async (data: { name: string; email: string; password: string }) => {
    setActionError(null);
    setIsSubmitting(true);
    try {
      const branchObj = branches.find((b: any) => b.id === targetBranchId);
      await api.createUser({
        full_name: data.name,
        email: data.email,
        password: data.password,
        role: "BRANCH_MANAGER",
        branch_id: targetBranchId,
        institute_id: branchObj?.institute_id,
      });
      setIsManagerModalOpen(false);
      toast.success(`Branch Manager "${data.name}" created and assigned!`, {
        title: "Manager Assigned",
      });
      await loadStaffUsers();
    } catch (err: any) {
      const msg = err.message || "Failed to assign branch manager";
      setActionError(msg);
      toast.error(msg, { title: "Assignment Failed" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAppointDirector = async (data: { name: string; email: string; password: string }) => {
    if (!targetInstId) return;
    setActionError(null);
    setIsSubmitting(true);
    try {
      await api.createUser({
        full_name: data.name,
        email: data.email,
        password: data.password,
        role: "INSTITUTE_DIRECTOR",
        institute_id: targetInstId,
      });
      setIsDirectorModalOpen(false);
      toast.success(`Institute Director "${data.name}" appointed successfully!`, {
        title: "Director Appointed",
      });
      await loadStaffUsers();
    } catch (err: any) {
      const msg = err.message || "Failed to appoint institute director";
      setActionError(msg);
      toast.error(msg, { title: "Appointment Failed" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateManager = async (managerId: string, payload: any) => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      await api.updateUser(managerId, payload);
      toast.success(`Manager "${payload.full_name}" updated successfully!`, { title: "Manager Updated" });
      setIsEditMgrModalOpen(false);
      setEditingMgr(null);
      await loadStaffUsers();
    } catch (err: any) {
      const msg = err.message || "Failed to update manager";
      setActionError(msg);
      toast.error(msg, { title: "Update Failed" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteManager = async (managerId: string) => {
    setIsDeletingMgr(true);
    try {
      await api.deleteUser(managerId);
      toast.success("Branch Manager removed.", { title: "Manager Removed" });
      setIsDeleteMgrModalOpen(false);
      setMgrToDelete(null);
      await loadStaffUsers();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete manager", { title: "Deletion Failed" });
    } finally {
      setIsDeletingMgr(false);
    }
  };

  const hasToken = typeof window !== "undefined" && Boolean(getAuthToken());
  const isGlobalLoading = isLoadingInst || isLoadingBranches || isLoadingStaff;

  if (isLoggingOut || !hasToken || isBranchManager) {
    return (
      <div className="space-y-8 max-w-6xl mx-auto pb-16">
        <TenancySkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-hairline">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BadgePill label="Root Admin Control Desk" color="purple" />
            <span className="text-xs text-ink-muted">• Multi-Tenant Architecture</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Coaching Institutes, Branches &amp; Managers
          </h1>
          <p className="text-xs sm:text-sm text-ink-muted mt-0.5">
            Create coaching chains, register physical branches, and provision scoped credentials for Branch Managers.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <ButtonUtility
            onClick={() => setIsStaffResetsModalOpen(true)}
            size="sm"
            className="relative"
          >
            <KeyRound className="h-4 w-4 mr-1.5 text-amber-500" />
            <span>Staff Password Resets</span>
            {pendingStaffResets.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-bold animate-pulse">
                {pendingStaffResets.length}
              </span>
            )}
          </ButtonUtility>

          <ButtonPrimary
            onClick={() => {
              setActionError(null);
              setIsInstModalOpen(true);
            }}
            size="sm"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Register Coaching Institute
          </ButtonPrimary>
        </div>
      </div>

      {/* Pending Staff Resets Banner */}
      {pendingStaffResets.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-900 dark:text-amber-200 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="font-semibold">
              {pendingStaffResets.length} Staff Password Reset Request{pendingStaffResets.length > 1 ? "s" : ""} Pending Real-Time Authorization
            </span>
          </div>
          <ButtonPrimary
            size="sm"
            onClick={() => setIsStaffResetsModalOpen(true)}
            className="self-start sm:self-auto"
          >
            Review &amp; Authorize
          </ButtonPrimary>
        </div>
      )}

      {isGlobalLoading && institutes.length === 0 ? (
        <TenancySkeleton />
      ) : institutes.length === 0 ? (
        <FeatureCard className="p-12 text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-full bg-[#edf5fd] flex items-center justify-center text-primary">
            <Building2 className="h-6 w-6" />
          </div>
          <h2 className="text-base font-bold text-ink">No Institutes Configured</h2>
          <p className="text-xs text-ink-muted max-w-md mx-auto">
            Get started by registering your first coaching chain (e.g. Allen Career Institute, Apex Institute, Resonance).
          </p>
          <div className="pt-2">
            <ButtonPrimary onClick={() => setIsInstModalOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Register Coaching Institute
            </ButtonPrimary>
          </div>
        </FeatureCard>
      ) : (
        <div className="space-y-6">
          {institutes.map((inst: any) => (
            <InstituteCard
              key={inst.id}
              institute={inst}
              branches={branches}
              directors={directors}
              managers={managers}
              onAddBranch={(instId) => {
                setActionError(null);
                setTargetInstId(instId);
                setIsBranchModalOpen(true);
              }}
              onAppointDirector={(instId) => {
                setActionError(null);
                setTargetInstId(instId);
                setIsDirectorModalOpen(true);
              }}
              onAddSubject={(instId) => {
                setActionError(null);
                setTargetInstId(instId);
                setIsSubjectModalOpen(true);
              }}
              onDeleteInstitute={(institute) => {
                setActionError(null);
                setInstToDelete(institute);
                setIsDeleteInstModalOpen(true);
              }}
              onEditManager={(manager) => {
                setActionError(null);
                setEditingMgr(manager);
                setIsEditMgrModalOpen(true);
              }}
              onDeleteManager={(manager) => {
                setMgrToDelete(manager);
                setIsDeleteMgrModalOpen(true);
              }}
              onAssignManager={(branchId) => {
                setActionError(null);
                setTargetBranchId(branchId);
                setIsManagerModalOpen(true);
              }}
              onSelectBranch={(branchId) => {
                setBranchId(branchId);
                router.push("/branch/batches");
              }}
            />
          ))}
        </div>
      )}

      {/* Extracted Modular Modals */}
      <CreateInstituteModal
        isOpen={isInstModalOpen}
        onClose={() => setIsInstModalOpen(false)}
        onSubmit={handleCreateInstitute}
        isSubmitting={isSubmitting}
        error={actionError}
      />

      <CreateBranchModal
        isOpen={isBranchModalOpen}
        onClose={() => setIsBranchModalOpen(false)}
        onSubmit={handleCreateBranch}
        isSubmitting={isSubmitting}
        error={actionError}
      />

      <AppointDirectorModal
        isOpen={isDirectorModalOpen}
        onClose={() => setIsDirectorModalOpen(false)}
        onSubmit={handleAppointDirector}
        isSubmitting={isSubmitting}
        error={actionError}
      />

      <ProvisionManagerModal
        isOpen={isManagerModalOpen}
        onClose={() => setIsManagerModalOpen(false)}
        onSubmit={handleAssignManager}
        isSubmitting={isSubmitting}
        error={actionError}
      />

      <AddCurriculumSubjectModal
        isOpen={isSubjectModalOpen}
        onClose={() => setIsSubjectModalOpen(false)}
        onSubmit={handleAddSubject}
        isSubmitting={isSubmitting}
        error={actionError}
      />

      <EditManagerModal
        isOpen={isEditMgrModalOpen}
        manager={editingMgr}
        branches={branches}
        institutes={institutes}
        onClose={() => {
          setIsEditMgrModalOpen(false);
          setEditingMgr(null);
        }}
        onSubmit={handleUpdateManager}
        isSubmitting={isSubmitting}
        error={actionError}
      />

      <DeleteManagerModal
        isOpen={isDeleteMgrModalOpen}
        manager={mgrToDelete}
        onClose={() => {
          setIsDeleteMgrModalOpen(false);
          setMgrToDelete(null);
        }}
        onConfirmDelete={handleDeleteManager}
        isDeleting={isDeletingMgr}
      />

      <CascadeDeleteInstituteModal
        isOpen={isDeleteInstModalOpen}
        institute={instToDelete}
        onClose={() => {
          setIsDeleteInstModalOpen(false);
          setInstToDelete(null);
        }}
        onConfirmDelete={handleDeleteInstitute}
        isDeleting={isDeletingInst}
        error={actionError}
      />

      <StaffPasswordResetsModal
        isOpen={isStaffResetsModalOpen}
        onClose={() => setIsStaffResetsModalOpen(false)}
        resets={staffResets}
        actingResetId={actingResetId}
        onApprove={handleApproveStaffReset}
        onReject={handleRejectStaffReset}
      />
    </div>
  );
}
