"use client";

import { useState, useEffect } from "react";
import { Sparkles, Loader2, Check, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { aiApi, metinApi } from "@/lib/api";

// v19 - Inline AI Compose modal. Sadece super admin + izinli 3 alanda acilir (MetinAlani karar verir).
// Mail alanlari (mailTip dolu): gercek mail HTML onizlemesi (mailOnizle reuse) - mevcut vs yeni iframe diff.
// Dashboard alani (mailTip null): placeholder cozulmus metin onizleme.
// Tum UI metinleri Turkce; mobil (alt-sheet) + web (orta modal) responsive.

const TONLAR = ["samimi", "resmi", "eğlenceli"] as const;
const UZUNLUKLAR = ["kısa", "orta", "uzun"] as const;

function duzMetin(s: string): string {
  return (s ?? "").replace(/<[^>]+>/g, "").trim();
}

// {{alici_ad}} -> gercek isim (dashboard metin onizleme; mail tarafini backend zaten cozer).
function placeholderCoz(s: string, aliciAd: string): string {
  return s.replace(/\{\{\s*alici_ad\s*\}\}/g, aliciAd);
}

// Metindeki placeholder anahtarlarini yakala (rozet icin).
function placeholderlariBul(s: string): string[] {
  const m = s.match(/\{\{\s*([a-z_]+)\s*\}\}/g) ?? [];
  return Array.from(new Set(m.map((x) => x.replace(/[{}\s]/g, ""))));
}

export function AiComposePopover({
  anahtar,
  etiket,
  tip,
  mevcutDeger,
  varsayilanPrompt,
  mailTip,
  aliciAd,
  onUygula,
  onKapat,
}: {
  anahtar: string;
  etiket: string;
  tip: string;
  mevcutDeger: string;
  varsayilanPrompt: string;
  mailTip: string | null;
  aliciAd: string;
  onUygula: (yeni: string) => void;
  onKapat: () => void;
}) {
  const [prompt, setPrompt] = useState(varsayilanPrompt);
  const [ton, setTon] = useState<string | null>(null);
  const [uzunluk, setUzunluk] = useState<string | null>(null);
  const [uretiliyor, setUretiliyor] = useState(false);
  const [sonuc, setSonuc] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  const [mevcutHtml, setMevcutHtml] = useState<string | null>(null);
  const [yeniHtml, setYeniHtml] = useState<string | null>(null);
  const [onizlemeYukleniyor, setOnizlemeYukleniyor] = useState(false);

  const rehberMi = anahtar === "mail_davetiye_rehber";
  // Rehber alani zengin HTML icerir; AI'nin mevcut bicimi referans almasi icin HTML korunur.
  // Diger alanlar (giris, dashboard) duz metin gonderilir.
  const mevcutGonder = rehberMi ? (mevcutDeger ?? "").trim() : duzMetin(mevcutDeger);

  async function uret() {
    if (!prompt.trim()) {
      setHata("Önce ne üretmek istediğini yaz.");
      return;
    }
    setUretiliyor(true);
    setHata(null);
    setSonuc("");
    setYeniHtml(null);
    setMevcutHtml(null);
    try {
      await aiApi.serbestUretAkis(
        {
          anahtar,
          prompt: prompt.trim(),
          ton: ton ?? undefined,
          uzunluk: uzunluk ?? undefined,
          mevcutMetin: mevcutGonder || undefined,
        },
        (token) => setSonuc((prev) => (prev ?? "") + token),
      );
    } catch {
      setHata("AI şu an metin üretemedi. Sağlayıcı ayarını ve bağlantıyı kontrol et.");
      setSonuc(null);
    } finally {
      setUretiliyor(false);
    }
  }

  // Mail onizleme: sonuc gelince mevcut + yeni mail HTML render (yalniz mailTip dolu alanlarda).
  useEffect(() => {
    if (!sonuc || !mailTip || uretiliyor) return;
    let iptal = false;
    setOnizlemeYukleniyor(true);
    (async () => {
      try {
        const [m, y] = await Promise.all([
          metinApi.mailOnizle(mailTip),
          metinApi.mailOnizle(mailTip, { [anahtar]: sonuc }),
        ]);
        if (!iptal) {
          setMevcutHtml(m);
          setYeniHtml(y);
        }
      } catch {
        if (!iptal) setHata("Mail önizlemesi alınamadı.");
      } finally {
        if (!iptal) setOnizlemeYukleniyor(false);
      }
    })();
    return () => {
      iptal = true;
    };
  }, [sonuc, mailTip, anahtar, uretiliyor]);

  const placeholderlar = sonuc ? placeholderlariBul(sonuc) : [];

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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40 backdrop-blur-sm sm:p-4"
      onClick={onKapat}
    >
      <div
        className="w-full sm:max-w-3xl max-h-[92vh] sm:max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-ink-900 border border-cream-300 dark:border-ink-700/60 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Baslik */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-cream-200 dark:border-ink-800 bg-white/95 dark:bg-ink-900/95 backdrop-blur">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-clay-900 dark:text-ink-50">
            <Sparkles className="h-4 w-4 text-terracotta" />
            AI ile metin üret
            <span className="text-clay-400 dark:text-ink-300 font-normal hidden sm:inline">- {etiket}</span>
          </h3>
          <button type="button" onClick={onKapat} className="text-clay-400 hover:text-terracotta transition-colors p-1" aria-label="Kapat">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-clay-500 dark:text-ink-300 sm:hidden">{etiket}</p>

          {/* Prompt (dolu gelir) */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-clay-700 dark:text-ink-100">Ne üretmek istiyorsun?</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-cream-300 dark:border-ink-700/60 bg-cream-50 dark:bg-ink-900/40 px-3 py-2 text-sm text-clay-900 dark:text-ink-50 focus:outline-none focus:ring-2 focus:ring-terracotta/40 focus:border-terracotta resize-y leading-relaxed"
            />
          </div>

          {/* Ton + Uzunluk */}
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-clay-700 dark:text-ink-100">Ton</span>
              <div className="flex flex-wrap gap-1.5">
                {TONLAR.map((t) => chip(t, ton === t, () => setTon(ton === t ? null : t)))}
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-clay-700 dark:text-ink-100">Uzunluk</span>
              <div className="flex flex-wrap gap-1.5">
                {UZUNLUKLAR.map((u) => chip(u, uzunluk === u, () => setUzunluk(uzunluk === u ? null : u)))}
              </div>
            </div>
          </div>

          {hata && <p className="text-xs text-red-600 dark:text-red-400">{hata}</p>}

          <Button onClick={uret} disabled={uretiliyor} className="w-full">
            {uretiliyor ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Üretiliyor...</>
            ) : sonuc ? (
              <><RefreshCw className="h-4 w-4" /> Yeniden üret</>
            ) : (
              <><Sparkles className="h-4 w-4" /> Üret</>
            )}
          </Button>

          {/* Streaming: canli yazim (token token akar) */}
          {uretiliyor && sonuc !== null && (
            <div className="space-y-2 pt-2 border-t border-cream-200 dark:border-ink-800">
              <p className="text-xs font-medium text-clay-700 dark:text-ink-100 flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-terracotta" /> AI yazıyor...
              </p>
              <div className="rounded-lg border border-terracotta/40 bg-terracotta/5 px-3 py-2 text-sm text-clay-900 dark:text-ink-50 min-h-[72px] whitespace-pre-wrap">
                {rehberMi ? duzMetin(sonuc) : sonuc}
                <span className="inline-block w-1.5 h-4 bg-terracotta/60 animate-pulse ml-0.5 align-middle" />
              </div>
            </div>
          )}

          {/* Bitince: onizleme (mail iframe / metin diff) */}
          {!uretiliyor && sonuc && (
            <div className="space-y-2 pt-2 border-t border-cream-200 dark:border-ink-800">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-clay-700 dark:text-ink-100">
                  {mailTip ? "Gerçek mail önizlemesi" : "Önizleme"}
                </p>
                {placeholderlar.length > 0 && (
                  <span className="text-[11px] text-terracotta bg-terracotta/10 rounded-full px-2 py-0.5">
                    Canlı: {placeholderlar.map((p) => (p === "alici_ad" ? `${p} → ${aliciAd}` : p)).join(", ")}
                  </span>
                )}
              </div>

              {mailTip ? (
                onizlemeYukleniyor || !yeniHtml ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm text-clay-400">
                    <Loader2 className="h-4 w-4 animate-spin" /> Mail önizlemesi hazırlanıyor...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-[11px] uppercase tracking-wide text-clay-400 dark:text-ink-300">Mevcut</span>
                      <iframe title="Mevcut mail" srcDoc={mevcutHtml ?? ""} sandbox="" className="w-full h-72 rounded-lg border border-cream-300 dark:border-ink-700/60 bg-white" />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] uppercase tracking-wide text-terracotta">Yeni (AI)</span>
                      <iframe title="Yeni mail" srcDoc={yeniHtml} sandbox="" className="w-full h-72 rounded-lg border border-terracotta/40 bg-white" />
                    </div>
                  </div>
                )
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <span className="text-[11px] uppercase tracking-wide text-clay-400 dark:text-ink-300">Mevcut</span>
                    <div className="rounded-lg border border-cream-300 dark:border-ink-700/60 bg-cream-50/50 dark:bg-ink-900/40 px-3 py-2 text-sm text-clay-500 dark:text-ink-300 min-h-[72px] whitespace-pre-wrap">
                      {mevcutGonder ? placeholderCoz(mevcutGonder, aliciAd) : <span className="italic text-clay-400">(boş)</span>}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[11px] uppercase tracking-wide text-terracotta">Yeni (AI)</span>
                    <div className="rounded-lg border border-terracotta/40 bg-terracotta/5 px-3 py-2 text-sm text-clay-900 dark:text-ink-50 min-h-[72px] whitespace-pre-wrap">
                      {placeholderCoz(sonuc, aliciAd)}
                    </div>
                  </div>
                </div>
              )}

              {/* Aksiyonlar */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={onKapat}>İptal</Button>
                <Button onClick={() => { onUygula(sonuc); onKapat(); }}>
                  <Check className="h-4 w-4" /> Alana uygula
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
