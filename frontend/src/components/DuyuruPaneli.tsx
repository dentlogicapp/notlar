"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCheck, Info, Loader2, Megaphone, Pencil, Send, Trash2, Users, X } from "lucide-react";
import { duyuruApi } from "@/lib/api";
import { useBen } from "@/lib/useBen";
import { akisBaglan } from "@/lib/akis";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "./ui/dialog";
import { cn, gorelizamandan, bastari } from "@/lib/utils";
import type { DuyuruOzet } from "@/lib/types";

// v20.2.1 - Duyuru alani.
//   SwipeSil: overflow-hidden + transform YALNIZ kaydirma aninda (kalici halleri
//   popover'lari kesiyor/komsu kartin altina itiyordu - G.4 kok nedenleri).
//   Goren listeleri: estetik POPOVER (absolute z-50, golgeli) + hata durumu.
//   Diger her sey v20.2: NotKart tipografisi (madde 3), duzenleme + goruldu
//   sifirlama (madde 6), "(duzenlendi)" rozeti (B1), banner, observer (madde 8).
const ICERIK_LIMIT = 500;
const DUYURU_OMRU_SAAT = 24;  // backend DuyuruEndpoints.TtlSaat + DuyuruTemizleyici.TtlSaat ile senkron
const SESSIZLIK_SAAT = 2;     // backend DuyuruTemizleyici.SessizlikSaat ile senkron
const SIL_GENISLIK = 84;
const DUYURU_OLAYLARI = [
  "duyuru_paylasildi", "duyuru_goruldu", "duyuru_yanitlandi", "duyuru_duzenlendi",
  "duyuru_silindi", "duyuru_yanit_goruldu", "duyuru_yaniti_silindi",
];

