"use client";

import { toPng } from "html-to-image";

// v20.2 madde 11 - Notu WhatsApp'tan ilet.
// Snapshot: not kartinin kendisi PNG'ye cevrilir (html-to-image; zemin CANLI temadan
// alinir - hardcode renk yok).
// Yol 1 (mobil/PWA): Web Share API + dosya -> OS paylasim menusu; kullanici WhatsApp'i
//   secer, gorsel + metin + derin link birlikte gider.
// Yol 2 (masaustu/desteksiz): wa.me metin+link fallback (wa.me dosya kabul etmez -
//   platformun bilinen siniri; durustce metin+link gider).
// Derin link /?focus={id}: alici uye ise mevcut useFocusNot akisi (bildirim tiklamasiyla
// BIREBIR: scroll + cerceve vurgusu); uye degilse AuthGuard giris ekranina dusurur.
export type IletSonuc = "paylasildi" | "fallback" | "iptal" | "hata";

export async function notuWhatsAppIlet(
  kartEl: HTMLElement, notId: string, baslik: string
): Promise<IletSonuc> {
  const url = `${window.location.origin}/?focus=${notId}`;
  const metin = `"${baslik}"\n${url}`;

  try {
    const zemin = getComputedStyle(document.body).backgroundColor || undefined;
    const dataUrl = await toPng(kartEl, { pixelRatio: 2, backgroundColor: zemin, cacheBust: true });
    const blob = await (await fetch(dataUrl)).blob();
    const dosya = new File([blob], "not.png", { type: "image/png" });

    if (typeof navigator.canShare === "function" && navigator.canShare({ files: [dosya] })) {
      await navigator.share({ files: [dosya], text: metin });
      return "paylasildi";
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return "iptal";
    // snapshot/paylasim hatasi -> asagidaki metin fallback'ine dusulur
  }

  try {
    window.open(`https://wa.me/?text=${encodeURIComponent(metin)}`, "_blank", "noopener");
    return "fallback";
  } catch {
    return "hata";
  }
}
