"use client";

import { Search, X } from "lucide-react";
import { type ReactNode } from "react";
import { Input } from "./ui/input";

export function AramaKutusu({
  deger, onDegis,
}: {
  deger: string;
  onDegis: (v: string) => void;
}) {
  return (
    <div className="relative flex-1 min-w-0">
      <Input
        value={deger}
        onChange={(e) => onDegis(e.target.value)}
        placeholder="Aradığın notta geçen ifadeyi yaz..."
        aria-label="Notlarda ara"
        className="h-10 pr-10 text-[13px] placeholder:text-[13px]"
      />
      {deger ? (
        <button
          type="button"
          onClick={() => onDegis("")}
          aria-label="Aramayı temizle"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-clay-400 dark:text-ink-300 hover:text-terracotta hover:bg-cream-200 dark:hover:bg-ink-800 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      ) : (
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-clay-300 dark:text-ink-400 pointer-events-none" />
      )}
    </div>
  );
}

// Eslesen ifadeyi vurgular (Turkce buyuk/kucuk harfe duyarsiz, orijinal metin korunur)
export function Vurgula({ metin, terim }: { metin: string; terim: string }) {
  const t = terim.trim();
  if (!t || !metin) return <>{metin}</>;

  const lowMetin = metin.toLocaleLowerCase("tr-TR");
  const lowTerim = t.toLocaleLowerCase("tr-TR");
  const parcalar: ReactNode[] = [];
  let i = 0;
  let key = 0;
  let bulunan = lowMetin.indexOf(lowTerim, i);
  while (bulunan !== -1) {
    if (bulunan > i) parcalar.push(metin.slice(i, bulunan));
    parcalar.push(
      <mark key={key++} className="bg-terracotta/25 text-inherit rounded-[3px] px-0.5">
        {metin.slice(bulunan, bulunan + t.length)}
      </mark>
    );
    i = bulunan + t.length;
    bulunan = lowMetin.indexOf(lowTerim, i);
  }
  if (i < metin.length) parcalar.push(metin.slice(i));
  return <>{parcalar}</>;
}
