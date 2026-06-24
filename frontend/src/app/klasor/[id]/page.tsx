"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { CountdownWidget } from "@/components/CountdownWidget";
import { UserMenu } from "@/components/UserMenu";
import { KlasorListesi, IkonGoster } from "@/components/KlasorGrid";
import { YeniNotFormu, NotListesi } from "@/components/Notlar";
import { klasorApi } from "@/lib/api";
import { gunFormat } from "@/lib/utils";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <AuthGuard>
      <Icerik params={params} />
    </AuthGuard>
  );
}

function Icerik({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data: klasorler } = useQuery({
    queryKey: ["klasorler"],
    queryFn: klasorApi.list,
  });

  const k = (klasorler ?? []).find((x) => x.id === id);

  return (
    <main className="min-h-screen pb-24">
      <CountdownWidget />

      <header className="sticky top-0 z-30 bg-cream-100/85 dark:bg-ink-800/85 backdrop-blur-md border-b border-cream-300 dark:border-ink-700/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-1.5 text-clay-600 dark:text-ink-100 hover:text-clay-900 dark:hover:text-ink-50 transition-colors min-w-0">
            <ChevronLeft className="h-5 w-5 shrink-0" />
            <span className="font-display text-base sm:text-lg truncate">Ana sayfa</span>
          </Link>
          <UserMenu />
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8">
        {k && (
          <section className="animate-fade-in pr-0 md:pr-48 lg:pr-64">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-rose-50 text-terracotta flex items-center justify-center shrink-0">
                <IkonGoster ad={k.ikon} className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="font-display text-3xl sm:text-4xl text-clay-900 dark:text-ink-50 leading-tight">
                  {k.ad}
                </h1>
                {k.aciklama && <p className="text-clay-500 dark:text-ink-200 mt-1.5">{k.aciklama}</p>}
                <p className="text-xs text-clay-400 dark:text-ink-300 mt-2">
                  {k.olusturanAdSoyad} · {gunFormat(k.olusturmaZamani)}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Hızlı not ekleme - bu klasöre. v19 B1 - sistem klasörü (Tamamlananlar) için gizli; not ancak tamamlandığında buraya taşınır. */}
        {!k?.sistemMi && (
          <section className="kart p-4 sm:p-5">
            <YeniNotFormu klasorId={id} />
          </section>
        )}

        {/* 2-kolon: sol klasör listesi (aktif highlight), sağ bu klasörün notları */}
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] lg:grid-cols-[280px_1fr] gap-6">
          <KlasorListesi aktifId={id} />

          <section className="min-w-0">
            <h2 className="font-display text-xl text-clay-900 dark:text-ink-50 mb-4 px-1">Notlar</h2>
            {/* Bu klasör içinde klasör badge'i göstermeye gerek yok.
                v19 B4 - sistem klasörü (Tamamlananlar) tamamlanan notları gösterir; normal klasör sadece bekleyen (tamamlanan Tamamlananlar'a taşınır). */}
            <NotListesi klasorId={id} klasorBadgeGoster={false} sadeceBekleyen={!k?.sistemMi} />
          </section>
        </div>
      </div>
    </main>
  );
}
