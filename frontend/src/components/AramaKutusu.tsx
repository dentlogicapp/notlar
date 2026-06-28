"use client";

import { Search, X } from "lucide-react";

export function AramaKutusu({
  deger, onDegis,
}: {
  deger: string;
  onDegis: (v: string) => void;
}) {
  return (
    <div className="relative flex-1 min-w-0">
      <input
        type="text"
        value={deger}
        onChange={(e) => onDegis(e.target.value)}
        placeholder="Bulmak istediğiniz notun içerisinde geçen ifadeleri yazarak aratın"
        aria-label="Notlarda ara"
        className="w-full rounded-xl border border-cream-300 dark:border-ink-700 bg-cream-50 dark:bg-ink-900 pl-4 pr-10 py-2 text-sm text-clay-700 dark:text-ink-100 placeholder:text-clay-300 dark:placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-terracotta/40 focus:border-terracotta transition-shadow"
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
