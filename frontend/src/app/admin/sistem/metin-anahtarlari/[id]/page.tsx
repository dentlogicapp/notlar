"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ChevronLeft, Heart, Loader2, Save, Archive } from "lucide-react";
import { UserMenu } from "@/components/UserMenu";
import { AiAssist } from "@/components/AiAssist";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { sistemApi } from "@/lib/api";

const TIPLER = ["subject", "body", "baslik", "metin", "placeholder_kisa"] as const;
const KATEGORILER = ["mail", "dashboard", "sayac", "bildirim", "form", "marka"] as const;

const schema = z.object({
  anahtar: z.string().regex(/^[a-z0-9_]+$/, "lowercase snake_case olmali").min(1).max(80),
  etiket: z.string().min(1, "Etiket zorunlu").max(120),
  yonlendirme: z.string().min(1, "Yonlendirme zorunlu").max(500),
  aciklama: z.string().max(1000).optional(),
  tip: z.enum(TIPLER),
  kategori: z.enum(KATEGORILER),
  zorunlu: z.boolean(),
  sira: z.coerce.number().int().min(0).max(9999),
  placeholderMetin: z.string().optional(),
  karakterLimiti: z.coerce.number().int().min(1).max(99999).nullable().optional(),
});
type Form = z.infer<typeof schema>;

const HATA_ALAN: Record<string, keyof Form> = {
  ANAHTAR_FORMATI_GECERSIZ: "anahtar",
  ANAHTAR_BENZERSIZ_DEGIL: "anahtar",
  TIP_GECERSIZ: "tip",
  KATEGORI_GECERSIZ: "kategori",
  PLACEHOLDER_TANIMSIZ: "placeholderMetin",
};