// ---------------------------------------------------------------------------
// SwipeSil - yon kilitli, KIRMIZISIZ, B2 iki-dokunus onayli.
// v20.2.1: overflow/transform kosullu (popover gorunurlugu icin sart).
// ---------------------------------------------------------------------------
function SwipeSil({
  aktif, onSil, siliniyor, children,
}: { aktif: boolean; onSil: () => void; siliniyor: boolean; children: ReactNode }) {
  const [kaydir, setKaydir] = useState(0);
  const [onay, setOnay] = useState(false);
  const bas = useRef<{ x: number; y: number } | null>(null);
  const yon = useRef<"yatay" | "dikey" | null>(null);
  const zamanlayici = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (zamanlayici.current) clearTimeout(zamanlayici.current); }, []);

  if (!aktif) return <>{children}</>;

  function basla(e: TouchEvent) {
    bas.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    yon.current = null;
  }
  function hareket(e: TouchEvent) {
    if (!bas.current) return;
    const dx = e.touches[0].clientX - bas.current.x;
    const dy = e.touches[0].clientY - bas.current.y;
    if (yon.current === null) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      yon.current = Math.abs(dx) > Math.abs(dy) ? "yatay" : "dikey";
    }
    if (yon.current !== "yatay") return;
    setKaydir(Math.max(Math.min(dx, 0), -SIL_GENISLIK));
  }
  function bitir() {
    bas.current = null;
    yon.current = null;
    setKaydir((k) => (k < -SIL_GENISLIK / 2 ? -SIL_GENISLIK : 0));
  }
  function silTikla() {
    if (!onay) {
      setOnay(true);
      zamanlayici.current = setTimeout(() => { setOnay(false); setKaydir(0); }, 3500);
      return;
    }
    if (zamanlayici.current) clearTimeout(zamanlayici.current);
    setOnay(false); setKaydir(0);
    onSil();
  }

  const kayiyor = kaydir !== 0;

  return (
    <div className={cn("relative rounded-xl", kayiyor && "overflow-hidden")}>
      {kayiyor && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); silTikla(); }}
          disabled={siliniyor}
          aria-label="Sil"
          className={cn(
            "absolute inset-y-0 right-0 flex items-center justify-center gap-1 text-[11px] font-semibold text-cream-50 disabled:opacity-50 transition-colors",
            onay ? "bg-clay-900 dark:bg-ink-950" : "bg-clay-700 dark:bg-ink-600"
          )}
          style={{ width: SIL_GENISLIK }}
        >
          {siliniyor ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          {onay ? "Emin?" : "Sil"}
        </button>
      )}
      <div
        onTouchStart={basla}
        onTouchMove={hareket}
        onTouchEnd={bitir}
        onClickCapture={(e) => {
          if (kayiyor) { e.stopPropagation(); e.preventDefault(); setKaydir(0); setOnay(false); }
        }}
        className={cn("relative", kayiyor && "transition-transform")}
        style={kayiyor ? { transform: `translateX(${kaydir}px)` } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DuyuruBanner (v20.2 ile ayni)
// ---------------------------------------------------------------------------
export function DuyuruBanner() {
  const { data: ben } = useBen();
  const router = useRouter();
  const { data: liste } = useQuery({
    queryKey: ["duyurular"],
    queryFn: duyuruApi.list,
    enabled: !!ben,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const durum = useMemo(() => {
    if (!ben || !liste) return null;
    const yeniDuyurular = liste.filter((d) => d.olusturanKullaniciId !== ben.id && !d.benGordum);
    const yanitli = liste.filter((d) => d.benGormedimMesajSayisi > 0);
    const yanitToplam = yanitli.reduce((s, d) => s + d.benGormedimMesajSayisi, 0);
    if (yeniDuyurular.length === 0 && yanitToplam === 0) return null;

    const enYeniDuyuru = yeniDuyurular[0] ?? null;
    const enYeniYanit = yanitli.reduce<DuyuruOzet | null>((a, d) => {
      if (!d.sonMesajZamani) return a;
      return !a || d.sonMesajZamani > (a.sonMesajZamani ?? "") ? d : a;
    }, null);

    const duyuruZamani = enYeniDuyuru?.guncellemeZamani ?? enYeniDuyuru?.olusturmaZamani ?? "";
    const yanitZamani = enYeniYanit?.sonMesajZamani ?? "";
    let hedefId: string;
    let kayarMetin: string;
    if (enYeniYanit && yanitZamani > duyuruZamani) {
      hedefId = enYeniYanit.id;
      kayarMetin = `"${enYeniYanit.sonMesajGonderenAdSoyad ?? "Bir üye"}" tarafından yeni duyuru yanıtı yazıldı. Hemen görmek için tıkla!`;
    } else if (enYeniDuyuru) {
      hedefId = enYeniDuyuru.id;
      kayarMetin = `"${enYeniDuyuru.olusturanAdSoyad}" tarafından yeni duyuru paylaşıldı. Hemen görmek için tıkla!`;
    } else {
      return null;
    }

    const sayac =
      yeniDuyurular.length > 0 && yanitToplam > 0
        ? `${yeniDuyurular.length} Yeni Duyuru · ${yanitToplam} Yanıt`
        : yeniDuyurular.length > 0
          ? `Okunmamış ${yeniDuyurular.length} Yeni Duyuru`
          : `Okunmamış ${yanitToplam} Yeni Duyuru Yanıtı`;

    return { hedefId, kayarMetin, sayac };
  }, [ben, liste]);

  if (!durum) return null;

  return (
    <div className="sticky top-[52px] sm:top-[60px] z-20 px-3 sm:px-6 pt-2">
      <div className="max-w-6xl mx-auto">
        <button
          type="button"
          onClick={() => router.replace(`/?duyuru=${durum.hedefId}`, { scroll: false })}
          className="w-full flex items-stretch rounded-xl overflow-hidden border border-terracotta/50 shadow-md bg-cream-50 dark:bg-ink-900 text-left"
        >
          <span className="shrink-0 flex items-center gap-1.5 bg-terracotta text-cream-50 px-3 py-2 text-[11px] sm:text-xs font-semibold animate-pulse">
            <Megaphone className="h-3.5 w-3.5 shrink-0" />
            {durum.sayac}
          </span>
          <span className="relative flex-1 min-w-0 bg-terracotta/10 dark:bg-terracotta/15 flex items-center overflow-hidden">
            <span className="duyuru-kayar whitespace-nowrap text-[12px] sm:text-[13px] font-medium text-clay-800 dark:text-ink-50">
              {durum.kayarMetin}
            </span>
          </span>
        </button>
      </div>
      <style>{`
        @keyframes duyuruKayar { from { transform: translateX(0); } to { transform: translateX(-100%); } }
        .duyuru-kayar { display: inline-block; padding-left: 100%; animation: duyuruKayar 14s linear infinite; will-change: transform; }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GorenPopover - estetik acilir liste (v20.2.1: hata durumu eklendi; z-50).
// Veri modal ile ayni query key'ten; goruldu POST tetiklenmez (o modal effect'inde).
// Siralama backend'den hazir (madde 7 - bellekte, hotfix 1/2).
// ---------------------------------------------------------------------------
function GorenPopover({ duyuruId, hiza }: { duyuruId: string; hiza: "sol" | "sag" }) {
  const { data: detay, isError } = useQuery({
    queryKey: ["duyurular", duyuruId],
    queryFn: () => duyuruApi.detay(duyuruId),
  });
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "absolute top-full mt-1.5 z-50 w-60 p-3 rounded-xl bg-white dark:bg-ink-800 border border-cream-300 dark:border-ink-600 shadow-lg text-left",
        hiza === "sag" ? "right-0" : "left-0"
      )}
    >
      <p className="text-[11px] font-semibold text-clay-700 dark:text-ink-100 flex items-center gap-1.5 mb-2">
        <Users className="h-3 w-3 text-terracotta" strokeWidth={2.5} /> Görüldü
      </p>
      {isError ? (
        <p className="text-[11px] text-clay-400 dark:text-ink-300">Liste yüklenemedi.</p>
      ) : !detay ? (
        <Loader2 className="h-4 w-4 animate-spin text-clay-400 dark:text-ink-300 mx-auto my-2" />
      ) : (
        <div className="space-y-1.5 max-h-44 overflow-y-auto">
          {detay.alicilar.map((a) => (
            <div key={a.kullaniciId} className="flex items-center gap-2">
              <span className={cn(
                "h-5 w-5 rounded-full text-[9px] font-semibold inline-flex items-center justify-center shrink-0",
                a.goruldu
                  ? "bg-terracotta/15 text-terracotta"
                  : "bg-clay-200 dark:bg-ink-700 text-clay-400 dark:text-ink-300"
              )}>
                {bastari(a.adSoyad)}
              </span>
              <span className="text-[11px] text-clay-600 dark:text-ink-200 flex-1 truncate">{a.adSoyad}</span>
              <span className="text-[10px] text-clay-400 dark:text-ink-400 shrink-0">
                {a.goruldu && a.gorulmeZamani ? gorelizamandan(a.gorulmeZamani) : "henüz görmedi"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DuyuruAlani
// ---------------------------------------------------------------------------
export function DuyuruAlani() {
  const qc = useQueryClient();
  const { data: ben } = useBen();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [acikId, setAcikId] = useState<string | null>(null);
  const [yanitOdakla, setYanitOdakla] = useState(false);
  const [acikGorenId, setAcikGorenId] = useState<string | null>(null);

  const { data: liste } = useQuery({
    queryKey: ["duyurular"],
    queryFn: duyuruApi.list,
    enabled: !!ben,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const kapat = akisBaglan(
      (o) => {
        if (DUYURU_OLAYLARI.includes(o.olay)) {
          qc.invalidateQueries({ queryKey: ["duyurular"] });
        }
      },
      undefined,
      "/api/notlar/akis"
    );
    return kapat;
  }, [qc]);

  useEffect(() => {
    const id = searchParams.get("duyuru");
    if (!id) return;
    const okey = searchParams.get("okey") === "1";
    const yanit = searchParams.get("yanit") === "1";
    if (okey) {
      duyuruApi
        .goruldu(id)
        .then(() => {
          toast.success("Duyuru okundu olarak işaretlendi");
          qc.invalidateQueries({ queryKey: ["duyurular"] });
        })
        .catch(() => {});
    } else {
      setAcikId(id);
      setYanitOdakla(yanit);
    }
    router.replace(pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const duyuruSil = useMutation({
    mutationFn: (id: string) => duyuruApi.sil(id),
    onSuccess: (_s, id) => {
      qc.invalidateQueries({ queryKey: ["duyurular"] });
      if (acikId === id) setAcikId(null);
      toast.success("Duyuru silindi");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duyurular = liste ?? [];
  if (!ben) return null;

  return (
    <>
      {duyurular.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="font-display text-lg sm:text-xl text-clay-900 dark:text-ink-50 flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-terracotta" />
            Aktif Duyurular
            <span className="text-sm font-sans text-clay-400 dark:text-ink-300">· {duyurular.length}</span>
          </h2>

          <div className="space-y-2">
            {duyurular.map((d) => {
              const benimki = d.olusturanKullaniciId === ben.id;
              const vurgulu = !benimki && !d.benGordum;
              return (
                <SwipeSil
                  key={d.id}
                  aktif={benimki}
                  siliniyor={duyuruSil.isPending}
                  onSil={() => duyuruSil.mutate(d.id)}
                >
                  <div
                    onClick={() => { setAcikGorenId(null); setAcikId(d.id); }}
                    className={cn(
                      "relative px-3.5 py-3 rounded-xl border cursor-pointer transition-colors bg-white dark:bg-ink-850",
                      vurgulu
                        ? "border-terracotta/50 bg-terracotta/5 dark:bg-terracotta/10"
                        : "border-cream-300 dark:border-ink-600 hover:border-terracotta/40"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="h-7 w-7 rounded-lg bg-terracotta/15 text-terracotta flex items-center justify-center shrink-0">
                        <Megaphone className="h-3.5 w-3.5" />
                      </span>
                      <span className="text-sm sm:text-[15px] leading-snug font-medium text-clay-900 dark:text-ink-50 truncate">
                        {d.olusturanAdSoyad}
                      </span>
                      {vurgulu && <span className="h-2 w-2 rounded-full bg-terracotta shrink-0 animate-pulse" />}
                      <span className="text-[11px] text-clay-400 dark:text-ink-300 ml-auto shrink-0">
                        {gorelizamandan(d.guncellemeZamani ?? d.olusturmaZamani)}
                        {d.guncellemeZamani && <span className="italic"> · düzenlendi</span>}
                      </span>
                      {benimki && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); duyuruSil.mutate(d.id); }}
                          aria-label="Duyuruyu sil"
                          className="hidden md:block shrink-0 text-clay-400 hover:text-clay-700 dark:text-ink-300 dark:hover:text-ink-50 transition-colors p-1 -mr-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    <p className="text-[13px] sm:text-sm mt-2 leading-relaxed text-justify hyphens-auto break-words [overflow-wrap:anywhere] whitespace-pre-wrap line-clamp-2 text-clay-600 dark:text-ink-100">
                      {d.icerik}
                    </p>

                    <div className="flex items-center gap-2 mt-1.5">
                      {d.mesajSayisi > 0 && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-cream-200 dark:bg-ink-800 text-clay-600 dark:text-ink-200">
                          {d.mesajSayisi} yanıt{d.benGormedimMesajSayisi > 0 ? ` · ${d.benGormedimMesajSayisi} yeni` : ""}
                        </span>
                      )}
                      {benimki && (
                        <span className="relative ml-auto">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAcikGorenId(acikGorenId === d.id ? null : d.id);
                            }}
                            className="inline-flex items-center gap-1 text-[11px] text-clay-500 dark:text-ink-300 hover:text-terracotta transition-colors"
                          >
                            <CheckCheck className="h-3.5 w-3.5 text-terracotta" />
                            {d.gorenSayisi}/{d.aliciSayisi} gördü
                          </button>
                          {acikGorenId === d.id && <GorenPopover duyuruId={d.id} hiza="sag" />}
                        </span>
                      )}
                    </div>
                  </div>
                </SwipeSil>
              );
            })}
          </div>
        </section>
      )}

      {acikId && (
        <DuyuruDetayModal
          duyuruId={acikId}
          yanitOdakla={yanitOdakla}
          onKapat={() => { setAcikId(null); setYanitOdakla(false); }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// DuyuruDetayModal
// ---------------------------------------------------------------------------
function DuyuruDetayModal({
  duyuruId, yanitOdakla, onKapat,
}: { duyuruId: string; yanitOdakla: boolean; onKapat: () => void }) {
  const qc = useQueryClient();
  const { data: ben } = useBen();
  const [yanit, setYanit] = useState("");
  const [acikMesajGorenId, setAcikMesajGorenId] = useState<string | null>(null);
  const [duzenleModu, setDuzenleModu] = useState(false);
  const [duzenleMetin, setDuzenleMetin] = useState("");
  const yanitRef = useRef<HTMLTextAreaElement>(null);
  const zincirRef = useRef<HTMLDivElement>(null);
  const bekleyen = useRef<Set<string>>(new Set());
  const zamanlayici = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: detay, isError } = useQuery({
    queryKey: ["duyurular", duyuruId],
    queryFn: () => duyuruApi.detay(duyuruId),
  });

  useEffect(() => {
    // v21 Talep-2a - OPTIMISTIC: modal acilir acilmaz cache'te benGordum=true yazilir
    // -> banner ANINDA soner (sunucu beklenmez). POST teyit eder; basarisizlik
    // refetch'le kendini duzeltir ve artik console'a iz duser.
    qc.setQueryData<DuyuruOzet[]>(["duyurular"], (eski) =>
      (eski ?? []).map((d) => (d.id === duyuruId ? { ...d, benGordum: true } : d)));
    duyuruApi
      .goruldu(duyuruId)
      .then(() => qc.invalidateQueries({ queryKey: ["duyurular"] }))
      .catch((e) => console.warn("duyuru goruldu gonderilemedi:", e));  // v21 Talep-2a - sessiz fail izi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duyuruId]);

  useEffect(() => {
    if (yanitOdakla && detay) {
      requestAnimationFrame(() => yanitRef.current?.focus());
    }
  }, [yanitOdakla, detay]);

  useEffect(() => {
    if (isError) {
      toast.error("Duyuru açılamadı - süresi dolmuş ya da geçici bir sorun olabilir");
      onKapat();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError]);

  const gorulduBatch = useMutation({
    mutationFn: (ids: string[]) => duyuruApi.mesajGoruldu(duyuruId, ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["duyurular"] }),
    onError: (e: Error) => console.warn("mesaj-goruldu basarisiz:", e.message),  // v20.2.2 - sessiz fail izi
  });

  // v20.2.2 - deterministik yanit-goruldu (G.1). IntersectionObserver, Radix
  // DialogContent'in transform'u (translate-x/y) altinda kesisimi layout-oncesi
  // koordinatla hesaplayip yanlis ratio uretiyordu (yanit tam gorunse de
  // tetiklenmiyordu). getBoundingClientRect transform SONRASI gercek ekran
  // koordinati verir - olcum modal acilisinda + zincir scroll'unda elle yapilir.
  // Kural ayni (madde 8): mesajin TAMAMI konteynerde gorunur VEYA konteynerden
  // uzun mesaj konteyneri dolduruyor. 800ms debounce ile batch POST.
  useEffect(() => {
    const kok = zincirRef.current;
    if (!kok || !detay) return;

    const olc = () => {
      const kokRect = kok.getBoundingClientRect();
      const hedefler = kok.querySelectorAll<HTMLElement>("[data-mid]");
      let eklendi = false;
      hedefler.forEach((h) => {
        const r = h.getBoundingClientRect();
        const tamGorunur = r.top >= kokRect.top - 4 && r.bottom <= kokRect.bottom + 4;
        const dolduruyor =
          r.height >= kokRect.height - 8 && r.top <= kokRect.top + 4 && r.bottom >= kokRect.bottom - 4;
        if (tamGorunur || dolduruyor) {
          const mid = h.dataset.mid;
          if (mid && !bekleyen.current.has(mid)) { bekleyen.current.add(mid); eklendi = true; }
        }
      });
      if (eklendi) {
        if (zamanlayici.current) clearTimeout(zamanlayici.current);
        zamanlayici.current = setTimeout(() => {
          const ids = Array.from(bekleyen.current);
          bekleyen.current.clear();
          if (ids.length > 0) gorulduBatch.mutate(ids);
        }, 800);
      }
    };

    olc(); // modal acilisinda gorunenler (scroll gerektirmeden yakalanir)
    kok.addEventListener("scroll", olc, { passive: true });
    return () => {
      kok.removeEventListener("scroll", olc);
      if (zamanlayici.current) clearTimeout(zamanlayici.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duyuruId, detay?.mesajlar.length]);

  const yanitla = useMutation({
    mutationFn: () => duyuruApi.yanit(duyuruId, yanit.trim()),
    onSuccess: () => {
      setYanit("");
      qc.invalidateQueries({ queryKey: ["duyurular"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const mesajSil = useMutation({
    mutationFn: (mesajId: string) => duyuruApi.mesajSil(duyuruId, mesajId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["duyurular"] });
      toast.success("Yanıt silindi");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const duzenle = useMutation({
    mutationFn: () => duyuruApi.duzenle(duyuruId, duzenleMetin.trim()),
    onSuccess: (r) => {
      setDuzenleModu(false);
      qc.invalidateQueries({ queryKey: ["duyurular"] });
      if (!r.degisiklikYok) toast.success("Duyuru güncellendi - görüldü listesi sıfırlandı");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const benSahip = !!detay && detay.olusturanKullaniciId === ben?.id;
  const benAlici = !!detay && (detay.alicilar ?? []).some((a) => a.kullaniciId === ben?.id);
  const yanitYazabilir = !!detay && !ben?.goruntulemeModu && (benSahip || benAlici);
  const gorenSayisi = (detay?.alicilar ?? []).filter((a) => a.goruldu).length;
  const gonderilebilir = yanit.trim().length > 0 && yanit.length <= ICERIK_LIMIT && !yanitla.isPending;
  const kaydedilebilir =
    duzenleMetin.trim().length > 0 && duzenleMetin.length <= ICERIK_LIMIT &&
    duzenleMetin.trim() !== (detay?.icerik ?? "") && !duzenle.isPending;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onKapat(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-terracotta" /> Duyuru
            {benSahip && detay && !duzenleModu && !ben?.goruntulemeModu && (
              <button
                type="button"
                onClick={() => { setDuzenleMetin(detay.icerik); setDuzenleModu(true); }}
                aria-label="Duyuruyu düzenle"
                className="text-clay-400 hover:text-terracotta dark:text-ink-300 transition-colors p-1"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
          </DialogTitle>
          <DialogDescription>
            {detay
              ? `${detay.olusturanAdSoyad} · ${gorelizamandan(detay.olusturmaZamani)}${detay.guncellemeZamani ? " · düzenlendi" : ""}`
              : "Yükleniyor..."}
          </DialogDescription>
        </DialogHeader>

        {!detay ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-clay-400 dark:text-ink-300" />
          </div>
        ) : (
          <div className="space-y-4">
            {duzenleModu ? (
              <div className="space-y-2">
                <textarea
                  value={duzenleMetin}
                  onChange={(e) => setDuzenleMetin(e.target.value.slice(0, ICERIK_LIMIT))}
                  rows={4}
                  autoFocus
                  className="w-full resize-none rounded-xl border border-terracotta/50 bg-white dark:bg-ink-850 px-3.5 py-2.5 text-[16px] md:text-[13px] text-clay-900 dark:text-ink-50 focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/15 transition-colors"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-clay-400 dark:text-ink-300 tabular-nums">
                    {duzenleMetin.length}/{ICERIK_LIMIT}
                  </span>
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDuzenleModu(false)}
                      className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-[13px] font-medium text-clay-600 dark:text-ink-200 hover:bg-cream-200 dark:hover:bg-ink-800 transition-colors"
                    >
                      <X className="h-4 w-4" /> Vazgeç
                    </button>
                    <button
                      type="button"
                      disabled={!kaydedilebilir}
                      onClick={() => duzenle.mutate()}
                      className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-medium bg-terracotta text-cream-50 hover:bg-terracotta/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {duzenle.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                      Kaydet
                    </button>
                  </span>
                </div>
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  Kaydedince görüldü listesi sıfırlanır; alıcılar duyuruyu yeniden görecek.
                </p>
              </div>
            ) : (
              <p className="w-full text-justify hyphens-auto text-[15px] sm:text-base font-medium leading-relaxed text-clay-900 dark:text-ink-50 whitespace-pre-wrap break-words [overflow-wrap:anywhere] border-l-2 border-terracotta pl-3">
                {detay.icerik}
              </p>
            )}

            {benSahip && !duzenleModu && (
              <div className="rounded-xl border border-cream-300 dark:border-ink-600 p-3">
                <p className="text-[11px] font-semibold text-clay-700 dark:text-ink-100 flex items-center gap-1.5 mb-2">
                  <Users className="h-3 w-3 text-terracotta" strokeWidth={2.5} />
                  Görüldü ({gorenSayisi}/{detay.alicilar.length})
                </p>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {detay.alicilar.map((a) => (
                    <div key={a.kullaniciId} className="flex items-center gap-2">
                      <span
                        className={cn(
                          "h-5 w-5 rounded-full text-[9px] font-semibold inline-flex items-center justify-center shrink-0",
                          a.goruldu
                            ? "bg-terracotta/15 text-terracotta"
                            : "bg-clay-200 dark:bg-ink-700 text-clay-400 dark:text-ink-300"
                        )}
                      >
                        {bastari(a.adSoyad)}
                      </span>
                      <span className="text-[11px] text-clay-600 dark:text-ink-200 flex-1 truncate">
                        {a.adSoyad}
                      </span>
                      <span className="text-[10px] text-clay-400 dark:text-ink-400 shrink-0">
                        {a.goruldu && a.gorulmeZamani ? gorelizamandan(a.gorulmeZamani) : "henüz görmedi"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detay.mesajlar.length > 0 && (
              <div ref={zincirRef} className="space-y-2 max-h-56 overflow-y-auto">
                {detay.mesajlar.map((m, mi) => {
                  const yukariAc = mi >= detay.mesajlar.length - 2;  // v21 Talep-2b - son yanitlarin popover'i yukari acilir
                  const benimMesajim = m.gonderenKullaniciId === ben?.id;
                  const okunmamis = !benimMesajim && !m.benGordum;
                  return (
                    <SwipeSil
                      key={m.id}
                      aktif={benimMesajim || benSahip}
                      siliniyor={mesajSil.isPending}
                      onSil={() => mesajSil.mutate(m.id)}
                    >
                      <div
                        {...(okunmamis ? { "data-mid": m.id } : {})}
                        className={cn(
                          "rounded-xl px-3 py-2",
                          benimMesajim ? "bg-terracotta/10" : "bg-cream-100 dark:bg-ink-800",
                          okunmamis && "border-l-2 border-terracotta"
                        )}
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="h-4 w-4 rounded-full bg-terracotta/15 text-terracotta text-[8px] font-semibold inline-flex items-center justify-center shrink-0">
                            {bastari(m.gonderenAdSoyad)}
                          </span>
                          <span className="text-[11px] font-medium text-clay-700 dark:text-ink-100 truncate">
                            {m.gonderenAdSoyad}
                          </span>
                          <span className="text-[10px] text-clay-400 dark:text-ink-400 ml-auto shrink-0">
                            {gorelizamandan(m.olusturmaZamani)}
                          </span>
                          {(benimMesajim || benSahip) && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); mesajSil.mutate(m.id); }}
                              aria-label="Yanıtı sil"
                              className="hidden md:block shrink-0 text-clay-400 hover:text-clay-700 dark:text-ink-300 dark:hover:text-ink-50 transition-colors"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        <p className="text-[13px] text-clay-800 dark:text-ink-100 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                          {m.icerik}
                        </p>
                        {m.gorenler !== null && (
                          <div className="relative mt-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAcikMesajGorenId(acikMesajGorenId === m.id ? null : m.id);
                              }}
                              className="inline-flex items-center gap-1 text-[10px] text-clay-400 dark:text-ink-300 hover:text-terracotta transition-colors"
                            >
                              <CheckCheck className={cn("h-3 w-3", m.gorenler.length > 0 && "text-terracotta")} />
                              {m.gorenler.length > 0 ? `${m.gorenler.length} gördü` : "henüz gören yok"}
                            </button>
                            {acikMesajGorenId === m.id && m.gorenler.length > 0 && (<>
                              {/* v21-r M5 - dis tiklama kapatir (not okuyanlar deseni) */}
                              <div className="fixed inset-0 z-40" onClick={() => setAcikMesajGorenId(null)} />
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className={cn("absolute left-0 z-50 w-56 p-3 rounded-xl bg-white dark:bg-ink-800 border border-cream-300 dark:border-ink-600 shadow-lg space-y-1.5", yukariAc ? "bottom-full mb-1.5" : "top-full mt-1.5")}
                              >
                                {m.gorenler.map((gr) => (
                                  <div key={gr.kullaniciId} className="flex items-center gap-2">
                                    <span className="h-4 w-4 rounded-full bg-terracotta/15 text-terracotta text-[8px] font-semibold inline-flex items-center justify-center shrink-0">
                                      {bastari(gr.adSoyad)}
                                    </span>
                                    <span className="text-[11px] text-clay-700 dark:text-ink-100 flex-1 truncate">{gr.adSoyad}</span>
                                    <span className="text-[10px] text-clay-400 dark:text-ink-300 shrink-0">
                                      {gorelizamandan(gr.gorulmeZamani)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </SwipeSil>
                  );
                })}
              </div>
            )}

            <p className="flex items-start gap-1.5 text-[11px] text-clay-400 dark:text-ink-300 leading-relaxed">
              <Info className="h-3 w-3 shrink-0 mt-0.5" />
              <span>
                Duyurular geçicidir: tüm alıcılar gördükten {SESSIZLIK_SAAT} saat sonra ya da en geç {DUYURU_OMRU_SAAT} saat içinde otomatik silinir.
              </span>
            </p>

            {yanitYazabilir && !duzenleModu && (
              <div className="flex items-end gap-2">
                <textarea
                  ref={yanitRef}
                  value={yanit}
                  onChange={(e) => setYanit(e.target.value.slice(0, ICERIK_LIMIT))}
                  rows={2}
                  placeholder="Yanıtını yaz..."
                  className="flex-1 resize-none rounded-xl border border-clay-200 dark:border-ink-600 bg-white dark:bg-ink-850 px-3.5 py-2.5 text-[16px] md:text-[13px] placeholder:text-[12px] text-clay-900 dark:text-ink-50 placeholder:text-clay-400 dark:placeholder:text-ink-300 focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/15 transition-colors"
                />
                <button
                  type="button"
                  disabled={!gonderilebilir}
                  onClick={() => yanitla.mutate()}
                  className="inline-flex items-center justify-center h-11 w-11 rounded-xl bg-terracotta text-cream-50 hover:bg-terracotta/90 transition-colors disabled:opacity-50 disabled:pointer-events-none shrink-0"
                  aria-label="Yanıtı gönder"
                >
                  {yanitla.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
