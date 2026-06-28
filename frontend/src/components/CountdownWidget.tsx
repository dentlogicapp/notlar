"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsletmeMetinleri, metinDeger } from "@/lib/useIsletmeMetinleri";
import { sayacHesapla, hedefMsCoz, type SayacDurum } from "@/lib/sayac";

export function CountdownWidget({ gomulu = false }: { gomulu?: boolean } = {}) {
  const { data: metinler } = useIsletmeMetinleri();
  const [mount, setMount] = useState(false);
  const [k, setK] = useState<SayacDurum>({ gecti: false, gun: 0, sa: 0, dk: 0, sn: 0 });

  // v18 - hedef tarih field tek kaynak (datetime-local). Gecince ileri sayim (madde 4).
  const hedefTarih = metinDeger(metinler, "sayac_hedef_tarihi", "");
  const hedefMs = hedefMsCoz(hedefTarih);

  useEffect(() => {
    setMount(true);
    if (hedefMs === null) return;
    setK(sayacHesapla(hedefMs));
    const i = setInterval(() => setK(sayacHesapla(hedefMs)), 1000);
    return () => clearInterval(i);
  }, [hedefMs]);

  if (!mount) return null;
  const sayacAktif = metinDeger(metinler, "sayac_aktif", "") === "true";
  if (!sayacAktif) return null;     // sayac kapali -> gizli
  if (hedefMs === null) return null; // tarih yok -> gizli

  // gecti -> sayac_bitti_cumle + ileri sayim; gelmedi -> sayac_aktif_cumle + geri sayim
  const baslik = k.gecti
    ? metinDeger(metinler, "sayac_bitti_cumle", "")
    : metinDeger(metinler, "sayac_aktif_cumle", "");

  const SayacIcerik = ({ kompakt }: { kompakt?: boolean }) => (
    <>
      {/* madde 5 - sayac onu: SADECE atan kalp (marka emoji degil); marka adi ritmiyle ayni (animate-heart-beat) */}
      <Heart className={cn("text-terracotta fill-terracotta shrink-0 animate-heart-beat", kompakt ? "h-6 w-6" : "h-8 w-8")} strokeWidth={1.5} />
      <div className="flex flex-col min-w-0">
        {/* madde 3 - buyuk/kucuk harfe duyarli (uppercase CSS kaldirildi) */}
        <span className={cn("tracking-[0.02em] text-clay-500 dark:text-ink-200 leading-none font-medium truncate", kompakt ? "text-[11px]" : "text-[13px]")}>
          {baslik}
        </span>
        <div className={cn("flex items-baseline mt-1.5", kompakt ? "gap-1.5" : "gap-2")}>
          <KutuRakam deger={k.gun} etiket="gün" vurgu kompakt={kompakt} />
          <span className="text-clay-300 dark:text-ink-400 text-base">·</span>
          <KutuRakam deger={k.sa} etiket="sa" kompakt={kompakt} />
          <span className="text-clay-300 dark:text-ink-400 text-base">·</span>
          <KutuRakam deger={k.dk} etiket="dk" kompakt={kompakt} />
          <span className="text-clay-300 dark:text-ink-400 text-base">·</span>
          <KutuRakam deger={k.sn} etiket="sn" kompakt={kompakt} />
        </div>
      </div>
    </>
  );

  // gomulu: ZamanPaneli icinde konumlandirilir; pozisyon wrapper'i yok, icerik (kalp dahil) aynen.
  if (gomulu) {
    return (
      <div className="kart px-4 py-3 flex items-center justify-center gap-3 animate-fade-in">
        <SayacIcerik />
      </div>
    );
  }

  return (
    <>
      <div className="md:hidden mx-4 mt-3 mb-1 kart px-4 py-3 flex items-center justify-center gap-3 animate-fade-in">
        <SayacIcerik kompakt />
      </div>
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
          ? (kompakt ? "text-lg text-clay-900 dark:text-ink-50 font-semibold" : "text-2xl text-clay-900 dark:text-ink-50 font-semibold")
          : (kompakt ? "text-sm text-clay-700 dark:text-ink-100" : "text-lg text-clay-700 dark:text-ink-100")
      )}>
        {deger.toString().padStart(2, "0")}
      </span>
      <span className={cn("text-clay-400 dark:text-ink-300 font-medium", kompakt ? "text-[9px]" : "text-[10px]")}>{etiket}</span>
    </span>
  );
}
