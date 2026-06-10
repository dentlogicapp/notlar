"use client";

import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Heart, Loader2, Palette, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/AuthGuard";
import { CountdownWidget } from "@/components/CountdownWidget";
import { UserMenu } from "@/components/UserMenu";
import { Yenile } from "@/components/Yenile";
import { MetinAlani } from "@/components/MetinAlani";
import { LivePreview } from "@/components/LivePreview";
import { HosgeldinModal } from "@/components/HosgeldinModal";
import { Button } from "@/components/ui/button";
import { metinApi } from "@/lib/api";
import { useIsletmeMetinleri } from "@/lib/useIsletmeMetinleri";
import { useAutoSave } from "@/lib/useAutoSave";
import { cn } from "@/lib/utils";

type SekmeKod = "marka" | "karsilama" | "sayac" | "mail" | "diger";

// v18 - Katalog-driven: sekmeler kategoriye gore filtreler; yeni anahtar otomatik gorunur (Sifir Sablon).
const SEKMELER: { kod: SekmeKod; etiket: string; kategoriler: string[] }[] = [
  { kod: "marka", etiket: "Marka", kategoriler: ["marka"] },
  { kod: "karsilama", etiket: "Karşılama", kategoriler: ["dashboard"] },
  { kod: "sayac", etiket: "Sayaç", kategoriler: ["sayac"] },
  { kod: "mail", etiket: "Mail", kategoriler: ["mail"] },
];

const KATEGORI_BASLIK: Record<string, string> = {
  bildirim: "Bildirim Metinleri",
  form: "Form Metinleri",
};

export default function Page() {
  return (
    <AuthGuard requireAdmin>
      <Icerik />
      <HosgeldinModal />
    </AuthGuard>
  );
}

