"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useState, useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import {
  Eye, Pencil, Trash2, Plus, History, CheckCircle2, Loader2, FolderHeart, Tag, Bell, Lock, AlertTriangle, Users
} from "lucide-react";
import { notApi, klasorApi, isletmeApi } from "@/lib/api";
import { useBen } from "@/lib/useBen";
import { akisBaglan } from "@/lib/akis";
import { AramaKutusu, Vurgula } from "./AramaKutusu";
import { useIsletmeMetinleri, metinDeger } from "@/lib/useIsletmeMetinleri";
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
  // v18 - not ekleme ipucu isletme_metinleri'nden (not_form_placeholder); field tek kaynak
  const { data: metinler } = useIsletmeMetinleri();
  const notIpucu = metinDeger(metinler, "not_form_placeholder", "");
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
          placeholder={notIpucu}
          disabled={m.isPending}
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
      toast.error(`${lock.kilitSahibi} şu anda bu notu düzenliyor. Lütfen birkaç saniye sonra tekrar dene`);
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
      toast.success("Tamamlandı");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
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
            placeholder="Örn. Önemli bir gelişmeyi veya kararı buraya yaz."
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
      toast.error(`${lock.kilitSahibi} şu anda bu notu düzenliyor. Lütfen birkaç saniye sonra tekrar dene`);
      onOpenChange(false);
    }
  }, [open, lock.kilitSahibi, onOpenChange]);

  const [baslik, setBaslik] = useState(not.baslik);
  const [icerik, setIcerik] = useState(not.icerik ? icerikTireli(not.icerik) : "");
  const [klasorId, setKlasorId] = useState<string | null>(not.klasorId);
  const [aciklama, setAciklama] = useState("");

  // Icerik value-managed tire: her madde "- " ile baslar; Enter yeni madde acar, satir basi "- " silinemez
  function icerikKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget;
    const { selectionStart, selectionEnd, value } = ta;
    if (e.key === "Enter") {
      e.preventDefault();
      const yeni = value.slice(0, selectionStart) + "\n- " + value.slice(selectionEnd);
      setIcerik(yeni);
      const pos = selectionStart + 3;  // "\n- " = 3 karakter
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = pos; });
      return;
    }
    if (e.key === "Backspace" && selectionStart === selectionEnd) {
      const satirBasi = value.lastIndexOf("\n", selectionStart - 1) + 1;
      const tireVar = value.slice(satirBasi, satirBasi + 2) === "- ";
      // imlec satir basindaki "- " icinde/hemen sonrasinda mi
      if (tireVar && selectionStart > satirBasi && selectionStart <= satirBasi + 2) {
        e.preventDefault();
        if (satirBasi === 0) return;                                             // ilk satir tiresi silinmez
        const yeni = value.slice(0, satirBasi - 1) + value.slice(satirBasi + 2); // "\n- " kaldir, onceki satira birles
        setIcerik(yeni);
        const pos = satirBasi - 1;
        requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = pos; });
      }
    }
  }

  function icerikFocus() {
    if (icerik === "") setIcerik("- ");  // bos icerikte ilk madde tiresi
  }

  // Hatırlatıcı state — mevcutsa yükle, yoksa kapalı başla
  const [hatirlaticiAcik, setHatirlaticiAcik] = useState<boolean>(not.hatirlatmaZamani !== null);
  const [hatirlatmaZamani, setHatirlatmaZamani] = useState<string>(() => {
    if (!not.hatirlatmaZamani) return "";
    // datetime-local için "YYYY-MM-DDTHH:MM" formatı, kullanıcının TZ'sinde
    const d = new Date(not.hatirlatmaZamani);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [hatirlatmaAliciIdler, setHatirlatmaAliciIdler] = useState<string[]>(
    not.hatirlatmaAliciIdler ?? []
  );
  const [hatirlatmaSekli, setHatirlatmaSekli] = useState<"uygulama" | "email" | "her_ikisi" | "">(
    (not.hatirlatmaSekli as "uygulama" | "email" | "her_ikisi") ?? ""
  );

  const { data: klasorler } = useQuery({
    queryKey: ["klasorler"],
    queryFn: klasorApi.list,
  });
  // v19 P4 - hatirlatma alici secimi icin tenant uyeleri (kendisi dahil aktif uyeler)
  const { data: uyeler } = useQuery({
    queryKey: ["tenant-uyeler"],
    queryFn: isletmeApi.uyeler,
  });

  const m = useMutation({
    mutationFn: () => {
      const baslikTrim = baslik.trim();
      const icerikTrim = icerik
        .split("\n")
        .filter((s) => s.replace(/^-\s*/, "").trim() !== "")  // tire sonrasi bos satirlari at
        .join("\n")
        .trim() || null;
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
          hatirlatmaAliciIdler,
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
  // v19 B1 - sistem klasörü (Tamamlananlar) klasör seçiminde gizli; not ancak tamamlandığında buraya taşınır (defense in depth: backend de reddeder).
  const klasorSecenekleri = (klasorler ?? []).filter(k => !k.sistemMi).slice().sort((a, b) => {
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
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Notu Düzenle</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="baslik">Başlık</Label>
            <Input id="baslik" value={baslik} onChange={(e) => setBaslik(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="icerik">İçerik</Label>
            <Textarea
              id="icerik" value={icerik}
              onChange={(e) => setIcerik(e.target.value)}
              onKeyDown={icerikKeyDown}
              onFocus={icerikFocus}
              placeholder="Her satır bir madde; başına otomatik - gelir"
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
                <Label>Kime hatırlatılsın</Label>
                <div className="space-y-1 rounded-xl border border-clay-200 dark:border-ink-700 bg-white dark:bg-ink-850 p-2 max-h-44 overflow-y-auto">
                  {(uyeler ?? []).length === 0 ? (
                    <p className="text-sm text-clay-400 dark:text-ink-300 px-2 py-1.5">Üyeler yükleniyor…</p>
                  ) : (
                    (uyeler ?? []).map((u) => {
                      const secili = hatirlatmaAliciIdler.includes(u.kullaniciId);
                      return (
                        <label
                          key={u.kullaniciId}
                          className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-cream-100 dark:hover:bg-ink-800 cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={secili}
                            onChange={() =>
                              setHatirlatmaAliciIdler((prev) =>
                                secili ? prev.filter((id) => id !== u.kullaniciId) : [...prev, u.kullaniciId]
                              )
                            }
                            className="h-4 w-4 rounded border-clay-300 text-terracotta focus:ring-terracotta/40"
                          />
                          <span className="text-[15px] text-clay-900 dark:text-ink-50 truncate">{u.adSoyad}</span>
                        </label>
                      );
                    })
                  )}
                </div>
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
              (hatirlaticiAcik && (!hatirlatmaZamani || hatirlatmaAliciIdler.length === 0 || !hatirlatmaSekli))
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
// madde 1 - hatirlatma sekli etiketleri (dokum popover'da gosterilir)
const HATIRLATMA_SEKIL_ETIKET: Record<string, string> = {
  uygulama: "Uygulama içi bildirim",
  email: "E-posta",
  her_ikisi: "Uygulama + E-posta",
};

// icerik her satirini "- madde" formatina normalize eder (cift tire onler; tire'siz eski notlara otomatik ekler)
function icerikTireli(icerik: string): string {
  return icerik
    .split("\n")
    .map((satir) => {
      const bossuz = satir.trimStart();
      if (bossuz === "") return satir;                       // bos satir dokunma
      return bossuz.startsWith("- ") ? satir : `- ${satir}`; // zaten tireli ise koru, degilse ekle
    })
    .join("\n");
}

// madde 5 - aksiyon ikonlari icin ortak touch target: mobilde >=44px (kazara dokunma onleme), desktopta kompakt 36px
const IKON_BUTON = "min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] inline-flex items-center justify-center rounded-md transition-colors";

export function NotKart({ not, klasorBadgeGoster = true, aramaTerimi = "" }: { not: Not; klasorBadgeGoster?: boolean; aramaTerimi?: string }) {
  const qc = useQueryClient();
  const [tamamlaAcik, setTamamlaAcik] = useState(false);
  const [duzenleAcik, setDuzenleAcik] = useState(false);
  const [detayAcik, setDetayAcik] = useState(false);
  const [silAcik, setSilAcik] = useState(false);  // v12 — not silme onay dialog'u
  const [hatirlatmaDokumAcik, setHatirlatmaDokumAcik] = useState(false);  // madde 1 - hatirlatma dokumu popover

  // madde 1 - hatirlatma alici isimleri icin tenant uyeleri (cache paylasimli, tek istek; sadece hatirlatma varsa)
  const { data: tenantUyeler } = useQuery({
    queryKey: ["uyeler"],
    queryFn: isletmeApi.uyeler,
    enabled: !!not.hatirlatmaZamani,
    staleTime: 60_000,
  });
  const hatirlatmaKisaTarih = not.hatirlatmaZamani
    ? new Date(not.hatirlatmaZamani).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";
  const hatirlatmaTamTarih = not.hatirlatmaZamani
    ? new Date(not.hatirlatmaZamani).toLocaleString("tr-TR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "";
  const hatirlatmaAlicilari = (not.hatirlatmaAliciIdler ?? [])
    .map((id) => tenantUyeler?.find((u) => u.kullaniciId === id)?.adSoyad)
    .filter((x): x is string => Boolean(x));

  // v19 - read receipts (Faz 3)
  const { data: ben } = useBen();
  const [gorulduOptimistic, setGorulduOptimistic] = useState(false);
  const [okuyanlarAcik, setOkuyanlarAcik] = useState(false);
  const kartRef = useRef<HTMLDivElement>(null);
  const okunduGonderildiRef = useRef(false);

  // yeni/degisen: hic gormedim VEYA son gormemden sonra guncellendi (tamamlanmamis notlar)
  const yeniVeyaDegismis = !not.tamamlandi && !gorulduOptimistic && (
    not.benimSonGorme === null ||
    new Date(not.benimSonGorme).getTime() < new Date(not.guncellemeZamani).getTime()
  );

  // optimistic okuyan: gorulduysem ve listede yoksam kendimi aninda ekle (avatar)
  const okuyanlarGosterilen = (() => {
    const temel = not.okuyanlar ?? [];
    if (gorulduOptimistic && ben && !temel.some((o) => o.kullaniciId === ben.id)) {
      return [{ kullaniciId: ben.id, adSoyad: ben.adSoyad, okunmaZamani: new Date().toISOString() }, ...temel];
    }
    return temel;
  })();

  const okunduMut = useMutation({ mutationFn: () => notApi.okundu(not.id) });

  // kart ekranin %60'i kadar gorununce okundu isaretle (yeni/degisen ise, bir kez)
  useEffect(() => {
    const el = kartRef.current;
    if (!el) return;
    const gormeli = not.benimSonGorme === null ||
      new Date(not.benimSonGorme).getTime() < new Date(not.guncellemeZamani).getTime();
    if (!gormeli || not.tamamlandi) return;
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !okunduGonderildiRef.current) {
          okunduGonderildiRef.current = true;
          okunduMut.mutate();
          obs.disconnect();
          // vurgu kullanici tarafindan fark edilsin: 2.5sn belirgin kalir, sonra yumusak soner
          setTimeout(() => setGorulduOptimistic(true), 2500);
        }
      }
    }, { threshold: 0.6 });
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [not.id, not.benimSonGorme, not.guncellemeZamani, not.tamamlandi]);

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
      ref={kartRef}
      data-not-id={not.id}
      className={cn(
        "kart p-3 sm:p-4 group transition-all duration-500 hover:shadow-md",
        not.tamamlandi && "bg-cream-200 dark:bg-ink-800/40 border-cream-300 dark:border-ink-700",
        yeniVeyaDegismis && "ring-2 ring-terracotta border-terracotta bg-terracotta/[0.05] shadow-md"
      )}>
      <div className="flex items-start gap-2.5 sm:gap-3">
        <Checkbox
          checked={not.tamamlandi}
          onCheckedChange={() => not.tamamlandi ? yenidenAc.mutate() : setTamamlaAcik(true)}
          className="mt-0.5 shrink-0"
        />
        <div className="flex-1 min-w-0">
          {/* Üst satır: oluşturan bilgisi (başlığın bir üstünde, sağa yaslı; başlığı daraltmaz). Sıra: avatar, ad, zaman */}
          <div className="flex items-center justify-end gap-1.5 mb-1 text-[11px] text-clay-400 dark:text-ink-300">
            <span className="h-4 w-4 rounded-full bg-clay-200 dark:bg-ink-700 text-clay-700 dark:text-ink-100 inline-flex items-center justify-center text-[8px] font-medium shrink-0">
              {bastari(not.olusturanAdSoyad)}
            </span>
            <span className="truncate">{not.olusturanAdSoyad.split(" ")[0]}</span>
            <span className="text-clay-300 dark:text-ink-400">·</span>
            <span className="shrink-0" title={`Oluşturma: ${tarihFormat(not.olusturmaZamani)}`}>{gorelizamandan(not.guncellemeZamani)}</span>
          </div>
          {/* Başlık: tam genişlik, daralmaz */}
          <h4 className={cn(
            "text-sm sm:text-[15px] leading-snug font-medium break-words text-justify hyphens-auto",
            not.tamamlandi ? "line-through text-clay-400 dark:text-ink-300" : "text-clay-900 dark:text-ink-50"
          )}>
            <Vurgula metin={not.baslik} terim={aramaTerimi} />
          </h4>

          {/* İçerik — her satır "- madde" (eski/yeni notlar tutarlı), iki yana yaslı */}
          {not.icerik && (
            <p className={cn(
              "text-[13px] sm:text-sm mt-1.5 leading-relaxed text-justify hyphens-auto break-words whitespace-pre-wrap",
              not.tamamlandi ? "text-clay-400 dark:text-ink-300" : "text-clay-600 dark:text-ink-100"
            )}>
              <Vurgula metin={icerikTireli(not.icerik)} terim={aramaTerimi} />
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

          {/* Alt satır: [Klasör] [aksiyon ikonlar] · okuyanlar (mobilde de görünür) */}
          <div className="flex items-center gap-1.5 sm:gap-2 mt-2.5 text-[11px] sm:text-xs flex-wrap">
            {klasorBadgeGoster && (
              <KlasorBadge klasorAdi={not.klasorAdi} />
            )}

            {/* Aksiyon ikon grubu - sag kenara sabit (ml-auto + order-last): klasor uzunlugundan bagimsiz, her notta ayni X konumu */}
            <div className="flex items-center gap-0 -my-1 ml-auto order-last">
              <button
                onClick={() => setDetayAcik(true)}
                aria-label="Detay"
                className={cn(IKON_BUTON, "text-clay-500 dark:text-ink-200 hover:text-terracotta hover:bg-cream-200 dark:hover:bg-ink-800 active:bg-cream-300 dark:active:bg-ink-700")}
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
              {not.hatirlatmaZamani && (
                <div className="relative order-first">
                  <button
                    type="button"
                    onClick={() => setHatirlatmaDokumAcik((v) => !v)}
                    aria-label={`Hatırlatıcı: ${hatirlatmaTamTarih}${hatirlatmaAlicilari.length ? `, kimlere: ${hatirlatmaAlicilari.join(", ")}` : ""}`}
                    className={cn(
                      "flex flex-col items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] rounded-md transition-colors hover:bg-cream-200 dark:hover:bg-ink-800",
                      not.hatirlatmaGonderildiMi ? "text-clay-400 dark:text-ink-300" : "text-terracotta"
                    )}
                  >
                    <Bell className="h-3.5 w-3.5" fill={not.hatirlatmaGonderildiMi ? "none" : "currentColor"} strokeWidth={2} />
                    <span className="text-[9px] leading-none mt-0.5 font-medium whitespace-nowrap">{hatirlatmaKisaTarih}</span>
                  </button>
                  {hatirlatmaDokumAcik && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setHatirlatmaDokumAcik(false)} />
                      <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1.5 w-52 p-3 rounded-xl bg-white dark:bg-ink-800 border border-cream-300 dark:border-ink-700 shadow-lg text-left">
                        <p className="text-[11px] font-semibold text-clay-700 dark:text-ink-100 flex items-center gap-1.5">
                          <Bell className="h-3 w-3 text-terracotta" strokeWidth={2.5} /> Hatırlatıcı
                        </p>
                        <p className="text-[11px] text-clay-600 dark:text-ink-200 mt-1.5">{hatirlatmaTamTarih}</p>
                        {hatirlatmaAlicilari.length > 0 && (
                          <p className="text-[11px] text-clay-500 dark:text-ink-300 mt-1.5 leading-relaxed">
                            <span className="text-clay-400 dark:text-ink-400">Kimlere: </span>
                            {hatirlatmaAlicilari.join(", ")}
                          </p>
                        )}
                        {not.hatirlatmaSekli && HATIRLATMA_SEKIL_ETIKET[not.hatirlatmaSekli] && (
                          <p className="text-[10px] text-clay-400 dark:text-ink-400 mt-1.5">
                            {HATIRLATMA_SEKIL_ETIKET[not.hatirlatmaSekli]}
                          </p>
                        )}
                        {not.hatirlatmaGonderildiMi && (
                          <p className="text-[10px] text-clay-400 dark:text-ink-400 mt-1 italic">Gönderildi</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
              {not.kilitSahibiAdi ? (
                <span
                  aria-label={`${not.kilitSahibiAdi} düzenliyor`}
                  title={`${not.kilitSahibiAdi} şu anda bu notu düzenliyor`}
                  className="p-1.5 rounded-md text-terracotta bg-terracotta/10 inline-flex items-center gap-1 text-[10px] font-medium"
                >
                  <Lock className="h-3 w-3" strokeWidth={2.5} />
                  <span className="hidden sm:inline">{not.kilitSahibiAdi} düzenliyor</span>
                </span>
              ) : (
                <button
                  onClick={() => setDuzenleAcik(true)}
                  aria-label="Düzenle"
                  className={cn(IKON_BUTON, "text-clay-500 dark:text-ink-200 hover:text-clay-900 dark:hover:text-ink-50 hover:bg-cream-200 dark:hover:bg-ink-800 active:bg-cream-300 dark:active:bg-ink-700")}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => setSilAcik(true)}
                aria-label="Sil"
                disabled={sil.isPending || !!not.kilitSahibiAdi}
                className={cn(IKON_BUTON, "text-clay-500 dark:text-ink-200 hover:text-red-600 hover:bg-red-50 active:bg-red-100 disabled:opacity-40")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {okuyanlarGosterilen.length > 0 && (
              <div className="relative order-2">
                <button
                  type="button"
                  onClick={() => setOkuyanlarAcik((v) => !v)}
                  aria-label={`${okuyanlarGosterilen.length} kişi gördü`}
                  className="flex items-center gap-1 px-1 py-0.5 rounded-md hover:bg-cream-200 dark:hover:bg-ink-800 transition-colors"
                >
                  <span className="flex -space-x-1.5">
                    {okuyanlarGosterilen.slice(0, 3).map((o) => (
                      <span
                        key={o.kullaniciId}
                        title={o.adSoyad}
                        className="h-5 w-5 rounded-full bg-terracotta/15 text-terracotta text-[9px] font-semibold inline-flex items-center justify-center ring-1 ring-white dark:ring-ink-900"
                      >
                        {bastari(o.adSoyad)}
                      </span>
                    ))}
                  </span>
                  {okuyanlarGosterilen.length > 3 && (
                    <span className="text-[10px] text-clay-400 dark:text-ink-300">+{okuyanlarGosterilen.length - 3}</span>
                  )}
                </button>
                {okuyanlarAcik && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setOkuyanlarAcik(false)} />
                    <div className="absolute z-50 top-full left-0 mt-1.5 w-52 p-3 rounded-xl bg-white dark:bg-ink-800 border border-cream-300 dark:border-ink-700 shadow-lg text-left">
                      <p className="text-[11px] font-semibold text-clay-700 dark:text-ink-100 flex items-center gap-1.5 mb-2">
                        <Users className="h-3 w-3 text-terracotta" strokeWidth={2.5} /> Görüldü
                      </p>
                      <div className="space-y-1.5">
                        {okuyanlarGosterilen.map((o) => (
                          <div key={o.kullaniciId} className="flex items-center gap-2">
                            <span className="h-5 w-5 rounded-full bg-terracotta/15 text-terracotta text-[9px] font-semibold inline-flex items-center justify-center shrink-0">
                              {bastari(o.adSoyad)}
                            </span>
                            <span className="text-[11px] text-clay-600 dark:text-ink-200 flex-1 truncate">{o.adSoyad}</span>
                            <span className="text-[10px] text-clay-400 dark:text-ink-400 shrink-0">{gorelizamandan(o.okunmaZamani)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
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
  klasorId, klasorBadgeGoster = true, sadeceBekleyen = false, baslik
}: { klasorId?: string | null; klasorBadgeGoster?: boolean; sadeceBekleyen?: boolean; baslik?: string }) {
  const qc = useQueryClient();
  const [aramaTerimi, setAramaTerimi] = useState("");
  const [debouncedTerim, setDebouncedTerim] = useState("");

  // Arama debounce - yazma durunca ~280ms sonra backend'e sor (yuku azalt)
  useEffect(() => {
    const z = setTimeout(() => setDebouncedTerim(aramaTerimi.trim()), 280);
    return () => clearTimeout(z);
  }, [aramaTerimi]);

  const aramaVar = debouncedTerim.length > 0;
  const { data, isLoading, error } = useQuery({
    queryKey: aramaVar
      ? ["notlar", "ara", debouncedTerim]
      : ["notlar", { klasor: klasorId, silindi: false, bekleyen: sadeceBekleyen }],
    queryFn: () => aramaVar
      ? notApi.list({ q: debouncedTerim })
      : notApi.list({
          klasor: klasorId ?? undefined,
          silindi: false,
          tamamlandi: sadeceBekleyen ? false : undefined,
        }),
    refetchInterval: aramaVar ? false : 15_000,
  });

  // v19 Faz 3 Adim 2 - canli okundu: tenant akisina baglan, not_okundu olayinda listeyi tazele
  useEffect(() => {
    const kapat = akisBaglan(
      (o) => {
        if (o.olay === "not_okundu") {
          qc.invalidateQueries({ queryKey: ["notlar"] });
        }
      },
      undefined,
      "/api/notlar/akis"
    );
    return kapat;
  }, [qc]);

  // Baslik + arama satiri - her durumda gorunur; arama yazarken mobil klavyenin notlari ortmemesi icin yapiskan ust
  const baslikSatiri = baslik !== undefined ? (
    <div className="sticky top-0 z-20 -mx-1 px-1 pt-1 pb-2 mb-2 bg-cream-100/95 dark:bg-ink-900/95 backdrop-blur-sm flex items-center gap-2 sm:gap-3">
      <h2 className="font-display text-lg sm:text-xl text-clay-900 dark:text-ink-50 shrink-0">{baslik}</h2>
      <AramaKutusu deger={aramaTerimi} onDegis={setAramaTerimi} />
    </div>
  ) : null;
  const sarmal = (ic: ReactNode) => <>{baslikSatiri}{ic}</>;

  if (isLoading) {
    return sarmal(<div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-clay-400 dark:text-ink-300" /></div>);
  }
  if (error) {
    return sarmal(<div className="text-sm text-red-700 bg-rose-50 border border-rose-200 rounded-xl p-4">{(error as Error).message}</div>);
  }
  if (!data || data.length === 0) {
    return sarmal(
      aramaVar ? (
        <div className="text-center py-10 px-4">
          <p className="font-display text-2xl text-clay-300 dark:text-ink-400 italic">eşleşen not yok</p>
          <p className="text-sm text-clay-400 dark:text-ink-300 mt-2">&ldquo;{debouncedTerim}&rdquo; ifadesini içeren not bulunamadı.</p>
        </div>
      ) : (
        <div className="text-center py-10 px-4">
          <p className="font-display text-2xl text-clay-300 dark:text-ink-400 italic">boş sayfa</p>
          <p className="text-sm text-clay-400 dark:text-ink-300 mt-2">Yukarıdaki kutudan ekle.</p>
        </div>
      )
    );
  }

  const aktif = data.filter((n) => !n.tamamlandi);
  const tamamlanan = data.filter((n) => n.tamamlandi);
  // v19 - yeni/degisen not sayisi (rozet): hic gormedigim veya son gormemden sonra guncellenen
  const yeniSayisi = aktif.filter((n) =>
    n.benimSonGorme === null || new Date(n.benimSonGorme).getTime() < new Date(n.guncellemeZamani).getTime()
  ).length;

  return sarmal(
    <div className="space-y-4 sm:space-y-6">
      {aktif.length > 0 && (
        <section>
          <h3 className="text-[11px] sm:text-xs uppercase tracking-wider text-clay-400 dark:text-ink-300 mb-2 sm:mb-2.5 px-1">
            Bekleyen · {aktif.length}
            {yeniSayisi > 0 && (
              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full bg-terracotta/15 text-terracotta text-[10px] font-semibold normal-case tracking-normal">
                {yeniSayisi} yeni
              </span>
            )}
          </h3>
          <div className="space-y-2.5">
            {aktif.map((n) => <NotKart key={n.id} not={n} klasorBadgeGoster={aramaVar || klasorBadgeGoster} aramaTerimi={debouncedTerim} />)}
          </div>
        </section>
      )}
      {tamamlanan.length > 0 && (
        <section>
          <h3 className="text-[11px] sm:text-xs uppercase tracking-wider text-clay-400 dark:text-ink-300 mb-2 sm:mb-2.5 px-1">
            Tamamlanan · {tamamlanan.length}
          </h3>
          <div className="space-y-2.5">
            {tamamlanan.map((n) => <NotKart key={n.id} not={n} klasorBadgeGoster={aramaVar || klasorBadgeGoster} aramaTerimi={debouncedTerim} />)}
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
              <p className="text-sm text-clay-700 dark:text-ink-100 line-clamp-3 leading-relaxed whitespace-pre-wrap">
                {icerikTireli(not.icerik)}
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
