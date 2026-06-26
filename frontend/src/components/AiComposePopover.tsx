"use client";

import { useState } from "react";
import { Sparkles, Loader2, Check, X, RefreshCw, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { aiApi } from "@/lib/api";

// v19 - Inline AI Compose modal. Sadece super admin + mail alanlarinda acilir (MetinAlani karar verir).
// Akis: serbest prompt + ton/uzunluk chip (B5) -> serbest-uret -> diff onizleme (B3) -> field'a uygula.
// Streaming (B1) Faz D'de bu component'e eklenecek; simdilik tek seferde tam metin doner.

const TONLAR = ["samimi", "resmi", "eglenceli"] as const;
const UZUNLUKLAR = ["kisa", "orta", "uzun"] as const;

// HTML body degerini diff'te duz okunur gostermek icin etiket temizligi.
function duzMetin(s: string): string {
  return (s ?? "").replace(/<[^>]+>/g, "").trim();
}

export function AiComposePopover({
  anahtar,
  etiket,
  mevcutDeger,
  onUygula,
  onKapat,
}: {
  anahtar: string;
  etiket: string;
  mevcutDeger: string;
  onUygula: (yeni: string) => void;
  onKapat: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [ton, setTon] = useState<string | null>(null);
  const [uzunluk, setUzunluk] = useState<string | null>(null);
  const [uretiliyor, setUretiliyor] = useState(false);
  const [sonuc, setSonuc] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  const mevcutDuz = duzMetin(mevcutDeger);

  async function uret() {
    if (!prompt.trim()) {
      setHata("Once ne uretmek istedigini yaz.");
      return;
    }
    setUretiliyor(true);
    setHata(null);
    try {
      const sonucGovde = await aiApi.serbestUret({
        anahtar,
        prompt: prompt.trim(),
        ton: ton ?? undefined,
        uzunluk: uzunluk ?? undefined,
        mevcutMetin: mevcutDuz || undefined,
      });
      setSonuc(sonucGovde.metin);
    } catch (e) {
      setHata("AI su an metin uretemedi. Saglayici ayarini ve baglantiyi kontrol et.");
    } finally {
      setUretiliyor(false);
    }
  }

  function chip(deger: string, secili: boolean, tikla: () => void) {
    return (
      <button
        key={deger}
        type="button"
        onClick={tikla}
        className={[
          "px-3 py-1 rounded-full text-xs font-medium transition-colors border",
          secili
            ? "bg-terracotta text-white border-terracotta"
            : "bg-cream-50 dark:bg-ink-800/40 text-clay-600 dark:text-ink-200 border-cream-300 dark:border-ink-700/60 hover:border-terracotta",
        ].join(" ")}
      >
        {deger}
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4"
      onClick={onKapat}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-ink-900 border border-cream-300 dark:border-ink-700/60 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Baslik */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-cream-200 dark:border-ink-800">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-clay-900 dark:text-ink-50">
            <Sparkles className="h-4 w-4 text-terracotta" />
            AI ile metin uret
            <span className="text-clay-400 dark:text-ink-300 font-normal">- {etiket}</span>
          </h3>
          <button type="button" onClick={onKapat} className="text-clay-400 hover:text-terracotta transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Prompt */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-clay-700 dark:text-ink-100">Ne uretmek istiyorsun?</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="orn. Dugun davetiyesi icin sicak, samimi bir karsilama metni yaz"
              className="w-full rounded-lg border border-cream-300 dark:border-ink-700/60 bg-cream-50 dark:bg-ink-900/40 px-3 py-2 text-sm text-clay-900 dark:text-ink-50 placeholder:text-clay-400 focus:outline-none focus:ring-2 focus:ring-terracotta/40 focus:border-terracotta resize-y"
            />
          </div>

          {/* Ton + Uzunluk chip (B5) */}
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-clay-700 dark:text-ink-100">Ton</span>
              <div className="flex gap-1.5">
                {TONLAR.map((t) => chip(t, ton === t, () => setTon(ton === t ? null : t)))}
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-clay-700 dark:text-ink-100">Uzunluk</span>
              <div className="flex gap-1.5">
                {UZUNLUKLAR.map((u) => chip(u, uzunluk === u, () => setUzunluk(uzunluk === u ? null : u)))}
              </div>
            </div>
          </div>

          {hata && <p className="text-xs text-red-600 dark:text-red-400">{hata}</p>}

          {/* Uret butonu */}
          <Button onClick={uret} disabled={uretiliyor} className="w-full">
            {uretiliyor ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Uretiliyor...</>
            ) : sonuc ? (
              <><RefreshCw className="h-4 w-4" /> Yeniden uret</>
            ) : (
              <><Sparkles className="h-4 w-4" /> Uret</>
            )}
          </Button>

          {/* Diff onizleme (B3): mevcut vs yeni */}
          {sonuc && (
            <div className="space-y-2 pt-2 border-t border-cream-200 dark:border-ink-800">
              <p className="text-xs font-medium text-clay-700 dark:text-ink-100">Onizleme</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[11px] uppercase tracking-wide text-clay-400 dark:text-ink-300">Mevcut</span>
                  <div className="rounded-lg border border-cream-300 dark:border-ink-700/60 bg-cream-50/50 dark:bg-ink-900/40 px-3 py-2 text-sm text-clay-500 dark:text-ink-300 min-h-[60px] whitespace-pre-wrap">
                    {mevcutDuz || <span className="italic text-clay-400">(bos)</span>}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] uppercase tracking-wide text-terracotta">Yeni (AI)</span>
                  <div className="rounded-lg border border-terracotta/40 bg-terracotta/5 px-3 py-2 text-sm text-clay-900 dark:text-ink-50 min-h-[60px] whitespace-pre-wrap">
                    {sonuc}
                  </div>
                </div>
              </div>

              {/* Aksiyonlar */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={onKapat}>Iptal</Button>
                <Button onClick={() => { onUygula(sonuc); onKapat(); }}>
                  <Check className="h-4 w-4" /> Field'a uygula <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
