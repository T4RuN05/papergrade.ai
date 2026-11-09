"use client";

import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Standard TanStack Query Provider for Next.js App Router.
 * Ensures each client session gets an isolated QueryClient instance,
 * with stale-while-revalidate caching defaults suitable for academic dashboards.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // 30 seconds fresh window before background revalidation
            gcTime: 5 * 60 * 1000, // 5 minutes garbage collection window
            refetchOnWindowFocus: false, // Prevent jarring layout shifts during active user input
            retry: 1, // Single retry on transient network failures
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
