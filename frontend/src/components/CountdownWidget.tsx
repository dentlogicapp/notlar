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

  // KAVUSTUK durumu
  if (k.bitti) {
    const kavustukIcerik = (
      <>
        <Heart className="h-7 w-7 text-terracotta animate-heart-beat shrink-0" fill="currentColor" strokeWidth={1.5} />
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.18em] text-clay-500 leading-none font-medium">kavuştuk</span>
          <span className="font-display text-xl text-clay-900 leading-tight mt-1">Mutluluklar 🤍</span>
        </div>
      </>
    );
    return (
      <>
        <div className="md:hidden mx-4 mt-3 mb-1 kart px-4 py-3 flex items-center justify-center gap-3 animate-fade-in">
          {kavustukIcerik}
        </div>
        <div className="hidden md:flex fixed top-4 right-4 z-40 kart px-5 py-3 items-center gap-3 animate-fade-in shadow-md">
          {kavustukIcerik}
        </div>
      </>
    );
  }

  // Kalanı gösteren içerik — mobil ve desktop'ta paylaşılan iç yapı
  const SayacIcerik = ({ kompakt }: { kompakt?: boolean }) => (
    <>
      <Heart
        className={cn(
          "text-terracotta animate-heart-beat shrink-0 drop-shadow-sm",
          kompakt ? "h-6 w-6" : "h-9 w-9"
        )}
        fill="currentColor"
        strokeWidth={1.5}
      />
      <div className="flex flex-col min-w-0">
        <span className={cn(
          "uppercase tracking-[0.2em] text-clay-500 leading-none font-medium",
          kompakt ? "text-[10px]" : "text-[11px]"
        )}>
          kavuşmamıza
        </span>
        <div className={cn("flex items-baseline mt-1.5", kompakt ? "gap-1.5" : "gap-2")}>
          <KutuRakam deger={k.gun} etiket="gün" vurgu kompakt={kompakt} />
          <span className="text-clay-300 text-base">·</span>
          <KutuRakam deger={k.sa} etiket="sa" kompakt={kompakt} />
          <span className="text-clay-300 text-base">·</span>
          <KutuRakam deger={k.dk} etiket="dk" kompakt={kompakt} />
          <span className="text-clay-300 text-base">·</span>
          <KutuRakam deger={k.sn} etiket="sn" kompakt={kompakt} />
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* MOBIL: header altında akan inline kart */}
      <div className="md:hidden mx-4 mt-3 mb-1 kart px-4 py-3 flex items-center justify-center gap-3 animate-fade-in">
        <SayacIcerik kompakt />
      </div>
      {/* TABLET+: sağ üst köşede sabit floating kart */}
      <div className="hidden md:flex fixed top-4 right-4 z-40 kart px-5 py-3.5 items-center gap-3.5 animate-fade-in shadow-md hover:shadow-lg transition-shadow">
        <SayacIcerik />
      </div>
    </>
  );
}

function KutuRakam({ deger, etiket, vurgu, kompakt, className }: {
  deger: number; etiket: string; vurgu?: boolean; kompakt?: boolean; className?: string
}) {
  return (
    <span className={cn("inline-flex items-baseline gap-0.5 tabular-nums", className)}>
      <span className={cn(
        "font-display leading-none",
        vurgu
          ? (kompakt ? "text-lg text-clay-900 font-semibold" : "text-2xl text-clay-900 font-semibold")
          : (kompakt ? "text-sm text-clay-700" : "text-lg text-clay-700")
      )}>
        {deger.toString().padStart(2, "0")}
      </span>
      <span className={cn(
        "text-clay-400 font-medium",
        kompakt ? "text-[9px]" : "text-[10px]"
      )}>{etiket}</span>
    </span>
  );
}
