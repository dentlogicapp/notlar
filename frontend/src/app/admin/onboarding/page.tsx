"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Check, Loader2, PartyPopper, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/AuthGuard";
import { UserMenu } from "@/components/UserMenu";
import { MetinAlani } from "@/components/MetinAlani";
import { LivePreview } from "@/components/LivePreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { metinApi } from "@/lib/api";
import { useIsletmeMetinleri } from "@/lib/useIsletmeMetinleri";
import { useAutoSave } from "@/lib/useAutoSave";

// Adim sirasi (Schema-as-Code'tan turetilir; sadece anahtari olan kategoriler adim olur)
const ADIM_KATEGORI = ["marka", "dashboard", "sayac", "mail", "bildirim", "form"] as const;
const KATEGORI_BASLIK: Record<string, string> = {
  marka: "Marka Kimliği",
  dashboard: "Karşılama",
  sayac: "Geri Sayım",
  mail: "E-posta Metinleri",
  bildirim: "Bildirimler",
  form: "Form İpuçları",
};
const KATEGORI_ALT: Record<string, string> = {
  marka: "Markanın adı ve görünümü",
  dashboard: "Kullanıcıları karşılayan metinler",
  sayac: "Dashboard geri sayım widget'ı",
  mail: "Davet ve hatırlatma e-postaları",
  bildirim: "Uygulama içi bildirim metinleri",
  form: "Form alanı ipuçları",
};
// LivePreview destekleyen kategoriler (sekme adi eslestirme)
const KATEGORI_PREVIEW: Record<string, string> = {
  marka: "marka",
  dashboard: "karsilama",
  sayac: "sayac",
  mail: "mail",
};
const RESUME_KEY = "onboarding_son_adim";

export default function OnboardingPage() {
  return (
    <AuthGuard>
      <Icerik />
    </AuthGuard>
  );
}

