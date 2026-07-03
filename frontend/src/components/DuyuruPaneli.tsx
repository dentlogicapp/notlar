"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCheck, Info, Loader2, Megaphone, Send, Trash2, Users } from "lucide-react";
import { duyuruApi } from "@/lib/api";
import { useBen } from "@/lib/useBen";
import { akisBaglan } from "@/lib/akis";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "./ui/dialog";
import { cn, gorelizamandan, bastari } from "@/lib/utils";
import type { DuyuruOzet } from "@/lib/types";

// v20.1 - Duyuru alani yeniden kurgusu.
//   DuyuruBanner : marka blogunun altinda sticky uyari seridi (madde 3-4). Yalniz okunmamis
//                  duyuru/yanit varken gorunur; sol koyu-opak pulse sayac + sagda kayar yazi.
//                  Tik -> ilgili duyurunun modali (URL parametresi uzerinden - tek mekanizma).
//   DuyuruAlani  : "Aktif Duyurular · N" basligi (madde 2 + B1) + zengin kartlar (madde 5:
//                  gonderen + zaman + 2 satir icerik + goruldu popover) + swipe-sil (madde 6:
//                  yon kilitli, KIRMIZISIZ notr blok, B2 iki-dokunus onay; K1 yetkileri).
//   Modal        : vurgulu iki-yana-yasli duyuru metni (madde 7), scroll tabanli yanit goruldu
//                  (madde 8: IntersectionObserver, mesajin tamami gorununce) + K2 goren listeleri.
// URL parametreleri (push/zil/banner ortak yolu):
//   ?duyuru={id} | &okey=1 (modal acmadan goruldu+toast) | &yanit=1 (modal + input odak)
const ICERIK_LIMIT = 500;
const DUYURU_OMRU_SAAT = 24;  // backend DuyuruEndpoints.TtlSaat + DuyuruTemizleyici.TtlSaat ile senkron
const SESSIZLIK_SAAT = 2;     // backend DuyuruTemizleyici.SessizlikSaat ile senkron
const SIL_GENISLIK = 84;
const DUYURU_OLAYLARI = [
  "duyuru_paylasildi", "duyuru_goruldu", "duyuru_yanitlandi",
  "duyuru_silindi", "duyuru_yanit_goruldu", "duyuru_yaniti_silindi",
];

