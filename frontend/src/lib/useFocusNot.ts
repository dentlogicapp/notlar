"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

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
