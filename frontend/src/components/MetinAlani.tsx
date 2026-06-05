"use client";

import type { MetinBirlesik } from "@/lib/types";

// v18 - Katalog-driven tek metin alani. tip -> uygun input; etiket/yonlendirme/aciklama katalogtan.
// sayac_hedef_tarihi -> datetime-local (tarih+saat). hata -> enterprise inline uyari (kirmizi).
// Aciklama: AI (Asama 11), karakter sayaci (Asama 14), history (Asama 15) bu komponente eklenecek.
export function MetinAlani({
  metin,
  deger,
  onDegis,
  hata,
}: {
  metin: MetinBirlesik;
  deger: string;
  onDegis: (anahtar: string, yeni: string) => void;
  hata?: string;
}) {
  const tarihMi = metin.anahtar === "sayac_hedef_tarihi";
  const cokSatir = metin.tip === "body" || metin.tip === "metin";
  const rows = metin.tip === "body" ? 6 : 2;

  const ortakClass = [
    "w-full rounded-lg border bg-cream-50 dark:bg-ink-900/40",
    "px-3 py-2 text-sm text-clay-900 dark:text-ink-50",
    "placeholder:text-clay-400 dark:placeholder:text-ink-300",
    "focus:outline-none focus:ring-2 transition-colors",
    hata
      ? "border-red-400 dark:border-red-500/60 focus:ring-red-400/40 focus:border-red-500"
      : "border-cream-300 dark:border-ink-700/60 focus:ring-terracotta/40 focus:border-terracotta",
  ].join(" ");

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-sm font-medium text-clay-800 dark:text-ink-50">
        {metin.etiket}
        {metin.zorunlu && <span className="text-terracotta text-xs">zorunlu</span>}
      </label>

      {tarihMi ? (
        <input
          type="datetime-local"
          value={deger}
          onChange={(e) => onDegis(metin.anahtar, e.target.value)}
          className={ortakClass}
        />
      ) : cokSatir ? (
        <textarea
          rows={rows}
          value={deger}
          placeholder={metin.yonlendirme}
          onChange={(e) => onDegis(metin.anahtar, e.target.value)}
          className={ortakClass + " resize-y leading-relaxed"}
        />
      ) : (
        <input
          type="text"
          value={deger}
          placeholder={metin.yonlendirme}
          onChange={(e) => onDegis(metin.anahtar, e.target.value)}
          className={ortakClass}
        />
      )}

      {hata ? (
        <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">{hata}</p>
      ) : (
        metin.aciklama && (
          <p className="text-xs text-clay-400 dark:text-ink-300 leading-relaxed">{metin.aciklama}</p>
        )
      )}
    </div>
  );
}
