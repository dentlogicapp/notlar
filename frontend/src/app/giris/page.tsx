"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Heart, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { authApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

const schema = z.object({
  email: z.string().email("Geçerli email gir"),
  sifre: z.string().min(1, "Şifre boş olamaz"),
});

export default function GirisSayfasi() {
  const router = useRouter();
  const qc = useQueryClient();

  const { register, handleSubmit, formState: { errors } } =
    useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const m = useMutation({
    mutationFn: (d: z.infer<typeof schema>) => authApi.giris(d.email, d.sifre),
    onSuccess: (ben) => {
      qc.setQueryData(["ben"], ben);
      toast.success(`Hoş geldin, ${ben.adSoyad.split(" ")[0]} 🤍`);
      router.push("/");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-terracotta/15 mb-4">
            <Heart className="h-6 w-6 text-terracotta animate-heart-beat" fill="currentColor" />
          </div>
          <h1 className="font-display text-3xl text-clay-900">Görev Defteri</h1>
          <p className="text-clay-500 mt-1.5 italic text-sm">
            Birlikte yapılacaklar, birlikte tamamlanacaklar
          </p>
        </div>

        <div className="kart p-6 sm:p-8 animate-fade-in">
          <form onSubmit={handleSubmit((d) => m.mutate(d))} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" autoFocus {...register("email")} />
              {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <Label htmlFor="sifre">Şifre</Label>
              <Input id="sifre" type="password" autoComplete="current-password" {...register("sifre")} />
              {errors.sifre && <p className="text-xs text-red-600 mt-1">{errors.sifre.message}</p>}
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={m.isPending}>
              {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Giriş Yap"}
            </Button>
          </form>

          <div className="mt-5 text-center">
            <Link href="/sifre-sifirla-iste" className="text-xs text-clay-500 hover:text-terracotta hover:underline">
              Şifremi unuttum
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-clay-400 mt-6">
          Hesabın yoksa yöneticinden davet iste.
        </p>
      </div>
    </main>
  );
}
