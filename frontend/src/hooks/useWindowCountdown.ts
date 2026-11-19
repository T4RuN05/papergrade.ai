import { useState, useEffect, useMemo } from "react";
import type { WindowStatus } from "@/lib/api";

export interface WindowCountdownResult {
  remainingSeconds: number;
  formatted: string;
  isExpired: boolean;
}

/**
 * Zero-Drift Monotonic Window Countdown Hook (0 Network Overhead)
 * Derives fluid 1-second countdown ticking entirely from the authoritative server ISO timestamp.
 * Isolates re-renders to the countdown display without churning React Query caches or triggering network requests.
 */
export function useWindowCountdown(windowStatus: WindowStatus | null | undefined): WindowCountdownResult {
  const [remainingSeconds, setRemainingSeconds] = useState<number>(() => {
    if (!windowStatus?.is_active || !windowStatus.deadline_at) return 0;
    const diff = Math.floor((new Date(windowStatus.deadline_at).getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  });

  useEffect(() => {
    if (!windowStatus?.is_active || !windowStatus.deadline_at) {
      setRemainingSeconds(0);
      return;
    }

    const calculateRemaining = () => {
      const deadline = new Date(windowStatus.deadline_at!).getTime();
      return Math.max(0, Math.floor((deadline - Date.now()) / 1000));
    };

    setRemainingSeconds(calculateRemaining());

    const timer = setInterval(() => {
      const rem = calculateRemaining();
      setRemainingSeconds(rem);
      if (rem <= 0) clearInterval(timer);
    }, 1000);

    return () => clearInterval(timer);
  }, [windowStatus?.deadline_at, windowStatus?.is_active]);

  const formatted = useMemo(() => {
    const m = Math.floor(remainingSeconds / 60);
    const s = remainingSeconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }, [remainingSeconds]);

  return { remainingSeconds, formatted, isExpired: remainingSeconds === 0 };
}
