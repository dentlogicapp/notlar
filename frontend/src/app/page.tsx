"use client";

import { Heart } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { CountdownWidget } from "@/components/CountdownWidget";
import { UserMenu } from "@/components/UserMenu";
import { KlasorListesi } from "@/components/KlasorGrid";
import { YeniNotFormu, NotListesi } from "@/components/Notlar";
import { useBen } from "@/lib/useBen";

export default function AnaSayfa() {
  return (
    <AuthGuard>
      <Icerik />
    </AuthGuard>
  );
}

function Icerik() {
  const { data: ben } = useBen();
  // Lokal admin kullanıcısı yerine sevgi dolu hitap
  const ad = ben?.adSoyad?.split(" ")?.[0] ?? "";

  return (
    <main className="min-h-screen pb-24">
      <CountdownWidget />

      {/* Üst bar */}
      <header className="sticky top-0 z-30 bg-cream-100/85 backdrop-blur-md border-b border-cream-300/60">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <Heart
              className="h-5 w-5 sm:h-6 sm:w-6 text-terracotta animate-heart-beat shrink-0 drop-shadow-sm"
              fill="currentColor"
              strokeWidth={1.5}
            />
            <h1 className="font-display text-lg sm:text-2xl text-clay-900 leading-tight truncate">
              Planlama Defterimiz
            </h1>
          </div>
          <UserMenu />
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-10 space-y-5 sm:space-y-8">
        {/* Karşılama */}
        <section className="animate-fade-in pr-0 md:pr-48 lg:pr-64">
          <p className="font-display text-2xl sm:text-3xl md:text-4xl text-clay-900 leading-tight flex items-baseline gap-2 flex-wrap">
            <span>Merhaba,</span>
            <span className="inline-flex items-center gap-1.5 sm:gap-2">
              <span className="text-terracotta">Aşkım</span>
              <Heart className="h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7 text-terracotta animate-heart-beat" fill="currentColor" strokeWidth={1.5} />
            </span>
          </p>
          <p className="text-clay-500 mt-1.5 sm:mt-2 italic text-[13px] sm:text-[15px] md:text-base leading-relaxed">
            Bugün aklına gelen bir şeyi birlikte planlayıp tamamlamak için not etmek ister misin?
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
            <h2 className="font-display text-lg sm:text-xl text-clay-900 mb-3 sm:mb-4 px-1">Tüm Notlar</h2>
            <NotListesi klasorId={null} />
          </section>
        </div>

        {/* Suppress: ad değişkeni şu an karşılamada kullanılmıyor (Aşkım hitabı verildi) */}
        <span className="hidden">{ad}</span>
      </div>
    </main>
  );
}
