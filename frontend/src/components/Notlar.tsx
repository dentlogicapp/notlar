"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import {
  Eye, Pencil, Trash2, Plus, History, CheckCircle2, Loader2, FolderHeart, Tag, Bell, Lock, AlertTriangle
} from "lucide-react";
import { notApi, klasorApi } from "@/lib/api";
import { useEditLock } from "@/lib/useEditLock";
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
  const lock = useEditLock("not", not.id, open);

  useEffect(() => {
    if (open && lock.kilitSahibi) {
      toast.error(`${lock.kilitSahibi} şu anda bu notu düzenliyor. Lütfen birkaç saniye sonra tekrar dene 🤍`);
      onOpenChange(false);
    }
  }, [open, lock.kilitSahibi, onOpenChange]);

  const [aciklama, setAciklama] = useState("");

  const m = useMutation({
    mutationFn: () => notApi.tamamla(not.id, aciklama.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notlar"] });
      qc.invalidateQueries({ queryKey: ["klasorler"] }); // v12 — Tamamlananlar sayısı anlık güncellensin
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

  // Edit lock — dialog açıkken kilit tutulur, kapanırken bırakılır
  const lock = useEditLock("not", not.id, open);

  // Başkası düzenliyorsa toast + kapat
  useEffect(() => {
    if (open && lock.kilitSahibi) {
      toast.error(`${lock.kilitSahibi} şu anda bu notu düzenliyor. Lütfen birkaç saniye sonra tekrar dene 🤍`);
      onOpenChange(false);
    }
  }, [open, lock.kilitSahibi, onOpenChange]);

  const [baslik, setBaslik] = useState(not.baslik);
  const [icerik, setIcerik] = useState(not.icerik ?? "");
  const [klasorId, setKlasorId] = useState<string | null>(not.klasorId);
  const [aciklama, setAciklama] = useState("");

  // Hatırlatıcı state — mevcutsa yükle, yoksa kapalı başla
  const [hatirlaticiAcik, setHatirlaticiAcik] = useState<boolean>(not.hatirlatmaZamani !== null);
  const [hatirlatmaZamani, setHatirlatmaZamani] = useState<string>(() => {
    if (!not.hatirlatmaZamani) return "";
    // datetime-local için "YYYY-MM-DDTHH:MM" formatı, kullanıcının TZ'sinde
    const d = new Date(not.hatirlatmaZamani);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [hatirlatmaKime, setHatirlatmaKime] = useState<"askima" | "bana" | "ikimize" | "">(
    (not.hatirlatmaKime as "askima" | "bana" | "ikimize") ?? ""
  );
  const [hatirlatmaSekli, setHatirlatmaSekli] = useState<"uygulama" | "email" | "her_ikisi" | "">(
    (not.hatirlatmaSekli as "uygulama" | "email" | "her_ikisi") ?? ""
  );

  const { data: klasorler } = useQuery({
    queryKey: ["klasorler"],
    queryFn: klasorApi.list,
  });

  const m = useMutation({
    mutationFn: () => {
      const baslikTrim = baslik.trim();
      const icerikTrim = icerik.trim() || null;
      const aciklamaTrim = aciklama.trim() || null;

      if (hatirlaticiAcik) {
        // datetime-local kullanıcı TZ'sinde → ISO UTC string
        const iso = new Date(hatirlatmaZamani).toISOString();
        return notApi.update(not.id, {
          baslik: baslikTrim,
          icerik: icerikTrim,
          klasorId,
          degisiklikAciklamasi: aciklamaTrim,
          hatirlatmaZamani: iso,
          hatirlatmaKime: hatirlatmaKime as "askima" | "bana" | "ikimize",
          hatirlatmaSekli: hatirlatmaSekli as "uygulama" | "email" | "her_ikisi",
          hatirlatmaSil: false,
        });
      } else {
        return notApi.update(not.id, {
          baslik: baslikTrim,
          icerik: icerikTrim,
          klasorId,
          degisiklikAciklamasi: aciklamaTrim,
          // Daha önce hatırlatıcı varsa ve kullanıcı kapattıysa sil
          hatirlatmaSil: not.hatirlatmaZamani !== null,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notlar"] });
      qc.invalidateQueries({ queryKey: ["klasorler"] });
      qc.invalidateQueries({ queryKey: ["not-gecmisi", not.id] });
      qc.invalidateQueries({ queryKey: ["bildirimler"] });
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
              className="h-11 w-full rounded-xl border border-clay-200 bg-white dark:bg-ink-850 px-4 text-[15px] text-clay-900 dark:text-ink-50 focus:outline-none focus:border-clay-400 focus:ring-2 focus:ring-clay-900/5 transition-colors"
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

          {/* HATIRLATICI — toggle + 3 zorunlu alt alan */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setHatirlaticiAcik((v) => !v)}
              className={cn(
                "w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-all",
                hatirlaticiAcik
                  ? "border-terracotta/40 bg-terracotta/5"
                  : "border-clay-200 bg-cream-100 dark:bg-ink-800/60 hover:bg-cream-200 dark:hover:bg-ink-800"
              )}
              aria-pressed={hatirlaticiAcik}
            >
              <span className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                    hatirlaticiAcik ? "bg-terracotta text-cream-50" : "bg-clay-200 text-clay-500 dark:text-ink-200"
                  )}
                >
                  ⏰
                </span>
                <span className={cn(
                  "text-sm font-medium",
                  hatirlaticiAcik ? "text-clay-900 dark:text-ink-50" : "text-clay-600 dark:text-ink-100"
                )}>
                  Hatırlatıcı kur (isteğe bağlı)
                </span>
              </span>
              {/* Toggle switch */}
              <span
                className={cn(
                  "relative inline-block h-6 w-11 rounded-full transition-colors",
                  hatirlaticiAcik ? "bg-terracotta" : "bg-clay-300"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white dark:bg-ink-850 shadow transition-transform",
                    hatirlaticiAcik && "translate-x-5"
                  )}
                />
              </span>
            </button>

            <div
              className={cn(
                "space-y-3 transition-all overflow-hidden",
                hatirlaticiAcik ? "max-h-[600px] mt-3 opacity-100" : "max-h-0 mt-0 opacity-0 pointer-events-none"
              )}
            >
              <div>
                <Label htmlFor="hatirlatma-zamani">Hatırlatma zamanı</Label>
                <input
                  id="hatirlatma-zamani"
                  type="datetime-local"
                  value={hatirlatmaZamani}
                  onChange={(e) => setHatirlatmaZamani(e.target.value)}
                  min={(() => {
                    const d = new Date();
                    d.setMinutes(d.getMinutes() + 1);
                    const pad = (n: number) => String(n).padStart(2, "0");
                    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                  })()}
                  className="h-11 w-full rounded-xl border border-clay-200 bg-white dark:bg-ink-850 px-4 text-[15px] text-clay-900 dark:text-ink-50 focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/15 transition-colors"
                />
              </div>
              <div>
                <Label htmlFor="hatirlatma-kime">Kime hatırlatılsın</Label>
                <select
                  id="hatirlatma-kime"
                  value={hatirlatmaKime}
                  onChange={(e) => setHatirlatmaKime(e.target.value as "askima" | "bana" | "ikimize" | "")}
                  className="h-11 w-full rounded-xl border border-clay-200 bg-white dark:bg-ink-850 px-4 text-[15px] text-clay-900 dark:text-ink-50 focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/15 transition-colors"
                >
                  <option value="" disabled>Seç…</option>
                  <option value="askima">Aşkıma</option>
                  <option value="bana">Bana</option>
                  <option value="ikimize">İkimize de</option>
                </select>
              </div>
              <div>
                <Label htmlFor="hatirlatma-sekli">Hatırlatma şekli</Label>
                <select
                  id="hatirlatma-sekli"
                  value={hatirlatmaSekli}
                  onChange={(e) => setHatirlatmaSekli(e.target.value as "uygulama" | "email" | "her_ikisi" | "")}
                  className="h-11 w-full rounded-xl border border-clay-200 bg-white dark:bg-ink-850 px-4 text-[15px] text-clay-900 dark:text-ink-50 focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/15 transition-colors"
                >
                  <option value="" disabled>Seç…</option>
                  <option value="uygulama">Uygulama içinde</option>
                  <option value="email">E-postayla</option>
                  <option value="her_ikisi">Hem uygulama hem e-posta</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <DialogClose asChild>
            <Button type="button" variant="outline">İptal</Button>
          </DialogClose>
          <Button
            onClick={() => m.mutate()}
            disabled={
              m.isPending ||
              baslik.trim().length === 0 ||
              (hatirlaticiAcik && (!hatirlatmaZamani || !hatirlatmaKime || !hatirlatmaSekli))
            }
          >
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
            <Loader2 className="h-5 w-5 animate-spin text-clay-400 dark:text-ink-300" />
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
    case "olusturuldu": return { label: "Oluşturdu", renk: "bg-cream-200 dark:bg-ink-800 text-clay-700 dark:text-ink-100" };
    case "duzenlendi":  return { label: "Düzenledi", renk: "bg-cream-200 dark:bg-ink-800 text-clay-700 dark:text-ink-100" };
    case "tamamlandi":  return { label: "Tamamladı", renk: "bg-terracotta/15 text-terracotta-dark" };
    case "yeniden_acildi": return { label: "Yeniden açtı", renk: "bg-amber-100 text-amber-800" };
    case "silindi":     return { label: "Sildi", renk: "bg-rose-100 text-red-800" };
    case "geri_alindi": return { label: "Geri yükledi", renk: "bg-emerald-100 text-emerald-800" };
    default: return { label: eylem, renk: "bg-cream-200 dark:bg-ink-800 text-clay-700 dark:text-ink-100" };
  }
}

function GecmisSatiri({ g }: { g: NotGecmisi }) {
  const et = eylemEtiketi(g.eylem);
  return (
    <div className="flex gap-3 p-3 rounded-xl bg-cream-50 dark:bg-ink-900 border border-cream-200 dark:border-ink-700">
      <div className="h-9 w-9 shrink-0 rounded-full bg-clay-800 text-cream-50 flex items-center justify-center text-xs font-medium">
        {bastari(g.yapanAdSoyad)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-clay-900 dark:text-ink-50">{g.yapanAdSoyad}</span>
          <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider", et.renk)}>
            {et.label}
          </span>
        </div>
        <p className="text-xs text-clay-500 dark:text-ink-200 mt-0.5">{tarihFormat(g.yapilisZamani)}</p>
        {g.aciklama && (
          <p className="text-sm text-clay-700 dark:text-ink-100 mt-2 leading-relaxed">{g.aciklama}</p>
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
    <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-cream-200 dark:bg-ink-800 text-clay-500 dark:text-ink-200 font-medium text-[10px] sm:text-[11px] leading-none">
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
  const [silAcik, setSilAcik] = useState(false);  // v12 — not silme onay dialog'u

  const yenidenAc = useMutation({
    mutationFn: () => notApi.yenidenAc(not.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notlar"] });
      qc.invalidateQueries({ queryKey: ["klasorler"] }); // v12 — eski klasöre geri taşıma sayıları
      toast.success("Yeniden açıldı");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const sil = useMutation({
    mutationFn: () => notApi.remove(not.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notlar"] });
      qc.invalidateQueries({ queryKey: ["klasorler"] });
      setSilAcik(false);
      toast.success("Çöp kutusuna taşındı");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div
      data-not-id={not.id}
      className={cn(
        "kart p-3 sm:p-4 group transition-all hover:shadow-md",
        not.tamamlandi && "bg-cream-200 dark:bg-ink-800/40 border-cream-300 dark:border-ink-700"
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
            not.tamamlandi ? "line-through text-clay-400 dark:text-ink-300" : "text-clay-900 dark:text-ink-50"
          )}>
            {not.baslik}
          </h4>

          {/* İçerik — kart enini kaplar, iki yana yaslı, satır kırılmaları doğal */}
          {not.icerik && (
            <p className={cn(
              "text-[13px] sm:text-sm mt-1.5 leading-relaxed text-justify hyphens-auto break-words whitespace-pre-wrap",
              not.tamamlandi ? "text-clay-400 dark:text-ink-300" : "text-clay-600 dark:text-ink-100"
            )}>
              {not.icerik}
            </p>
          )}

          {/* Tamamlanma açıklaması varsa terracotta vurgulu blok */}
          {not.tamamlandi && not.tamamlanmaAciklamasi && (
            <div className="mt-2 p-2 sm:p-2.5 bg-terracotta/8 border-l-2 border-terracotta rounded-r-lg">
              <p className="text-[11px] sm:text-xs text-clay-500 dark:text-ink-200 mb-0.5">
                {not.tamamlayanAdSoyad} tamamladı · {tarihFormat(not.tamamlanmaZamani)}
              </p>
              <p className="text-[13px] sm:text-sm text-clay-700 dark:text-ink-100 text-justify hyphens-auto break-words whitespace-pre-wrap">
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
                className="p-1.5 rounded-md text-clay-500 dark:text-ink-200 hover:text-terracotta hover:bg-cream-200 dark:hover:bg-ink-800 active:bg-cream-300 dark:active:bg-ink-700 dark:bg-ink-700 transition-colors"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
              {not.hatirlatmaZamani && (
                <span
                  aria-label={`Hatırlatıcı: ${new Date(not.hatirlatmaZamani).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
                  title={`Hatırlatıcı: ${new Date(not.hatirlatmaZamani).toLocaleString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}`}
                  className={cn(
                    "p-1.5 rounded-md transition-colors inline-flex items-center",
                    not.hatirlatmaGonderildiMi
                      ? "text-clay-400 dark:text-ink-300"
                      : "text-terracotta"
                  )}
                >
                  <Bell className="h-3.5 w-3.5" fill={not.hatirlatmaGonderildiMi ? "none" : "currentColor"} strokeWidth={2} />
                </span>
              )}
              {not.kilitSahibiAdi ? (
                <span
                  aria-label={`${not.kilitSahibiAdi} düzenliyor`}
                  title={`${not.kilitSahibiAdi} şu anda bu notu düzenliyor`}
                  className="p-1.5 rounded-md text-terracotta bg-terracotta/10 inline-flex items-center gap-1 text-[10px] font-medium"
                >
                  <Lock className="h-3 w-3" strokeWidth={2.5} />
                  <span className="hidden sm:inline">Aşkın düzenliyor</span>
                </span>
              ) : (
                <button
                  onClick={() => setDuzenleAcik(true)}
                  aria-label="Düzenle"
                  className="p-1.5 rounded-md text-clay-500 dark:text-ink-200 hover:text-clay-900 dark:hover:text-ink-50 hover:bg-cream-200 dark:hover:bg-ink-800 active:bg-cream-300 dark:active:bg-ink-700 dark:bg-ink-700 transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => setSilAcik(true)}
                aria-label="Sil"
                disabled={sil.isPending || !!not.kilitSahibiAdi}
                className="p-1.5 rounded-md text-clay-500 dark:text-ink-200 hover:text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <span className="text-clay-300 dark:text-ink-400 hidden sm:inline">·</span>

            <span className="inline-flex items-center gap-1 text-clay-400 dark:text-ink-300 ml-auto sm:ml-0">
              <span className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-full bg-clay-200 text-clay-700 dark:text-ink-100 inline-flex items-center justify-center text-[8px] sm:text-[9px] font-medium">
                {bastari(not.olusturanAdSoyad)}
              </span>
              {not.olusturanAdSoyad.split(" ")[0]}
            </span>
            <span className="text-clay-300 dark:text-ink-400">·</span>
            <span
              className="text-clay-400 dark:text-ink-300"
              title={`Oluşturma: ${tarihFormat(not.olusturmaZamani)}`}
            >
              {gorelizamandan(not.guncellemeZamani)}
            </span>
          </div>
        </div>
      </div>

      {tamamlaAcik && <TamamlaDialog not={not} open={tamamlaAcik} onOpenChange={setTamamlaAcik} />}
      {duzenleAcik && <DuzenleDialog not={not} open={duzenleAcik} onOpenChange={setDuzenleAcik} />}
      {detayAcik && <DetayDialog not={not} open={detayAcik} onOpenChange={setDetayAcik} />}
      {silAcik && (
        <NotSilDialog
          not={not}
          open={silAcik}
          onOpenChange={setSilAcik}
          onConfirm={() => sil.mutate()}
          beklemede={sil.isPending}
        />
      )}
    </div>
  );
}

// Not listesi
export function NotListesi({
  klasorId, klasorBadgeGoster = true, sadeceBekleyen = false
}: { klasorId?: string | null; klasorBadgeGoster?: boolean; sadeceBekleyen?: boolean }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["notlar", { klasor: klasorId, silindi: false, bekleyen: sadeceBekleyen }],
    queryFn: () => notApi.list({
      klasor: klasorId ?? undefined,
      silindi: false,
      tamamlandi: sadeceBekleyen ? false : undefined,
    }),
    refetchInterval: 15_000,
  });

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-clay-400 dark:text-ink-300" /></div>;
  }
  if (error) {
    return <div className="text-sm text-red-700 bg-rose-50 border border-rose-200 rounded-xl p-4">{(error as Error).message}</div>;
  }
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-10 px-4">
        <p className="font-display text-2xl text-clay-300 dark:text-ink-400 italic">boş sayfa</p>
        <p className="text-sm text-clay-400 dark:text-ink-300 mt-2">Yukarıdaki kutudan ekle.</p>
      </div>
    );
  }

  const aktif = data.filter((n) => !n.tamamlandi);
  const tamamlanan = data.filter((n) => n.tamamlandi);

  return (
    <div className="space-y-4 sm:space-y-6">
      {aktif.length > 0 && (
        <section>
          <h3 className="text-[11px] sm:text-xs uppercase tracking-wider text-clay-400 dark:text-ink-300 mb-2 sm:mb-2.5 px-1">
            Bekleyen · {aktif.length}
          </h3>
          <div className="space-y-2">
            {aktif.map((n) => <NotKart key={n.id} not={n} klasorBadgeGoster={klasorBadgeGoster} />)}
          </div>
        </section>
      )}
      {tamamlanan.length > 0 && (
        <section>
          <h3 className="text-[11px] sm:text-xs uppercase tracking-wider text-clay-400 dark:text-ink-300 mb-2 sm:mb-2.5 px-1">
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

// v12 — Not silme onay dialog'u (klasör silme dialog'u tonunda, geri alınamaz uyarısı)
function NotSilDialog({
  not, open, onOpenChange, onConfirm, beklemede
}: {
  not: Not;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
  beklemede: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-terracotta" />
            Notu Sil
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-clay-900 dark:text-ink-50">{not.baslik}</span> notunu silmek üzeresin.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-1">
          {/* Uyarı bloğu — KlasorSilDialog ile aynı ton */}
          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border-l-4 border-amber-400 rounded-r-lg">
            <p className="text-sm text-amber-900 dark:text-amber-200 leading-relaxed">
              Bu not <span className="font-semibold">çöp kutusuna</span> taşınacak.
              {not.tamamlandi && " Tamamlanma açıklaması ve geçmişi korunur."}
              {" "}Geri almak istersen <span className="font-semibold">Çöp Kutusu</span> sayfasından kurtarabilirsin.
            </p>
          </div>

          {/* İçerik önizleme — kullanıcı yanlış notu silmesin */}
          {not.icerik && (
            <div className="rounded-lg border border-cream-300 dark:border-ink-700 bg-cream-50 dark:bg-ink-900 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wider text-clay-400 dark:text-ink-300 mb-1">İçerik önizleme</p>
              <p className="text-sm text-clay-700 dark:text-ink-100 line-clamp-3 leading-relaxed">
                {not.icerik}
              </p>
            </div>
          )}

          {not.klasorAdi && (
            <div className="flex items-center gap-1.5 text-xs text-clay-500 dark:text-ink-200">
              <FolderHeart className="h-3.5 w-3.5 text-terracotta" />
              <span>Klasör: <span className="font-medium text-clay-700 dark:text-ink-100">{not.klasorAdi}</span></span>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 mt-5 sm:justify-end">
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={beklemede}>
              İptal
            </Button>
          </DialogClose>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={beklemede}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {beklemede
              ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Siliniyor</>
              : <><Trash2 className="h-4 w-4 mr-1.5" /> Onayla ve Sil</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