// ---------------------------------------------------------------------------
// SwipeSil - bildirim swipe deseninin DUZELTILMIS hali:
//   (1) yon kilidi: ilk 10px'te |dx|>|dy| degilse swipe hic baslamaz (dikey scroll
//       sirasinda yatay sizinti = bildirimlerdeki "ara ara kirmizi alan" kok nedeni),
//   (2) arka blok yalniz kaydirma varken render edilir (kalici katman yok),
//   (3) kirmizi YOK - notr koyu blok (Musa karari), B2: ilk dokunus "Emin?" onayina cevirir.
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
      setOnay(true);  // B2: yanlis kaydirma silmesin - ikinci dokunus siler
      zamanlayici.current = setTimeout(() => { setOnay(false); setKaydir(0); }, 3500);
      return;
    }
    if (zamanlayici.current) clearTimeout(zamanlayici.current);
    setOnay(false); setKaydir(0);
    onSil();
  }

  return (
    <div className="relative overflow-hidden rounded-xl">
      {kaydir < 0 && (
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
          if (kaydir !== 0) { e.stopPropagation(); e.preventDefault(); setKaydir(0); setOnay(false); }
        }}
        className="relative transition-transform"
        style={{ transform: `translateX(${kaydir}px)` }}
      >
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DuyuruBanner - madde 3-4: header'in (sticky, ~52/60px) hemen altina yapisir.
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

    const enYeniDuyuru = yeniDuyurular[0] ?? null;  // liste desc sirali
    const enYeniYanit = yanitli.reduce<DuyuruOzet | null>((a, d) => {
      if (!d.sonMesajZamani) return a;
      return !a || d.sonMesajZamani > (a.sonMesajZamani ?? "") ? d : a;
    }, null);

    const duyuruZamani = enYeniDuyuru?.olusturmaZamani ?? "";
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
// GorenPopover - madde 5: kart uzerinden, modal acmadan goruldu listesi (yalniz sahibi).
// Detay verisi modal ile AYNI query key'ten (cache paylasimi; goruldu POST tetiklenmez -
// o yalniz modal effect'inde).
// ---------------------------------------------------------------------------
function GorenPopover({ duyuruId }: { duyuruId: string }) {
  const { data: detay } = useQuery({
    queryKey: ["duyurular", duyuruId],
    queryFn: () => duyuruApi.detay(duyuruId),
  });
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="absolute right-0 top-full mt-1.5 z-30 w-60 rounded-xl border border-cream-300 dark:border-ink-600 bg-cream-50 dark:bg-ink-900 shadow-lg p-2.5"
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-clay-400 dark:text-ink-300 mb-1.5">
        Görüldü
      </p>
      {!detay ? (
        <Loader2 className="h-4 w-4 animate-spin text-clay-400 dark:text-ink-300 mx-auto my-2" />
      ) : (
        <div className="space-y-1 max-h-40 overflow-y-auto">
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
              <span className="text-[11px] text-clay-700 dark:text-ink-100 flex-1 truncate">{a.adSoyad}</span>
              <span className="text-[10px] text-clay-400 dark:text-ink-300 shrink-0">
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
// DuyuruAlani - baslik + kart listesi + modal + URL parametre isleyici.
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
          {/* Madde 2 + B1: baslik + canli adet (sticky banner'a KATILMAZ) */}
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
                      <span className="h-8 w-8 rounded-lg bg-terracotta/15 text-terracotta flex items-center justify-center shrink-0">
                        <Megaphone className="h-4 w-4" />
                      </span>
                      <span className="text-sm font-medium text-clay-800 dark:text-ink-50 truncate">
                        {d.olusturanAdSoyad}
                      </span>
                      {vurgulu && <span className="h-2 w-2 rounded-full bg-terracotta shrink-0 animate-pulse" />}
                      <span className="text-[11px] text-clay-400 dark:text-ink-300 ml-auto shrink-0">
                        {gorelizamandan(d.olusturmaZamani)}
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

                    <p className="text-sm text-clay-700 dark:text-ink-100 line-clamp-2 leading-relaxed mt-1.5">
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
                          {acikGorenId === d.id && <GorenPopover duyuruId={d.id} />}
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
  const yanitRef = useRef<HTMLTextAreaElement>(null);
  const zincirRef = useRef<HTMLDivElement>(null);
  const bekleyen = useRef<Set<string>>(new Set());
  const zamanlayici = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: detay, isError } = useQuery({
    queryKey: ["duyurular", duyuruId],
    queryFn: () => duyuruApi.detay(duyuruId),
  });

  // Modal acilinca duyuru ana metni goruldu (backend idempotent; alici degilse no-op)
  useEffect(() => {
    duyuruApi
      .goruldu(duyuruId)
      .then(() => qc.invalidateQueries({ queryKey: ["duyurular"] }))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duyuruId]);

  useEffect(() => {
    if (yanitOdakla && detay) {
      requestAnimationFrame(() => yanitRef.current?.focus());
    }
  }, [yanitOdakla, detay]);

  useEffect(() => {
    if (isError) {
      toast.error("Duyuru bulunamadı ya da süresi doldu");
      onKapat();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError]);

  const gorulduBatch = useMutation({
    mutationFn: (ids: string[]) => duyuruApi.mesajGoruldu(duyuruId, ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["duyurular"] }),
  });

  // Madde 8: "mesajin tamaminin ekrani kapladigi an" = tam gorunurluk VEYA konteynerden
  // uzun mesajin konteyneri doldurmasi. 800ms debounce ile batch POST.
  useEffect(() => {
    const kok = zincirRef.current;
    if (!kok || !detay) return;
    const hedefler = kok.querySelectorAll("[data-mid]");
    if (hedefler.length === 0) return;
    const obs = new IntersectionObserver(
      (girisler) => {
        let eklendi = false;
        for (const g of girisler) {
          const tamGorunur = g.intersectionRatio >= 0.99;
          const konteyneriDolduruyor = g.intersectionRect.height >= kok.clientHeight - 8;
          if (tamGorunur || (g.isIntersecting && konteyneriDolduruyor)) {
            const mid = (g.target as HTMLElement).dataset.mid;
            if (mid) { bekleyen.current.add(mid); eklendi = true; obs.unobserve(g.target); }
          }
        }
        if (eklendi) {
          if (zamanlayici.current) clearTimeout(zamanlayici.current);
          zamanlayici.current = setTimeout(() => {
            const ids = Array.from(bekleyen.current);
            bekleyen.current.clear();
            if (ids.length > 0) gorulduBatch.mutate(ids);
          }, 800);
        }
      },
      { root: kok, threshold: [0.25, 0.5, 0.75, 1] }
    );
    hedefler.forEach((h) => obs.observe(h));
    return () => {
      obs.disconnect();
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

  const benSahip = !!detay && detay.olusturanKullaniciId === ben?.id;
  const benAlici = !!detay && (detay.alicilar ?? []).some((a) => a.kullaniciId === ben?.id);
  const yanitYazabilir = !!detay && !ben?.goruntulemeModu && (benSahip || benAlici);
  const gorenSayisi = (detay?.alicilar ?? []).filter((a) => a.goruldu).length;
  const gonderilebilir = yanit.trim().length > 0 && yanit.length <= ICERIK_LIMIT && !yanitla.isPending;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onKapat(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-terracotta" /> Duyuru
          </DialogTitle>
          <DialogDescription>
            {detay
              ? `${detay.olusturanAdSoyad} · ${gorelizamandan(detay.olusturmaZamani)}`
              : "Yükleniyor..."}
          </DialogDescription>
        </DialogHeader>

        {!detay ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-clay-400 dark:text-ink-300" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Madde 7: duyuru ana metni - vurgulu, iki yana yasli, pencereyi dolduran */}
            <p className="w-full text-justify hyphens-auto text-[15px] sm:text-base font-medium leading-relaxed text-clay-900 dark:text-ink-50 whitespace-pre-wrap break-words [overflow-wrap:anywhere] border-l-2 border-terracotta pl-3">
              {detay.icerik}
            </p>

            {benSahip && (
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
                {detay.mesajlar.map((m) => {
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
                        {/* Madde 8 + K2: goren listesi (yalniz mesaj sahibi + duyuru sahibi; gorenler=null ise gizli) */}
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
                            {acikMesajGorenId === m.id && m.gorenler.length > 0 && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute left-0 top-full mt-1 z-30 w-56 rounded-xl border border-cream-300 dark:border-ink-600 bg-cream-50 dark:bg-ink-900 shadow-lg p-2 space-y-1"
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
                            )}
                          </div>
                        )}
                      </div>
                    </SwipeSil>
                  );
                })}
              </div>
            )}

            {/* Gecicilik bilgisi (v20 karari; sureler backend sabitleriyle senkron) */}
            <p className="flex items-start gap-1.5 text-[11px] text-clay-400 dark:text-ink-300 leading-relaxed">
              <Info className="h-3 w-3 shrink-0 mt-0.5" />
              <span>
                Duyurular geçicidir: tüm alıcılar gördükten {SESSIZLIK_SAAT} saat sonra ya da en geç {DUYURU_OMRU_SAAT} saat içinde otomatik silinir.
              </span>
            </p>

            {yanitYazabilir && (
              <div className="flex items-end gap-2">
                <textarea
                  ref={yanitRef}
                  value={yanit}
                  onChange={(e) => setYanit(e.target.value.slice(0, ICERIK_LIMIT))}
                  rows={2}
                  placeholder="Yanıtını yaz..."
                  className="flex-1 resize-none rounded-xl border border-clay-200 dark:border-ink-600 bg-white dark:bg-ink-850 px-3.5 py-2.5 text-[15px] text-clay-900 dark:text-ink-50 placeholder:text-clay-400 dark:placeholder:text-ink-300 focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/15 transition-colors"
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
