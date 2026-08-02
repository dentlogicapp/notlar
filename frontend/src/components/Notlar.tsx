"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useState, useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import {
  Eye, Pencil, Trash2, Plus, History, CheckCircle2, Loader2, FolderHeart, Folder, Tag, Bell, Lock, AlertTriangle, Users, ChevronDown, Pin
} from "lucide-react";
import { notApi, klasorApi, isletmeApi, bildirimApi } from "@/lib/api";
import { useBen } from "@/lib/useBen";
import { akisBaglan } from "@/lib/akis";
import { AramaKutusu, Vurgula } from "./AramaKutusu";
import { useIsletmeMetinleri, metinDeger } from "@/lib/useIsletmeMetinleri";
import { useEditLock } from "@/lib/useEditLock";
import { Button } from "./ui/button";
import { Input, Textarea, Label } from "./ui/input";
import { Checkbox } from "./ui/checkbox";
import { KlasorSecici } from "./KlasorSecici";
import { klasorEtiketi } from "@/lib/klasor";
import { NotIletButonu } from "./NotIlet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogClose, DialogDescription
} from "./ui/dialog";
import { cn, tarihFormat, gorelizamandan, bastari } from "@/lib/utils";
import type { Not, NotGecmisi, Klasor, TenantUye } from "@/lib/types";
import { hatirlatmaDurumu } from "./MiniTakvim";

const yeniSchema = z.object({
  baslik: z.string().min(1, "Başlık zorunlu").max(200),
  icerik: z.string().max(5000).optional(),
});

// Yeni not icin bos taslak (id=""). DuzenleDialog bunu "yeni mod" olarak algilar; DB'de kayit YOK.
// Not ancak modal icindeki Kaydet ile (tek POST, butunsel) olusur.
function taslakNot(baslik: string, klasorId: string | null): Not {
  const simdi = new Date().toISOString();
  return {
    id: "",
    baslik,
    icerik: null,
    tamamlandi: false,
    tamamlanmaAciklamasi: null,
    tamamlanmaZamani: null,
    tamamlayanAdSoyad: null,
    klasorId,
    klasorAdi: null,
    olusturanId: "",
    olusturanAdSoyad: "",
    olusturmaZamani: simdi,
    guncellemeZamani: simdi,
    silindi: false,
    silinmeZamani: null,
    hatirlatmaZamani: null,
    hatirlatmaKime: null,
    hatirlatmaAliciIdler: null,
    hatirlatmaSekli: null,
    hatirlatmaGonderildiMi: false,
    hatirlatmaTekrar: null,
    hatirlatmaTekrarBitis: null,
    hatirlatmaErkenDakika: null,
    hatirlatmaHaftaGunleri: null,
    kilitSahibiAdi: null,
    eskiKlasorId: null,
    okuyanSayisi: 0,
    okuyanlar: [],
    benimSonGorme: null,
    basaTutuldu: false,
  };
}

// v21 M8 - iOS tarzi hatirlatici ozeti (canli, kullanici dostu tek cumle).
// v21 M8 + Faz A - iOS tarzi hatirlatici ozeti (Turkce ek motoru, Istanbul saati).
const AYLAR_OZET = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const GUNLER_OZET = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];
function ayaYonelmeEki(ay: string): string {
  const kalin = "aıou", ince = "eiöü";
  const unluler = ay.toLowerCase().split("").filter((c) => (kalin + ince).includes(c));
  const son = unluler[unluler.length - 1];
  return kalin.includes(son) ? "a" : "e";
}
function ayinGunuEki(n: number): string {
  const tablo: Record<number, string> = { 0:"unda",1:"inde",2:"sinde",3:"unde",4:"unde",5:"inde",6:"sinda",7:"sinde",8:"inde",9:"unda" };
  return "'" + tablo[Number(String(n).slice(-1))];
}
// BV5 - kart rozeti icin kisa tekrar etiketi.
const GUNLER_KISA_KART = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
function tekrarKisaEtiket(tekrar: string | null, haftaGunleriJson: string | null): string {
  switch (tekrar) {
    case "saatlik": return "Saatlik";
    case "gunluk": return "Her gün";
    case "haftalik": return "Haftalık";
    case "iki_haftalik": return "2 haftada bir";
    case "aylik": return "Aylık";
    case "yillik": return "Yıllık";
    case "haftalik_secili": {
      let g: number[] = [];
      try { g = JSON.parse(haftaGunleriJson || "[]") as number[]; } catch { g = []; }
      g = [...g].sort((a, b) => a - b);
      const set = new Set(g);
      if ([1, 2, 3, 4, 5, 6, 7].every((x) => set.has(x))) return "Her gün";
      if ([1, 2, 3, 4, 5].every((x) => set.has(x)) && ![6, 7].some((x) => set.has(x))) return "Hafta içi";
      if ([6, 7].every((x) => set.has(x)) && ![1, 2, 3, 4, 5].some((x) => set.has(x))) return "Hafta sonu";
      if (g.length === 0) return "Haftalık";
      return g.map((x) => GUNLER_KISA_KART[x - 1]).join(", ");
    }
    default: return "";
  }
}

