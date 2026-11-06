"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import { api, getAuthToken, getStoredUser, setStoredUser, getStoredUserPayload } from "@/lib/api";
import { queueToast } from "@/lib/ToastContext";

export interface Institute {
  id: string;
  name: string;
  code: string;
}

export interface Branch {
  id: string;
  institute_id: string;
  name: string;
  code: string;
  city: string;
}

interface TenantContextType {
  currentUser: any;
  selectedInstitute: Institute | null;
  selectedBranch: Branch | null;
  institutes: Institute[];
  branches: Branch[];
  allBranches: Branch[];
  loading: boolean;
  isMounted: boolean;
  isRootAdmin: boolean;
  isBranchManager: boolean;
  isLoggingOut: boolean;
  setInstituteId: (id: string) => void;
  setBranchId: (id: string) => void;
  switchTenancy: (
    targetInstituteId?: string | null,
    targetBranchId?: string | null,
    targetInstituteName?: string | null,
    targetBranchName?: string | null
  ) => { instituteName?: string; branchName?: string; switched: boolean };
  refreshTenancy: (seedUser?: any) => Promise<void>;
  logout: () => void;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

const STORAGE_INST_KEY = "papergrade_selected_institute_id";
const STORAGE_BRANCH_KEY = "papergrade_selected_branch_id";

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [institutes, setInstitutes] = useState<Institute[]>([]);
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [selectedInstitute, setSelectedInstitute] = useState<Institute | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  const isRootAdmin = currentUser?.role === "ROOT_ADMIN";
  const isBranchManager = currentUser?.role === "BRANCH_MANAGER";

