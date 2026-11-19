"use client";

import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Enterprise TanStack Query Provider for Next.js App Router.
 * Configured with resilient stale-while-revalidate caching defaults,
 * background tab sleep optimization, and isolated client sessions.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // 30 seconds fresh window before background revalidation
            gcTime: 10 * 60 * 1000, // 10 minutes cache persistence
            refetchOnWindowFocus: false, // Prevent jarring layout shifts during active user input
            refetchIntervalInBackground: false, // Automatically sleep intervals when tab is minimized
            retry: (failureCount: number, error: any) => {
              if (error?.status === 401 || error?.status === 404) return false;
              return failureCount < 2;
            },
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
