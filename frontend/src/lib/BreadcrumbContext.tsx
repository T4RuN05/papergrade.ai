"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export interface BreadcrumbSegment {
  label: string;
  href?: string;
}

export interface BreadcrumbTrail {
  group: string;
  segments: BreadcrumbSegment[];
}

interface BreadcrumbContextType {
  trail: BreadcrumbTrail | null;
  setTrail: (trail: BreadcrumbTrail | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextType | undefined>(undefined);

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [trail, setTrail] = useState<BreadcrumbTrail | null>(null);

  return (
    <BreadcrumbContext.Provider value={{ trail, setTrail }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useBreadcrumbs() {
  const context = useContext(BreadcrumbContext);
  if (!context) {
    throw new Error("useBreadcrumbs must be used within a BreadcrumbProvider");
  }
  return context;
}

/**
 * Hook to set dynamic breadcrumb trail on mount / update and automatically reset on unmount.
 */
export function useSetBreadcrumbs(trail: BreadcrumbTrail | null, deps: any[] = []) {
  const { setTrail } = useBreadcrumbs();

  useEffect(() => {
    if (trail) {
      setTrail(trail);
    }
    return () => {
      setTrail(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
