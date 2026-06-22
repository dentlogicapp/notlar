"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Loader2, Plus, Eye, Power, ChevronRight, Building2 } from "lucide-react";
import { toast } from "sonner";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import { superAdminIsletmeApi } from "@/lib/api";
import type { IsletmeOzet } from "@/lib/types";
import { cn } from "@/lib/utils";

const MOD_ETIKET: Record<string, string> = {
  es: "Eş", aile: "Aile", ekip: "Ekip", tatil: "Tatil", ozel: "Özel",
};

// B3 - saglik skoru rengi (4 ceyrek: onboarding/davetiye/aktiflik/not)
function saglikStili(skor: number): string {
  if (skor >= 75) return "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400";
  if (skor >= 50) return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400";
  if (skor >= 25) return "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400";
  return "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400";
}

function tarihKisa(iso: string): string {
  try { return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return "—"; }
}

export default function SuperAdminPage() {
  const qc = useQueryClient();
  const { data: tenantlar, isLoading, isError } = useQuery({
    queryKey: ["super-admin-isletmeler"],
    queryFn: () => superAdminIsletmeApi.list(),
  });

  const [islemId, setIslemId] = useState<string | null>(null);

  const durumMut = useMutation({
    mutationFn: (id: string) => superAdminIsletmeApi.durum(id),
    onMutate: (id) => setIslemId(id),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["super-admin-isletmeler"] });
      toast.success(r.aktif ? "Tenant aktifleştirildi" : "Tenant pasifleştirildi");
    },
    onError: () => toast.error("Durum değiştirilemedi"),
    onSettled: () => setIslemId(null),
  });

  const gorMut = useMutation({
    mutationFn: (id: string) => superAdminIsletmeApi.goruntule(id),
    onMutate: (id) => setIslemId(id),
    onSuccess: (r) => {
      // B3 - impersonation bitis zamani countdown icin (reload sonrasi banner sessionStorage'dan okur)
      try { sessionStorage.setItem("imp_bitis", r.gecerlilikBitis); } catch {}
      // Impersonation JWT cookie set edildi -> tam yenileme ile yeni tenant baglamina gec
      window.location.href = "/";
    },
    onError: () => { toast.error("Görüntüleme başlatılamadı"); setIslemId(null); },
  });

  return (
    <main className="min-h-screen bg-cream-100 dark:bg-ink-900 pb-16">
      <header className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 pb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="text-clay-400 hover:text-clay-700 dark:text-ink-300 dark:hover:text-ink-100 transition-colors shrink-0">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-display font-semibold text-clay-900 dark:text-ink-50 leading-tight">Tenant Yönetimi</h1>
            <p className="text-xs text-clay-400 dark:text-ink-300">Sistemdeki tüm işletmeler</p>
          </div>
        </div>
        <UserMenu />
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-5">
        <Button type="button" className="w-full" disabled title="Aşama 9'da gelecek">
          <Plus className="h-4 w-4 mr-1.5" /> Yeni Tenant (yakında)
        </Button>

        {isLoading ? (
          <div className="grid sm:grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="kart p-5 h-36 animate-pulse bg-cream-200/40 dark:bg-ink-800/40" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-sm text-red-600 dark:text-red-400 py-8 text-center">Tenant listesi yüklenemedi.</p>
        ) : !tenantlar || tenantlar.length === 0 ? (
          <div className="text-center py-16">
            <Building2 className="h-10 w-10 mx-auto text-clay-300 dark:text-ink-600 mb-3" />
            <p className="text-sm text-clay-400 dark:text-ink-300">Henüz tenant yok.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {tenantlar.map((t) => (
              <TenantKart
                key={t.id}
                t={t}
                mesgul={islemId === t.id}
                onGor={() => gorMut.mutate(t.id)}
                onDurum={() => durumMut.mutate(t.id)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function TenantKart({ t, mesgul, onGor, onDurum }: {
  t: IsletmeOzet;
  mesgul: boolean;
  onGor: () => void;
  onDurum: () => void;
}) {
  return (
    <div className={cn("kart p-5 group relative transition-opacity", !t.aktif && "opacity-60")}>
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0 leading-none mt-0.5">{t.markaEmoji}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-clay-900 dark:text-ink-50 truncate">{t.markaAdi}</h3>
          <p className="text-xs text-clay-400 dark:text-ink-300 mt-0.5">
            {MOD_ETIKET[t.kullanimModu] ?? t.kullanimModu} · {t.uyeSayisi} üye
          </p>
        </div>
        <span className={cn("shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums", saglikStili(t.saglikSkoru))}>
          {t.saglikSkoru}
        </span>
      </div>

      {/* doluluk bari */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] text-clay-400 dark:text-ink-300 mb-1">
          <span>Doluluk</span>
          <span className="tabular-nums">%{t.dolulukYuzde}</span>
        </div>
        <div className="h-1.5 rounded-full bg-cream-300 dark:bg-ink-700 overflow-hidden">
          <div className="h-full rounded-full bg-terracotta transition-all" style={{ width: `${t.dolulukYuzde}%` }} />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-clay-400 dark:text-ink-300">
        <span className={cn("px-1.5 py-0.5 rounded font-medium", t.aktif ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
          {t.aktif ? "Aktif" : "Pasif"}
        </span>
        <span>{tarihKisa(t.olusturmaZamani)}</span>
      </div>

      {/* B4 - quick actions (hover) */}
      <div className="mt-3 pt-3 border-t border-cream-200 dark:border-ink-700/60 flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <Link
          href={`/super-admin/${t.id}`}
          className="flex items-center gap-1 px-2 py-1 text-xs text-clay-500 dark:text-ink-300 hover:text-terracotta transition-colors"
        >
          Detay <ChevronRight className="h-3 w-3" />
        </Link>
        <div className="flex-1" />
        <button
          type="button"
          disabled={mesgul}
          onClick={onGor}
          title="Bu tenant olarak görüntüle (salt-okunur)"
          className="flex items-center gap-1 px-2 py-1 text-xs text-clay-500 dark:text-ink-300 hover:text-terracotta disabled:opacity-50 transition-colors"
        >
          {mesgul ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />} Gör
        </button>
        <button
          type="button"
          disabled={mesgul}
          onClick={onDurum}
          title={t.aktif ? "Pasifleştir" : "Aktifleştir"}
          className="flex items-center gap-1 px-2 py-1 text-xs text-clay-500 dark:text-ink-300 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 transition-colors"
        >
          <Power className="h-3 w-3" /> {t.aktif ? "Pasifleştir" : "Aktifleştir"}
        </button>
      </div>
    </div>
  );
}
