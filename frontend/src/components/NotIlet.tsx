"use client";

import { useState, type MouseEvent } from "react";
import { Image as ImageIcon, Link2, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { notApi } from "@/lib/api";
import { useBen } from "@/lib/useBen";
import {
  dosyaPaylasilabilir, dosyaylaPaylas, linkiWhatsApptaAc, notIletMetni, notSnapshotUret,
} from "@/lib/notPaylas";
import { cn } from "@/lib/utils";

// v20.2.1 - Iki adimli ilet paneli (gesture-guvenli; notPaylas.ts aciklamasina bak).
// Snapshot hedefi: kanitli [data-not-id] atasi. Panel yukari acilir (alt menu sayfa
// altina yakin olabilir); dis tiklamada kapanir (repo popover deseni: fixed ortu).
// Audit (B2): yalniz GERCEK aksiyonda (share tamamlandi / wa.me penceresi acildi).
type Durum = "hazirlaniyor" | "hazir";

export function NotIletButonu({
  notId, baslik, ikonSinifi,
}: { notId: string; baslik: string; ikonSinifi: string }) {
  const { data: ben } = useBen();
  const [acik, setAcik] = useState(false);
  const [durum, setDurum] = useState<Durum>("hazirlaniyor");
  const [dosya, setDosya] = useState<File | null>(null);

  const metin = notIletMetni(notId, baslik);

  function auditYaz() {
    if (!ben?.goruntulemeModu) notApi.iletildi(notId).catch(() => {});
  }
  function kapat() {
    setAcik(false); setDurum("hazirlaniyor"); setDosya(null);
  }

  function ac(e: MouseEvent<HTMLButtonElement>) {
    const kart = (e.currentTarget as HTMLElement).closest("[data-not-id]") as HTMLElement | null;
    setAcik(true);
    setDurum("hazirlaniyor");
    if (!kart) { setDosya(null); setDurum("hazir"); return; }
    notSnapshotUret(kart).then((f) => {
      // v20.2.4 - teshis izi: dosya boyutu + canShare sonucu (kesin kanit console'da)
      console.debug("[notIlet] dosya:", f ? f.size + " bayt" : "null", "| canShare(files):", f ? dosyaPaylasilabilir(f) : "-");
      setDosya(f); setDurum("hazir");
    });
  }

  async function gorsellePaylas() {
    if (!dosya) return;
    const sonuc = await dosyaylaPaylas(dosya, metin);  // tik aninda, oncesinde await yok
    if (sonuc === "paylasildi") { auditYaz(); kapat(); }
    else if (sonuc === "hata") toast.error("Bu cihaz görsel paylaşımını kabul etmedi - linki kullan");
    // iptal: panel acik kalir, kullanici tekrar deneyebilir
  }

  function linkAc() {
    const acildi = linkiWhatsApptaAc(metin);  // senkron - gesture icinde
    if (acildi) { auditYaz(); kapat(); }
    else toast.error("Tarayıcı yeni pencereyi engelledi - açılır pencere iznini kontrol et");
  }

  const gorselHazir = durum === "hazir" && dosya !== null;  // v20.2.4 - canShare butonu GIZLEMEZ (yanlis-negatif verebiliyor); paylasim denenir, platform reddederse toast ile linke yonlendirilir

  return (
    <span className="relative">
      <button
        type="button"
        onClick={ac}
        aria-label="Notu WhatsApp'tan ilet"
        title="Notu WhatsApp'tan ilet"
        className={cn(
          ikonSinifi,
          "text-clay-500 dark:text-ink-200 hover:text-terracotta hover:bg-cream-200 dark:hover:bg-ink-800"
        )}
      >
        <Share2 className="h-3.5 w-3.5" />
      </button>

      {acik && (
        <>
          <div className="fixed inset-0 z-40" onClick={kapat} />
          <div className="absolute z-50 bottom-full left-0 mb-1.5 w-60 p-2 rounded-xl bg-white dark:bg-ink-800 border border-cream-300 dark:border-ink-600 shadow-lg text-left">
            <p className="text-[11px] font-semibold text-clay-700 dark:text-ink-100 flex items-center gap-1.5 px-1 pb-1.5">
              <Share2 className="h-3 w-3 text-terracotta" strokeWidth={2.5} /> WhatsApp'tan ilet
            </p>
            {durum === "hazirlaniyor" ? (
              <p className="flex items-center gap-2 text-[11px] text-clay-500 dark:text-ink-300 px-1 py-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-terracotta" /> Görsel hazırlanıyor...
              </p>
            ) : (
              <div className="space-y-1">
                {gorselHazir && (
                  <button
                    type="button"
                    onClick={gorsellePaylas}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-[12px] font-medium text-clay-800 dark:text-ink-50 hover:bg-cream-100 dark:hover:bg-ink-700 transition-colors"
                  >
                    <ImageIcon className="h-3.5 w-3.5 text-terracotta shrink-0" />
                    Görselle paylaş (not + link)
                  </button>
                )}
                <button
                  type="button"
                  onClick={linkAc}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-[12px] font-medium text-clay-800 dark:text-ink-50 hover:bg-cream-100 dark:hover:bg-ink-700 transition-colors"
                >
                  <Link2 className="h-3.5 w-3.5 text-terracotta shrink-0" />
                  Linki WhatsApp'ta aç
                </button>
                {!gorselHazir && (
                  <p className="text-[10px] text-clay-400 dark:text-ink-300 px-1 pt-0.5 leading-relaxed">
                    Görsel oluşturulamadı - link ile ilet.
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </span>
  );
}
