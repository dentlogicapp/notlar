"use client";

import { useEffect, useRef, useState } from "react";
import { akisBaglan, type AkisOlayi } from "@/lib/akis";
import { useQuery } from "@tanstack/react-query";
import { superDenetimApi } from "@/lib/api";
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
  kullanici_olusturuldu: { renk: "bg-teal-500", etiket: "Kullanıcı oluşturuldu" },
  kullanici_kalici_silindi: { renk: "bg-red-600", etiket: "Kullanıcı kalıcı silindi" },
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
    return d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

// Degisen alanlar (jsonb) -> "alan: eski -> yeni" satirlari. Esnek: {eski,yeni} veya {alan:{eski,yeni}}.
type Degisim = { alan: string; eski: string; yeni: string };
function degiseniCoz(ham?: string | null): Degisim[] | null {
  if (!ham) return null;
  try {
    const o = JSON.parse(ham);
    if (o == null || typeof o !== "object") return null;
    const deg = (v: unknown) => (v === null || v === undefined || v === "" ? "(boş)" : String(v));
    // {eski, yeni} formati (tek alan)
    if ("eski" in o || "yeni" in o) {
      return [{ alan: "", eski: deg(o.eski), yeni: deg(o.yeni) }];
    }
    // {alan: {eski, yeni}} formati (cok alan)
    const satirlar: Degisim[] = [];
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === "object" && ("eski" in v || "yeni" in v)) {
        const vv = v as { eski?: unknown; yeni?: unknown };
        satirlar.push({ alan: k, eski: deg(vv.eski), yeni: deg(vv.yeni) });
      }
    }
    return satirlar.length > 0 ? satirlar : null;
  } catch {
    return null;
  }
}

type AkisSatiri = AkisOlayi & { _id: number };

export function CanliAkis({ tenantlar }: { tenantlar?: { id: string; markaAdi: string }[] }) {
  const [olaylar, setOlaylar] = useState<AkisSatiri[]>([]);
  const [bagli, setBagli] = useState(false);
  const sayacRef = useRef(0);

  const tenantAd = (id?: string | null) =>
    id ? (tenantlar?.find((t) => t.id === id)?.markaAdi ?? "bilinmeyen tenant") : null;

  useEffect(() => {
    const kapat = akisBaglan(
      (o) => setOlaylar((p) => [{ ...o, _id: sayacRef.current++ }, ...p].slice(0, 500)),
      (b) => setBagli(b)
    );
    return kapat;
  }, []);

  // v21 M6 (KN-A6) - DB kaynakli baslangic: son 500 denetim kaydi yuklenir; SSE
  // canli olaylari USTUNE ekler. Kayitlar DB'de oldugundan sayfadan ayrilip donunce
  // akis SIFIRLANMAZ (yeniden dolar) - denetim gunlukleriyle ayni kaynak/format.
  const yuklendiRef = useRef(false);
  const { data: gecmis } = useQuery({
    queryKey: ["super-denetim-akis"],
    queryFn: () => superDenetimApi.list(0, 500),
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (!gecmis || yuklendiRef.current) return;
    yuklendiRef.current = true;
    setOlaylar((p) => [...p, ...gecmis.kayitlar.map((d) => ({
      olay: d.olay, hedefTip: d.hedefTip, hedefId: d.hedefId, isletmeId: d.isletmeId,
      aktorEmail: d.aktorEmail, aktorAdSoyad: null, detay: d.detay,
      degisenAlanlar: d.degisenAlanlar, zaman: d.zaman, _id: sayacRef.current++,
    }))].slice(0, 500));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gecmis]);

  return (
    <div className="kart p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-clay-800 dark:text-ink-50">Canlı Akış <span className="text-[10px] font-normal text-clay-400 dark:text-ink-300">(son 500 kayıt · kalıcı)</span></h2>
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
        <div className="space-y-1.5 max-h-[28rem] overflow-y-auto -mx-1 px-1">
          {olaylar.map((o) => {
            const s = olayStili(o.olay);
            const tAd = tenantAd(o.isletmeId);
            const degisimler = degiseniCoz(o.degisenAlanlar);
            const kim = o.aktorAdSoyad || o.aktorEmail || "sistem";
            return (
              <div key={o._id} className="flex items-start gap-2.5 py-2 animate-fade-in border-b border-cream-200 dark:border-ink-700/40 last:border-0">
                <span className={cn("h-2 w-2 rounded-full mt-1.5 shrink-0", s.renk)} />
                <div className="flex-1 min-w-0">
                  {/* NE oldu + hedef detayi */}
                  <p className="text-sm text-clay-800 dark:text-ink-50">
                    {s.etiket}
                    {o.detay && <span className="text-clay-500 dark:text-ink-200">: {o.detay}</span>}
                  </p>

                  {/* ESKI -> YENI deger (degisiklik olaylarinda) */}
                  {degisimler && (
                    <div className="mt-1 space-y-0.5">
                      {degisimler.map((d, i) => (
                        <p key={i} className="text-[11px] flex items-center gap-1.5 flex-wrap">
                          {d.alan && <span className="text-clay-500 dark:text-ink-300 font-medium">{d.alan}:</span>}
                          <span className="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-900/20 text-red-700 dark:text-rose-300 line-through">{d.eski}</span>
                          <span className="text-clay-400 dark:text-ink-400">→</span>
                          <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300">{d.yeni}</span>
                        </p>
                      ))}
                    </div>
                  )}

                  {/* KIM · HANGI TENANT · NE ZAMAN */}
                  <p className="text-[11px] text-clay-400 dark:text-ink-300 mt-1 break-words [overflow-wrap:anywhere]">
                    <span className="text-clay-500 dark:text-ink-200">{kim}</span>
                    {o.aktorAdSoyad && o.aktorEmail && <span> ({o.aktorEmail})</span>}
                    {tAd && <> · <span className="text-clay-500 dark:text-ink-200">{tAd}</span></>}
                    {" · "}{zamanKisa(o.zaman)}
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
