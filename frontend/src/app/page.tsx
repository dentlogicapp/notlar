"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AuthGuard } from "@/components/AuthGuard";
import { CountdownWidget } from "@/components/CountdownWidget";
import { UserMenu } from "@/components/UserMenu";
import { KlasorListesi } from "@/components/KlasorGrid";
import { OnboardingBanner } from "@/components/OnboardingBanner";
import { YeniNotFormu, NotListesi } from "@/components/Notlar";
import { useBen } from "@/lib/useBen";
import { useIsletmeMetinleri, metinDeger } from "@/lib/useIsletmeMetinleri";
import { notApi } from "@/lib/api";

export default function AnaSayfa() {
  return (
    <AuthGuard>
      <Icerik />
    </AuthGuard>
  );
}

function Icerik() {
  const { data: ben } = useBen();
  const { data: metinler } = useIsletmeMetinleri();
  const searchParams = useSearchParams();
  const router = useRouter();
  const focusId = searchParams.get("focus");

  const markaEmoji = metinDeger(metinler, "marka_emoji", "");
  const markaAdi = metinDeger(metinler, "marka_adi", "");
  const karsilamaBasligi = metinDeger(metinler, "dashboard_karsilama_basligi", "");
  const karsilamaAltMetni = metinDeger(metinler, "dashboard_karsilama_alt_metin", "");

  // Notlar yüklendi mi? Bildirimden gelirken o yüklendikten sonra scroll yapmamız gerek.
  const notlarQuery = useQuery({
    queryKey: ["notlar", null],
    queryFn: () => notApi.list({ silindi: false }),
    refetchInterval: 15_000, // 15 saniye — eşin değişiklikleri görünür
  });
  const notlarYuklendi = !notlarQuery.isLoading && !!notlarQuery.data;

  // ?focus={id} → notu bul, scroll + 2 saniye ring vurgusu, sonra query parametresini temizle
  useEffect(() => {
    if (!focusId || !notlarYuklendi) return;

    const t = setTimeout(() => {
      const el = document.querySelector(`[data-not-id="${focusId}"]`) as HTMLElement | null;
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("animate-focus-pulse");
      // 2sn sonra class temizlensin
      const tt = setTimeout(() => el.classList.remove("animate-focus-pulse"), 2200);
      // URL'i temizle (geri gelmesini önlemek için)
      router.replace("/", { scroll: false });
      return () => clearTimeout(tt);
    }, 250);

    return () => clearTimeout(t);
  }, [focusId, notlarYuklendi, router]);

  // Lokal admin kullanıcısı yerine sevgi dolu hitap
  const ad = ben?.adSoyad?.split(" ")?.[0] ?? "";

  return (
    <main className="min-h-screen pb-24">
      <OnboardingBanner />
      <CountdownWidget />

      {/* Üst bar */}
      <header className="sticky top-0 z-30 bg-cream-100/85 dark:bg-ink-800/85 backdrop-blur-md border-b border-cream-300 dark:border-ink-700/60">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <span className="text-xl sm:text-2xl animate-heart-beat shrink-0 leading-none drop-shadow-sm">{markaEmoji}</span>
            <h1 className="font-display text-lg sm:text-2xl text-clay-900 dark:text-ink-50 leading-tight truncate">
              {markaAdi}
            </h1>
          </div>
          <UserMenu />
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-10 space-y-5 sm:space-y-8">
        {/* Karşılama */}
        <section className="animate-fade-in pr-0 md:pr-48 lg:pr-64">
          <p className="font-display text-2xl sm:text-3xl md:text-4xl text-clay-900 dark:text-ink-50 leading-tight">
            {karsilamaBasligi}
          </p>
          <p className="text-clay-500 dark:text-ink-200 mt-1.5 sm:mt-2 italic text-[13px] sm:text-[15px] md:text-base leading-relaxed">
            {karsilamaAltMetni}
          </p>
        </section>

        {/* Hızlı not ekleme */}
        <section className="kart p-3 sm:p-5">
          <YeniNotFormu />
        </section>

        {/* 2-kolon: sol klasör listesi, sağ tüm notlar */}
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] lg:grid-cols-[280px_1fr] gap-4 sm:gap-6">
          <KlasorListesi />

          <section className="min-w-0">
            <h2 className="font-display text-lg sm:text-xl text-clay-900 dark:text-ink-50 mb-3 sm:mb-4 px-1">Tüm Notlar</h2>
            <NotListesi klasorId={null} sadeceBekleyen />
          </section>
        </div>

        {/* Suppress: ad değişkeni şu an karşılamada kullanılmıyor (Aşkım hitabı verildi) */}
        <span className="hidden">{ad}</span>
      </div>
    </main>
  );
}
