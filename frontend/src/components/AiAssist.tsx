"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Sparkles, X } from "lucide-react";
import { aiApi } from "@/lib/api";
import { useAiSaglik } from "@/lib/useAiAssist";

// v18 Asama 11 - AI ✨ asistan. LLM kapali -> gri/pasif; acik -> terracotta + modal (ton/uzunluk + 3 oneri).
// Saglayicidan habersiz (backend OpenAI/lokal fark etmez); sadece "yanit geldi mi" + "oneriler" ile ilgilenir.
const TONLAR = [
  { k: "samimi", e: "Samimi" },
  { k: "resmi", e: "Resmi" },
];
const UZUNLUKLAR = [
  { k: "kisa", e: "Kısa" },
  { k: "orta", e: "Orta" },
  { k: "uzun", e: "Uzun" },
];

export function AiAssist({ anahtar, onTaslakSec }: { anahtar: string; onTaslakSec: (metin: string) => void }) {
  const { data: saglik } = useAiSaglik();
  const saglikli = saglik?.saglikli ?? false;
  const [acik, setAcik] = useState(false);
  const [ton, setTon] = useState("samimi");
  const [uzunluk, setUzunluk] = useState("kisa");

  const oner = useMutation({ mutationFn: () => aiApi.taslakOner({ anahtar, ton, uzunluk }) });

  if (!saglikli) {
    return (
      <span
        title="AI kullanılamıyor (sağlayıcı kapalı veya ulaşılamıyor)"
        className="inline-flex items-center gap-1 text-[11px] text-clay-300 dark:text-ink-400 cursor-not-allowed select-none"
      >
        <Sparkles className="h-3.5 w-3.5" /> AI
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAcik(true)}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-terracotta hover:text-terracotta/80 transition-colors"
      >
        <Sparkles className="h-3.5 w-3.5" /> AI ile öner
      </button>

      {acik && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4"
          onClick={() => setAcik(false)}
        >
          <div
            className="kart w-full max-w-md p-5 space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg text-clay-900 dark:text-ink-50 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-terracotta" /> AI ile taslak öner
              </h3>
              <button
                type="button"
                onClick={() => setAcik(false)}
                className="text-clay-400 hover:text-clay-700 dark:hover:text-ink-50"
                aria-label="Kapat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <Segmented label="Ton" secenekler={TONLAR} deger={ton} onSec={setTon} />
            <Segmented label="Uzunluk" secenekler={UZUNLUKLAR} deger={uzunluk} onSec={setUzunluk} />

            <button
              type="button"
              onClick={() => oner.mutate()}
              disabled={oner.isPending}
              className="w-full rounded-lg bg-terracotta text-cream-50 py-2 text-sm font-medium hover:bg-terracotta/90 transition-colors disabled:opacity-50"
            >
              {oner.isPending ? "Üretiliyor..." : oner.data ? "↻ Yeniden öner" : "✨ Öner"}
            </button>

            {oner.isError && (
              <p className="text-xs text-red-600 dark:text-red-400">AI şu an kullanılamıyor, biraz sonra tekrar dene.</p>
            )}

            {oner.data && (
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-wider text-clay-400 dark:text-ink-300">Öneriler — birine tıkla</p>
                {oner.data.oneriler.map((o, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      onTaslakSec(o);
                      setAcik(false);
                    }}
                    className="w-full text-left rounded-lg border border-cream-300 dark:border-ink-700/60 bg-cream-50 dark:bg-ink-900/40 px-3 py-2 text-sm text-clay-800 dark:text-ink-50 hover:border-terracotta hover:bg-terracotta/5 transition-colors"
                  >
                    {o}
                  </button>
                ))}
                <p className="text-[10px] text-clay-400 dark:text-ink-300 text-right">
                  {oner.data.modelId} · {oner.data.yanitSuresiMs}ms
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Segmented({ label, secenekler, deger, onSec }: {
  label: string; secenekler: { k: string; e: string }[]; deger: string; onSec: (k: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-clay-600 dark:text-ink-100 mb-1.5">{label}</p>
      <div className="inline-flex rounded-lg border border-cream-300 dark:border-ink-700/60 p-0.5 gap-0.5">
        {secenekler.map((s) => (
          <button
            key={s.k}
            type="button"
            onClick={() => onSec(s.k)}
            className={[
              "px-3 py-1 rounded-md text-xs font-medium transition-colors",
              deger === s.k ? "bg-terracotta text-cream-50" : "text-clay-600 dark:text-ink-100 hover:bg-cream-200 dark:hover:bg-ink-800",
            ].join(" ")}
          >
            {s.e}
          </button>
        ))}
      </div>
    </div>
  );
}
