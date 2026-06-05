"use client";

import { useQuery } from "@tanstack/react-query";
import { metinApi } from "./api";

// v18 - Sifir Sablon: tenant metinleri (katalog + deger birlesik) React Query cache.
// Marka sayfasi, onboarding wizard ve live preview tek kaynaktan beslenir.
export function useIsletmeMetinleri() {
  return useQuery({
    queryKey: ["isletme-metinleri"],
    queryFn: () => metinApi.list(),
    staleTime: 30_000,
  });
}

export function useOnboardingDurum() {
  return useQuery({
    queryKey: ["onboarding-durum"],
    queryFn: () => metinApi.onboardingDurum(),
    staleTime: 30_000,
  });
}
