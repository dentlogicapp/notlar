"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ChevronLeft, Heart, Loader2, Save, Plug, CheckCircle2, XCircle } from "lucide-react";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { aiAyarApi } from "@/lib/api";
import { tarihFormat } from "@/lib/utils";

const SAGLAYICILAR = [
  { value: "openai", etiket: "OpenAI", disabled: false },
  { value: "anthropic", etiket: "Anthropic (yakinda)", disabled: true },
  { value: "lokal", etiket: "Lokal LLM (yakinda)", disabled: true },
] as const;

const schema = z.object({
  saglayici: z.enum(["openai", "anthropic", "lokal"]),
  modelId: z.string().min(1, "Model secimi zorunlu"),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  timeoutMs: z.coerce.number().int().min(1000, "En az 1000").max(120000, "En fazla 120000"),
  aktif: z.boolean(),
}).superRefine((v, ctx) => {
  if (v.saglayici === "lokal" && !v.baseUrl?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["baseUrl"], message: "Lokal saglayici icin Base URL zorunlu" });
  }
});
type Form = z.infer<typeof schema>;

const HATA_ALAN: Record<string, keyof Form> = {
  AI_SAGLAYICI_GECERSIZ: "saglayici",
  AI_API_KEY_ZORUNLU: "apiKey",
  AI_BASE_URL_ZORUNLU: "baseUrl",
};

