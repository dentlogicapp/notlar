"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import { useEffect, useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // v18 Asama 11.7 - Real-time senkron (A: polling + focus). SSE v20+.
        staleTime: 5_000,                    // 5sn taze
        gcTime: 300_000,                     // 5dk cache
        refetchInterval: 15_000,             // 15sn arka plan polling
        refetchIntervalInBackground: false,  // arka plan sekmede polling durur (pil + ag)
        refetchOnWindowFocus: true,          // sekmeye donunce ANINDA
        refetchOnReconnect: true,            // ag geri gelince aninda
        refetchOnMount: "always",            // sayfa acilinca taze ver
        retry: 2,
        retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30_000),
      },
    },
  }));

  // v11 — Global 401 yakalama: api.ts yetkisiz-erisim eventi fırlatır, burada toast
  useEffect(() => {
    const handler = () => {
      qc.clear();
      toast.error("Erişiminiz sonlandırıldı. Lütfen tekrar giriş yapın.");
    };
    window.addEventListener("yetkisiz-erisim", handler);
    return () => window.removeEventListener("yetkisiz-erisim", handler);
  }, [qc]);

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
