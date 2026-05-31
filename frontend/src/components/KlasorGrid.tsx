"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import Link from "next/link";
import {
  Folder, FolderHeart, Plus, Heart, Sparkles, Calendar, Gem, Cake, Bell
} from "lucide-react";
import { klasorApi } from "@/lib/api";
import { Button } from "./ui/button";
import { Input, Label } from "./ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogTrigger, DialogClose
} from "./ui/dialog";
import { cn } from "@/lib/utils";

const ikonlar: Record<string, React.ComponentType<{ className?: string }>> = {
  klasor: Folder,
  kalp: FolderHeart,
  kalp_dolu: Heart,
  yildiz: Sparkles,
  takvim: Calendar,
  yuzuk: Gem,
  pasta: Cake,
  bildirim: Bell,
};

export function IkonGoster({ ad, className }: { ad: string; className?: string }) {
  const I = ikonlar[ad] ?? Folder;
  return <I className={className} />;
}

const schema = z.object({
  ad: z.string().min(1, "Ad zorunlu").max(120),
  aciklama: z.string().max(500).optional(),
  ikon: z.string(),
});

export function YeniKlasorButonu({ compact }: { compact?: boolean } = {}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, reset, formState: { errors }, watch, setValue } =
    useForm<z.infer<typeof schema>>({
      resolver: zodResolver(schema),
      defaultValues: { ad: "", aciklama: "", ikon: "klasor" }
    });

  const m = useMutation({
    mutationFn: (d: z.infer<typeof schema>) =>
      klasorApi.create({ ...d, ustKlasorId: null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["klasorler"] });
      reset();
      setOpen(false);
      toast.success("Klasör eklendi");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const secilenIkon = watch("ikon");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {compact ? (
          <button className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border border-dashed border-clay-200 hover:border-terracotta hover:bg-rose-50/40 transition-colors text-clay-400 hover:text-terracotta group">
            <div className="h-8 w-8 rounded-lg border border-dashed border-clay-200 group-hover:border-terracotta flex items-center justify-center transition-colors shrink-0">
              <Plus className="h-4 w-4" />
            </div>
            <span className="text-sm">Yeni klasör</span>
          </button>
        ) : (
          <button className="group h-full min-h-[140px] flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-clay-200 hover:border-terracotta hover:bg-rose-50/30 transition-all cursor-pointer">
            <Plus className="h-7 w-7 text-clay-400 group-hover:text-terracotta transition-colors" />
            <span className="text-sm text-clay-500 group-hover:text-terracotta transition-colors">Yeni klasör</span>
          </button>
        )}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Yeni Klasör</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => m.mutate(d))} className="space-y-4">
          <div>
            <Label htmlFor="ad">Ad</Label>
            <Input id="ad" autoFocus placeholder="Örn. Düğün Hazırlığı" {...register("ad")} />
            {errors.ad && <p className="text-xs text-red-600 mt-1">{errors.ad.message}</p>}
          </div>
          <div>
            <Label htmlFor="aciklama">Açıklama (isteğe bağlı)</Label>
            <Input id="aciklama" placeholder="Bu klasörde neler olacak?" {...register("aciklama")} />
          </div>
          <div>
            <Label>İkon</Label>
            <div className="grid grid-cols-8 gap-2 mt-1">
              {Object.keys(ikonlar).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setValue("ikon", k)}
                  className={cn(
                    "h-10 rounded-lg border flex items-center justify-center transition-colors",
                    secilenIkon === k
                      ? "border-terracotta bg-rose-50 text-terracotta"
                      : "border-clay-200 text-clay-500 hover:border-clay-400"
                  )}
                >
                  <IkonGoster ad={k} className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">İptal</Button>
            </DialogClose>
            <Button type="submit" disabled={m.isPending}>Ekle</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Sol panel klasör listesi — flat (tek seviye), kompakt, ikon + ad.
 * `aktifId` verilirse o klasör highlight'lanır.
 */
export function KlasorListesi({ aktifId }: { aktifId?: string | null } = {}) {
  const { data, isLoading } = useQuery({
    queryKey: ["klasorler"],
    queryFn: klasorApi.list,
  });

  // Flat — tüm klasörler (zaten artık alt klasör oluşturulmuyor)
  const klasorler = data ?? [];

  return (
    <aside className="kart p-3 sm:p-4 self-start md:sticky md:top-24">
      <h3 className="font-display text-sm text-clay-500 px-2 mb-3 uppercase tracking-[0.15em] flex items-center gap-2">
        <FolderHeart className="h-4 w-4 text-terracotta" />
        Klasörler
      </h3>
      <nav className="space-y-1">
        {isLoading && (
          <div className="px-2.5 py-2 text-xs text-clay-400">Yükleniyor...</div>
        )}
        {!isLoading && klasorler.length === 0 && (
          <p className="px-2.5 py-2 text-xs text-clay-400 italic">Henüz klasör yok</p>
        )}
        {klasorler.map((k) => {
          const aktif = aktifId === k.id;
          return (
            <Link
              key={k.id}
              href={`/klasor/${k.id}`}
              className={cn(
                "flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors group",
                aktif
                  ? "bg-terracotta/12 text-clay-900"
                  : "hover:bg-cream-200"
              )}
            >
              <div className={cn(
                "h-8 w-8 rounded-lg flex items-center justify-center transition-colors shrink-0",
                aktif
                  ? "bg-terracotta text-cream-50"
                  : "bg-cream-100 text-terracotta group-hover:bg-rose-100"
              )}>
                <IkonGoster ad={k.ikon} className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn(
                  "text-sm truncate leading-tight",
                  aktif ? "text-clay-900 font-medium" : "text-clay-900"
                )}>{k.ad}</p>
                <p className="text-[11px] text-clay-400 mt-0.5">
                  {k.notSayisi > 0 ? `${k.notSayisi} not` : "boş"}
                </p>
              </div>
            </Link>
          );
        })}
        <div className="pt-1">
          <YeniKlasorButonu compact />
        </div>
      </nav>
    </aside>
  );
}
