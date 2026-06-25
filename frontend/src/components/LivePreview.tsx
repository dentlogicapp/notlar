"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Clock } from "lucide-react";
import { cozMetin } from "@/lib/useIsletmeMetinleri";
import { metinApi } from "@/lib/api";
import { sayacHesapla, hedefMsCoz, type SayacDurum } from "@/lib/sayac";

// v18 - Live Preview: marka sayfasinda field duzenlenirken anlik dinamik onizleme.
// Tek kutu standardi, canli sayac (geri+ileri), karsilama + not ipucu. Mail onizleme Asama D.
export function LivePreview({ sekme, degerler, mailAltSekme = "davetiye" }: { sekme: string; degerler: Record<string, string>; mailAltSekme?: string }) {
  const [sk, setSk] = useState<SayacDurum>({ gecti: false, gun: 0, sa: 0, dk: 0, sn: 0 });
  const hedefMs = hedefMsCoz(degerler["sayac_hedef_tarihi"] ?? "");

  // v19 4-B - gercek mail HTML onizleme (kayitli metinlerle, iframe). Alt-sekme degisince temizlenir.
  const [gercekHtml, setGercekHtml] = useState<string | null>(null);
  const [gercekYukleniyor, setGercekYukleniyor] = useState(false);
  const [gercekHata, setGercekHata] = useState<string | null>(null);
  useEffect(() => {
    setGercekHtml(null);
    setGercekHata(null);
  }, [mailAltSekme]);

  async function gercekOnizleAc() {
    const tip = mailAltSekme === "davetiye" ? "davet" : mailAltSekme;
    setGercekYukleniyor(true);
    setGercekHata(null);
    try {
      const html = await metinApi.mailOnizle(tip);
      setGercekHtml(html);
    } catch {
      setGercekHata("Önizleme alınamadı. Önce değişiklikleri kaydedin.");
    } finally {
      setGercekYukleniyor(false);
    }
  }

  useEffect(() => {
    if (hedefMs === null) return;
    setSk(sayacHesapla(hedefMs));
    const i = setInterval(() => setSk(sayacHesapla(hedefMs)), 1000);
    return () => clearInterval(i);
  }, [hedefMs]);

  const c = (anahtar: string) => cozMetin(degerler[anahtar] ?? "", degerler);
  const kutu = "rounded-xl border border-cream-300 dark:border-ink-700 px-4 py-3";

  if (sekme === "marka") {
    const ad = c("marka_adi") || "Marka Adı";
    const emoji = degerler["marka_emoji"] ?? "";
    // Tek kutu standardi (madde 1): emoji + ad birlikte
    return (
      <div className={kutu + " flex items-center gap-2.5"}>
        {emoji && <span className="text-xl shrink-0">{emoji}</span>}
        <span className="font-display text-lg text-clay-900 dark:text-ink-50 truncate">{ad}</span>
      </div>
    );
  }

  if (sekme === "karsilama") {
    return (
      <div className="space-y-3">
        <div className={kutu + " py-4"}>
          <p className="font-display text-xl text-clay-900 dark:text-ink-50 leading-tight">
            {c("dashboard_karsilama_basligi") || "Karşılama Başlığı"}
          </p>
          <p className="text-clay-500 dark:text-ink-200 mt-1.5 italic text-sm leading-relaxed">
            {c("dashboard_karsilama_alt_metin") || "Karşılama alt metni burada görünür."}
          </p>
        </div>
        {/* madde 2 - not ekleme kutusu onizleme */}
        <div className={kutu}>
          <p className="text-[11px] uppercase tracking-wider text-clay-400 dark:text-ink-300 mb-1.5">Not ekleme kutusu</p>
          <div className="rounded-lg border border-cream-300 dark:border-ink-700/60 bg-cream-50 dark:bg-ink-900/40 px-3 py-2 text-sm text-clay-400 dark:text-ink-300 italic truncate">
            {c("not_form_placeholder") || "Not ekleme ipucu..."}
          </div>
        </div>
      </div>
    );
  }

  if (sekme === "sayac") {
    const aktif = (degerler["sayac_aktif"] ?? "") === "true";
    if (!aktif) return <p className="text-sm italic text-clay-400 dark:text-ink-300">Sayaç kapalı — dashboard'da gösterilmez.</p>;
    if (hedefMs === null) return <p className="text-sm italic text-clay-400 dark:text-ink-300">Hedef tarih ve saat girilince önizleme görünür.</p>;

    // madde 3/4 - gecti ise bitti cumlesi + ileri sayim; gelmedi ise aktif cumle + geri sayim
    const baslik = sk.gecti
      ? (c("sayac_bitti_cumle") || "Sayaç bitti cümlesi")
      : (c("sayac_aktif_cumle") || "Sayaç aktif cümlesi");
    const sayacEmoji = degerler["marka_emoji"] || "";
    return (
      <div className={kutu + " flex items-center gap-3"}>
        {sayacEmoji
          ? <span className="text-2xl shrink-0 leading-none">{sayacEmoji}</span>
          : <Clock className="h-7 w-7 text-terracotta shrink-0" strokeWidth={1.5} />}
        <div className="flex flex-col min-w-0">
          <span className="text-[13px] tracking-[0.02em] text-clay-500 dark:text-ink-200 leading-none font-medium truncate">{baslik}</span>
          <div className="flex items-baseline gap-1.5 mt-1.5 tabular-nums font-display">
            <Rakam d={sk.gun} e="gün" vurgu />
            <span className="text-clay-300 text-sm">·</span>
            <Rakam d={sk.sa} e="sa" />
            <span className="text-clay-300 text-sm">·</span>
            <Rakam d={sk.dk} e="dk" />
            <span className="text-clay-300 text-sm">·</span>
            <Rakam d={sk.sn} e="sn" />
          </div>
          {sk.gecti && <span className="text-[10px] text-terracotta italic mt-1">hedef geçti — ileri sayım</span>}
        </div>
      </div>
    );
  }

  if (sekme === "mail") {
    // v19 6c - Gmail/Outlook zarfli onizleme. mailAltSekme: davetiye | hatirlatma | imza.
    // Notr tema (sektor-bagimsiz, EmailService 6a ile tutarli: kalp/diamond/sparkle YOK, marka adi logo).
    const markaAdi = c("marka_adi") || "Sistemim";
    const emoji = degerler["marka_emoji"] || "🔔";
    const imza = c("mail_imza");
    const mailSayacAktif = (degerler["sayac_aktif"] ?? "") === "true";
    const mailSayacBaslik = sk.gecti ? c("sayac_bitti_cumle") : c("sayac_aktif_cumle");
    const mailSayacGoster = mailSayacAktif && hedefMs !== null && mailSayacBaslik.length > 0;

    const markaLogo = (
      <div style={{ textAlign: "center", color: "#c4704d", fontSize: 14, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>{markaAdi}</div>
    );

    let konu: string;
    let govde: ReactNode;
    let altNot: string;

    if (mailAltSekme === "hatirlatma") {
      konu = c("mail_hatirlatma_konu") || "Hatırlatma: örnek not";
      altNot = "Hatırlatma maili önizleme";
      govde = (
        <>
          {markaLogo}
          <h3 style={{ fontFamily: "Georgia, serif", fontSize: 18, color: "#3d2817", margin: "6px 0 10px", textAlign: "center", fontWeight: 600 }}>Hatırlatma</h3>
          <p style={{ color: "#5d4a37", fontSize: 12.5, lineHeight: 1.7, textAlign: "center", margin: 0 }}>
            "<strong>Çiçekçiyi ara</strong>" notunun zamanı geldi.
          </p>
          {imza && <p style={{ color: "#9c8a73", fontSize: 12, textAlign: "center", margin: "16px 0 0", fontStyle: "italic", whiteSpace: "pre-wrap" }}>{imza}</p>}
        </>
      );
    } else if (mailAltSekme === "imza") {
      konu = "İmza önizleme";
      altNot = "İmza & genel — mail altında görünen imza";
      govde = (
        <>
          {markaLogo}
          <p style={{ color: "#5d4a37", fontSize: 12.5, lineHeight: 1.7, textAlign: "center", margin: "6px 0 12px" }}>Mail metinlerinin altında görünecek imza:</p>
          {imza
            ? <p style={{ color: "#9c8a73", fontSize: 13, textAlign: "center", margin: 0, fontStyle: "italic", whiteSpace: "pre-wrap" }}>{imza}</p>
            : <p style={{ color: "#b8a890", fontSize: 12, textAlign: "center", margin: 0, fontStyle: "italic" }}>(imza girilmedi — varsayılan kullanılır)</p>}
        </>
      );
    } else if (mailAltSekme === "eklendi") {
      konu = c("mail_eklendi_konu") || `${markaAdi} ekibine eklendiniz`;
      altNot = "Markaya eklendi maili - mevcut hesaba bilgilendirme";
      const giris = c("mail_eklendi_giris_metni") || `<strong>${markaAdi}</strong> çalışma alanına eklendiniz. Mevcut hesabınızla giriş yapabilirsiniz.`;
      govde = (
        <>
          {markaLogo}
          <h3 style={{ fontFamily: "Georgia, serif", fontSize: 20, color: "#3d2817", margin: "6px 0 4px", textAlign: "center", fontWeight: 600 }}>Ayşe,</h3>
          <p style={{ color: "#c4704d", fontSize: 12, textAlign: "center", margin: "0 0 10px", fontStyle: "italic" }}>ekibe eklendiniz</p>
          <div style={{ color: "#5d4a37", fontSize: 12.5, lineHeight: 1.7, textAlign: "justify", margin: "10px 0 0" }} dangerouslySetInnerHTML={{ __html: giris }} />
          <div style={{ textAlign: "center", margin: "18px 0 4px" }}>
            <span style={{ display: "inline-block", background: "#3d2817", color: "#faf6ef", padding: "10px 22px", borderRadius: 8, fontSize: 12.5, fontWeight: 500 }}>Giriş Yap</span>
          </div>
          {imza && <p style={{ color: "#9c8a73", fontSize: 12, textAlign: "center", margin: "16px 0 0", fontStyle: "italic", whiteSpace: "pre-wrap" }}>{imza}</p>}
        </>
      );
    } else if (mailAltSekme === "sifre") {
      konu = c("mail_sifre_konu") || "Şifre Sıfırlama";
      altNot = "Şifre sıfırlama maili önizleme";
      const giris = c("mail_sifre_giris_metni") || "Şifreni sıfırlamak için aşağıdaki bağlantıyı kullan.";
      govde = (
        <>
          {markaLogo}
          <h3 style={{ fontFamily: "Georgia, serif", fontSize: 18, color: "#3d2817", margin: "6px 0 10px", textAlign: "center", fontWeight: 600 }}>Şifre sıfırlama isteği</h3>
          <div style={{ color: "#5d4a37", fontSize: 12.5, lineHeight: 1.7, textAlign: "center", margin: 0 }} dangerouslySetInnerHTML={{ __html: giris }} />
          <div style={{ textAlign: "center", margin: "18px 0 4px" }}>
            <span style={{ display: "inline-block", background: "#3d2817", color: "#faf6ef", padding: "10px 22px", borderRadius: 8, fontSize: 12.5, fontWeight: 500 }}>Yeni Şifre Belirle</span>
          </div>
          {imza && <p style={{ color: "#9c8a73", fontSize: 12, textAlign: "center", margin: "16px 0 0", fontStyle: "italic", whiteSpace: "pre-wrap" }}>{imza}</p>}
        </>
      );
    } else {
      konu = c("mail_davetiye_konu") || "(mail konusu girilmedi)";
      altNot = "Davetiye maili — alıcının göreceği görünüm";
      const giris = c("mail_davetiye_giris_metni") || "Davetiye giriş metni burada görünür.";
      govde = (
        <>
          {markaLogo}
          <h3 style={{ fontFamily: "Georgia, serif", fontSize: 20, color: "#3d2817", margin: "6px 0 8px", textAlign: "center", fontWeight: 600 }}>Davetli,</h3>
          <div style={{ color: "#5d4a37", fontSize: 12.5, lineHeight: 1.7, textAlign: "justify", margin: "10px 0 0" }} dangerouslySetInnerHTML={{ __html: giris }} />
          {mailSayacGoster && (
            <p style={{ color: "#5d4a37", fontSize: 12.5, textAlign: "center", margin: "10px 0 0" }}>
              {mailSayacBaslik} <strong>{sk.gun} gün</strong>
            </p>
          )}
          <div style={{ textAlign: "center", margin: "18px 0 4px" }}>
            <span style={{ display: "inline-block", background: "#3d2817", color: "#faf6ef", padding: "10px 22px", borderRadius: 8, fontSize: 12.5, fontWeight: 500 }}>
              Hesabımı Aç ve Şifre Belirle
            </span>
          </div>
          {imza && <p style={{ color: "#9c8a73", fontSize: 12, textAlign: "center", margin: "16px 0 0", fontStyle: "italic", whiteSpace: "pre-wrap" }}>{imza}</p>}
        </>
      );
    }

    return (
      <div className="space-y-2">
        {/* Gmail/Outlook zarfi */}
        <div className="rounded-xl overflow-hidden border border-cream-300 dark:border-ink-700 bg-white dark:bg-ink-900">
          {/* gonderen bari */}
          <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-cream-200 dark:border-ink-700/60">
            <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm shrink-0" style={{ background: "#f0e9dd" }}>{emoji}</div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-clay-800 dark:text-ink-50 truncate">{markaAdi}</p>
              <p className="text-[10px] text-clay-400 dark:text-ink-300 truncate">sistem@dentlogicapp.com · bana</p>
            </div>
            <span className="text-[10px] text-clay-400 dark:text-ink-300 shrink-0">şimdi</span>
          </div>
          {/* konu */}
          <div className="px-3 py-2 border-b border-cream-200 dark:border-ink-700/60">
            <p className="text-sm font-semibold text-clay-900 dark:text-ink-50 leading-snug">{konu}</p>
          </div>
          {/* govde - notr mail temasi */}
          <div style={{ background: "#faf6ef", padding: 10 }}>
            <div style={{ background: "#ffffff", borderRadius: 12, padding: "20px 16px", border: "1px solid #ebe3d4" }}>
              {govde}
            </div>
          </div>
        </div>
        <p className="text-[10px] italic text-clay-400 dark:text-ink-300">{altNot}</p>
        {mailAltSekme !== "imza" && (
          <div className="pt-1">
            <button
              onClick={gercekOnizleAc}
              disabled={gercekYukleniyor}
              className="text-[11px] font-medium text-clay-600 dark:text-ink-200 underline underline-offset-2 hover:text-clay-800 disabled:opacity-50"
            >
              {gercekYukleniyor ? "Yükleniyor..." : gercekHtml ? "Önizlemeyi yenile" : "Gerçek mail önizlemesi"}
            </button>
            {gercekHata && <p className="text-[10px] text-red-500 mt-1">{gercekHata}</p>}
            {gercekHtml && (
              <iframe
                title="Gerçek mail önizleme"
                srcDoc={gercekHtml}
                className="w-full mt-2 rounded-lg border border-cream-300 dark:border-ink-700"
                style={{ height: 420, background: "#fff" }}
              />
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <p className="text-sm italic text-clay-400 dark:text-ink-300 leading-relaxed">
      Bu sekme için canlı önizleme yakında.
    </p>
  );
}

function Rakam({ d, e, vurgu }: { d: number; e: string; vurgu?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-0.5">
      <span className={vurgu ? "text-xl text-clay-900 dark:text-ink-50 font-semibold leading-none" : "text-base text-clay-700 dark:text-ink-100 leading-none"}>
        {d.toString().padStart(2, "0")}
      </span>
      <span className="text-[9px] text-clay-400 dark:text-ink-300 font-medium">{e}</span>
    </span>
  );
}
