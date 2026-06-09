"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsletmeMetinleri } from "@/lib/useIsletmeMetinleri";

const FLAG = "hosgeldin_gosterildi";

// v18 Asama 17 - Ilk giriste (zorunlu eksik varsa) 1sn sonra acilan dismiss edilebilir karsilama.
// localStorage flag ile bir daha gosterilmez. AuthGuard requireAdmin altinda mount edilir.
export function HosgeldinModal() {
  const router = useRouter();
  const { data: metinler } = useIsletmeMetinleri();
  const [goster, setGoster] = useState(false);

  const toplamAlan = (metinler ?? []).filter((m) => !m.deprecated).length;
  const dakikaTahmin = Math.max(1, Math.ceil(toplamAlan * 0.4)); // E4

  useEffect(() => {
    if (!metinler) return;
    if (localStorage.getItem(FLAG)) return;
    const zorunluEksik = metinler.some(
      (m) => m.zorunlu && !m.deprecated && !(m.icerik ?? "").trim()
    );
    if (!zorunluEksik) {
      localStorage.setItem(FLAG, "1"); // her sey dolu -> bir daha sorma
      return;
    }
    const t = setTimeout(() => setGoster(true), 1000);
    return () => clearTimeout(t);
  }, [metinler]);

  const kapat = () => {
    localStorage.setItem(FLAG, "1");
    setGoster(false);
  };
  const basla = () => {
    localStorage.setItem(FLAG, "1");
    router.push("/admin/onboarding");
  };

  if (!goster) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/40 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl border border-cream-300 dark:border-ink-700/60 bg-cream-50 dark:bg-ink-800 p-6 shadow-xl">
        <button
          onClick={kapat}
          className="absolute right-3 top-3 text-clay-400 dark:text-ink-300 hover:text-clay-700 dark:hover:text-ink-100"
          aria-label="Kapat"
        >
          <X className="h-5 w-5" />
        </button>
        <Sparkles className="h-10 w-10 text-terracotta mb-3" />
        <h2 className="font-display text-2xl text-clay-900 dark:text-ink-50">Hoş geldin!</h2>
        <p className="text-sm text-clay-500 dark:text-ink-300 mt-2 leading-relaxed">
          Sistemini kendi diline göre kişiselleştirelim — marka adından davet maillerine kadar.
          Adım adım ilerleyen kısa bir kurulum: <strong>~{dakikaTahmin} dakika, {toplamAlan} alan</strong>.
        </p>
        <div className="flex items-center gap-2 mt-5">
          <Button onClick={basla} className="flex-1">
            Hadi başla
          </Button>
          <Button variant="ghost" onClick={kapat} className="flex-1">
            Önce keşfedeyim
          </Button>
        </div>
      </div>
    </div>
  );
}