  const logout = useCallback(() => {
    setIsLoggingOut(true);
    api.logout();
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_INST_KEY);
      localStorage.removeItem(STORAGE_BRANCH_KEY);
      queueToast({
        type: "success",
        title: "Logged Out",
        message: "You have securely signed out of PaperGrade AI.",
      });
      window.location.href = "/auth/login";
    }
  }, []);

  const refreshTenancy = useCallback(async (seedUser?: any) => {
    const token = getAuthToken();
    if (!token) {
      setCurrentUser(null);
      setSelectedBranch(null);
      setSelectedInstitute(null);
      setInstitutes([]);
      setAllBranches([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const storedPayload = getStoredUserPayload();
    let rawUser = seedUser || getStoredUser() || storedPayload;
    let me: any = rawUser?.user ? { ...rawUser, ...rawUser.user } : rawUser;

    // Ensure branch_id and institute_id are present from stored JWT payload if missing on me
    if (!me?.branch_id && storedPayload?.branch_id) {
      me = {
        ...me,
        branch_id: storedPayload.branch_id,
        institute_id: storedPayload.institute_id || me?.institute_id,
      };
    }

    if (me) {
      setCurrentUser(me);
    }

    try {
      // If we don't have full user profile or missing role/branch_id for branch manager, fetch from server
      if (!me?.role || (me.role === "BRANCH_MANAGER" && !me.branch_id)) {
        try {
          const fresh = await api.getMe();
          if (fresh) {
            me = { ...me, ...fresh };
            setCurrentUser(me);
            setStoredUser(me);
          }
        } catch (e) {
          console.warn("TenantContext: api.getMe() fallback failed", e);
        }
      }

      if (!me) {
        setLoading(false);
        return;
      }
      setStoredUser(me);

      // Students do not administer institutes or branches; skip redundant administrative API calls
      if (me.role === "STUDENT") {
        setInstitutes([]);
        setAllBranches([]);
        setSelectedBranch(null);
        setSelectedInstitute(null);
        setLoading(false);
        return;
      }

      const [instList, branchList] = await Promise.all([
        api.listInstitutes().catch(() => []),
        api.listBranches().catch(() => []),
      ]);

      setInstitutes(instList);
      setAllBranches(branchList);

      const targetBranchId =
        me.branch_id ||
        me.user?.branch_id ||
        storedPayload?.branch_id ||
        (typeof window !== "undefined" ? localStorage.getItem(STORAGE_BRANCH_KEY) : null);

      const targetInstId =
        me.institute_id ||
        me.user?.institute_id ||
        storedPayload?.institute_id ||
        (typeof window !== "undefined" ? localStorage.getItem(STORAGE_INST_KEY) : null);

      if (me.role === "ROOT_ADMIN") {
        // Restore from storage or fallback to first
        const savedInstId = typeof window !== "undefined" ? localStorage.getItem(STORAGE_INST_KEY) : null;
        const savedBranchId = typeof window !== "undefined" ? localStorage.getItem(STORAGE_BRANCH_KEY) : null;

        const resolvedInst = instList.find((i: Institute) => i.id === savedInstId) || instList[0] || null;
        setSelectedInstitute(resolvedInst);

        const availableBranches = branchList.filter(
          (b: Branch) => !resolvedInst || b.institute_id === resolvedInst.id
        );
        const resolvedBranch = availableBranches.find((b: Branch) => b.id === savedBranchId) || availableBranches[0] || null;
        setSelectedBranch(resolvedBranch);

        if (resolvedInst) localStorage.setItem(STORAGE_INST_KEY, resolvedInst.id);
        if (resolvedBranch) localStorage.setItem(STORAGE_BRANCH_KEY, resolvedBranch.id);
      } else if (me.role === "BRANCH_MANAGER") {
        // For a branch manager, backend /api/branches already returns only their branch!
        // Try finding by targetBranchId, fallback to branchList[0], fallback to constructed branch
        const managerBranch =
          branchList.find((b: Branch) => b.id === targetBranchId) ||
          branchList[0] ||
          (targetBranchId
            ? {
                id: targetBranchId,
                institute_id: targetInstId || "",
                name: "Assigned Branch",
                code: "BRANCH",
                city: "",
              }
            : null);

        const resolvedInstId = managerBranch?.institute_id || targetInstId;
        const managerInst =
          instList.find((i: Institute) => i.id === resolvedInstId) ||
          instList[0] ||
          (resolvedInstId
            ? {
                id: resolvedInstId,
                name: "Assigned Institute",
                code: "INST",
              }
            : null);

        setSelectedInstitute(managerInst);
        setSelectedBranch(managerBranch);

        if (managerInst) localStorage.setItem(STORAGE_INST_KEY, managerInst.id);
        if (managerBranch) localStorage.setItem(STORAGE_BRANCH_KEY, managerBranch.id);
      }
    } catch {
      // If server is temporarily restarting/unreachable, retain existing session payload
      const stored = getStoredUserPayload();
      if (stored) {
        setCurrentUser(stored);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setIsMounted(true);
    const token = getAuthToken();
    if (token) {
      const stored = getStoredUser() || getStoredUserPayload();
      if (stored) {
        const norm = stored.user ? { ...stored, ...stored.user } : stored;
        setCurrentUser(norm);
        if (norm.role === "BRANCH_MANAGER") {
          const savedBranchId = typeof window !== "undefined" ? localStorage.getItem(STORAGE_BRANCH_KEY) : null;
          const branchId = norm.branch_id || savedBranchId;
          if (branchId && !selectedBranch) {
            setSelectedBranch({
              id: branchId,
              institute_id: norm.institute_id || "",
              name: "Branch",
              code: "BRANCH",
              city: "",
            });
          }
        }
      }
    }
    refreshTenancy();
  }, [refreshTenancy]);

  useEffect(() => {
    const handleStorageChange = () => {
      refreshTenancy();
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [refreshTenancy]);

  const setInstituteId = (id: string) => {
    if (!isRootAdmin) return;
    const inst = institutes.find((i) => i.id === id) || null;
    setSelectedInstitute(inst);
    if (inst) {
      localStorage.setItem(STORAGE_INST_KEY, inst.id);
      const branchesForInst = allBranches.filter((b) => b.institute_id === inst.id);
      const nextBranch = branchesForInst[0] || null;
      setSelectedBranch(nextBranch);
      if (nextBranch) {
        localStorage.setItem(STORAGE_BRANCH_KEY, nextBranch.id);
      } else {
        localStorage.removeItem(STORAGE_BRANCH_KEY);
      }
    }
  };

  const setBranchId = (id: string) => {
    if (!isRootAdmin) return;
    const branch = allBranches.find((b) => b.id === id) || null;
    setSelectedBranch(branch);
    if (branch) {
      localStorage.setItem(STORAGE_BRANCH_KEY, branch.id);
      if (!selectedInstitute || selectedInstitute.id !== branch.institute_id) {
        const matchingInst = institutes.find((i) => i.id === branch.institute_id) || null;
        setSelectedInstitute(matchingInst);
        if (matchingInst) localStorage.setItem(STORAGE_INST_KEY, matchingInst.id);
      }
    }
  };

  const switchTenancy = (
    targetInstituteId?: string | null,
    targetBranchId?: string | null,
    targetInstituteName?: string | null,
    targetBranchName?: string | null
  ): { instituteName?: string; branchName?: string; switched: boolean } => {
    if (!isRootAdmin) return { switched: false };
    if (!targetBranchId && !targetInstituteId) return { switched: false };

    // Resolve branch from allBranches, fallback to constructed branch
    const branch = targetBranchId
      ? allBranches.find((b) => b.id === targetBranchId) || {
          id: targetBranchId,
          institute_id: targetInstituteId || "",
          name: targetBranchName || "Branch",
          code: "BRANCH",
          city: "",
        }
      : null;

    const instId = targetInstituteId || branch?.institute_id;
    // Resolve institute from institutes, fallback to constructed institute
    const inst = instId
      ? institutes.find((i) => i.id === instId) || {
          id: instId,
          name: targetInstituteName || "Institute",
          code: "INST",
        }
      : null;

    const isDifferentBranch = Boolean(branch && (!selectedBranch || selectedBranch.id !== branch.id));
    const isDifferentInst = Boolean(inst && (!selectedInstitute || selectedInstitute.id !== inst.id));

    if (isDifferentBranch || isDifferentInst) {
      if (inst) {
        setSelectedInstitute(inst);
        localStorage.setItem(STORAGE_INST_KEY, inst.id);
      }
      if (branch) {
        setSelectedBranch(branch);
        localStorage.setItem(STORAGE_BRANCH_KEY, branch.id);
      }
      return {
        instituteName: inst?.name || targetInstituteName || undefined,
        branchName: branch?.name || targetBranchName || undefined,
        switched: true,
      };
    }

    return {
      instituteName: selectedInstitute?.name,
      branchName: selectedBranch?.name,
      switched: false,
    };
  };

  const branches = useMemo(() => {
    if (isBranchManager && selectedBranch) {
      const filtered = allBranches.filter((b) => !selectedInstitute || b.institute_id === selectedInstitute.id);
      if (filtered.length > 0) return filtered;
      return allBranches.length > 0 ? allBranches : [selectedBranch];
    }
    return selectedInstitute
      ? allBranches.filter((b) => b.institute_id === selectedInstitute.id)
      : allBranches;
  }, [allBranches, selectedInstitute, isBranchManager, selectedBranch]);

  return (
    <TenantContext.Provider
      value={{
        currentUser,
        selectedInstitute,
        selectedBranch,
        institutes,
        branches,
        allBranches,
        loading,
        isMounted,
        isRootAdmin,
        isBranchManager,
        isLoggingOut,
        setInstituteId,
        setBranchId,
        switchTenancy,
        refreshTenancy,
        logout,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  return context;
}
