"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Loader2, Mail, Clock, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { superAdminIsletmeApi } from "@/lib/api";
import type { IsletmeUye } from "@/lib/types";
import { cn } from "@/lib/utils";

const MOD_ETIKET: Record<string, string> = {
  es: "Eş", aile: "Aile", ekip: "Ekip", tatil: "Tatil", ozel: "Özel",
};

function saglikStili(skor: number): string {
  if (skor >= 75) return "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400";
  if (skor >= 50) return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400";
  if (skor >= 25) return "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400";
  return "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400";
}

function tarih(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" }); }
  catch { return "—"; }
}

export default function TenantDetayPage() {
  const { id } = useParams<{ id: string }>();
  const { data: t, isLoading, isError } = useQuery({
    queryKey: ["super-admin-isletme", id],
    queryFn: () => superAdminIsletmeApi.get(id),
    enabled: !!id,
  });

  return (
    <main className="min-h-screen bg-cream-100 dark:bg-ink-900 pb-16">
      <header className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 pb-4">
        <Link href="/super-admin" className="inline-flex items-center gap-1.5 text-sm text-clay-400 hover:text-clay-700 dark:text-ink-300 dark:hover:text-ink-100 transition-colors">
          <ChevronLeft className="h-4 w-4" /> Tenant listesi
        </Link>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-clay-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : isError || !t ? (
          <p className="text-sm text-red-600 dark:text-red-400 py-12 text-center">Tenant bulunamadı veya yüklenemedi.</p>
        ) : (
          <div className="space-y-5">
            {/* Baslik */}
            <div className="kart p-6 flex items-start gap-4">
              <span className="text-4xl shrink-0 leading-none">{t.markaEmoji}</span>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-display font-semibold text-clay-900 dark:text-ink-50 leading-tight">{t.markaAdi}</h1>
                <p className="text-sm text-clay-400 dark:text-ink-300 mt-1">
                  {MOD_ETIKET[t.kullanimModu] ?? t.kullanimModu} ·{" "}
                  <span className={t.aktif ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                    {t.aktif ? "Aktif" : "Pasif"}
                  </span>
                </p>
              </div>
              <span className={cn("shrink-0 px-3 py-1 rounded-full text-sm font-semibold tabular-nums", saglikStili(t.saglikSkoru))}>
                {t.saglikSkoru}
              </span>
            </div>

            {/* Ozet bilgiler */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Bilgi etiket="Doluluk" deger={`%${t.dolulukYuzde}`} />
              <Bilgi etiket="Üye sayısı" deger={String(t.uyeler.length)} />
              <Bilgi etiket="Oluşturma" deger={tarih(t.olusturmaZamani)} />
              <Bilgi etiket="Karşılama" deger={t.karsilamaBasligi || "—"} />
              <Bilgi etiket="Sayaç" deger={t.sayacAktif ? (t.sayacBasligi || "Açık") : "Kapalı"} />
              <Bilgi etiket="Hedef tarih" deger={tarih(t.sayacHedefTarihi)} />
            </div>

            {/* Uyeler */}
            <div className="kart p-5">
              <h2 className="text-sm font-semibold text-clay-800 dark:text-ink-50 mb-3">Üyeler ({t.uyeler.length})</h2>
              {t.uyeler.length === 0 ? (
                <p className="text-sm text-clay-400 dark:text-ink-300 italic">Henüz üye yok (boş tenant).</p>
              ) : (
                <div className="space-y-2">
                  {t.uyeler.map((u) => <UyeSatiri key={u.kullaniciId} u={u} />)}
                </div>
              )}
            </div>

            {/* Yonetici atama (super admin yonetim islemi) */}
            <AdminAtaBolum id={id} />

            <p className="text-[11px] text-clay-400 dark:text-ink-300 text-center italic">Tenant içeriği salt-okunur. Yönetici atama dışındaki düzenlemeler için "Gör" ile tenant'a geçin.</p>
          </div>
        )}
      </div>
    </main>
  );
}

function Bilgi({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div className="kart p-3">
      <p className="text-[11px] uppercase tracking-wider text-clay-400 dark:text-ink-300">{etiket}</p>
      <p className="text-sm font-medium text-clay-900 dark:text-ink-50 mt-0.5 truncate">{deger}</p>
    </div>
  );
}

function UyeSatiri({ u }: { u: IsletmeUye }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-cream-200 dark:border-ink-700/50 last:border-0">
      <div className="h-8 w-8 rounded-full bg-cream-300 dark:bg-ink-700 flex items-center justify-center text-xs font-semibold text-clay-600 dark:text-ink-200 shrink-0">
        {u.adSoyad.slice(0, 1).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-clay-900 dark:text-ink-50 truncate">{u.adSoyad}</p>
        <p className="text-[11px] text-clay-400 dark:text-ink-300 flex items-center gap-1 truncate">
          <Mail className="h-3 w-3 shrink-0" /> {u.email}
        </p>
      </div>
      <div className="text-right shrink-0">
        <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full",
          u.rol === "admin" ? "bg-terracotta/15 text-terracotta" : "bg-cream-300 dark:bg-ink-700 text-clay-500 dark:text-ink-300")}>
          {u.rol === "admin" ? "Yönetici" : "Kullanıcı"}
        </span>
        <p className="text-[10px] text-clay-400 dark:text-ink-300 mt-1 flex items-center gap-1 justify-end">
          <Clock className="h-2.5 w-2.5" /> {u.sonGiris ? tarih(u.sonGiris) : "hiç girmedi"}
        </p>
      </div>
    </div>
  );
}