function Icerik() {
  const qc = useQueryClient();
  const { data: metinler, isLoading, isError } = useIsletmeMetinleri({ kapsam: "Tenant" });
  const [sekme, setSekme] = useState<SekmeKod>("marka");
  const [degerler, setDegerler] = useState<Record<string, string>>({});
  const [ara, setAra] = useState("");
  const [hatalar, setHatalar] = useState<Record<string, string>>({});

  // URL hash ile sekme (paylasilabilir: /admin/marka#mail)
  useEffect(() => {
    const h = window.location.hash.replace("#", "") as SekmeKod;
    if (SEKMELER.some((s) => s.kod === h)) setSekme(h);
  }, []);

  const sekmeSec = (kod: SekmeKod) => {
    setSekme(kod);
    window.history.replaceState(null, "", `#${kod}`);
  };

  // Metinler yuklenince form degerlerini doldur (tenant icerik ?? bos)
  useEffect(() => {
    if (metinler) {
      const init: Record<string, string> = {};
      for (const m of metinler) {
        let v = m.icerik ?? "";
        // sayac_hedef_tarihi: date (YYYY-MM-DD) -> datetime-local (YYYY-MM-DDTHH:mm)
        if (m.anahtar === "sayac_hedef_tarihi" && v.length === 10) v += "T00:00";
        init[m.anahtar] = v;
      }
      setDegerler(init);
    }
  }, [metinler]);

  const aktifSekme = SEKMELER.find((s) => s.kod === sekme)!;

  const sekmeMetinleri = useMemo(() => {
    if (!metinler) return [];
    let liste = metinler
      .filter((m) => aktifSekme.kategoriler.includes(m.kategori))
      .sort((a, b) => a.sira - b.sira);
    if (sekme === "diger" && ara.trim()) {
      const q = ara.trim().toLocaleLowerCase("tr");
      liste = liste.filter(
        (m) => m.etiket.toLocaleLowerCase("tr").includes(q) || m.aciklama.toLocaleLowerCase("tr").includes(q)
      );
    }
    return liste;
  }, [metinler, aktifSekme, sekme, ara]);

  // Degisen anahtarlar (form degeri != tenant icerik)
  const degisenler = useMemo(
    () => (metinler ?? []).filter((m) => (degerler[m.anahtar] ?? "") !== (m.icerik ?? "")),
    [metinler, degerler]
  );

  const onDegis = (anahtar: string, yeni: string) => setDegerler((p) => ({ ...p, [anahtar]: yeni }));

  const [sonKayit, setSonKayit] = useState<number | null>(null);

  const otoKaydet = useMutation({
    mutationFn: async () => {
      // Kosullu zorunluluk: sayac acik ise sayac cumleleri + hedef tarih bos olamaz (inline uyari).
      // Auto-save sessiz: hatali alanlari ATLA (toast/sekme zorlamasi yok), gecerli alanlari kaydet.
      const h: Record<string, string> = {};
      const sayacAcik = (degerler["sayac_aktif"] ?? "") === "true";
      if (sayacAcik) {
        for (const a of ["sayac_aktif_cumle", "sayac_bitti_cumle", "sayac_hedef_tarihi"])
          if (!(degerler[a] ?? "").trim()) h[a] = "Sayaç açıkken bu alan boş bırakılamaz.";
      }
      setHatalar(h);
      const sayacEksik = Object.keys(h).length > 0;

      // Gecerli degisen alanlar: hatali olanlari + (sayac eksikse) sayac grubunu atla
      const kaydedilecek = degisenler.filter((m) => {
        if (h[m.anahtar]) return false;
        if (sayacEksik && m.kategori === "sayac") return false;
        return true;
      });
      if (kaydedilecek.length === 0) return;

      // Bos -> sifirla (tenant override kaldir, fallback'e doner); dolu -> guncelle
      await Promise.all(
        kaydedilecek.map((m) => {
          const yeni = (degerler[m.anahtar] ?? "").trim();
          return yeni === "" ? metinApi.sifirla(m.anahtar) : metinApi.guncelle(m.anahtar, yeni);
        })
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["isletme-metinleri"] });
      qc.invalidateQueries({ queryKey: ["isletme-aktif"] });
      qc.invalidateQueries({ queryKey: ["onboarding-durum"] });
      setSonKayit(Date.now());
    },
    retry: 3,
    retryDelay: (n) => Math.min(1000 * 2 ** n, 8000),
    onError: () => toast.error("Kaydedilemedi — bağlantını kontrol et"),
  });

  // Auto-save: icerik degisince 2sn debounce; "Simdi kaydet" butonu anlik tetikler.
  useAutoSave(JSON.stringify(degerler), degisenler.length > 0, () => otoKaydet.mutate());

  const durum: "bos" | "yaziliyor" | "kaydediliyor" | "kaydedildi" | "hata" =
    otoKaydet.isError ? "hata"
    : otoKaydet.isPending ? "kaydediliyor"
    : degisenler.length > 0 ? "yaziliyor"
    : sonKayit ? "kaydedildi" : "bos";

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-clay-400 dark:text-ink-300" />
      </main>
    );
  }

  if (isError) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-clay-500 dark:text-ink-200">Yüklenemedi, sayfayı yenileyin.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-24">
      <CountdownWidget />

      <header className="sticky top-0 z-30 bg-cream-100/85 dark:bg-ink-800/85 backdrop-blur-md border-b border-cream-300 dark:border-ink-700/60">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link href="/admin" className="flex items-center gap-1 text-clay-600 dark:text-ink-100 hover:text-clay-900 dark:hover:text-ink-50 transition-colors min-w-0">
            <ChevronLeft className="h-5 w-5 shrink-0" />
            <Heart className="h-4 w-4 text-terracotta hidden sm:inline" fill="currentColor" />
            <span className="font-display text-base truncate">Marka &amp; Görünüm</span>
          </Link>
          <div className="flex items-center gap-3 shrink-0">
            <Yenile />
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <div className="flex items-center gap-3">
          <Palette className="h-6 w-6 text-terracotta" />
          <h1 className="font-display text-3xl text-clay-900 dark:text-ink-50">Marka &amp; Görünüm</h1>
        </div>

        <div className="flex gap-1 border-b border-cream-300 dark:border-ink-700/60 overflow-x-auto">
          {SEKMELER.map((s) => (
            <button
              key={s.kod}
              type="button"
              onClick={() => sekmeSec(s.kod)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                sekme === s.kod
                  ? "border-terracotta text-terracotta"
                  : "border-transparent text-clay-500 dark:text-ink-200 hover:text-clay-800 dark:hover:text-ink-50"
              )}
            >
              {s.etiket}
            </button>
          ))}
        </div>

        {sekme === "diger" && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-clay-400 dark:text-ink-300" />
            <input
              type="text"
              value={ara}
              placeholder="Metin ara..."
              onChange={(e) => setAra(e.target.value)}
              className="w-full rounded-lg border border-cream-300 dark:border-ink-700/60 bg-cream-50 dark:bg-ink-900/40 pl-9 pr-3 py-2 text-sm text-clay-900 dark:text-ink-50 focus:outline-none focus:ring-2 focus:ring-terracotta/40"
            />
          </div>
        )}

        <div className="grid lg:grid-cols-[1fr_minmax(0,360px)] gap-6">
          <div className="kart p-6 space-y-6 min-h-[200px]">
          {sekmeMetinleri.length === 0 ? (
            <p className="text-sm text-clay-400 dark:text-ink-300 italic">Bu sekmede metin bulunmuyor.</p>
          ) : sekme === "diger" ? (
            // Diger: kategori basligi ile gruplu
            aktifSekme.kategoriler.map((kat) => {
              const grup = sekmeMetinleri.filter((m) => m.kategori === kat);
              if (grup.length === 0) return null;
              return (
                <div key={kat} className="space-y-4">
                  <h2 className="text-xs uppercase tracking-wider text-clay-400 dark:text-ink-300 font-medium">
                    {KATEGORI_BASLIK[kat] ?? kat}
                  </h2>
                  {grup.map((m) => (
                    <MetinAlani key={m.anahtar} metin={m} deger={degerler[m.anahtar] ?? ""} onDegis={onDegis} hata={hatalar[m.anahtar]} />
                  ))}
                </div>
              );
            })
          ) : (
            sekmeMetinleri.map((m) => (
              <MetinAlani key={m.anahtar} metin={m} deger={degerler[m.anahtar] ?? ""} onDegis={onDegis} hata={hatalar[m.anahtar]} />
            ))
          )}
          </div>

          <aside className="lg:sticky lg:top-24 self-start">
            <p className="text-xs italic text-clay-400 dark:text-ink-300 mb-2">Canlı Önizleme</p>
            <div className="kart p-5">
              <LivePreview sekme={sekme} degerler={degerler} />
            </div>
          </aside>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 bg-cream-100/90 dark:bg-ink-800/90 backdrop-blur-md border-t border-cream-300 dark:border-ink-700/60">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <span className="text-xs flex items-center gap-1.5">
            {durum === "kaydediliyor" && (
              <><Loader2 className="h-3.5 w-3.5 animate-spin text-clay-500" /><span className="text-clay-500 dark:text-ink-300">Kaydediliyor...</span></>
            )}
            {durum === "yaziliyor" && <span className="text-clay-500 dark:text-ink-300">✏️ Yazılıyor...</span>}
            {durum === "kaydedildi" && <span className="text-green-700 dark:text-green-400">✓ Kaydedildi</span>}
            {durum === "hata" && <span className="text-red-600 dark:text-red-400">⚠ Bağlantı hatası — otomatik tekrar deneniyor</span>}
            {durum === "bos" && <span className="text-clay-400 dark:text-ink-300">Tüm değişiklikler kayıtlı</span>}
          </span>
          <Button type="button" onClick={() => otoKaydet.mutate()} disabled={degisenler.length === 0 || otoKaydet.isPending}>
            {otoKaydet.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><Save className="h-4 w-4 mr-1.5" /> Şimdi kaydet</>)}
          </Button>
        </div>
      </div>
    </main>
  );
}
