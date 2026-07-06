"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Loader2, ShieldCheck } from "lucide-react";
import { kvkkApi } from "@/lib/api";

// v21 M7 (K6) - anonim tam metin sayfasi (login ekranindaki link buraya gelir;
// kanuni gereklilik: metne kimlik dogrulamasiz erisim).
export default function KvkkSayfasi() {
  const { data: metin, isLoading } = useQuery({
    queryKey: ["kvkk-aktif"],
    queryFn: kvkkApi.aktif,
    retry: false,
  });

  return (
    <main className="min-h-screen pb-24">
      <header className="sticky top-0 z-30 bg-cream-100/85 dark:bg-ink-800/85 backdrop-blur-md border-b border-cream-300 dark:border-ink-700/60">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/giris" className="flex items-center gap-1 text-clay-600 dark:text-ink-100 hover:text-clay-900 dark:hover:text-ink-50 transition-colors">
            <ChevronLeft className="h-5 w-5" />
            <span className="font-display text-base">Girişe dön</span>
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-5">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-terracotta" />
          <h1 className="font-display text-3xl text-clay-900 dark:text-ink-50">KVKK Aydınlatma Metni</h1>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-clay-400 dark:text-ink-300" /></div>
        ) : !metin ? (
          <p className="text-sm text-clay-500 dark:text-ink-200 py-8">Henüz yayınlanmış bir KVKK metni bulunmuyor.</p>
        ) : (
          <div className="kart p-5 sm:p-7 space-y-4">
            <p className="text-[13px] sm:text-sm leading-relaxed text-clay-700 dark:text-ink-100 whitespace-pre-wrap text-justify">
              {metin.icerik}
            </p>
            {metin.pazarlamaIcerik && (
              <div className="pt-3 border-t border-cream-300 dark:border-ink-600">
                <h2 className="text-sm font-semibold text-clay-800 dark:text-ink-50 mb-2">Ticari Elektronik İleti (Pazarlama) İzni</h2>
                <p className="text-[13px] leading-relaxed text-clay-600 dark:text-ink-100 whitespace-pre-wrap text-justify">
                  {metin.pazarlamaIcerik}
                </p>
              </div>
            )}
            <div className="pt-3 mt-2 border-t border-cream-300 dark:border-ink-600 space-y-1">
              <p className="text-[10px] text-clay-400 dark:text-ink-300">
                Versiyon {metin.versiyon} · Yayın: {new Date(metin.yayinZamani).toLocaleDateString("tr-TR")}
              </p>
              <p className="text-[10px] text-clay-400 dark:text-ink-300">
                <span className="uppercase tracking-wider">SHA-256</span>
                <span className="block font-mono break-all leading-relaxed mt-0.5 text-clay-500 dark:text-ink-200">
                  {metin.sha256Hash}
                </span>
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
