"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Loader2, Plus, Eye, Power, ChevronRight, Building2, Trash2, Shield } from "lucide-react";
import { toast } from "sonner";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import { superAdminIsletmeApi } from "@/lib/api";
import { TenantOlusturModal } from "@/components/TenantOlusturModal";
import { CanliAkis } from "@/components/CanliAkis";
import { KvkkYonetim } from "@/components/KvkkYonetim";
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
  const [copModu, setCopModu] = useState(false);
  const { data: tenantlar, isLoading, isError } = useQuery({
    queryKey: ["super-admin-isletmeler", copModu],
    queryFn: () => superAdminIsletmeApi.list(copModu),
  });

  const [islemId, setIslemId] = useState<string | null>(null);
  const [modalAcik, setModalAcik] = useState(false);
  const [kaliciHedef, setKaliciHedef] = useState<IsletmeOzet | null>(null);
  const [kaliciInput, setKaliciInput] = useState("");

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

  const silMut = useMutation({
    mutationFn: (id: string) => superAdminIsletmeApi.sil(id),
    onMutate: (id) => setIslemId(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-admin-isletmeler"] });
      toast.success("Tenant silindi (veriler korundu)");
    },
    onError: () => toast.error("Tenant silinemedi"),
    onSettled: () => setIslemId(null),
  });

  const kaliciSilMut = useMutation({
    mutationFn: ({ id, ad }: { id: string; ad: string }) => superAdminIsletmeApi.kaliciSil(id, ad),
    onMutate: ({ id }) => setIslemId(id),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["super-admin-isletmeler"] });
      toast.success(
        r.silinenYetimKullanici > 0
          ? `Tenant kalıcı silindi (${r.silinenYetimKullanici} kullanıcı da temizlendi)`
          : "Tenant kalıcı silindi",
      );
      setKaliciHedef(null);
      setKaliciInput("");
    },
    onError: () => toast.error("Kalıcı silme başarısız"),
    onSettled: () => setIslemId(null),
  });

  return (
    <>
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
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/super-admin/yoneticiler" title="Süper Adminler" className="text-clay-400 hover:text-terracotta dark:text-ink-300 dark:hover:text-terracotta transition-colors">
            <Shield className="h-5 w-5" />
          </Link>
          <UserMenu />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-5">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-cream-200/50 dark:bg-ink-800/50 w-fit">
          <button
            type="button"
            onClick={() => setCopModu(false)}
            className={cn("px-3 py-1.5 text-xs rounded-md transition-colors", !copModu ? "bg-white dark:bg-ink-700 text-clay-900 dark:text-ink-50 shadow-sm" : "text-clay-500 dark:text-ink-300")}
          >
            Aktif
          </button>
          <button
            type="button"
            onClick={() => setCopModu(true)}
            className={cn("flex items-center gap-1 px-3 py-1.5 text-xs rounded-md transition-colors", copModu ? "bg-white dark:bg-ink-700 text-red-600 dark:text-red-400 shadow-sm" : "text-clay-500 dark:text-ink-300")}
          >
            <Trash2 className="h-3 w-3" /> Çöp Kutusu
          </button>
        </div>

        {!copModu && (
          <Button type="button" className="w-full" onClick={() => setModalAcik(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Yeni Tenant
          </Button>
        )}

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
            <p className="text-sm text-clay-400 dark:text-ink-300">{copModu ? "Çöp kutusu boş." : "Henüz tenant yok."}</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {tenantlar.map((t) => (
              <TenantKart
                key={t.id}
                t={t}
                copModu={copModu}
                mesgul={islemId === t.id}
                onGor={() => gorMut.mutate(t.id)}
                onDurum={() => durumMut.mutate(t.id)}
                onSil={() => { if (confirm(`"${t.markaAdi}" tenant'ini silmek istediginize emin misiniz?\n\nVeriler korunur, cop kutusuna tasinir (geri alinabilir).`)) silMut.mutate(t.id); }}
                onKaliciSil={() => { setKaliciHedef(t); setKaliciInput(""); }}
              />
            ))}
          </div>
        )}

        <KvkkYonetim /> 
        <CanliAkis tenantlar={tenantlar} />
      </div>
    </main>
    <TenantOlusturModal open={modalAcik} onClose={() => setModalAcik(false)} />

    {kaliciHedef && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setKaliciHedef(null)}>
        <div className="kart max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <Trash2 className="h-5 w-5 shrink-0" />
            <h3 className="font-semibold">Kalıcı sil (geri alınamaz)</h3>
          </div>
          <p className="text-sm text-clay-600 dark:text-ink-200 leading-relaxed">
            <strong>{kaliciHedef.markaAdi}</strong> tenant'ı ve ona ait tüm veriler (notlar, klasörler, üyelikler, metinler, geçmiş, bildirimler) veritabanından <strong>kalıcı olarak</strong> silinecek. Sadece bu tenant'a ait kullanıcılar da temizlenir. Bu işlem geri alınamaz.
          </p>
          <div className="space-y-1.5">
            <label className="block text-xs text-clay-500 dark:text-ink-300">
              Onaylamak için marka adını yaz: <strong className="text-clay-700 dark:text-ink-100">{kaliciHedef.markaAdi}</strong>
            </label>
            <input
              type="text"
              value={kaliciInput}
              onChange={(e) => setKaliciInput(e.target.value)}
              placeholder={kaliciHedef.markaAdi}
              autoFocus
              className="w-full rounded-lg border border-cream-300 dark:border-ink-700 bg-white/60 dark:bg-ink-800/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setKaliciHedef(null)}>Vazgeç</Button>
            <Button
              type="button"
              disabled={kaliciInput.trim() !== kaliciHedef.markaAdi || kaliciSilMut.isPending}
              onClick={() => kaliciSilMut.mutate({ id: kaliciHedef.id, ad: kaliciInput.trim() })}
              className="bg-red-600 hover:bg-red-700 text-white border-red-600"
            >
              {kaliciSilMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Kalıcı Sil
            </Button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function TenantKart({ t, copModu, mesgul, onGor, onDurum, onSil, onKaliciSil }: {
  t: IsletmeOzet;
  copModu: boolean;
  mesgul: boolean;
  onGor: () => void;
  onDurum: () => void;
  onSil: () => void;
  onKaliciSil: () => void;
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
        {copModu ? (
          <button
            type="button"
            disabled={mesgul}
            onClick={onKaliciSil}
            title="Kalıcı sil (geri alınamaz)"
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50 transition-colors"
          >
            {mesgul ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Kalıcı Sil
          </button>
        ) : (
          <>
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
            <button
              type="button"
              disabled={mesgul}
              onClick={onSil}
              title="Çöpe at"
              className="flex items-center gap-1 px-2 py-1 text-xs text-clay-400 dark:text-ink-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 transition-colors"
            >
              <Trash2 className="h-3 w-3" /> Sil
            </button>
          </>
        )}
      </div>
    </div>
  );
}
