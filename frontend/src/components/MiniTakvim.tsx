"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const AY_ADLARI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const GUN_ADLARI = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

// yerel tarih -> "YYYY-MM-DD" (UTC kaymasi olmadan)
export function tarihAnahtar(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const g = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${g}`;
}

function pztBasli(jsGun: number): number {
  return (jsGun + 6) % 7;
}

export function MiniTakvim({
  hatirlatmaGunleri = new Set<string>(),
  tatilGunleri = new Set<string>(),
  onGunTikla,
  buyuk = false,
  salt = false,
}: {
  hatirlatmaGunleri?: Set<string>;
  tatilGunleri?: Set<string>;
  onGunTikla?: (tarih: Date) => void;
  buyuk?: boolean;
  salt?: boolean;
}) {
  const bugun = new Date();
  const [gosterilen, setGosterilen] = useState(new Date(bugun.getFullYear(), bugun.getMonth(), 1));
  const [yon, setYon] = useState<"sol" | "sag" | null>(null);

  const yil = gosterilen.getFullYear();
  const ay = gosterilen.getMonth();
  const ayBasiGun = pztBasli(new Date(yil, ay, 1).getDay());
  const ayGunSayisi = new Date(yil, ay + 1, 0).getDate();
  const oncekiAy = (ay + 11) % 12;
  const sonrakiAy = (ay + 1) % 12;

  function ayDegis(delta: number) {
    setYon(delta > 0 ? "sag" : "sol");
    setGosterilen(new Date(yil, ay + delta, 1));
  }

  // HER ZAMAN 42 hucre (6 satir) - ay gecisinde boyut hic degismez
  const hucreler: (number | null)[] = [];
  for (let i = 0; i < ayBasiGun; i++) hucreler.push(null);
  for (let g = 1; g <= ayGunSayisi; g++) hucreler.push(g);
  while (hucreler.length < 42) hucreler.push(null);

  const hucreBoyut = buyuk ? "h-10 w-10 text-sm" : salt ? "h-6 w-6 text-[10px]" : "h-7 w-7 text-[11px]";

  return (
    <div className="flex flex-col">
      {/* Baslik: salt modda sadece ay-yil; etkilesimli modda sol/sag ay oklari */}
      <div className={cn("flex items-center mb-1.5", salt ? "justify-center" : "justify-between")}>
        {!salt && (
          <button
            type="button" onClick={() => ayDegis(-1)}
            aria-label={`Önceki ay: ${AY_ADLARI[oncekiAy]}`}
            title={AY_ADLARI[oncekiAy]}
            className="flex items-center justify-center h-7 w-7 rounded-md text-clay-400 dark:text-ink-300 hover:text-terracotta hover:bg-cream-200 dark:hover:bg-ink-800 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <span className={cn("font-display font-semibold text-clay-800 dark:text-ink-50", buyuk ? "text-base" : salt ? "text-[12px]" : "text-[13px]")}>
          {AY_ADLARI[ay]} {yil}
        </span>
        {!salt && (
          <button
            type="button" onClick={() => ayDegis(1)}
            aria-label={`Sonraki ay: ${AY_ADLARI[sonrakiAy]}`}
            title={AY_ADLARI[sonrakiAy]}
            className="flex items-center justify-center h-7 w-7 rounded-md text-clay-400 dark:text-ink-300 hover:text-terracotta hover:bg-cream-200 dark:hover:bg-ink-800 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Gun basliklari */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {GUN_ADLARI.map((g, i) => (
          <div key={g} className={cn("text-center font-medium", salt ? "text-[8px]" : "text-[9px]", i >= 5 ? "text-terracotta/70" : "text-clay-400 dark:text-ink-300")}>
            {g}
          </div>
        ))}
      </div>

      {/* Gun gridi - ay gecisinde yana kayma (etkilesimli mod) */}
      <div
        key={`${yil}-${ay}`}
        className={cn("grid grid-cols-7 gap-0.5", !salt && (yon === "sag" ? "animate-slide-left" : yon === "sol" ? "animate-slide-right" : ""))}
      >
        {hucreler.map((g, i) => {
          if (g === null) return <div key={`bos-${i}`} className={hucreBoyut} />;
          const tarih = new Date(yil, ay, g);
          const anahtar = tarihAnahtar(tarih);
          const bugunMu = anahtar === tarihAnahtar(bugun);
          const haftaSonu = i % 7 >= 5;
          const hatirlatmaVar = hatirlatmaGunleri.has(anahtar);
          const tatilMi = tatilGunleri.has(anahtar);
          const renkSinif = bugunMu
            ? "bg-terracotta text-white font-semibold animate-pulse-soft"
            : cn(!salt && "hover:bg-cream-200 dark:hover:bg-ink-800", tatilMi ? "text-terracotta font-medium" : haftaSonu ? "text-terracotta/70" : "text-clay-700 dark:text-ink-100");
          const ortak = cn("relative flex items-center justify-center rounded-full transition-colors tabular-nums", hucreBoyut, renkSinif);
          const isaret = hatirlatmaVar && (
            <span className={cn("absolute bottom-0.5 rounded-full", salt ? "h-[3px] w-[3px]" : "h-1 w-1", bugunMu ? "bg-white" : "bg-terracotta")} aria-hidden />
          );

          if (salt) {
            return <div key={g} className={ortak}>{g}{isaret}</div>;
          }
          return (
            <button
              key={g}
              type="button"
              onClick={() => onGunTikla?.(tarih)}
              aria-label={`${g} ${AY_ADLARI[ay]}${bugunMu ? ", bugün" : ""}${hatirlatmaVar ? ", hatırlatıcı var" : ""}`}
              className={ortak}
            >
              {g}{isaret}
            </button>
          );
        })}
      </div>
    </div>
  );
}