function hatirlaticiOzet(
  zamanIso: string, tekrar: string, erkenDk: number | null, bitisTarih: string,
  haftaGunleri: number[]
): string {
  const d = new Date(zamanIso);
  const o = { timeZone: "Europe/Istanbul" as const };
  const saat = d.toLocaleTimeString("tr-TR", { ...o, hour: "2-digit", minute: "2-digit" });
  const gunNo = Number(d.toLocaleDateString("tr-TR", { ...o, day: "numeric" }));
  const ayIdx = d.getMonth();
  const gunAdi = GUNLER_OZET[d.getDay()];
  const se = `saat ${saat}'da`;
  let s: string;
  switch (tekrar) {
    case "saatlik": s = "Her saat başı hatırlatılır"; break;
    case "gunluk": s = `Her gün ${se} hatırlatılır`; break;
    case "haftalik": s = `Her hafta ${gunAdi} günü ${se} hatırlatılır`; break;
    case "aylik": s = `Her ayın ${gunNo}${ayinGunuEki(gunNo)} ${se} hatırlatılır`; break;
    case "yillik": s = `Her yıl ${gunNo} ${AYLAR_OZET[ayIdx]} ${se} hatırlatılır`; break;
    case "haftalik_secili": {
      const g = [...(haftaGunleri || [])].sort((a, b) => a - b);
      const set = new Set(g);
      const hi = [1,2,3,4,5].every((x) => set.has(x)) && ![6,7].some((x) => set.has(x));
      const hs = [6,7].every((x) => set.has(x)) && ![1,2,3,4,5].some((x) => set.has(x));
      const hg = [1,2,3,4,5,6,7].every((x) => set.has(x));
      let gm: string;
      if (hg) gm = "Her gün";
      else if (hi) gm = "Hafta içi her gün";
      else if (hs) gm = "Hafta sonu";
      else if (g.length === 0) gm = "Seçili günlerde";
      else gm = "Her " + g.map((x) => GUNLER_OZET[x === 7 ? 0 : x]).join(", ");
      s = `${gm} ${se} hatırlatılır`;
      break;
    }
    default: s = `${gunNo} ${AYLAR_OZET[ayIdx]} ${gunAdi}, ${se} hatırlatılır`;
  }
  if (erkenDk) {
    const em: Record<number, string> = { 5:"5 dakika",15:"15 dakika",60:"1 saat",1440:"1 gün" };
    s += `, ${em[erkenDk] || `${erkenDk} dakika`} önce anımsatılır`;
  }
  if (tekrar && bitisTarih) {
    const b = new Date(bitisTarih);
    const bAy = AYLAR_OZET[b.getMonth()];
    s += ` · ${b.getDate()} ${bAy}'${ayaYonelmeEki(bAy)} kadar`;
  }
  return s;
}

