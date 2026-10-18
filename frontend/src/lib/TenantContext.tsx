"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { api, getAuthToken, getStoredUser, setStoredUser, getStoredUserPayload } from "@/lib/api";

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
  setInstituteId: (id: string) => void;
  setBranchId: (id: string) => void;
  switchTenancy: (
    targetInstituteId?: string | null,
    targetBranchId?: string | null,
    targetInstituteName?: string | null,
    targetBranchName?: string | null
  ) => { instituteName?: string; branchName?: string; switched: boolean };
  refreshTenancy: (seedUser?: any) => Promise<void>;
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

  const isRootAdmin = currentUser?.role === "ROOT_ADMIN";
  const isBranchManager = currentUser?.role === "BRANCH_MANAGER";

  const refreshTenancy = useCallback(async (seedUser?: any) => {
    const token = getAuthToken();
    if (!token) {
      setCurrentUser(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const initialUser = seedUser || getStoredUser() || getStoredUserPayload();
    if (initialUser) {
      setCurrentUser(initialUser);
    }

    try {
      const me = await api.getMe();
      setCurrentUser(me);
      setStoredUser(me);

      const [instList, branchList] = await Promise.all([
        api.listInstitutes().catch(() => []),
        api.listBranches().catch(() => []),
      ]);

      setInstitutes(instList);
      setAllBranches(branchList);

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
        // Strictly locked to branch manager's assigned branch & institute
        const managerBranch = branchList.find((b: Branch) => b.id === me.branch_id) || (me.branch_id ? {
          id: me.branch_id,
          institute_id: me.institute_id,
          name: "Assigned Branch",
          code: "BRANCH",
          city: "",
        } : null);

        const managerInst = instList.find((i: Institute) => i.id === (managerBranch?.institute_id || me.institute_id)) || (me.institute_id ? {
          id: me.institute_id,
          name: "Assigned Institute",
          code: "INST",
        } : null);

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
      const stored = getStoredUserPayload();
      if (stored) {
        setCurrentUser(stored);
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

  const branches = selectedInstitute
    ? allBranches.filter((b) => b.institute_id === selectedInstitute.id)
    : allBranches;

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
        setInstituteId,
        setBranchId,
        switchTenancy,
        refreshTenancy,
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
