"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Rocket, ChevronRight } from "lucide-react";
import { metinApi } from "@/lib/api";
import { useIsletmeMetinleri } from "@/lib/useIsletmeMetinleri";

// v18 Asama 17 - Kurulum tamamlanana dek dashboard ustunde kalici banner.
// onboarding-durum AdminOnly: kullanici/non-admin -> 403 -> durum yok -> banner gizli.
export function OnboardingBanner() {
  const router = useRouter();
  const { data: durum } = useQuery({
    queryKey: ["onboarding-durum"],
    queryFn: metinApi.onboardingDurum,
    retry: false,
  });
  const { data: metinler } = useIsletmeMetinleri();

  const etiketHarita = useMemo(
    () => Object.fromEntries((metinler ?? []).map((m) => [m.anahtar, m.etiket])),
    [metinler]
  );

  // Zorunlu eksik yoksa banner yok
  if (!durum || durum.eksikAnahtarlar.length === 0) return null;

  // E1 smart progress: en kritik 3 eksik anahtar isim isim
  const eksikEtiketler = durum.eksikAnahtarlar.slice(0, 3).map((a) => etiketHarita[a] ?? a);
  const fazla = durum.eksikAnahtarlar.length - eksikEtiketler.length;
  const yuzde = durum.toplam > 0 ? Math.round((durum.dolu / durum.toplam) * 100) : 0;

  return (
    <div className="sticky top-0 z-40 bg-terracotta/10 dark:bg-terracotta/15 border-b border-terracotta/30">
      <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center gap-3">
        <Rocket className="h-5 w-5 shrink-0 text-terracotta" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-clay-900 dark:text-ink-50">
              Kurulumunu tamamla
            </span>
            <span className="text-xs text-clay-500 dark:text-ink-300">
              {durum.dolu}/{durum.toplam} (%{yuzde})
            </span>
          </div>
          <p className="text-xs text-clay-500 dark:text-ink-300 truncate">
            Eksik: {eksikEtiketler.join(", ")}
            {fazla > 0 && ` ve ${fazla} alan daha`}
          </p>
        </div>
        <button
          onClick={() => router.push("/admin/onboarding")}
          className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-terracotta text-white text-sm px-3 py-1.5 hover:bg-terracotta/90 transition-colors"
        >
          Devam et <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
