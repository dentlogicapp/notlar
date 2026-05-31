"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

// Türkiye saati (UTC+3) — 1 Eylül 2026 00:00 TR = 31 Ağustos 21:00 UTC
const HEDEF_UTC = new Date("2026-08-31T21:00:00.000Z").getTime();

function kalanHesapla() {
  const su = Date.now();
  const fark = HEDEF_UTC - su;
  if (fark <= 0) return { bitti: true, gun: 0, sa: 0, dk: 0, sn: 0 };
  const gun = Math.floor(fark / 86400000);
  const sa = Math.floor((fark % 86400000) / 3600000);
  const dk = Math.floor((fark % 3600000) / 60000);
  const sn = Math.floor((fark % 60000) / 1000);
  return { bitti: false, gun, sa, dk, sn };
}

export function CountdownWidget() {
  const [k, setK] = useState(() => kalanHesapla());
  const [mount, setMount] = useState(false);

  useEffect(() => {
    setMount(true);
    const i = setInterval(() => setK(kalanHesapla()), 1000);
    return () => clearInterval(i);
  }, []);

  if (!mount) return null;

  if (k.bitti) {
    return (
      <div className="fixed top-3 right-3 sm:top-4 sm:right-4 z-40 kart px-5 py-3 flex items-center gap-3 animate-fade-in shadow-md">
        <Heart className="h-7 w-7 text-terracotta animate-heart-beat" fill="currentColor" />
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.18em] text-clay-500 leading-none font-medium">kavuştuk</span>
          <span className="font-display text-xl text-clay-900 leading-tight mt-1">Mutluluklar 🤍</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed top-3 right-3 sm:top-4 sm:right-4 z-40 kart px-4 py-2.5 sm:px-5 sm:py-3.5 flex items-center gap-3 sm:gap-3.5 animate-fade-in shadow-md hover:shadow-lg transition-shadow">
      <Heart
        className="h-7 w-7 sm:h-9 sm:w-9 text-terracotta animate-heart-beat shrink-0 drop-shadow-sm"
        fill="currentColor"
        strokeWidth={1.5}
      />
      <div className="flex flex-col">
        <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.2em] text-clay-500 leading-none font-medium">
          kavuşmamıza
        </span>
        <div className="flex items-baseline gap-1.5 sm:gap-2 mt-1.5">
          <KutuRakam deger={k.gun} etiket="gün" vurgu />
          <span className="text-clay-300 text-base">·</span>
          <KutuRakam deger={k.sa} etiket="sa" />
          <span className="text-clay-300 text-base">·</span>
          <KutuRakam deger={k.dk} etiket="dk" />
          <span className="text-clay-300 text-base">·</span>
          <KutuRakam deger={k.sn} etiket="sn" />
        </div>
      </div>
    </div>
  );
}

function KutuRakam({ deger, etiket, vurgu, className }: {
  deger: number; etiket: string; vurgu?: boolean; className?: string
}) {
  return (
    <span className={cn("inline-flex items-baseline gap-0.5 tabular-nums", className)}>
      <span className={cn(
        "font-display leading-none",
        vurgu
          ? "text-xl sm:text-2xl text-clay-900 font-semibold"
          : "text-base sm:text-lg text-clay-700"
      )}>
        {deger.toString().padStart(2, "0")}
      </span>
      <span className="text-[9px] sm:text-[10px] text-clay-400 font-medium">{etiket}</span>
    </span>
  );
}
