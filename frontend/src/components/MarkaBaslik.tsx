"use client";

import { useEffect } from "react";
import { useBen } from "@/lib/useBen";
import { useIsletmeMetinleri, metinDeger } from "@/lib/useIsletmeMetinleri";

/**
 * v18 - document.title tek otoritesi. Marka adi SADECE isletme_metinleri'nden (marka_adi).
 * Bos ise (metinler yuklenmedi / onboarding eksik) layout static title korunur - hardcode yok.
 */
export function MarkaBaslik() {
  const { data: ben } = useBen();
  const { data: metinler } = useIsletmeMetinleri();
  const markaAdi = metinDeger(metinler, "marka_adi", "");

  useEffect(() => {
    if (!markaAdi) return; // bos -> layout static title kalir
    document.title = (ben?.superAdmin ? "⚜ " : "") + markaAdi;
  }, [markaAdi, ben?.superAdmin]);

  return null;
}
