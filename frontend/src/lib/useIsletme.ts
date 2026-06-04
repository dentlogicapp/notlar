"use client";
import { useQuery } from "@tanstack/react-query";
import { isletmeApi } from "./api";
import { useBen } from "./useBen";

/**
 * v16 — Aktif tenant'in marka & gorunum ayarlari (Isletme).
 * useBen ile ayni React Query pattern'i. Context degil — kod tabani idiomu.
 * enabled: aktif tenant yoksa (login oncesi / super_admin + 0 tenant) calismaz.
 */
export function useIsletme() {
  const { data: ben } = useBen();
  return useQuery({
    queryKey: ["isletme-aktif"],
    queryFn: isletmeApi.aktif,
    enabled: !!ben?.aktifIsletmeId,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}
