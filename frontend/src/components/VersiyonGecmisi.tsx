"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { History, Loader2, RotateCcw } from "lucide-react";
import { metinApi } from "@/lib/api";
import type { MetinVersiyon } from "@/lib/types";

// v18 Asama 15 - Field history. 🕐 ikon -> son 10 versiyon (tarih + onizleme), tikla -> versiyona don onay.
// Backend hazir (GET .../versiyonlar, POST .../versiyona-don). Donulen icerik onDon ile forma yansir.
export function VersiyonGecmisi({ anahtar, onDon }: { anahtar: string; onDon: (icerik: string) => void }) {
  const [acik, setAcik] = useState(false);
  const qc = useQueryClient();

  const { data: versiyonlar, isLoading } = useQuery({
    queryKey: ["metin-versiyonlar", anahtar],
    queryFn: () => metinApi.versiyonlar(anahtar),
    enabled: acik, // lazy: sadece dropdown acilinca cek
  });

  const don = useMutation({
    mutationFn: async (v: MetinVersiyon) => {
      await metinApi.versiyonaDon(anahtar, v.id);
      return v;
    },
    onSuccess: (v) => {
      onDon(v.icerik);
      qc.invalidateQueries({ queryKey: ["isletme-metinleri"] });
      qc.invalidateQueries({ queryKey: ["isletme-aktif"] });
      qc.invalidateQueries({ queryKey: ["metin-versiyonlar", anahtar] });
      setAcik(false);
    },
  });

  const tarih = (s: string) =>
    new Date(s).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAcik((a) => !a)}
        title="Geçmiş versiyonlar"
        aria-label="Geçmiş versiyonlar"
        className="inline-flex items-center text-clay-400 hover:text-terracotta dark:text-ink-300 dark:hover:text-terracotta transition-colors"
      >
        <History className="h-3.5 w-3.5" />
      </button>

      {acik && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAcik(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-72 kart p-1.5 max-h-72 overflow-y-auto shadow-lg">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-clay-400" />
              </div>
            ) : !versiyonlar || versiyonlar.length === 0 ? (
              <p className="text-xs text-clay-400 dark:text-ink-300 text-center py-4">Henüz geçmiş versiyon yok</p>
            ) : (
              <>
                <p className="text-[10px] uppercase tracking-wider text-clay-400 dark:text-ink-300 px-2 py-1">Son versiyonlar</p>
                {versiyonlar.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    disabled={don.isPending}
                    onClick={() => {
                      if (window.confirm("Bu versiyona dönülsün mü? Mevcut metnin yeni bir versiyon olarak saklanır.")) don.mutate(v);
                    }}
                    className="w-full text-left rounded-md px-2 py-1.5 hover:bg-cream-200 dark:hover:bg-ink-800 transition-colors group disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-clay-700 dark:text-ink-100">v{v.versiyon} · {tarih(v.olusturmaZamani)}</span>
                      <RotateCcw className="h-3 w-3 text-clay-300 group-hover:text-terracotta shrink-0" />
                    </div>
                    <p className="text-xs text-clay-500 dark:text-ink-200 truncate mt-0.5">{v.icerik || "(boş)"}</p>
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
