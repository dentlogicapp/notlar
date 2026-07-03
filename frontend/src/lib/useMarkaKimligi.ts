"use client";

import { useEffect, useState } from "react";
import { useBen } from "./useBen";
import { useIsletmeMetinleri, metinDeger } from "./useIsletmeMetinleri";

// v20.1 A3 - Marka kimligi stabil gorunum: metinler API'den gelene kadar marka adi/emojisi
// bos kaliyordu ("ilk giriste gec geliyor / ekran degisince geliyor" gozlemi). Cozum:
// son bilinen kimlik localStorage'ta TENANT-SCOPED saklanir; canli deger gelene kadar
// oradan gosterilir (stale-while-revalidate), gelince onbellek tazelenir.
// Hardcode YOK - onbellek yalnizca tenant'in kendi verisinin kopyasi.
// Hydration-safe: localStorage YALNIZ mount sonrasi okunur (SSR/ilk client render bos,
// sunucu ciktisiyla eslesir; mismatch uretmez).
const SAKLAMA_ANAHTARI = "marka_kimligi_v1";

type MarkaKimligi = { isletmeId: string; ad: string; emoji: string };

export function useMarkaKimligi(): { markaAdi: string; markaEmoji: string } {
  const { data: ben } = useBen();
  const { data: metinler } = useIsletmeMetinleri();
  const canliAd = metinDeger(metinler, "marka_adi", "");
  const canliEmoji = metinDeger(metinler, "marka_emoji", "");

  const [kayitli, setKayitli] = useState<MarkaKimligi | null>(null);
  useEffect(() => {
    try {
      const ham = window.localStorage.getItem(SAKLAMA_ANAHTARI);
      if (ham) setKayitli(JSON.parse(ham) as MarkaKimligi);
    } catch { /* depolama kapali/bozuk - sessizce canli degeri bekle */ }
  }, []);

  // Canli deger geldiginde onbellegi tazele (tenant-scoped kayit)
  useEffect(() => {
    if (!canliAd || !ben?.aktifIsletmeId) return;
    try {
      window.localStorage.setItem(
        SAKLAMA_ANAHTARI,
        JSON.stringify({ isletmeId: ben.aktifIsletmeId, ad: canliAd, emoji: canliEmoji })
      );
    } catch { /* depolama dolu/kapali - sessiz */ }
  }, [canliAd, canliEmoji, ben?.aktifIsletmeId]);

  if (canliAd) return { markaAdi: canliAd, markaEmoji: canliEmoji };

  // Canli henuz yok -> son bilinen kimlik (yalniz ayni tenant'a aitse;
  // tenant henuz cozulmediyse de goster - reload sonrasi ilk kareler icin)
  if (kayitli && (!ben?.aktifIsletmeId || kayitli.isletmeId === ben.aktifIsletmeId)) {
    return { markaAdi: kayitli.ad, markaEmoji: kayitli.emoji };
  }
  return { markaAdi: "", markaEmoji: "" };
}
