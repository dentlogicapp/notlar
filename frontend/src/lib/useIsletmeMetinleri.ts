"use client";

import { useQuery } from "@tanstack/react-query";
import { metinApi } from "./api";
import type { MetinBirlesik } from "./types";

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

// Tenant metin degeri: anahtar dolu ise icerik, degilse fallback (v16 isletme degeri / sabit).
// Onboarding tamamlaninca tum anahtarlar dolar -> fallback devre disi (Sifir Sablon).
export function metinDeger(
  metinler: MetinBirlesik[] | undefined,
  anahtar: string,
  fallback = ""
): string {
  return metinler?.find((m) => m.anahtar === anahtar)?.icerik ?? fallback;
}

// v18 - Frontend placeholder cozucu (live preview). {{anahtar}} -> form degeri veya ornek runtime.
// Backend SablonResolver'in onizleme karsiligi; ozyinelemeli (maks 5), cozulemeyen kalibi korur.
const ORNEK_RUNTIME: Record<string, string> = {
  alici_ad: "Ayşegül",
  kalan_gun: "89",
  kalan_saat: "14",
  not_basligi: "Davetiyeler basıldı",
  not_icerik: "Cuma kargoya verilecek",
  klasor_adi: "Davetiye",
  kullanici_adi: "Musa",
  tarih: "1 Eylül 2026",
  saat: "14:30",
  site_url: "notlar.dentlogicapp.com",
};

export function cozMetin(sablon: string, degerler: Record<string, string>, derinlik = 0): string {
  if (!sablon || derinlik >= 5) return sablon ?? "";
  return sablon.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/g, (_m, ad: string) => {
    const v = degerler[ad] || ORNEK_RUNTIME[ad];
    if (v === undefined || v === "") return `{{${ad}}}`;
    return /\{\{/.test(v) ? cozMetin(v, degerler, derinlik + 1) : v;
  });
}
