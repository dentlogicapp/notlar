"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { notApi } from "@/lib/api";
import { AnalogSaat } from "./AnalogSaat";
import { MiniTakvim, tarihAnahtar } from "./MiniTakvim";
import { TakvimModal } from "./TakvimModal";
import { CountdownWidget } from "./CountdownWidget";
import { tatilGunleriHesapla } from "@/lib/tatiller";

export function ZamanPaneli() {
  const [modalAcik, setModalAcik] = useState(false);

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

  // Saat + Takvim - tek blok, yan yana. Sayactan bagimsiz; sayac olsa da olmasa da ic duzeni ayni.
  const SaatTakvimKart = () => (
    <div className="kart px-4 py-3 flex items-center justify-center gap-3">
      <AnalogSaat boyut={84} />
      <div className="self-stretch border-l border-cream-200 dark:border-ink-700" />
      <button
        type="button"
        onClick={() => setModalAcik(true)}
        className="rounded-lg p-1 hover:bg-cream-100 dark:hover:bg-ink-800/50 transition-colors"
        aria-label="Takvimi büyüt"
      >
        <MiniTakvim salt hatirlatmaGunleri={hatirlatmaGunleri} tatilGunleri={tatilGunleri} />
      </button>
    </div>
  );

  return (
    <>
      {/* Tek panel: ustte sayac satiri (varsa), altinda saat&takvim satiri.
          Mobilde sayfa ustu, webde sag kose. Sayac yoksa o satir kalkar, saat&takvim ayni yerinde kalir. */}
      <div className="mx-4 mt-3 mb-1 md:mx-0 md:my-0 md:fixed md:top-4 md:right-4 md:z-40 flex flex-col gap-2 items-stretch md:items-end animate-fade-in">
        <CountdownWidget gomulu />
        <SaatTakvimKart />
      </div>

      <TakvimModal acik={modalAcik} onOpenChange={setModalAcik} notlar={notlar ?? []} tatilGunleri={tatilGunleri} />
    </>
  );
}
