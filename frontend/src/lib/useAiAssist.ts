"use client";

import { useQuery } from "@tanstack/react-query";
import { aiApi } from "./api";

// v18 Asama 11 - AI saglik durumu (buton aktif/pasif). 60sn cache, hata -> saglikli:false (buton gri).
export function useAiSaglik() {
  return useQuery({
    queryKey: ["ai-saglik"],
    queryFn: () => aiApi.saglik(),
    staleTime: 60_000,
    gcTime: 300_000,
    refetchInterval: false, // v18 Asama 11.6 - saglik nadir degisir; global 15sn polling burada kapali
    retry: false,
  });
}