export default function Page() {
  const qc = useQueryClient();

  const { data: ayar, isLoading } = useQuery({
    queryKey: ["ai-ayar"],
    queryFn: aiAyarApi.getAyar,
    retry: false,
  });

  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { saglayici: "openai", modelId: "", apiKey: "", baseUrl: "", timeoutMs: 30000, aktif: false },
  });
  const { register, handleSubmit, reset, watch, setValue, setError, formState: { errors, isDirty } } = form;
  const saglayici = watch("saglayici");

  const { data: modelData } = useQuery({
    queryKey: ["ai-modeller", saglayici],
    queryFn: () => aiAyarApi.modeller(saglayici),
    enabled: !!saglayici,
  });
  const modeller = modelData?.modeller ?? [];

  useEffect(() => {
    if (ayar) {
      reset({
        saglayici: ayar.saglayici as Form["saglayici"],
        modelId: ayar.modelId,
        apiKey: "",
        baseUrl: ayar.baseUrl ?? "",
        timeoutMs: ayar.timeoutMs,
        aktif: ayar.aktif,
      });
    }
  }, [ayar, reset]);

  const kaydet = useMutation({
    mutationFn: (v: Form) => {
      const data = {
        saglayici: v.saglayici,
        modelId: v.modelId,
        apiKey: v.apiKey?.trim() ? v.apiKey.trim() : undefined,
        baseUrl: v.saglayici === "lokal" ? (v.baseUrl?.trim() || null) : null,
        timeoutMs: v.timeoutMs,
        aktif: v.aktif,
      };
      return aiAyarApi.updateAyar(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-ayar"] });
      toast.success("AI ayarlari kaydedildi");
    },
    onError: (err: Error & { kod?: string }) => {
      const alan = err.kod ? HATA_ALAN[err.kod] : undefined;
      if (alan) setError(alan, { message: err.message });
      else toast.error(err.message);
    },
  });

  const test = useMutation({
    mutationFn: aiAyarApi.testAyar,
    onSuccess: (s) => {
      if (s.saglikli) toast.success(`${s.mesaj} (${s.yanitSuresi} ms)`);
      else toast.error(s.mesaj);
      qc.invalidateQueries({ queryKey: ["ai-ayar"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-clay-400 dark:text-ink-300" />
      </div>
    );
  }

  return (
    <main className="min-h-screen pb-24">
      <header className="sticky top-0 z-30 bg-cream-100/85 dark:bg-ink-800/85 backdrop-blur-md border-b border-cream-300 dark:border-ink-700/60">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link href="/admin" className="flex items-center gap-1 text-clay-600 dark:text-ink-100 hover:text-clay-900 dark:hover:text-ink-50 transition-colors min-w-0">
            <ChevronLeft className="h-5 w-5 shrink-0" />
            <Heart className="h-4 w-4 text-terracotta hidden sm:inline" fill="currentColor" />
            <span className="font-display text-base truncate">Sistem</span>
          </Link>
          <UserMenu />
        </div>
      </header>

      <form
        onSubmit={handleSubmit((v) => kaydet.mutate(v))}
        className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-5"
      >
        <div className="flex items-center gap-3">
          <Plug className="h-6 w-6 text-terracotta" />
          <h1 className="font-display text-3xl text-clay-900 dark:text-ink-50">AI Saglayici Ayarlari</h1>
        </div>

        {ayar && (
          <div className="flex items-center gap-2 text-sm">
            {ayar.sonSaglikDurum ? (
              <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" /> Saglikli
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-clay-400 dark:text-ink-300">
                <XCircle className="h-4 w-4" /> Dogrulanmadi
              </span>
            )}
            {ayar.sonSaglikKontrol && (
              <span className="text-clay-400 dark:text-ink-300">son kontrol: {tarihFormat(ayar.sonSaglikKontrol)}</span>
            )}
          </div>
        )}

        <div className="space-y-1">
          <Label>Saglayici</Label>
          <select
            {...register("saglayici")}
            onChange={(e) => { setValue("saglayici", e.target.value as Form["saglayici"], { shouldDirty: true }); setValue("modelId", ""); }}
            className="w-full rounded-xl border border-cream-300 dark:border-ink-700/60 bg-white/60 dark:bg-ink-800/40 px-3 py-2 text-sm"
          >
            {SAGLAYICILAR.map((s) => (
              <option key={s.value} value={s.value} disabled={s.disabled}>{s.etiket}</option>
            ))}
          </select>
          {errors.saglayici && <p className="text-sm text-red-500">{errors.saglayici.message}</p>}
        </div>

        <div className="space-y-1">
          <Label>Model</Label>
          <select {...register("modelId")} className="w-full rounded-xl border border-cream-300 dark:border-ink-700/60 bg-white/60 dark:bg-ink-800/40 px-3 py-2 text-sm">
            <option value="">Model sec...</option>
            {modeller.map((m) => <option key={m.id} value={m.id}>{m.etiket}</option>)}
          </select>
          {errors.modelId && <p className="text-sm text-red-500">{errors.modelId.message}</p>}
        </div>

        <div className="space-y-1">
          <Label>API Anahtari</Label>
          <Input
            type="password"
            {...register("apiKey")}
            placeholder={ayar?.apiKeyMaskeli ?? "sk-..."}
            autoComplete="off"
          />
          {errors.apiKey && <p className="text-sm text-red-500">{errors.apiKey.message}</p>}
          <p className="text-xs text-clay-400 dark:text-ink-300">
            {ayar?.apiKeyMaskeli
              ? "Mevcut anahtar kayitli. Degistirmek icin yeni anahtari yapistir; bos birakirsan korunur."
              : "Henuz anahtar yok. OpenAI API anahtarini yapistir."}
          </p>
        </div>

        {saglayici === "lokal" && (
          <div className="space-y-1">
            <Label>Base URL</Label>
            <Input {...register("baseUrl")} placeholder="http://192.168.1.50:1234/v1" />
            {errors.baseUrl && <p className="text-sm text-red-500">{errors.baseUrl.message}</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 items-end">
          <div className="space-y-1">
            <Label>Timeout (ms)</Label>
            <Input type="number" {...register("timeoutMs")} />
            {errors.timeoutMs && <p className="text-sm text-red-500">{errors.timeoutMs.message}</p>}
          </div>
          <label className="flex items-center gap-2 pb-2">
            <input type="checkbox" {...register("aktif")} className="h-4 w-4" />
            <span className="text-sm text-clay-700 dark:text-ink-100">AI ozelliklerini etkinlestir</span>
          </label>
        </div>

        <div className="flex items-center gap-3 pt-2 flex-wrap">
          <Button type="submit" disabled={kaydet.isPending || !isDirty} className="gap-2">
            {kaydet.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Kaydet
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => test.mutate()}
            disabled={test.isPending}
            className="gap-2"
          >
            {test.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
            Baglantiyi test et
          </Button>
        </div>
        <p className="text-xs text-clay-400 dark:text-ink-300">
          Test, kayitli ayarlari kullanir. Yeni anahtar girdiysen once Kaydet, sonra test et.
        </p>
      </form>
    </main>
  );
}