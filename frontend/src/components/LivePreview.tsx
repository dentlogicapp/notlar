"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { cozMetin } from "@/lib/useIsletmeMetinleri";
import { sayacHesapla, hedefMsCoz, type SayacDurum } from "@/lib/sayac";

// v18 - Live Preview: marka sayfasinda field duzenlenirken anlik dinamik onizleme.
// Tek kutu standardi, canli sayac (geri+ileri), karsilama + not ipucu. Mail onizleme Asama D.
export function LivePreview({ sekme, degerler }: { sekme: string; degerler: Record<string, string> }) {
  const [sk, setSk] = useState<SayacDurum>({ gecti: false, gun: 0, sa: 0, dk: 0, sn: 0 });
  const hedefMs = hedefMsCoz(degerler["sayac_hedef_tarihi"] ?? "");

  useEffect(() => {
    if (hedefMs === null) return;
    setSk(sayacHesapla(hedefMs));
    const i = setInterval(() => setSk(sayacHesapla(hedefMs)), 1000);
    return () => clearInterval(i);
  }, [hedefMs]);

  const c = (anahtar: string) => cozMetin(degerler[anahtar] ?? "", degerler);
  const kutu = "rounded-xl border border-cream-300 dark:border-ink-700 px-4 py-3";

  if (sekme === "marka") {
    const ad = c("marka_adi") || "Marka Adı";
    const emoji = degerler["marka_emoji"] ?? "";
    // Tek kutu standardi (madde 1): emoji + ad birlikte
    return (
      <div className={kutu + " flex items-center gap-2.5"}>
        {emoji && <span className="text-xl shrink-0">{emoji}</span>}
        <span className="font-display text-lg text-clay-900 dark:text-ink-50 truncate">{ad}</span>
      </div>
    );
  }

  if (sekme === "karsilama") {
    return (
      <div className="space-y-3">
        <div className={kutu + " py-4"}>
          <p className="font-display text-xl text-clay-900 dark:text-ink-50 leading-tight">
            {c("dashboard_karsilama_basligi") || "Karşılama Başlığı"}
          </p>
          <p className="text-clay-500 dark:text-ink-200 mt-1.5 italic text-sm leading-relaxed">
            {c("dashboard_karsilama_alt_metin") || "Karşılama alt metni burada görünür."}
          </p>
        </div>
        {/* madde 2 - not ekleme kutusu onizleme */}
        <div className={kutu}>
          <p className="text-[11px] uppercase tracking-wider text-clay-400 dark:text-ink-300 mb-1.5">Not ekleme kutusu</p>
          <div className="rounded-lg border border-cream-300 dark:border-ink-700/60 bg-cream-50 dark:bg-ink-900/40 px-3 py-2 text-sm text-clay-400 dark:text-ink-300 italic truncate">
            {c("not_form_placeholder") || "Not ekleme ipucu..."}
          </div>
        </div>
      </div>
    );
  }

  if (sekme === "sayac") {
    const aktif = (degerler["sayac_aktif"] ?? "") === "true";
    if (!aktif) return <p className="text-sm italic text-clay-400 dark:text-ink-300">Sayaç kapalı — dashboard'da gösterilmez.</p>;
    if (hedefMs === null) return <p className="text-sm italic text-clay-400 dark:text-ink-300">Hedef tarih ve saat girilince önizleme görünür.</p>;

    // madde 3/4 - gecti ise bitti cumlesi + ileri sayim; gelmedi ise aktif cumle + geri sayim
    const baslik = sk.gecti
      ? (c("sayac_bitti_cumle") || "Sayaç bitti cümlesi")
      : (c("sayac_aktif_cumle") || "Sayaç aktif cümlesi");
    return (
      <div className={kutu + " flex items-center gap-3"}>
        <Heart className="h-7 w-7 text-terracotta shrink-0 animate-heart-beat" fill="currentColor" strokeWidth={1.5} />
        <div className="flex flex-col min-w-0">
          <span className="text-[13px] tracking-[0.02em] text-clay-500 dark:text-ink-200 leading-none font-medium truncate">{baslik}</span>
          <div className="flex items-baseline gap-1.5 mt-1.5 tabular-nums font-display">
            <Rakam d={sk.gun} e="gün" vurgu />
            <span className="text-clay-300 text-sm">·</span>
            <Rakam d={sk.sa} e="sa" />
            <span className="text-clay-300 text-sm">·</span>
            <Rakam d={sk.dk} e="dk" />
            <span className="text-clay-300 text-sm">·</span>
            <Rakam d={sk.sn} e="sn" />
          </div>
          {sk.gecti && <span className="text-[10px] text-terracotta italic mt-1">hedef geçti — ileri sayım</span>}
        </div>
      </div>
    );
  }

  return (
    <p className="text-sm italic text-clay-400 dark:text-ink-300 leading-relaxed">
      Bu sekme için canlı önizleme mail editörüyle birlikte gelecek.
    </p>
  );
}

function Rakam({ d, e, vurgu }: { d: number; e: string; vurgu?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-0.5">
      <span className={vurgu ? "text-xl text-clay-900 dark:text-ink-50 font-semibold leading-none" : "text-base text-clay-700 dark:text-ink-100 leading-none"}>
        {d.toString().padStart(2, "0")}
      </span>
      <span className="text-[9px] text-clay-400 dark:text-ink-300 font-medium">{e}</span>
    </span>
  );
}
