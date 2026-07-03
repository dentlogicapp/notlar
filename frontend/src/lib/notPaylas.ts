"use client";

import { toPng } from "html-to-image";

// v20.2.1 - Notu WhatsApp'tan ilet (gesture-guvenli iki adimli akis).
// ESKI TASARIMIN KOK HATASI: tek tikta "await toPng" user-gesture baglamini tuketiyordu;
// sonrasindaki navigator.share bazi platformlarda NotAllowedError'la dusuyor,
// window.open ise gesture'siz popup-block'a takilip SESSIZCE hicbir sey yapmiyordu.
// YENI AKIS: (1) tik -> snapshot arka planda uretilir; (2) hazir olunca kullanici
// [Gorselle paylas] veya [Linki WhatsApp'ta ac] butonuna TIKLAR - share/window.open
// o tikin kendi gesture'i icinde cagrilir (oncesinde await yok) -> platform kisiti asilir.
// Derin link /?focus={id}: uye -> mevcut useFocusNot (scroll + cerceve); degil -> giris.

export function notIletMetni(notId: string, baslik: string): string {
  return `"${baslik}"\n${window.location.origin}/?focus=${notId}`;
}

// Adim 1 - snapshot uretimi (tik sonrasi arka planda; basarisizlik null doner, akis link'e duser)
export async function notSnapshotUret(kartEl: HTMLElement): Promise<File | null> {
  try {
    const zemin = getComputedStyle(document.body).backgroundColor || undefined;
    const dataUrl = await toPng(kartEl, { pixelRatio: 2, backgroundColor: zemin, cacheBust: true });
    const blob = await (await fetch(dataUrl)).blob();
    return new File([blob], "not.png", { type: "image/png" });
  } catch {
    return null;
  }
}

export function dosyaPaylasilabilir(dosya: File): boolean {
  return typeof navigator.canShare === "function" && navigator.canShare({ files: [dosya] });
}

// Adim 2a - OS paylasim menusu (dosya HAZIR; tek await share'in kendisi = gesture korunur).
// Not: bazi WhatsApp surumleri dosya varken text'i caption'a alir, bazilari dusurur -
// platform davranisi; link garantisi icin 2b her zaman sunulur.
export async function dosyaylaPaylas(dosya: File, metin: string): Promise<"paylasildi" | "iptal" | "hata"> {
  try {
    await navigator.share({ files: [dosya], text: metin });
    return "paylasildi";
  } catch (e) {
    return e instanceof DOMException && e.name === "AbortError" ? "iptal" : "hata";
  }
}

// Adim 2b - wa.me metin+link (SENKRON cagrilmali). false = tarayici pencereyi blokladi.
export function linkiWhatsApptaAc(metin: string): boolean {
  const w = window.open(`https://wa.me/?text=${encodeURIComponent(metin)}`, "_blank", "noopener");
  return w != null;
}
