"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { MiniTakvim, tarihAnahtar } from "./MiniTakvim";
import { NotKart } from "./Notlar";
import type { Not } from "@/lib/types";

const AY_ADLARI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const GUN_TAM = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

function tamTarih(d: Date): string {
  return `${d.getDate()} ${AY_ADLARI[d.getMonth()]} ${d.getFullYear()} - ${GUN_TAM[d.getDay()]}`;
}

export function TakvimModal({
  acik, onOpenChange, notlar = [], tatilAdlari = new Map<string, string>(),
}: {
  acik: boolean;
  onOpenChange: (a: boolean) => void;
  notlar?: Not[];
  tatilAdlari?: Map<string, string>;
}) {
  const tatilGunleri = new Set(tatilAdlari.keys());
  const [seciliGun, setSeciliGun] = useState<Date | null>(null);
  const [seciliNotId, setSeciliNotId] = useState<string | null>(null);

  // hatirlatici olan gunler (isaret) + secili gunun notlari + acik not (id ile - duzenleme sonrasi guncel kalir)
  const hatirlatmaGunleri = new Set(
    notlar.filter((n) => n.hatirlatmaZamani).map((n) => tarihAnahtar(new Date(n.hatirlatmaZamani!)))
  );
  const seciliNotlar = seciliGun
    ? notlar.filter((n) => n.hatirlatmaZamani && tarihAnahtar(new Date(n.hatirlatmaZamani)) === tarihAnahtar(seciliGun))
    : [];
  const seciliNot = seciliNotId ? notlar.find((n) => n.id === seciliNotId) ?? null : null;

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
              hatirlatmaGunleri={hatirlatmaGunleri}
              tatilGunleri={tatilGunleri}
              onGunTikla={setSeciliGun}
            />

            {/* Secili gunun hatirlaticilari - takvim boyutu sabit kalir, baslik tam (kaydirma) */}
            {seciliGun && (
              <div className="rounded-xl border border-cream-300 dark:border-ink-700 bg-cream-50 dark:bg-ink-900 p-3 animate-fade-in">
                <div className="mb-2">
                  <p className="text-[12px] font-semibold text-clay-700 dark:text-ink-50">
                    {tamTarih(seciliGun)}
                  </p>
                  {tatilAdlari.get(tarihAnahtar(seciliGun)) && (
                    <p className="text-[11px] font-medium text-terracotta mt-0.5">
                      {tatilAdlari.get(tarihAnahtar(seciliGun))}
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
                          <span className="flex-1 text-[12px] text-clay-700 dark:text-ink-100 break-words leading-snug">{n.baslik}</span>
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
        <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="sm:max-w-lg p-4">
          {seciliNot && <NotKart not={seciliNot} klasorBadgeGoster={false} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
