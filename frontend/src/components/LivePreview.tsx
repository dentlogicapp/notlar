"use client";

import { Heart } from "lucide-react";
import { cozMetin } from "@/lib/useIsletmeMetinleri";

// v18 - Live Preview: marka sayfasinda field duzenlenirken anlik dinamik onizleme.
// degerler (canli form state) + cozMetin -> dashboard gorunumu. Mail onizleme Asama D (mail editoru).
export function LivePreview({ sekme, degerler }: { sekme: string; degerler: Record<string, string> }) {
  const c = (anahtar: string) => cozMetin(degerler[anahtar] ?? "", degerler);

  if (sekme === "marka") {
    const ad = c("marka_adi") || "Marka Adı";
    const emoji = degerler["marka_emoji"] ?? "";
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-t-lg bg-cream-200 dark:bg-ink-800 px-3 py-1.5 max-w-[240px]">
          <span className="text-sm">{emoji}</span>
          <span className="text-xs text-clay-600 dark:text-ink-100 truncate">{ad}</span>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-cream-300 dark:border-ink-700 px-4 py-3">
          <span className="text-xl">{emoji}</span>
          <span className="font-display text-lg text-clay-900 dark:text-ink-50 truncate">{ad}</span>
        </div>
      </div>
    );
  }

  if (sekme === "karsilama") {
    return (
      <div className="rounded-xl border border-cream-300 dark:border-ink-700 px-4 py-4">
        <p className="font-display text-xl text-clay-900 dark:text-ink-50 leading-tight">
          {c("dashboard_karsilama_basligi") || "Karşılama Başlığı"}
        </p>
        <p className="text-clay-500 dark:text-ink-200 mt-1.5 italic text-sm leading-relaxed">
          {c("dashboard_karsilama_alt_metin") || "Karşılama alt metni burada görünür."}
        </p>
      </div>
    );
  }

  if (sekme === "sayac") {
    const aktif = (degerler["sayac_aktif"] ?? "") === "true";
    if (!aktif) {
      return <p className="text-sm italic text-clay-400 dark:text-ink-300">Sayaç kapalı — dashboard'da gösterilmez.</p>;
    }
    return (
      <div className="rounded-xl border border-cream-300 dark:border-ink-700 px-4 py-3 flex items-center gap-3">
        <Heart className="h-7 w-7 text-terracotta shrink-0" fill="currentColor" strokeWidth={1.5} />
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] uppercase tracking-[0.2em] text-clay-500 dark:text-ink-200 leading-none font-medium truncate">
            {c("sayac_aktif_cumle") || "Sayaç cümlesi"}
          </span>
          <span className="font-display text-lg text-clay-900 dark:text-ink-50 mt-1">89 gün · 14 sa · 22 dk</span>
        </div>
      </div>
    );
  }

  return (
    <p className="text-sm italic text-clay-400 dark:text-ink-300 leading-relaxed">
      Bu sekme için canlı önizleme mail editörüyle birlikte gelecek.
    </p>
  );
}
