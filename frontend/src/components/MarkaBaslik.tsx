"use client";

import { useEffect } from "react";
import { useBen } from "@/lib/useBen";
import { useMarkaKimligi } from "@/lib/useMarkaKimligi";

/**
 * v18 - document.title tek otoritesi. v20.1 A3: marka adi stabil kaynaktan
 * (useMarkaKimligi - son bilinen kimlik onbellegi) gelir; ilk yuklemede de
 * title aninda dogru olur. Bos ise layout static title korunur - hardcode yok.
 */
export function MarkaBaslik() {
  const { data: ben } = useBen();
  const { markaAdi } = useMarkaKimligi();

  useEffect(() => {
    if (!markaAdi) return; // bos -> layout static title kalir
    document.title = (ben?.superAdmin ? "⚜ " : "") + markaAdi;
  }, [markaAdi, ben?.superAdmin]);

  return null;
}
