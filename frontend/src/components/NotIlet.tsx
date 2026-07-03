"use client";

import { useState, type MouseEvent } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { notApi } from "@/lib/api";
import { useBen } from "@/lib/useBen";
import { notuWhatsAppIlet } from "@/lib/notPaylas";
import { cn } from "@/lib/utils";

// v20.2 madde 11 - NotKart alt-sol WhatsApp ilet butonu (klasorden bosalan alan).
// Snapshot hedefi: en yakin [data-not-id] atasi (NotKart kokundeki KANITLI attribute;
// yeni ref/prop kablolamasi gerekmez). Basarili paylasimda B2 audit izi (not_iletildi)
// fire-and-forget; IPTAL iz birakmaz. Goruntuleme modunda audit cagrisi atlanir
// (backend de sessiz no-op - defense in depth).
export function NotIletButonu({
  notId, baslik, ikonSinifi,
}: { notId: string; baslik: string; ikonSinifi: string }) {
  const { data: ben } = useBen();
  const [mesgul, setMesgul] = useState(false);

  async function ilet(e: MouseEvent<HTMLButtonElement>) {
    if (mesgul) return;
    const kart = (e.currentTarget as HTMLElement).closest("[data-not-id]") as HTMLElement | null;
    if (!kart) { toast.error("Not kartı bulunamadı"); return; }
    setMesgul(true);
    try {
      const sonuc = await notuWhatsAppIlet(kart, notId, baslik);
      if (sonuc === "paylasildi" || sonuc === "fallback") {
        if (!ben?.goruntulemeModu) notApi.iletildi(notId).catch(() => {});
        if (sonuc === "fallback") toast.success("WhatsApp paylaşım penceresi açıldı");
      } else if (sonuc === "hata") {
        toast.error("Paylaşım başlatılamadı");
      }
    } finally {
      setMesgul(false);
    }
  }

  return (
    <button
      type="button"
      onClick={ilet}
      disabled={mesgul}
      aria-label="Notu WhatsApp'tan ilet"
      title="Notu WhatsApp'tan ilet"
      className={cn(
        ikonSinifi,
        "text-clay-500 dark:text-ink-200 hover:text-terracotta hover:bg-cream-200 dark:hover:bg-ink-800 disabled:opacity-50"
      )}
    >
      <Share2 className="h-3.5 w-3.5" />
    </button>
  );
}
