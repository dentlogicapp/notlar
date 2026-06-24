"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import Link from "next/link";
import {
  Folder, FolderHeart, Plus, Heart, Sparkles, Calendar, Gem, Cake, Bell,
  Pencil, Trash2, AlertTriangle, Loader2, Lock, CheckCircle
} from "lucide-react";
import { klasorApi } from "@/lib/api";
import { useEditLock } from "@/lib/useEditLock";
import { Button } from "./ui/button";
import { Input, Label } from "./ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogTrigger, DialogClose
} from "./ui/dialog";
import { cn } from "@/lib/utils";
import type { Klasor } from "@/lib/types";

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
          <button className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border border-dashed border-clay-200 hover:border-terracotta hover:bg-rose-50/40 transition-colors text-clay-400 dark:text-ink-300 hover:text-terracotta group">
            <div className="h-8 w-8 rounded-lg border border-dashed border-clay-200 group-hover:border-terracotta flex items-center justify-center transition-colors shrink-0">
              <Plus className="h-4 w-4" />
            </div>
            <span className="text-sm">Yeni klasör</span>
          </button>
        ) : (
          <button className="group h-full min-h-[140px] flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-clay-200 hover:border-terracotta hover:bg-rose-50/30 transition-all cursor-pointer">
            <Plus className="h-7 w-7 text-clay-400 dark:text-ink-300 group-hover:text-terracotta transition-colors" />
            <span className="text-sm text-clay-500 dark:text-ink-200 group-hover:text-terracotta transition-colors">Yeni klasör</span>
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
            <Input id="ad" autoFocus placeholder="Örn. Projeler" {...register("ad")} />
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
                      : "border-clay-200 text-clay-500 dark:text-ink-200 hover:border-clay-400"
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
 * Klasör Düzenleme Dialog — ad, açıklama, ikon güncellenir.
 * (Yeni Klasör formuyla aynı yapı, sadece initial değerler ve mutation farklı.)
 */
export function KlasorDuzenleDialog({
  klasor, open, onOpenChange
}: { klasor: Klasor; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const lock = useEditLock("klasor", klasor.id, open);

  useEffect(() => {
    if (open && lock.kilitSahibi) {
      toast.error(`${lock.kilitSahibi} şu anda bu klasörü düzenliyor. Lütfen birkaç saniye sonra tekrar dene 🤍`);
      onOpenChange(false);
    }
  }, [open, lock.kilitSahibi, onOpenChange]);

  const { register, handleSubmit, reset, formState: { errors }, watch, setValue } =
    useForm<z.infer<typeof schema>>({
      resolver: zodResolver(schema),
      defaultValues: {
        ad: klasor.ad,
        aciklama: klasor.aciklama ?? "",
        ikon: klasor.ikon
      }
    });

  const m = useMutation({
    mutationFn: (d: z.infer<typeof schema>) =>
      klasorApi.update(klasor.id, { ad: d.ad, aciklama: d.aciklama ?? null, ikon: d.ikon }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["klasorler"] });
      qc.invalidateQueries({ queryKey: ["notlar"] });
      reset();
      onOpenChange(false);
      toast.success("Klasör güncellendi");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const secilenIkon = watch("ikon");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Klasörü Düzenle</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => m.mutate(d))} className="space-y-4">
          <div>
            <Label htmlFor="duzenle-ad">Ad</Label>
            <Input id="duzenle-ad" autoFocus {...register("ad")} />
            {errors.ad && <p className="text-xs text-red-600 mt-1">{errors.ad.message}</p>}
          </div>
          <div>
            <Label htmlFor="duzenle-aciklama">Açıklama (isteğe bağlı)</Label>
            <Input id="duzenle-aciklama" placeholder="Bu klasörde neler olacak?" {...register("aciklama")} />
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
                      : "border-clay-200 text-clay-500 dark:text-ink-200 hover:border-clay-400"
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
            <Button type="submit" disabled={m.isPending}>Kaydet</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Klasör Sil Dialog — içerik özeti çekilir, kullanıcıya detaylı bilgi verilir.
 * Boş klasör: basit onay.
 * Dolu klasör: notların "kategorize edilmemiş"e taşınacağı uyarısı + bilgilendirme.
 */
export function KlasorSilDialog({
  klasor, open, onOpenChange
}: { klasor: Klasor; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();

  // İçerik özetini dialog açılınca çek
  const { data: ozet, isLoading: ozetYukleniyor } = useQuery({
    queryKey: ["klasor-icerik-ozeti", klasor.id],
    queryFn: () => klasorApi.icerikOzeti(klasor.id),
    enabled: open,
    staleTime: 0,
  });

  const sil = useMutation({
    mutationFn: () => klasorApi.remove(klasor.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["klasorler"] });
      qc.invalidateQueries({ queryKey: ["notlar"] });
      onOpenChange(false);
      const tasinan = ozet?.toplamNot ?? 0;
      toast.success(
        tasinan > 0
          ? `Klasör silindi. ${tasinan} not kategorize edilmemiş notlara taşındı.`
          : "Klasör silindi."
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const dolu = (ozet?.toplamNot ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-terracotta" />
            Klasörü Sil
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-clay-900 dark:text-ink-50">{klasor.ad}</span> klasörünü silmek üzeresin.
          </DialogDescription>
        </DialogHeader>

        {ozetYukleniyor && (
          <div className="flex items-center justify-center py-6 text-clay-400 dark:text-ink-300">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <span className="text-sm">İçerik kontrol ediliyor...</span>
          </div>
        )}

        {!ozetYukleniyor && ozet && (
          <>
            {dolu ? (
              <div className="space-y-3">
                {/* Uyarı bloğu */}
                <div className="p-3 bg-amber-50 border-l-4 border-amber-400 rounded-r-lg">
                  <p className="text-sm text-amber-900 leading-relaxed">
                    Silmeye çalıştığınız klasör içerisinde{" "}
                    <span className="font-semibold">{ozet.toplamNot} not</span> bulunmaktadır.
                    Silme işlemini onaylamanız hâlinde bu notlar klasörden bağımsız olarak{" "}
                    <span className="font-semibold">kategorize edilmemiş notlar</span> olarak yeniden sınıflandırılacaktır.
                  </p>
                </div>

                {/* Detay listesi */}
                <div className="rounded-lg border border-cream-300 dark:border-ink-700 divide-y divide-cream-200">
                  {ozet.bekleyenNot > 0 && (
                    <div className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="text-clay-600 dark:text-ink-100">Bekleyen not</span>
                      <span className="font-medium text-clay-900 dark:text-ink-50 tabular-nums">{ozet.bekleyenNot}</span>
                    </div>
                  )}
                  {ozet.tamamlananNot > 0 && (
                    <div className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="text-clay-600 dark:text-ink-100">Tamamlanan not</span>
                      <span className="font-medium text-clay-900 dark:text-ink-50 tabular-nums">{ozet.tamamlananNot}</span>
                    </div>
                  )}
                  {ozet.silinmisNot > 0 && (
                    <div className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="text-clay-600 dark:text-ink-100">Çöp kutusundaki not</span>
                      <span className="font-medium text-clay-900 dark:text-ink-50 tabular-nums">{ozet.silinmisNot}</span>
                    </div>
                  )}
                </div>

                <p className="text-xs text-clay-500 dark:text-ink-200 italic leading-relaxed">
                  Not: Klasör silindiğinde notlar silinmez, sadece klasör bağı kaldırılır.
                  Aynı içerikler “Tüm Notlar” altında görünmeye devam eder.
                </p>
              </div>
            ) : (
              <div className="p-3 bg-cream-100 dark:bg-ink-800/60 border border-cream-300 dark:border-ink-700 rounded-lg">
                <p className="text-sm text-clay-700 dark:text-ink-100">
                  Bu klasör boş. Silme işlemi geri alınamaz, ancak içerikte hiçbir not etkilenmeyecek.
                </p>
              </div>
            )}
          </>
        )}

        <div className="flex gap-2 justify-end pt-2">
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={sil.isPending}>İptal</Button>
          </DialogClose>
          <Button
            type="button"
            variant="danger"
            onClick={() => sil.mutate()}
            disabled={sil.isPending || ozetYukleniyor}
          >
            {sil.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Siliniyor</>
            ) : dolu ? "Onayla ve Sil" : "Sil"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Sol panel klasör listesi — flat (tek seviye), kompakt, ikon + ad + düzenle/sil.
 * `aktifId` verilirse o klasör highlight'lanır.
 */
export function KlasorListesi({ aktifId }: { aktifId?: string | null } = {}) {
  const { data, isLoading } = useQuery({
    queryKey: ["klasorler"],
    queryFn: klasorApi.list,
    refetchInterval: 60_000, // 60 saniye — klasör değişiklikleri yavaş
  });

  const klasorler = data ?? [];
  const normal = klasorler.filter(k => !k.sistemMi);
  const sistem = klasorler.filter(k => k.sistemMi);

  return (
    <aside className="kart p-3 sm:p-4 self-start md:sticky md:top-24">
      <h3 className="font-display text-sm text-clay-500 dark:text-ink-200 px-2 mb-3 uppercase tracking-[0.15em] flex items-center gap-2">
        <FolderHeart className="h-4 w-4 text-terracotta" />
        Klasörler
      </h3>
      <nav className="space-y-1">
        {isLoading && (
          <div className="px-2.5 py-2 text-xs text-clay-400 dark:text-ink-300">Yükleniyor...</div>
        )}
        {!isLoading && klasorler.length === 0 && (
          <p className="px-2.5 py-2 text-xs text-clay-400 dark:text-ink-300 italic">Henüz klasör yok</p>
        )}
        {normal.map((k) => (
          <KlasorSatiri key={k.id} klasor={k} aktif={aktifId === k.id} />
        ))}
        <div className="pt-1">
          <YeniKlasorButonu compact />
        </div>

        {/* Sistem klasörleri (Tamamlananlar) — ayraç çizgisi ile en altta */}
        {sistem.length > 0 && (
          <>
            <div className="my-3 mx-2 border-t border-cream-300 dark:border-ink-700/70" />
            {sistem.map((k) => (
              <KlasorSatiri key={k.id} klasor={k} aktif={aktifId === k.id} />
            ))}
          </>
        )}
      </nav>
    </aside>
  );
}

/**
 * Tek klasör satırı — Link + sağda düzenle/sil aksiyon ikonları
 * (mobilde her zaman görünür, desktop'ta hover'da daha belirgin).
 */
function KlasorSatiri({ klasor, aktif }: { klasor: Klasor; aktif: boolean }) {
  const [duzenleAcik, setDuzenleAcik] = useState(false);
  const [silAcik, setSilAcik] = useState(false);

  const sistemMi = klasor.sistemMi;
  const kilitli = !!klasor.kilitSahibiAdi;

  return (
    <>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-lg transition-colors",
          aktif ? "bg-terracotta/12" : "hover:bg-cream-200 dark:hover:bg-ink-800",
          sistemMi && !aktif && "bg-cream-50 dark:bg-ink-900/50"
        )}
      >
        {/* Klasör linki — alan büyük çoğunlukla bu */}
        <Link
          href={`/klasor/${klasor.id}`}
          className="flex items-center gap-2.5 px-2.5 py-2 flex-1 min-w-0"
        >
          <div className={cn(
            "h-8 w-8 rounded-lg flex items-center justify-center transition-colors shrink-0",
            aktif
              ? "bg-terracotta text-cream-50"
              : sistemMi
                ? "bg-terracotta/15 text-terracotta"
                : "bg-cream-100 dark:bg-ink-800/60 text-terracotta group-hover:bg-rose-100"
          )}>
            <IkonGoster ad={klasor.ikon} className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className={cn(
              "text-sm truncate leading-tight flex items-center gap-1.5",
              aktif ? "text-clay-900 dark:text-ink-50 font-medium" : "text-clay-900 dark:text-ink-50"
            )}>
              {klasor.ad}
              {sistemMi && (
                <span className="text-[9px] uppercase tracking-wider text-terracotta/70 font-medium">sistem</span>
              )}
            </p>
            <p className="text-[11px] text-clay-400 dark:text-ink-300 mt-0.5">
              {kilitli
                ? <span className="text-terracotta inline-flex items-center gap-1"><Lock className="h-2.5 w-2.5" /> Düzenleniyor</span>
                : (klasor.notSayisi > 0 ? `${klasor.notSayisi} not` : "boş")}
            </p>
          </div>
        </Link>

        {/* Aksiyon ikonları — sistem klasörü için gizli */}
        {!sistemMi && (
          <div className="flex items-center pr-1.5 gap-0">
            {kilitli ? (
              <span className="p-1.5 text-terracotta" title={`${klasor.kilitSahibiAdi} düzenliyor`}>
                <Lock className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
            ) : (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDuzenleAcik(true); }}
                aria-label="Klasörü düzenle"
                className="p-1.5 rounded-md text-clay-400 dark:text-ink-300 hover:text-clay-900 dark:hover:text-ink-50 hover:bg-cream-300 dark:hover:bg-ink-700 active:bg-cream-400 dark:active:bg-ink-700 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSilAcik(true); }}
              aria-label="Klasörü sil"
              disabled={kilitli}
              className="p-1.5 rounded-md text-clay-400 dark:text-ink-300 hover:text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors disabled:opacity-30"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {duzenleAcik && (
        <KlasorDuzenleDialog klasor={klasor} open={duzenleAcik} onOpenChange={setDuzenleAcik} />
      )}
      {silAcik && (
        <KlasorSilDialog klasor={klasor} open={silAcik} onOpenChange={setSilAcik} />
      )}
    </>
  );
}
