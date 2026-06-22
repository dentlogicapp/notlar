"use client";

import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BookOpen, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useState } from "react";
import { authApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

const schema = z.object({ email: z.string().email("Geçerli email gir") });

export default function Page() {
  const [gonderildi, setGonderildi] = useState(false);
  const { register, handleSubmit, formState: { errors } } =
    useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const m = useMutation({
    mutationFn: (d: z.infer<typeof schema>) => authApi.sifreSifirlaIste(d.email),
    onSuccess: () => { setGonderildi(true); toast.success("Mail kontrol et"); },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-terracotta/15 mb-4">
            <BookOpen className="h-6 w-6 text-terracotta" />
          </div>
          <h1 className="font-display text-3xl text-clay-900 dark:text-ink-50">Şifremi Unuttum</h1>
        </div>

        <div className="kart p-6 sm:p-8 animate-fade-in">
          {gonderildi ? (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-emerald-100 text-emerald-700 mb-3">
                <Mail className="h-5 w-5" />
              </div>
              <p className="text-clay-900 dark:text-ink-50 font-medium">Bağlantı gönderildi</p>
              <p className="text-sm text-clay-500 dark:text-ink-200 mt-1.5 leading-relaxed">
                Eğer hesap mevcutsa, sıfırlama bağlantısı email adresine yollandı. 1 saat geçerli.
              </p>
              <Link href="/giris" className="inline-block mt-4 text-sm text-terracotta hover:underline">
                Giriş sayfasına dön
              </Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-clay-500 dark:text-ink-200 mb-5 leading-relaxed">
                Email adresini gir, sana sıfırlama bağlantısı yollayalım.
              </p>
              <form onSubmit={handleSubmit((d) => m.mutate(d))} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" autoFocus {...register("email")} />
                  {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
                </div>
                <Button type="submit" className="w-full" size="lg" disabled={m.isPending}>
                  {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Bağlantı Gönder"}
                </Button>
              </form>

              <div className="mt-5 text-center">
                <Link href="/giris" className="text-xs text-clay-500 dark:text-ink-200 hover:text-terracotta hover:underline">
                  Giriş sayfasına dön
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
