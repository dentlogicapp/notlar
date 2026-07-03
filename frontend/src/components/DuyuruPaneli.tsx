"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCheck, Info, Loader2, Megaphone, Send, Users } from "lucide-react";
import { duyuruApi } from "@/lib/api";
import { useBen } from "@/lib/useBen";
import { akisBaglan } from "@/lib/akis";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "./ui/dialog";
import { cn, gorelizamandan, bastari } from "@/lib/utils";

// v20 - Duyuru alani: aktif duyurular seridi (herkes: alicisi/sahibi olduklari) + detay modali
// (mesaj zinciri + yanit + okundu avatarlari) + push/zil URL parametre isleyici.
//   ?duyuru={id}          -> detay modalini ac (acilinca alici otomatik "goruldu" - backend no-op guvenli)
//   ?duyuru={id}&okey=1   -> modal ACMADAN goruldu isaretle + toast (sw.js okey aksiyonu)
//   ?duyuru={id}&yanit=1  -> modal ac + yanit inputuna odaklan (sw.js Yanitla aksiyonu)
// Canlilik: SSE (duyuru_paylasildi/goruldu/yanitlandi) + 15sn polling yedegi.
const ICERIK_LIMIT = 500;
const DUYURU_OMRU_SAAT = 24;  // backend DuyuruEndpoints.TtlSaat + DuyuruTemizleyici.TtlSaat ile senkron
const SESSIZLIK_SAAT = 2;     // backend DuyuruTemizleyici.SessizlikSaat ile senkron ("konusma durdu" esigi)

