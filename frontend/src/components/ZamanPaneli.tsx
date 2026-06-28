"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsletmeMetinleri, metinDeger } from "@/lib/useIsletmeMetinleri";
import { sayacHesapla, hedefMsCoz, type SayacDurum } from "@/lib/sayac";
import { notApi } from "@/lib/api";
import { AnalogSaat } from "./AnalogSaat";
import { MiniTakvim, tarihAnahtar } from "./MiniTakvim";
import { TakvimModal } from "./TakvimModal";
import { tatilGunleriHesapla } from "@/lib/tatiller";

const AY_ADLARI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const GUN_TAM = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

function KutuRakam({ deger, etiket, vurgu, kompakt }: { deger: number; etiket: string; vurgu?: boolean; kompakt?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-0.5 tabular-nums">
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

export function ZamanPaneli() {
  const { data: metinler } = useIsletmeMetinleri();
  const [mount, setMount] = useState(false);
  const [k, setK] = useState<SayacDurum>({ gecti: false, gun: 0, sa: 0, dk: 0, sn: 0 });
  const [modalAcik, setModalAcik] = useState(false);

  const hedefTarih = metinDeger(metinler, "sayac_hedef_tarihi", "");
  const hedefMs = hedefMsCoz(hedefTarih);
  const sayacAktif = metinDeger(metinler, "sayac_aktif", "") === "true" && hedefMs !== null;

  useEffect(() => {
    setMount(true);
    if (hedefMs === null) return;
    setK(sayacHesapla(hedefMs));
    const i = setInterval(() => setK(sayacHesapla(hedefMs)), 1000);
    return () => clearInterval(i);
  }, [hedefMs]);

  // Hatirlatici gunleri (takvim isaretleri icin)
  const { data: notlar } = useQuery({
    queryKey: ["notlar", { klasor: null, silindi: false, bekleyen: false }],
    queryFn: () => notApi.list({ silindi: false }),
    staleTime: 30_000,
  });
  const hatirlatmaGunleri = new Set(
    (notlar ?? []).filter((n) => n.hatirlatmaZamani).map((n) => tarihAnahtar(new Date(n.hatirlatmaZamani!)))
  );
  const tatilGunleri = tatilGunleriHesapla();

  if (!mount) return null;

  const bugun = new Date();
  const bugunYazi = `${bugun.getDate()} ${AY_ADLARI[bugun.getMonth()]} ${bugun.getFullYear()} - ${GUN_TAM[bugun.getDay()]}`;
  const baslik = k.gecti
    ? metinDeger(metinler, "sayac_bitti_cumle", "")
    : metinDeger(metinler, "sayac_aktif_cumle", "");

  const SayacBlok = ({ kompakt }: { kompakt?: boolean }) => (
    <div className="flex flex-col min-w-0 items-center">
      <span className={cn("tracking-[0.02em] text-clay-500 dark:text-ink-200 leading-none font-medium truncate text-center", kompakt ? "text-[11px]" : "text-[13px]")}>
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
  );

  // Takvim blogu (web - tam aylik), tarih altinda yazili
  const TakvimBlok = () => (
    <button
      type="button"
      onClick={() => setModalAcik(true)}
      className="flex flex-col items-stretch text-left rounded-lg p-1 hover:bg-cream-100 dark:hover:bg-ink-800/50 transition-colors"
      aria-label="Takvimi büyüt"
    >
      <MiniTakvim hatirlatmaGunleri={hatirlatmaGunleri} tatilGunleri={tatilGunleri} />
      <span className="mt-1.5 text-center text-[11px] font-medium text-clay-500 dark:text-ink-200">{bugunYazi}</span>
    </button>
  );

  return (
    <>
      {/* MOBIL: ust orta yatay - saat . (sayac) . takvim-tetik */}
      <div className="md:hidden mx-4 mt-3 mb-1 kart px-3 py-3 flex items-center justify-center gap-3 animate-fade-in">
        <AnalogSaat boyut={64} />
        {sayacAktif && <SayacBlok kompakt />}
        <button
          type="button"
          onClick={() => setModalAcik(true)}
          className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 hover:bg-cream-100 dark:hover:bg-ink-800/50 transition-colors"
          aria-label="Takvimi aç"
        >
          <CalendarDays className="h-6 w-6 text-terracotta" strokeWidth={1.75} />
          <span className="text-[9px] font-medium text-clay-500 dark:text-ink-200 text-center leading-tight whitespace-nowrap">{bugun.getDate()} {AY_ADLARI[bugun.getMonth()].slice(0, 3)}</span>
        </button>
      </div>

      {/* WEB: sag kose dikey - (sayac) -> takvim -> saat. Sayac yoksa bosluk dolar. */}
      <div className="hidden md:flex fixed top-4 right-4 z-40 kart px-4 py-3.5 flex-col items-center gap-3 animate-fade-in shadow-md hover:shadow-lg transition-shadow">
        {sayacAktif && (
          <>
            <SayacBlok />
            <div className="w-full border-t border-cream-200 dark:border-ink-700" />
          </>
        )}
        <TakvimBlok />
        <div className="w-full border-t border-cream-200 dark:border-ink-700" />
        <AnalogSaat boyut={96} />
      </div>

      <TakvimModal acik={modalAcik} onOpenChange={setModalAcik} notlar={notlar ?? []} tatilGunleri={tatilGunleri} />
    </>
  );
}
