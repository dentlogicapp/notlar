"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { notApi } from "@/lib/api";
import { AnalogSaat } from "./AnalogSaat";
import { MiniTakvim, tarihAnahtar } from "./MiniTakvim";
import { TakvimModal } from "./TakvimModal";
import { CountdownWidget } from "./CountdownWidget";

export function ZamanPaneli() {
  const [modalAcik, setModalAcik] = useState(false);
  const [modalBaslangic, setModalBaslangic] = useState<Date | null>(null);

  const { data: notlar } = useQuery({
    queryKey: ["notlar", { klasor: null, silindi: false, bekleyen: false }],
    queryFn: () => notApi.list({ silindi: false }),
    staleTime: 30_000,
  });
  const hatirlatmaGunleri = new Set(
    (notlar ?? []).filter((n) => n.hatirlatmaZamani).map((n) => tarihAnahtar(new Date(n.hatirlatmaZamani!)))
  );

  // Saat + Takvim tek blok. Icerik karti doldurur (sag/sol bosluk yok); sayactan bagimsiz.
  const SaatTakvimKart = () => (
    <div className="kart px-4 py-3 flex items-center justify-center gap-4">
      <AnalogSaat boyut={108} onTarihTikla={() => { setModalBaslangic(new Date()); setModalAcik(true); }} />
      <div className="self-stretch border-l border-cream-200 dark:border-ink-700" />
      <button
        type="button"
        onClick={() => { setModalBaslangic(null); setModalAcik(true); }}
        className="rounded-lg p-1 hover:bg-cream-100 dark:hover:bg-ink-800/50 transition-colors"
        aria-label="Takvimi büyüt"
      >
        <MiniTakvim salt hatirlatmaGunleri={hatirlatmaGunleri} />
      </button>
    </div>
  );

  return (
    <>
      {/* Tek panel: ustte sayac satiri (varsa), altinda saat&takvim. Kartlar icerige sigar, ortalanir.
          Mobilde sayfa ustu ortali, webde sag kose. Sayac yoksa o satir kalkar, saat&takvim yerinde kalir. */}
      <div className="mx-4 mt-3 mb-1 md:mx-0 md:my-0 md:fixed md:top-4 md:right-4 md:z-40 flex flex-col gap-2 items-stretch animate-fade-in">
        <CountdownWidget gomulu />
        <SaatTakvimKart />
      </div>

      <TakvimModal acik={modalAcik} onOpenChange={setModalAcik} notlar={notlar ?? []} baslangicGun={modalBaslangic} />
    </>
  );
}
