"use client";

import { useMutation } from "@tanstack/react-query";
import { Eye, Loader2 } from "lucide-react";
import { useBen } from "@/lib/useBen";
import { superAdminIsletmeApi } from "@/lib/api";

// v19 Asama 9 - B2 impersonation banner (global ust bar).
// Ben.goruntulemeModu true ise super admin baska tenant'i goruntuluyor demektir;
// salt-okunur uyarisi + "Super panele don" cikis (goruntuleBitir -> /super-admin).
export function ImpersonationBanner() {
  const { data: ben } = useBen();

  const cikMut = useMutation({
    mutationFn: () => superAdminIsletmeApi.goruntuleBitir(),
    onSuccess: () => { window.location.href = "/super-admin"; },
  });

  if (!ben?.goruntulemeModu) return null;

  return (
    <div className="sticky top-0 z-[55] bg-amber-500 dark:bg-amber-600 text-white text-sm shadow-sm">
      <div className="max-w-5xl mx-auto px-4 py-2 flex items-center justify-center gap-3 flex-wrap">
        <Eye className="h-4 w-4 shrink-0" />
        <span className="text-center">
          <strong>{ben.goruntulenenMarka ?? "Bir tenant"}</strong> görünümündesiniz — salt-okunur mod
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
