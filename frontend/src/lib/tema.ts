"use client";

import { useEffect, useState } from "react";

export type Tema = "acik" | "koyu";
const ANAHTAR = "tema-tercihi";
const DEFAULT: Tema = "acik";

/**
 * Tema uygula — html elementine "dark" class'ı ekle/çıkar.
 * SSR/CSR mismatch için inline script (layout.tsx içinde) ilk sayfa açılışında çalışır.
 */
function temayiUygula(tema: Tema) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  if (tema === "koyu") html.classList.add("dark");
  else html.classList.remove("dark");
}

/**
 * Tema oku — localStorage'dan veya varsayılan (açık).
 */
function temayiOku(): Tema {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const v = window.localStorage.getItem(ANAHTAR);
    if (v === "koyu") return "koyu";
    if (v === "acik") return "acik";
  } catch {}
  return DEFAULT;
}

/**
 * Tema kaydet ve uygula.
 */
function temayiKaydet(tema: Tema) {
  try { window.localStorage.setItem(ANAHTAR, tema); } catch {}
  temayiUygula(tema);
}

/**
 * useTema hook'u — UserMenu toggle'ı için.
 */
export function useTema(): [Tema, (yeni: Tema) => void, () => void] {
  const [tema, setTemaState] = useState<Tema>(DEFAULT);

  // İlk render — localStorage'dan oku, html'de uygula
  useEffect(() => {
    const baslangic = temayiOku();
    setTemaState(baslangic);
    temayiUygula(baslangic);
  }, []);

  const setTema = (yeni: Tema) => {
    setTemaState(yeni);
    temayiKaydet(yeni);
  };

  const tersle = () => setTema(tema === "acik" ? "koyu" : "acik");

  return [tema, setTema, tersle];
}

/**
 * SSR sırasında flash önleme — layout'a inline script olarak gömülür.
 * Sayfa açılırken (CSS yüklenmeden önce) html class'ını ekler/çıkarır.
 */
export const TEMA_INLINE_SCRIPT = `
(function(){
  try {
    var t = localStorage.getItem('${ANAHTAR}');
    if (t === 'koyu') document.documentElement.classList.add('dark');
  } catch(e) {}
})();
`;
