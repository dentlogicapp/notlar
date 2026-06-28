"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useBen } from "@/lib/useBen";

const AY_ADLARI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const GUN_TAM = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

function selamMetni(saat: number): string {
  if (saat >= 5 && saat < 12) return "Günaydın";
  if (saat >= 12 && saat < 18) return "İyi günler";
  if (saat >= 18 && saat < 22) return "İyi akşamlar";
  return "İyi geceler";
}

export function AnalogSaat({ boyut = 116 }: { boyut?: number }) {
  const [now, setNow] = useState<Date | null>(null);
  const [selamGoster, setSelamGoster] = useState(false);
  const [selamFade, setSelamFade] = useState(false);
  const { data: ben } = useBen();
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const tik = () => {
      setNow(new Date());
      rafRef.current = requestAnimationFrame(tik);
    };
    rafRef.current = requestAnimationFrame(tik);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("selam_gosterildi") === "1") return;
    setSelamGoster(true);
    sessionStorage.setItem("selam_gosterildi", "1");
    const fadeZaman = setTimeout(() => setSelamFade(true), 4000);
    const gizleZaman = setTimeout(() => setSelamGoster(false), 4800);
    return () => { clearTimeout(fadeZaman); clearTimeout(gizleZaman); };
  }, []);

  if (!now) return <div style={{ width: boyut, height: boyut + 56 }} aria-hidden />;

  const sa = now.getHours();
  const dk = now.getMinutes();
  const sn = now.getSeconds();
  const ms = now.getMilliseconds();

  const snAci = (sn + ms / 1000) * 6;
  const dkAci = dk * 6 + sn * 0.1;
  const saAci = (sa % 12) * 30 + dk * 0.5;

  const ayracGorunur = ms < 500;
  const ssa = sa.toString().padStart(2, "0");
  const sdk = dk.toString().padStart(2, "0");
  const tarihUst = `${now.getDate()} ${AY_ADLARI[now.getMonth()]} ${now.getFullYear()}`;
  const gunAdi = GUN_TAM[now.getDay()];

  const ibre = (aci: number, uzunluk: number) => {
    const rad = (aci - 90) * (Math.PI / 180);
    return { x2: 50 + uzunluk * Math.cos(rad), y2: 50 + uzunluk * Math.sin(rad) };
  };
  const saIbre = ibre(saAci, 22);
  const dkIbre = ibre(dkAci, 31);
  const snIbre = ibre(snAci, 35);

  return (
    <div className="relative flex flex-col items-center gap-1.5">
      {/* Selamlama - oturum basina bir kez, gorunup yumusak kaybolur */}
      {selamGoster && (
        <div className={cn(
          "absolute -top-7 whitespace-nowrap text-[12px] sm:text-[13px] font-medium text-terracotta transition-opacity duration-700 pointer-events-none z-10",
          selamFade ? "opacity-0" : "opacity-100"
        )}>
          {selamMetni(sa)}{ben?.adSoyad ? `, ${ben.adSoyad.split(" ")[0]}` : ""}!
        </div>
      )}

      {/* Acik tarih - ust */}
      <div className="text-center leading-tight">
        <div className="text-[12px] font-semibold text-clay-700 dark:text-ink-50">{tarihUst}</div>
        <div className="text-[11px] text-clay-400 dark:text-ink-300">{gunAdi}</div>
      </div>

      {/* Analog saat - tum rakamlar, dijital merkez yok */}
      <svg width={boyut} height={boyut} viewBox="0 0 100 100" role="img" aria-label={`Saat ${ssa}:${sdk}`} className="select-none">
        <circle cx="50" cy="50" r="47" className="fill-cream-50 dark:fill-ink-900 stroke-cream-300 dark:stroke-ink-700" strokeWidth="1.5" />
        {/* Dakika tikleri (ince) */}
        {Array.from({ length: 60 }).map((_, i) => {
          if (i % 5 === 0) return null;
          const aci = i * 6 * (Math.PI / 180);
          return (
            <line key={`t${i}`}
              x1={50 + 45 * Math.sin(aci)} y1={50 - 45 * Math.cos(aci)}
              x2={50 + 47 * Math.sin(aci)} y2={50 - 47 * Math.cos(aci)}
              className="stroke-clay-200 dark:stroke-ink-700" strokeWidth="0.5"
            />
          );
        })}
        {/* Saat rakamlari 1-12 */}
        {Array.from({ length: 12 }).map((_, idx) => {
          const i = idx + 1;
          const aci = i * 30 * (Math.PI / 180);
          return (
            <text key={`r${i}`}
              x={50 + 38 * Math.sin(aci)} y={50 - 38 * Math.cos(aci)}
              textAnchor="middle" dominantBaseline="central"
              className="fill-clay-600 dark:fill-ink-200 font-display"
              style={{ fontSize: "9px", fontWeight: 600 }}
            >
              {i}
            </text>
          );
        })}
        {/* Ibreler */}
        <line x1="50" y1="50" x2={saIbre.x2} y2={saIbre.y2} className="stroke-clay-700 dark:stroke-ink-100" strokeWidth="3" strokeLinecap="round" />
        <line x1="50" y1="50" x2={dkIbre.x2} y2={dkIbre.y2} className="stroke-clay-600 dark:stroke-ink-200" strokeWidth="2" strokeLinecap="round" />
        <line x1="50" y1="50" x2={snIbre.x2} y2={snIbre.y2} className="stroke-terracotta" strokeWidth="1" strokeLinecap="round" />
        <circle cx="50" cy="50" r="2.5" className="fill-terracotta" />
      </svg>

      {/* Buyuk dijital saat - alt */}
      <div className="font-display font-semibold text-clay-900 dark:text-ink-50 tabular-nums leading-none" style={{ fontSize: "1.75rem" }}>
        {ssa}<span style={{ opacity: ayracGorunur ? 1 : 0.2 }}>:</span>{sdk}
      </div>
    </div>
  );
}
