"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { MiniTakvim, tarihAnahtar } from "./MiniTakvim";
import type { Not } from "@/lib/types";

const AY_ADLARI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const GUN_TAM = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

function tamTarih(d: Date): string {
  return `${d.getDate()} ${AY_ADLARI[d.getMonth()]} ${d.getFullYear()} - ${GUN_TAM[d.getDay()]}`;
}

export function TakvimModal({
  acik, onOpenChange, notlar = [], tatilGunleri = new Set<string>(),
}: {
  acik: boolean;
  onOpenChange: (a: boolean) => void;
  notlar?: Not[];
  tatilGunleri?: Set<string>;
}) {
  const [seciliGun, setSeciliGun] = useState<Date | null>(null);

  // hatirlatici olan gunler (isaret icin) + secili gunun notlari
  const hatirlatmaGunleri = new Set(
    notlar.filter((n) => n.hatirlatmaZamani).map((n) => tarihAnahtar(new Date(n.hatirlatmaZamani!)))
  );
  const seciliNotlar = seciliGun
    ? notlar.filter((n) => n.hatirlatmaZamani && tarihAnahtar(new Date(n.hatirlatmaZamani)) === tarihAnahtar(seciliGun))
    : [];

  return (
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

          {/* Secili gunun hatirlaticilari */}
          {seciliGun && (
            <div className="rounded-xl border border-cream-300 dark:border-ink-700 bg-cream-50 dark:bg-ink-900 p-3 animate-fade-in">
              <p className="text-[12px] font-semibold text-clay-700 dark:text-ink-50 mb-2">
                {tamTarih(seciliGun)}
              </p>
              {seciliNotlar.length === 0 ? (
                <p className="text-[12px] text-clay-400 dark:text-ink-300">Bu güne ait hatırlatıcı yok.</p>
              ) : (
                <ul className="space-y-1.5">
                  {seciliNotlar.map((n) => (
                    <li key={n.id} className="flex items-center gap-2 text-[12px] text-clay-600 dark:text-ink-100">
                      <Bell className="h-3 w-3 text-terracotta shrink-0" strokeWidth={2.5} />
                      <span className="truncate">{n.baslik}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-clay-400 dark:text-ink-300 tabular-nums">
                        {new Date(n.hatirlatmaZamani!).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
