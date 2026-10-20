"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  MapPin,
  Users,
  Plus,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  KeyRound,
  Mail,
  UserCheck,
  AlertCircle,
  BookOpen,
  X,
  Trash2,
  Loader2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { api, getAuthToken } from "@/lib/api";
import {
  ButtonPrimary,
  ButtonUtility,
  FeatureCard,
  BadgePill,
  FormInput,
  ModalCard,
  TenancySkeleton,
} from "@/components/ui";
import { useTenant } from "@/lib/TenantContext";
import { useToast } from "@/lib/ToastContext";

export default function TenancyManagementPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { setBranchId, refreshTenancy, currentUser, isBranchManager, isLoggingOut } = useTenant();
  const [institutes, setInstitutes] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal States
  const [isInstModalOpen, setIsInstModalOpen] = useState(false);
  const [newInstName, setNewInstName] = useState("");
  const [newInstCode, setNewInstCode] = useState("");
  const [newInstSubjects, setNewInstSubjects] = useState<string[]>(["Physics", "Chemistry", "Maths", "Biology"]);
  const [newSubjectInput, setNewSubjectInput] = useState("");

  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [existingInstSubjectInput, setExistingInstSubjectInput] = useState("");

  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [targetInstId, setTargetInstId] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchCode, setNewBranchCode] = useState("");
  const [newBranchCity, setNewBranchCity] = useState("");

  const [isManagerModalOpen, setIsManagerModalOpen] = useState(false);
  const [targetBranchId, setTargetBranchId] = useState("");
  const [newMgrName, setNewMgrName] = useState("");
  const [newMgrEmail, setNewMgrEmail] = useState("");
  const [newMgrPassword, setNewMgrPassword] = useState("");

  // Delete Institute States
  const [isDeleteInstModalOpen, setIsDeleteInstModalOpen] = useState(false);
  const [instToDelete, setInstToDelete] = useState<any | null>(null);
  const [deleteConfirmCode, setDeleteConfirmCode] = useState("");
  const [isDeletingInst, setIsDeletingInst] = useState(false);

  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isLoggingOut) return;
    const token = getAuthToken();
    if (!token) {
      router.replace("/auth/login?role=staff&redirect=/admin/tenancy");
      return;
    }
    if (isBranchManager) {
      router.replace("/branch/batches");
      return;
    }
    loadAll();
  }, [isBranchManager, isLoggingOut, router]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [instList, branchList, userList] = await Promise.all([
        api.listInstitutes().catch(() => []),
        api.listBranches().catch(() => []),
        api.listUsers("BRANCH_MANAGER").catch(() => []),
      ]);
      setInstitutes(instList);
      setBranches(branchList);
      setManagers(userList);
    } catch (e) {
      console.error("Failed to load tenancy data:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInstitute = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setIsSubmitting(true);
    const instName = newInstName.trim();
    try {
      await api.createInstitute({
        name: instName,
        code: newInstCode.trim(),
        subjects: newInstSubjects,
      });
      setIsInstModalOpen(false);
      setNewInstName("");
      setNewInstCode("");
      setNewInstSubjects(["Physics", "Chemistry", "Maths", "Biology"]);
      setNewSubjectInput("");
      toast.success(`Institute "${instName}" created successfully!`, { title: "Institute Created" });
      await refreshTenancy();
      await loadAll();
    } catch (err: any) {
      const msg = err.message || "Failed to create institute";
      setActionError(msg);
      toast.error(msg, { title: "Creation Failed" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddSubjectToExistingInst = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!existingInstSubjectInput.trim() || !targetInstId) return;
    setActionError(null);
    setIsSubmitting(true);
    const subList = existingInstSubjectInput
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await api.addInstituteSubjects(targetInstId, subList);
      setIsSubjectModalOpen(false);
      setExistingInstSubjectInput("");
      toast.success(`Subject(s) added successfully!`, { title: "Subjects Updated" });
      await loadAll();
    } catch (err: any) {
      const msg = err.message || "Failed to add subjects";
      setActionError(msg);
      toast.error(msg, { title: "Update Failed" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteInstitute = async () => {
    if (!instToDelete) return;
    setIsDeletingInst(true);
    setActionError(null);
    try {
      const res = await api.deleteInstitute(instToDelete.id);
      setIsDeleteInstModalOpen(false);
      setInstToDelete(null);
      setDeleteConfirmCode("");
      toast.success(
        res.message || `Institute "${instToDelete.name}" and all cascaded data were permanently deleted.`,
        { title: "Institute Deleted" }
      );
      await refreshTenancy();
      await loadAll();
    } catch (err: any) {
      const msg = err.message || "Failed to delete institute";
      setActionError(msg);
      toast.error(msg, { title: "Deletion Failed" });
    } finally {
      setIsDeletingInst(false);
    }
  };

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setIsSubmitting(true);
    const branchName = newBranchName.trim();
    const branchCity = newBranchCity.trim();
    try {
      await api.createBranch({
        institute_id: targetInstId,
        name: branchName,
        code: newBranchCode.trim(),
        city: branchCity,
      });
      setIsBranchModalOpen(false);
      setNewBranchName("");
      setNewBranchCode("");
      setNewBranchCity("");
      toast.success(`Branch "${branchName}" (${branchCity}) created successfully!`, { title: "Branch Created" });
      await refreshTenancy();
      await loadAll();
    } catch (err: any) {
      const msg = err.message || "Failed to create branch";
      setActionError(msg);
      toast.error(msg, { title: "Creation Failed" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAssignManager = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setIsSubmitting(true);
    const mgrName = newMgrName.trim();
    try {
      const selectedBranch = branches.find((b) => b.id === targetBranchId);
      await api.createUser({
        full_name: mgrName,
        email: newMgrEmail.trim(),
        password: newMgrPassword,
        role: "BRANCH_MANAGER",
        branch_id: targetBranchId,
        institute_id: selectedBranch?.institute_id,
      });
      setIsManagerModalOpen(false);
      setNewMgrName("");
      setNewMgrEmail("");
      setNewMgrPassword("");
      toast.success(`Branch Manager "${mgrName}" created and assigned!`, { title: "Manager Assigned" });
      await loadAll();
    } catch (err: any) {
      const msg = err.message || "Failed to assign branch manager";
      setActionError(msg);
      toast.error(msg, { title: "Assignment Failed" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasToken = typeof window !== "undefined" && Boolean(getAuthToken());
  if (loading || isLoggingOut || !hasToken || isBranchManager) {
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
            Coaching Institutes, Branches & Managers
          </h1>
          <p className="text-xs sm:text-sm text-ink-muted mt-0.5">
            Create coaching chains, register physical branches, and provision scoped credentials for Branch Managers.
          </p>
        </div>

        <ButtonPrimary
          onClick={() => {
            setActionError(null);
            setIsInstModalOpen(true);
          }}
          size="sm"
          className="self-start sm:self-auto"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Register Coaching Institute
        </ButtonPrimary>
      </div>

      {loading ? (
        <div className="py-20 text-center text-xs text-ink-muted animate-pulse">
          Loading coaching institutes, branches, and manager credentials...
        </div>
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
          {institutes.map((inst) => {
            const instBranches = branches.filter((b) => b.institute_id === inst.id);

            return (
              <FeatureCard key={inst.id} className="p-6 space-y-5">
                {/* Institute Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-hairline">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-ink">{inst.name}</h2>
                      <BadgePill label={`Code: ${inst.code}`} color="purple" />
                    </div>
                    <p className="text-xs text-ink-muted font-mono">
                      ID: {inst.id} • Registered: {new Date(inst.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                    <ButtonUtility
                      onClick={() => {
                        setActionError(null);
                        setTargetInstId(inst.id);
                        setIsBranchModalOpen(true);
                      }}
                      className="font-semibold py-1.5 px-3 text-xs"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1 text-primary" />
                      Add Physical Branch
                    </ButtonUtility>

                    <button
                      type="button"
                      onClick={() => {
                        setActionError(null);
                        setInstToDelete(inst);
                        setDeleteConfirmCode("");
                        setIsDeleteInstModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-critical hover:bg-critical/10 border border-critical/30 transition-colors cursor-pointer"
                      title="Cascade delete institute, branches, batches, exams, scores, and cloud files"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete Institute
                    </button>
                  </div>
                </div>

                {/* Institute Curriculum & Subjects */}
                <div className="flex flex-wrap items-center gap-1.5 py-2 px-3 rounded-lg bg-surface border border-hairline">
                  <span className="text-[11px] font-semibold text-ink-muted flex items-center gap-1 mr-1">
                    <BookOpen className="h-3.5 w-3.5 text-primary" />
                    Curriculum Subjects:
                  </span>
                  {(inst.subjects && Array.isArray(inst.subjects) && inst.subjects.length > 0
                    ? inst.subjects
                    : ["Physics", "Chemistry", "Maths", "Biology"]
                  ).map((sub: string) => (
                    <span
                      key={sub}
                      className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-canvas-soft border border-hairline text-ink"
                    >
                      {sub}
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setActionError(null);
                      setTargetInstId(inst.id);
                      setExistingInstSubjectInput("");
                      setIsSubjectModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary-active px-2 py-0.5 rounded-md hover:bg-primary/5 transition-colors cursor-pointer"
                  >
                    <Plus className="h-3 w-3" />
                    Add Subject
                  </button>
                </div>

                {/* Branches List */}
                {instBranches.length === 0 ? (
                  <div className="rounded-md border border-dashed border-hairline bg-canvas-soft/60 p-6 text-center space-y-2">
                    <MapPin className="h-5 w-5 text-ink-muted mx-auto" />
                    <p className="text-xs text-ink-muted">
                      No physical campuses or centres registered for {inst.name} yet.
                    </p>
                    <button
                      onClick={() => {
                        setActionError(null);
                        setTargetInstId(inst.id);
                        setIsBranchModalOpen(true);
                      }}
                      className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add First Branch
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {instBranches.map((br) => {
                      const branchManagers = managers.filter((m) => m.branch_id === br.id);

                      return (
                        <div
                          key={br.id}
                          className="rounded-lg border border-hairline bg-canvas-soft p-4 sm:p-5 space-y-4 flex flex-col justify-between"
                        >
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h3 className="text-sm font-bold text-ink flex items-center gap-1.5">
                                  <MapPin className="h-4 w-4 text-primary shrink-0" />
                                  {br.name}
                                </h3>
                                <div className="text-xs text-ink-muted mt-0.5">
                                  City: <span className="font-medium text-ink-secondary">{br.city}</span> • Code:{" "}
                                  <span className="font-mono font-semibold text-ink">{br.code}</span>
                                </div>
                              </div>
                              <BadgePill label="Branch" color="teal" />
                            </div>

                            {/* Assigned Branch Managers */}
                            <div className="pt-2 border-t border-hairline space-y-2">
                              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted block">
                                Assigned Branch Managers ({branchManagers.length})
                              </span>

                              {branchManagers.length === 0 ? (
                                <div className="text-xs text-ink-muted italic bg-surface p-2 rounded-md border border-hairline">
                                  No manager credentials assigned yet.
                                </div>
                              ) : (
                                <div className="space-y-1.5">
                                  {branchManagers.map((mgr) => (
                                    <div
                                      key={mgr.id}
                                      className="flex items-center justify-between gap-2 bg-surface p-2 rounded-md border border-hairline text-xs"
                                    >
                                      <div className="flex items-center gap-2 truncate">
                                        <div className="h-6 w-6 rounded-full bg-[#edf5fd] text-primary flex items-center justify-center font-bold text-[11px] shrink-0">
                                          {mgr.full_name?.charAt(0) || "M"}
                                        </div>
                                        <div className="truncate">
                                          <div className="font-bold text-ink truncate">
                                            {mgr.full_name}
                                          </div>
                                          <div className="text-[11px] text-ink-muted truncate">
                                            {mgr.email}
                                          </div>
                                        </div>
                                      </div>
                                      <span className="text-[10px] text-[#1aae39] font-medium shrink-0 bg-[#eaf7ed] px-1.5 py-0.5 rounded">
                                        Active
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="pt-3 border-t border-hairline flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => {
                                setActionError(null);
                                setTargetBranchId(br.id);
                                setIsManagerModalOpen(true);
                              }}
                              className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Assign Manager
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setBranchId(br.id);
                                router.push("/branch/batches");
                              }}
                              className="text-xs text-primary hover:text-primary-active inline-flex items-center gap-1 font-semibold"
                            >
                              <span>Switch to Branch & View</span>
                              <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </FeatureCard>
            );
          })}
        </div>
      )}

      {/* MODAL 1: Register Coaching Institute */}
      <ModalCard
        isOpen={isInstModalOpen}
        onClose={() => setIsInstModalOpen(false)}
        title="Register Coaching Institute"
      >
        <form onSubmit={handleCreateInstitute} className="space-y-4">
          {actionError && (
            <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 p-2.5 text-xs text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{actionError}</span>
            </div>
          )}

          <FormInput
            label="Institute Name"
            required
            placeholder="e.g. Allen Career Institute / Resonance"
            value={newInstName}
            onChange={(e) => setNewInstName(e.target.value)}
          />

          <FormInput
            label="Unique Code"
            required
            placeholder="e.g. ALLEN / RESO / FIITJEE"
            value={newInstCode}
            onChange={(e) => setNewInstCode(e.target.value.toUpperCase())}
          />

          {/* Curriculum Subjects */}
          <div className="space-y-2 pt-1 border-t border-hairline">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-ink-secondary">
                Curriculum Subjects
              </label>
              <span className="text-[10px] text-ink-muted font-mono">
                {newInstSubjects.length} subjects configured
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 bg-canvas-soft rounded-md border border-hairline">
              {newInstSubjects.map((sub, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
                >
                  {sub}
                  <button
                    type="button"
                    onClick={() => setNewInstSubjects(newInstSubjects.filter((_, i) => i !== idx))}
                    className="hover:text-red-500 rounded-full"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Type subject name (e.g. Computer Science) & press Add"
                value={newSubjectInput}
                onChange={(e) => setNewSubjectInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (newSubjectInput.trim()) {
                      const clean = newSubjectInput.trim();
                      if (!newInstSubjects.map((s) => s.toLowerCase()).includes(clean.toLowerCase())) {
                        setNewInstSubjects([...newInstSubjects, clean]);
                      }
                      setNewSubjectInput("");
                    }
                  }
                }}
                className="flex-1 rounded-md border border-hairline bg-surface p-2 text-xs text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none"
              />
              <ButtonUtility
                type="button"
                onClick={() => {
                  if (newSubjectInput.trim()) {
                    const clean = newSubjectInput.trim();
                    if (!newInstSubjects.map((s) => s.toLowerCase()).includes(clean.toLowerCase())) {
                      setNewInstSubjects([...newInstSubjects, clean]);
                    }
                    setNewSubjectInput("");
                  }
                }}
                className="text-xs py-2 px-3"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </ButtonUtility>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-muted pt-0.5">
              <span>Quick add:</span>
              {["Physics", "Chemistry", "Maths", "Biology", "English", "Informatics"].map((suggested) => (
                <button
                  key={suggested}
                  type="button"
                  onClick={() => {
                    if (!newInstSubjects.map((s) => s.toLowerCase()).includes(suggested.toLowerCase())) {
                      setNewInstSubjects([...newInstSubjects, suggested]);
                    }
                  }}
                  className="hover:text-primary text-[11px] font-medium px-1.5 py-0.5 rounded bg-surface border border-hairline hover:border-primary/40 cursor-pointer"
                >
                  +{suggested}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-hairline">
            <ButtonUtility
              type="button"
              onClick={() => setIsInstModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </ButtonUtility>
            <ButtonPrimary type="submit" isLoading={isSubmitting}>
              Create Institute
            </ButtonPrimary>
          </div>
        </form>
      </ModalCard>

      {/* MODAL 2: Add Physical Branch */}
      <ModalCard
        isOpen={isBranchModalOpen}
        onClose={() => setIsBranchModalOpen(false)}
        title="Register Physical Branch / Centre"
      >
        <form onSubmit={handleCreateBranch} className="space-y-4">
          {actionError && (
            <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 p-2.5 text-xs text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{actionError}</span>
            </div>
          )}

          <FormInput
            label="Branch / Centre Name"
            required
            placeholder="e.g. Kota Main Campus / South Ex Centre"
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
          />

          <FormInput
            label="Branch Code"
            required
            placeholder="e.g. KOTA-MAIN / DEL-SEX"
            value={newBranchCode}
            onChange={(e) => setNewBranchCode(e.target.value.toUpperCase())}
          />

          <FormInput
            label="City"
            required
            placeholder="e.g. Kota / New Delhi / Mumbai"
            value={newBranchCity}
            onChange={(e) => setNewBranchCity(e.target.value)}
          />

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-hairline">
            <ButtonUtility
              type="button"
              onClick={() => setIsBranchModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </ButtonUtility>
            <ButtonPrimary type="submit" isLoading={isSubmitting}>
              Register Branch
            </ButtonPrimary>
          </div>
        </form>
      </ModalCard>

      {/* MODAL 3: Assign Branch Manager */}
      <ModalCard
        isOpen={isManagerModalOpen}
        onClose={() => setIsManagerModalOpen(false)}
        title="Provision Branch Manager Account"
      >
        <form onSubmit={handleAssignManager} className="space-y-4">
          {actionError && (
            <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 p-2.5 text-xs text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{actionError}</span>
            </div>
          )}

          <p className="text-xs text-ink-muted leading-relaxed">
            This manager will receive scoped access exclusively to batches, students, 30-min submission windows, and answer sheets for this branch.
          </p>

          <FormInput
            label="Manager Full Name"
            required
            placeholder="e.g. Rajesh Sharma"
            value={newMgrName}
            onChange={(e) => setNewMgrName(e.target.value)}
          />

          <FormInput
            label="Manager Email"
            type="email"
            required
            placeholder="e.g. manager.kota@papergrade.ai"
            value={newMgrEmail}
            onChange={(e) => setNewMgrEmail(e.target.value)}
          />

          <FormInput
            label="Initial Password"
            type="password"
            required
            placeholder="••••••••••••"
            value={newMgrPassword}
            onChange={(e) => setNewMgrPassword(e.target.value)}
          />

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-hairline">
            <ButtonUtility
              type="button"
              onClick={() => setIsManagerModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </ButtonUtility>
            <ButtonPrimary type="submit" isLoading={isSubmitting}>
              Provision Manager
            </ButtonPrimary>
          </div>
        </form>
      </ModalCard>

      {/* MODAL 4: Add Subject to Existing Institute */}
      <ModalCard
        isOpen={isSubjectModalOpen}
        onClose={() => setIsSubjectModalOpen(false)}
        title="Add Curriculum Subject to Institute"
      >
        <form onSubmit={handleAddSubjectToExistingInst} className="space-y-4">
          {actionError && (
            <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 p-2.5 text-xs text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{actionError}</span>
            </div>
          )}

          <p className="text-xs text-ink-muted leading-relaxed">
            Configure approved academic subjects for this institute. Teachers and branch managers can select these subjects when creating exams and entering results.
          </p>

          <FormInput
            label="Subject Name(s)"
            required
            placeholder="e.g. Physics, Chemistry, Computer Science"
            value={existingInstSubjectInput}
            onChange={(e) => setExistingInstSubjectInput(e.target.value)}
          />

          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-muted">
            <span>Quick add:</span>
            {["Physics", "Chemistry", "Maths", "Biology", "English", "Informatics", "Accountancy"].map((suggested) => (
              <button
                key={suggested}
                type="button"
                onClick={() => {
                  const current = existingInstSubjectInput.trim();
                  if (!current) {
                    setExistingInstSubjectInput(suggested);
                  } else if (!current.toLowerCase().includes(suggested.toLowerCase())) {
                    setExistingInstSubjectInput(`${current}, ${suggested}`);
                  }
                }}
                className="hover:text-primary text-[11px] font-medium px-1.5 py-0.5 rounded bg-surface border border-hairline hover:border-primary/40 cursor-pointer"
              >
                +{suggested}
              </button>
            ))}
          </div>

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-hairline">
            <ButtonUtility
              type="button"
              onClick={() => setIsSubjectModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </ButtonUtility>
            <ButtonPrimary type="submit" isLoading={isSubmitting}>
              Add Subject
            </ButtonPrimary>
          </div>
        </form>
      </ModalCard>

      {/* Cascade Delete Institute Confirmation Modal */}
      {isDeleteInstModalOpen && instToDelete && (
        <ModalCard
          isOpen={isDeleteInstModalOpen}
          onClose={() => !isDeletingInst && setIsDeleteInstModalOpen(false)}
          title={`Delete Institute: ${instToDelete.name}`}
          maxWidth="max-w-lg"
          preventBackdropClose={isDeletingInst}
          disableClose={isDeletingInst}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-1 border-b border-hairline">
              <span className="text-xs text-ink-muted">
                Permanent cascade deletion for code: <strong className="font-mono text-ink">{instToDelete.code}</strong>
              </span>
              <BadgePill label="High Risk Operation" color="pink" className="bg-red-50 text-red-700 border-red-200" />
            </div>
            {/* Warning Banner */}
            <div className="rounded-lg border border-red-200 bg-red-50/70 p-4 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-red-900 uppercase tracking-wider">
                    Permanent Irreversible Action
                  </h4>
                  <p className="text-xs text-red-700 leading-relaxed">
                    Deleting <strong>{instToDelete.name}</strong> will trigger a complete cascade wipe. Everything associated with this coaching institute will be permanently eradicated:
                  </p>
                </div>
              </div>

              <ul className="text-xs text-red-800 list-disc list-inside space-y-1 pl-6">
                <li>All campus branches and physical centres</li>
                <li>All academic batches and student rosters</li>
                <li>All student and branch manager user accounts</li>
                <li>All examinations, question papers, and official rubrics</li>
                <li>All answer sheet submissions and AI evaluation scores</li>
                <li>All revaluations, audits, and telemetry logs</li>
                <li>All Cloudinary files (raw PDFs, annotated PDFs, renders)</li>
              </ul>
            </div>

            {actionError && (
              <div className="p-3 bg-[#fdf2f2] border border-[#f8b4b4] rounded-md text-xs text-critical flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            {/* Confirmation Input */}
            <div className="space-y-2 pt-1">
              <label className="text-xs font-semibold text-ink block">
                To confirm deletion, please type the institute code{" "}
                <span className="font-mono px-1.5 py-0.5 rounded bg-surface border border-hairline font-bold text-critical">
                  {instToDelete.code}
                </span>{" "}
                below:
              </label>
              <input
                type="text"
                value={deleteConfirmCode}
                onChange={(e) => setDeleteConfirmCode(e.target.value)}
                placeholder={`Type "${instToDelete.code}" to confirm`}
                disabled={isDeletingInst}
                className="w-full text-xs font-mono px-3 py-2 rounded-md border border-hairline bg-surface focus:outline-none focus:ring-1 focus:ring-critical focus:border-critical"
                autoFocus
              />
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-2 pt-3 border-t border-hairline">
              <ButtonUtility
                type="button"
                onClick={() => {
                  setIsDeleteInstModalOpen(false);
                  setInstToDelete(null);
                  setDeleteConfirmCode("");
                }}
                disabled={isDeletingInst}
              >
                Cancel
              </ButtonUtility>

              <button
                type="button"
                onClick={handleDeleteInstitute}
                disabled={
                  isDeletingInst ||
                  deleteConfirmCode.trim().toUpperCase() !== instToDelete.code.trim().toUpperCase()
                }
                className="inline-flex items-center justify-center px-4 py-2 rounded-md text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-xs cursor-pointer"
              >
                {isDeletingInst ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Wiping Institute & Cloud Storage...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Cascade Delete Institute
                  </>
                )}
              </button>
            </div>
          </div>
        </ModalCard>
      )}
    </div>
  );
}
