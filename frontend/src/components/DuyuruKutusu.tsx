"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Megaphone, Send, X } from "lucide-react";
import { duyuruApi, isletmeApi } from "@/lib/api";
import { useBen } from "@/lib/useBen";
import { useIsletmeMetinleri, metinDegerVarsayilanli } from "@/lib/useIsletmeMetinleri";
import { cn } from "@/lib/utils";

// v20 - Duyuru Paylas kutusu (yonetici-only). Ana sayfada "Tum Notlar" kutusunun ustunde,
// iki yana yasli (tam genislik); not-ekle kutusundan kompakt, arama kutusundan buyuk.
// Defense in depth katman 1: admin olmayan (ve goruntuleme modundaki super admin) hic gormez;
// katman 2: backend DB uyelik rol kontrolu (DuyuruEndpoints POST -> 403).
// Ipucu metni tenant anahtarindan: duyuru_form_placeholder (not_form_placeholder deseni, hardcoded yok).
const ICERIK_LIMIT = 500;

export function DuyuruKutusu() {
  const qc = useQueryClient();
  const { data: ben } = useBen();
  const { data: metinler } = useIsletmeMetinleri();
  const ipucu = metinDegerVarsayilanli(metinler, "duyuru_form_placeholder");  // v20.1 K4: katalog varsayilanina duser

  const [icerik, setIcerik] = useState("");
  const [aliciTipi, setAliciTipi] = useState<"tum" | "secili">("tum");
  const [seciliIdler, setSeciliIdler] = useState<string[]>([]);
  const [acik, setAcik] = useState(false); // odaklaninca genisler (kompakt baslar)

  const benAdmin =
    (ben?.uyelikler ?? []).find((u) => u.isletmeId === ben?.aktifIsletmeId)?.rol === "admin";

  // Uye listesi yalniz "secili" modda cekilir (hatirlatici "Kime" deseni; ["uyeler"] cache paylasimli)
  const { data: uyeler } = useQuery({
    queryKey: ["uyeler"],
    queryFn: isletmeApi.uyeler,
    enabled: benAdmin && acik && aliciTipi === "secili",
    staleTime: 60_000,
  });
  const digerUyeler = (uyeler ?? []).filter((u) => u.kullaniciId !== ben?.id);

  const paylas = useMutation({
    mutationFn: () =>
      duyuruApi.olustur({
        icerik: icerik.trim(),
        aliciTipi,
        aliciIdler: aliciTipi === "secili" ? seciliIdler : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["duyurular"] });
      toast.success("Duyuru paylaşıldı");
      setIcerik(""); setSeciliIdler([]); setAliciTipi("tum"); setAcik(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Katman 1: yonetici degil ya da goruntuleme modu -> kutu hic render edilmez
  if (!benAdmin || ben?.goruntulemeModu) return null;

  const gonderilebilir =
    icerik.trim().length > 0 &&
    icerik.length <= ICERIK_LIMIT &&
    (aliciTipi === "tum" || seciliIdler.length > 0) &&
    !paylas.isPending;

  const uyeSec = (id: string) =>
    setSeciliIdler((mevcut) =>
      mevcut.includes(id) ? mevcut.filter((x) => x !== id) : [...mevcut, id]
    );

  const kapat = () => {
    setAcik(false); setIcerik(""); setSeciliIdler([]); setAliciTipi("tum");
  };

  return (
    <section className="kart p-3 sm:p-4">
      <div className="flex items-start gap-2.5 sm:gap-3">
        <span className="h-9 w-9 rounded-xl bg-terracotta/15 text-terracotta flex items-center justify-center shrink-0 mt-0.5">
          <Megaphone className="h-5 w-5" />
        </span>

        <div className="flex-1 min-w-0 space-y-2.5">
          <textarea
            value={icerik}
            onChange={(e) => setIcerik(e.target.value.slice(0, ICERIK_LIMIT))}
            onFocus={() => setAcik(true)}
            placeholder={ipucu}
            rows={acik ? 2 : 1}
            className="w-full resize-none rounded-xl border border-clay-200 dark:border-ink-700 bg-white dark:bg-ink-850 px-3.5 py-2.5 text-sm text-clay-900 dark:text-ink-50 placeholder:text-clay-400 dark:placeholder:text-ink-300 focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/15 transition-colors"
          />

          {acik && (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <SecimButonu aktif={aliciTipi === "tum"} onClick={() => setAliciTipi("tum")}>
                    Tüm üyeler
                  </SecimButonu>
                  <SecimButonu aktif={aliciTipi === "secili"} onClick={() => setAliciTipi("secili")}>
                    Seçili üyeler
                  </SecimButonu>
                </div>
                <span className="text-[11px] text-clay-400 dark:text-ink-300 tabular-nums">
                  {icerik.length}/{ICERIK_LIMIT}
                </span>
              </div>

              {aliciTipi === "secili" && (
                <div className="space-y-1 rounded-xl border border-clay-200 dark:border-ink-700 bg-white dark:bg-ink-850 p-2 max-h-44 overflow-y-auto">
                  {digerUyeler.length === 0 ? (
                    <p className="text-sm text-clay-400 dark:text-ink-300 px-2 py-1.5">
                      {uyeler ? "Duyuru gönderilecek başka üye yok." : "Üyeler yükleniyor…"}
                    </p>
                  ) : (
                    digerUyeler.map((u) => (
                      <label
                        key={u.kullaniciId}
                        className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-cream-100 dark:hover:bg-ink-800 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={seciliIdler.includes(u.kullaniciId)}
                          onChange={() => uyeSec(u.kullaniciId)}
                          className="h-4 w-4 rounded accent-terracotta shrink-0"
                        />
                        <span className="text-sm text-clay-800 dark:text-ink-100 truncate">{u.adSoyad}</span>
                        <span className="text-xs text-clay-400 dark:text-ink-300 truncate ml-auto">{u.email}</span>
                      </label>
                    ))
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={kapat}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-[13px] font-medium text-clay-600 dark:text-ink-200 hover:bg-cream-200 dark:hover:bg-ink-800 transition-colors"
                >
                  <X className="h-4 w-4" /> Vazgeç
                </button>
                <button
                  type="button"
                  disabled={!gonderilebilir}
                  onClick={() => paylas.mutate()}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-medium bg-terracotta text-cream-50 hover:bg-terracotta/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  {paylas.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Paylaş
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// Alici tipi secim pili ("Tum uyeler" / "Secili uyeler") - hatirlatici kime menusu ailesi
function SecimButonu({
  aktif, onClick, children,
}: { aktif: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center h-8 px-3 rounded-full text-[13px] font-medium transition-colors border",
        aktif
          ? "bg-terracotta text-cream-50 border-terracotta"
          : "bg-white dark:bg-ink-850 text-clay-600 dark:text-ink-200 border-clay-200 dark:border-ink-700 hover:border-terracotta/50"
      )}
    >
      {children}
    </button>
  );
}