function AdminAtaBolum({ id }: { id: string }) {
  const qc = useQueryClient();
  const [acik, setAcik] = useState(false);
  const [email, setEmail] = useState("");
  const [ad, setAd] = useState("");
  const [cinsiyet, setCinsiyet] = useState<"kadin" | "erkek">("kadin");

  const ataMut = useMutation({
    mutationFn: () => superAdminIsletmeApi.adminAta(id, { email: email.trim(), adSoyad: ad.trim() || email.trim(), cinsiyet }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-admin-isletme", id] });
      toast.success("Yönetici atandı, davet maili gönderildi");
      setEmail(""); setAd(""); setAcik(false);
    },
    onError: () => toast.error("Yönetici atanamadı (e-posta zaten kayıtlı olabilir)"),
  });

  if (!acik) {
    return (
      <button
        type="button"
        onClick={() => setAcik(true)}
        className="w-full kart p-4 flex items-center justify-center gap-2 text-sm font-medium text-terracotta hover:bg-terracotta/5 transition-colors"
      >
        <UserPlus className="h-4 w-4" /> Yönetici Ata
      </button>
    );
  }

  const inputCls = "w-full rounded-lg border border-cream-300 dark:border-ink-700 bg-cream-50 dark:bg-ink-800 px-3 py-2 text-sm text-clay-900 dark:text-ink-50 placeholder:text-clay-300 dark:placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-terracotta/40";
  const gecerli = email.trim().length > 0;

  return (
    <div className="kart p-5 space-y-3">
      <h2 className="text-sm font-semibold text-clay-800 dark:text-ink-50">Yönetici Ata</h2>
      <div className="space-y-3">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-clay-400 dark:text-ink-300 mb-1 block">E-posta *</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@ornek.com" className={inputCls} />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-clay-400 dark:text-ink-300 mb-1 block">Ad Soyad</label>
          <input value={ad} onChange={(e) => setAd(e.target.value)} placeholder="Ad Soyad" className={inputCls} />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-clay-400 dark:text-ink-300 mb-1 block">Cinsiyet (mail hitabı için)</label>
          <div className="flex gap-2">
            {(["kadin", "erkek"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCinsiyet(c)}
                className={cn(
                  "flex-1 px-3 py-1.5 rounded-lg text-sm border transition-colors",
                  cinsiyet === c
                    ? "border-terracotta bg-terracotta/10 text-terracotta font-medium"
                    : "border-cream-300 dark:border-ink-700 text-clay-500 dark:text-ink-300 hover:border-clay-400"
                )}
              >
                {c === "kadin" ? "Kadın" : "Erkek"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => ataMut.mutate()}
          disabled={!gecerli || ataMut.isPending}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-terracotta px-4 py-2 text-sm font-medium text-white hover:bg-terracotta/90 disabled:opacity-50 transition-colors"
        >
          {ataMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Davet Gönder
        </button>
        <button
          type="button"
          onClick={() => setAcik(false)}
          className="px-4 py-2 text-sm text-clay-500 dark:text-ink-300 hover:text-clay-800 dark:hover:text-ink-100 transition-colors"
        >
          Vazgeç
        </button>
      </div>
    </div>
  );
}
