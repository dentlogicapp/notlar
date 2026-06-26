"use client";

import { useRef, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MetinBirlesik, Ben } from "@/lib/types";
import { RotateCcw, Sparkles } from "lucide-react";
import { RichTextInput } from "./RichTextInput";
import { KarakterSayaci } from "./KarakterSayaci";
import { VersiyonGecmisi } from "./VersiyonGecmisi";
import { AiComposePopover } from "./AiComposePopover";
import { authApi } from "@/lib/api";
import { aiAlanConfig } from "@/lib/aiAlanlar";

// v18 - Katalog-driven tek metin alani. tip -> uygun input; etiket/yonlendirme/aciklama katalogtan.
// sayac_hedef_tarihi -> datetime-local (ozel). DIGER TUM alanlar (baslik/konu/govde dahil, uzunluk
// fark etmez) textarea + auto-resize: icerik kadar yukseklik, scroll yok, sag alt koseden uzatilir
// (resize-y). Butunsel gorsel dil (madde 5 - tum marka & gorunum field'leri).
export function MetinAlani({
  metin,
  deger,
  onDegis,
  hata,
  onSifirla,
}: {
  metin: MetinBirlesik;
  deger: string;
  onDegis: (anahtar: string, yeni: string) => void;
  hata?: string;
  onSifirla?: (anahtar: string) => void; // v19 6c - varsayilana dondur (parent: sifirla + refetch + form reset)
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const tarihMi = metin.anahtar === "sayac_hedef_tarihi";
  const genis = metin.tip === "body" || metin.tip === "metin";
  const minRows = genis ? 3 : 1;
  // v19 Is3 - kutu ici soluk placeholder = VARSAYILAN deger (body HTML ise etiketler temizlenir).
  // Varsayilan yoksa doldurma ipucuna (yonlendirme) duser. Alan altinda ayrica ipucu + "Varsayilan" satiri gosterilir.
  const varsayilanDuz = (metin.varsayilan ?? "").replace(/<[^>]+>/g, "").trim();
  const kutuPlaceholder = varsayilanDuz || metin.yonlendirme || "";

  // v19 - AI Compose: ✨ buton SADECE super admin + izinli 3 alanda (whitelist, defense in depth).
  // ben React Query cache'inden gelir (AuthGuard zaten cekti, tekrar fetch yok).
  const { data: ben } = useQuery<Ben>({ queryKey: ["ben"], queryFn: authApi.ben, staleTime: 5 * 60_000 });
  const aiConfig = aiAlanConfig(metin.anahtar);
  const aiGoster = (ben?.superAdmin ?? false) && aiConfig !== null;
  const [aiAcik, setAiAcik] = useState(false);

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
    <div data-tour-step="metin-alani" className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm font-medium text-clay-800 dark:text-ink-50">
          {metin.etiket}
          {metin.zorunlu && <span className="text-terracotta text-xs">zorunlu</span>}
        </label>
        <div data-tour-step="versiyon-gecmisi" className="flex items-center gap-2.5 shrink-0">
          {onSifirla && metin.icerik != null && metin.icerik !== "" && (
            <button
              type="button"
              onClick={() => onSifirla(metin.anahtar)}
              title="Bu metni sistem varsayılanına döndür"
              className="flex items-center gap-1 text-xs text-clay-400 dark:text-ink-300 hover:text-terracotta transition-colors"
            >
              <RotateCcw className="h-3 w-3" /> Varsayılana döndür
            </button>
          )}
          {aiGoster && (
            <button
              type="button"
              onClick={() => setAiAcik(true)}
              title="AI ile metin uret"
              className="flex items-center gap-1 text-xs text-terracotta hover:text-terracotta/80 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" /> AI
            </button>
          )}
          <VersiyonGecmisi anahtar={metin.anahtar} onDon={(ic) => onDegis(metin.anahtar, ic)} />
        </div>
      </div>

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
          placeholder={kutuPlaceholder}
          hata={!!hata}
        />
      ) : (
        <textarea
          ref={taRef}
          rows={minRows}
          value={deger}
          placeholder={kutuPlaceholder}
          onChange={(e) => onDegis(metin.anahtar, e.target.value)}
          className={ortakClass + " resize-y leading-relaxed overflow-hidden"}
        />
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-0.5">
          {hata ? (
            <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">{hata}</p>
          ) : (
            <>
              {metin.yonlendirme && (
                <p className="text-xs text-clay-400 dark:text-ink-300 leading-relaxed">{metin.yonlendirme}</p>
              )}
              {metin.aciklama && (
                <p className="text-xs text-clay-400 dark:text-ink-300 leading-relaxed">{metin.aciklama}</p>
              )}
              {varsayilanDuz && (
                <p className="text-[11px] text-clay-400 dark:text-ink-300 italic leading-relaxed line-clamp-2">
                  Varsayılan: "{varsayilanDuz}"
                </p>
              )}
            </>
          )}
        </div>
        {!tarihMi && <span data-tour-step="karakter-sayaci"><KarakterSayaci mevcut={deger.length} tip={metin.tip} karakterLimiti={metin.karakterLimiti} /></span>}
      </div>

      {aiAcik && aiConfig && (
        <AiComposePopover
          anahtar={metin.anahtar}
          etiket={metin.etiket}
          tip={metin.tip}
          mevcutDeger={deger}
          varsayilanPrompt={aiConfig.varsayilanPrompt}
          mailTip={aiConfig.mailTip}
          aliciAd={ben?.adSoyad ?? "Musa Deveci"}
          onUygula={(yeni) => onDegis(metin.anahtar, yeni)}
          onKapat={() => setAiAcik(false)}
        />
      )}
    </div>
  );
}
