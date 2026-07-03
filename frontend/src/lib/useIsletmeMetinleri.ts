"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { metinApi } from "./api";
import type { MetinBirlesik } from "./types";

// v18 - Sifir Sablon: tenant metinleri (katalog + deger birlesik) React Query cache.
// Marka sayfasi, onboarding wizard ve live preview tek kaynaktan beslenir.
export function useIsletmeMetinleri(opts?: { kapsam?: "Tenant" | "Sistem" }) {
  const q = useQuery({
    queryKey: ["isletme-metinleri"],
    queryFn: () => metinApi.list(),
    staleTime: 30_000,
  });
  // v18 Asama 17.1 - kapsam filtresi (client-side; cache ayni queryKey ile paylasilir).
  // useMemo ZORUNLU: aksi halde her render yeni array referansi -> tuketici effect'leri
  // sonsuz tetiklenir (wizard degerler state reset, menu crash).
  const kapsam = opts?.kapsam;
  const data = useMemo(
    () => (kapsam && q.data ? q.data.filter((m) => m.kapsam === kapsam) : q.data),
    [q.data, kapsam]
  );
  return { ...q, data };
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

// v20.1 - K4: tenant degeri bos ise KATALOG VARSAYILANINA duser (hardcode fallback yerine
// tek dogruluk kaynagi). metinDeger'in davranisi BILEREK korunur - orn. MarkaBaslik'in
// "bos -> static title" mantigi varsayilana dusmemeli. Varsayilan HTML icerebilir (body
// tipleri); soluk placeholder icin etiketler temizlenir (MetinAlani kutuPlaceholder deseni).
export function metinDegerVarsayilanli(
  metinler: MetinBirlesik[] | undefined,
  anahtar: string
): string {
  const m = metinler?.find((x) => x.anahtar === anahtar);
  const icerik = (m?.icerik ?? "").trim();
  if (icerik) return icerik;
  return (m?.varsayilan ?? "").replace(/<[^>]+>/g, "").trim();
}