export function DuyuruAlani() {
  const qc = useQueryClient();
  const { data: ben } = useBen();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [acikId, setAcikId] = useState<string | null>(null);
  const [yanitOdakla, setYanitOdakla] = useState(false);

  const { data: liste } = useQuery({
    queryKey: ["duyurular"],
    queryFn: duyuruApi.list,
    enabled: !!ben,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  // SSE: duyuru olaylarinda listeyi + acik detayi tazele (["duyurular"] prefix detayi da kapsar)
  useEffect(() => {
    const kapat = akisBaglan(
      (o) => {
        if (["duyuru_paylasildi", "duyuru_goruldu", "duyuru_yanitlandi", "duyuru_silindi"].includes(o.olay)) {
          qc.invalidateQueries({ queryKey: ["duyurular"] });
        }
      },
      undefined,
      "/api/notlar/akis"
    );
    return kapat;
  }, [qc]);

  // Push/zil URL parametreleri (useFocusNot ailesi): isle ve parametreyi temizle
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

  const duyurular = liste ?? [];
  if (!ben) return null;

  return (
    <>
      {duyurular.length > 0 && (
        <section className="space-y-1.5">
          {duyurular.map((d) => {
            const benimki = d.olusturanKullaniciId === ben.id;
            const vurgulu = !benimki && !d.benGordum;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setAcikId(d.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-colors",
                  vurgulu
                    ? "border-terracotta/40 bg-terracotta/5 hover:bg-terracotta/10"
                    : "border-cream-300 dark:border-ink-700 bg-white dark:bg-ink-850 hover:border-terracotta/40"
                )}
              >
                <Megaphone className="h-4 w-4 text-terracotta shrink-0" />
                <span className="flex-1 min-w-0 text-sm text-clay-800 dark:text-ink-100 truncate">
                  {d.icerik}
                </span>
                {d.mesajSayisi > 0 && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-cream-200 dark:bg-ink-800 text-clay-600 dark:text-ink-200 shrink-0">
                    {d.mesajSayisi} yanıt
                  </span>
                )}
                {benimki ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-clay-500 dark:text-ink-300 shrink-0">
                    <CheckCheck className="h-3.5 w-3.5 text-terracotta" />
                    {d.gorenSayisi}/{d.aliciSayisi}
                  </span>
                ) : (
                  vurgulu && <span className="h-2 w-2 rounded-full bg-terracotta shrink-0" />
                )}
                <span className="text-[11px] text-clay-400 dark:text-ink-300 shrink-0">
                  {gorelizamandan(d.olusturmaZamani)}
                </span>
              </button>
            );
          })}
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

function DuyuruDetayModal({
  duyuruId, yanitOdakla, onKapat,
}: { duyuruId: string; yanitOdakla: boolean; onKapat: () => void }) {
  const qc = useQueryClient();
  const { data: ben } = useBen();
  const [yanit, setYanit] = useState("");
  const yanitRef = useRef<HTMLTextAreaElement>(null);

  const { data: detay, isError } = useQuery({
    queryKey: ["duyurular", duyuruId],
    queryFn: () => duyuruApi.detay(duyuruId),
  });

  // Modal acilinca goruldu isaretle (backend idempotent; alici degilse sessiz no-op)
  useEffect(() => {
    duyuruApi
      .goruldu(duyuruId)
      .then(() => qc.invalidateQueries({ queryKey: ["duyurular"] }))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duyuruId]);

  // sw.js "Yanitla" aksiyonu: detay gelince yanit inputuna odaklan
  useEffect(() => {
    if (yanitOdakla && detay) {
      requestAnimationFrame(() => yanitRef.current?.focus());
    }
  }, [yanitOdakla, detay]);

  // Suresi dolmus / erisimi olmayan duyuru (backend 404): kullaniciyi bilgilendir, kapat
  useEffect(() => {
    if (isError) {
      toast.error("Duyuru bulunamadı ya da süresi doldu");
      onKapat();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError]);

  const yanitla = useMutation({
    mutationFn: () => duyuruApi.yanit(duyuruId, yanit.trim()),
    onSuccess: () => {
      setYanit("");
      qc.invalidateQueries({ queryKey: ["duyurular"] });
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
            <p className="text-sm text-clay-800 dark:text-ink-100 leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              {detay.icerik}
            </p>

            {/* Okundu avatarlari - yalniz duyuru sahibi gorur (not "Goruldu" popover deseni) */}
            {benSahip && (
              <div className="rounded-xl border border-cream-300 dark:border-ink-700 p-3">
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

            {/* Konusma zinciri */}
            {detay.mesajlar.length > 0 && (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {detay.mesajlar.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "rounded-xl px-3 py-2",
                      m.gonderenKullaniciId === ben?.id
                        ? "bg-terracotta/10"
                        : "bg-cream-100 dark:bg-ink-800"
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
                    </div>
                    <p className="text-[13px] text-clay-800 dark:text-ink-100 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                      {m.icerik}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* v20 - gecicilik bilgisi (Musa istegi; sureler backend sabitleriyle senkron, ciplak sayi yok) */}
            <p className="flex items-start gap-1.5 text-[11px] text-clay-400 dark:text-ink-300 leading-relaxed">
              <Info className="h-3 w-3 shrink-0 mt-0.5" />
              <span>
                Duyurular geçicidir: tüm alıcılar gördükten {SESSIZLIK_SAAT} saat sonra ya da en geç {DUYURU_OMRU_SAAT} saat içinde otomatik silinir.
              </span>
            </p>

            {/* Yanit - sahip veya alici; goruntuleme modunda gizli (backend'de de 403) */}
            {yanitYazabilir && (
              <div className="flex items-end gap-2">
                <textarea
                  ref={yanitRef}
                  value={yanit}
                  onChange={(e) => setYanit(e.target.value.slice(0, ICERIK_LIMIT))}
                  rows={2}
                  placeholder="Yanıtını yaz..."
                  className="flex-1 resize-none rounded-xl border border-clay-200 dark:border-ink-700 bg-white dark:bg-ink-850 px-3.5 py-2.5 text-[15px] text-clay-900 dark:text-ink-50 placeholder:text-clay-400 dark:placeholder:text-ink-300 focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/15 transition-colors"
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
