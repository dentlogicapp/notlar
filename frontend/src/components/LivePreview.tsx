"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cozMetin } from "@/lib/useIsletmeMetinleri";
import { metinApi } from "@/lib/api";
import { sayacHesapla, hedefMsCoz, type SayacDurum } from "@/lib/sayac";

// v18 - Live Preview: marka sayfasinda field duzenlenirken anlik dinamik onizleme.
// Tek kutu standardi, canli sayac (geri+ileri), karsilama + not ipucu. Mail onizleme Asama D.
export function LivePreview({ sekme, degerler, mailAltSekme = "davetiye" }: { sekme: string; degerler: Record<string, string>; mailAltSekme?: string }) {
  const [sk, setSk] = useState<SayacDurum>({ gecti: false, gun: 0, sa: 0, dk: 0, sn: 0 });
  const hedefMs = hedefMsCoz(degerler["sayac_hedef_tarihi"] ?? "");

  // v19 Is2 - gercek mail HTML onizleme ANLIK: mail sekmesinde alt-sekme/duzenleme degisince
  // debounce ile backend render (kaydedilmemis degerler de gonderilir). imza tipi haric.
  const [gercekHtml, setGercekHtml] = useState<string | null>(null);
  const [gercekYukleniyor, setGercekYukleniyor] = useState(false);
  const [gercekHata, setGercekHata] = useState<string | null>(null);
  useEffect(() => {
    setGercekHtml(null);
    setGercekHata(null);
  }, [mailAltSekme]);
  useEffect(() => {
    if (sekme !== "mail" || mailAltSekme === "imza") return;
    const tip = mailAltSekme === "davetiye" ? "davet" : mailAltSekme;
    const t = setTimeout(async () => {
      setGercekYukleniyor(true);
      setGercekHata(null);
      try {
        const html = await metinApi.mailOnizle(tip, degerler);
        setGercekHtml(html);
      } catch {
        setGercekHata("Önizleme yüklenemedi.");
      } finally {
        setGercekYukleniyor(false);
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sekme, mailAltSekme, JSON.stringify(degerler)]);

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
    const imza = c("mail_imza");

    // Imza alt-sekmesi: gercek mail tipi degil (imza tum maillerin altinda). Client-side gosterim.
    if (mailAltSekme === "imza") {
      return (
        <div className="space-y-2">
          <div className="rounded-xl border border-cream-300 dark:border-ink-700 bg-white dark:bg-ink-900 p-5">
            <p className="text-xs text-clay-500 dark:text-ink-300 text-center mb-3">Tüm mail tiplerinin altında görünecek imza:</p>
            {imza
              ? <p className="text-sm text-clay-600 dark:text-ink-200 text-center italic whitespace-pre-wrap">{imza}</p>
              : <p className="text-xs text-clay-400 dark:text-ink-400 text-center italic">(imza girilmedi - varsayılan kullanılır)</p>}
          </div>
          <p className="text-[10px] italic text-clay-400 dark:text-ink-300">İmza; davet, hatırlatma, markaya eklendi ve şifre maillerinin altında görünür.</p>
        </div>
      );
    }

    // davet/hatirlatma/eklendi/sifre: GERCEK mail HTML, ANLIK (duzenleme degerleri backend'e gonderilir, debounce).
    return (
      <div className="space-y-2">
        {gercekHata ? (
          <div className="rounded-xl border border-cream-300 dark:border-ink-700 p-6 text-center" style={{ minHeight: 160 }}>
            <p className="text-xs text-clay-500 dark:text-ink-300">{gercekHata}</p>
          </div>
        ) : gercekHtml ? (
          <div className="relative">
            <iframe
              title="Gerçek mail önizleme"
              srcDoc={gercekHtml}
              scrolling="no"
              onLoad={(e) => {
                const f = e.currentTarget;
                try {
                  const h = f.contentWindow?.document.body.scrollHeight;
                  if (h) f.style.height = h + 8 + "px";
                } catch { /* cross-origin guard */ }
              }}
              className="w-full max-w-[600px] mx-auto block rounded-xl border border-cream-300 dark:border-ink-700 bg-white"
              style={{ minHeight: 320, border: 0 }}
            />
            {gercekYukleniyor && (
              <div className="absolute top-2 right-2 text-[10px] text-clay-500 bg-white/85 dark:bg-ink-900/85 px-2 py-0.5 rounded-md shadow-sm">güncelleniyor...</div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-cream-300 dark:border-ink-700 flex items-center justify-center" style={{ height: 200 }}>
            <p className="text-xs text-clay-400 dark:text-ink-300">{gercekYukleniyor ? "Önizleme yükleniyor..." : "Önizleme hazırlanıyor..."}</p>
          </div>
        )}
        <p className="text-[10px] italic text-clay-400 dark:text-ink-300">Gerçek mail önizlemesi - düzenledikçe anlık güncellenir.</p>
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
