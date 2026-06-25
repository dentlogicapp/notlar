"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, Loader2, Mail, Clock, UserPlus, FileText, FolderOpen,
  Users, Activity, Gauge, Calendar, ShieldCheck, KeyRound, CircleSlash,
  Pencil, Check,
} from "lucide-react";
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
  if (!iso) return "(boş)";
  try { return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" }); }
  catch { return "(boş)"; }
}

function tarihSaat(iso: string | null): string {
  if (!iso) return "Hiç etkinlik yok";
  try {
    return new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return "Hiç etkinlik yok"; }
}

// Uye durumu - dominant tek rozet (admin/page durumBilgisi ile ayni mantik: Pasif > Sifre bekliyor > Aktif)
function uyeDurumu(u: IsletmeUye): { etiket: string; sinif: string; ikon: typeof ShieldCheck } {
  if (!u.aktif) return { etiket: "Pasif", sinif: "bg-clay-100 text-clay-500 dark:bg-ink-700 dark:text-ink-200", ikon: CircleSlash };
  if (!u.sifreBelirlendi) return { etiket: "Şifre bekliyor", sinif: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400", ikon: KeyRound };
  return { etiket: "Aktif", sinif: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400", ikon: ShieldCheck };
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
            {/* HERO - marka kimligi + saglik + doluluk bar */}
            <div className="kart overflow-hidden">
              <div className="p-6 flex items-start gap-4">
                <span className="text-5xl shrink-0 leading-none">{t.markaEmoji}</span>
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl font-display font-semibold text-clay-900 dark:text-ink-50 leading-tight truncate">{t.markaAdi}</h1>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-cream-300 dark:bg-ink-700 text-clay-600 dark:text-ink-200">
                      {MOD_ETIKET[t.kullanimModu] ?? t.kullanimModu}
                    </span>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1",
                      t.aktif ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400"
                              : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400")}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", t.aktif ? "bg-green-500" : "bg-red-500")} />
                      {t.aktif ? "Aktif" : "Pasif"}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-center">
                  <div className={cn("h-14 w-14 rounded-2xl flex items-center justify-center text-xl font-bold tabular-nums", saglikStili(t.saglikSkoru))}>
                    {t.saglikSkoru}
                  </div>
                  <p className="text-[10px] uppercase tracking-wider text-clay-400 dark:text-ink-300 mt-1">Sağlık</p>
                </div>
              </div>
              <div className="px-6 pb-5">
                <div className="flex items-center justify-between text-[11px] text-clay-400 dark:text-ink-300 mb-1">
                  <span className="uppercase tracking-wider">Kurulum doluluğu</span>
                  <span className="tabular-nums font-medium text-clay-700 dark:text-ink-100">%{t.dolulukYuzde}</span>
                </div>
                <div className="h-2 rounded-full bg-cream-300 dark:bg-ink-700 overflow-hidden">
                  <div className="h-full rounded-full bg-terracotta transition-all" style={{ width: `${t.dolulukYuzde}%` }} />
                </div>
              </div>
            </div>

            {/* ISTATISTIK seridi - canli rakamlar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Istatistik ikon={FileText} etiket="Not" deger={t.notSayisi} />
              <Istatistik ikon={FolderOpen} etiket="Klasör" deger={t.klasorSayisi} />
              <Istatistik ikon={Users} etiket="Üye" deger={t.uyeler.length} />
              <Istatistik ikon={Gauge} etiket="Doluluk" deger={`%${t.dolulukYuzde}`} />
            </div>

            {/* META - olusturma + son aktivite + karsilama + sayac */}
            <div className="kart p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Meta ikon={Calendar} etiket="Oluşturulma" deger={tarih(t.olusturmaZamani)} />
              <Meta ikon={Activity} etiket="Son aktivite" deger={tarihSaat(t.sonAktivite)} />
              <Meta ikon={Mail} etiket="Karşılama başlığı" deger={t.karsilamaBasligi || "(boş)"} />
              <Meta ikon={Clock} etiket="Sayaç" deger={t.sayacAktif ? `${t.sayacBasligi || "Açık"} · ${tarih(t.sayacHedefTarihi)}` : "Kapalı"} />
            </div>

            {/* UYELER - durum rozeti + katki */}
            <div className="kart p-5">
              <h2 className="text-sm font-semibold text-clay-800 dark:text-ink-50 mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-clay-400" /> Üyeler ({t.uyeler.length})
              </h2>
              {t.uyeler.length === 0 ? (
                <p className="text-sm text-clay-400 dark:text-ink-300 italic">Henüz üye yok (boş tenant).</p>
              ) : (
                <div className="space-y-1">
                  {t.uyeler.map((u) => <UyeSatiri key={u.kullaniciId} u={u} tenantId={id} />)}
                </div>
              )}
            </div>

            <AdminAtaBolum id={id} />

            <p className="text-[11px] text-clay-400 dark:text-ink-300 text-center italic">Tenant içeriği salt-okunur. Yönetici atama dışındaki düzenlemeler için "Gör" ile tenant'a geçin.</p>
          </div>
        )}
      </div>
    </main>
  );
}

function Istatistik({ ikon: Ikon, etiket, deger }: { ikon: typeof FileText; etiket: string; deger: number | string }) {
  return (
    <div className="kart p-4">
      <Ikon className="h-4 w-4 text-terracotta mb-2" />
      <p className="text-2xl font-display font-semibold text-clay-900 dark:text-ink-50 tabular-nums leading-none">{deger}</p>
      <p className="text-[11px] uppercase tracking-wider text-clay-400 dark:text-ink-300 mt-1">{etiket}</p>
    </div>
  );
}

