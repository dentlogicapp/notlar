"use client";
// Paylasilan klasor secici: liste + inline "yeni klasor olustur" akisi.
// Tek dogruluk kaynagi (Bolum 3): Duzenle dialog, NotKart badge, DetayDialog hepsi bunu kullanir.
// Bilesen SADECE klasor olusturur ve onChange(yeniId) verir; notu tasima cagiran tarafta (atomiklik cagiran katmanda).
import * as DM from "@radix-ui/react-dropdown-menu";
import { useState, useRef, type ReactNode, type KeyboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, FolderHeart, X, Loader2 } from "lucide-react";
import { klasorApi } from "@/lib/api";
import type { Klasor } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function KlasorSecici({
  value,
  onChange,
  klasorler,
  klasorEtiketi,
  tetik,
  hizalama = "start",
  disabled = false,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  klasorler: Klasor[];
  klasorEtiketi: (k: Klasor) => string;
  tetik: ReactNode;
  hizalama?: "start" | "end" | "center";
  disabled?: boolean;
}) {
  const qc = useQueryClient();
  const [acik, setAcik] = useState(false);
  const [mod, setMod] = useState<"liste" | "yeni">("liste");
  const [yeniAd, setYeniAd] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Sadece kullanici klasorleri (sistem klasoru "Tamamlananlar" secilemez; not ancak tamamlaninca oraya tasinir).
  const secilebilir = klasorler.filter((k) => !k.sistemMi);

  const olustur = useMutation({
    mutationFn: (ad: string) => klasorApi.create({ ad }),
    onSuccess: (yeni) => {
      qc.invalidateQueries({ queryKey: ["klasorler"] });
      onChange(yeni.id);
      toast.success("KlasÃ¶r oluÅŸturuldu");
      kapat();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function kapat() {
    setAcik(false);
    setMod("liste");
    setYeniAd("");
  }

  function yeniModaGec() {
    setMod("yeni");
    // Radix menu focus'unu birakip input'a odaklan
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function olusturmayiOnayla() {
    const ad = yeniAd.trim();
    if (ad.length === 0) {
      toast.error("KlasÃ¶r adÄ± boÅŸ olamaz");
      return;
    }
    // Duplike guard (buyuk/kucuk harf duyarsiz, mevcut kullanici klasorleri arasinda)
    const cakisma = secilebilir.some(
      (k) => k.ad.trim().toLocaleLowerCase("tr-TR") === ad.toLocaleLowerCase("tr-TR")
    );
    if (cakisma) {
      toast.error("Bu isimde bir klasÃ¶r zaten var");
      return;
    }
    olustur.mutate(ad);
  }

  function inputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      olusturmayiOnayla();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setMod("liste");
      setYeniAd("");
    }
  }

  function sec(id: string | null) {
    onChange(id);
    kapat();
  }

  return (
    <DM.Root open={acik} onOpenChange={(o) => { if (!o) kapat(); else setAcik(true); }}>
      <DM.Trigger asChild disabled={disabled}>
        {tetik}
      </DM.Trigger>

      <DM.Portal>
        <DM.Content
          align={hizalama}
          sideOffset={6}
          className="min-w-[240px] max-w-[300px] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto kart p-1 z-50 animate-fade-in"
          // Inline "yeni" modundayken menu item klavye navigasyonu inputu bozmasin diye
          onKeyDown={(e) => { if (mod === "yeni") e.stopPropagation(); }}
        >
          {mod === "liste" ? (
            <>
              {/* Kategorize edilmemis */}
              <DM.Item
                onSelect={(e) => { e.preventDefault(); sec(null); }}
                className="flex items-center gap-2.5 px-3 py-2.5 text-[15px] sm:text-sm rounded-lg hover:bg-cream-200 dark:hover:bg-ink-800 cursor-pointer outline-none text-clay-700 dark:text-ink-100 min-h-[44px] sm:min-h-0"
              >
                <span className="h-4 w-4 shrink-0 flex items-center justify-center">
                  {value === null && <Check className="h-4 w-4 text-terracotta" strokeWidth={2.5} />}
                </span>
                <span className="text-clay-500 dark:text-ink-300">Kategorize edilmemiÅŸ</span>
              </DM.Item>

              {secilebilir.map((k) => (
                <DM.Item
                  key={k.id}
                  onSelect={(e) => { e.preventDefault(); sec(k.id); }}
                  className="flex items-center gap-2.5 px-3 py-2.5 text-[15px] sm:text-sm rounded-lg hover:bg-cream-200 dark:hover:bg-ink-800 cursor-pointer outline-none text-clay-700 dark:text-ink-100 min-h-[44px] sm:min-h-0"
                >
                  <span className="h-4 w-4 shrink-0 flex items-center justify-center">
                    {value === k.id && <Check className="h-4 w-4 text-terracotta" strokeWidth={2.5} />}
                  </span>
                  <FolderHeart className="h-4 w-4 text-terracotta shrink-0" strokeWidth={2} />
                  <span className="truncate">{klasorEtiketi(k)}</span>
                </DM.Item>
              ))}

              <DM.Separator className="my-1 h-px bg-cream-300 dark:bg-ink-700" />

              {/* Yeni klasor olustur - inline moda gecer (Radix'i kapatmaz) */}
              <DM.Item
                onSelect={(e) => { e.preventDefault(); yeniModaGec(); }}
                className="flex items-center gap-2.5 px-3 py-2.5 text-[15px] sm:text-sm rounded-lg hover:bg-rose-50/60 dark:hover:bg-ink-800 cursor-pointer outline-none text-terracotta font-medium min-h-[44px] sm:min-h-0"
              >
                <span className="h-4 w-4 shrink-0 flex items-center justify-center">
                  <Plus className="h-4 w-4" strokeWidth={2.5} />
                </span>
                Yeni klasÃ¶r oluÅŸtur
              </DM.Item>
            </>
          ) : (
            /* Inline yeni klasor formu */
            <div className="p-1.5">
              <div className="flex items-center gap-1.5">
                <input
                  ref={inputRef}
                  value={yeniAd}
                  onChange={(e) => setYeniAd(e.target.value)}
                  onKeyDown={inputKeyDown}
                  placeholder="KlasÃ¶r adÄ±"
                  maxLength={60}
                  className="flex-1 min-w-0 h-11 rounded-lg border border-clay-200 dark:border-ink-700 bg-white dark:bg-ink-850 px-3 text-[16px] text-clay-900 dark:text-ink-50 placeholder:text-clay-400 focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/15 transition-colors"
                />
                <button
                  type="button"
                  onClick={olusturmayiOnayla}
                  disabled={olustur.isPending || yeniAd.trim().length === 0}
                  aria-label="OluÅŸtur"
                  className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-lg bg-terracotta text-white hover:bg-terracotta-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {olustur.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Check className="h-4 w-4" strokeWidth={2.5} />}
                </button>
                <button
                  type="button"
                  onClick={() => { setMod("liste"); setYeniAd(""); }}
                  aria-label="VazgeÃ§"
                  className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-lg text-clay-500 dark:text-ink-300 hover:bg-cream-200 dark:hover:bg-ink-800 transition-colors"
                >
                  <X className="h-4 w-4" strokeWidth={2.5} />
                </button>
              </div>
            </div>
          )}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}
