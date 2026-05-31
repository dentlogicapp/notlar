"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  ChevronLeft, Heart, Loader2, Plus, KeyRound,
  ShieldOff, Trash2, Lock, FileText
} from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { CountdownWidget } from "@/components/CountdownWidget";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { adminApi } from "@/lib/api";
import { tarihFormat, bastari } from "@/lib/utils";
import type { Kullanici } from "@/lib/types";

const schema = z.object({
  email: z.string().email("Geçerli email gir"),
  adSoyad: z.string().min(2, "Ad soyad zorunlu").max(120),
  rol: z.enum(["admin", "kullanici"]),
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
    mutationFn: (id: string) => adminApi.removeUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("Kullanıcı silindi");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <main className="min-h-screen pb-24">
      <CountdownWidget />

      <header className="sticky top-0 z-30 bg-cream-100/85 backdrop-blur-md border-b border-cream-300/60">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-1 text-clay-600 hover:text-clay-900 transition-colors min-w-0">
            <ChevronLeft className="h-5 w-5 shrink-0" />
            <Heart className="h-4 w-4 text-terracotta hidden sm:inline" fill="currentColor" />
            <span className="font-display text-base truncate">Yönetim</span>
          </Link>
          <UserMenu />
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl text-clay-900">Kullanıcılar</h1>
          <div className="flex gap-2">
            <Link href="/admin/denetim">
              <Button variant="outline" size="sm">
                <FileText className="h-4 w-4 mr-1.5" /> Denetim Günlüğü
              </Button>
            </Link>
            <KullaniciEkleDialog />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-clay-400" /></div>
        ) : (
          <div className="kart overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-xs text-clay-500 uppercase tracking-wider bg-cream-100/60">
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
                    onSil={() => { if (confirm(`${u.email} kullanıcısını silmek istediğine emin misin?`)) sil.mutate(u.id); }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function KullaniciSatiri({ u, onSifre, onToggle, onKilit, onSil }: {
  u: Kullanici;
  onSifre: () => void; onToggle: () => void; onKilit: () => void; onSil: () => void;
}) {
  return (
    <tr className="border-t border-cream-300 hover:bg-cream-100/40">
      <td className="py-3 px-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-full bg-clay-800 text-cream-50 flex items-center justify-center text-xs font-medium shrink-0">
            {bastari(u.adSoyad)}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-clay-900 truncate">{u.adSoyad}</p>
            <p className="text-xs text-clay-400 truncate">{u.email}</p>
          </div>
        </div>
      </td>
      <td className="py-3 px-4 hidden sm:table-cell">
        {u.rol === "admin" ? (
          <span className="inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-terracotta/15 text-terracotta-dark font-medium">Yönetici</span>
        ) : (
          <span className="text-xs text-clay-500">Kullanıcı</span>
        )}
      </td>
      <td className="py-3 px-4 hidden md:table-cell">
        <div className="flex flex-wrap gap-1.5">
          {!u.aktif && <span className="text-[10px] px-2 py-0.5 rounded-full bg-clay-100 text-clay-500 uppercase tracking-wider">Pasif</span>}
          {u.kilitli && <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-red-700 uppercase tracking-wider">Kilitli</span>}
          {!u.sifreBelirlendi && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 uppercase tracking-wider">Şifre bekliyor</span>}
          {u.aktif && !u.kilitli && u.sifreBelirlendi && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 uppercase tracking-wider">Aktif</span>
          )}
        </div>
      </td>
      <td className="py-3 px-4 hidden lg:table-cell text-xs text-clay-500">
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
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1.5" /> Yeni Kullanıcı
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
            <Label htmlFor="rol">Rol</Label>
            <select id="rol" {...register("rol")} className="h-11 w-full rounded-xl border border-clay-200 bg-white px-4 text-[15px]">
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
