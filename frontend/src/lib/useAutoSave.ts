"use client";

import { useEffect, useRef } from "react";

// v18 Asama 13 - debounced auto-save tetikleyici. tetik (icerik imzasi) degisince debounceMs sonra
// kaydet() cagrilir. Ilk mount tetiklemez; aktif=false (degisen yok) iken beklemez; pending sirasinda
// yeni degisiklik gelirse onceki timer iptal + yeniden kurulur (son keystroke + 2sn).
export function useAutoSave(tetik: string, aktif: boolean, kaydet: () => void, debounceMs = 2000) {
  const ilk = useRef(true);
  const kaydetRef = useRef(kaydet);
  kaydetRef.current = kaydet;

  useEffect(() => {
    if (ilk.current) {
      ilk.current = false;
      return;
    }
    if (!aktif) return;
    const t = setTimeout(() => kaydetRef.current(), debounceMs);
    return () => clearTimeout(t);
  }, [tetik, aktif, debounceMs]);
}
