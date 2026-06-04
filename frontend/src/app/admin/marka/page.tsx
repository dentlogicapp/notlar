"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft, Heart, Loader2, Palette, Save } from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/AuthGuard";
import { CountdownWidget } from "@/components/CountdownWidget";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import { useIsletme } from "@/lib/useIsletme";
import { isletmeApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  markaSchema, type MarkaForm,
  MarkaSekmesi, KarsilamaSekmesi, SayacSekmesi, MailSekmesi,
} from "@/components/MarkaSekmeleri";
import {
  MarkaOnizleme, KarsilamaOnizleme, SayacOnizleme, MailOnizleme,
} from "@/components/MarkaOnizleme";

type Sekme = "marka" | "karsilama" | "sayac" | "mail";

const SEKMELER: { kod: Sekme; etiket: string }[] = [
  { kod: "marka", etiket: "Marka" },
  { kod: "karsilama", etiket: "Karşılama" },
  { kod: "sayac", etiket: "Sayaç" },
  { kod: "mail", etiket: "Mail" },
];

const HATA_ALAN = {
  MARKA_ADI_GECERSIZ: "markaAdi",
  MARKA_EMOJI_GECERSIZ: "markaEmoji",
  IKON_SETI_GECERSIZ: "ikonSeti",
  KARSILAMA_BASLIGI_GECERSIZ: "karsilamaBasligi",
  KARSILAMA_ALT_METNI_GECERSIZ: "karsilamaAltMetni",
  SAYAC_BASLIGI_GECERSIZ: "sayacBasligi",
  MAIL_IMZA_GECERSIZ: "mailImza",
  MAIL_TONU_GECERSIZ: "mailTonu",
} as const;

export default function Page() {
  return (
    <AuthGuard requireAdmin>
      <Icerik />
    </AuthGuard>
  );
}

