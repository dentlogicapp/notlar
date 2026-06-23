"use client";

import { useEffect, useRef, useState } from "react";
import { akisBaglan, type AkisOlayi } from "@/lib/akis";
import { cn } from "@/lib/utils";

// Olay tipi -> renk + okunabilir etiket. Bilinmeyen olaylar generic gosterilir.
const OLAY_STIL: Record<string, { renk: string; etiket: string }> = {
  tenant_olusturuldu: { renk: "bg-green-500", etiket: "Yeni tenant oluşturuldu" },
  admin_atandi: { renk: "bg-blue-500", etiket: "Yönetici atandı" },
  tenant_durum_degisti: { renk: "bg-amber-500", etiket: "Tenant durumu değişti" },
  tenant_silindi: { renk: "bg-red-500", etiket: "Tenant silindi" },
  super_admin_atandi: { renk: "bg-purple-500", etiket: "Süper admin atandı" },
  super_admin_kaldirildi: { renk: "bg-purple-400", etiket: "Süper admin yetkisi kaldırıldı" },
  goruntuleme_modu_write_engellendi: { renk: "bg-orange-500", etiket: "Görüntüleme modunda yazma engellendi" },
};

function olayStili(olay?: string) {
  if (!olay) return { renk: "bg-clay-400", etiket: "Bilinmeyen olay" };
  return OLAY_STIL[olay] ?? { renk: "bg-clay-400", etiket: olay.replace(/_/g, " ") };
}

function zamanKisa(iso: string): string {
  try {
    const d = new Date(iso);
    const fark = Math.floor((Date.now() - d.getTime()) / 1000);
    if (fark < 60) return "az önce";
    if (fark < 3600) return `${Math.floor(fark / 60)} dk önce`;
    return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

type AkisSatiri = AkisOlayi & { _id: number };

export function CanliAkis() {
  const [olaylar, setOlaylar] = useState<AkisSatiri[]>([]);
  const [bagli, setBagli] = useState(false);
  const sayacRef = useRef(0);

  useEffect(() => {
    const kapat = akisBaglan(
      (o) => setOlaylar((p) => [{ ...o, _id: sayacRef.current++ }, ...p].slice(0, 30)),
      (b) => setBagli(b)
    );
    return kapat;
  }, []);

  return (
    <div className="kart p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-clay-800 dark:text-ink-50">Canlı Akış</h2>
        <span className="flex items-center gap-1.5 text-[11px] text-clay-400 dark:text-ink-300">
          <span className={cn("h-2 w-2 rounded-full", bagli ? "bg-green-500 animate-pulse" : "bg-clay-300 dark:bg-ink-600")} />
          {bagli ? "Canlı" : "Bağlanıyor…"}
        </span>
      </div>

      {olaylar.length === 0 ? (
        <p className="text-sm text-clay-400 dark:text-ink-300 italic py-8 text-center">
          Henüz olay yok. Yeni tenant, atama, durum değişikliği gibi işlemler burada anlık görünür.
        </p>
      ) : (
        <div className="space-y-1 max-h-96 overflow-y-auto -mx-1 px-1">
          {olaylar.map((o) => {
            const s = olayStili(o.olay);
            return (
              <div key={o._id} className="flex items-start gap-2.5 py-1.5 animate-fade-in border-b border-cream-200 dark:border-ink-700/40 last:border-0">
                <span className={cn("h-2 w-2 rounded-full mt-1.5 shrink-0", s.renk)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-clay-800 dark:text-ink-50">{s.etiket}</p>
                  <p className="text-[11px] text-clay-400 dark:text-ink-300 truncate">
                    {o.aktorEmail || "sistem"} · {zamanKisa(o.zaman)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
