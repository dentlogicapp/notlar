using System.Globalization;
using System.Net;
using System.Text;
using Notlar.Api.Entities;

namespace Notlar.Api.Services;

/// <summary>
/// v14 — Defteri İndir için TEK KAYNAK HTML şablonu.
/// Davetiye stilinde (Fraunces + terracotta + cream + clay, ♡ ve asma motifleri).
/// Bu HTML hem doğrudan tarayıcıya verilir (HTML format), hem de PDF (Chromium print)
/// ve DOCX (HtmlToOpenXml) dönüşümleri için kaynak olarak kullanılır.
///
/// Tasarım kaynak: davetiye sayfasıyla aynı estetik —
/// kapak / içindekiler / klasör bölümleri / not kartları / sayfa numaralı footer.
/// </summary>
public static class HtmlTasarimcisi
{
    private static readonly TimeZoneInfo IstanbulTz =
        TryFindIstanbulTz() ?? TimeZoneInfo.Utc;

    private static TimeZoneInfo? TryFindIstanbulTz()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("Europe/Istanbul"); }
        catch { }
        try { return TimeZoneInfo.FindSystemTimeZoneById("Turkey Standard Time"); }
        catch { }
        return null;
    }

    private static string Tr(DateTimeOffset zaman) =>
        TimeZoneInfo.ConvertTime(zaman, IstanbulTz)
            .ToString("d MMMM yyyy", new CultureInfo("tr-TR"));

    private static string TrSaat(DateTimeOffset zaman) =>
        TimeZoneInfo.ConvertTime(zaman, IstanbulTz)
            .ToString("d MMMM yyyy · HH:mm", new CultureInfo("tr-TR"));

    /// <summary>
    /// Defterimizin tam HTML çıktısını üretir. Print-friendly CSS @page kuralları dahil.
    /// </summary>
    public static string Uret(List<(string Ad, bool SistemMi, List<Not> Notlar)> gruplar)
    {
        var bugun = Tr(DateTimeOffset.UtcNow);
        var dugun = new DateTime(2026, 9, 1);
        var kalanGun = Math.Max(0, (dugun - DateTime.UtcNow.Date).Days);
        var toplamNot = gruplar.Sum(g => g.Notlar.Count);
        var toplamTamamlanan = gruplar.Sum(g => g.Notlar.Count(n => n.Tamamlandi));

        var sb = new StringBuilder(64_000);
        BasligiYaz(sb);
        AcKapaksizSayfayi(sb);
        KapakYaz(sb, bugun, kalanGun, toplamNot, toplamTamamlanan);
        IcindekilerYaz(sb, gruplar);
        foreach (var (ad, sistemMi, notlar) in gruplar)
        {
            KlasorBolumuYaz(sb, ad, sistemMi, notlar);
        }
        SayfayiKapat(sb);
        BitisiYaz(sb);
        return sb.ToString();
    }

    // ─────────────────── HEAD + CSS ───────────────────

    private static void BasligiYaz(StringBuilder sb)
    {
        sb.AppendLine("<!DOCTYPE html>");
        sb.AppendLine("<html lang=\"tr\">");
        sb.AppendLine("<head>");
        sb.AppendLine("<meta charset=\"UTF-8\" />");
        sb.AppendLine("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />");
        sb.AppendLine("<title>Planlama Defterimiz</title>");
        sb.AppendLine("<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">");
        sb.AppendLine("<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>");
        sb.AppendLine("<link href=\"https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,300;9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600&display=swap\" rel=\"stylesheet\">");
        sb.AppendLine("<style>");
        sb.Append(CssTema);
        sb.AppendLine("</style>");
        sb.AppendLine("</head>");
        sb.AppendLine("<body>");
    }

    private static void AcKapaksizSayfayi(StringBuilder sb) =>
        sb.AppendLine("<main class=\"defter\">");

    private static void SayfayiKapat(StringBuilder sb) =>
        sb.AppendLine("</main>");

    private static void BitisiYaz(StringBuilder sb)
    {
        sb.AppendLine("</body>");
        sb.AppendLine("</html>");
    }

    // ─────────────────── KAPAK ───────────────────

    private static void KapakYaz(StringBuilder sb, string bugun, int kalanGun,
        int toplamNot, int toplamTamamlanan)
    {
        sb.AppendLine("<section class=\"kapak\">");
        sb.AppendLine("  <div class=\"kapak-asma kapak-asma--sol\">" + SvgAsma + "</div>");
        sb.AppendLine("  <div class=\"kapak-asma kapak-asma--sag\">" + SvgAsma + "</div>");
        sb.AppendLine("  <div class=\"kapak-icerik\">");
        sb.AppendLine("    <div class=\"kapak-kalp\">" + SvgKalpBuyuk + "</div>");
        sb.AppendLine("    <h1 class=\"kapak-baslik\">Planlama<br/><em>Defterimiz</em></h1>");
        sb.AppendLine("    <div class=\"kapak-altcizgi\"><span class=\"kalp-mini\">♡</span></div>");
        sb.AppendLine("    <p class=\"kapak-altyazi\">en mutlu günümüze giderken yazdıklarımız</p>");
        sb.AppendLine("    <div class=\"kapak-istatistik\">");
        sb.AppendLine($"      <div class=\"istatistik-kart\"><span class=\"istatistik-sayi\">{toplamNot}</span><span class=\"istatistik-etiket\">not</span></div>");
        sb.AppendLine($"      <div class=\"istatistik-kart\"><span class=\"istatistik-sayi\">{toplamTamamlanan}</span><span class=\"istatistik-etiket\">tamamlandı</span></div>");
        sb.AppendLine($"      <div class=\"istatistik-kart\"><span class=\"istatistik-sayi\">{kalanGun}</span><span class=\"istatistik-etiket\">gün kaldı</span></div>");
        sb.AppendLine("    </div>");
        sb.AppendLine($"    <p class=\"kapak-tarih\">{Esc(bugun)}</p>");
        sb.AppendLine("    <p class=\"kapak-isim\">Musa &amp; Esma</p>");
        sb.AppendLine("  </div>");
        sb.AppendLine("</section>");
    }

    // ─────────────────── İÇİNDEKİLER ───────────────────

    private static void IcindekilerYaz(StringBuilder sb,
        List<(string Ad, bool SistemMi, List<Not> Notlar)> gruplar)
    {
        sb.AppendLine("<section class=\"icindekiler\">");
        sb.AppendLine("  <header class=\"bolum-baslik\">");
        sb.AppendLine("    <span class=\"bolum-baslik-cizgi\"></span>");
        sb.AppendLine("    <h2>İçindekiler</h2>");
        sb.AppendLine("    <span class=\"bolum-baslik-cizgi\"></span>");
        sb.AppendLine("  </header>");
        sb.AppendLine("  <ol class=\"icindekiler-liste\">");
        int sira = 1;
        foreach (var (ad, sistemMi, notlar) in gruplar)
        {
            var notSayisi = notlar.Count;
            var sistemBadge = sistemMi ? "<span class=\"sistem-rozet\">sistem</span>" : "";
            sb.AppendLine("    <li class=\"icindekiler-satir\">");
            sb.AppendLine($"      <span class=\"icindekiler-sira\">{sira:D2}</span>");
            sb.AppendLine($"      <span class=\"icindekiler-ad\">{Esc(ad)} {sistemBadge}</span>");
            sb.AppendLine("      <span class=\"icindekiler-nokta\"></span>");
            sb.AppendLine($"      <span class=\"icindekiler-sayi\">{notSayisi} not</span>");
            sb.AppendLine("    </li>");
            sira++;
        }
        sb.AppendLine("  </ol>");
        sb.AppendLine("</section>");
    }

    // ─────────────────── KLASÖR BÖLÜMÜ ───────────────────

    private static void KlasorBolumuYaz(StringBuilder sb, string ad, bool sistemMi, List<Not> notlar)
    {
        var tamamlanan = notlar.Count(n => n.Tamamlandi);
        var bekleyen = notlar.Count - tamamlanan;
        var sistemRozet = sistemMi ? "<span class=\"sistem-rozet\">sistem</span>" : "";

        // Açılış sayfası
        sb.AppendLine("<section class=\"klasor-acilis\">");
        sb.AppendLine("  <div class=\"klasor-acilis-kalp\">" + SvgKalpAcilis + "</div>");
        sb.AppendLine($"  <h2 class=\"klasor-acilis-baslik\">{Esc(ad)}</h2>");
        sb.AppendLine($"  <div class=\"klasor-acilis-rozet-satir\">{sistemRozet}</div>");
        sb.AppendLine("  <div class=\"klasor-acilis-ayrac\"><span></span><span class=\"kalp-mini\">♡</span><span></span></div>");
        sb.AppendLine("  <div class=\"klasor-ozet\">");
        sb.AppendLine($"    <div class=\"ozet-pill\"><strong>{notlar.Count}</strong> not</div>");
        sb.AppendLine($"    <div class=\"ozet-pill ozet-pill--basari\"><strong>{tamamlanan}</strong> tamamlandı</div>");
        sb.AppendLine($"    <div class=\"ozet-pill ozet-pill--bekleyen\"><strong>{bekleyen}</strong> bekliyor</div>");
        sb.AppendLine("  </div>");
        sb.AppendLine("</section>");

        // Notlar listesi
        if (notlar.Count == 0)
        {
            sb.AppendLine("<section class=\"klasor-icerik klasor-icerik--bos\">");
            sb.AppendLine("  <p class=\"bos-mesaj\">Bu klasörde henüz hiç notumuz yok.</p>");
            sb.AppendLine("</section>");
            return;
        }

        sb.AppendLine("<section class=\"klasor-icerik\">");
        foreach (var not in notlar)
        {
            NotKartiYaz(sb, not);
        }
        sb.AppendLine("</section>");
    }

    // ─────────────────── NOT KARTI ───────────────────

    private static void NotKartiYaz(StringBuilder sb, Not not)
    {
        var tamamlanmisSinif = not.Tamamlandi ? " not-kart--tamamlandi" : "";
        var olusturanAd = not.OlusturanKullanici?.AdSoyad ?? "—";
        var olusturmaTarih = TrSaat(not.OlusturmaZamani);

        sb.AppendLine($"<article class=\"not-kart{tamamlanmisSinif}\">");
        sb.AppendLine("  <header class=\"not-kart-baslik-satir\">");
        if (not.Tamamlandi)
            sb.AppendLine("    <span class=\"not-kart-tik\">" + SvgTik + "</span>");
        sb.AppendLine($"    <h3 class=\"not-kart-baslik\">{Esc(not.Baslik)}</h3>");
        sb.AppendLine("  </header>");

        if (!string.IsNullOrWhiteSpace(not.Icerik))
        {
            sb.AppendLine("  <div class=\"not-kart-icerik\">");
            foreach (var paragraf in not.Icerik.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                var temiz = paragraf.Trim();
                if (temiz.Length > 0)
                    sb.AppendLine($"    <p>{Esc(temiz)}</p>");
            }
            sb.AppendLine("  </div>");
        }

        if (not.Tamamlandi && !string.IsNullOrWhiteSpace(not.TamamlanmaAciklamasi))
        {
            var tamamlayanAd = not.TamamlayanKullanici?.AdSoyad ?? "—";
            var tamamlanmaTarih = not.TamamlanmaZamani.HasValue
                ? TrSaat(not.TamamlanmaZamani.Value) : "—";
            sb.AppendLine("  <aside class=\"tamamlama-aciklama\">");
            sb.AppendLine("    <div class=\"tamamlama-aciklama-baslik\">");
            sb.AppendLine("      <span class=\"tamamlama-aciklama-ikon\">" + SvgYildiz + "</span>");
            sb.AppendLine("      <span>Tamamlama Açıklaması</span>");
            sb.AppendLine("    </div>");
            sb.AppendLine($"    <p>{Esc(not.TamamlanmaAciklamasi)}</p>");
            sb.AppendLine($"    <p class=\"tamamlama-aciklama-meta\">{Esc(tamamlayanAd)} · {Esc(tamamlanmaTarih)}</p>");
            sb.AppendLine("  </aside>");
        }

        sb.AppendLine("  <footer class=\"not-kart-meta\">");
        sb.AppendLine($"    <span class=\"meta-pill meta-pill--yazan\">✏ {Esc(olusturanAd)}</span>");
        sb.AppendLine($"    <span class=\"meta-pill meta-pill--tarih\">⏱ {Esc(olusturmaTarih)}</span>");
        if (not.HatirlatmaZamani.HasValue)
            sb.AppendLine($"    <span class=\"meta-pill meta-pill--hatirlatma\">🔔 {Esc(TrSaat(not.HatirlatmaZamani.Value))}</span>");
        sb.AppendLine("  </footer>");
        sb.AppendLine("</article>");
    }

    // ─────────────────── HTML ESCAPE ───────────────────

    private static string Esc(string? s) =>
        WebUtility.HtmlEncode(s ?? "");

    // ─────────────────── SVG ÖĞELERİ ───────────────────

    private const string SvgKalpBuyuk = @"<svg viewBox='0 0 100 90' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'>
<path d='M50 78 C 20 60, 6 42, 14 22 C 20 8, 38 4, 50 22 C 62 4, 80 8, 86 22 C 94 42, 80 60, 50 78 Z'
stroke='currentColor' stroke-width='1.4' fill='none' stroke-linejoin='round'/>
<path d='M50 78 C 20 60, 6 42, 14 22 C 20 8, 38 4, 50 22 C 62 4, 80 8, 86 22 C 94 42, 80 60, 50 78 Z'
fill='currentColor' opacity='0.06'/>
</svg>";

    private const string SvgKalpAcilis = @"<svg viewBox='0 0 100 90' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'>
<path d='M50 78 C 20 60, 6 42, 14 22 C 20 8, 38 4, 50 22 C 62 4, 80 8, 86 22 C 94 42, 80 60, 50 78 Z'
fill='currentColor' opacity='0.18'/>
</svg>";

    private const string SvgAsma = @"<svg viewBox='0 0 80 400' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'>
<path d='M40 0 C 40 60, 20 90, 40 140 C 60 200, 30 240, 50 300 C 65 350, 40 380, 40 400'
stroke='currentColor' stroke-width='1' fill='none' opacity='0.55' stroke-linecap='round'/>
<g opacity='0.7'>
<circle cx='30' cy='40' r='3' fill='currentColor'/>
<circle cx='52' cy='80' r='2.5' fill='currentColor'/>
<circle cx='25' cy='130' r='3' fill='currentColor'/>
<circle cx='55' cy='180' r='2.5' fill='currentColor'/>
<circle cx='38' cy='230' r='3' fill='currentColor'/>
<circle cx='58' cy='280' r='2.5' fill='currentColor'/>
<circle cx='32' cy='330' r='3' fill='currentColor'/>
</g>
<g opacity='0.5'>
<path d='M25 50 Q 20 55 22 62 Q 28 60 26 50 Z' fill='currentColor'/>
<path d='M58 120 Q 65 125 62 132 Q 56 130 58 120 Z' fill='currentColor'/>
<path d='M28 200 Q 22 205 24 213 Q 30 210 28 200 Z' fill='currentColor'/>
<path d='M55 290 Q 62 295 60 303 Q 53 300 55 290 Z' fill='currentColor'/>
</g>
</svg>";

    private const string SvgTik = @"<svg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'>
<circle cx='12' cy='12' r='10' fill='currentColor' opacity='0.15'/>
<path d='M7 12 l 3.5 3.5 L 17 9' stroke='currentColor' stroke-width='2' fill='none' stroke-linecap='round' stroke-linejoin='round'/>
</svg>";

    private const string SvgYildiz = @"<svg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'>
<path d='M12 2 L14.5 9 L22 9.5 L16 14.5 L18 22 L12 17.5 L6 22 L8 14.5 L2 9.5 L9.5 9 Z'
fill='currentColor' opacity='0.85'/>
</svg>";

    // ─────────────────── CSS TEMASI ───────────────────

    private const string CssTema = @"
:root {
  --c-cream: #faf6ef;
  --c-cream-light: #fdfaf4;
  --c-cream-darker: #f3ebda;
  --c-clay-900: #2a1b0f;
  --c-clay-800: #3d2817;
  --c-clay-700: #4e3722;
  --c-clay-500: #8a6541;
  --c-clay-400: #a8825a;
  --c-clay-300: #c4a37e;
  --c-terracotta: #c4704d;
  --c-terracotta-dark: #a85a3e;
  --c-terracotta-light: #e89978;
  --c-gold: #d4a661;
  --c-amber-50: #fffbeb;
  --c-amber-400: #fbbf24;
  --c-amber-900: #78350f;
  --c-border: #ebe3d4;
  --font-display: 'Fraunces', Georgia, 'Times New Roman', serif;
  --font-body: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

@page {
  size: A4;
  margin: 18mm 15mm 22mm 15mm;
}

@page :first {
  margin: 0;
}

html, body {
  background: var(--c-cream);
  color: var(--c-clay-800);
  font-family: var(--font-body);
  font-size: 11pt;
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}

.defter {
  max-width: 100%;
  margin: 0 auto;
}

/* ═══════════════════ KAPAK ═══════════════════ */

.kapak {
  position: relative;
  min-height: 100vh;
  background: linear-gradient(135deg, var(--c-cream-light) 0%, var(--c-cream) 50%, var(--c-cream-darker) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60px 40px;
  overflow: hidden;
  page-break-after: always;
}

.kapak-asma {
  position: absolute;
  top: 0;
  width: 80px;
  height: 100%;
  color: var(--c-terracotta);
  pointer-events: none;
}
.kapak-asma svg { width: 100%; height: 100%; }
.kapak-asma--sol  { left: 0; }
.kapak-asma--sag  { right: 0; transform: scaleX(-1); }

.kapak-icerik {
  text-align: center;
  position: relative;
  z-index: 1;
}

.kapak-kalp {
  width: 120px;
  height: 110px;
  color: var(--c-terracotta);
  margin: 0 auto 28px;
}
.kapak-kalp svg { width: 100%; height: 100%; }

.kapak-baslik {
  font-family: var(--font-display);
  font-weight: 300;
  font-size: 60pt;
  line-height: 1.05;
  font-variation-settings: 'SOFT' 100, 'opsz' 144;
  color: var(--c-clay-900);
  letter-spacing: -0.02em;
  margin-bottom: 16px;
}
.kapak-baslik em {
  font-style: italic;
  font-weight: 400;
  color: var(--c-terracotta);
}

.kapak-altcizgi {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  margin: 14px 0 8px;
  color: var(--c-terracotta);
}
.kapak-altcizgi::before,
.kapak-altcizgi::after {
  content: '';
  display: block;
  width: 90px;
  height: 1px;
  background: var(--c-terracotta);
  opacity: 0.45;
}
.kalp-mini {
  font-size: 18pt;
  color: var(--c-terracotta);
  line-height: 1;
}

.kapak-altyazi {
  font-family: var(--font-display);
  font-style: italic;
  font-size: 14pt;
  color: var(--c-clay-700);
  font-weight: 400;
  letter-spacing: 0.02em;
  margin-bottom: 48px;
}

.kapak-istatistik {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin: 32px 0 36px;
}
.istatistik-kart {
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid var(--c-border);
  border-radius: 16px;
  padding: 14px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 96px;
  box-shadow: 0 2px 8px rgba(196, 112, 77, 0.08);
}
.istatistik-sayi {
  font-family: var(--font-display);
  font-size: 28pt;
  font-weight: 600;
  color: var(--c-terracotta);
  line-height: 1;
}
.istatistik-etiket {
  font-size: 9pt;
  color: var(--c-clay-500);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-top: 4px;
}

.kapak-tarih {
  font-family: var(--font-display);
  font-size: 13pt;
  color: var(--c-clay-700);
  margin-top: 16px;
  font-style: italic;
}

.kapak-isim {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: 22pt;
  color: var(--c-clay-800);
  margin-top: 6px;
  letter-spacing: 0.02em;
}

/* ═══════════════════ BÖLÜM BAŞLIKLARI ═══════════════════ */

.bolum-baslik {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin: 0 0 36px;
}
.bolum-baslik h2 {
  font-family: var(--font-display);
  font-weight: 400;
  font-style: italic;
  font-size: 26pt;
  color: var(--c-clay-900);
  letter-spacing: -0.01em;
  font-variation-settings: 'SOFT' 100;
}
.bolum-baslik-cizgi {
  flex: 0 0 60px;
  height: 1px;
  background: var(--c-terracotta);
  opacity: 0.4;
}

/* ═══════════════════ İÇİNDEKİLER ═══════════════════ */

.icindekiler {
  padding: 40px 8px;
  page-break-after: always;
}

.icindekiler-liste {
  list-style: none;
  max-width: 580px;
  margin: 0 auto;
}

.icindekiler-satir {
  display: grid;
  grid-template-columns: 30px 1fr auto auto;
  gap: 12px;
  align-items: baseline;
  padding: 11px 4px;
  border-bottom: 1px dotted var(--c-border);
}

.icindekiler-sira {
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--c-terracotta);
  font-size: 11pt;
}

.icindekiler-ad {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: 12pt;
  color: var(--c-clay-800);
}

.icindekiler-nokta {
  border-bottom: 1px dotted var(--c-clay-400);
  min-width: 60px;
  align-self: end;
  margin-bottom: 5px;
}

.icindekiler-sayi {
  font-size: 9.5pt;
  color: var(--c-clay-500);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.sistem-rozet {
  display: inline-block;
  background: var(--c-terracotta);
  color: var(--c-cream-light);
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 7.5pt;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-left: 6px;
  vertical-align: middle;
}

/* ═══════════════════ KLASÖR AÇILIŞ SAYFASI ═══════════════════ */

.klasor-acilis {
  text-align: center;
  padding: 60px 16px;
  page-break-before: always;
  page-break-after: avoid;
}

.klasor-acilis-kalp {
  width: 70px;
  height: 64px;
  color: var(--c-terracotta);
  margin: 0 auto 18px;
}
.klasor-acilis-kalp svg { width: 100%; height: 100%; }

.klasor-acilis-baslik {
  font-family: var(--font-display);
  font-weight: 400;
  font-style: italic;
  font-size: 36pt;
  font-variation-settings: 'SOFT' 100;
  color: var(--c-clay-900);
  margin-bottom: 12px;
  letter-spacing: -0.01em;
  line-height: 1.15;
}

.klasor-acilis-rozet-satir {
  margin-bottom: 18px;
}

.klasor-acilis-ayrac {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  margin: 16px 0 30px;
  color: var(--c-terracotta);
}
.klasor-acilis-ayrac > span:not(.kalp-mini) {
  display: block;
  width: 80px;
  height: 1px;
  background: var(--c-terracotta);
  opacity: 0.45;
}

.klasor-ozet {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}

.ozet-pill {
  background: rgba(196, 112, 77, 0.1);
  border: 1px solid rgba(196, 112, 77, 0.25);
  border-radius: 999px;
  padding: 8px 18px;
  font-size: 10pt;
  color: var(--c-clay-700);
}
.ozet-pill strong {
  font-weight: 600;
  color: var(--c-terracotta-dark);
}
.ozet-pill--basari {
  background: rgba(125, 167, 87, 0.10);
  border-color: rgba(125, 167, 87, 0.30);
}
.ozet-pill--basari strong { color: #4d6e2f; }
.ozet-pill--bekleyen {
  background: rgba(212, 166, 97, 0.10);
  border-color: rgba(212, 166, 97, 0.30);
}
.ozet-pill--bekleyen strong { color: #8a6826; }

/* ═══════════════════ KLASÖR İÇERİĞİ ═══════════════════ */

.klasor-icerik {
  padding: 0 0 16px;
}
.klasor-icerik--bos {
  text-align: center;
  padding: 40px 16px;
}
.bos-mesaj {
  font-family: var(--font-display);
  font-style: italic;
  color: var(--c-clay-500);
  font-size: 13pt;
}

/* ═══════════════════ NOT KARTI ═══════════════════ */

.not-kart {
  background: #ffffff;
  border: 1px solid var(--c-border);
  border-radius: 12px;
  padding: 18px 22px;
  margin-bottom: 14px;
  box-shadow:
    0 1px 2px rgba(61, 40, 23, 0.04),
    0 3px 10px rgba(61, 40, 23, 0.04);
  page-break-inside: avoid;
}

.not-kart--tamamlandi {
  background: linear-gradient(180deg, #fcfaf3 0%, #faf6ef 100%);
  border-color: rgba(125, 167, 87, 0.18);
}

.not-kart-baslik-satir {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 10px;
}

.not-kart-tik {
  width: 18px;
  height: 18px;
  color: #6b9446;
  flex-shrink: 0;
  margin-top: 3px;
}
.not-kart-tik svg { width: 100%; height: 100%; }

.not-kart-baslik {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 13.5pt;
  color: var(--c-clay-900);
  line-height: 1.35;
  letter-spacing: -0.005em;
  flex: 1;
}

.not-kart-icerik p {
  color: var(--c-clay-800);
  margin-bottom: 6px;
  line-height: 1.65;
  text-align: justify;
  hyphens: auto;
}
.not-kart-icerik p:last-child { margin-bottom: 0; }

.tamamlama-aciklama {
  background: var(--c-amber-50);
  border-left: 3px solid var(--c-amber-400);
  border-radius: 4px;
  padding: 11px 14px;
  margin: 12px 0 6px;
}

.tamamlama-aciklama-baslik {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 9.5pt;
  color: var(--c-amber-900);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 5px;
}
.tamamlama-aciklama-ikon {
  width: 13px;
  height: 13px;
  color: var(--c-amber-400);
}
.tamamlama-aciklama-ikon svg { width: 100%; height: 100%; display: block; }

.tamamlama-aciklama p {
  color: var(--c-clay-800);
  font-size: 10.5pt;
  line-height: 1.6;
  margin-bottom: 4px;
}

.tamamlama-aciklama-meta {
  font-size: 8.5pt;
  color: var(--c-clay-500);
  font-style: italic;
  margin-top: 4px;
}

.not-kart-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 11px;
  padding-top: 9px;
  border-top: 1px dotted var(--c-border);
}

.meta-pill {
  font-size: 8.5pt;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--c-cream-darker);
  color: var(--c-clay-700);
  font-weight: 500;
  letter-spacing: 0.01em;
}
.meta-pill--yazan {
  background: rgba(196, 112, 77, 0.10);
  color: var(--c-terracotta-dark);
}
.meta-pill--hatirlatma {
  background: rgba(212, 166, 97, 0.14);
  color: #8a6826;
}

/* ═══════════════════ PRINT ÖZEL ═══════════════════ */

@media print {
  html, body { background: white; }
  .kapak {
    min-height: 100vh;
    background: linear-gradient(135deg, var(--c-cream-light) 0%, var(--c-cream) 50%, var(--c-cream-darker) 100%) !important;
  }
  .not-kart {
    box-shadow: 0 0 0 1px var(--c-border);
  }
}
";
}
