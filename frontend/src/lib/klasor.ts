import type { Klasor } from "./types";

// Klasor etiketi: alt klasor ise "Ust / Alt" formatinda gosterir.
// Saf fonksiyon, tek dogruluk kaynagi (DuzenleDialog, NotKart, KlasorSecici hepsi bunu kullanir).
export function klasorEtiketi(k: Klasor, klasorler: Klasor[] | undefined): string {
  if (!k.ustKlasorId) return k.ad;
  const ust = klasorler?.find((p) => p.id === k.ustKlasorId);
  return ust ? `${ust.ad} / ${k.ad}` : k.ad;
}