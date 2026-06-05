"use client";

import { useEffect } from "react";
import { useBen } from "@/lib/useBen";
import { useIsletme } from "@/lib/useIsletme";
import { useIsletmeMetinleri, metinDeger } from "@/lib/useIsletmeMetinleri";

/**
 * v16 - Tek document.title otoritesi.
 * v18 - Marka adi isletme_metinleri'nden (marka_adi); bos ise v16 isletme.markaAdi fallback.
 * Gorunur cikti yok; sadece yan etki (document.title) -> null render.
 */
export function MarkaBaslik() {
  const { data: ben } = useBen();
  const { data: isletme } = useIsletme();
  const { data: metinler } = useIsletmeMetinleri();

  const markaAdi = metinDeger(metinler, "marka_adi", isletme?.markaAdi || "Planlama Defterimiz");

  useEffect(() => {
    document.title = (ben?.superAdmin ? "⚜ " : "") + markaAdi;
  }, [markaAdi, ben?.superAdmin]);

  return null;
}