function placeholderlariAyikla(metin?: string): string[] {
  if (!metin) return [];
  return metin.split(/[\s,]+/).map((p) => p.trim()).filter((p) => p.length > 0);
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const yeniMi = id === "yeni";
  const router = useRouter();
  const qc = useQueryClient();

  const { data: mevcut, isLoading } = useQuery({
    queryKey: ["metin-anahtari", id],
    queryFn: () => sistemApi.getAnahtar(id),
    enabled: !yeniMi,
  });

  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { tip: "metin", kategori: "form", zorunlu: false, sira: 100, karakterLimiti: null },
  });
  const { register, handleSubmit, reset, setError, setValue, watch, formState: { errors, isDirty } } = form;

  useEffect(() => {
    if (mevcut) {
      reset({
        anahtar: mevcut.anahtar,
        etiket: mevcut.etiket,
        yonlendirme: mevcut.yonlendirme,
        aciklama: mevcut.aciklama ?? "",
        tip: mevcut.tip as Form["tip"],
        kategori: mevcut.kategori as Form["kategori"],
        zorunlu: mevcut.zorunlu,
        sira: mevcut.sira,
        placeholderMetin: (mevcut.desteklenenPlaceholderlar ?? []).join(", "),
        karakterLimiti: mevcut.karakterLimiti,
      });
    }
  }, [mevcut, reset]);

  function hataIsle(err: Error & { kod?: string }) {
    const alan = err.kod ? HATA_ALAN[err.kod] : undefined;
    if (alan) setError(alan, { message: err.message });
    else toast.error(err.message);
  }

  const kaydet = useMutation({
    mutationFn: (v: Form) => {
      const data = {
        anahtar: v.anahtar.trim(),
        etiket: v.etiket.trim(),
        yonlendirme: v.yonlendirme.trim(),
        aciklama: v.aciklama?.trim() || null,
        tip: v.tip,
        kategori: v.kategori,
        zorunlu: v.zorunlu,
        sira: v.sira,
        desteklenenPlaceholderlar: placeholderlariAyikla(v.placeholderMetin),
        karakterLimiti: v.karakterLimiti ?? null,
      };
      return yeniMi ? sistemApi.createAnahtar(data) : sistemApi.updateAnahtar(id, data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["metin-anahtarlari"] });
      toast.success(yeniMi ? "Anahtar olusturuldu" : "Anahtar guncellendi");
      router.push("/admin/sistem/metin-anahtarlari");
    },
    onError: (err: Error & { kod?: string }) => hataIsle(err),
  });

  const deprecate = useMutation({
    mutationFn: () => sistemApi.deprecateAnahtar(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["metin-anahtarlari"] });
      qc.invalidateQueries({ queryKey: ["metin-anahtari", id] });
      toast.success("Anahtar deprecated olarak isaretlendi");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!yeniMi && isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-clay-400 dark:text-ink-300" />
      </div>
    );
  }

  return (
    <main className="min-h-screen pb-24">
      <header className="sticky top-0 z-30 bg-cream-100/85 dark:bg-ink-800/85 backdrop-blur-md border-b border-cream-300 dark:border-ink-700/60">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link href="/admin/sistem/metin-anahtarlari" className="flex items-center gap-1 text-clay-600 dark:text-ink-100 hover:text-clay-900 dark:hover:text-ink-50 transition-colors min-w-0">
            <ChevronLeft className="h-5 w-5 shrink-0" />
            <Heart className="h-4 w-4 text-terracotta hidden sm:inline" fill="currentColor" />
            <span className="font-display text-base truncate">Metin Anahtarlari</span>
          </Link>
          <UserMenu />
        </div>
      </header>

      <form
        onSubmit={handleSubmit((v) => kaydet.mutate(v))}
        className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-5"
      >
        <h1 className="font-display text-3xl text-clay-900 dark:text-ink-50">
          {yeniMi ? "Yeni Anahtar" : "Anahtar Duzenle"}
        </h1>

        <div className="rounded-lg border border-cream-300 dark:border-ink-700/60 bg-cream-50 dark:bg-ink-900/30 px-3 py-2 text-[12px] text-clay-500 dark:text-ink-300">
          Anahtar adı, tip ve kategori kod sözleşmesidir, değiştirilemez. Buradan dokümantasyon (etiket, yönlendirme, açıklama, sıra, karakter limiti) düzenlersin. Yeni anahtar sürüm (release) ile eklenir.
        </div>

        <div className="space-y-1">
          <Label>Anahtar (sistem kodu)</Label>
          <Input {...register("anahtar")} placeholder="mail_davetiye_konu" disabled className="bg-cream-200/50 dark:bg-ink-900/40 opacity-70" />
          {errors.anahtar && <p className="text-sm text-red-500">{errors.anahtar.message}</p>}
          {!yeniMi && <p className="text-xs text-clay-400 dark:text-ink-300">Mevcut anahtarin kodu degistirilemez.</p>}
        </div>

        <div className="space-y-1">
          <Label>Etiket (UI baslik)</Label>
          <Input {...register("etiket")} placeholder="Davetiye mail konusu" />
          {errors.etiket && <p className="text-sm text-red-500">{errors.etiket.message}</p>}
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Label>Yonlendirme (input placeholder)</Label>
            <AiAssist
              anahtar={watch("anahtar") || ""}
              etiket={watch("etiket")}
              tip={watch("tip")}
              kategori={watch("kategori")}
              mod="dokumantasyon"
              hedefAlan="yonlendirme"
              onTaslakSec={(m) => setValue("yonlendirme", m, { shouldDirty: true, shouldValidate: true })}
            />
          </div>
          <Input {...register("yonlendirme")} placeholder="Orn. Dugunumuze davetlisiniz" />
          {errors.yonlendirme && <p className="text-sm text-red-500">{errors.yonlendirme.message}</p>}
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Label>Aciklama (form alti yardim)</Label>
            <AiAssist
              anahtar={watch("anahtar") || ""}
              etiket={watch("etiket")}
              tip={watch("tip")}
              kategori={watch("kategori")}
              mod="dokumantasyon"
              hedefAlan="aciklama"
              onTaslakSec={(m) => setValue("aciklama", m, { shouldDirty: true })}
            />
          </div>
          <textarea
            {...register("aciklama")}
            rows={2}
            className="w-full rounded-xl border border-cream-300 dark:border-ink-700/60 bg-white/60 dark:bg-ink-800/40 px-3 py-2 text-sm"
            placeholder="Opsiyonel aciklama"
          />
          {errors.aciklama && <p className="text-sm text-red-500">{errors.aciklama.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Tip (değiştirilemez)</Label>
            <select {...register("tip")} disabled className="w-full rounded-xl border border-cream-300 dark:border-ink-700/60 bg-cream-200/50 dark:bg-ink-900/40 px-3 py-2 text-sm opacity-70 cursor-not-allowed">
              {TIPLER.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Kategori (değiştirilemez)</Label>
            <select {...register("kategori")} disabled className="w-full rounded-xl border border-cream-300 dark:border-ink-700/60 bg-cream-200/50 dark:bg-ink-900/40 px-3 py-2 text-sm opacity-70 cursor-not-allowed">
              {KATEGORILER.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 items-end">
          <div className="space-y-1">
            <Label>Sira</Label>
            <Input type="number" {...register("sira")} />
          </div>
          <label className="flex items-center gap-2 pb-2">
            <input type="checkbox" {...register("zorunlu")} className="h-4 w-4" />
            <span className="text-sm text-clay-700 dark:text-ink-100">Onboarding'de zorunlu</span>
          </label>
        </div>

        <div className="space-y-1">
          <Label>Karakter limiti (opsiyonel)</Label>
          <Input
            type="number"
            {...register("karakterLimiti", { setValueAs: (v) => (v === "" || v === null || v === undefined ? null : Number(v)) })}
            placeholder="Boş bırakırsanız tipten gelen değer kullanılır"
          />
          <p className="text-[11px] text-clay-400 dark:text-ink-300">
            Tip varsayılanları: subject 50, baslik 60, metin 200, body 5000, placeholder_kisa 80. Doldurursanız bu değeri geçer.
          </p>
          {errors.karakterLimiti && <p className="text-sm text-red-500">{errors.karakterLimiti.message}</p>}
        </div>

        <div className="space-y-1">
          <Label>Desteklenen placeholder'lar</Label>
          <Input {...register("placeholderMetin")} placeholder="alici_ad, kalan_gun, site_url" />
          {errors.placeholderMetin && <p className="text-sm text-red-500">{errors.placeholderMetin.message}</p>}
          <p className="text-xs text-clay-400 dark:text-ink-300">Virgul veya boslukla ayir. Sistem placeholder'i ya da mevcut anahtar adi olmali.</p>
        </div>

        <div className="flex items-center gap-3 pt-2 flex-wrap">
          <Button type="submit" disabled={kaydet.isPending || (!yeniMi && !isDirty)} className="gap-2">
            {kaydet.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Kaydet
          </Button>

          {!yeniMi && (
            <Button type="button" variant="outline" onClick={() => deprecate.mutate()} disabled={deprecate.isPending || mevcut?.deprecated} className="gap-2">
              <Archive className="h-4 w-4" /> {mevcut?.deprecated ? "Deprecated" : "Deprecate"}
            </Button>
          )}
        </div>
      </form>
    </main>
  );
}