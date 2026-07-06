"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, ShieldCheck, Send, History, Users, FileText, FileSpreadsheet,
  Copy, Printer, FileDown, ClipboardPaste, Check, ShieldAlert, ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";
import {
  kvkkApi, kvkkBelgeIndir, kvkkOnamBelgeIndir,
  type KvkkMetinDetay,
} from "@/lib/api";
import { Button } from "./ui/button";
import { Textarea } from "./ui/input";
import { tarihFormat } from "@/lib/utils";
import { cn } from "@/lib/utils";

// v21 M7 + B2/B3 - Super admin KVKK yonetimi.
// Uc sekme: Metin Yayinla (ATOMIK: eski aktifler duser, yeni aktif = TUM
// kullanicilar yeniden onamlar) | Versiyon Gecmisi (butunsel detay + Kopyala/
// Yazdir/PDF/Taslaga Al + SHA-256 butunluk rozeti) | Onam Kayitlari (salt-okunur
// hukuki kanit; son 500 + PDF/XLSX disa aktarim).
// SERH: yayinlanan metin hukuki gecerlilik icin AVUKAT ONAYINDAN gecmis olmalidir.

type Sekme = "yayin" | "gecmis" | "onamlar";

export function KvkkYonetim() {
  const qc = useQueryClient();
  const [icerik, setIcerik] = useState("");
  const [pazarlama, setPazarlama] = useState("");
  const [sekme, setSekme] = useState<Sekme>("yayin");
  const [detayId, setDetayId] = useState<string | null>(null);

  const { data: metinler } = useQuery({ queryKey: ["kvkk-metinler"], queryFn: kvkkApi.metinler });
  const { data: onamlar, isLoading: onamYukleniyor, isError: onamHata,
    error: onamHataNesnesi, refetch: onamYenile } = useQuery({
    queryKey: ["kvkk-onamlar"],
    queryFn: kvkkApi.onamlar,
    enabled: sekme === "onamlar",
  });

  const yayinla = useMutation({
    mutationFn: () => kvkkApi.metinYayinla(icerik.trim(), pazarlama.trim() || null),
    onSuccess: (r) => {
      toast.success(`KVKK metni v${r.versiyon} yayınlandı - tüm kullanıcılardan yeniden onam istenecek`);
      setIcerik(""); setPazarlama("");
      qc.invalidateQueries({ queryKey: ["kvkk-metinler"] });
      qc.invalidateQueries({ queryKey: ["kvkk-aktif"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Taslaga Al: bir versiyonun icerigini yayin formuna kopyalar (soft kopya).
  // Yayinlanmis metin ASLA degismez; buradan yeni versiyon TURETILIR.
  const taslagaAl = (d: KvkkMetinDetay) => {
    setIcerik(d.icerik);
    setPazarlama(d.pazarlamaIcerik ?? "");
    setSekme("yayin");
    setDetayId(null);
    toast.success(`v${d.versiyon} taslağa alındı - düzenleyip yeni versiyon olarak yayınlayabilirsin`);
  };

  const sekmeButonu = (deger: Sekme, ikon: React.ReactNode, etiket: string) => (
    <button type="button" onClick={() => { setSekme(deger); setDetayId(null); }}
      className={cn("px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1",
        sekme === deger ? "bg-terracotta/15 text-terracotta" : "text-clay-400 dark:text-ink-300 hover:bg-cream-200 dark:hover:bg-ink-800")}>
      {ikon} {etiket}
    </button>
  );

  return (
    <div className="kart p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-clay-800 dark:text-ink-50 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-terracotta" /> KVKK Yönetimi
        </h2>
        <div className="flex gap-1.5">
          {sekmeButonu("yayin", <Send className="h-3 w-3" />, "Metin Yayınla")}
          {sekmeButonu("gecmis", <History className="h-3 w-3" />, "Versiyon Geçmişi")}
          {sekmeButonu("onamlar", <Users className="h-3 w-3" />, "Onam Kayıtları")}
        </div>
      </div>

      {sekme === "yayin" && (
        <div className="space-y-3">
          <p className="text-[11px] text-clay-400 dark:text-ink-300 leading-relaxed">
            Yeni versiyon yayınlamak, eski versiyonu pasifleştirir ve <strong>tüm kullanıcılardan yeniden onam ister</strong>.
            Metin, hukuki geçerlilik için avukat onayından geçmiş olmalıdır.
          </p>
          <Textarea rows={8} value={icerik} onChange={(e) => setIcerik(e.target.value)}
            placeholder="KVKK aydınlatma ve onam metni (avukat onaylı)..." className="text-justify" />
          <Textarea rows={3} value={pazarlama} onChange={(e) => setPazarlama(e.target.value)}
            placeholder="Pazarlama izni metni (isteğe bağlı; ayrı açık rıza olarak sunulur)..." className="text-justify" />
          <div className="flex justify-end">
            <Button size="sm" disabled={!icerik.trim() || yayinla.isPending}
              onClick={() => { if (confirm("Yeni versiyon yayınlanacak ve TÜM kullanıcılardan yeniden onam istenecek. Devam?")) yayinla.mutate(); }}>
              {yayinla.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />}
              Yayınla
            </Button>
          </div>
        </div>
      )}

      {sekme === "gecmis" && (
        detayId
          ? <VersiyonDetay id={detayId} onGeri={() => setDetayId(null)} onTaslagaAl={taslagaAl} />
          : <VersiyonListesi metinler={metinler ?? []} onSec={setDetayId} />
      )}

      {sekme === "onamlar" && (
        onamYukleniyor ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-clay-400 dark:text-ink-300" /></div>
        ) : onamHata ? (
          <div className="py-6 text-center space-y-3">
            <p className="text-[12px] text-red-600 dark:text-red-400">
              Onam kayıtları yüklenemedi: {(onamHataNesnesi as Error)?.message ?? "sunucu hatası"}
            </p>
            <Button size="sm" onClick={() => onamYenile()}>Tekrar Dene</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-[11px] text-clay-400 dark:text-ink-300">
                Salt-okunur hukuki kanıt · en yeni üstte · son 500 kayıt
              </p>
              <OnamDisaAktar />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="text-clay-400 dark:text-ink-300 uppercase tracking-wider">
                  <tr>
                    <th className="text-left py-1.5 pr-3 font-medium">Kullanıcı</th>
                    <th className="text-left py-1.5 pr-3 font-medium">Versiyon</th>
                    <th className="text-left py-1.5 pr-3 font-medium">Pazarlama</th>
                    <th className="text-left py-1.5 pr-3 font-medium hidden sm:table-cell">IP</th>
                    <th className="text-left py-1.5 font-medium">Zaman</th>
                  </tr>
                </thead>
                <tbody>
                  {(onamlar ?? []).map((o) => (
                    <tr key={o.id} title={o.kullaniciAjan ?? undefined} className="border-t border-cream-300 dark:border-ink-700">
                      <td className="py-1.5 pr-3">
                        <span className="text-clay-800 dark:text-ink-50">{o.adSoyad}</span>
                        <span className="text-clay-400 dark:text-ink-300 hidden md:inline"> · {o.email}</span>
                      </td>
                      <td className="py-1.5 pr-3 font-mono">v{o.versiyon}</td>
                      <td className="py-1.5 pr-3">{o.pazarlamaIzni ? "✓ verdi" : "—"}</td>
                      <td className="py-1.5 pr-3 font-mono hidden sm:table-cell">{o.ip ?? "—"}</td>
                      <td className="py-1.5 whitespace-nowrap">{tarihFormat(o.onamZamani)}</td>
                    </tr>
                  ))}
                  {(onamlar ?? []).length === 0 && (
                    <tr><td colSpan={5} className="py-6 text-center text-clay-400 dark:text-ink-300">Henüz onam kaydı yok.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}

// ──────── VERSIYON LISTESI ────────

function VersiyonListesi({ metinler, onSec }: {
  metinler: { id: string; versiyon: number; sha256Hash: string; yayinZamani: string; aktif: boolean }[];
  onSec: (id: string) => void;
}) {
  if (metinler.length === 0) {
    return <p className="py-8 text-center text-[12px] text-clay-400 dark:text-ink-300">Henüz yayınlanmış KVKK metni yok.</p>;
  }
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-clay-400 dark:text-ink-300 mb-2">
        Bir sürüme tıklayarak tam metni görüntüle, kopyala, yazdır veya PDF indir.
      </p>
      {metinler.map((m) => (
        <button key={m.id} type="button" onClick={() => onSec(m.id)}
          className="w-full flex items-center gap-2 text-[11px] p-2 rounded-lg border border-cream-300 dark:border-ink-700 hover:border-terracotta/50 hover:bg-cream-100 dark:hover:bg-ink-800 transition-colors text-left">
          <span className={cn("px-1.5 py-0.5 rounded-md font-mono shrink-0",
            m.aktif ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" : "bg-cream-200 dark:bg-ink-800 text-clay-500 dark:text-ink-200")}>
            v{m.versiyon}{m.aktif && " · aktif"}
          </span>
          <span className="text-clay-500 dark:text-ink-200">{tarihFormat(m.yayinZamani)}</span>
          <span className="font-mono text-clay-400 dark:text-ink-300 truncate ml-auto max-w-[120px]">{m.sha256Hash.slice(0, 12)}…</span>
        </button>
      ))}
    </div>
  );
}

// ──────── VERSIYON DETAY (butunsel goruntuleme + aksiyonlar) ────────

function VersiyonDetay({ id, onGeri, onTaslagaAl }: {
  id: string;
  onGeri: () => void;
  onTaslagaAl: (d: KvkkMetinDetay) => void;
}) {
  const [pdfYukleniyor, setPdfYukleniyor] = useState(false);
  const [kopyalandi, setKopyalandi] = useState(false);

  const { data: d, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["kvkk-metin-detay", id],
    queryFn: () => kvkkApi.metinDetay(id),
  });

  const butunselMetin = (x: KvkkMetinDetay) =>
    x.pazarlamaIcerik
      ? `KVKK AYDINLATMA VE ONAM METNİ (v${x.versiyon})\n\n${x.icerik}\n\n${"─".repeat(40)}\n\nTİCARİ ELEKTRONİK İLETİ (PAZARLAMA) AÇIK RIZA METNİ\n\n${x.pazarlamaIcerik}`
      : `KVKK AYDINLATMA VE ONAM METNİ (v${x.versiyon})\n\n${x.icerik}`;

  const kopyala = async (x: KvkkMetinDetay) => {
    try {
      await navigator.clipboard.writeText(butunselMetin(x));
      setKopyalandi(true);
      toast.success("Metnin tamamı panoya kopyalandı");
      setTimeout(() => setKopyalandi(false), 2000);
    } catch {
      toast.error("Panoya kopyalanamadı");
    }
  };

  const yazdir = (x: KvkkMetinDetay) => {
    const w = window.open("", "_blank", "width=800,height=1000");
    if (!w) { toast.error("Yazdırma penceresi açılamadı (popup engellenmiş olabilir)"); return; }
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const paragraf = (metin: string) => metin.split(/\n\n+/).map((p) => `<p>${esc(p).replace(/\n/g, "<br/>")}</p>`).join("");
    w.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>KVKK Metni v${x.versiyon}</title>
<style>@page{size:A4;margin:20mm}body{font-family:Georgia,serif;line-height:1.7;color:#2a1b0f;max-width:170mm;margin:0 auto}
h1{font-size:20pt;border-bottom:2px solid #c4704d;padding-bottom:8px}h2{font-size:14pt;color:#a85a3e;margin-top:24px}
p{text-align:justify;margin-bottom:10px}.kunye{margin-top:28px;padding:14px;background:#fdfaf4;border:1px solid #ebe3d4;border-radius:8px;font-family:sans-serif;font-size:9pt;color:#8a6541}
.kunye b{color:#2a1b0f}.hash{font-family:monospace;word-break:break-all}</style></head><body>
<h1>KVKK Aydınlatma Metni <span style="font-size:12pt;color:#8a6541">v${x.versiyon}${x.aktif ? " · yürürlükte" : " · arşiv"}</span></h1>
${paragraf(esc(x.icerik))}
${x.pazarlamaIcerik ? `<h2>Ticari Elektronik İleti (Pazarlama) Açık Rıza Metni</h2>${paragraf(esc(x.pazarlamaIcerik))}` : ""}
<div class="kunye"><b>Belge Bütünlük Künyesi</b><br/>
Sürüm: v${x.versiyon}${x.aktif ? " (yürürlükte)" : " (arşiv)"}<br/>
Yayın: ${new Date(x.yayinZamani).toLocaleString("tr-TR")}<br/>
Yayınlayan: ${esc(x.yayinlayanAdSoyad ?? "-")}<br/>
SHA-256: <span class="hash">${x.sha256Hash}</span></div>
</body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 300);
  };

  const pdfIndir = async () => {
    setPdfYukleniyor(true);
    try {
      await kvkkBelgeIndir(id, "pdf");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPdfYukleniyor(false);
    }
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-clay-400 dark:text-ink-300" /></div>;
  if (isError || !d) return (
    <div className="py-6 text-center space-y-3">
      <p className="text-[12px] text-red-600 dark:text-red-400">
        Detay yüklenemedi: {(error as Error)?.message ?? "sunucu hatası"}
      </p>
      <div className="flex justify-center gap-2">
        <Button size="sm" variant="ghost" onClick={onGeri}>Geri</Button>
        <Button size="sm" onClick={() => refetch()}>Tekrar Dene</Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Ust bar: geri + aksiyonlar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <button type="button" onClick={onGeri}
          className="text-[11px] text-clay-500 dark:text-ink-200 hover:text-terracotta flex items-center gap-1">
          <ChevronLeft className="h-3.5 w-3.5" /> Geçmişe dön
        </button>
        <div className="flex gap-1.5 flex-wrap">
          <AksiyonBtn onClick={() => kopyala(d)} ikon={kopyalandi ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} etiket={kopyalandi ? "Kopyalandı" : "Kopyala"} />
          <AksiyonBtn onClick={() => yazdir(d)} ikon={<Printer className="h-3 w-3" />} etiket="Yazdır" />
          <AksiyonBtn onClick={pdfIndir} yukleniyor={pdfYukleniyor} ikon={<FileDown className="h-3 w-3" />} etiket="PDF İndir" />
          <AksiyonBtn onClick={() => onTaslagaAl(d)} ikon={<ClipboardPaste className="h-3 w-3" />} etiket="Taslağa Al" vurgu />
        </div>
      </div>

      {/* Baslik + durum */}
      <div className="flex items-baseline gap-2">
        <h3 className="text-base font-display text-clay-900 dark:text-ink-50">KVKK Metni v{d.versiyon}</h3>
        <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium",
          d.aktif ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" : "bg-cream-200 dark:bg-ink-800 text-clay-500 dark:text-ink-200")}>
          {d.aktif ? "Yürürlükteki Sürüm" : "Arşiv Sürümü"}
        </span>
      </div>

      {/* Ana metin */}
      <div className="rounded-lg border border-cream-300 dark:border-ink-700 p-4 max-h-[360px] overflow-y-auto space-y-3">
        <p className="text-[13px] leading-relaxed text-clay-700 dark:text-ink-100 whitespace-pre-wrap text-justify">
          {d.icerik}
        </p>
        {d.pazarlamaIcerik && (
          <div className="pt-3 border-t border-cream-300 dark:border-ink-600">
            <h4 className="text-[12px] font-semibold text-clay-800 dark:text-ink-50 mb-1.5">
              Ticari Elektronik İleti (Pazarlama) Açık Rıza Metni
            </h4>
            <p className="text-[12px] leading-relaxed text-clay-600 dark:text-ink-100 whitespace-pre-wrap text-justify">
              {d.pazarlamaIcerik}
            </p>
          </div>
        )}
      </div>

      {/* B-1 butunluk rozeti + hukuki kunye */}
      <ButunlukKunye detay={d} butunselHesap={() => `${d.icerik}\n---\n${d.pazarlamaIcerik ?? ""}`} />
    </div>
  );
}

// ──────── B-1 BUTUNLUK ROZETI (WebCrypto SHA-256) ────────

function ButunlukKunye({ detay, butunselHesap }: {
  detay: KvkkMetinDetay;
  butunselHesap: () => string;
}) {
  const [durum, setDurum] = useState<"bekliyor" | "dogru" | "yanlis" | "hata">("bekliyor");

  const dogrula = async () => {
    try {
      const veri = new TextEncoder().encode(butunselHesap());
      const buf = await crypto.subtle.digest("SHA-256", veri);
      const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
      setDurum(hex === detay.sha256Hash.toLowerCase() ? "dogru" : "yanlis");
    } catch {
      setDurum("hata");
    }
  };

  return (
    <div className="rounded-lg bg-cream-100 dark:bg-ink-900 border border-cream-300 dark:border-ink-700 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-terracotta-dark dark:text-terracotta">Belge Bütünlük Künyesi</span>
        {durum === "bekliyor" && (
          <button type="button" onClick={dogrula}
            className="text-[10px] px-2 py-0.5 rounded-md bg-terracotta/10 text-terracotta hover:bg-terracotta/20 transition-colors flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" /> Bütünlüğü Doğrula
          </button>
        )}
        {durum === "dogru" && (
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400 flex items-center gap-1">
            <Check className="h-3 w-3" /> Bütünlük doğrulandı
          </span>
        )}
        {durum === "yanlis" && (
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400 flex items-center gap-1">
            <ShieldAlert className="h-3 w-3" /> Hash uyuşmuyor
          </span>
        )}
        {durum === "hata" && (
          <span className="text-[10px] text-clay-400 dark:text-ink-300">Doğrulanamadı</span>
        )}
      </div>
      <dl className="text-[10px] space-y-1 text-clay-500 dark:text-ink-200">
        <div className="flex gap-2"><dt className="w-20 shrink-0">Sürüm</dt><dd className="text-clay-800 dark:text-ink-50">v{detay.versiyon}{detay.aktif ? " (yürürlükte)" : " (arşiv)"}</dd></div>
        <div className="flex gap-2"><dt className="w-20 shrink-0">Yayın</dt><dd className="text-clay-800 dark:text-ink-50">{new Date(detay.yayinZamani).toLocaleString("tr-TR")}</dd></div>
        <div className="flex gap-2"><dt className="w-20 shrink-0">Yayınlayan</dt><dd className="text-clay-800 dark:text-ink-50">{detay.yayinlayanAdSoyad ?? "-"}</dd></div>
        <div className="flex gap-2"><dt className="w-20 shrink-0">SHA-256</dt><dd className="font-mono break-all text-clay-600 dark:text-ink-100">{detay.sha256Hash}</dd></div>
      </dl>
    </div>
  );
}

// ──────── ONAM DISA AKTAR (PDF / XLSX) ────────

function OnamDisaAktar() {
  const [yuklenen, setYuklenen] = useState<"pdf" | "xlsx" | null>(null);

  const indir = async (format: "pdf" | "xlsx") => {
    setYuklenen(format);
    try {
      await kvkkOnamBelgeIndir(format);
      toast.success(`Onam kayıtları ${format.toUpperCase()} indirildi`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setYuklenen(null);
    }
  };

  return (
    <div className="flex gap-1.5">
      <AksiyonBtn onClick={() => indir("pdf")} yukleniyor={yuklenen === "pdf"} disabled={!!yuklenen}
        ikon={<FileText className="h-3 w-3" />} etiket="PDF" />
      <AksiyonBtn onClick={() => indir("xlsx")} yukleniyor={yuklenen === "xlsx"} disabled={!!yuklenen}
        ikon={<FileSpreadsheet className="h-3 w-3" />} etiket="Excel" />
    </div>
  );
}

// ──────── ORTAK AKSIYON BUTONU ────────

function AksiyonBtn({ onClick, ikon, etiket, yukleniyor, disabled, vurgu }: {
  onClick: () => void;
  ikon: React.ReactNode;
  etiket: string;
  yukleniyor?: boolean;
  disabled?: boolean;
  vurgu?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={yukleniyor || disabled}
      className={cn("text-[11px] px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed",
        vurgu
          ? "bg-terracotta text-cream-50 hover:bg-terracotta-dark"
          : "border border-cream-300 dark:border-ink-700 text-clay-600 dark:text-ink-100 hover:border-terracotta/50 hover:bg-cream-100 dark:hover:bg-ink-800")}>
      {yukleniyor ? <Loader2 className="h-3 w-3 animate-spin" /> : ikon} {etiket}
    </button>
  );
}
