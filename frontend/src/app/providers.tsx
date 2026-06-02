"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import { useEffect, useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        refetchIntervalInBackground: false, // Sekme arka planda polling durur
        retry: 1,
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
