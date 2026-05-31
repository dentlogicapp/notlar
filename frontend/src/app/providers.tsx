"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
    },
  }));

  return (
    <QueryClientProvider client={qc}>
      {children}
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: "#3d2817",
            color: "#faf6ef",
            border: "1px solid #2a1b0f",
            fontFamily: "Georgia, serif",
          },
        }}
      />
    </QueryClientProvider>
  );
}
