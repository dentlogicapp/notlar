"use client";

import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { notApi } from "@/lib/api";
import { useBen } from "@/lib/useBen";
import { dosyaPaylasilabilir, dosyaylaPaylas, notSnapshotUret } from "@/lib/notPaylas";
import { cn } from "@/lib/utils";
import { NotKart } from "./Notlar";
import type { Not } from "@/lib/types";

// v20.3 - "Notu Paylas" (OS paylasim menusu: WhatsApp/mail/IG... hedefi kullanici secer).
// Goruntu, ekrandaki karttan DEGIL sabit genislikli OFF-SCREEN sahneden uretilir -
// takvim not detayi sunumunun birebir karsiligi (NotKart tek dogruluk kaynagi,
// klasorBadgeGoster=false; TakvimModal ile ayni kullanim deseni). Cikti her kanalda/
// ekranda/temada OZDES olur. LINK PAYLASILMAZ - yalnizca goruntu (Musa karari).
// Dongusel import notu: Notlar.tsx <-> NotIlet.tsx - NotKart hoisted "export function"
// oldugu ve yalniz render aninda cagrildigi icin guvenlidir (TakvimModal ayni importu yapar).
type Durum = "hazirlaniyor" | "hazir";
const SAHNE_GENISLIK = 680;  // sabit cikti genisligi (px); pixelRatio 2 -> ~1360px goruntu

export function NotIletButonu({ not, ikonSinifi }: { not: Not; ikonSinifi: string }) {
  const { data: ben } = useBen();
  const [acik, setAcik] = useState(false);
  const [durum, setDurum] = useState<Durum>("hazirlaniyor");
  const [dosya, setDosya] = useState<File | null>(null);
  const sahneRef = useRef<HTMLDivElement>(null);

  function auditYaz() {
    if (!ben?.goruntulemeModu) notApi.iletildi(not.id).catch(() => {});
  }
  function kapat() {
    setAcik(false); setDurum("hazirlaniyor"); setDosya(null);
  }
  function ac() {
    setAcik(true); setDurum("hazirlaniyor"); setDosya(null);
  }

  // Sahne mount olunca uret: panel acildiginda sahne render edilir; tema/fontun
  // oturmasi icin bir frame beklenir, ardindan snapshot alinir.
  useEffect(() => {
    if (!acik || durum !== "hazirlaniyor") return;
    const el = sahneRef.current;
    if (!el) return;
    let iptal = false;
    requestAnimationFrame(() => {
      notSnapshotUret(el).then((f) => {
        if (iptal) return;
        console.debug("[notPaylas] goruntu:", f ? f.size + " bayt" : "null", "| canShare(files):", f ? dosyaPaylasilabilir(f) : "-");
        setDosya(f);
        setDurum("hazir");
      });
    });
    return () => { iptal = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acik, durum]);

  async function goruntuyuPaylas() {
    if (!dosya) return;
    const sonuc = await dosyaylaPaylas(dosya);  // tik aninda; oncesinde await yok (gesture korunur)
    if (sonuc === "paylasildi") { auditYaz(); kapat(); }
    else if (sonuc === "hata") toast.error("Bu cihaz görüntü paylaşımını desteklemiyor");
    // iptal: panel acik kalir, kullanici tekrar deneyebilir
  }

  return (
    <span className="relative">
      <button
        type="button"
        onClick={ac}
        aria-label="Notu Paylaş"
        title="Notu Paylaş"
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
              <Share2 className="h-3 w-3 text-terracotta" strokeWidth={2.5} /> Notu Paylaş
            </p>
            {durum === "hazirlaniyor" ? (
              <p className="flex items-center gap-2 text-[11px] text-clay-500 dark:text-ink-300 px-1 py-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-terracotta" /> Görsel hazırlanıyor...
              </p>
            ) : dosya ? (
              <button
                type="button"
                onClick={goruntuyuPaylas}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-[12px] font-medium text-clay-800 dark:text-ink-50 hover:bg-cream-100 dark:hover:bg-ink-700 transition-colors"
              >
                <ImageIcon className="h-3.5 w-3.5 text-terracotta shrink-0" />
                Notun Görüntüsünü Paylaş
              </button>
            ) : (
              <p className="text-[10px] text-clay-400 dark:text-ink-300 px-1 py-1.5 leading-relaxed">
                Görüntü oluşturulamadı - kapatıp tekrar dene.
              </p>
            )}
          </div>

          {/* Off-screen sunum sahnesi - takvim not detayi gorunumu (sabit genislik = ozdes cikti) */}
          <div
            ref={sahneRef}
            aria-hidden
            className="fixed top-0 p-10 pointer-events-none"
            style={{ left: -10000, width: SAHNE_GENISLIK }}
          >
            <NotKart not={not} klasorBadgeGoster={false} />
          </div>
        </>
      )}
    </span>
  );
}
