"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useState } from "react";
import {
  Eye, Pencil, Trash2, Plus, History, CheckCircle2, Loader2, FolderHeart, Tag
} from "lucide-react";
import { notApi, klasorApi } from "@/lib/api";
import { Button } from "./ui/button";
import { Input, Textarea, Label } from "./ui/input";
import { Checkbox } from "./ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogClose, DialogDescription
} from "./ui/dialog";
import { cn, tarihFormat, gorelizamandan, bastari } from "@/lib/utils";
import type { Not, NotGecmisi, Klasor } from "@/lib/types";

const yeniSchema = z.object({
  baslik: z.string().min(1, "Başlık zorunlu").max(200),
  icerik: z.string().max(5000).optional(),
});

export function YeniNotFormu({ klasorId }: { klasorId?: string | null }) {
  const qc = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors } } =
    useForm<z.infer<typeof yeniSchema>>({
      resolver: zodResolver(yeniSchema),
      defaultValues: { baslik: "", icerik: "" }
    });

  const m = useMutation({
    mutationFn: (d: z.infer<typeof yeniSchema>) =>
      notApi.create({ ...d, klasorId: klasorId ?? null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notlar"] });
      qc.invalidateQueries({ queryKey: ["klasorler"] });
      reset();
      toast.success("Not eklendi");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <form onSubmit={handleSubmit((d) => m.mutate(d))} className="flex gap-2 items-start">
      <div className="flex-1">
        <Input
          {...register("baslik")}
          placeholder="Bir not düşün..."
          disabled={m.isPending}
          autoFocus
        />
        {errors.baslik && (
          <p className="text-xs text-red-600 mt-1.5 ml-1">{errors.baslik.message}</p>
        )}
      </div>
      <Button type="submit" variant="secondary" disabled={m.isPending}>
        <Plus className="h-4 w-4 mr-1.5" strokeWidth={2.5} />
        Ekle
      </Button>
    </form>
  );
}

// Tamamlama dialog
export function TamamlaDialog({
  not, open, onOpenChange
}: { not: Not; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [aciklama, setAciklama] = useState("");

  const m = useMutation({
    mutationFn: () => notApi.tamamla(not.id, aciklama.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notlar"] });
      setAciklama("");
      onOpenChange(false);
      toast.success("Tamamlandı 🤍");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tamamlandı olarak işaretle</DialogTitle>
          <DialogDescription>
            &quot;{not.baslik}&quot; notu için kısa bir tamamlanma açıklaması yaz.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="aciklama">Açıklama (zorunlu)</Label>
          <Textarea
            id="aciklama"
            value={aciklama}
            onChange={(e) => setAciklama(e.target.value)}
            placeholder="Örn. Düğün salonuyla sözleşmeyi imzaladık. Tarih sabit, depozit ödendi."
            autoFocus
          />
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <DialogClose asChild>
            <Button type="button" variant="outline">Vazgeç</Button>
          </DialogClose>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || aciklama.trim().length === 0}
            variant="secondary"
          >
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            Tamamlandı
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Düzenle dialog — klasör seçimi/değiştirme dahil
export function DuzenleDialog({
  not, open, onOpenChange
}: { not: Not; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [baslik, setBaslik] = useState(not.baslik);
  const [icerik, setIcerik] = useState(not.icerik ?? "");
  const [klasorId, setKlasorId] = useState<string | null>(not.klasorId);
  const [aciklama, setAciklama] = useState("");

  const { data: klasorler } = useQuery({
    queryKey: ["klasorler"],
    queryFn: klasorApi.list,
  });

  const m = useMutation({
    mutationFn: () => notApi.update(not.id, {
      baslik: baslik.trim(),
      icerik: icerik.trim() || null,
      klasorId: klasorId,
      degisiklikAciklamasi: aciklama.trim() || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notlar"] });
      qc.invalidateQueries({ queryKey: ["klasorler"] });
      qc.invalidateQueries({ queryKey: ["not-gecmisi", not.id] });
      onOpenChange(false);
      toast.success("Güncellendi");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Klasörleri hiyerarşik sırala (kök → alt)
  const klasorSecenekleri = (klasorler ?? []).slice().sort((a, b) => {
    const ustA = a.ustKlasorId ? 1 : 0;
    const ustB = b.ustKlasorId ? 1 : 0;
    if (ustA !== ustB) return ustA - ustB;
    return a.ad.localeCompare(b.ad, "tr");
  });

  function klasorEtiketi(k: Klasor) {
    if (!k.ustKlasorId) return k.ad;
    const ust = klasorler?.find((p) => p.id === k.ustKlasorId);
    return ust ? `${ust.ad} / ${k.ad}` : k.ad;
  }

  const klasorDegisti = klasorId !== not.klasorId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Notu Düzenle</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="baslik">Başlık</Label>
            <Input id="baslik" value={baslik} onChange={(e) => setBaslik(e.target.value)} autoFocus />
          </div>
          <div>
            <Label htmlFor="icerik">İçerik</Label>
            <Textarea
              id="icerik" value={icerik}
              onChange={(e) => setIcerik(e.target.value)}
              placeholder="Detay yaz..."
            />
          </div>
          <div>
            <Label htmlFor="klasor">
              {not.klasorId ? "Bulunduğu klasör" : "Klasöre taşı (isteğe bağlı)"}
            </Label>
            <select
              id="klasor"
              value={klasorId ?? ""}
              onChange={(e) => setKlasorId(e.target.value || null)}
              className="h-11 w-full rounded-xl border border-clay-200 bg-white px-4 text-[15px] text-clay-900 focus:outline-none focus:border-clay-400 focus:ring-2 focus:ring-clay-900/5 transition-colors"
            >
              <option value="">— Kategorize edilmemiş —</option>
              {klasorSecenekleri.map((k) => (
                <option key={k.id} value={k.id}>{klasorEtiketi(k)}</option>
              ))}
            </select>
            {klasorDegisti && (
              <p className="text-xs text-terracotta-dark mt-1.5 italic">
                {klasorId === null
                  ? "Bu not klasörden çıkarılacak."
                  : `Bu not "${klasorEtiketi(klasorSecenekleri.find((k) => k.id === klasorId)!)}" klasörüne taşınacak.`}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="aciklama">Değişiklik açıklaması (isteğe bağlı)</Label>
            <Input
              id="aciklama" value={aciklama}
              onChange={(e) => setAciklama(e.target.value)}
              placeholder="Örn. Tarihi güncelledim"
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <DialogClose asChild>
            <Button type="button" variant="outline">İptal</Button>
          </DialogClose>
          <Button onClick={() => m.mutate()} disabled={m.isPending || baslik.trim().length === 0}>
            Kaydet
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Detay (göz) — sıralı geçmiş
export function DetayDialog({
  not, open, onOpenChange
}: { not: Not; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: gecmis, isLoading } = useQuery({
    queryKey: ["not-gecmisi", not.id],
    queryFn: () => notApi.gecmis(not.id),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-terracotta" />
            Not Geçmişi
          </DialogTitle>
          <DialogDescription>&quot;{not.baslik}&quot;</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-clay-400" />
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {(gecmis ?? []).map((g) => <GecmisSatiri key={g.id} g={g} />)}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function eylemEtiketi(eylem: string) {
  switch (eylem) {
    case "olusturuldu": return { label: "Oluşturdu", renk: "bg-cream-200 text-clay-700" };
    case "duzenlendi":  return { label: "Düzenledi", renk: "bg-cream-200 text-clay-700" };
    case "tamamlandi":  return { label: "Tamamladı", renk: "bg-terracotta/15 text-terracotta-dark" };
    case "yeniden_acildi": return { label: "Yeniden açtı", renk: "bg-amber-100 text-amber-800" };
    case "silindi":     return { label: "Sildi", renk: "bg-rose-100 text-red-800" };
    case "geri_alindi": return { label: "Geri yükledi", renk: "bg-emerald-100 text-emerald-800" };
    default: return { label: eylem, renk: "bg-cream-200 text-clay-700" };
  }
}

function GecmisSatiri({ g }: { g: NotGecmisi }) {
  const et = eylemEtiketi(g.eylem);
  return (
    <div className="flex gap-3 p-3 rounded-xl bg-cream-50 border border-cream-200">
      <div className="h-9 w-9 shrink-0 rounded-full bg-clay-800 text-cream-50 flex items-center justify-center text-xs font-medium">
        {bastari(g.yapanAdSoyad)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-clay-900">{g.yapanAdSoyad}</span>
          <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider", et.renk)}>
            {et.label}
          </span>
        </div>
        <p className="text-xs text-clay-500 mt-0.5">{tarihFormat(g.yapilisZamani)}</p>
        {g.aciklama && (
          <p className="text-sm text-clay-700 mt-2 leading-relaxed">{g.aciklama}</p>
        )}
      </div>
    </div>
  );
}

// Klasör badge — kategorize / değil
function KlasorBadge({ klasorAdi }: { klasorAdi: string | null }) {
  if (klasorAdi) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-terracotta/12 text-terracotta-dark font-medium text-[10px] sm:text-[11px] leading-none">
        <FolderHeart className="h-2.5 w-2.5 sm:h-3 sm:w-3" strokeWidth={2} />
        <span className="truncate max-w-[100px] sm:max-w-[140px]">{klasorAdi}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-cream-200 text-clay-500 font-medium text-[10px] sm:text-[11px] leading-none">
      <Tag className="h-2.5 w-2.5 sm:h-3 sm:w-3" strokeWidth={2} />
      <span className="hidden sm:inline">Kategorize edilmedi</span>
      <span className="sm:hidden">Kategorisiz</span>
    </span>
  );
}

// Tek not kartı
export function NotKart({ not, klasorBadgeGoster = true }: { not: Not; klasorBadgeGoster?: boolean }) {
  const qc = useQueryClient();
  const [tamamlaAcik, setTamamlaAcik] = useState(false);
  const [duzenleAcik, setDuzenleAcik] = useState(false);
  const [detayAcik, setDetayAcik] = useState(false);

  const yenidenAc = useMutation({
    mutationFn: () => notApi.yenidenAc(not.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notlar"] });
      toast.success("Yeniden açıldı");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const sil = useMutation({
    mutationFn: () => notApi.remove(not.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notlar"] });
      qc.invalidateQueries({ queryKey: ["klasorler"] });
      toast.success("Çöp kutusuna taşındı");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className={cn(
      "kart p-3 sm:p-4 group transition-all hover:shadow-md",
      not.tamamlandi && "bg-cream-200/40 border-cream-300"
    )}>
      <div className="flex items-start gap-2.5 sm:gap-3">
        <Checkbox
          checked={not.tamamlandi}
          onCheckedChange={() => not.tamamlandi ? yenidenAc.mutate() : setTamamlaAcik(true)}
          className="mt-0.5 shrink-0"
        />
        <div className="flex-1 min-w-0">
          {/* Üst satır: sadece başlık (klasör badge ve aksiyonlar alt satıra taşındı) */}
          <h4 className={cn(
            "text-sm sm:text-[15px] leading-snug font-medium break-words",
            not.tamamlandi ? "line-through text-clay-400" : "text-clay-900"
          )}>
            {not.baslik}
          </h4>

          {/* İçerik — kart enini kaplar, iki yana yaslı, satır kırılmaları doğal */}
          {not.icerik && (
            <p className={cn(
              "text-[13px] sm:text-sm mt-1.5 leading-relaxed text-justify hyphens-auto break-words whitespace-pre-wrap",
              not.tamamlandi ? "text-clay-400" : "text-clay-600"
            )}>
              {not.icerik}
            </p>
          )}

          {/* Tamamlanma açıklaması varsa terracotta vurgulu blok */}
          {not.tamamlandi && not.tamamlanmaAciklamasi && (
            <div className="mt-2 p-2 sm:p-2.5 bg-terracotta/8 border-l-2 border-terracotta rounded-r-lg">
              <p className="text-[11px] sm:text-xs text-clay-500 mb-0.5">
                {not.tamamlayanAdSoyad} tamamladı · {tarihFormat(not.tamamlanmaZamani)}
              </p>
              <p className="text-[13px] sm:text-sm text-clay-700 text-justify hyphens-auto break-words whitespace-pre-wrap">
                {not.tamamlanmaAciklamasi}
              </p>
            </div>
          )}

          {/* Alt satır: [Klasör] [👁][✏][🗑] · Avatar · Tarih  (mobilde de her zaman görünür) */}
          <div className="flex items-center gap-1.5 sm:gap-2 mt-2.5 text-[11px] sm:text-xs flex-wrap">
            {klasorBadgeGoster && (
              <KlasorBadge klasorAdi={not.klasorAdi} />
            )}

            {/* Aksiyon ikon grubu — kompakt, mobilde de görünür */}
            <div className="flex items-center gap-0 -my-1">
              <button
                onClick={() => setDetayAcik(true)}
                aria-label="Detay"
                className="p-1.5 rounded-md text-clay-500 hover:text-terracotta hover:bg-cream-200 active:bg-cream-300 transition-colors"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setDuzenleAcik(true)}
                aria-label="Düzenle"
                className="p-1.5 rounded-md text-clay-500 hover:text-clay-900 hover:bg-cream-200 active:bg-cream-300 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => sil.mutate()}
                aria-label="Sil"
                disabled={sil.isPending}
                className="p-1.5 rounded-md text-clay-500 hover:text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <span className="text-clay-300 hidden sm:inline">·</span>

            <span className="inline-flex items-center gap-1 text-clay-400 ml-auto sm:ml-0">
              <span className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-full bg-clay-200 text-clay-700 inline-flex items-center justify-center text-[8px] sm:text-[9px] font-medium">
                {bastari(not.olusturanAdSoyad)}
              </span>
              {not.olusturanAdSoyad.split(" ")[0]}
            </span>
            <span className="text-clay-300">·</span>
            <span className="text-clay-400">{gorelizamandan(not.olusturmaZamani)}</span>
          </div>
        </div>
      </div>

      {tamamlaAcik && <TamamlaDialog not={not} open={tamamlaAcik} onOpenChange={setTamamlaAcik} />}
      {duzenleAcik && <DuzenleDialog not={not} open={duzenleAcik} onOpenChange={setDuzenleAcik} />}
      {detayAcik && <DetayDialog not={not} open={detayAcik} onOpenChange={setDetayAcik} />}
    </div>
  );
}

// Not listesi
export function NotListesi({
  klasorId, klasorBadgeGoster = true
}: { klasorId?: string | null; klasorBadgeGoster?: boolean }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["notlar", { klasor: klasorId, silindi: false }],
    queryFn: () => notApi.list({ klasor: klasorId ?? undefined, silindi: false }),
  });

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-clay-400" /></div>;
  }
  if (error) {
    return <div className="text-sm text-red-700 bg-rose-50 border border-rose-200 rounded-xl p-4">{(error as Error).message}</div>;
  }
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-10 px-4">
        <p className="font-display text-2xl text-clay-300 italic">boş sayfa</p>
        <p className="text-sm text-clay-400 mt-2">Yukarıdaki kutudan ekle.</p>
      </div>
    );
  }

  const aktif = data.filter((n) => !n.tamamlandi);
  const tamamlanan = data.filter((n) => n.tamamlandi);

  return (
    <div className="space-y-4 sm:space-y-6">
      {aktif.length > 0 && (
        <section>
          <h3 className="text-[11px] sm:text-xs uppercase tracking-wider text-clay-400 mb-2 sm:mb-2.5 px-1">
            Bekleyen · {aktif.length}
          </h3>
          <div className="space-y-2">
            {aktif.map((n) => <NotKart key={n.id} not={n} klasorBadgeGoster={klasorBadgeGoster} />)}
          </div>
        </section>
      )}
      {tamamlanan.length > 0 && (
        <section>
          <h3 className="text-[11px] sm:text-xs uppercase tracking-wider text-clay-400 mb-2 sm:mb-2.5 px-1">
            Tamamlanan · {tamamlanan.length}
          </h3>
          <div className="space-y-2">
            {tamamlanan.map((n) => <NotKart key={n.id} not={n} klasorBadgeGoster={klasorBadgeGoster} />)}
          </div>
        </section>
      )}
    </div>
  );
}
