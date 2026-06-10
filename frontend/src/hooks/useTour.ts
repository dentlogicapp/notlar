"use client";

import { useEffect, useState, useCallback } from "react";
import { useOnboardingDurum } from "@/lib/useIsletmeMetinleri";

// v18 Asama 19 - tour tetik + localStorage flag yonetimi.
const FLAG = "tur_gosterildi";        // "true" -> tamamlandi, asla gosterme
const ATLANDI = "tur_atlandi_tarih";  // timestamp -> 7 gun sonra tekrar
const HAFTA_MS = 7 * 24 * 60 * 60 * 1000;

export function useTour() {
  const { data: durum } = useOnboardingDurum();
  const [run, setRun] = useState(false);

  useEffect(() => {
    if (!durum) return;
    const tamam = durum.toplam > 0 && durum.dolu >= durum.toplam;
    if (!tamam) return; // onboarding %100 degilse tur yok

    const gosterildi = localStorage.getItem(FLAG) === "true";
    const atlandiTs = Number(localStorage.getItem(ATLANDI) ?? "0");
    const haftaGecti = atlandiTs > 0 && Date.now() - atlandiTs > HAFTA_MS;

    if (!gosterildi || haftaGecti) {
      const t = setTimeout(() => setRun(true), 800);
      return () => clearTimeout(t);
    }
  }, [durum]);

  // Tur tamamlandi: asla tekrar gosterme
  const tamamla = useCallback(() => {
    localStorage.setItem(FLAG, "true");
    localStorage.removeItem(ATLANDI);
    setRun(false);
  }, []);

  // Atlandi: 7 gun sonra tekrar goster (B4 skip persistance)
  const atla = useCallback(() => {
    localStorage.setItem(ATLANDI, String(Date.now()));
    localStorage.setItem(FLAG, "false");
    setRun(false);
  }, []);

  // B1 - restart: flag temizle, hemen baslat
  const tekrarBaslat = useCallback(() => {
    localStorage.removeItem(FLAG);
    localStorage.removeItem(ATLANDI);
    setRun(true);
  }, []);

  return { run, tamamla, atla, tekrarBaslat };
}