function Meta({ ikon: Ikon, etiket, deger }: { ikon: typeof Calendar; etiket: string; deger: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-9 w-9 rounded-lg bg-cream-200 dark:bg-ink-800 flex items-center justify-center shrink-0">
        <Ikon className="h-4 w-4 text-clay-400 dark:text-ink-300" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-clay-400 dark:text-ink-300">{etiket}</p>
        <p className="text-sm font-medium text-clay-900 dark:text-ink-50 mt-0.5 truncate">{deger}</p>
      </div>
    </div>
  );
}

function UyeSatiri({ u, tenantId }: { u: IsletmeUye; tenantId: string }) {
  const qc = useQueryClient();
  const durum = uyeDurumu(u);
  const DurumIkon = durum.ikon;
  const [duzenle, setDuzenle] = useState(false);
  const [adSoyad, setAdSoyad] = useState(u.adSoyad);
  const [cinsiyet, setCinsiyet] = useState<"kadin" | "erkek" | "">(
    (u.cinsiyet as "kadin" | "erkek") ?? ""
  );

  const m = useMutation({
    mutationFn: () => superAdminIsletmeApi.uyeGuncelle(tenantId, u.kullaniciId, { adSoyad: adSoyad.trim(), cinsiyet: cinsiyet as "kadin" | "erkek" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-admin-isletme", tenantId] });
      toast.success("Üye bilgileri güncellendi");
      setDuzenle(false);
    },
    onError: () => toast.error("Üye güncellenemedi"),
  });

  const gecerli = adSoyad.trim().length > 0 && (cinsiyet === "kadin" || cinsiyet === "erkek");

  if (duzenle) {
    return (
      <div className="py-2.5 px-3 rounded-lg bg-cream-100 dark:bg-ink-800/60 space-y-2.5">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={adSoyad}
            autoFocus
            onChange={(e) => setAdSoyad(e.target.value)}
            placeholder="Ad Soyad"
            className="flex-1 rounded-lg border border-cream-300 dark:border-ink-700 bg-white dark:bg-ink-850 px-3 py-1.5 text-sm text-clay-900 dark:text-ink-50 focus:outline-none focus:ring-2 focus:ring-terracotta/40"
          />
          <select
            value={cinsiyet}
            onChange={(e) => setCinsiyet(e.target.value as "kadin" | "erkek" | "")}
            className="rounded-lg border border-cream-300 dark:border-ink-700 bg-white dark:bg-ink-850 px-2 py-1.5 text-sm text-clay-900 dark:text-ink-50 focus:outline-none focus:ring-2 focus:ring-terracotta/40"
          >
            <option value="" disabled>Cinsiyet</option>
            <option value="kadin">Kadın</option>
            <option value="erkek">Erkek</option>
          </select>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-clay-400 dark:text-ink-300 truncate inline-flex items-center gap-1 min-w-0">
            <Mail className="h-3 w-3 shrink-0" /> {u.email} · e-posta değiştirilemez
          </span>
          <div className="flex gap-1.5 shrink-0">
            <button onClick={() => setDuzenle(false)} className="px-2.5 py-1 text-xs text-clay-500 dark:text-ink-300 hover:text-clay-800 dark:hover:text-ink-100 transition-colors">İptal</button>
            <button onClick={() => m.mutate()} disabled={!gecerli || m.isPending} className="px-3 py-1 text-xs rounded-lg bg-terracotta text-white hover:bg-terracotta/90 disabled:opacity-50 inline-flex items-center gap-1 transition-colors">
              {m.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Kaydet
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-cream-100 dark:hover:bg-ink-800/50 transition-colors group">
      <div className="h-9 w-9 rounded-full bg-cream-300 dark:bg-ink-700 flex items-center justify-center text-xs font-semibold text-clay-600 dark:text-ink-200 shrink-0">
        {u.adSoyad.slice(0, 1).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm text-clay-900 dark:text-ink-50 truncate font-medium">{u.adSoyad}</p>
          {u.rol === "admin" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-terracotta/15 text-terracotta font-medium shrink-0">Yönetici</span>
          )}
        </div>
        <p className="text-[11px] text-clay-400 dark:text-ink-300 flex items-center gap-1 truncate mt-0.5">
          <Mail className="h-3 w-3 shrink-0" /> {u.email}
        </p>
        <p className="text-[10px] text-clay-400 dark:text-ink-300 flex items-center gap-2.5 mt-1 flex-wrap">
          <span className="inline-flex items-center gap-1"><FileText className="h-2.5 w-2.5" /> {u.notSayisi} not</span>
          <span className="inline-flex items-center gap-1"><FolderOpen className="h-2.5 w-2.5" /> {u.klasorSayisi} klasör</span>
          <span className="inline-flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> {u.sonGiris ? tarih(u.sonGiris) : "hiç girmedi"}</span>
        </p>
      </div>
      <button
        onClick={() => setDuzenle(true)}
        title="Üyeyi düzenle"
        className="shrink-0 p-1.5 rounded-lg text-clay-400 hover:text-terracotta hover:bg-terracotta/10 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <span className={cn("shrink-0 text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1", durum.sinif)}>
        <DurumIkon className="h-3 w-3" /> {durum.etiket}
      </span>
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
