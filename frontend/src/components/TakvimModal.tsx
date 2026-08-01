"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { MiniTakvim, tarihAnahtar, hatirlatmaDurumu, durumOnceligi, type HatirlatmaDurumu } from "./MiniTakvim";
import { tatilHaritasi } from "@/lib/tatiller";
import { NotKart } from "./Notlar";
import type { Not } from "@/lib/types";

const AY_ADLARI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const GUN_TAM = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

function tamTarih(d: Date): string {
  return `${d.getDate()} ${AY_ADLARI[d.getMonth()]} ${d.getFullYear()} - ${GUN_TAM[d.getDay()]}`;
}

export function TakvimModal({
  acik, onOpenChange, notlar = [], baslangicGun = null,
}: {
  acik: boolean;
  onOpenChange: (a: boolean) => void;
  notlar?: Not[];
  baslangicGun?: Date | null;
}) {
  const [seciliGun, setSeciliGun] = useState<Date | null>(null);
  const [seciliNotId, setSeciliNotId] = useState<string | null>(null);

  // Modal acilinca baslangic gunu sec (tarih tiklanarak acildiginda bugun); kapaninca temizle
  useEffect(() => {
    if (acik) setSeciliGun(baslangicGun ?? null);
    else { setSeciliGun(null); setSeciliNotId(null); }
  }, [acik, baslangicGun]);

  // hatirlatici olan gunler (isaret) + secili gunun notlari + acik not (id ile - duzenleme sonrasi guncel kalir)
  // BV2 - her gun icin en kritik hatirlatma durumu (gecikmis > gelecek > tamam).
  const gunDurumlari = new Map<string, HatirlatmaDurumu>();
  for (const n of notlar) {
    const durum = hatirlatmaDurumu(n);
    if (!durum || !n.hatirlatmaZamani) continue;
    const anahtar = tarihAnahtar(new Date(n.hatirlatmaZamani));
    const onceki = gunDurumlari.get(anahtar);
    if (!onceki || durumOnceligi(durum) > durumOnceligi(onceki)) gunDurumlari.set(anahtar, durum);
  }
  const seciliNotlar = seciliGun
    ? notlar.filter((n) => n.hatirlatmaZamani && tarihAnahtar(new Date(n.hatirlatmaZamani)) === tarihAnahtar(seciliGun))
    : [];
  const seciliNot = seciliNotId ? notlar.find((n) => n.id === seciliNotId) ?? null : null;
  // Secili gunun tatil adi - gorunen yila gore (sonsuz kapsama)
  const seciliTatilAd = seciliGun ? tatilHaritasi(seciliGun.getFullYear()).get(tarihAnahtar(seciliGun)) : null;

  return (
    <>
      <Dialog open={acik} onOpenChange={onOpenChange}>
        <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Takvim</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <MiniTakvim
              buyuk
              gunDurumlari={gunDurumlari}
              onGunTikla={setSeciliGun}
            />

            {/* Secili gunun hatirlaticilari - takvim boyutu sabit kalir, baslik tam (kaydirma) */}
            {seciliGun && (
              <div className="rounded-xl border border-cream-300 dark:border-ink-700 bg-cream-50 dark:bg-ink-900 p-3 animate-fade-in">
                <div className="mb-2">
                  <p className="text-[12px] font-semibold text-clay-700 dark:text-ink-50">
                    {tamTarih(seciliGun)}
                  </p>
                  {seciliTatilAd && (
                    <p className="text-[11px] font-medium text-terracotta mt-0.5">
                      {seciliTatilAd}
                    </p>
                  )}
                </div>
                {seciliNotlar.length === 0 ? (
                  <p className="text-[12px] text-clay-400 dark:text-ink-300">Bu güne ait hatırlatıcı yok.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {seciliNotlar.map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => setSeciliNotId(n.id)}
                          className="w-full flex items-start gap-2 text-left rounded-lg px-2 py-1.5 hover:bg-cream-100 dark:hover:bg-ink-800/60 transition-colors"
                          aria-label={`${n.baslik} - notu aç`}
                        >
                          <Bell className="h-3 w-3 text-terracotta shrink-0 mt-0.5" strokeWidth={2.5} />
                          <span className="flex-1 min-w-0 text-[12px] text-clay-700 dark:text-ink-100 break-words [overflow-wrap:anywhere] leading-snug">{n.baslik}</span>
                          <span className="shrink-0 text-[10px] text-clay-400 dark:text-ink-300 tabular-nums mt-0.5">
                            {new Date(n.hatirlatmaZamani!).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Not detayi - anasayfadaki birebir NotKart gorunumu, flu arka plan, tam etkilesimli */}
      <Dialog open={!!seciliNot} onOpenChange={(o) => { if (!o) setSeciliNotId(null); }}>
        <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="sm:max-w-lg p-4 overflow-y-visible">
          {seciliNot && <NotKart not={seciliNot} klasorBadgeGoster={false} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