function Icerik() {
  const qc = useQueryClient();
  const { data: isletme, isLoading } = useIsletme();
  const [sekme, setSekme] = useState<Sekme>("marka");

  const form = useForm<MarkaForm>({ resolver: zodResolver(markaSchema), defaultValues: {} });
  const { handleSubmit, reset, watch, formState: { isDirty } } = form;
  const d = watch();

  useEffect(() => {
    if (isletme) {
      reset({
        markaAdi: isletme.markaAdi,
        markaEmoji: isletme.markaEmoji,
        ikonSeti: isletme.ikonSeti as MarkaForm["ikonSeti"],
        karsilamaBasligi: isletme.karsilamaBasligi,
        karsilamaAltMetni: isletme.karsilamaAltMetni,
        sayacAktif: isletme.sayacAktif,
        sayacBasligi: isletme.sayacBasligi,
        sayacHedefTarihi: isletme.sayacHedefTarihi?.slice(0, 10) ?? null,
        mailTonu: isletme.mailTonu as MarkaForm["mailTonu"],
        mailImza: isletme.mailImza,
      });
    }
  }, [isletme, reset]);

  const kaydet = useMutation({
    mutationFn: (girdi: MarkaForm) => isletmeApi.aktifGuncelle(girdi),
    onSuccess: (yeni) => {
      qc.invalidateQueries({ queryKey: ["isletme-aktif"] });
      reset({
        markaAdi: yeni.markaAdi,
        markaEmoji: yeni.markaEmoji,
        ikonSeti: yeni.ikonSeti as MarkaForm["ikonSeti"],
        karsilamaBasligi: yeni.karsilamaBasligi,
        karsilamaAltMetni: yeni.karsilamaAltMetni,
        sayacAktif: yeni.sayacAktif,
        sayacBasligi: yeni.sayacBasligi,
        sayacHedefTarihi: yeni.sayacHedefTarihi?.slice(0, 10) ?? null,
        mailTonu: yeni.mailTonu as MarkaForm["mailTonu"],
        mailImza: yeni.mailImza,
      });
      toast.success("Marka ayarların güncellendi 🤍");
    },
    onError: (err: Error & { kod?: string }) => {
      const alan = err.kod ? HATA_ALAN[err.kod as keyof typeof HATA_ALAN] : undefined;
      if (alan) form.setError(alan, { message: err.message });
      else toast.error(err.message);
    },
  });

  if (isLoading || !isletme) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-clay-400 dark:text-ink-300" />
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-24">
      <CountdownWidget />

      <header className="sticky top-0 z-30 bg-cream-100/85 dark:bg-ink-800/85 backdrop-blur-md border-b border-cream-300 dark:border-ink-700/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link href="/admin" className="flex items-center gap-1 text-clay-600 dark:text-ink-100 hover:text-clay-900 dark:hover:text-ink-50 transition-colors min-w-0">
            <ChevronLeft className="h-5 w-5 shrink-0" />
            <Heart className="h-4 w-4 text-terracotta hidden sm:inline" fill="currentColor" />
            <span className="font-display text-base truncate">Marka &amp; Görünüm</span>
          </Link>
          <UserMenu />
        </div>
      </header>

      <form onSubmit={handleSubmit((girdi) => kaydet.mutate(girdi))}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
          <div className="flex items-center gap-3">
            <Palette className="h-6 w-6 text-terracotta" />
            <h1 className="font-display text-3xl text-clay-900 dark:text-ink-50">Marka &amp; Görünüm</h1>
          </div>

          <div className="flex gap-1 border-b border-cream-300 dark:border-ink-700/60">
            {SEKMELER.map((s) => (
              <button
                key={s.kod}
                type="button"
                onClick={() => setSekme(s.kod)}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                  sekme === s.kod
                    ? "border-terracotta text-terracotta"
                    : "border-transparent text-clay-500 dark:text-ink-200 hover:text-clay-800 dark:hover:text-ink-50"
                )}
              >
                {s.etiket}
              </button>
            ))}
          </div>

          {/* Sol: form alanlari · Sag: canli onizleme (lg+ iki kolon, mobilde alt alta) */}
          <div className="grid lg:grid-cols-[1fr_minmax(0,400px)] gap-6">
            <div className="kart p-6 min-h-[200px]">
              {sekme === "marka" && <MarkaSekmesi form={form} />}
              {sekme === "karsilama" && <KarsilamaSekmesi form={form} />}
              {sekme === "sayac" && <SayacSekmesi form={form} />}
              {sekme === "mail" && <MailSekmesi form={form} />}
            </div>

            <aside className="lg:sticky lg:top-24 self-start">
              <p className="text-xs italic text-clay-400 dark:text-ink-300 mb-2">Önizleme</p>
              <div className="kart p-5">
                {sekme === "marka" && <MarkaOnizleme markaAdi={d.markaAdi} markaEmoji={d.markaEmoji} ikonSeti={d.ikonSeti} />}
                {sekme === "karsilama" && <KarsilamaOnizleme karsilamaBasligi={d.karsilamaBasligi} karsilamaAltMetni={d.karsilamaAltMetni} />}
                {sekme === "sayac" && <SayacOnizleme sayacAktif={d.sayacAktif} sayacBasligi={d.sayacBasligi} sayacHedefTarihi={d.sayacHedefTarihi} />}
                {sekme === "mail" && <MailOnizleme mailImza={d.mailImza} mailTonu={d.mailTonu} />}
              </div>
            </aside>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 z-30 bg-cream-100/90 dark:bg-ink-800/90 backdrop-blur-md border-t border-cream-300 dark:border-ink-700/60">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-end gap-3">
            <Button type="submit" disabled={!isDirty || kaydet.isPending}>
              {kaydet.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><Save className="h-4 w-4 mr-1.5" /> Kaydet</>)}
            </Button>
          </div>
        </div>
      </form>
    </main>
  );
}
