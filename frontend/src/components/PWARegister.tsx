"use client";

import { useEffect } from "react";

// Service worker'i kaydeder (cevrimdisi + uygulama gibi davranis). Sessiz: hata olursa uygulamayi etkilemez.
export function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const kayit = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") kayit();
    else window.addEventListener("load", kayit, { once: true });
  }, []);
  return null;
}
