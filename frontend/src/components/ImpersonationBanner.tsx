"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Eye, Loader2 } from "lucide-react";
import { useBen } from "@/lib/useBen";
import { superAdminIsletmeApi } from "@/lib/api";

// B3 - kalan sure formatla (sa/dk/sn)
function kalanFormat(ms: number): string {
  if (ms <= 0) return "0 dk";
  const dk = Math.floor(ms / 60000);
  const sn = Math.floor((ms % 60000) / 1000);
  if (dk >= 60) return `${Math.floor(dk / 60)} sa ${dk % 60} dk`;
  if (dk >= 1) return `${dk} dk`;
  return `${sn} sn`;
}

// v19 Asama 9 - B2 impersonation banner (global ust bar) + B3 countdown.
// Ben.goruntulemeModu true ise super admin baska tenant'i goruntuluyor; salt-okunur uyarisi +
// kalan sure (sessionStorage imp_bitis'ten) + "Super panele don" cikis.
export function ImpersonationBanner() {
  const { data: ben } = useBen();
  const [kalanMs, setKalanMs] = useState<number | null>(null);

  const cikMut = useMutation({
    mutationFn: () => superAdminIsletmeApi.goruntuleBitir(),
    onSuccess: () => {
      try { sessionStorage.removeItem("imp_bitis"); } catch {}
      window.location.href = "/super-admin";
    },
  });

  // B3 - countdown: sessionStorage imp_bitis'ten kalan sure; 0'a inince token expire -> cikis
  useEffect(() => {
    if (!ben?.goruntulemeModu) return;
    let bitis: number | null = null;
    try {
      const s = sessionStorage.getItem("imp_bitis");
      if (s) bitis = new Date(s).getTime();
    } catch { /* sessionStorage erisimi yoksa countdown'suz */ }
    if (!bitis) return;

    const tik = () => {
      const kalan = bitis! - Date.now();
      setKalanMs(kalan);
      if (kalan <= 0) {
        try { sessionStorage.removeItem("imp_bitis"); } catch {}
        window.location.href = "/super-admin";
      }
    };
    tik();
    const it = setInterval(tik, 1000);
    return () => clearInterval(it);
  }, [ben?.goruntulemeModu]);

  if (!ben?.goruntulemeModu) return null;

  const azKaldi = kalanMs !== null && kalanMs <= 5 * 60000;  // 5 dk kala kirmizi pulse

  return (
    <div className={`sticky top-0 z-[55] text-white text-sm shadow-sm ${azKaldi ? "bg-red-600 animate-pulse" : "bg-amber-500 dark:bg-amber-600"}`}>
      <div className="max-w-5xl mx-auto px-4 py-2 flex items-center justify-center gap-3 flex-wrap">
        <Eye className="h-4 w-4 shrink-0" />
        <span className="text-center">
          <strong>{ben.goruntulenenMarka ?? "Bir tenant"}</strong> görünümündesiniz — salt-okunur mod
          {kalanMs !== null && <span className="ml-1 opacity-90">· Kalan: {kalanFormat(kalanMs)}</span>}
        </span>
        <button
          type="button"
          onClick={() => cikMut.mutate()}
          disabled={cikMut.isPending}
          className="inline-flex items-center gap-1 underline font-medium hover:no-underline disabled:opacity-60"
        >
          {cikMut.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          Süper panele dön
        </button>
      </div>
    </div>
  );
}
