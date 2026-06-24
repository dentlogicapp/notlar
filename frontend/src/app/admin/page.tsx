"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  ChevronLeft, Loader2, Plus, KeyRound,
  ShieldOff, Trash2, Lock, FileText, AlertTriangle, FolderHeart, FileEdit, Palette, Settings, Sparkles
} from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { CountdownWidget } from "@/components/CountdownWidget";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { adminApi } from "@/lib/api";
import { useBen } from "@/lib/useBen";
import { tarihFormat, bastari } from "@/lib/utils";
import type { Kullanici } from "@/lib/types";

const schema = z.object({
  email: z.string().email("Geçerli email gir"),
  adSoyad: z.string().min(2, "Ad soyad zorunlu").max(120),
  rol: z.enum(["admin", "kullanici"]),
  cinsiyet: z.enum(["kadin", "erkek"], {
    errorMap: () => ({ message: "Cinsiyet seçimi zorunlu" })
  }),
});

export default function Page() {
  return (
    <AuthGuard requireAdmin>
      <Icerik />
    </AuthGuard>
  );
}

function Icerik() {
  const qc = useQueryClient();
  const { data: ben } = useBen();
  const { data: users, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: adminApi.listUsers,
  });

  const sifre = useMutation({
    mutationFn: (id: string) => adminApi.sifreSifirla(id),
    onSuccess: () => toast.success("Sıfırlama maili gönderildi"),
    onError: (err: Error) => toast.error(err.message),
  });

  const toggle = useMutation({
    mutationFn: (id: string) => adminApi.toggleAktif(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const kilit = useMutation({
    mutationFn: (id: string) => adminApi.kilidiAc(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("Kilit kaldırıldı");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const sil = useMutation({
    mutationFn: ({ id, devret }: { id: string; devret: boolean }) =>
      adminApi.removeUser(id, devret),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["notlar"] });
      qc.invalidateQueries({ queryKey: ["klasorler"] });
      toast.success("Kullanıcı silindi 🤍");
      setSilDialogKullanici(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const [silDialogKullanici, setSilDialogKullanici] = useState<Kullanici | null>(null);

  return (
    <main className="min-h-screen pb-24">
      <CountdownWidget />

      <header className="sticky top-0 z-30 bg-cream-100/85 dark:bg-ink-800/85 backdrop-blur-md border-b border-cream-300 dark:border-ink-700/60">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-1 text-clay-600 dark:text-ink-100 hover:text-clay-900 dark:hover:text-ink-50 transition-colors min-w-0">
            <ChevronLeft className="h-5 w-5 shrink-0" />
            <span className="font-display text-base truncate">Yönetim</span>
          </Link>
          <UserMenu />
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl sm:text-3xl text-clay-900 dark:text-ink-50">Kullanıcılar</h1>
          <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:flex-wrap sm:items-center">
            <Link href="/admin/marka" className="w-full sm:w-auto">
              <Button variant="outline" size="sm" className="w-full h-auto min-h-[44px] py-2 whitespace-normal justify-center text-center leading-tight">
                <Palette className="h-4 w-4 mr-1.5" /> Marka & Görünüm
              </Button>
            </Link>
            <Link href="/admin/denetim" className="w-full sm:w-auto">
              <Button variant="outline" size="sm" className="w-full h-auto min-h-[44px] py-2 whitespace-normal justify-center text-center leading-tight">
                <FileText className="h-4 w-4 mr-1.5" /> Denetim Günlüğü
              </Button>
            </Link>
            {ben?.superAdmin && (
              <>
                <Link href="/admin/sistem/sema" className="w-full sm:w-auto">
                  <Button variant="outline" size="sm" className="w-full h-auto min-h-[44px] py-2 whitespace-normal justify-center text-center leading-tight">
                    <Settings className="h-4 w-4 mr-1.5" /> Sistem Şeması
                  </Button>
                </Link>
                <Link href="/admin/sistem/ai-ayarlari" className="w-full sm:w-auto">
                  <Button variant="outline" size="sm" className="w-full h-auto min-h-[44px] py-2 whitespace-normal justify-center text-center leading-tight">
                    <Sparkles className="h-4 w-4 mr-1.5" /> AI Ayarlari
                  </Button>
                </Link>
              </>
            )}
            <div className="col-span-2 sm:w-auto sm:contents">
              <KullaniciEkleDialog />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-clay-400 dark:text-ink-300" /></div>
        ) : (
          <div className="kart overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-xs text-clay-500 dark:text-ink-200 uppercase tracking-wider bg-cream-100/60 dark:bg-ink-800/60">
                <tr>
                  <th className="text-left py-3 px-4 font-medium">Kullanıcı</th>
                  <th className="text-left py-3 px-4 font-medium hidden sm:table-cell">Rol</th>
                  <th className="text-left py-3 px-4 font-medium hidden md:table-cell">Durum</th>
                  <th className="text-left py-3 px-4 font-medium hidden lg:table-cell">Son Giriş</th>
                  <th className="text-right py-3 px-4 font-medium">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {(users ?? []).map((u) => (
                  <KullaniciSatiri
                    key={u.id} u={u}
                    onSifre={() => sifre.mutate(u.id)}
                    onToggle={() => toggle.mutate(u.id)}
                    onKilit={() => kilit.mutate(u.id)}
                    onSil={() => setSilDialogKullanici(u)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* v12 — Devret + Sil dialog'u */}
      {silDialogKullanici && (
        <KullaniciSilDialog
          kullanici={silDialogKullanici}
          onClose={() => setSilDialogKullanici(null)}
          onSil={(devret) => sil.mutate({ id: silDialogKullanici.id, devret })}
          beklemede={sil.isPending}
        />
      )}
    </main>
  );
}

// v19 A2 - tek dominant durum rozeti. Oncelik: Pasif > Kilitli > Sifre bekliyor > Aktif.
// Kullanici gercek anlik durumunu her zaman dogru yansitir (yeni eklenen kullanici sifre belirleyene kadar "Sifre bekliyor").
function durumBilgisi(u: Kullanici): { etiket: string; sinif: string } {
  if (!u.aktif) return { etiket: "Pasif", sinif: "bg-clay-100 text-clay-500 dark:bg-ink-700 dark:text-ink-200" };
  if (u.kilitli) return { etiket: "Kilitli", sinif: "bg-rose-100 text-red-700 dark:bg-rose-900/30 dark:text-rose-300" };
  if (!u.sifreBelirlendi) return { etiket: "Şifre bekliyor", sinif: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" };
  return { etiket: "Aktif", sinif: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" };
}

function KullaniciSatiri({ u, onSifre, onToggle, onKilit, onSil }: {
  u: Kullanici;
  onSifre: () => void; onToggle: () => void; onKilit: () => void; onSil: () => void;
}) {
  const durum = durumBilgisi(u);  // v19 A2 - tek dominant durum
  return (
    <tr className="border-t border-cream-300 dark:border-ink-700 hover:bg-cream-100/40 dark:hover:bg-ink-800/40">
      <td className="py-3 px-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-full bg-clay-800 text-cream-50 flex items-center justify-center text-xs font-medium shrink-0">
            {bastari(u.adSoyad)}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-clay-900 dark:text-ink-50 truncate">{u.adSoyad}</p>
            <p className="text-xs text-clay-400 dark:text-ink-300 truncate">{u.email}</p>
            {/* v19 A2 - durum sutunu mobilde gizli (md:table-cell); burada goster */}
            <span className={`md:hidden inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider ${durum.sinif}`}>{durum.etiket}</span>
          </div>
        </div>
      </td>
      <td className="py-3 px-4 hidden sm:table-cell">
        {u.rol === "admin" ? (
          <span className="inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-terracotta/15 text-terracotta-dark font-medium">Yönetici</span>
        ) : (
          <span className="text-xs text-clay-500 dark:text-ink-200">Kullanıcı</span>
        )}
      </td>
      <td className="py-3 px-4 hidden md:table-cell">
        <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider ${durum.sinif}`}>{durum.etiket}</span>
      </td>
      <td className="py-3 px-4 hidden lg:table-cell text-xs text-clay-500 dark:text-ink-200">
        {u.sonGirisZamani ? tarihFormat(u.sonGirisZamani) : "—"}
      </td>
      <td className="py-3 px-4 text-right">
        <div className="inline-flex gap-0.5">
          <Button variant="ghost" size="sm" onClick={onSifre} title="Şifre sıfırla">
            <KeyRound className="h-4 w-4" />
          </Button>
          {u.kilitli && (
            <Button variant="ghost" size="sm" onClick={onKilit} title="Kilidi aç">
              <Lock className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onToggle} title={u.aktif ? "Pasifleştir" : "Aktifleştir"}>
            <ShieldOff className="h-4 w-4" />
          </Button>
          <Button variant="danger" size="sm" onClick={onSil} title="Sil">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function KullaniciEkleDialog() {
  const qc = useQueryClient();
  const { data: ben } = useBen();
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } =
    useForm<z.infer<typeof schema>>({
      resolver: zodResolver(schema),
      defaultValues: { rol: "kullanici" }
    });

  const m = useMutation({
    mutationFn: (d: z.infer<typeof schema>) => adminApi.createUser(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      reset();
      setOpen(false);
      toast.success("Kullanıcı eklendi · şifre belirleme maili gönderildi");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="w-full h-auto min-h-[44px] py-2 whitespace-normal justify-center text-center leading-tight">
          <Plus className="h-4 w-4 mr-1.5 shrink-0" /> Yeni Kullanıcı
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Yeni Kullanıcı</DialogTitle>
          <DialogDescription>
            Email adresine şifre belirleme bağlantısı gönderilir (24 saat geçerli).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => m.mutate(d))} className="space-y-4">
          <div>
            <Label htmlFor="adSoyad">Ad Soyad</Label>
            <Input id="adSoyad" autoFocus {...register("adSoyad")} />
            {errors.adSoyad && <p className="text-xs text-red-600 mt-1">{errors.adSoyad.message}</p>}
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register("email")} />
            {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <Label htmlFor="cinsiyet">Eşinizin cinsiyeti</Label>
            <select
              id="cinsiyet"
              defaultValue=""
              {...register("cinsiyet")}
              className="h-11 w-full rounded-xl border border-clay-200 bg-white dark:bg-ink-850 px-4 text-[15px] text-clay-900 dark:text-ink-50 focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/15 transition-colors"
            >
              <option value="" disabled>Seç…</option>
              <option value="kadin">Kadın</option>
              <option value="erkek">Erkek</option>
            </select>
            {errors.cinsiyet && <p className="text-xs text-red-600 mt-1">{errors.cinsiyet.message}</p>}
            <p className="text-[11px] text-clay-400 dark:text-ink-300 mt-1.5 italic leading-relaxed">
              Bu bilgi yalnızca ileride kişiselleştirilmiş içerikler için saklanır.
            </p>
          </div>
          <div>
            <Label htmlFor="rol">Rol</Label>
            <select id="rol" {...register("rol")} className="h-11 w-full rounded-xl border border-clay-200 bg-white dark:bg-ink-850 px-4 text-[15px]">
              <option value="kullanici">Kullanıcı</option>
              <option value="admin">Yönetici</option>
            </select>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">İptal</Button>
            </DialogClose>
            <Button type="submit" disabled={m.isPending}>Davet Gönder</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// v12 — Devret + Sil Dialog'u
// Kullanıcının notları/klasörleri varsa "Devret + Sil" veya "Pasifleştir" seç.
// Veri yoksa basit onay → direkt sil.
function KullaniciSilDialog({
  kullanici, onClose, onSil, beklemede
}: {
  kullanici: Kullanici;
  onClose: () => void;
  onSil: (devret: boolean) => void;
  beklemede: boolean;
}) {
  const veriVar = kullanici.notSayisi > 0 || kullanici.klasorSayisi > 0;

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-terracotta" />
            Kullanıcıyı Sil
          </DialogTitle>
          <DialogDescription>
            <strong className="text-clay-900 dark:text-ink-50">{kullanici.adSoyad}</strong> ({kullanici.email})
          </DialogDescription>
        </DialogHeader>

        {veriVar ? (
          <>
            <div className="mt-2 space-y-2">
              <p className="text-sm text-clay-700 dark:text-ink-100">
                Bu kullanıcının aşağıdaki verileri var:
              </p>
              <div className="bg-cream-100/60 dark:bg-ink-800/60 border border-cream-300 dark:border-ink-700 rounded-xl p-3 space-y-1.5">
                {kullanici.notSayisi > 0 && (
                  <div className="flex items-center gap-2 text-sm text-clay-700 dark:text-ink-100">
                    <FileEdit className="h-4 w-4 text-terracotta" />
                    <strong>{kullanici.notSayisi}</strong> not
                  </div>
                )}
                {kullanici.klasorSayisi > 0 && (
                  <div className="flex items-center gap-2 text-sm text-clay-700 dark:text-ink-100">
                    <FolderHeart className="h-4 w-4 text-terracotta" />
                    <strong>{kullanici.klasorSayisi}</strong> klasör
                  </div>
                )}
              </div>
              <p className="text-xs text-clay-500 dark:text-ink-200 italic leading-relaxed">
                Silersen bu veriler senin üzerine devredilir — kaybolmaz. Audit kayıtlarında
                kullanıcı referansları "(Silinmiş kullanıcı)" olarak gösterilir.
              </p>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2 mt-5 sm:justify-end">
              <Button variant="outline" onClick={onClose} disabled={beklemede}>
                İptal
              </Button>
              <Button
                variant="secondary"
                onClick={() => onSil(true)}
                disabled={beklemede}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {beklemede
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Siliniyor</>
                  : <><Trash2 className="h-4 w-4 mr-1.5" /> Verileri Devret + Sil</>}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-clay-700 dark:text-ink-100">
              Bu kullanıcının notu veya klasörü yok. Hesap kalıcı olarak silinecek.
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-2 mt-5 sm:justify-end">
              <Button variant="outline" onClick={onClose} disabled={beklemede}>
                İptal
              </Button>
              <Button
                variant="secondary"
                onClick={() => onSil(false)}
                disabled={beklemede}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {beklemede
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Siliniyor</>
                  : <><Trash2 className="h-4 w-4 mr-1.5" /> Kullanıcıyı Sil</>}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