function Icerik() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: metinler, isLoading } = useIsletmeMetinleri({ kapsam: "Tenant" });

  const [degerler, setDegerler] = useState<Record<string, string>>({});
  const [hatalar, setHatalar] = useState<Record<string, string>>({});
  const [adimIndex, setAdimIndex] = useState(0);
  const [tamamlandi, setTamamlandi] = useState(false);
  const [sonKayit, setSonKayit] = useState<number | null>(null);
  const resumeYapildi = useRef(false);

  // Adimlar: non-deprecated anahtari olan kategoriler, sabit sirada
  const adimlar = useMemo(() => {
    if (!metinler) return [];
    return ADIM_KATEGORI.filter((k) =>
      metinler.some((m) => m.kategori === k && !m.deprecated)
    );
  }, [metinler]);

  // Form degerlerini doldur (tenant icerik ?? bos) - marka pattern
  useEffect(() => {
    if (!metinler) return;
    const init: Record<string, string> = {};
    for (const m of metinler) {
      let v = m.icerik ?? "";
      if (m.anahtar === "sayac_hedef_tarihi" && v.length === 10) v += "T00:00";
      init[m.anahtar] = v;
    }
    setDegerler(init);
  }, [metinler]);

  // Resume (E3): localStorage son adim, yoksa ilk zorunlu-eksik kategori
  useEffect(() => {
    if (!metinler || adimlar.length === 0 || resumeYapildi.current) return;
    resumeYapildi.current = true;
    const kayitli = Number(localStorage.getItem(RESUME_KEY) ?? "NaN");
    if (!Number.isNaN(kayitli) && kayitli >= 0 && kayitli < adimlar.length) {
      setAdimIndex(kayitli);
      return;
    }
    const ilkEksik = adimlar.findIndex((k) =>
      metinler.some((m) => m.kategori === k && m.zorunlu && !(m.icerik ?? "").trim())
    );
    if (ilkEksik >= 0) setAdimIndex(ilkEksik);
  }, [metinler, adimlar]);

  // Adim degisince localStorage (resume sonrasi)
  useEffect(() => {
    if (resumeYapildi.current) localStorage.setItem(RESUME_KEY, String(adimIndex));
  }, [adimIndex]);

  const aktifKategori = adimlar[adimIndex];
  const adimMetinleri = useMemo(() => {
    if (!metinler || !aktifKategori) return [];
    return metinler
      .filter((m) => m.kategori === aktifKategori && !m.deprecated)
      .sort((a, b) => a.sira - b.sira);
  }, [metinler, aktifKategori]);

  const degisenler = useMemo(
    () => (metinler ?? []).filter((m) => (degerler[m.anahtar] ?? "") !== (m.icerik ?? "")),
    [metinler, degerler]
  );

  const onDegis = (anahtar: string, yeni: string) =>
    setDegerler((p) => ({ ...p, [anahtar]: yeni }));

  // Zorunlu ilerleme (deprecated haric)
  const zorunluEksik = useMemo(
    () =>
      (metinler ?? []).filter(
        (m) => m.zorunlu && !m.deprecated && !(degerler[m.anahtar] ?? "").trim()
      ),
    [metinler, degerler]
  );
  const toplamAlan = (metinler ?? []).filter((m) => !m.deprecated).length;
  const dolanAlan = (metinler ?? []).filter(
    (m) => !m.deprecated && (degerler[m.anahtar] ?? "").trim()
  ).length;
  const ilerlemeYuzde = adimlar.length > 0 ? Math.round(((adimIndex + 1) / adimlar.length) * 100) : 0;
  const dakikaTahmin = Math.max(1, Math.ceil(toplamAlan * 0.4)); // E4

  // otoKaydet (marka pattern - sayac kosullu zorunluluk)
  const otoKaydet = useMutation({
    mutationFn: async () => {
      const h: Record<string, string> = {};
      const sayacAcik = (degerler["sayac_aktif"] ?? "") === "true";
      if (sayacAcik) {
        for (const a of ["sayac_aktif_cumle", "sayac_bitti_cumle", "sayac_hedef_tarihi"])
          if (!(degerler[a] ?? "").trim()) h[a] = "Sayaç açıkken bu alan boş bırakılamaz.";
      }
      setHatalar(h);
      const sayacEksik = Object.keys(h).length > 0;
      const kaydedilecek = degisenler.filter((m) => {
        if (h[m.anahtar]) return false;
        if (sayacEksik && m.kategori === "sayac") return false;
        return true;
      });
      if (kaydedilecek.length === 0) return;
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

  // E7/E11: wizard sonu welcome/davetiye onizleme test maili
  const [testEmail, setTestEmail] = useState("");
  const [testAd, setTestAd] = useState("");
  const testMail = useMutation({
    mutationFn: () => metinApi.onboardingTestMail(testEmail.trim(), testAd.trim() || undefined),
    onSuccess: () => toast.success("Test maili gonderildi - gelen kutunu kontrol et."),
    onError: () => toast.error("Mail gonderilemedi - adresi kontrol et."),
  });

  useAutoSave(JSON.stringify(degerler), degisenler.length > 0, () => otoKaydet.mutate());

  const sonAdim = adimIndex === adimlar.length - 1;
  const adimZorunluVar = adimMetinleri.some((m) => m.zorunlu);

  const ileri = () => {
    if (degisenler.length > 0) otoKaydet.mutate();
    if (sonAdim) {
      if (zorunluEksik.length === 0) {
        setTamamlandi(true);
        localStorage.removeItem(RESUME_KEY);
      } else {
        toast.error(`${zorunluEksik.length} zorunlu alan eksik`);
      }
    } else {
      setAdimIndex((i) => i + 1);
    }
  };
  const geri = () => setAdimIndex((i) => Math.max(0, i - 1));
  const atla = () => {
    if (!sonAdim) setAdimIndex((i) => i + 1);
  };

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-clay-400 dark:text-ink-300" />
      </main>
    );
  }

  // Tamamlama ekrani (Asama 18: confetti; Asama 17-E: welcome mail test)
  if (tamamlandi) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <PartyPopper className="h-16 w-16 text-terracotta mb-4" />
        <h1 className="font-display text-3xl text-clay-900 dark:text-ink-50">
          Tebrikler, {degerler["marka_adi"]?.trim() || "kurulum tamam"}!
        </h1>
        <p className="text-clay-500 dark:text-ink-300 mt-2 max-w-md">
          Tüm zorunlu metinleri doldurdun. Sistemin kullanıma hazır.
        </p>

        {/* E7/E11: ilk mailini kendi metninle test et */}
        <div className="w-full max-w-sm mt-6 rounded-2xl border border-cream-300 dark:border-ink-700/60 bg-cream-50 dark:bg-ink-800/40 p-5 text-left">
          <h2 className="font-display text-lg text-clay-900 dark:text-ink-50">İlk mailini test et</h2>
          <p className="text-xs text-clay-500 dark:text-ink-300 mt-1 leading-relaxed">
            Yazdığın davet metniyle gerçek bir test maili gönder — kendine, eşine ya da bir demo
            adresine. Sistemin nasıl göründüğünü ilk elden gör.
          </p>
          <div className="space-y-2 mt-3">
            <Input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="ornek@eposta.com"
            />
            <Input
              value={testAd}
              onChange={(e) => setTestAd(e.target.value)}
              placeholder="Alıcı adı (opsiyonel)"
            />
            <Button
              onClick={() => testMail.mutate()}
              disabled={!testEmail.trim() || testMail.isPending}
              className="w-full"
            >
              {testMail.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Test maili gönder"
              )}
            </Button>
          </div>
        </div>

        <Button variant="ghost" onClick={() => router.push("/")} className="mt-4">
          Dashboard'a git
        </Button>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-24">
      <header className="sticky top-0 z-30 bg-cream-100/85 dark:bg-ink-800/85 backdrop-blur-md border-b border-cream-300 dark:border-ink-700/60">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-1 text-clay-600 dark:text-ink-100 hover:text-clay-900 dark:hover:text-ink-50 transition-colors"
          >
            <ChevronLeft className="h-5 w-5 shrink-0" />
            <span className="truncate">Daha sonra</span>
          </button>
          <UserMenu />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 pt-6 space-y-5">
        {/* E4 time estimate + ilerleme */}
        <div className="flex items-center justify-between gap-3 text-sm text-clay-500 dark:text-ink-300 flex-wrap">
          <span>
            ~{dakikaTahmin} dakika · {toplamAlan} alan
          </span>
          <span className={ilerlemeYuzde >= 100 ? "text-terracotta font-medium" : ""}>
            %{ilerlemeYuzde} tamamlandı
          </span>
        </div>
        {/* progress bar (E10: dolunca terracotta pulse) */}
        <div className="h-2 rounded-full bg-cream-300 dark:bg-ink-700/60 overflow-hidden">
          <div
            className={`h-full bg-terracotta transition-all duration-500 ${
              ilerlemeYuzde >= 100 ? "animate-pulse" : ""
            }`}
            style={{ width: `${ilerlemeYuzde}%` }}
          />
        </div>

        {/* Adim baslik */}
        <div>
          <div className="flex items-baseline gap-2">
            <h1 className="font-display text-3xl text-clay-900 dark:text-ink-50">
              {KATEGORI_BASLIK[aktifKategori] ?? aktifKategori}
            </h1>
            <span className="text-sm text-clay-400 dark:text-ink-300">
              {adimIndex + 1}/{adimlar.length}
            </span>
          </div>
          <p className="text-sm text-clay-500 dark:text-ink-300 mt-0.5">
            {KATEGORI_ALT[aktifKategori] ?? ""}
          </p>
        </div>

        {/* E9: yonlendirme ipucu */}
        <div className="flex items-start gap-2 rounded-lg border border-cream-300 dark:border-ink-700/60 bg-cream-50 dark:bg-ink-900/30 px-3 py-2 text-[13px] text-clay-500 dark:text-ink-300">
          <Lightbulb className="h-4 w-4 shrink-0 mt-0.5 text-terracotta" />
          <span>Her alanın altındaki açıklamaya göz at — örnek ifadeler orada.</span>
        </div>

        {/* Form + LivePreview */}
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            {adimMetinleri.map((m) => {
              const dolu = !!(degerler[m.anahtar] ?? "").trim();
              return (
                <div key={m.anahtar} className="relative">
                  {/* E10: dolu alanda ✓ microanimation */}
                  {dolu && (
                    <span className="absolute -left-2 top-1 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full bg-terracotta text-white animate-in zoom-in duration-300">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                  <MetinAlani
                    metin={m}
                    deger={degerler[m.anahtar] ?? ""}
                    onDegis={onDegis}
                    hata={hatalar[m.anahtar]}
                  />
                </div>
              );
            })}
          </div>

          {KATEGORI_PREVIEW[aktifKategori] && (
            <div className="hidden lg:block">
              <div className="sticky top-20">
                <LivePreview sekme={KATEGORI_PREVIEW[aktifKategori]} degerler={degerler} />
              </div>
            </div>
          )}
        </div>

        {/* Navigasyon */}
        <div className="flex items-center justify-between gap-3 pt-2">
          {adimIndex > 0 ? (
            <Button variant="ghost" onClick={geri}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Geri
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {!adimZorunluVar && !sonAdim && (
              <Button variant="ghost" onClick={atla} className="text-clay-400 dark:text-ink-300">
                Atla
              </Button>
            )}
            <Button onClick={ileri}>
              {sonAdim ? "Tamamla" : "İleri"}
              {!sonAdim && <ChevronRight className="h-4 w-4 ml-1" />}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
