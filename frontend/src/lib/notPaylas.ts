"use client";

import { toBlob } from "html-to-image";

// v20.3 - "Notu Paylas": YALNIZCA GORUNTU paylasilir (link yok - Musa karari).
// Goruntu, NotIlet.tsx'teki off-screen sunum sahnesinden uretilir (NotKart tek
// dogruluk kaynagi, sabit 680px genislik -> her kanalda ozdes cikti; kaynak desen
// TakvimModal not detayi). Onceki turlarin kalici dersleri korunur:
//   - toBlob dogrudan Blob doner (dataURL+fetch CSP connect-src'e takiliyordu, v20.2.3)
//   - skipFonts: next/font/google stylesheet'lerinin SecurityError'unu bypass eder (v20.2.2)
//   - iki adimli akis: uret -> kullanici TIKLAR -> share o tikin gesture'inda (v20.2.1)

export async function notSnapshotUret(sahneEl: HTMLElement): Promise<File | null> {
  try {
    const zemin = getComputedStyle(document.body).backgroundColor || undefined;
    const blob = await toBlob(sahneEl, { pixelRatio: 2, backgroundColor: zemin, cacheBust: true, skipFonts: true });
    if (!blob) { console.warn("not goruntusu: toBlob null dondu (canvas uretilemedi)"); return null; }
    return new File([blob], "not.png", { type: "image/png" });
  } catch (e) {
    console.warn("not goruntusu uretilemedi:", e);
    return null;
  }
}

export function dosyaPaylasilabilir(dosya: File): boolean {
  return typeof navigator.canShare === "function" && navigator.canShare({ files: [dosya] });
}

// OS paylasim menusu - YALNIZ dosya (metin/link bilerek YOK). Gesture icinde cagrilmali
// (oncesinde await olmadan, tikin kendi baglaminda).
export async function dosyaylaPaylas(dosya: File): Promise<"paylasildi" | "iptal" | "hata"> {
  try {
    if (typeof navigator.share !== "function") return "hata";
    await navigator.share({ files: [dosya] });
    return "paylasildi";
  } catch (e) {
    return e instanceof DOMException && e.name === "AbortError" ? "iptal" : "hata";
  }
}
