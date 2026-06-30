"use client";

import { AuthGuard } from "@/components/AuthGuard";
import { useFocusNot } from "@/lib/useFocusNot";
import { ZamanPaneli } from "@/components/ZamanPaneli";
import { UserMenu } from "@/components/UserMenu";
import { KlasorListesi } from "@/components/KlasorGrid";
import { OnboardingBanner } from "@/components/OnboardingBanner";
import { YeniNotFormu, NotListesi } from "@/components/Notlar";
import { useBen } from "@/lib/useBen";
import { useIsletmeMetinleri, metinDeger } from "@/lib/useIsletmeMetinleri";
import { pushDurumu, pushAboneOl } from "@/lib/push";
import { useEffect } from "react";

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
  useFocusNot();

  // Varsayilan bildirim izni: oturum acilinca kullanici henuz abone degilse
  // otomatik abone et. Izin daha once verilmisse sessizce, hic sorulmamissa
  // tek seferlik onayla. Reddedeni rahatsiz etme (denied durumuna dokunma).
  useEffect(() => {
    if (!ben) return;
    pushDurumu().then((durum) => {
      if (durum === "kapali") {
        pushAboneOl().catch(() => {});
      }
    });
  }, [ben?.id]);

  const markaEmoji = metinDeger(metinler, "marka_emoji", "");
  const markaAdi = metinDeger(metinler, "marka_adi", "");
  const karsilamaBasligi = metinDeger(metinler, "dashboard_karsilama_basligi", "");
  const karsilamaAltMetni = metinDeger(metinler, "dashboard_karsilama_alt_metin", "");

  // Lokal admin kullanıcısı yerine sevgi dolu hitap
  const ad = ben?.adSoyad?.split(" ")?.[0] ?? "";

  return (
    <main className="min-h-screen pb-24">
      <OnboardingBanner />
      <ZamanPaneli />

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
        <section className="animate-fade-in">
          <p className="font-display text-2xl sm:text-3xl md:text-4xl text-clay-900 dark:text-ink-50 leading-tight">
            {karsilamaBasligi}
          </p>
          <p className="text-clay-500 dark:text-ink-200 mt-1.5 sm:mt-2 italic text-[13px] sm:text-[15px] md:text-base leading-relaxed text-justify hyphens-auto">
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
            <NotListesi klasorId={null} sadeceBekleyen baslik="Tüm Notlar" />
          </section>
        </div>

        {/* Suppress: ad değişkeni şu an karşılamada kullanılmıyor (Aşkım hitabı verildi) */}
        <span className="hidden">{ad}</span>
      </div>
    </main>
  );
}
