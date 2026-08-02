"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { isletmeApi } from "./api";
import { useBen } from "./useBen";

/**
 * Bildirimden (menu ici ya da push bar) gelen ?focus={id} -> notu bul,
 * yumusak scroll + ring highlight uygula, sonra focus parametresini temizle.
 *
 * Retry tabanli: notlar henuz yuklenmemisse el bulunana kadar kisa araliklarla dener;
 * bu sayede ana sayfa ve klasor sayfasi (NotListesi farkli yuklenir) ayni sekilde calisir.
 * SW push mesaji -> client-side yonlendirme (reload yok; menu ici tiklamayla ayni gecis).
 *
 * Ana sayfa + klasor/[id] sayfasi ortak kullanir (DRY, tek dogruluk kaynagi).
 */
export function useFocusNot() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const focusId = searchParams.get("focus");
  const hatirlaticiAc = searchParams.get("hatirlatici") === "1";
  const isletmeParam = searchParams.get("isletme");
  const qc = useQueryClient();
  const { data: ben } = useBen();

  // Cok-defter: isletme param aktif defterden farkliysa sessizce o deftere gec.
  // SA goruntuleme modunda atla (impersonation bozulmasin). Gecis sonrasi isletme===aktif -> tek gecis.
  useEffect(() => {
    if (!focusId || !isletmeParam || !ben) return;
    if (ben.goruntulemeModu) return;
    if (ben.aktifIsletmeId === isletmeParam) return;
    // Uye olunan bir defter mi? Degilse sessizce vazgec (backend zaten reddeder).
    const uyeMi = (ben.uyelikler ?? []).some((u) => u.isletmeId === isletmeParam);
    if (!uyeMi) return;
    let iptal = false;
    isletmeApi
      .aktifDegistir(isletmeParam)
      .then((yeniBen) => {
        if (iptal) return;
        qc.setQueryData(["ben"], yeniBen);
        qc.invalidateQueries(); // yeni defterin verisini taze cek; focus retry bulur
      })
      .catch(() => {});
    return () => {
      iptal = true;
    };
  }, [focusId, isletmeParam, ben, qc]);

  // ?focus={id} -> scroll + highlight (el bulunana kadar retry)
  useEffect(() => {
    if (!focusId) return;
    let iptal = false;
    let denemeler = 0;
    let zaman: ReturnType<typeof setTimeout>;

    const dene = () => {
      if (iptal) return;
      const el = document.querySelector(`[data-not-id="${focusId}"]`) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("animate-focus-pulse");
        // Konu A - hatirlatici=1 ise karta "dokum panelini ac" sinyali (remount-guvenli).
        if (hatirlaticiAc) {
          setTimeout(() => el.dispatchEvent(new CustomEvent("hatirlatici-ac", { bubbles: false })), 300);
        }
        setTimeout(() => el.classList.remove("animate-focus-pulse"), 4700);
        router.replace(pathname, { scroll: false }); // focus paramini temizle, mevcut sayfada kal
      } else if (denemeler < 25) {
        denemeler++;
        zaman = setTimeout(dene, 200); // notlar henuz yuklenmedi, tekrar dene
      }
    };

    zaman = setTimeout(dene, 250);
    return () => {
      iptal = true;
      clearTimeout(zaman);
    };
  }, [focusId, router, pathname]);

  // Push bildirimi tiklaninca SW'den gelen mesaj -> client-side yonlendirme (reload yok)
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "notlar-focus" && event.data.url) {
        router.push(event.data.url);
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [router]);
}
