"use client";

import { useRef, useEffect } from "react";
import type { MetinBirlesik } from "@/lib/types";
import { RichTextInput } from "./RichTextInput";

// v18 - Katalog-driven tek metin alani. tip -> uygun input; etiket/yonlendirme/aciklama katalogtan.
// sayac_hedef_tarihi -> datetime-local (ozel). DIGER TUM alanlar (baslik/konu/govde dahil, uzunluk
// fark etmez) textarea + auto-resize: icerik kadar yukseklik, scroll yok, sag alt koseden uzatilir
// (resize-y). Butunsel gorsel dil (madde 5 - tum marka & gorunum field'leri).
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
  const taRef = useRef<HTMLTextAreaElement>(null);
  const tarihMi = metin.anahtar === "sayac_hedef_tarihi";
  const genis = metin.tip === "body" || metin.tip === "metin";
  const minRows = genis ? 3 : 1;

  // auto-resize: icerik kadar yukseklik (bos -> yonlendirme satiri, dolu -> tam okunur)
  useEffect(() => {
    const ta = taRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, [deger]);

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
      ) : metin.tip === "body" ? (
        <RichTextInput
          value={deger}
          onChange={(html) => onDegis(metin.anahtar, html)}
          placeholder={metin.yonlendirme}
          hata={!!hata}
        />
      ) : (
        <textarea
          ref={taRef}
          rows={minRows}
          value={deger}
          placeholder={metin.yonlendirme}
          onChange={(e) => onDegis(metin.anahtar, e.target.value)}
          className={ortakClass + " resize-y leading-relaxed overflow-hidden"}
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