export function YeniNotFormu({ klasorId }: { klasorId?: string | null }) {
  // v18 - not ekleme ipucu isletme_metinleri'nden (not_form_placeholder); field tek kaynak
  const { data: metinler } = useIsletmeMetinleri();
  const notIpucu = metinDeger(metinler, "not_form_placeholder", "");
  const { register, handleSubmit, reset, watch, formState: { errors } } =
    useForm<z.infer<typeof yeniSchema>>({
      resolver: zodResolver(yeniSchema),
      defaultValues: { baslik: "", icerik: "" }
    });

  // Ekle notu OLUSTURMAZ; sadece basligi tasiyan bir taslakla duzenle modalini acar.
  // Not ancak modal icindeki Kaydet ile (tek POST, butunsel) olusur; Kaydet'siz cikista not olusmaz.
  const [taslak, setTaslak] = useState<Not | null>(null);
  const baslikDeger = watch("baslik") ?? "";  // v21-r M1 - canli sayac

  return (
    <>
      <form
        onSubmit={handleSubmit((d) => { setTaslak(taslakNot(d.baslik, klasorId ?? null)); reset(); })}
        className="flex gap-2 items-start"
      >
        <div className="flex-1">
          <Input {...register("baslik")} maxLength={200} placeholder={notIpucu} />
          <p className="text-right text-[11px] text-clay-400 dark:text-ink-300 mt-1 tabular-nums">{baslikDeger.length}/200</p>
          {errors.baslik && (
            <p className="text-xs text-red-600 mt-1.5 ml-1">{errors.baslik.message}</p>
          )}
        </div>
        <Button type="submit" variant="secondary">
          <Plus className="h-4 w-4 mr-1.5" strokeWidth={2.5} />
          Ekle
        </Button>
      </form>
      {taslak && (
        <DuzenleDialog
          not={taslak}
          open
          onOpenChange={(v) => { if (!v) setTaslak(null); }}
        />
      )}
    </>
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

  // Yeni mod: taslak not (id=""), henuz DB'de yok. Kaydet -> create (tek POST butunsel).
  // Dolu id -> mevcut duzenleme akisi (update). Iki akis da ayni modali paylasir (paralel yapi yok).
  const yeniMod = not.id === "";

  // Edit lock — dialog açıkken kilit tutulur, kapanırken bırakılır. Yeni notta kilit yok (kimse duzenlemiyor).
  const lock = useEditLock("not", not.id, open && !yeniMod);

  // v21 M1 - mention picker (WhatsApp deseni): imlecten geriye son "@" yakalanir,
  // uyeler filtrelenir; secim TAM adi gomer (backend Ordinal cozumlemesiyle birebir).
  const { data: mentionUyeler } = useQuery({
    queryKey: ["uyeler"],
    queryFn: isletmeApi.uyeler,
    enabled: open,
    staleTime: 60_000,
  });
  const [mentionAktif, setMentionAktif] = useState<"baslik" | "icerik" | null>(null);
  const [mentionSorgu, setMentionSorgu] = useState("");
  const mentionYakala = (deger: string, imlec: number, alan: "baslik" | "icerik") => {
    const oncesi = deger.slice(0, imlec);
    const at = oncesi.lastIndexOf("@");
    if (at === -1) { setMentionAktif(null); return; }
    const sorgu = oncesi.slice(at + 1);
    if (sorgu.length > 30 || sorgu.includes("\n") || sorgu.includes("@")) { setMentionAktif(null); return; }
    setMentionAktif(alan);
    setMentionSorgu(sorgu);
  };
  const mentionSec = (adSoyad: string) => {
    const uygula = (deger: string) => {
      const at = deger.lastIndexOf("@" + mentionSorgu);
      if (at === -1) return deger;
      return deger.slice(0, at) + "@" + adSoyad + " " + deger.slice(at + 1 + mentionSorgu.length);
    };
    if (mentionAktif === "baslik") setBaslik((v) => uygula(v).slice(0, 200));
    else if (mentionAktif === "icerik") setIcerik((v) => uygula(v).slice(0, 5000));
    setMentionAktif(null);
    setMentionSorgu("");
  };

  // Başkası düzenliyorsa toast + kapat
  useEffect(() => {
    if (open && lock.kilitSahibi) {
      toast.error(`${lock.kilitSahibi} şu anda bu notu düzenliyor. Lütfen birkaç saniye sonra tekrar dene`);
      onOpenChange(false);
    }
  }, [open, lock.kilitSahibi, onOpenChange]);

  const [baslik, setBaslik] = useState(not.baslik);
  const [icerik, setIcerik] = useState(not.icerik ? maddeBaslariniBuyut(icerikTireli(not.icerik)) : "");
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
  // v19: hatirlatici hep uygulama (Web Push + zil); ayri sekil secimi kaldirildi
  // v21 M8 - iOS tarzi: yinele + erken animsatici + tekrar bitis state
  const [hatirlatmaTekrar, setHatirlatmaTekrar] = useState<string>(not.hatirlatmaTekrar ?? "");
  const [hatirlatmaErkenDakika, setHatirlatmaErkenDakika] = useState<number | null>(not.hatirlatmaErkenDakika ?? null);
  // Faz A - haftanin gunleri (int[]; 1=Pzt..7=Paz). JSON string olarak kaydedilir.
  const [hatirlatmaHaftaGunleri, setHatirlatmaHaftaGunleri] = useState<number[]>(() => {
    if (!not.hatirlatmaHaftaGunleri) return [];
    try { return JSON.parse(not.hatirlatmaHaftaGunleri) as number[]; } catch { return []; }
  });
  const [hatirlatmaTekrarBitis, setHatirlatmaTekrarBitis] = useState<string>(() => {
    if (!not.hatirlatmaTekrarBitis) return "";
    const d = new Date(not.hatirlatmaTekrarBitis);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  const hatirlatmaSekli = "uygulama" as const;

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
      const hatirlatmaIso = hatirlaticiAcik ? new Date(hatirlatmaZamani).toISOString() : null;

      if (yeniMod) {
        // Yeni not: tek POST ile butunsel olustur (baslik + icerik + klasor + varsa hatirlatici).
        return notApi.create({
          baslik: baslikTrim,
          icerik: icerikTrim,
          klasorId,
          ...(hatirlatmaIso
            ? {
                hatirlatmaZamani: hatirlatmaIso,
                hatirlatmaAliciIdler,
                hatirlatmaSekli: hatirlatmaSekli as "uygulama" | "email" | "her_ikisi",
                hatirlatmaTekrar: hatirlatmaTekrar || null,
                hatirlatmaTekrarBitis: hatirlatmaTekrarBitis ? new Date(hatirlatmaTekrarBitis).toISOString() : null,
                hatirlatmaErkenDakika: hatirlatmaErkenDakika,
                hatirlatmaHaftaGunleri: hatirlatmaTekrar === "haftalik_secili" && hatirlatmaHaftaGunleri.length > 0
                  ? JSON.stringify([...hatirlatmaHaftaGunleri].sort((a, b) => a - b))
                  : null,
              }
            : {}),
        });
      }

      if (hatirlaticiAcik) {
        // datetime-local kullanıcı TZ'sinde → ISO UTC string
        return notApi.update(not.id, {
          baslik: baslikTrim,
          icerik: icerikTrim,
          klasorId,
          degisiklikAciklamasi: aciklamaTrim,
          hatirlatmaZamani: hatirlatmaIso!,
          hatirlatmaAliciIdler,
          hatirlatmaSekli: hatirlatmaSekli as "uygulama" | "email" | "her_ikisi",
          hatirlatmaTekrar: hatirlatmaTekrar || null,
          hatirlatmaTekrarBitis: hatirlatmaTekrarBitis ? new Date(hatirlatmaTekrarBitis).toISOString() : null,
          hatirlatmaErkenDakika: hatirlatmaErkenDakika,
          hatirlatmaHaftaGunleri: hatirlatmaTekrar === "haftalik_secili" && hatirlatmaHaftaGunleri.length > 0
            ? JSON.stringify([...hatirlatmaHaftaGunleri].sort((a, b) => a - b))
            : null,
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
      toast.success(yeniMod ? "Not oluşturuldu" : "Güncellendi");
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


  const klasorDegisti = klasorId !== not.klasorId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{yeniMod ? "Yeni Not" : "Notu Düzenle"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Label htmlFor="baslik">Başlık</Label>
            <Textarea id="baslik" rows={3} value={baslik} onChange={(e) => { const v = e.target.value.slice(0, 200); setBaslik(v); mentionYakala(v, e.target.selectionStart ?? v.length, "baslik"); }} className="resize-none text-justify" />
            <p className="text-right text-[11px] text-clay-400 dark:text-ink-300 mt-1 tabular-nums">{baslik.length}/200</p>
            {mentionAktif === "baslik" && <MentionOneriler sorgu={mentionSorgu} uyeler={mentionUyeler ?? []} onSec={mentionSec} />}
          </div>
          <div className="relative">
            <Label htmlFor="icerik">İçerik</Label>
            <Textarea
              id="icerik" value={icerik}
              rows={8}
              onChange={(e) => { const v = maddeBaslariniBuyut(e.target.value.slice(0, 5000)); setIcerik(v); mentionYakala(v, e.target.selectionStart ?? v.length, "icerik"); }}
              onKeyDown={icerikKeyDown}
              onFocus={icerikFocus}
              placeholder="Nota ait detayları ve gelişmeleri buraya yazın. Her satır ayrı bir madde olarak listelenir."
            />
            <p className="text-justify text-right text-[11px] text-clay-400 dark:text-ink-300 mt-1 tabular-nums">{icerik.length}/5000</p>
            {mentionAktif === "icerik" && <MentionOneriler sorgu={mentionSorgu} uyeler={mentionUyeler ?? []} onSec={mentionSec} />}
          </div>
          <div>
            <Label htmlFor="klasor">
              {not.klasorId ? "Bulunduğu klasör" : "Klasöre taşı (isteğe bağlı)"}
            </Label>
            <KlasorSecici
              value={klasorId}
              onChange={setKlasorId}
              klasorler={klasorler ?? []}
              klasorEtiketi={(k) => klasorEtiketi(k, klasorler)}
              tetik={
                <button
                  type="button"
                  className="h-11 w-full flex items-center justify-between rounded-xl border border-clay-200 dark:border-ink-700 bg-white dark:bg-ink-850 px-4 text-[15px] text-clay-900 dark:text-ink-50 focus:outline-none focus:border-clay-400 focus:ring-2 focus:ring-clay-900/5 transition-colors data-[state=open]:border-clay-400"
                >
                  <span className={cn("truncate", klasorId === null && "text-clay-400 dark:text-ink-300")}>
                    {(() => {
                      if (klasorId === null) return "Kategorize edilmemiş";
                      const secili = klasorler?.find((k) => k.id === klasorId);
                      return secili ? klasorEtiketi(secili, klasorler) : (not.klasorAdi ?? "");
                    })()}
                  </span>
                  <ChevronDown className="h-4 w-4 text-clay-400 dark:text-ink-300 shrink-0 ml-2" strokeWidth={2} />
                </button>
              }
            />
            {klasorDegisti && (
              <p className="text-xs text-terracotta-dark mt-1.5 italic">
                {klasorId === null
                  ? "Bu not klasörden çıkarılacak."
                  : `Bu not "${klasorEtiketi(klasorSecenekleri.find((k) => k.id === klasorId)!, klasorler)}" klasörüne taşınacak.`}
              </p>
            )}
          </div>
          {!yeniMod && (
            <div>
              <Label htmlFor="aciklama">Değişiklik açıklaması (isteğe bağlı)</Label>
              <Input
                id="aciklama" value={aciklama}
                onChange={(e) => setAciklama(e.target.value)}
                placeholder="Örn. Tarihi güncelledim"
              />
            </div>
          )}

          {/* HATIRLATICI — toggle + 3 zorunlu alt alan */}
          <div className="pt-1">
            <button
              type="button"
                            onClick={() => {
                setHatirlaticiAcik((v) => {
                  const yeni = !v;
                  // Acilirken deger bossa "simdi + 1 saat" ile doldur (kutu bos gorunmesin).
                  if (yeni && !hatirlatmaZamani) {
                    const d = new Date();
                    d.setHours(d.getHours() + 1);
                    const pad = (n: number) => String(n).padStart(2, "0");
                    setHatirlatmaZamani(
                      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
                    );
                  }
                  return yeni;
                });
              }}
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
                  className="h-11 w-full appearance-none rounded-xl border border-cream-300 dark:border-ink-700 bg-white dark:bg-ink-850 px-4 text-[15px] text-clay-900 dark:text-ink-50 text-left [&::-webkit-date-and-time-value]:text-left focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/15 transition-colors"
                />
              </div>
              {/* v21 M8 - Yinele + Erken animsatici (iOS Reminders deseni) */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="hatirlatma-tekrar">Yinele</Label>
                  <select
                    id="hatirlatma-tekrar"
                    value={hatirlatmaTekrar}
                    onChange={(e) => setHatirlatmaTekrar(e.target.value)}
                    className="h-11 w-full appearance-none rounded-xl border border-cream-300 dark:border-ink-700 bg-white dark:bg-ink-850 px-3 text-[14px] text-clay-900 dark:text-ink-50 focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/15 transition-colors"
                  >
                    <option value="">Hiç</option>
                    <option value="saatlik">Her saat</option>
                    <option value="gunluk">Her gün</option>
                    <option value="haftalik">Her hafta</option>
                    <option value="haftalik_secili">Haftanın belirli günleri</option>
                    <option value="iki_haftalik">İki haftada bir</option>
                    <option value="aylik">Her ay</option>
                    <option value="yillik">Her yıl</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="hatirlatma-erken">Erken anımsatıcı</Label>
                  <select
                    id="hatirlatma-erken"
                    value={hatirlatmaErkenDakika ?? ""}
                    onChange={(e) => setHatirlatmaErkenDakika(e.target.value === "" ? null : Number(e.target.value))}
                    className="h-11 w-full appearance-none rounded-xl border border-cream-300 dark:border-ink-700 bg-white dark:bg-ink-850 px-3 text-[14px] text-clay-900 dark:text-ink-50 focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/15 transition-colors"
                  >
                    <option value="">Yok</option>
                    <option value="5">5 dakika önce</option>
                    <option value="15">15 dakika önce</option>
                    <option value="60">1 saat önce</option>
                    <option value="1440">1 gün önce</option>
                  </select>
                </div>
              </div>
              {/* Tekrar seciliyse bitis tarihi (opsiyonel; bos = suresiz) */}
              {/* Faz A - haftalik_secili: gun secici + B4 hizli gruplar */}
              {hatirlatmaTekrar === "haftalik_secili" && (
                <div className="space-y-2">
                  <div className="flex gap-1.5 flex-wrap">
                    {([[1,"Pzt"],[2,"Sal"],[3,"Çar"],[4,"Per"],[5,"Cum"],[6,"Cmt"],[7,"Paz"]] as [number, string][]).map(([gun, ad]) => {
                      const secili = hatirlatmaHaftaGunleri.includes(gun);
                      return (
                        <button key={gun} type="button"
                          onClick={() => setHatirlatmaHaftaGunleri((o) =>
                            o.includes(gun) ? o.filter((x) => x !== gun) : [...o, gun])}
                          className={`h-9 w-9 rounded-full text-[12px] font-medium transition-colors ${secili
                            ? "bg-terracotta text-cream-50"
                            : "border border-cream-300 dark:border-ink-700 text-clay-500 dark:text-ink-200 hover:border-terracotta/50"}`}>
                          {ad}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {([["Hafta içi",[1,2,3,4,5]],["Hafta sonu",[6,7]],["Her gün",[1,2,3,4,5,6,7]]] as [string, number[]][]).map(([ad, gunler]) => (
                      <button key={ad} type="button"
                        onClick={() => setHatirlatmaHaftaGunleri(gunler)}
                        className="text-[11px] px-2.5 py-1 rounded-lg border border-cream-300 dark:border-ink-700 text-clay-600 dark:text-ink-100 hover:border-terracotta/50 hover:bg-cream-100 dark:hover:bg-ink-800 transition-colors">
                        {ad}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {hatirlatmaTekrar !== "" && (
                <div>
                  <Label htmlFor="hatirlatma-bitis">Tekrarı şu tarihe kadar sürdür (isteğe bağlı)</Label>
                  <input
                    id="hatirlatma-bitis"
                    type="date"
                    value={hatirlatmaTekrarBitis}
                    min={hatirlatmaZamani ? hatirlatmaZamani.slice(0, 10) : undefined}
                    onChange={(e) => setHatirlatmaTekrarBitis(e.target.value)}
                    className="h-11 w-full appearance-none rounded-xl border border-cream-300 dark:border-ink-700 bg-white dark:bg-ink-850 px-4 text-[15px] text-clay-900 dark:text-ink-50 text-left [&::-webkit-date-and-time-value]:text-left focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/15 transition-colors"
                  />
                </div>
              )}
              {/* B1 - canli ozet satiri (iOS deseni): secimlerin sonucu tek cumlede */}
              {/* Faz A - gecmis zaman korumasi (frontend katman; backend de reddeder) */}
              {hatirlatmaZamani && new Date(hatirlatmaZamani) <= new Date() && (
                <p className="text-[12px] text-red-600 dark:text-red-400 leading-relaxed px-1">
                  Geçmiş bir zamana hatırlatıcı kurulamaz. Lütfen ileri bir zaman seçin.
                </p>
              )}
              {hatirlatmaZamani && (
                <p className="text-[12px] text-clay-500 dark:text-ink-200 leading-relaxed px-1">
                  {hatirlaticiOzet(hatirlatmaZamani, hatirlatmaTekrar, hatirlatmaErkenDakika, hatirlatmaTekrarBitis, hatirlatmaHaftaGunleri)}
                </p>
              )}
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
              (hatirlaticiAcik && (!hatirlatmaZamani || hatirlatmaAliciIdler.length === 0))
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
  const qc = useQueryClient();
  const { data: detayKlasorler } = useQuery({
    queryKey: ["klasorler"],
    queryFn: klasorApi.list,
    enabled: open,
  });
  const detayTasi = useMutation({
    mutationFn: (klasorId: string | null) =>
      notApi.update(not.id, {
        baslik: not.baslik,
        icerik: not.icerik,
        klasorId,
        hatirlatmaSil: false,
        degisiklikAciklamasi: null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notlar"] });
      qc.invalidateQueries({ queryKey: ["klasorler"] });
      toast.success("Klasör güncellendi");
    },
    onError: (err: Error) => toast.error(err.message),
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

// Duzenlendi kaydinda ne degistigini eski/yeni JSON snapshot'larindan cikarir (baslik/icerik/klasor).
// Diger kullanicilar cok sonra baksa bile hangi alanin degistigini net anlar.
function degisenAlanlar(eski: string | null, yeni: string | null): string | null {
  if (!eski || !yeni) return null;
  try {
    const e = JSON.parse(eski);
    const y = JSON.parse(yeni);
    const degisen: string[] = [];
    if ((e.Baslik ?? "") !== (y.Baslik ?? "")) degisen.push("başlık");
    if ((e.Icerik ?? "") !== (y.Icerik ?? "")) degisen.push("içerik");
    if ((e.KlasorId ?? null) !== (y.KlasorId ?? null)) degisen.push("klasör");
    if (degisen.length === 0) return null;
    const metin = degisen.join(", ");
    return metin.charAt(0).toUpperCase() + metin.slice(1) + " değiştirildi";
  } catch {
    return null;
  }
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
  const degisenler = degisenAlanlar(g.eskiDeger, g.yeniDeger);
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
        {degisenler && (
          <p className="text-[11px] text-clay-400 dark:text-ink-300 mt-1.5 italic">{degisenler}</p>
        )}
      </div>
    </div>
  );
}

// Klasor badge - bekleyen notta tiklanabilir (KlasorSecici ile tasima + yeni klasor); tamamlanan notta salt gosterim.
function KlasorBadge({
  not,
  klasorler,
  onTasi,
}: {
  not: Not;
  klasorler: Klasor[] | undefined;
  onTasi: (klasorId: string | null) => void;
}) {
  const doluGorunum = (
    <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-terracotta/12 text-terracotta-dark font-medium text-[10px] sm:text-[11px] leading-none min-w-0 max-w-[160px]">
      <Folder className="h-2.5 w-2.5 sm:h-3 sm:w-3" strokeWidth={2} />
      <span className="truncate min-w-0 max-w-[130px] sm:max-w-[150px]">{not.klasorAdi}</span>
    </span>
  );

  // Tamamlanan not: Tamamlananlar sistem klasorunde, tasima yok (defense in depth: backend de NOT_TAMAMLANMIS_DUZENLENEMEZ reddeder).
  if (not.tamamlandi) {
    if (!not.klasorAdi) return null;
    return doluGorunum;
  }

  const doluTetik = (
    <button type="button" className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-terracotta/12 text-terracotta-dark font-medium text-[10px] sm:text-[11px] leading-none hover:bg-terracotta/20 transition-colors cursor-pointer data-[state=open]:bg-terracotta/25 min-w-0 max-w-[160px]">
      <Folder className="h-2.5 w-2.5 sm:h-3 sm:w-3" strokeWidth={2} />
      <span className="truncate min-w-0 max-w-[130px] sm:max-w-[150px]">{not.klasorAdi}</span>
    </button>
  );

  const bosTetik = (
    <button type="button" className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full border border-dashed border-clay-300 dark:border-ink-600 text-clay-400 dark:text-ink-300 font-medium text-[10px] sm:text-[11px] leading-none hover:border-terracotta hover:text-terracotta transition-colors cursor-pointer data-[state=open]:border-terracotta data-[state=open]:text-terracotta">
      <Plus className="h-2.5 w-2.5 sm:h-3 sm:w-3" strokeWidth={2.5} />
      <span>Klasöre ekle</span>
    </button>
  );

  return (
    <KlasorSecici
      value={not.klasorId}
      onChange={onTasi}
      klasorler={klasorler ?? []}
      klasorEtiketi={(k) => klasorEtiketi(k, klasorler)}
      tetik={not.klasorAdi ? doluTetik : bosTetik}
    />
  );
}

// Tek not kartı

// icerik her satirini "- madde" formatina normalize eder (cift tire onler; tire'siz eski notlara otomatik ekler)
function maddeBaslariniBuyut(icerik: string): string {
  return icerik.replace(
    /(^|\n)(- )(\p{Ll})/gu,
    (_esles, ayrac, tire, harf) => ayrac + tire + harf.toLocaleUpperCase("tr-TR")
  );
}

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
// ============================================================================
// v21 M1 - MentionMetin: metindeki "@Ad Soyad" gecislerini MAVI gosterir.
// Adlar uyeler cache'inden gelir; EN UZUN ad once denenir (kismi golgeleme
// onlenir). Eslesmeyen "@" duz metin kalir (backend Ordinal ile ayni felsefe).
// ============================================================================
function MentionMetin({ metin, terim, adlar }: { metin: string; terim: string; adlar: string[] }) {
  if (adlar.length === 0 || !metin.includes("@")) return <Vurgula metin={metin} terim={terim} />;
  const sirali = [...adlar].sort((a, b) => b.length - a.length);
  const parcalar: ReactNode[] = [];
  let kalan = metin;
  let k = 0;
  while (kalan.length > 0) {
    const i = kalan.indexOf("@");
    if (i === -1) { parcalar.push(<Vurgula key={k++} metin={kalan} terim={terim} />); break; }
    if (i > 0) parcalar.push(<Vurgula key={k++} metin={kalan.slice(0, i)} terim={terim} />);
    const ad = sirali.find((a) => kalan.startsWith("@" + a, i));
    if (ad) {
      parcalar.push(
        <span key={k++} className="text-blue-600 dark:text-blue-400 font-medium">@{ad}</span>
      );
      kalan = kalan.slice(i + ad.length + 1);
    } else {
      parcalar.push(<span key={k++}>@</span>);
      kalan = kalan.slice(i + 1);
    }
  }
  return <>{parcalar}</>;
}

// ============================================================================
// v21 M1 - MentionOneriler: @ yazarken filtreli uye onerileri (WhatsApp deseni).
// onMouseDown preventDefault: textarea odagi kaybolmadan tiklama islenir.
// ============================================================================
function MentionOneriler({
  sorgu, uyeler, onSec,
}: { sorgu: string; uyeler: TenantUye[]; onSec: (ad: string) => void }) {
  const filtreli = uyeler
    .filter((u) => u.adSoyad.toLowerCase().includes(sorgu.toLowerCase()))
    .slice(0, 6);
  if (filtreli.length === 0) return null;
  return (
    <div className="absolute z-50 left-0 right-0 top-full mt-1 p-1.5 rounded-xl bg-white dark:bg-ink-800 border border-cream-300 dark:border-ink-600 shadow-lg max-h-44 overflow-y-auto">
      {filtreli.map((u) => (
        <button
          key={u.kullaniciId}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSec(u.adSoyad)}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-cream-100 dark:hover:bg-ink-700 transition-colors"
        >
          <span className="h-5 w-5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[9px] font-semibold inline-flex items-center justify-center shrink-0">
            {bastari(u.adSoyad)}
          </span>
          <span className="text-[13px] text-clay-800 dark:text-ink-50 truncate">{u.adSoyad}</span>
        </button>
      ))}
    </div>
  );
}


const IKON_BUTON = "min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] inline-flex items-center justify-center rounded-md transition-colors";

// BV4 - Yeniden Zamanla: paylasilan bilesen (kart dokum + takvim ayni; tek dogruluk kaynagi).
// notApi.update ile mevcut hatirlatici alanlarini KORUR, sadece hatirlatmaZamani degisir.
// datetime mevcut zamanla dolu gelir (iOS); min=simdi. invalidate -> her yerde anlik senkron.
export function YenidenZamanla({ not, onBitti }: { not: Not; onBitti?: () => void }) {
  const qc = useQueryClient();
  const isoToLocal = (iso: string) => {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const [yeniZaman, setYeniZaman] = useState<string>(
    not.hatirlatmaZamani ? isoToLocal(not.hatirlatmaZamani) : ""
  );
  const simdiLocal = isoToLocal(new Date().toISOString());

  const zamanla = useMutation({
    mutationFn: () =>
      notApi.update(not.id, {
        baslik: not.baslik,
        icerik: not.icerik,
        klasorId: not.klasorId,
        // Mevcut hatirlatici alanlarini KORU (backend validasyonu: alici+sekil zorunlu).
        hatirlatmaZamani: new Date(yeniZaman).toISOString(),
        hatirlatmaAliciIdler: not.hatirlatmaAliciIdler ?? [],
        hatirlatmaSekli: (not.hatirlatmaSekli ?? "uygulama") as "uygulama" | "email" | "her_ikisi",
        hatirlatmaTekrar: not.hatirlatmaTekrar,
        hatirlatmaTekrarBitis: not.hatirlatmaTekrarBitis,
        hatirlatmaErkenDakika: not.hatirlatmaErkenDakika,
        hatirlatmaHaftaGunleri: not.hatirlatmaHaftaGunleri,
        degisiklikAciklamasi: null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notlar"] });
      toast.success("Hatırlatıcı yeniden zamanlandı");
      onBitti?.();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!not.hatirlatmaZamani) return null;
  const gecmisSecildi = yeniZaman !== "" && new Date(yeniZaman) <= new Date();

  return (
    <div className="mt-2 pt-2 border-t border-cream-200 dark:border-ink-700">
      <p className="text-[10px] font-medium text-clay-500 dark:text-ink-300 mb-1">Yeniden zamanla</p>
      <input
        type="datetime-local"
        value={yeniZaman}
        min={simdiLocal}
        onChange={(e) => setYeniZaman(e.target.value)}
        className="h-9 w-full appearance-none rounded-lg border border-cream-300 dark:border-ink-700 bg-white dark:bg-ink-850 px-2 text-[12px] text-clay-900 dark:text-ink-50 text-left [&::-webkit-date-and-time-value]:text-left focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/15 transition-colors"
      />
      {gecmisSecildi && (
        <p className="text-[10px] text-red-600 dark:text-red-400 mt-1">Geçmiş bir zaman seçilemez.</p>
      )}
      <button
        type="button"
        disabled={!yeniZaman || gecmisSecildi || zamanla.isPending}
        onClick={() => zamanla.mutate()}
        className="mt-1.5 w-full h-8 rounded-lg bg-terracotta text-cream-50 text-[12px] font-medium hover:bg-terracotta/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-1.5"
      >
        {zamanla.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Uygula
      </button>
    </div>
  );
}

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
    enabled: !!not.hatirlatmaZamani || (not.baslik + (not.icerik ?? "")).includes("@"),  // v21 M1 - mention render icin de uyeler
    staleTime: 60_000,
  });
  const { data: kartKlasorler } = useQuery({
    queryKey: ["klasorler"],
    queryFn: klasorApi.list,
  });

  // Klasore tasima (badge/detay uzerinden anlik). 1a: mevcut degerleri aynen gecir, sadece klasorId degisir;
  // hatirlatma alanlari gonderilmez -> backend hatirlaticiyi korur (hatirlatmaSil:false).
  const tasima = useMutation({
    mutationFn: (klasorId: string | null) =>
      notApi.update(not.id, {
        baslik: not.baslik,
        icerik: not.icerik,
        klasorId,
        hatirlatmaSil: false,
        degisiklikAciklamasi: null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notlar"] });
      qc.invalidateQueries({ queryKey: ["klasorler"] });
      toast.success("Klasör güncellendi");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // BV5 - kart hatirlatma durumu (takvimle tutarli: gecikmis/gelecek/tamam).
  const kartDurum = hatirlatmaDurumu(not);
  const kartTekrarEtiket = tekrarKisaEtiket(not.hatirlatmaTekrar, not.hatirlatmaHaftaGunleri);
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

  // v21 B3 - okunmamis "bahsedildi" bildirimi olan kartta rozet (cache aboneligi;
  // enabled:false = ekstra istek yok, UserMenu'nun sorgusuna ortak olur)
  const { data: bildirimVeri } = useQuery({
    queryKey: ["bildirimler"],
    queryFn: () => bildirimApi.list(),
    enabled: false,
  });
  const bendenBahsedildi = !not.tamamlandi && (bildirimVeri?.bildirimler ?? []).some(
    (b) => b.tip === "bahsedildi" && b.notId === not.id && !b.okunduMu
  );

  // v21 M1 - mention render adlari: yalniz @ iceren kartta uye adlari kullanilir
  const mentionAdlar = (not.baslik + " " + (not.icerik ?? "")).includes("@")
    ? (tenantUyeler ?? []).map((u) => u.adSoyad)
    : [];

  // v21 M4 - basa tuttur (tenant basina TEK pin; eski pin backend'te AYNI transaction'da duser)
  const pinle = useMutation({
    mutationFn: () => notApi.basaTuttur(not.id),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["notlar"] });
      toast.success(r.basaTutuldu ? "Not başa tutturuldu" : "Başa tutturma kaldırıldı");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // kart ekranin %60'i kadar gorununce okundu isaretle (yeni/degisen ise, bir kez)
  useEffect(() => {
    const el = kartRef.current;
    if (!el) return;
    const gormeli = not.benimSonGorme === null ||
      new Date(not.benimSonGorme).getTime() < new Date(not.guncellemeZamani).getTime();
    // Defense in depth katman 2: super admin salt-okunur goruntulemede okundu gonderilmez (backend de reddeder)
    if (!gormeli || not.tamamlandi || ben?.goruntulemeModu) return;
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
    onSuccess: (acilan) => {
      qc.invalidateQueries({ queryKey: ["notlar"] });
      qc.invalidateQueries({ queryKey: ["klasorler"] }); // v12 — eski klasöre geri taşıma sayıları
      // BT-2 - gecmis hatirlatici nazik oneri: hatirlatma gecmisteyse yeniden zamanlamayi oner.
      if (acilan.hatirlatmaZamani && new Date(acilan.hatirlatmaZamani) <= new Date()) {
        toast("Not yeniden açıldı", {
          description: "Hatırlatıcısı geçmişte kaldı. Yeniden zamanlamak ister misiniz?",
          action: {
            label: "Yeniden zamanla",
            onClick: () => setHatirlatmaDokumAcik(true),
          },
        });
      } else {
        toast.success("Yeniden açıldı");
      }
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
        not.basaTutuldu && "border-terracotta/50",  // v21 M4 - pinli kart ayrimi
        not.tamamlandi && "bg-cream-200 dark:bg-ink-800/40 border-cream-300 dark:border-ink-700",
        yeniVeyaDegismis && "ring-2 ring-terracotta border-terracotta bg-terracotta/[0.05] shadow-md"
      )}>
      <div className="flex items-start gap-2.5 sm:gap-3">
        {/* v21 M4 (K3) - sol sutun: ustte tamamlandi karesi, altta pin (ayni dusey hiza) */}
        <div className="flex flex-col items-center justify-between self-stretch shrink-0 gap-2">
        <Checkbox
          checked={not.tamamlandi}
          onCheckedChange={() => not.tamamlandi ? yenidenAc.mutate() : setTamamlaAcik(true)}
          className="mt-0.5 shrink-0"
        />
          {/* v21 M4 (K3) - basa tuttur: checkbox ile AYNI SUTUN = ayni dusey hiza;
              paylas ikonunun hemen solunda, alt menu kipirdamadan */}
          {!not.tamamlandi && !not.silindi && (
            <button
              type="button"
              onClick={() => pinle.mutate()}
              disabled={pinle.isPending}
              aria-label={not.basaTutuldu ? "Başa tutturmayı kaldır" : "Başa tuttur"}
              title={not.basaTutuldu ? "Başa tutturmayı kaldır" : "Başa tuttur"}
              className={cn(
                "p-1 rounded-md transition-colors",
                not.basaTutuldu
                  ? "text-terracotta hover:bg-terracotta/10"
                  : "text-clay-300 dark:text-ink-500 hover:text-terracotta hover:bg-cream-200 dark:hover:bg-ink-800"
              )}
            >
              <Pin className={cn("h-4 w-4", not.basaTutuldu && "fill-current")} />
            </button>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {/* Üst satır: oluşturan bilgisi (başlığın bir üstünde, sağa yaslı; başlığı daraltmaz). Sıra: avatar, ad, zaman */}
          <div className="flex items-center justify-between gap-2 mb-3 text-[11px] text-clay-400 dark:text-ink-300">
            {/* v20.2 madde 11 - klasor SOL UST kosede; alt-soldaki eski yeri A4'te WhatsApp iletimine acilir */}
            {klasorBadgeGoster ? <KlasorBadge not={not} klasorler={kartKlasorler} onTasi={(id) => tasima.mutate(id)} /> : <span />}
            <span className="flex items-center gap-1.5 min-w-0">
            <span className="h-4 w-4 rounded-full bg-clay-200 dark:bg-ink-700 text-clay-700 dark:text-ink-100 inline-flex items-center justify-center text-[8px] font-medium shrink-0">
              {bastari(not.olusturanAdSoyad)}
            </span>
            <span className="truncate">{not.olusturanAdSoyad.split(" ")[0]}</span>
            <span className="text-clay-300 dark:text-ink-400">·</span>
            <span className="shrink-0" title={`Oluşturma: ${tarihFormat(not.olusturmaZamani)}`}>{gorelizamandan(not.guncellemeZamani)}</span>
            </span>
          </div>
          {/* Başlık: tam genişlik, daralmaz */}
          <h4 className={cn(
            "text-sm sm:text-[15px] leading-snug font-medium break-words [overflow-wrap:anywhere] text-justify hyphens-auto",
            not.tamamlandi ? "line-through text-clay-400 dark:text-ink-300" : "text-clay-900 dark:text-ink-50"
          )}>
            <MentionMetin metin={not.baslik} terim={aramaTerimi} adlar={mentionAdlar} />
          </h4>
          {/* v21 B3 - okunmamis bahsedildi bildirimi olan kartta rozet */}
          {bendenBahsedildi && (
            <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-full bg-terracotta/15 text-terracotta text-[10px] font-medium">senden bahsedildi</span>
          )}

          {/* İçerik — her satır "- madde" (eski/yeni notlar tutarlı), iki yana yaslı */}
          {not.icerik && (
            <p className={cn(
              "text-[13px] sm:text-sm mt-3 leading-relaxed text-justify hyphens-auto break-words [overflow-wrap:anywhere] whitespace-pre-wrap",
              not.tamamlandi ? "text-clay-400 dark:text-ink-300" : "text-clay-600 dark:text-ink-100"
            )}>
              <MentionMetin metin={icerikTireli(not.icerik)} terim={aramaTerimi} adlar={mentionAdlar} />
            </p>
          )}

          {/* Tamamlanma açıklaması varsa terracotta vurgulu blok */}
          {not.tamamlandi && not.tamamlanmaAciklamasi && (
            <div className="mt-2 p-2 sm:p-2.5 bg-terracotta/8 border-l-2 border-terracotta rounded-r-lg">
              <p className="text-[11px] sm:text-xs text-clay-500 dark:text-ink-200 mb-0.5">
                {not.tamamlayanAdSoyad} tamamladı · {tarihFormat(not.tamamlanmaZamani)}
              </p>
              <p className="text-[13px] sm:text-sm text-clay-700 dark:text-ink-100 text-justify hyphens-auto break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
                {not.tamamlanmaAciklamasi}
              </p>
            </div>
          )}

          {/* Alt satır: [Klasör] [aksiyon ikonlar] · okuyanlar (mobilde de görünür) */}
          <div className="flex items-center gap-2.5 sm:gap-3.5 mt-3.5 text-[11px] sm:text-xs flex-wrap">
            {/* v20.3 - Notu Paylas (OS menusu; yalnizca goruntu - off-screen sahneden) */}
            <NotIletButonu not={not} ikonSinifi={IKON_BUTON} />

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
                      kartDurum === "gecikmis" ? "text-red-500" : not.hatirlatmaGonderildiMi ? "text-clay-400 dark:text-ink-300" : "text-terracotta"
                    )}
                  >
                    <Bell className="h-3.5 w-3.5" fill={not.hatirlatmaGonderildiMi ? "none" : "currentColor"} strokeWidth={2} />
                    <span className="text-[9px] leading-none mt-0.5 font-medium whitespace-nowrap">{hatirlatmaKisaTarih}</span>
                    {not.hatirlatmaTekrar && (
                      <span className="text-[8px] leading-none text-terracotta whitespace-nowrap" title="Yinelenen hatırlatıcı">↻ {kartTekrarEtiket}</span>
                    )}
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
                        {not.hatirlatmaGonderildiMi && (
                          <p className="text-[10px] text-clay-400 dark:text-ink-400 mt-1 italic">Gönderildi</p>
                        )}
                        {not.tamamlandi ? (
                          <div className="mt-2 pt-2 border-t border-cream-200 dark:border-ink-700">
                            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                              <span>
                                Bu hatırlatıcı tamamlandı
                                {not.tamamlanmaZamani
                                  ? ` - ${new Date(not.tamamlanmaZamani).toLocaleDateString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}`
                                  : ""}
                              </span>
                            </p>
                          </div>
                        ) : (
                          <YenidenZamanla not={not} onBitti={() => setHatirlatmaDokumAcik(false)} />
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
                  onClick={() => not.tamamlandi ? toast.error("Tamamlananlar klasöründeki bir not düzenlenemez. Düzenlemek için önce notun tamamlandİ işaretini (tik) kaldİrİp notu Tamamlananlar klasöründen çİkarİn, ardİndan düzenleyebilirsiniz.") : setDuzenleAcik(true)}
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

            {/* v21 M9 - tamamlanan notta goruldu listesi gosterilmez (herkes gordu kabul);
                yeniden acilirsa okundu verisi durdugundan liste kendiliginden geri gelir */}
            {!not.tamamlandi && okuyanlarGosterilen.length > 0 && (
              <div className="relative order-2">
                <button
                  type="button"
                  onClick={() => setOkuyanlarAcik((v) => !v)}
                  aria-label={`${okuyanlarGosterilen.length} kişi gördü`}
                  className="flex items-center gap-1 px-1 py-0.5 rounded-md hover:bg-cream-200 dark:hover:bg-ink-800 transition-colors"
                >
                  <span className="flex -space-x-1.5">
                    {okuyanlarGosterilen.slice(0, 2).map((o) => (
                      <span
                        key={o.kullaniciId}
                        title={o.adSoyad}
                        className="h-5 w-5 rounded-full bg-terracotta/15 text-terracotta text-[9px] font-semibold inline-flex items-center justify-center ring-1 ring-white dark:ring-ink-900"
                      >
                        {bastari(o.adSoyad)}
                      </span>
                    ))}
                  </span>
                  {okuyanlarGosterilen.length > 2 && (
                    <span className="text-[10px] text-clay-400 dark:text-ink-300">+{okuyanlarGosterilen.length - 2}</span>
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
    // Goruldu verisi (okuyanlar) bu sorgudan gelir. SSE varsa anlik tazeler; SSE kurulamazsa/koparsa
    // asagidaki kisa polling + odak/yeniden-baglanma tazelemesi garanti verir (sayfa yenilemeye gerek yok).
    refetchInterval: aramaVar ? false : 4_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  // v19 Faz 3 Adim 2 - canli okundu: tenant akisina baglan, not_okundu olayinda listeyi tazele
  useEffect(() => {
    const kapat = akisBaglan(
      (o) => {
        // Anlik yansima: goruldu (okundu) + not degisikligi (guncelleme/tamamlama/yeniden acma) olaylarinda listeyi tazele.
        // Boylece bir kullanici notu degistirince digerlerinin goruldu listesi sayfa yenilemeden aninda sifirlanir.
        if (["not_okundu", "not_guncellendi", "not_tamamlandi", "not_yeniden_acildi"].includes(o.olay)) {
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
    <div className="sticky top-0 z-20 -mx-1 px-1 pt-1 pb-2 mb-2 bg-cream-100/85 dark:bg-ink-800/85 backdrop-blur-md flex items-center gap-2 sm:gap-3">
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
              <p className="text-sm text-clay-700 dark:text-ink-100 line-clamp-3 leading-relaxed whitespace-pre-wrap text-justify hyphens-auto">
                {icerikTireli(not.icerik)}
              </p>
            </div>
          )}

          {not.klasorAdi && (
            <div className="flex items-center gap-1.5 text-xs text-clay-500 dark:text-ink-200">
              <Folder className="h-3.5 w-3.5 text-terracotta" />
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
