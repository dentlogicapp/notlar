using System.Globalization;
using System.Net;
using System.Text;

namespace Notlar.Api.Services;

/// <summary>
/// v21 M7 + B2/B3 - KVKK belge uretici (TEK KAYNAK HTML).
/// Iki belge turu uretir:
///   1) KvkkMetinBelgesi  - yayinlanmis bir KVKK versiyonunun tam metni (aydinlatma + pazarlama)
///      iki yana yasli enterprise tipografiyle; hukuki kunye altbilgisi (versiyon, yayin, SHA-256, yayinlayan).
///   2) OnamKayitDefteri  - onam kayitlarinin salt-okunur sicil belgesi (kim/versiyon/pazarlama/IP/UA/zaman).
/// Bu HTML hem tarayiciya (html format) hem PDF'e (PdfRender Chromium print) kaynak olur -
/// DefteriIndir boru hattinin ayni deseni (HtmlTasarimcisi + PdfRender), paralel yapi YOK.
/// Estetik: Fraunces + terracotta + cream + clay paleti (HtmlTasarimcisi ile tutarli).
/// </summary>
public static class KvkkBelgeTasarimcisi
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

    private static string TrTarih(DateTimeOffset zaman) =>
        TimeZoneInfo.ConvertTime(zaman, IstanbulTz)
            .ToString("d MMMM yyyy", new CultureInfo("tr-TR"));

    private static string TrSaat(DateTimeOffset zaman) =>
        TimeZoneInfo.ConvertTime(zaman, IstanbulTz)
            .ToString("d MMMM yyyy · HH:mm", new CultureInfo("tr-TR"));

    private static string TrSaatSaniye(DateTimeOffset zaman) =>
        TimeZoneInfo.ConvertTime(zaman, IstanbulTz)
            .ToString("dd.MM.yyyy HH:mm:ss", new CultureInfo("tr-TR"));

    private static string Esc(string? s) => WebUtility.HtmlEncode(s ?? "");

    // Metin govdesini paragraflara boler: cift newline = paragraf ayraci, tek newline = <br>.
    // whitespace-pre-wrap yerine gercek <p> uretir -> iki yana yaslama (text-align: justify) duzgun calisir.
    private static string ParagraflaHtml(string? metin)
    {
        if (string.IsNullOrWhiteSpace(metin)) return "";
        var normalize = metin.Replace("\r\n", "\n").Replace("\r", "\n");
        var bloklar = normalize.Split(new[] { "\n\n" }, StringSplitOptions.None);
        var sb = new StringBuilder();
        foreach (var blok in bloklar)
        {
            var trimli = blok.Trim('\n');
            if (trimli.Length == 0) continue;
            var satirBirlesik = Esc(trimli).Replace("\n", "<br/>");
            sb.Append("<p class=\"govde-p\">").Append(satirBirlesik).Append("</p>\n");
        }
        return sb.ToString();
    }

    // ═══════════════════════════════════════════════════════════════
    // BELGE 1 - KVKK METIN BELGESI (tek versiyonun tam metni)
    // ═══════════════════════════════════════════════════════════════
    public static string MetinBelgesi(
        string markaAdi, int versiyon, string icerik, string? pazarlamaIcerik,
        string sha256Hash, DateTimeOffset yayinZamani, string? yayinlayanAdSoyad, bool aktif)
    {
        var sb = new StringBuilder(48_000);
        BasligiYaz(sb, $"KVKK Aydinlatma Metni v{versiyon}");
        sb.AppendLine("<main class=\"belge\">");

        // Antet
        sb.Append("<header class=\"antet\">\n");
        sb.Append("  <div class=\"antet-marka\">").Append(Esc(string.IsNullOrWhiteSpace(markaAdi) ? "Planlama Defteri" : markaAdi)).Append("</div>\n");
        sb.Append("  <div class=\"antet-tur\">Kisisel Verilerin Korunmasi Kanunu - Aydinlatma ve Acik Riza Metni</div>\n");
        sb.Append("  <div class=\"antet-cizgi\"></div>\n");
        sb.Append("</header>\n");

        // Baslik + durum rozeti
        sb.Append("<div class=\"belge-baslik-blok\">\n");
        sb.Append("  <h1 class=\"belge-h1\">KVKK Aydinlatma Metni</h1>\n");
        var rozet = aktif
            ? "<span class=\"rozet rozet-aktif\">Yururlukteki Surum</span>"
            : "<span class=\"rozet rozet-arsiv\">Arsiv Surumu</span>";
        sb.Append("  <div class=\"belge-alt\">Surum ").Append(versiyon).Append(" &middot; ").Append(rozet).Append("</div>\n");
        sb.Append("</div>\n");

        // Ana metin
        sb.Append("<section class=\"govde\">\n");
        sb.Append(ParagraflaHtml(icerik));
        sb.Append("</section>\n");

        // Pazarlama (ayri bolum)
        if (!string.IsNullOrWhiteSpace(pazarlamaIcerik))
        {
            sb.Append("<section class=\"govde govde-ikincil\">\n");
            sb.Append("  <h2 class=\"bolum-h2\">Ticari Elektronik Ileti (Pazarlama) Acik Riza Metni</h2>\n");
            sb.Append("  <p class=\"bolum-not\">Bu izin, ayri ve istege bagli bir acik rizadir; asil aydinlatma onamindan bagimsiz olarak verilir veya reddedilir.</p>\n");
            sb.Append(ParagraflaHtml(pazarlamaIcerik));
            sb.Append("</section>\n");
        }

        // Hukuki kunye (B-2)
        sb.Append("<footer class=\"kunye\">\n");
        sb.Append("  <div class=\"kunye-baslik\">Belge Butunluk Kunyesi</div>\n");
        sb.Append("  <table class=\"kunye-tablo\">\n");
        KunyeSatir(sb, "Surum", "v" + versiyon + (aktif ? " (yururlukte)" : " (arsiv)"));
        KunyeSatir(sb, "Yayin Tarihi", TrSaat(yayinZamani));
        KunyeSatir(sb, "Yayinlayan", string.IsNullOrWhiteSpace(yayinlayanAdSoyad) ? "-" : yayinlayanAdSoyad!);
        KunyeSatir(sb, "SHA-256 Ozet", sha256Hash);
        KunyeSatir(sb, "Belge Uretim Ani", TrSaat(DateTimeOffset.UtcNow));
        sb.Append("  </table>\n");
        sb.Append("  <div class=\"kunye-serh\">Bu ozet, yayinlanmis metnin degistirilmedigini dogrulayan butunluk kanitidir. Metin icerigi hukuki gecerlilik icin avukat onayindan gecmis olmalidir.</div>\n");
        sb.Append("</footer>\n");

        sb.AppendLine("</main>");
        BitisiYaz(sb);
        return sb.ToString();
    }

    // ═══════════════════════════════════════════════════════════════
    // BELGE 2 - ONAM KAYIT DEFTERI (salt-okunur sicil)
    // ═══════════════════════════════════════════════════════════════
    public static string OnamKayitDefteri(
        string markaAdi,
        IReadOnlyList<OnamSatirVeri> kayitlar)
    {
        var sb = new StringBuilder(64_000);
        BasligiYaz(sb, "KVKK Onam Kayit Defteri");
        sb.AppendLine("<main class=\"belge\">");

        // Antet
        sb.Append("<header class=\"antet\">\n");
        sb.Append("  <div class=\"antet-marka\">").Append(Esc(string.IsNullOrWhiteSpace(markaAdi) ? "Planlama Defteri" : markaAdi)).Append("</div>\n");
        sb.Append("  <div class=\"antet-tur\">KVKK Onam Kayit Defteri - Salt Okunur Hukuki Sicil</div>\n");
        sb.Append("  <div class=\"antet-cizgi\"></div>\n");
        sb.Append("</header>\n");

        sb.Append("<div class=\"belge-baslik-blok\">\n");
        sb.Append("  <h1 class=\"belge-h1\">Onam Kayitlari</h1>\n");
        sb.Append("  <div class=\"belge-alt\">Toplam ").Append(kayitlar.Count).Append(" kayit &middot; en yeni ustte &middot; son 500 kayit</div>\n");
        sb.Append("</div>\n");

        if (kayitlar.Count == 0)
        {
            sb.Append("<p class=\"bos-durum\">Henuz onam kaydi bulunmuyor.</p>\n");
        }
        else
        {
            sb.Append("<table class=\"sicil-tablo\">\n");
            sb.Append("  <thead><tr>");
            sb.Append("<th>#</th><th>Ad Soyad</th><th>E-posta</th><th>Surum</th><th>Pazarlama</th><th>IP</th><th>Onam Zamani</th>");
            sb.Append("</tr></thead>\n  <tbody>\n");
            int sira = 1;
            foreach (var k in kayitlar)
            {
                sb.Append("    <tr>");
                sb.Append("<td class=\"td-sira\">").Append(sira++).Append("</td>");
                sb.Append("<td class=\"td-ad\">").Append(Esc(k.AdSoyad)).Append("</td>");
                sb.Append("<td class=\"td-eposta\">").Append(Esc(k.Email)).Append("</td>");
                sb.Append("<td class=\"td-surum\">v").Append(k.Versiyon).Append("</td>");
                sb.Append("<td class=\"td-pazarlama\">").Append(k.PazarlamaIzni ? "Verildi" : "-").Append("</td>");
                sb.Append("<td class=\"td-ip\">").Append(Esc(k.Ip ?? "-")).Append("</td>");
                sb.Append("<td class=\"td-zaman\">").Append(TrSaatSaniye(k.OnamZamani)).Append("</td>");
                sb.Append("</tr>\n");
            }
            sb.Append("  </tbody>\n</table>\n");
        }

        // Kunye
        sb.Append("<footer class=\"kunye\">\n");
        sb.Append("  <div class=\"kunye-baslik\">Sicil Kunyesi</div>\n");
        sb.Append("  <table class=\"kunye-tablo\">\n");
        KunyeSatir(sb, "Kayit Sayisi", kayitlar.Count.ToString());
        KunyeSatir(sb, "Belge Uretim Ani", TrSaat(DateTimeOffset.UtcNow));
        sb.Append("  </table>\n");
        sb.Append("  <div class=\"kunye-serh\">Bu defter salt-okunur (append-only) bir hukuki kanit kaydidir; onam bir kez alindiktan sonra degistirilmez, her yeni versiyona yeni satir eklenir.</div>\n");
        sb.Append("</footer>\n");

        sb.AppendLine("</main>");
        BitisiYaz(sb);
        return sb.ToString();
    }

    // ─────────────────── ORTAK PARCALAR ───────────────────

    private static void KunyeSatir(StringBuilder sb, string etiket, string deger)
    {
        sb.Append("    <tr><td class=\"k-etiket\">").Append(Esc(etiket))
          .Append("</td><td class=\"k-deger\">").Append(Esc(deger)).Append("</td></tr>\n");
    }

    private static void BasligiYaz(StringBuilder sb, string baslik)
    {
        sb.AppendLine("<!DOCTYPE html>");
        sb.AppendLine("<html lang=\"tr\">");
        sb.AppendLine("<head>");
        sb.AppendLine("<meta charset=\"UTF-8\" />");
        sb.AppendLine("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />");
        sb.Append("<title>").Append(Esc(baslik)).AppendLine("</title>");
        sb.AppendLine("<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">");
        sb.AppendLine("<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>");
        sb.AppendLine("<link href=\"https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600&display=swap\" rel=\"stylesheet\">");
        sb.AppendLine("<style>");
        sb.Append(CssTema);
        sb.AppendLine("</style>");
        sb.AppendLine("</head>");
        sb.AppendLine("<body>");
    }

    private static void BitisiYaz(StringBuilder sb)
    {
        sb.AppendLine("</body>");
        sb.AppendLine("</html>");
    }

    // ─────────────────── CSS TEMASI ───────────────────
    // HtmlTasarimcisi paletiyle tutarli; belge/sicil odakli (kapak yok, resmi antet var).

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
  --c-terracotta: #c4704d;
  --c-terracotta-dark: #a85a3e;
  --c-gold: #d4a661;
  --c-green-700: #4d6e2f;
  --c-border: #ebe3d4;
  --font-display: 'Fraunces', Georgia, 'Times New Roman', serif;
  --font-body: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

@page {
  size: A4;
  margin: 20mm 18mm 22mm 18mm;
}

html, body {
  background: #ffffff;
  color: var(--c-clay-800);
  font-family: var(--font-body);
  font-size: 10.5pt;
  line-height: 1.75;
  -webkit-font-smoothing: antialiased;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}

.belge {
  max-width: 190mm;
  margin: 0 auto;
  padding: 8mm 0;
}

/* ─── ANTET ─── */
.antet { margin-bottom: 22px; }
.antet-marka {
  font-family: var(--font-display);
  font-size: 15pt;
  font-weight: 700;
  color: var(--c-clay-900);
  letter-spacing: 0.01em;
}
.antet-tur {
  font-size: 8.5pt;
  color: var(--c-clay-500);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-top: 3px;
}
.antet-cizgi {
  height: 2px;
  background: linear-gradient(90deg, var(--c-terracotta) 0%, var(--c-gold) 60%, transparent 100%);
  margin-top: 10px;
}

/* ─── BASLIK ─── */
.belge-baslik-blok { margin: 26px 0 20px; }
.belge-h1 {
  font-family: var(--font-display);
  font-size: 26pt;
  font-weight: 600;
  color: var(--c-clay-900);
  line-height: 1.15;
}
.belge-alt {
  font-size: 10pt;
  color: var(--c-clay-500);
  margin-top: 6px;
}
.rozet {
  display: inline-block;
  font-size: 8pt;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: 999px;
  letter-spacing: 0.03em;
  vertical-align: middle;
}
.rozet-aktif { background: #e7f0dd; color: var(--c-green-700); }
.rozet-arsiv { background: var(--c-cream-darker); color: var(--c-clay-500); }

/* ─── GOVDE (iki yana yasli enterprise metin) ─── */
.govde {
  margin: 8px 0 18px;
}
.govde-ikincil {
  margin-top: 26px;
  padding-top: 20px;
  border-top: 1px solid var(--c-border);
}
.govde-p {
  text-align: justify;
  text-justify: inter-word;
  hyphens: auto;
  margin-bottom: 11px;
  color: var(--c-clay-700);
  orphans: 2;
  widows: 2;
}
.bolum-h2 {
  font-family: var(--font-display);
  font-size: 14pt;
  font-weight: 600;
  color: var(--c-clay-900);
  margin-bottom: 6px;
}
.bolum-not {
  font-size: 9pt;
  font-style: italic;
  color: var(--c-clay-500);
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--c-cream-light);
  border-left: 3px solid var(--c-gold);
  border-radius: 0 6px 6px 0;
}

/* ─── KUNYE ─── */
.kunye {
  margin-top: 30px;
  padding: 16px 18px;
  background: var(--c-cream-light);
  border: 1px solid var(--c-border);
  border-radius: 10px;
  page-break-inside: avoid;
}
.kunye-baslik {
  font-family: var(--font-display);
  font-size: 11pt;
  font-weight: 600;
  color: var(--c-terracotta-dark);
  margin-bottom: 10px;
}
.kunye-tablo { width: 100%; border-collapse: collapse; }
.kunye-tablo td { padding: 4px 0; vertical-align: top; font-size: 9pt; }
.k-etiket { color: var(--c-clay-500); width: 34%; padding-right: 12px; }
.k-deger { color: var(--c-clay-900); font-family: 'Courier New', monospace; word-break: break-all; }
.kunye-serh {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dotted var(--c-border);
  font-size: 8pt;
  font-style: italic;
  color: var(--c-clay-500);
  line-height: 1.6;
}

/* ─── SICIL TABLOSU ─── */
.sicil-tablo {
  width: 100%;
  border-collapse: collapse;
  font-size: 8.5pt;
  margin: 6px 0 10px;
}
.sicil-tablo thead th {
  background: var(--c-terracotta);
  color: var(--c-cream-light);
  font-weight: 600;
  text-align: left;
  padding: 7px 8px;
  font-size: 8pt;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.sicil-tablo tbody td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--c-border);
  color: var(--c-clay-700);
  vertical-align: top;
}
.sicil-tablo tbody tr:nth-child(even) { background: var(--c-cream-light); }
.td-sira { color: var(--c-terracotta); font-weight: 600; text-align: center; }
.td-ad { font-weight: 600; color: var(--c-clay-900); }
.td-eposta { color: var(--c-clay-500); }
.td-surum { font-family: 'Courier New', monospace; text-align: center; }
.td-pazarlama { text-align: center; }
.td-ip { font-family: 'Courier New', monospace; font-size: 8pt; }
.td-zaman { font-family: 'Courier New', monospace; font-size: 8pt; white-space: nowrap; }

.bos-durum {
  text-align: center;
  color: var(--c-clay-500);
  font-style: italic;
  padding: 40px 0;
}
";
}

/// <summary>
/// Onam kayit defteri satiri (KvkkEndpoints'teki KvkkOnamKaydiYaniti'nin belge-lokal karsiligindan
/// bagimsiz, tasarimci girdisi). KullaniciAjan gerekirse ileride eklenir; su an sicil PDF'i ozet tutar.
/// </summary>
public sealed record OnamSatirVeri(
    string AdSoyad, string Email, int Versiyon, bool PazarlamaIzni,
    string? Ip, DateTimeOffset OnamZamani);
