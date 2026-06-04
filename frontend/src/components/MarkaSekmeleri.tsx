"use client";

import type { UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { Heart, Minus, Users, Home, Palmtree, Smile, Briefcase, type LucideIcon } from "lucide-react";
import { Input, Textarea, Label } from "./ui/input";
import { cn } from "@/lib/utils";

// v16 — Marka & Görünüm form şeması.
// G.5 maks uzunluklar (DB kolon) + G.3/G.4 enum kümeleri (ground truth) ENFORCE.
export const markaSchema = z.object({
  markaAdi:          z.string().trim().min(1, "Marka adı zorunlu").max(80, "En fazla 80 karakter"),
  markaEmoji:        z.string().trim().min(1, "Emoji zorunlu").max(10, "En fazla 10 karakter"),
  ikonSeti:          z.enum(["kalp", "klasik", "ekip", "aile", "tatil"]),
  karsilamaBasligi:  z.string().trim().min(1, "Karşılama başlığı zorunlu").max(120, "En fazla 120 karakter"),
  karsilamaAltMetni: z.string().trim().min(1, "Alt metin zorunlu").max(280, "En fazla 280 karakter"),
  sayacAktif:        z.boolean(),
  sayacBasligi:      z.string().trim().min(1, "Sayaç başlığı zorunlu").max(60, "En fazla 60 karakter"),
  sayacHedefTarihi:  z.string().nullable(),
  mailTonu:          z.enum(["samimi", "profesyonel"]),
  mailImza:          z.string().trim().min(1, "İmza zorunlu").max(80, "En fazla 80 karakter"),
});

export type MarkaForm = z.infer<typeof markaSchema>;

type SekmeProps = { form: UseFormReturn<MarkaForm> };

const IKON_SETLERI: { kod: MarkaForm["ikonSeti"]; etiket: string; Ikon: LucideIcon }[] = [
  { kod: "kalp", etiket: "Kalp", Ikon: Heart },
  { kod: "klasik", etiket: "Klasik", Ikon: Minus },
  { kod: "ekip", etiket: "Ekip", Ikon: Users },
  { kod: "aile", etiket: "Aile", Ikon: Home },
  { kod: "tatil", etiket: "Tatil", Ikon: Palmtree },
];

const MAIL_TONLARI: { kod: MarkaForm["mailTonu"]; etiket: string; Ikon: LucideIcon }[] = [
  { kod: "samimi", etiket: "Samimi", Ikon: Smile },
  { kod: "profesyonel", etiket: "Profesyonel", Ikon: Briefcase },
];

function HataMetni({ mesaj }: { mesaj?: string }) {
  if (!mesaj) return null;
  return <p className="text-xs text-red-600 mt-1">{mesaj}</p>;
}

export function MarkaSekmesi({ form }: SekmeProps) {
  const { register, watch, setValue, formState: { errors } } = form;
  const secili = watch("ikonSeti");
  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="markaAdi">Marka Adı</Label>
        <Input id="markaAdi" {...register("markaAdi")} />
        <HataMetni mesaj={errors.markaAdi?.message} />
      </div>
      <div>
        <Label htmlFor="markaEmoji">Marka Emoji</Label>
        <Input id="markaEmoji" className="w-24 text-center text-lg" {...register("markaEmoji")} />
        <HataMetni mesaj={errors.markaEmoji?.message} />
      </div>
      <div>
        <Label>İkon Seti</Label>
        <div className="grid grid-cols-5 gap-2 mt-1">
          {IKON_SETLERI.map((s) => (
            <button
              key={s.kod}
              type="button"
              onClick={() => setValue("ikonSeti", s.kod, { shouldDirty: true, shouldValidate: true })}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border py-3 transition-colors",
                secili === s.kod
                  ? "border-terracotta bg-rose-50 dark:bg-terracotta/10 text-terracotta"
                  : "border-clay-200 text-clay-500 dark:text-ink-200 hover:border-clay-400"
              )}
            >
              <s.Ikon className="h-5 w-5" />
              <span className="text-xs font-medium">{s.etiket}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function KarsilamaSekmesi({ form }: SekmeProps) {
  const { register, formState: { errors } } = form;
  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="karsilamaBasligi">Karşılama Başlığı</Label>
        <Input id="karsilamaBasligi" {...register("karsilamaBasligi")} />
        <HataMetni mesaj={errors.karsilamaBasligi?.message} />
      </div>
      <div>
        <Label htmlFor="karsilamaAltMetni">Karşılama Alt Metni</Label>
        <Textarea id="karsilamaAltMetni" rows={3} {...register("karsilamaAltMetni")} />
        <HataMetni mesaj={errors.karsilamaAltMetni?.message} />
      </div>
    </div>
  );
}

export function SayacSekmesi({ form }: SekmeProps) {
  const { register, watch, setValue, formState: { errors } } = form;
  const sayacAktif = watch("sayacAktif");
  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => setValue("sayacAktif", !sayacAktif, { shouldDirty: true })}
        className="flex items-center gap-3"
      >
        <span
          role="switch"
          aria-checked={sayacAktif}
          className={cn(
            "relative inline-block h-6 w-11 rounded-full transition-colors",
            sayacAktif ? "bg-terracotta" : "bg-clay-300 dark:bg-ink-700"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white dark:bg-ink-850 shadow transition-transform",
              sayacAktif && "translate-x-5"
            )}
          />
        </span>
        <span className="text-sm font-medium text-clay-700 dark:text-ink-100">Geri sayım gösterilsin</span>
      </button>

      <div className={cn("space-y-5 transition-opacity", !sayacAktif && "opacity-50")}>
        <div>
          <Label htmlFor="sayacBasligi">Sayaç Başlığı</Label>
          <Input id="sayacBasligi" disabled={!sayacAktif} {...register("sayacBasligi")} />
          <HataMetni mesaj={errors.sayacBasligi?.message} />
        </div>
        <div>
          <Label htmlFor="sayacHedefTarihi">Hedef Tarih</Label>
          <Input id="sayacHedefTarihi" type="date" disabled={!sayacAktif} {...register("sayacHedefTarihi")} />
          <HataMetni mesaj={errors.sayacHedefTarihi?.message} />
        </div>
      </div>
    </div>
  );
}

export function MailSekmesi({ form }: SekmeProps) {
  const { register, watch, setValue, formState: { errors } } = form;
  const secili = watch("mailTonu");
  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="mailImza">Mail İmza</Label>
        <Input id="mailImza" {...register("mailImza")} />
        <HataMetni mesaj={errors.mailImza?.message} />
      </div>
      <div>
        <Label>Mail Tonu</Label>
        <div className="grid grid-cols-2 gap-2 mt-1">
          {MAIL_TONLARI.map((t) => (
            <button
              key={t.kod}
              type="button"
              onClick={() => setValue("mailTonu", t.kod, { shouldDirty: true, shouldValidate: true })}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border py-3 transition-colors",
                secili === t.kod
                  ? "border-terracotta bg-rose-50 dark:bg-terracotta/10 text-terracotta"
                  : "border-clay-200 text-clay-500 dark:text-ink-200 hover:border-clay-400"
              )}
            >
              <t.Ikon className="h-4 w-4" />
              <span className="text-sm font-medium">{t.etiket}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
