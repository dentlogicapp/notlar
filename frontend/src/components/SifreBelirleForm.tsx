"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Heart, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { Button } from "./ui/button";
import { Input, Label } from "./ui/input";

const schema = z.object({
  sifre: z.string()
    .min(8, "En az 8 karakter")
    .max(100)
    .regex(/[A-Z]/, "En az 1 büyük harf")
    .regex(/[0-9]/, "En az 1 rakam"),
  tekrar: z.string(),
}).refine((d) => d.sifre === d.tekrar, {
  message: "Şifreler eşleşmiyor",
  path: ["tekrar"],
});

export function SifreBelirleForm({ baslik }: { baslik: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const token = sp.get("token") ?? "";

  const dogrula = useQuery({
    queryKey: ["token", token],
    queryFn: () => authApi.tokenDogrula(token),
    enabled: token.length > 0,
    retry: false,
  });

  const { register, handleSubmit, formState: { errors } } =
    useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const m = useMutation({
    mutationFn: (d: z.infer<typeof schema>) => authApi.sifreBelirle(token, d.sifre),
    onSuccess: () => {
      toast.success("Şifre belirlendi! Şimdi giriş yapabilirsin.");
      setTimeout(() => router.push("/giris"), 1500);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  useEffect(() => {
    if (!token) router.replace("/giris");
  }, [token, router]);

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-terracotta/15 mb-4">
            <Heart className="h-6 w-6 text-terracotta" fill="currentColor" />
          </div>
          <h1 className="font-display text-3xl text-clay-900 dark:text-ink-50">{baslik}</h1>
        </div>

        <div className="kart p-6 sm:p-8 animate-fade-in">
          {dogrula.isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-clay-400 dark:text-ink-300" />
            </div>
          )}

          {dogrula.isError && (
            <div className="text-center py-6">
              <p className="text-clay-700 dark:text-ink-100 font-medium mb-2">Bağlantı geçersiz</p>
              <p className="text-sm text-clay-500 dark:text-ink-200 mb-4">{(dogrula.error as Error).message}</p>
              <Link href="/giris" className="text-terracotta hover:underline text-sm">
                Giriş sayfasına dön
              </Link>
            </div>
          )}

          {dogrula.data && (
            <>
              <div className="mb-5 p-3 bg-cream-200 dark:bg-ink-800 rounded-xl flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 text-terracotta" />
                <div className="text-sm">
                  <span className="text-clay-500 dark:text-ink-200">Hesap: </span>
                  <span className="text-clay-900 dark:text-ink-50 font-medium">{dogrula.data.email}</span>
                </div>
              </div>

              <form onSubmit={handleSubmit((d) => m.mutate(d))} className="space-y-4">
                <div>
                  <Label htmlFor="sifre">Yeni Şifre</Label>
                  <Input id="sifre" type="password" autoFocus autoComplete="new-password" {...register("sifre")} />
                  {errors.sifre && <p className="text-xs text-red-600 mt-1">{errors.sifre.message}</p>}
                </div>
                <div>
                  <Label htmlFor="tekrar">Şifreyi Tekrar</Label>
                  <Input id="tekrar" type="password" autoComplete="new-password" {...register("tekrar")} />
                  {errors.tekrar && <p className="text-xs text-red-600 mt-1">{errors.tekrar.message}</p>}
                </div>

                <p className="text-xs text-clay-500 dark:text-ink-200 italic">
                  En az 8 karakter, 1 büyük harf, 1 rakam.
                </p>

                <Button type="submit" className="w-full" size="lg" disabled={m.isPending}>
                  {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Kaydet"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
