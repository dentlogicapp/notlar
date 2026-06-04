"use client";

import { useEffect } from "react";
import { useBen } from "@/lib/useBen";
import { useIsletme } from "@/lib/useIsletme";

/**
 * v16 — Tek document.title otoritesi.
 * Tenant marka adi + super admin ⚜ prefix tek yerden yonetilir (cift-yazim race onleme).
 * Gorunur cikti yok; sadece yan etki (document.title) → null render.
 */
export function MarkaBaslik() {
  const { data: ben } = useBen();
  const { data: isletme } = useIsletme();

  useEffect(() => {
    const ad = isletme?.markaAdi || "Planlama Defterimiz";
    document.title = (ben?.superAdmin ? "⚜ " : "") + ad;
  }, [isletme?.markaAdi, ben?.superAdmin]);

  return null;
}
