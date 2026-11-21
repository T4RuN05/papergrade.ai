import { useState, useEffect, useMemo } from "react";
import type { WindowStatus } from "@/lib/api";

export interface WindowCountdownResult {
  remainingSeconds: number;
  formatted: string;
  isExpired: boolean;
  isInGrace: boolean;
}

/**
 * Zero-Drift Monotonic Window Countdown Hook (0 Network Overhead)
 * Derives fluid 1-second countdown ticking entirely from the authoritative server ISO timestamp.
 * Seamlessly handles transition into 2-minute grace period by targeting grace_deadline_at.
 * Isolates re-renders to the countdown display without churning React Query caches or triggering network requests.
 */
export function useWindowCountdown(windowStatus: WindowStatus | null | undefined): WindowCountdownResult {
  const targetIso = useMemo(() => {
    if (!windowStatus?.is_active) return null;
    return (windowStatus.is_in_grace && windowStatus.grace_deadline_at)
      ? windowStatus.grace_deadline_at
      : windowStatus.deadline_at;
  }, [windowStatus?.is_active, windowStatus?.is_in_grace, windowStatus?.deadline_at, windowStatus?.grace_deadline_at]);

  const [remainingSeconds, setRemainingSeconds] = useState<number>(() => {
    if (!targetIso) return 0;
    const diff = Math.floor((new Date(targetIso).getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  });

  useEffect(() => {
    if (!targetIso) {
      setRemainingSeconds(0);
      return;
    }

    const calculateRemaining = () => {
      const deadline = new Date(targetIso).getTime();
      return Math.max(0, Math.floor((deadline - Date.now()) / 1000));
    };

    setRemainingSeconds(calculateRemaining());

    const timer = setInterval(() => {
      const rem = calculateRemaining();
      setRemainingSeconds(rem);
      if (rem <= 0) clearInterval(timer);
    }, 1000);

    return () => clearInterval(timer);
  }, [targetIso]);

  const formatted = useMemo(() => {
    const m = Math.floor(remainingSeconds / 60);
    const s = remainingSeconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }, [remainingSeconds]);

  return {
    remainingSeconds,
    formatted,
    isExpired: remainingSeconds === 0,
    isInGrace: Boolean(windowStatus?.is_in_grace),
  };
}
