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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Heart
              className="h-6 w-6 text-terracotta animate-heart-beat shrink-0 drop-shadow-sm"
              fill="currentColor"
              strokeWidth={1.5}
            />
            <h1 className="font-display text-xl sm:text-2xl text-clay-900 leading-tight">
              Planlama Defterimiz
            </h1>
          </div>
          <UserMenu />
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8">
        {/* Karşılama */}
        <section className="animate-fade-in pr-0 md:pr-48 lg:pr-64">
          <p className="font-display text-3xl sm:text-4xl text-clay-900 leading-tight flex items-baseline gap-2 flex-wrap">
            <span>Merhaba,</span>
            <span className="inline-flex items-center gap-2">
              <span className="text-terracotta">Aşkım</span>
              <Heart className="h-6 w-6 sm:h-7 sm:w-7 text-terracotta animate-heart-beat" fill="currentColor" strokeWidth={1.5} />
            </span>
          </p>
          <p className="text-clay-500 mt-2 italic text-[15px] sm:text-base leading-relaxed">
            Bugün aklına gelen bir şeyi birlikte planlayıp tamamlamak için not etmek ister misin?
          </p>
        </section>

        {/* Hızlı not ekleme */}
        <section className="kart p-4 sm:p-5">
          <YeniNotFormu />
        </section>

        {/* 2-kolon: sol klasör listesi, sağ tüm notlar */}
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] lg:grid-cols-[280px_1fr] gap-6">
          <KlasorListesi />

          <section className="min-w-0">
            <h2 className="font-display text-xl text-clay-900 mb-4 px-1">Tüm Notlar</h2>
            <NotListesi klasorId={null} />
          </section>
        </div>

        {/* Suppress: ad değişkeni şu an karşılamada kullanılmıyor (Aşkım hitabı verildi) */}
        <span className="hidden">{ad}</span>
      </div>
    </main>
  );
}
