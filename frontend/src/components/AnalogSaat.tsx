"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useBen } from "@/lib/useBen";

// Saate gore selam: 05-12 Gunaydin, 12-18 Iyi gunler, 18-22 Iyi aksamlar, 22-05 Iyi geceler
function selamMetni(saat: number): string {
  if (saat >= 5 && saat < 12) return "Günaydın";
  if (saat >= 12 && saat < 18) return "İyi günler";
  if (saat >= 18 && saat < 22) return "İyi akşamlar";
  return "İyi geceler";
}

export function AnalogSaat({ boyut = 120 }: { boyut?: number }) {
  const [now, setNow] = useState<Date | null>(null);
  const [selamGoster, setSelamGoster] = useState(false);
  const [selamFade, setSelamFade] = useState(false);
  const { data: ben } = useBen();
  const rafRef = useRef<number | null>(null);

  // Canli saat - akan saniye icin requestAnimationFrame (yumusak ibre)
  useEffect(() => {
    const tik = () => {
      setNow(new Date());
      rafRef.current = requestAnimationFrame(tik);
    };
    rafRef.current = requestAnimationFrame(tik);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, []);

  // Selamlama - oturum basina bir kez, ~4.5sn gorunur sonra yumusak kaybolur
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("selam_gosterildi") === "1") return;
    setSelamGoster(true);
    sessionStorage.setItem("selam_gosterildi", "1");
    const fadeZaman = setTimeout(() => setSelamFade(true), 4000);
    const gizleZaman = setTimeout(() => setSelamGoster(false), 4800);
    return () => { clearTimeout(fadeZaman); clearTimeout(gizleZaman); };
  }, []);

  if (!now) return <div style={{ width: boyut, height: boyut }} aria-hidden />;

  const sa = now.getHours();
  const dk = now.getMinutes();
  const sn = now.getSeconds();
  const ms = now.getMilliseconds();

  // Ibre acilari (derece). Saniye ms ile yumusak akar.
  const snAci = (sn + ms / 1000) * 6;          // 360/60
  const dkAci = dk * 6 + sn * 0.1;             // dakika + saniye kaymasi
  const saAci = (sa % 12) * 30 + dk * 0.5;     // saat + dakika kaymasi

  // Dijital saat - ayrac saniyenin yarisinda soner (yanip sonme)
  const ayracGorunur = ms < 500;
  const ssa = sa.toString().padStart(2, "0");
  const sdk = dk.toString().padStart(2, "0");

  const merkez = 50;
  const ibre = (aci: number, uzunluk: number) => {
    const rad = (aci - 90) * (Math.PI / 180);
    return { x2: merkez + uzunluk * Math.cos(rad), y2: merkez + uzunluk * Math.sin(rad) };
  };
  const saIbre = ibre(saAci, 22);
  const dkIbre = ibre(dkAci, 32);
  const snIbre = ibre(snAci, 36);

  return (
    <div className="relative flex flex-col items-center">
      {/* Selamlama - kullaniciyi karsilar, sonra yumusak kaybolur */}
      {selamGoster && (
        <div
          className={cn(
            "absolute -top-7 whitespace-nowrap text-[12px] sm:text-[13px] font-medium text-terracotta transition-opacity duration-700 pointer-events-none",
            selamFade ? "opacity-0" : "opacity-100"
          )}
        >
          {selamMetni(sa)}{ben?.adSoyad ? `, ${ben.adSoyad.split(" ")[0]}` : ""}!
        </div>
      )}

      <svg
        width={boyut} height={boyut} viewBox="0 0 100 100"
        role="img" aria-label={`Saat ${ssa}:${sdk}`}
        className="select-none"
      >
        {/* Kadran */}
        <circle cx="50" cy="50" r="47" className="fill-cream-50 dark:fill-ink-900 stroke-cream-300 dark:stroke-ink-700" strokeWidth="1.5" />
        {/* Saat tikleri (12 adet) */}
        {Array.from({ length: 12 }).map((_, i) => {
          const aci = i * 30 * (Math.PI / 180);
          const dis = 44, ic = i % 3 === 0 ? 38 : 41;  // ana saatler daha uzun
          return (
            <line
              key={i}
              x1={50 + ic * Math.sin(aci)} y1={50 - ic * Math.cos(aci)}
              x2={50 + dis * Math.sin(aci)} y2={50 - dis * Math.cos(aci)}
              className={cn("stroke-clay-300 dark:stroke-ink-600", i % 3 === 0 && "stroke-clay-400 dark:stroke-ink-500")}
              strokeWidth={i % 3 === 0 ? 2 : 1} strokeLinecap="round"
            />
          );
        })}

        {/* Dijital saat - kadran ortasinda, cercevesiz, ibre ekseninin altinda */}
        <text x="50" y="70" textAnchor="middle" className="fill-clay-700 dark:fill-ink-100 font-display" style={{ fontSize: "11px", fontWeight: 600 }}>
          {ssa}<tspan style={{ opacity: ayracGorunur ? 1 : 0.15 }}>:</tspan>{sdk}
        </text>

        {/* Ibreler */}
        <line x1="50" y1="50" x2={saIbre.x2} y2={saIbre.y2} className="stroke-clay-700 dark:stroke-ink-100" strokeWidth="3" strokeLinecap="round" />
        <line x1="50" y1="50" x2={dkIbre.x2} y2={dkIbre.y2} className="stroke-clay-600 dark:stroke-ink-200" strokeWidth="2" strokeLinecap="round" />
        <line x1="50" y1="50" x2={snIbre.x2} y2={snIbre.y2} className="stroke-terracotta" strokeWidth="1" strokeLinecap="round" />
        {/* Merkez nokta */}
        <circle cx="50" cy="50" r="2.5" className="fill-terracotta" />
      </svg>
    </div>
  );
}
