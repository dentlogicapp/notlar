"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { authApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

const schema = z.object({
  email: z.string().email("Geçerli email gir"),
  sifre: z.string().min(1, "Şifre boş olamaz"),
  beniHatirla: z.boolean().default(true),
});

export default function GirisSayfasi() {
  const router = useRouter();
  const qc = useQueryClient();

  const { register, handleSubmit, formState: { errors } } =
    useForm<z.infer<typeof schema>>({
      resolver: zodResolver(schema),
      defaultValues: { beniHatirla: true },
    });

  const m = useMutation({
    mutationFn: (d: z.infer<typeof schema>) => authApi.giris(d.email, d.sifre, d.beniHatirla),
    onSuccess: (ben) => {
      qc.setQueryData(["ben"], ben);
      toast.success(`Hoş geldin, ${ben.adSoyad.split(" ")[0]}`);

      // v15 — Multi-tenant yönlendirme
      const uyelikSayisi = ben.uyelikler?.length ?? 0;
      if (ben.superAdmin && uyelikSayisi === 0) {
        // v19 — süper admin + hiç tenant üyeliği yok → süper panel
        router.push("/super-admin");
      } else if (uyelikSayisi >= 2) {
        // Çoklu marka → seçici sayfası
        router.push("/tenant-sec");
      } else {
        // 1 üyelik (yaygın durum) → ana sayfa
        router.push("/");
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-terracotta/15 mb-4">
            <BookOpen className="h-6 w-6 text-terracotta" />
          </div>
          <h1 className="font-display text-3xl text-clay-900 dark:text-ink-50">Planlama Defteri</h1>
          <p className="text-clay-500 dark:text-ink-200 mt-1.5 italic text-sm">
            Ekibini Kur, Birlikte Not Al, Planla, Tamamla
          </p>
        </div>

        <div className="kart p-6 sm:p-8 animate-fade-in">
          <form onSubmit={handleSubmit((d) => m.mutate(d))} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" inputMode="email" autoComplete="email" autoFocus {...register("email")} />
              {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <Label htmlFor="sifre">Şifre</Label>
              <Input id="sifre" type="password" autoComplete="current-password" {...register("sifre")} />
              {errors.sifre && <p className="text-xs text-red-600 mt-1">{errors.sifre.message}</p>}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="beniHatirla"
                {...register("beniHatirla")}
                className="h-4 w-4 rounded border-cream-300 dark:border-ink-700 text-terracotta focus:ring-2 focus:ring-terracotta/30 focus:ring-offset-0 accent-terracotta cursor-pointer"
              />
              <label htmlFor="beniHatirla" className="text-sm text-clay-600 dark:text-ink-100 cursor-pointer select-none">
                Beni hatırla
              </label>
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={m.isPending}>
              {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Giriş Yap"}
            </Button>
          </form>

          
        {/* Kurumsal alt-bilgi: hesap yardimi + KVKK kanuni erisim (kimliksiz).
            Dunya deseni (Stripe/Linear/Notion): gizlilik/KVKK login altinda sade footer link. */}
        <div className="mt-6 space-y-2 text-center">
          <p className="text-xs text-clay-400 dark:text-ink-300">
            Hesabın yoksa yöneticinden davet iste.
          </p>
          <p className="text-[11px] text-clay-400 dark:text-ink-300">
            <Link href="/kvkk" className="hover:text-terracotta transition-colors underline underline-offset-2">
              KVKK Aydınlatma Metni
            </Link>
          </p>
        </div>

          <div className="mt-5 text-center">
            <Link href="/sifre-sifirla-iste" className="text-xs text-clay-500 dark:text-ink-200 hover:text-terracotta hover:underline">
              Şifremi unuttum
            </Link>
          </div>
        </div>

      </div>
    </main>
  );
}
